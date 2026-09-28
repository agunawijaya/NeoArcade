import { HALL_THEMES, type FrameId, type HallThemeId } from '@shared/pass/arcade-cosmetics';
import { h } from './dom';
import type { Theme } from './theme';

/**
 * The Hall's own share of the player's look: the neon colours of the chosen
 * Hall theme, and the frame around their name plate.
 */
export function applyHallTheme(themeId: HallThemeId, theme: Theme): void {
  const chosen = HALL_THEMES.find((option) => option.id === themeId) ?? HALL_THEMES[0];
  const [primary, secondary] = chosen[theme];
  const root = document.documentElement.style;
  root.setProperty('--magenta', primary);
  root.setProperty('--cyan', secondary);
}

/** The player's name on a plate, framed by the cosmetic they wear. */
export function buildNamePlate(name: string, frame: FrameId, tag: 'p' | 'span' = 'p'): HTMLElement {
  return h(
    tag,
    { class: `name-plate name-plate--${frame}` },
    h('span', { class: 'name-plate__text' }, name),
  );
}
