import { describe, expect, it } from 'vitest';
import { DONKEY_DEPTH, WINNING_CLIMB } from '../engine/constants';
import { laneLateral, LANE_POSITIONS } from '../engine/road';
import { revealGap } from '../engine/sight';
import { chaseLayout } from './chase-view';
import { classicLayout } from './classic-view';
import { LANE_METRES } from './lanes';
import { isoLayout } from './iso-view';
import { hudInsets } from './stage';
import type { Box, Viewport, ViewLayout } from './view';

/**
 * Fairness: every camera view shows exactly the same stretch of road ahead,
 * so a donkey is on screen for exactly the same reaction window whichever
 * view is chosen. A donkey standing on the sight line must be whole, inside
 * the screen and clear of the HUD, in every view, on every screen shape, at
 * every point of the duel's climb.
 */
const SCREENS = [
  [1440, 900],
  [1024, 768],
  [844, 390],
  [390, 844],
] as const;

const viewports: Viewport[] = SCREENS.map(([width, height]) => ({
  width,
  height,
  ...hudInsets(width, height),
}));

const CLIMBS = Array.from({ length: WINNING_CLIMB }, (_, climb) => climb);
/** Every lane position the road may open, W to Z, and the points between them. */
const OUTERMOST = laneLateral(LANE_POSITIONS - 1);
const LATERALS = Array.from(
  { length: 2 * LANE_POSITIONS - 1 },
  (_, index) => -OUTERMOST + index / 2,
);

function expectInside(box: Box, viewport: Viewport, what: string) {
  expect(box.x, `${what}: left edge`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${what}: right edge`).toBeLessThanOrEqual(viewport.width);
  expect(box.y, `${what}: top edge (under the HUD)`).toBeGreaterThanOrEqual(viewport.insetTop);
  expect(box.y + box.height, `${what}: bottom edge`).toBeLessThanOrEqual(viewport.height);
}

const VIEWS: [string, (viewport: Viewport, climb: number) => ViewLayout][] = [
  ['classic', classicLayout],
  ['chase', chaseLayout],
  ['chase, two cars', (viewport, climb) => chaseLayout(viewport, climb, true)],
  ['iso', isoLayout],
];

describe.each(VIEWS)('the %s view', (_, layoutOf) => {
  it.each(viewports.map((viewport) => [`${viewport.width}×${viewport.height}`, viewport] as const))(
    'shows the sight distance, and a donkey on the sight line whole, at %s',
    (_, viewport) => {
      for (const climb of CLIMBS) {
        const layout = layoutOf(viewport, climb);
        expect(layout.sightAhead).toBe(revealGap(climb));
        for (const lateral of LATERALS) {
          const where = `climb ${climb}, lateral ${lateral}`;
          expectInside(
            layout.donkeyBox(layout.sightAhead, lateral),
            viewport,
            `sight line, ${where}`,
          );
          expectInside(
            layout.donkeyBox(layout.sightAhead / 2, lateral),
            viewport,
            `halfway, ${where}`,
          );
        }
      }
    },
  );

  it('moves a donkey steadily up the screen as it gets further away', () => {
    const [viewport] = viewports as [Viewport];
    const layout = layoutOf(viewport, 0);
    let previous = Infinity;
    for (let gap = 0; gap <= layout.sightAhead; gap += 0.5) {
      const bottom = layout.donkeyBox(gap, 0).y + layout.donkeyBox(gap, 0).height;
      expect(bottom).toBeLessThan(previous);
      previous = bottom;
    }
  });
});

describe('each view marks the sight line itself', () => {
  it('Classic: the hedgerow edge, where donkeys step out', () => {
    for (const viewport of viewports) {
      for (const climb of CLIMBS) {
        const layout = classicLayout(viewport, climb);
        // The donkey's near edge meets the sight line exactly as it comes into view.
        expect(layout.y(layout.sightAhead)).toBeCloseTo(layout.sightY, 6);
      }
    }
  });

  it.each([false, true])(
    'Chase: the crest of the hill, for every lane, bend and camera sway (two cars: %s)',
    (twoCars) => {
      for (const viewport of viewports) {
        for (const climb of CLIMBS) {
          const layout = chaseLayout(viewport, climb, twoCars);
          expect(layout.depthOf(layout.sightAhead)).toBeCloseTo(layout.crestDepth, 6);
          // The camera follows the cars 60 % of the way across the band, and the road bends at most this much.
          const sway = OUTERMOST * LANE_METRES * 0.6;
          const reach = OUTERMOST * LANE_METRES;
          for (const curve of [-0.0033, 0, 0.0033]) {
            for (const across of [-reach - sway, reach + sway]) {
              const foot = layout.project(
                layout.depthOf(layout.sightAhead + DONKEY_DEPTH / 2),
                across,
                0,
                curve,
              );
              expect(foot.x - foot.scale).toBeGreaterThanOrEqual(0);
              expect(foot.x + foot.scale).toBeLessThanOrEqual(viewport.width);
              expect(foot.y - foot.scale * 1.95).toBeGreaterThanOrEqual(viewport.insetTop);
            }
          }
        }
      }
    },
  );

  it('Isometric: where the road runs off the edge of the screen', () => {
    for (const viewport of viewports) {
      const layout = isoLayout(viewport, 0);
      // The outermost lane on one side or the other just fits: the diorama shows no road beyond it.
      const gaps = [-OUTERMOST, OUTERMOST].map((lateral) => {
        const box = layout.donkeyBox(layout.sightAhead, lateral);
        return Math.min(viewport.width - (box.x + box.width), box.y - viewport.insetTop);
      });
      expect(Math.min(...gaps)).toBeLessThan(layout.projection.unit * 4);
    }
  });
});
