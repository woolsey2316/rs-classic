const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getToken() {
  return localStorage.getItem("rsc_access");
}

export async function api(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  const auth = token ?? getToken();
  if (auth) {
    headers.Authorization = `Bearer ${auth}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      data.detail ||
      data.username?.[0] ||
      data.password?.[0] ||
      Object.values(data).flat?.()?.[0] ||
      "Request failed";
    throw new Error(typeof detail === "string" ? detail : "Request failed");
  }
  return data;
}

export async function login(username, password) {
  return api("/api/auth/login/", {
    method: "POST",
    body: { username, password },
    token: null,
  });
}

export async function register(username, password, displayName) {
  return api("/api/auth/register/", {
    method: "POST",
    body: {
      username,
      password,
      display_name: displayName || username,
    },
    token: null,
  });
}

export async function fetchMe() {
  return api("/api/auth/me/");
}

export async function equipItem(slotIndex) {
  return api("/api/inventory/equip/", {
    method: "POST",
    body: { slot_index: slotIndex },
  });
}

export async function unequipItem(slot) {
  return api("/api/inventory/unequip/", {
    method: "POST",
    body: { slot },
  });
}

export async function dropItem(slotIndex) {
  return api("/api/inventory/drop/", {
    method: "POST",
    body: { slot_index: slotIndex },
  });
}

export async function chopTree(sceneryId, playerX, playerY) {
  return api("/api/world/chop/", {
    method: "POST",
    body: {
      scenery_id: sceneryId,
      player_x: playerX,
      player_y: playerY,
    },
  });
}

export async function fetchTreasureChestContents(sceneryId) {
  return api(`/api/world/treasure-chest/${sceneryId}/`);
}

export async function takeFromTreasureChest(sceneryId, itemKey, playerX, playerY) {
  return api("/api/world/treasure-chest/take/", {
    method: "POST",
    body: {
      scenery_id: sceneryId,
      item_key: itemKey,
      player_x: playerX,
      player_y: playerY,
    },
  });
}

export async function fetchScenery({ minX, maxX, minY, maxY }) {
  const params = new URLSearchParams({
    min_x: String(minX),
    max_x: String(maxX),
    min_y: String(minY),
    max_y: String(maxY),
  });
  return api(`/api/world/scenery/?${params}`);
}
