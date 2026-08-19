/** RSC walk click indicator (`media/icon.dat` frames 0–3). */
export const CLICK_ICON_FRAMES = 4;
export const CLICK_ICON_DURATION_MS = 400;

export function clickIconUrl(frame) {
  return `/sprites/rsc/media/icon/${frame}.png`;
}

/** Returns frame index 0–3, or -1 when the animation has finished. */
export function clickIconFrame(elapsedMs) {
  if (elapsedMs < 0 || elapsedMs >= CLICK_ICON_DURATION_MS) return -1;
  const frame = Math.floor((elapsedMs / CLICK_ICON_DURATION_MS) * CLICK_ICON_FRAMES);
  return Math.min(CLICK_ICON_FRAMES - 1, frame);
}
