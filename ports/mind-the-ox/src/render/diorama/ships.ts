import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type MeshToonMaterial,
  Quaternion,
  SRGBColorSpace,
  Shape,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Material,
} from 'three';
import { wireWindow } from '../../engine/deck';
import { SHIP_CLASSES, type ShipKind } from '../../engine/fleet';
import type { Plane, Ship, ShipWound, World } from '../../engine/world';
import type { Fleet, Palette } from '../palette';
import {
  alongShip,
  deckOver,
  forecastleOf,
  shipLayout,
  type Block,
  type Funnel,
  type Island,
  type Mast,
  type ShipLayout,
  type Turret,
} from '../ship-shapes';
import { burningHeight, damageAttitude, isBurning, woundHash } from '../ship-damage';
import { mix, shade, withAlpha } from '../side/colour';
import { SINKING_LIST, landingCue, paintDazzle, paintScuttles } from '../side/ships';
import { paintDeckEdgeSoot, paintDeckPlanWounds, paintHullWounds } from '../side/wounds';
import type { Rescue } from '../view';
import { fadingToon, paintedToon, type MaterialCache } from './materials';
import { BALL, BOX, DRUM, block } from './shapes';

/**
 * The ships in the diorama, built from the same layouts the side view
 * draws: a lofted hull with its side painted (dazzle and all), the boot
 * topping below the waterline, and the decks, turrets, funnels and masts
 * standing on it. Through a turn a ship swings away from the camera, its
 * bow out to sea, so nothing of it comes forward of the cut-away. A carrier
 * carries its flight deck, wires, deck lights and the signalman. Every
 * heavy blow is painted onto the side or the deck where it landed, and the
 * hull trims and lists as it floods.
 */

/** How broad each class is; the side view never needed it. */
const BEAM: Readonly<Record<ShipKind, number>> = {
  carrier: 16,
  battleship: 20,
  cruiser: 12,
  destroyer: 7,
  supply: 12,
  'torpedo-boat': 4,
  monitor: 18,
};
const STATIONS = 26;
/** Pixels per world unit on a hull's painted side. */
const HULL_PIXELS = 8;
/** The carrier's flight deck: wider than the hull, and this thick. */
const FLIGHT_DECK_HALF_WIDTH = 10;
const FLIGHT_DECK_THICKNESS = 0.9;
const DECK_PIXELS = 10;
const LIGHT_SPACING = 9;
/** The wake behind a ship at full speed, world units. */
const WAKE_LENGTH = 70;
/** An island in front of a plane fades to this, so the plane is never lost behind it. */
const ISLAND_SEEN_THROUGH = 0.3;
/** Tongues of flame at each burning wound, and how tall they stand, world units. */
const TONGUES = 3;
const FLAME_HEIGHT = 5.5;

interface ShipModel {
  root: Group;
  /** Lists and pitches inside the root, which turns and rides the swell. */
  hull: Group;
  wake: Mesh;
  bowWave: Mesh;
  ensign: Group;
  signalman: Signalman | null;
  island: IslandModel | null;
  /** The paintings that carry the wounds, and how many wounds they show so far. */
  scarred: ScarredPaint[];
  scars: number;
  /** For each wound, its tongues of flame. */
  flames: Sprite[][];
  owned: { dispose(): void }[];
}

interface ScarredPaint {
  texture: CanvasTexture;
  repaint(): void;
}

interface IslandModel {
  layout: Island;
  materials: MeshToonMaterial[];
  opacity: number;
}

interface Signalman {
  arms: [Group, Group];
  flags: Mesh[];
}

interface Boat {
  group: Group;
  pilot: Group;
  boat: Group;
  passenger: Mesh;
}

export class ShipModels {
  readonly group = new Group();
  private readonly models = new Map<number, ShipModel>();
  private readonly boats: Boat[] = [];
  private readonly glow = glowTexture();
  private readonly flame: SpriteMaterial;
  private readonly scorch: MeshBasicMaterial;
  private readonly scorchDisc = new CircleGeometry(1, 14);

  constructor(
    private readonly materials: MaterialCache,
    private readonly palette: Palette,
  ) {
    this.flame = new SpriteMaterial({
      map: flameTexture(palette),
      transparent: true,
      depthWrite: false,
    });
    this.scorch = new MeshBasicMaterial({
      color: mix(palette.scorch, '#000000', 0.45),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
  }

  update(world: World, focus: Plane | null, rescues: readonly Rescue[], time: number) {
    for (const ship of world.ships) {
      let model = this.models.get(ship.id);
      if (!model) {
        model = this.build(world, ship);
        this.models.set(ship.id, model);
        this.group.add(model.root);
      }
      model.root.visible = ship.state !== 'sunk' && !ship.escaped;
      if (!model.root.visible) continue;
      if (model.scars !== ship.wounds.length) this.scar(ship, model);
      this.pose(world, ship, model, focus, time);
      if (model.island) seeThroughIsland(world, ship, model.island);
    }
    this.placeBoats(world, rescues, time);
  }

  /** New wounds: repaint the side and deck with their marks, and give each its fire and scorching. */
  private scar(ship: Ship, model: ShipModel) {
    for (const paint of model.scarred) {
      paint.repaint();
      paint.texture.needsUpdate = true;
    }
    for (let index = model.scars; index < ship.wounds.length; index++) {
      const wound = ship.wounds[index] as ShipWound;
      const flames = Array.from({ length: TONGUES }, () => new Sprite(this.flame));
      for (const flame of flames) model.hull.add(flame);
      model.flames.push(flames);
      if (ship.kind !== 'carrier' && wound.cause !== 'torpedo') this.scorchDeck(ship, wound, model);
    }
    model.scars = ship.wounds.length;
  }

  /** A blackened patch on the deck under a burst; a carrier's are painted into its flight deck. */
  private scorchDeck(ship: Ship, wound: ShipWound, model: ShipModel) {
    const patch = new Mesh(this.scorchDisc, this.scorch);
    const radius = Math.min(4.5, BEAM[ship.kind] * 0.4);
    patch.scale.set(radius * 1.3, radius, 1);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(wound.along, deckOver(ship.kind, wound.along) + 0.06, 0);
    model.hull.add(patch);
  }

  /** Each burning wound's tongues of flame, flickering, on the near side so nothing hides them. */
  private burn(world: World, ship: Ship, model: ShipModel, time: number) {
    const near = BEAM[ship.kind] * 0.35;
    ship.wounds.forEach((wound, index) => {
      const burning = isBurning(ship, wound, world.tick);
      const base = burningHeight(ship, wound);
      (model.flames[index] ?? []).forEach((flame, tongue) => {
        flame.visible = burning;
        if (!burning) return;
        const flicker = Math.sin(time * (11 + tongue * 3) + index * 2.1 + tongue);
        const height = FLAME_HEIGHT * (0.75 + tongue * 0.12 + flicker * 0.18);
        const width = height * 0.5;
        const along =
          wound.along + (tongue - 1) * 1.8 + (woundHash(ship, index, tongue + 80) - 0.5);
        flame.scale.set(width, height, 1);
        flame.position.set(along, base + height * 0.42, near);
      });
    });
  }

  private pose(world: World, ship: Ship, model: ShipModel, focus: Plane | null, time: number) {
    const layout = shipLayout(ship.kind);
    const yaw = yawOf(ship);
    model.root.position.set(ship.x, ship.y, -(layout.length / 2) * Math.abs(Math.sin(yaw)));
    model.root.rotation.y = yaw;
    const attitude = damageAttitude(ship);
    model.hull.rotation.z = ship.sinking * SINKING_LIST - attitude.trim;
    model.hull.rotation.x = ship.sinking * 0.22 + attitude.list;

    const pace = ship.state === 'afloat' ? Math.min(1.4, ship.speed / 1.2) : 0;
    const sea = world.map.sea?.level ?? ship.y;
    model.wake.visible = pace > 0.05;
    model.wake.position.set(-layout.length / 2 + 2, sea - ship.y + 0.15, 0);
    model.wake.scale.set(WAKE_LENGTH * pace, 1, Math.min(6, BEAM[ship.kind] * 0.4));
    (model.wake.material as MeshBasicMaterial).opacity = Math.min(0.85, pace);
    model.bowWave.visible = pace > 0.05;
    model.bowWave.scale.set(
      1.5 + pace * 3,
      0.5 + Math.sin(time * 4 + ship.index) * 0.1,
      BEAM[ship.kind] * 0.25,
    );
    model.ensign.rotation.y = Math.sin(time * 5 + ship.index) * 0.35;
    this.burn(world, ship, model, time);

    if (model.signalman) {
      const cue = landingCue(ship, focus);
      const lift = cue === null ? -1.1 : cue === 'high' ? 0.9 : cue === 'low' ? -0.9 : 0;
      model.signalman.arms[0].rotation.z = lift;
      model.signalman.arms[1].rotation.z = -lift;
      for (const flag of model.signalman.flags) {
        flag.visible = cue !== null;
        (flag.material as MeshBasicMaterial).color.set(cue === 'on' ? '#7dff9a' : '#ffb43c');
      }
    }
  }

  private build(world: World, ship: Ship): ShipModel {
    const layout = shipLayout(ship.kind);
    const fleet = this.palette.navy[ship.side];
    const owned: { dispose(): void }[] = [];
    const root = new Group();
    const hull = new Group();
    root.add(hull);

    const sidePaint = hullSidePaint(ship, layout, fleet, this.palette);
    const scarred = [sidePaint];
    const side = paintedToon(sidePaint.texture);
    owned.push(side, sidePaint.texture);
    const geometry = hullGeometry(ship.kind);
    owned.push(geometry);
    const hullMesh = new Mesh(geometry, [
      side,
      this.materials.toon(fleet.boot),
      this.materials.toon(ship.kind === 'carrier' ? fleet.hullShade : fleet.deck),
      this.materials.toon(fleet.hullShade),
    ]);
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    hull.add(hullMesh);

    const foam = new MeshBasicMaterial({
      color: this.palette.sea.foam,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    owned.push(foam);
    const bowWave = new Mesh(BALL, foam);
    bowWave.position.set(layout.length / 2 - layout.bowRake * 0.55, 0.1, 0);
    hull.add(bowWave);
    const wake = wakeMesh(this.palette.sea.foam);
    owned.push(wake.geometry, wake.material as Material);
    root.add(wake);

    let signalman: Signalman | null = null;
    let island: IslandModel | null = null;
    const stern = -layout.length / 2;
    if (ship.kind === 'carrier') {
      hull.add(this.flightDeck(world, ship, fleet, owned, scarred));
      signalman = this.signalman(hull, layout);
      if (layout.island) {
        island = this.island(layout.island, layout.freeboard, fleet, hull);
        owned.push(...island.materials);
      }
    } else {
      this.warship(ship, layout, fleet, hull);
    }
    const ensign =
      ship.kind === 'carrier'
        ? this.ensign(ship, stern + 1, layout.freeboard, hull)
        : this.ensign(ship, stern + 2, deckOver(ship.kind, stern), hull);
    return {
      root,
      hull,
      wake,
      bowWave,
      ensign,
      signalman,
      island,
      scarred,
      scars: 0,
      flames: [],
      owned,
    };
  }

  private warship(ship: Ship, layout: ShipLayout, fleet: Fleet, hull: Group) {
    const beam = BEAM[ship.kind];
    for (const house of layout.houses) hull.add(this.house(house, fleet, ship.kind, beam));
    for (const funnel of layout.funnels) hull.add(this.funnel(funnel, fleet, ship.kind));
    // At the Airshow the guns are bullseye boards for the flour bags.
    for (const turret of layout.turrets)
      hull.add(
        this.palette.theme === 'airshow'
          ? this.bullseye(turret, ship.kind)
          : this.turret(turret, fleet, ship.kind),
      );
    for (const mast of layout.masts) hull.add(this.mast(mast, fleet, layout, ship.kind, beam));
    const lamp = SHIP_CLASSES[ship.kind].searchlight;
    if (lamp) hull.add(this.searchlightLamp(ship, lamp, fleet));
    if (this.palette.daylight < 0.5) this.runningLights(layout, ship.kind, beam, hull);
  }

  private house(house: Block, fleet: Fleet, kind: ShipKind, beam: number): Group {
    const deck = deckOver(kind, house.at);
    const group = new Group();
    const width = beam * 0.5;
    group.add(
      block(
        BOX,
        this.materials.toon(fleet.superstructure),
        house.at,
        deck + house.height / 2,
        0,
        house.width,
        house.height,
        width,
      ),
    );
    group.add(
      block(
        BOX,
        this.materials.toon(fleet.trim),
        house.at,
        deck + house.height + 0.25,
        0,
        house.width + 0.8,
        0.5,
        width + 0.8,
      ),
    );
    // A row of windows on the side facing us, lit by night.
    const night = this.palette.daylight < 0.5;
    group.add(
      block(
        BOX,
        night
          ? this.materials.toon(this.palette.window, { emissive: this.palette.window })
          : this.materials.toon(shade(fleet.trim, 0.1)),
        house.at,
        deck + house.height - 1.6,
        width / 2 + 0.05,
        house.width - 2,
        Math.min(1.4, house.height * 0.35),
        0.1,
      ),
    );
    return group;
  }

  private funnel(funnel: Funnel, fleet: Fleet, kind: ShipKind): Group {
    const group = new Group();
    group.position.set(funnel.at, deckOver(kind, funnel.at), 0);
    // Raked aft: the top leans towards the stern.
    group.rotation.z = Math.atan2(funnel.rake, funnel.height);
    const radius = funnel.width / 2;
    const { height } = funnel;
    group.add(
      block(
        DRUM,
        this.materials.toon(fleet.funnel),
        0,
        height / 2,
        0,
        radius,
        height,
        radius * 0.85,
      ),
    );
    group.add(
      block(
        DRUM,
        this.materials.toon(fleet.funnelBand),
        0,
        height * 0.82 - 0.6,
        0,
        radius + 0.06,
        1.2,
        radius * 0.85 + 0.06,
      ),
    );
    group.add(
      block(
        DRUM,
        this.materials.toon(shade(fleet.funnel, -0.3)),
        0,
        height,
        0,
        radius + 0.3,
        0.8,
        radius * 0.85 + 0.3,
      ),
    );
    group.add(
      block(
        DRUM,
        this.materials.toon('#1c1a18'),
        0,
        height + 0.41,
        0,
        radius - 0.2,
        0.02,
        radius * 0.85 - 0.2,
      ),
    );
    return group;
  }

  private turret(turret: Turret, fleet: Fleet, kind: ShipKind): Group {
    const group = new Group();
    const deck = deckOver(kind, turret.at);
    group.position.set(turret.at, deck + turret.raised, 0);
    group.scale.x = turret.facing;
    const { size } = turret;
    const height = size * 0.42;
    if (turret.raised > 0)
      group.add(
        block(
          DRUM,
          this.materials.toon(shade(fleet.hullShade, 0.06)),
          0,
          -turret.raised / 2,
          0,
          size * 0.4,
          turret.raised + 0.4,
          size * 0.4,
        ),
      );
    group.add(
      block(
        BOX,
        this.materials.toon(fleet.superstructure),
        0,
        height / 2,
        0,
        size,
        height,
        size * 0.75,
      ),
    );
    // Two barrels out over the end of the ship, cocked up a little.
    const barrel = this.materials.toon(shade(fleet.superstructure, -0.35));
    const length = size * 1.25;
    for (const across of [-1, 1]) {
      const gun = block(
        DRUM,
        barrel,
        size * 0.35 + length / 2,
        height * 0.45 + 0.4,
        across * size * 0.18,
        size * 0.045,
        length,
        size * 0.045,
      );
      gun.rotation.z = -Math.PI / 2 + 0.07;
      group.add(gun);
    }
    return group;
  }

  /** A round target board on a post, facing the camera, in red and white rings. */
  private bullseye(turret: Turret, kind: ShipKind): Group {
    const group = new Group();
    const radius = Math.max(2.4, turret.size * 0.5);
    const deck = deckOver(kind, turret.at) + turret.raised;
    const centre = deck + radius + 1.2;
    group.add(
      block(
        BOX,
        this.materials.toon(this.palette.ink),
        turret.at,
        (deck + centre) / 2,
        0,
        0.3,
        centre - deck,
        0.3,
      ),
    );
    ['#e2483c', '#f4efe2', '#e2483c', '#f4efe2'].forEach((colour, ring) => {
      const disc = block(
        DRUM,
        this.materials.toon(colour),
        turret.at,
        centre,
        0.3 + ring * 0.06,
        radius * (1 - ring * 0.24),
        0.2,
        radius * (1 - ring * 0.24),
      );
      disc.rotation.x = Math.PI / 2;
      group.add(disc);
    });
    return group;
  }

  private mast(mast: Mast, fleet: Fleet, layout: ShipLayout, kind: ShipKind, beam: number): Group {
    const group = new Group();
    const half = layout.length / 2;
    const deck = deckOver(kind, mast.at);
    const top = deck + mast.height;
    const trim = this.materials.toon(fleet.trim);
    group.add(rod(trim, [mast.at, deck, 0], [mast.at, top, 0], 0.35));
    if (mast.tripod) {
      for (const across of [-1, 1])
        group.add(
          rod(
            trim,
            [mast.at - 2.5, deck, across * beam * 0.2],
            [mast.at, deck + mast.height * 0.65, 0],
            0.25,
          ),
        );
      group.add(
        block(BOX, this.materials.toon(fleet.superstructure), mast.at, top - 4.3, 0, 4.4, 2.6, 4.4),
      );
    }
    group.add(block(BOX, trim, mast.at, top - 2.5, 0, 0.3, 0.3, beam * 0.7));
    // Stays down to the deck fore and aft, inside the hull's ends.
    for (const end of [Math.min(mast.at + 16, half - 3), Math.max(mast.at - 16, -half + 3)])
      group.add(rod(trim, [mast.at, top, 0], [end, deckOver(kind, end), 0], 0.08));
    return group;
  }

  /** The searchlight's drum on its platform up the foremast; an enemy's burns at night, where its beam starts. */
  private searchlightLamp(
    ship: Ship,
    lamp: { along: number; height: number },
    fleet: Fleet,
  ): Group {
    const group = new Group();
    group.add(
      block(BOX, this.materials.toon(fleet.trim), lamp.along, lamp.height - 1.3, 0, 4, 0.3, 4),
    );
    group.add(
      block(DRUM, this.materials.toon(fleet.superstructure), lamp.along, lamp.height, 0, 2, 2.2, 2),
    );
    if (ship.side === 1 && this.palette.daylight < 0.5)
      group.add(this.light('#fff6d6', lamp.along, lamp.height, 1.1, 7));
    return group;
  }

  /** Masthead and side lights at night: white aloft, red and green on either beam. */
  private runningLights(layout: ShipLayout, kind: ShipKind, beam: number, hull: Group) {
    const bridge = layout.length / 2 - 13;
    const deck = deckOver(kind, bridge) + 1.5;
    const lights: [number, number, number, string][] = [
      [bridge, deck, beam / 2, '#ff5a4a'],
      [bridge, deck, -beam / 2, '#5aff8a'],
    ];
    const mast = layout.masts[0];
    if (mast) lights.push([mast.at, deckOver(kind, mast.at) + mast.height, 0, '#fff6d8']);
    for (const [x, y, z, colour] of lights) hull.add(this.light(colour, x, y, z, 5));
  }

  /** A small lamp and its halo. */
  private light(colour: string, x: number, y: number, z: number, halo: number): Group {
    const group = new Group();
    group.position.set(x, y, z);
    const lamp = new Mesh(BALL, this.materials.toon(colour, { emissive: colour }));
    lamp.scale.setScalar(0.35);
    const glow = new Sprite(
      new SpriteMaterial({
        map: this.glow,
        color: colour,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.scale.set(halo, halo, 1);
    group.add(lamp, glow);
    return group;
  }

  /** The ensign on its staff at the stern, in the side's colours; returns the flag, to stir in the breeze. */
  private ensign(ship: Ship, x: number, deck: number, hull: Group): Group {
    const fleet = this.palette.navy[ship.side];
    hull.add(rod(this.materials.toon(fleet.trim), [x, deck, 0], [x, deck + 7, 0], 0.15));
    const flag = new Group();
    flag.position.set(x, deck + 5.7, 0);
    flag.add(
      block(BOX, this.materials.toon(this.palette.accents[ship.side]), -2, 0, 0, 4, 2.6, 0.12),
    );
    flag.add(
      block(BOX, this.materials.toon(this.palette.festive[1] ?? '#ffffff'), -2, 0, 0, 4, 0.5, 0.16),
    );
    hull.add(flag);
    return flag;
  }

  /**
   * The flight deck laid over the hull from end to end: planked, striped
   * on the round-down, the wires across it, the lifts' outlines, and its
   * lights along both edges.
   */
  private flightDeck(
    world: World,
    ship: Ship,
    fleet: Fleet,
    owned: { dispose(): void }[],
    scarred: ScarredPaint[],
  ): Group {
    const layout = shipLayout(ship.kind);
    const half = layout.length / 2;
    const stern = -half - 1;
    const bow = half - 3;
    const width = FLIGHT_DECK_HALF_WIDTH;
    const outline = new Shape();
    outline.moveTo(stern, -width + 1);
    outline.lineTo(stern + 2, -width);
    outline.lineTo(bow - 22, -width);
    outline.lineTo(bow, -width * 0.45);
    outline.lineTo(bow, width * 0.45);
    outline.lineTo(bow - 22, width);
    outline.lineTo(stern + 2, width);
    outline.lineTo(stern, width - 1);
    outline.closePath();
    const geometry = new ExtrudeGeometry(outline, {
      depth: FLIGHT_DECK_THICKNESS,
      bevelEnabled: false,
    });
    // Lay it flat, its top at the deck's height, and map the painting over the top.
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, layout.freeboard - FLIGHT_DECK_THICKNESS, 0);
    const positions = geometry.getAttribute('position') as BufferAttribute;
    const uvs = geometry.getAttribute('uv') as BufferAttribute;
    for (let index = 0; index < positions.count; index++)
      uvs.setXY(
        index,
        (positions.getX(index) - stern) / (bow - stern),
        (positions.getZ(index) + width) / (width * 2),
      );
    const deckPaint = flightDeckPaint(world, ship, layout, fleet, this.palette, stern, bow);
    scarred.push(deckPaint);
    const top = paintedToon(deckPaint.texture);
    owned.push(geometry, top, deckPaint.texture);
    const deck = new Mesh(geometry, [top, this.materials.toon(shade(fleet.deck, -0.3))]);
    deck.castShadow = true;
    deck.receiveShadow = true;
    const group = new Group();
    group.add(deck);

    this.deckLights(world, layout, group);
    return group;
  }

  /** Along both edges: by night all glowing, by day only those over the wires, and only for the assist. */
  private deckLights(world: World, layout: ShipLayout, group: Group) {
    const night = this.palette.daylight < 0.5;
    const assist = world.rules.landingAssist;
    if (!night && !assist) return;
    const wires = wireWindow(world);
    const stern = -layout.length / 2;
    for (let offset = 2.5; offset < layout.length - 4; offset += LIGHT_SPACING) {
      const overWires = offset >= wires.first - 1 && offset <= wires.last + 1;
      if (!night && !overWires) continue;
      const colour = overWires && assist ? '#7dff9a' : '#fff1c8';
      const island = layout.island;
      const underIsland =
        island !== null && Math.abs(stern + offset - island.at) < island.length / 2 + 1;
      // Starboard is +z, where the island stands on the edge.
      for (const across of underIsland ? [-1] : [-1, 1])
        group.add(
          this.light(
            colour,
            stern + offset,
            layout.freeboard + 0.2,
            across * (FLIGHT_DECK_HALF_WIDTH - 0.4),
            night ? 3.2 : 1.8,
          ),
        );
    }
  }

  /**
   * The island on the starboard edge: the house with its scuttles, the
   * bridge on the roof with wings out over the deck, the funnel and the
   * tripod mast. Its materials are its own, to fade when a plane is behind it.
   */
  private island(island: Island, deck: number, fleet: Fleet, hull: Group): IslandModel {
    const night = this.palette.daylight < 0.5;
    const wall = fadingToon(fleet.superstructure);
    const trim = fadingToon(fleet.trim);
    const funnelPaint = fadingToon(fleet.funnel);
    const band = fadingToon(fleet.funnelBand);
    const glass = night
      ? fadingToon(this.palette.window, this.palette.window)
      : fadingToon(shade(fleet.trim, 0.1));
    const group = new Group();
    group.position.set(0, deck, FLIGHT_DECK_HALF_WIDTH - island.width / 2 - 0.4);
    const { height, width, bridge, funnel, mast } = island;
    group.add(block(BOX, wall, island.at, height / 2, 0, island.length, height, width));
    group.add(block(BOX, trim, island.at, height + 0.2, 0, island.length + 0.4, 0.4, width + 0.4));
    for (const side of [-1, 1])
      group.add(
        block(
          BOX,
          glass,
          island.at - 1,
          height * 0.55,
          side * (width / 2 + 0.05),
          island.length - 5,
          0.8,
          0.1,
        ),
      );
    // The bridge, its wings reaching out to either side.
    const bridgeY = height + bridge.height / 2;
    group.add(block(BOX, wall, bridge.at, bridgeY, 0, bridge.width, bridge.height, width + 2.4));
    group.add(
      block(
        BOX,
        trim,
        bridge.at,
        height + bridge.height + 0.2,
        0,
        bridge.width + 0.6,
        0.4,
        width + 2.8,
      ),
    );
    for (const side of [-1, 1])
      group.add(
        block(
          BOX,
          glass,
          bridge.at,
          bridgeY + 0.3,
          side * (width / 2 + 1.25),
          bridge.width - 1.6,
          0.9,
          0.1,
        ),
      );
    group.add(
      block(
        BOX,
        glass,
        bridge.at + bridge.width / 2 + 0.05,
        bridgeY + 0.3,
        0,
        0.1,
        0.9,
        width + 1.6,
      ),
    );
    // The funnel aft, raked.
    const stack = new Group();
    stack.position.set(funnel.at, height, 0);
    stack.rotation.z = Math.atan2(funnel.rake, funnel.height);
    const radius = funnel.width / 2;
    stack.add(
      block(DRUM, funnelPaint, 0, funnel.height / 2, 0, radius, funnel.height, radius * 0.7),
    );
    stack.add(
      block(DRUM, band, 0, funnel.height * 0.82 - 0.6, 0, radius + 0.06, 1.2, radius * 0.7 + 0.06),
    );
    stack.add(block(DRUM, trim, 0, funnel.height, 0, radius + 0.3, 0.8, radius * 0.7 + 0.3));
    group.add(stack);
    // The tripod mast over the bridge, with its yard across.
    const roof = height + bridge.height;
    const top = roof + mast.height;
    group.add(rod(trim, [mast.at, roof, 0], [mast.at, top, 0], 0.3));
    for (const side of [-1, 1])
      group.add(
        rod(trim, [mast.at - 2, roof, side * 1.4], [mast.at, roof + mast.height * 0.6, 0], 0.22),
      );
    group.add(block(BOX, trim, mast.at, top - 2, 0, 0.3, 0.3, 6));
    if (night) group.add(this.light('#fff6d8', mast.at, top + 0.4, 0, 5));
    hull.add(group);
    return { layout: island, materials: [wall, trim, funnelPaint, band, glass], opacity: 1 };
  }

  /** The signalman at the stern on the port edge, opposite the island, a flag in each hand. */
  private signalman(hull: Group, layout: ShipLayout): Signalman {
    const ink = this.materials.toon(this.palette.ink);
    const figure = new Group();
    figure.position.set(-layout.length / 2 + 8, layout.freeboard, -(FLIGHT_DECK_HALF_WIDTH - 1.5));
    figure.add(block(BOX, ink, 0, 1.2, 0, 0.55, 2.4, 0.55));
    figure.add(block(BALL, ink, 0, 3, 0, 0.55, 0.55, 0.55));
    const flags: Mesh[] = [];
    const arms = [-1, 1].map((side) => {
      const arm = new Group();
      arm.position.set(0, 2.1, 0);
      arm.add(block(BOX, ink, side * 0.8, 0, 0, 1.6, 0.3, 0.3));
      const flag = new Mesh(BOX, new MeshBasicMaterial({ color: '#ffb43c' }));
      flag.position.set(side * 1.7, 0.5, 0);
      flag.scale.set(1.1, 1.1, 0.1);
      flags.push(flag);
      arm.add(flag);
      figure.add(arm);
      return arm;
    }) as [Group, Group];
    hull.add(figure);
    return { arms, flags };
  }

  /** Pilots in the water and the destroyer's boat pulling out to fetch them, as in the side view. */
  private placeBoats(world: World, rescues: readonly Rescue[], time: number) {
    const sea = world.map.sea?.level;
    while (this.boats.length < rescues.length) this.boats.push(this.buildBoat());
    this.boats.forEach((boat, index) => {
      const rescue = rescues[index];
      boat.group.visible = rescue !== undefined && sea !== undefined;
      if (!rescue || sea === undefined) return;
      if (rescue.ship === null) {
        // A cartoon pilot, paddling off on a raft of their own.
        const paddling = Math.max(0, rescue.age - 2.5);
        boat.pilot.visible = true;
        boat.pilot.position.set(rescue.x + paddling * 3, sea + Math.sin(time * 3) * 0.35, 6);
        boat.boat.visible = false;
        return;
      }
      const ship = world.ships.find((candidate) => candidate.id === rescue.ship);
      boat.boat.visible = ship !== undefined;
      if (!ship) {
        boat.group.visible = false;
        return;
      }
      const out = Math.min(1, rescue.age / 4);
      const back = Math.max(0, (rescue.age - 5.2) / 3.8);
      const bob = Math.sin(time * 2.4 + rescue.x) * 0.3;
      const z = BEAM[ship.kind] / 2 + 4;
      boat.pilot.visible = rescue.age < 5.2;
      boat.pilot.position.set(rescue.x, sea + bob, z);
      boat.boat.position.set(ship.x + (rescue.x - ship.x) * (out - back), sea + bob * 0.5, z);
      const outward = rescue.x >= ship.x ? 1 : -1;
      boat.boat.scale.x = back > 0 ? -outward : outward;
      boat.passenger.visible = rescue.age >= 4;
    });
  }

  private buildBoat(): Boat {
    const group = new Group();
    const ink = this.materials.toon(this.palette.ink);
    const pilot = new Group();
    pilot.add(block(BALL, this.materials.toon('#f2b13c'), 0, 0.3, 0, 1, 0.5, 1));
    pilot.add(block(BALL, ink, 0, 1.1, 0, 0.45, 0.45, 0.45));
    const boat = new Group();
    boat.add(
      block(
        BOX,
        this.materials.toon(
          mix('#f4efe2', this.palette.sea.deep, 0.6 - this.palette.daylight * 0.6),
        ),
        0,
        0.2,
        0,
        6.6,
        1.6,
        2.2,
      ),
    );
    for (const at of [-0.8, 0.8]) boat.add(block(BALL, ink, at, 1.6, 0, 0.42, 0.42, 0.42));
    const passenger = block(BALL, ink, 2, 1.6, 0, 0.42, 0.42, 0.42);
    boat.add(passenger);
    group.add(pilot, boat);
    this.group.add(group);
    return { group, pilot, boat, passenger };
  }

  dispose() {
    for (const model of this.models.values()) for (const item of model.owned) item.dispose();
    this.models.clear();
    this.glow.dispose();
    this.flame.map?.dispose();
    this.flame.dispose();
    this.scorch.dispose();
    this.scorchDisc.dispose();
    this.group.clear();
  }
}

/**
 * The island stands on the starboard edge, which is the near one when the
 * carrier steams right: then it fades while a plane is behind it, on the
 * deck or coming in, and comes back once the plane is clear.
 */
function seeThroughIsland(world: World, ship: Ship, island: IslandModel) {
  const { layout } = island;
  const near = Math.cos(yawOf(ship)) > 0;
  const x = alongShip(ship, layout.at);
  const top =
    ship.y +
    shipLayout(ship.kind).freeboard +
    layout.height +
    layout.bridge.height +
    layout.mast.height;
  const behind =
    near &&
    world.planes.some(
      (plane) =>
        plane.state !== 'out' &&
        Math.abs(plane.x - x) < layout.length / 2 + 12 &&
        plane.y < top + 6,
    );
  const wanted = behind ? ISLAND_SEEN_THROUGH : 1;
  island.opacity += (wanted - island.opacity) * 0.2;
  for (const material of island.materials) material.opacity = island.opacity;
}

/**
 * The ship's heading about the vertical: along +x or −x, and through a
 * turn swinging its bow away from the camera, out to sea.
 */
function yawOf(ship: Ship): number {
  const before = ship.turn < 0.5 ? ship.direction : -ship.direction;
  const swing = ship.turn * Math.PI;
  return before === 1 ? swing : Math.PI - swing;
}

interface Station {
  at: number;
  halfBeam: number;
  deck: number;
  keel: number;
  /** How far the stem rakes back at the keel here. */
  rake: number;
}

function hullStations(kind: ShipKind): Station[] {
  const layout = shipLayout(kind);
  const half = layout.length / 2;
  const { forecastle, breakAt } = forecastleOf(kind);
  // A carrier's hull stops under its flight deck, which is built on top.
  const underDeck = kind === 'carrier' ? FLIGHT_DECK_THICKNESS + 0.1 : 0;
  const places = Array.from(
    { length: STATIONS },
    (_, index) => -half + (index / (STATIONS - 1)) * layout.length,
  );
  if (forecastle > 0) places.push(breakAt - 0.4, breakAt + 0.4);
  places.sort((a, b) => a - b);
  return places.map((at) => {
    const t = (at + half) / layout.length;
    const bow = t > 0.55 ? 1 - ((t - 0.55) / 0.45) ** 1.8 : 1;
    const stern = t < 0.12 ? 0.7 + 0.3 * Math.sin((t / 0.12) * (Math.PI / 2)) : 1;
    return {
      at,
      halfBeam: (BEAM[kind] / 2) * bow * stern,
      deck: deckOver(kind, at) - underDeck + layout.sheer * Math.max(0, (t - 0.6) / 0.4) ** 2,
      keel: -layout.draft * Math.min(1, 0.3 + (t / 0.08) * 0.7, 0.2 + ((1 - t) / 0.15) * 0.8),
      rake: layout.bowRake * smoothstep((t - 0.8) / 0.2),
    };
  });
}

/** Down one side of a station: deck edge, waterline, bilge, and the keel. */
function ring(station: Station): [across: number, height: number][] {
  const { halfBeam, deck, keel } = station;
  return [
    [halfBeam, deck],
    [halfBeam, 0],
    [halfBeam * 0.9, keel * 0.5],
    [halfBeam * 0.55, keel * 0.88],
    [0, keel],
  ];
}

/** Where a point of a station stands along the hull: the stem rakes forward from the keel to the deck. */
function alongOf(station: Station, height: number): number {
  const rise = (height - station.keel) / (station.deck - station.keel);
  return station.at - station.rake * (1 - rise);
}

/**
 * A hull lofted through its stations, in four groups for its materials:
 * the painted side above the waterline, the boot below it, the deck, and
 * the stern's transom.
 */
function hullGeometry(kind: ShipKind): BufferGeometry {
  const layout = shipLayout(kind);
  const stations = hullStations(kind);
  const top = paintedHeight(kind);
  const positions: number[] = [];
  const uvs: number[] = [];
  const vertex = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    uvs.push((x + layout.length / 2) / layout.length, y / top);
    return positions.length / 3 - 1;
  };

  const painted: number[] = [];
  const boot: number[] = [];
  for (const sign of [1, -1]) {
    const rings = stations.map((station) =>
      ring(station).map(([across, height]) =>
        vertex(alongOf(station, height), height, across * sign),
      ),
    );
    for (let index = 0; index + 1 < rings.length; index++) {
      const here = rings[index] as number[];
      const next = rings[index + 1] as number[];
      for (let point = 0; point + 1 < here.length; point++) {
        const a = here[point] as number;
        const b = next[point] as number;
        const c = here[point + 1] as number;
        const d = next[point + 1] as number;
        const faces = point === 0 ? painted : boot;
        // Counter-clockwise from outside on either side.
        if (sign === 1) faces.push(c, d, b, c, b, a);
        else faces.push(c, b, d, c, a, b);
      }
    }
  }

  const deck: number[] = [];
  const edges = stations.map((station) => [
    vertex(station.at, station.deck, station.halfBeam),
    vertex(station.at, station.deck, -station.halfBeam),
  ]);
  for (let index = 0; index + 1 < edges.length; index++) {
    const [near, far] = edges[index] as number[];
    const [nextNear, nextFar] = edges[index + 1] as number[];
    deck.push(
      near as number,
      nextNear as number,
      far as number,
      far as number,
      nextNear as number,
      nextFar as number,
    );
  }

  // The transom closes the stern: a fan round its outline, facing aft.
  const transom: number[] = [];
  const stern = stations[0] as Station;
  const points = ring(stern);
  const outline = [
    ...points.map(([across, height]) => vertex(alongOf(stern, height), height, across)),
    ...points
      .slice(0, -1)
      .reverse()
      .map(([across, height]) => vertex(alongOf(stern, height), height, -across)),
  ];
  const centre = vertex(stern.at, (stern.deck + stern.keel) / 2, 0);
  outline.forEach((point, index) => {
    const next = outline[(index + 1) % outline.length] as number;
    transom.push(centre, next, point);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex([...painted, ...boot, ...deck, ...transom]);
  let start = 0;
  [painted, boot, deck, transom].forEach((faces, material) => {
    geometry.addGroup(start, faces.length, material);
    start += faces.length;
  });
  geometry.computeVertexNormals();
  return geometry;
}

/** The highest the side reaches, at the bow: the painting on the side runs from the waterline to here. */
function paintedHeight(kind: ShipKind): number {
  const layout = shipLayout(kind);
  return layout.freeboard + forecastleOf(kind).forecastle + layout.sheer;
}

/** The side above the waterline as the side view paints it: colour, dazzle, seams, scuttles, wounds. */
function hullSidePaint(
  ship: Ship,
  layout: ShipLayout,
  fleet: Fleet,
  palette: Palette,
): ScarredPaint {
  const canvas = document.createElement('canvas');
  const top = paintedHeight(ship.kind);
  canvas.width = Math.ceil(layout.length * HULL_PIXELS);
  canvas.height = Math.ceil(top * HULL_PIXELS);
  const repaint = () => paintHullSide(canvas, ship, layout, fleet, palette);
  repaint();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, repaint };
}

function paintHullSide(
  canvas: HTMLCanvasElement,
  ship: Ship,
  layout: ShipLayout,
  fleet: Fleet,
  palette: Palette,
) {
  const top = paintedHeight(ship.kind);
  const half = layout.length / 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // The side view's frame: x along the hull, y negative upwards from the waterline.
    ctx.setTransform(HULL_PIXELS, 0, 0, HULL_PIXELS, half * HULL_PIXELS, top * HULL_PIXELS);
    const side = ctx.createLinearGradient(0, -top, 0, 0);
    side.addColorStop(0, fleet.hull);
    side.addColorStop(1, fleet.hullShade);
    ctx.fillStyle = side;
    ctx.fillRect(-half, -top, layout.length, top);
    if (fleet.dazzle.length > 0) paintDazzle(ctx, ship, fleet, layout.length, top);
    ctx.strokeStyle = withAlpha(fleet.trim, 0.12);
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    for (let x = -half + 6; x < half; x += 7) {
      ctx.moveTo(x, -top);
      ctx.lineTo(x, 0);
    }
    ctx.stroke();
    ctx.fillStyle = withAlpha(fleet.trim, 0.7);
    ctx.fillRect(-half, -0.45, layout.length, 0.45);
    paintScuttles(ctx, ship, fleet, palette, layout.freeboard);
    if (ship.kind === 'carrier') {
      // The open gallery under the flight deck.
      ctx.fillStyle = withAlpha(fleet.trim, 0.55);
      ctx.fillRect(-half + 8, -layout.freeboard + 1, layout.length - 18, 1.4);
      ctx.fillStyle = fleet.hullShade;
      for (let x = -half + 9; x < half - 10; x += 6)
        ctx.fillRect(x, -layout.freeboard + 1, 0.6, 1.4);
    }
    paintHullWounds(ctx, ship, palette, layout.freeboard);
    paintDeckEdgeSoot(ctx, ship, palette, layout.freeboard);
  }
}

/** The flight deck's top: planks, the striped round-down, the wires, the lifts, and bomb holes. */
function flightDeckPaint(
  world: World,
  ship: Ship,
  layout: ShipLayout,
  fleet: Fleet,
  palette: Palette,
  stern: number,
  bow: number,
): ScarredPaint {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((bow - stern) * DECK_PIXELS);
  canvas.height = Math.ceil(FLIGHT_DECK_HALF_WIDTH * 2 * DECK_PIXELS);
  const repaint = () => paintFlightDeck(canvas, world, ship, layout, fleet, palette, stern, bow);
  repaint();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, repaint };
}

function paintFlightDeck(
  canvas: HTMLCanvasElement,
  world: World,
  ship: Ship,
  layout: ShipLayout,
  fleet: Fleet,
  palette: Palette,
  stern: number,
  bow: number,
) {
  const length = bow - stern;
  const width = FLIGHT_DECK_HALF_WIDTH * 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // x along the deck from the stern; y across it from the near edge.
    ctx.setTransform(DECK_PIXELS, 0, 0, DECK_PIXELS, 0, 0);
    ctx.fillStyle = fleet.deck;
    ctx.fillRect(0, 0, length, width);
    ctx.fillStyle = withAlpha(fleet.deckShade, 0.5);
    for (let plank = 0.8; plank < width; plank += 0.8) ctx.fillRect(0, plank, length, 0.08);
    for (let stripe = 0; stripe < 4; stripe++) {
      ctx.fillStyle = stripe % 2 === 0 ? '#f4efe2' : withAlpha(fleet.trim, 0.7);
      ctx.fillRect(stripe * 1.4, 0, 1.4, width);
    }
    const toStern = -layout.length / 2 - stern;
    const wires = wireWindow(world);
    ctx.fillStyle = withAlpha(fleet.trim, 0.85);
    for (let wire = 0; wire < 4; wire++) {
      const x = toStern + wires.first + ((wires.last - wires.first) * wire) / 3;
      ctx.fillRect(x, 1.4, 0.3, width - 2.8);
    }
    ctx.strokeStyle = withAlpha(fleet.deckShade, 0.8);
    ctx.lineWidth = 0.18;
    for (const [at, size] of [
      [toStern + 62, 11],
      [toStern + 96, 9],
    ] as const)
      ctx.strokeRect(at, width / 2 - size / 2, size, size);
    ctx.fillStyle = shade(fleet.deck, -0.25);
    ctx.fillRect(0, 0, length, 0.35);
    ctx.fillRect(0, width - 0.35, length, 0.35);
    paintDeckPlanWounds(ctx, ship, palette, stern, width);
  }
}

/** Foam spreading behind the stern and fading: one unit long, scaled to the ship's pace. */
function wakeMesh(foam: string): Mesh {
  const steps = 10;
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const behind = step / steps;
    const spread = 0.7 + behind * 1.6;
    const fade = (1 - behind) ** 1.5;
    for (const across of [1, -1]) {
      positions.push(-behind, 0, across * spread);
      colours.push(1, 1, 1, fade);
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
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color: foam,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = 3;
  return mesh;
}

const UP = new Vector3(0, 1, 0);

/** A thin round bar between two points: a mast, a tripod leg, a stay. */
function rod(
  material: Material,
  from: [number, number, number],
  to: [number, number, number],
  radius: number,
): Mesh {
  const start = new Vector3(...from);
  const direction = new Vector3(...to).sub(start);
  const length = direction.length();
  const mesh = new Mesh(DRUM, material);
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.scale.set(radius, length, radius);
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, direction.normalize()));
  mesh.castShadow = true;
  return mesh;
}

/** A soft white spot for lamps' halos, tinted per lamp. */
function glowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.3, 'rgba(255, 255, 255, 0.45)');
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}

/** One tongue of flame, its core bright at the foot, reddening and fading to its tip. */
function flameTexture(palette: Palette): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const [core, flame, ember] = palette.fire;
    const fill = ctx.createLinearGradient(0, 64, 0, 0);
    fill.addColorStop(0, core);
    fill.addColorStop(0.35, flame);
    fill.addColorStop(0.8, withAlpha(ember, 0.7));
    fill.addColorStop(1, withAlpha(ember, 0));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(4, 64);
    ctx.quadraticCurveTo(2, 30, 16, 0);
    ctx.quadraticCurveTo(30, 30, 28, 64);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}
