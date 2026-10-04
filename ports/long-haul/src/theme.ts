import type { Store } from '@shared/storage';

export type Theme = 'light' | 'dark';
export type ThemeChoice = 'auto' | Theme;

export const THEME_CHOICES: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

export function sanitiseThemeChoice(value: unknown): ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : 'auto';
}

/** What a choice means right now: "auto" follows the device. */
export function resolveTheme(choice: ThemeChoice, deviceIsLight: boolean): Theme {
  if (choice !== 'auto') return choice;
  return deviceIsLight ? 'light' : 'dark';
}

/**
 * Light is the paper road atlas by day; dark is the cab at night. Saved at
 * once and applied at once; `index.html` reads the same key before the
 * first paint.
 */
export class ThemePreference {
  private current: ThemeChoice;
  private readonly device = matchMedia('(prefers-color-scheme: light)');
  private readonly listeners = new Set<() => void>();

  constructor(private readonly store: Store) {
    this.current = sanitiseThemeChoice(store.get<unknown>('theme', 'auto'));
    this.device.addEventListener('change', () => {
      if (this.current === 'auto') this.notify();
    });
  }

  get choice(): ThemeChoice {
    return this.current;
  }

  get theme(): Theme {
    return resolveTheme(this.current, this.device.matches);
  }

  choose(choice: ThemeChoice) {
    if (choice === this.current) return;
    this.current = choice;
    this.store.set('theme', choice);
    this.notify();
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}
