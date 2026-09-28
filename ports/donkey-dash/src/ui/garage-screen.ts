import type { AudioEngine } from '@shared/audio';
import { playHorn } from '../audio/sounds';
import {
  GARAGE_SLOTS,
  itemsFor,
  lookOf,
  SLOT_NAMES,
  type GarageItem,
  type GarageSlot,
  type Loadout,
} from '../garage';
import { coatFor, paletteFor, RAINBOW_SWATCH, type Theme } from '../render/palette';
import { drawCarRear } from '../render/sprites/car';
import { drawDonkey } from '../render/sprites/donkey';
import { button, h, icon } from './dom';
import { ICONS } from './icons';

export interface GarageHandlers {
  owns(itemId: string): boolean;
  /** How to earn a locked item. */
  unlockHint(itemId: string): string;
  loadout(): Loadout;
  change(loadout: Loadout): void;
  audio: AudioEngine;
  theme(): Theme;
  back(): void;
}

/**
 * The garage: bodies, paint, horns, trails and hats for the second player's
 * donkey. Everything is for looks; nothing changes how the car drives.
 */
export function buildGarageScreen(handlers: GarageHandlers) {
  let slot: GarageSlot = 'body';
  const preview = h('canvas', {
    class: 'garage__preview',
    width: 640,
    height: 300,
    'aria-hidden': 'true',
  });
  const tabs = h('div', { class: 'garage__tabs', role: 'tablist', 'aria-label': 'Parts' });
  const grid = h('div', { class: 'garage__items', role: 'radiogroup' });
  const caption = h('p', { class: 'garage__caption', role: 'status' });

  const element = h(
    'section',
    { class: 'screen screen--panel', 'aria-labelledby': 'garage-title', hidden: true },
    h(
      'div',
      { class: 'panel garage' },
      h('h2', { class: 'panel__title', id: 'garage-title' }, 'Garage'),
      h('div', { class: 'garage__stage' }, preview, caption),
      tabs,
      grid,
      h(
        'div',
        { class: 'panel__footer' },
        button('Back', handlers.back, 'button button--quiet', {}, icon(ICONS.back)),
      ),
    ),
  );

  const render = () => {
    const loadout = handlers.loadout();
    tabs.replaceChildren(
      ...GARAGE_SLOTS.map((candidate) =>
        button(
          SLOT_NAMES[candidate],
          () => {
            slot = candidate;
            render();
            tabs.querySelector<HTMLElement>(`[data-slot="${candidate}"]`)?.focus();
          },
          'garage__tab',
          { role: 'tab', 'aria-selected': String(candidate === slot), 'data-slot': candidate },
        ),
      ),
    );
    grid.setAttribute('aria-label', SLOT_NAMES[slot]);
    grid.replaceChildren(
      ...itemsFor(slot).map((item) => {
        const owned = item.starter === true || handlers.owns(item.id);
        const chosen = loadout[slot] === item.id;
        const choose = () => {
          if (!owned) {
            caption.textContent = `${item.name}: ${handlers.unlockHint(item.id)}.`;
            return;
          }
          if (item.slot === 'horn') playHorn(handlers.audio, item.horn);
          handlers.change({ ...loadout, [slot]: item.id });
          caption.textContent = `${item.name} fitted.`;
          render();
          grid.querySelector<HTMLElement>(`[data-item="${item.id}"]`)?.focus();
        };
        return button(
          h('span', { class: 'garage__name' }, item.name),
          choose,
          `garage__item${owned ? '' : ' is-locked'}`,
          {
            role: 'radio',
            'aria-checked': String(chosen),
            'aria-disabled': String(!owned),
            'data-item': item.id,
            title: owned ? item.name : handlers.unlockHint(item.id),
          },
          swatch(item, loadout),
          owned ? null : icon(ICONS.lock),
        );
      }),
    );
    drawPreview(preview, loadout, handlers.theme());
  };

  return {
    element,
    refresh() {
      caption.textContent = 'Everything here is for looks. The car drives the same.';
      render();
    },
  };
}

function swatch(item: GarageItem, loadout: Loadout): HTMLElement {
  switch (item.slot) {
    case 'body':
      return drawnSwatch((ctx) => {
        ctx.translate(13, 23);
        ctx.scale(11, 11);
        drawCarRear(ctx, { ...STILL_CAR, shape: item.shape, paint: lookOf(loadout).paint });
      });
    case 'hat':
      // Just the donkey's head, to show the hat off.
      return drawnSwatch((ctx) => {
        ctx.translate(-4, 50);
        ctx.scale(22, 22);
        drawDonkey(ctx, { ...STILL_DONKEY, hat: item.hat });
      });
    case 'paint': {
      const box = plainSwatch();
      box.style.background = `linear-gradient(135deg, ${item.paint.body} 60%, ${item.paint.shade})`;
      return box;
    }
    case 'trail': {
      const box = plainSwatch();
      box.dataset.trail = item.trail;
      if (item.trail === 'rainbow') box.style.background = RAINBOW_SWATCH;
      return box;
    }
    case 'horn': {
      const box = plainSwatch();
      box.dataset.kind = 'horn';
      return box;
    }
  }
}

function plainSwatch(): HTMLElement {
  return h('span', { class: 'garage__swatch', 'aria-hidden': 'true' });
}

/** A little drawing on a 26 px tile, sharp on high-density screens. */
function drawnSwatch(draw: (ctx: CanvasRenderingContext2D) => void): HTMLElement {
  const canvas = h('canvas', {
    class: 'garage__swatch garage__swatch--drawn',
    width: 52,
    height: 52,
    'aria-hidden': 'true',
  });
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(2, 2);
    draw(ctx);
  }
  return canvas;
}

const STILL_CAR = { lean: 0, daylight: 1, stuck: false, time: 0 };

const STILL_DONKEY = {
  coat: coatFor(3),
  facing: 1 as const,
  time: 0.4,
  seed: 3,
  startled: 0,
  dazed: false,
  hop: 0,
};

/** The car from behind, and a donkey in the chosen hat, on a patch of road. */
function drawPreview(canvas: HTMLCanvasElement, loadout: Loadout, theme: Theme) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const look = lookOf(loadout);
  const palette = paletteFor('home', theme);
  const { width, height } = canvas;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, palette.sky[1]);
  sky.addColorStop(1, palette.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.grass[0];
  ctx.fillRect(0, height * 0.62, width, height * 0.38);
  ctx.fillStyle = palette.asphalt;
  ctx.fillRect(0, height * 0.7, width, height * 0.22);

  ctx.save();
  ctx.translate(width * 0.34, height * 0.9);
  ctx.scale(72, 72);
  drawCarRear(ctx, { ...STILL_CAR, shape: look.shape, paint: look.paint });
  ctx.restore();

  ctx.save();
  ctx.translate(width * 0.74, height * 0.86);
  ctx.scale(66, 66);
  drawDonkey(ctx, { ...STILL_DONKEY, facing: -1, hat: look.hat });
  ctx.restore();
}
