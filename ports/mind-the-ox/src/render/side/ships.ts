import { deckHeight, offsetOnDeck, wireWindow } from '../../engine/deck';
import { SHIP_CLASSES } from '../../engine/fleet';
import { hullFacing } from '../../engine/ships';
import { cosine } from '../../engine/trig';
import type { Plane, Ship, World } from '../../engine/world';
import type { ThemeId } from '../../themes';
import type { Fleet, Palette } from '../palette';
import type { Rescue } from '../view';
import {
  deckOver,
  forecastleOf,
  shipLayout,
  type Block,
  type Funnel,
  type Island,
  type Mast,
  type Turret,
} from '../ship-shapes';
import { damageAttitude } from '../ship-damage';
import type { SideCamera } from './camera';
import { mix, shade, withAlpha } from './colour';
import { paintFlames, paintFlightDeckWounds, paintHullWounds, paintUpperWounds } from './wounds';

/**
 * Ships from the side, drawn in the hull's own frame: one world unit to
 * `unit` pixels, x along the hull towards the bow, y up from the
 * waterline. The hull foreshortens as the ship turns, carries the marks of
 * every heavy blow, trims towards its wounds, and lists and settles as it
 * sinks.
 */

/** How far back the flight deck's top shows, on screen, in world units: the camera looks a little down on it. */
const DECK_TOP = 2.6;
/** A sinking ship lists up to this, radians, bow rising. */
export const SINKING_LIST = 0.32;

export interface ShipPaint {
  palette: Palette;
  theme: ThemeId;
  time: number;
  /** The plane people are flying, for the carrier's landing signals. */
  focus: Plane | null;
  world: World;
}

export function paintShip(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  ship: Ship,
  paint: ShipPaint,
) {
  if (ship.state === 'sunk' || ship.escaped) return;
  const unit = camera.scale;
  const facing = hullFacing(ship);
  const fleet = paint.palette.navy[ship.side];
  ctx.save();
  ctx.translate(camera.x(ship.x), camera.y(ship.y));
  ctx.rotate(-ship.direction * (ship.sinking * SINKING_LIST - damageAttitude(ship).trim));
  ctx.scale(unit * ship.direction * facing, unit);
  paintWake(ctx, ship, paint);
  if (ship.kind === 'carrier') paintCarrier(ctx, ship, fleet, paint, unit);
  else paintWarship(ctx, ship, fleet, paint, unit);
  paintFlames(ctx, ship, paint.palette, paint.world.tick, paint.time);
  ctx.restore();
}

/** Foam behind the stern and a bow wave, longer the faster the ship is going. */
function paintWake(ctx: CanvasRenderingContext2D, ship: Ship, paint: ShipPaint) {
  const { length } = shipLayout(ship.kind);
  const pace = Math.min(1.4, ship.speed / 1.2);
  if (pace < 0.05 || ship.state !== 'afloat') return;
  const foam = paint.palette.sea.foam;
  for (let puff = 0; puff < 9; puff++) {
    const behind = puff * 5 * pace;
    const wobble = Math.sin(paint.time * 3 + puff * 1.7) * 0.4;
    ctx.fillStyle = withAlpha(foam, (0.55 - puff * 0.055) * pace);
    ctx.beginPath();
    ctx.ellipse(
      -length / 2 - behind,
      0.2 + wobble * 0.3,
      3 + puff * 1.4,
      0.7 + puff * 0.12,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = withAlpha(foam, 0.7 * pace);
  ctx.beginPath();
  ctx.ellipse(
    length / 2 - 1,
    0.3,
    3.5 * pace + 1,
    0.9 + Math.sin(paint.time * 4) * 0.2,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

/**
 * The hull: a raked bow, a cruiser stern, the boot topping below the
 * waterline, the side in its fleet's colours (dazzle, where it has it),
 * a row of scuttles and a rubbing strake.
 */
function paintHull(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  fleet: Fleet,
  paint: ShipPaint,
  unit: number,
) {
  const layout = shipLayout(ship.kind);
  const { length, freeboard, draft, sheer, bowRake } = layout;
  const half = length / 2;
  const top = -freeboard;
  const { forecastle, breakAt } = forecastleOf(ship.kind);
  const ram = ship.kind === 'battleship' || ship.kind === 'cruiser' ? 1.6 : 0;
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(-half + 6, draft);
    ctx.lineTo(half - bowRake - 3, draft);
    // The stem: a ram at the forefoot on the big ships, then up and raked forward to the deck.
    ctx.quadraticCurveTo(
      half - bowRake + ram,
      draft * 0.9,
      half - bowRake + ram * 0.6,
      draft * 0.2,
    );
    ctx.quadraticCurveTo(half - bowRake * 0.4, top * 0.4, half, top - forecastle - sheer);
    // The forecastle deck, its break, and the main deck aft.
    ctx.lineTo(breakAt, top - forecastle - sheer * 0.3);
    ctx.lineTo(breakAt - 1, top);
    ctx.lineTo(-half + 7, top);
    // A counter stern overhanging the water, curving in to the keel.
    ctx.quadraticCurveTo(-half - 1, top, -half - 1, top * 0.45);
    ctx.quadraticCurveTo(-half + 1, 0, -half + 4, draft * 0.4);
    ctx.lineTo(-half + 6, draft);
    ctx.closePath();
  };
  outline();
  ctx.save();
  ctx.clip();
  // Below the waterline, and the side above it with light from above.
  ctx.fillStyle = fleet.boot;
  ctx.fillRect(-half - 2, 0, length + 4, draft + 1);
  const side = ctx.createLinearGradient(0, top - forecastle - sheer, 0, 0);
  side.addColorStop(0, fleet.hull);
  side.addColorStop(1, fleet.hullShade);
  ctx.fillStyle = side;
  ctx.fillRect(
    -half - 2,
    top - forecastle - sheer - 1,
    length + 4,
    freeboard + forecastle + sheer + 1,
  );
  if (fleet.dazzle.length > 0)
    paintDazzle(ctx, ship, fleet, length, freeboard + forecastle + sheer);
  // Plating seams, and a dark line along the waterline.
  ctx.strokeStyle = withAlpha(fleet.trim, 0.12);
  ctx.lineWidth = Math.max(0.08, 0.5 / unit);
  ctx.beginPath();
  for (let x = -half + 6; x < half; x += 7) {
    ctx.moveTo(x, top - forecastle);
    ctx.lineTo(x, 0);
  }
  ctx.stroke();
  ctx.fillStyle = withAlpha(fleet.trim, 0.7);
  ctx.fillRect(-half, -0.35, length, 0.45);
  paintScuttles(ctx, ship, fleet, paint.palette, layout.freeboard);
  paintHullWounds(ctx, ship, paint.palette, freeboard);
  ctx.restore();
  ctx.strokeStyle = withAlpha(fleet.trim, 0.7);
  ctx.lineWidth = Math.max(0.12, 0.9 / unit);
  outline();
  ctx.stroke();
  paintAnchor(ctx, fleet, half - bowRake - 2, top * 0.7, unit);
}

/** The deck's height in the hull's frame (negative, up) at a point along the hull. */
function deckAt(ship: Ship, at: number): number {
  return -deckOver(ship.kind, at);
}

/** The anchor stowed at the bow, its cable running up through the hawse. */
function paintAnchor(
  ctx: CanvasRenderingContext2D,
  fleet: Fleet,
  x: number,
  y: number,
  unit: number,
) {
  ctx.strokeStyle = shade(fleet.trim, 0.1);
  ctx.lineWidth = Math.max(0.2, 0.9 / unit);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - 0.9);
  ctx.lineTo(x, y + 0.8);
  ctx.moveTo(x - 0.8, y + 0.3);
  ctx.quadraticCurveTo(x, y + 1.3, x + 0.8, y + 0.3);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Hard-edged slabs of contrasting colour, angled across the hull, fixed for each ship. */
export function paintDazzle(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  fleet: Fleet,
  length: number,
  height: number,
) {
  const half = length / 2;
  let x = -half;
  let index = ship.index * 3;
  while (x < half) {
    const hash = Math.abs(Math.sin((index + 1) * 12.9898) * 43758.5453) % 1;
    const width = 6 + hash * 12;
    const slant = (hash - 0.5) * 14;
    ctx.fillStyle = fleet.dazzle[index % fleet.dazzle.length] as string;
    ctx.beginPath();
    ctx.moveTo(x, 0.2);
    ctx.lineTo(x + width, 0.2);
    ctx.lineTo(x + width + slant, -height - 1);
    ctx.lineTo(x + slant * 0.4, -height - 1);
    ctx.closePath();
    ctx.fill();
    x += width + 4 + hash * 10;
    index += 1;
  }
}

/** Portholes along the side; by night some of them glow. */
export function paintScuttles(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  fleet: Fleet,
  palette: Palette,
  freeboard: number,
) {
  const { length } = shipLayout(ship.kind);
  const night = palette.daylight < 0.5;
  const y = -freeboard * 0.72;
  for (let x = -length / 2 + 8; x < length / 2 - 8; x += 4.5) {
    const lit = night && Math.abs(Math.sin(x * 3.7 + ship.index)) > 0.55;
    ctx.fillStyle = lit ? palette.window : withAlpha(fleet.trim, 0.6);
    ctx.beginPath();
    ctx.arc(x, y, 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintWarship(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  fleet: Fleet,
  paint: ShipPaint,
  unit: number,
) {
  const layout = shipLayout(ship.kind);
  for (const mast of layout.masts) paintMast(ctx, mast, fleet, deckAt(ship, mast.at), unit);
  paintSearchlightLamp(ctx, ship, fleet, paint.palette, unit);
  for (const house of layout.houses) paintHouse(ctx, house, fleet, paint, deckAt(ship, house.at));
  for (const funnel of layout.funnels) paintFunnel(ctx, funnel, fleet, deckAt(ship, funnel.at));
  // At the Airshow the guns are bullseye boards for the flour bags, and the ship is dressed overall.
  const show = paint.theme === 'airshow';
  for (const turret of layout.turrets)
    if (show) paintBullseye(ctx, turret, paint.palette, deckAt(ship, turret.at), unit);
    else paintTurret(ctx, turret, fleet, deckAt(ship, turret.at), unit);
  if (show) paintBunting(ctx, ship, paint.palette, paint.time, unit);
  paintHull(ctx, ship, fleet, paint, unit);
  paintUpperWounds(ctx, ship, paint.palette, layout.freeboard);
  const stern = -layout.length / 2 + 2;
  paintEnsign(ctx, ship, paint, stern, deckAt(ship, stern), unit);
  if (paint.palette.daylight < 0.5)
    paintRunningLights(ctx, layout.length, deckAt(ship, layout.length / 2), layout.masts[0]);
}

/**
 * The searchlight on its platform up the foremast, where the engine's beam
 * starts; at night an enemy's is burning, its glass a bright eye.
 */
function paintSearchlightLamp(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  fleet: Fleet,
  palette: Palette,
  unit: number,
) {
  const lamp = SHIP_CLASSES[ship.kind].searchlight;
  if (!lamp) return;
  const x = lamp.along;
  const y = -lamp.height;
  ctx.fillStyle = fleet.trim;
  ctx.fillRect(x - 2.2, y + 1, 4.4, Math.max(0.3, 0.9 / unit));
  ctx.fillStyle = fleet.superstructure;
  ctx.beginPath();
  ctx.ellipse(x, y, 1.3, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  const burning = ship.side === 1 && palette.daylight < 0.5 && ship.state === 'afloat';
  ctx.fillStyle = burning ? '#fff6d6' : withAlpha(fleet.trim, 0.8);
  ctx.beginPath();
  ctx.ellipse(x + 0.7, y, 0.45, 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!burning) return;
  const glow = ctx.createRadialGradient(x + 0.7, y, 0, x + 0.7, y, 4);
  glow.addColorStop(0, 'rgba(255, 246, 214, 0.8)');
  glow.addColorStop(1, 'rgba(255, 246, 214, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 3.5, y - 4, 8.4, 8);
}

/** A round target board on a post where a turret would be: red and white rings for the flour bags. */
function paintBullseye(
  ctx: CanvasRenderingContext2D,
  turret: Turret,
  palette: Palette,
  deck: number,
  unit: number,
) {
  const radius = Math.max(2.4, turret.size * 0.5);
  const centre = deck - turret.raised - radius - 1.2;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(0.2, 0.9 / unit);
  ctx.beginPath();
  ctx.moveTo(turret.at, deck);
  ctx.lineTo(turret.at, centre);
  ctx.stroke();
  ['#e2483c', '#f4efe2', '#e2483c', '#f4efe2'].forEach((colour, ring) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.ellipse(
      turret.at,
      centre,
      radius * (1 - ring * 0.24) * 0.45,
      radius * (1 - ring * 0.24),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });
}

/** Strings of pennants from bow to masthead to stern: a ship dressed overall for the show. */
function paintBunting(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  palette: Palette,
  time: number,
  unit: number,
) {
  const layout = shipLayout(ship.kind);
  const half = layout.length / 2;
  const mast = layout.masts[0] ?? { at: 0, height: 10, tripod: false };
  const top = deckAt(ship, mast.at) - mast.height;
  const legs: [number, number, number, number][] = [
    [half - 1, deckAt(ship, half - 1), mast.at, top],
    [mast.at, top, -half + 2, deckAt(ship, -half + 2)],
  ];
  ctx.strokeStyle = withAlpha(palette.ink, 0.5);
  ctx.lineWidth = Math.max(0.1, 0.5 / unit);
  for (const [x1, y1, x2, y2] of legs) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + 2, x2, y2);
    ctx.stroke();
    for (let flag = 1; flag < 9; flag++) {
      const t = flag / 9;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t + 2 * 4 * t * (1 - t);
      const flutter = Math.sin(time * 6 + flag + ship.index) * 0.3;
      ctx.fillStyle = palette.festive[flag % palette.festive.length] ?? '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x - 0.8, y);
      ctx.lineTo(x + 0.8, y);
      ctx.lineTo(x + flutter, y + 1.8);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function paintHouse(
  ctx: CanvasRenderingContext2D,
  house: Block,
  fleet: Fleet,
  paint: ShipPaint,
  deck: number,
) {
  const left = house.at - house.width / 2;
  const top = deck - house.height;
  const wall = ctx.createLinearGradient(0, top, 0, deck);
  wall.addColorStop(0, fleet.superstructure);
  wall.addColorStop(1, shade(fleet.superstructure, -0.12));
  ctx.fillStyle = wall;
  ctx.fillRect(left, top, house.width, house.height + 0.5);
  ctx.fillStyle = withAlpha(fleet.trim, 0.8);
  ctx.fillRect(left - 0.4, top - 0.5, house.width + 0.8, 0.6);
  const night = paint.palette.daylight < 0.5;
  for (let x = left + 1.2; x < left + house.width - 1; x += 2.4) {
    ctx.fillStyle = night ? paint.palette.window : withAlpha(fleet.trim, 0.65);
    ctx.fillRect(x, top + 1, 1, Math.min(1.4, house.height * 0.35));
  }
}

function paintFunnel(ctx: CanvasRenderingContext2D, funnel: Funnel, fleet: Fleet, deck: number) {
  const top = deck - funnel.height;
  const half = funnel.width / 2;
  ctx.fillStyle = fleet.funnel;
  ctx.beginPath();
  ctx.moveTo(funnel.at - half, deck);
  ctx.lineTo(funnel.at + half, deck);
  ctx.lineTo(funnel.at + half - funnel.rake, top);
  ctx.lineTo(funnel.at - half - funnel.rake, top);
  ctx.closePath();
  ctx.fill();
  // A painted band near the top, and the cap.
  ctx.fillStyle = fleet.funnelBand;
  ctx.fillRect(
    funnel.at - half - funnel.rake * 0.82,
    top + funnel.height * 0.18,
    funnel.width,
    1.2,
  );
  ctx.fillStyle = shade(fleet.funnel, -0.3);
  ctx.fillRect(funnel.at - half - funnel.rake - 0.3, top - 0.4, funnel.width + 0.6, 0.8);
}

function paintTurret(
  ctx: CanvasRenderingContext2D,
  turret: Turret,
  fleet: Fleet,
  deck: number,
  unit: number,
) {
  const height = turret.size * 0.42;
  const bottom = deck - turret.raised;
  if (turret.raised > 0) {
    ctx.fillStyle = shade(fleet.hullShade, 0.06);
    ctx.fillRect(turret.at - turret.size * 0.4, bottom, turret.size * 0.8, turret.raised + 0.4);
  }
  // Two barrels, pointing out over the ends of the ship and cocked up a little.
  ctx.strokeStyle = shade(fleet.superstructure, -0.35);
  ctx.lineWidth = Math.max(0.35, turret.size * 0.09);
  ctx.lineCap = 'round';
  for (const lift of [0.28, 0.52]) {
    ctx.beginPath();
    ctx.moveTo(turret.at, bottom - height * lift);
    ctx.lineTo(turret.at + turret.facing * turret.size * 1.25, bottom - height * lift - 0.9);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  const shell = ctx.createLinearGradient(0, bottom - height, 0, bottom);
  shell.addColorStop(0, fleet.superstructure);
  shell.addColorStop(1, shade(fleet.superstructure, -0.2));
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.moveTo(turret.at - turret.size / 2, bottom);
  ctx.lineTo(turret.at - turret.size / 2 + 0.6, bottom - height);
  ctx.lineTo(turret.at + turret.size / 2 - 1.2, bottom - height);
  ctx.lineTo(turret.at + turret.size / 2, bottom - height * 0.4);
  ctx.lineTo(turret.at + turret.size / 2, bottom);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = withAlpha(fleet.trim, 0.6);
  ctx.lineWidth = Math.max(0.1, 0.7 / unit);
  ctx.stroke();
}

function paintMast(
  ctx: CanvasRenderingContext2D,
  mast: Mast,
  fleet: Fleet,
  deck: number,
  unit: number,
) {
  const top = deck - mast.height;
  ctx.strokeStyle = fleet.trim;
  ctx.lineWidth = Math.max(0.25, 1.3 / unit);
  ctx.beginPath();
  ctx.moveTo(mast.at, deck);
  ctx.lineTo(mast.at, top);
  if (mast.tripod) {
    ctx.moveTo(mast.at - 3, deck);
    ctx.lineTo(mast.at, top + mast.height * 0.35);
    ctx.moveTo(mast.at + 3, deck);
    ctx.lineTo(mast.at, top + mast.height * 0.35);
  }
  // The yard, and the stays to the deck.
  ctx.moveTo(mast.at - 3, top + 2.5);
  ctx.lineTo(mast.at + 3, top + 2.5);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(fleet.trim, 0.35);
  ctx.lineWidth = Math.max(0.12, 0.6 / unit);
  ctx.beginPath();
  ctx.moveTo(mast.at, top);
  ctx.lineTo(mast.at + 16, deck);
  ctx.moveTo(mast.at, top);
  ctx.lineTo(mast.at - 16, deck);
  ctx.stroke();
  if (mast.tripod) {
    ctx.fillStyle = fleet.superstructure;
    ctx.fillRect(mast.at - 2.2, top + 3, 4.4, 2.6);
  }
}

/** The ensign at the stern, in the side's colours, stirring in the breeze. */
function paintEnsign(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  paint: ShipPaint,
  x: number,
  deck: number,
  unit: number,
) {
  const top = deck - 7;
  ctx.strokeStyle = paint.palette.navy[ship.side].trim;
  ctx.lineWidth = Math.max(0.2, 0.9 / unit);
  ctx.beginPath();
  ctx.moveTo(x, deck);
  ctx.lineTo(x, top);
  ctx.stroke();
  const flutter = Math.sin(paint.time * 5 + ship.index) * 0.5;
  ctx.fillStyle = paint.palette.accents[ship.side];
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.quadraticCurveTo(x - 2, top + 0.5 + flutter, x - 4, top + flutter * 0.6);
  ctx.lineTo(x - 4, top + 2.6 + flutter * 0.6);
  ctx.quadraticCurveTo(x - 2, top + 3.1 + flutter, x, top + 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = paint.palette.festive[1] ?? '#ffffff';
  ctx.fillRect(x - 4, top + 1.1 + flutter * 0.6, 4, 0.5);
}

/** Masthead and side lights at night: white aloft, red to port and green to starboard. */
function paintRunningLights(
  ctx: CanvasRenderingContext2D,
  length: number,
  deck: number,
  mast: Mast | undefined,
) {
  const lights: [number, number, string][] = [
    [length / 2 - 12, deck - 1.5, '#ff5a4a'],
    [length / 2 - 14, deck - 1.5, '#5aff8a'],
  ];
  if (mast) lights.push([mast.at, deck - mast.height, '#fff6d8']);
  for (const [x, y, colour] of lights) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 2.4);
    glow.addColorStop(0, colour);
    glow.addColorStop(1, withAlpha(colour, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - 2.4, y - 2.4, 4.8, 4.8);
  }
}

/**
 * The carrier: a hull with its flight deck laid flat along the top, seen a
 * little from above so the planking, the round-down at the stern, the
 * wires and the deck lights read; and at the stern, the signalman with his
 * flags who talks a pilot down.
 */
function paintCarrier(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  fleet: Fleet,
  paint: ShipPaint,
  unit: number,
) {
  const layout = shipLayout(ship.kind);
  const { length, freeboard } = layout;
  const half = length / 2;
  paintHull(ctx, ship, fleet, paint, unit);
  // The gallery deck under the flight deck, open to the sides.
  ctx.fillStyle = withAlpha(fleet.trim, 0.55);
  ctx.fillRect(-half + 8, -freeboard + 0.6, length - 18, 1.4);
  for (let x = -half + 9; x < half - 10; x += 6) {
    ctx.fillStyle = fleet.hullShade;
    ctx.fillRect(x, -freeboard + 0.6, 0.6, 1.4);
  }

  // The flight deck's top, receding a little.
  const front = -freeboard;
  const back = front - DECK_TOP;
  const stern = -half - 1.5;
  const bow = half - 3;
  const top = ctx.createLinearGradient(0, back, 0, front);
  top.addColorStop(0, shade(fleet.deck, 0.06));
  top.addColorStop(1, fleet.deck);
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.moveTo(stern, front + 1.2);
  ctx.quadraticCurveTo(stern + 1, front, stern + 5, front);
  ctx.lineTo(bow, front);
  ctx.lineTo(bow - 1.5, back);
  ctx.lineTo(stern + 7, back);
  ctx.quadraticCurveTo(stern + 2, back + 0.2, stern, front + 1.2);
  ctx.closePath();
  ctx.fill();
  // Planks along the deck.
  ctx.strokeStyle = withAlpha(fleet.deckShade, 0.55);
  ctx.lineWidth = Math.max(0.08, 0.5 / unit);
  ctx.beginPath();
  for (let row = 1; row < 4; row++) {
    const y = front - (DECK_TOP * row) / 4;
    ctx.moveTo(stern + 5, y);
    ctx.lineTo(bow - 1, y);
  }
  ctx.stroke();
  // The deck's edge, and its shadow down the side.
  ctx.fillStyle = shade(fleet.deck, -0.25);
  ctx.fillRect(stern + 4, front, bow - stern - 4, 0.9);

  paintLandingArea(ctx, ship, fleet, paint, stern, front, back, unit);
  paintFlightDeckWounds(ctx, ship, paint.palette, front, back);
  paintDeckLights(ctx, ship, paint, stern, bow, front, back);
  if (layout.island)
    paintIsland(ctx, layout.island, fleet, paint, starboardEdge(ship, front, back), unit);
  paintSignalman(ctx, ship, paint, stern + 9, front, unit);
  paintEnsign(ctx, ship, paint, stern + 1, front, unit);
}

/** Stripes on the round-down, and the wires laid across the deck at their places. */
function paintLandingArea(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  fleet: Fleet,
  paint: ShipPaint,
  stern: number,
  front: number,
  back: number,
  unit: number,
) {
  for (let stripe = 0; stripe < 4; stripe++) {
    ctx.fillStyle = stripe % 2 === 0 ? withAlpha('#f4efe2', 0.85) : withAlpha(fleet.trim, 0.6);
    ctx.beginPath();
    const x = stern + 1 + stripe * 1.4;
    ctx.moveTo(x, front + 0.6);
    ctx.lineTo(x + 1.4, front + 0.6);
    ctx.lineTo(x + 2.4, back + 0.2);
    ctx.lineTo(x + 1, back + 0.2);
    ctx.closePath();
    ctx.fill();
  }
  const wires = wireWindow(paint.world);
  const deckStart = -shipLayout(ship.kind).length / 2;
  ctx.strokeStyle = withAlpha(fleet.trim, 0.85);
  ctx.lineWidth = Math.max(0.15, 0.8 / unit);
  ctx.beginPath();
  for (let wire = 0; wire < 4; wire++) {
    const x = deckStart + wires.first + ((wires.last - wires.first) * wire) / 3;
    ctx.moveTo(x, front - 0.15);
    ctx.lineTo(x + 0.8, back + 0.15);
    // The sheave the wire runs over, at the deck edge.
    ctx.moveTo(x - 0.4, front + 0.5);
    ctx.lineTo(x + 0.4, front + 0.5);
  }
  ctx.stroke();
}

/**
 * Which edge of the deck is the starboard one, where the island stands:
 * the near edge steaming right, the far one steaming left.
 */
function starboardEdge(ship: Ship, front: number, back: number): number {
  return ship.direction === 1 ? front : back;
}

/**
 * The island: a house with a row of scuttles, the bridge on its roof
 * reaching out over the deck forward, the funnel aft of it and a tripod
 * mast over the bridge. By night the bridge windows and the masthead
 * light glow.
 */
function paintIsland(
  ctx: CanvasRenderingContext2D,
  island: Island,
  fleet: Fleet,
  paint: ShipPaint,
  base: number,
  unit: number,
) {
  const night = paint.palette.daylight < 0.5;
  const roof = base - island.height;
  const left = island.at - island.length / 2;
  paintFunnel(ctx, island.funnel, fleet, roof);
  const wall = ctx.createLinearGradient(0, roof, 0, base);
  wall.addColorStop(0, fleet.superstructure);
  wall.addColorStop(1, shade(fleet.superstructure, -0.18));
  ctx.fillStyle = wall;
  ctx.beginPath();
  ctx.moveTo(left, base);
  ctx.lineTo(left + 1.2, roof);
  ctx.lineTo(left + island.length, roof);
  ctx.lineTo(left + island.length, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = withAlpha(fleet.trim, 0.6);
  for (let x = left + 2.5; x < left + island.length - 1; x += 2.6) {
    ctx.beginPath();
    ctx.arc(x, base - island.height * 0.45, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const { bridge } = island;
  const bridgeLeft = bridge.at - bridge.width / 2;
  const bridgeTop = roof - bridge.height;
  ctx.fillStyle = shade(fleet.superstructure, 0.06);
  ctx.fillRect(bridgeLeft, bridgeTop, bridge.width, bridge.height);
  ctx.fillStyle = withAlpha(fleet.trim, 0.85);
  ctx.fillRect(bridgeLeft - 0.4, bridgeTop - 0.5, bridge.width + 0.8, 0.6);
  ctx.fillRect(left, roof - 0.3, island.length, 0.5);
  for (let x = bridgeLeft + 0.8; x < bridgeLeft + bridge.width - 0.8; x += 1.6) {
    ctx.fillStyle = night ? paint.palette.window : withAlpha(fleet.trim, 0.7);
    ctx.fillRect(x, bridgeTop + 0.7, 1, 1);
  }
  paintIslandMast(ctx, island.mast, fleet, bridgeTop, unit, night);
}

/** The island's tripod mast over the bridge, with its yard and the masthead light by night. */
function paintIslandMast(
  ctx: CanvasRenderingContext2D,
  mast: Mast,
  fleet: Fleet,
  roof: number,
  unit: number,
  night: boolean,
) {
  const top = roof - mast.height;
  ctx.strokeStyle = fleet.trim;
  ctx.lineWidth = Math.max(0.25, 1.2 / unit);
  ctx.beginPath();
  ctx.moveTo(mast.at, roof);
  ctx.lineTo(mast.at, top);
  ctx.moveTo(mast.at - 2.2, roof);
  ctx.lineTo(mast.at, top + mast.height * 0.4);
  ctx.moveTo(mast.at - 3, top + 2);
  ctx.lineTo(mast.at + 3, top + 2);
  ctx.stroke();
  if (!night) return;
  const glow = ctx.createRadialGradient(mast.at, top, 0, mast.at, top, 2.4);
  glow.addColorStop(0, '#fff6d8');
  glow.addColorStop(1, withAlpha('#fff6d8', 0));
  ctx.fillStyle = glow;
  ctx.fillRect(mast.at - 2.4, top - 2.4, 4.8, 4.8);
}

/** Lights along the deck edges: glowing by night, and green over the wires when the assist is on. */
function paintDeckLights(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  paint: ShipPaint,
  stern: number,
  bow: number,
  front: number,
  back: number,
) {
  const night = paint.palette.daylight < 0.5;
  const assist = paint.world.rules.landingAssist;
  if (!night && !assist) return;
  const { length, island } = shipLayout(ship.kind);
  const deckStart = -length / 2;
  const wires = wireWindow(paint.world);
  const starboard = starboardEdge(ship, front, back);
  for (let x = stern + 4; x < bow - 1; x += 9) {
    const overWires = x >= deckStart + wires.first - 1 && x <= deckStart + wires.last + 1;
    // By day only the wires are lit, and only for the assist.
    if (!night && !overWires) continue;
    const colour = overWires && assist ? '#7dff9a' : '#fff1c8';
    for (const y of [front, back]) {
      // None where the island stands on the edge.
      if (island && y === starboard && Math.abs(x - island.at) < island.length / 2 + 1) continue;
      const radius = night ? (y === front ? 1.1 : 0.7) : 0.8;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, colour);
      glow.addColorStop(1, withAlpha(colour, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
}

/**
 * The signalman on his platform at the stern, a flag in each hand: arms
 * level when the pilot is on the glide path, both up when too high, both
 * down when too low. He only signals to a plane of this carrier's on its
 * way in.
 */
function paintSignalman(
  ctx: CanvasRenderingContext2D,
  ship: Ship,
  paint: ShipPaint,
  x: number,
  deck: number,
  unit: number,
) {
  const cue = landingCue(ship, paint.focus);
  const y = deck - 0.2;
  ctx.strokeStyle = paint.palette.ink;
  ctx.lineWidth = Math.max(0.2, 1 / unit);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 2.4);
  const arm = cue === null ? 1.2 : cue === 'high' ? -1.6 : cue === 'low' ? 1.6 : 0;
  ctx.moveTo(x - 1.6, y - 2 + arm * 0.6);
  ctx.lineTo(x, y - 2);
  ctx.lineTo(x + 1.6, y - 2 + arm * 0.6);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = paint.palette.ink;
  ctx.beginPath();
  ctx.arc(x, y - 3, 0.55, 0, Math.PI * 2);
  ctx.fill();
  if (cue === null) return;
  const flag = cue === 'on' ? '#7dff9a' : '#ffb43c';
  for (const side of [-1, 1]) {
    ctx.fillStyle = flag;
    ctx.fillRect(x + side * 1.6 - 0.6, y - 2 + arm * 0.6 - 1.1, 1.2, 1.1);
  }
}

/**
 * Pilots in the water being fetched: the pilot bobbing in a life jacket,
 * and the destroyer's boat pulling out to them, picking them up at four
 * seconds and rowing back.
 */
export function paintRescues(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
  rescues: readonly Rescue[],
  time: number,
) {
  const sea = world.map.sea?.level;
  if (sea === undefined) return;
  const unit = camera.scale;
  for (const rescue of rescues) {
    if (rescue.ship === null) {
      paintSelfRescue(ctx, camera, palette, rescue, sea, time);
      continue;
    }
    const ship = world.ships.find((candidate) => candidate.id === rescue.ship);
    if (!ship) continue;
    const out = Math.min(1, rescue.age / 4);
    const back = Math.max(0, (rescue.age - 5.2) / 3.8);
    const boatX = ship.x + (rescue.x - ship.x) * (out - back);
    const bob = Math.sin(time * 2.4 + rescue.x) * 0.3;
    if (rescue.age < 5.2) {
      // The pilot: a head and a bright life jacket, arms waving now and then.
      const x = camera.x(rescue.x);
      const y = camera.y(sea + 0.4 + bob);
      ctx.fillStyle = '#f2b13c';
      ctx.beginPath();
      ctx.ellipse(x, y, unit * 0.9, unit * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.ink;
      ctx.beginPath();
      ctx.arc(x, y - unit * 0.8, unit * 0.45, 0, Math.PI * 2);
      ctx.fill();
      if (Math.sin(time * 5) > 0.2) {
        ctx.strokeStyle = palette.ink;
        ctx.lineWidth = Math.max(1, unit * 0.25);
        ctx.beginPath();
        ctx.moveTo(x + unit * 0.4, y - unit * 0.4);
        ctx.lineTo(x + unit * 1.1, y - unit * 1.6);
        ctx.stroke();
      }
    }
    const toward: 1 | -1 = rescue.x >= ship.x ? 1 : -1;
    const facing: 1 | -1 = back > 0 ? (toward === 1 ? -1 : 1) : toward;
    paintBoat(ctx, camera, palette, boatX, sea + bob * 0.5, facing, rescue.age >= 4, time, unit);
  }
}

/**
 * A cartoon pilot in the water: up in a rubber ring with a splash, waving
 * both arms, then off on a little raft, paddling hard and smiling.
 */
function paintSelfRescue(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  rescue: Rescue,
  sea: number,
  time: number,
) {
  const unit = camera.scale;
  const paddling = Math.max(0, rescue.age - 2.5);
  const x = camera.x(rescue.x + paddling * 3);
  const y = camera.y(sea + Math.sin(time * 3 + rescue.x) * 0.35);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(unit, unit);
  if (rescue.age < 0.8) {
    // The splash ring as they bob up.
    ctx.strokeStyle = withAlpha(palette.sea.foam, 1 - rescue.age / 0.8);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.ellipse(0, 0.2, 2 + rescue.age * 6, 0.6 + rescue.age, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (paddling > 0) {
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.ellipse(0, 0.1, 2.6, 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#f26a4c';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, -0.2, 1.3, 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(0, -1.2, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const wave = Math.sin(time * 9) * 0.5;
  if (paddling > 0) {
    // Paddling: one arm down to the water on each stroke.
    ctx.moveTo(0.2, -0.8);
    ctx.lineTo(1.4 + wave, 0.2);
  } else {
    ctx.moveTo(-0.3, -0.9);
    ctx.lineTo(-1.1 - wave, -2.2);
    ctx.moveTo(0.3, -0.9);
    ctx.lineTo(1.1 + wave, -2.2);
  }
  ctx.stroke();
  ctx.restore();
}

/** A ship's boat: a white whaler with its crew at the oars, the rescued pilot aboard on the way back. */
function paintBoat(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  x: number,
  y: number,
  facing: 1 | -1,
  laden: boolean,
  time: number,
  unit: number,
) {
  ctx.save();
  ctx.translate(camera.x(x), camera.y(y));
  ctx.scale(unit * facing, unit);
  ctx.fillStyle = mix('#f4efe2', palette.sea.deep, 1 - (0.4 + palette.daylight * 0.6));
  ctx.beginPath();
  ctx.moveTo(-3.2, -1.2);
  ctx.lineTo(3.6, -1.4);
  ctx.quadraticCurveTo(2.8, 0.6, 1.5, 0.6);
  ctx.lineTo(-2.4, 0.6);
  ctx.quadraticCurveTo(-3.2, 0.2, -3.2, -1.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.ink;
  const rowers = laden ? [-1.6, 0, 1.6] : [-0.8, 0.8];
  for (const at of rowers) {
    ctx.beginPath();
    ctx.arc(at, -2.2, 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = withAlpha(palette.ink, 0.8);
  ctx.lineWidth = 0.25;
  const stroke = Math.sin(time * 4) * 0.8;
  ctx.beginPath();
  ctx.moveTo(-0.5, -1.2);
  ctx.lineTo(-2.5 + stroke, 0.7);
  ctx.stroke();
  ctx.restore();
}

/** High, low or on the glide path, for this carrier's plane on its way in; null with nobody coming. */
export function landingCue(ship: Ship, plane: Plane | null): 'high' | 'low' | 'on' | null {
  if (!plane || plane.state !== 'flying' || plane.base.carrier !== ship.index) return null;
  const astern = -offsetOnDeck(ship, plane.x);
  const along = cosine(plane.heading) * ship.direction > 0.3;
  if (!along || astern < -10 || astern > 260) return null;
  const path = deckHeight(ship) + 4.5 + Math.max(0, astern + 20) * 0.13;
  const error = plane.y - path;
  if (error > 4) return 'high';
  if (error < -3) return 'low';
  return 'on';
}
