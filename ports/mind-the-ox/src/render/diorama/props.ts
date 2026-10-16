import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import type { Palette } from '../palette';
import type { Prop, Scenery } from '../scenery';
import { mix } from '../side/colour';
import type { MaterialCache } from './materials';
import { SLAB_BACK } from './terrain-mesh';

/** Shared shapes, scaled per prop. */
const SHAPES = {
  trunk: new CylinderGeometry(0.25, 0.35, 1, 6),
  ball: new SphereGeometry(1, 10, 8),
  cone: new ConeGeometry(1, 1, 10),
  box: new BoxGeometry(1, 1, 1),
  roof: new CylinderGeometry(1, 1, 1, 3, 1),
  coil: new TorusGeometry(1, 0.08, 4, 12),
  halfDrum: new CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI),
};

export function propDepth(prop: Prop): number {
  return -(4 + prop.depth * (SLAB_BACK - 14));
}

/**
 * The side view's scenery as little models standing on the land behind the
 * line of play. Windmill sails turn and windsocks swing; at night windows
 * glow.
 */
export class PropModels {
  readonly group = new Group();
  private readonly spinning: Object3D[] = [];

  constructor(
    scenery: Scenery,
    private readonly materials: MaterialCache,
    palette: Palette,
    heightAt: (x: number, z: number) => number,
  ) {
    for (const prop of scenery.props) {
      const z = propDepth(prop);
      const model = this.build(prop, palette);
      if (!model) continue;
      model.position.set(prop.x, heightAt(prop.x, z), z);
      model.scale.set(prop.scale * prop.facing, prop.scale, prop.scale);
      model.traverse((child) => {
        child.castShadow = prop.kind !== 'balloon';
        child.receiveShadow = true;
      });
      this.group.add(model);
    }
  }

  update(time: number) {
    for (const sails of this.spinning) sails.rotation.z = time * 0.6;
  }

  private part(
    geometry: BufferGeometry,
    material: Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    return mesh;
  }

  private build(prop: Prop, palette: Palette): Group | null {
    const m = this.materials;
    const group = new Group();
    const add = (mesh: Mesh) => group.add(mesh);
    const trunk = m.toon(palette.trunk);
    switch (prop.kind) {
      case 'poplar':
        add(this.part(SHAPES.trunk, trunk, 0, 1.5, 0, 1.2, 3, 1.2));
        add(this.part(SHAPES.ball, m.toon(palette.foliage[1]), 0, 8.5, 0, 1.9, 7, 1.9));
        return group;
      case 'oak':
        add(this.part(SHAPES.trunk, trunk, 0, 2, 0, 2, 4, 2));
        add(this.part(SHAPES.ball, m.toon(palette.foliage[2]), -1.4, 6, 0, 3.4, 3, 3.2));
        add(this.part(SHAPES.ball, m.toon(palette.foliage[1]), 1.6, 6.4, 0.6, 3, 2.8, 3));
        add(this.part(SHAPES.ball, m.toon(palette.foliage[0]), 0, 8.4, -0.4, 3.2, 2.6, 3));
        return group;
      case 'bush':
        add(this.part(SHAPES.ball, m.toon(palette.foliage[1]), 0, 1.1, 0, 2.6, 1.5, 2.2));
        return group;
      case 'haystack':
        add(this.part(SHAPES.cone, m.toon('#d9b45a'), 0, 2.4, 0, 2.4, 4.8, 2.4));
        return group;
      case 'fence':
        for (let post = -2; post <= 2; post++)
          add(this.part(SHAPES.box, trunk, post * 2, 0.9, 0, 0.3, 1.8, 0.3));
        add(this.part(SHAPES.box, trunk, 0, 1.3, 0, 8.4, 0.18, 0.18));
        add(this.part(SHAPES.box, trunk, 0, 0.7, 0, 8.4, 0.18, 0.18));
        return group;
      case 'farmhouse':
      case 'barn': {
        const barn = prop.kind === 'barn';
        const width = barn ? 9 : 7;
        const height = barn ? 4.5 : 4;
        add(
          this.part(
            SHAPES.box,
            m.toon(barn ? mix(palette.roof, palette.trunk, 0.5) : palette.wall),
            0,
            height / 2,
            0,
            width,
            height,
            5,
          ),
        );
        const roof = this.part(
          SHAPES.roof,
          m.toon(palette.roof),
          0,
          height + 1.4,
          0,
          3.2,
          width + 1.4,
          3.6,
        );
        roof.rotation.z = Math.PI / 2;
        add(roof);
        const lit = palette.daylight < 0.5;
        const window = m.toon(
          lit ? palette.window : palette.window,
          lit ? { emissive: palette.window } : {},
        );
        for (const offset of barn ? [0] : [-1.8, 1.8])
          add(this.part(SHAPES.box, window, offset, height - 1.6, 2.52, 1.1, 1.2, 0.05));
        return group;
      }
      case 'church':
        add(this.part(SHAPES.box, m.toon(palette.wall), -1, 2.5, 0, 8, 5, 5));
        add(this.part(SHAPES.box, m.toon(palette.wall), 3.5, 5, 0, 3, 10, 3));
        add(this.part(SHAPES.cone, m.toon(palette.roof), 3.5, 12.5, 0, 2.1, 5, 2.1));
        return group;
      case 'windmill': {
        add(this.part(SHAPES.cone, m.toon(palette.wall), 0, 4.5, 0, 2.6, 9, 2.6));
        const sails = new Group();
        sails.position.set(0, 9.2, 2.2);
        for (let sail = 0; sail < 4; sail++) {
          const blade = this.part(SHAPES.box, m.toon(palette.canvas), 0, 3.2, 0, 1.3, 6, 0.1);
          const arm = new Group();
          arm.rotation.z = (sail * Math.PI) / 2;
          arm.add(blade);
          sails.add(arm);
        }
        this.spinning.push(sails);
        group.add(sails);
        return group;
      }
      case 'stump': {
        const stem = this.part(SHAPES.trunk, m.toon(palette.trunk), 0, 2.5, 0, 1.6, 5, 1.6);
        stem.rotation.z = 0.08;
        add(stem);
        return group;
      }
      case 'wire':
        for (let coil = 0; coil < 5; coil++)
          add(this.part(SHAPES.coil, m.toon('#3a3530'), -4 + coil * 2, 1.1, 0, 1.1, 1, 1.1));
        return group;
      case 'tent': {
        // Lying along the depth, arched on top: radius becomes height and half the width.
        const tent = this.part(SHAPES.halfDrum, m.toon(palette.canvas), 0, 0, 0, 7, 14, 9);
        tent.rotation.set(0, Math.PI / 2, Math.PI / 2);
        add(tent);
        return group;
      }
      case 'windsock': {
        add(this.part(SHAPES.trunk, trunk, 0, 4, 0, 0.8, 8, 0.8));
        const sock = this.part(SHAPES.cone, m.toon('#e8582f'), 1.9, 7.4, 0, 0.7, 3.6, 0.7);
        sock.rotation.z = Math.PI / 2;
        add(sock);
        return group;
      }
      case 'balloon':
        this.buildBalloon(group, palette);
        return group;
      case 'sign': {
        add(this.part(SHAPES.box, trunk, 0, 2.5, 0, 0.6, 5, 0.6));
        add(this.part(SHAPES.box, m.toon(palette.accents[0]), -2, 4, 0.4, 3.8, 1.2, 0.2));
        add(this.part(SHAPES.box, m.toon(palette.accents[1]), 2, 2.4, 0.4, 3.8, 1.2, 0.2));
        return group;
      }
      case 'marquee': {
        const colour = m.toon(palette.festive[prop.variant % palette.festive.length] as string);
        add(this.part(SHAPES.box, m.toon(palette.wall), 0, 2, 0, 16, 4, 8));
        const roof = this.part(SHAPES.cone, colour, 0, 6.5, 0, 9, 5, 5.5);
        roof.rotation.y = Math.PI / 4;
        add(roof);
        add(this.part(SHAPES.trunk, trunk, 0, 9.5, 0, 0.5, 3, 0.5));
        return group;
      }
      case 'grandstand': {
        const seats = this.part(SHAPES.box, trunk, 0, 2.5, 0, 18, 5, 6);
        seats.rotation.x = -0.45;
        add(seats);
        for (let spectator = 0; spectator < 18; spectator++) {
          const colour = palette.festive[(spectator + prop.variant) % palette.festive.length];
          add(
            this.part(
              SHAPES.ball,
              m.toon(colour as string),
              -8 + (spectator % 9) * 2,
              3.4 + Math.floor(spectator / 9) * 1.8,
              1 - Math.floor(spectator / 9) * 1.6,
              0.5,
              0.6,
              0.5,
            ),
          );
        }
        add(this.part(SHAPES.box, m.toon(palette.roof), 0, 8, -1.5, 19, 0.5, 7));
        return group;
      }
      case 'bunting':
        for (const end of [-6, 6]) add(this.part(SHAPES.box, trunk, end, 2.25, 0, 0.3, 4.5, 0.3));
        for (let flag = 0; flag < 7; flag++) {
          const colour = palette.festive[flag % palette.festive.length] as string;
          const pennant = this.part(
            SHAPES.cone,
            m.toon(colour),
            -5.1 + flag * 1.7,
            3.6,
            0,
            0.6,
            1.3,
            0.1,
          );
          pennant.rotation.z = Math.PI;
          add(pennant);
        }
        return group;
      case 'ferris': {
        const wheel = new Group();
        wheel.position.set(0, 17, 0);
        const rim = this.part(SHAPES.coil, m.toon(palette.metal), 0, 0, 0, 14, 14, 14);
        wheel.add(rim);
        for (let car = 0; car < 10; car++) {
          const angle = (car / 10) * Math.PI * 2;
          const colour = palette.festive[car % palette.festive.length] as string;
          const lit = palette.daylight < 0.5 ? { emissive: colour } : {};
          wheel.add(
            this.part(
              SHAPES.box,
              m.toon(colour, lit),
              Math.cos(angle) * 14,
              Math.sin(angle) * 14,
              0,
              2,
              1.6,
              1.6,
            ),
          );
        }
        this.spinning.push(wheel);
        group.add(wheel);
        for (const leg of [-1, 1]) {
          const strut = this.part(SHAPES.box, m.toon(palette.metal), leg * 3, 8.5, 0, 0.5, 18, 0.5);
          strut.rotation.z = leg * 0.33;
          add(strut);
        }
        return group;
      }
    }
  }

  /** The theme's thing in the sky over the lines: a kite balloon, a cartoon blimp or a hot-air balloon. */
  private buildBalloon(group: Group, palette: Palette) {
    const m = this.materials;
    const height = 120;
    group.add(this.part(SHAPES.box, m.toon(palette.ink), 0, height / 2, 0, 0.12, height, 0.12));
    if (palette.theme === 'airshow') {
      palette.festive.forEach((colour, index) => {
        const share = 1 - index / palette.festive.length;
        group.add(this.part(SHAPES.ball, m.toon(colour), 0, height + 4, 0, 6 * share + 0.3, 7, 6));
      });
      group.add(this.part(SHAPES.box, m.toon(palette.trunk), 0, height - 4.5, 0, 2.4, 1.6, 2.4));
      return;
    }
    const body =
      palette.theme === 'cyan-magenta'
        ? mix(palette.accents[1], palette.wall, 0.25)
        : mix(palette.canvas, palette.haze, 0.2);
    group.add(this.part(SHAPES.ball, m.toon(body), 0, height, 0, 7, 2.6, 2.6));
    group.add(
      this.part(SHAPES.ball, m.toon(palette.canvasShade), -6, height + 1.6, 0, 1.8, 0.9, 0.4),
    );
  }

  dispose() {
    this.group.clear();
  }
}
