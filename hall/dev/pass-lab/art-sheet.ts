import './lab.css';
import { LOOK_OPTIONS, DEFAULT_LOOK, type AvatarLook } from '@shared/pass/arcade-cosmetics';
import { drawAvatar } from '@shared/pass/art/avatar';
import { drawBadge } from '@shared/pass/art/badge';
import { drawRankEmblem } from '@shared/pass/art/rank';
import { RANKS } from '@shared/pass/levels';
import { glyphs } from '@shared/pass/glyphs';
import { BADGE_TIERS } from '@shared/pass/manifest';

/**
 * Every piece of Pass art on one page, in the theme from ?theme=light|dark,
 * for art direction: each avatar part, badges of every tier locked and
 * earned, every glyph, and the rank ladder.
 */
const theme = new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme = theme;
const sheet = document.querySelector<HTMLElement>('#sheet')!;
// ?only=badges shows just the sections whose title mentions it.
const only = new URLSearchParams(location.search).get('only')?.toLowerCase();

function section(title: string, ...items: Element[]) {
  if (only && !title.toLowerCase().includes(only)) return;
  const block = document.createElement('section');
  block.className = 'sheet__section';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const row = document.createElement('div');
  row.className = 'sheet__row';
  row.append(...items);
  block.append(heading, row);
  sheet.append(block);
}

function tile(art: Element, caption: string, size = 96) {
  const figure = document.createElement('figure');
  figure.className = 'sheet__tile';
  figure.style.setProperty('--size', `${size}px`);
  const text = document.createElement('figcaption');
  text.textContent = caption;
  figure.append(art, text);
  return figure;
}

const avatarSlots = ['face', 'skin', 'backdrop', 'eyes', 'mouth', 'headwear', 'accessory'] as const;
for (const slot of avatarSlots) {
  section(
    `Avatar · ${slot}`,
    ...LOOK_OPTIONS[slot].map((option) =>
      tile(
        drawAvatar({ ...DEFAULT_LOOK, [slot]: option.id } as AvatarLook),
        `${option.name} (${option.level})`,
      ),
    ),
  );
}

section(
  'Avatar · combinations',
  ...[
    {
      face: 'robot',
      skin: 'chrome',
      backdrop: 'grid',
      eyes: 'visor',
      mouth: 'flat',
      headwear: 'antennae',
      accessory: 'none',
    },
    {
      face: 'ghost',
      skin: 'mint',
      backdrop: 'starfield',
      eyes: 'happy',
      mouth: 'tongue',
      headwear: 'halo',
      accessory: 'blush',
    },
    {
      face: 'tall',
      skin: 'umber',
      backdrop: 'sunburst',
      eyes: 'stars',
      mouth: 'grin',
      headwear: 'crown',
      accessory: 'moustache',
    },
    {
      face: 'boxy',
      skin: 'porcelain',
      backdrop: 'lagoon',
      eyes: 'wink',
      mouth: 'smile',
      headwear: 'propeller',
      accessory: 'glasses',
    },
    {
      face: 'round',
      skin: 'ebony',
      backdrop: 'dusk',
      eyes: 'dots',
      mouth: 'fangs',
      headwear: 'headphones',
      accessory: 'shades',
    },
    {
      face: 'round',
      skin: 'honey',
      backdrop: 'midnight',
      eyes: 'hearts',
      mouth: 'surprised',
      headwear: 'beanie',
      accessory: 'bow-tie',
    },
    {
      face: 'boxy',
      skin: 'lilac',
      backdrop: 'grid',
      eyes: 'dots',
      mouth: 'smile',
      headwear: 'cap',
      accessory: 'headband',
    },
  ].map((look, index) => tile(drawAvatar(look as AvatarLook), `combo ${index + 1}`, 128)),
);

section(
  'Avatar · small',
  ...[24, 32, 40].map((size) => tile(drawAvatar(DEFAULT_LOOK), `${size}px`, size)),
);

for (const tier of BADGE_TIERS) {
  section(
    `Badges · ${tier}`,
    tile(
      drawBadge({ tier, emblem: glyphs.trophy }, { unlocked: true, accent: '#ff8a3d' }),
      'earned',
    ),
    tile(drawBadge({ tier, emblem: glyphs.trophy }, { unlocked: false }), 'locked'),
    tile(
      drawBadge(
        { tier, emblem: glyphs.sun },
        { unlocked: false, progress: 0.6, accent: '#ff8a3d' },
      ),
      'counted 6/10',
    ),
    tile(drawBadge({ tier, emblem: glyphs.flame }, { unlocked: true }), 'earned, no accent', 64),
    tile(drawBadge({ tier, emblem: glyphs.flame }, { unlocked: true }), '40px', 40),
  );
}

section(
  'Glyphs (gold)',
  ...Object.entries(glyphs).map(([name, glyph]) =>
    tile(
      drawBadge({ tier: 'gold', emblem: glyph }, { unlocked: true, accent: '#3ff3ff' }),
      name,
      72,
    ),
  ),
);
section(
  'Glyphs (silver, locked)',
  ...Object.entries(glyphs).map(([name, glyph]) =>
    tile(drawBadge({ tier: 'silver', emblem: glyph }, { unlocked: false }), name, 72),
  ),
);

section(
  'Ranks',
  ...RANKS.map((rank) => tile(drawRankEmblem(rank.id), `${rank.name} (${rank.fromLevel})`, 110)),
);
section('Ranks · small', ...RANKS.map((rank) => tile(drawRankEmblem(rank.id), rank.name, 36)));
