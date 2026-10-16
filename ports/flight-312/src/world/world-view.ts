import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Euler,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { JUMBO } from '../engine/aircraft';
import type { Deck } from '../engine/flight';
import type { LatLon } from '../engine/geo';
import type { Terrain } from '../engine/terrain';
import { nearestField, skyAt } from '../engine/weather';
import type { FlightWorld } from '../engine/world';
import { buildAirports, type AirportsView } from './airports';
import { CloudLayers } from './clouds';
import { METRES_PER_FOOT, RECENTRE_METRES, SceneFrame } from './frame';
import { GlidePath } from './glidepath';
import { JumboModel, type Livery } from './jumbo';
import { ReplayOverlay, type OverlayPathPoint } from './replay-overlay';
import { lightUniforms } from './lights';
import { atmosphere } from './shaders';
import { SkyDome, skyLighting } from './sky';
import { sunAt } from './sun';
import { buildTerrain, type TerrainView } from './terrain-mesh';

/**
 * The world outside the windows, in Three.js: terrain, airports, cloud and
 * sky, lit by the sun of the flight's hour and fogged by its weather. It is
 * told where the eye is each frame and draws one picture; it never reads
 * the engine's state on its own, so the cockpit, the replay and the lab
 * pages can all point it wherever they like.
 */
export interface AircraftPose {
  position: LatLon;
  /** Main wheels above sea level, feet. */
  altitudeFt: number;
  headingTrue: number;
  pitchDeg: number;
  bankDeg: number;
  gear: number;
}

export type ViewPoint =
  | { kind: 'cockpit'; headYawDeg: number; headPitchDeg: number }
  | { kind: 'chase'; distanceM: number; heightM: number; orbitDeg: number }
  /** A camera standing somewhere, the tower or beside the runway, following the jumbo. */
  | { kind: 'spot'; position: LatLon; altitudeFt: number }
  | { kind: 'free'; position: LatLon; altitudeFt: number; headingDeg: number; pitchDeg: number };

export interface Picture {
  pose: AircraftPose;
  view: ViewPoint;
  /** Local time, seconds after midnight. */
  clock: number;
  /** Seconds of flight, for the drifting cloud, the flashers and the water. */
  time: number;
}

export interface Lens {
  /** Horizontal field of view, degrees. */
  horizontalFov: number;
  /** Where straight ahead falls, from the top of the picture: 0.5 is the middle. */
  boresight: number;
}

const NEAR_M = 0.4;
const FAR_M = 640_000;
const FT = METRES_PER_FOOT;
/** Visibility at 2 % contrast, from the fog's density: 1 − exp(−(dV)²) = 0.98. */
const densityForVisibility = (metres: number) => 1.978 / Math.max(metres, 30);

export class WorldView {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, NEAR_M, FAR_M);
  readonly frame: SceneFrame;
  private terrain: TerrainView;
  private airports: AirportsView;
  private clouds: CloudLayers;
  private glidePath: GlidePath | null;
  private sky = new SkyDome();
  private jumbo: JumboModel;
  private overlay: ReplayOverlay | null = null;
  private sun = new DirectionalLight(0xffffff, 3);
  private hemisphere = new HemisphereLight(0xbfd4ff, 0x40382c, 2.4);
  private fog = new FogExp2(0xaabbcc, 0.00005);
  private size = { width: 1, height: 1 };
  private lens: Lens = { horizontalFov: 72, boresight: 0.5 };
  private world: FlightWorld;
  /** How dark it is outside, 0 by day … 1 at night, as last drawn: the cockpit's lighting follows it. */
  night = 0;

  constructor(
    canvas: HTMLCanvasElement,
    world: FlightWorld,
    terrain: Terrain,
    detail: 'high' | 'low' = 'high',
    /** The Arcade level's ghost glidepath down the destination's ILS. */
    showGlidePath = false,
    deck: Deck = 'classic',
  ) {
    this.world = world;
    this.jumbo = new JumboModel('brightwater', deck);
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.frame = new SceneFrame(world.departure.threshold);
    this.terrain = buildTerrain(
      terrain,
      detail === 'high' ? { width: 4096, height: 2048 } : { width: 2048, height: 1024 },
    );
    this.airports = buildAirports(world);
    this.clouds = new CloudLayers(world.weather);
    this.glidePath = showGlidePath ? new GlidePath(world.ils) : null;
    if (this.glidePath) this.scene.add(this.glidePath.mesh);
    this.scene.fog = this.fog;
    this.scene.add(
      this.sky.mesh,
      this.terrain.group,
      this.airports.group,
      this.clouds.group,
      this.jumbo.group,
      this.sun,
      this.sun.target,
      this.hemisphere,
    );
    this.place();
  }

  private place() {
    this.terrain.place(this.frame);
    this.airports.place(this.frame);
    this.glidePath?.place(this.frame);
    this.overlay?.place(this.frame);
  }

  setSize(width: number, height: number, pixelRatio: number, lens: Lens) {
    this.size = { width, height };
    this.lens = lens;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.updateProjection();
  }

  /** A new lens for the same picture: the replay's long lenses zoom every frame. */
  setLens(lens: Lens) {
    this.lens = lens;
    this.updateProjection();
  }

  /** An off-centre lens: straight ahead sits at `boresight` down the picture, as through a flight deck's windows. */
  private updateProjection() {
    const { width, height } = this.size;
    const focal = width / 2 / Math.tan((this.lens.horizontalFov / 2) * (Math.PI / 180));
    const above = this.lens.boresight * height;
    const below = height - above;
    const half = Math.max(above, below);
    const fullHeight = half * 2;
    this.camera.aspect = width / fullHeight;
    this.camera.fov = 2 * Math.atan(half / focal) * (180 / Math.PI);
    this.camera.setViewOffset(width, fullHeight, 0, half - above, width, height);
    this.camera.updateProjectionMatrix();
    lightUniforms.uPixelsPerMetre.value = focal * this.renderer.getPixelRatio();
  }

  /** Where the eye is in the scene, and which way it looks, for this picture. */
  private aim(picture: Picture): { eye: Vector3; eyeAt: LatLon; eyeAltitudeFt: number } {
    const { pose, view } = picture;
    const body = new Quaternion().setFromEuler(
      new Euler(
        pose.pitchDeg * (Math.PI / 180),
        -pose.headingTrue * (Math.PI / 180),
        -pose.bankDeg * (Math.PI / 180),
        'YXZ',
      ),
    );
    const wheels = this.frame.toScene(pose.position, pose.altitudeFt * FT);
    this.jumbo.group.visible = view.kind === 'chase' || view.kind === 'spot';
    if (this.jumbo.group.visible) {
      this.jumbo.group.position.copy(wheels);
      this.jumbo.group.quaternion.copy(body);
    }
    if (view.kind === 'cockpit') {
      const offset = new Vector3(0, JUMBO.eyeHeightFt * FT, -JUMBO.eyeAheadFt * FT).applyQuaternion(
        body,
      );
      const eye = wheels.clone().add(offset);
      const head = new Quaternion().setFromEuler(
        new Euler(
          view.headPitchDeg * (Math.PI / 180),
          -view.headYawDeg * (Math.PI / 180),
          0,
          'YXZ',
        ),
      );
      this.camera.position.copy(eye);
      this.camera.quaternion.copy(body).multiply(head);
      return { eye, eyeAt: this.frame.toLatLon(eye.x, eye.z), eyeAltitudeFt: eye.y / FT };
    }
    if (view.kind === 'spot') {
      const eye = this.frame.toScene(view.position, view.altitudeFt * FT);
      this.camera.position.copy(eye);
      this.camera.lookAt(wheels.clone().add(new Vector3(0, 6, 0)));
      return { eye, eyeAt: view.position, eyeAltitudeFt: view.altitudeFt };
    }
    if (view.kind === 'chase') {
      const around = (pose.headingTrue + 180 + view.orbitDeg) * (Math.PI / 180);
      const eye = wheels
        .clone()
        .add(
          new Vector3(
            Math.sin(around) * view.distanceM,
            view.heightM,
            -Math.cos(around) * view.distanceM,
          ),
        );
      this.camera.position.copy(eye);
      this.camera.lookAt(wheels.clone().add(new Vector3(0, 5, 0)));
      return { eye, eyeAt: this.frame.toLatLon(eye.x, eye.z), eyeAltitudeFt: eye.y / FT };
    }
    const eye = this.frame.toScene(view.position, view.altitudeFt * FT);
    this.camera.position.copy(eye);
    this.camera.quaternion.setFromEuler(
      new Euler(view.pitchDeg * (Math.PI / 180), -view.headingDeg * (Math.PI / 180), 0, 'YXZ'),
    );
    return { eye, eyeAt: view.position, eyeAltitudeFt: view.altitudeFt };
  }

  render(picture: Picture) {
    let aimed = this.aim(picture);
    const flat = this.frame.flat(aimed.eyeAt);
    if (Math.hypot(flat.east, flat.north) > RECENTRE_METRES) {
      this.frame.moveTo(aimed.eyeAt);
      this.place();
      aimed = this.aim(picture);
    }
    this.light(picture, aimed.eyeAt, aimed.eyeAltitudeFt);
    this.clouds.update(this.frame, aimed.eye);
    this.jumbo.update(picture.pose.gear, picture.time);
    this.renderer.render(this.scene, this.camera);
  }

  /** The sun, the sky's colours and the fog for where the eye is. */
  private light(picture: Picture, eyeAt: LatLon, eyeAltitudeFt: number) {
    const weather = this.world.weather;
    const sun = sunAt(eyeAt, picture.clock);
    const elevation = sun.elevation * (Math.PI / 180);
    const azimuth = sun.azimuth * (Math.PI / 180);
    const sunDirection = new Vector3(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      -Math.cos(azimuth) * Math.cos(elevation),
    );
    const sky = skyAt(weather, eyeAt, eyeAltitudeFt);
    const field = nearestField(weather, eyeAt);
    const belowOvercast =
      field?.ceilingFt != null && eyeAltitudeFt < field.elevationFt + field.ceilingFt;
    const underBroken = weather.layers.some(
      (layer) => layer.cover >= 5 && eyeAltitudeFt < layer.baseFt,
    );
    const overcast = sky.inCloud || belowOvercast ? 1 : underBroken ? 0.35 : 0;
    const lighting = skyLighting(sun.elevation, overcast);
    if (sky.inCloud || belowOvercast) lighting.sunColor.multiplyScalar(sky.inCloud ? 0.25 : 0.12);

    // Clear air sees further the higher it goes; cloud and murk see only what the weather allows.
    const clearMetres = 18_000 + eyeAltitudeFt * FT * 6;
    const visibility = sky.inCloud
      ? 60
      : sky.visibilityMi < 10
        ? sky.visibilityMi * 1609
        : clearMetres;
    const density = densityForVisibility(visibility);
    const fogColour = sky.inCloud
      ? new Color('#c5c9cd').multiplyScalar(lighting.cloudLight)
      : lighting.horizon.clone().lerp(lighting.skyLight, 0.25);

    atmosphere.uSunDirection.value.copy(sunDirection);
    atmosphere.uSunColor.value.copy(lighting.sunColor);
    atmosphere.uSkyLight.value.copy(lighting.skyLight);
    atmosphere.uGroundLight.value.copy(lighting.groundLight);
    atmosphere.uFogColor.value.copy(fogColour);
    atmosphere.uFogDensity.value = density;
    atmosphere.uNight.value = lighting.night;
    this.night = lighting.night;
    atmosphere.uTime.value = picture.time;
    lightUniforms.uDaylight.value = 1 - lighting.night;
    this.fog.color.copy(fogColour);
    this.fog.density = density;
    this.renderer.setClearColor(fogColour);
    this.sun.color.copy(lighting.sunColor);
    this.sun.position.copy(this.camera.position).addScaledVector(sunDirection, 1000);
    this.sun.target.position.copy(this.camera.position);
    this.hemisphere.color.copy(lighting.skyLight);
    this.hemisphere.groundColor.copy(lighting.groundLight);
    this.airports.setNight(lighting.night);
    // Inside cloud the dome is the cloud itself: one grey, no sun, no gradient.
    const dome = sky.inCloud ? { ...lighting, zenith: fogColour, horizon: fogColour } : lighting;
    this.sky.update(this.camera.position, FAR_M * 0.8, dome, sunDirection, overcast, fogColour);
  }

  setLivery(livery: Livery) {
    this.jumbo.paint(livery);
  }

  /** Where the tower's cab nearest a place stands, if one is within a few miles: the replay's tower camera. */
  towerNear(point: LatLon, withinMetres = 8000): { position: LatLon; altitudeFt: number } | null {
    const target = this.frame.toScene(point, 0);
    let best: Vector3 | null = null;
    this.airports.group.traverse((object) => {
      if (object.name !== 'tower cab') return;
      const at = object.getWorldPosition(new Vector3());
      if (!best || at.distanceToSquared(target) < best.distanceToSquared(target)) best = at;
    });
    const found = best as Vector3 | null;
    // Fields crowded with runways have no buildings drawn, and so no tower of their own.
    if (!found || Math.hypot(found.x - target.x, found.z - target.z) > withinMetres) return null;
    return { position: this.frame.toLatLon(found.x, found.z), altitudeFt: (found.y + 2) / FT };
  }

  showReplayOverlay(path: readonly OverlayPathPoint[], touchdown: LatLon | null) {
    this.hideReplayOverlay();
    this.overlay = new ReplayOverlay(this.world.ils, path, touchdown);
    this.overlay.place(this.frame);
    this.scene.add(this.overlay.group);
  }

  hideReplayOverlay() {
    if (!this.overlay) return;
    this.scene.remove(this.overlay.group);
    this.overlay.dispose();
    this.overlay = null;
  }

  dispose() {
    this.terrain.dispose();
    this.airports.dispose();
    this.clouds.dispose();
    this.glidePath?.dispose();
    this.overlay?.dispose();
    this.sky.dispose();
    this.jumbo.dispose();
    this.renderer.dispose();
  }
}
