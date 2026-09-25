/**
 * Bindings are short strings so a game can list them in a settings table:
 *
 *   key:ArrowLeft   a key, by KeyboardEvent.code (layout-independent)
 *   pad:a           a gamepad button, by its name in the standard mapping
 *   pad:leftX-      one direction of a gamepad stick
 *   pointer         the primary mouse button, finger or pen on the play area
 */
export type Binding =
  | { device: 'key'; code: string }
  | { device: 'pad-button'; index: number }
  | { device: 'pad-axis'; index: number; direction: 1 | -1 }
  | { device: 'pointer' };

/** Button indices of the W3C "standard" gamepad layout. */
export const PAD_BUTTONS = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  back: 8,
  start: 9,
  ls: 10,
  rs: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  home: 16,
} as const;

export const PAD_AXES = { leftX: 0, leftY: 1, rightX: 2, rightY: 3 } as const;

export type PadButtonName = keyof typeof PAD_BUTTONS;
export type PadAxisName = keyof typeof PAD_AXES;

export function parseBinding(text: string): Binding {
  if (text === 'pointer') return { device: 'pointer' };

  const [device, name = ''] = text.split(':', 2);
  if (device === 'key' && name) return { device: 'key', code: name };

  if (device === 'pad') {
    if (name in PAD_BUTTONS) {
      return { device: 'pad-button', index: PAD_BUTTONS[name as PadButtonName] };
    }
    const axis = name.slice(0, -1);
    const sign = name.slice(-1);
    if (axis in PAD_AXES && (sign === '+' || sign === '-')) {
      return {
        device: 'pad-axis',
        index: PAD_AXES[axis as PadAxisName],
        direction: sign === '+' ? 1 : -1,
      };
    }
  }

  throw new Error(`Unknown input binding "${text}".`);
}
