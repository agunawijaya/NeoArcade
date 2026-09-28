import type { AudioEngine } from '@shared/audio';
import { NAME_LENGTH, type Settings } from '../settings';
import type { ThemeChoice, ThemePreference } from '../theme';
import { h, icon } from './dom';
import { group, keepingFocus, segmented, slider, toggle } from './form';
import { ICONS } from './icons';

export interface PreferencesHandlers {
  /** A preference changed; the new settings are saved at once. */
  change(settings: Settings): void;
  back(): void;
}

/**
 * Settings from the main menu: how you aim, what you are called, how it
 * looks and sounds. They apply to the World Tour and Quick Match alike, and
 * take effect straight away; the match rules live on the Quick Match screen.
 */
export function buildPreferencesScreen(
  audio: AudioEngine,
  theme: ThemePreference,
  handlers: PreferencesHandlers,
): { element: HTMLElement; refresh(settings: Settings): void } {
  let settings: Settings | null = null;
  const body = h('div', { class: 'settings__body' });

  const update = (next: Settings) => {
    settings = next;
    handlers.change(next);
    keepingFocus(body, render);
  };

  const nameField = (current: Settings, player: 0 | 1) => {
    const field = h('input', {
      class: 'field',
      type: 'text',
      maxlength: NAME_LENGTH,
      value: current.names[player],
      'aria-label': `Player ${player + 1} name`,
      autocomplete: 'off',
      spellcheck: 'false',
      'data-focus-key': `name-${player}`,
    });
    field.addEventListener('change', () => {
      const names: [string, string] = [...current.names];
      names[player] = field.value;
      update({ ...current, names });
    });
    return h('label', { class: 'settings__name' }, h('span', {}, `Player ${player + 1}`), field);
  };

  function render() {
    const current = settings;
    if (!current) return;
    body.replaceChildren(
      group(
        'Aiming',
        h(
          'div',
          { class: 'settings__row' },
          segmented(
            'aiming',
            current.aiming,
            [
              { value: 'drag', label: 'Slingshot + keys' },
              { value: 'typed', label: 'Type numbers', note: 'as in 1990' },
            ],
            (aiming) => update({ ...current, aiming }),
          ),
          toggle('Aim assist', current.aimAssist, (aimAssist) => update({ ...current, aimAssist })),
        ),
      ),
      h(
        'p',
        { class: 'settings__note' },
        'Aim assist shows the first third of every throw. On the World Tour it caps a stage at one star.',
      ),
      group(
        'Names',
        h('div', { class: 'settings__names' }, nameField(current, 0), nameField(current, 1)),
      ),
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
              keepingFocus(body, render);
            },
          ),
          toggle('CRT filter', current.crt, (crt) => update({ ...current, crt })),
          toggle('Weather in Quick Match', current.weather, (weather) =>
            update({ ...current, weather }),
          ),
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
  }

  const done = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.back),
    'Done',
  );
  done.addEventListener('click', handlers.back);

  const element = h(
    'section',
    { class: 'screen screen--settings', 'aria-labelledby': 'preferences-title', hidden: true },
    h(
      'div',
      { class: 'panel settings' },
      h('h2', { class: 'panel__title', id: 'preferences-title' }, 'Settings'),
      body,
      h('div', { class: 'settings__footer settings__footer--end' }, done),
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
