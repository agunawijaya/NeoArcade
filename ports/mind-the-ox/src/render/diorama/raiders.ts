import {
  CanvasTexture,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  Vector2,
} from 'three';
import { RAIDER_CLASSES } from '../../engine/raiders';
import type { Raider, World } from '../../engine/world';
import { LOWER_WING } from '../biplane-model';
import type { Livery, Palette } from '../palette';
import { mix, shade } from '../side/colour';
import { buildBiplane, type BiplaneModel } from './biplane-mesh';
import { paintedToon, type MaterialCache } from './materials';
import { BALL, BOX, DRUM, block } from './shapes';

/** The heavy bomber is the fighter's biplane half as big again, as in the side view. */
const BOMBER_SCALE = 1.75 * 1.15;

interface RaiderModel {
  group: Group;
  /** Pitches inside the group, which faces the way the raider flies. */
  body: Group;
  propellers: Group[];
  dispose(): void;
}

/**
 * Bombers and airships in the diorama: the bomber a big dark biplane with
 * an engine out on each lower wing; the airship a long silvered envelope,
 * ribbed, with fins at the tail and its cars slung beneath.
 */
export class RaiderModels {
  readonly group = new Group();
  private readonly models = new Map<number, RaiderModel>();

  constructor(
    private readonly materials: MaterialCache,
    private readonly palette: Palette,
  ) {}

  update(world: World, time: number) {
    const seen = new Set<number>();
    for (const raider of world.raiders) {
      seen.add(raider.id);
      let model = this.models.get(raider.id);
      if (!model) {
        const livery = this.palette.liveries[raider.side];
        model = raider.kind === 'zeppelin' ? this.airship(livery) : this.bomber(livery);
        this.models.set(raider.id, model);
        this.group.add(model.group);
      }
      this.pose(raider, model, time);
    }
    for (const [id, model] of this.models) {
      if (seen.has(id)) continue;
      this.group.remove(model.group);
      model.dispose();
      this.models.delete(id);
    }
  }

  private pose(raider: Raider, model: RaiderModel, time: number) {
    const falling = raider.state === 'falling';
    model.group.position.set(raider.x, raider.y, 0);
    model.group.rotation.y = raider.direction === 1 ? 0 : Math.PI;
    const dive = Math.atan2(raider.vy, Math.abs(raider.vx));
    model.body.rotation.z = falling
      ? raider.kind === 'zeppelin'
        ? -0.35 + Math.sin(time) * 0.03
        : dive
      : 0;
    for (const propeller of model.propellers)
      propeller.rotation.x = falling ? propeller.rotation.x : time * 30;
  }

  private bomber(livery: Livery): RaiderModel {
    const plane: BiplaneModel = buildBiplane(
      {
        ...livery,
        fabric: shade(livery.fabric, -0.12),
        fabricShade: shade(livery.fabricShade, -0.12),
      },
      this.materials,
    );
    plane.group.scale.setScalar(BOMBER_SCALE);
    const cowling = this.materials.toon(shade(livery.cowling, -0.25));
    const blur = new MeshBasicMaterial({
      color: this.palette.ink,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: DoubleSide,
    });
    const propellers: Group[] = [plane.propeller];
    for (const across of [-1, 1]) {
      const engine = new Group();
      engine.position.set(LOWER_WING.leading - 1.6, LOWER_WING.y + 0.2, across * 4.6);
      engine.add(block(BALL, cowling, 0, 0, 0, 2.4, 1.1, 1.1));
      const propeller = new Group();
      propeller.position.x = 2.5;
      const disc = new Mesh(DRUM, blur);
      disc.rotation.z = Math.PI / 2;
      disc.scale.set(2.4, 0.05, 2.4);
      propeller.add(disc);
      engine.add(propeller);
      plane.group.add(engine);
      propellers.push(propeller);
    }
    const group = new Group();
    const body = new Group();
    body.add(plane.group);
    group.add(body);
    return {
      group,
      body,
      propellers,
      dispose: () => {
        plane.dispose();
        blur.dispose();
      },
    };
  }

  private airship(livery: Livery): RaiderModel {
    const kind = RAIDER_CLASSES.zeppelin;
    const half = kind.length / 2;
    const radius = kind.radius;
    const fabric = mix(livery.linen, '#c9ccd0', 0.55);
    const envelopeGeometry = new LatheGeometry(envelopeProfile(half, radius), 24);
    // The lathe turns about y; lay it along x, nose forward.
    envelopeGeometry.rotateZ(-Math.PI / 2);
    const skin = paintedToon(ribTexture(fabric));
    const envelope = new Mesh(envelopeGeometry, skin);
    envelope.castShadow = true;
    const body = new Group();
    body.add(envelope);

    const fin = this.materials.toon(shade(fabric, -0.18));
    body.add(block(BOX, fin, -half + 5, 0, 0, 9, radius * 2.4, 0.4));
    body.add(block(BOX, fin, -half + 5, 0, 0, 9, 0.4, radius * 2.4));

    // Its side's mark on the envelope, as on the planes.
    const [outer, inner] = livery.insigniaColours;
    for (const across of [-1, 1]) {
      const mark = block(
        DRUM,
        this.materials.toon(outer ?? this.palette.ink),
        half - 22,
        0,
        across * radius * 0.97,
        radius * 0.42,
        0.2,
        radius * 0.42,
      );
      mark.rotation.x = Math.PI / 2;
      body.add(mark);
      if (inner) {
        const centre = block(
          DRUM,
          this.materials.toon(inner),
          half - 22,
          0,
          across * (radius * 0.97 + 0.12),
          radius * 0.24,
          0.2,
          radius * 0.24,
        );
        centre.rotation.x = Math.PI / 2;
        body.add(centre);
      }
    }

    const car = this.materials.toon(shade(livery.cowling, -0.3));
    const propellers: Group[] = [];
    const blur = new MeshBasicMaterial({
      color: this.palette.ink,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: DoubleSide,
    });
    for (const [at, width] of [
      [half - 20, 9],
      [-half + 26, 7],
    ] as const) {
      body.add(block(BOX, car, at, -radius - 1.6, 0, width, 2.4, 2.6));
      body.add(block(BOX, car, at, -radius - 0.2, 0, width * 0.6, 1, 0.6));
      const propeller = new Group();
      propeller.position.set(at - width / 2 - 1, -radius - 1.2, 0);
      const disc = new Mesh(DRUM, blur);
      disc.rotation.z = Math.PI / 2;
      disc.scale.set(2.2, 0.05, 2.2);
      propeller.add(disc);
      body.add(propeller);
      propellers.push(propeller);
    }
    if (this.palette.daylight < 0.5)
      body.add(
        block(
          BALL,
          this.materials.toon(this.palette.window, { emissive: this.palette.window }),
          half - 20,
          -radius - 1.6,
          1.35,
          0.5,
          0.5,
          0.1,
        ),
      );

    const group = new Group();
    group.add(body);
    return {
      group,
      body,
      propellers,
      dispose: () => {
        envelopeGeometry.dispose();
        skin.map?.dispose();
        skin.dispose();
        blur.dispose();
      },
    };
  }

  dispose() {
    for (const model of this.models.values()) model.dispose();
    this.models.clear();
    this.group.clear();
  }
}

/**
 * The envelope's outline from tail to nose, for the lathe: a tapering
 * tail, a long parallel middle and a blunt rounded nose.
 */
function envelopeProfile(half: number, radius: number): Vector2[] {
  const points: Vector2[] = [];
  const steps = 32;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    let share = 1;
    if (t < 0.32) share = 0.1 + 0.9 * Math.sin((t / 0.32) * (Math.PI / 2));
    else if (t > 0.86) share = Math.sqrt(Math.max(0, 1 - ((t - 0.86) / 0.14) ** 2));
    // The lathe's y runs along the airship; after laying it down, +y becomes the nose.
    points.push(new Vector2(radius * share, -half + t * half * 2));
  }
  return points;
}

/** Doped fabric with the rings of the frame showing through. */
function ribTexture(fabric: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = fabric;
    ctx.fillRect(0, 0, 8, 256);
    ctx.fillStyle = shade(fabric, -0.18);
    for (let rib = 0; rib < 256; rib += 16) ctx.fillRect(0, rib, 8, 1.5);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
