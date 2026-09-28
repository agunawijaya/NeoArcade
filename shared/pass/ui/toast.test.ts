// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createArcadePass } from '../pass';
import {
  BlockedStorage,
  FillableStorage,
  manualClock,
  MemoryStorage,
  testManifest,
} from '../test-helpers';
import { mountUnlockToasts, type UnlockToasts } from './toast';

function setUp(options: Parameters<typeof mountUnlockToasts>[1] = {}) {
  const clock = manualClock();
  const pass = createArcadePass({
    backend: new MemoryStorage(),
    now: clock.now,
    watchOtherTabs: false,
  });
  const game = pass.forGame(testManifest);
  toasts = mountUnlockToasts(game, options);
  return { game, toasts };
}

let toasts: UnlockToasts | null = null;
const shown = () => [...document.querySelectorAll('.neo-toast:not(.is-leaving)')];

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof matchMedia;
});

afterEach(() => {
  toasts?.dispose();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('mountUnlockToasts', () => {
  it('keeps unlocks queued until the game flushes them', () => {
    const { game, toasts } = setUp();
    game.unlock('champion');
    expect(shown()).toHaveLength(0);
    // The badge's XP also reaches level 2, which gets its own toast.
    expect(toasts.pending).toBe(2);
    toasts.flush();
    expect(shown()).toHaveLength(1);
    expect(shown()[0]?.textContent).toContain('Champion');
    expect(shown()[0]?.textContent).toContain('Beat the final boss.');
    expect(shown()[0]?.textContent).toContain('+200 XP');
    expect(shown()[0]?.textContent).toContain('Unlocked: Golden banana');
    expect(toasts.visible).toBe(true);
  });

  it('shows queued toasts one after another', () => {
    const { game, toasts } = setUp({ duration: 3000 });
    game.unlock('first-win');
    game.award(150, 'Big win');
    toasts.flush();
    expect(shown()[0]?.textContent).toContain('First Win');
    vi.advanceTimersByTime(3000 + 600);
    expect(shown()[0]?.textContent).toContain('Level up');
    expect(shown()[0]?.textContent).toContain('Level 2');
    expect(shown()[0]?.textContent).toContain('Headphones');
  });

  it('announces a new rank with its motto', () => {
    const clock = manualClock();
    const pass = createArcadePass({
      backend: new MemoryStorage(),
      now: clock.now,
      watchOtherTabs: false,
    });
    const game = pass.forGame(testManifest);
    for (const day of ['2026-09-01', '2026-09-02']) {
      clock.set(`${day}T12:00:00`);
      for (let award = 0; award < 3; award++) game.award(200, 'Tournament');
    }
    expect(pass.level).toBe(4);
    toasts = mountUnlockToasts(game, { duration: 3000 });
    game.unlock('champion');
    toasts.flush();
    vi.advanceTimersByTime(3000 + 600);
    const rankToast = shown()[0];
    expect(rankToast?.textContent).toContain('New rank');
    expect(rankToast?.textContent).toContain('Button Masher · level 5');
    expect(rankToast?.textContent).toContain('Enthusiasm first');
    expect(rankToast?.querySelector('svg.neo-rank')).not.toBeNull();
  });

  it('shows at once on pages without a playfield', () => {
    const { game } = setUp({ autoFlush: true });
    game.unlock('first-win');
    expect(shown()).toHaveLength(1);
  });

  it('closes on Escape before the game hears the key', () => {
    const { game, toasts } = setUp();
    const gameHeard = vi.fn();
    window.addEventListener('keydown', gameHeard);
    game.unlock('first-win');
    toasts.flush();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(toasts.visible).toBe(false);
    expect(gameHeard).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(gameHeard).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', gameHeard);
  });

  it('holds the rest of the queue when a turn starts', () => {
    const { game, toasts } = setUp();
    game.unlock('first-win');
    game.unlock('champion');
    toasts.flush();
    toasts.hold();
    vi.advanceTimersByTime(10_000);
    expect(shown()).toHaveLength(0);
    expect(toasts.pending).toBe(2);
  });

  it('plays the chime through the game’s own audio', () => {
    const audio = { play: vi.fn() };
    const { game, toasts } = setUp({ audio });
    game.unlock('first-win');
    toasts.flush();
    expect(audio.play).toHaveBeenCalledTimes(3);
  });

  it('lives in a polite live region and can be dismissed by pointer', () => {
    const { game, toasts } = setUp();
    game.unlock('first-win');
    toasts.flush();
    expect(document.querySelector('.neo-toasts')?.getAttribute('aria-live')).toBe('polite');
    document.querySelector<HTMLButtonElement>('.neo-toast__close')?.click();
    expect(toasts.visible).toBe(false);
  });

  it('says once, politely, when progress is not being saved', () => {
    const pass = createArcadePass({ backend: new BlockedStorage(), watchOtherTabs: false });
    const game = pass.forGame(testManifest);
    toasts = mountUnlockToasts(game, { autoFlush: true });
    expect(shown()[0]?.textContent).toContain('Progress isn’t being saved');
    game.unlock('first-win');
    toasts.dismiss();
    vi.advanceTimersByTime(600);
    expect(shown()[0]?.textContent).toContain('First Win');
    // Level 1 again after the badge's 25 XP, and no second word about saving.
    toasts.dismiss();
    vi.advanceTimersByTime(600);
    expect(shown()).toHaveLength(0);
    expect(toasts.pending).toBe(0);
  });

  it('speaks up when storage fills during play', () => {
    const backend = new FillableStorage();
    const pass = createArcadePass({ backend, watchOtherTabs: false });
    const game = pass.forGame(testManifest);
    toasts = mountUnlockToasts(game);
    expect(toasts.pending).toBe(0);
    backend.fill();
    game.award(10, 'Played a round');
    expect(toasts.pending).toBe(1);
    toasts.flush();
    expect(shown()[0]?.textContent).toContain('storage is full');
  });
});
