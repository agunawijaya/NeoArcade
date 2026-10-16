import {
  CEILING,
  MAX_BOMBS,
  MAX_BURSTS,
  MAX_FUEL,
  MAX_MISSILES,
  MAX_ROUNDS,
  MAX_THROTTLE,
} from '../engine/constants';
import { SHIP_CLASSES } from '../engine/fleet';
import { inFog } from '../engine/map';
import { TURN } from '../engine/trig';
import type { Plane, World } from '../engine/world';
import type { Palette } from './palette';
import { mix, shade, withAlpha } from './side/colour';
import type { Viewport, WorldWindow } from './view';

/**
 * The instrument panel along the top and the world strip along the bottom
 * (1984's "world display"), painted on a canvas over either view. Brass
 * bezels, cream dial faces and a period serif, so it reads as part of the
 * aeroplane rather than a web page.
 */
export interface HudState {
  world: World;
  plane: Plane | null;
  score: number;
  round: number;
  /** What each round is called on the panel, e.g. "Round 2" or a chapter name. */
  roundLabel: string;
  secretWeapons: boolean;
  window: WorldWindow;
  palette: Palette;
  time: number;
  /** The side this view's pilot flies for: friends are blue on the strip, the enemy red. */
  friendlySide: 0 | 1;
  /** A mission's objectives and how far along they are, in a few words; null in 1984's battles. */
  objective: string | null;
}

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const BRASS = '#c9a458';
const BRASS_DARK = '#7a5c2a';
const DIAL = '#f3ead2';
const DIAL_INK = '#2c2418';
const STALL_RED = '#c8412f';

export function paintHud(ctx: CanvasRenderingContext2D, viewport: Viewport, state: HudState) {
  paintPanel(ctx, viewport, state);
  paintStrip(ctx, viewport, state);
}

function paintPanel(ctx: CanvasRenderingContext2D, viewport: Viewport, state: HudState) {
  const { width } = viewport;
  const height = viewport.insetTop;
  const night = state.palette.daylight < 0.5;
  // A strip of varnished plywood with a brass edge.
  const wood = ctx.createLinearGradient(0, 0, 0, height);
  wood.addColorStop(0, night ? '#2a2018' : '#5e4128');
  wood.addColorStop(1, night ? '#1a140f' : '#3f2b1b');
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = withAlpha('#000000', 0.18);
  ctx.lineWidth = 1;
  for (let grain = 6; grain < height; grain += 5) {
    ctx.beginPath();
    ctx.moveTo(0, grain + Math.sin(grain) * 2);
    ctx.bezierCurveTo(width * 0.3, grain - 2, width * 0.6, grain + 3, width, grain);
    ctx.stroke();
  }
  ctx.fillStyle = BRASS;
  ctx.fillRect(0, height - 3, width, 3);
  ctx.fillStyle = BRASS_DARK;
  ctx.fillRect(0, height - 1, width, 1);

  const compact = width < 900;
  const plane = state.plane;
  const pad = compact ? 10 : 18;
  const radius = Math.min(height * 0.38, compact ? 20 : 24);
  const centreY = height / 2 - 1;

  // Score and round on an engraved plate.
  ctx.fillStyle = DIAL;
  ctx.font = `700 ${compact ? 22 : 28}px ${SERIF}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(state.score.toLocaleString('en-US'), pad, centreY - (compact ? 6 : 8));
  ctx.font = `600 ${compact ? 10 : 11}px ${SERIF}`;
  ctx.fillStyle = withAlpha(DIAL, 0.75);
  ctx.fillText(state.roundLabel.toUpperCase(), pad + 1, centreY + (compact ? 12 : 15));

  // Planes left in the hangar.
  let x = pad + (compact ? 92 : 132);
  if (plane) {
    const left = Number.isFinite(plane.maxCrashes) ? plane.maxCrashes - plane.crashes : 0;
    for (let index = 0; index < Math.max(0, left); index++)
      paintPlaneIcon(ctx, x + index * (compact ? 15 : 20), centreY, compact ? 0.8 : 1);
    const slots = Number.isFinite(plane.maxCrashes) ? Math.max(5, plane.maxCrashes) : 5;
    x += slots * (compact ? 15 : 20) + (compact ? 6 : 14);
  }

  if (!plane) return;
  const gauges: [label: string, value: number, warn: boolean][] = [
    ['FUEL', plane.fuel / MAX_FUEL, plane.fuel / MAX_FUEL < 0.15],
  ];
  for (const [label, value, warn] of gauges) {
    paintDial(
      ctx,
      x + radius,
      centreY,
      radius,
      label,
      value,
      warn ? STALL_RED : DIAL_INK,
      warn && Math.floor(state.time * 3) % 2 === 0,
    );
    x += radius * 2 + (compact ? 8 : 14);
  }
  paintAirspeed(ctx, x + radius, centreY, radius, plane, state);
  x += radius * 2 + (compact ? 10 : 16);
  paintThrottle(ctx, x, centreY, radius, plane.throttle / MAX_THROTTLE);
  x += compact ? 18 : 24;

  // Ammunition: a belt of rounds, then the racks.
  paintBelt(ctx, x, centreY - radius * 0.55, compact ? 64 : 92, plane.rounds / MAX_ROUNDS);
  if (plane.loadout === 'torpedo')
    paintTorpedo(ctx, x, centreY + radius * 0.45, plane.torpedoes > 0, compact);
  else paintRack(ctx, x, centreY + radius * 0.45, plane.bombs, MAX_BOMBS, 'bomb', compact);
  x += (compact ? 64 : 92) + (compact ? 10 : 18);
  if (state.secretWeapons) {
    paintRack(ctx, x, centreY - radius * 0.45, plane.missiles, MAX_MISSILES, 'rocket', compact);
    paintRack(ctx, x, centreY + radius * 0.45, plane.bursts, MAX_BURSTS, 'flare', compact);
    x += (compact ? 36 : 52) + (compact ? 8 : 14);
  }
  if (state.objective) paintObjective(ctx, x, centreY, width, state.objective, compact);
}

/** The mission's objectives on a strip of paper pinned to the panel, as far as it has room. */
function paintObjective(
  ctx: CanvasRenderingContext2D,
  from: number,
  centreY: number,
  width: number,
  text: string,
  compact: boolean,
) {
  // Room is left at the right-hand end for the pause and Hall buttons.
  const right = width - (compact ? 176 : 196);
  const room = right - from;
  if (room < 90) return;
  ctx.font = `600 ${compact ? 10 : 12}px ${SERIF}`;
  let line = text;
  while (line.length > 4 && ctx.measureText(line).width > room - 16) line = `${line.slice(0, -2)}…`;
  const textWidth = ctx.measureText(line).width;
  const left = right - textWidth - 16;
  ctx.fillStyle = withAlpha(DIAL, 0.92);
  ctx.fillRect(left, centreY - 10, textWidth + 16, 20);
  ctx.fillStyle = BRASS_DARK;
  ctx.beginPath();
  ctx.arc(left + 4, centreY - 6, 1.6, 0, Math.PI * 2);
  ctx.arc(left + textWidth + 12, centreY - 6, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = DIAL_INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(line, left + 8, centreY + 1);
}

/** The torpedo slung under the fuselage in place of the bomb racks: there, or gone. */
function paintTorpedo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  loaded: boolean,
  compact: boolean,
) {
  const length = compact ? 46 : 64;
  ctx.fillStyle = loaded ? '#b8b4a8' : withAlpha(DIAL, 0.14);
  ctx.beginPath();
  ctx.ellipse(x + length / 2 + 2, y, length / 2, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!loaded) return;
  ctx.fillStyle = '#6b665c';
  ctx.fillRect(x, y - 3.5, 3, 7);
  ctx.fillStyle = '#d24f33';
  ctx.beginPath();
  ctx.arc(x + length, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function paintPlaneIcon(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = DIAL;
  ctx.fillRect(-7, -1.2, 13, 2.6);
  ctx.fillRect(-2, -5, 4.5, 1.6);
  ctx.fillRect(-2.6, 2.6, 4.5, 1.4);
  ctx.beginPath();
  ctx.moveTo(-7, -1.2);
  ctx.lineTo(-8.5, -4.2);
  ctx.lineTo(-6, -1.2);
  ctx.fill();
  ctx.fillRect(6, -3.5, 1.2, 7);
  ctx.restore();
}

function bezel(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const ring = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  ring.addColorStop(0, '#f0d58e');
  ring.addColorStop(0.5, BRASS);
  ring.addColorStop(1, BRASS_DARK);
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = DIAL;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.84, 0, Math.PI * 2);
  ctx.fill();
}

/** A round gauge sweeping from 7 o'clock to 5 o'clock. */
function paintDial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  label: string,
  value: number,
  needle: string,
  flash: boolean,
) {
  bezel(ctx, x, y, radius);
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  ctx.strokeStyle = DIAL_INK;
  ctx.lineWidth = 1;
  for (let tick = 0; tick <= 8; tick++) {
    const angle = start + (sweep * tick) / 8;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * radius * 0.62, y + Math.sin(angle) * radius * 0.62);
    ctx.lineTo(x + Math.cos(angle) * radius * 0.76, y + Math.sin(angle) * radius * 0.76);
    ctx.stroke();
  }
  ctx.strokeStyle = STALL_RED;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.69, start, start + sweep * 0.15);
  ctx.stroke();
  ctx.fillStyle = flash ? STALL_RED : withAlpha(DIAL_INK, 0.8);
  ctx.font = `700 ${Math.max(7, radius * 0.3)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + radius * 0.45);
  paintNeedle(ctx, x, y, radius, start + sweep * Math.min(1, Math.max(0, value)), needle);
}

function paintNeedle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  angle: number,
  colour: string,
) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(angle) * radius * 0.15, y - Math.sin(angle) * radius * 0.15);
  ctx.lineTo(x + Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.7);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = BRASS_DARK;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

/** Airspeed, with the stall band in red below the slowest flying speed. */
function paintAirspeed(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  plane: Plane,
  state: HudState,
) {
  bezel(ctx, x, y, radius);
  const { minSpeed, maxSpeed } = state.world.tuning;
  const top = maxSpeed + 6;
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const at = (speed: number) => start + sweep * Math.min(1, Math.max(0, speed / top));
  ctx.strokeStyle = STALL_RED;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.69, start, at(minSpeed));
  ctx.stroke();
  ctx.strokeStyle = '#4f7a3a';
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.69, at(minSpeed), at(maxSpeed));
  ctx.stroke();
  const slow = plane.state === 'stalled' || (plane.state === 'flying' && plane.speed < minSpeed);
  ctx.fillStyle =
    slow && Math.floor(state.time * 4) % 2 === 0 ? STALL_RED : withAlpha(DIAL_INK, 0.8);
  ctx.font = `700 ${Math.max(7, radius * 0.3)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plane.state === 'stalled' ? 'STALL' : 'SPEED', x, y + radius * 0.45);
  paintNeedle(ctx, x, y, radius, at(plane.speed), slow ? STALL_RED : DIAL_INK);
}

/** The throttle quadrant: a brass slot with the lever's knob in it. */
function paintThrottle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  share: number,
) {
  const top = y - radius * 0.85;
  const bottom = y + radius * 0.85;
  ctx.fillStyle = '#1b130c';
  ctx.fillRect(x - 3, top, 6, bottom - top);
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 3.5, top - 0.5, 7, bottom - top + 1);
  const knobY = bottom - (bottom - top) * share;
  ctx.fillStyle = '#d24f33';
  ctx.beginPath();
  ctx.arc(x, knobY, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha('#ffffff', 0.4);
  ctx.beginPath();
  ctx.arc(x - 1.6, knobY - 1.6, 2, 0, Math.PI * 2);
  ctx.fill();
}

function paintBelt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  share: number,
) {
  const rounds = 20;
  const spacing = width / rounds;
  for (let index = 0; index < rounds; index++) {
    const full = index / rounds < share;
    ctx.fillStyle = full ? '#d9b65a' : withAlpha(DIAL, 0.12);
    ctx.fillRect(x + index * spacing, y - 4, Math.max(1.5, spacing - 1.5), 8);
    if (full) {
      ctx.fillStyle = '#8c6a2e';
      ctx.fillRect(x + index * spacing, y - 4, Math.max(1.5, spacing - 1.5), 2.5);
    }
  }
}

function paintRack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  max: number,
  kind: 'bomb' | 'rocket' | 'flare',
  compact: boolean,
) {
  const spacing = compact ? 12 : 17;
  for (let index = 0; index < max; index++) {
    const full = index < count;
    const cx = x + index * spacing + 6;
    ctx.fillStyle = full
      ? kind === 'flare'
        ? '#f2d46a'
        : kind === 'rocket'
          ? '#c8412f'
          : '#b8b4a8'
      : withAlpha(DIAL, 0.14);
    ctx.beginPath();
    if (kind === 'flare') ctx.arc(cx, y, 3.4, 0, Math.PI * 2);
    else ctx.ellipse(cx, y, compact ? 5 : 6.5, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'bomb' && full) {
      ctx.fillStyle = '#6b665c';
      ctx.fillRect(cx - (compact ? 7 : 9), y - 2.5, 3, 5);
    }
  }
}

/**
 * The whole world in a strip: the ground's outline, every airfield, target,
 * ox and flock, each plane as an arrow, and a bracket for what is on screen.
 */
function paintStrip(ctx: CanvasRenderingContext2D, viewport: Viewport, state: HudState) {
  const { world, palette } = state;
  const height = viewport.insetBottom;
  const top = viewport.height - height;
  const width = viewport.width;
  const night = palette.daylight < 0.5;
  ctx.fillStyle = night ? '#1d1712' : '#3f2b1b';
  ctx.fillRect(0, top, width, height);
  ctx.fillStyle = BRASS;
  ctx.fillRect(0, top, width, 2);

  const margin = 14;
  const mapLeft = margin;
  const mapWidth = width - margin * 2;
  const mapTop = top + 7;
  const mapHeight = height - 13;
  const parchment = night ? '#cdbf9c' : '#efe2bf';
  ctx.fillStyle = parchment;
  ctx.fillRect(mapLeft, mapTop, mapWidth, mapHeight);
  const toX = (x: number) => mapLeft + (x / world.map.width) * mapWidth;
  const toY = (y: number) =>
    mapTop + mapHeight - (Math.min(CEILING, Math.max(0, y)) / CEILING) * mapHeight;

  ctx.fillStyle = mix(palette.grass[1], '#8a7a4a', 0.4);
  ctx.beginPath();
  ctx.moveTo(mapLeft, mapTop + mapHeight);
  for (let column = 0; column <= mapWidth; column += 2) {
    const worldX = (column / mapWidth) * (world.map.width - 1);
    ctx.lineTo(mapLeft + column, toY(world.terrain.heightAt(worldX)));
  }
  ctx.lineTo(mapLeft + mapWidth, mapTop + mapHeight);
  ctx.closePath();
  ctx.fill();

  // The sea: water over its stretches, and the ships on it.
  const sea = world.map.sea;
  if (sea) {
    ctx.fillStyle = mix(palette.sea.near, parchment, 0.45);
    for (const span of sea.spans)
      ctx.fillRect(
        toX(span.left),
        toY(sea.level),
        toX(span.right) - toX(span.left),
        mapTop + mapHeight - toY(sea.level),
      );
  }

  ctx.fillStyle = withAlpha(night ? '#8a8fa8' : '#b9b7ad', 0.55);
  for (const bank of world.map.fog) {
    ctx.fillRect(
      toX(bank.left),
      toY(bank.top),
      toX(bank.right) - toX(bank.left),
      mapTop + mapHeight - toY(bank.top),
    );
  }

  const sideColour = (side: 0 | 1) => (side === state.friendlySide ? '#2d4fa0' : '#b23a2c');
  for (const base of world.map.bases) {
    ctx.fillStyle = sideColour(base.side);
    ctx.fillRect(toX(base.x) - 4, toY(world.terrain.heightAt(base.x)) - 1.5, 8, 2);
  }
  for (const target of world.targets) {
    const x = toX(target.x);
    const y = toY(target.y) - 2.5;
    if (target.standing) {
      ctx.fillStyle = sideColour(target.side);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    } else {
      ctx.strokeStyle = withAlpha(DIAL_INK, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 2);
      ctx.lineTo(x + 2, y + 2);
      ctx.moveTo(x + 2, y - 2);
      ctx.lineTo(x - 2, y + 2);
      ctx.stroke();
    }
  }
  for (const ox of world.oxen) {
    ctx.fillStyle = ox.alive ? palette.ox.hide : withAlpha(palette.ox.hide, 0.4);
    ctx.beginPath();
    ctx.ellipse(toX(ox.x), toY(ox.y) - 2, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const ship of world.ships) {
    if (ship.state === 'sunk' || ship.escaped) continue;
    const half = ((SHIP_CLASSES[ship.kind].length / 2) * mapWidth) / world.map.width;
    ctx.fillStyle =
      ship.state === 'sinking' ? withAlpha(sideColour(ship.side), 0.35) : sideColour(ship.side);
    ctx.fillRect(
      toX(ship.x) - half,
      toY(ship.y) - 2.5,
      half * 2,
      ship.kind === 'carrier' ? 3.5 : 2.5,
    );
  }
  for (const raider of world.raiders) {
    const x = toX(raider.x);
    const y = toY(raider.y);
    ctx.fillStyle = sideColour(raider.side);
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + 3, y);
    ctx.lineTo(x, y + 3);
    ctx.lineTo(x - 3, y);
    ctx.closePath();
    ctx.fill();
  }
  world.map.gates.forEach((gate, index) => {
    if (index < world.gatesPassed) return;
    ctx.strokeStyle = index === world.gatesPassed ? '#3f8a3a' : withAlpha(DIAL_INK, 0.35);
    ctx.lineWidth = index === world.gatesPassed ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(toX(gate.x), toY(gate.bottom));
    ctx.lineTo(toX(gate.x), toY(gate.top));
    ctx.stroke();
  });

  ctx.fillStyle = withAlpha(DIAL_INK, 0.55);
  for (const flock of world.flocks) {
    ctx.beginPath();
    ctx.arc(toX(flock.x), toY(flock.y), 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // What is on screen now.
  const left = toX(Math.max(0, state.window.left));
  const right = toX(Math.min(world.map.width, state.window.right));
  ctx.strokeStyle = withAlpha(DIAL_INK, 0.75);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left, mapTop + 1, right - left, mapHeight - 2);

  for (const plane of world.planes) {
    if (plane.state === 'out' || plane.ghost) continue;
    // What is in the fog is not on the map either, unless it is ours.
    if (plane.side !== state.friendlySide && inFog(world.map, plane.x, plane.y)) continue;
    const x = toX(plane.x);
    const y = toY(plane.y);
    const angle = -(plane.heading / TURN) * Math.PI * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle =
      plane === state.plane ? shade(sideColour(plane.side), 0.2) : sideColour(plane.side);
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-3.5, -3.2);
    ctx.lineTo(-3.5, 3.2);
    ctx.closePath();
    ctx.fill();
    if (plane === state.plane) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}
