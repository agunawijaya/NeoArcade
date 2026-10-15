import { describe, expect, it } from 'vitest';
import { parseRoute, routeToHash, type Route } from './routes';

describe('parseRoute', () => {
  it('treats anything unknown as the lobby', () => {
    for (const hash of ['', '#', '#/', '#/nowhere', '#/games', '#/games/', '#/category/shooters']) {
      expect(parseRoute(hash)).toEqual({ view: 'lobby' });
    }
  });

  it('reads a game and its docs', () => {
    expect(parseRoute('#/games/skyline-showdown')).toEqual({
      view: 'game',
      slug: 'skyline-showdown',
    });
    expect(parseRoute('#/games/skyline-showdown/about')).toEqual({
      view: 'doc',
      slug: 'skyline-showdown',
      doc: 'about',
    });
    expect(parseRoute('#games/skyline-showdown/how-to-play/')).toEqual({
      view: 'doc',
      slug: 'skyline-showdown',
      doc: 'how-to-play',
    });
  });

  it('reads the Arcade Pass', () => {
    expect(parseRoute('#/pass')).toEqual({ view: 'pass' });
    expect(parseRoute('#pass/')).toEqual({ view: 'pass' });
  });

  it('reads a category page and the timeline', () => {
    expect(parseRoute('#/category/card-board')).toEqual({
      view: 'category',
      category: 'card-board',
    });
    expect(parseRoute('#/timeline')).toEqual({ view: 'timeline' });
    expect(parseRoute('#/timeline/long-haul')).toEqual({ view: 'timeline', slug: 'long-haul' });
  });

  it('falls back to the game for an unknown doc', () => {
    expect(parseRoute('#/games/skyline-showdown/source')).toEqual({
      view: 'game',
      slug: 'skyline-showdown',
    });
  });
});

describe('routeToHash', () => {
  it('round-trips every route', () => {
    const routes: Route[] = [
      { view: 'lobby' },
      { view: 'pass' },
      { view: 'game', slug: '_demo' },
      { view: 'doc', slug: 'skyline-showdown', doc: 'how-to-play' },
      { view: 'category', category: 'simulation' },
      { view: 'timeline' },
      { view: 'timeline', slug: 'donkey-dash' },
    ];
    for (const route of routes) expect(parseRoute(routeToHash(route))).toEqual(route);
  });
});
