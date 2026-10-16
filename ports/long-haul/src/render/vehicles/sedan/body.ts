import { css, litRgb } from '../../colour';
import { glassPane, grime, lettering, pane, seam } from '../detail';
import { outline, roundedRect, X, Y, Z, type Outline, type Vec3 } from '../geometry';
import { lampOn, type Lamp } from '../lamps';
import type { Material } from '../light';
import type { Cylinder, FaceDraw, FacePainter, Part, Prism } from '../parts';
import { wheelPart } from '../wheels';
import { SEDAN, type SedanLights, type SedanModel } from './model';

/**
 * The sedan's parts: a long body with its wheel arches cut out, a narrower
 * glasshouse with a formal roof, chrome bumpers, a grille between quad
 * headlamps, and on the cruiser a push bar, spotlights on both pillars, a
 * whip aerial and the light bar. The black-and-white puts white doors and a
 * white roof over a black car, with an invented shield on the front doors.
 */
const CHROME: Material = { kind: 'chrome', colour: '#dfe3e7' };
const BLACK_STEEL: Material = { kind: 'metal', colour: '#1a1b1e' };
const GLASS: Material = { kind: 'glass', colour: '#1a2026' };
const WHITE = '#f1f1ec';
const BELT = 3.3;
const ROOF = 4.66;
const GLASSHOUSE = 2.78;
const DOORS = { rear: 5.6, middle: 8.05, front: 11.05 };

/** The windshield's lean: x of its edge at height y. */
const windshield = (y: number) => 11.48 - ((y - 3.32) / (4.62 - 3.32)) * 1.88;
/** The back window's lean. */
const backlight = (y: number) => 4.05 + ((y - 3.28) / (4.58 - 3.28)) * 1.45;

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
    bevel: 0.15,
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

export interface SedanState {
  lights: SedanLights;
  turn: number;
  steer: number;
  /** Seconds, for the aerial's sway; 0 keeps it still. */
  sway: number;
  /** The front door on the car's right, 0 shut … 1 swung open. */
  door?: number;
}

export function sedanBody(model: SedanModel, state: SedanState): Part[] {
  const patrol = model.kind === 'patrol';
  const paint: Material = { kind: 'paint', colour: model.paint, gloss: patrol ? 0.7 : 0.55 };
  const roof: Material = { kind: 'paint', colour: patrol ? WHITE : model.paint };
  const parts: Part[] = [
    ...lowerBody(model, paint),
    glasshouse(model, roof, state.lights),
    frontFace(),
    rearFace(model),
    side(roundedRect(17.12, 1.0, 17.64, 1.74, 0.13), -3.02, 3.02, CHROME, { bevel: 0.18 }),
    side(roundedRect(-0.06, 1.0, 0.42, 1.7, 0.13), -3.02, 3.02, CHROME, { bevel: 0.18 }),
  ];
  if (patrol)
    parts.push(
      ...pushBar(),
      ...[1, -1].flatMap((sideOf) => spotlight(sideOf as 1 | -1)),
      ...lightBar(),
      whip(state.sway),
    );
  parts.push(mirror());
  if (state.door) parts.push(...openDoor(model, state.door));
  return parts;
}

/**
 * The right-hand front door swung out on its front hinge: the dark of the
 * car's inside where it was, the door itself angled towards the camera.
 */
function openDoor(model: SedanModel, amount: number): Part[] {
  const inside: Material = { kind: 'plastic', colour: '#141518' };
  const hinge = DOORS.front;
  const angle = amount * 1.1;
  const width = DOORS.front - DOORS.middle;
  const out: Vec3 = [-Math.cos(angle), 0, Math.sin(angle)];
  const window = (y: number) => hinge - (windshield(y) - 0.28);
  return [
    {
      kind: 'panel',
      shape: roundedRect(DOORS.middle + 0.04, 1.04, DOORS.front - 0.04, BELT + 0.06, 0.06),
      frame: { origin: [0, 0, SEDAN.halfWidth + 0.03], u: X, v: Y },
      material: inside,
      bias: 1,
    },
    {
      kind: 'panel',
      shape: outline(DOORS.middle + 0.12, 3.42)
        .line(windshield(3.42) - 0.28, 3.42)
        .line(windshield(4.48) - 0.28, 4.48)
        .line(DOORS.middle + 0.12, 4.48)
        .close(),
      frame: { origin: [0, 0, GLASSHOUSE + 0.03], u: X, v: Y },
      material: inside,
      bias: 3.2,
    },
    {
      kind: 'panel',
      shape: roundedRect(0.04, 1.04, width - 0.04, BELT + 0.06, 0.08),
      frame: { origin: [hinge, 0, SEDAN.halfWidth], u: out, v: Y },
      material: {
        kind: 'paint',
        colour: model.kind === 'patrol' ? WHITE : model.paint,
        gloss: 0.6,
      },
      bias: 6,
      face: (face) => {
        if (model.kind !== 'patrol') return;
        face.ctx.fillStyle = face.ink('#c9a24a', 'paint', 0.2);
        face.ctx.beginPath();
        face.ctx.ellipse(hinge - 9.55, 2.45, 0.38, 0.52, 0, 0, Math.PI * 2);
        face.ctx.fill();
      },
    },
    {
      kind: 'panel',
      shape: outline(0, BELT + 0.06)
        .line(width - 0.12, BELT + 0.06)
        .line(width - 0.12, 4.48)
        .line(window(4.48), 4.48)
        .close(),
      frame: { origin: [hinge, 0, SEDAN.halfWidth - 0.2], u: out, v: Y },
      material: GLASS,
      bias: 6.1,
    },
  ];
}

export function sedanWheels(model: SedanModel, state: SedanState): Part[] {
  const r = SEDAN.tyreRadius;
  const rim = model.kind === 'patrol' ? 'patrol' : 'cover';
  const wheels: Part[] = [];
  for (const sideOf of [1, -1] as const) {
    wheels.push(
      wheelPart(
        {
          centre: [SEDAN.frontAxle, r, SEDAN.track * sideOf],
          radius: r,
          width: 0.72,
          rim,
          side: sideOf,
          steer: state.steer,
        },
        state.turn,
        model.dirt,
      ),
      wheelPart(
        {
          centre: [SEDAN.rearAxle, r, SEDAN.track * sideOf],
          radius: r,
          width: 0.72,
          rim,
          side: sideOf,
        },
        state.turn,
        model.dirt,
      ),
    );
  }
  return wheels;
}

export function sedanLamps(model: SedanModel): Lamp[] {
  const lamps: Lamp[] = [];
  const back: Vec3 = [-1, 0, 0];
  for (const sideOf of [1, -1] as const) {
    const turn = sideOf > 0 ? 'right' : 'left';
    lamps.push(
      lampOn([17.34, 2.42, 1.95 * sideOf], X, 0.2, 'white', ['head']),
      lampOn([17.34, 2.42, 2.52 * sideOf], X, 0.2, 'white', ['head']),
      lampOn([17.62, 1.38, 2.3 * sideOf], X, 0.13, 'amber', ['marker', turn]),
      lampOn([0.16, 2.55, 2.45 * sideOf], back, 0.2, 'red', ['tail', 'brake', turn]),
      lampOn([0.16, 2.55, 1.75 * sideOf], back, 0.2, 'red', ['tail', 'brake']),
    );
  }
  if (model.kind === 'patrol') lamps.push(lampOn([11.42, 3.62, 2.98], X, 0.16, 'white', ['spot']));
  return lamps;
}

/** Where the beacons sit on the roof: red on the driver's side, blue on the other. */
export const BEACONS = { red: [7.47, 5.05, -1.65] as Vec3, blue: [7.47, 5.05, 1.65] as Vec3 };

// ——— The body ———

/**
 * The body is a narrow core between the wheel wells and an outer skin on
 * each side with the arches cut out of it, so a wheel sits inside its arch
 * from any angle: in front of the core, behind the skin's lip.
 */
const CORE = 1.95;

function bodyOutline(arches: boolean): Outline {
  const r = SEDAN.tyreRadius;
  const top = outline(0.3, 1.12)
    .line(0.16, 2.5)
    .corner(0.3, 3.14, 0.14)
    .line(3.95, 3.28)
    .line(11.45, 3.32)
    .curve(13.5, 3.33, 15.6, 3.24, 16.95, 3.1)
    .corner(17.26, 3.03, 0.1)
    .line(17.32, 1.78)
    .corner(17.18, 1.18, 0.16)
    .line(15.62, 0.84);
  if (!arches) return top.line(0.55, 0.84).close();
  return top
    .arc(SEDAN.frontAxle, r, 1.4, -0.22, Math.PI + 0.22)
    .line(5.93, 0.82)
    .arc(SEDAN.rearAxle, r, 1.4, -0.22, Math.PI + 0.22)
    .close();
}

function lowerBody(model: SedanModel, paint: Material): Prism[] {
  const painter: FacePainter = (face) => bodySide(face, model);
  const wells: FacePainter = (face) => {
    // What shows of the core through the arches is the dark of the wheel wells.
    face.ctx.fillStyle = face.ink('#0b0c0e', 'rubber');
    for (const axle of [SEDAN.frontAxle, SEDAN.rearAxle]) {
      face.ctx.beginPath();
      face.ctx.arc(axle, SEDAN.tyreRadius, 1.42, 0, Math.PI * 2);
      face.ctx.fill();
    }
  };
  return [
    side(bodyOutline(false), -CORE, CORE, paint, { bevel: 0.1, faceTo: wells, faceFrom: wells }),
    side(bodyOutline(true), CORE, SEDAN.halfWidth, paint, {
      bevel: 0.32,
      faceTo: painter,
      bias: 0.4,
    }),
    side(bodyOutline(true), -SEDAN.halfWidth, -CORE, paint, {
      bevel: 0.32,
      faceFrom: painter,
      bias: 0.4,
    }),
  ];
}

function bodySide(face: FaceDraw, model: SedanModel) {
  const { ctx } = face;
  if (model.kind === 'patrol') {
    // White doors over the black body, from the rocker to the belt.
    ctx.fillStyle = face.ink(WHITE);
    ctx.beginPath();
    ctx.moveTo(DOORS.rear, 1.02);
    ctx.lineTo(DOORS.front, 1.02);
    ctx.lineTo(DOORS.front, BELT + 0.1);
    ctx.lineTo(DOORS.rear, BELT + 0.1);
    ctx.closePath();
    ctx.fill();
  }
  // Door gaps, with the shut lines running into the glasshouse.
  const doors = new Path2D();
  for (const x of [DOORS.rear, DOORS.middle, DOORS.front]) {
    doors.moveTo(x, 1.08);
    doors.lineTo(x, BELT);
  }
  seam(face, doors, model.kind === 'patrol' ? WHITE : model.paint, 0.05);
  // A chrome strip along the flank and handles on the doors.
  const strip = ctx.createLinearGradient(0, 2.0, 0, 2.14);
  strip.addColorStop(0, face.ink('#f4f6f8', 'chrome', 0.5));
  strip.addColorStop(1, face.ink('#6e767e', 'chrome', -0.4));
  ctx.fillStyle = strip;
  ctx.fillRect(0.5, 2.0, 16.5, 0.14);
  ctx.fillStyle = face.ink('#e8ebee', 'chrome', 0.4);
  for (const x of [DOORS.middle - 0.75, DOORS.front - 0.75]) ctx.fillRect(x, 2.85, 0.45, 0.09);
  if (model.kind === 'patrol') patrolMarkings(face);
  grime(
    face,
    model.dirt,
    { left: 0.2, right: 17.3, bottom: 0.98, height: 0.9 },
    [SEDAN.rearAxle, SEDAN.frontAxle],
    41,
  );
}

/** The door shield, an invented emblem, and the car's number on the rear quarter. */
function patrolMarkings(face: FaceDraw) {
  const { ctx } = face;
  const x = 9.55;
  const y = 2.45;
  const shield = new Path2D();
  shield.moveTo(x - 0.42, y + 0.5);
  shield.quadraticCurveTo(x, y + 0.62, x + 0.42, y + 0.5);
  shield.lineTo(x + 0.4, y - 0.05);
  shield.quadraticCurveTo(x + 0.3, y - 0.42, x, y - 0.58);
  shield.quadraticCurveTo(x - 0.3, y - 0.42, x - 0.4, y - 0.05);
  shield.closePath();
  ctx.fillStyle = face.ink('#c9a24a', 'paint', 0.2);
  ctx.fill(shield);
  ctx.strokeStyle = face.ink('#1b2a4a');
  ctx.lineWidth = 0.06;
  ctx.stroke(shield);
  // A star over a road running to the horizon: nobody's badge in particular.
  ctx.fillStyle = face.ink('#1b2a4a');
  ctx.beginPath();
  for (let point = 0; point < 10; point++) {
    const angle = Math.PI / 2 + (point / 10) * Math.PI * 2;
    const radius = point % 2 === 0 ? 0.22 : 0.09;
    const px = x + Math.cos(angle) * radius;
    const py = y + 0.18 + Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 0.22, y - 0.38);
  ctx.lineTo(x - 0.03, y - 0.05);
  ctx.lineTo(x + 0.03, y - 0.05);
  ctx.lineTo(x + 0.22, y - 0.38);
  ctx.closePath();
  ctx.fill();
  lettering(face, 'INTERSTATE PATROL', 8.3, 1.55, {
    size: 0.24,
    colour: face.ink('#1b2a4a'),
    weight: 800,
    spacing: 0.02,
  });
  lettering(face, '17', 2.4, 2.55, { size: 0.42, colour: face.ink(WHITE), weight: 800 });
}

function glasshouse(model: SedanModel, roof: Material, lights: SedanLights): Prism {
  const shape = outline(3.95, 3.27)
    .label('backlight')
    .line(backlight(4.58), 4.58)
    .label(undefined)
    .corner(5.62, ROOF, 0.18)
    .corner(9.55, ROOF, 0.18)
    .label('windshield')
    .line(windshield(3.33), 3.33)
    .label(undefined)
    .close();
  const painter: FacePainter = (face) => sideWindows(face, model, lights);
  return side(shape, -GLASSHOUSE, GLASSHOUSE, roof, {
    bevel: 0.32,
    sweeps: { windshield: GLASS, backlight: GLASS },
    faceTo: painter,
    faceFrom: painter,
    bias: 3,
  });
}

function sideWindows(face: FaceDraw, model: SedanModel, lights: SedanLights) {
  const { ctx } = face;
  // The pillars between the windows are the roof's colour; the glass is cut into it.
  const front = pane(
    [
      [DOORS.middle + 0.12, 3.42],
      [windshield(3.42) - 0.28, 3.42],
      [windshield(4.48) - 0.28, 4.48],
      [DOORS.middle + 0.12, 4.48],
    ],
    0.12,
  );
  const rear = pane(
    [
      [backlight(3.42) + 0.75, 3.42],
      [DOORS.middle - 0.12, 3.42],
      [DOORS.middle - 0.12, 4.48],
      [backlight(4.48) + 0.35, 4.48],
    ],
    0.12,
  );
  glassPane(face, front, (inside) =>
    patrolInterior(inside, lights.driver, model.kind === 'patrol'),
  );
  glassPane(face, rear);
  ctx.fillStyle = face.ink('#0d0e10', 'rubber');
  ctx.fillRect(DOORS.middle - 0.12, 3.34, 0.24, 1.22);
}

/** Through the glass: the officer at the far-side wheel, hat and shoulders, and the cage behind. */
function patrolInterior(face: FaceDraw, driver: boolean, patrol: boolean) {
  const { ctx } = face;
  ctx.fillStyle = face.ink('#30363c', 'metal');
  ctx.beginPath();
  ctx.roundRect(8.4, 3.35, 0.7, 1.0, 0.15);
  ctx.fill();
  if (!driver) return;
  ctx.fillStyle = face.ink('#0c0e11', 'metal');
  ctx.beginPath();
  ctx.ellipse(9.35, 4.08, 0.21, 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  if (patrol) {
    // The campaign hat's broad brim and its peaked crown.
    ctx.beginPath();
    ctx.ellipse(9.35, 4.3, 0.42, 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(9.17, 4.32);
    ctx.lineTo(9.25, 4.5);
    ctx.lineTo(9.45, 4.5);
    ctx.lineTo(9.53, 4.32);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(8.85, 3.4);
  ctx.quadraticCurveTo(8.9, 3.85, 9.35, 3.85);
  ctx.quadraticCurveTo(9.8, 3.85, 9.85, 3.4);
  ctx.fill();
}

/** The nose: a chrome grille between pairs of square headlamps. */
function frontFace(): Part {
  return {
    kind: 'panel',
    shape: roundedRect(-2.95, 1.78, 2.95, 3.0, 0.08),
    frame: { origin: [17.33, 0, 0], u: [0, 0, -1], v: Y },
    material: { kind: 'metal', colour: '#1a1b1e' },
    face: (face) => {
      const { ctx } = face;
      ctx.fillStyle = face.ink('#cfd4d9', 'chrome', 0.2);
      ctx.fillRect(-1.3, 1.95, 2.6, 0.95);
      ctx.fillStyle = face.ink('#121315', 'metal');
      for (let row = 0; row < 3; row++)
        for (let column = 0; column < 8; column++)
          ctx.fillRect(-1.22 + column * 0.31, 2.02 + row * 0.29, 0.25, 0.22);
      for (const u of [-2.52, -1.95, 1.95, 2.52]) {
        ctx.fillStyle = face.ink('#dfe3e7', 'chrome', 0.3);
        ctx.fillRect(u - 0.26, 2.15, 0.52, 0.55);
        const lens = ctx.createLinearGradient(0, 2.2, 0, 2.65);
        lens.addColorStop(0, face.ink('#cfd6db', 'chrome', -0.3));
        lens.addColorStop(0.5, face.ink('#f5f7f8', 'chrome', 0.2));
        lens.addColorStop(1, face.ink('#8d969e', 'chrome', 0.5));
        ctx.fillStyle = lens;
        ctx.fillRect(u - 0.21, 2.2, 0.42, 0.45);
      }
    },
  };
}

function rearFace(model: SedanModel): Part {
  return {
    kind: 'panel',
    shape: roundedRect(-2.95, 1.7, 2.95, 3.06, 0.08),
    frame: { origin: [0.15, 0, 0], u: Z, v: Y },
    material: { kind: 'paint', colour: model.paint },
    face: (face) => {
      const { ctx } = face;
      for (const u of [-2.45, 2.45]) {
        ctx.fillStyle = face.ink('#8f2a24', 'lens');
        ctx.fillRect(u - 0.48, 2.3, 0.96, 0.5);
      }
      ctx.fillStyle = face.ink('#f2efe2');
      ctx.fillRect(-0.55, 1.85, 1.1, 0.45);
      lettering(face, model.kind === 'patrol' ? 'STATE 017' : 'TRK 4417', 0, 2.07, {
        size: 0.2,
        colour: face.ink('#1e3a6e'),
        weight: 700,
      });
      if (model.kind === 'patrol')
        lettering(face, 'PATROL', 0, 2.68, {
          size: 0.32,
          colour: face.ink(WHITE),
          weight: 800,
          spacing: 0.04,
        });
    },
  };
}

// ——— The cruiser's equipment ———

function pushBar(): Part[] {
  const upright = (z: number) =>
    side(roundedRect(17.66, 0.95, 17.86, 2.95, 0.06), z - 0.09, z + 0.09, BLACK_STEEL, {
      bevel: 0.04,
    });
  return [
    upright(1.15),
    upright(-1.15),
    side(roundedRect(17.64, 1.6, 17.88, 1.78, 0.04), -1.28, 1.28, BLACK_STEEL, { bevel: 0.03 }),
    side(roundedRect(17.64, 2.66, 17.88, 2.84, 0.04), -1.28, 1.28, BLACK_STEEL, { bevel: 0.03 }),
  ];
}

function spotlight(sideOf: 1 | -1): Part[] {
  return [
    cylinder([11.25, 3.62, 2.98 * sideOf], X, 0.19, 0.4, CHROME, {
      capMaterial: { kind: 'glass', colour: '#cdd5da' },
    }),
    cylinder([11.25, 3.42, 2.98 * sideOf], Y, 0.04, 0.3, CHROME),
  ];
}

function lightBar(): Part[] {
  const dome = (at: Vec3, colour: string): Cylinder =>
    cylinder(
      at,
      Y,
      0.3,
      0.42,
      { kind: 'lens', colour },
      {
        cap: (face) => {
          const { ctx } = face;
          const top = ctx.createRadialGradient(-0.1, 0.1, 0.02, 0, 0, 0.3);
          top.addColorStop(0, face.ink('#ffffff', 'lens', 0.5));
          top.addColorStop(1, face.ink(colour, 'lens'));
          ctx.fillStyle = top;
          ctx.beginPath();
          ctx.arc(0, 0, 0.3, 0, Math.PI * 2);
          ctx.fill();
        },
      },
    );
  return [
    side(roundedRect(6.98, ROOF, 7.96, ROOF + 0.18, 0.05), -2.38, 2.38, BLACK_STEEL, {
      bevel: 0.05,
      bias: 4,
    }),
    side(roundedRect(7.12, ROOF + 0.18, 7.82, ROOF + 0.4, 0.06), -0.62, 0.62, CHROME, {
      bevel: 0.06,
      bias: 4,
    }),
    { ...dome(BEACONS.red, '#a8231c'), bias: 4 },
    { ...dome(BEACONS.blue, '#2342a8'), bias: 4 },
  ];
}

function mirror(): Part {
  return side(roundedRect(10.75, 3.38, 11.15, 3.7, 0.08), -3.6, -3.2, CHROME, { bevel: 0.06 });
}

/** The whip aerial on the boot, bowing back. */
function whip(sway: number): Part {
  const base: Vec3 = [1.1, 3.22, 1.9];
  return {
    kind: 'custom',
    centre: base,
    draw(ctx, camera, env) {
      const bend = sway === 0 ? 0.6 : 0.9 + Math.sin(sway * 6.1) * 0.2;
      const a = camera.project(base);
      const c = camera.project([base[0] - bend * 0.3, 5.4, base[2]]);
      const b = camera.project([base[0] - bend, 7.0, base[2]]);
      ctx.strokeStyle = css(litRgb('#2b2d31', env.lighting));
      ctx.lineWidth = Math.max(0.5, 0.04 * camera.pixelsAt(base));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      ctx.stroke();
    },
  };
}
