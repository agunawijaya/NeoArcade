import { afterEach, describe, expect, it, vi } from 'vitest';
import { engineFingerprint } from './fingerprint';

describe('engineFingerprint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('comes out the same every time, without ever asking Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('The engine must not use Math.random.');
    });
    const first = engineFingerprint();
    expect(first).toMatch(/^[0-9a-f]{8}$/);
    expect(engineFingerprint()).toBe(first);
  });
});
