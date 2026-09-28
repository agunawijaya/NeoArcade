import './tokens.css';
import './cabinet.css';
import { drawBadge } from '../art/badge';
import { TIER_NAMES, type PassManifest } from '../manifest';
import type { ArcadePass } from '../pass';
import { badgeStandings, tallyBadges, type BadgeStanding } from '../tally';
import { createBadgeDetail } from './badge-detail';

/**
 * The badge cabinet: one lit shelf per game, every badge in its place.
 * Earned medals shine, locked ones wait as silhouettes with their hint,
 * secrets stay "???" and counted badges show how far along they are.
 * The Hall shows every game; a game can show just its own shelf:
 *
 *   buildBadgeCabinet({ pass: openArcadePass(), manifests: [manifest], games: [{ slug, title, accent }] });
 */
export interface CabinetGame {
  slug: string;
  title: string;
  accent: string;
}

export interface BadgeCabinetOptions {
  pass: Pick<ArcadePass, 'profile' | 'subscribe'>;
  manifests: readonly PassManifest[];
  /** Titles and colours for the shelves, in the order they should appear. */
  games?: readonly CabinetGame[];
  /** Badges earned after this ISO time wear a "New" tag. */
  newSince?: string | null;
  /** Heading level for each shelf's title. */
  headingLevel?: 2 | 3;
}

export interface BadgeCabinet {
  element: HTMLElement;
  refresh(): void;
  /** Moves keyboard focus into the cabinet. */
  focus(): void;
  dispose(): void;
}

const earnedShort = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' });
const earnedLong = new Intl.DateTimeFormat('en', { dateStyle: 'long' });
const FALLBACK_ACCENT = '#9b6bff';

export function buildBadgeCabinet(options: BadgeCabinetOptions): BadgeCabinet {
  const { pass, headingLevel = 3 } = options;
  const element = document.createElement('div');
  element.className = 'neo-cabinet';
  const detail = createBadgeDetail();
  let tiles: HTMLButtonElement[] = [];
  let current = '';

  const shelves = () => orderShelves(options.manifests, options.games ?? []);

  function render() {
    const focusedKey = element.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.badge
      : undefined;
    tiles = [];
    const built = shelves().map(({ manifest, game }) => buildShelf(manifest, game));
    if (built.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'neo-cabinet__empty';
      empty.textContent =
        'No badges to collect yet. Every game that joins the Arcade Pass adds its own shelf here.';
      element.replaceChildren(empty);
      return;
    }
    element.replaceChildren(...built);
    if (!tiles.some((tile) => tile.dataset.badge === current))
      current = tiles[0]?.dataset.badge ?? '';
    for (const tile of tiles) tile.tabIndex = tile.dataset.badge === current ? 0 : -1;
    if (focusedKey) tiles.find((tile) => tile.dataset.badge === focusedKey)?.focus();
  }

  function buildShelf(manifest: PassManifest, game: CabinetGame): HTMLElement {
    const record = pass.profile.games[manifest.game];
    const tally = tallyBadges(manifest, record);
    const shelf = document.createElement('section');
    shelf.className = 'neo-shelf';
    shelf.style.setProperty('--neo-shelf-accent', game.accent);
    const titleId = `neo-shelf-${manifest.game}`;
    shelf.setAttribute('aria-labelledby', titleId);

    const title = document.createElement(`h${headingLevel}`);
    title.className = 'neo-shelf__title';
    title.id = titleId;
    title.textContent = game.title;

    const count = document.createElement('p');
    count.className = 'neo-shelf__count';
    const earned = document.createElement('strong');
    earned.textContent = String(tally.unlocked);
    count.append(earned, ` / ${tally.total} badges`);

    const meter = document.createElement('div');
    meter.className = 'neo-shelf__meter';
    meter.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    fill.style.width = `${tally.total ? (tally.unlocked / tally.total) * 100 : 0}%`;
    meter.append(fill);

    const tiers = document.createElement('ul');
    tiers.className = 'neo-shelf__tiers';
    tiers.setAttribute('aria-label', 'By tier');
    for (const [tier, counts] of Object.entries(tally.byTier)) {
      if (counts.total === 0) continue;
      const item = document.createElement('li');
      item.className = `neo-shelf__tier neo-shelf__tier--${tier}`;
      item.textContent = `${TIER_NAMES[tier as keyof typeof TIER_NAMES]} ${counts.unlocked}/${counts.total}`;
      tiers.append(item);
    }

    const head = document.createElement('header');
    head.className = 'neo-shelf__head';
    head.append(title, count, meter, tiers);
    if (tally.total > 0 && tally.unlocked === tally.total) {
      shelf.classList.add('is-complete');
      const complete = document.createElement('p');
      complete.className = 'neo-shelf__complete';
      complete.textContent = 'Shelf complete';
      head.append(complete);
    }

    const grid = document.createElement('ul');
    grid.className = 'neo-shelf__grid';
    for (const [index, standing] of badgeStandings(manifest, record).entries()) {
      const item = document.createElement('li');
      const tile = buildTile(standing, manifest, game, index);
      tiles.push(tile);
      item.append(tile);
      grid.append(item);
    }
    shelf.append(head, grid);
    return shelf;
  }

  function buildTile(
    standing: BadgeStanding,
    manifest: PassManifest,
    game: CabinetGame,
    index: number,
  ): HTMLButtonElement {
    const { badge, unlockedAt, progress } = standing;
    const unlocked = unlockedAt !== null;
    const hidden = !unlocked && badge.tier === 'secret';
    const isNew = unlocked && Boolean(options.newSince) && unlockedAt > (options.newSince ?? '');

    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `neo-tile neo-tile--${badge.tier} ${unlocked ? 'is-unlocked' : 'is-locked'}`;
    if (isNew) tile.classList.add('is-new');
    tile.dataset.badge = `${manifest.game}/${badge.id}`;
    // Earned medals catch the light one after another, not all at once.
    tile.style.setProperty('--neo-badge-glint-delay', `${((index * 1.3) % 7).toFixed(1)}s`);

    const art = document.createElement('span');
    art.className = 'neo-tile__art';
    art.append(
      drawBadge(badge, {
        unlocked,
        accent: game.accent,
        progress: !unlocked && badge.target ? progress / badge.target : undefined,
      }),
    );

    const name = document.createElement('span');
    name.className = 'neo-tile__name';
    name.textContent = hidden ? '???' : badge.name;

    const note = document.createElement('span');
    note.className = 'neo-tile__note';
    if (unlocked) note.textContent = earnedShort.format(new Date(unlockedAt));
    else if (hidden) note.textContent = 'Secret';
    else if (badge.target) note.textContent = `${progress} / ${badge.target}`;
    else note.textContent = badge.hint ?? '';

    tile.append(art, name, note);
    if (isNew) {
      const flag = document.createElement('span');
      flag.className = 'neo-tile__new';
      flag.textContent = 'New';
      tile.append(flag);
    }
    tile.setAttribute('aria-label', tileLabel(standing, hidden));
    tile.addEventListener('click', () => {
      current = tile.dataset.badge ?? '';
      detail.show({ standing, manifest, gameTitle: game.title, accent: game.accent }, tile);
    });
    return tile;
  }

  element.addEventListener('keydown', (event) => {
    const from = tiles.find((tile) => tile === event.target);
    if (!from) return;
    const next = neighbour(tiles, from, event.key);
    if (next === null) return;
    event.preventDefault();
    if (!next) return;
    from.tabIndex = -1;
    next.tabIndex = 0;
    current = next.dataset.badge ?? '';
    next.focus();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  const unsubscribe = pass.subscribe(() => render());
  render();

  return {
    element,
    refresh: render,
    focus() {
      tiles.find((tile) => tile.tabIndex === 0)?.focus();
    },
    dispose() {
      unsubscribe();
      detail.dispose();
    },
  };
}

function tileLabel({ badge, unlockedAt, progress }: BadgeStanding, hidden: boolean): string {
  const tier = `${TIER_NAMES[badge.tier]} badge`;
  if (unlockedAt)
    return `${badge.name}, ${tier}, earned ${earnedLong.format(new Date(unlockedAt))}`;
  if (hidden) return `Secret badge, not yet found`;
  if (badge.target)
    return `${badge.name}, ${tier}, ${progress} of ${badge.target}. ${badge.hint ?? ''}`;
  return `${badge.name}, ${tier}, locked. ${badge.hint ?? ''}`;
}

function orderShelves(manifests: readonly PassManifest[], games: readonly CabinetGame[]) {
  const known = games
    .map((game) => ({ game, manifest: manifests.find((manifest) => manifest.game === game.slug) }))
    .filter((shelf): shelf is { game: CabinetGame; manifest: PassManifest } =>
      Boolean(shelf.manifest),
    );
  const others = manifests
    .filter((manifest) => !games.some((game) => game.slug === manifest.game))
    .map((manifest) => ({
      manifest,
      game: { slug: manifest.game, title: titleFromSlug(manifest.game), accent: FALLBACK_ACCENT },
    }));
  return [...known, ...others];
}

function titleFromSlug(slug: string): string {
  return slug
    .replace(/^_/, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * The tile an arrow key leads to: left and right follow the order, up and
 * down move a row (across shelves too), keeping the column. Returns null
 * for keys the cabinet does not handle, undefined at an edge.
 */
function neighbour(
  tiles: HTMLButtonElement[],
  from: HTMLButtonElement,
  key: string,
): HTMLButtonElement | undefined | null {
  const index = tiles.indexOf(from);
  switch (key) {
    case 'ArrowLeft':
      return tiles[index - 1];
    case 'ArrowRight':
      return tiles[index + 1];
    case 'Home':
      return tiles[0];
    case 'End':
      return tiles.at(-1);
    case 'ArrowUp':
    case 'ArrowDown': {
      const box = from.getBoundingClientRect();
      const centre = box.left + box.width / 2;
      const below = key === 'ArrowDown';
      const candidates = tiles
        .map((tile) => ({ tile, box: tile.getBoundingClientRect() }))
        .filter(({ box: other }) =>
          below ? other.top > box.bottom - 4 : other.bottom < box.top + 4,
        );
      if (candidates.length === 0) return undefined;
      const rowEdge = below
        ? Math.min(...candidates.map(({ box: other }) => other.top))
        : Math.max(...candidates.map(({ box: other }) => other.bottom));
      const row = candidates.filter(({ box: other }) =>
        below ? other.top - rowEdge < 8 : rowEdge - other.bottom < 8,
      );
      row.sort(
        (a, b) =>
          Math.abs(a.box.left + a.box.width / 2 - centre) -
          Math.abs(b.box.left + b.box.width / 2 - centre),
      );
      return row[0]?.tile;
    }
    default:
      return null;
  }
}
