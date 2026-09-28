import { beforeEach, describe, expect, it } from 'vitest';
import { canPersist, createHighScores, createStore } from './index';

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
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

class BrokenStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error('SecurityError');
  }
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

describe('createStore', () => {
  let backend: MemoryStorage;
  beforeEach(() => {
    backend = new MemoryStorage();
  });

  it('round-trips JSON values under a namespaced key', () => {
    const store = createStore('skyline', backend);
    store.set('settings', { world: 'moon', points: 3 });
    expect(store.get('settings', null)).toEqual({ world: 'moon', points: 3 });
    expect(backend.getItem('neoarcade:skyline:settings')).toBe('{"world":"moon","points":3}');
  });

  it('returns the fallback for missing or corrupt values', () => {
    const store = createStore('skyline', backend);
    expect(store.get('missing', 42)).toBe(42);
    backend.setItem('neoarcade:skyline:broken', '{not json');
    expect(store.get('broken', 'fallback')).toBe('fallback');
  });

  it('hands back damaged values as raw text', () => {
    const store = createStore('skyline', backend);
    backend.setItem('neoarcade:skyline:broken', '{not json');
    expect(store.raw('broken')).toBe('{not json');
    expect(store.raw('missing')).toBeNull();
  });

  it('keeps namespaces apart', () => {
    createStore('a', backend).set('volume', 1);
    createStore('b', backend).set('volume', 0.2);
    expect(createStore('a', backend).get('volume', 0)).toBe(1);
    expect(createStore('b', backend).keys()).toEqual(['volume']);
  });

  it('removes keys', () => {
    const store = createStore('hall', backend);
    store.set('sort', 'title');
    store.remove('sort');
    expect(store.get('sort', 'added')).toBe('added');
    expect(store.keys()).toEqual([]);
  });

  it('says whether a write reached storage', () => {
    expect(createStore('hall', backend).set('sort', 'title')).toBe(true);
    expect(createStore('hall', new BrokenStorage()).set('sort', 'title')).toBe(false);
    expect(createStore('hall', null).set('sort', 'title')).toBe(false);
  });

  it('falls back to memory when storage throws', () => {
    const store = createStore('hall', new BrokenStorage());
    store.set('sort', 'title');
    expect(store.get('sort', 'added')).toBe('title');
    expect(store.keys()).toEqual(['sort']);
  });

  it('works with no storage at all', () => {
    const store = createStore('hall', null);
    store.set('muted', true);
    expect(store.get('muted', false)).toBe(true);
  });
});

describe('canPersist', () => {
  it('is true for working storage and leaves nothing behind', () => {
    const backend = new MemoryStorage();
    expect(canPersist(backend)).toBe(true);
    expect(backend.length).toBe(0);
  });

  it('is false when storage is missing or refuses writes', () => {
    expect(canPersist(null)).toBe(false);
    expect(canPersist(new BrokenStorage())).toBe(false);
  });
});

describe('createHighScores', () => {
  it('ranks scores and trims the table', () => {
    const table = createHighScores(createStore('game', new MemoryStorage()), 'scores', { size: 3 });
    const day = new Date('2026-09-25T12:00:00Z');
    expect(table.submit('ANA', 50, day)).toBe(1);
    expect(table.submit('BOB', 80, day)).toBe(1);
    expect(table.submit('CY', 60, day)).toBe(2);
    expect(table.submit('DEE', 10, day)).toBeNull();
    expect(table.list().map((entry) => entry.name)).toEqual(['BOB', 'CY', 'ANA']);
    expect(table.list()[0]?.date).toBe('2026-09-25T12:00:00.000Z');
  });

  it('keeps earlier scores ahead on a tie', () => {
    const table = createHighScores(createStore('game', new MemoryStorage()));
    table.submit('FIRST', 100);
    expect(table.submit('SECOND', 100)).toBe(2);
  });

  it('supports tables where lower is better', () => {
    const table = createHighScores(createStore('game', new MemoryStorage()), 'throws', {
      size: 2,
      better: 'lower',
    });
    table.submit('A', 5);
    table.submit('B', 3);
    expect(table.qualifies(4)).toBe(true);
    expect(table.qualifies(9)).toBe(false);
    expect(table.list().map((entry) => entry.score)).toEqual([3, 5]);
  });

  it('clears', () => {
    const table = createHighScores(createStore('game', new MemoryStorage()));
    table.submit('A', 1);
    table.clear();
    expect(table.list()).toEqual([]);
  });
});
