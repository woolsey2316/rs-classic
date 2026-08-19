from django.urls import path

from .views import (
    ChopView,
    DropView,
    EquipView,
    MeView,
    PlayerStateView,
    PositionView,
    RegisterView,
    TakeView,
    TreasureChestContentsView,
    TreasureChestTakeView,
    UnequipView,
    WorldSceneryView,
    WorldView,
)

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("player/", PlayerStateView.as_view(), name="player"),
    path("player/position/", PositionView.as_view(), name="player-position"),
    path("world/", WorldView.as_view(), name="world"),
    path("world/scenery/", WorldSceneryView.as_view(), name="world-scenery"),
    path("inventory/equip/", EquipView.as_view(), name="equip"),
    path("inventory/unequip/", UnequipView.as_view(), name="unequip"),
    path("inventory/drop/", DropView.as_view(), name="drop"),
    path("world/take/", TakeView.as_view(), name="take"),
    path("world/chop/", ChopView.as_view(), name="chop"),
    path(
        "world/treasure-chest/<int:scenery_id>/",
        TreasureChestContentsView.as_view(),
        name="treasure-chest-contents",
    ),
    path("world/treasure-chest/take/", TreasureChestTakeView.as_view(), name="treasure-chest-take"),
]
