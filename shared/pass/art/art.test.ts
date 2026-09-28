// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK, LOOK_OPTIONS, type AvatarLook } from '../arcade-cosmetics';
import { glyphs } from '../glyphs';
import { RANKS } from '../levels';
import { BADGE_TIERS } from '../manifest';
import { drawAvatar } from './avatar';
import { drawBadge } from './badge';
import { drawRankEmblem } from './rank';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('drawAvatar', () => {
  const avatarSlots = [
    'face',
    'skin',
    'backdrop',
    'eyes',
    'mouth',
    'headwear',
    'accessory',
  ] as const;

  it('draws every part of every slot', () => {
    for (const slot of avatarSlots) {
      for (const option of LOOK_OPTIONS[slot]) {
        const look = { ...DEFAULT_LOOK, [slot]: option.id } as AvatarLook;
        const avatar = drawAvatar(look);
        expect(
          avatar.querySelectorAll('path, circle, ellipse, rect').length,
          option.id,
        ).toBeGreaterThan(8);
      }
    }
  });

  it('is decorative unless it is given a name', () => {
    expect(drawAvatar(DEFAULT_LOOK).getAttribute('aria-hidden')).toBe('true');
    const named = drawAvatar(DEFAULT_LOOK, { label: 'Your avatar' });
    expect(named.getAttribute('role')).toBe('img');
    expect(named.getAttribute('aria-label')).toBe('Your avatar');
  });

  it('gives each drawing its own clip ids, so two on a page never clash', () => {
    const ids = (svg: SVGSVGElement) => [...svg.querySelectorAll('[id]')].map((node) => node.id);
    const first = ids(drawAvatar(DEFAULT_LOOK));
    const second = ids(drawAvatar(DEFAULT_LOOK));
    expect(first.some((id) => second.includes(id))).toBe(false);
  });
});

describe('drawBadge', () => {
  it('draws each tier as its own medal, locked or earned', () => {
    for (const tier of BADGE_TIERS) {
      const earned = drawBadge({ tier, emblem: glyphs.star }, { unlocked: true });
      const locked = drawBadge({ tier, emblem: glyphs.star }, { unlocked: false });
      expect(earned.classList.contains(`neo-badge--${tier}`)).toBe(true);
      expect(earned.classList.contains('is-unlocked')).toBe(true);
      expect(locked.classList.contains('is-locked')).toBe(true);
    }
  });

  it('hides a locked secret’s emblem behind a question mark', () => {
    const emblemShapes = (svg: SVGSVGElement) =>
      svg.querySelectorAll('.neo-badge__emblem > :not(.neo-badge__emboss)').length;
    const secret = drawBadge({ tier: 'secret', emblem: glyphs.dice }, { unlocked: false });
    const revealed = drawBadge({ tier: 'secret', emblem: glyphs.dice }, { unlocked: true });
    expect(emblemShapes(secret)).toBe(2);
    expect(emblemShapes(revealed)).toBeGreaterThan(2);
  });

  it('rings a counted badge with its progress', () => {
    const badge = drawBadge(
      { tier: 'silver', emblem: glyphs.sun },
      { unlocked: false, progress: 0.4 },
    );
    expect(badge.querySelector('.neo-badge__ring-fill')?.getAttribute('stroke-dasharray')).toBe(
      '40.0 100',
    );
    const empty = drawBadge(
      { tier: 'silver', emblem: glyphs.sun },
      { unlocked: false, progress: 0 },
    );
    expect(empty.querySelector('.neo-badge__ring-track')).not.toBeNull();
    expect(empty.querySelector('.neo-badge__ring-fill')).toBeNull();
  });

  it('carries the game’s colour for the enamel', () => {
    const badge = drawBadge(
      { tier: 'gold', emblem: glyphs.star },
      { unlocked: true, accent: '#ff8a3d' },
    );
    expect(badge.style.getPropertyValue('--nb-accent-game')).toBe('#ff8a3d');
  });

  it('falls back to a star when an emblem fails to draw', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badge = drawBadge(
      {
        tier: 'bronze',
        emblem: () => {
          throw new Error('broken pen');
        },
      },
      { unlocked: true },
    );
    expect(error).toHaveBeenCalled();
    expect(badge.querySelector('.neo-badge__emblem polygon')).not.toBeNull();
  });
});

describe('drawRankEmblem', () => {
  it('draws every rank, with one pip per rank climbed', () => {
    RANKS.forEach((rank, index) => {
      const emblem = drawRankEmblem(rank.id, rank.name);
      expect(emblem.getAttribute('aria-label')).toBe(rank.name);
      expect(emblem.querySelectorAll('.neo-rank__pip')).toHaveLength(index + 1);
    });
  });

  it('gives the two top ranks their wings', () => {
    expect(drawRankEmblem('high-scorer').querySelector('.neo-rank__wings')).toBeNull();
    expect(drawRankEmblem('cabinet-champion').querySelector('.neo-rank__wings')).not.toBeNull();
    expect(drawRankEmblem('arcade-legend').querySelector('.neo-rank__wings')).not.toBeNull();
  });
});
