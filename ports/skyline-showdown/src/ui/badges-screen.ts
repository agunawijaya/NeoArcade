import { buildBadgeCabinet, type ArcadePass, type PassManifest } from '@shared/pass';
import { h, icon } from './dom';
import { ICONS } from './icons';

export interface BadgesScreen {
  element: HTMLElement;
  show(): void;
}

/**
 * This game's shelf of the Arcade Pass badge cabinet: earned medals shine,
 * locked ones say how to earn them, secrets stay secret. The whole Pass
 * lives in the Hall, one link away.
 */
export function buildBadgesScreen(
  pass: ArcadePass,
  manifest: PassManifest,
  links: { pass: string },
  back: () => void,
): BadgesScreen {
  const cabinet = buildBadgeCabinet({
    pass,
    manifests: [manifest],
    games: [{ slug: manifest.game, title: 'Skyline Showdown', accent: '#ff7a3d' }],
    headingLevel: 3,
  });
  const level = h('p', { class: 'badges__level' });
  const done = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.back),
    'Done',
  );
  done.addEventListener('click', back);

  const element = h(
    'section',
    { class: 'screen screen--settings', 'aria-labelledby': 'badges-title', hidden: true },
    h(
      'div',
      { class: 'panel badges' },
      h(
        'header',
        { class: 'badges__head' },
        h('h2', { class: 'panel__title', id: 'badges-title' }, 'Badges'),
        level,
      ),
      h('div', { class: 'badges__body' }, cabinet.element),
      h(
        'div',
        { class: 'settings__footer' },
        h('a', { class: 'button button--quiet', href: links.pass }, 'Your whole Arcade Pass'),
        done,
      ),
    ),
  );

  return {
    element,
    show() {
      cabinet.refresh();
      level.textContent = `Arcade Pass level ${pass.level}`;
    },
  };
}
