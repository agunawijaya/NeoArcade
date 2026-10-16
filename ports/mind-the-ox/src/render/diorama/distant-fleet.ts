import { createRng } from '@shared/rng';
import {
  AdditiveBlending,
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  Mesh,
  Shape,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { ShipKind } from '../../engine/fleet';
import type { Sea } from '../../engine/map';
import type { Palette } from '../palette';
import { shipLayout, type ShipLayout } from '../ship-shapes';
import { mix } from '../side/colour';
import type { MaterialCache } from './materials';
import { seaSurfaceAt, seaWetness } from './sea';
import { BOX, DRUM, block } from './shapes';

/**
 * Ships far out to sea behind the line of play, so the fleets recede into
 * the distance: a few hulls of each side steaming slowly along the
 * horizon and back, hazed by the air between. They are scenery, placed
 * from the map's seed; the game never knows they are there.
 */

/** How far behind the line of play they steam, world units. */
const DEPTH = { near: 520, far: 1150 };
/** One ship for every so much open water, and no more than this on one stretch. */
const SEA_PER_SHIP = 650;
const MOST_ON_A_STRETCH = 4;
/** Kept this far inside the ends of the water, where it runs back to the horizon. */
const OFFING = 180;
/** Their pace along the horizon, world units a second. */
const PACE = 5;
/** The nearest of them takes on this much of the haze, the farthest this much. */
const HAZE = { near: 0.25, far: 0.6 };
const KINDS: readonly ShipKind[] = ['battleship', 'cruiser', 'destroyer', 'destroyer', 'supply'];

interface DistantShip {
  group: Group;
  left: number;
  span: number;
  /** Where along its run it starts, as a share of a there-and-back. */
  phase: number;
}

export class DistantFleet {
  readonly group = new Group();
  private readonly ships: DistantShip[] = [];
  private readonly owned: { dispose(): void }[] = [];

  constructor(sea: Sea, seed: number, materials: MaterialCache, palette: Palette) {
    const rng = createRng(`mind-the-ox:distant-fleet:${seed}`);
    const lamp = palette.daylight < 0.5 ? lampMaterial() : null;
    if (lamp) this.owned.push(lamp, lamp.map as CanvasTexture);
    for (const span of sea.spans) {
      const left = span.left + OFFING;
      const right = span.right - OFFING;
      if (right - left < SEA_PER_SHIP || seaWetness(sea, (left + right) / 2) < 1) continue;
      const count = Math.min(MOST_ON_A_STRETCH, Math.floor((right - left) / SEA_PER_SHIP));
      for (let index = 0; index < count; index++) {
        const kind = rng.pick(KINDS);
        const depth = rng.float(DEPTH.near, DEPTH.far);
        const haze =
          HAZE.near + ((HAZE.far - HAZE.near) * (depth - DEPTH.near)) / (DEPTH.far - DEPTH.near);
        const side = rng.chance(0.5) ? 0 : 1;
        const group = this.silhouette(kind, side, haze, materials, palette, lamp);
        group.position.set(0, seaSurfaceAt(sea.level, -depth), -depth);
        this.group.add(group);
        // Each starts on its own stretch of the run, so they never bunch up.
        this.ships.push({ group, left, span: right - left, phase: (index + rng.next()) / count });
      }
    }
  }

  /** Along the horizon and back, turning at the ends of the water. */
  update(time: number) {
    for (const ship of this.ships) {
      const run = (time * PACE) / ship.span + ship.phase * 2;
      const leg = run % 2;
      const along = leg < 1 ? leg : 2 - leg;
      ship.group.position.x = ship.left + ship.span * along;
      ship.group.rotation.y = leg < 1 ? 0 : Math.PI;
    }
  }

  /** The ship's shape as the eye makes it out at this distance: hull, houses, funnels and masts, no detail. */
  private silhouette(
    kind: ShipKind,
    side: 0 | 1,
    haze: number,
    materials: MaterialCache,
    palette: Palette,
    lamp: SpriteMaterial | null,
  ): Group {
    const layout = shipLayout(kind);
    const fleet = palette.navy[side];
    const hazed = (colour: string) => materials.toon(mix(colour, palette.haze, haze));
    const beam = layout.length * 0.13;
    const group = new Group();
    const hull = new Mesh(hullGeometry(layout, beam), hazed(fleet.hull));
    this.owned.push(hull.geometry);
    group.add(hull);
    const deck = layout.freeboard;
    for (const house of layout.houses)
      group.add(
        quiet(
          block(
            BOX,
            hazed(fleet.superstructure),
            house.at,
            deck + house.height / 2,
            0,
            house.width,
            house.height,
            beam * 0.6,
          ),
        ),
      );
    for (const funnel of layout.funnels)
      group.add(
        quiet(
          block(
            DRUM,
            hazed(fleet.funnel),
            funnel.at,
            deck + funnel.height / 2,
            0,
            funnel.width / 2,
            funnel.height,
            funnel.width / 2,
          ),
        ),
      );
    for (const mast of layout.masts) {
      group.add(
        quiet(
          block(BOX, hazed(fleet.trim), mast.at, deck + mast.height / 2, 0, 0.5, mast.height, 0.5),
        ),
      );
      if (lamp) {
        const light = new Sprite(lamp);
        light.position.set(mast.at, deck + mast.height + 0.5, 0);
        light.scale.set(5, 5, 1);
        group.add(light);
      }
    }
    return group;
  }

  dispose() {
    for (const item of this.owned) item.dispose();
    this.group.clear();
  }
}

/** The hull side-on, raked at the bow, given a little breadth so it catches the light. */
function hullGeometry(layout: ShipLayout, beam: number): ExtrudeGeometry {
  const half = layout.length / 2;
  const outline = new Shape();
  outline.moveTo(-half + 3, -layout.draft * 0.5);
  outline.lineTo(half - layout.bowRake - 2, -layout.draft * 0.5);
  outline.lineTo(half, layout.freeboard + layout.sheer);
  outline.lineTo(-half, layout.freeboard);
  outline.closePath();
  const geometry = new ExtrudeGeometry(outline, { depth: beam, bevelEnabled: false });
  geometry.translate(0, 0, -beam / 2);
  return geometry;
}

/** Too far off to cast a shadow anyone could see. */
function quiet(mesh: Mesh): Mesh {
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** A masthead light, a soft white point, for ships at sea by night. */
function lampMaterial(): SpriteMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, 'rgba(255, 250, 230, 1)');
    glow.addColorStop(0.35, 'rgba(255, 250, 230, 0.4)');
    glow.addColorStop(1, 'rgba(255, 250, 230, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new SpriteMaterial({
    map: new CanvasTexture(canvas),
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}
