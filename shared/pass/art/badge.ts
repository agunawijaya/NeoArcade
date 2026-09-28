import './badge.css';
import { glyphs } from '../glyphs';
import { recordEmblem, type EmblemInk, type EmblemShape } from '../emblem-pen';
import type { BadgeDefinition, BadgeTier } from '../manifest';
import { artRoot, radialPath, svg, uniqueId } from './svg';

/**
 * A badge as a medal: the tier decides the metal and the outline (a bronze
 * coin, a silver rosette, a gold starburst, a secret hexagon), the manifest's
 * emblem is engraved in the middle. Colours come from CSS custom properties
 * in badge.css, so locked silhouettes and both themes are a matter of
 * switching variables.
 */
export interface BadgeArtOptions {
  unlocked: boolean;
  /** The game's colour, used for the enamel accent. */
  accent?: string;
  /** For counted badges: 0..1 of the way there, drawn as a ring around the medal. */
  progress?: number;
  /** Accessible name; without it the drawing is decorative. */
  label?: string;
}

const INK_COLOURS: Record<EmblemInk, string> = {
  ink: 'var(--nb-ink)',
  shine: 'var(--nb-shine)',
  accent: 'var(--nb-accent)',
  face: 'var(--nb-face)',
};

const circle = (radius: number) =>
  `M50 ${50 - radius}a${radius} ${radius} 0 1 1 0 ${radius * 2}a${radius} ${radius} 0 1 1 0 ${-radius * 2}z`;

const hexagon = (radius: number) => radialPath(50, 50, 6, () => radius);

/** Each tier's rim (outer outline) and face (the engraved field). */
const MEDALS: Record<BadgeTier, { rim: string; bezel?: string; face: string }> = {
  bronze: { rim: circle(42), face: circle(34.5) },
  silver: {
    rim: radialPath(50, 50, 168, (angle) => 42.5 + 2.6 * Math.cos(14 * (angle + Math.PI / 2))),
    face: circle(33.5),
  },
  gold: {
    rim: radialPath(50, 50, 36, (angle) => {
      const step = Math.round(((angle + Math.PI / 2) / (Math.PI * 2)) * 36);
      return step % 2 === 0 ? 47 : 40.5;
    }),
    bezel: circle(39),
    face: circle(33),
  },
  secret: { rim: hexagon(45), bezel: hexagon(40), face: hexagon(36) },
};

// The emblem's 64-unit grid, scaled into the middle of the medal.
const EMBLEM_TRANSFORM = 'translate(28 28) scale(0.6875)';

export function drawBadge(
  badge: Pick<BadgeDefinition, 'tier' | 'emblem'>,
  { unlocked, accent, progress, label }: BadgeArtOptions,
): SVGSVGElement {
  const tier = badge.tier;
  const medal = MEDALS[tier];
  const rimId = uniqueId('neo-badge-rim');
  const faceId = uniqueId('neo-badge-face');
  const glintId = uniqueId('neo-badge-glint');
  const clipId = uniqueId('neo-badge-clip');
  // A secret stays a secret until it is earned.
  const emblem = unlocked || tier !== 'secret' ? badge.emblem : glyphs.question;

  const root = artRoot(
    '-6 -6 112 112',
    `neo-badge neo-badge--${tier} ${unlocked ? 'is-unlocked' : 'is-locked'}`,
    label,
  );
  if (accent) root.style.setProperty('--nb-accent-game', accent);

  root.append(
    svg(
      'defs',
      {},
      svg(
        'linearGradient',
        { id: rimId, x1: 0, y1: 0, x2: 1, y2: 1 },
        svg('stop', { offset: 0, style: 'stop-color: var(--nb-rim-hi)' }),
        svg('stop', { offset: 0.5, style: 'stop-color: var(--nb-rim-mid)' }),
        svg('stop', { offset: 1, style: 'stop-color: var(--nb-rim-lo)' }),
      ),
      svg(
        'radialGradient',
        { id: faceId, cx: 0.36, cy: 0.3, r: 0.85 },
        svg('stop', { offset: 0, style: 'stop-color: var(--nb-face-hi)' }),
        svg('stop', { offset: 1, style: 'stop-color: var(--nb-face-lo)' }),
      ),
      svg(
        'linearGradient',
        { id: glintId, x1: 0, y1: 0, x2: 1, y2: 0 },
        svg('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }),
        svg('stop', { offset: 0.5, 'stop-color': '#fff', 'stop-opacity': 0.75 }),
        svg('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }),
      ),
      svg('clipPath', { id: clipId }, svg('path', { d: medal.rim })),
    ),
  );

  if (progress !== undefined) root.append(progressRing(progress));

  root.append(
    svg(
      'g',
      { class: 'neo-badge__medal' },
      svg('path', { class: 'neo-badge__rim', d: medal.rim, fill: `url(#${rimId})` }),
      medal.bezel
        ? svg('path', { class: 'neo-badge__bezel', d: medal.bezel, fill: `url(#${rimId})` })
        : null,
      svg('path', { class: 'neo-badge__face', d: medal.face, fill: `url(#${faceId})` }),
      engraving(emblem),
      svg(
        'g',
        { 'clip-path': `url(#${clipId})` },
        svg(
          'g',
          { transform: 'rotate(24 50 50)' },
          svg('rect', {
            class: 'neo-badge__glint',
            x: -30,
            y: -20,
            width: 22,
            height: 140,
            fill: `url(#${glintId})`,
          }),
        ),
      ),
    ),
  );
  return root;
}

/** The emblem drawn twice: a pale copy nudged down-right reads as light on an engraved edge. */
function engraving(emblem: BadgeDefinition['emblem']): SVGGElement {
  let shapes: EmblemShape[];
  try {
    shapes = recordEmblem(emblem);
  } catch (error) {
    console.error('A badge emblem failed to draw:', error);
    shapes = recordEmblem(glyphs.star);
  }
  return svg(
    'g',
    { class: 'neo-badge__emblem', transform: EMBLEM_TRANSFORM },
    svg(
      'g',
      { class: 'neo-badge__emboss', transform: 'translate(1.3 1.6)' },
      ...shapes.map((shape) => shapeElement(shape, 'var(--nb-emboss)')),
    ),
    ...shapes.map((shape) => shapeElement(shape)),
  );
}

function shapeElement(shape: EmblemShape, colourOverride?: string): SVGElement {
  const { fill, stroke, width = 3, opacity } = shape.style;
  const fillInk = fill ?? (stroke ? 'none' : 'ink');
  const paint = (ink: EmblemInk) => colourOverride ?? INK_COLOURS[ink];
  const style = [`fill: ${fillInk === 'none' ? 'none' : paint(fillInk)}`];
  if (stroke) {
    style.push(`stroke: ${paint(stroke)}`, `stroke-width: ${width}`);
    style.push('stroke-linecap: round', 'stroke-linejoin: round');
  }
  const common = { style: style.join('; '), opacity };
  switch (shape.kind) {
    case 'path':
      return svg('path', { d: shape.d, ...common });
    case 'circle':
      return svg('circle', { cx: shape.cx, cy: shape.cy, r: shape.r, ...common });
    case 'rect':
      return svg('rect', {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        rx: shape.radius || null,
        ...common,
      });
    case 'polygon':
      return svg('polygon', { points: shape.points, ...common });
  }
}

function progressRing(fraction: number): SVGGElement {
  const clamped = Math.min(1, Math.max(0, fraction));
  return svg(
    'g',
    { class: 'neo-badge__ring', transform: 'rotate(-90 50 50)' },
    svg('circle', { class: 'neo-badge__ring-track', cx: 50, cy: 50, r: 53, pathLength: 100 }),
    clamped > 0 &&
      svg('circle', {
        class: 'neo-badge__ring-fill',
        cx: 50,
        cy: 50,
        r: 53,
        pathLength: 100,
        'stroke-dasharray': `${(clamped * 100).toFixed(1)} 100`,
      }),
  );
}
