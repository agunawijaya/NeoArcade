import './avatar.css';
import {
  BACKDROPS,
  SKINS,
  type AccessoryId,
  type AvatarLook,
  type BackdropId,
  type EyesId,
  type FaceId,
  type HeadwearId,
  type MouthId,
} from '../arcade-cosmetics';
import { artRoot, mix, svg, uniqueId } from './svg';

/**
 * The player's avatar: a bust in a round window, built from parts on a
 * 120 × 120 grid. Each face shape says where its eyes, mouth and crown are,
 * and every other part hangs off those anchors, so any combination fits.
 */
const LINE = '#1d1433';
const LINE_WIDTH = 2.4;

interface Head {
  outline: string;
  /** y of the top of the head, where hats sit. */
  top: number;
  eyeY: number;
  mouthY: number;
  halfWidth: number;
  sides: 'ears' | 'bolts' | 'none';
  body: boolean;
  nose: boolean;
}

const HEADS: Record<FaceId, Head> = {
  round: {
    outline: ellipsePath(60, 57, 29, 29.5),
    top: 27.5,
    eyeY: 55,
    mouthY: 71,
    halfWidth: 29,
    sides: 'ears',
    body: true,
    nose: true,
  },
  boxy: {
    outline: 'M48 27h24c10 0 17 7 17 17v24c0 10-7 17-17 17H48c-10 0-17-7-17-17V44c0-10 7-17 17-17z',
    top: 27,
    eyeY: 54,
    mouthY: 71,
    halfWidth: 29,
    sides: 'ears',
    body: true,
    nose: true,
  },
  tall: {
    outline: ellipsePath(60, 55, 24, 33),
    top: 22,
    eyeY: 52,
    mouthY: 70,
    halfWidth: 24,
    sides: 'ears',
    body: true,
    nose: true,
  },
  robot: {
    outline: 'M39 26h42c5 0 9 4 9 9v38c0 5-4 9-9 9H39c-5 0-9-4-9-9V35c0-5 4-9 9-9z',
    top: 26,
    eyeY: 51,
    mouthY: 69,
    halfWidth: 30,
    sides: 'bolts',
    body: true,
    nose: false,
  },
  ghost: {
    outline: 'M31 56c0-19 12-32 29-32s29 13 29 32v48l-7-6-7 6-7-6-8 6-8-6-7 6-7-6-7 6z',
    top: 24,
    eyeY: 51,
    mouthY: 66,
    halfWidth: 29,
    sides: 'none',
    body: false,
    nose: false,
  },
};

const SHIRTS: Record<BackdropId, string> = {
  midnight: '#ff4fa8',
  dusk: '#2d1b4e',
  lagoon: '#ffcf5c',
  grid: '#3ff3ff',
  starfield: '#9b6bff',
  sunburst: '#2a1a5e',
};

export interface AvatarOptions {
  /** Accessible name; decorative without it. */
  label?: string;
}

export function drawAvatar(look: AvatarLook, { label }: AvatarOptions = {}): SVGSVGElement {
  const head = HEADS[look.face];
  const skin = SKINS.find((option) => option.id === look.skin)?.colour ?? '#efbd94';
  const tones = { skin, shade: mix(skin, '#000000', 0.22), light: mix(skin, '#ffffff', 0.35) };
  const windowId = uniqueId('neo-avatar-window');
  const headId = uniqueId('neo-avatar-head');

  const root = artRoot('0 0 120 120', 'neo-avatar', label);
  root.append(
    svg(
      'defs',
      {},
      svg('clipPath', { id: windowId }, svg('circle', { cx: 60, cy: 60, r: 60 })),
      svg('clipPath', { id: headId }, svg('path', { d: head.outline })),
    ),
    svg(
      'g',
      { 'clip-path': `url(#${windowId})` },
      ...backdrop(look.backdrop),
      ...(head.body ? body(SHIRTS[look.backdrop], tones, look.face === 'robot') : []),
      ...(head.sides === 'ears' ? ears(head, tones) : []),
      ...(head.sides === 'bolts' ? bolts(head) : []),
      svg('path', { d: head.outline, fill: tones.skin, stroke: LINE, 'stroke-width': LINE_WIDTH }),
      svg(
        'g',
        { 'clip-path': `url(#${headId})` },
        ...headShading(head, tones, look.face === 'robot'),
        ...underFace(look.accessory, head),
      ),
      look.accessory === 'headband' && headbandTails(head),
      ...(head.nose ? [nose(head, tones)] : []),
      ...eyes(look.eyes, head),
      ...mouth(look.mouth, head),
      ...overFace(look.accessory, head),
      ...headwear(look.headwear, head),
    ),
    svg('circle', { cx: 60, cy: 60, r: 59, class: 'neo-avatar__edge' }),
  );
  return root;
}

function backdrop(id: BackdropId): SVGElement[] {
  const [top, bottom] = BACKDROPS.find((option) => option.id === id)?.colours ?? [
    '#2d2466',
    '#140f33',
  ];
  const gradientId = uniqueId('neo-avatar-sky');
  const layers: SVGElement[] = [
    svg(
      'defs',
      {},
      svg(
        'linearGradient',
        { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 },
        svg('stop', { offset: 0, 'stop-color': top }),
        svg('stop', { offset: 1, 'stop-color': bottom }),
      ),
    ),
    svg('rect', { width: 120, height: 120, fill: `url(#${gradientId})` }),
  ];
  if (id === 'grid') {
    const lines = [];
    for (let x = -60; x <= 180; x += 20) lines.push(`M60 62L${x} 120`);
    for (const y of [66, 72, 81, 94, 112]) lines.push(`M0 ${y}H120`);
    layers.push(
      svg('circle', { cx: 60, cy: 62, r: 22, fill: '#ff5e9e', opacity: 0.55 }),
      svg('rect', { y: 62, width: 120, height: 58, fill: '#0c0620' }),
      svg('path', { d: lines.join(''), stroke: '#ff3fa4', 'stroke-width': 1, opacity: 0.7 }),
    );
  }
  if (id === 'starfield') {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let star = 0; star < 28; star++) {
      layers.push(
        svg('circle', {
          cx: (random() * 120).toFixed(1),
          cy: (random() * 120).toFixed(1),
          r: (0.5 + random() * 1.2).toFixed(2),
          fill: '#fff',
          opacity: (0.4 + random() * 0.6).toFixed(2),
        }),
      );
    }
  }
  if (id === 'sunburst') {
    const rays = [];
    for (let ray = 0; ray < 12; ray++) {
      const from = (ray / 12) * Math.PI * 2;
      const to = from + Math.PI / 12;
      rays.push(
        `M60 60L${(60 + Math.cos(from) * 90).toFixed(1)} ${(60 + Math.sin(from) * 90).toFixed(1)}L${(60 + Math.cos(to) * 90).toFixed(1)} ${(60 + Math.sin(to) * 90).toFixed(1)}z`,
      );
    }
    layers.push(svg('path', { d: rays.join(''), fill: '#fff', opacity: 0.18 }));
  }
  return layers;
}

type Tones = { skin: string; shade: string; light: string };

function body(shirt: string, tones: Tones, robot: boolean): SVGElement[] {
  return [
    svg('rect', {
      x: 52,
      y: 76,
      width: 16,
      height: 18,
      fill: robot ? '#8d93a8' : tones.shade,
      stroke: LINE,
      'stroke-width': LINE_WIDTH,
    }),
    svg('path', {
      d: 'M14 124c2-22 20-33 46-33s44 11 46 33z',
      fill: shirt,
      stroke: LINE,
      'stroke-width': LINE_WIDTH,
    }),
    svg('path', {
      d: 'M49 92l11 10 11-10',
      fill: 'none',
      stroke: LINE,
      'stroke-width': LINE_WIDTH,
      'stroke-linejoin': 'round',
      opacity: 0.6,
    }),
  ];
}

function ears(head: Head, tones: Tones): SVGElement[] {
  return [-1, 1].flatMap((side) => {
    const x = 60 + side * (head.halfWidth - 1);
    return [
      svg('circle', {
        cx: x,
        cy: head.eyeY + 4,
        r: 6.5,
        fill: tones.skin,
        stroke: LINE,
        'stroke-width': LINE_WIDTH,
      }),
      svg('circle', { cx: x + side * 1, cy: head.eyeY + 4, r: 3, fill: tones.shade }),
    ];
  });
}

function bolts(head: Head): SVGElement[] {
  return [-1, 1].flatMap((side) => {
    const x = 60 + side * (head.halfWidth + 3);
    return [
      svg('rect', {
        x: x - 4,
        y: head.eyeY - 6,
        width: 8,
        height: 16,
        rx: 2.5,
        fill: '#8d93a8',
        stroke: LINE,
        'stroke-width': LINE_WIDTH,
      }),
      svg('circle', { cx: x, cy: head.eyeY + 2, r: 1.8, fill: LINE }),
    ];
  });
}

function headShading(head: Head, tones: Tones, robot: boolean): SVGElement[] {
  const layers: SVGElement[] = [
    svg('ellipse', {
      cx: 72,
      cy: head.mouthY + 12,
      rx: 30,
      ry: 18,
      fill: tones.shade,
      opacity: 0.35,
    }),
    svg('ellipse', { cx: 47, cy: head.top + 11, rx: 13, ry: 7, fill: tones.light, opacity: 0.55 }),
  ];
  if (robot) {
    layers.push(
      svg('rect', {
        x: 36,
        y: head.top + 12,
        width: 48,
        height: 42,
        rx: 6,
        fill: 'none',
        stroke: LINE,
        'stroke-width': 1.4,
        opacity: 0.35,
      }),
      ...[
        [35, head.top + 5],
        [85, head.top + 5],
        [35, head.top + 52],
        [85, head.top + 52],
      ].map(([cx, cy]) => svg('circle', { cx, cy, r: 1.6, fill: LINE, opacity: 0.5 })),
    );
  }
  return layers;
}

function nose(head: Head, tones: Tones): SVGElement {
  const y = (head.eyeY + head.mouthY) / 2 - 1;
  return svg('path', {
    d: `M57 ${y}q3 3 6 0`,
    fill: 'none',
    stroke: mix(tones.shade, LINE, 0.4),
    'stroke-width': 2,
    'stroke-linecap': 'round',
  });
}

function eyePositions(head: Head): [number, number] {
  const spread = head.halfWidth * 0.42;
  return [60 - spread, 60 + spread];
}

function eyes(style: EyesId, head: Head): SVGElement[] {
  const y = head.eyeY;
  const [left, right] = eyePositions(head);
  const dot = (x: number) => [
    svg('ellipse', { cx: x, cy: y, rx: 3.6, ry: 4.4, fill: LINE }),
    svg('circle', { cx: x - 1.2, cy: y - 1.6, r: 1.3, fill: '#fff' }),
  ];
  const arc = (x: number, lift: number) =>
    svg('path', {
      d: `M${x - 5} ${y + lift}q5 ${-lift * 3} 10 0`,
      fill: 'none',
      stroke: LINE,
      'stroke-width': 2.8,
      'stroke-linecap': 'round',
    });
  switch (style) {
    case 'dots':
      return [...dot(left), ...dot(right)];
    case 'happy':
      return [arc(left, 2), arc(right, 2)];
    case 'wink':
      return [...dot(left), arc(right, -1)];
    case 'visor': {
      const width = head.halfWidth * 1.55;
      return [
        svg('rect', {
          x: 60 - width / 2,
          y: y - 6.5,
          width,
          height: 13,
          rx: 6.5,
          fill: '#120d24',
          stroke: LINE,
          'stroke-width': LINE_WIDTH,
        }),
        svg('rect', {
          x: 60 - width / 2 + 5,
          y: y - 1.5,
          width: width - 10,
          height: 3,
          rx: 1.5,
          fill: '#3ff3ff',
          opacity: 0.9,
        }),
        svg('circle', { cx: left, cy: y, r: 2.6, fill: '#bffcff' }),
        svg('circle', { cx: right, cy: y, r: 2.6, fill: '#bffcff' }),
      ];
    }
    case 'stars':
      return [left, right].map((x) =>
        svg('polygon', {
          points: starPoints(x, y, 6.5, 2.8),
          fill: '#ffd23f',
          stroke: LINE,
          'stroke-width': 1.6,
          'stroke-linejoin': 'round',
        }),
      );
    case 'hearts':
      return [left, right].map((x) =>
        svg('path', {
          d: `M${x} ${y + 5}c-6-4-7-7-7-9a3.6 3.6 0 0 1 7-1.4 3.6 3.6 0 0 1 7 1.4c0 2-1 5-7 9z`,
          fill: '#ff4f8b',
          stroke: LINE,
          'stroke-width': 1.6,
          'stroke-linejoin': 'round',
        }),
      );
  }
}

function mouth(style: MouthId, head: Head): SVGElement[] {
  const y = head.mouthY;
  const line = {
    fill: 'none',
    stroke: LINE,
    'stroke-width': 2.8,
    'stroke-linecap': 'round',
  } as const;
  switch (style) {
    case 'smile':
      return [svg('path', { d: `M52 ${y}q8 7 16 0`, ...line })];
    case 'grin':
      return [
        svg('path', {
          d: `M50 ${y - 1}q10 13 20 0z`,
          fill: LINE,
          stroke: LINE,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
        }),
        svg('path', { d: `M52 ${y - 0.5}h16l-1 2.6H53z`, fill: '#fff' }),
      ];
    case 'flat':
      return [svg('path', { d: `M53 ${y + 1}h14`, ...line })];
    case 'surprised':
      return [svg('ellipse', { cx: 60, cy: y + 1, rx: 3.8, ry: 4.8, fill: LINE })];
    case 'tongue':
      return [
        svg('path', {
          d: `M51 ${y - 1}q9 11 18 0z`,
          fill: LINE,
          stroke: LINE,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
        }),
        svg('path', {
          d: `M58 ${y + 3}v4a4 4 0 0 0 8 0v-5z`,
          fill: '#ff6f91',
          stroke: LINE,
          'stroke-width': 1.6,
        }),
      ];
    case 'fangs':
      return [
        svg('path', { d: `M51 ${y}q9 7 18 0`, ...line }),
        svg('path', {
          d: `M54.5 ${y + 1.8}l1.6 4 1.6-3.2zM62.3 ${y + 2.6}l1.6 3.2 1.6-4z`,
          fill: '#fff',
          stroke: LINE,
          'stroke-width': 1,
          'stroke-linejoin': 'round',
        }),
      ];
  }
}

/** Accessories that sit on the skin, clipped to the head. */
function underFace(style: AccessoryId, head: Head): SVGElement[] {
  if (style === 'blush') {
    return [-1, 1].map((side) =>
      svg('ellipse', {
        cx: 60 + side * head.halfWidth * 0.6,
        cy: head.eyeY + 9,
        rx: 5.5,
        ry: 3.2,
        fill: '#ff6f91',
        opacity: 0.5,
      }),
    );
  }
  if (style === 'headband') {
    return [
      svg('rect', {
        x: 0,
        y: head.top + 8,
        width: 120,
        height: 8,
        fill: '#ff3f5a',
        stroke: LINE,
        'stroke-width': 2,
      }),
      svg('rect', { x: 0, y: head.top + 9.5, width: 120, height: 2, fill: '#fff', opacity: 0.35 }),
    ];
  }
  return [];
}

function headbandTails(head: Head): SVGElement {
  const x = 60 + head.halfWidth - 1;
  const y = head.top + 12;
  return svg('path', {
    d: `M${x} ${y}l12 -6 -2 6 4 5zM${x} ${y}l10 8 -4 1z`,
    fill: '#ff3f5a',
    stroke: LINE,
    'stroke-width': 1.6,
    'stroke-linejoin': 'round',
  });
}

/** Accessories worn over the face: glasses, shades, a moustache, a bow tie. */
function overFace(style: AccessoryId, head: Head): SVGElement[] {
  const [left, right] = eyePositions(head);
  const y = head.eyeY;
  switch (style) {
    case 'glasses':
      return [
        ...[left, right].map((x) =>
          svg('circle', {
            cx: x,
            cy: y,
            r: 7.6,
            fill: '#ffffff',
            'fill-opacity': 0.18,
            stroke: LINE,
            'stroke-width': 2.4,
          }),
        ),
        svg('path', {
          d:
            `M${left + 7.6} ${y}Q60 ${y - 3} ${right - 7.6} ${y}` +
            temples(head, left - 7.6, right + 7.6, y - 1),
          fill: 'none',
          stroke: LINE,
          'stroke-width': 2.2,
        }),
      ];
    case 'shades':
      return [
        ...[left, right].map((x) =>
          svg('path', {
            d: `M${x - 9} ${y - 5}h18v2c0 6-3 9-8 9h-2c-5 0-8-3-8-9z`,
            fill: '#141024',
            stroke: LINE,
            'stroke-width': 2,
            'stroke-linejoin': 'round',
          }),
        ),
        svg('path', {
          d: `M${left + 9} ${y - 3.5}H${right - 9}` + temples(head, left - 9, right + 9, y - 3.5),
          fill: 'none',
          stroke: LINE,
          'stroke-width': 2.6,
        }),
        svg('path', {
          d: `M${left - 5} ${y - 2}l4 4M${right - 5} ${y - 2}l4 4`,
          stroke: '#fff',
          'stroke-width': 1.6,
          opacity: 0.6,
          'stroke-linecap': 'round',
        }),
      ];
    case 'moustache': {
      const top = head.mouthY - 5;
      return [
        svg('path', {
          d: `M60 ${top}c-3-3-10-4-15 2 5-1 10 2 15 0 5 2 10-1 15 0-5-6-12-5-15-2z`,
          fill: '#3b2416',
          stroke: LINE,
          'stroke-width': 1.4,
          'stroke-linejoin': 'round',
        }),
      ];
    }
    case 'bow-tie':
      return [
        svg('path', {
          d: 'M60 94 48 87v14zM60 94l12-7v14z',
          fill: '#ff3f6c',
          stroke: LINE,
          'stroke-width': 1.8,
          'stroke-linejoin': 'round',
        }),
        svg('rect', {
          x: 56.5,
          y: 90.5,
          width: 7,
          height: 7,
          rx: 2,
          fill: '#c41f4c',
          stroke: LINE,
          'stroke-width': 1.6,
        }),
      ];
    default:
      return [];
  }
}

/** The arms of glasses, from the frames back to the sides of the head. */
function temples(head: Head, leftEdge: number, rightEdge: number, y: number): string {
  return `M${leftEdge} ${y}H${60 - head.halfWidth}M${rightEdge} ${y}H${60 + head.halfWidth}`;
}

function headwear(style: HeadwearId, head: Head): SVGElement[] {
  const top = head.top;
  const width = head.halfWidth;
  const outline = { stroke: LINE, 'stroke-width': LINE_WIDTH, 'stroke-linejoin': 'round' } as const;
  switch (style) {
    case 'none':
      return [];
    case 'cap':
      return [
        svg('path', {
          d: `M${59 - width} ${top + 14}c1-22 42-22 ${width * 2 + 2} 0z`,
          fill: '#ff4f8b',
          ...outline,
        }),
        svg('path', {
          d: `M56 ${top + 12}q${width + 12} -4 ${width + 18} 5q-10 4 -${width + 18} 1z`,
          fill: '#c42a6c',
          ...outline,
        }),
        svg('path', { d: `M60 ${top - 2}v14`, stroke: LINE, 'stroke-width': 1.4, opacity: 0.45 }),
        svg('circle', {
          cx: 60,
          cy: top - 2.5,
          r: 2.6,
          fill: '#ff4f8b',
          ...outline,
          'stroke-width': 1.6,
        }),
      ];
    case 'headphones':
      return [
        svg('path', {
          d: `M${58 - width} ${head.eyeY}c-4-34 ${width * 2 + 8} -34 ${width * 2 + 4} 0`,
          fill: 'none',
          stroke: '#262338',
          'stroke-width': 5.5,
          'stroke-linecap': 'round',
        }),
        ...[-1, 1].flatMap((side) => {
          const x = 60 + side * (width + 1) - 5;
          return [
            svg('rect', {
              x,
              y: head.eyeY - 8,
              width: 10,
              height: 20,
              rx: 4.5,
              fill: '#262338',
              ...outline,
            }),
            svg('rect', {
              x: x + 3,
              y: head.eyeY - 4,
              width: 4,
              height: 12,
              rx: 2,
              fill: '#3ff3ff',
            }),
          ];
        }),
      ];
    case 'beanie':
      return [
        svg('path', {
          d: `M${59 - width} ${top + 16}c0-28 ${width * 2 + 2} -28 ${width * 2 + 2} 0z`,
          fill: '#36c5f0',
          ...outline,
        }),
        svg('rect', {
          x: 57 - width,
          y: top + 9,
          width: width * 2 + 6,
          height: 10,
          rx: 5,
          fill: '#1c93c9',
          ...outline,
        }),
        svg('path', {
          d: Array.from(
            { length: 7 },
            (_, index) => `M${62 - width + index * ((width * 2) / 6) - 3} ${top + 11}v6`,
          ).join(''),
          stroke: LINE,
          'stroke-width': 1.2,
          opacity: 0.4,
        }),
        svg('circle', { cx: 60, cy: top - 6, r: 6, fill: '#fff', ...outline }),
      ];
    case 'antennae':
      return [-1, 1].flatMap((side) => {
        const tipX = 60 + side * 20;
        const tipY = top - 15;
        return [
          svg('path', {
            d: `M${60 + side * 9} ${top + 2}q${side * 4} -10 ${side * 11} -17`,
            fill: 'none',
            stroke: LINE,
            'stroke-width': 2.4,
            'stroke-linecap': 'round',
          }),
          svg('circle', { cx: tipX, cy: tipY, r: 8, fill: '#7cf29c', opacity: 0.3 }),
          svg('circle', {
            cx: tipX,
            cy: tipY,
            r: 4.5,
            fill: '#7cf29c',
            ...outline,
            'stroke-width': 1.8,
          }),
        ];
      });
    case 'propeller':
      return [
        svg('path', {
          d: `M${63 - width} ${top + 11}c2-18 ${width * 2 - 8} -18 ${width * 2 - 6} 0z`,
          fill: '#ffd23f',
          ...outline,
        }),
        svg('path', { d: `M60 ${top - 2}c-6 0-11 5-12 ${13}h12z`, fill: '#ff4f8b' }),
        svg('path', { d: `M60 ${top - 2}c6 0 11 5 12 ${13}h-12z`, fill: '#3fa9ff' }),
        svg('path', {
          d: `M${63 - width} ${top + 11}c2-18 ${width * 2 - 8} -18 ${width * 2 - 6} 0z`,
          fill: 'none',
          ...outline,
        }),
        svg('path', { d: `M60 ${top - 3}v-6`, stroke: LINE, 'stroke-width': 2.4 }),
        svg('path', {
          d: `M60 ${top - 9}c-6-3-14-3-16 0 2 3 10 3 16 0zm0 0c6-3 14-3 16 0-2 3-10 3-16 0z`,
          fill: '#ff4f8b',
          ...outline,
          'stroke-width': 1.6,
        }),
      ];
    case 'crown':
      return [
        svg('path', {
          d: `M${60 - width * 0.72} ${top + 7}l-2-17 ${width * 0.34} 9 ${width * 0.4} -14 ${width * 0.4} 14 ${width * 0.34} -9 -2 17z`,
          fill: '#ffd23f',
          stroke: '#7a4b00',
          'stroke-width': 2,
          'stroke-linejoin': 'round',
        }),
        svg('circle', { cx: 60, cy: top + 2, r: 2.6, fill: '#ff3f6c' }),
        svg('circle', { cx: 60 - width * 0.42, cy: top + 3, r: 2, fill: '#3ff3ff' }),
        svg('circle', { cx: 60 + width * 0.42, cy: top + 3, r: 2, fill: '#3ff3ff' }),
      ];
    case 'halo':
      return [
        svg('ellipse', {
          cx: 60,
          cy: top - 9,
          rx: width * 0.78,
          ry: 5.5,
          fill: 'none',
          stroke: '#ffe27a',
          'stroke-width': 8,
          opacity: 0.3,
        }),
        svg('ellipse', {
          cx: 60,
          cy: top - 9,
          rx: width * 0.78,
          ry: 5.5,
          fill: 'none',
          stroke: '#ffe27a',
          'stroke-width': 3.2,
        }),
      ];
  }
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0z`;
}

function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return `${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`;
  }).join(' ');
}
