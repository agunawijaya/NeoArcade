import type { AudioEngine } from '@shared/audio';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../engine/difficulty';
import { RIG_PAINTS, type RigPaintId } from '../render/rig';
import {
  DRIVE_VIEWS,
  RHYTHMS,
  RHYTHM_NAMES,
  UNIT_CHOICES,
  VIEW_NAMES,
  WARPS,
  type Settings,
} from '../settings';
import { THEME_CHOICES, type ThemePreference } from '../theme';
import { button, fill, h, icon } from './dom';
import { ICONS } from './icons';

/**
 * Settings: how the trip plays (rhythm, view, difficulty), how it reads
 * (units, theme), how it sounds, and the CRT Easter egg that turns a trip
 * back into the original prompts. Every change is saved at once.
 */
export interface SettingsScreenOptions {
  settings: () => Settings;
  save: (change: Partial<Settings>) => void;
  theme: ThemePreference;
  audio: AudioEngine;
  /** Every rig paint, and whether the Arcade Pass has unlocked it. */
  paints: () => readonly PaintChoice[];
  back: () => void;
}

export interface PaintChoice {
  id: RigPaintId;
  name: string;
  unlocked: boolean;
  /** How to unlock it, while locked. */
  hint: string;
}

export class SettingsScreen {
  readonly element: HTMLElement;
  private readonly inner: HTMLElement;

  constructor(private readonly options: SettingsScreenOptions) {
    this.inner = h('div', { class: 'screen__inner settings' });
    this.element = h(
      'section',
      { class: 'screen', 'aria-label': 'Settings', hidden: true },
      this.inner,
    );
    options.audio.onChange(() => {
      if (!this.element.hidden) this.render();
    });
  }

  show() {
    this.render();
    this.element.hidden = false;
    this.inner.querySelector<HTMLButtonElement>('.segmented button')?.focus();
  }

  hide() {
    this.element.hidden = true;
  }

  private render() {
    const settings = this.options.settings();
    const segmented = <T extends string | number>(
      label: string,
      values: readonly T[],
      current: T,
      name: (value: T) => string,
      pick: (value: T) => void,
    ) =>
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field__label' }, label),
        h(
          'div',
          { class: 'segmented', role: 'group', 'aria-label': label },
          ...values.map((value) =>
            button(
              name(value),
              () => {
                pick(value);
                this.render();
              },
              '',
              { 'aria-pressed': value === current },
            ),
          ),
        ),
      );
    const save = (change: Partial<Settings>) => this.options.save(change);
    const mix = this.options.audio.mix;
    const slider = (label: string, value: number, change: (value: number) => void) => {
      const input = h('input', {
        class: 'slider',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        value,
        'aria-label': label,
      }) as HTMLInputElement;
      input.addEventListener('input', () => change(Number(input.value)));
      return h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), input);
    };
    fill(
      this.inner,
      h(
        'div',
        { class: 'screen__head' },
        button(icon(ICONS.back), () => this.options.back(), 'button button--small button--icon', {
          'aria-label': 'Back',
        }),
        h('h1', { class: 'screen__title' }, 'Settings'),
      ),
      h(
        'div',
        { class: 'settings__grid' },
        h(
          'div',
          { class: 'panel' },
          h('h2', { class: 'panel__title' }, 'Driving'),
          segmented(
            'Play rhythm',
            RHYTHMS,
            settings.rhythm,
            (value) => RHYTHM_NAMES[value],
            (rhythm) => save({ rhythm }),
          ),
          h(
            'p',
            { class: 'muted' },
            settings.rhythm === 'realtime'
              ? 'The hours roll by on their own; the throttle sets the speed for each one. Events stop the clock.'
              : 'Like the original: choose a speed at each waypoint, then watch the leg play out at high speed.',
          ),
          segmented(
            'View',
            DRIVE_VIEWS,
            settings.view,
            (value) => VIEW_NAMES[value],
            (view) => save({ view }),
          ),
          segmented(
            'Real-time speed',
            WARPS,
            settings.warp,
            (value) => `${value}×`,
            (warp) => save({ warp }),
          ),
          segmented(
            'Stop the clock for',
            ['major', 'all'] as const,
            settings.eventPause,
            (value) => (value === 'major' ? 'Serious events' : 'Every event'),
            (eventPause) => save({ eventPause }),
          ),
        ),
        h(
          'div',
          { class: 'panel' },
          h('h2', { class: 'panel__title' }, 'Difficulty'),
          segmented(
            'Difficulty',
            DIFFICULTY_IDS,
            settings.difficulty,
            (value) => DIFFICULTIES[value].name,
            (difficulty) => save({ difficulty }),
          ),
          h('p', { class: 'muted' }, DIFFICULTIES[settings.difficulty].summary),
          h('p', { class: 'muted' }, 'A trip keeps the difficulty it started with.'),
        ),
        h(
          'div',
          { class: 'panel' },
          h('h2', { class: 'panel__title' }, 'Display'),
          segmented(
            'Units',
            UNIT_CHOICES,
            settings.units,
            (value) => (value === 'mi' ? 'Miles' : 'Kilometres'),
            (units) => save({ units }),
          ),
          segmented(
            'Theme',
            THEME_CHOICES,
            this.options.theme.choice,
            (value) => (value === 'auto' ? 'Follow device' : value === 'light' ? 'Day' : 'Night'),
            (choice) => this.options.theme.choose(choice),
          ),
          h(
            'label',
            { class: 'row settings__crt' },
            (() => {
              const box = h('input', {
                type: 'checkbox',
                checked: settings.textMode,
              }) as HTMLInputElement;
              box.addEventListener('change', () => save({ textMode: box.checked }));
              return box;
            })(),
            h(
              'span',
              {},
              h('strong', {}, 'Text mode (the original). '),
              'Green on black: the trip as the original prompts, hour by hour, typed answers and all.',
            ),
          ),
        ),
        h(
          'div',
          { class: 'panel' },
          h('h2', { class: 'panel__title' }, 'Rig paint'),
          h(
            'div',
            { class: 'settings__paints', role: 'group', 'aria-label': 'Rig paint' },
            ...this.options.paints().map((paint) => {
              const colours = RIG_PAINTS[paint.id];
              return button(
                h('span', { class: 'settings__paint-name' }, paint.name),
                () => {
                  save({ paint: paint.id });
                  this.render();
                },
                'settings__paint',
                {
                  'aria-pressed': settings.paint === paint.id,
                  disabled: !paint.unlocked,
                  title: paint.unlocked ? paint.name : paint.hint,
                  style: `--paint-body: ${colours.body}; --paint-trim: ${colours.trim}; --paint-stripe: ${colours.stripe}`,
                },
                h('span', { class: 'settings__swatch', 'aria-hidden': 'true' }),
                paint.unlocked ? null : h('span', { class: 'settings__lock' }, paint.hint),
              );
            }),
          ),
          h(
            'p',
            { class: 'muted' },
            'Paints are unlocked on the Arcade Pass. They change nothing but the colours.',
          ),
        ),
        h(
          'div',
          { class: 'panel' },
          h('h2', { class: 'panel__title' }, 'Sound'),
          slider('Volume', mix.volume, (value) => this.options.audio.setVolume(value)),
          slider('Music', mix.music, (value) => this.options.audio.setMusicVolume(value)),
          slider('Effects', mix.sfx, (value) => this.options.audio.setSfxVolume(value)),
          button(
            mix.muted ? 'Unmute' : 'Mute',
            () => this.options.audio.toggleMute(),
            'button button--small',
          ),
          h('p', { class: 'muted' }, 'The mix is shared by every game in the arcade.'),
        ),
      ),
    );
  }
}
