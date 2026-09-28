import './rank.css';
import { RANKS, type RankId } from '../levels';
import { artRoot, svg, uniqueId } from './svg';

/**
 * Rank emblems: one shield family, a colour per rank and an icon that tells
 * the story from a coin slot to a laurelled crown. Small pips along the
 * bottom count the ranks climbed, so the order reads even in greyscale.
 */
const SHIELD = 'M50 3 90 15v32c0 25-17 41-40 50C27 88 10 72 10 47V15z';
const INNER_SHIELD = 'M50 10 83 20v27c0 20-14 34-33 42-19-8-33-22-33-42V20z';

const MASHED_BUTTONS = [
  { x: 33, y: 52, colour: 'a' },
  { x: 50, y: 43, colour: 'b' },
  { x: 67, y: 52, colour: 'c' },
] as const;

const ICONS: Record<RankId, () => SVGElement[]> = {
  'coin-slot': () => [
    svg('rect', { x: 33, y: 24, width: 34, height: 46, rx: 6, class: 'neo-rank__panel' }),
    svg('circle', { cx: 50, cy: 35, r: 8, class: 'neo-rank__accent' }),
    svg('circle', { cx: 50, cy: 35, r: 5, class: 'neo-rank__accent-edge' }),
    svg('rect', { x: 39, y: 46, width: 22, height: 5.5, rx: 2.75, class: 'neo-rank__slot' }),
    svg('path', { d: 'M50 56v6m-3.5-3.5L50 62l3.5-3.5', class: 'neo-rank__line' }),
  ],
  'button-masher': () => [
    svg('path', { d: 'M28 33l-5-5M50 26v-7M72 33l5-5', class: 'neo-rank__line' }),
    ...MASHED_BUTTONS.flatMap(({ x, y, colour }) => [
      svg('ellipse', { cx: x, cy: y + 3, rx: 9, ry: 8, class: 'neo-rank__button-base' }),
      svg('ellipse', {
        cx: x,
        cy: y,
        rx: 9,
        ry: 8,
        class: `neo-rank__button neo-rank__button--${colour}`,
      }),
      svg('ellipse', { cx: x - 2.5, cy: y - 3, rx: 3.5, ry: 2, class: 'neo-rank__gleam' }),
    ]),
  ],
  'joystick-jockey': () => [
    svg('ellipse', { cx: 50, cy: 66, rx: 19, ry: 6, class: 'neo-rank__panel' }),
    svg('path', { d: 'M50 64 58 38', class: 'neo-rank__stick' }),
    svg('circle', { cx: 59, cy: 34, r: 9, class: 'neo-rank__button neo-rank__button--a' }),
    svg('ellipse', { cx: 56, cy: 30.5, rx: 3.5, ry: 2.2, class: 'neo-rank__gleam' }),
    svg('path', { d: 'M31 42a19 19 0 0 1 6-11M69 26a19 19 0 0 1 5 7', class: 'neo-rank__line' }),
  ],
  'high-scorer': () => [
    svg('polygon', {
      points: starPoints(50, 46, 25, 11, 5),
      class: 'neo-rank__accent',
    }),
    svg('path', { d: 'M40 39v15m7-15v15m-7-7.5h7M54 39v15', class: 'neo-rank__letters' }),
  ],
  'cabinet-champion': () => [
    svg('path', {
      d: 'M37 34h26v-6H37zm0 0 2 3v14l-6 8v11h34V59l-6-8V37l2-3',
      class: 'neo-rank__cabinet',
    }),
    svg('rect', { x: 42, y: 38, width: 16, height: 12, rx: 2, class: 'neo-rank__screen' }),
    svg('rect', { x: 39, y: 29.5, width: 22, height: 3, rx: 1.5, class: 'neo-rank__accent' }),
    svg('circle', { cx: 45, cy: 58, r: 2, class: 'neo-rank__accent' }),
    svg('circle', { cx: 55, cy: 58, r: 2, class: 'neo-rank__accent' }),
    svg('path', { d: 'M40 25l-2-9 6 5 6-8 6 8 6-5-2 9z', class: 'neo-rank__crown' }),
  ],
  'arcade-legend': () => [
    ...laurel(-1),
    ...laurel(1),
    svg('polygon', { points: starPoints(50, 49, 15, 6.5, 5), class: 'neo-rank__accent' }),
    svg('path', { d: 'M38 30l-2-12 7 6 7-10 7 10 7-6-2 12z', class: 'neo-rank__crown' }),
  ],
};

const WINGED: ReadonlySet<RankId> = new Set(['cabinet-champion', 'arcade-legend']);

export function drawRankEmblem(rank: RankId, label?: string): SVGSVGElement {
  const index = RANKS.findIndex((candidate) => candidate.id === rank);
  const plateId = uniqueId('neo-rank-plate');
  const root = artRoot('-8 -2 116 104', `neo-rank neo-rank--${rank}`, label);
  root.append(
    svg(
      'defs',
      {},
      svg(
        'linearGradient',
        { id: plateId, x1: 0, y1: 0, x2: 0.6, y2: 1 },
        svg('stop', { offset: 0, style: 'stop-color: var(--nr-hi)' }),
        svg('stop', { offset: 0.55, style: 'stop-color: var(--nr-mid)' }),
        svg('stop', { offset: 1, style: 'stop-color: var(--nr-lo)' }),
      ),
    ),
    WINGED.has(rank) ? svg('g', { class: 'neo-rank__wings' }, wing(-1), wing(1)) : '',
    svg('path', { d: SHIELD, class: 'neo-rank__plate', fill: `url(#${plateId})` }),
    svg('path', { d: INNER_SHIELD, class: 'neo-rank__inner' }),
    svg('g', { class: 'neo-rank__icon' }, ...ICONS[rank]()),
    svg('g', { class: 'neo-rank__pips' }, ...pips(index + 1)),
  );
  return root;
}

function pips(count: number): SVGElement[] {
  const spacing = 6.5;
  const start = 50 - ((count - 1) * spacing) / 2;
  return Array.from({ length: count }, (_, index) =>
    svg('rect', {
      x: start + index * spacing - 2,
      y: 76,
      width: 4,
      height: 4,
      transform: `rotate(45 ${start + index * spacing} 78)`,
      class: 'neo-rank__pip',
    }),
  );
}

function wing(side: -1 | 1): SVGElement {
  const x = (value: number) => 50 + side * value;
  const feathers = [0, 1, 2].map((feather) => {
    const top = 20 + feather * 11;
    return `M${x(38)} ${top}Q${x(56)} ${top + 2} ${x(57)} ${top - 6}Q${x(52)} ${top + 12} ${x(38)} ${top + 12}`;
  });
  return svg('path', { d: feathers.join(''), class: 'neo-rank__wing' });
}

function laurel(side: -1 | 1): SVGElement[] {
  const leaves: SVGElement[] = [];
  for (let leaf = 0; leaf < 5; leaf++) {
    const angle = (200 - leaf * 26) * (Math.PI / 180);
    const cx = 50 + side * Math.cos(angle) * -23;
    const cy = 50 + Math.sin(angle) * -21 + 4;
    const tilt = side * (leaf * 26 - 40);
    leaves.push(
      svg('ellipse', {
        cx: cx.toFixed(2),
        cy: cy.toFixed(2),
        rx: 3.2,
        ry: 7,
        transform: `rotate(${tilt} ${cx.toFixed(2)} ${cy.toFixed(2)})`,
        class: 'neo-rank__leaf',
      }),
    );
  }
  return leaves;
}

function starPoints(cx: number, cy: number, outer: number, inner: number, points: number): string {
  return Array.from({ length: points * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / points;
    return `${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`;
  }).join(' ');
}
