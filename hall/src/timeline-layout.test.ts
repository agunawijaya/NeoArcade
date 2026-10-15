import { describe, expect, it } from 'vitest';
import {
  assignLanes,
  axisYears,
  centreOf,
  fitMarkers,
  positionOf,
  timelineRange,
} from './timeline-layout';

describe('timelineRange', () => {
  it('starts in 1980 and ends on a round year past the newest original', () => {
    expect(
      timelineRange([
        { from: 1981, to: 1981 },
        { from: 1990, to: 1990 },
      ]),
    ).toEqual({
      from: 1980,
      to: 1995,
    });
    expect(timelineRange([{ from: 2002, to: 2002 }])).toEqual({ from: 1980, to: 2005 });
    expect(timelineRange([{ from: 2003, to: 2003 }])).toEqual({ from: 1980, to: 2010 });
    expect(timelineRange([])).toEqual({ from: 1980, to: 1995 });
  });
});

describe('positions', () => {
  it('places years along the axis and markers in the middle of their span', () => {
    const range = { from: 1980, to: 1995 };
    expect(positionOf(1980, range)).toBe(0);
    expect(positionOf(1995, range)).toBe(1);
    expect(positionOf(1983, range)).toBeCloseTo(0.2);
    expect(centreOf({ from: 1981, to: 1984 })).toBe(1982.5);
    expect(centreOf({ from: 1990, to: 1990 })).toBe(1990);
  });

  it('labels every fifth year', () => {
    const years = axisYears({ from: 1980, to: 1990 });
    expect(years).toHaveLength(11);
    expect(years.filter((year) => year.major).map((year) => year.year)).toEqual([1980, 1985, 1990]);
  });
});

describe('assignLanes', () => {
  it('keeps neighbours that would touch apart, and reuses lanes once there is room', () => {
    // DONKEY.BAS (1981), Trucker (early 1980s, drawn at 1982.5), Gorillas (1990).
    const markers = [1981, 1982.5, 1990].map((year) => ({ from: year, to: year }));
    expect(assignLanes(markers, 2.5)).toEqual([0, 1, 0]);
  });

  it('stacks overlapping eras and lets one follow another in the same lane', () => {
    const eras = [
      { from: 1977, to: 1990 },
      { from: 1981, to: 1995 },
      { from: 1991, to: 2000 },
      { from: 1995, to: 2010 },
    ];
    expect(assignLanes(eras)).toEqual([0, 1, 0, 1]);
  });

  it('answers in the order it was asked', () => {
    const spans = [
      { from: 1990, to: 1990 },
      { from: 1981, to: 1981 },
      { from: 1982, to: 1982 },
    ];
    expect(assignLanes(spans, 2)).toEqual([0, 0, 1]);
  });
});

describe('fitMarkers', () => {
  it('keeps the narrowest track while the markers stack no more than three deep', () => {
    expect(fitMarkers([1981, 1982.5, 1990], 160)).toEqual({ yearWidth: 50, lanes: [0, 1, 0] });
  });

  it('widens the years for a crowded decade', () => {
    const crowded = [1981, 1981.5, 1982, 1982.5, 1983, 1984, 1985, 1986];
    const { yearWidth, lanes } = fitMarkers(crowded, 160);
    expect(yearWidth).toBeGreaterThan(50);
    expect(Math.max(...lanes)).toBeLessThan(3);
  });

  it('settles for the widest track when even that is crowded', () => {
    const { yearWidth } = fitMarkers([1990, 1990, 1990, 1990, 1990], 160);
    expect(yearWidth).toBe(160);
  });
});
