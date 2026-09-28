import {
  arcadeUnlocksBetween,
  drawAvatar,
  drawRankEmblem,
  levelProgress,
  nextRank,
  RANKS,
  rankForLevel,
  type ArcadePass,
  type PassManifest,
} from '@shared/pass';
import { h, icon } from './dom';
import { ICONS } from './icons';
import { buildNamePlate } from './pass-look';
import { formatNumber } from './time';

export interface HeroActions {
  editProfile(): void;
  backUp(): void;
}

const since = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });

/**
 * The top of the Pass: who the player is (avatar, name plate), where they
 * stand (level, rank, XP to the next level) and what the next level brings.
 */
export function buildHero(
  pass: ArcadePass,
  manifests: readonly PassManifest[],
  actions: HeroActions,
): HTMLElement {
  const { profile } = pass;
  const progress = levelProgress(profile.xp);
  const rank = rankForLevel(progress.level);
  const toGo = progress.xpForNextLevel - progress.xpIntoLevel;
  const records = Object.values(profile.games);
  const badgeCount = records.reduce(
    (total, record) => total + Object.keys(record.badges).length,
    0,
  );
  const badgeTotal = manifests.reduce((total, manifest) => total + manifest.badges.length, 0);

  const portrait = h(
    'button',
    {
      class: 'pass-hero__portrait',
      type: 'button',
      'aria-label': 'Change your avatar',
      'data-pass-action': 'portrait',
    },
    drawAvatar(profile.look),
    h('span', { class: 'pass-hero__portrait-edit' }, icon(ICONS.edit)),
  );
  portrait.addEventListener('click', actions.editProfile);

  const editButton = h(
    'button',
    { class: 'button', type: 'button', 'data-pass-action': 'edit' },
    icon(ICONS.edit),
    'Edit profile',
  );
  editButton.addEventListener('click', actions.editProfile);
  const backupButton = h(
    'button',
    { class: 'button', type: 'button', 'data-pass-action': 'backup' },
    icon(ICONS.download),
    'Back up',
  );
  backupButton.addEventListener('click', actions.backUp);

  const plate = buildNamePlate(profile.name, profile.look.frame, 'span');
  plate.id = 'pass-name';

  return h(
    'section',
    { class: 'pass-hero', 'aria-labelledby': 'pass-name' },
    h('div', { class: 'pass-hero__avatar' }, portrait),
    h(
      'div',
      { class: 'pass-hero__identity' },
      h(
        'p',
        { class: 'pass-hero__eyebrow' },
        `Arcade Pass · since ${since.format(new Date(profile.createdAt))}`,
      ),
      h('h2', { class: 'pass-hero__name' }, plate),
      h(
        'p',
        { class: 'pass-hero__level' },
        'Level ',
        h('strong', {}, String(progress.level)),
        h('span', { class: 'pass-hero__rank-name' }, ` · ${rank.name}`),
      ),
      xpMeter(
        progress.fraction,
        progress.xpIntoLevel,
        progress.xpForNextLevel,
        toGo,
        progress.level,
      ),
      nextUnlockLine(progress.level),
      h('div', { class: 'pass-hero__actions' }, editButton, backupButton),
    ),
    h(
      'div',
      { class: 'pass-hero__side' },
      h(
        'figure',
        { class: 'pass-hero__emblem' },
        drawRankEmblem(rank.id, `Rank: ${rank.name}`),
        h('figcaption', {}, h('strong', {}, rank.name), h('span', {}, rank.motto)),
      ),
      h(
        'dl',
        { class: 'pass-hero__totals' },
        total('Total XP', formatNumber(profile.xp)),
        total('Badges', badgeTotal > 0 ? `${badgeCount} / ${badgeTotal}` : String(badgeCount)),
        total('Games', String(records.length)),
      ),
    ),
  );
}

function xpMeter(fraction: number, into: number, needed: number, toGo: number, level: number) {
  return h(
    'div',
    { class: 'pass-xp' },
    h(
      'div',
      {
        class: 'pass-xp__bar',
        role: 'progressbar',
        'aria-label': `XP towards level ${level + 1}`,
        'aria-valuemin': 0,
        'aria-valuemax': needed,
        'aria-valuenow': into,
        style: `--fill: ${(fraction * 100).toFixed(1)}%`,
      },
      h('span', { class: 'pass-xp__fill' }),
    ),
    h(
      'p',
      { class: 'pass-xp__numbers' },
      h('span', {}, `${formatNumber(into)} / ${formatNumber(needed)} XP`),
      h('span', {}, `${formatNumber(toGo)} XP to level ${level + 1}`),
    ),
  );
}

/** "Level 8 unlocks Beanie": the nearest level that brings something new. */
function nextUnlockLine(level: number): HTMLElement | null {
  for (let target = level + 1; target <= level + 10; target++) {
    const unlocks = arcadeUnlocksBetween(target - 1, target);
    if (unlocks.length === 0) continue;
    return h(
      'p',
      { class: 'pass-hero__next' },
      `Level ${target} unlocks `,
      h('strong', {}, unlocks.map((unlock) => unlock.name).join(', ')),
    );
  }
  return null;
}

function total(term: string, value: string) {
  return h('div', { class: 'pass-hero__total' }, h('dt', {}, term), h('dd', {}, value));
}

/** Every rank on one line, from Coin Slot to Arcade Legend, with the player's place on it. */
export function buildRankRoad(level: number): HTMLElement {
  const current = rankForLevel(level);
  const upcoming = nextRank(level);
  // How far along the road the player is: whole ranks, plus the way to the next one.
  const index = RANKS.indexOf(current);
  const toNext = upcoming
    ? (level - current.fromLevel) / (upcoming.fromLevel - current.fromLevel)
    : 0;
  const along = (index + toNext) / (RANKS.length - 1);
  return h(
    'section',
    { class: 'pass-section rank-road', 'aria-labelledby': 'rank-road-title' },
    h(
      'div',
      { class: 'pass-section__head' },
      h('h2', { class: 'pass-section__title', id: 'rank-road-title' }, 'The road to Arcade Legend'),
      h(
        'p',
        { class: 'pass-section__note' },
        upcoming
          ? `${upcoming.name} at level ${upcoming.fromLevel}`
          : 'You made it. Every rank is yours.',
      ),
    ),
    h(
      'ol',
      { class: 'rank-road__steps', style: `--along: ${along.toFixed(3)}` },
      ...RANKS.map((rank) => {
        const state =
          rank === current ? 'is-current' : rank.fromLevel <= level ? 'is-reached' : 'is-ahead';
        return h(
          'li',
          { class: `rank-road__step ${state}`, 'aria-current': rank === current ? 'step' : false },
          h('span', { class: 'rank-road__emblem' }, drawRankEmblem(rank.id)),
          h('span', { class: 'rank-road__name' }, rank.name),
          h('span', { class: 'rank-road__level' }, `Level ${rank.fromLevel}`),
        );
      }),
    ),
  );
}
