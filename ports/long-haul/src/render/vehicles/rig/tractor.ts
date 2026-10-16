import { css, litRgb } from '../../colour';
import { glassPane, grime, lettering, pane, rivets, seam } from '../detail';
import { outline, polygon, roundedRect, X, Y, Z, type Outline, type Vec3 } from '../geometry';
import { lampOn, type Lamp } from '../lamps';
import type { Material } from '../light';
import type { Cylinder, FaceDraw, FacePainter, Part, Prism } from '../parts';
import { wheelPart } from '../wheels';
import { RIG, sleeperOf, type RigLights, type RigModel } from './model';

/**
 * The tractor: a long hood with a chrome grille and round lamps on stalks,
 * swept fenders, a riveted cab with a raked windscreen and a sun visor, a
 * sleeper box, twin stacks, saddle tanks over battery-box steps, and the
 * frame and fifth wheel the trailer rides on. Each part is drawn as one
 * solid, so the same list makes the side view, the card pictures and the
 * hood seen from the driver's seat.
 */
const CHROME: Material = { kind: 'chrome', colour: '#dfe3e7' };
const POLISHED: Material = { kind: 'chrome', colour: '#e6e9ec' };
const FRAME: Material = { kind: 'metal', colour: '#26282c' };
const DARK: Material = { kind: 'metal', colour: '#3a3d42' };
const RUBBER: Material = { kind: 'rubber', colour: '#1f2023' };
const GLASS: Material = { kind: 'glass', colour: '#1c2329' };
const AMBER_LENS: Material = { kind: 'lens', colour: '#c9822a' };

const COWL = 57.9;
const GRILLE = 64.4;
const BELT = 5.35;
const HOOD_FRONT_HALF = 1.55;
const HOOD_BACK_HALF = 2.05;
/** The windscreen's lean: feet back per foot up. */
const RAKE = 0.34;

function side(
  shape: Outline,
  from: number,
  to: number,
  material: Material,
  extra: Partial<Prism> = {},
): Prism {
  return {
    kind: 'prism',
    shape,
    frame: { origin: [0, 0, 0], u: X, v: Y },
    out: Z,
    from,
    to,
    bevel: 0.2,
    material,
    ...extra,
  };
}

function cylinder(
  centre: Vec3,
  axis: Vec3,
  radius: number,
  length: number,
  material: Material,
  extra: Partial<Cylinder> = {},
): Cylinder {
  return {
    kind: 'cylinder',
    centre,
    axis,
    up: axis === Y ? X : Y,
    radius,
    length,
    material,
    ...extra,
  };
}

/** A part on each side of the rig: `make(1)` on the right, `make(-1)` on the left. */
function pair<T>(make: (side: 1 | -1) => T): T[] {
  return [make(1), make(-1)];
}

export interface TractorState {
  lights: RigLights;
  /** Wheel rotation, radians. */
  turn: number;
  steer: number;
  /** Seconds, for the CB whip's sway; 0 keeps it still. */
  sway: number;
}

export function tractorBody(model: RigModel, state: TractorState): Part[] {
  const paint: Material = { kind: 'paint', colour: model.paint.body };
  const sleeper = sleeperOf(model);
  return [
    ...frameAndCoupling(sleeper.back),
    hood(model, paint),
    grilleShell(),
    grilleCore(),
    bumper(),
    ...pair((sideOf) => fender(model, paint, sideOf)),
    ...pair((sideOf) => headlamp(sideOf)).flat(),
    ...pair((sideOf) => turnLamp(sideOf)),
    ...pair((sideOf) => airCleaner(sideOf)).flat(),
    cab(model, paint, state.lights),
    visor(paint),
    ...visorLamps(),
    sleeperBox(model, paint, state.lights),
    side(roundedRect(53.2, 4.3, RIG.cabBack, 9.1, 0.1), -3.25, 3.25, RUBBER, { bevel: 0.05 }),
    ...pair((sideOf) => steps(model, sideOf)),
    ...pair((sideOf) => fuelTank(model, sideOf)).flat(),
    ...pair((sideOf) => stack(sideOf)).flat(),
    ...airHorns(),
    ...pair((sideOf) => mirror(sideOf)).flat(),
    ...pair((sideOf) => grabHandle(sideOf)),
    ...pair((sideOf) => mudFlap(sideOf)).flat(),
    cbWhip(state.sway),
    airLines(sleeper.back),
  ];
}

/** What the driver sees over the dash: the long hood, its grille shell and the fenders. */
export function tractorFront(model: RigModel): Part[] {
  const paint: Material = { kind: 'paint', colour: model.paint.body };
  return [hood(model, paint), grilleShell(), ...pair((sideOf) => fender(model, paint, sideOf))];
}

/** What a mirror on the cab sees of the rig behind it. */
export function tractorBehindCab(model: RigModel, state: TractorState): Part[] {
  const paint: Material = { kind: 'paint', colour: model.paint.body };
  const sleeper = sleeperOf(model);
  return [
    sleeperBox(model, paint, state.lights),
    ...pair((sideOf) => fuelTank(model, sideOf)).flat(),
    ...pair((sideOf) => stack(sideOf)).flat(),
    ...frameAndCoupling(sleeper.back).filter((part) => part.kind === 'prism'),
    airLines(sleeper.back),
  ];
}

export function tractorWheels(model: RigModel, state: TractorState): Part[] {
  const wheels: Part[] = [];
  const r = RIG.tyreRadius;
  for (const sideOf of [1, -1] as const) {
    wheels.push(
      wheelPart(
        {
          centre: [RIG.steerAxle, r, 3.33 * sideOf],
          radius: r,
          width: 0.9,
          rim: 'polished',
          side: sideOf,
          steer: state.steer,
        },
        state.turn,
        model.dirt,
      ),
    );
    for (const axle of RIG.driveAxles) {
      wheels.push(
        wheelPart(
          {
            centre: [axle, r, 2.55 * sideOf],
            radius: r,
            width: 0.85,
            rim: 'polished',
            side: sideOf,
            inner: true,
          },
          state.turn,
          model.dirt,
        ),
        wheelPart(
          {
            centre: [axle, r, 3.47 * sideOf],
            radius: r,
            width: 0.85,
            rim: 'polished',
            side: sideOf,
          },
          state.turn,
          model.dirt,
        ),
      );
    }
  }
  return wheels;
}

export function tractorLamps(): Lamp[] {
  const lamps: Lamp[] = [];
  for (const sideOf of [1, -1] as const) {
    const turn = sideOf > 0 ? 'right' : 'left';
    lamps.push(
      lampOn([64.92, 4.85, 2.5 * sideOf], X, 0.32, 'white', ['head']),
      lampOn([64.37, 4.45, 3.35 * sideOf], X, 0.13, 'amber', ['marker', turn]),
      lampOn([64.3, 3.45, 3.96 * sideOf], [0, 0, sideOf], 0.09, 'amber', ['marker', turn]),
    );
  }
  for (const z of VISOR_LAMPS) lamps.push(lampOn([58.03, 9.28, z], X, 0.09, 'amber', ['marker']));
  return lamps;
}

// ——— The front ———

function hood(model: RigModel, paint: Material): Prism {
  const slope = (HOOD_FRONT_HALF - HOOD_BACK_HALF) / (GRILLE - COWL);
  const at = HOOD_BACK_HALF - slope * COWL;
  const painter: FacePainter = (face) => hoodSide(face, model);
  return {
    ...side(
      outline(COWL, 3.75).line(GRILLE, 3.75).corner(GRILLE, 6.05, 0.3).line(COWL, 6.42).close(),
      0,
      0,
      paint,
    ),
    from: { at: -at, du: -slope },
    to: { at, du: slope },
    bevel: 0.34,
    faceTo: painter,
    faceFrom: painter,
  };
}

function hoodSide(face: FaceDraw, model: RigModel) {
  const { ctx } = face;
  // Behind the fender, the hood's flank is the dark of the wheel well.
  ctx.fillStyle = face.ink('#0b0c0e', 'rubber');
  ctx.beginPath();
  ctx.arc(RIG.steerAxle, RIG.tyreRadius, 2.25, 0, Math.PI * 2);
  ctx.fill();
  stripe(face, model, COWL, GRILLE + 0.1);
  // Louvres let the engine breathe: a row of short vents near the front.
  if (face.pixels > 3) {
    for (let vent = 0; vent < 6; vent++) {
      const x = 61.2 + vent * 0.42;
      ctx.fillStyle = face.ink('#0f1012', 'metal');
      ctx.fillRect(x, 4.35, 0.16, 0.72);
      ctx.fillStyle = face.ink(model.paint.body, 'paint', 0.9);
      ctx.fillRect(x + 0.16, 4.35, 0.05, 0.72);
    }
  }
  // The hood lifts at the cowl: its back edge, and the hinge line at the front.
  const back = new Path2D();
  back.moveTo(COWL + 0.08, 3.8);
  back.lineTo(COWL + 0.08, 6.4);
  seam(face, back, model.paint.body);
  // A round badge on the hood side: the company's initials.
  if (face.pixels > 4) {
    ctx.fillStyle = face.ink('#d9dde1', 'chrome', 0.3);
    ctx.beginPath();
    ctx.ellipse(59.4, 5.85, 0.36, 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    lettering(face, 'LH', 59.4, 5.85, {
      size: 0.24,
      colour: face.ink(model.paint.body, 'paint'),
      weight: 800,
    });
  }
  grime(face, model.dirt * 0.6, { left: COWL, right: GRILLE, bottom: 3.75, height: 0.7 }, [], 3);
}

function grilleShell(): Prism {
  return side(
    outline(GRILLE, 2.55)
      .line(64.95, 2.55)
      .corner(64.95, 6.1, 0.22)
      .corner(GRILLE, 6.1, 0.05)
      .close(),
    -1.62,
    1.62,
    CHROME,
    { bevel: 0.14 },
  );
}

/** Vertical chrome bars over the dark radiator, seen whenever the camera is ahead of the rig. */
function grilleCore(): Part {
  return {
    kind: 'panel',
    shape: roundedRect(-1.38, 2.78, 1.38, 5.86, 0.08),
    frame: { origin: [64.965, 0, 0], u: [0, 0, -1], v: Y },
    material: { kind: 'metal', colour: '#141518' },
    face: (face) => {
      const { ctx } = face;
      if (face.pixels < 2) return;
      for (let bar = -6; bar <= 6; bar++) {
        const x = bar * 0.205;
        const gradient = ctx.createLinearGradient(x - 0.06, 0, x + 0.06, 0);
        gradient.addColorStop(0, face.ink('#9ca3aa', 'chrome', -0.4));
        gradient.addColorStop(0.5, face.ink('#f2f4f6', 'chrome', 0.5));
        gradient.addColorStop(1, face.ink('#6e767e', 'chrome', -0.2));
        ctx.fillStyle = gradient;
        ctx.fillRect(x - 0.06, 2.78, 0.12, 3.08);
      }
      ctx.fillStyle = face.ink('#d7dbe0', 'chrome', 0.4);
      ctx.fillRect(-1.38, 4.25, 2.76, 0.1);
    },
  };
}

function bumper(): Prism {
  return side(roundedRect(64.72, 1.38, 65.55, 2.48, 0.16), -3.92, 3.92, CHROME, { bevel: 0.22 });
}

function fender(model: RigModel, paint: Material, sideOf: 1 | -1): Prism {
  const shape = outline(58.15, 2.55)
    .curve(58.75, 2.95, 59.3, 4.15, 60.6, 4.28)
    .line(62.6, 4.3)
    .curve(63.9, 4.3, 64.78, 4.05, 64.96, 3.6)
    .line(64.96, 2.62)
    .line(64.07, 2.47)
    .arc(RIG.steerAxle, RIG.tyreRadius, 2.2, 0.35, Math.PI - 0.35)
    .close();
  const painter: FacePainter = (face) =>
    grime(face, model.dirt, { left: 58, right: 65, bottom: 2.3, height: 1.2 }, [60.2], 7);
  const [from, to] = sideOf > 0 ? [1.7, 3.95] : [-3.95, -1.7];
  return side(shape, from, to, paint, {
    bevel: 0.24,
    faceTo: sideOf > 0 ? painter : undefined,
    faceFrom: sideOf < 0 ? painter : undefined,
    // The fender's lip wraps over the tyre from every angle.
    bias: 0.8,
  });
}

function headlamp(sideOf: 1 | -1): Part[] {
  const z = 2.5 * sideOf;
  return [
    cylinder([64.68, 4.85, z], X, 0.42, 0.5, CHROME, {
      capMaterial: { kind: 'glass', colour: '#c9d2d8' },
      cap: (face) => {
        const { ctx } = face;
        const reflector = ctx.createRadialGradient(0.08, 0.1, 0.02, 0, 0, 0.36);
        reflector.addColorStop(0, face.ink('#ffffff', 'chrome', 0.6));
        reflector.addColorStop(0.6, face.ink('#b8c0c8', 'chrome'));
        reflector.addColorStop(1, face.ink('#5c646c', 'chrome', -0.6));
        ctx.fillStyle = reflector;
        ctx.beginPath();
        ctx.arc(0, 0, 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = face.ink('#e9edf1', 'chrome', 0.5);
        ctx.lineWidth = 0.06;
        ctx.stroke();
      },
    }),
    // The stalk from the grille shell.
    cylinder([64.62, 4.6, 2.05 * sideOf], Z, 0.07, 0.86, CHROME),
  ];
}

function turnLamp(sideOf: 1 | -1): Cylinder {
  return cylinder([64.22, 4.45, 3.35 * sideOf], X, 0.17, 0.3, CHROME, { capMaterial: AMBER_LENS });
}

function airCleaner(sideOf: 1 | -1): Part[] {
  const z = 2.62 * sideOf;
  return [
    cylinder([58.75, 5.65, z], Y, 0.55, 2.3, POLISHED, {
      cap: (face) => {
        // The rain cap on top, domed.
        const { ctx } = face;
        const dome = ctx.createRadialGradient(-0.12, 0.12, 0.02, 0, 0, 0.55);
        dome.addColorStop(0, face.ink('#ffffff', 'chrome', 0.8));
        dome.addColorStop(1, face.ink('#8e969e', 'chrome'));
        ctx.fillStyle = dome;
        ctx.beginPath();
        ctx.arc(0, 0, 0.53, 0, Math.PI * 2);
        ctx.fill();
      },
    }),
    cylinder([58.75, 5.1, z], Y, 0.57, 0.12, DARK),
    cylinder([58.75, 6.2, z], Y, 0.57, 0.12, DARK),
    side(
      roundedRect(58.4, 4.22, 59.1, 4.52, 0.05),
      sideOf > 0 ? 2.05 : -3.1,
      sideOf > 0 ? 3.1 : -2.05,
      DARK,
      { bevel: 0.04 },
    ),
  ];
}

// ——— The cab ———

/** The A-pillar line: x of the windscreen's edge at height y. */
const pillar = (y: number) => COWL - (y - 6.45) * RAKE;

function cab(model: RigModel, paint: Material, lights: RigLights): Prism {
  const shape = outline(RIG.cabBack, 3.95)
    .line(COWL, 3.95)
    .line(COWL, 6.45)
    .label('windscreen')
    .line(pillar(8.95), 8.95)
    .label(undefined)
    .corner(pillar(9.35) - 0.12, 9.35, 0.3)
    .corner(RIG.cabBack, 9.35, 0.42)
    .close();
  const painter: FacePainter = (face) => cabSide(face, model, lights);
  return side(shape, -3.45, 3.45, paint, {
    bevel: 0.3,
    sweeps: { windscreen: GLASS },
    faceTo: painter,
    faceFrom: painter,
  });
}

function cabSide(face: FaceDraw, model: RigModel, lights: RigLights) {
  const { ctx } = face;
  const body = model.paint.body;
  stripe(face, model, RIG.cabBack, COWL);
  // The door: its back edge, its top, and its front edge following the pillar.
  const door = new Path2D();
  door.moveTo(54.02, 4.12);
  door.lineTo(54.02, 9.02);
  door.lineTo(pillar(9.02) - 0.3, 9.02);
  door.lineTo(pillar(6.45) - 0.3, 6.45);
  door.lineTo(pillar(6.45) - 0.3, 4.12);
  door.closePath();
  seam(face, door, body);
  const window = pane(
    [
      [54.38, 6.95],
      [pillar(6.95) - 0.5, 6.95],
      [pillar(8.78) - 0.5, 8.78],
      [54.38, 8.78],
    ],
    0.16,
  );
  glassPane(face, window, (inside) => cabInterior(inside, lights.driver), lights.cab);
  // The vent wing's post, near the front of the door glass.
  ctx.fillStyle = face.ink('#d7dbe0', 'chrome', 0.2);
  ctx.beginPath();
  ctx.moveTo(pillar(6.95) - 1.0, 6.95);
  ctx.lineTo(pillar(6.95) - 0.92, 6.95);
  ctx.lineTo(pillar(8.78) - 0.92, 8.78);
  ctx.lineTo(pillar(8.78) - 1.0, 8.78);
  ctx.closePath();
  ctx.fill();
  // Handle and lock.
  ctx.fillStyle = face.ink('#e8ebee', 'chrome', 0.4);
  ctx.beginPath();
  ctx.roundRect(54.5, 6.5, 0.55, 0.13, 0.05);
  ctx.fill();
  lettering(face, 'LONG HAUL', 55.75, 6.25, {
    size: 0.44,
    colour: face.ink(model.paint.trim),
    weight: 800,
    slant: 0.2,
    shadow: face.ink('#000000', 'paint', -0.4),
  });
  lettering(face, 'FREIGHT LINES', 55.75, 5.88, {
    size: 0.17,
    colour: face.ink(model.paint.trim),
    spacing: 0.05,
  });
  lettering(face, 'ICC MC 19821', 55.75, 4.55, {
    size: 0.15,
    colour: face.ink(model.paint.trim),
    weight: 600,
  });
  // An aluminium cab is riveted along its edges.
  rivets(face, [53.68, 4.2], [53.68, 9.05], 0.32, body);
  rivets(face, [53.9, 9.18], [pillar(9.18) - 0.4, 9.18], 0.32, body);
  grime(
    face,
    model.dirt * 0.8,
    { left: RIG.cabBack, right: COWL, bottom: 3.95, height: 0.9 },
    [],
    11,
  );
}

/** The driver behind the glass: head, cap, shoulder and the big wheel, darker than the room. */
function cabInterior(face: FaceDraw, driver: boolean) {
  const { ctx } = face;
  ctx.fillStyle = face.ink('#2c3238', 'metal');
  ctx.beginPath();
  ctx.roundRect(54.5, 6.5, 1.2, 1.9, 0.3);
  ctx.fill();
  if (!driver) return;
  ctx.fillStyle = face.ink('#0d1013', 'metal');
  ctx.beginPath();
  ctx.ellipse(55.55, 8.05, 0.3, 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  // A cap with its peak forward, and the shoulders under it.
  ctx.beginPath();
  ctx.ellipse(55.55, 8.36, 0.33, 0.14, 0, Math.PI, Math.PI * 2);
  ctx.rect(55.6, 8.3, 0.42, 0.06);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(54.85, 6.9);
  ctx.quadraticCurveTo(54.95, 7.7, 55.55, 7.68);
  ctx.quadraticCurveTo(56.15, 7.7, 56.3, 6.9);
  ctx.fill();
  ctx.strokeStyle = face.ink('#07080a', 'metal');
  ctx.lineWidth = 0.13;
  ctx.beginPath();
  ctx.moveTo(56.25, 7.15);
  ctx.lineTo(56.75, 7.95);
  ctx.stroke();
}

function visor(paint: Material): Prism {
  return side(
    outline(pillar(9.0) - 0.2, 9.04)
      .line(58.1, 9.18)
      .line(58.1, 9.36)
      .line(pillar(9.4) - 0.3, 9.44)
      .close(),
    -3.3,
    3.3,
    paint,
    { bevel: 0.06 },
  );
}

const VISOR_LAMPS = [-1.6, -0.8, 0, 0.8, 1.6];

function visorLamps(): Part[] {
  return VISOR_LAMPS.map((z) =>
    cylinder([58.06, 9.28, z], X, 0.1, 0.12, CHROME, { capMaterial: AMBER_LENS }),
  );
}

function sleeperBox(model: RigModel, paint: Material, lights: RigLights): Prism {
  const { back, roof } = sleeperOf(model);
  const painter: FacePainter = (face) => {
    const { ctx } = face;
    stripe(face, model, back, 53.2);
    const tall = model.sleeper === 'sleeper-cab';
    const window = tall
      ? pane(
          [
            [back + 0.7, 8.1],
            [back + 2.6, 8.1],
            [back + 2.6, 9.15],
            [back + 0.7, 9.15],
          ],
          0.25,
        )
      : pane(
          [
            [back + 0.6, 7.75],
            [back + 1.75, 7.75],
            [back + 1.75, 8.45],
            [back + 0.6, 8.45],
          ],
          0.2,
        );
    glassPane(face, window, undefined, lights.bunk ? 1 : lights.cab * 0.4);
    // A louvred vent low on the box, and its rivets.
    if (face.pixels > 3) {
      ctx.fillStyle = face.ink('#121315', 'metal');
      for (let slot = 0; slot < 5; slot++) ctx.fillRect(back + 0.55, 4.45 + slot * 0.2, 1.1, 0.08);
    }
    rivets(face, [back + 0.18, 4.0], [back + 0.18, roof - 0.25], 0.32, model.paint.body);
    rivets(face, [back + 0.3, roof - 0.15], [53.0, roof - 0.15], 0.32, model.paint.body);
    if (tall)
      lettering(face, 'LONG HAUL', back + 2.3, 6.4, {
        size: 0.34,
        colour: face.ink(model.paint.trim),
        weight: 800,
        slant: 0.2,
      });
    grime(face, model.dirt, { left: back, right: 53.2, bottom: 3.8, height: 1 }, [], 13);
  };
  return side(
    outline(back, 3.8).line(53.2, 3.8).corner(53.2, roof, 0.35).corner(back, roof, 0.5).close(),
    -3.45,
    3.45,
    paint,
    { bevel: 0.3, faceTo: painter, faceFrom: painter },
  );
}

/** The company stripe, at the same height along hood, cab and sleeper. */
function stripe(face: FaceDraw, model: RigModel, left: number, right: number) {
  const { ctx } = face;
  ctx.fillStyle = face.ink(model.paint.stripe);
  ctx.fillRect(left, BELT, right - left, 0.26);
  ctx.fillStyle = face.ink(model.paint.trim);
  ctx.fillRect(left, BELT - 0.17, right - left, 0.06);
}

// ——— Under the cab ———

function steps(model: RigModel, sideOf: 1 | -1): Prism {
  const painter: FacePainter = (face) => {
    const { ctx } = face;
    for (const tread of [2.18, 3.28]) {
      const plate = ctx.createLinearGradient(0, tread, 0, tread + 0.32);
      plate.addColorStop(0, face.ink('#9aa2aa', 'chrome', -0.3));
      plate.addColorStop(0.5, face.ink('#f4f6f8', 'chrome', 0.3));
      plate.addColorStop(1, face.ink('#7b838b', 'chrome', 0.5));
      ctx.fillStyle = plate;
      ctx.fillRect(53.9, tread, 3.5, 0.32);
    }
    grime(face, model.dirt, { left: 53.85, right: 57.5, bottom: 1.75, height: 0.8 }, [], 17);
  };
  const [from, to] = sideOf > 0 ? [2.4, 3.52] : [-3.52, -2.4];
  return side(roundedRect(53.85, 1.75, 57.45, 3.85, 0.12), from, to, FRAME, {
    bevel: 0.08,
    faceTo: sideOf > 0 ? painter : undefined,
    faceFrom: sideOf < 0 ? painter : undefined,
  });
}

function fuelTank(model: RigModel, sideOf: 1 | -1): Part[] {
  const front = 53.15;
  const back = model.tanks === 'long' ? 47.4 : 49.3;
  const centre = (front + back) / 2;
  const z = 2.42 * sideOf;
  return [
    cylinder([centre, 2.78, z], X, 1.05, front - back, POLISHED),
    cylinder([back + 0.55, 2.78, z], X, 1.085, 0.22, FRAME),
    cylinder([front - 0.55, 2.78, z], X, 1.085, 0.22, FRAME),
    cylinder([front - 1.1, 3.86, z + 0.3 * sideOf], Y, 0.2, 0.14, CHROME),
  ];
}

function frameAndCoupling(sleeperBack: number): Part[] {
  const rail = (sideOf: 1 | -1) =>
    side(
      roundedRect(36.3, 2.88, 64.72, 3.65, 0.06),
      sideOf > 0 ? 1.3 : -1.62,
      sideOf > 0 ? 1.62 : -1.3,
      FRAME,
      {
        bevel: 0.04,
      },
    );
  return [
    ...pair(rail),
    side(roundedRect(36.25, 2.92, 36.6, 3.6, 0.04), -1.62, 1.62, FRAME, { bevel: 0.04 }),
    side(
      polygon([
        [40.5, 3.65],
        [43.5, 3.65],
        [43.5, 3.95],
        [42.8, 4.08],
        [40.7, 4.08],
        [40.4, 3.85],
      ]),
      -1.8,
      1.8,
      DARK,
      { bevel: 0.05 },
    ),
    // The deck plate between the sleeper and the trailer.
    side(
      roundedRect(46.9, 3.65, sleeperBack, 3.86, 0.03),
      -1.8,
      1.8,
      { kind: 'metal', colour: '#555a61' },
      { bevel: 0.03 },
    ),
  ];
}

function mudFlap(sideOf: 1 | -1): Part[] {
  const inner = sideOf > 0 ? 2.1 : -3.95;
  return [
    {
      kind: 'panel',
      shape: roundedRect(0, 0, 1.85, 2.85, 0.05),
      frame: { origin: [36.72, 0.62, inner], u: Z, v: Y },
      material: RUBBER,
      face: (face) => {
        const { ctx } = face;
        const bar = ctx.createLinearGradient(0, 0.08, 0, 0.32);
        bar.addColorStop(0, face.ink('#f0f2f4', 'chrome', 0.5));
        bar.addColorStop(1, face.ink('#7b838b', 'chrome', -0.5));
        ctx.fillStyle = bar;
        ctx.fillRect(0.05, 0.08, 1.75, 0.24);
      },
    },
    cylinder([36.78, 3.5, 3.0 * sideOf], Z, 0.06, 1.9, CHROME),
  ];
}

function stack(sideOf: 1 | -1): Part[] {
  const x = 53.36;
  const z = 3.78 * sideOf;
  return [
    cylinder([x, 8.65, z], Y, 0.26, 8.7, CHROME),
    // A slotted heat shield where a hand might touch it, and the clamps that hold it.
    cylinder(
      [x, 7.1, z],
      Y,
      0.32,
      3.0,
      { kind: 'chrome', colour: '#c4cad0' },
      {
        bandMarks: { count: 22, phase: 0, colour: 'rgba(20, 22, 26, 0.55)' },
      },
    ),
    cylinder([x, 9.25, z], Y, 0.3, 0.12, FRAME),
    cylinder([x, 11.6, z], Y, 0.3, 0.12, FRAME),
    cylinder([x, 12.88, z], Y, 0.3, 0.3, CHROME, {
      cap: (face) => {
        const { ctx } = face;
        ctx.fillStyle = face.ink('#0a0a0b', 'metal');
        ctx.beginPath();
        ctx.arc(0, 0, 0.24, 0, Math.PI * 2);
        ctx.fill();
      },
    }),
    side(
      roundedRect(53.25, 8.95, 53.5, 9.15, 0.03),
      sideOf > 0 ? 3.3 : -3.6,
      sideOf > 0 ? 3.6 : -3.3,
      FRAME,
      { bevel: 0.02 },
    ),
  ];
}

function airHorns(): Part[] {
  const horn = (x: number, length: number, z: number): Part[] => [
    cylinder([x - length / 2, 9.56, z], X, 0.08, length, CHROME),
    cylinder([x, 9.56, z], X, 0.2, 0.16, CHROME, {
      cap: (face) => {
        face.ctx.fillStyle = face.ink('#141518', 'metal');
        face.ctx.beginPath();
        face.ctx.arc(0, 0, 0.14, 0, Math.PI * 2);
        face.ctx.fill();
      },
    }),
  ];
  return [
    ...horn(56.1, 1.7, 0.7),
    ...horn(55.7, 1.2, 1.15),
    side(roundedRect(54.3, 9.35, 55.2, 9.5, 0.03), 0.5, 1.35, FRAME, { bevel: 0.02 }),
  ];
}

function mirror(sideOf: 1 | -1): Part[] {
  const [inner, outer] = sideOf > 0 ? [4.18, 4.74] : [-4.74, -4.18];
  return [
    side(roundedRect(57.48, 6.78, 57.84, 8.26, 0.09), inner, outer, CHROME, { bevel: 0.07 }),
    {
      kind: 'panel',
      shape: roundedRect(0.03, 0.05, 0.53, 1.43, 0.05),
      frame: { origin: [57.47, 6.78, inner], u: Z, v: Y },
      material: { kind: 'glass', colour: '#0f1316' },
    },
    cylinder([57.66, 6.98, 3.9 * sideOf], Z, 0.045, 0.85, CHROME),
    cylinder([57.66, 8.04, 3.9 * sideOf], Z, 0.045, 0.85, CHROME),
    // The round convex mirror under it, for the blind spot.
    cylinder([57.6, 6.38, 4.42 * sideOf], X, 0.21, 0.12, CHROME, {
      capMaterial: { kind: 'glass', colour: '#11161a' },
    }),
  ];
}

function grabHandle(sideOf: 1 | -1): Cylinder {
  return cylinder([53.66, 6.1, 3.53 * sideOf], Y, 0.045, 2.8, CHROME);
}

/** The CB aerial on the right mirror, bending back in the wind. */
function cbWhip(sway: number): Part {
  const base: Vec3 = [57.66, 8.3, 4.46];
  return {
    kind: 'custom',
    centre: base,
    draw(ctx, camera, env) {
      const bend = sway === 0 ? 1.2 : 1.6 + Math.sin(sway * 5.3) * 0.25;
      const a = camera.project(base);
      const c = camera.project([base[0] - bend * 0.2, 11, base[2]]);
      const b = camera.project([base[0] - bend, 12.6, base[2]]);
      ctx.strokeStyle = css(litRgb('#2b2d31', env.lighting));
      ctx.lineWidth = Math.max(0.6, 0.06 * camera.pixelsAt(base));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();
    },
  };
}

/** Brake lines and the lighting cable, sagging across to the trailer. */
function airLines(sleeperBack: number): Part {
  const lines: [string, Vec3, Vec3, number][] = [
    ['#c8312a', [sleeperBack - 0.05, 7.4, 0.55], [45.02, 5.6, 0.75], 1.4],
    ['#2a5fb0', [sleeperBack - 0.05, 7.2, 0.25], [45.02, 5.6, 0.35], 1.6],
    ['#1a1b1d', [sleeperBack - 0.05, 7.6, -0.2], [45.02, 6.0, -0.3], 1.0],
  ];
  return {
    kind: 'custom',
    centre: [(sleeperBack + 45) / 2, 6.5, 0],
    draw(ctx, camera, env) {
      ctx.lineWidth = Math.max(0.6, 0.09 * camera.pixelsAt([47, 6.5, 0]));
      for (const [colour, from, to, sag] of lines) {
        const mid: Vec3 = [
          (from[0] + to[0]) / 2,
          Math.min(from[1], to[1]) - sag,
          (from[2] + to[2]) / 2,
        ];
        const a = camera.project(from);
        const m = camera.project(mid);
        const b = camera.project(to);
        ctx.strokeStyle = css(litRgb(colour, env.lighting));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(m.x, m.y, b.x, b.y);
        ctx.stroke();
      }
    },
  };
}
