import { definePassManifest } from './manifest';

/** localStorage in memory, for tests. */
export class MemoryStorage implements Storage {
  protected items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

/** Storage that works until `fill()` is called, then refuses every write, like a full quota. */
export class FillableStorage extends MemoryStorage {
  private full = false;
  fill() {
    this.full = true;
  }
  drain() {
    this.full = false;
  }
  override setItem(key: string, value: string) {
    if (this.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    super.setItem(key, value);
  }
}

/** Storage that throws on every call, like a sandboxed frame. */
export class BlockedStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new DOMException('Access is denied for this document.', 'SecurityError');
  }
  override setItem(): void {
    throw new DOMException('Access is denied for this document.', 'SecurityError');
  }
}

/** A clock the test moves by hand. Local times, so day boundaries hold in any time zone. */
export function manualClock(start = '2026-09-28T10:00:00') {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    set(time: string) {
      current = new Date(time);
    },
    advanceMinutes(minutes: number) {
      current = new Date(current.getTime() + minutes * 60_000);
    },
  };
}

export const testManifest = definePassManifest({
  game: 'test-game',
  badges: [
    {
      id: 'first-win',
      name: 'First Win',
      description: 'Won a match. The first of many.',
      hint: 'Win any match.',
      tier: 'bronze',
      emblem: (pen) => pen.star(32, 32, 20, 9),
    },
    {
      id: 'sun-seeker',
      name: 'Sun Seeker',
      description: 'Hit the sun ten times. It has stopped smiling.',
      hint: 'Hit the sun 10 times.',
      tier: 'silver',
      target: 10,
      emblem: (pen) => pen.circle(32, 32, 14),
    },
    {
      id: 'oops',
      name: 'Oops',
      description: 'Hit yourself. Physics is hard.',
      tier: 'secret',
      emblem: (pen) => pen.circle(32, 32, 10),
    },
    {
      id: 'champion',
      name: 'Champion',
      description: 'Beat the final boss.',
      hint: 'Finish the tour.',
      tier: 'gold',
      xp: 200,
      emblem: (pen) => pen.rect(16, 16, 32, 32),
    },
  ],
  cosmetics: [
    {
      id: 'golden-banana',
      name: 'Golden banana',
      kind: 'Banana skin',
      unlock: { badge: 'champion' },
    },
    { id: 'party-hat', name: 'Party hat', kind: 'Hat', unlock: { level: 2 } },
  ],
  stats: [
    { key: 'matches', label: 'Matches played' },
    { key: 'wins', label: 'Wins' },
    { key: 'bestStreak', label: 'Best streak' },
    { key: 'fastestWin', label: 'Fastest win', unit: 's' },
  ],
});
