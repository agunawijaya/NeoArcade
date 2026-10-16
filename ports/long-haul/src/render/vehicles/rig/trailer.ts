import { css, litRgb } from '../../colour';
import { grime, lettering, rivets } from '../detail';
import { outline, roundedRect, X, Y, Z, type Outline, type Vec3 } from '../geometry';
import { lampOn, type Lamp } from '../lamps';
import type { Material } from '../light';
import type { Cylinder, FaceDraw, FacePainter, Part, Prism } from '../parts';
import { wheelPart } from '../wheels';
import { refrigerated, RIG, type RigModel } from './model';

/**
 * The trailer: a 45-foot box of riveted aluminium on a sliding tandem, with
 * landing gear cranked up for the road, swing doors with lock rods at the
 * back, an underride bar, and on a refrigerated load the reefer unit on its
 * nose. The lettering is the company's own, "LONG HAUL Freight Lines", with
 * a citrus crate for oranges and the mail's red and blue for the post.
 */
const ALUMINIUM: Material = { kind: 'aluminium', colour: '#eef0ef' };
const RAIL: Material = { kind: 'aluminium', colour: '#c4c9ce' };
const CHASSIS: Material = { kind: 'metal', colour: '#2a2c30' };
const RUBBER: Material = { kind: 'rubber', colour: '#1f2023' };
const LENGTH = RIG.trailer.length;
const FLOOR = RIG.trailer.floor;
const ROOF = RIG.trailer.roof;
const HALF = RIG.trailer.halfWidth;

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
    bevel: 0.08,
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
): Cylinder {
  return { kind: 'cylinder', centre, axis, up: Y, radius, length, material };
}

export function trailerBody(model: RigModel): Part[] {
  const reefer = refrigerated(model);
  const parts: Part[] = [
    box(model),
    side(roundedRect(0, 3.92, LENGTH, 4.48, 0.05), -HALF - 0.06, HALF + 0.06, RAIL, {
      bevel: 0.06,
      faceTo: (face) => railDetail(face, model),
      faceFrom: (face) => railDetail(face, model),
    }),
    side(roundedRect(0.3, 3.82, LENGTH - 0.3, 4.0, 0.02), -HALF + 0.2, HALF - 0.2, CHASSIS, {
      bevel: 0,
    }),
    rearDoors(model),
    ...landingGear(),
    ...tandem(),
    ...underride(),
    ...[1, -1].map((sideOf) => mudFlap(sideOf as 1 | -1)).flat(),
  ];
  if (reefer) parts.push(reeferUnit(model), reeferTank());
  return parts;
}

export function trailerWheels(model: RigModel, turn: number): Part[] {
  const wheels: Part[] = [];
  const r = RIG.tyreRadius;
  for (const sideOf of [1, -1] as const)
    for (const axle of RIG.trailer.axles)
      wheels.push(
        wheelPart(
          {
            centre: [axle, r, 2.55 * sideOf],
            radius: r,
            width: 0.85,
            rim: 'steel-disc',
            side: sideOf,
            inner: true,
          },
          turn,
          model.dirt,
        ),
        wheelPart(
          {
            centre: [axle, r, 3.5 * sideOf],
            radius: r,
            width: 0.85,
            rim: 'steel-disc',
            side: sideOf,
          },
          turn,
          model.dirt,
        ),
      );
  return wheels;
}

export function trailerLamps(): Lamp[] {
  const back: Vec3 = [-1, 0, 0];
  const lamps: Lamp[] = [];
  for (const sideOf of [1, -1] as const) {
    const out: Vec3 = [0, 0, sideOf];
    const turn = sideOf > 0 ? 'right' : 'left';
    lamps.push(
      lampOn([-0.04, 4.42, 3.2 * sideOf], back, 0.17, 'red', ['tail', 'brake', turn]),
      lampOn([-0.04, 4.42, 2.6 * sideOf], back, 0.17, 'red', ['tail', 'brake']),
      lampOn([-0.04, 13.2, 3.72 * sideOf], back, 0.08, 'red', ['marker']),
      lampOn([0.55, 4.72, HALF * sideOf], out, 0.1, 'red', ['marker']),
      lampOn([22.5, 4.72, HALF * sideOf], out, 0.1, 'amber', ['marker']),
      lampOn([44.3, 4.72, HALF * sideOf], out, 0.1, 'amber', ['marker']),
      lampOn([45.02, 13.18, 3.85 * sideOf], X, 0.08, 'amber', ['marker']),
    );
  }
  for (const z of [-0.5, 0, 0.5])
    lamps.push(lampOn([-0.04, 13.2, z], back, 0.08, 'red', ['marker']));
  return lamps;
}

// ——— The box and its livery ———

function box(model: RigModel): Prism {
  const painter: FacePainter = (face) => boxSide(face, model);
  return side(
    outline(0, FLOOR).line(LENGTH, FLOOR).corner(LENGTH, ROOF, 0.55).corner(0, ROOF, 0.14).close(),
    -HALF,
    HALF,
    ALUMINIUM,
    { bevel: 0.16, faceTo: painter, faceFrom: painter },
  );
}

function boxSide(face: FaceDraw, model: RigModel) {
  const { ctx } = face;
  // The extruded top rail and the corner posts, a shade darker than the skin.
  ctx.fillStyle = face.ink('#d5d9dd', 'aluminium', 0.5);
  ctx.fillRect(0, ROOF - 0.42, LENGTH, 0.42);
  ctx.fillStyle = face.ink('#ffffff', 'aluminium', 1);
  ctx.fillRect(0, ROOF - 0.44, LENGTH, 0.05);
  ctx.fillStyle = face.ink('#d0d4d8', 'aluminium');
  ctx.fillRect(0, FLOOR, 0.36, ROOF - FLOOR);
  ctx.fillRect(LENGTH - 0.36, FLOOR, 0.36, ROOF - FLOOR);
  // Sheets riveted to the posts every three feet nine.
  for (let post = 1; post < 12; post++) {
    const x = post * (LENGTH / 12);
    rivets(face, [x, FLOOR + 0.45], [x, ROOF - 0.55], 0.36, '#eef0ef');
  }
  rivets(face, [0.4, ROOF - 0.22], [LENGTH - 0.4, ROOF - 0.22], 0.36, '#eef0ef');

  if (model.cargo === 'mail') mailLivery(face, model);
  else companyLivery(face, model);
  if (model.cargo === 'oranges') citrusCrate(face);

  // Side marker lenses; they light up as lamps after dark.
  for (const [x, colour] of [
    [0.55, '#9e2a22'],
    [22.5, '#b9741f'],
    [44.3, '#b9741f'],
  ] as const) {
    ctx.fillStyle = face.ink(colour, 'lens');
    ctx.beginPath();
    ctx.roundRect(x - 0.13, 4.62, 0.26, 0.2, 0.05);
    ctx.fill();
  }
  grime(
    face,
    model.dirt,
    { left: 0, right: LENGTH, bottom: FLOOR, height: 1.6 },
    [...RIG.trailer.axles, ...RIG.driveAxles],
    23,
  );
}

/** The company swoosh rising towards the nose, and the name across the middle. */
function companyLivery(face: FaceDraw, model: RigModel) {
  const { ctx } = face;
  const { body, stripe, trim } = model.paint;
  const band = new Path2D();
  band.moveTo(0, 5.05);
  band.lineTo(24, 5.05);
  band.bezierCurveTo(33, 5.05, 38, 6.4, LENGTH, 9.2);
  band.lineTo(LENGTH, 11.9);
  band.bezierCurveTo(37, 8.4, 31, 6.25, 23, 6.25);
  band.lineTo(0, 6.25);
  band.closePath();
  ctx.fillStyle = face.ink(body);
  ctx.fill(band);
  const line = new Path2D();
  line.moveTo(0, 6.45);
  line.lineTo(23, 6.45);
  line.bezierCurveTo(31, 6.45, 37, 8.6, LENGTH, 12.25);
  ctx.strokeStyle = face.ink(stripe);
  ctx.lineWidth = 0.3;
  ctx.stroke(line);
  const pin = new Path2D();
  pin.moveTo(0, 4.85);
  pin.lineTo(24, 4.85);
  pin.bezierCurveTo(33.2, 4.85, 38.4, 6.2, LENGTH, 8.95);
  ctx.strokeStyle = face.ink(trim === '#e2e2de' ? '#3a3d42' : trim);
  ctx.lineWidth = 0.08;
  ctx.stroke(pin);

  lettering(face, 'LONG HAUL', 19.5, 9.75, {
    size: 2.9,
    colour: face.ink(body),
    weight: 800,
    slant: 0.22,
    stretch: 1.05,
    outline: { colour: face.ink(darker(body)), width: 0.16 },
    shadow: face.ink('#5f6469', 'aluminium', -0.4),
  });
  lettering(face, 'FREIGHT LINES', 19.5, 7.75, {
    size: 0.78,
    colour: face.ink('#3a3d42', 'paint'),
    weight: 700,
    spacing: 0.42,
  });
}

function darker(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(
    (index) => Number.parseInt(hex.slice(index, index + 2), 16) * 0.55,
  );
  return `#${[r, g, b]
    .map((value) =>
      Math.round(value ?? 0)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** A contract hauler's mail trailer: the post's colours and its name, the company small. */
function mailLivery(face: FaceDraw, model: RigModel) {
  const { ctx } = face;
  ctx.fillStyle = face.ink('#2a4f8f');
  ctx.fillRect(0, 5.2, LENGTH, 0.95);
  ctx.fillStyle = face.ink('#c8312a');
  ctx.fillRect(0, 6.35, LENGTH, 0.45);
  lettering(face, 'U.S. MAIL', 21, 9.6, {
    size: 2.7,
    colour: face.ink('#1f3a6e'),
    weight: 800,
    stretch: 1.05,
  });
  lettering(face, `LONG HAUL FREIGHT LINES · CONTRACT CARRIER`, 21, 7.6, {
    size: 0.52,
    colour: face.ink(model.paint.body),
    weight: 700,
    spacing: 0.12,
  });
}

/** Oranges in a crate label: three fruit with leaves, and what they are. */
function citrusCrate(face: FaceDraw) {
  const { ctx } = face;
  const left = 34.6;
  const bottom = 6.9;
  ctx.fillStyle = face.ink('#f6e9c8');
  ctx.beginPath();
  ctx.roundRect(left, bottom, 7.6, 3.9, 0.3);
  ctx.fill();
  ctx.strokeStyle = face.ink('#3f7a35');
  ctx.lineWidth = 0.14;
  ctx.stroke();
  for (const [x, y, r] of [
    [left + 1.6, bottom + 2.4, 0.95],
    [left + 3.15, bottom + 2.65, 1.05],
    [left + 2.35, bottom + 1.35, 0.9],
  ] as const) {
    const fruit = ctx.createRadialGradient(x - r * 0.35, y + r * 0.35, r * 0.1, x, y, r);
    fruit.addColorStop(0, face.ink('#ffc163'));
    fruit.addColorStop(1, face.ink('#e8741c'));
    ctx.fillStyle = fruit;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = face.ink('#3f8a3a');
    ctx.beginPath();
    ctx.ellipse(x + r * 0.45, y + r * 1.0, r * 0.42, r * 0.17, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  lettering(face, 'FRESH', left + 5.75, bottom + 2.75, {
    size: 0.95,
    colour: face.ink('#c9561a'),
    weight: 800,
  });
  lettering(face, 'CITRUS', left + 5.75, bottom + 1.75, {
    size: 0.95,
    colour: face.ink('#c9561a'),
    weight: 800,
  });
  lettering(face, 'REFRIGERATED', left + 3.8, bottom + 0.42, {
    size: 0.36,
    colour: face.ink('#3f7a35'),
    weight: 700,
    spacing: 0.08,
  });
}

function railDetail(face: FaceDraw, model: RigModel) {
  rivets(face, [0.3, 4.2], [LENGTH - 0.3, 4.2], 0.36, '#c4c9ce');
  grime(face, model.dirt * 1.2, { left: 0, right: LENGTH, bottom: 3.92, height: 0.56 }, [], 29);
}

// ——— The back ———

function rearDoors(model: RigModel): Part {
  return {
    kind: 'panel',
    shape: roundedRect(-HALF + 0.05, 0, HALF - 0.05, ROOF - FLOOR - 0.05, 0.12),
    frame: { origin: [-0.03, FLOOR, 0], u: Z, v: Y },
    material: ALUMINIUM,
    face: (face) => doorsDetail(face, model),
  };
}

function doorsDetail(face: FaceDraw, model: RigModel) {
  const { ctx } = face;
  const top = ROOF - FLOOR;
  // Header and sill, the posts, and the seam between the two doors.
  ctx.fillStyle = face.ink('#c9ced3', 'aluminium');
  ctx.fillRect(-HALF, top - 0.6, HALF * 2, 0.6);
  ctx.fillRect(-HALF, 0, HALF * 2, 0.55);
  ctx.fillRect(-HALF, 0, 0.42, top);
  ctx.fillRect(HALF - 0.42, 0, 0.42, top);
  ctx.fillStyle = face.ink('#4b5056', 'metal');
  ctx.fillRect(-0.03, 0.55, 0.06, top - 1.15);
  // Hinges on the outer posts.
  ctx.fillStyle = face.ink('#5a5f66', 'metal');
  for (const v of [1.3, 3.6, 5.9, 8.0])
    for (const u of [-HALF + 0.3, HALF - 0.62]) ctx.fillRect(u, v, 0.32, 0.22);
  // Four lock rods with their handles and keepers.
  for (const u of [-2.75, -0.62, 0.62, 2.75]) {
    const rod = ctx.createLinearGradient(u - 0.06, 0, u + 0.06, 0);
    rod.addColorStop(0, face.ink('#9aa2aa', 'chrome', -0.3));
    rod.addColorStop(0.5, face.ink('#f4f6f8', 'chrome', 0.4));
    rod.addColorStop(1, face.ink('#6e767e', 'chrome'));
    ctx.fillStyle = rod;
    ctx.fillRect(u - 0.06, 0.62, 0.12, top - 1.3);
    ctx.fillStyle = face.ink('#d7dbe0', 'chrome', 0.3);
    ctx.fillRect(u - 0.1, 3.05, 0.42 * Math.sign(u), 0.12);
    ctx.fillStyle = face.ink('#41464c', 'metal');
    ctx.fillRect(u - 0.12, 0.58, 0.24, 0.16);
    ctx.fillRect(u - 0.12, top - 0.78, 0.24, 0.16);
  }
  // Tail lamps on the sill and the plate between them.
  for (const u of [-3.2, -2.6, 2.6, 3.2]) {
    ctx.fillStyle = face.ink('#8f2a24', 'lens');
    ctx.beginPath();
    ctx.arc(u, 0.27, 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = face.ink('#f2efe2');
  ctx.fillRect(-1.6, 0.06, 1.0, 0.44);
  lettering(face, '45 TRL 82', -1.1, 0.28, { size: 0.2, colour: face.ink('#1e3a6e'), weight: 700 });
  lettering(face, 'LONG HAUL', 2.0, top - 1.3, {
    size: 0.38,
    colour: face.ink(model.paint.body),
    weight: 800,
    slant: 0.2,
  });
  grime(face, model.dirt * 1.2, { left: -HALF, right: HALF, bottom: 0, height: 2.2 }, [], 31);
}

function underride(): Part[] {
  return [
    side(roundedRect(0.08, 1.58, 0.42, 2.08, 0.04), -3.75, 3.75, CHASSIS, { bevel: 0.04 }),
    side(roundedRect(0.14, 2.08, 0.38, FLOOR - 0.2, 0.02), 2.35, 2.7, CHASSIS, { bevel: 0.02 }),
    side(roundedRect(0.14, 2.08, 0.38, FLOOR - 0.2, 0.02), -2.7, -2.35, CHASSIS, { bevel: 0.02 }),
  ];
}

// ——— Underneath ———

function landingGear(): Part[] {
  const leg = (sideOf: 1 | -1): Part[] => {
    const [inner, outer] = sideOf > 0 ? [3.0, 3.38] : [-3.38, -3.0];
    return [
      side(roundedRect(34.3, 1.32, 34.7, FLOOR - 0.15, 0.02), inner, outer, CHASSIS, {
        bevel: 0.03,
      }),
      side(roundedRect(33.95, 1.04, 35.05, 1.32, 0.04), inner - 0.15, outer + 0.15, CHASSIS, {
        bevel: 0.03,
      }),
    ];
  };
  return [
    ...leg(1),
    ...leg(-1),
    {
      kind: 'custom',
      centre: [34.5, 2.6, 0],
      draw(ctx, camera, env) {
        // The brace between the legs, and the crank on the right-hand one.
        const a = camera.project([34.5, 2.2, -3.0]);
        const b = camera.project([34.5, 3.6, 3.0]);
        const c = camera.project([34.5, 3.6, -3.0]);
        const d = camera.project([34.5, 2.2, 3.0]);
        ctx.strokeStyle = css(litRgb('#2a2c30', env.lighting));
        ctx.lineWidth = Math.max(0.6, 0.12 * camera.pixelsAt([34.5, 2.6, 0]));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
        const hub = camera.project([34.5, 3.55, 3.45]);
        const elbow = camera.project([34.5, 3.0, 3.75]);
        const grip = camera.project([33.9, 3.0, 3.75]);
        ctx.lineWidth = Math.max(0.6, 0.07 * camera.pixelsAt([34.5, 2.6, 0]));
        ctx.beginPath();
        ctx.moveTo(hub.x, hub.y);
        ctx.lineTo(elbow.x, elbow.y);
        ctx.lineTo(grip.x, grip.y);
        ctx.stroke();
      },
    },
  ];
}

function tandem(): Part[] {
  return [
    side(roundedRect(2.4, 3.3, 11.2, 3.9, 0.04), 1.55, 1.95, CHASSIS, { bevel: 0.03 }),
    side(roundedRect(2.4, 3.3, 11.2, 3.9, 0.04), -1.95, -1.55, CHASSIS, { bevel: 0.03 }),
    ...RIG.trailer.axles.map((axle) => cylinder([axle, RIG.tyreRadius, 0], Z, 0.22, 4.4, CHASSIS)),
  ];
}

function mudFlap(sideOf: 1 | -1): Part[] {
  const inner = sideOf > 0 ? 2.12 : -4.0;
  return [
    {
      kind: 'panel',
      shape: roundedRect(0, 0, 1.88, 3.0, 0.05),
      frame: { origin: [2.5, 0.6, inner], u: Z, v: Y },
      material: RUBBER,
    },
    cylinder([2.56, 3.62, 3.06 * sideOf], Z, 0.06, 1.9, CHASSIS),
  ];
}

// ——— The refrigeration unit ———

function reeferUnit(model: RigModel): Prism {
  const reliable = model.reefer === 'reliable';
  const colour = reliable ? '#f1f3f4' : '#ddd5bf';
  const sidePanel: FacePainter = (face) => {
    const { ctx } = face;
    ctx.fillStyle = face.ink('#202326', 'metal');
    for (let slot = 0; slot < 6; slot++) ctx.fillRect(45.45, 8.0 + slot * 0.42, 0.95, 0.16);
    ctx.fillStyle = face.ink(reliable ? '#2a5fb0' : '#7a5a2a');
    ctx.fillRect(45.1, 11.4, 1.6, 0.3);
  };
  return side(
    outline(LENGTH, 7.2)
      .line(46.5, 7.2)
      .label('front')
      .line(46.85, 12.6)
      .label(undefined)
      .line(LENGTH, 12.9)
      .close(),
    -3.05,
    3.05,
    { kind: 'paint', colour },
    {
      bevel: 0.3,
      faceTo: sidePanel,
      faceFrom: sidePanel,
      sweepFaces: { front: (face) => reeferFront(face, reliable) },
    },
  );
}

/** The unit's face: u runs up it, v across it to the rig's right. */
function reeferFront(face: FaceDraw, reliable: boolean) {
  const { ctx } = face;
  ctx.fillStyle = face.ink('#17191c', 'metal');
  ctx.beginPath();
  ctx.roundRect(0.55, -2.6, 2.95, 5.2, 0.2);
  ctx.fill();
  ctx.strokeStyle = face.ink('#6b7178', 'metal', 0.4);
  ctx.lineWidth = 0.07;
  if (reliable) {
    ctx.beginPath();
    ctx.arc(2.0, 0, 1.25, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    for (const v of [-1.3, 1.3]) {
      ctx.beginPath();
      ctx.arc(2.0, v, 0.95, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (let slat = 0; slat < 12; slat++) {
    ctx.beginPath();
    ctx.moveTo(0.7 + slat * 0.23, -2.45);
    ctx.lineTo(0.7 + slat * 0.23, 2.45);
    ctx.stroke();
  }
  // The maker's plate: a blue snowflake on the new unit, a brown band on the old.
  ctx.fillStyle = face.ink(reliable ? '#2a5fb0' : '#7a5a2a');
  ctx.beginPath();
  ctx.roundRect(4.0, -1.4, 0.75, 2.8, 0.12);
  ctx.fill();
  ctx.strokeStyle = face.ink('#ffffff');
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  for (let arm = 0; arm < 3; arm++) {
    const angle = (arm / 3) * Math.PI;
    ctx.moveTo(4.37 + Math.cos(angle) * 0.28, Math.sin(angle) * 0.28);
    ctx.lineTo(4.37 - Math.cos(angle) * 0.28, -Math.sin(angle) * 0.28);
  }
  ctx.stroke();
}

function reeferTank(): Prism {
  return side(roundedRect(26, 2.95, 29.6, FLOOR - 0.05, 0.2), 1.0, 2.62, RAIL, {
    bevel: 0.15,
    faceTo: (face) => {
      face.ctx.fillStyle = face.ink('#2a2c30', 'metal');
      face.ctx.fillRect(26.5, 2.95, 0.2, 1.15);
      face.ctx.fillRect(28.9, 2.95, 0.2, 1.15);
    },
  });
}
