import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';

/** Shared unit shapes, scaled per part. */
export const BOX = new BoxGeometry(1, 1, 1);
export const DRUM = new CylinderGeometry(1, 1, 1, 16);
export const HALF_DRUM = new CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI);
export const BALL = new SphereGeometry(1, 10, 8);
export const CONE = new ConeGeometry(1, 1, 8);

/** One part of a model: a shape, placed and scaled, that casts and catches shadows. */
export function block(
  geometry: BufferGeometry,
  material: Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
