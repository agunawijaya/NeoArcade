import { describe, expect, it } from 'vitest';
import { TypedEntry } from './typed-entry';

function typeKeys(entry: TypedEntry, keys: string[]) {
  return keys.map((key) => entry.key(key)).at(-1);
}

describe('TypedEntry', () => {
  it('asks for the angle, then the velocity, then throws', () => {
    const entry = new TypedEntry();
    typeKeys(entry, ['4', '5', 'Enter']);
    expect(entry.field).toBe('velocity');
    expect(typeKeys(entry, ['6', '2', 'Enter'])).toEqual({ kind: 'done', angle: 45, velocity: 62 });
    expect(entry.field).toBe('angle');
  });

  it('accepts one decimal point', () => {
    const entry = new TypedEntry();
    typeKeys(entry, ['4', '5', '.', '5']);
    expect(entry.key('.')).toEqual({ kind: 'rejected' });
    expect(entry.text).toBe('45.5');
  });

  it('throws away anything over 360 on Enter, as the original did', () => {
    const entry = new TypedEntry();
    expect(typeKeys(entry, ['4', '0', '0', 'Enter'])).toEqual({ kind: 'rejected' });
    expect(entry.text).toBe('');
    expect(entry.field).toBe('angle');
  });

  it('treats an empty entry as zero and supports backspace', () => {
    const entry = new TypedEntry();
    typeKeys(entry, ['9', 'Backspace', 'Enter']);
    expect(entry.angle).toBe(0);
  });

  it('beeps at anything that is not a number', () => {
    const entry = new TypedEntry();
    expect(entry.key('x')).toEqual({ kind: 'rejected' });
    expect(entry.key('-')).toEqual({ kind: 'rejected' });
  });
});
