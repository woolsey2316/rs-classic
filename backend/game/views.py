from django.contrib.auth.models import User
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Equipment, GroundItem, InventorySlot, Item, Player, Scenery, SceneryKind
from .serializers import (
    ChopSerializer,
    EquipSerializer,
    GroundItemSerializer,
    ItemSerializer,
    PlayerSerializer,
    PositionSerializer,
    RegisterSerializer,
    SceneryKindSerializer,
    TakeSerializer,
    TreasureChestTakeSerializer,
    UnequipSerializer,
)
from .treasure_chest import take_from_treasure_chest
from .woodcutting import attempt_chop
from .world import WORLD


def get_player(user: User) -> Player:
    player, _ = Player.objects.get_or_create(
        user=user,
        defaults={"display_name": user.username},
    )
    player.ensure_skills()
    player.ensure_inventory()
    player.ensure_equipment()
    return player


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        player = get_player(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "player": PlayerSerializer(player).data,
            },
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    def get(self, request):
        player = get_player(request.user)
        return Response(PlayerSerializer(player).data)


class PlayerStateView(APIView):
    def get(self, request):
        player = get_player(request.user)
        return Response(PlayerSerializer(player).data)


class PositionView(APIView):
    def patch(self, request):
        serializer = PositionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        x = serializer.validated_data["x"]
        y = serializer.validated_data["y"]

        if not WORLD.is_walkable(x, y):
            return Response(
                {"detail": "That tile cannot be walked on."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player = get_player(request.user)
        # Only allow moving to an adjacent tile (or same) to reduce teleport cheating.
        dx = abs(player.x - x)
        dy = abs(player.y - y)
        if dx > 1 or dy > 1:
            return Response(
                {"detail": "Move one step at a time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player.x = x
        player.y = y
        player.save(update_fields=["x", "y", "updated_at"])
        return Response({"x": player.x, "y": player.y})


class WorldView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        data = WORLD.to_dict()
        data["ground_items"] = GroundItemSerializer(
            GroundItem.objects.select_related("item").all(),
            many=True,
        ).data
        return Response(data)


class EquipView(APIView):
    def post(self, request):
        serializer = EquipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        player = get_player(request.user)

        try:
            inv = player.inventory_slots.select_related("item").get(
                slot_index=serializer.validated_data["slot_index"]
            )
        except InventorySlot.DoesNotExist:
            return Response({"detail": "Invalid slot."}, status=status.HTTP_400_BAD_REQUEST)

        if not inv.item or not inv.item.equip_slot:
            return Response(
                {"detail": "That item cannot be equipped."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        equip_slot = inv.item.equip_slot
        equipment, _ = Equipment.objects.get_or_create(player=player, slot=equip_slot)

        # Swap currently worn item back into this inventory slot.
        previous_item = equipment.item
        previous_qty = equipment.quantity

        equipment.item = inv.item
        equipment.quantity = inv.quantity
        equipment.save(update_fields=["item", "quantity"])

        if previous_item:
            inv.item = previous_item
            inv.quantity = previous_qty or 1
        else:
            inv.item = None
            inv.quantity = 0
        inv.save(update_fields=["item", "quantity"])

        return Response(PlayerSerializer(player).data)


class UnequipView(APIView):
    def post(self, request):
        serializer = UnequipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        player = get_player(request.user)

        try:
            equipment = player.equipment.select_related("item").get(
                slot=serializer.validated_data["slot"]
            )
        except Equipment.DoesNotExist:
            return Response({"detail": "Invalid slot."}, status=status.HTTP_400_BAD_REQUEST)

        if not equipment.item:
            return Response(
                {"detail": "Nothing equipped there."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        empty = (
            player.inventory_slots.filter(item__isnull=True)
            .order_by("slot_index")
            .first()
        )
        if not empty:
            return Response(
                {"detail": "Inventory is full."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        empty.item = equipment.item
        empty.quantity = equipment.quantity or 1
        empty.save(update_fields=["item", "quantity"])
        equipment.clear()

        return Response(PlayerSerializer(player).data)


class DropView(APIView):
    """Remove an inventory item permanently (no ground item yet)."""

    def post(self, request):
        serializer = EquipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        player = get_player(request.user)

        try:
            inv = player.inventory_slots.select_related("item").get(
                slot_index=serializer.validated_data["slot_index"]
            )
        except InventorySlot.DoesNotExist:
            return Response({"detail": "Invalid slot."}, status=status.HTTP_400_BAD_REQUEST)

        if not inv.item:
            return Response(
                {"detail": "That slot is empty."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        inv.clear()
        return Response(PlayerSerializer(player).data)


class TakeView(APIView):
    """Pick up a ground item into the first empty inventory slot."""

    def post(self, request):
        serializer = TakeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        player = get_player(request.user)

        try:
            ground = GroundItem.objects.select_related("item").get(
                pk=serializer.validated_data["ground_item_id"]
            )
        except GroundItem.DoesNotExist:
            return Response(
                {"detail": "That item is no longer there."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if player.x != ground.x or player.y != ground.y:
            return Response(
                {"detail": "You need to walk over to it first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        empty = (
            player.inventory_slots.filter(item__isnull=True)
            .order_by("slot_index")
            .first()
        )
        if not empty:
            return Response(
                {"detail": "Your inventory is full."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        empty.item = ground.item
        empty.quantity = ground.quantity or 1
        empty.save(update_fields=["item", "quantity"])
        ground.delete()

        return Response(
            {
                "player": PlayerSerializer(player).data,
                "ground_items": GroundItemSerializer(
                    GroundItem.objects.select_related("item").all(),
                    many=True,
                ).data,
            }
        )


def _query_int(params, name):
    raw = params.get(name)
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


class ChopView(APIView):
    """Chop a tree when standing adjacent, with an axe in inventory or equipment."""

    def post(self, request):
        serializer = ChopSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        player = get_player(request.user)

        result = attempt_chop(
            player,
            serializer.validated_data["scenery_id"],
            serializer.validated_data["player_x"],
            serializer.validated_data["player_y"],
        )

        if not result.get("ok"):
            return Response(
                {"detail": result["message"], "success": result.get("success", False)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = {
            "player": PlayerSerializer(player).data,
            "message": result["message"],
            "success": True,
            "xp_gained": result.get("xp_gained", 0),
        }
        if result.get("scenery_update"):
            payload["scenery_update"] = result["scenery_update"]
        return Response(payload)


class TreasureChestContentsView(APIView):
    """List every item available from a treasure chest."""

    def get(self, request, scenery_id: int):
        try:
            chest = Scenery.objects.get(pk=scenery_id, is_treasure_chest=True)
        except Scenery.DoesNotExist:
            return Response(
                {"detail": "That is not a treasure chest."},
                status=status.HTTP_404_NOT_FOUND,
            )

        items = Item.objects.all().order_by("name")
        return Response(
            {
                "scenery_id": chest.id,
                "name": chest.kind.name,
                "description": chest.kind.description,
                "items": ItemSerializer(items, many=True).data,
            }
        )


class TreasureChestTakeView(APIView):
    """Take one copy of an item from the treasure chest into player inventory."""

    def post(self, request):
        serializer = TreasureChestTakeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        player = get_player(request.user)

        result = take_from_treasure_chest(
            player,
            serializer.validated_data["scenery_id"],
            serializer.validated_data["item_key"],
            serializer.validated_data["player_x"],
            serializer.validated_data["player_y"],
        )

        if not result.get("ok"):
            return Response({"detail": result["message"]}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "player": PlayerSerializer(player).data,
                "message": result["message"],
                "item_key": result["item_key"],
            }
        )


class WorldSceneryView(APIView):
    """Scenery definitions and placements inside a world-coordinate bbox."""

    def get(self, request):
        min_x = _query_int(request.query_params, "min_x")
        max_x = _query_int(request.query_params, "max_x")
        min_y = _query_int(request.query_params, "min_y")
        max_y = _query_int(request.query_params, "max_y")
        if None in (min_x, max_x, min_y, max_y):
            return Response(
                {"detail": "min_x, max_x, min_y, and max_y are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if min_x > max_x:
            min_x, max_x = max_x, min_x
        if min_y > max_y:
            min_y, max_y = max_y, min_y

        placements = list(
            Scenery.objects.select_related("kind").filter(
                x__gte=min_x,
                x__lte=max_x,
                y__gte=min_y,
                y__lte=max_y,
            )
        )
        kind_ids = {obj.kind_id for obj in placements}
        kinds = SceneryKind.objects.filter(pk__in=kind_ids) if kind_ids else []
        return Response(
            {
                "kinds": SceneryKindSerializer(kinds, many=True).data,
                "objects": [
                    {
                        "id": obj.id,
                        "kind": obj.kind.rsc_id,
                        "x": obj.x,
                        "y": obj.y,
                        "direction": obj.direction,
                        "is_treasure_chest": obj.is_treasure_chest,
                    }
                    for obj in placements
                ],
            }
        )
