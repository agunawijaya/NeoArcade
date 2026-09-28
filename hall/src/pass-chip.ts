import { drawAvatar, levelProgress, rankForLevel, type ArcadePass } from '@shared/pass';
import { svg } from '@shared/pass/art/svg';
import { h } from './dom';
import { routeToHash } from './routes';
import { formatNumber } from './time';

/**
 * The player in the masthead: their avatar inside a ring that fills with XP
 * towards the next level, their name and level. It opens the Pass.
 */
export function buildPassChip(pass: ArcadePass): { element: HTMLAnchorElement; refresh(): void } {
  const ringFill = svg('circle', {
    class: 'pass-chip__fill',
    cx: 24,
    cy: 24,
    r: 22,
    pathLength: 100,
  });
  const ring = svg(
    'svg',
    { class: 'pass-chip__ring', viewBox: '0 0 48 48', 'aria-hidden': 'true' },
    svg('circle', { class: 'pass-chip__track', cx: 24, cy: 24, r: 22 }),
    ringFill,
  );
  const avatarSlot = h('span', { class: 'pass-chip__avatar' });
  const levelBadge = h('span', { class: 'pass-chip__level', 'aria-hidden': 'true' });
  const name = h('span', { class: 'pass-chip__name' });
  const rank = h('span', { class: 'pass-chip__rank' });
  const element = h(
    'a',
    { class: 'pass-chip', href: routeToHash({ view: 'pass' }) },
    h('span', { class: 'pass-chip__badge' }, ring, avatarSlot, levelBadge),
    h('span', { class: 'pass-chip__text', 'aria-hidden': 'true' }, name, rank),
  );

  const refresh = () => {
    const { profile } = pass;
    const progress = levelProgress(profile.xp);
    const toGo = progress.xpForNextLevel - progress.xpIntoLevel;
    avatarSlot.replaceChildren(drawAvatar(profile.look));
    ringFill.setAttribute('stroke-dasharray', `${(progress.fraction * 100).toFixed(1)} 100`);
    levelBadge.textContent = String(progress.level);
    name.textContent = profile.name;
    rank.textContent = `Level ${progress.level} · ${rankForLevel(progress.level).name}`;
    element.setAttribute(
      'aria-label',
      `Arcade Pass: ${profile.name}, level ${progress.level}, ${formatNumber(toGo)} XP to the next level`,
    );
    element.classList.toggle('has-warning', pass.health !== 'ok');
  };

  refresh();
  return { element, refresh };
}
