import { describe, expect, it } from 'vitest';
import { parseRoute, routeToHash, type Route } from './routes';

describe('parseRoute', () => {
  it('treats anything unknown as the lobby', () => {
    for (const hash of ['', '#', '#/', '#/nowhere', '#/games', '#/games/']) {
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
      { view: 'game', slug: '_demo' },
      { view: 'doc', slug: 'skyline-showdown', doc: 'how-to-play' },
    ];
    for (const route of routes) expect(parseRoute(routeToHash(route))).toEqual(route);
  });
});
