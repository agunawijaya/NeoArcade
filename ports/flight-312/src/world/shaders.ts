import { Color, Vector3 } from 'three';

/**
 * GLSL shared by the world's materials, and the atmosphere uniforms they all
 * read from one object: the sun, the sky's light, the fog and the night.
 * Updating them once a frame relights every material together.
 */
export const EARTH_RADIUS_M = 6_371_000;
export const METRES_PER_DEGREE = (Math.PI / 180) * EARTH_RADIUS_M;

export const atmosphere = {
  uSunDirection: { value: new Vector3(0, 1, 0) },
  uSunColor: { value: new Color(1, 1, 1) },
  uSkyLight: { value: new Color(0.5, 0.6, 0.7) },
  uGroundLight: { value: new Color(0.25, 0.22, 0.2) },
  uFogColor: { value: new Color(0.7, 0.75, 0.8) },
  /** For fog = 1 − exp(−(density·distance)²). */
  uFogDensity: { value: 0.00005 },
  /** 0 by day, 1 at night: dims the ground and lights the towns. */
  uNight: { value: 0 },
  uTime: { value: 0 },
  uCosLatitude: { value: Math.cos((40 * Math.PI) / 180) },
};

/**
 * The curve of the Earth, measured from the eye: everything sinks below
 * the eye's horizontal plane by the square of its distance over twice the
 * Earth's radius. Every material applies the same drop to its vertices, so
 * the ground, the runways, the lights and the cloud stay together while
 * the far ground falls away to a true horizon.
 */
export const CURVE_GLSL = /* glsl */ `
  vec3 curved(vec3 world) {
    vec2 away = world.xz - cameraPosition.xz;
    return vec3(world.x, world.y - dot(away, away) / ${(2 * EARTH_RADIUS_M).toFixed(1)}, world.z);
  }
`;

/**
 * Places a vertex given as degrees from its mesh's centre and a height, on
 * the scene's flat projection: the mesh's position (its centre, east and
 * north of the scene origin) plus the offset. Every mesh uses the same
 * sum, so neighbours meet exactly.
 */
export const PROJECT_GLSL = /* glsl */ `
  attribute vec2 geoOffset;
  uniform float uCosLatitude;
  ${CURVE_GLSL}
  vec3 projectToScene(vec2 offsetDegrees, float height) {
    vec3 centre = modelMatrix[3].xyz;
    float east = centre.x + offsetDegrees.x * ${METRES_PER_DEGREE.toFixed(4)} * uCosLatitude;
    float north = -centre.z + offsetDegrees.y * ${METRES_PER_DEGREE.toFixed(4)};
    return curved(vec3(east, height, -north));
  }
`;

export const NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 4; octave++) {
      sum += amplitude * valueNoise(p);
      p = p * 2.03 + vec2(17.1, 9.3);
      amplitude *= 0.5;
    }
    return sum;
  }
`;

export const ATMOSPHERE_GLSL = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uSkyLight;
  uniform vec3 uGroundLight;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uNight;
  uniform float uTime;
  vec3 applyFog(vec3 colour, float distance, float strength) {
    float d = uFogDensity * distance * strength;
    return mix(colour, uFogColor, 1.0 - exp(-d * d));
  }
  vec3 ambient(vec3 normal) {
    return mix(uGroundLight, uSkyLight, normal.y * 0.5 + 0.5);
  }
`;

/** Pulls a vertex a little toward the eye, so paint and lights lie on top of the ground under them. */
export const DECAL_GLSL = /* glsl */ `
  vec4 pullTowardEye(vec4 viewPosition, float fraction) {
    return vec4(viewPosition.xyz * (1.0 - fraction), viewPosition.w);
  }
`;
