import { cross, dot, normalize, sub, type Vec3 } from './geometry';

/**
 * How a vehicle is seen. Every view in the game uses one of two cameras: a
 * parallel one (the side diorama, card pictures, anything far away) and a
 * pinhole one (the cab: the road ahead, the mirrors, our own hood). Both
 * map world feet to canvas pixels, and both can say how a flat face lands on
 * screen, so decals and panel lines drawn in a face's own units follow it.
 */
export interface ScreenPoint {
  x: number;
  y: number;
  /** Larger is nearer the eye; only for comparing. */
  depth: number;
}

/** An affine map from a face's (u, v) to canvas pixels, as `ctx.transform` takes it. */
export type Affine = readonly [number, number, number, number, number, number];

export interface Camera {
  project(point: Vec3): ScreenPoint;
  /** Unit vector from a point towards the eye. */
  toEye(point: Vec3): Vec3;
  /** Pixels per foot at a point, for deciding what is too small to draw. */
  pixelsAt(point: Vec3): number;
  /** How the plane through `origin` spanned by `u` and `v` lands on screen near `origin`. */
  affine(origin: Vec3, u: Vec3, v: Vec3): Affine;
}

/**
 * A parallel camera: `azimuth` is where the eye stands, in degrees round the
 * vehicle (0 ahead of it, 90 on its right, 180 behind), `elevation` how far
 * it looks down. `scale` is pixels per foot and (x, y) where the world's
 * origin lands.
 */
export function parallelCamera(options: {
  azimuth: number;
  elevation: number;
  scale: number;
  x: number;
  y: number;
}): Camera {
  const a = (options.azimuth * Math.PI) / 180;
  const b = (options.elevation * Math.PI) / 180;
  const back: Vec3 = [Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)];
  const right: Vec3 = [Math.sin(a), 0, -Math.cos(a)];
  const up = cross(back, right);
  const { scale, x, y } = options;
  return {
    project: (point) => ({
      x: x + scale * dot(point, right),
      y: y - scale * dot(point, up),
      depth: dot(point, back),
    }),
    toEye: () => back,
    pixelsAt: () => scale,
    affine: (origin, u, v) => [
      scale * dot(u, right),
      -scale * dot(u, up),
      scale * dot(v, right),
      -scale * dot(v, up),
      x + scale * dot(origin, right),
      y - scale * dot(origin, up),
    ],
  };
}

/**
 * The side diorama's camera: the vehicle's length stays level and its
 * height upright, and depth slides off up and to one side, so the front and
 * the tops show a little without the road tilting. `lean` and `rise` are how
 * far a foot of depth moves sideways and up; the eye looks along the same
 * slant, which is what shading and hidden faces go by.
 */
export function obliqueCamera(options: {
  lean: number;
  rise: number;
  scale: number;
  x: number;
  y: number;
}): Camera {
  const { lean, rise, scale, x, y } = options;
  const eye = normalize([lean, rise, 1]);
  return {
    project: (point) => ({
      x: x + scale * (point[0] - lean * point[2]),
      y: y - scale * (point[1] - rise * point[2]),
      depth: dot(point, eye),
    }),
    toEye: () => eye,
    pixelsAt: () => scale,
    affine: (origin, u, v) => [
      scale * (u[0] - lean * u[2]),
      -scale * (u[1] - rise * u[2]),
      scale * (v[0] - lean * v[2]),
      -scale * (v[1] - rise * v[2]),
      x + scale * (origin[0] - lean * origin[2]),
      y - scale * (origin[1] - rise * origin[2]),
    ],
  };
}

/**
 * A pinhole camera at `eye` looking along `forward`, with the image centre at
 * (cx, cy) and a focal length in pixels. `mirror` flips the picture left to
 * right, which is what a rear-view mirror shows.
 */
export function pinholeCamera(options: {
  eye: Vec3;
  forward: Vec3;
  up?: Vec3;
  focal: number;
  cx: number;
  cy: number;
  mirror?: boolean;
}): Camera {
  const forward = normalize(options.forward);
  const flip = options.mirror ? -1 : 1;
  const right = normalize(cross(forward, options.up ?? [0, 1, 0]));
  const up = cross(right, forward);
  const { eye, focal, cx, cy } = options;
  const toCamera = (point: Vec3) => {
    const d = sub(point, eye);
    return { x: dot(d, right), y: dot(d, up), z: Math.max(0.05, dot(d, forward)) };
  };
  return {
    project: (point) => {
      const c = toCamera(point);
      return { x: cx + (flip * focal * c.x) / c.z, y: cy - (focal * c.y) / c.z, depth: -c.z };
    },
    toEye: (point) => normalize(sub(eye, point)),
    pixelsAt: (point) => focal / toCamera(point).z,
    affine: (origin, u, v) => {
      const c = toCamera(origin);
      // The derivative of the projection at the origin, along u and along v.
      const column = (axis: Vec3): [number, number] => {
        const ax = dot(axis, right);
        const ay = dot(axis, up);
        const az = dot(axis, forward);
        return [
          (flip * focal * (ax * c.z - c.x * az)) / (c.z * c.z),
          (-focal * (ay * c.z - c.y * az)) / (c.z * c.z),
        ];
      };
      const [a, b] = column(u);
      const [cc, d] = column(v);
      return [a, b, cc, d, cx + (flip * focal * c.x) / c.z, cy - (focal * c.y) / c.z];
    },
  };
}

/**
 * A parallel camera that fits a box of the world (min and max corners) into
 * a rectangle of the canvas, leaving `margin` pixels round it: the way a
 * card picture or the garage frames the rig.
 */
export function framedCamera(options: {
  azimuth: number;
  elevation: number;
  min: Vec3;
  max: Vec3;
  left: number;
  top: number;
  width: number;
  height: number;
  margin?: number;
}): Camera {
  const unit = parallelCamera({
    azimuth: options.azimuth,
    elevation: options.elevation,
    scale: 1,
    x: 0,
    y: 0,
  });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [options.min[0], options.max[0]])
    for (const y of [options.min[1], options.max[1]])
      for (const z of [options.min[2], options.max[2]]) {
        const point = unit.project([x, y, z]);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
  const margin = options.margin ?? 0;
  const scale = Math.min(
    (options.width - margin * 2) / (maxX - minX),
    (options.height - margin * 2) / (maxY - minY),
  );
  return parallelCamera({
    azimuth: options.azimuth,
    elevation: options.elevation,
    scale,
    x: options.left + options.width / 2 - ((minX + maxX) / 2) * scale,
    y: options.top + options.height / 2 - ((minY + maxY) / 2) * scale,
  });
}

/**
 * A camera for a vehicle standing somewhere in the world: its own feet are
 * turned by `heading` (radians about the vertical, π for oncoming traffic)
 * and moved by `offset` before the world camera sees them. Shading still
 * works in the vehicle's own frame.
 */
export function placedCamera(world: Camera, offset: Vec3, heading = 0): Camera {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const turn = (v: Vec3): Vec3 => [v[0] * cos - v[2] * sin, v[1], v[0] * sin + v[2] * cos];
  const back = (v: Vec3): Vec3 => [v[0] * cos + v[2] * sin, v[1], -v[0] * sin + v[2] * cos];
  const place = (point: Vec3): Vec3 => {
    const turned = turn(point);
    return [turned[0] + offset[0], turned[1] + offset[1], turned[2] + offset[2]];
  };
  return {
    project: (point) => world.project(place(point)),
    toEye: (point) => back(world.toEye(place(point))),
    pixelsAt: (point) => world.pixelsAt(place(point)),
    affine: (origin, u, v) => world.affine(place(origin), turn(u), turn(v)),
  };
}
