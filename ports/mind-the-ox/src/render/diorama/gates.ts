import { Group, Mesh, MeshBasicMaterial, TorusGeometry, type Material } from 'three';
import type { World } from '../../engine/world';
import type { Palette } from '../palette';
import { gateColours } from '../side/gates';
import type { MaterialCache } from './materials';
import { BALL, DRUM, block } from './shapes';

interface GateModel {
  group: Group;
  ring: Mesh;
  bright: Material;
}

/**
 * The gates in the diorama: rings standing across the line of play, to be
 * flown through, each on a tether down to its float. The next is bright
 * and slowly turns; the ones after it are faint; passed ones are gone.
 */
export class GateModels {
  readonly group = new Group();
  private readonly models: GateModel[] = [];
  private readonly faint: MeshBasicMaterial;

  constructor(world: World, materials: MaterialCache, palette: Palette) {
    const { ring, band } = gateColours(palette);
    this.faint = new MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.35 });
    for (const gate of world.map.gates) {
      const group = new Group();
      const radius = (gate.top - gate.bottom) / 2;
      const bright = materials.toon(ring);
      const ringMesh = new Mesh(new TorusGeometry(radius, 0.7, 8, 32), bright);
      // Across the line of play: the plane flies through it along x.
      ringMesh.rotation.y = Math.PI / 2;
      ringMesh.position.set(gate.x, gate.bottom + radius, 0);
      ringMesh.castShadow = true;
      const ground = world.terrain.heightAt(gate.x);
      group.add(
        ringMesh,
        block(
          DRUM,
          materials.toon(band),
          gate.x,
          (gate.bottom + ground) / 2,
          0,
          0.12,
          gate.bottom - ground,
          0.12,
        ),
        block(BALL, materials.toon(band), gate.x, ground + 0.4, 0, 1.6, 0.9, 1.6),
      );
      this.models.push({ group, ring: ringMesh, bright });
      this.group.add(group);
    }
  }

  update(world: World, time: number) {
    this.models.forEach((model, index) => {
      model.group.visible = index >= world.gatesPassed;
      const next = index === world.gatesPassed;
      model.ring.rotation.x = next ? Math.sin(time * 1.5) * 0.25 : 0;
      model.ring.scale.setScalar(next ? 1 + Math.sin(time * 3) * 0.03 : 1);
      model.ring.material = next ? model.bright : this.faint;
    });
  }

  dispose() {
    for (const model of this.models) model.ring.geometry.dispose();
    this.faint.dispose();
    this.group.clear();
  }
}
