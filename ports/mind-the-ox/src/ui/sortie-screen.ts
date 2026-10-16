import { randomSeed } from '@shared/rng';
import type { Objective } from '../engine/objectives';
import type { CpuLevel } from '../engine/world';
import {
  SORTIE_MISSIONS,
  buildSortie,
  parseSortieCode,
  settleOptions,
  sortieCode,
  type SortieOptions,
} from '../game/sortie';
import { THEMES, THEME_IDS, type ThemeCopy } from '../themes';
import { button, choiceRow, h } from './dom';

export interface SortieHandlers {
  options(): SortieOptions;
  change(next: SortieOptions): void;
  play(): void;
  /** The address that flies this sortie, for sharing. */
  link(options: SortieOptions): string;
  back(): void;
}

const LEVEL_NAMES: Readonly<Record<CpuLevel, string>> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  brutal: 'Brutal',
};

/** What an objective asks, in a few words of the theme's own. */
export function objectiveLabel(objective: Objective, theme: ThemeCopy): string {
  switch (objective) {
    case 'targets':
      return 'Destroy every target and sink every ship';
    case 'shore':
      return 'Destroy every target ashore';
    case 'ships':
      return 'Sink every enemy ship';
    case 'planes':
      return `Bring down every enemy plane`;
    case 'raiders':
      return `Stop every ${theme.raiders.bomber} and ${theme.raiders.zeppelin}`;
    case 'escort':
      return `See every ${theme.ships.supply} in`;
    case 'gates':
      return 'Fly through every gate, in order';
    case 'boats':
      return `Sink every ${theme.ships['torpedo-boat']}`;
    case 'touch-and-go':
      return 'Touch down and go round again at full throttle';
    case 'land-aboard':
      return 'Then land back aboard';
  }
}

/**
 * Custom Sortie: the choices that build a mission, a preview of its
 * briefing and objectives, the seed with a way to roll a new one or paste
 * a friend's, and a link to share it.
 */
export function buildSortieScreen(handlers: SortieHandlers) {
  const choices = h('div', { class: 'settings sortie__choices' });
  const preview = h('div', { class: 'briefing sortie__preview' });
  const seedLine = h('p', { class: 'sortie__seed' });
  const codeInput = h('input', {
    class: 'sortie__code',
    type: 'text',
    placeholder: 'Paste a sortie code or link',
    'aria-label': 'Sortie code',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const shareNote = h('p', { class: 'card__note', 'aria-live': 'polite' });
  const takeOff = button('Take off', () => handlers.play(), 'card__button', {
    'data-action': 'take-off',
  });

  const element = h(
    'section',
    { class: 'screen', 'aria-labelledby': 'sortie-title', hidden: true },
    h(
      'div',
      { class: 'card card--wide card--scroll' },
      h('h2', { class: 'card__title card__title--small', id: 'sortie-title' }, 'Custom Sortie'),
      h(
        'p',
        { class: 'panel__subtitle' },
        'Choose a mission and a seed. The same choices and seed always build the same sortie, checked to be winnable.',
      ),
      h('div', { class: 'sortie' }, choices, preview),
      h(
        'div',
        { class: 'title__row sortie__seed-row' },
        seedLine,
        button('New seed', () => update({ seed: randomSeed() }), 'chip'),
        codeInput,
        button('Load', () => loadCode(), 'chip'),
        button('Copy link', () => void copyLink(), 'chip'),
      ),
      shareNote,
      h('div', { class: 'card__footer' }, takeOff, button('Back', handlers.back, 'chip')),
    ),
  );

  const update = (change: Partial<SortieOptions>) => {
    handlers.change({ ...handlers.options(), ...change });
    refresh();
  };

  const loadCode = () => {
    const text = codeInput.value.trim();
    const code = text.includes('sortie=') ? (/sortie=([^&#\s]+)/.exec(text)?.[1] ?? '') : text;
    const options = parseSortieCode(decodeURIComponent(code));
    if (!options) {
      shareNote.textContent = 'That is not a sortie code.';
      return;
    }
    codeInput.value = '';
    handlers.change(options);
    shareNote.textContent = 'Sortie loaded.';
    refresh();
  };

  const copyLink = async () => {
    const link = handlers.link(handlers.options());
    try {
      await navigator.clipboard.writeText(link);
      shareNote.textContent = 'Link copied. Anyone who opens it flies this same sortie.';
    } catch {
      shareNote.textContent = link;
    }
  };

  const refresh = () => {
    const options = handlers.options();
    const rows = [
      choiceRow(
        'Fly from',
        [
          { value: 'carrier' as const, label: 'Our carrier' },
          { value: 'airfield' as const, label: 'A coastal airfield' },
        ],
        () => handlers.options().base,
        (base) => update({ base }),
      ),
      choiceRow(
        'Mission',
        SORTIE_MISSIONS.map((mission) => ({ value: mission.id, label: mission.name })),
        () => handlers.options().mission,
        (mission) => update({ mission }),
      ),
      choiceRow(
        'Enemy flies from',
        [
          { value: 'land' as const, label: 'Land' },
          { value: 'sea' as const, label: 'A carrier' },
          { value: 'both' as const, label: 'Both' },
        ],
        () => settleOptions(handlers.options()).enemy,
        (enemy) => update({ enemy }),
      ),
      choiceRow(
        'Sea',
        [
          { value: 0 as const, label: 'Calm' },
          { value: 1 as const, label: 'A swell' },
          { value: 2 as const, label: 'Heavy' },
        ],
        () => handlers.options().seaState,
        (seaState) => update({ seaState }),
      ),
      choiceRow(
        'Time',
        [
          { value: 'day' as const, label: 'Day' },
          { value: 'dusk' as const, label: 'Dusk' },
          { value: 'night' as const, label: 'Night' },
        ],
        () => settleOptions(handlers.options()).hour,
        (hour) => update({ hour }),
      ),
      choiceRow(
        'Difficulty',
        (['easy', 'normal', 'hard', 'brutal'] as const).map((level) => ({
          value: level,
          label: LEVEL_NAMES[level],
        })),
        () => handlers.options().level,
        (level) => update({ level }),
      ),
      choiceRow(
        'Theme',
        THEME_IDS.map((id) => ({ value: id, label: THEMES[id].name })),
        () => handlers.options().theme,
        (theme) => update({ theme }),
      ),
    ];
    choices.replaceChildren(...rows.map((row) => row.element));

    const sortie = buildSortie(options);
    const copy = THEMES[sortie.options.theme];
    const mission = SORTIE_MISSIONS.find((candidate) => candidate.id === sortie.options.mission);
    preview.replaceChildren(
      h('p', { class: 'briefing__kicker' }, mission?.blurb ?? ''),
      h('h3', { class: 'briefing__title' }, sortie.title),
      h('p', { class: 'briefing__text' }, sortie.briefing),
      ...(sortie.loadout === 'torpedo'
        ? [h('p', { class: 'briefing__advice' }, `Suggested: a ${copy.torpedo}.`)]
        : []),
      h(
        'ul',
        { class: 'goals' },
        ...sortie.objectives.map((objective) =>
          h('li', { class: 'goal' }, `• ${objectiveLabel(objective, copy)}`),
        ),
      ),
      h(
        'p',
        { class: 'card__note' },
        'Checked: home within reach, a deck you can land on in this sea, fuel for the trip.',
      ),
    );
    seedLine.textContent = `Code ${sortieCode(sortie.options)}`;
  };

  return {
    element,
    refresh,
    focusFirst() {
      // Ready to take off, but opened at the top: the choices come first, and on a phone they fill the screen.
      takeOff.focus({ preventScroll: true });
    },
  };
}
