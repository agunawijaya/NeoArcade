import { IDLE_CONTROLS, type Controls } from '../engine/world';

type ButtonId = 'fire' | 'bomb' | 'flip' | 'home' | 'missile' | 'starburst' | 'loadout';

const LABELS: Readonly<Record<ButtonId, string>> = {
  fire: 'Guns',
  bomb: 'Bomb',
  flip: 'Flip',
  home: 'Home',
  missile: 'Missile',
  starburst: 'Flare',
  loadout: 'Load',
};

/**
 * On-screen controls for touch screens (and mice): a stick under the left
 * thumb, up and down for the nose, left and right for the throttle, and
 * buttons under the right thumb. Guns fire while held; flip and home are
 * taps.
 */
export class TouchControls {
  readonly element: HTMLElement;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly buttons = new Map<ButtonId, HTMLButtonElement>();
  private readonly held = new Set<ButtonId>();
  private readonly tapped = new Set<ButtonId>();
  private stickPointer: number | null = null;
  private swapTapped = false;
  private pitch = 0;
  private throttle = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'touch';
    this.element.hidden = true;
    this.stick = document.createElement('div');
    this.stick.className = 'touch__stick';
    this.stick.setAttribute('aria-hidden', 'true');
    this.knob = document.createElement('div');
    this.knob.className = 'touch__knob';
    this.stick.append(this.knob);
    const pad = document.createElement('div');
    pad.className = 'touch__buttons';
    for (const id of Object.keys(LABELS) as ButtonId[]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `touch__button touch__button--${id}`;
      button.textContent = LABELS[id];
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.held.add(id);
        this.tapped.add(id);
        if (id === 'loadout') this.swapTapped = true;
      });
      const release = () => this.held.delete(id);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      this.buttons.set(id, button);
      pad.append(button);
    }
    this.element.append(this.stick, pad);
    this.stick.addEventListener('pointerdown', (event) => this.grab(event));
    this.stick.addEventListener('pointermove', (event) => this.drag(event));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      this.stick.addEventListener(type, (event) => this.letGo(event));
    this.setSecretWeapons(false);
    this.setLoadout(null);
  }

  setVisible(visible: boolean) {
    this.element.hidden = !visible;
    if (!visible) this.reset();
  }

  setSecretWeapons(enabled: boolean) {
    for (const id of ['missile', 'starburst'] as const) {
      const button = this.buttons.get(id);
      if (button) button.hidden = !enabled;
    }
  }

  /**
   * The swap between bombs and a torpedo, on a carrier's deck: shown with
   * what the next tap would load, or hidden away from the sea.
   */
  setLoadout(next: string | null) {
    const button = this.buttons.get('loadout');
    if (!button) return;
    button.hidden = next === null;
    if (next !== null && button.textContent !== next) button.textContent = next;
  }

  /** Whether the swap button was tapped since the last time this was asked. */
  takeSwap(): boolean {
    const swap = this.swapTapped;
    this.swapTapped = false;
    return swap;
  }

  /** What the thumbs are asking for this tick, or null when nothing is touched. */
  controls(): Controls | null {
    if (this.element.hidden) return null;
    const active = this.stickPointer !== null || this.held.size > 0 || this.tapped.size > 0;
    if (!active) return null;
    const asked: Controls = {
      ...IDLE_CONTROLS,
      pitch: this.pitch,
      throttle: this.throttle,
      fire: this.held.has('fire'),
      bomb: this.held.has('bomb') || this.tapped.has('bomb'),
      missile: this.tapped.has('missile'),
      starburst: this.tapped.has('starburst'),
      flip: this.tapped.has('flip'),
      home: this.tapped.has('home'),
    };
    this.tapped.clear();
    return asked;
  }

  private grab(event: PointerEvent) {
    event.preventDefault();
    this.stick.setPointerCapture(event.pointerId);
    this.stickPointer = event.pointerId;
    this.drag(event);
  }

  private drag(event: PointerEvent) {
    if (event.pointerId !== this.stickPointer) return;
    const box = this.stick.getBoundingClientRect();
    const radius = box.width / 2;
    const dx = (event.clientX - (box.left + radius)) / radius;
    const dy = (event.clientY - (box.top + radius)) / radius;
    const length = Math.max(1, Math.hypot(dx, dy));
    const x = dx / length;
    const y = dy / length;
    // A little dead zone in the middle, so a resting thumb flies straight.
    const shaped = (value: number) => (Math.abs(value) < 0.18 ? 0 : value);
    this.pitch = shaped(-y);
    this.throttle = shaped(x);
    this.knob.style.transform = `translate(${x * radius * 0.6}px, ${y * radius * 0.6}px)`;
  }

  private letGo(event: PointerEvent) {
    if (event.pointerId !== this.stickPointer) return;
    this.stickPointer = null;
    this.pitch = 0;
    this.throttle = 0;
    this.knob.style.transform = '';
  }

  private reset() {
    this.stickPointer = null;
    this.pitch = 0;
    this.throttle = 0;
    this.held.clear();
    this.tapped.clear();
    this.knob.style.transform = '';
  }
}
