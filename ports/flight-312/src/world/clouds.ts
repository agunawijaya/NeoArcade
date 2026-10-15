import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import type { LatLon } from '../engine/geo';
import type { Weather } from '../engine/weather';
import { METRES_PER_FOOT, type SceneFrame } from './frame';
import { REGION_BOUNDS } from './landuse';
import { ATMOSPHERE_GLSL, atmosphere, CURVE_GLSL, METRES_PER_DEGREE, NOISE_GLSL } from './shaders';

/**
 * Cloud as the brief gives it: the scattered layer at 20,000 ft and the
 * broken one at 30,000 across the whole route, and the low overcast over
 * each field that the approach has to break out of. Each layer is a base
 * seen from below and a top seen from above, painted with drifting noise
 * as thin or as thick as its cover; inside it the fog does the rest.
 */
const PLANE_METRES = 420_000;
/** The planes are cut into cells so the Earth's curve can bend them. */
const PLANE_CELLS = 48;
const FIELD_RADIUS_NM = 40;
const METRES_PER_NM = 1852;

interface Layer {
  baseM: number;
  topM: number;
  cover: number;
  field: LatLon | null;
  meshes: Mesh[];
}

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  ${CURVE_GLSL}
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec4 world = vec4(curved((modelMatrix * vec4(position, 1.0)).xyz), 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uCover;
  uniform float uSeenFromAbove;
  uniform vec2 uOriginKm;
  uniform vec3 uField;
  uniform vec3 uShade;
  varying vec3 vWorld;
  ${ATMOSPHERE_GLSL}
  ${NOISE_GLSL}
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec2 km = vec2(vWorld.x, -vWorld.z) / 1000.0 + uOriginKm + vec2(uTime * 0.004, uTime * 0.001);
    float shape = fbm(km / 9.0) * 0.7 + fbm(km / 2.2) * 0.3;
    float threshold = 1.0 - uCover;
    float density = uCover >= 0.99 ? 1.0 : smoothstep(threshold - 0.08, threshold + 0.12, shape);
    float distance = length(cameraPosition - vWorld);
    float reach = 1.0 - smoothstep(110000.0, 200000.0, length(cameraPosition.xz - vWorld.xz));
    float field = 1.0;
    if (uField.z > 0.0) field = 1.0 - smoothstep(uField.z * 0.8, uField.z, length(vWorld.xz - uField.xy));
    float alpha = density * reach * field;
    if (alpha < 0.01) discard;
    vec3 colour;
    if (uSeenFromAbove > 0.5) {
      float lit = max(uSunDirection.y, 0.0);
      colour = vec3(0.95) * (uSunColor * (0.35 + 0.65 * lit) + uSkyLight * 0.55);
    } else {
      colour = uShade * (uSkyLight * 0.8 + uSunColor * 0.12) * (1.05 - 0.25 * density);
    }
    colour = applyFog(colour, distance, 0.6);
    gl_FragColor = vec4(colour, alpha * (uCover >= 0.99 ? 1.0 : 0.92));
    #include <colorspace_fragment>
  }
`;

function layerMaterial(cover: number, fromAbove: boolean, field: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      ...atmosphere,
      uCover: { value: cover },
      uSeenFromAbove: { value: fromAbove ? 1 : 0 },
      uOriginKm: { value: new Vector2() },
      uField: { value: new Vector3(0, 0, field ? FIELD_RADIUS_NM * METRES_PER_NM : 0) },
      uShade: { value: new Color('#c9cdd2') },
    },
  });
}

export class CloudLayers {
  readonly group = new Group();
  private layers: Layer[] = [];

  constructor(weather: Weather) {
    this.group.name = 'clouds';
    for (const layer of weather.layers) {
      this.add(
        layer.baseFt * METRES_PER_FOOT,
        layer.topFt * METRES_PER_FOOT,
        layer.cover / 8,
        null,
      );
    }
    for (const field of [weather.departure, weather.destination]) {
      if (field.ceilingFt === null) continue;
      const base = (field.elevationFt + field.ceilingFt) * METRES_PER_FOOT;
      this.add(base, base + field.cloudDepthFt * METRES_PER_FOOT, 1, field.position);
    }
  }

  private add(baseM: number, topM: number, cover: number, field: LatLon | null) {
    const geometry = new PlaneGeometry(PLANE_METRES, PLANE_METRES, PLANE_CELLS, PLANE_CELLS);
    geometry.rotateX(-Math.PI / 2);
    const meshes = [false, true].map((fromAbove) => {
      const mesh = new Mesh(geometry, layerMaterial(cover, fromAbove, field !== null));
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      return mesh;
    });
    this.layers.push({ baseM, topM, cover, field, meshes });
  }

  /**
   * Follows the eye across, stays at its height; the side facing the eye is
   * the one drawn. A layer behind a solid deck over the eye — or any layer
   * at all while the eye is inside one — is not drawn.
   */
  update(frame: SceneFrame, eye: Vector3) {
    const originKm = new Vector2(
      ((frame.origin.lon - REGION_BOUNDS.west) *
        METRES_PER_DEGREE *
        Math.cos(frame.origin.lat * (Math.PI / 180))) /
        1000,
      ((frame.origin.lat - REGION_BOUNDS.south) * METRES_PER_DEGREE) / 1000,
    );
    const decks = this.solidDecksOver(frame, eye);
    for (const layer of this.layers) {
      const [below, above] = layer.meshes as [Mesh, Mesh];
      const hidden = decks.some(
        (deck) =>
          deck !== layer &&
          deck.topM > Math.min(eye.y, layer.baseM) &&
          deck.baseM < Math.max(eye.y, layer.topM),
      );
      below.position.set(eye.x, layer.baseM, eye.z);
      above.position.set(eye.x, layer.topM, eye.z);
      below.visible = !hidden && eye.y < layer.baseM;
      above.visible = !hidden && eye.y > layer.topM;
      const fieldAt = layer.field ? frame.toScene(layer.field, 0) : null;
      for (const mesh of layer.meshes) {
        const uniforms = (mesh.material as ShaderMaterial).uniforms;
        (uniforms.uOriginKm?.value as Vector2).copy(originKm);
        if (fieldAt) {
          const field = uniforms.uField?.value as Vector3;
          field.x = fieldAt.x;
          field.y = fieldAt.z;
        }
      }
    }
  }

  /** The overcast layers that stretch over the eye: a field's deck only near its field. */
  private solidDecksOver(frame: SceneFrame, eye: Vector3): Layer[] {
    return this.layers.filter((layer) => {
      if (layer.cover < 0.99) return false;
      if (!layer.field) return true;
      const fieldAt = frame.toScene(layer.field, 0);
      const reach = FIELD_RADIUS_NM * METRES_PER_NM * 0.8;
      return Math.hypot(fieldAt.x - eye.x, fieldAt.z - eye.z) < reach;
    });
  }

  dispose() {
    for (const layer of this.layers) {
      layer.meshes[0]?.geometry.dispose();
      for (const mesh of layer.meshes) (mesh.material as ShaderMaterial).dispose();
    }
  }
}
