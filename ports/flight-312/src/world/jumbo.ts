import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { buildLights } from './lights';

/**
 * The jumbo from outside, for the replay's chase camera: a lathed fuselage
 * with the upper-deck hump, swept wings with dihedral, the tailplane and
 * fin, four big fan nacelles on pylons and the gear, in the livery the
 * player has chosen. Metres; the nose points along −z, the main wheels sit
 * at the origin.
 */
const LENGTH = 70.6;
const RADIUS = 3.25;
/** The fuselage's axis above the main wheels, gear down. */
const AXIS_HEIGHT = 5.1;
/** The main wheels are this far behind the nose. */
const MAINS_FROM_NOSE = 40;

export type Livery = 'brightwater' | 'sunrise' | 'silver' | 'night';

interface Paint {
  top: string;
  belly: string;
  cheatline: string;
  pinstripe: string;
  fin: string;
  finMark: string;
  engine: string;
}

/**
 * Brightwater's own colours — an invented airline: white over grey, a deep
 * blue cheatline with a sea-green pinstripe, a blue fin with a white wave —
 * and the three liveries the Arcade Pass unlocks.
 */
export const LIVERIES: Record<Livery, Paint> = {
  brightwater: {
    top: '#f3f4f2',
    belly: '#b9bdc1',
    cheatline: '#173a6e',
    pinstripe: '#2aa39a',
    fin: '#173a6e',
    finMark: '#f3f4f2',
    engine: '#d9dcdf',
  },
  sunrise: {
    top: '#f6f1e7',
    belly: '#c8bda9',
    cheatline: '#d2601c',
    pinstripe: '#f2b13c',
    fin: '#d2601c',
    finMark: '#f6d27a',
    engine: '#e4ded2',
  },
  silver: {
    top: '#c7ccd1',
    belly: '#a7adb3',
    cheatline: '#1f4f8f',
    pinstripe: '#e8eaec',
    fin: '#c7ccd1',
    finMark: '#1f4f8f',
    engine: '#c2c6ca',
  },
  night: {
    top: '#1d2a44',
    belly: '#2a3350',
    cheatline: '#e9ecef',
    pinstripe: '#7fd1ff',
    fin: '#1d2a44',
    finMark: '#e9ecef',
    engine: '#d9dcdf',
  },
};

const FIXED = {
  wing: new Color('#9aa0a6').lerp(new Color('#f3f4f2'), 0.6),
  metal: new Color('#9aa0a6'),
  intake: new Color('#2a2d31'),
  tyre: new Color('#1e1f21'),
};

type Part = 'fuselage' | 'tailplane' | 'fin' | 'finMark' | 'wing';

/** Radius of the fuselage at a station from the nose, metres. */
function fuselageRadius(station: number): number {
  if (station < 6) return RADIUS * Math.sqrt(1 - ((6 - station) / 6) ** 2) * 0.98 + 0.02;
  if (station < 52) return RADIUS;
  const t = (station - 52) / (LENGTH - 52);
  return RADIUS * (1 - t * 0.86);
}

function paintByHeight(geometry: BufferGeometry, paint: (y: number, z: number) => Color) {
  const position = geometry.getAttribute('position');
  const colours = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const colour = paint(position.getY(index), position.getZ(index));
    colours.set([colour.r, colour.g, colour.b], index * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
}

function paintFuselage(geometry: BufferGeometry, paint: Paint) {
  const [top, belly, cheatline, pinstripe] = [
    paint.top,
    paint.belly,
    paint.cheatline,
    paint.pinstripe,
  ].map((colour) => new Color(colour)) as [Color, Color, Color, Color];
  paintByHeight(geometry, (y) => {
    if (y < -RADIUS * 0.3) return belly;
    if (y > RADIUS * 0.02 && y < RADIUS * 0.26) return cheatline;
    if (y >= RADIUS * 0.26 && y < RADIUS * 0.31) return pinstripe;
    return top;
  });
}

function fuselage(): BufferGeometry {
  const points: Vector2[] = [];
  for (let station = 0; station <= LENGTH; station += 0.5)
    points.push(new Vector2(fuselageRadius(station), station));
  const geometry = new LatheGeometry(points, 40);
  // The lathe runs along +y: lay it down with the nose forward (−z).
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -MAINS_FROM_NOSE);
  // The tail sweeps up as it narrows.
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index++) {
    const station = position.getZ(index) + MAINS_FROM_NOSE;
    if (station > 50)
      position.setY(index, position.getY(index) + ((station - 50) / (LENGTH - 50)) ** 1.6 * 2.2);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A tapered, swept slab: wings, tailplane and fin are all one of these. */
function surface(
  rootChord: number,
  tipChord: number,
  span: number,
  sweepDeg: number,
  rootThickness: number,
  tipThickness: number,
): BufferGeometry {
  const sweep = Math.tan(sweepDeg * (Math.PI / 180));
  const outline = [
    new Vector3(0, 0, 0),
    new Vector3(span, 0, span * sweep),
    new Vector3(span, 0, span * sweep + tipChord),
    new Vector3(0, 0, rootChord),
  ];
  const thickness = [rootThickness, tipThickness, tipThickness, rootThickness];
  const vertices: number[] = [];
  const face = (a: Vector3, b: Vector3, c: Vector3) =>
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const top = outline.map((point, index) => point.clone().setY((thickness[index] as number) / 2));
  const bottom = outline.map((point, index) =>
    point.clone().setY(-(thickness[index] as number) / 2),
  );
  const [t0, t1, t2, t3] = top as [Vector3, Vector3, Vector3, Vector3];
  const [b0, b1, b2, b3] = bottom as [Vector3, Vector3, Vector3, Vector3];
  face(t0, t1, t2);
  face(t0, t2, t3);
  face(b0, b2, b1);
  face(b0, b3, b2);
  for (let edge = 0; edge < 4; edge++) {
    const next = (edge + 1) % 4;
    face(top[edge] as Vector3, bottom[edge] as Vector3, top[next] as Vector3);
    face(top[next] as Vector3, bottom[edge] as Vector3, bottom[next] as Vector3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  geometry.computeVertexNormals();
  return geometry;
}

function nacelle(material: MeshStandardMaterial, intake: MeshStandardMaterial): Group {
  const group = new Group();
  const body = new Mesh(new CylinderGeometry(1.25, 1.0, 6.4, 20, 1, true), material);
  body.rotation.x = Math.PI / 2;
  const lip = new Mesh(new CylinderGeometry(1.32, 1.32, 0.5, 20), material);
  lip.rotation.x = Math.PI / 2;
  lip.position.z = -3.2;
  const fan = new Mesh(new CylinderGeometry(1.15, 1.15, 0.1, 20), intake);
  fan.rotation.x = Math.PI / 2;
  fan.position.z = -3.0;
  const pylon = new Mesh(new CylinderGeometry(0.25, 0.25, 1.6, 6), material);
  pylon.position.set(0, 1.3, 0.8);
  group.add(body, lip, fan, pylon);
  return group;
}

export class JumboModel {
  readonly group = new Group();
  private gear: Group[] = [];
  private beacon: Mesh;
  private parts: { geometry: BufferGeometry; part: Part }[] = [];
  private engineSkin: MeshStandardMaterial;
  private humpSkin: MeshStandardMaterial;

  constructor(livery: Livery = 'brightwater') {
    this.group.name = 'jumbo';
    const painted = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      metalness: 0.15,
    });
    this.engineSkin = new MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 });
    this.humpSkin = new MeshStandardMaterial({ roughness: 0.45 });
    const intake = new MeshStandardMaterial({ color: FIXED.intake, roughness: 0.8 });
    const metal = new MeshStandardMaterial({ color: FIXED.metal, roughness: 0.5, metalness: 0.6 });
    const tyre = new MeshStandardMaterial({ color: FIXED.tyre, roughness: 0.9 });
    const part = (geometry: BufferGeometry, name: Part) => {
      this.parts.push({ geometry, part: name });
      return new Mesh(geometry, painted);
    };

    const body = part(fuselage(), 'fuselage');
    body.position.y = AXIS_HEIGHT;
    const hump = new Mesh(new SphereGeometry(1, 24, 12), this.humpSkin);
    hump.scale.set(RADIUS * 0.72, 1.9, 13);
    hump.position.set(0, AXIS_HEIGHT + RADIUS * 0.72, -MAINS_FROM_NOSE + 15.5);
    this.group.add(body, hump);

    // Wings: low on the fuselage, 37.5° of sweep, 7° of dihedral.
    for (const side of [-1, 1]) {
      const wing = part(surface(16, 4, 31, 37.5, 1.6, 0.35), 'wing');
      wing.scale.x = side;
      wing.position.set(side * RADIUS * 0.8, AXIS_HEIGHT - RADIUS * 0.55, -6);
      wing.rotation.z = side * 7 * (Math.PI / 180);
      this.group.add(wing);
      const tailplane = part(surface(7.5, 2.6, 10.5, 38, 0.6, 0.2), 'tailplane');
      tailplane.scale.x = side;
      tailplane.position.set(side * 0.6, AXIS_HEIGHT + 1.4, 20);
      tailplane.rotation.z = side * 7 * (Math.PI / 180);
      this.group.add(tailplane);
      for (const [spanFraction, forward] of [
        [0.38, 4.4],
        [0.68, 1.6],
      ] as const) {
        const engine = nacelle(this.engineSkin, intake);
        const span = spanFraction * 31;
        engine.position.set(
          side * (RADIUS * 0.8 + span),
          AXIS_HEIGHT - RADIUS * 0.55 - 2.2 + span * Math.tan(7 * (Math.PI / 180)),
          -6 + span * Math.tan(37.5 * (Math.PI / 180)) - forward,
        );
        this.group.add(engine);
      }
    }
    const fin = part(surface(11, 4, 10.5, 45, 0.7, 0.25), 'fin');
    fin.rotation.z = Math.PI / 2;
    fin.position.set(0, AXIS_HEIGHT + RADIUS * 0.6, 17.5);
    this.group.add(fin);
    const wave = part(surface(5, 2.2, 4.5, 45, 0.75, 0.3), 'finMark');
    wave.rotation.z = Math.PI / 2;
    wave.position.set(0, AXIS_HEIGHT + RADIUS * 0.6 + 4.2, 21.8);
    this.group.add(wave);

    // Four main bogies and the nose gear.
    for (const [x, z] of [
      [-1.9, 0],
      [1.9, 0],
      [-5.5, -2.5],
      [5.5, -2.5],
      [0, -25.6],
    ] as const) {
      const leg = new Group();
      const strut = new Mesh(new CylinderGeometry(0.18, 0.18, AXIS_HEIGHT - 1.6, 8), metal);
      strut.position.y = AXIS_HEIGHT / 2 + 0.2;
      leg.add(strut);
      for (const dz of z === -25.6 ? [0] : [-0.8, 0.8]) {
        for (const dx of [-0.45, 0.45]) {
          const wheel = new Mesh(new CylinderGeometry(0.62, 0.62, 0.4, 14), tyre);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(dx, 0.62, dz);
          leg.add(wheel);
        }
      }
      leg.position.set(x, 0, z);
      this.group.add(leg);
      this.gear.push(leg);
    }

    this.group.add(
      buildLights([
        {
          position: new Vector3(-(RADIUS * 0.8 + 31), AXIS_HEIGHT + 2.2, 18),
          color: new Color('#ff3b30'),
          size: 0.8,
          intensity: 1.2,
          kind: 'steady',
          parameter: 0,
          facing: null,
        },
        {
          position: new Vector3(RADIUS * 0.8 + 31, AXIS_HEIGHT + 2.2, 18),
          color: new Color('#34ff6c'),
          size: 0.8,
          intensity: 1.2,
          kind: 'steady',
          parameter: 0,
          facing: null,
        },
        {
          position: new Vector3(0, AXIS_HEIGHT + 1.8, 30.6),
          color: new Color('#ffffff'),
          size: 0.7,
          intensity: 1,
          kind: 'steady',
          parameter: 0,
          facing: null,
        },
      ]),
    );
    this.beacon = new Mesh(
      new SphereGeometry(0.25, 8, 6),
      new MeshStandardMaterial({ color: '#ff2a1a', emissive: new Color('#ff2a1a') }),
    );
    this.beacon.position.set(0, AXIS_HEIGHT + RADIUS + 0.3, -8);
    this.group.add(this.beacon);
    this.paint(livery);
  }

  /** Repaints the airframe in a livery. */
  paint(livery: Livery) {
    const paint = LIVERIES[livery];
    for (const { geometry, part } of this.parts) {
      if (part === 'fuselage') paintFuselage(geometry, paint);
      else {
        const colour =
          part === 'wing'
            ? FIXED.wing
            : new Color(
                part === 'fin' ? paint.fin : part === 'finMark' ? paint.finMark : paint.top,
              );
        paintByHeight(geometry, () => colour);
      }
    }
    this.engineSkin.color.set(paint.engine);
    this.humpSkin.color.set(paint.top);
  }

  /** Gear 0 up … 1 down; the beacon flashes about once a second. */
  update(gear: number, time: number) {
    for (const leg of this.gear) {
      leg.visible = gear > 0.05;
      leg.scale.y = Math.max(0.05, gear);
    }
    this.beacon.visible = time % 1.2 < 0.12;
  }

  dispose() {
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const material = object.material as MeshStandardMaterial | MeshStandardMaterial[];
        for (const one of Array.isArray(material) ? material : [material]) one.dispose();
      }
    });
  }
}
