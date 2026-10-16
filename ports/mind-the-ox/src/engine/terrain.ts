import { CEILING } from './constants';

/** A crater as the views draw it: where it is, how wide, and when it was made. */
export interface CraterMark {
  x: number;
  radius: number;
  tick: number;
}

/** How deep a blast digs, across its width, as a share of its full depth. */
const CRATER_PROFILE = [0.35, 0.7, 0.9, 1, 1, 0.9, 0.7, 0.35];

/** Craters never dig further than this below the ground as it was made, nor below bedrock. */
const MAX_CRATER_DEPTH = 20;
const BEDROCK = 12;

/**
 * The ground: one height per world unit across the strip, with the height
 * it started at kept aside so craters can be limited. Heights between whole
 * units are interpolated, so the ground is a continuous line.
 */
export class Terrain {
  readonly width: number;
  private readonly heights: Float64Array;
  private readonly original: Float64Array;
  private readonly marks: CraterMark[] = [];
  /** Goes up by one with every crater, so a view knows to redraw the ground. */
  revision = 0;

  /**
   * `hardened` stretches (the runways) take scorch marks but never dig in:
   * a crater on a runway would wreck every plane that took off after it.
   * `water` stretches are sea: their height is the surface, and nothing
   * digs into it.
   */
  constructor(
    heights: readonly number[],
    private readonly hardened: readonly { left: number; right: number }[] = [],
    private readonly water: readonly { left: number; right: number }[] = [],
  ) {
    this.width = heights.length;
    this.heights = Float64Array.from(heights);
    this.original = Float64Array.from(heights);
  }

  /** Whether the surface under x is the sea. */
  isWater(x: number): boolean {
    return this.water.some(({ left, right }) => x >= left && x <= right);
  }

  /** The ground height under x; off either end of the world the walls go up past the ceiling. */
  heightAt(x: number): number {
    if (!(x >= 0) || x > this.width - 1) return CEILING * 2;
    const left = Math.floor(x);
    const fraction = x - left;
    const low = this.heights[left] as number;
    if (fraction === 0) return low;
    return low + ((this.heights[left + 1] as number) - low) * fraction;
  }

  /** The highest ground between two x positions, both included. */
  highestBetween(fromX: number, toX: number): number {
    const start = Math.max(0, Math.floor(Math.min(fromX, toX)));
    const end = Math.min(this.width - 1, Math.ceil(Math.max(fromX, toX)));
    let highest = start > end ? CEILING * 2 : 0;
    for (let x = start; x <= end; x++) highest = Math.max(highest, this.heights[x] as number);
    return highest;
  }

  originalHeightAt(x: number): number {
    const column = Math.min(this.width - 1, Math.max(0, Math.round(x)));
    return this.original[column] as number;
  }

  /**
   * Blasts a crater centred on x: eight units across, `depth` deep at the
   * middle, never more than twenty below the original ground.
   */
  carve(x: number, depth: number, tick: number): void {
    const start = Math.round(x) - CRATER_PROFILE.length / 2;
    let changed = false;
    CRATER_PROFILE.forEach((share, index) => {
      const column = start + index;
      if (column < 0 || column >= this.width) return;
      if (this.hardened.some(({ left, right }) => column >= left && column <= right)) return;
      if (this.isWater(column)) return;
      const floor = Math.max(BEDROCK, (this.original[column] as number) - MAX_CRATER_DEPTH);
      const current = this.heights[column] as number;
      const next = Math.max(floor, current - depth * share);
      if (next < current) {
        this.heights[column] = next;
        changed = true;
      }
    });
    this.marks.push({ x, radius: CRATER_PROFILE.length / 2 + depth, tick });
    if (changed) this.revision++;
  }

  get craters(): readonly CraterMark[] {
    return this.marks;
  }

  /** A copy of every height, for views that build their own ground mesh. */
  snapshot(): Float64Array {
    return Float64Array.from(this.heights);
  }
}
