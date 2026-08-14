from django.contrib.auth.models import User
from rest_framework import serializers

from .models import (
    SKILL_ORDER,
    Equipment,
    EquipmentSlot,
    GroundItem,
    InventorySlot,
    Item,
    Player,
    PlayerSkill,
)
from .xp import XP_TABLE, xp_to_next_level


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Item
        fields = ("id", "key", "name", "description", "stackable", "equip_slot", "color")


class PlayerSkillSerializer(serializers.ModelSerializer):
    level = serializers.IntegerField(read_only=True)
    xp_for_level = serializers.SerializerMethodField()
    xp_for_next = serializers.SerializerMethodField()
    xp_remaining = serializers.SerializerMethodField()

    class Meta:
        model = PlayerSkill
        fields = (
            "name",
            "xp",
            "level",
            "xp_for_level",
            "xp_for_next",
            "xp_remaining",
        )

    def get_xp_for_level(self, obj: PlayerSkill) -> int:
        return XP_TABLE[obj.level]

    def get_xp_for_next(self, obj: PlayerSkill) -> int | None:
        if obj.level >= 99:
            return None
        return XP_TABLE[obj.level + 1]

    def get_xp_remaining(self, obj: PlayerSkill) -> int | None:
        return xp_to_next_level(obj.xp)


class InventorySlotSerializer(serializers.ModelSerializer):
    item = ItemSerializer(read_only=True)

    class Meta:
        model = InventorySlot
        fields = ("slot_index", "item", "quantity")


class EquipmentSerializer(serializers.ModelSerializer):
    item = ItemSerializer(read_only=True)

    class Meta:
        model = Equipment
        fields = ("slot", "item", "quantity")


class PlayerSerializer(serializers.ModelSerializer):
    skills = serializers.SerializerMethodField()
    inventory = serializers.SerializerMethodField()
    equipment = serializers.SerializerMethodField()
    total_level = serializers.SerializerMethodField()
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Player
        fields = (
            "id",
            "username",
            "display_name",
            "x",
            "y",
            "total_level",
            "skills",
            "inventory",
            "equipment",
        )

    def get_skills(self, obj: Player):
        by_name = {s.name: s for s in obj.skills.all()}
        ordered = [by_name[name] for name in SKILL_ORDER if name in by_name]
        return PlayerSkillSerializer(ordered, many=True).data

    def get_inventory(self, obj: Player):
        slots = obj.inventory_slots.select_related("item").order_by("slot_index")
        return InventorySlotSerializer(slots, many=True).data

    def get_equipment(self, obj: Player):
        order = [slot for slot, _ in EquipmentSlot.choices]
        by_slot = {e.slot: e for e in obj.equipment.select_related("item").all()}
        ordered = [by_slot[slot] for slot in order if slot in by_slot]
        return EquipmentSerializer(ordered, many=True).data

    def get_total_level(self, obj: Player) -> int:
        return sum(s.level for s in obj.skills.all())


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=32)
    password = serializers.CharField(min_length=6, write_only=True)
    display_name = serializers.CharField(min_length=3, max_length=32, required=False)

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Username already taken.")
        return value

    def create(self, validated_data):
        display_name = validated_data.get("display_name") or validated_data["username"]
        user = User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
        )
        player = Player.objects.create(user=user, display_name=display_name)
        player.ensure_skills()
        player.ensure_inventory()
        player.ensure_equipment()
        _give_starter_kit(player)
        return user


class GroundItemSerializer(serializers.ModelSerializer):
    item = ItemSerializer(read_only=True)

    class Meta:
        model = GroundItem
        fields = ("id", "x", "y", "quantity", "item")


class TakeSerializer(serializers.Serializer):
    ground_item_id = serializers.IntegerField(min_value=1)


class PositionSerializer(serializers.Serializer):
    x = serializers.IntegerField(min_value=0, max_value=63)
    y = serializers.IntegerField(min_value=0, max_value=63)


class EquipSerializer(serializers.Serializer):
    slot_index = serializers.IntegerField(min_value=0, max_value=29)


class UnequipSerializer(serializers.Serializer):
    slot = serializers.ChoiceField(choices=EquipmentSlot.choices)


def _give_starter_kit(player: Player) -> None:
    """Put a few classic starter items into empty inventory slots."""
    starters = [
        ("bronze_helmet", 1),
        ("leather_gloves", 1),
        ("leather_boots", 1),
        ("bronze_arrows", 50),
        ("coins", 25),
        ("bronze_dagger", 1),
    ]
    slots = list(player.inventory_slots.order_by("slot_index"))
    items = {item.key: item for item in Item.objects.filter(key__in=[k for k, _ in starters])}
    idx = 0
    for key, qty in starters:
        item = items.get(key)
        if not item:
            continue
        while idx < len(slots) and slots[idx].item_id is not None:
            idx += 1
        if idx >= len(slots):
            break
        slots[idx].item = item
        slots[idx].quantity = qty
        slots[idx].save(update_fields=["item", "quantity"])
        idx += 1
