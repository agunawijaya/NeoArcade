/**
 * The biplane both views draw, as numbers: a Camel-type scout in world
 * units, nose along +x, up along +y, the near wingtip along +z (towards the
 * viewer). The side view projects it by hand; the diorama builds meshes
 * from the same figures, so the two always show the same aeroplane.
 */
export interface WingModel {
  /** Leading and trailing edge x at the root. */
  leading: number;
  trailing: number;
  /** Height at the root, and how much it rises per unit of span (dihedral). */
  y: number;
  dihedral: number;
  /** Half-span. */
  span: number;
  /** Ribs, as distances from the root. */
  ribs: readonly number[];
}

/** The fuselage's side, top edge from nose to tail, then the bottom edge back to the nose. */
export const FUSELAGE_TOP: readonly [number, number][] = [
  [5.1, 1.5],
  [3.4, 1.62],
  [1.5, 1.7],
  [0.6, 1.72],
  [-1.6, 1.62],
  [-2.4, 1.48],
  [-5.2, 0.95],
  [-8.6, 0.42],
];

export const FUSELAGE_BOTTOM: readonly [number, number][] = [
  [-8.6, -0.18],
  [-5.4, -0.62],
  [-1.6, -1.22],
  [2.4, -1.4],
  [5.1, -1.36],
];

/** Half the fuselage's width. */
export const FUSELAGE_HALF_WIDTH = 1.05;

export const COWLING = { back: 4.9, front: 7.1, radius: 1.82 };
export const PROPELLER = { x: 7.55, radius: 4.1 };

const ribsEvery = (span: number, spacing: number) =>
  Array.from({ length: Math.floor(span / spacing) }, (_, index) => (index + 1) * spacing);

export const UPPER_WING: WingModel = {
  leading: 4.5,
  trailing: -0.5,
  y: 3.45,
  dihedral: 0,
  span: 13.5,
  ribs: ribsEvery(13.5, 1.5),
};

export const LOWER_WING: WingModel = {
  leading: 3.55,
  trailing: -1.15,
  y: -1.3,
  dihedral: 0.085,
  span: 12.8,
  ribs: ribsEvery(12.8, 1.5),
};

/** Interplane struts stand this far out along the span, front and back. */
export const STRUT_SPAN = 9.8;
export const STRUT_FRONT = 0.85;
export const STRUT_BACK = 0.18;

export const TAILPLANE = { leading: -6.9, trailing: -9.6, y: 0.35, span: 4.4 };

/** The fin and rudder, in the plane of the fuselage. */
export const FIN: readonly [number, number][] = [
  [-7.4, 0.5],
  [-8.5, 2.35],
  [-9.5, 2.75],
  [-10.05, 2.2],
  [-10.0, -0.55],
  [-8.6, -0.5],
];

/** The rudder hinge: stripes and crosses go behind it. */
export const RUDDER_HINGE = -8.75;

export const WHEELS = { x: 3.1, y: -3.6, radius: 0.9, track: 1.75 };
export const GEAR_TOP = [
  [4.1, -1.36],
  [1.9, -1.4],
] as const;

export const PILOT = { x: -0.5, y: 2.25, head: 0.62 };
/** Where the insignia sit: on the fuselage side, and on the upper wing near each tip. */
export const FUSELAGE_INSIGNIA = { x: -4.6, y: 0.42, radius: 0.82 };
export const WING_INSIGNIA = { span: 10.6, radius: 1.45 };
export const GUNS = { back: 2.9, front: 5.4, y: 1.95 };
