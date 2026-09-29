import { BELL_RADIUS, CRATE_SIZE, HOOP_RADIUS } from '../engine/targets';
import { withAlpha } from './palette';

/**
 * Trick Shot's targets, drawn in code: a wooden crate with a banana
 * stencilled on it, a brass bell under a little gallows, a neon hoop
 * hanging in the air, and a landing pad painted across a roof. A struck
 * crate is gone, a struck bell drops off its hook and lies on the roof, a
 * threaded hoop flares, and a pad lights up when a banana lands on it.
 */
export interface TargetMark {
  kind: 'crate' | 'bell' | 'hoop' | 'pad';
  x: number;
  y: number;
  /** Its index in the engine's list; a pad is not an engine target. */
  engineIndex: number | null;
  /** How far a pad reaches either side of its middle, in world units. */
  reach?: number;
}

/** A target placed in a city, as a puzzle describes it; a dummy gorilla needs no mark. */
export interface PlacedMark {
  kind: TargetMark['kind'] | 'dummy';
  centre: { x: number; y: number };
  engineIndex?: number;
}

export function marksFor(targets: readonly PlacedMark[], padReach: number): TargetMark[] {
  return targets.flatMap((target): TargetMark[] =>
    target.kind === 'dummy'
      ? []
      : [
          {
            kind: target.kind,
            x: target.centre.x,
            y: target.centre.y,
            engineIndex: target.engineIndex ?? null,
            reach: target.kind === 'pad' ? padReach : undefined,
          },
        ],
  );
}

interface MarkState {
  mark: TargetMark;
  struck: boolean;
  /** Seconds since it was struck (or lit), for its animation. */
  since: number;
  /** A struck bell's fall. */
  drop: number;
}

const WOOD = '#b0773c';
const WOOD_DARK = '#6e4520';
const BRASS = '#f2c14e';
const BRASS_DARK = '#8f6516';
const HOOP = '#ff6fd8';
const PAD_OUTER = '#ffd23f';
const PAD_INNER = '#ff5d5d';
const GALLOWS_HEIGHT = 26;
const BELL_FALL = 16;

export class TargetView {
  private readonly marks: MarkState[];

  constructor(marks: readonly TargetMark[]) {
    this.marks = marks.map((mark) => ({ mark, struck: false, since: 0, drop: 0 }));
  }

  /** Every target whole again, for the next attempt. */
  reset() {
    for (const state of this.marks) {
      state.struck = false;
      state.since = 0;
      state.drop = 0;
    }
  }

  /** An engine target was reached; returns it so the caller can add sparks and sound. */
  strike(engineIndex: number): TargetMark | null {
    const state = this.marks.find((candidate) => candidate.mark.engineIndex === engineIndex);
    if (!state) return null;
    state.struck = true;
    state.since = 0;
    return state.mark;
  }

  /** A banana came down here: a pad under it lights up. */
  landed(x: number, y: number): TargetMark | null {
    const pad = this.marks.find(
      ({ mark }) =>
        mark.kind === 'pad' &&
        Math.abs(x - mark.x) <= (mark.reach ?? 0) &&
        Math.abs(y - mark.y) < 12,
    );
    if (!pad) return null;
    pad.struck = true;
    pad.since = 0;
    return pad.mark;
  }

  update(delta: number) {
    for (const state of this.marks) {
      state.since += delta;
      if (state.struck && state.mark.kind === 'bell') {
        state.drop = Math.min(BELL_FALL, state.drop + delta * (40 + state.since * 220));
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number, reducedMotion: boolean) {
    for (const state of this.marks) {
      switch (state.mark.kind) {
        case 'pad':
          drawPad(ctx, state, time, reducedMotion);
          break;
        case 'crate':
          if (!state.struck) drawCrate(ctx, state.mark);
          break;
        case 'bell':
          drawBell(ctx, state, time, reducedMotion);
          break;
        case 'hoop':
          drawHoop(ctx, state, time, reducedMotion);
          break;
      }
    }
  }
}

function drawCrate(ctx: CanvasRenderingContext2D, mark: TargetMark) {
  const half = CRATE_SIZE / 2;
  const left = mark.x - half;
  const top = mark.y - half;
  ctx.fillStyle = WOOD;
  ctx.fillRect(left, top, CRATE_SIZE, CRATE_SIZE);
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(left + 0.4, top + 0.4, CRATE_SIZE - 0.8, CRATE_SIZE - 0.8);
  // Planks and a cross brace.
  ctx.beginPath();
  ctx.moveTo(left, mark.y);
  ctx.lineTo(left + CRATE_SIZE, mark.y);
  ctx.moveTo(left + 1, top + 1);
  ctx.lineTo(left + CRATE_SIZE - 1, top + CRATE_SIZE - 1);
  ctx.stroke();
  ctx.strokeStyle = '#ffe16a';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(mark.x - 0.5, mark.y - 3.2, 3.6, 0.35 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

function drawBell(
  ctx: CanvasRenderingContext2D,
  state: MarkState,
  time: number,
  reducedMotion: boolean,
) {
  const { mark } = state;
  const roof = mark.y + 14;
  const beamY = roof - GALLOWS_HEIGHT;
  // The gallows: a post, a beam and a short hook.
  ctx.strokeStyle = '#4a3a58';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(mark.x + 9, roof);
  ctx.lineTo(mark.x + 9, beamY);
  ctx.lineTo(mark.x - 2, beamY);
  ctx.moveTo(mark.x, beamY);
  ctx.lineTo(mark.x, mark.y - BELL_RADIUS);
  ctx.stroke();

  const ringing = state.struck ? Math.max(0, 1 - state.since / 1.2) : 0;
  const sway = reducedMotion
    ? 0
    : Math.sin(time * (ringing > 0 ? 18 : 1.6)) * (0.06 + ringing * 0.5);
  const hang = state.struck ? state.drop : 0;
  ctx.save();
  ctx.translate(mark.x, mark.y - BELL_RADIUS + hang);
  ctx.rotate(state.struck && state.drop >= BELL_FALL ? 1.2 : sway);
  const body = ctx.createLinearGradient(-BELL_RADIUS, 0, BELL_RADIUS, 0);
  body.addColorStop(0, BRASS_DARK);
  body.addColorStop(0.45, BRASS);
  body.addColorStop(1, BRASS_DARK);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-1.8, 0);
  ctx.quadraticCurveTo(-BELL_RADIUS, 1, -BELL_RADIUS - 0.8, BELL_RADIUS * 2);
  ctx.lineTo(BELL_RADIUS + 0.8, BELL_RADIUS * 2);
  ctx.quadraticCurveTo(BELL_RADIUS, 1, 1.8, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BRASS_DARK;
  ctx.beginPath();
  ctx.arc(0, BELL_RADIUS * 2 + 0.6, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (ringing > 0 && !reducedMotion) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(BRASS, ringing * 0.8);
    ctx.lineWidth = 1;
    for (const ring of [1, 2]) {
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, 7 + (1 - ringing) * 16 * ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHoop(
  ctx: CanvasRenderingContext2D,
  state: MarkState,
  time: number,
  reducedMotion: boolean,
) {
  const { mark } = state;
  const flare = state.struck ? Math.max(0, 1 - state.since / 0.8) : 0;
  const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time * 3);
  const colour = state.struck ? '#7dff8a' : HOOP;
  ctx.save();
  // A thin wire it hangs from, up out of the picture.
  ctx.strokeStyle = withAlpha('#d8d0f0', 0.35);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(mark.x, mark.y - HOOP_RADIUS - 2);
  ctx.lineTo(mark.x, mark.y - 80);
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(colour, 0.25 + 0.2 * pulse + flare * 0.5);
  ctx.lineWidth = 5 + flare * 6;
  ctx.beginPath();
  ctx.arc(mark.x, mark.y, HOOP_RADIUS + 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = withAlpha('#ffffff', 0.85);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(mark.x, mark.y, HOOP_RADIUS + 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawPad(
  ctx: CanvasRenderingContext2D,
  state: MarkState,
  time: number,
  reducedMotion: boolean,
) {
  const { mark } = state;
  const reach = mark.reach ?? 30;
  const lit = state.struck ? Math.max(0.35, 1 - state.since / 1.5) : 0;
  const glow = reducedMotion ? 0.6 : 0.55 + 0.25 * Math.sin(time * 2.4);
  ctx.save();
  // Painted stripes across the roof: the outer zone, the inner metre, and the bullseye.
  const stripes: [number, string][] = [
    [reach, PAD_OUTER],
    [reach / 2, '#ffffff'],
    [reach / 6, PAD_INNER],
  ];
  for (const [half, colour] of stripes) {
    ctx.fillStyle = colour;
    ctx.fillRect(mark.x - half, mark.y - 2.2, half * 2, 3);
  }
  ctx.globalCompositeOperation = 'lighter';
  const beam = ctx.createLinearGradient(0, mark.y, 0, mark.y - 30);
  beam.addColorStop(0, withAlpha(PAD_OUTER, 0.4 * glow + lit * 0.5));
  beam.addColorStop(1, withAlpha(PAD_OUTER, 0));
  ctx.fillStyle = beam;
  ctx.fillRect(mark.x - reach, mark.y - 30, reach * 2, 30);
  ctx.restore();
  // A little flag marks the middle.
  ctx.strokeStyle = '#e8e0f0';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(mark.x, mark.y - 1);
  ctx.lineTo(mark.x, mark.y - 12);
  ctx.stroke();
  ctx.fillStyle = PAD_INNER;
  ctx.beginPath();
  ctx.moveTo(mark.x, mark.y - 12);
  ctx.lineTo(mark.x + 6, mark.y - 10);
  ctx.lineTo(mark.x, mark.y - 8);
  ctx.closePath();
  ctx.fill();
}
