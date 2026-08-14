from django.conf import settings
from django.db import models

from .xp import XP_TABLE, level_from_xp


class SkillName(models.TextChoices):
    ATTACK = "attack", "Attack"
    DEFENSE = "defense", "Defense"
    STRENGTH = "strength", "Strength"
    HITS = "hits", "Hits"
    RANGED = "ranged", "Ranged"
    PRAYER = "prayer", "Prayer"
    MAGIC = "magic", "Magic"
    COOKING = "cooking", "Cooking"
    WOODCUTTING = "woodcutting", "Woodcutting"
    FLETCHING = "fletching", "Fletching"
    FISHING = "fishing", "Fishing"
    FIREMAKING = "firemaking", "Firemaking"
    CRAFTING = "crafting", "Crafting"
    SMITHING = "smithing", "Smithing"
    MINING = "mining", "Mining"
    HERBLAW = "herblaw", "Herblaw"
    AGILITY = "agility", "Agility"
    THIEVING = "thieving", "Thieving"


# Display order matches classic skill panel layout (combat then gathering).
SKILL_ORDER = [
    SkillName.ATTACK,
    SkillName.DEFENSE,
    SkillName.STRENGTH,
    SkillName.HITS,
    SkillName.RANGED,
    SkillName.PRAYER,
    SkillName.MAGIC,
    SkillName.COOKING,
    SkillName.WOODCUTTING,
    SkillName.FLETCHING,
    SkillName.FISHING,
    SkillName.FIREMAKING,
    SkillName.CRAFTING,
    SkillName.SMITHING,
    SkillName.MINING,
    SkillName.HERBLAW,
    SkillName.AGILITY,
    SkillName.THIEVING,
]


class EquipmentSlot(models.TextChoices):
    HELMET = "helmet", "Helmet"
    ARROWS = "arrows", "Arrows"
    GLOVES = "gloves", "Gloves"
    BODY = "body", "Body"
    LEGS = "legs", "Legs"
    BOOTS = "boots", "Boots"
    RING = "ring", "Ring"
    WEAPON = "weapon", "Weapon"
    SHIELD = "shield", "Shield"
    AMULET = "amulet", "Amulet"
    CAPE = "cape", "Cape"


INVENTORY_SIZE = 30


class Item(models.Model):
    key = models.SlugField(unique=True, max_length=64)
    name = models.CharField(max_length=64)
    description = models.TextField(blank=True, default="")
    stackable = models.BooleanField(default=False)
    equip_slot = models.CharField(
        max_length=16,
        choices=EquipmentSlot.choices,
        blank=True,
        null=True,
    )
    color = models.CharField(max_length=7, default="#c4a574")
    sprite = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Player(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="player",
    )
    display_name = models.CharField(max_length=32)
    # Tile coordinates in the overworld grid.
    x = models.PositiveIntegerField(default=12)
    y = models.PositiveIntegerField(default=10)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.display_name

    def ensure_skills(self) -> None:
        existing = set(self.skills.values_list("name", flat=True))
        to_create = []
        for skill in SKILL_ORDER:
            if skill in existing:
                continue
            xp = XP_TABLE[10] if skill == SkillName.HITS else 0
            to_create.append(PlayerSkill(player=self, name=skill, xp=xp))
        if to_create:
            PlayerSkill.objects.bulk_create(to_create)

    def ensure_inventory(self) -> None:
        existing = set(self.inventory_slots.values_list("slot_index", flat=True))
        missing = [
            InventorySlot(player=self, slot_index=i)
            for i in range(INVENTORY_SIZE)
            if i not in existing
        ]
        if missing:
            InventorySlot.objects.bulk_create(missing)

    def ensure_equipment(self) -> None:
        existing = set(self.equipment.values_list("slot", flat=True))
        missing = [
            Equipment(player=self, slot=slot)
            for slot, _ in EquipmentSlot.choices
            if slot not in existing
        ]
        if missing:
            Equipment.objects.bulk_create(missing)


class PlayerSkill(models.Model):
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name="skills")
    name = models.CharField(max_length=32, choices=SkillName.choices)
    xp = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("player", "name")
        ordering = ["name"]

    @property
    def level(self) -> int:
        return level_from_xp(self.xp)

    def __str__(self) -> str:
        return f"{self.player}: {self.name} {self.level}"


class InventorySlot(models.Model):
    player = models.ForeignKey(
        Player, on_delete=models.CASCADE, related_name="inventory_slots"
    )
    slot_index = models.PositiveSmallIntegerField()
    item = models.ForeignKey(
        Item, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    quantity = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("player", "slot_index")
        ordering = ["slot_index"]

    def clear(self) -> None:
        self.item = None
        self.quantity = 0
        self.save(update_fields=["item", "quantity"])


class Equipment(models.Model):
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name="equipment")
    slot = models.CharField(max_length=16, choices=EquipmentSlot.choices)
    item = models.ForeignKey(
        Item, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    quantity = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("player", "slot")
        ordering = ["slot"]

    def clear(self) -> None:
        self.item = None
        self.quantity = 0
        self.save(update_fields=["item", "quantity"])


class GroundItem(models.Model):
    """An item lying on a world tile that players can Take."""

    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="ground_piles")
    x = models.PositiveIntegerField()
    y = models.PositiveIntegerField()
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["y", "x", "id"]

    def __str__(self) -> str:
        return f"{self.item} x{self.quantity} @ ({self.x}, {self.y})"
