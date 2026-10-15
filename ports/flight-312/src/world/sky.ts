import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { NOISE_GLSL } from './shaders';

/**
 * The sky and the light it throws: a dome drawn around the camera, blue
 * overhead fading to a hazy horizon, the sun's disc and glow, a warm dawn,
 * and stars once the sun is well down. `skyLighting` works out the colours
 * for a sun elevation and how overcast it is, for the dome and for every
 * lit material.
 */
export interface SkyLighting {
  zenith: Color;
  horizon: Color;
  sunColor: Color;
  skyLight: Color;
  groundLight: Color;
  /** 0 in daylight, 1 in full night. */
  night: number;
  /** How brightly a cloud deck is lit from above: low sun, dim grey. */
  cloudLight: number;
}

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const DAY = { zenith: new Color('#3d6fb3'), horizon: new Color('#b9cfe2') };
const DAWN = { zenith: new Color('#2c3f68'), horizon: new Color('#f0a26a') };
const NIGHT = { zenith: new Color('#04070f'), horizon: new Color('#141b2a') };
const GREY = { zenith: new Color('#8b9298'), horizon: new Color('#a9aeb2') };

export function skyLighting(sunElevation: number, overcast: number): SkyLighting {
  const day = smooth(-4, 14, sunElevation);
  const low = 1 - smooth(2, 18, Math.abs(sunElevation - 2));
  const night = 1 - smooth(-12, -2, sunElevation);
  const zenith = NIGHT.zenith
    .clone()
    .lerp(DAWN.zenith, 1 - night)
    .lerp(DAY.zenith, day);
  const horizon = NIGHT.horizon
    .clone()
    .lerp(DAWN.horizon, (1 - night) * low)
    .lerp(DAY.horizon, day * (1 - low * 0.6));
  const greyness = Math.min(1, overcast);
  const cloudLight = 0.25 + 0.75 * smooth(-6, 20, sunElevation);
  zenith.lerp(GREY.zenith.clone().multiplyScalar(cloudLight), greyness * 0.85);
  horizon.lerp(GREY.horizon.clone().multiplyScalar(cloudLight), greyness * 0.85);

  const sunColor = new Color('#fff4e2')
    .lerp(new Color('#ff9b52'), low * 0.8)
    .multiplyScalar(smooth(-3, 8, sunElevation) * (1 - greyness * 0.8) * 1.15);
  const skyLight = zenith
    .clone()
    .lerp(horizon, 0.5)
    .multiplyScalar(0.9 + 0.4 * greyness);
  const groundLight = new Color('#4a4237').multiplyScalar(0.25 + 0.75 * day);
  return { zenith, horizon, sunColor, skyLight, groundLight, night, cloudLight };
}

const VERTEX = /* glsl */ `
  varying vec3 vDirection;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vDirection = normalize(position);
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    #include <logdepthbuf_vertex>
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uNight;
  uniform float uOvercast;
  uniform vec3 uBelow;
  varying vec3 vDirection;
  ${NOISE_GLSL}
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec3 direction = normalize(vDirection);
    float up = direction.y;
    vec3 colour = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.45));
    float toSun = max(dot(direction, uSunDirection), 0.0);
    float clear = 1.0 - uOvercast;
    colour += uSunColor * (pow(toSun, 8.0) * 0.25 + pow(toSun, 64.0) * 0.4) * clear;
    colour += uSunColor * smoothstep(0.99955, 0.9998, toSun) * 6.0 * clear;
    vec2 starCell = floor(vec2(atan(direction.z, direction.x), asin(clamp(up, -1.0, 1.0))) * 260.0);
    float star = step(0.9975, hash12(starCell)) * smoothstep(0.02, 0.2, up);
    colour += vec3(0.8, 0.85, 1.0) * star * uNight * clear * (0.5 + 0.5 * hash12(starCell + 4.0));
    colour = mix(colour, uBelow, smoothstep(0.0, -0.06, up));
    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
  }
`;

export class SkyDome {
  readonly mesh: Mesh;
  private material: ShaderMaterial;

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new Color() },
        uHorizon: { value: new Color() },
        uSunDirection: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color() },
        uNight: { value: 0 },
        uOvercast: { value: 0 },
        uBelow: { value: new Color() },
      },
    });
    this.mesh = new Mesh(new SphereGeometry(1, 48, 24), this.material);
    this.mesh.name = 'sky';
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  /** Centres the dome on the eye, inside the far plane. */
  update(
    eye: Vector3,
    radius: number,
    lighting: SkyLighting,
    sunDirection: Vector3,
    overcast: number,
    below: Color,
  ) {
    this.mesh.position.copy(eye);
    this.mesh.scale.setScalar(radius);
    const uniforms = this.material.uniforms;
    (uniforms.uZenith?.value as Color).copy(lighting.zenith);
    (uniforms.uHorizon?.value as Color).copy(lighting.horizon);
    (uniforms.uSunDirection?.value as Vector3).copy(sunDirection);
    (uniforms.uSunColor?.value as Color).copy(lighting.sunColor);
    (uniforms.uBelow?.value as Color).copy(below);
    if (uniforms.uNight) uniforms.uNight.value = lighting.night;
    if (uniforms.uOvercast) uniforms.uOvercast.value = overcast;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
