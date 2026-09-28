// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { definePassManifest } from '../manifest';
import { createArcadePass } from '../pass';
import { manualClock, MemoryStorage, testManifest } from '../test-helpers';
import { buildBadgeCabinet, type BadgeCabinet } from './cabinet';

let cabinet: BadgeCabinet | null = null;

// jsdom has no modal dialogs or scrolling; these stand-ins are enough here.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  Element.prototype.scrollIntoView = () => {};
});

function setUp() {
  const pass = createArcadePass({
    backend: new MemoryStorage(),
    now: manualClock().now,
    watchOtherTabs: false,
  });
  const game = pass.forGame(testManifest);
  cabinet = buildBadgeCabinet({
    pass,
    manifests: [testManifest],
    games: [{ slug: 'test-game', title: 'Test Game', accent: '#ff8a3d' }],
  });
  document.body.append(cabinet.element);
  return { pass, game, cabinet };
}

const tile = (id: string) =>
  document.querySelector<HTMLButtonElement>(`.neo-tile[data-badge="test-game/${id}"]`);

afterEach(() => {
  cabinet?.dispose();
  cabinet = null;
  document.body.innerHTML = '';
});

describe('buildBadgeCabinet', () => {
  it('gives each game a titled shelf with its count', () => {
    setUp();
    expect(document.querySelector('.neo-shelf__title')?.textContent).toBe('Test Game');
    expect(document.querySelector('.neo-shelf__count')?.textContent).toBe('0 / 4 badges');
    expect(document.querySelectorAll('.neo-tile')).toHaveLength(4);
  });

  it('shows locked badges with their hint and secrets as ???', () => {
    setUp();
    expect(tile('first-win')?.classList.contains('is-locked')).toBe(true);
    expect(tile('first-win')?.textContent).toContain('Win any match.');
    expect(tile('oops')?.textContent).toBe('???Secret');
    expect(tile('oops')?.getAttribute('aria-label')).toBe('Secret badge, not yet found');
  });

  it('counts progress and lights up as badges are earned', () => {
    const { game } = setUp();
    game.progress('sun-seeker', 3);
    expect(tile('sun-seeker')?.textContent).toContain('3 / 10');
    expect(tile('sun-seeker')?.querySelector('.neo-badge__ring-fill')).not.toBeNull();
    game.unlock('oops');
    expect(tile('oops')?.classList.contains('is-unlocked')).toBe(true);
    expect(tile('oops')?.textContent).toContain('Oops');
    expect(document.querySelector('.neo-shelf__count')?.textContent).toBe('1 / 4 badges');
  });

  it('opens a badge up close, and says when it was earned', () => {
    const { game } = setUp();
    game.unlock('champion');
    tile('champion')?.click();
    const dialog = document.querySelector<HTMLDialogElement>('.neo-badge-detail');
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain('Gold badge · Test Game');
    expect(dialog?.textContent).toContain('Beat the final boss.');
    expect(dialog?.textContent).toContain('September 28, 2026');
    expect(dialog?.textContent).toContain('Golden banana (Banana skin)');
  });

  it('keeps a secret secret in its close-up too', () => {
    setUp();
    tile('oops')?.click();
    const dialog = document.querySelector('.neo-badge-detail');
    expect(dialog?.querySelector('h2')?.textContent).toBe('???');
    expect(dialog?.textContent).not.toContain('Hit yourself');
  });

  it('marks a complete shelf', () => {
    const { game } = setUp();
    for (const badge of testManifest.badges) game.unlock(badge.id);
    expect(document.querySelector('.neo-shelf.is-complete .neo-shelf__complete')).not.toBeNull();
  });

  it('has one tab stop, and arrow keys move along the shelf', () => {
    setUp();
    const tabbable = [...document.querySelectorAll<HTMLElement>('.neo-tile')].filter(
      (element) => element.tabIndex === 0,
    );
    expect(tabbable).toHaveLength(1);
    tile('first-win')?.focus();
    tile('first-win')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(document.activeElement).toBe(tile('sun-seeker'));
    tile('sun-seeker')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(tile('champion'));
    expect(tile('champion')?.tabIndex).toBe(0);
  });

  it('says so when no game has badges yet', () => {
    const pass = createArcadePass({ backend: new MemoryStorage(), watchOtherTabs: false });
    cabinet = buildBadgeCabinet({ pass, manifests: [] });
    expect(cabinet.element.textContent).toMatch(/No badges to collect yet/);
  });

  it('names a shelf from its slug when the game is not listed', () => {
    const pass = createArcadePass({ backend: new MemoryStorage(), watchOtherTabs: false });
    const manifest = definePassManifest({ ...testManifest, game: 'moon-lander' });
    cabinet = buildBadgeCabinet({ pass, manifests: [manifest] });
    expect(cabinet.element.querySelector('.neo-shelf__title')?.textContent).toBe('Moon Lander');
  });
});
