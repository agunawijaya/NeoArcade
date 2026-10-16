import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  type Material,
} from 'three';
import {
  COWLING,
  FIN,
  FUSELAGE_BOTTOM,
  FUSELAGE_HALF_WIDTH,
  FUSELAGE_INSIGNIA,
  FUSELAGE_TOP,
  GEAR_TOP,
  GUNS,
  LOWER_WING,
  PILOT,
  PROPELLER,
  RUDDER_HINGE,
  STRUT_SPAN,
  TAILPLANE,
  UPPER_WING,
  WHEELS,
  WING_INSIGNIA,
  type WingModel,
} from '../biplane-model';
import { insigniaLayers, motifCells } from '../insignia';
import type { Livery } from '../palette';
import { shade } from '../side/colour';
import type { MaterialCache } from './materials';

const BOX = new BoxGeometry(1, 1, 1);

/** One biplane model, with handles on the parts that move. */
export interface BiplaneModel {
  group: Group;
  propeller: Group;
  scarf: Mesh;
  dispose(): void;
}

/**
 * Builds the diorama's biplane from biplane-model.ts: a fuselage extruded
 * from the same profile the side view draws, wings with their rib tapes and
 * insignia painted on, struts, bracing wires, wheels, the pilot and a
 * blurred propeller.
 */
export function buildBiplane(livery: Livery, materials: MaterialCache): BiplaneModel {
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const fabric = materials.toon(livery.fabric);
  const linen = materials.toon(livery.linen);
  const strut = materials.toon(livery.strut);

  // Fuselage, extruded from its side profile.
  const profile = new Shape();
  const outline = [...FUSELAGE_TOP, ...FUSELAGE_BOTTOM];
  outline.forEach(([x, y], index) => (index === 0 ? profile.moveTo(x, y) : profile.lineTo(x, y)));
  profile.closePath();
  const fuselageGeometry = new ExtrudeGeometry(profile, {
    depth: FUSELAGE_HALF_WIDTH * 2,
    bevelEnabled: true,
    bevelSize: 0.25,
    bevelThickness: 0.25,
    bevelSegments: 2,
  });
  fuselageGeometry.translate(0, 0, -FUSELAGE_HALF_WIDTH);
  owned.push(fuselageGeometry);
  group.add(shadowed(new Mesh(fuselageGeometry, fabric)));
  for (const side of [-1, 1])
    group.add(
      insignia(
        livery,
        FUSELAGE_INSIGNIA.x,
        FUSELAGE_INSIGNIA.y,
        side * (FUSELAGE_HALF_WIDTH + 0.27),
        FUSELAGE_INSIGNIA.radius,
        side,
        owned,
      ),
    );

  // Fin and rudder.
  const finShape = new Shape();
  FIN.forEach(([x, y], index) => (index === 0 ? finShape.moveTo(x, y) : finShape.lineTo(x, y)));
  finShape.closePath();
  const finGeometry = new ExtrudeGeometry(finShape, { depth: 0.2, bevelEnabled: false });
  finGeometry.translate(0, 0, -0.1);
  owned.push(finGeometry);
  group.add(shadowed(new Mesh(finGeometry, fabric)));
  livery.rudder.forEach((colour, index) => {
    const width = (RUDDER_HINGE + 10) / livery.rudder.length;
    const stripe = shadowed(new Mesh(BOX, materials.toon(colour)));
    stripe.scale.set(width, 2.9, 0.26);
    stripe.position.set(RUDDER_HINGE - width * (index + 0.5), 1.05, 0);
    group.add(stripe);
  });

  // Cowling: a short shiny drum with a dark mouth.
  const cowlingGeometry = new CylinderGeometry(
    COWLING.radius,
    COWLING.radius * 0.96,
    COWLING.front - COWLING.back,
    20,
    1,
    true,
  );
  owned.push(cowlingGeometry);
  const metal = new MeshStandardMaterial({
    color: livery.cowling,
    metalness: 0.65,
    roughness: 0.32,
    side: DoubleSide,
  });
  owned.push(metal);
  const cowling = shadowed(new Mesh(cowlingGeometry, metal));
  cowling.rotation.z = Math.PI / 2;
  cowling.position.x = (COWLING.back + COWLING.front) / 2;
  group.add(cowling);
  const mouth = new Mesh(new CircleGeometry(COWLING.radius * 0.95, 20), materials.toon('#1d1a18'));
  mouth.rotation.y = Math.PI / 2;
  mouth.position.x = COWLING.front - 0.05;
  group.add(mouth);
  for (const side of [-1, 1]) {
    const gun = shadowed(new Mesh(BOX, materials.toon('#26231f')));
    gun.scale.set(GUNS.front - GUNS.back, 0.32, 0.3);
    gun.position.set((GUNS.front + GUNS.back) / 2, GUNS.y, side * 0.4);
    group.add(gun);
  }

  // Wings.
  group.add(wing(UPPER_WING, livery, fabric, linen, true, owned));
  for (const side of [-1, 1] as const) group.add(lowerWingHalf(side, livery, fabric, linen, owned));
  const tail = shadowed(new Mesh(BOX, fabric));
  tail.scale.set(TAILPLANE.leading - TAILPLANE.trailing, 0.16, TAILPLANE.span * 2);
  tail.position.set((TAILPLANE.leading + TAILPLANE.trailing) / 2, TAILPLANE.y, 0);
  group.add(tail);

  // Struts and wires.
  for (const side of [-1, 1]) {
    const z = side * STRUT_SPAN;
    const low = LOWER_WING.y + STRUT_SPAN * LOWER_WING.dihedral;
    for (const [lowX, highX] of [
      [LOWER_WING.leading - 0.85, UPPER_WING.leading - 0.85],
      [LOWER_WING.trailing + 1.4, UPPER_WING.trailing + 1.4],
    ] as const) {
      group.add(rod(lowX, low, z, highX, UPPER_WING.y, z, 0.3, strut));
    }
    group.add(rod(3.1, 1.7, side * 0.9, 3.6, UPPER_WING.y, side * 1.4, 0.22, strut));
    group.add(rod(1.2, 1.75, side * 0.9, 1.6, UPPER_WING.y, side * 1.4, 0.22, strut));
    for (const [x, y] of GEAR_TOP)
      group.add(rod(x, y, side * 0.8, WHEELS.x, WHEELS.y, side * WHEELS.track, 0.2, strut));
    group.add(wheel(side * WHEELS.track, livery, materials));
  }
  const wireGeometry = new BufferGeometry();
  const wires: number[] = [];
  for (const side of [-1, 1]) {
    wires.push(
      2.8,
      LOWER_WING.y,
      side * 1.2,
      UPPER_WING.leading - 0.85,
      UPPER_WING.y,
      side * STRUT_SPAN,
    );
    wires.push(
      3.6,
      UPPER_WING.y,
      side * 1.4,
      LOWER_WING.leading - 0.85,
      LOWER_WING.y + STRUT_SPAN * LOWER_WING.dihedral,
      side * STRUT_SPAN,
    );
  }
  wireGeometry.setAttribute('position', new Float32BufferAttribute(wires, 3));
  const wireMaterial = new LineBasicMaterial({ color: '#2b2622', transparent: true, opacity: 0.7 });
  owned.push(wireGeometry, wireMaterial);
  group.add(new LineSegments(wireGeometry, wireMaterial));

  // The pilot and the scarf.
  const head = shadowed(
    new Mesh(new SphereGeometry(PILOT.head, 12, 10), materials.toon('#5a3c26')),
  );
  head.position.set(PILOT.x, PILOT.y, 0);
  group.add(head);
  const goggles = new Mesh(new SphereGeometry(PILOT.head * 0.36, 8, 6), materials.toon('#e8f1f4'));
  goggles.position.set(PILOT.x + 0.45, PILOT.y + 0.05, 0.3);
  group.add(goggles);
  const scarfGeometry = new BoxGeometry(3, 0.32, 0.05, 6, 1, 1);
  owned.push(scarfGeometry);
  const scarf = new Mesh(scarfGeometry, materials.toon(livery.scarf));
  scarf.position.set(PILOT.x - 1.6, PILOT.y - 0.2, 0);
  group.add(scarf);

  // The propeller: a disc of blur and two faint blades.
  const propeller = new Group();
  propeller.position.x = PROPELLER.x;
  const discMaterial = new MeshBasicMaterial({
    color: '#463a2e',
    transparent: true,
    opacity: 0.18,
    side: DoubleSide,
    depthWrite: false,
  });
  owned.push(discMaterial);
  const disc = new Mesh(new CircleGeometry(PROPELLER.radius, 28), discMaterial);
  disc.rotation.y = Math.PI / 2;
  group.add(disc);
  disc.position.x = PROPELLER.x;
  for (const angle of [0, Math.PI]) {
    const blade = new Mesh(BOX, materials.toon('#3c2e22'));
    blade.scale.set(0.15, PROPELLER.radius * 0.95, 0.35);
    blade.position.y = (PROPELLER.radius * 0.95) / 2;
    const arm = new Group();
    arm.rotation.x = angle;
    arm.add(blade);
    propeller.add(arm);
  }
  group.add(propeller);

  return {
    group,
    propeller,
    scarf,
    dispose() {
      for (const item of owned) item.dispose();
    },
  };
}

function shadowed(mesh: Mesh): Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A thin rod between two points, for struts and undercarriage legs. */
function rod(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  thickness: number,
  material: Material,
): Mesh {
  const mesh = shadowed(new Mesh(BOX, material));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  mesh.scale.set(thickness, length, thickness);
  mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  mesh.lookAt(x2, y2, z2);
  mesh.rotateX(Math.PI / 2);
  return mesh;
}

/** A painted wing top: doped fabric with rib tapes, and the insignia near the tips. */
function wingTexture(
  wing: WingModel,
  livery: Livery,
  owned: { dispose(): void }[],
  withInsignia: boolean,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = livery.fabric;
    ctx.fillRect(0, 0, 64, 512);
    ctx.strokeStyle = shade(livery.fabric, 0.16);
    ctx.lineWidth = 3;
    for (const rib of wing.ribs) {
      for (const sign of [-1, 1]) {
        const v = 256 + (sign * rib * 256) / wing.span;
        ctx.beginPath();
        ctx.moveTo(0, v);
        ctx.lineTo(64, v);
        ctx.stroke();
      }
    }
    ctx.fillStyle = shade(livery.fabric, 0.3);
    ctx.fillRect(56, 0, 8, 512);
    if (withInsignia) {
      // The texture runs root to tip both ways from the middle (v), leading edge at u = 64.
      ctx.fillStyle = livery.motifColour;
      for (const cell of motifCells(livery.wingMotif)) {
        for (const sign of [-1, 1]) {
          ctx.beginPath();
          cell.forEach(([c, s], index) => {
            const u = 64 - c * 64;
            const v = 256 + sign * s * 256 * ((wing.span - 0.9) / wing.span);
            if (index === 0) ctx.moveTo(u, v);
            else ctx.lineTo(u, v);
          });
          ctx.closePath();
          ctx.fill();
        }
      }
      for (const sign of [-1, 1]) {
        const v = 256 + (sign * WING_INSIGNIA.span * 256) / wing.span;
        const radius = (WING_INSIGNIA.radius / (wing.leading - wing.trailing)) * 64;
        for (const layer of insigniaLayers(livery)) {
          ctx.fillStyle = layer.colour;
          ctx.beginPath();
          layer.outline.forEach(([a, c], index) => {
            if (index === 0) ctx.moveTo(32 + a * radius, v + c * radius);
            else ctx.lineTo(32 + a * radius, v + c * radius);
          });
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  owned.push(texture);
  return texture;
}

function wing(
  model: WingModel,
  livery: Livery,
  fabric: Material,
  linen: Material,
  withInsignia: boolean,
  owned: { dispose(): void }[],
): Mesh {
  const top = new MeshStandardMaterial({
    map: wingTexture(model, livery, owned, withInsignia),
    roughness: 0.9,
  });
  owned.push(top);
  // Box faces: +x, −x, +y (top), −y (bottom), +z, −z.
  const mesh = shadowed(new Mesh(BOX, [fabric, fabric, top, linen, fabric, fabric]));
  mesh.scale.set(model.leading - model.trailing, 0.3, model.span * 2);
  mesh.position.set((model.leading + model.trailing) / 2, model.y, 0);
  return mesh;
}

function lowerWingHalf(
  side: -1 | 1,
  livery: Livery,
  fabric: Material,
  linen: Material,
  owned: { dispose(): void }[],
): Mesh {
  const half = wing(
    { ...LOWER_WING, span: LOWER_WING.span / 2 },
    livery,
    fabric,
    linen,
    false,
    owned,
  );
  half.position.z = (side * LOWER_WING.span) / 2;
  half.position.y = LOWER_WING.y + (LOWER_WING.span / 2) * LOWER_WING.dihedral;
  half.rotation.x = side * -Math.atan(LOWER_WING.dihedral);
  return half;
}

/** A side's mark on the fuselage: its layers as flat shapes, stacked a hair apart. */
function insignia(
  livery: Livery,
  x: number,
  y: number,
  z: number,
  radius: number,
  facing: number,
  owned: { dispose(): void }[],
): Group {
  const group = new Group();
  group.position.set(x, y, z);
  if (facing < 0) group.rotation.y = Math.PI;
  insigniaLayers(livery).forEach((layer, index) => {
    const shape = new Shape();
    layer.outline.forEach(([a, b], point) =>
      point === 0 ? shape.moveTo(a * radius, b * radius) : shape.lineTo(a * radius, b * radius),
    );
    shape.closePath();
    const geometry = new ShapeGeometry(shape);
    const material = new MeshBasicMaterial({ color: layer.colour });
    owned.push(geometry, material);
    const mark = new Mesh(geometry, material);
    mark.position.z = index * 0.01;
    group.add(mark);
  });
  return group;
}

function wheel(z: number, livery: Livery, materials: MaterialCache): Group {
  const group = new Group();
  group.position.set(WHEELS.x, WHEELS.y, z);
  const tyre = shadowed(
    new Mesh(
      new CylinderGeometry(WHEELS.radius, WHEELS.radius, 0.4, 16),
      materials.toon('#2a2622'),
    ),
  );
  tyre.rotation.x = Math.PI / 2;
  group.add(tyre);
  const cover = new Mesh(
    new CircleGeometry(WHEELS.radius * 0.75, 16),
    materials.toon(shade(livery.linen, -0.18)),
  );
  cover.position.z = Math.sign(z) * 0.21;
  if (z < 0) cover.rotation.y = Math.PI;
  group.add(cover);
  return group;
}
