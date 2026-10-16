import {
  COWLING,
  FIN,
  FUSELAGE_BOTTOM,
  FUSELAGE_HALF_WIDTH,
  FUSELAGE_INSIGNIA,
  FUSELAGE_TOP,
  GEAR_TOP,
  GUNS,
  LOWER_WING,
  PILOT,
  PROPELLER,
  RUDDER_HINGE,
  STRUT_BACK,
  STRUT_FRONT,
  STRUT_SPAN,
  TAILPLANE,
  UPPER_WING,
  WHEELS,
  WING_INSIGNIA,
  type WingModel,
} from '../biplane-model';
import { insigniaLayers, motifCells, type Outline } from '../insignia';
import type { Livery } from '../palette';
import { mix, shade } from './colour';

/**
 * Paints the biplane in the side view: a small hand-rolled projection of
 * the model in biplane-model.ts, seen from a little above and in front, so
 * the ribbed wings, struts and wires read as a real aeroplane at any
 * attitude, rolls included. Parts are painted far to near.
 */

/** How far a unit towards the viewer shifts the picture: down, and a touch sideways. */
const DEPTH_DOWN = 0.2;
const DEPTH_SIDE = -0.035;
/** The camera's elevation, for deciding which surface of a wing faces it. */
const VIEW_UP = 0.42;
const VIEW_TOWARDS = 0.91;

export interface BiplanePose {
  /** Screen position of the plane's middle, in CSS pixels. */
  x: number;
  y: number;
  /** Pixels per world unit. */
  scale: number;
  /** World heading in radians, counter-clockwise from flying right. */
  pitch: number;
  /** Radians about the plane's length. */
  roll: number;
  /** Propeller angle, radians. */
  spin: number;
  /** 0 idle … 1 full throttle: how solid the propeller blur is. */
  power: number;
  wounded: boolean;
  /** For damage patterns and the scarf's flutter. */
  seed: number;
  time: number;
  /** 0…1: light from the sun (day) or moon (night) on top surfaces. */
  daylight: number;
}

interface Projected {
  x: number;
  y: number;
  depth: number;
}

class Projector {
  private readonly cosPitch: number;
  private readonly sinPitch: number;
  private readonly cosRoll: number;
  private readonly sinRoll: number;

  constructor(private readonly pose: BiplanePose) {
    this.cosPitch = Math.cos(pose.pitch);
    this.sinPitch = Math.sin(pose.pitch);
    this.cosRoll = Math.cos(pose.roll);
    this.sinRoll = Math.sin(pose.roll);
  }

  point(x: number, y: number, z: number): Projected {
    const rolledY = y * this.cosRoll - z * this.sinRoll;
    const rolledZ = y * this.sinRoll + z * this.cosRoll;
    const worldX = x * this.cosPitch - rolledY * this.sinPitch;
    const worldY = x * this.sinPitch + rolledY * this.cosPitch;
    const { scale } = this.pose;
    return {
      x: this.pose.x + (worldX + rolledZ * DEPTH_SIDE) * scale,
      y: this.pose.y + (-worldY + rolledZ * DEPTH_DOWN) * scale,
      depth: rolledZ + worldY * 0.2,
    };
  }

  /** How squarely a surface whose normal is (nx, ny, nz) faces the camera: above 0 it is seen. */
  facing(nx: number, ny: number, nz: number): number {
    const rolledY = ny * this.cosRoll - nz * this.sinRoll;
    const rolledZ = ny * this.sinRoll + nz * this.cosRoll;
    const worldY = nx * this.sinPitch + rolledY * this.cosPitch;
    return worldY * VIEW_UP + rolledZ * VIEW_TOWARDS;
  }
}

interface Part {
  depth: number;
  draw: () => void;
}

export function drawBiplane(ctx: CanvasRenderingContext2D, pose: BiplanePose, livery: Livery) {
  const view = new Projector(pose);
  const parts: Part[] = [];
  const unit = pose.scale;
  const light = 0.55 + pose.daylight * 0.45;

  for (const side of [-1, 1] as const) {
    parts.push(wingPart(ctx, view, UPPER_WING, side, livery, unit, light, pose, true));
    parts.push(wingPart(ctx, view, LOWER_WING, side, livery, unit, light, pose, false));
    parts.push(strutPart(ctx, view, side, livery, unit));
    parts.push(tailplanePart(ctx, view, side, livery, light, unit));
    parts.push(wheelPart(ctx, view, side, livery, unit));
  }
  parts.push(fuselagePart(ctx, view, livery, unit, light, pose));
  parts.sort((a, b) => a.depth - b.depth);
  for (const part of parts) part.draw();
  drawPropeller(ctx, view, pose, unit);
  if (pose.daylight < 0.5 && pose.power > 0.1) drawExhaustGlow(ctx, view, pose, unit);
}

/** At night the rotary engine's exhaust flickers orange under the cowling. */
function drawExhaustGlow(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  pose: BiplanePose,
  unit: number,
) {
  const flicker = 0.7 + Math.sin(pose.time * 37 + pose.seed) * 0.3;
  const port = view.point(COWLING.back + 0.4, -COWLING.radius * 0.85, 0);
  const radius = unit * 2.2 * flicker * (0.6 + pose.power * 0.6);
  const glow = ctx.createRadialGradient(port.x, port.y, 0, port.x, port.y, radius);
  glow.addColorStop(0, 'rgba(255, 220, 150, 0.9)');
  glow.addColorStop(0.35, 'rgba(255, 140, 60, 0.45)');
  glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(port.x, port.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function pathOf(ctx: CanvasRenderingContext2D, points: readonly Projected[]) {
  ctx.beginPath();
  points.forEach((point, index) =>
    index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
  );
  ctx.closePath();
}

function line(ctx: CanvasRenderingContext2D, from: Projected, to: Projected) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function averageDepth(points: readonly Projected[]): number {
  return points.reduce((sum, point) => sum + point.depth, 0) / points.length;
}

function wingHeight(wing: WingModel, along: number): number {
  return wing.y + Math.abs(along) * wing.dihedral;
}

/**
 * One half of a wing, root to tip: doped fabric on top or linen beneath,
 * whichever faces the camera, rib tapes across it, a scalloped trailing
 * edge where the fabric sags between the ribs, and the insignia near the
 * tip of the upper wing.
 */
function wingPart(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  wing: WingModel,
  side: -1 | 1,
  livery: Livery,
  unit: number,
  light: number,
  pose: BiplanePose,
  upper: boolean,
): Part {
  const tipZ = wing.span * side;
  const tipY = wingHeight(wing, wing.span);
  const rake = 0.9;
  const outline = [
    view.point(wing.leading, wing.y, 0),
    view.point(wing.leading - 0.15, tipY, tipZ - side * rake),
    view.point(wing.leading - 1.1, tipY, tipZ),
    view.point(wing.trailing + 0.9, tipY, tipZ),
    view.point(wing.trailing + 0.2, tipY, tipZ - side * 0.5),
    view.point(wing.trailing, wing.y, 0),
  ];
  const seeTop = view.facing(0, 1, 0) >= 0;
  return {
    depth: averageDepth(outline) + (upper ? 0.05 : 0),
    draw() {
      const base = seeTop ? livery.fabric : shade(livery.linen, -0.12);
      ctx.fillStyle = shade(base, (light - 0.8) * 0.5);
      pathOf(ctx, outline);
      ctx.fill();
      ctx.strokeStyle = shade(base, -0.5);
      ctx.lineWidth = Math.max(0.7, unit * 0.12);
      ctx.stroke();

      ctx.lineWidth = Math.max(0.6, unit * 0.09);
      ctx.strokeStyle = seeTop ? shade(livery.fabric, 0.14) : shade(livery.linen, 0.08);
      for (const rib of wing.ribs) {
        const z = rib * side;
        const y = wingHeight(wing, rib);
        if (rib > wing.span - rake) continue;
        line(ctx, view.point(wing.leading - 0.1, y, z), view.point(wing.trailing + 0.12, y, z));
      }
      // The trailing edge sags a little between ribs.
      ctx.strokeStyle = shade(base, -0.28);
      ctx.lineWidth = Math.max(0.6, unit * 0.12);
      ctx.beginPath();
      const stations = [0, ...wing.ribs.filter((rib) => rib <= wing.span - rake)];
      stations.forEach((rib, index) => {
        const next = stations[index + 1];
        const start = view.point(wing.trailing, wingHeight(wing, rib), rib * side);
        if (index === 0) ctx.moveTo(start.x, start.y);
        if (next === undefined) return;
        const middle = (rib + next) / 2;
        const sag = view.point(wing.trailing + 0.22, wingHeight(wing, middle), middle * side);
        const end = view.point(wing.trailing, wingHeight(wing, next), next * side);
        ctx.quadraticCurveTo(sag.x, sag.y, end.x, end.y);
      });
      ctx.stroke();
      // Leading edge catches the light.
      ctx.strokeStyle = mix(base, '#ffffff', 0.35 * light);
      ctx.lineWidth = Math.max(0.7, unit * 0.14);
      line(
        ctx,
        view.point(wing.leading, wing.y, 0),
        view.point(wing.leading - 0.15, tipY, tipZ - side * rake),
      );

      if (upper && seeTop) {
        drawWingMotif(ctx, view, wing, side, livery, light);
        drawWingInsignia(ctx, view, wing, side, livery);
      }
      if (pose.wounded) drawTears(ctx, view, wing, side, pose.seed + (upper ? 11 : 23));
    },
  };
}

function drawWingInsignia(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  wing: WingModel,
  side: -1 | 1,
  livery: Livery,
) {
  const centreX = (wing.leading + wing.trailing) / 2;
  const z = WING_INSIGNIA.span * side;
  const y = wingHeight(wing, WING_INSIGNIA.span);
  for (const layer of insigniaLayers(livery)) {
    ctx.fillStyle = layer.colour;
    pathOf(ctx, onWing(view, layer.outline, centreX, y, z, WING_INSIGNIA.radius));
    ctx.fill();
  }
}

/** A flat outline laid on the wing (x–z) at a point, scaled to a radius. */
function onWing(
  view: Projector,
  outline: Outline,
  x: number,
  y: number,
  z: number,
  radius: number,
): Projected[] {
  return outline.map(([a, b]) => view.point(x + a * radius, y, z + b * radius));
}

/** The same on the fuselage's side (x–y). */
function onSide(
  view: Projector,
  outline: Outline,
  x: number,
  y: number,
  z: number,
  radius: number,
): Projected[] {
  return outline.map(([a, b]) => view.point(x + a * radius, y + b * radius, z));
}

/** A cosmetic motif across the top of the upper wing, painted under the insignia. */
function drawWingMotif(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  wing: WingModel,
  side: -1 | 1,
  livery: Livery,
  light: number,
) {
  const cells = motifCells(livery.wingMotif);
  if (cells.length === 0) return;
  ctx.fillStyle = shade(livery.motifColour, (light - 0.8) * 0.5);
  const chord = wing.leading - wing.trailing;
  for (const cell of cells) {
    pathOf(
      ctx,
      cell.map(([c, s]) => {
        const along = s * (wing.span - 0.9);
        return view.point(wing.leading - c * chord, wingHeight(wing, along), along * side);
      }),
    );
    ctx.fill();
  }
}

/** Torn fabric: ragged holes in the same places every time for this plane. */
function drawTears(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  wing: WingModel,
  side: -1 | 1,
  seed: number,
) {
  ctx.fillStyle = 'rgba(30, 22, 18, 0.75)';
  for (let tear = 0; tear < 2; tear++) {
    const along = 3 + ((seed * (tear + 3) * 7) % 8);
    const chord = wing.trailing + 1 + ((seed * (tear + 5)) % 3);
    const y = wingHeight(wing, along);
    const points = Array.from({ length: 7 }, (_, index) => {
      const angle = (index / 7) * Math.PI * 2;
      const radius = 0.45 + ((seed + index * 13) % 5) * 0.08;
      return view.point(
        chord + Math.cos(angle) * radius,
        y,
        along * side + Math.sin(angle) * radius,
      );
    });
    pathOf(ctx, points);
    ctx.fill();
  }
}

/** The struts and bracing wires between the wings, on one side. */
function strutPart(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  side: -1 | 1,
  livery: Livery,
  unit: number,
): Part {
  const z = STRUT_SPAN * side;
  const lowY = wingHeight(LOWER_WING, STRUT_SPAN);
  const highY = wingHeight(UPPER_WING, STRUT_SPAN);
  const front = [
    view.point(LOWER_WING.leading - STRUT_FRONT, lowY, z),
    view.point(UPPER_WING.leading - STRUT_FRONT, highY, z),
  ] as const;
  const back = [
    view.point(LOWER_WING.trailing + 1.2 + STRUT_BACK, lowY, z),
    view.point(UPPER_WING.trailing + 1.2 + STRUT_BACK, highY, z),
  ] as const;
  const rootLow = view.point(LOWER_WING.leading - 0.8, LOWER_WING.y, side * 1.1);
  const rootHigh = view.point(UPPER_WING.leading - 0.8, UPPER_WING.y, side * 1.3);
  return {
    depth: z * 0.9,
    draw() {
      ctx.strokeStyle = 'rgba(40, 34, 30, 0.55)';
      ctx.lineWidth = Math.max(0.5, unit * 0.06);
      line(ctx, rootLow, front[1]);
      line(ctx, rootHigh, front[0]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = livery.strut;
      ctx.lineWidth = Math.max(1, unit * 0.3);
      line(ctx, front[0], front[1]);
      line(ctx, back[0], back[1]);
      ctx.strokeStyle = shade(livery.strut, 0.25);
      ctx.lineWidth = Math.max(0.5, unit * 0.1);
      line(ctx, front[0], front[1]);
      ctx.lineCap = 'butt';
    },
  };
}

function tailplanePart(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  side: -1 | 1,
  livery: Livery,
  light: number,
  unit: number,
): Part {
  const tip = TAILPLANE.span * side;
  const outline = [
    view.point(TAILPLANE.leading, TAILPLANE.y, side * 0.4),
    view.point(TAILPLANE.leading - 0.8, TAILPLANE.y, tip * 0.92),
    view.point(TAILPLANE.leading - 1.6, TAILPLANE.y, tip),
    view.point(TAILPLANE.trailing + 0.3, TAILPLANE.y, tip * 0.85),
    view.point(TAILPLANE.trailing, TAILPLANE.y, side * 0.4),
  ];
  const seeTop = view.facing(0, 1, 0) >= 0;
  return {
    depth: averageDepth(outline),
    draw() {
      ctx.fillStyle = shade(seeTop ? livery.fabric : livery.linen, (light - 0.8) * 0.5 - 0.04);
      pathOf(ctx, outline);
      ctx.fill();
      ctx.strokeStyle = shade(livery.fabricShade, -0.4);
      ctx.lineWidth = Math.max(0.6, unit * 0.1);
      ctx.stroke();
    },
  };
}

function wheelPart(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  side: -1 | 1,
  livery: Livery,
  unit: number,
): Part {
  const z = WHEELS.track * side;
  const centre = view.point(WHEELS.x, WHEELS.y, z);
  const rim = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    return view.point(
      WHEELS.x + Math.cos(angle) * WHEELS.radius,
      WHEELS.y + Math.sin(angle) * WHEELS.radius,
      z,
    );
  });
  return {
    depth: centre.depth,
    draw() {
      ctx.strokeStyle = livery.strut;
      ctx.lineWidth = Math.max(0.8, unit * 0.18);
      for (const [x, y] of GEAR_TOP) line(ctx, view.point(x, y, side * 0.8), centre);
      ctx.fillStyle = '#2a2622';
      pathOf(ctx, rim);
      ctx.fill();
      // A fabric wheel cover with a pale hub.
      ctx.fillStyle = shade(livery.linen, -0.18);
      pathOf(
        ctx,
        rim.map((point) => ({
          x: centre.x + (point.x - centre.x) * 0.72,
          y: centre.y + (point.y - centre.y) * 0.72,
          depth: point.depth,
        })),
      );
      ctx.fill();
      ctx.fillStyle = livery.cowlingShine;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, Math.max(0.6, unit * 0.16), 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

/**
 * The fuselage: its visible side panel with stitching, an oil streak behind
 * the engine and the insignia; the decking on top; the fin and rudder;
 * the cowling; the guns; the pilot with goggles and a streaming scarf.
 */
function fuselagePart(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  livery: Livery,
  unit: number,
  light: number,
  pose: BiplanePose,
): Part {
  const sideZ = view.facing(0, 0, 1) >= 0 ? FUSELAGE_HALF_WIDTH : -FUSELAGE_HALF_WIDTH;
  const profile = [...FUSELAGE_TOP, ...FUSELAGE_BOTTOM];
  const panel = profile.map(([x, y]) => view.point(x, y, sideZ));
  const deckZ = view.facing(0, 1, 0) >= 0;
  const deck = [
    ...FUSELAGE_TOP.map(([x, y]) => view.point(x, deckZ ? y : -y, FUSELAGE_HALF_WIDTH)),
    ...[...FUSELAGE_TOP]
      .reverse()
      .map(([x, y]) => view.point(x, deckZ ? y : -y, -FUSELAGE_HALF_WIDTH)),
  ];
  return {
    depth: 0,
    draw() {
      // Fin and rudder first: they sit in the middle of the fuselage.
      const fin = FIN.map(([x, y]) => view.point(x, y, 0));
      ctx.fillStyle = shade(livery.fabric, (light - 0.8) * 0.5 - 0.06);
      pathOf(ctx, fin);
      ctx.fill();
      drawRudder(ctx, view, livery);
      ctx.strokeStyle = shade(livery.fabricShade, -0.45);
      ctx.lineWidth = Math.max(0.7, unit * 0.12);
      pathOf(ctx, fin);
      ctx.stroke();

      ctx.fillStyle = shade(livery.fabric, (light - 0.8) * 0.5 + 0.06);
      pathOf(ctx, deck);
      ctx.fill();

      const top = Math.min(...panel.map((point) => point.y));
      const bottom = Math.max(...panel.map((point) => point.y));
      const gradient = ctx.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, shade(livery.fabric, (light - 0.8) * 0.5 + 0.02));
      gradient.addColorStop(1, shade(livery.fabricShade, (light - 0.8) * 0.5 - 0.05));
      ctx.fillStyle = gradient;
      pathOf(ctx, panel);
      ctx.fill();
      ctx.strokeStyle = shade(livery.fabricShade, -0.45);
      ctx.lineWidth = Math.max(0.8, unit * 0.14);
      ctx.stroke();

      // Stitching along the longerons.
      ctx.strokeStyle = shade(livery.fabric, 0.18);
      ctx.lineWidth = Math.max(0.5, unit * 0.06);
      ctx.setLineDash([unit * 0.3, unit * 0.25]);
      ctx.beginPath();
      FUSELAGE_TOP.forEach(([x, y], index) => {
        const point = view.point(x, y - 0.32, sideZ);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Castor oil thrown back by the rotary engine.
      const streak = ctx.createLinearGradient(
        view.point(COWLING.back, 0, sideZ).x,
        0,
        view.point(-1.5, 0, sideZ).x,
        0,
      );
      streak.addColorStop(0, 'rgba(36, 28, 20, 0.45)');
      streak.addColorStop(1, 'rgba(36, 28, 20, 0)');
      ctx.fillStyle = streak;
      pathOf(ctx, [
        view.point(COWLING.back, -0.2, sideZ),
        view.point(COWLING.back, -1.1, sideZ),
        view.point(-1.5, -0.9, sideZ),
        view.point(-1.5, -0.5, sideZ),
      ]);
      ctx.fill();

      drawSideInsignia(ctx, view, livery, sideZ);
      drawPilot(ctx, view, livery, unit, pose);
      drawGuns(ctx, view, unit);
      drawCowling(ctx, view, livery, sideZ);
    },
  };
}

function drawRudder(ctx: CanvasRenderingContext2D, view: Projector, livery: Livery) {
  const rudder = FIN.filter(([x]) => x <= RUDDER_HINGE);
  const outline = [
    view.point(RUDDER_HINGE, 2.5, 0),
    ...rudder.map(([x, y]) => view.point(x, y, 0)),
    view.point(RUDDER_HINGE, -0.52, 0),
  ];
  if (livery.rudder.length > 1) {
    ctx.save();
    pathOf(ctx, outline);
    ctx.clip();
    const width = (RUDDER_HINGE - (FIN[3]?.[0] ?? -10)) / livery.rudder.length;
    livery.rudder.forEach((colour, index) => {
      const front = RUDDER_HINGE - index * width;
      ctx.fillStyle = colour;
      pathOf(ctx, [
        view.point(front, 3, 0),
        view.point(front - width - 0.02, 3, 0),
        view.point(front - width - 0.02, -1, 0),
        view.point(front, -1, 0),
      ]);
      ctx.fill();
    });
    ctx.restore();
    return;
  }
  ctx.fillStyle = livery.rudder[0] as string;
  pathOf(ctx, outline);
  ctx.fill();
  if (livery.insignia !== 'cross') return;
  // The Central Powers carried the cross on the rudder too.
  for (const layer of insigniaLayers(livery)) {
    ctx.fillStyle = layer.colour;
    pathOf(ctx, onSide(view, layer.outline, -9.35, 1.1, 0, 0.75));
    ctx.fill();
  }
}

function drawSideInsignia(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  livery: Livery,
  z: number,
) {
  const { x, y, radius } = FUSELAGE_INSIGNIA;
  for (const layer of insigniaLayers(livery)) {
    ctx.fillStyle = layer.colour;
    pathOf(ctx, onSide(view, layer.outline, x, y, z, radius));
    ctx.fill();
  }
}

function drawCowling(ctx: CanvasRenderingContext2D, view: Projector, livery: Livery, z: number) {
  const { back, front, radius } = COWLING;
  const profile = [
    view.point(back, radius * 0.9, z * 0.9),
    view.point(front - 0.35, radius, z * 0.9),
    view.point(front, radius * 0.72, z * 0.6),
    view.point(front, -radius * 0.72, z * 0.6),
    view.point(front - 0.35, -radius, z * 0.9),
    view.point(back, -radius * 0.85, z * 0.9),
  ];
  const top = view.point(back, radius, z);
  const bottom = view.point(back, -radius, z);
  const gradient = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
  gradient.addColorStop(0, livery.cowling);
  gradient.addColorStop(0.3, livery.cowlingShine);
  gradient.addColorStop(0.55, livery.cowling);
  gradient.addColorStop(1, shade(livery.cowling, -0.35));
  ctx.fillStyle = gradient;
  pathOf(ctx, profile);
  ctx.fill();
  // The dark mouth of the cowling, where the cylinders spin.
  const mouth = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    return view.point(
      front + 0.02,
      Math.cos(angle) * radius * 0.62,
      Math.sin(angle) * radius * 0.62,
    );
  });
  ctx.fillStyle = '#1d1a18';
  pathOf(ctx, mouth);
  ctx.fill();
}

function drawGuns(ctx: CanvasRenderingContext2D, view: Projector, unit: number) {
  ctx.strokeStyle = '#26231f';
  ctx.lineWidth = Math.max(1, unit * 0.32);
  ctx.lineCap = 'round';
  line(ctx, view.point(GUNS.back, GUNS.y, 0.35), view.point(GUNS.front, GUNS.y - 0.05, 0.35));
  ctx.lineCap = 'butt';
}

function drawPilot(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  livery: Livery,
  unit: number,
  pose: BiplanePose,
) {
  const neck = view.point(PILOT.x, PILOT.y - 0.35, 0);
  // The scarf streams back and flutters.
  const flutter = Math.sin(pose.time * 13 + pose.seed) * 0.35;
  const tail = view.point(PILOT.x - 3.1, PILOT.y - 0.1 + flutter, 0);
  const middle = view.point(PILOT.x - 1.6, PILOT.y + 0.25 - flutter * 0.6, 0);
  ctx.strokeStyle = livery.scarf;
  ctx.lineWidth = Math.max(1.4, unit * 0.46);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(neck.x, neck.y);
  ctx.quadraticCurveTo(middle.x, middle.y, tail.x, tail.y);
  ctx.stroke();
  ctx.lineCap = 'butt';

  const head = view.point(PILOT.x, PILOT.y, 0);
  const radius = PILOT.head * unit;
  ctx.fillStyle = '#5a3c26';
  ctx.beginPath();
  ctx.arc(head.x, head.y, radius, 0, Math.PI * 2);
  ctx.fill();
  const goggles = view.point(PILOT.x + 0.42, PILOT.y + 0.05, 0);
  ctx.fillStyle = '#e8f1f4';
  ctx.beginPath();
  ctx.arc(goggles.x, goggles.y, radius * 0.38, 0, Math.PI * 2);
  ctx.fill();
  // Cockpit coaming in front of the pilot.
  ctx.strokeStyle = '#3a2a1e';
  ctx.lineWidth = Math.max(1, unit * 0.22);
  line(ctx, view.point(PILOT.x - 0.9, 1.72, 0), view.point(PILOT.x + 0.9, 1.75, 0));
}

/** The spinning propeller is a disc of blur with two faint blades. */
function drawPropeller(
  ctx: CanvasRenderingContext2D,
  view: Projector,
  pose: BiplanePose,
  unit: number,
) {
  const { x, radius } = PROPELLER;
  const disc = Array.from({ length: 28 }, (_, index) => {
    const angle = (index / 28) * Math.PI * 2;
    return view.point(x, Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  const alpha = 0.12 + pose.power * 0.16;
  ctx.fillStyle = `rgba(70, 58, 46, ${alpha.toFixed(3)})`;
  pathOf(ctx, disc);
  ctx.fill();
  ctx.strokeStyle = `rgba(60, 46, 34, ${(0.35 + pose.power * 0.2).toFixed(3)})`;
  ctx.lineWidth = Math.max(0.8, unit * 0.22);
  for (const offset of [0, Math.PI]) {
    const angle = pose.spin + offset;
    line(
      ctx,
      view.point(x, 0, 0),
      view.point(x, Math.cos(angle) * radius * 0.95, Math.sin(angle) * radius * 0.95),
    );
  }
  const hub = view.point(x + 0.1, 0, 0);
  ctx.fillStyle = '#2a2420';
  ctx.beginPath();
  ctx.arc(hub.x, hub.y, Math.max(0.8, unit * 0.32), 0, Math.PI * 2);
  ctx.fill();
}
