/**
 * Namespaced, JSON-typed access to localStorage. Everything survives a
 * browser that blocks storage (private mode, sandboxed iframes): values then
 * live in memory for the rest of the visit instead of throwing.
 */
export interface Store {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  /** Keys in this namespace, without the namespace prefix. */
  keys(): string[];
}

const PREFIX = 'neoarcade';

export function createStore(namespace: string, backend: Storage | null = browserStorage()): Store {
  const prefix = `${PREFIX}:${namespace}:`;
  const memory = new Map<string, string>();

  const read = (fullKey: string): string | null => {
    try {
      if (backend) return backend.getItem(fullKey);
    } catch {
      // Fall through to the in-memory copy.
    }
    return memory.get(fullKey) ?? null;
  };

  const write = (fullKey: string, text: string): void => {
    memory.set(fullKey, text);
    try {
      backend?.setItem(fullKey, text);
    } catch {
      // Quota or permission errors: the in-memory copy still serves this visit.
    }
  };

  return {
    get<T>(key: string, fallback: T): T {
      const text = read(prefix + key);
      if (text === null) return fallback;
      try {
        return JSON.parse(text) as T;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      write(prefix + key, JSON.stringify(value));
    },
    remove(key) {
      memory.delete(prefix + key);
      try {
        backend?.removeItem(prefix + key);
      } catch {
        // The in-memory copy is gone, which is all this visit will see.
      }
    },
    keys() {
      const found = new Set<string>();
      for (const fullKey of memory.keys()) if (fullKey.startsWith(prefix)) found.add(fullKey);
      try {
        for (let i = 0; backend && i < backend.length; i++) {
          const fullKey = backend.key(i);
          if (fullKey?.startsWith(prefix)) found.add(fullKey);
        }
      } catch {
        // Only the in-memory keys are known.
      }
      return [...found].map((fullKey) => fullKey.slice(prefix.length));
    },
  };
}

export interface ScoreEntry {
  name: string;
  score: number;
  /** ISO date the score was set. */
  date: string;
}

export interface HighScoreTable {
  list(): ScoreEntry[];
  /** Records a score and returns its 1-based rank, or null if it missed the table. */
  submit(name: string, score: number, date?: Date): number | null;
  qualifies(score: number): boolean;
  clear(): void;
}

export interface HighScoreOptions {
  /** How many entries the table keeps. */
  size?: number;
  /** 'higher' for points, 'lower' for times or throw counts. */
  better?: 'higher' | 'lower';
}

export function createHighScores(
  store: Store,
  key = 'high-scores',
  { size = 10, better = 'higher' }: HighScoreOptions = {},
): HighScoreTable {
  const beats = (a: number, b: number) => (better === 'higher' ? a > b : a < b);
  const list = () => store.get<ScoreEntry[]>(key, []);

  return {
    list,
    qualifies(score) {
      const entries = list();
      const last = entries[size - 1];
      return entries.length < size || (last !== undefined && beats(score, last.score));
    },
    submit(name, score, date = new Date()) {
      const entries = list();
      // Ties keep the earlier score ahead of the new one.
      let rank = entries.findIndex((entry) => beats(score, entry.score));
      if (rank === -1) rank = entries.length;
      if (rank >= size) return null;
      entries.splice(rank, 0, { name, score, date: date.toISOString() });
      store.set(key, entries.slice(0, size));
      return rank + 1;
    },
    clear() {
      store.remove(key);
    },
  };
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
