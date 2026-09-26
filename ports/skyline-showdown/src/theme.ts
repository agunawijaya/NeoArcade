import type { Store } from '@shared/storage';
import type { Theme } from './render/palette';

export type ThemeChoice = 'auto' | Theme;

export const THEME_CHOICES: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

const STORAGE_KEY = 'theme';

export function sanitiseThemeChoice(value: unknown): ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : 'auto';
}

/** What a choice means right now; "auto" follows the device. */
export function resolveTheme(choice: ThemeChoice, systemPrefersLight: boolean): Theme {
  if (choice !== 'auto') return choice;
  return systemPrefersLight ? 'light' : 'dark';
}

/**
 * The player's light or dark preference. Like the sound mix, it applies the
 * moment it changes and is saved straight away, apart from the match rules
 * that wait for Start.
 */
export class ThemePreference {
  private current: ThemeChoice;
  private readonly systemQuery = matchMedia('(prefers-color-scheme: light)');
  private readonly listeners = new Set<() => void>();

  constructor(private readonly store: Store) {
    this.current = sanitiseThemeChoice(store.get<unknown>(STORAGE_KEY, 'auto'));
    this.systemQuery.addEventListener('change', () => {
      if (this.current === 'auto') this.notify();
    });
  }

  get choice(): ThemeChoice {
    return this.current;
  }

  get theme(): Theme {
    return resolveTheme(this.current, this.systemQuery.matches);
  }

  choose(choice: ThemeChoice) {
    if (choice === this.current) return;
    this.current = choice;
    this.store.set(STORAGE_KEY, choice);
    this.notify();
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}
