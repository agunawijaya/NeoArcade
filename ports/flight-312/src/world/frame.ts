import { Vector3 } from 'three';
import type { LatLon } from '../engine/geo';

/**
 * The scene's coordinates: metres east (x), up (y) and south (z) of an
 * origin that follows the aircraft, on a flat projection. Every mesh keeps
 * its vertices in its own small local frame and is only placed in the
 * scene frame, so moving the origin is a matter of re-placing meshes; the
 * GPU never sees a coordinate far from the camera. The curve of the Earth
 * is put in by the shaders, measured from the eye (CURVE_GLSL).
 */
export const METRES_PER_FOOT = 0.3048;
const METRES_PER_DEGREE = (Math.PI / 180) * 6_371_000;

/** How far the aircraft may get from the origin before the scene moves under it. */
export const RECENTRE_METRES = 25_000;

export class SceneFrame {
  origin: LatLon;
  private cosLat: number;

  constructor(origin: LatLon) {
    this.origin = origin;
    this.cosLat = Math.cos(origin.lat * (Math.PI / 180));
  }

  moveTo(origin: LatLon) {
    this.origin = origin;
    this.cosLat = Math.cos(origin.lat * (Math.PI / 180));
  }

  /** East and north of the origin, metres, on the tangent plane. */
  flat(point: LatLon): { east: number; north: number } {
    return {
      east: (point.lon - this.origin.lon) * METRES_PER_DEGREE * this.cosLat,
      north: (point.lat - this.origin.lat) * METRES_PER_DEGREE,
    };
  }

  /** A place and height in the scene. */
  toScene(point: LatLon, heightMetres: number, target = new Vector3()): Vector3 {
    const { east, north } = this.flat(point);
    return target.set(east, heightMetres, -north);
  }

  toLatLon(x: number, z: number): LatLon {
    return {
      lat: this.origin.lat + -z / METRES_PER_DEGREE,
      lon: this.origin.lon + x / (METRES_PER_DEGREE * this.cosLat),
    };
  }
}

/** Metres east and north of a fixed point, for building a mesh in its own frame. */
export function localMetres(centre: LatLon) {
  const cosLat = Math.cos(centre.lat * (Math.PI / 180));
  return (point: LatLon) => ({
    east: (point.lon - centre.lon) * METRES_PER_DEGREE * cosLat,
    north: (point.lat - centre.lat) * METRES_PER_DEGREE,
  });
}
