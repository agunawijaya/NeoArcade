import type { Color } from 'three';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { ATMOSPHERE_GLSL, atmosphere, CURVE_GLSL, DECAL_GLSL } from './shaders';

/**
 * Airfield lights as glowing points: edge, centreline, touchdown-zone,
 * threshold and end lights, the approach lighting with its sequenced
 * flashers running toward the runway twice a second, and the VASI boxes
 * that show white above their beam and red below it. Lights carry through
 * fog much further than the ground does, which is what makes the breakout:
 * the approach lights appear before anything else.
 */
export type LightKind = 'steady' | 'flasher' | 'vasi';

export interface LightSpec {
  position: Vector3;
  color: Color;
  /** Apparent size in metres. */
  size: number;
  intensity: number;
  kind: LightKind;
  /** Flashers: where in the sequence, 0–1. VASI: the beam angle, radians. */
  parameter: number;
  /** Unidirectional lights shine toward this direction (unit); null shines all round. */
  facing: Vector3 | null;
}

const KIND_CODE: Record<LightKind, number> = { steady: 0, flasher: 1, vasi: 2 };

const VERTEX = /* glsl */ `
  attribute vec3 color;
  attribute vec4 light;     // size, intensity, kind, parameter
  attribute vec4 facing;    // direction, and 1 when the light is directional
  uniform float uPixelsPerMetre;
  uniform float uDaylight;
  varying vec3 vColor;
  varying float vAlpha;
  ${ATMOSPHERE_GLSL}
  ${DECAL_GLSL}
  ${CURVE_GLSL}
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec4 world = vec4(curved((modelMatrix * vec4(position, 1.0)).xyz), 1.0);
    vec3 toEye = cameraPosition - world.xyz;
    float distance = length(toEye);
    vec3 eyeDirection = toEye / max(distance, 0.001);
    float intensity = light.y;
    vec3 colour = color;
    if (light.z > 1.5) {
      // VASI: white when the eye is above the box's beam, red below it, pink in between.
      float elevation = asin(clamp(eyeDirection.y, -1.0, 1.0));
      float white = smoothstep(light.w - 0.0015, light.w + 0.0015, elevation);
      colour = mix(vec3(1.0, 0.08, 0.05), vec3(1.0, 0.95, 0.85), white);
    } else if (light.z > 0.5) {
      // The "rabbit": each flasher fires in turn, toward the threshold, twice a second.
      float phase = fract(uTime * 2.0 - light.w);
      intensity *= phase < 0.06 ? 3.0 : 0.0;
    }
    if (facing.w > 0.5) intensity *= smoothstep(0.1, 0.55, dot(eyeDirection, facing.xyz));
    float fogged = uFogDensity * distance * 0.38;
    float visible = exp(-fogged * fogged);
    vec4 view = pullTowardEye(viewMatrix * world, 0.003);
    float pixels = light.x * uPixelsPerMetre / max(-view.z, 1.0);
    // Far lights stay a pixel or two across and get no dimmer for it: the eye sees a point of light.
    gl_PointSize = clamp(pixels, 1.6, 26.0);
    vAlpha = intensity * visible * mix(1.0, 0.45, uDaylight) * clamp(pixels / 1.6, 0.6, 1.0);
    vColor = colour;
    gl_Position = projectionMatrix * view;
    #include <logdepthbuf_vertex>
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec2 offset = gl_PointCoord - 0.5;
    float r = length(offset) * 2.0;
    float glow = exp(-r * r * 5.0) + 0.6 * smoothstep(0.35, 0.0, r);
    if (glow * vAlpha < 0.004) discard;
    gl_FragColor = vec4(vColor * glow * vAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

export const lightUniforms = {
  uPixelsPerMetre: { value: 900 },
  uDaylight: { value: 1 },
};

export function buildLights(specs: readonly LightSpec[]): Points {
  const count = specs.length;
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const light = new Float32Array(count * 4);
  const facing = new Float32Array(count * 4);
  specs.forEach((spec, index) => {
    position.set([spec.position.x, spec.position.y, spec.position.z], index * 3);
    color.set([spec.color.r, spec.color.g, spec.color.b], index * 3);
    light.set([spec.size, spec.intensity, KIND_CODE[spec.kind], spec.parameter], index * 4);
    const direction = spec.facing ?? new Vector3();
    facing.set([direction.x, direction.y, direction.z, spec.facing ? 1 : 0], index * 4);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('color', new BufferAttribute(color, 3));
  geometry.setAttribute('light', new BufferAttribute(light, 4));
  geometry.setAttribute('facing', new BufferAttribute(facing, 4));
  geometry.computeBoundingSphere();
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { ...atmosphere, ...lightUniforms },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.renderOrder = 8;
  return points;
}
