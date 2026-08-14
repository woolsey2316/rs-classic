# RS Classic

A starter **RuneScape Classic**-inspired MMO client: React (Vite) frontend, Django REST API, and PostgreSQL.

## Features

- Sign up / sign in (JWT)
- Point-and-click walking on a small overworld (BFS pathfinding, server-validated steps)
- All **18 RSC skills** with the classic XP curve (level 99 = 13,034,431 XP; Hits starts at 10)
- **30-slot inventory**
- Equipment: helmet, arrows, gloves, body, legs, boots, ring, weapon, cape, amulet
- Starter kit items on registration

## Quick start

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:8000/api/
- Admin: http://localhost:8000/admin/ (create a superuser with the command below)

```bash
docker compose exec backend python manage.py createsuperuser
```

## Stack

| Layer    | Tech                                      |
|----------|-------------------------------------------|
| Frontend | React 19, Vite, React Router              |
| Backend  | Django 5, Django REST Framework, SimpleJWT|
| Database | PostgreSQL 16                             |

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register/` | Create account + player |
| POST | `/api/auth/login/` | JWT access + refresh |
| GET | `/api/auth/me/` | Current player state |
| GET | `/api/world/` | Tile map |
| PATCH | `/api/player/position/` | Walk one tile |
| POST | `/api/inventory/equip/` | Equip from inventory slot |
| POST | `/api/inventory/unequip/` | Unequip to inventory |

## Project layout

```
backend/     Django project (`game` app: models, XP, world, APIs)
frontend/    Vite React client (canvas world + HUD panels)
docker-compose.yml
```

## Notes

- Movement is tile-based: click a walkable tile, the client pathfinds, then syncs each step to the API.
- Equipable starter gear is in the inventory after sign-up — open **Inventory**, click an item, then check **Equipment**.
