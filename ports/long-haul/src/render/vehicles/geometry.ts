/**
 * The small amount of 3D a vehicle needs: vectors, outlines drawn with
 * Bézier curves and flattened into points, and the frames that put an
 * outline into space. Vehicles are modelled in feet: x forward, y up, z to
 * the vehicle's right.
 */
export type Vec3 = readonly [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a[0], a[1], a[2]);
  return length > 0 ? [a[0] / length, a[1] / length, a[2] / length] : [0, 1, 0];
}

/** Sums of scaled vectors, the usual way a point on a part is built. */
export function combine(...terms: [Vec3, number][]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const [vector, k] of terms) {
    x += vector[0] * k;
    y += vector[1] * k;
    z += vector[2] * k;
  }
  return [x, y, z];
}

export const X: Vec3 = [1, 0, 0];
export const Y: Vec3 = [0, 1, 0];
export const Z: Vec3 = [0, 0, 1];

/** A plane in space: a point and two axes, one unit of each per unit of the outline. */
export interface Frame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
}

export function pointOn(frame: Frame, u: number, v: number): Vec3 {
  return [
    frame.origin[0] + frame.u[0] * u + frame.v[0] * v,
    frame.origin[1] + frame.u[1] * u + frame.v[1] * v,
    frame.origin[2] + frame.u[2] * u + frame.v[2] * v,
  ];
}

// ——— Outlines ———

/**
 * A closed outline flattened into points, counter-clockwise with v up. Each
 * edge (point i to i + 1) knows its outward normal and the label of the
 * segment it came from; a crease marks a corner where the shading breaks.
 */
export interface Outline {
  u: number[];
  v: number[];
  /** Outward normal of each edge. */
  nu: number[];
  nv: number[];
  /** Normal at each point: averaged where the outline is smooth, the next edge's at a crease. */
  pu: number[];
  pv: number[];
  crease: boolean[];
  labels: (string | undefined)[];
  /** Bounds, for sorting and detail. */
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

type Node =
  | { kind: 'line'; x: number; y: number; label: string | undefined }
  | { kind: 'corner'; x: number; y: number; radius: number; label: string | undefined }
  | {
      kind: 'quad';
      cx: number;
      cy: number;
      x: number;
      y: number;
      label: string | undefined;
    }
  | {
      kind: 'cubic';
      c1x: number;
      c1y: number;
      c2x: number;
      c2y: number;
      x: number;
      y: number;
      label: string | undefined;
    };

/** Corners sharper than this break the shading; gentler ones are part of a curve. */
const CREASE_COS = Math.cos((32 * Math.PI) / 180);

/**
 * Draws an outline the way a pen would: lines, rounded corners and curves.
 * `corner` puts a vertex whose sharpness is softened over `radius` feet on
 * either side, which is how most panels on a vehicle meet.
 */
export class OutlineBuilder {
  private readonly nodes: Node[] = [];
  private startX = 0;
  private startY = 0;
  private current: string | undefined;

  move(x: number, y: number): this {
    this.startX = x;
    this.startY = y;
    return this;
  }

  /** Labels the segments that follow, so a sweep can be given its own material or detail. */
  label(name: string | undefined): this {
    this.current = name;
    return this;
  }

  line(x: number, y: number): this {
    this.nodes.push({ kind: 'line', x, y, label: this.current });
    return this;
  }

  corner(x: number, y: number, radius: number): this {
    this.nodes.push({ kind: 'corner', x, y, radius, label: this.current });
    return this;
  }

  quad(cx: number, cy: number, x: number, y: number): this {
    this.nodes.push({ kind: 'quad', cx, cy, x, y, label: this.current });
    return this;
  }

  curve(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    this.nodes.push({ kind: 'cubic', c1x, c1y, c2x, c2y, x, y, label: this.current });
    return this;
  }

  /** Part of a circle, from one angle to another (radians, counter-clockwise when `to` is larger). */
  arc(cx: number, cy: number, radius: number, from: number, to: number): this {
    const steps = Math.max(3, Math.ceil(Math.abs(to - from) / 0.14));
    for (let step = 0; step <= steps; step++) {
      const angle = from + ((to - from) * step) / steps;
      this.line(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    }
    return this;
  }

  close(): Outline {
    const points: { x: number; y: number; label: string | undefined }[] = [];
    const nodes = this.resolveCorners();
    let px = this.startX;
    let py = this.startY;
    for (const node of nodes) {
      if (node.kind === 'line' || node.kind === 'corner') {
        points.push({ x: node.x, y: node.y, label: node.label });
      } else if (node.kind === 'quad') {
        const steps = curveSteps(px, py, node.cx, node.cy, node.cx, node.cy, node.x, node.y);
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          const a = (1 - t) * (1 - t);
          const b = 2 * (1 - t) * t;
          const c = t * t;
          points.push({
            x: a * px + b * node.cx + c * node.x,
            y: a * py + b * node.cy + c * node.y,
            label: node.label,
          });
        }
      } else {
        const steps = curveSteps(px, py, node.c1x, node.c1y, node.c2x, node.c2y, node.x, node.y);
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          const s = 1 - t;
          points.push({
            x:
              s * s * s * px +
              3 * s * s * t * node.c1x +
              3 * s * t * t * node.c2x +
              t * t * t * node.x,
            y:
              s * s * s * py +
              3 * s * s * t * node.c1y +
              3 * s * t * t * node.c2y +
              t * t * t * node.y,
            label: node.label,
          });
        }
      }
      px = node.x;
      py = node.y;
    }
    // The last node closes on the start; drop a duplicate of the first point.
    const last = points.at(-1);
    if (last && Math.hypot(last.x - this.startX, last.y - this.startY) < 1e-6) points.pop();
    // The start point's label is that of the closing edge, which arrives at it.
    points.unshift({ x: this.startX, y: this.startY, label: this.current });
    // Each point carries the label of the segment arriving at it; edges take the label of their end.
    const labelled = points.map((point, index) => ({
      ...point,
      edgeLabel: (points[(index + 1) % points.length] as (typeof points)[number]).label,
    }));
    return buildOutline(
      labelled.map((point) => point.x),
      labelled.map((point) => point.y),
      labelled.map((point) => point.edgeLabel),
    );
  }

  /** Replaces each rounded corner with a line to where the rounding starts and a curve round it. */
  private resolveCorners(): Node[] {
    const resolved: Node[] = [];
    const count = this.nodes.length;
    for (let index = 0; index < count; index++) {
      const node = this.nodes[index] as Node;
      if (node.kind !== 'corner') {
        resolved.push(node);
        continue;
      }
      const before =
        index === 0 ? { x: this.startX, y: this.startY } : (this.nodes[index - 1] as Node);
      const next = index === count - 1 ? null : (this.nodes[index + 1] as Node);
      const towards = next
        ? next.kind === 'quad'
          ? { x: next.cx, y: next.cy }
          : next.kind === 'cubic'
            ? { x: next.c1x, y: next.c1y }
            : next
        : { x: this.startX, y: this.startY };
      const inLength = Math.hypot(node.x - before.x, node.y - before.y);
      const outLength = Math.hypot(towards.x - node.x, towards.y - node.y);
      const cut = Math.min(node.radius, inLength * 0.5, outLength * 0.5);
      if (cut <= 0 || inLength === 0 || outLength === 0) {
        resolved.push({ kind: 'line', x: node.x, y: node.y, label: node.label });
        continue;
      }
      const ax = node.x + ((before.x - node.x) / inLength) * cut;
      const ay = node.y + ((before.y - node.y) / inLength) * cut;
      const bx = node.x + ((towards.x - node.x) / outLength) * cut;
      const by = node.y + ((towards.y - node.y) / outLength) * cut;
      resolved.push({ kind: 'line', x: ax, y: ay, label: node.label });
      resolved.push({ kind: 'quad', cx: node.x, cy: node.y, x: bx, y: by, label: node.label });
    }
    return resolved;
  }
}

export function outline(x: number, y: number): OutlineBuilder {
  return new OutlineBuilder().move(x, y);
}

/** A rectangle with every corner rounded by the same amount. */
export function roundedRect(
  left: number,
  bottom: number,
  right: number,
  top: number,
  radius: number,
): Outline {
  const r = Math.min(radius, (right - left) / 2, (top - bottom) / 2);
  if (r <= 0)
    return outline(left, bottom).line(right, bottom).line(right, top).line(left, top).close();
  return outline(left + r, bottom)
    .line(right - r, bottom)
    .quad(right, bottom, right, bottom + r)
    .line(right, top - r)
    .quad(right, top, right - r, top)
    .line(left + r, top)
    .quad(left, top, left, top - r)
    .line(left, bottom + r)
    .quad(left, bottom, left + r, bottom)
    .close();
}

/** A polygon from corner points, each with its own rounding. */
export function polygon(points: readonly (readonly [number, number, number?])[]): Outline {
  const [first, ...rest] = points;
  if (!first) throw new Error('A polygon needs points.');
  const builder = new OutlineBuilder().move(first[0], first[1]);
  for (const [x, y, radius] of rest) {
    if (radius) builder.corner(x, y, radius);
    else builder.line(x, y);
  }
  return builder.close();
}

/** A circle as an outline, for round lenses and dials painted on faces. */
export function circleOutline(cx: number, cy: number, radius: number, steps = 20): Outline {
  const u: number[] = [];
  const v: number[] = [];
  for (let step = 0; step < steps; step++) {
    const angle = (step / steps) * Math.PI * 2;
    u.push(cx + Math.cos(angle) * radius);
    v.push(cy + Math.sin(angle) * radius);
  }
  return buildOutline(
    u,
    v,
    Array.from({ length: steps }, () => undefined),
  );
}

function curveSteps(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): number {
  const length =
    Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
  const turn =
    angleBetween(x1 - x0, y1 - y0, x2 - x1, y2 - y1) +
    angleBetween(x2 - x1, y2 - y1, x3 - x2, y3 - y2);
  return Math.max(2, Math.min(28, Math.ceil(Math.max(turn / 0.16, length / 2.5))));
}

function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  const a = Math.hypot(ax, ay);
  const b = Math.hypot(bx, by);
  if (a === 0 || b === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (a * b))));
}

function buildOutline(rawU: number[], rawV: number[], rawLabels: (string | undefined)[]): Outline {
  // Points that land on top of each other (a curve ending where the next begins) make no edge.
  let u: number[] = [];
  let v: number[] = [];
  let labels: (string | undefined)[] = [];
  for (let index = 0; index < rawU.length; index++) {
    const next = (index + 1) % rawU.length;
    const gap = Math.hypot(
      (rawU[next] as number) - (rawU[index] as number),
      (rawV[next] as number) - (rawV[index] as number),
    );
    if (gap < 1e-4) continue;
    u.push(rawU[index] as number);
    v.push(rawV[index] as number);
    labels.push(rawLabels[index]);
  }
  // Counter-clockwise, so the outward normal of an edge is its direction turned right.
  let area = 0;
  for (let index = 0; index < u.length; index++) {
    const next = (index + 1) % u.length;
    area += (u[index] as number) * (v[next] as number) - (u[next] as number) * (v[index] as number);
  }
  if (area < 0) {
    u = u.reverse();
    v = v.reverse();
    // Reversing turns edge i (i → i+1) into edge n-2-i; keep each label with its edge.
    const edgeLabels = labels.slice(0, -1).reverse();
    edgeLabels.push(labels.at(-1));
    labels = edgeLabels;
  }
  const count = u.length;
  const nu: number[] = [];
  const nv: number[] = [];
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    const du = (u[next] as number) - (u[index] as number);
    const dv = (v[next] as number) - (v[index] as number);
    const length = Math.hypot(du, dv) || 1;
    nu.push(dv / length);
    nv.push(-du / length);
  }
  const pu: number[] = [];
  const pv: number[] = [];
  const crease: boolean[] = [];
  for (let index = 0; index < count; index++) {
    const previous = (index - 1 + count) % count;
    const a = [nu[previous] as number, nv[previous] as number];
    const b = [nu[index] as number, nv[index] as number];
    const cosine = (a[0] as number) * (b[0] as number) + (a[1] as number) * (b[1] as number);
    const sharp = cosine < CREASE_COS;
    crease.push(sharp);
    if (sharp) {
      pu.push(b[0] as number);
      pv.push(b[1] as number);
    } else {
      const su = (a[0] as number) + (b[0] as number);
      const sv = (a[1] as number) + (b[1] as number);
      const length = Math.hypot(su, sv) || 1;
      pu.push(su / length);
      pv.push(sv / length);
    }
  }
  return {
    u,
    v,
    nu,
    nv,
    pu,
    pv,
    crease,
    labels,
    minU: Math.min(...u),
    maxU: Math.max(...u),
    minV: Math.min(...v),
    maxV: Math.max(...v),
  };
}

/**
 * The outline moved inwards by `distance`: where a rounded edge meets a flat
 * face. Corners use the mitre, limited so a sharp point does not shoot off.
 */
export function inset(shape: Outline, distance: number): { u: number[]; v: number[] } {
  const count = shape.u.length;
  const u: number[] = [];
  const v: number[] = [];
  for (let index = 0; index < count; index++) {
    const previous = (index - 1 + count) % count;
    const au = shape.nu[previous] as number;
    const av = shape.nv[previous] as number;
    const bu = shape.nu[index] as number;
    const bv = shape.nv[index] as number;
    const denominator = Math.max(0.35, 1 + au * bu + av * bv);
    u.push((shape.u[index] as number) - ((au + bu) / denominator) * distance);
    v.push((shape.v[index] as number) - ((av + bv) / denominator) * distance);
  }
  return { u, v };
}
