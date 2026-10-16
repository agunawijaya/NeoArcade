import { Group, Mesh } from 'three';
import type { Bird, Flock, Ox, Target, World } from '../../engine/world';
import type { Palette } from '../palette';
import type { MaterialCache } from './materials';
import { BALL, BOX, CONE, block } from './shapes';
import { buildTargetModel } from './targets';

/**
 * The things standing on the line of play and flying over it that are not
 * planes: targets, oxen and birds, each kept in step with the engine.
 */
export class Actors {
  readonly group = new Group();
  private readonly targets = new Map<number, { model: Group; standing: boolean }>();
  private readonly oxen = new Map<
    number,
    { model: Group; head: Group; tail: Mesh; alive: boolean }
  >();
  private readonly birdModels: Group[] = [];

  constructor(
    private readonly materials: MaterialCache,
    private palette: Palette,
  ) {}

  update(world: World, time: number) {
    for (const target of world.targets) this.updateTarget(target);
    for (const ox of world.oxen) this.updateOx(world, ox, time);
    this.updateBirds(world.flocks, world.birds, time);
  }

  private updateTarget(target: Target) {
    let entry = this.targets.get(target.id);
    if (entry && entry.standing !== target.standing) {
      this.group.remove(entry.model);
      entry = undefined;
    }
    if (!entry) {
      const model = buildTargetModel(target, this.palette, this.materials);
      this.group.add(model);
      entry = { model, standing: target.standing };
      this.targets.set(target.id, entry);
    }
    // Convoy lorries move, and face the way they are going.
    entry.model.position.set(target.x, target.y, 0);
    if (target.drivesTo !== null) entry.model.scale.x = target.drivesTo < target.x ? -1 : 1;
  }

  private updateOx(world: World, ox: Ox, time: number) {
    let entry = this.oxen.get(ox.id);
    if (!entry) {
      entry = this.buildOx(ox);
      this.oxen.set(ox.id, entry);
      this.group.add(entry.model);
    }
    if (!ox.alive) {
      entry.model.rotation.x = Math.PI / 2;
      entry.model.position.y = ox.y + 2.4;
      return;
    }
    let attention = 0;
    for (const plane of world.planes) {
      const dx = Math.abs(plane.x - ox.x);
      const dy = plane.y - ox.y;
      if ((plane.state === 'flying' || plane.state === 'falling') && dx < 70 && dy < 70) {
        attention = Math.max(attention, (1 - dx / 70) * (1 - Math.max(0, dy) / 70));
      }
    }
    entry.head.rotation.z =
      -attention * 0.45 + Math.sin(time * 5.2 + ox.id) * 0.04 * (1 - attention);
    entry.tail.rotation.z = Math.sin(time * 1.6 + ox.id * 2) * 0.4;
  }

  private buildOx(ox: Ox) {
    const m = this.materials;
    const { hide, shade: dark, horn, muzzle } = this.palette.ox;
    const model = new Group();
    model.position.set(ox.x, ox.y, 2);
    model.scale.set(ox.facing, 1, 1);
    model.add(block(BALL, m.toon(hide), 0, 5.3, 0, 5.6, 2.6, 2.6));
    for (const [legX, legZ] of [
      [-4, 1.3],
      [-4, -1.3],
      [3, 1.3],
      [3, -1.3],
    ] as const) {
      model.add(block(BOX, m.toon(dark), legX, 1.75, legZ, 1.1, 3.5, 1.1));
    }
    const head = new Group();
    head.position.set(4.6, 5.6, 0);
    head.add(block(BALL, m.toon(hide), 1.5, -0.4, 0, 1.9, 1.6, 1.4));
    head.add(block(BALL, m.toon(muzzle), 2.9, -0.9, 0, 0.9, 0.8, 1));
    for (const side of [-1, 1]) {
      const hornMesh = block(CONE, m.toon(horn), 1, 1.4, side * 1.2, 0.3, 2, 0.3);
      hornMesh.rotation.z = -0.6;
      hornMesh.rotation.x = side * 0.5;
      head.add(hornMesh);
    }
    model.add(head);
    const tail = block(BOX, m.toon(dark), -5.8, 4.6, 0, 0.3, 3, 0.3);
    model.add(tail);
    return { model, head, tail, alive: ox.alive };
  }

  /** Birds as little dark gulls with beating wings; a flock keeps its loose shape. */
  private updateBirds(flocks: readonly Flock[], birds: readonly Bird[], time: number) {
    const positions: [number, number, number][] = [];
    for (const flock of flocks) {
      for (const [dx, dy] of [
        [0, 0],
        [-3.4, 1.2],
        [3.1, 1.6],
        [-6.2, 2.6],
        [6, 2.9],
        [-1.6, -2.2],
        [2, -2.6],
      ] as const) {
        positions.push([flock.x + dx, flock.y + dy, positions.length]);
      }
    }
    for (const bird of birds) positions.push([bird.x, bird.y, bird.id]);
    while (this.birdModels.length < positions.length) {
      const bird = this.buildBird();
      this.birdModels.push(bird);
      this.group.add(bird);
    }
    this.birdModels.forEach((model, index) => {
      const spot = positions[index];
      model.visible = spot !== undefined;
      if (!spot) return;
      model.position.set(spot[0], spot[1], 0);
      const beat = Math.sin(time * 10 + spot[2] * 1.3) * 0.6;
      (model.children[0] as Mesh).rotation.z = 0.3 + beat;
      (model.children[1] as Mesh).rotation.z = -0.3 - beat;
    });
  }

  private buildBird(): Group {
    const material = this.materials.toon(this.palette.bird);
    const group = new Group();
    for (const side of [-1, 1]) {
      const wing = new Mesh(BOX, material);
      wing.scale.set(1.6, 0.25, 0.6);
      wing.position.x = side * 0.8;
      group.add(wing);
    }
    return group;
  }

  dispose() {
    this.group.clear();
    this.targets.clear();
    this.oxen.clear();
  }
}
