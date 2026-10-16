import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { TORPEDO_RANGE } from '../../engine/torpedo';
import type { World } from '../../engine/world';
import type { Palette } from '../palette';
import type { MaterialCache } from './materials';
import { BALL, DRUM, block } from './shapes';

/** The wake behind a running torpedo, up to this long, world units: as in the side view. */
const WAKE_LENGTH = 90;
/**
 * Half its breadth across the water. The camera looks along the surface
 * at a low angle, so it must be broad to show at all.
 */
const WAKE_HALF_WIDTH = 4;

interface TorpedoModel {
  body: Mesh;
  wake: Mesh;
  boil: Mesh;
}

/**
 * Torpedoes in the diorama: a dark cigar falling from the plane, then
 * running under the surface with its track of white water drawn out
 * along the surface behind it and a boil over the torpedo itself.
 */
export class TorpedoModels {
  readonly group = new Group();
  private readonly models: TorpedoModel[] = [];
  private readonly wakeGeometry = streakGeometry();
  private readonly foam: MeshBasicMaterial;
  private readonly boilFoam: MeshBasicMaterial;

  constructor(
    private readonly materials: MaterialCache,
    private readonly palette: Palette,
  ) {
    this.foam = new MeshBasicMaterial({
      color: palette.sea.foam,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.boilFoam = new MeshBasicMaterial({
      color: palette.sea.foam,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
  }

  update(world: World, time: number) {
    const sea = world.map.sea?.level ?? 0;
    while (this.models.length < world.torpedoes.length) this.models.push(this.build());
    this.models.forEach((model, index) => {
      const torpedo = world.torpedoes[index];
      model.body.visible = torpedo !== undefined;
      model.wake.visible = torpedo?.state === 'running';
      model.boil.visible = torpedo?.state === 'running';
      if (!torpedo) return;
      model.body.position.set(torpedo.x, torpedo.y, 0);
      model.body.rotation.z =
        torpedo.state === 'falling'
          ? Math.atan2(torpedo.vy, torpedo.vx) - Math.PI / 2
          : -torpedo.direction * (Math.PI / 2);
      if (torpedo.state !== 'running') return;
      const length = Math.min(WAKE_LENGTH, TORPEDO_RANGE - torpedo.run);
      model.wake.position.set(torpedo.x, sea + 0.12, 0);
      model.wake.rotation.y = torpedo.direction === 1 ? 0 : Math.PI;
      model.wake.scale.set(length, 1, WAKE_HALF_WIDTH);
      model.boil.position.set(torpedo.x, sea + 0.1, 0);
      model.boil.scale.set(2.4 + Math.sin(time * 9 + torpedo.id) * 0.3, 0.7, WAKE_HALF_WIDTH);
    });
  }

  private build(): TorpedoModel {
    const body = block(DRUM, this.materials.toon(this.palette.ink), 0, 0, 0, 0.5, 5.5, 0.5);
    const wake = new Mesh(this.wakeGeometry, this.foam);
    wake.renderOrder = 3;
    const boil = new Mesh(BALL, this.boilFoam);
    boil.renderOrder = 3;
    this.group.add(body, wake, boil);
    return { body, wake, boil };
  }

  dispose() {
    this.wakeGeometry.dispose();
    this.foam.dispose();
    this.boilFoam.dispose();
    this.group.clear();
  }
}

/** A streak one unit long and up to one across, behind its head at x = 0, fading out towards x = −1. */
function streakGeometry(): BufferGeometry {
  const steps = 8;
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const behind = step / steps;
    for (const across of [1, -1]) {
      positions.push(-behind, 0, across * (0.6 + behind * 0.4));
      colours.push(1, 1, 1, 0.95 * (1 - behind));
    }
    if (step > 0) {
      const near = (step - 1) * 2;
      index.push(near, near + 1, near + 2, near + 1, near + 3, near + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colours), 4));
  geometry.setIndex(index);
  return geometry;
}
