import type { PowerUpKind } from '../engine/powerups';

const svg = (paths: string, viewBox = '0 0 24 24') =>
  `<svg class="icon" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const ICONS = {
  pause: svg('<path d="M9 5v14M15 5v14"/>'),
  soundOn: svg(
    '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  ),
  soundOff: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  play: svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  ),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  globe: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  ),
  lock: svg(
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  ),
  star: svg(
    '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor"/>',
  ),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  retry: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>'),
  map: svg('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  share: svg(
    '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  ),
  copy: svg(
    '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  ),
  calendar: svg(
    '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 13.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" fill="currentColor" stroke="none"/>',
  ),
  target: svg(
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  ),
  arc: svg(
    '<path d="M3 19C6 7 14 3 21 9"/><circle cx="21" cy="9" r="1.6" fill="currentColor"/><path d="M3 19h4"/>',
  ),
  flame: svg(
    '<path d="M12 21c4 0 6.5-2.6 6.5-6.2 0-3.9-3.3-6-4.2-10.3-2 1.8-3 4-3 5.9-1.2-.8-1.9-2-2.1-3.2C7.6 9.2 5.5 11.6 5.5 14.8 5.5 18.4 8 21 12 21z"/>',
  ),
  wind: svg('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>'),
  swords: svg('<path d="M4 4l9 9M20 4l-9 9M6.5 15.5l2 2M17.5 15.5l-2 2M4 20l3-3M20 20l-3-3"/>'),
};

/** Small emblems for the power-ups, shared by the HUD and the settings screen. */
export const POWER_UP_ICONS: Record<PowerUpKind, string> = {
  golden: svg(
    '<path d="M5 14c3 5 10 5 14-2" stroke-width="3"/><path d="M12 3l1 2.5 2.7.3-2 1.8.6 2.6-2.3-1.4-2.3 1.4.6-2.6-2-1.8 2.7-.3z" fill="currentColor" stroke="none"/>',
  ),
  tri: svg('<path d="M3 13c2 3 6 3 8-1M9 8c2 3 6 3 8-1M13 16c2 3 6 3 8-1" stroke-width="2.2"/>'),
  calm: svg('<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3"/><path d="M4 20L20 4"/>'),
  bouncer: svg('<path d="M3 19h18"/><path d="M5 17l3-10 3 10 3-10 3 10 2-5"/>'),
  shield: svg('<path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>'),
};
