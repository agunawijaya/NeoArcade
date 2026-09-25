// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BLOOM, DEFAULT_CRT, resolveOptions, scanlineCount } from './options';
import { createPostFx } from './index';

describe('resolveOptions', () => {
  it('starts with every effect off', () => {
    const options = resolveOptions({});
    expect(options.bloom).toBe(false);
    expect(options.crt).toBe(false);
    expect(options.vignette).toBe(0);
    expect(options.grade.saturation).toBe(1);
  });

  it('switches an effect on with defaults from an empty object', () => {
    const options = resolveOptions({ bloom: {}, crt: { curvature: 0 } });
    expect(options.bloom).toEqual(DEFAULT_BLOOM);
    expect(options.crt).toEqual({ ...DEFAULT_CRT, curvature: 0 });
  });

  it('keeps unmentioned effects when updating', () => {
    const first = resolveOptions({ bloom: { strength: 1.4 }, vignette: 0.5 });
    const second = resolveOptions({ crt: {} }, first);
    expect(second.bloom).toEqual({ ...DEFAULT_BLOOM, strength: 1.4 });
    expect(second.vignette).toBe(0.5);
    expect(resolveOptions({ bloom: false }, second).bloom).toBe(false);
  });

  it('tweaks an effect without resetting its other values', () => {
    const first = resolveOptions({ bloom: { strength: 1.4 } });
    expect(resolveOptions({ bloom: { radius: 3 } }, first).bloom).toMatchObject({
      strength: 1.4,
      radius: 3,
    });
  });

  it('clamps the vignette and merges grading', () => {
    const options = resolveOptions({ vignette: 3, grade: { saturation: 1.2 } });
    expect(options.vignette).toBe(1);
    expect(options.grade).toMatchObject({ saturation: 1.2, contrast: 1 });
  });
});

describe('scanlineCount', () => {
  it('follows a low-resolution game row for row', () => {
    expect(scanlineCount(350, 1400)).toBe(350);
  });

  it('never gets denser than one line per three pixels', () => {
    expect(scanlineCount(1800, 900)).toBe(300);
  });
});

describe('createPostFx without WebGL', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeContext2d() {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createPattern: vi.fn(() => ({})),
      globalAlpha: 1,
      fillStyle: '',
    };
  }

  it('falls back to painting over the scene canvas', () => {
    const scene = document.createElement('canvas');
    scene.width = 320;
    scene.height = 200;
    const context = fakeContext2d();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      type: string,
    ) {
      return (type === '2d' && this === scene ? context : null) as never;
    });

    const fx = createPostFx(scene, { vignette: 0.5, crt: {}, bloom: {} });
    expect(fx.accelerated).toBe(false);
    expect(fx.canvas).toBe(scene);

    fx.render();
    expect(context.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(context.fillRect).toHaveBeenCalledTimes(2);

    fx.render();
    expect(context.createRadialGradient).toHaveBeenCalledTimes(1);

    fx.update({ crt: false, vignette: 0 });
    context.fillRect.mockClear();
    fx.render();
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it('can be told to skip WebGL', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const fx = createPostFx(document.createElement('canvas'), {}, { forceFallback: true });
    expect(fx.accelerated).toBe(false);
    expect(getContext).not.toHaveBeenCalledWith('webgl', expect.anything());
    expect(() => fx.render()).not.toThrow();
  });
});
