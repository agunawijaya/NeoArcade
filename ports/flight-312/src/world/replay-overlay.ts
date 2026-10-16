import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  TubeGeometry,
  Vector3,
  CylinderGeometry,
} from 'three';
import type { LatLon } from '../engine/geo';
import type { Ils } from '../engine/radios';
import { runwayPoint } from '../engine/runways';
import { FEET_PER_NM } from '../engine/units';
import { localMetres, METRES_PER_FOOT, type SceneFrame } from './frame';

/**
 * What the replay draws into the world over the landing: the path the
 * jumbo flew, the glideslope's corridor one dot either side of the beam,
 * and a ring where the wheels first touched. Built in metres around the
 * runway's threshold and placed like the airports, so it moves with the
 * scene's origin; it ignores the fog, being a drawing over the world.
 */
export interface OverlayPathPoint {
  position: LatLon;
  altitudeFt: number;
}

/** The corridor reaches this far out along the approach. */
const CORRIDOR_NM = 8;
const CORRIDOR_STEPS = 40;
/** One dot of glideslope, degrees. */
const DOT_DEG = 0.35;
const PATH_POINTS = 400;

export class ReplayOverlay {
  readonly group = new Group();
  private anchor: LatLon;
  private elevationM: number;
  private materials: MeshBasicMaterial[] = [];

  constructor(ils: Ils, path: readonly OverlayPathPoint[], touchdown: LatLon | null) {
    this.group.name = 'replay overlay';
    const strip = ils.runway;
    this.anchor = strip.threshold;
    this.elevationM = strip.elevationFt * METRES_PER_FOOT;
    const toLocal = localMetres(this.anchor);
    const at = (point: LatLon, heightFt: number) => {
      const { east, north } = toLocal(point);
      return new Vector3(east, heightFt * METRES_PER_FOOT, -north);
    };

    const flown = this.material('#ff5bd1', 0.75);
    const step = Math.max(1, Math.ceil(path.length / PATH_POINTS));
    const points = path
      .filter((_, index) => index % step === 0)
      .map((sample) => at(sample.position, sample.altitudeFt - strip.elevationFt));
    if (points.length >= 2) {
      const curve = new CatmullRomCurve3(points);
      this.group.add(new Mesh(new TubeGeometry(curve, points.length * 2, 0.45, 6, false), flown));
    }

    // The corridor: a vertical band down the extended centreline, one dot above and below the beam.
    const corridor = this.material('#7fd1ff', 0.1);
    const vertices: number[] = [];
    const tan = (degrees: number) => Math.tan(degrees * (Math.PI / 180));
    for (let index = 0; index < CORRIDOR_STEPS; index++) {
      const near = (index / CORRIDOR_STEPS) * CORRIDOR_NM * FEET_PER_NM;
      const far = ((index + 1) / CORRIDOR_STEPS) * CORRIDOR_NM * FEET_PER_NM;
      const corner = (out: number, dots: number) => {
        const toGlidePoint = out + ils.glidePointFt;
        const height = toGlidePoint * tan(ils.glideslopeDeg + dots * DOT_DEG);
        return at(runwayPoint(strip, -out, 0), height);
      };
      const [a, b, c, d] = [corner(near, -1), corner(far, -1), corner(far, 1), corner(near, 1)];
      for (const vertex of [a, b, c, a, c, d]) vertices.push(vertex.x, vertex.y, vertex.z);
    }
    const band = new BufferGeometry();
    band.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    this.group.add(new Mesh(band, corridor));
    const beam = this.material('#7fd1ff', 0.75);
    const beamPoints = [0, CORRIDOR_NM].map((nm) => {
      const out = nm * FEET_PER_NM;
      return at(runwayPoint(strip, -out, 0), (out + ils.glidePointFt) * tan(ils.glideslopeDeg));
    });
    this.group.add(
      new Mesh(new TubeGeometry(new CatmullRomCurve3(beamPoints), 8, 0.3, 5, false), beam),
    );

    if (touchdown) {
      const mark = this.material('#ffb52e', 0.95);
      const spot = at(touchdown, 0.4);
      const ring = new Mesh(new RingGeometry(9, 12, 40), mark);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(spot);
      const post = new Mesh(new CylinderGeometry(0.5, 0.5, 18, 8), mark);
      post.position.copy(spot).setY(9.4);
      this.group.add(ring, post);
    }
  }

  private material(colour: string, opacity: number): MeshBasicMaterial {
    const material = new MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity,
      fog: false,
      side: DoubleSide,
      depthWrite: false,
    });
    this.materials.push(material);
    return material;
  }

  place(frame: SceneFrame) {
    frame.toScene(this.anchor, this.elevationM, this.group.position);
    this.group.updateMatrixWorld(true);
  }

  dispose() {
    this.group.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    for (const material of this.materials) material.dispose();
  }
}
