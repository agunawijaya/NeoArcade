import type { GameEntry } from './catalog';
import { prefersReducedMotion } from './motion';

/**
 * Where a game lives. The built site puts each game next to the Hall; the dev
 * server serves them straight from the repo.
 */
export function gameUrl(game: GameEntry): string {
  return import.meta.env.DEV ? `/ports/${game.slug}/` : game.path;
}

const LAUNCH_DELAY_MS = 420;

/**
 * Plays the short "power down the lobby" fade before following a Play link.
 * Modified clicks (new tab, new window) are left to the browser.
 */
export function launchOnClick(link: HTMLAnchorElement): void {
  link.addEventListener('click', (event) => {
    const modified =
      event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || modified || prefersReducedMotion()) return;
    event.preventDefault();
    document.body.classList.add('is-launching');
    setTimeout(() => location.assign(link.href), LAUNCH_DELAY_MS);
  });
}

// Coming back with the browser's back button can restore the faded-out page from cache.
window.addEventListener('pageshow', () => document.body.classList.remove('is-launching'));
