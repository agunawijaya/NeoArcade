// GLSL ES 1.00 so the pass runs on WebGL 1, which is all some older phones have.

/** One oversized triangle covers the screen with fewer seams than a quad. */
export const FULLSCREEN_VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

/** Keeps only what is bright enough to glow, with a soft knee instead of a hard cut. */
export const BRIGHT_PASS_FRAGMENT = `
precision mediump float;
uniform sampler2D source;
uniform float threshold;
varying vec2 uv;
void main() {
  vec3 color = texture2D(source, uv).rgb;
  float brightness = max(max(color.r, color.g), color.b);
  float knee = smoothstep(threshold, min(1.0, threshold + 0.35), brightness);
  gl_FragColor = vec4(color * knee, 1.0);
}`;

/**
 * Nine-tap Gaussian blur done in five texture reads by sampling between
 * texels and letting linear filtering do half the work. Run once
 * horizontally and once vertically.
 */
export const BLUR_FRAGMENT = `
precision mediump float;
uniform sampler2D source;
uniform vec2 direction;
varying vec2 uv;
void main() {
  vec2 near = direction * 1.3846153846;
  vec2 far = direction * 3.2307692308;
  vec3 color = texture2D(source, uv).rgb * 0.2270270270;
  color += texture2D(source, uv + near).rgb * 0.3162162162;
  color += texture2D(source, uv - near).rgb * 0.3162162162;
  color += texture2D(source, uv + far).rgb * 0.0702702703;
  color += texture2D(source, uv - far).rgb * 0.0702702703;
  gl_FragColor = vec4(color, 1.0);
}`;

export const COMPOSITE_FRAGMENT = `
precision mediump float;
uniform sampler2D scene;
uniform sampler2D bloom;
uniform float bloomStrength;
uniform float vignette;
uniform float curvature;
uniform float scanlines;
uniform float scanlineCount;
uniform float mask;
uniform float aberration;
uniform float exposure;
uniform float contrast;
uniform float saturation;
uniform vec3 tint;
uniform vec3 palette[4];
uniform float paletteSize;
uniform float dither;
uniform float pixelRows;
uniform vec2 resolution;
varying vec2 uv;

vec2 bendLikeATube(vec2 point) {
  vec2 centered = point * 2.0 - 1.0;
  vec2 bulge = abs(centered.yx) * curvature;
  centered += centered * bulge * bulge;
  return centered * 0.5 + 0.5;
}

// The 4 x 4 Bayer matrix, built from the 2 x 2 one ([0 2; 3 1] is mod(2x + 3y, 4)), in 0..1.
float bayer(vec2 cell) {
  vec2 fine = mod(cell, 2.0);
  vec2 coarse = mod(floor(cell / 2.0), 2.0);
  float value = 4.0 * mod(2.0 * fine.x + 3.0 * fine.y, 4.0)
    + mod(2.0 * coarse.x + 3.0 * coarse.y, 4.0);
  return (value + 0.5) / 16.0;
}

vec3 nearestColour(vec3 color, vec2 cell) {
  vec3 wanted = color + (bayer(mod(cell, 4.0)) - 0.5) * dither * 0.45;
  vec3 best = palette[0];
  float bestDistance = 1e9;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= paletteSize) break;
    vec3 away = wanted - palette[i];
    float distance = dot(away, away);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = palette[i];
    }
  }
  return best;
}

void main() {
  vec2 point = curvature > 0.0 ? bendLikeATube(uv) : uv;
  if (point.x < 0.0 || point.x > 1.0 || point.y < 0.0 || point.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Chunky pixels: every block samples its own centre.
  vec2 cell = point * resolution;
  if (pixelRows > 0.0) {
    float block = max(1.0, floor(resolution.y / pixelRows));
    cell = floor(point * resolution / block);
    point = (cell + 0.5) * block / resolution;
  }

  vec2 fringe = (point - 0.5) * 2.0 * aberration;
  vec3 color = vec3(
    texture2D(scene, point + fringe).r,
    texture2D(scene, point).g,
    texture2D(scene, point - fringe).b
  );
  color += texture2D(bloom, point).rgb * bloomStrength;

  color *= exposure;
  color = (color - 0.5) * contrast + 0.5;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, saturation) * tint;

  if (paletteSize > 0.0) color = nearestColour(clamp(color, 0.0, 1.0), floor(cell));

  if (scanlines > 0.0) {
    float wave = 0.5 + 0.5 * cos(point.y * scanlineCount * 6.2831853);
    color *= 1.0 - scanlines * wave * wave;
  }

  if (mask > 0.0) {
    float column = mod(gl_FragCoord.x, 3.0);
    vec3 stripe = vec3(step(column, 1.0), step(1.0, column) * step(column, 2.0), step(2.0, column));
    color *= mix(vec3(1.0), 0.6 + stripe * 0.8, mask);
  }

  vec2 fromCenter = uv - 0.5;
  float edge = smoothstep(0.85, 0.25, length(fromCenter * vec2(1.1, 1.25)));
  color *= mix(1.0, edge, vignette);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;
