import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial } from 'three';
import { destination } from '../engine/geo';
import type { Ils } from '../engine/radios';
import { METRES_PER_FOOT, type SceneFrame } from './frame';
import { ATMOSPHERE_GLSL, atmosphere, CURVE_GLSL } from './shaders';

/**
 * The Arcade level's ghost glidepath: hollow gates down the ILS every half
 * mile from ten miles out, each about a dot of the localizer and the
 * glideslope across, so they narrow toward the runway as the needles grow
 * sharper. Fly through them and you are on both beams. Built in the
 * runway's own frame around the glide point and placed like an airport;
 * the Earth's curve bends it like everything else, and the fog only half
 * hides it, so it still leads the way through the cloud.
 */
const GATE_EVERY_NM = 0.5;
const GATES = 20;
const FEET_PER_NM = 6076.12;
/** A gate's half-size: a floor near the runway, growing with the distance out. */
const HALF_WIDTH = { baseFt: 90, perNmFt: 55 };
const HALF_HEIGHT = { baseFt: 40, perNmFt: 18 };
const BAR_FT = 8;
const COLOUR = new Color('#ff5ad1');

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
  uniform vec3 uColour;
  varying vec3 vWorld;
  ${ATMOSPHERE_GLSL}
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec3 colour = applyFog(uColour, length(cameraPosition - vWorld), 0.35);
    gl_FragColor = vec4(colour, 0.6);
    #include <colorspace_fragment>
  }
`;

/** One gate: four bars round a rectangle facing down the approach, at `out` metres from the glide point. */
function gate(vertices: number[], out: number, up: number, halfWidth: number, halfHeight: number) {
  const bar = BAR_FT * METRES_PER_FOOT;
  const quad = (x0: number, y0: number, x1: number, y1: number) =>
    vertices.push(x0, y0, out, x1, y0, out, x1, y1, out, x0, y0, out, x1, y1, out, x0, y1, out);
  quad(-halfWidth, up + halfHeight - bar, halfWidth, up + halfHeight);
  quad(-halfWidth, up - halfHeight, halfWidth, up - halfHeight + bar);
  quad(-halfWidth, up - halfHeight, -halfWidth + bar, up + halfHeight);
  quad(halfWidth - bar, up - halfHeight, halfWidth, up + halfHeight);
}

export class GlidePath {
  readonly mesh: Mesh;
  private glidePoint;
  private elevationM: number;

  constructor(ils: Ils) {
    const strip = ils.runway;
    this.glidePoint = destination(
      strip.threshold,
      strip.headingTrue,
      ils.glidePointFt / FEET_PER_NM,
    );
    this.elevationM = strip.elevationFt * METRES_PER_FOOT;
    const slope = Math.tan(ils.glideslopeDeg * (Math.PI / 180));
    const vertices: number[] = [];
    for (let index = 1; index <= GATES; index++) {
      const nm = index * GATE_EVERY_NM;
      const outFt = nm * FEET_PER_NM;
      gate(
        vertices,
        outFt * METRES_PER_FOOT,
        outFt * slope * METRES_PER_FOOT,
        (HALF_WIDTH.baseFt + HALF_WIDTH.perNmFt * nm) * METRES_PER_FOOT,
        (HALF_HEIGHT.baseFt + HALF_HEIGHT.perNmFt * nm) * METRES_PER_FOOT,
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    this.mesh = new Mesh(
      geometry,
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { ...atmosphere, uColour: { value: COLOUR } },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.mesh.name = 'glidepath';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    // The approach lies behind the runway's direction: the mesh's +z points back down it.
    this.mesh.rotation.y = -strip.headingTrue * (Math.PI / 180);
  }

  place(frame: SceneFrame) {
    frame.toScene(this.glidePoint, this.elevationM, this.mesh.position);
    this.mesh.updateMatrixWorld(true);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}
