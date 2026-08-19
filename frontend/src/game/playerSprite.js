/**
 * RSC player sprites: 5 unique yaws, 3 mirrored.
 *
 * Generator frames face toward +X (screen-right when the camera is south):
 * 0 south/front, 3 southeast, 6 east, 9 northeast, 12 north/back.
 * West, southwest and northwest are those same frames flipped.
 */

export const PLAYER_SPRITE_SIZE = { width: 86, height: 140 };
export const PLAYER_SPRITE_ANGLES = [0, 3, 6, 9, 12];

export function playerSpriteUrl(angle) {
  return `/sprites/player/stand-${angle}.png`;
}

/**
 * Pick which generated sprite to show from the camera's view of the player.
 * `facing` is a world-space XZ walk direction; `cameraOffset` is camera - player.
 */
export function spriteViewFromCamera(facing, cameraOffset) {
  const faceYaw = Math.atan2(facing?.x ?? 0, facing?.z ?? 1);
  const viewYaw = Math.atan2(cameraOffset.x, cameraOffset.z);
  const tau = Math.PI * 2;
  let relative = faceYaw - viewYaw;
  relative = ((relative % tau) + tau) % tau;
  const octant = Math.round(relative / (Math.PI / 4)) % 8;

  const unique = [0, 3, 6, 9, 12, 9, 6, 3];
  const mirrored = [false, false, false, false, false, true, true, true];
  return { angle: unique[octant], flip: mirrored[octant], octant };
}
