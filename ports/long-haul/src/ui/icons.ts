/** Line icons drawn for the game, 24 × 24, stroked in the current colour. */
const svg = (body: string) => `<svg viewBox="0 0 24 24">${body}</svg>`;

export const ICONS = {
  map: svg('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  radio: svg(
    '<rect x="3" y="8" width="18" height="11" rx="2"/><path d="M7 8l9-5"/><circle cx="8" cy="13.5" r="2"/><path d="M13 12h5M13 15h5"/>',
  ),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  play: svg('<path d="M7 5l12 7-12 7z"/>'),
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ),
  moon: svg('<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11z"/>'),
  truck: svg(
    '<path d="M2 16V7h11v9M13 10h4l3 3v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  ),
  postcard: svg(
    '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M13 9h5M13 12h5M13 15h3"/><rect x="5.5" y="8" width="5" height="5"/>',
  ),
  gear: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  ),
  calendar: svg(
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  ),
  book: svg(
    '<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3"/><path d="M20 4v14h-6"/>',
  ),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  share: svg('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>'),
  coffee: svg(
    '<path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2"/><path d="M8 3c0 2 2 2 2 4M12 3c0 2 2 2 2 4"/>',
  ),
  bed: svg(
    '<path d="M3 18V7M3 13h18v5M21 13a4 4 0 0 0-4-4h-6v4"/><circle cx="7" cy="10.5" r="1.8"/>',
  ),
  fuel: svg(
    '<path d="M4 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15"/><path d="M3 20h12M14 9h2a2 2 0 0 1 2 2v5a2 2 0 0 0 4 0V8l-3-3"/><path d="M6 8h6"/>',
  ),
  tyre: svg(
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
  ),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
} as const;
