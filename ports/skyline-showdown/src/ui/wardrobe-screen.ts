import type { PlayerIndex } from '../engine/gorillas';
import { lookFor, PLAYER_ACCENTS } from '../render/gorilla';
import { GorillaPreview, type PreviewMode } from '../render/preview';
import { paintThumbnail } from '../render/wardrobe-art';
import {
  DEFAULT_OUTFITS,
  itemsFor,
  SLOT_NAMES,
  SLOTS,
  unlockText,
  WARDROBE,
  type Outfit,
  type Slot,
  type WardrobeItem,
} from '../wardrobe/items';
import { isItemUnlocked, type UnlockContext } from '../wardrobe/unlocks';
import { h, icon } from './dom';
import { keepingFocus, segmented } from './form';
import { ICONS } from './icons';

export interface WardrobeHandlers {
  /** A player put something on; the outfit is saved straight away. */
  change(player: PlayerIndex, outfit: Outfit): void;
  back(): void;
}

export interface WardrobeState {
  outfits: readonly [Outfit, Outfit];
  unlocks: UnlockContext;
  badgeName(id: string): string;
  rivalName(id: string): string;
}

export interface WardrobeScreen {
  element: HTMLElement;
  refresh(state: WardrobeState): void;
  animate(delta: number, reducedMotion: boolean): void;
}

const SLOT_PREVIEW: Partial<Record<Slot, PreviewMode>> = {
  banana: 'throw',
  trail: 'throw',
  explosion: 'throw',
  dance: 'victory',
};

/**
 * The wardrobe: player 1 and player 2 each dress their own gorilla. The
 * preview shows the outfit idling, dancing, or throwing when a banana,
 * trail or explosion is being chosen. Locked items wait as silhouettes that
 * say how to earn them.
 */
export function buildWardrobeScreen(handlers: WardrobeHandlers): WardrobeScreen {
  let state: WardrobeState | null = null;
  let player: PlayerIndex = 0;
  let slot: Slot = 'fur';
  let mode: PreviewMode = 'idle';
  const preview = new GorillaPreview(lookFor(DEFAULT_OUTFITS[0], PLAYER_ACCENTS[0]));

  const playerPicker = h('div', { class: 'wardrobe__player' });
  const modePicker = h('div', { class: 'wardrobe__modes' });
  const wearing = h('p', { class: 'wardrobe__wearing' });
  const count = h('p', { class: 'wardrobe__count' });
  const slots = h('div', { class: 'wardrobe__slots', role: 'tablist', 'aria-label': 'Slots' });
  const items = h('div', { class: 'wardrobe__items', role: 'radiogroup' });
  const detail = h('p', { class: 'wardrobe__detail', 'aria-live': 'polite' });
  const body = h(
    'div',
    { class: 'wardrobe__body' },
    h('div', { class: 'wardrobe__stage' }, preview.canvas, modePicker, wearing),
    h('div', { class: 'wardrobe__closet' }, slots, items, detail),
  );
  const done = h(
    'button',
    { class: 'button button--primary', type: 'button' },
    icon(ICONS.back),
    'Done',
  );
  done.addEventListener('click', handlers.back);

  const element = h(
    'section',
    { class: 'screen screen--wardrobe', 'aria-labelledby': 'wardrobe-title', hidden: true },
    h(
      'div',
      { class: 'panel wardrobe' },
      h(
        'header',
        { class: 'wardrobe__head' },
        h('h2', { class: 'panel__title', id: 'wardrobe-title' }, 'Wardrobe'),
        playerPicker,
        count,
        done,
      ),
      body,
    ),
  );

  const accent = () => PLAYER_ACCENTS[player];

  const unlocked = (item: WardrobeItem) => (state ? isItemUnlocked(item, state.unlocks) : false);

  const describe = (item: WardrobeItem) => {
    if (!state) return '';
    return unlocked(item)
      ? `${item.name}${state.outfits[player][item.slot] === item.id ? ' · wearing' : ''}`
      : `${item.name} · ${unlockText(item.unlock, state.badgeName, state.rivalName)}`;
  };

  const choose = (item: WardrobeItem) => {
    if (!state) return;
    if (!unlocked(item)) {
      detail.textContent = describe(item);
      return;
    }
    const outfit = { ...state.outfits[player], [item.slot]: item.id };
    handlers.change(player, outfit);
  };

  function render() {
    const current = state;
    if (!current) return;
    const outfit = current.outfits[player];
    preview.look = lookFor(outfit, accent());
    preview.show(mode);
    element.style.setProperty('--accent', accent());

    playerPicker.replaceChildren(
      segmented(
        'player',
        String(player),
        [
          { value: '0', label: 'Player 1' },
          { value: '1', label: 'Player 2' },
        ],
        (value) => {
          player = Number(value) as PlayerIndex;
          keepingFocus(body, render);
        },
      ),
    );
    modePicker.replaceChildren(
      segmented<PreviewMode>(
        'preview',
        mode,
        [
          { value: 'idle', label: 'Idle' },
          { value: 'victory', label: 'Victory' },
          { value: 'throw', label: 'Throw' },
        ],
        (value) => {
          mode = value;
          keepingFocus(body, render);
        },
      ),
    );
    wearing.textContent = SLOTS.map(
      (each) => WARDROBE.find((item) => item.id === outfit[each])?.name ?? '',
    )
      .filter((name) => name && name !== 'Nothing')
      .join(' · ');
    const open = WARDROBE.filter(unlocked).length;
    count.textContent = `${open} / ${WARDROBE.length} unlocked`;

    slots.replaceChildren(
      ...SLOTS.map((each) => {
        const tab = h(
          'button',
          {
            class: 'wardrobe__slot',
            type: 'button',
            role: 'tab',
            'aria-selected': String(each === slot),
            'data-focus-key': `slot-${each}`,
          },
          SLOT_NAMES[each],
        );
        tab.addEventListener('click', () => {
          slot = each;
          mode = SLOT_PREVIEW[each] ?? 'idle';
          keepingFocus(body, render);
        });
        return tab;
      }),
    );
    items.setAttribute('aria-label', SLOT_NAMES[slot]);
    items.replaceChildren(
      ...itemsFor(slot).map((item) => {
        const locked = !unlocked(item);
        const thumb = h('canvas', { class: 'wardrobe__thumb', 'aria-hidden': 'true' });
        const button = h(
          'button',
          {
            class: `wardrobe__item${locked ? ' wardrobe__item--locked' : ''}`,
            type: 'button',
            role: 'radio',
            'aria-checked': String(outfit[slot] === item.id),
            'aria-disabled': String(locked),
            'aria-label': describe(item),
            title: describe(item),
            'data-focus-key': `item-${item.id}`,
          },
          thumb,
          h('span', { class: 'wardrobe__name' }, item.name),
          locked ? h('span', { class: 'wardrobe__lock' }, icon(ICONS.lock)) : null,
        );
        button.addEventListener('click', () => choose(item));
        const explain = () => (detail.textContent = describe(item));
        button.addEventListener('focus', explain);
        button.addEventListener('pointerenter', explain);
        // Painted once it is in the page, when its size is known.
        requestAnimationFrame(() =>
          paintThumbnail(thumb, item, accent(), locked, silhouetteColour()),
        );
        return button;
      }),
    );
    const worn = itemsFor(slot).find((item) => item.id === outfit[slot]);
    detail.textContent = worn ? describe(worn) : '';
  }

  return {
    element,
    refresh(next) {
      state = next;
      keepingFocus(body, render);
    },
    animate(delta, reducedMotion) {
      if (element.hidden) return;
      preview.update(delta, reducedMotion);
      preview.draw();
    },
  };
}

function silhouetteColour(): string {
  return document.documentElement.dataset.theme === 'light' ? '#8f8aa8' : '#2a2540';
}
