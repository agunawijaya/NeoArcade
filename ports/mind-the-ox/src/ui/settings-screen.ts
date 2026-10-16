import type { AudioEngine } from '@shared/audio';
import {
  FLYING_ACTIONS,
  keysFor,
  type FlyingAction,
  type KeySetId,
  type LightPreference,
  type Settings,
} from '../settings';
import { THEMES, THEME_IDS } from '../themes';
import { button, choiceRow, h, keyLabel } from './dom';

export interface SettingsHandlers {
  settings(): Settings;
  save(next: Settings): void;
  light: LightPreference;
  audio: AudioEngine;
  back(): void;
}

const ACTION_NAMES: Readonly<Record<FlyingAction, string>> = {
  pull: 'Nose up',
  push: 'Nose down',
  faster: 'Throttle up',
  slower: 'Throttle down',
  flip: 'Flip',
  fire: 'Guns',
  bomb: 'Bombs',
  missile: 'Missile',
  starburst: 'Starburst',
  home: 'Fly home',
  loadout: 'Bombs or torpedo (on deck)',
};

const SET_NAMES: Readonly<Record<KeySetId, string>> = {
  solo: 'One player',
  left: 'Two players · top (left of the keyboard)',
  right: 'Two players · bottom (right of the keyboard)',
};

/**
 * Settings: the theme, the light, the camera, how the plane flies, the
 * carrier's landing assist and what to carry off it, the CGA picture for
 * Classic 1984, the on-screen controls, every key, and the arcade-wide
 * sound.
 */
export function buildSettingsScreen(handlers: SettingsHandlers) {
  const body = h('div', { class: 'settings' });
  const element = h(
    'section',
    { class: 'screen', 'aria-labelledby': 'settings-title', hidden: true },
    h(
      'div',
      { class: 'card card--wide card--scroll' },
      h('h2', { class: 'card__title card__title--small', id: 'settings-title' }, 'Settings'),
      body,
      h('div', { class: 'card__footer' }, button('Done', handlers.back, 'card__button')),
    ),
  );
  /** The key button waiting for a press, if any. */
  let listening: { set: KeySetId; action: FlyingAction } | null = null;

  const update = (change: Partial<Settings>) => {
    handlers.save({ ...handlers.settings(), ...change });
  };

  const keyTable = (set: KeySetId) => {
    const keys = keysFor(handlers.settings(), set);
    return h(
      'div',
      { class: 'keys' },
      h('h4', {}, SET_NAMES[set]),
      h(
        'div',
        { class: 'keys__grid' },
        ...FLYING_ACTIONS.map((action) => {
          const waiting = listening?.set === set && listening.action === action;
          return h(
            'span',
            { class: 'keys__item' },
            h('span', {}, ACTION_NAMES[action]),
            button(
              waiting ? 'Press a key…' : keyLabel(keys[action]),
              () => {
                listening = { set, action };
                refresh();
                element.querySelector<HTMLElement>('[data-waiting]')?.focus();
              },
              'chip chip--key',
              { 'data-waiting': waiting || undefined },
            ),
          );
        }),
      ),
      button(
        'Reset these keys',
        () => {
          const settings = handlers.settings();
          update({ keys: { ...settings.keys, [set]: {} } });
          refresh();
        },
        'chip chip--quiet',
      ),
    );
  };

  window.addEventListener(
    'keydown',
    (event) => {
      if (!listening || element.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      const { set, action } = listening;
      listening = null;
      if (event.code !== 'Escape') assignKey(set, action, event.code);
      refresh();
    },
    { capture: true },
  );

  /** Gives an action a key; whichever action had that key takes this one's old key. */
  const assignKey = (set: KeySetId, action: FlyingAction, code: string) => {
    const settings = handlers.settings();
    const current = keysFor(settings, set);
    const choices = { ...settings.keys[set], [action]: code };
    const clash = FLYING_ACTIONS.find((other) => other !== action && current[other] === code);
    if (clash) choices[clash] = current[action];
    update({ keys: { ...settings.keys, [set]: choices } });
  };

  const refresh = () => {
    const audio = handlers.audio;
    const rows = [
      choiceRow(
        'Theme',
        THEME_IDS.map((id) => ({ value: id, label: THEMES[id].name })),
        () => handlers.settings().theme,
        (theme) => update({ theme }),
      ),
      choiceRow(
        'Light',
        [
          { value: 'auto' as const, label: 'Like this device' },
          { value: 'day' as const, label: 'Day' },
          { value: 'night' as const, label: 'Night' },
        ],
        () => handlers.light.choice,
        (choice) => handlers.light.choose(choice),
      ),
      choiceRow(
        'Camera',
        [
          { value: 'side' as const, label: 'Side view' },
          { value: 'diorama' as const, label: 'Diorama 3D' },
        ],
        () => handlers.settings().camera,
        (camera) => update({ camera }),
      ),
      choiceRow(
        'Flying',
        [
          { value: 'smooth' as const, label: 'Smooth' },
          { value: 'classic' as const, label: '16 headings, as in 1984' },
        ],
        () => handlers.settings().flight,
        (flight) => update({ flight }),
      ),
      choiceRow(
        'Roll upright by itself',
        [
          { value: true, label: 'On' },
          { value: false, label: 'Off' },
        ],
        () => handlers.settings().autoRoll,
        (autoRoll) => update({ autoRoll }),
      ),
      choiceRow(
        'Carrier landing assist',
        [
          { value: 'auto' as const, label: 'Easy and Normal missions' },
          { value: 'on' as const, label: 'Always' },
          { value: 'off' as const, label: 'Never' },
        ],
        () => handlers.settings().landingAssist,
        (landingAssist) => update({ landingAssist }),
      ),
      choiceRow(
        'Carry off the carrier',
        [
          { value: 'briefing' as const, label: 'As the briefing says' },
          { value: 'bombs' as const, label: 'Bombs' },
          { value: 'torpedo' as const, label: 'A torpedo' },
        ],
        () => handlers.settings().loadout,
        (loadout) => update({ loadout }),
      ),
      choiceRow(
        'CGA picture in Classic 1984',
        [
          { value: false, label: 'Off' },
          { value: true, label: 'Four colours' },
        ],
        () => handlers.settings().cga,
        (cga) => update({ cga }),
      ),
      choiceRow(
        'On-screen controls',
        [
          { value: 'auto' as const, label: 'On touch screens' },
          { value: 'on' as const, label: 'Always' },
          { value: 'off' as const, label: 'Never' },
        ],
        () => handlers.settings().touch,
        (touch) => update({ touch }),
      ),
      choiceRow(
        'Keys for one player',
        [
          { value: 'modern' as const, label: 'Modern' },
          { value: 'classic' as const, label: '1984' },
        ],
        () => handlers.settings().layout,
        (layout) => {
          update({ layout, keys: { ...handlers.settings().keys, solo: {} } });
          refresh();
        },
      ),
    ];
    const volume = (label: string, value: number, set: (value: number) => void) => {
      const input = h('input', {
        type: 'range',
        min: 0,
        max: 100,
        step: 5,
        value: Math.round(value * 100),
        'aria-label': label,
      });
      input.addEventListener('input', () => set(Number(input.value) / 100));
      return h('label', { class: 'volume' }, h('span', {}, label), input);
    };
    body.replaceChildren(
      ...rows.map((row) => row.element),
      h('h3', {}, 'Keys'),
      h(
        'p',
        { class: 'card__note' },
        'Choose a key, then press the one you want. Escape keeps the old one. A gamepad always works: stick for the nose, triggers for the throttle, A guns, X bombs, Y flip, B home, the right stick pressed in to swap bombs for a torpedo on deck.',
      ),
      keyTable('solo'),
      keyTable('left'),
      keyTable('right'),
      h('h3', {}, 'Sound'),
      h(
        'div',
        { class: 'volumes' },
        volume('Volume', audio.mix.volume, (value) => audio.setVolume(value)),
        volume('Music', audio.mix.music, (value) => audio.setMusicVolume(value)),
        volume('Effects', audio.mix.sfx, (value) => audio.setSfxVolume(value)),
        button(
          audio.mix.muted ? 'Sound off' : 'Sound on',
          () => {
            audio.toggleMute();
            refresh();
          },
          'chip',
          { 'aria-pressed': String(!audio.mix.muted) },
        ),
      ),
      h(
        'p',
        { class: 'card__note' },
        'The theme, the light and the camera change at once; flying and keys from the next take-off.',
      ),
    );
  };

  return {
    element,
    refresh,
    focusFirst() {
      body.querySelector<HTMLElement>('button')?.focus();
    },
  };
}
