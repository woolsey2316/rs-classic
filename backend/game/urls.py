from django.urls import path

from .views import (
    DropView,
    EquipView,
    MeView,
    PlayerStateView,
    PositionView,
    RegisterView,
    TakeView,
    UnequipView,
    WorldView,
)

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("player/", PlayerStateView.as_view(), name="player"),
    path("player/position/", PositionView.as_view(), name="player-position"),
    path("world/", WorldView.as_view(), name="world"),
    path("inventory/equip/", EquipView.as_view(), name="equip"),
    path("inventory/unequip/", UnequipView.as_view(), name="unequip"),
    path("inventory/drop/", DropView.as_view(), name="drop"),
    path("world/take/", TakeView.as_view(), name="take"),
]
