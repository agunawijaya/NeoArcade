import type { RegionId } from '../data/regions';
import { DioramaView } from '../render/diorama-view';
import { RIG_PAINTS, type RigPaint } from '../render/rig';
import type { DriveScene } from '../render/scene';
import { button, h, icon } from './dom';
import { ICONS } from './icons';

/**
 * The title: a rig rolling through the day across changing country behind
 * the menu, and on first arrival a nod to the original, a green box on a black
 * screen, before the sign lights up.
 */
export type MenuChoice = 'single' | 'career' | 'daily' | 'album' | 'settings';

export interface TitleScreenOptions {
  choose: (choice: MenuChoice) => void;
  toggleTheme: () => void;
  howToPlay: string;
  reducedMotion: () => boolean;
  paint: () => RigPaint;
}

const DEMO_REGIONS: readonly RegionId[] = [
  'mojave',
  'mesas',
  'high-plains',
  'panhandle',
  'farmland',
  'appalachian',
  'turnpike',
  'manhattan',
];
const DEMO_SECONDS_PER_REGION = 14;

export class TitleScreen {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly view = new DioramaView();
  private readonly statuses = new Map<MenuChoice, HTMLElement>();
  private readonly themeButton: HTMLButtonElement;
  private readonly intro: HTMLElement;
  // The demo day starts mid-morning, in the mesas.
  private time = DEMO_SECONDS_PER_REGION * 1.5;
  private scroll = 0;
  private introLeft = 0;

  constructor(private readonly options: TitleScreenOptions) {
    this.canvas = h('canvas', {
      class: 'title__backdrop',
      'aria-hidden': 'true',
    }) as HTMLCanvasElement;
    const entry = (choice: MenuChoice, label: string, hint: string, primary = false) => {
      const status = h('span', { class: 'title__status' }, hint);
      this.statuses.set(choice, status);
      return button(
        h('span', { class: 'title__label' }, label),
        () => options.choose(choice),
        `title__item${primary ? ' title__item--primary' : ''}`,
        { 'data-choice': choice },
        status,
      );
    };
    this.themeButton = button(
      icon(ICONS.sun),
      () => options.toggleTheme(),
      'button button--small button--icon title__theme',
      { 'aria-label': 'Switch between day and night' },
    );
    this.intro = h(
      'div',
      { class: 'title__intro', 'aria-hidden': 'true' },
      h(
        'pre',
        { class: 'title__crt' },
        [
          '╔═══════════════════════════╗',
          '║                           ║',
          '║   T  R  U  C  K  E  R     ║',
          '║                           ║',
          '╚═══════════════════════════╝',
          '',
          '      by Hughes Glantzberg',
        ].join('\n'),
      ),
    );
    this.element = h(
      'section',
      { class: 'title', 'aria-label': 'Long Haul' },
      this.canvas,
      h(
        'div',
        { class: 'title__panel' },
        h(
          'h1',
          { class: 'title__logo' },
          h('span', { class: 'title__shield', 'aria-hidden': 'true' }, '40'),
          h(
            'span',
            { class: 'title__words' },
            h('span', { class: 'title__long' }, 'LONG'),
            h('span', { class: 'title__haul' }, 'HAUL'),
          ),
          h('span', { class: 'title__arrow', 'aria-hidden': 'true' }, 'New York 2,850 →'),
        ),
        h(
          'p',
          { class: 'title__tagline' },
          'Cargo, tyres, route, speed, sleep and fuel: every mile is money against time.',
        ),
        h(
          'nav',
          { class: 'title__menu', 'aria-label': 'Modes' },
          entry('single', 'Single Haul', 'Los Angeles to New York, the original run', true),
          entry('career', 'Career', 'Your own rig, the whole country'),
          entry('daily', 'Daily Haul', 'One load a day, the same for everyone'),
          entry('album', 'Postcards', 'Places you have passed'),
          entry('settings', 'Settings', 'Rhythm, view, units, difficulty'),
        ),
        h(
          'div',
          { class: 'title__footer' },
          h(
            'a',
            { class: 'button button--small button--ghost', href: options.howToPlay },
            'How to play',
          ),
          this.themeButton,
        ),
        h('p', { class: 'title__credit' }, 'Inspired by Trucker by Hughes Glantzberg.'),
      ),
      this.intro,
    );
    this.intro.addEventListener('click', () => this.skipIntro());
  }

  setStatus(choice: MenuChoice, text: string, flag?: string) {
    const status = this.statuses.get(choice);
    if (!status) return;
    status.replaceChildren(text, flag ? h('span', { class: 'title__flag' }, flag) : '');
  }

  showTheme(theme: 'light' | 'dark') {
    this.themeButton.replaceChildren(icon(theme === 'light' ? ICONS.moon : ICONS.sun));
  }

  /** The original's green box, for a couple of seconds, on first arrival. */
  playIntro() {
    if (this.options.reducedMotion()) return;
    this.introLeft = 2.6;
    this.intro.classList.add('is-on');
    const skip = () => this.skipIntro();
    window.addEventListener('keydown', skip, { once: true });
  }

  private skipIntro() {
    this.introLeft = 0;
    this.intro.classList.remove('is-on');
  }

  focusFirst() {
    this.element.querySelector<HTMLButtonElement>('.title__item')?.focus();
  }

  frame(dt: number) {
    if (this.element.hidden) return;
    const reduced = this.options.reducedMotion();
    if (this.introLeft > 0) {
      this.introLeft -= dt;
      if (this.introLeft <= 0) this.skipIntro();
    }
    if (!reduced) {
      this.time += dt;
      this.scroll += dt * 340;
    }
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    if (
      this.canvas.width !== Math.round(width * ratio) ||
      this.canvas.height !== Math.round(height * ratio)
    ) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.view.draw(ctx, width, height, this.scene());
  }

  /** A slow day: dawn in the desert, noon on the plains, dusk on the Turnpike, night in Manhattan. */
  private scene(): DriveScene {
    const phase = this.time / DEMO_SECONDS_PER_REGION;
    const index = Math.floor(phase) % DEMO_REGIONS.length;
    const region = DEMO_REGIONS[index] ?? 'mojave';
    const previousRegion =
      DEMO_REGIONS[(index + DEMO_REGIONS.length - 1) % DEMO_REGIONS.length] ?? 'mojave';
    const dayClock = (this.time / (DEMO_SECONDS_PER_REGION * DEMO_REGIONS.length)) % 1;
    const altitude = this.options.reducedMotion()
      ? 18
      : Math.sin((dayClock * 1.15 - 0.05) * Math.PI * 2) * 48;
    return {
      time: this.time,
      scroll: this.scroll,
      speed: 55,
      region,
      previousRegion,
      regionBlend: Math.min(1, (phase % 1) * 5),
      season: 'autumn',
      snow: false,
      condition: 'clear',
      sunAltitude: altitude,
      sunArc: Math.max(0, Math.min(1, dayClock * 1.6)),
      fatigue: 0,
      cargo: 'oranges',
      paint: this.options.paint() ?? RIG_PAINTS.classic,
      landmarks: [],
      city: region === 'manhattan' ? 1 : 0,
      police: false,
      braking: false,
      stopped: false,
      reducedMotion: this.options.reducedMotion(),
      dash: {
        fuel: 190,
        tank: 200,
        odometer: 0,
        clock: '',
        minutes: 0,
        cbChannel: 19,
        cbLine: '',
        cbSpeaker: '',
        units: 'mi',
        setSpeed: 55,
        limit: 55,
        detector: 'off',
      },
    };
  }
}
