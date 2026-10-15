/**
 * Where things go on the Origins timeline, in years rather than pixels, so
 * the page can stretch the same layout to any width.
 */
export interface YearSpan {
  from: number;
  to: number;
}

/** The timeline always starts here: the dawn of the home computer as most players met it. */
export const TIMELINE_START = 1980;
/** It reaches at least this far, so the early-nineties eras have room to show. */
const MIN_END = 1995;
/** Years of air after the newest original. */
const RUN_OUT = 3;

/** From 1980 to a round year a little past the newest original. */
export function timelineRange(spans: readonly YearSpan[]): YearSpan {
  const latest = Math.max(MIN_END - RUN_OUT, ...spans.map((span) => span.to));
  return { from: TIMELINE_START, to: Math.ceil((latest + RUN_OUT) / 5) * 5 };
}

/** A year's place along the axis, from 0 at the start to 1 at the end. */
export function positionOf(year: number, range: YearSpan): number {
  return (year - range.from) / (range.to - range.from);
}

/** Where a marker stands: on its year, or in the middle of its span. */
export function centreOf(span: YearSpan): number {
  return (span.from + span.to) / 2;
}

/**
 * Stacks things that would overlap into lanes, lowest lane first: each
 * span goes into the first lane whose last span ends at least `gap` years
 * before it starts. Returns each span's lane, in the order given.
 */
export function assignLanes(spans: readonly YearSpan[], gap = 0): number[] {
  const order = spans.map((span, index) => ({ span, index }));
  order.sort((a, b) => a.span.from - b.span.from || a.span.to - b.span.to);
  const laneEnds: number[] = [];
  const lanes: number[] = new Array<number>(spans.length).fill(0);
  for (const { span, index } of order) {
    let lane = laneEnds.findIndex((end) => end + gap <= span.from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = span.to;
    lanes[index] = lane;
  }
  return lanes;
}

/** Every year along the axis; every fifth one is labelled. */
export function axisYears(range: YearSpan): { year: number; major: boolean }[] {
  const years: { year: number; major: boolean }[] = [];
  for (let year = range.from; year <= range.to; year++) {
    years.push({ year, major: year % 5 === 0 });
  }
  return years;
}

/** Widths of one year on the track, in pixels, narrowest first. */
export const YEAR_WIDTHS = [50, 64, 80, 100, 128, 160] as const;

/**
 * Spreads the markers out: the narrowest year width at which they stack no
 * more than `maxLanes` deep (the track scrolls sideways when that is wider
 * than the screen), with each marker's lane.
 */
export function fitMarkers(
  centres: readonly number[],
  markerWidth: number,
  maxLanes = 3,
): { yearWidth: number; lanes: number[] } {
  const spans = centres.map((centre) => ({ from: centre, to: centre }));
  const fits = YEAR_WIDTHS.map((yearWidth) => ({
    yearWidth: yearWidth as number,
    lanes: assignLanes(spans, markerWidth / yearWidth),
  }));
  return (
    fits.find((fit) => Math.max(0, ...fit.lanes) < maxLanes) ?? (fits.at(-1) as (typeof fits)[0])
  );
}
