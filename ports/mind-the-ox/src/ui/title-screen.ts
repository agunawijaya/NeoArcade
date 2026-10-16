import type { ModeId } from '../game/modes';
import { THEMES, THEME_IDS, type ThemeId } from '../themes';
import { button, h } from './dom';

export interface TitleHandlers {
  open(mode: ModeId): void;
  hangar(): void;
  settings(): void;
  theme(theme: ThemeId): void;
  toggleLight(): void;
  /** Someone typed 1984's hidden switch, or patted the ox five times. */
  secret(): void;
}

const MODES: readonly { id: ModeId; name: string; blurb: string }[] = [
  { id: 'campaign', name: 'Campaign', blurb: 'Eight chapters, eight twists' },
  { id: 'at-sea', name: 'At Sea', blurb: 'Eight missions off a carrier' },
  { id: 'sortie', name: 'Custom Sortie', blurb: 'Build a naval mission, share the seed' },
  { id: 'dogfight', name: 'Dogfight', blurb: 'You against the computer’s best' },
  { id: 'classic', name: 'Classic 1984', blurb: 'The original rules, sixteen headings' },
  { id: 'daily', name: 'Daily Sortie', blurb: 'Everyone’s battlefield for today' },
  { id: 'two-player', name: 'Two players', blurb: 'Side by side, or head to head' },
];

/** The ox on the title, drawn in SVG: the one you must mind, and the one that hides a secret. */
function oxDrawing(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 70');
  svg.setAttribute('class', 'title__ox');
  svg.setAttribute('aria-hidden', 'true');
  const shapes: [string, string][] = [
    [
      'M18 30c0-9 7-14 16-14h40c11 0 18 6 20 15l4 14-6 2-4-11v20h-8V40H44v16h-8V38l-6 13-6-2 6-14z',
      'title__ox-hide',
    ],
    ['M92 26c6-2 12 2 13 8l-1 10c-1 6-8 7-12 3z', 'title__ox-hide'],
    ['M100 44c2 2 5 2 6-1', 'title__ox-line'],
    ['M98 23l7-7M93 22l-3-7', 'title__ox-horn'],
    ['M18 30c-6 3-8 10-6 17', 'title__ox-line'],
    ['M34 22c6-3 14-3 20 0', 'title__ox-shine'],
  ];
  for (const [d, className] of shapes) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', className);
    svg.append(path);
  }
  const eye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  eye.setAttribute('cx', '101');
  eye.setAttribute('cy', '31');
  eye.setAttribute('r', '1.8');
  eye.setAttribute('class', 'title__ox-eye');
  svg.append(eye);
  return svg;
}

/**
 * The title card: the modes with a line on where the player stands in
 * each, the hangar and settings, the theme and the light, and the credit
 * to the original.
 */
export function buildTitleScreen(handlers: TitleHandlers, howToPlayHref: string) {
  const statuses = new Map<ModeId, HTMLElement>();
  const flags = new Map<ModeId, HTMLElement>();
  const modeButtons = MODES.map((mode) => {
    const status = h('span', { class: 'mode__status' });
    const flag = h('span', { class: 'mode__flag', hidden: true });
    statuses.set(mode.id, status);
    flags.set(mode.id, flag);
    return button(
      h('span', { class: 'mode__name' }, mode.name, flag),
      () => handlers.open(mode.id),
      'mode',
      { 'data-mode': mode.id },
      h('span', { class: 'mode__blurb' }, mode.blurb),
      status,
    );
  });

  const themeName = h('span', { class: 'title__theme-name' });
  let theme: ThemeId = 'great-war';
  const stepTheme = (step: number) => {
    const index = THEME_IDS.indexOf(theme);
    handlers.theme(THEME_IDS[(index + step + THEME_IDS.length) % THEME_IDS.length] as ThemeId);
  };
  const lightButton = button('', () => handlers.toggleLight(), 'chip title__light', {
    'aria-label': 'Day or night',
  });

  const ox = oxDrawing();
  let pats: number[] = [];
  ox.addEventListener('pointerdown', () => {
    const now = performance.now();
    pats = [...pats.filter((time) => now - time < 3000), now];
    ox.classList.remove('title__ox--moo');
    void ox.getBoundingClientRect();
    ox.classList.add('title__ox--moo');
    if (pats.length >= 5) {
      pats = [];
      handlers.secret();
    }
  });

  const element = h(
    'section',
    { class: 'screen screen--title', 'aria-labelledby': 'title-name', hidden: true },
    h(
      'div',
      { class: 'card card--title' },
      h('p', { class: 'card__kicker' }, 'NeoArcade presents'),
      h('h1', { class: 'card__title', id: 'title-name' }, 'Mind the Ox'),
      ox,
      h(
        'p',
        { class: 'card__tagline' },
        'Bomb the depots. Dodge the birds. Whatever you do — mind the ox.',
      ),
      h('nav', { class: 'modes', 'aria-label': 'Modes' }, ...modeButtons),
      h(
        'div',
        { class: 'title__row' },
        button('Hangar', () => handlers.hangar(), 'chip'),
        button('Settings', () => handlers.settings(), 'chip'),
        h('a', { class: 'chip', href: howToPlayHref }, 'How to play'),
      ),
      h(
        'div',
        { class: 'title__row title__theme', role: 'group', 'aria-label': 'Theme' },
        button('‹', () => stepTheme(-1), 'chip chip--arrow', { 'aria-label': 'Previous theme' }),
        themeName,
        button('›', () => stepTheme(1), 'chip chip--arrow', { 'aria-label': 'Next theme' }),
        lightButton,
      ),
      h(
        'p',
        { class: 'card__credit' },
        'Inspired by Sopwith by David L. Clark, BMB Compuscience Canada, 1984.',
      ),
    ),
  );

  // 1984 hid its missiles behind a command-line switch, -x. Typing it here opens the hangar.
  let typed = '';
  window.addEventListener('keydown', (event) => {
    if (element.hidden || event.repeat) return;
    typed = (typed + event.key.toLowerCase()).slice(-2);
    if (typed === '-x') {
      typed = '';
      handlers.secret();
    }
  });

  return {
    element,
    setStatus(mode: ModeId, status: string, flag?: string) {
      const line = statuses.get(mode);
      if (line) line.textContent = status;
      const badge = flags.get(mode);
      if (badge) {
        badge.hidden = !flag;
        badge.textContent = flag ?? '';
      }
    },
    showTheme(next: ThemeId, lighting: 'day' | 'night') {
      theme = next;
      themeName.textContent = THEMES[next].name;
      lightButton.textContent = lighting === 'day' ? '☀ Day' : '☾ Night';
    },
    focusFirst() {
      modeButtons[0]?.focus();
    },
  };
}
