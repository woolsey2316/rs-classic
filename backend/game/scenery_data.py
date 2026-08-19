import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"


def load_kinds() -> list[dict]:
    return json.loads((DATA_DIR / "scenery_kinds.json").read_text())


def load_locs() -> list[dict]:
    return json.loads((DATA_DIR / "scenery_locs.json").read_text())
