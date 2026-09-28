import type { AudioEngine } from '@shared/audio';
import { DIFFICULTIES, type Difficulty } from '../engine/modes';
import {
  CAMERA_VIEWS,
  DIFFICULTY_NAMES,
  MODE_IDS,
  POINTS_RANGE,
  type ModeId,
  type ScreenFilter,
  type Settings,
} from '../settings';
import type { ThemeChoice, ThemePreference } from '../theme';
import { button, h, icon } from './dom';
import { ICONS } from './icons';
import { CAMERA_NAMES } from './overlays';

export interface SettingsHandlers {
  save(settings: Settings): void;
  back(): void;
  play(mode: ModeId): void;
}

interface Choice<T extends string> {
  value: T;
  label: string;
  note?: string;
}

const MODE_NAMES: Record<ModeId, string> = {
  trip: 'Road Trip',
  endless: 'Endless',
  daily: 'Daily Road',
  classic: 'Classic Duel',
  versus: 'Donkey vs Driver',
};

const DIFFICULTY_NOTES: Record<Difficulty, string> = {
  relaxed: 'more time to react',
  normal: 'fair on a phone',
  frantic: 'blink and you crash',
};

const FILTER_CHOICES: Choice<ScreenFilter>[] = [
  { value: 'none', label: 'None' },
  { value: 'crt', label: 'CRT', note: 'curved glass' },
  { value: 'cga', label: 'CGA', note: 'four colours, 1981' },
];

/**
 * Every choice in one place. Changes apply and are kept at once; the camera
 * view can also be switched from the pause menu at any time.
 */
export function buildSettingsScreen(
  initial: Settings,
  audio: AudioEngine,
  theme: ThemePreference,
  handlers: SettingsHandlers,
): { element: HTMLElement; refresh(settings: Settings): void } {
  let settings = structuredClone(initial);
  const body = h('div', { class: 'settings__body' });
  const play = button('', () => handlers.play(settings.mode), 'button button--primary');

  const update = (next: Settings) => {
    const focused = document.activeElement?.getAttribute('data-focus-key');
    settings = next;
    handlers.save(structuredClone(settings));
    render();
    if (focused) body.querySelector<HTMLElement>(`[data-focus-key="${focused}"]`)?.focus();
  };

  const render = () => {
    play.replaceChildren(icon(ICONS.play), `Play ${MODE_NAMES[settings.mode]}`);
    body.replaceChildren(
      group(
        'Mode',
        segmented(
          'mode',
          settings.mode,
          MODE_IDS.map((mode) => ({ value: mode, label: MODE_NAMES[mode] })),
          (mode) => update({ ...settings, mode }),
        ),
      ),
      group(
        'Camera',
        segmented(
          'camera',
          settings.camera,
          CAMERA_VIEWS.map((view) => ({
            value: view,
            label: CAMERA_NAMES[view].name,
            note: CAMERA_NAMES[view].note,
          })),
          (camera) => update({ ...settings, camera }),
        ),
      ),
      group(
        'Difficulty · Endless and Daily practice',
        segmented(
          'difficulty',
          settings.difficulty,
          DIFFICULTIES.map((difficulty) => ({
            value: difficulty,
            label: DIFFICULTY_NAMES[difficulty],
            note: DIFFICULTY_NOTES[difficulty],
          })),
          (difficulty) => update({ ...settings, difficulty }),
        ),
      ),
      group('Points to win · Classic Duel and Donkey vs Driver', stepper()),
      group(
        'Hazards',
        h(
          'div',
          { class: 'settings__row' },
          toggle('Classic Duel', settings.hazards.classic, (on) =>
            update({ ...settings, hazards: { ...settings.hazards, classic: on } }),
          ),
          toggle('Donkey vs Driver', settings.hazards.versus, (on) =>
            update({ ...settings, hazards: { ...settings.hazards, versus: on } }),
          ),
          toggle('Endless and practice', settings.hazards.endless, (on) =>
            update({ ...settings, hazards: { ...settings.hazards, endless: on } }),
          ),
        ),
      ),
      group(
        'Rhythm',
        toggle('Bonus for switching lanes on the beat', settings.rhythm, (rhythm) =>
          update({ ...settings, rhythm }),
        ),
      ),
      group(
        'Screen filter',
        segmented('filter', settings.filter, FILTER_CHOICES, (filter) =>
          update({ ...settings, filter }),
        ),
      ),
      group(
        'Time of day',
        segmented<ThemeChoice>(
          'theme',
          theme.choice,
          [
            { value: 'auto', label: 'Auto', note: 'like your device' },
            { value: 'light', label: 'Daylight' },
            { value: 'dark', label: 'Golden hour' },
          ],
          (choice) => {
            theme.choose(choice);
            render();
          },
        ),
      ),
      group(
        'Sound',
        h(
          'div',
          { class: 'settings__row' },
          slider('Effects', audio.mix.sfx, (value) => audio.setSfxVolume(value)),
          slider('Music', audio.mix.music, (value) => audio.setMusicVolume(value)),
          toggle('Mute everything', audio.mix.muted, (muted) => {
            audio.setMuted(muted);
            render();
          }),
        ),
      ),
    );
  };

  const stepper = () => {
    const change = (delta: number) =>
      update({
        ...settings,
        points: Math.min(POINTS_RANGE.max, Math.max(POINTS_RANGE.min, settings.points + delta)),
      });
    return h(
      'div',
      { class: 'stepper', role: 'group', 'aria-label': 'Points to win' },
      button('−', () => change(-1), 'stepper__button', {
        'aria-label': 'Fewer points',
        'data-focus-key': 'points-minus',
      }),
      h(
        'output',
        { class: 'stepper__value', 'aria-live': 'polite' },
        `First to ${settings.points}`,
      ),
      button('+', () => change(1), 'stepper__button', {
        'aria-label': 'More points',
        'data-focus-key': 'points-plus',
      }),
    );
  };

  render();

  const element = h(
    'section',
    { class: 'screen screen--panel', 'aria-labelledby': 'settings-title', hidden: true },
    h(
      'div',
      { class: 'panel settings' },
      h('h2', { class: 'panel__title', id: 'settings-title' }, 'Settings'),
      body,
      h(
        'div',
        { class: 'panel__footer' },
        button('Back', handlers.back, 'button button--quiet', {}, icon(ICONS.back)),
        play,
      ),
    ),
  );

  return {
    element,
    refresh(next) {
      settings = structuredClone(next);
      render();
    },
  };
}

function group(label: string, control: HTMLElement): HTMLElement {
  return h(
    'fieldset',
    { class: 'setting' },
    h('legend', { class: 'setting__label' }, label),
    control,
  );
}

function segmented<T extends string>(
  name: string,
  current: T,
  choices: Choice<T>[],
  choose: (value: T) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': name },
    ...choices.map((choice) => {
      const option = h(
        'button',
        {
          class: 'segmented__option',
          type: 'button',
          role: 'radio',
          'aria-checked': String(choice.value === current),
          'data-value': choice.value,
          'data-focus-key': `${name}-${choice.value}`,
        },
        h('span', {}, choice.label),
        choice.note ? h('small', {}, choice.note) : null,
      );
      option.addEventListener('click', () => choose(choice.value));
      return option;
    }),
  );
}

function toggle(label: string, on: boolean, change: (on: boolean) => void): HTMLElement {
  return button(
    label,
    () => change(!on),
    'toggle',
    { role: 'switch', 'aria-checked': String(on), 'data-focus-key': `toggle-${label}` },
    h(
      'span',
      { class: 'toggle__track', 'aria-hidden': 'true' },
      h('span', { class: 'toggle__thumb' }),
    ),
  );
}

function slider(label: string, value: number, change: (value: number) => void): HTMLElement {
  const input = h('input', {
    class: 'slider',
    type: 'range',
    min: 0,
    max: 100,
    value: Math.round(value * 100),
    'aria-label': `${label} volume`,
  });
  input.addEventListener('input', () => change(Number(input.value) / 100));
  return h('label', { class: 'settings__slider' }, h('span', {}, label), input);
}
