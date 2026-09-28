import type { Store } from '@shared/storage';

export type Theme = 'light' | 'dark';
export type ThemeChoice = 'auto' | Theme;

const THEME_KEY = 'theme';
const THEME_COLOURS: Record<Theme, string> = { dark: '#07060e', light: '#f4f1fa' };

/**
 * The Hall's light or dark look: the player's choice, or the device's while
 * they have not chosen. index.html applies the same rule before the first
 * paint, so a light-theme player never sees a dark flash.
 */
export interface HallTheme {
  readonly theme: Theme;
  readonly choice: ThemeChoice;
  toggle(): void;
  onChange(listener: (theme: Theme) => void): () => void;
}

export function resolveTheme(choice: unknown, systemPrefersLight: boolean): Theme {
  if (choice === 'light' || choice === 'dark') return choice;
  return systemPrefersLight ? 'light' : 'dark';
}

export function createHallTheme(store: Store): HallTheme {
  const systemQuery = matchMedia('(prefers-color-scheme: light)');
  const listeners = new Set<(theme: Theme) => void>();
  let choice: ThemeChoice = sanitiseChoice(store.get<unknown>(THEME_KEY, 'auto'));
  let theme = resolveTheme(choice, systemQuery.matches);

  const apply = () => {
    const next = resolveTheme(choice, systemQuery.matches);
    document.documentElement.dataset.theme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOURS[next]);
    if (next === theme) return;
    theme = next;
    for (const listener of listeners) listener(theme);
  };

  systemQuery.addEventListener('change', apply);
  apply();

  return {
    get theme() {
      return theme;
    },
    get choice() {
      return choice;
    },
    toggle() {
      choice = theme === 'light' ? 'dark' : 'light';
      store.set(THEME_KEY, choice);
      apply();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function sanitiseChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'auto';
}
