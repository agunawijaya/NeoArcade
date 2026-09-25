// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createInput, parseBinding, type Input } from './index';

type Action = 'left' | 'right' | 'fire';

interface FakePad {
  connected: boolean;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

function fakePad(): FakePad {
  return {
    connected: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
}

function press(code: string, target: EventTarget = window, repeat = false) {
  const event = new KeyboardEvent('keydown', { code, repeat, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function release(code: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

// jsdom has no PointerEvent, so build one from a MouseEvent with the extra fields.
function pointer(type: string, target: HTMLElement, x: number, y: number, extra = {}) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.assign(event, { pointerId: 1, isPrimary: true, pointerType: 'touch', ...extra });
  target.dispatchEvent(event);
}

describe('parseBinding', () => {
  it('understands every binding form', () => {
    expect(parseBinding('key:Space')).toEqual({ device: 'key', code: 'Space' });
    expect(parseBinding('pad:start')).toEqual({ device: 'pad-button', index: 9 });
    expect(parseBinding('pad:leftY-')).toEqual({ device: 'pad-axis', index: 1, direction: -1 });
    expect(parseBinding('pointer')).toEqual({ device: 'pointer' });
  });

  it('rejects typos loudly', () => {
    expect(() => parseBinding('pad:triangle')).toThrow(/pad:triangle/);
    expect(() => parseBinding('keyboard:A')).toThrow();
    expect(() => parseBinding('pad:leftZ+')).toThrow();
  });
});

describe('createInput', () => {
  let input: Input<Action> | undefined;
  let pads: FakePad[] = [];

  const setup = (pointerTarget?: HTMLElement) => {
    pads = [];
    input = createInput<Action>({
      bindings: {
        left: ['key:ArrowLeft', 'pad:left', 'pad:leftX-'],
        right: ['key:ArrowRight', 'pad:leftX+'],
        fire: ['key:Space', 'pad:a', 'pointer'],
      },
      pointerTarget,
      getGamepads: () => pads as unknown as Gamepad[],
    });
    return input;
  };

  afterEach(() => {
    input?.dispose();
    document.body.innerHTML = '';
  });

  it('reports held keys and press/release edges once', () => {
    const controls = setup();
    press('Space');
    controls.update();
    expect(controls.isDown('fire')).toBe(true);
    expect(controls.wasPressed('fire')).toBe(true);

    controls.update();
    expect(controls.isDown('fire')).toBe(true);
    expect(controls.wasPressed('fire')).toBe(false);

    release('Space');
    controls.update();
    expect(controls.wasReleased('fire')).toBe(true);
    expect(controls.isDown('fire')).toBe(false);
  });

  it('does not lose a tap that starts and ends between two updates', () => {
    const controls = setup();
    press('Space');
    release('Space');
    controls.update();
    expect(controls.wasPressed('fire')).toBe(true);
    expect(controls.isDown('fire')).toBe(false);
  });

  it('ignores auto-repeat keydowns as new presses', () => {
    const controls = setup();
    press('ArrowLeft');
    controls.update();
    press('ArrowLeft', window, true);
    controls.update();
    expect(controls.wasPressed('left')).toBe(false);
  });

  it('stops the page from scrolling on bound keys only', () => {
    setup();
    expect(press('ArrowLeft').defaultPrevented).toBe(true);
    expect(press('KeyQ').defaultPrevented).toBe(false);
  });

  it('leaves keys alone while the player types in a field', () => {
    const controls = setup();
    const field = document.createElement('input');
    document.body.append(field);
    const event = press('Space', field);
    controls.update();
    expect(event.defaultPrevented).toBe(false);
    expect(controls.isDown('fire')).toBe(false);
  });

  it('forgets held keys when the window loses focus', () => {
    const controls = setup();
    press('ArrowRight');
    window.dispatchEvent(new Event('blur'));
    controls.update();
    expect(controls.isDown('right')).toBe(false);
  });

  it('reads gamepad buttons and sticks with a rescaled deadzone', () => {
    const controls = setup();
    const pad = fakePad();
    pads.push(pad);

    pad.axes[0] = -0.1;
    controls.update();
    expect(controls.value('left')).toBe(0);
    expect(controls.gamepadConnected).toBe(true);

    pad.axes[0] = -1;
    controls.update();
    expect(controls.value('left')).toBe(1);
    expect(controls.axis('left', 'right')).toBe(-1);
    expect(controls.wasPressed('left')).toBe(true);
    expect(controls.lastDevice).toBe('gamepad');

    pad.axes[0] = 0.625;
    controls.update();
    expect(controls.axis('left', 'right')).toBeCloseTo(0.5);

    pad.buttons[0] = { pressed: true, value: 1 };
    controls.update();
    expect(controls.wasPressed('fire')).toBe(true);
  });

  it('ignores disconnected pads', () => {
    const controls = setup();
    const pad = fakePad();
    pad.connected = false;
    pad.buttons[0] = { pressed: true, value: 1 };
    pads.push(pad);
    controls.update();
    expect(controls.gamepadConnected).toBe(false);
    expect(controls.isDown('fire')).toBe(false);
  });

  it('tracks the primary pointer relative to its target', () => {
    const area = document.createElement('div');
    document.body.append(area);
    area.getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;
    const controls = setup(area);

    pointer('pointerdown', area, 130, 90);
    controls.update();
    expect(controls.pointer).toMatchObject({ x: 30, y: 40, isDown: true, wasPressed: true });
    expect(controls.isDown('fire')).toBe(true);
    expect(controls.lastDevice).toBe('pointer');

    pointer('pointermove', area, 160, 60);
    pointer('pointermove', area, 999, 999, { pointerId: 2 });
    controls.update();
    expect(controls.pointer).toMatchObject({ x: 60, y: 10, wasPressed: false });

    pointer('pointerup', area, 160, 60);
    controls.update();
    expect(controls.pointer.wasReleased).toBe(true);
    expect(controls.wasReleased('fire')).toBe(true);
  });

  it('can rebind an action at runtime', () => {
    const controls = setup();
    controls.rebind('fire', ['key:Enter']);
    press('Space');
    controls.update();
    expect(controls.isDown('fire')).toBe(false);
    expect(press('Enter').defaultPrevented).toBe(true);
    controls.update();
    expect(controls.isDown('fire')).toBe(true);
  });

  it('stops listening after dispose()', () => {
    const controls = setup();
    controls.dispose();
    press('Space');
    controls.update();
    expect(controls.isDown('fire')).toBe(false);
  });
});
