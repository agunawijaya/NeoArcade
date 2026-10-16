import type { PerspectiveCamera } from 'three';
import { FLOOR, SKY_TOP } from '../side/camera';
import type { Viewport } from '../view';

/** How far in front of the line of play the camera stands, and how high. */
export const CAMERA_DISTANCE = 430;
export const CAMERA_HEIGHT = 112;
const NEAR = 4;
const FAR = 6000;

/**
 * Points the diorama's camera so the line of play (z = 0) lands on screen
 * exactly where the side view puts it: the same world window, the same
 * scale, the HUD's insets respected. The camera looks straight ahead from
 * a little above the field, with its frustum shifted rather than tilted,
 * so the line of play is not distorted; everything behind it recedes up
 * the screen and shrinks, and that is the "diorama".
 *
 * `zoom` pushes in on (`centreX`, `centreY`) for the flight into the sun.
 */
export function aimCamera(
  camera: PerspectiveCamera,
  viewport: Viewport,
  centreX: number,
  zoom = 1,
  centreY: number | null = null,
) {
  const band = viewport.height - viewport.insetTop - viewport.insetBottom;
  const scale = (band / (SKY_TOP - FLOOR)) * zoom;
  const halfWidth = viewport.width / 2 / scale;
  let top: number;
  let bottom: number;
  if (centreY === null) {
    top = SKY_TOP + viewport.insetTop / scale;
    bottom = FLOOR - viewport.insetBottom / scale;
  } else {
    const middle = viewport.insetTop + band / 2;
    top = centreY + middle / scale;
    bottom = centreY - (viewport.height - middle) / scale;
  }
  camera.position.set(centreX, CAMERA_HEIGHT, CAMERA_DISTANCE);
  camera.rotation.set(0, 0, 0);
  camera.near = NEAR;
  camera.far = FAR;
  camera.updateMatrixWorld();
  const toNear = NEAR / CAMERA_DISTANCE;
  camera.projectionMatrix.makePerspective(
    -halfWidth * toNear,
    halfWidth * toNear,
    (top - CAMERA_HEIGHT) * toNear,
    (bottom - CAMERA_HEIGHT) * toNear,
    NEAR,
    FAR,
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

/**
 * Where something that scrolls at `parallax` of the play's speed belongs in
 * depth: further back the slower it moves across the screen. Its size must
 * grow by 1 / parallax to look the same as in the side view.
 */
export function depthForParallax(parallax: number): number {
  return -CAMERA_DISTANCE * (1 / parallax - 1);
}
