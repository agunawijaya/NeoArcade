import type { MapLayers } from '../render/map-painter';
import type { Theme } from '../theme';
import { button, h, icon } from './dom';
import { ICONS } from './icons';
import { MapCanvas } from './map-canvas';

/**
 * The full map over the paused trip: the route, the trail so far coloured
 * by speed, every stop, ticket, blowout and storm along it, the weather
 * systems drifting and the night side of the country. M, a tap on the
 * mini-map or the atlas, or a pad's Back opens it; the same closes it.
 */
export interface MapOverlayOptions {
  theme: () => Theme;
  reducedMotion: () => boolean;
  close: () => void;
}

const LEGEND: readonly [string, string][] = [
  ['trail-slow', 'Under 50 mph'],
  ['trail-steady', '50–62 mph'],
  ['trail-fast', 'Over 62 mph'],
  ['S', 'Truck stop'],
  ['Z', 'Slept'],
  ['!', 'Ticket'],
  ['T', 'Blowout'],
  ['*', 'Fog or blizzard'],
  ['$', 'Toll'],
  ['W', 'Scale'],
];

export class MapOverlay {
  readonly element: HTMLElement;
  private readonly map: MapCanvas;
  private layers: () => MapLayers = () => ({});
  private readonly caption: HTMLElement;

  constructor(options: MapOverlayOptions) {
    this.map = new MapCanvas({
      className: 'map-overlay__canvas',
      interactive: true,
      label: 'The full map. Arrow keys pan, plus and minus zoom.',
      style: () => (options.theme() === 'light' ? 'paper' : 'night'),
      layers: () => this.layers(),
      reducedMotion: options.reducedMotion,
    });
    this.caption = h('p', { class: 'map-overlay__caption' });
    this.element = h(
      'div',
      {
        class: 'map-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Map',
        hidden: true,
      },
      this.map.element,
      h(
        'div',
        { class: 'map-overlay__bar' },
        this.caption,
        h('span', { class: 'spacer' }),
        button('+', () => this.map.zoomBy(1.3), 'button button--small button--icon', {
          'aria-label': 'Zoom in',
        }),
        button('−', () => this.map.zoomBy(1 / 1.3), 'button button--small button--icon', {
          'aria-label': 'Zoom out',
        }),
        button(icon(ICONS.close), () => options.close(), 'button button--small button--icon', {
          'aria-label': 'Close the map (M)',
        }),
      ),
      h(
        'ul',
        { class: 'map-overlay__legend' },
        ...LEGEND.map(([key, label]) =>
          h(
            'li',
            { 'data-key': key },
            h('span', { class: 'map-overlay__key' }, key.startsWith('trail') ? '' : key),
            label,
          ),
        ),
      ),
    );
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.key === 'm' || event.key === 'M') {
        event.preventDefault();
        event.stopPropagation();
        options.close();
      }
    });
  }

  open(
    caption: string,
    layers: () => MapLayers,
    focus?: { minX: number; minY: number; maxX: number; maxY: number },
  ) {
    this.layers = layers;
    this.caption.textContent = caption;
    this.element.hidden = false;
    requestAnimationFrame(() => {
      this.map.frame(focus, 64);
      this.map.element.focus();
    });
  }

  close() {
    this.element.hidden = true;
  }

  frame(dt: number) {
    if (!this.element.hidden) this.map.draw(dt);
  }
}
