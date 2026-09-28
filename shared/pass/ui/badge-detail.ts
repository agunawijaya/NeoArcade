import { drawBadge } from '../art/badge';
import { badgeXp, TIER_NAMES, type PassManifest } from '../manifest';
import type { BadgeStanding } from '../tally';

export interface BadgeDetailSubject {
  standing: BadgeStanding;
  manifest: PassManifest;
  gameTitle: string;
  accent?: string;
}

const earnedDate = new Intl.DateTimeFormat('en', { dateStyle: 'long' });

/**
 * One badge up close: the medal large, what it is for (or how to earn it),
 * when it was earned and what it unlocks. A native <dialog>, so Esc, focus
 * trapping and the backdrop come from the browser.
 */
export function createBadgeDetail(onClose?: () => void) {
  const dialog = document.createElement('dialog');
  dialog.className = 'neo-badge-detail';
  dialog.setAttribute('aria-labelledby', 'neo-badge-detail-title');
  document.body.append(dialog);
  let opener: HTMLElement | null = null;

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    opener?.focus();
    opener = null;
    onClose?.();
  });

  return {
    element: dialog,
    get open() {
      return dialog.open;
    },
    show(subject: BadgeDetailSubject, from?: HTMLElement) {
      opener = from ?? (document.activeElement as HTMLElement | null);
      dialog.replaceChildren(detailContent(subject, () => dialog.close()));
      if (!dialog.open) dialog.showModal();
      dialog.querySelector<HTMLElement>('.neo-badge-detail__close')?.focus();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    dispose() {
      dialog.remove();
    },
  };
}

function detailContent(
  { standing, manifest, gameTitle, accent }: BadgeDetailSubject,
  close: () => void,
): HTMLElement {
  const { badge, unlockedAt, progress } = standing;
  const unlocked = unlockedAt !== null;
  const hidden = !unlocked && badge.tier === 'secret';

  const panel = node('div', 'neo-badge-detail__panel');
  panel.classList.add(`neo-badge-detail--${badge.tier}`, unlocked ? 'is-unlocked' : 'is-locked');
  if (accent) panel.style.setProperty('--neo-shelf-accent', accent);

  const closeButton = node('button', 'neo-badge-detail__close');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  closeButton.addEventListener('click', close);

  const art = node('div', 'neo-badge-detail__art');
  art.append(
    drawBadge(badge, {
      unlocked,
      accent,
      progress: !unlocked && badge.target ? progress / badge.target : undefined,
    }),
  );

  const title = node('h2', 'neo-badge-detail__title', hidden ? '???' : badge.name);
  title.id = 'neo-badge-detail-title';

  const body = node('div', 'neo-badge-detail__body');
  body.append(
    node('p', 'neo-badge-detail__eyebrow', `${TIER_NAMES[badge.tier]} badge · ${gameTitle}`),
    title,
    node(
      'p',
      'neo-badge-detail__text',
      unlocked
        ? badge.description
        : hidden
          ? 'A secret badge. Nobody will tell you how to earn it — play, experiment, and it may find you.'
          : (badge.hint ?? ''),
    ),
  );

  if (badge.target && !unlocked) {
    const meter = node('div', 'neo-badge-detail__meter');
    meter.setAttribute('role', 'progressbar');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', String(badge.target));
    meter.setAttribute('aria-valuenow', String(progress));
    meter.setAttribute('aria-label', 'Progress');
    const fill = node('span', 'neo-badge-detail__meter-fill');
    fill.style.width = `${(progress / badge.target) * 100}%`;
    meter.append(fill);
    body.append(meter, node('p', 'neo-badge-detail__count', `${progress} of ${badge.target}`));
  }

  const facts = node('dl', 'neo-badge-detail__facts');
  facts.append(fact('Reward', `+${badgeXp(badge)} XP`));
  facts.append(fact('Earned', unlocked ? earnedDate.format(new Date(unlockedAt)) : 'Not yet'));
  const cosmetics = manifest.cosmetics.filter(
    (cosmetic) => 'badge' in cosmetic.unlock && cosmetic.unlock.badge === badge.id,
  );
  if (cosmetics.length > 0 && !hidden) {
    facts.append(
      fact(
        'Unlocks',
        cosmetics.map((cosmetic) => `${cosmetic.name} (${cosmetic.kind})`).join(', '),
      ),
    );
  }
  body.append(facts);

  panel.append(closeButton, art, body);
  return panel;
}

function fact(term: string, description: string): HTMLElement {
  const row = node('div', 'neo-badge-detail__fact');
  row.append(node('dt', '', term), node('dd', '', description));
  return row;
}

function node<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  text?: string,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
