import { resolveOptions, scanlineCount, type PostFxOptions, type PostFxSettings } from './options';
import {
  BLUR_FRAGMENT,
  BRIGHT_PASS_FRAGMENT,
  COMPOSITE_FRAGMENT,
  FULLSCREEN_VERTEX,
} from './shaders';

export { DEFAULT_BLOOM, DEFAULT_CRT, DEFAULT_GRADE, resolveOptions } from './options';
export type {
  BloomOptions,
  CrtOptions,
  GradeOptions,
  PostFxOptions,
  PostFxSettings,
} from './options';

/**
 * Optional post-processing for Canvas games: bloom, colour grading, vignette
 * and a CRT look. The game keeps drawing into its own canvas; this reads it
 * each frame and presents the result on `canvas`.
 *
 *   const fx = createPostFx(scene, { bloom: {}, vignette: 0.4 });
 *   stage.append(fx.canvas);
 *   // every frame, after drawing the scene:
 *   fx.render();
 *
 * Without WebGL, `canvas` is the scene canvas itself and only a vignette and
 * scanlines are painted over it, so the game looks plainer but still works.
 */
export interface PostFx {
  /** The canvas to put on screen. */
  readonly canvas: HTMLCanvasElement;
  /** False when running the plain Canvas 2D fallback. */
  readonly accelerated: boolean;
  readonly options: Readonly<PostFxOptions>;
  render(): void;
  update(settings: PostFxSettings): void;
  dispose(): void;
}

export interface PostFxEnvironment {
  /** Skips WebGL entirely, e.g. for a "low effects" setting. */
  forceFallback?: boolean;
}

export function createPostFx(
  source: HTMLCanvasElement,
  settings: PostFxSettings = {},
  { forceFallback = false }: PostFxEnvironment = {},
): PostFx {
  const options = resolveOptions(settings);
  if (!forceFallback) {
    const output = document.createElement('canvas');
    const gl = output.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
    });
    if (gl) {
      try {
        return createWebGlFx(source, output, gl, options);
      } catch (error) {
        console.warn('Post-processing is unavailable; drawing without it.', error);
      }
    }
  }
  return createFallbackFx(source, options);
}

function createFallbackFx(source: HTMLCanvasElement, initialOptions: PostFxOptions): PostFx {
  let options = initialOptions;
  const context = source.getContext('2d');
  let vignette: { width: number; height: number; fill: CanvasGradient } | null = null;
  let scanlinePattern: CanvasPattern | null = null;

  const vignetteFill = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (vignette?.width !== width || vignette.height !== height) {
      const radius = Math.hypot(width, height) / 2;
      const fill = ctx.createRadialGradient(
        width / 2,
        height / 2,
        radius * 0.35,
        width / 2,
        height / 2,
        radius,
      );
      fill.addColorStop(0, 'rgba(0, 0, 0, 0)');
      fill.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
      vignette = { width, height, fill };
    }
    return vignette.fill;
  };

  const scanlineFill = (ctx: CanvasRenderingContext2D) => {
    if (!scanlinePattern) {
      const tile = document.createElement('canvas');
      tile.width = 1;
      tile.height = 3;
      const tileContext = tile.getContext('2d');
      if (tileContext) {
        tileContext.fillStyle = '#000';
        tileContext.fillRect(0, 2, 1, 1);
      }
      scanlinePattern = ctx.createPattern(tile, 'repeat');
    }
    return scanlinePattern;
  };

  return {
    canvas: source,
    accelerated: false,
    get options() {
      return options;
    },
    render() {
      if (!context) return;
      const { width, height } = source;
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      if (options.vignette > 0) {
        context.globalAlpha = options.vignette;
        context.fillStyle = vignetteFill(context, width, height);
        context.fillRect(0, 0, width, height);
      }
      const pattern = options.crt && options.crt.scanlines > 0 ? scanlineFill(context) : null;
      if (options.crt && pattern) {
        context.globalAlpha = options.crt.scanlines * 0.6;
        context.fillStyle = pattern;
        context.fillRect(0, 0, width, height);
      }
      context.restore();
    },
    update(settings) {
      options = resolveOptions(settings, options);
    },
    dispose() {
      vignette = null;
      scanlinePattern = null;
    },
  };
}

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
  position: number;
}

interface RenderTarget {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

interface Resources {
  bright: Program;
  blur: Program;
  composite: Program;
  triangle: WebGLBuffer;
  scene: WebGLTexture;
  noGlow: WebGLTexture;
  targets: [RenderTarget, RenderTarget] | null;
}

function createWebGlFx(
  source: HTMLCanvasElement,
  output: HTMLCanvasElement,
  gl: WebGLRenderingContext,
  initialOptions: PostFxOptions,
): PostFx {
  let options = initialOptions;
  let resources: Resources | null = buildResources(gl);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    resources = null;
  };
  const onContextRestored = () => {
    resources = buildResources(gl);
  };
  output.addEventListener('webglcontextlost', onContextLost);
  output.addEventListener('webglcontextrestored', onContextRestored);

  const glowTargets = (res: Resources): [RenderTarget, RenderTarget] => {
    // The glow is blurry anyway, so it is computed at half resolution.
    const width = Math.max(1, Math.floor(output.width / 2));
    const height = Math.max(1, Math.floor(output.height / 2));
    if (res.targets && res.targets[0].width === width && res.targets[0].height === height) {
      return res.targets;
    }
    res.targets?.forEach((target) => deleteTarget(gl, target));
    res.targets = [createTarget(gl, width, height), createTarget(gl, width, height)];
    return res.targets;
  };

  const drawPass = (
    res: Resources,
    program: Program,
    target: RenderTarget | null,
    setUniforms: (uniform: (name: string) => WebGLUniformLocation | null) => void,
  ) => {
    gl.useProgram(program.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
    gl.viewport(0, 0, target?.width ?? output.width, target?.height ?? output.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, res.triangle);
    gl.enableVertexAttribArray(program.position);
    gl.vertexAttribPointer(program.position, 2, gl.FLOAT, false, 0, 0);
    setUniforms((name) => uniformOf(gl, program, name));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const bindTexture = (unit: number, texture: WebGLTexture) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };

  const renderGlow = (res: Resources): WebGLTexture => {
    const { bloom } = options;
    if (!bloom || bloom.strength <= 0) return res.noGlow;
    const [first, second] = glowTargets(res);

    bindTexture(0, res.scene);
    drawPass(res, res.bright, first, (uniform) => {
      gl.uniform1i(uniform('source'), 0);
      gl.uniform1f(uniform('threshold'), bloom.threshold);
    });
    // Two rounds of blur, the second wider, give a soft core with a long tail.
    for (const spread of [bloom.radius, bloom.radius * 2]) {
      bindTexture(0, first.texture);
      drawPass(res, res.blur, second, (uniform) => {
        gl.uniform1i(uniform('source'), 0);
        gl.uniform2f(uniform('direction'), spread / first.width, 0);
      });
      bindTexture(0, second.texture);
      drawPass(res, res.blur, first, (uniform) => {
        gl.uniform1i(uniform('source'), 0);
        gl.uniform2f(uniform('direction'), 0, spread / first.height);
      });
    }
    return first.texture;
  };

  return {
    canvas: output,
    accelerated: true,
    get options() {
      return options;
    },
    render() {
      const res = resources;
      if (!res || source.width === 0 || source.height === 0) return;
      if (output.width !== source.width || output.height !== source.height) {
        output.width = source.width;
        output.height = source.height;
      }

      bindTexture(0, res.scene);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

      const glow = renderGlow(res);
      const { bloom, crt, grade, vignette } = options;
      bindTexture(0, res.scene);
      bindTexture(1, glow);
      drawPass(res, res.composite, null, (uniform) => {
        gl.uniform1i(uniform('scene'), 0);
        gl.uniform1i(uniform('bloom'), 1);
        gl.uniform1f(uniform('bloomStrength'), bloom ? bloom.strength : 0);
        gl.uniform1f(uniform('vignette'), vignette);
        gl.uniform1f(uniform('curvature'), crt ? crt.curvature : 0);
        gl.uniform1f(uniform('scanlines'), crt ? crt.scanlines : 0);
        gl.uniform1f(uniform('scanlineCount'), scanlineCount(source.height, output.height));
        gl.uniform1f(uniform('mask'), crt ? crt.mask : 0);
        gl.uniform1f(uniform('aberration'), crt ? crt.aberration : 0);
        gl.uniform1f(uniform('exposure'), grade.exposure);
        gl.uniform1f(uniform('contrast'), grade.contrast);
        gl.uniform1f(uniform('saturation'), grade.saturation);
        gl.uniform3f(uniform('tint'), ...grade.tint);
      });
    },
    update(settings) {
      options = resolveOptions(settings, options);
    },
    dispose() {
      output.removeEventListener('webglcontextlost', onContextLost);
      output.removeEventListener('webglcontextrestored', onContextRestored);
      if (resources) {
        for (const program of [resources.bright, resources.blur, resources.composite]) {
          gl.deleteProgram(program.program);
        }
        gl.deleteBuffer(resources.triangle);
        gl.deleteTexture(resources.scene);
        gl.deleteTexture(resources.noGlow);
        resources.targets?.forEach((target) => deleteTarget(gl, target));
      }
      resources = null;
    },
  };
}

function buildResources(gl: WebGLRenderingContext): Resources {
  const triangle = gl.createBuffer();
  if (!triangle) throw new Error('Could not create a vertex buffer.');
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const noGlow = createTexture(gl);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255]),
  );

  return {
    bright: linkProgram(gl, BRIGHT_PASS_FRAGMENT),
    blur: linkProgram(gl, BLUR_FRAGMENT),
    composite: linkProgram(gl, COMPOSITE_FRAGMENT),
    triangle,
    scene: createTexture(gl),
    noGlow,
    targets: null,
  };
}

function linkProgram(gl: WebGLRenderingContext, fragmentSource: string): Program {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create a shader program.');
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader program failed to link: ${gl.getProgramInfoLog(program)}`);
  }
  return { program, uniforms: new Map(), position: gl.getAttribLocation(program, 'position') };
}

function compileShader(gl: WebGLRenderingContext, type: number, text: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create a shader.');
  gl.shaderSource(shader, text);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader failed to compile: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function uniformOf(gl: WebGLRenderingContext, program: Program, name: string) {
  if (!program.uniforms.has(name)) {
    program.uniforms.set(name, gl.getUniformLocation(program.program, name));
  }
  return program.uniforms.get(name) ?? null;
}

function createTexture(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Could not create a texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // Canvas sizes are rarely powers of two, which WebGL 1 only allows with these settings.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

function createTarget(gl: WebGLRenderingContext, width: number, height: number): RenderTarget {
  const texture = createTexture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('Could not create a framebuffer.');
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, width, height };
}

function deleteTarget(gl: WebGLRenderingContext, target: RenderTarget) {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}
