from django.contrib import admin

from .models import (
    Equipment,
    GroundItem,
    InventorySlot,
    Item,
    Player,
    PlayerSkill,
    Scenery,
    SceneryKind,
)


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "equip_slot", "stackable", "sprite")
    search_fields = ("name", "key")


class PlayerSkillInline(admin.TabularInline):
    model = PlayerSkill
    extra = 0


class InventoryInline(admin.TabularInline):
    model = InventorySlot
    extra = 0
    autocomplete_fields = ("item",)


class EquipmentInline(admin.TabularInline):
    model = Equipment
    extra = 0
    autocomplete_fields = ("item",)


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ("display_name", "user", "x", "y")
    search_fields = ("display_name", "user__username")
    inlines = [PlayerSkillInline, InventoryInline, EquipmentInline]


@admin.register(GroundItem)
class GroundItemAdmin(admin.ModelAdmin):
    list_display = ("item", "quantity", "x", "y")
    autocomplete_fields = ("item",)


@admin.register(SceneryKind)
class SceneryKindAdmin(admin.ModelAdmin):
    list_display = ("rsc_id", "name", "model_name", "block_type", "width", "height")
    search_fields = ("name", "model_name", "rsc_id")


@admin.register(Scenery)
class SceneryAdmin(admin.ModelAdmin):
    list_display = ("kind", "x", "y", "direction")
    list_filter = ("kind__block_type",)
    search_fields = ("kind__name",)
    autocomplete_fields = ("kind",)


admin.site.register(PlayerSkill)
admin.site.register(InventorySlot)
admin.site.register(Equipment)
