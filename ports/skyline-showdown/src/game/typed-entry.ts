import { MAX_INPUT } from '../engine/constants';

/**
 * Classic input, as the original's GetNum worked: type the angle, Enter,
 * type the velocity, Enter. Digits and one decimal point are accepted,
 * Backspace deletes, and a value over 360 is thrown away on Enter.
 */
export type TypedField = 'angle' | 'velocity';

export type TypedResult =
  { kind: 'typing' } | { kind: 'rejected' } | { kind: 'done'; angle: number; velocity: number };

const MAX_CHARACTERS = 6;

export class TypedEntry {
  field: TypedField = 'angle';
  text = '';
  angle: number | null = null;

  key(key: string): TypedResult {
    if (/^[0-9]$/.test(key)) {
      if (this.text.length >= MAX_CHARACTERS) return { kind: 'rejected' };
      this.text += key;
      return { kind: 'typing' };
    }
    if (key === '.' || key === ',') {
      if (this.text.includes('.') || this.text.length >= MAX_CHARACTERS)
        return { kind: 'rejected' };
      this.text += '.';
      return { kind: 'typing' };
    }
    if (key === 'Backspace') {
      this.text = this.text.slice(0, -1);
      return { kind: 'typing' };
    }
    if (key === 'Enter') return this.confirm();
    return { kind: 'rejected' };
  }

  reset() {
    this.field = 'angle';
    this.text = '';
    this.angle = null;
  }

  private confirm(): TypedResult {
    const value = Number.parseFloat(this.text || '0');
    if (!Number.isFinite(value) || value > MAX_INPUT) {
      this.text = '';
      return { kind: 'rejected' };
    }
    if (this.field === 'angle') {
      this.angle = value;
      this.field = 'velocity';
      this.text = '';
      return { kind: 'typing' };
    }
    const result = { kind: 'done' as const, angle: this.angle ?? 0, velocity: value };
    this.reset();
    return result;
  }
}
