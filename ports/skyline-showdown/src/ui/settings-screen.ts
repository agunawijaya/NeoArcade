import type { AudioEngine } from '@shared/audio';
import { POWER_UP_KINDS, POWER_UPS } from '../engine/powerups';
import { WORLDS, WORLD_IDS } from '../engine/worlds';
import {
  matchingPreset,
  NAME_LENGTH,
  POINTS_RANGE,
  withPreset,
  type PresetId,
  type Settings,
} from '../settings';
import type { ThemeChoice, ThemePreference } from '../theme';
import { h, icon } from './dom';
import { ICONS, POWER_UP_ICONS } from './icons';

export interface SettingsHandlers {
  start(settings: Settings): void;
  back(): void;
}

interface Choice<T extends string> {
  value: T;
  label: string;
  note?: string;
}

const PRESET_TEXT: Record<PresetId, { title: string; lines: string[] }> = {
  classic: {
    title: 'Classic 1990',
    lines: ['Two players, one keyboard', 'Type angle and velocity', 'No power-ups, CRT glow'],
  },
  neo: {
    title: 'NeoArcade',
    lines: [
      'You against the CPU',
      'Drag to aim like a slingshot',
      'Power-ups, weather, day and night',
    ],
  },
};

/**
 * The match setup screen. Rule changes are kept in a working copy until
 * Start; the theme and sound levels are personal and apply at once.
 */
export function buildSettingsScreen(
  initial: Settings,
  audio: AudioEngine,
  theme: ThemePreference,
  handlers: SettingsHandlers,
): { element: HTMLElement; refresh(settings: Settings): void } {
  let settings = structuredClone(initial);
  const body = h('div', { class: 'settings__body' });

  const render = () => {
    const preset = matchingPreset(settings);
    body.replaceChildren(
      h(
        'div',
        { class: 'settings__presets', role: 'radiogroup', 'aria-label': 'Preset' },
        ...(['classic', 'neo'] as PresetId[]).map((id) => {
          const card = h(
            'button',
            {
              class: 'preset',
              type: 'button',
              role: 'radio',
              'aria-checked': String(preset === id),
              'data-preset': id,
            },
            h('strong', {}, PRESET_TEXT[id].title),
            h('ul', {}, ...PRESET_TEXT[id].lines.map((line) => h('li', {}, line))),
          );
          card.addEventListener('click', () => update(withPreset(settings, id)));
          return card;
        }),
      ),
      h('p', { class: 'settings__custom', hidden: preset !== null }, 'Custom rules'),
      group(
        'Players',
        segmented(
          'players',
          settings.players,
          [
            { value: 'humanVsHuman', label: 'Two players' },
            { value: 'humanVsCpu', label: 'Versus CPU' },
            { value: 'cpuVsCpu', label: 'Watch CPUs' },
          ],
          (players) => update({ ...settings, players }),
        ),
      ),
      group(
        'CPU difficulty',
        segmented(
          'cpu',
          settings.cpuLevel,
          [
            { value: 'easy', label: 'Easy' },
            { value: 'normal', label: 'Normal' },
            { value: 'hard', label: 'Hard' },
            { value: 'brutal', label: 'Brutal' },
          ],
          (cpuLevel) => update({ ...settings, cpuLevel }),
          settings.players === 'humanVsHuman',
        ),
      ),
      group('Names', h('div', { class: 'settings__names' }, nameField(0), nameField(1))),
      group(
        'World',
        segmented(
          'world',
          settings.world,
          [
            ...WORLD_IDS.map((id) => ({
              value: id,
              label: WORLDS[id].name,
              note: `${WORLDS[id].gravity} m/s²`,
            })),
            { value: 'random' as const, label: 'Random', note: 'each round' },
          ],
          (world) => update({ ...settings, world }),
        ),
      ),
      group(
        'Match',
        h(
          'div',
          { class: 'settings__row' },
          stepper(),
          segmented(
            'format',
            settings.format,
            [
              { value: 'firstTo', label: 'First to' },
              { value: 'total', label: 'Total points', note: 'as in 1990' },
            ],
            (format) => update({ ...settings, format }),
          ),
        ),
      ),
      group(
        'Aiming',
        h(
          'div',
          { class: 'settings__row' },
          segmented(
            'aiming',
            settings.aiming,
            [
              { value: 'drag', label: 'Slingshot + keys' },
              { value: 'typed', label: 'Type numbers', note: 'as in 1990' },
            ],
            (aiming) => update({ ...settings, aiming }),
          ),
          toggle('Aim assist', settings.aimAssist, (aimAssist) =>
            update({ ...settings, aimAssist }),
          ),
        ),
      ),
      group('Power-ups', powerUps()),
      group(
        'Look',
        h(
          'div',
          { class: 'settings__row' },
          segmented<ThemeChoice>(
            'theme',
            theme.choice,
            [
              { value: 'auto', label: 'Auto', note: 'like your device' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ],
            (choice) => {
              theme.choose(choice);
              update(settings);
            },
          ),
          toggle('Weather and day cycle', settings.weather, (weather) =>
            update({ ...settings, weather }),
          ),
          toggle('CRT filter', settings.crt, (crt) => update({ ...settings, crt })),
        ),
      ),
      group(
        'Sound',
        h(
          'div',
          { class: 'settings__row' },
          slider('Effects', audio.mix.sfx, (value) => audio.setSfxVolume(value)),
          slider('Music', audio.mix.music, (value) => audio.setMusicVolume(value)),
        ),
      ),
    );
  };

  const update = (next: Settings) => {
    const focused = document.activeElement?.getAttribute('data-focus-key');
    settings = next;
    render();
    if (focused) body.querySelector<HTMLElement>(`[data-focus-key="${focused}"]`)?.focus();
  };

  const nameField = (player: 0 | 1) => {
    const field = h('input', {
      class: 'field',
      type: 'text',
      maxlength: NAME_LENGTH,
      value: settings.names[player],
      'aria-label': `Player ${player + 1} name`,
      autocomplete: 'off',
      spellcheck: 'false',
      'data-focus-key': `name-${player}`,
    });
    field.addEventListener('input', () => {
      settings.names[player] = field.value;
    });
    return h('label', { class: 'settings__name' }, h('span', {}, `Player ${player + 1}`), field);
  };

  const stepper = () => {
    const change = (delta: number) => {
      const points = Math.min(
        POINTS_RANGE.max,
        Math.max(POINTS_RANGE.min, settings.points + delta),
      );
      update({ ...settings, points });
    };
    const minus = h(
      'button',
      {
        class: 'stepper__button',
        type: 'button',
        'aria-label': 'Fewer points',
        'data-focus-key': 'points-minus',
      },
      '−',
    );
    const plus = h(
      'button',
      {
        class: 'stepper__button',
        type: 'button',
        'aria-label': 'More points',
        'data-focus-key': 'points-plus',
      },
      '+',
    );
    minus.addEventListener('click', () => change(-1));
    plus.addEventListener('click', () => change(1));
    return h(
      'div',
      { class: 'stepper', role: 'group', 'aria-label': 'Points' },
      minus,
      h(
        'output',
        { class: 'stepper__value', 'aria-live': 'polite' },
        `${settings.points} pt${settings.points === 1 ? '' : 's'}`,
      ),
      plus,
    );
  };

  const powerUps = () =>
    h(
      'div',
      { class: 'settings__row' },
      toggle('Balloons with crates', settings.powerUps, (powerUps) =>
        update({ ...settings, powerUps }),
      ),
      h(
        'div',
        { class: 'chips' },
        ...POWER_UP_KINDS.map((kind) => {
          const on = settings.powerUpKinds[kind];
          const chip = h(
            'button',
            {
              class: 'chip',
              type: 'button',
              'aria-pressed': String(on),
              disabled: !settings.powerUps,
              title: POWER_UPS[kind].effect,
              'data-kind': kind,
              'data-focus-key': `kind-${kind}`,
            },
            icon(POWER_UP_ICONS[kind]),
            POWER_UPS[kind].name,
          );
          chip.addEventListener('click', () =>
            update({ ...settings, powerUpKinds: { ...settings.powerUpKinds, [kind]: !on } }),
          );
          return chip;
        }),
      ),
    );

  render();

  const back = h(
    'button',
    { class: 'button button--quiet', type: 'button' },
    icon(ICONS.back),
    'Back',
  );
  back.addEventListener('click', handlers.back);
  const start = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.play),
    'Start match',
  );
  start.addEventListener('click', () => handlers.start(settings));

  const element = h(
    'section',
    { class: 'screen screen--settings', 'aria-labelledby': 'settings-title', hidden: true },
    h(
      'div',
      { class: 'panel settings' },
      h('h2', { class: 'panel__title', id: 'settings-title' }, 'Match settings'),
      body,
      h('div', { class: 'settings__footer' }, back, start),
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
  disabled = false,
): HTMLElement {
  return h(
    'div',
    {
      class: 'segmented',
      role: 'radiogroup',
      'aria-label': name,
      'aria-disabled': String(disabled),
    },
    ...choices.map((choice) => {
      const button = h(
        'button',
        {
          class: 'segmented__option',
          type: 'button',
          role: 'radio',
          'aria-checked': String(choice.value === current),
          disabled,
          'data-value': choice.value,
          'data-focus-key': `${name}-${choice.value}`,
        },
        h('span', {}, choice.label),
        choice.note ? h('small', {}, choice.note) : null,
      );
      button.addEventListener('click', () => choose(choice.value));
      return button;
    }),
  );
}

function toggle(label: string, on: boolean, change: (on: boolean) => void): HTMLElement {
  const button = h(
    'button',
    {
      class: 'toggle',
      type: 'button',
      role: 'switch',
      'aria-checked': String(on),
      'data-focus-key': `toggle-${label}`,
    },
    h(
      'span',
      { class: 'toggle__track', 'aria-hidden': 'true' },
      h('span', { class: 'toggle__thumb' }),
    ),
    label,
  );
  button.addEventListener('click', () => change(!on));
  return button;
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
