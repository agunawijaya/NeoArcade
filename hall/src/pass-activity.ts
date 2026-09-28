import {
  arcadeUnlocksBetween,
  drawAvatar,
  drawBadge,
  HALL_THEMES,
  playedTally,
  type ArcadeUnlock,
  type ArcadePass,
  type CabinetGame,
  type FeedEntry,
  type PassManifest,
} from '@shared/pass';
import { h } from './dom';
import { buildNamePlate } from './pass-look';
import { formatNumber, timeAgo } from './time';

/** The feed shows this many lines until the player asks for the rest. */
const FEED_PREVIEW = 8;

interface Lookups {
  manifests: readonly PassManifest[];
  games: readonly CabinetGame[];
}

const gameTitle = ({ games }: Lookups, slug: string) =>
  games.find((game) => game.slug === slug)?.title ?? slug;

/** One card per game played: when, how much XP it brought, badges and the game's own stats. */
export function buildGameStats(pass: ArcadePass, lookups: Lookups): HTMLElement {
  const played = Object.entries(pass.profile.games).sort(([, a], [, b]) =>
    b.lastPlayed.localeCompare(a.lastPlayed),
  );
  const cards = played.map(([slug, record]) => {
    const manifest = lookups.manifests.find((candidate) => candidate.game === slug);
    const game = lookups.games.find((candidate) => candidate.slug === slug);
    const tally = playedTally(pass.profile, manifest);
    const stats = (manifest?.stats ?? []).filter((stat) => record.stats[stat.key] !== undefined);
    return h(
      'li',
      { class: 'game-stats', style: `--accent: ${game?.accent ?? 'var(--violet)'}` },
      h('h3', { class: 'game-stats__title' }, gameTitle(lookups, slug)),
      h('p', { class: 'game-stats__played' }, `Last played ${timeAgo(record.lastPlayed)}`),
      h(
        'dl',
        { class: 'game-stats__headline' },
        figure('XP earned', formatNumber(record.xp)),
        tally ? figure('Badges', `${tally.unlocked} / ${tally.total}`) : null,
      ),
      stats.length > 0
        ? h(
            'dl',
            { class: 'game-stats__list' },
            ...stats.map((stat) =>
              h(
                'div',
                {},
                h('dt', {}, stat.label),
                h(
                  'dd',
                  {},
                  `${formatNumber(record.stats[stat.key] ?? 0)}${stat.unit ? ` ${stat.unit}` : ''}`,
                ),
              ),
            ),
          )
        : null,
    );
  });

  return h(
    'section',
    { class: 'pass-section pass-games', 'aria-labelledby': 'pass-games-title' },
    h(
      'div',
      { class: 'pass-section__head' },
      h('h2', { class: 'pass-section__title', id: 'pass-games-title' }, 'Your games'),
    ),
    cards.length > 0
      ? h('ul', { class: 'pass-games__list' }, ...cards)
      : h(
          'p',
          { class: 'pass-empty' },
          'Play any game and its numbers show up here: matches, wins, best streaks.',
        ),
  );
}

/** What happened lately, newest first: XP and why, badges, level-ups. */
export function buildFeed(pass: ArcadePass, lookups: Lookups): HTMLElement {
  const entries = pass.profile.feed;
  const list = h('ol', { class: 'feed' }, ...entries.map((entry) => feedLine(entry, lookups)));
  const moreButton =
    entries.length > FEED_PREVIEW
      ? h(
          'button',
          { class: 'button button--small feed__more', type: 'button' },
          `Show all ${entries.length}`,
        )
      : null;
  list.classList.toggle('is-clipped', moreButton !== null);
  moreButton?.addEventListener('click', () => {
    list.classList.remove('is-clipped');
    moreButton.remove();
    list.querySelectorAll<HTMLElement>('.feed__line')[FEED_PREVIEW]?.focus();
  });

  return h(
    'section',
    { class: 'pass-section pass-feed', 'aria-labelledby': 'pass-feed-title' },
    h(
      'div',
      { class: 'pass-section__head' },
      h('h2', { class: 'pass-section__title', id: 'pass-feed-title' }, 'Recent activity'),
    ),
    entries.length > 0
      ? list
      : h(
          'p',
          { class: 'pass-empty' },
          'Nothing yet. Your first XP lands here the moment you play.',
        ),
    moreButton,
  );
}

function feedLine(entry: FeedEntry, lookups: Lookups): HTMLElement {
  const where = entry.game ? gameTitle(lookups, entry.game) : 'NeoArcade';
  const times = entry.times > 1 ? ` ×${entry.times}` : '';
  let marker: Node;
  let text: string;
  if (entry.kind === 'badge') {
    const badge = lookups.manifests
      .find((manifest) => manifest.game === entry.game)
      ?.badges.find((candidate) => candidate.id === entry.badge);
    const accent = lookups.games.find((game) => game.slug === entry.game)?.accent;
    marker = badge
      ? drawBadge(badge, { unlocked: true, accent })
      : h('span', { class: 'feed__dot feed__dot--badge' });
    text = `Badge: ${entry.text}`;
  } else if (entry.kind === 'level') {
    marker = h('span', { class: 'feed__dot feed__dot--level' }, '▲');
    text = entry.text;
  } else {
    marker = h('span', { class: 'feed__dot' }, '+');
    text = entry.text;
  }
  return h(
    'li',
    { class: `feed__line feed__line--${entry.kind}`, tabindex: -1 },
    h('span', { class: 'feed__marker', 'aria-hidden': 'true' }, marker),
    h(
      'span',
      { class: 'feed__body' },
      h('span', { class: 'feed__text' }, text + times),
      h('span', { class: 'feed__meta' }, `${where} · ${timeAgo(entry.at)}`),
    ),
    entry.xp > 0 ? h('span', { class: 'feed__xp' }, `+${formatNumber(entry.xp)} XP`) : null,
  );
}

/** How many upcoming reward levels the "Coming up" list shows. */
const REWARD_LEVELS = 4;

/** The next few levels that bring something new, each with a preview of it on the player. */
export function buildRewards(pass: ArcadePass, lookups: Lookups): HTMLElement {
  const level = pass.level;
  const rows: HTMLElement[] = [];
  for (let target = level + 1; target <= level + 40 && rows.length < REWARD_LEVELS; target++) {
    const arcade = arcadeUnlocksBetween(target - 1, target);
    const games = lookups.manifests.flatMap((manifest) =>
      manifest.cosmetics
        .filter((cosmetic) => 'level' in cosmetic.unlock && cosmetic.unlock.level === target)
        .map((cosmetic) => `${cosmetic.name} (${gameTitle(lookups, manifest.game)})`),
    );
    if (arcade.length === 0 && games.length === 0) continue;
    rows.push(
      h(
        'li',
        { class: 'reward' },
        h('span', { class: 'reward__level' }, h('small', {}, 'Level'), String(target)),
        h(
          'span',
          { class: 'reward__previews', 'aria-hidden': 'true' },
          ...arcade.slice(0, 3).map((unlock) => rewardPreview(pass, unlock)),
        ),
        h(
          'span',
          { class: 'reward__names' },
          [...arcade.map((unlock) => unlock.name), ...games].join(', '),
        ),
      ),
    );
  }
  return h(
    'section',
    { class: 'pass-section pass-rewards', 'aria-labelledby': 'pass-rewards-title' },
    h(
      'div',
      { class: 'pass-section__head' },
      h('h2', { class: 'pass-section__title', id: 'pass-rewards-title' }, 'Coming up'),
    ),
    rows.length > 0
      ? h('ol', { class: 'rewards' }, ...rows)
      : h(
          'p',
          { class: 'pass-empty' },
          'Every arcade reward is yours. Games may still have a few of their own.',
        ),
  );
}

function rewardPreview(pass: ArcadePass, unlock: ArcadeUnlock): Node {
  const look = pass.profile.look;
  if (unlock.slot === 'frame') return buildNamePlate('Aa', unlock.id as typeof look.frame, 'span');
  if (unlock.slot === 'hallTheme') {
    const theme = HALL_THEMES.find((option) => option.id === unlock.id) ?? HALL_THEMES[0];
    return h('span', {
      class: 'reward__swatch',
      style: `--primary: ${theme.dark[0]}; --secondary: ${theme.dark[1]}`,
    });
  }
  return drawAvatar({ ...look, [unlock.slot]: unlock.id });
}

function figure(term: string, value: string) {
  return h('div', {}, h('dt', {}, term), h('dd', {}, value));
}

const HEALTH_MESSAGES = {
  unavailable:
    'This browser isn’t letting NeoArcade save anything (private browsing, or site data is blocked), so your Pass only lasts until you close the tab. Everything else works as usual.',
  full: 'Your browser’s storage is full, so new progress isn’t being saved right now. Free up some space, or back up your Pass to keep what you have.',
  'newer-version':
    'Your Pass was saved by a newer version of NeoArcade. To keep it safe, nothing is saved here until you are back on the newer version.',
} as const;

const NOTICE_MESSAGES = {
  repaired:
    'Part of your saved Pass was damaged and has been repaired. Everything that could be read is still here.',
  'set-aside':
    'Your saved Pass couldn’t be read, so you’re starting fresh. The damaged copy is kept in this browser rather than deleted.',
} as const;

/** A polite word when saving does not work, or when the saved Pass needed repair. */
export function buildStorageNotice(pass: ArcadePass): HTMLElement | null {
  const message =
    pass.health !== 'ok'
      ? HEALTH_MESSAGES[pass.health]
      : pass.notice
        ? NOTICE_MESSAGES[pass.notice]
        : null;
  if (!message) return null;
  return h(
    'p',
    {
      class: `pass-notice pass-notice--${pass.health === 'ok' ? 'info' : 'warning'}`,
      role: 'status',
    },
    message,
  );
}
