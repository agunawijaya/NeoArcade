import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshLambertMaterial,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three';
import { AIRPORTS, type AirportData } from '../data/airport-data';
import { destination, type LatLon } from '../engine/geo';
import { DEPARTURE, DESTINATIONS } from '../engine/navdata';
import { runway, type Runway } from '../engine/runways';
import type { FlightWorld } from '../engine/world';
import { localMetres, METRES_PER_FOOT, type SceneFrame } from './frame';
import { buildLights, type LightSpec } from './lights';
import { paintHalfRunway } from './runway-paint';
import { ATMOSPHERE_GLSL, atmosphere, CURVE_GLSL, DECAL_GLSL } from './shaders';

/**
 * The airports: every runway of the six fields, painted and lit, with a
 * parallel taxiway, an apron, a terminal, hangars and a tower beside the
 * runway in use. The runways with an ILS get the full lighting of a
 * precision runway, the approach lights and a VASI; under the 1982 rules
 * the runways the program used are its own 10,500 × 200 ft strip.
 */
const FT = METRES_PER_FOOT;

const RUNWAY_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  ${DECAL_GLSL}
  ${CURVE_GLSL}
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vUv = uv;
    vec4 world = vec4(curved((modelMatrix * vec4(position, 1.0)).xyz), 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * pullTowardEye(viewMatrix * world, 0.0015);
    #include <logdepthbuf_vertex>
  }
`;

const RUNWAY_FRAGMENT = /* glsl */ `
  uniform sampler2D uPaint;
  uniform vec3 uTint;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${ATMOSPHERE_GLSL}
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec3 albedo = texture2D(uPaint, vUv).rgb * uTint;
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 colour = albedo * (uSunColor * max(uSunDirection.y, 0.0) + ambient(up) * 0.65);
    gl_FragColor = vec4(applyFog(colour, length(cameraPosition - vWorld), 1.0), 1.0);
    #include <colorspace_fragment>
  }
`;

function surfaceMaterial(paint: Texture, tint = new Color(1, 1, 1)): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: RUNWAY_VERTEX,
    fragmentShader: RUNWAY_FRAGMENT,
    uniforms: { ...atmosphere, uPaint: { value: paint }, uTint: { value: tint } },
  });
}

/** A flat quad from a start point along a heading, in an airport's frame (x east, z south). */
function strip(
  start: Vector3,
  headingTrue: number,
  lengthM: number,
  widthM: number,
  height: number,
): BufferGeometry {
  const radians = headingTrue * (Math.PI / 180);
  const forward = new Vector3(Math.sin(radians), 0, -Math.cos(radians));
  const right = new Vector3(Math.cos(radians), 0, Math.sin(radians));
  const half = right.clone().multiplyScalar(widthM / 2);
  const end = start.clone().addScaledVector(forward, lengthM);
  const corners = [
    start.clone().sub(half),
    start.clone().add(half),
    end.clone().sub(half),
    end.clone().add(half),
  ];
  const position = new Float32Array(corners.flatMap((corner) => [corner.x, height, corner.z]));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The far end of a runway as a runway of its own, for one the engine knows from one end only. */
function oppositeEnd(near: Runway, ident: string): Runway {
  const far = destination(near.start, near.headingTrue, (near.lengthFt * FT) / 1852);
  return {
    ...near,
    ident,
    start: far,
    threshold: far,
    headingTrue: (near.headingTrue + 180) % 360,
    displacedFt: 0,
    landingLengthFt: near.lengthFt,
  };
}

const isPrecision = (airport: string, ident: string) =>
  (airport === DEPARTURE.airport && ident === DEPARTURE.runway) ||
  DESTINATIONS.some(
    (destination) => destination.airport === airport && destination.runway === ident,
  );

interface Built {
  group: Group;
  arp: LatLon;
  elevationM: number;
}

const COLOURS = {
  white: new Color('#fff6e6'),
  yellow: new Color('#ffd25a'),
  red: new Color('#ff3a2c'),
  green: new Color('#3dff7a'),
  blue: new Color('#4c7dff'),
  flasher: new Color('#e8f0ff'),
};

function light(
  position: Vector3,
  color: Color,
  facing: Vector3 | null,
  size = 1,
  intensity = 1,
): LightSpec {
  return { position, color, size, intensity, kind: 'steady', parameter: 0, facing };
}

/** The lights of one runway, seen from the end that is landed on. */
function runwayLights(
  end: Runway,
  place: (point: LatLon) => Vector3,
  precision: boolean,
): LightSpec[] {
  const lights: LightSpec[] = [];
  const radians = end.headingTrue * (Math.PI / 180);
  const forward = new Vector3(Math.sin(radians), 0, -Math.cos(radians));
  const right = new Vector3(Math.cos(radians), 0, Math.sin(radians));
  const toward = forward.clone().negate();
  const start = place(end.start);
  const threshold = start.clone().addScaledVector(forward, end.displacedFt * FT);
  const at = (alongFt: number, acrossFt: number, height = 0.5) =>
    threshold
      .clone()
      .addScaledVector(forward, alongFt * FT)
      .addScaledVector(right, acrossFt * FT)
      .setY(height);
  const halfWidth = end.widthFt / 2 + 2;
  const landing = end.landingLengthFt;

  for (let along = -end.displacedFt; along <= landing + 1; along += 200) {
    const remaining = landing - along;
    for (const side of [-1, 1]) {
      lights.push(
        light(
          at(along, side * halfWidth),
          precision && remaining < 2000 ? COLOURS.yellow : COLOURS.white,
          precision ? toward : null,
          1.1,
        ),
      );
    }
  }
  for (let across = -halfWidth; across <= halfWidth + 0.1; across += 10) {
    lights.push(light(at(0, across), COLOURS.green, toward, 1.2, 1.2));
    lights.push(light(at(landing, across), COLOURS.red, forward, 1.2, 1.1));
  }
  if (!precision) return lights;

  for (let along = 0; along <= landing; along += 50) {
    const remaining = landing - along;
    const red = remaining < 1000 || (remaining < 3000 && Math.round(along / 50) % 2 === 1);
    lights.push(light(at(along, 2), red ? COLOURS.red : COLOURS.white, toward, 0.8, 0.9));
  }
  for (let along = 100; along <= 3000; along += 100) {
    for (const side of [-1, 1]) {
      for (let lamp = 0; lamp < 3; lamp++)
        lights.push(light(at(along, side * (36 + lamp * 5)), COLOURS.white, toward, 0.7, 0.8));
    }
  }
  // Approach lights: a barrette every 100 ft out to 2,400 ft, the 1,000 ft crossbar, red side rows inside it.
  for (let out = 100; out <= 2400; out += 100) {
    for (let lamp = -2; lamp <= 2; lamp++)
      lights.push(light(at(-out, lamp * 3.5, 1.5), COLOURS.white, toward, 1.3, 1.3));
    if (out <= 1000) {
      for (const side of [-1, 1]) {
        for (let lamp = 0; lamp < 3; lamp++)
          lights.push(light(at(-out, side * (36 + lamp * 5), 1.5), COLOURS.red, toward, 1.1, 1));
      }
    }
    if (out >= 1000) {
      lights.push({
        ...light(at(-out, 0, 2.5), COLOURS.flasher, toward, 2.4, 1.6),
        kind: 'flasher',
        parameter: ((2400 - out) / 1400) * 0.42,
      });
    }
  }
  for (let across = -50; across <= 50; across += 5)
    lights.push(light(at(-1000, across, 1.5), COLOURS.white, toward, 1.3, 1.3));
  // A two-bar VASI on the left: the near bar's beam at 2.5°, the far bar's at 3.25° — red over white on the path.
  for (const [alongFt, beamDegrees] of [
    [600, 2.5],
    [1300, 3.25],
  ] as const) {
    for (let box = 0; box < 3; box++) {
      lights.push({
        ...light(
          at(alongFt, -(end.widthFt / 2 + 50 + box * 15), 0.8),
          COLOURS.white,
          toward,
          1.8,
          1.4,
        ),
        kind: 'vasi',
        parameter: beamDegrees * (Math.PI / 180),
      });
    }
  }
  return lights;
}

/** What an airport's meshes need cleaning up, and the windows that light at night. */
interface Resources {
  paints: Texture[];
  materials: ShaderMaterial[];
  windows: MeshLambertMaterial[];
}

function buildAirport(data: AirportData, world: FlightWorld, resources: Resources): Built {
  const { paints, materials } = resources;
  const group = new Group();
  group.name = `airport ${data.ident}`;
  const arp = { lat: data.lat, lon: data.lon };
  const local = localMetres(arp);
  const place = (point: LatLon) => {
    const { east, north } = local(point);
    return new Vector3(east, 0, -north);
  };
  const programRunways =
    world.style === 'program' ? world.runways.filter((strip) => strip.airport === data.ident) : [];
  const lights: LightSpec[] = [];
  const surfaces: { start: Vector3; heading: number; lengthM: number; widthM: number }[] = [];

  for (const pair of data.runways) {
    const [a, b] = pair.ends;
    const program = programRunways.find(
      (strip) => strip.ident === a.ident || strip.ident === b.ident,
    );
    const near = program ?? runway(data.ident, a.ident);
    const far = program
      ? oppositeEnd(program, program.ident === a.ident ? b.ident : a.ident)
      : runway(data.ident, b.ident);
    const ends = [near, far];
    for (const end of ends) {
      const lengthFt = end.lengthFt / 2;
      const canvas = paintHalfRunway({
        ident: end.ident,
        widthFt: end.widthFt,
        lengthFt,
        displacedFt: end.displacedFt,
        precision: isPrecision(data.ident, end.ident) || end.widthFt >= 150,
        seed: data.ident.charCodeAt(1) * 97 + end.headingTrue,
      });
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = false;
      texture.anisotropy = 8;
      texture.minFilter = LinearMipmapLinearFilter;
      paints.push(texture);
      const material = surfaceMaterial(texture);
      materials.push(material);
      const mesh = new Mesh(
        strip(place(end.start), end.headingTrue, lengthFt * FT, end.widthFt * FT, 0.08),
        material,
      );
      mesh.name = `runway ${end.ident}`;
      group.add(mesh);
    }
    const inUse = ends.find((end) => isPrecision(data.ident, end.ident));
    lights.push(...runwayLights(inUse ?? near, place, inUse !== undefined));
    surfaces.push({
      start: place(near.start),
      heading: near.headingTrue,
      lengthM: near.lengthFt * FT,
      widthM: near.widthFt * FT,
    });
  }

  const main = surfaces.reduce(
    (longest, surface) => (surface.lengthM > longest.lengthM ? surface : longest),
    surfaces[0] as (typeof surfaces)[number],
  );
  addTaxiwayAndBuildings(group, main, surfaces, lights, resources);
  group.add(buildLights(lights));
  return { group, arp, elevationM: data.elevationFt * FT };
}

function solidTexture(colour: string, resources: Resources): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = colour;
    context.fillRect(0, 0, 2, 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  resources.paints.push(texture);
  return texture;
}

/** Is a point (airport frame) on, or close beside, any runway? */
function nearRunway(
  point: Vector3,
  surfaces: { start: Vector3; heading: number; lengthM: number; widthM: number }[],
  marginM: number,
) {
  return surfaces.some((surface) => {
    const radians = surface.heading * (Math.PI / 180);
    const offset = point.clone().sub(surface.start);
    const along = offset.x * Math.sin(radians) - offset.z * Math.cos(radians);
    const across = offset.x * Math.cos(radians) + offset.z * Math.sin(radians);
    return (
      along > -marginM &&
      along < surface.lengthM + marginM &&
      Math.abs(across) < surface.widthM / 2 + marginM
    );
  });
}

function addTaxiwayAndBuildings(
  group: Group,
  main: { start: Vector3; heading: number; lengthM: number; widthM: number },
  surfaces: { start: Vector3; heading: number; lengthM: number; widthM: number }[],
  lights: LightSpec[],
  resources: Resources,
) {
  const radians = main.heading * (Math.PI / 180);
  const forward = new Vector3(Math.sin(radians), 0, -Math.cos(radians));
  const right = new Vector3(Math.cos(radians), 0, Math.sin(radians));
  // The taxiway and the buildings go on whichever side has room for them.
  const side =
    [1, -1].find(
      (sign) =>
        !nearRunway(
          main.start
            .clone()
            .addScaledVector(forward, main.lengthM / 2)
            .addScaledVector(right, sign * 600),
          surfaces.filter((surface) => surface !== main),
          60,
        ),
    ) ?? 1;
  const taxiMaterial = surfaceMaterial(solidTexture('#4a4b4d', resources), new Color(1, 1, 1));
  resources.materials.push(taxiMaterial);
  const offset = right.clone().multiplyScalar(side * 600 * FT);
  const taxiStart = main.start.clone().add(offset);
  group.add(new Mesh(strip(taxiStart, main.heading, main.lengthM, 75 * FT, 0.06), taxiMaterial));
  const connectors = Math.max(2, Math.round(main.lengthM / 900));
  for (let index = 0; index <= connectors; index++) {
    const along = (index / connectors) * main.lengthM;
    const from = main.start.clone().addScaledVector(forward, along);
    group.add(
      new Mesh(
        strip(from, (main.heading + (side > 0 ? 90 : 270)) % 360, 600 * FT, 60 * FT, 0.05),
        taxiMaterial,
      ),
    );
  }
  for (let along = 0; along <= main.lengthM; along += 200 * FT) {
    for (const edge of [-1, 1]) {
      const at = taxiStart
        .clone()
        .addScaledVector(forward, along)
        .addScaledVector(right, edge * 40 * FT)
        .setY(0.4);
      lights.push(light(at, COLOURS.blue, null, 0.6, 0.6));
    }
  }

  const middle = main.start
    .clone()
    .addScaledVector(forward, main.lengthM / 2)
    .addScaledVector(right, side * 1500 * FT);
  if (nearRunway(middle, surfaces, 200)) return;
  const apron = new Mesh(
    strip(middle.clone().addScaledVector(forward, -450), main.heading, 900, 260, 0.04),
    taxiMaterial,
  );
  group.add(apron);
  const facade = new MeshLambertMaterial({ color: '#b9b4a8' });
  const glass = new MeshLambertMaterial({
    color: '#4e5a63',
    emissive: new Color('#ffcf8a'),
    emissiveIntensity: 0,
  });
  resources.windows.push(glass);
  const hangarSkin = new MeshLambertMaterial({ color: '#8a8f93' });
  const terminal = new Mesh(new BoxGeometry(280, 14, 60), [
    facade,
    facade,
    facade,
    facade,
    glass,
    glass,
  ]);
  terminal.position.copy(middle.clone().addScaledVector(right, side * 180)).setY(7);
  terminal.rotation.y = -radians;
  terminal.name = 'terminal';
  group.add(terminal);
  for (const along of [-420, 380]) {
    const hangar = new Mesh(new BoxGeometry(90, 24, 70), hangarSkin);
    hangar.position
      .copy(
        middle
          .clone()
          .addScaledVector(forward, along)
          .addScaledVector(right, side * 170),
      )
      .setY(12);
    hangar.rotation.y = -radians;
    group.add(hangar);
  }
  const towerBase = middle
    .clone()
    .addScaledVector(forward, -150)
    .addScaledVector(right, side * 320);
  const shaft = new Mesh(new CylinderGeometry(4, 5, 42, 12), facade);
  shaft.position.copy(towerBase).setY(21);
  const cab = new Mesh(new CylinderGeometry(8, 6, 7, 8), glass);
  cab.position.copy(towerBase).setY(45.5);
  cab.name = 'tower cab';
  group.add(shaft, cab);
}

export interface AirportsView {
  group: Group;
  place(frame: SceneFrame): void;
  /** Windows light up after dark. */
  setNight(night: number): void;
  dispose(): void;
}

export function buildAirports(world: FlightWorld): AirportsView {
  const root = new Group();
  root.name = 'airports';
  const resources: Resources = { paints: [], materials: [], windows: [] };
  const built = AIRPORTS.map((data) => buildAirport(data, world, resources));
  for (const airport of built) root.add(airport.group);
  return {
    group: root,
    place(frame) {
      for (const airport of built) {
        frame.toScene(airport.arp, airport.elevationM, airport.group.position);
        airport.group.updateMatrixWorld(true);
      }
    },
    setNight(night) {
      for (const glass of resources.windows) glass.emissiveIntensity = night * 0.9;
    },
    dispose() {
      root.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
      for (const material of resources.materials) material.dispose();
      for (const material of resources.windows) material.dispose();
      for (const texture of resources.paints) texture.dispose();
    },
  };
}
