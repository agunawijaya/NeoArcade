import { createInput, type Input } from '@shared/input';
import { CONDITIONS, FATIGUE } from '../engine/conditions';
import type { StopVisit } from '../engine/stop';
import { speedCap } from '../engine/rules';
import { stopMile } from '../engine/trip';
import type { Diner } from '../data/diners';
import type { CbMessage } from '../game/cb-radio';
import type { EventArt, EventCopy } from '../game/event-copy';
import { tripLayers } from '../game/map-layers';
import type { Beat } from '../game/playback';
import type { LegPlan, StopOffer, TripSession } from '../game/session';
import { placePoint } from '../map/projection';
import { CabView } from '../render/cab-view';
import { DioramaView } from '../render/diorama-view';
import { paintEventArt } from '../render/event-art';
import { MAP_PALETTES, paintMap, wholeCountry } from '../render/map-painter';
import { tripLine } from '../game/map-layers';
import { pointAtMile } from '../map/route-geometry';
import { Stage } from '../render/stage';
import { daylight } from '../render/sun';
import type { DriveView, Settings, Warp } from '../settings';
import { RHYTHM_NAMES, VIEW_NAMES, WARPS } from '../settings';
import type { Theme } from '../theme';
import { button, h, icon } from './dom';
import {
  distance,
  fuel as fuelText,
  money,
  speed as speedText,
  speedUnit,
  speedValue,
} from './format';
import { ICONS } from './icons';
import { MapCanvas } from './map-canvas';
import { RouteStrip } from './route-strip';

/**
 * The screen you drive on. It hosts the view (cab or side), the route strip,
 * the mini-map, the dashboard readings, the throttle and every interruption
 * the road brings, and implements the session's hooks for them. Flow-level
 * decisions (what a stop or an arrival leads to) belong to the app.
 */
export interface DriveScreenOptions {
  settings: () => Settings;
  theme: () => Theme;
  reducedMotion: () => boolean;
  saveSettings: (change: Partial<Settings>) => void;
  pause: () => void;
  openMap: () => void;
  openStop: (visit: StopVisit, diner: Diner, done: () => void) => void;
  sound: (name: DriveSound) => void;
}

export type DriveSound =
  `card:${EventArt}` | 'quick' | 'cb' | 'stop-offer' | 'passed' | 'horn' | 'detector';

type Action =
  'faster' | 'slower' | 'pause' | 'map' | 'view' | 'warp' | 'pull-in' | 'confirm' | 'horn' | 'log';

/**
 * Keys for driving. Enter and Space are left to the buttons, which press
 * themselves; a pad's A presses the card's button for it.
 */
const BINDINGS: Record<Action, readonly string[]> = {
  faster: ['key:ArrowUp', 'key:KeyW', 'pad:up', 'pad:rt'],
  slower: ['key:ArrowDown', 'key:KeyS', 'pad:down', 'pad:lt'],
  pause: ['key:Escape', 'key:KeyP', 'pad:start'],
  map: ['key:KeyM', 'pad:back'],
  view: ['key:KeyV', 'pad:y'],
  warp: ['key:KeyF', 'pad:rb'],
  'pull-in': ['key:KeyT', 'pad:x'],
  confirm: ['pad:a'],
  horn: ['key:KeyH'],
  log: ['key:KeyC', 'pad:lb'],
};

const UNBOUND: Record<Action, readonly string[]> = {
  faster: [],
  slower: [],
  pause: [],
  map: [],
  view: [],
  warp: [],
  'pull-in': [],
  confirm: [],
  horn: [],
  log: [],
};

export class DriveScreen {
  readonly element: HTMLElement;
  private readonly stageHost: HTMLElement;
  private readonly stage: Stage;
  private readonly diorama = new DioramaView();
  private readonly cab = new CabView();
  private readonly strip = new RouteStrip();
  private readonly mini: MapCanvas;
  private readonly atlas = document.createElement('canvas');
  private readonly hud: HTMLElement;
  private readonly hudSpeed: HTMLElement;
  private readonly hudSet: HTMLElement;
  private readonly hudFuel: HTMLMeterElement;
  private readonly hudFuelText: HTMLElement;
  private readonly hudClock: HTMLElement;
  private readonly hudOdo: HTMLElement;
  private readonly hudWeather: HTMLElement;
  private readonly hudFatigue: HTMLElement;
  private readonly hudLimit: HTMLElement;
  private readonly throttle: HTMLInputElement;
  private readonly throttleValue: HTMLElement;
  private readonly throttleBox: HTMLElement;
  private readonly warpButton: HTMLButtonElement;
  private readonly viewButton: HTMLButtonElement;
  private readonly cbBubble: HTMLElement;
  private readonly cbLog: HTMLElement;
  private readonly stopBanner: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly card: HTMLElement;
  private readonly legPanel: HTMLElement;
  private readonly askStop: HTMLElement;
  private readonly input: Input<Action>;
  private session: TripSession | null = null;
  private cardArt: { canvas: HTMLCanvasElement; art: EventCopy['art'] } | null = null;
  private cardDone: (() => void) | null = null;
  private legGo: ((speed: number) => void) | null = null;
  private cbHideAt = 0;
  private time = 0;
  private atlasAge = 0;
  private pulse: { mile: number; age: number } | null = null;
  private readonly held: Record<'faster' | 'slower', number> = { faster: 0, slower: 0 };

  constructor(private readonly options: DriveScreenOptions) {
    this.stageHost = h('div', { class: 'drive__stage' });
    this.stage = new Stage(this.stageHost);
    this.stage.surface.addEventListener('click', (event) => this.onStageClick(event));

    this.mini = new MapCanvas({
      className: 'minimap__canvas',
      interactive: false,
      label: 'Mini-map: where the rig is. Press M for the full map.',
      style: () => (options.theme() === 'light' ? 'paper' : 'night'),
      layers: () => this.mapLayers(),
      reducedMotion: options.reducedMotion,
      onPick: () => options.openMap(),
    });
    const minimap = h(
      'aside',
      { class: 'minimap' },
      this.mini.element,
      h('span', { class: 'minimap__hint' }, 'M · map'),
    );

    this.hudSpeed = h('span', { class: 'hud__value' }, '0');
    this.hudSet = h('span', { class: 'hud__set' });
    this.hudFuel = h('meter', {
      class: 'hud__meter',
      min: 0,
      max: 1,
      low: 0.15,
      high: 0.4,
      optimum: 0.9,
      value: 1,
    }) as HTMLMeterElement;
    this.hudFuelText = h('span', { class: 'hud__small' });
    this.hudClock = h('span', { class: 'hud__clock' });
    this.hudOdo = h('span', { class: 'hud__small' });
    this.hudWeather = h('span', { class: 'chip' });
    this.hudFatigue = h('span', { class: 'chip' });
    this.hudLimit = h('span', { class: 'hud__limit', 'aria-label': 'Speed limit' });
    this.hud = h(
      'div',
      { class: 'hud', 'aria-label': 'Dashboard' },
      h(
        'div',
        { class: 'hud__speed' },
        this.hudSpeed,
        h('span', { class: 'hud__unit' }),
        this.hudSet,
      ),
      this.hudLimit,
      h(
        'div',
        { class: 'hud__fuel' },
        h('span', { class: 'hud__label' }, 'Fuel'),
        this.hudFuel,
        this.hudFuelText,
      ),
      h('div', { class: 'hud__time' }, this.hudClock, this.hudOdo),
      h('div', { class: 'hud__status' }, this.hudWeather, this.hudFatigue),
    );

    this.throttle = h('input', {
      class: 'throttle__lever',
      type: 'range',
      min: 20,
      max: 82,
      step: 1,
      value: 55,
      'aria-label': 'Speed for the next hour',
      orient: 'vertical',
    }) as HTMLInputElement;
    this.throttle.addEventListener('input', () =>
      this.session?.setThrottle(Number(this.throttle.value)),
    );
    this.throttleValue = h('output', { class: 'throttle__value' });
    this.throttleBox = h(
      'div',
      { class: 'throttle' },
      h('span', { class: 'throttle__label' }, 'Speed'),
      button('+', () => this.nudge(1), 'button button--small throttle__nudge', {
        'aria-label': 'Faster (up arrow)',
      }),
      this.throttle,
      button('−', () => this.nudge(-1), 'button button--small throttle__nudge', {
        'aria-label': 'Slower (down arrow)',
      }),
      this.throttleValue,
    );

    this.warpButton = button('1×', () => this.cycleWarp(), 'button button--small', {
      title: 'Time warp (F)',
    });
    this.viewButton = button('', () => this.toggleView(), 'button button--small', {
      title: 'Switch view (V)',
    });
    const tools = h(
      'div',
      { class: 'drive__tools' },
      this.warpButton,
      this.viewButton,
      button(icon(ICONS.map), () => options.openMap(), 'button button--small button--icon', {
        'aria-label': 'Map (M)',
        title: 'Map (M)',
      }),
      button(icon(ICONS.radio), () => this.toggleLog(), 'button button--small button--icon', {
        'aria-label': 'CB log (C)',
        title: 'CB log (C)',
      }),
      button(icon(ICONS.pause), () => options.pause(), 'button button--small button--icon', {
        'aria-label': 'Pause (Esc)',
        title: 'Pause (Esc)',
      }),
    );

    this.cbBubble = h('div', { class: 'cb-bubble', 'aria-live': 'polite', hidden: true });
    this.cbLog = h('div', {
      class: 'cb-log panel',
      role: 'dialog',
      'aria-label': 'CB log',
      hidden: true,
    });
    this.stopBanner = h('div', { class: 'stop-banner', hidden: true });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.card = h('div', {
      class: 'event-card',
      role: 'dialog',
      'aria-modal': 'true',
      hidden: true,
    });
    this.legPanel = h('div', {
      class: 'leg-panel',
      role: 'dialog',
      'aria-label': 'Next leg',
      hidden: true,
    });
    this.askStop = h('div', {
      class: 'ask-stop',
      role: 'dialog',
      'aria-label': 'Truck stop',
      hidden: true,
    });

    this.element = h(
      'section',
      { class: 'drive', 'aria-label': 'On the road' },
      this.stageHost,
      this.strip.element,
      tools,
      minimap,
      this.hud,
      this.throttleBox,
      this.cbBubble,
      this.stopBanner,
      this.toasts,
      this.cbLog,
      this.legPanel,
      this.askStop,
      this.card,
    );

    this.input = createInput<Action>({ bindings: UNBOUND, keyboardTarget: window });
    this.atlas.width = 360;
    this.atlas.height = 260;
  }

  /** Listens for driving keys only while on the road, so menus keep their own keys. */
  setActive(active: boolean) {
    const table = active ? BINDINGS : UNBOUND;
    for (const action of Object.keys(table) as Action[]) this.input.rebind(action, table[action]);
  }

  attach(session: TripSession) {
    this.session = session;
    this.strip.attach(session.trip);
    this.mini.follow(
      placePoint(session.trip.route.from).x,
      placePoint(session.trip.route.from).y,
      3.2,
    );
    this.throttle.value = String(session.setSpeed);
    this.hideAll();
    this.refreshTools();
  }

  detach() {
    this.session = null;
    this.hideAll();
  }

  private hideAll() {
    this.card.hidden = true;
    this.legPanel.hidden = true;
    this.askStop.hidden = true;
    this.stopBanner.hidden = true;
    this.cbBubble.hidden = true;
    this.cbLog.hidden = true;
    this.toasts.replaceChildren();
    this.cardDone = null;
    this.legGo = null;
  }

  /** Called every frame while on the road. */
  frame(dt: number) {
    const session = this.session;
    if (!session) return;
    this.time += dt;
    this.handleInput();
    session.update(dt);
    const settings = this.options.settings();
    const scene = session.scene();
    this.stage.setNight(1 - daylight(scene.sunAltitude));
    this.element.dataset.view = settings.view;
    this.element.dataset.rhythm = settings.rhythm;
    if (settings.view === 'cab') {
      this.atlasAge += dt;
      if (this.atlasAge > 0.15) {
        this.atlasAge = 0;
        this.paintAtlas();
      }
      this.stage.paint((ctx, width, height) =>
        this.cab.draw(ctx, width, height, scene, this.atlas),
      );
    } else {
      this.stage.paint((ctx, width, height) => this.diorama.draw(ctx, width, height, scene));
      if (!this.mini.element.closest('[hidden]')) {
        const line = tripLine(session.trip);
        const at = pointAtMile(line, session.displayMile);
        this.mini.follow(at.x, at.y, 3.2);
        this.mini.draw(dt);
      }
    }
    if (this.pulse) {
      this.pulse.age += dt;
      if (this.pulse.age > 1.6) this.pulse = null;
    }
    if (this.cardArt && !this.card.hidden && !this.options.reducedMotion()) {
      const ctx = this.cardArt.canvas.getContext('2d');
      if (ctx)
        paintEventArt(
          ctx,
          this.cardArt.art,
          this.cardArt.canvas.width,
          this.cardArt.canvas.height,
          this.time,
        );
    }
    this.updateHud(scene.speed, settings);
    this.strip.update({
      mile: session.displayMile,
      hr: session.displayHr,
      setSpeed: session.setSpeed,
      units: settings.units,
      ahead: session.ahead(),
      stopAhead: !this.stopBanner.hidden,
      highlightTo: !this.legPanel.hidden ? session.trip.next : null,
    });
    if (this.cbHideAt > 0 && this.time > this.cbHideAt) {
      this.cbBubble.hidden = true;
      this.cbHideAt = 0;
    }
  }

  private mapLayers() {
    const session = this.session;
    if (!session) return {};
    return tripLayers(session.trip, {
      mile: session.displayMile,
      elapsed: session.trip.hr - session.trip.zoneShift,
      utc: null,
      withTrail: true,
      withMarkers: true,
      network: false,
      pulse: this.pulse,
      highlightTo: !this.legPanel.hidden ? stopMile(session.trip, session.trip.next) : null,
    });
  }

  /** The folded atlas on the dash: paper, the route, a pencil trail and a pin. */
  private paintAtlas() {
    const session = this.session;
    const ctx = this.atlas.getContext('2d');
    if (!session || !ctx) return;
    const line = tripLine(session.trip);
    const at = pointAtMile(line, session.displayMile);
    const base = wholeCountry(this.atlas.width, this.atlas.height).scale;
    paintMap(ctx, {
      width: this.atlas.width,
      height: this.atlas.height,
      pixelRatio: 1,
      camera: { x: at.x, y: at.y, scale: base * 3.4 },
      palette: MAP_PALETTES.atlas,
      layers: { ...this.mapLayers(), zoneBands: false, stateNames: true },
      time: this.time,
      reducedMotion: this.options.reducedMotion(),
    });
  }

  private updateHud(currentSpeed: number, settings: Settings) {
    const session = this.session;
    if (!session) return;
    const scene = session.scene();
    const { trip } = session;
    this.hudSpeed.textContent = String(speedValue(currentSpeed, settings.units));
    (this.hudSpeed.nextElementSibling as HTMLElement).textContent = speedUnit(settings.units);
    this.hudSet.textContent = `set ${speedText(session.setSpeed, settings.units)}`;
    this.hudFuel.value = Math.max(0, Math.min(1, trip.fuel / trip.rig.tankGallons));
    this.hudFuelText.textContent = fuelText(trip.fuel, settings.units);
    this.hudClock.textContent = scene.dash.clock;
    this.hudOdo.textContent = `${distance(session.displayMile, settings.units)} driven`;
    this.hudWeather.textContent = CONDITIONS[scene.condition].name;
    this.hudWeather.className = `chip ${CONDITIONS[scene.condition].risk >= 10 ? 'chip--bad' : CONDITIONS[scene.condition].risk >= 3 ? 'chip--warn' : 'chip--good'}`;
    const fatigue = FATIGUE[trip.fatigue];
    this.hudFatigue.textContent = fatigue.name;
    this.hudFatigue.className = `chip ${fatigue.severity >= 4 ? 'chip--bad' : fatigue.severity >= 2 ? 'chip--warn' : 'chip--good'}`;
    this.hudLimit.textContent = String(speedValue(trip.limit, settings.units));
    const cap = speedCap(trip.limit);
    this.throttle.max = String(cap);
    if (Number(this.throttle.value) !== session.setSpeed)
      this.throttle.value = String(session.setSpeed);
    this.throttleValue.textContent = speedText(session.setSpeed, settings.units);
    this.throttleBox.classList.toggle('is-over', session.setSpeed > trip.limit);
  }

  private handleInput() {
    this.input.update();
    const input = this.input;
    if (!this.card.hidden) {
      if (input.wasPressed('confirm')) this.closeCard();
      return;
    }
    if (!this.legPanel.hidden || !this.askStop.hidden) return;
    if (input.wasPressed('pause')) this.options.pause();
    if (input.wasPressed('map')) this.options.openMap();
    if (input.wasPressed('view')) this.toggleView();
    if (input.wasPressed('warp')) this.cycleWarp();
    if (input.wasPressed('log')) this.toggleLog();
    if (input.wasPressed('horn')) this.options.sound('horn');
    if (input.wasPressed('pull-in')) this.togglePullIn();
    this.repeat('faster', 1);
    this.repeat('slower', -1);
  }

  /** A tap moves the throttle one mile an hour; holding the key keeps moving it. */
  private repeat(action: 'faster' | 'slower', step: number) {
    if (this.input.wasPressed(action)) {
      this.nudge(step);
      this.held[action] = this.time + 0.35;
    } else if (this.input.isDown(action) && this.time >= this.held[action]) {
      this.nudge(step);
      this.held[action] = this.time + 0.07;
    }
  }

  private nudge(step: number) {
    const session = this.session;
    if (!session) return;
    session.setThrottle(session.setSpeed + step);
    this.throttle.value = String(session.setSpeed);
  }

  private cycleWarp() {
    const current = this.options.settings().warp;
    const next = WARPS[(WARPS.indexOf(current) + 1) % WARPS.length] as Warp;
    this.options.saveSettings({ warp: next });
    this.refreshTools();
  }

  private toggleView() {
    const next: DriveView = this.options.settings().view === 'cab' ? 'diorama' : 'cab';
    this.options.saveSettings({ view: next });
    this.refreshTools();
  }

  refreshTools() {
    const settings = this.options.settings();
    this.warpButton.textContent = `${settings.warp}×`;
    this.warpButton.hidden = settings.rhythm === 'legs';
    this.viewButton.textContent = settings.view === 'cab' ? VIEW_NAMES.diorama : VIEW_NAMES.cab;
    this.viewButton.setAttribute(
      'aria-label',
      `Switch to the ${settings.view === 'cab' ? 'side view' : 'cab view'} (V)`,
    );
    this.throttleBox.hidden = settings.rhythm === 'legs';
    this.element.dataset.rhythmName = RHYTHM_NAMES[settings.rhythm];
  }

  /** Clicking the atlas on the dash opens the full map. */
  private onStageClick(event: MouseEvent) {
    if (this.options.settings().view !== 'cab') return;
    const bounds = this.stage.surface.getBoundingClientRect();
    const layout = this.cab.layout(bounds.width, bounds.height);
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const { atlas } = layout;
    if (x >= atlas.x && x <= atlas.x + atlas.width && y >= atlas.y && y <= atlas.y + atlas.height)
      this.options.openMap();
  }

  // ——— Session hooks ———

  showCard(copy: EventCopy, beat: Beat, done: () => void) {
    this.options.sound(`card:${copy.art}`);
    const art = h('canvas', {
      class: 'event-card__art',
      width: 480,
      height: 270,
      'aria-hidden': 'true',
    }) as HTMLCanvasElement;
    const ctx = art.getContext('2d');
    if (ctx) paintEventArt(ctx, copy.art, 480, 270, this.time);
    this.cardArt = { canvas: art, art: copy.art };
    const continueButton = button(
      'Continue',
      () => this.closeCard(),
      'button button--primary event-card__go',
    );
    this.card.dataset.tone = copy.tone;
    this.card.replaceChildren(
      h(
        'div',
        { class: 'event-card__inner' },
        art,
        h(
          'div',
          { class: 'event-card__body' },
          h('h2', { class: 'event-card__title', id: 'event-card-title' }, copy.title),
          copy.quote ? h('p', { class: 'event-card__quote' }, copy.quote) : null,
          ...copy.lines.map((line) => h('p', { class: 'event-card__line' }, line)),
          copy.costs.length > 0
            ? h(
                'div',
                { class: 'event-card__costs' },
                ...copy.costs.map((cost) => h('span', { class: 'chip chip--bad' }, cost)),
              )
            : null,
          h(
            'p',
            { class: 'event-card__when muted' },
            `Mile ${Math.round(beat.event.mile).toLocaleString('en-US')}`,
          ),
          continueButton,
        ),
      ),
    );
    this.card.setAttribute('aria-labelledby', 'event-card-title');
    this.card.hidden = false;
    this.cardDone = done;
    continueButton.focus();
  }

  private closeCard() {
    if (this.card.hidden) return;
    this.card.hidden = true;
    this.cardArt = null;
    const done = this.cardDone;
    this.cardDone = null;
    this.stage.surface.focus?.();
    done?.();
  }

  quick(copy: EventCopy) {
    this.options.sound('quick');
    this.toast(
      h(
        'div',
        { class: `toast toast--${copy.tone}` },
        h('strong', {}, copy.title),
        copy.quote ? h('span', {}, copy.quote) : null,
        copy.costs.length > 0 ? h('span', { class: 'toast__cost' }, copy.costs.join(' · ')) : null,
      ),
    );
  }

  toast(content: HTMLElement, seconds = 3.2) {
    this.toasts.append(content);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    content.addEventListener('click', () => content.remove());
    window.setTimeout(() => content.classList.add('is-leaving'), seconds * 1000);
    window.setTimeout(() => content.remove(), seconds * 1000 + 400);
  }

  passed(mile: number) {
    this.pulse = { mile, age: 0 };
    this.options.sound('passed');
  }

  stopOffer(offer: StopOffer | null) {
    if (!offer) {
      this.stopBanner.hidden = true;
      return;
    }
    const settings = this.options.settings();
    if (settings.rhythm === 'legs') return;
    this.options.sound('stop-offer');
    this.renderStopBanner(offer, false);
    this.stopBanner.hidden = false;
  }

  private renderStopBanner(offer: StopOffer, pulling: boolean) {
    const toggle = button(
      pulling ? 'Keep driving' : 'Pull in (T)',
      () => this.togglePullIn(),
      pulling ? 'button button--small button--ghost' : 'button button--small button--warning',
    );
    this.stopBanner.replaceChildren(
      h('span', { class: 'stop-banner__sign' }, 'TRUCK STOP'),
      h(
        'span',
        { class: 'stop-banner__name' },
        pulling ? `Pulling in at ${offer.name}` : `${offer.name} · next exit`,
      ),
      h('span', { class: 'stop-banner__price' }, `Diesel ${money(offer.dieselCents)}`),
      toggle,
    );
    this.stopBanner.dataset.offer = JSON.stringify(offer);
    this.stopBanner.classList.toggle('is-pulling', pulling);
  }

  private togglePullIn() {
    const session = this.session;
    if (!session || this.stopBanner.hidden) return;
    const offer = JSON.parse(this.stopBanner.dataset.offer ?? '{}') as StopOffer;
    const pulling = !session.stopPending;
    session.pullIn(pulling);
    this.renderStopBanner(offer, pulling);
  }

  ask(offer: StopOffer, answer: (pullIn: boolean) => void) {
    this.options.sound('stop-offer');
    const reply = (pullIn: boolean) => {
      this.askStop.hidden = true;
      answer(pullIn);
    };
    const yes = button('Pull in', () => reply(true), 'button button--primary');
    this.askStop.replaceChildren(
      h(
        'div',
        { class: 'ask-stop__inner panel' },
        h(
          'p',
          { class: 'sign sign--small' },
          h('span', { class: 'sign__small' }, 'Truck stop ahead'),
          offer.name,
        ),
        h('p', {}, `Diesel ${money(offer.dieselCents)} a gallon. Coffee, a bunk, a hot meal.`),
        offer.reasons.length > 0
          ? h(
              'ul',
              { class: 'ask-stop__reasons' },
              ...offer.reasons.map((reason) => h('li', {}, reason)),
            )
          : null,
        h(
          'p',
          { class: 'muted' },
          'Do you want to stop? Passing it up keeps you awake an hour longer, as it did in the original.',
        ),
        h(
          'div',
          { class: 'row' },
          yes,
          button('Keep driving', () => reply(false), 'button'),
        ),
      ),
    );
    this.askStop.hidden = false;
    yes.focus();
  }

  plan(plan: LegPlan, go: (speed: number) => void) {
    const session = this.session;
    if (!session) return;
    const settings = this.options.settings();
    this.legGo = go;
    const slider = h('input', {
      class: 'slider',
      type: 'range',
      min: 20,
      max: plan.cap,
      step: 1,
      value: Math.min(plan.cap, plan.suggested),
      'aria-label': 'Speed for this leg',
    }) as HTMLInputElement;
    const readout = h('output', { class: 'leg-panel__speed' });
    const estimate = h('p', { class: 'leg-panel__estimate muted' });
    const update = () => {
      const mph = Number(slider.value);
      readout.textContent = speedText(mph, settings.units);
      const hours = plan.miles / Math.max(20, mph);
      const gallons =
        hours *
        (mph /
          Math.max(
            2,
            4.5 - 0.2 * Math.min(12.5, Math.abs(55 - mph) > 12 ? 12.5 : Math.abs(55 - mph)),
          ));
      estimate.textContent = `About ${hours < 1 ? 'under an hour' : `${hours.toFixed(1)} h`}, ${fuelText(gallons, settings.units)} of diesel (${fuelText(session.trip.fuel, settings.units)} aboard).`;
      readout.dataset.over = String(mph > plan.limit);
    };
    slider.addEventListener('input', update);
    update();
    const drive = button(
      'Drive this leg',
      () => this.submitLeg(Number(slider.value)),
      'button button--primary',
    );
    const presets = h(
      'div',
      { class: 'row' },
      ...[45, 55, 60, 65]
        .filter((mph) => mph <= plan.cap)
        .map((mph) =>
          button(
            speedText(mph, settings.units),
            () => {
              slider.value = String(mph);
              update();
            },
            'button button--small',
          ),
        ),
    );
    this.legPanel.replaceChildren(
      h(
        'div',
        { class: 'leg-panel__inner panel' },
        h(
          'div',
          { class: 'leg-panel__head' },
          h(
            'p',
            { class: 'sign' },
            h(
              'span',
              { class: 'sign__small' },
              `${distance(plan.miles, settings.units)} on ${plan.road}`,
            ),
            plan.to.name,
          ),
          h(
            'div',
            { class: 'leg-panel__chips' },
            h('span', { class: 'chip' }, CONDITIONS[plan.condition].name),
            h('span', { class: 'chip' }, `Feeling ${FATIGUE[plan.fatigue].name.toLowerCase()}`),
            h('span', { class: 'chip' }, `Limit ${speedText(plan.limit, settings.units)}`),
            plan.stopIn > 0
              ? h('span', { class: 'chip' }, `Truck stop in ${plan.stopIn} h`)
              : h('span', { class: 'chip chip--good' }, 'Truck stop at the next exit'),
          ),
        ),
        plan.ahead.length > 0
          ? h('ul', { class: 'leg-panel__ahead' }, ...plan.ahead.map((line) => h('li', {}, line)))
          : h('p', { class: 'muted' }, `Nothing on the books at ${plan.to.name}.`),
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Speed'), slider),
        h('div', { class: 'row' }, readout, h('span', { class: 'spacer' }), presets),
        estimate,
        drive,
      ),
    );
    this.legPanel.hidden = false;
    drive.focus();
  }

  private submitLeg(speed: number) {
    const go = this.legGo;
    if (!go) return;
    this.legGo = null;
    this.legPanel.hidden = true;
    go(speed);
  }

  cb(message: CbMessage) {
    this.options.sound('cb');
    this.cbBubble.replaceChildren(
      h('span', { class: 'cb-bubble__handle' }, message.speaker.handle),
      h('span', { class: 'cb-bubble__text' }, message.text),
    );
    this.cbBubble.hidden = false;
    this.cbHideAt = this.time + 6;
    if (!this.cbLog.hidden) this.renderLog();
  }

  private toggleLog() {
    this.cbLog.hidden = !this.cbLog.hidden;
    if (!this.cbLog.hidden) this.renderLog();
  }

  private renderLog() {
    const session = this.session;
    if (!session) return;
    const radio = session.radio;
    const entries = [...radio.log].reverse().slice(0, 12);
    this.cbLog.replaceChildren(
      h(
        'div',
        { class: 'row' },
        h('h2', { class: 'panel__title' }, 'Channel 19'),
        h('span', { class: 'spacer' }),
        button('Close', () => this.toggleLog(), 'button button--small'),
      ),
      entries.length === 0
        ? h('p', { class: 'muted' }, 'Quiet on the air so far.')
        : h(
            'ol',
            { class: 'cb-log__list' },
            ...entries.map((entry) => {
              const track = radio.trackOf(entry.speaker.handle);
              const verdict = entry.tip?.checked
                ? entry.tip.claim === entry.tip.truth ||
                  (entry.tip.kind === 'diesel' && entry.tip.truth)
                  ? '✓ right'
                  : '✗ wrong'
                : entry.tip
                  ? 'not checked yet'
                  : '';
              return h(
                'li',
                {},
                h('strong', {}, entry.speaker.handle),
                h('span', {}, ` ${entry.text}`),
                h(
                  'span',
                  { class: 'cb-log__track muted' },
                  ` ${verdict}${track.right + track.wrong > 0 ? ` · ${track.right} of ${track.right + track.wrong} tips right` : ''}`,
                ),
              );
            }),
          ),
    );
  }

  openStop(visit: StopVisit, diner: Diner, done: () => void) {
    this.stopBanner.hidden = true;
    this.options.openStop(visit, diner, done);
  }
}
