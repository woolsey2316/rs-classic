/** RSC media tab bar (`inv1.dat` / `inv2.dat`), mudclient204 layout. */
export const INV1_URL = "/sprites/rsc/media/inv1/0.png";
export const INV1_WIDTH = 197;
export const INV1_HEIGHT = 32;
export const INV2_WIDTH = 245;
export const INV2_HEIGHT = 33;

export const INV2_URL = (frame) => `/sprites/rsc/media/inv2/${frame}.png`;

/** Button index from the left of `inv1` (0 = wrench … 5 = backpack). */
export const BUTTON_WIDTH = 33;

export const RSC_ACTION_TABS = {
  inventory: { buttonIndex: 5, hoverFrame: 0 },
  skills: { buttonIndex: 3, hoverFrame: 2 },
  equipment: { buttonIndex: 2, hoverFrame: 3 },
};

export function hoverFrameForTab(tab) {
  return RSC_ACTION_TABS[tab]?.hoverFrame ?? null;
}

export function tabForButtonIndex(index) {
  return Object.entries(RSC_ACTION_TABS).find(([, cfg]) => cfg.buttonIndex === index)?.[0] ?? null;
}
