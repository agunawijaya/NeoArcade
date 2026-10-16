import {
  CONTRAILS,
  PAINTS,
  SCARVES,
  liveryFor,
  type ContrailId,
  type PaintId,
  type PaintJob,
  type ScarfId,
} from '../render/liveries';
import { paletteFor, type WingMotif } from '../render/palette';
import { drawBiplane } from '../render/side/biplane';
import type { ThemeId } from '../themes';
import { button, h } from './dom';

export interface HangarHandlers {
  job(): PaintJob;
  change(job: PaintJob): void;
  /** Whether a cosmetic (by its Pass id) is the player's. */
  owns(id: string): boolean;
  unlockHint(id: string): string;
  theme(): ThemeId;
  lighting(): 'day' | 'night';
  hangarFound(): boolean;
  secretWeapons(): boolean;
  setSecretWeapons(on: boolean): void;
  back(): void;
}

const NAMES: Record<string, string> = {
  standard: 'Standard',
  none: 'None',
  'racing-green': 'Racing green',
  'sky-blue': 'Sky blue',
  crimson: 'Crimson',
  midnight: 'Midnight',
  sunflower: 'Sunflower',
  silver: 'Silver dope',
  'sea-grey': 'Sea grey',
  navy: 'Navy',
  sky: 'Sky',
  gold: 'Gold',
  emerald: 'Emerald',
  violet: 'Violet',
  stripes: 'Stripes',
  checks: 'Checks',
  chevrons: 'Chevrons',
  sunburst: 'Sunburst',
  white: 'White',
  rainbow: 'Rainbow',
};

const MOTIFS: readonly WingMotif[] = ['none', 'stripes', 'checks', 'chevrons', 'sunburst'];

/**
 * The hangar: the player's plane on a stand, and the paint, scarf, wing
 * motif and contrail the Arcade Pass has unlocked. Purely for looks. Once
 * the Secret Hangar has been found, its door is here too.
 */
export function buildHangarScreen(handlers: HangarHandlers) {
  const preview = h('canvas', { class: 'hangar__preview', 'aria-hidden': 'true' });
  const rows = h('div', { class: 'hangar__rows' });
  const secret = h('div', { class: 'hangar__secret' });

  const element = h(
    'section',
    { class: 'screen', 'aria-labelledby': 'hangar-title', hidden: true },
    h(
      'div',
      { class: 'card card--wide' },
      h('h2', { class: 'card__title card__title--small', id: 'hangar-title' }, 'Hangar'),
      h('p', { class: 'panel__subtitle' }, 'Paint, scarves, motifs and contrails: for looks only.'),
      h('div', { class: 'hangar' }, preview, rows),
      secret,
      h('div', { class: 'card__footer' }, button('Back', handlers.back, 'chip')),
    ),
  );

  const row = <Value extends string>(
    title: string,
    kind: string,
    values: readonly Value[],
    current: Value,
    choose: (value: Value) => void,
    free: Value,
  ) =>
    h(
      'div',
      { class: 'choice', role: 'group', 'aria-label': title },
      h('span', { class: 'choice__label' }, title),
      h(
        'span',
        { class: 'choice__options' },
        ...values.map((value) => {
          const id = `${kind}-${value}`;
          const owned = value === free || handlers.owns(id);
          return button(
            NAMES[value] ?? value,
            () => {
              choose(value);
              refresh();
            },
            'chip',
            {
              'aria-pressed': String(value === current),
              disabled: !owned,
              title: owned ? undefined : handlers.unlockHint(id),
            },
          );
        }),
      ),
    );

  const paintPreview = () => {
    const ratio = Math.min(2, devicePixelRatio || 1);
    const width = preview.clientWidth || 320;
    const height = preview.clientHeight || 180;
    preview.width = Math.round(width * ratio);
    preview.height = Math.round(height * ratio);
    const ctx = preview.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const palette = paletteFor(handlers.theme(), handlers.lighting());
    drawBiplane(
      ctx,
      {
        x: width / 2,
        y: height / 2,
        scale: Math.min(width, height * 1.6) / 34,
        pitch: 0.12,
        roll: 0.35,
        spin: performance.now() / 60,
        power: 0.5,
        wounded: false,
        seed: 1,
        time: performance.now() / 1000,
        daylight: palette.daylight,
      },
      liveryFor(palette, 0, 'player', handlers.job()),
    );
  };

  const refresh = () => {
    const job = handlers.job();
    const set = (change: Partial<PaintJob>) => handlers.change({ ...handlers.job(), ...change });
    rows.replaceChildren(
      row(
        'Paint',
        'paint',
        Object.keys(PAINTS) as PaintId[],
        job.paint,
        (paint) => set({ paint }),
        'standard',
      ),
      row(
        'Scarf',
        'scarf',
        Object.keys(SCARVES) as ScarfId[],
        job.scarf,
        (scarf) => set({ scarf }),
        'standard',
      ),
      row('Wing motif', 'motif', MOTIFS, job.motif, (motif) => set({ motif }), 'none'),
      row(
        'Contrail',
        'contrail',
        Object.keys(CONTRAILS) as ContrailId[],
        job.contrail,
        (contrail) => set({ contrail }),
        'none',
      ),
    );
    secret.replaceChildren();
    secret.hidden = !handlers.hangarFound();
    if (handlers.hangarFound()) {
      const on = handlers.secretWeapons();
      secret.append(
        h('h3', {}, 'The Secret Hangar'),
        h(
          'p',
          {},
          'Missiles that home on the nearest enemy, and starbursts that lure them away: 1984 kept them behind a switch it never printed. They work in every mode but the Daily Sortie. On a keyboard: M and V, or V and C with the 1984 keys.',
        ),
        button(
          on ? 'Missiles and starbursts: on' : 'Missiles and starbursts: off',
          () => {
            handlers.setSecretWeapons(!on);
            refresh();
          },
          'chip',
          { 'aria-pressed': String(on) },
        ),
      );
    }
    requestAnimationFrame(paintPreview);
  };

  return {
    element,
    refresh,
    focusFirst() {
      rows.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    },
  };
}
