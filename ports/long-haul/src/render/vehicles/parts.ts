import { css, mix, type Rgb } from '../colour';
import type { Camera, ScreenPoint } from './camera';
import {
  add,
  combine,
  cross,
  dot,
  inset,
  normalize,
  pointOn,
  scale,
  sub,
  type Frame,
  type Outline,
  type Vec3,
} from './geometry';
import { surfaceColour, type Environment, type Material, type MaterialKind } from './light';

/**
 * The pieces a vehicle is built from, and how each is drawn from any angle.
 *
 * - A **prism** is an outline pushed out into a solid, with its edges
 *   rounded over `bevel` feet: a cab side, a hood, a trailer, a bumper. Seen
 *   side on, its end face is the panel and the rounding is the rim of light
 *   along its top; seen from three quarters, the sweep between the ends is
 *   the roof, the windscreen, the front.
 * - A **cylinder**: wheels, tanks, stacks, lamps.
 * - A **panel**: something flat, like a mud flap or a mirror's glass.
 * - A **custom** part draws itself: cables, aerials, wiper arms.
 *
 * Parts are drawn far to near. Within a prism, every visible strip is
 * shaded from its own normal, so light, sky and road reach every surface
 * the same way whatever the camera.
 */
export interface FaceDraw {
  /** Transformed into the face's own units: u to the right, v up. */
  ctx: CanvasRenderingContext2D;
  env: Environment;
  /** Outward normal of the face, its u axis in space, and the direction to the eye. */
  normal: Vec3;
  u: Vec3;
  eye: Vec3;
  /** Pixels per unit on screen, to leave out what is too small to see. */
  pixels: number;
  /** True when the face shows its back to its (u, v) frame, so lettering has to be flipped. */
  mirrored: boolean;
  /** A colour as it looks on this face; `lean` tips the normal up (+) or down (−) for raised and sunken trim. */
  ink(colour: string, kind?: MaterialKind, lean?: number): string;
}

export type FacePainter = (face: FaceDraw) => void;

/** A distance along a prism's push direction: fixed, or sloping across the outline for a taper. */
export type Extent = number | { at: number; du?: number; dv?: number };

export interface Prism {
  kind: 'prism';
  shape: Outline;
  /** The plane the outline lies in; its axes must be unit vectors at right angles. */
  frame: Frame;
  /** The direction the outline is pushed out along (a unit vector). */
  out: Vec3;
  from: Extent;
  to: Extent;
  bevel: number;
  material: Material;
  /** Materials for labelled segments of the outline, e.g. glass for a windscreen. */
  sweeps?: Readonly<Record<string, Material>>;
  /** Details on the end towards `out`, and on the end away from it. */
  faceTo?: FacePainter;
  faceFrom?: FacePainter;
  /** Details on the sweep of a labelled straight segment: u along the segment, v along `out`. */
  sweepFaces?: Readonly<Record<string, FacePainter>>;
  /** Feet to move the part towards the eye when sorting. */
  bias?: number;
}

export interface Cylinder {
  kind: 'cylinder';
  centre: Vec3;
  /** Unit vector along the cylinder. */
  axis: Vec3;
  /** Which way is up on the caps, for painting them. */
  up: Vec3;
  radius: number;
  length: number;
  material: Material;
  capMaterial?: Material;
  /** Painted on whichever cap faces the eye, in feet from the centre, v along `up`. */
  cap?: FacePainter;
  /** Lines across the curved side at evenly spaced angles from `phase`: the tread of a tyre. */
  bandMarks?: { count: number; phase: number; colour: string };
  bias?: number;
}

export interface Panel {
  kind: 'panel';
  shape: Outline;
  frame: Frame;
  material: Material;
  face?: FacePainter;
  bias?: number;
}

export interface Custom {
  kind: 'custom';
  centre: Vec3;
  draw(ctx: CanvasRenderingContext2D, camera: Camera, env: Environment): void;
  bias?: number;
}

export type Part = Prism | Cylinder | Panel | Custom;

/** Steps round a rounded edge; three is smooth at any size the game draws. */
const BEVEL_STEPS = 3;
/** Neighbouring strips closer than this in colour are filled as one. */
const MERGE_DISTANCE = 2.5;

export function drawParts(
  ctx: CanvasRenderingContext2D,
  parts: readonly Part[],
  camera: Camera,
  env: Environment,
) {
  const sorted = parts
    .map((part) => ({ part, depth: camera.project(centreOf(part)).depth + (part.bias ?? 0) }))
    .sort((a, b) => a.depth - b.depth);
  for (const { part } of sorted) drawPart(ctx, part, camera, env);
}

export function drawPart(
  ctx: CanvasRenderingContext2D,
  part: Part,
  camera: Camera,
  env: Environment,
) {
  switch (part.kind) {
    case 'prism':
      drawPrism(ctx, part, camera, env);
      return;
    case 'cylinder':
      drawCylinder(ctx, part, camera, env);
      return;
    case 'panel':
      drawPanel(ctx, part, camera, env);
      return;
    case 'custom':
      part.draw(ctx, camera, env);
      return;
  }
}

export function centreOf(part: Part): Vec3 {
  switch (part.kind) {
    case 'prism': {
      const { shape, frame, out } = part;
      const u = (shape.minU + shape.maxU) / 2;
      const v = (shape.minV + shape.maxV) / 2;
      const along = (extentAt(part.from, u, v) + extentAt(part.to, u, v)) / 2;
      return add(pointOn(frame, u, v), scale(out, along));
    }
    case 'cylinder':
    case 'custom':
      return part.centre;
    case 'panel': {
      const { shape, frame } = part;
      return pointOn(frame, (shape.minU + shape.maxU) / 2, (shape.minV + shape.maxV) / 2);
    }
  }
}

function extentAt(extent: Extent, u: number, v: number): number {
  return typeof extent === 'number'
    ? extent
    : extent.at + (extent.du ?? 0) * u + (extent.dv ?? 0) * v;
}

/** The normal of a prism's end, which tilts when the end slopes (a tapered hood). */
function endNormal(part: Prism, extent: Extent, sign: 1 | -1): Vec3 {
  const du = typeof extent === 'number' ? 0 : (extent.du ?? 0);
  const dv = typeof extent === 'number' ? 0 : (extent.dv ?? 0);
  return scale(normalize(combine([part.out, 1], [part.frame.u, -du], [part.frame.v, -dv])), sign);
}

// ——— Drawing helpers ———

interface Strip {
  depth: number;
  points: ScreenPoint[];
  fill: string | CanvasGradient;
  /** Details painted on the strip right after it is filled. */
  detail?: () => void;
}

function tracePath(ctx: CanvasRenderingContext2D, points: readonly ScreenPoint[]) {
  ctx.beginPath();
  const first = points[0];
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index++) {
    const point = points[index] as ScreenPoint;
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
}

function fillStrip(ctx: CanvasRenderingContext2D, strip: Strip) {
  // A strip seen edge on covers no pixels worth drawing.
  const area = Math.abs(signedArea(strip.points));
  if (area < 0.3) return;
  tracePath(ctx, strip.points);
  ctx.fillStyle = strip.fill;
  ctx.fill();
  if (area < 8) return;
  // Neighbouring strips share an edge; a hairline in the same colour hides the seam.
  ctx.strokeStyle = strip.fill;
  ctx.lineWidth = 0.6;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function signedArea(points: readonly ScreenPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index] as ScreenPoint;
    const b = points[(index + 1) % points.length] as ScreenPoint;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function averageDepth(points: readonly ScreenPoint[]): number {
  let sum = 0;
  for (const point of points) sum += point.depth;
  return sum / Math.max(1, points.length);
}

function colourDistance(a: Rgb, b: Rgb): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/**
 * A gradient across a band of strips: colours change along the outline and
 * not along the push direction, so they can be laid out perpendicular to it.
 */
function bandGradient(
  ctx: CanvasRenderingContext2D,
  along: readonly ScreenPoint[],
  colours: readonly Rgb[],
  pushX: number,
  pushY: number,
): CanvasGradient | string {
  const length = Math.hypot(pushX, pushY);
  if (along.length < 2 || length < 1e-6) return css(colours[0] ?? [0, 0, 0]);
  const px = -pushY / length;
  const py = pushX / length;
  const offsets = along.map((point) => point.x * px + point.y * py);
  const low = Math.min(...offsets);
  const high = Math.max(...offsets);
  if (high - low < 0.5) return css(colours[Math.floor(colours.length / 2)] ?? [0, 0, 0]);
  const origin = along[0] as ScreenPoint;
  const base = origin.x * px + origin.y * py;
  const gradient = ctx.createLinearGradient(
    origin.x + px * (low - base),
    origin.y + py * (low - base),
    origin.x + px * (high - base),
    origin.y + py * (high - base),
  );
  const stops = offsets
    .map((offset, index) => ({ at: (offset - low) / (high - low), colour: colours[index] as Rgb }))
    .sort((a, b) => a.at - b.at);
  for (const stop of stops)
    gradient.addColorStop(Math.max(0, Math.min(1, stop.at)), css(stop.colour));
  return gradient;
}

function faceDraw(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  env: Environment,
  origin: Vec3,
  u: Vec3,
  v: Vec3,
  normal: Vec3,
): FaceDraw {
  const matrix = camera.affine(origin, u, v);
  ctx.transform(...matrix);
  const eye = camera.toEye(origin);
  const up: Vec3 = [0, 1, 0];
  return {
    ctx,
    env,
    normal,
    u,
    eye,
    pixels: Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])),
    mirrored: matrix[0] * matrix[3] - matrix[1] * matrix[2] > 0,
    ink: (colour, kind = 'paint', lean = 0) =>
      css(
        surfaceColour(
          { kind, colour },
          lean === 0 ? normal : normalize(add(normal, scale(up, lean))),
          eye,
          env,
        ),
      ),
  };
}

/** A sheen down a flat face: its normal tipped up at the top and down at the bottom, as if gently curved. */
function faceFill(
  ctx: CanvasRenderingContext2D,
  points: readonly ScreenPoint[],
  material: Material,
  normal: Vec3,
  eye: Vec3,
  env: Environment,
  camera: Camera,
  at: Vec3,
): CanvasGradient | string {
  const flat = surfaceColour(material, normal, eye, env);
  if (material.kind === 'rubber' || material.kind === 'metal') return css(flat);
  // "Up the face": world up, flattened onto the face (or towards the eye on a roof).
  const worldUp: Vec3 = [0, 1, 0];
  let upFace = combine([worldUp, 1], [normal, -dot(worldUp, normal)]);
  if (Math.hypot(...upFace) < 0.2) upFace = combine([eye, -1], [normal, dot(eye, normal)]);
  upFace = normalize(upFace);
  const tilt =
    material.kind === 'chrome'
      ? 0.55
      : material.kind === 'paint'
        ? 0.32
        : material.kind === 'glass'
          ? 0.3
          : 0.2;
  const top = camera.project(add(at, upFace));
  const bottom = camera.project(at);
  const dx = top.x - bottom.x;
  const dy = top.y - bottom.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return css(flat);
  const offsets = points.map(
    (point) => ((point.x - bottom.x) * dx + (point.y - bottom.y) * dy) / length,
  );
  const low = Math.min(...offsets);
  const high = Math.max(...offsets);
  if (high - low < 1) return css(flat);
  const gradient = ctx.createLinearGradient(
    bottom.x + (dx / length) * low,
    bottom.y + (dy / length) * low,
    bottom.x + (dx / length) * high,
    bottom.y + (dy / length) * high,
  );
  const stops = material.kind === 'chrome' || material.kind === 'paint' ? 7 : 4;
  for (let stop = 0; stop <= stops; stop++) {
    const t = stop / stops;
    const lean = (t - 0.5) * 2 * tilt;
    gradient.addColorStop(
      t,
      css(surfaceColour(material, normalize(add(normal, scale(upFace, lean))), eye, env)),
    );
  }
  return gradient;
}

// ——— Prisms ———

function drawPrism(ctx: CanvasRenderingContext2D, part: Prism, camera: Camera, env: Environment) {
  const { shape, frame, out } = part;
  const count = shape.u.length;
  const bevel = part.bevel;
  const mitre = inset(shape, 1);
  const point = (index: number, along: number, inward = 0): Vec3 => {
    const u =
      (shape.u[index] as number) +
      ((mitre.u[index] as number) - (shape.u[index] as number)) * inward;
    const v =
      (shape.v[index] as number) +
      ((mitre.v[index] as number) - (shape.v[index] as number)) * inward;
    return add(pointOn(frame, u, v), scale(out, along));
  };
  const edgeNormal = (index: number): Vec3 =>
    combine([frame.u, shape.nu[index] as number], [frame.v, shape.nv[index] as number]);
  const pointNormal = (index: number): Vec3 =>
    combine([frame.u, shape.pu[index] as number], [frame.v, shape.pv[index] as number]);
  const fromAt = (index: number) =>
    extentAt(part.from, shape.u[index] as number, shape.v[index] as number);
  const toAt = (index: number) =>
    extentAt(part.to, shape.u[index] as number, shape.v[index] as number);
  const materialOf = (index: number) => {
    const label = shape.labels[index];
    return (label && part.sweeps?.[label]) || part.material;
  };

  const strips: Strip[] = [];
  const centre = centreOf(part);
  const eyeAtCentre = camera.toEye(centre);

  // The sweep between the two rounded edges: runs of visible edges, each one gradient.
  const sweepStart = Array.from({ length: count }, (_, index) =>
    camera.project(point(index, fromAt(index) + bevel)),
  );
  const sweepEnd = Array.from({ length: count }, (_, index) =>
    camera.project(point(index, toAt(index) - bevel)),
  );
  const outTip = camera.project(add(centre, out));
  const outBase = camera.project(centre);
  const pushX = outTip.x - outBase.x;
  const pushY = outTip.y - outBase.y;
  const visible = Array.from({ length: count }, (_, index) => {
    const mid = point(index, (fromAt(index) + toAt(index)) / 2);
    return dot(edgeNormal(index), camera.toEye(mid)) > 0;
  });
  for (const run of runsOf(count, visible, shape.crease, (index) => materialOf(index))) {
    const material = materialOf(run[0] as number);
    const indices = [...run, ((run.at(-1) as number) + 1) % count];
    const near = indices.map((index) => sweepEnd[index] as ScreenPoint);
    const far = indices.map((index) => sweepStart[index] as ScreenPoint);
    const colours = indices.map((index, position) => {
      // At the ends of a run (a crease or the silhouette) use the edge's own normal.
      const normal =
        position === 0 || position === indices.length - 1
          ? edgeNormal(run[Math.min(position, run.length - 1)] as number)
          : pointNormal(index);
      return surfaceColour(material, normalize(normal), eyeAtCentre, env);
    });
    const mids = indices.map((index) => {
      const a = sweepStart[index] as ScreenPoint;
      const b = sweepEnd[index] as ScreenPoint;
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, depth: (a.depth + b.depth) / 2 };
    });
    const points = [...near, ...far.reverse()];
    const label = shape.labels[run[0] as number];
    const painter = label ? part.sweepFaces?.[label] : undefined;
    strips.push({
      depth: averageDepth(points),
      points,
      fill: bandGradient(ctx, mids, colours, pushX, pushY),
      detail:
        painter && run.length === 1
          ? sweepDetail(ctx, part, run[0] as number, painter, camera, env)
          : undefined,
    });
  }

  // The rounded edges at both ends, then the end that faces the eye.
  const ends = [
    { extent: part.to, sign: 1 as const, at: toAt, painter: part.faceTo },
    { extent: part.from, sign: -1 as const, at: fromAt, painter: part.faceFrom },
  ];
  let shown: (typeof ends)[number] | null = null;
  for (const end of ends) {
    const normal = endNormal(part, end.extent, end.sign);
    if (dot(normal, eyeAtCentre) > 0) shown = end;
    if (bevel <= 0) continue;
    const ring = (step: number) =>
      Array.from({ length: count }, (_, index) => {
        const angle = (step / BEVEL_STEPS) * (Math.PI / 2);
        const along = end.at(index) - end.sign * bevel * (1 - Math.sin(angle));
        return camera.project(point(index, along, bevel * (1 - Math.cos(angle))));
      });
    let outer = ring(0);
    for (let step = 0; step < BEVEL_STEPS; step++) {
      const inner = ring(step + 1);
      const angle = ((step + 0.5) / BEVEL_STEPS) * (Math.PI / 2);
      const colours = Array.from({ length: count }, (_, index) => {
        const tilted = normalize(
          combine([edgeNormal(index), Math.cos(angle)], [normal, Math.sin(angle)]),
        );
        const eye = camera.toEye(point(index, end.at(index)));
        return dot(tilted, eye) > 0
          ? surfaceColour(materialOf(index), tilted, eyeAtCentre, env)
          : null;
      });
      mergeRing(strips, outer, inner, colours);
      outer = inner;
    }
  }

  strips.sort((a, b) => a.depth - b.depth);
  for (const strip of strips) {
    fillStrip(ctx, strip);
    strip.detail?.();
  }

  if (!shown) return;
  const end = shown;
  const normal = endNormal(part, end.extent, end.sign);
  const corners = Array.from({ length: count }, (_, index) =>
    camera.project(point(index, end.at(index), bevel)),
  );
  // The end's own plane: a sloping end (a tapered hood) leans its axes along `out`.
  const slope = typeof end.extent === 'number' ? { at: end.extent, du: 0, dv: 0 } : end.extent;
  const origin = add(frame.origin, scale(out, slope.at));
  const faceU = add(frame.u, scale(out, slope.du ?? 0));
  const faceV = add(frame.v, scale(out, slope.dv ?? 0));
  const middle = add(
    pointOn(frame, (shape.minU + shape.maxU) / 2, (shape.minV + shape.maxV) / 2),
    scale(out, extentAt(end.extent, (shape.minU + shape.maxU) / 2, (shape.minV + shape.maxV) / 2)),
  );
  ctx.save();
  tracePath(ctx, corners);
  ctx.fillStyle = faceFill(ctx, corners, part.material, normal, eyeAtCentre, env, camera, middle);
  ctx.fill();
  if (end.painter) {
    ctx.clip();
    end.painter(faceDraw(ctx, camera, env, origin, faceU, faceV, normal));
  }
  ctx.restore();
}

/** Consecutive visible edges, split wherever the outline creases or changes material. */
function runsOf(
  count: number,
  visible: readonly boolean[],
  crease: readonly boolean[],
  materialOf: (index: number) => Material,
): number[][] {
  const runs: number[][] = [];
  // Start just after an invisible edge or a break, so a run never wraps round its own start.
  let start = visible.findIndex((shown, index) => {
    const previous = (index - 1 + count) % count;
    return (
      shown && (!visible[previous] || crease[index] || materialOf(index) !== materialOf(previous))
    );
  });
  if (start < 0) {
    if (!visible.some(Boolean)) return runs;
    start = 0;
  }
  let current: number[] = [];
  for (let step = 0; step < count; step++) {
    const index = (start + step) % count;
    const previous = (index - 1 + count) % count;
    const breaks = crease[index] || materialOf(index) !== materialOf(previous);
    if (!visible[index]) {
      if (current.length) runs.push(current);
      current = [];
      continue;
    }
    if (breaks && current.length) {
      runs.push(current);
      current = [];
    }
    current.push(index);
  }
  if (current.length) runs.push(current);
  return runs;
}

/** One step of a rounded edge, filled in as few pieces as its colours allow. */
function mergeRing(
  strips: Strip[],
  outer: readonly ScreenPoint[],
  inner: readonly ScreenPoint[],
  colours: readonly (Rgb | null)[],
) {
  const count = colours.length;
  let start = colours.findIndex(
    (colour, index) => colour !== null && colours[(index - 1 + count) % count] === null,
  );
  if (start < 0) start = 0;
  let group: number[] = [];
  let groupColour: Rgb | null = null;
  const flush = () => {
    if (!group.length || !groupColour) return;
    const indices = [...group, ((group.at(-1) as number) + 1) % count];
    const points = [
      ...indices.map((index) => outer[index] as ScreenPoint),
      ...indices.reverse().map((index) => inner[index] as ScreenPoint),
    ];
    strips.push({ depth: averageDepth(points), points, fill: css(groupColour) });
    group = [];
    groupColour = null;
  };
  for (let step = 0; step < count; step++) {
    const index = (start + step) % count;
    const colour = colours[index] ?? null;
    if (!colour) {
      flush();
      continue;
    }
    if (groupColour && colourDistance(groupColour, colour) > MERGE_DISTANCE * 3) flush();
    if (!groupColour) groupColour = colour;
    else groupColour = mix(groupColour, colour, 1 / (group.length + 1));
    group.push(index);
  }
  flush();
}

/** Details on the flat sweep of one straight labelled edge: a trailer's back doors, a windscreen's wipers. */
function sweepDetail(
  ctx: CanvasRenderingContext2D,
  part: Prism,
  index: number,
  painter: FacePainter,
  camera: Camera,
  env: Environment,
): (() => void) | undefined {
  const { shape, frame, out } = part;
  const next = (index + 1) % shape.u.length;
  const start = pointOn(frame, shape.u[index] as number, shape.v[index] as number);
  const end = pointOn(frame, shape.u[next] as number, shape.v[next] as number);
  const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  if (length <= 0) return undefined;
  const along = scale(sub(end, start), 1 / length);
  const normal = normalize(
    combine([frame.u, shape.nu[index] as number], [frame.v, shape.nv[index] as number]),
  );
  const from = extentAt(part.from, shape.u[index] as number, shape.v[index] as number);
  const to = extentAt(part.to, shape.u[index] as number, shape.v[index] as number);
  const origin = add(start, scale(out, from));
  const corners = [
    camera.project(origin),
    camera.project(add(end, scale(out, from))),
    camera.project(add(end, scale(out, to))),
    camera.project(add(start, scale(out, to))),
  ];
  return () => {
    ctx.save();
    tracePath(ctx, corners);
    ctx.clip();
    painter(faceDraw(ctx, camera, env, origin, along, out, normal));
    ctx.restore();
  };
}

// ——— Cylinders ———

const CYLINDER_STEPS = 14;

function drawCylinder(
  ctx: CanvasRenderingContext2D,
  part: Cylinder,
  camera: Camera,
  env: Environment,
) {
  const { centre, axis, radius } = part;
  const half = part.length / 2;
  const v = normalize(combine([part.up, 1], [axis, -dot(part.up, axis)]));
  const u = cross(v, axis);
  const eye = camera.toEye(centre);
  const ex = dot(eye, u);
  const ey = dot(eye, v);
  const capSign = dot(axis, eye) >= 0 ? 1 : -1;
  const capCentre = add(centre, scale(axis, half * capSign));
  const backCentre = add(centre, scale(axis, -half * capSign));

  if (Math.hypot(ex, ey) > 0.02) {
    const middle = Math.atan2(ey, ex);
    const ring: { normal: Vec3; front: ScreenPoint; back: ScreenPoint }[] = [];
    for (let step = 0; step <= CYLINDER_STEPS; step++) {
      const angle = middle - Math.PI / 2 + (step / CYLINDER_STEPS) * Math.PI;
      const normal = combine([u, Math.cos(angle)], [v, Math.sin(angle)]);
      ring.push({
        normal,
        front: camera.project(add(capCentre, scale(normal, radius))),
        back: camera.project(add(backCentre, scale(normal, radius))),
      });
    }
    const points = [
      ...ring.map((entry) => entry.front),
      ...ring.map((entry) => entry.back).reverse(),
    ];
    const a = camera.project(capCentre);
    const b = camera.project(backCentre);
    const mids = ring.map((entry) => ({
      x: (entry.front.x + entry.back.x) / 2,
      y: (entry.front.y + entry.back.y) / 2,
      depth: 0,
    }));
    const colours = ring.map((entry, step) =>
      polishedStreak(
        part.material,
        surfaceColour(part.material, entry.normal, eye, env),
        step / CYLINDER_STEPS,
        env,
      ),
    );
    fillStrip(ctx, {
      depth: 0,
      points,
      fill: bandGradient(ctx, mids, colours, a.x - b.x, a.y - b.y),
    });
    if (part.bandMarks) drawBandMarks(ctx, part, u, v, capCentre, backCentre, eye, camera);
  }

  if (Math.abs(dot(axis, eye)) < 0.02) return;
  const normal = scale(axis, capSign);
  const rim: ScreenPoint[] = [];
  for (let step = 0; step < 28; step++) {
    const angle = (step / 28) * Math.PI * 2;
    rim.push(
      camera.project(
        add(capCentre, combine([u, Math.cos(angle) * radius], [v, Math.sin(angle) * radius])),
      ),
    );
  }
  const material = part.capMaterial ?? part.material;
  ctx.save();
  tracePath(ctx, rim);
  ctx.fillStyle = faceFill(
    ctx,
    rim,
    material,
    normal,
    eye,
    env,
    camera,
    add(capCentre, scale(v, -radius)),
  );
  ctx.fill();
  if (part.cap) {
    ctx.clip();
    // Seen from the cap's own side, u runs the other way: keep the picture upright and unmirrored.
    const capU = capSign > 0 ? u : scale(u, -1);
    part.cap(faceDraw(ctx, camera, env, capCentre, capU, v, normal));
  }
  ctx.restore();
}

/**
 * Polished tubes catch the bright sky as two soft streaks either side of a
 * dark core, which is what makes a stack or a tank read as chrome at a
 * glance, even when the camera sees nothing but the horizon in it.
 */
function polishedStreak(material: Material, colour: Rgb, across: number, env: Environment): Rgb {
  if (material.kind !== 'chrome') return colour;
  const light = mix(env.skyHorizon, [255, 255, 255], 0.55 * (1 - env.night));
  const streak =
    Math.exp(-(((across - 0.3) / 0.07) ** 2)) * 0.75 +
    Math.exp(-(((across - 0.74) / 0.05) ** 2)) * 0.35;
  const core = Math.exp(-(((across - 0.52) / 0.08) ** 2)) * 0.35;
  return mix(mix(colour, [12, 14, 18], core), light, streak);
}

function drawBandMarks(
  ctx: CanvasRenderingContext2D,
  part: Cylinder,
  u: Vec3,
  v: Vec3,
  front: Vec3,
  back: Vec3,
  eye: Vec3,
  camera: Camera,
) {
  const marks = part.bandMarks;
  if (!marks) return;
  const spacing = (Math.PI * 2 * part.radius) / marks.count;
  ctx.strokeStyle = marks.colour;
  ctx.lineWidth = Math.max(0.5, spacing * 0.42 * camera.pixelsAt(part.centre));
  ctx.beginPath();
  for (let mark = 0; mark < marks.count; mark++) {
    const angle = marks.phase + (mark / marks.count) * Math.PI * 2;
    const normal = combine([u, Math.cos(angle)], [v, Math.sin(angle)]);
    // Marks on the very edge of the silhouette would stick out of it.
    if (dot(normal, eye) < 0.12) continue;
    const a = camera.project(add(front, scale(normal, part.radius)));
    const b = camera.project(add(back, scale(normal, part.radius)));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

// ——— Panels ———

function drawPanel(ctx: CanvasRenderingContext2D, part: Panel, camera: Camera, env: Environment) {
  const { shape, frame } = part;
  const centre = centreOf(part);
  const eye = camera.toEye(centre);
  let normal = normalize(cross(frame.u, frame.v));
  if (dot(normal, eye) < 0) normal = scale(normal, -1);
  const points = shape.u.map((u, index) =>
    camera.project(pointOn(frame, u, shape.v[index] as number)),
  );
  ctx.save();
  tracePath(ctx, points);
  ctx.fillStyle = faceFill(ctx, points, part.material, normal, eye, env, camera, centre);
  ctx.fill();
  if (part.face) {
    ctx.clip();
    part.face(faceDraw(ctx, camera, env, frame.origin, frame.u, frame.v, normal));
  }
  ctx.restore();
}
