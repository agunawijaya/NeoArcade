import {
  NoToneMapping,
  AdditiveBlending,
  Color,
  ConeGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CGA_PALETTE, createPostFx, type PostFx } from '@shared/fx';
import { BEAM_HALF_ANGLE, BEAM_REACH, searchlightBeams } from '../engine/sight';
import { TURN } from '../engine/trig';
import type { World } from '../engine/world';
import type { Palette } from './palette';
import type { Scenery } from './scenery';
import { paintSunGlare } from './screen-light';
import { FLOOR, SKY_TOP, SideCamera } from './side/camera';
import { paintSplats } from './side/effects';
import { paintGrain } from './side/grain';
import { Actors } from './diorama/actors';
import { Backdrop } from './diorama/backdrop';
import { buildBiplane, type BiplaneModel } from './diorama/biplane-mesh';
import { aimCamera } from './diorama/camera';
import { DioramaEffects } from './diorama/effects';
import { FogBanks } from './diorama/fog';
import { GateModels } from './diorama/gates';
import { MaterialCache } from './diorama/materials';
import { PropModels } from './diorama/props';
import { RaiderModels } from './diorama/raiders';
import { DistantFleet } from './diorama/distant-fleet';
import { SeaSurface } from './diorama/sea';
import { ShipModels } from './diorama/ships';
import { TerrainMesh } from './diorama/terrain-mesh';
import { TorpedoModels } from './diorama/torpedoes';
import type { Frame, PlaneFrame, ViewRenderer, Viewport, WorldWindow } from './view';

const PLANE_DRAW_SCALE = 1.15;

/** Everything built for one battlefield in one light; rebuilt when either changes. */
interface Stage {
  world: World;
  lighting: Palette['lighting'];
  terrain: TerrainMesh;
  props: PropModels;
  backdrop: Backdrop;
  actors: Actors;
  sea: SeaSurface | null;
  distant: DistantFleet | null;
  ships: ShipModels;
  torpedoes: TorpedoModels;
  raiders: RaiderModels;
  gates: GateModels;
  fog: FogBanks;
  materials: MaterialCache;
}

/**
 * The diorama: the same strip of battlefield, seen from a little in front
 * and above in three.js, with depth, cast shadows, hills receding into
 * haze and clouds both behind and in front of the play. Gameplay stays on
 * the line z = 0, and the camera is set so that line shows exactly what the
 * side view shows (ADR "camera views").
 */
export class DioramaView implements ViewRenderer {
  readonly id = 'diorama' as const;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera();
  private readonly sun = new DirectionalLight('#ffffff', 2);
  private readonly sky = new HemisphereLight('#ffffff', '#445533', 1);
  private readonly effects = new DioramaEffects();
  private readonly planes = new Map<number, { model: BiplaneModel; side: number }>();
  private readonly searchlights: Mesh[] = [];
  private stage: Stage | null = null;
  private pixelRatio = 1;
  /**
   * The picture on screen: the 3D render with a transparent canvas over it
   * for the screen-space touches both views share (glare, grain, splats).
   * Only the CGA filter needs them flattened into one picture first, so
   * only then is the render copied, into `flat`, for the filter.
   */
  readonly element = document.createElement('div');
  private readonly overlayCanvas = document.createElement('canvas');
  private readonly overlay: CanvasRenderingContext2D;
  private readonly flat = document.createElement('canvas');
  private readonly flatContext: CanvasRenderingContext2D;
  private readonly fx: PostFx;
  private cga = false;

  constructor() {
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    // The palette is already the picture; no film curve on top of it.
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    const overlay = this.overlayCanvas.getContext('2d');
    const flat = this.flat.getContext('2d', { alpha: false });
    if (!overlay || !flat) throw new Error('Canvas 2D is not available.');
    this.overlay = overlay;
    this.flatContext = flat;
    this.fx = createPostFx(this.flat, {
      bloom: false,
      vignette: 0,
      palette: { ...CGA_PALETTE, dither: 0 },
    });
    this.element.className = 'stage__layers';
    this.element.append(this.renderer.domElement, this.overlayCanvas);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const shadow = this.sun.shadow.camera;
    shadow.left = -320;
    shadow.right = 320;
    shadow.top = 220;
    shadow.bottom = -120;
    shadow.near = 10;
    shadow.far = 1600;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target, this.sky, this.effects.group);
  }

  setFilter(cga: boolean) {
    this.cga = cga;
    this.element.replaceChildren(
      ...(cga ? [this.fx.canvas] : [this.renderer.domElement, this.overlayCanvas]),
    );
  }

  fieldOfView(viewport: Viewport, cameraX: number): WorldWindow {
    return SideCamera.fieldOfView(viewport, cameraX);
  }

  resize(viewport: Viewport, pixelRatio: number) {
    this.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(viewport.width, viewport.height, false);
    for (const canvas of [this.overlayCanvas, this.flat]) {
      canvas.width = Math.round(viewport.width * pixelRatio);
      canvas.height = Math.round(viewport.height * pixelRatio);
    }
  }

  render(frame: Frame, viewport: Viewport) {
    const { world, palette, time } = frame;
    const stage = this.stageFor(world, palette, frame.scenery);
    stage.terrain.refresh();
    stage.backdrop.update(palette, viewport, frame.sun === null ? 0 : ease(frame.sun));
    stage.props.update(time);
    stage.actors.update(world, time);
    stage.sea?.update(time);
    stage.distant?.update(time);
    stage.ships.update(world, frame.focus, frame.rescues, time);
    stage.torpedoes.update(world, time);
    stage.raiders.update(world, time);
    stage.gates.update(world, time);

    const { zoom, centreY } = this.sunCamera(frame);
    aimCamera(this.camera, viewport, frame.cameraX, zoom, centreY);
    this.light(palette, frame.cameraX);
    this.updatePlanes(frame, viewport);
    this.updateSearchlights(world, palette);
    const band = viewport.height - viewport.insetTop - viewport.insetBottom;
    this.effects.update(
      world,
      frame.particles,
      palette,
      (band / (SKY_TOP - FLOOR)) * zoom * this.pixelRatio,
      time,
    );
    this.renderer.render(this.scene, this.camera);
    this.finish(frame, viewport);
  }

  /** Adds the glare, the paper grain and the goggles' splats over the render. */
  private finish(frame: Frame, viewport: Viewport) {
    const ctx = this.cga ? this.flatContext : this.overlay;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.cga) ctx.drawImage(this.renderer.domElement, 0, 0, this.flat.width, this.flat.height);
    else ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    if (frame.sun !== null) paintSunGlare(ctx, viewport, ease(frame.sun), frame.palette);
    paintGrain(ctx, viewport.width, viewport.height, 0.12);
    paintSplats(ctx, viewport.width, viewport.height, frame.splats, frame.palette.daylight);
    if (this.cga) this.fx.render();
  }

  /** The push-in during the flight into the sun, matching the side view's (and, like it, still for reduced motion). */
  private sunCamera(frame: Frame): { zoom: number; centreY: number | null } {
    if (frame.sun === null || !frame.focus || frame.reducedMotion)
      return { zoom: 1, centreY: null };
    const zoom = 1 + ease(frame.sun) * 0.6;
    const visible = (SKY_TOP - FLOOR) / zoom;
    const ground = frame.world.terrain.heightAt(frame.cameraX);
    return { zoom, centreY: Math.max(FLOOR + visible / 2, ground - 22 + visible / 2) };
  }

  private stageFor(world: World, palette: Palette, scenery: Scenery): Stage {
    const current = this.stage;
    if (current && current.world === world && current.lighting === palette.lighting) {
      current.terrain.setPalette(palette);
      current.sea?.setPalette(palette);
      return current;
    }
    if (current) this.teardown(current);
    const materials = new MaterialCache();
    const terrain = new TerrainMesh(world.terrain, world.map, scenery, palette);
    const props = new PropModels(scenery, materials, palette, (x, z) => terrain.backHeight(x, z));
    const backdrop = new Backdrop(this.scene, scenery, world.map.seed, world.map.sea);
    const actors = new Actors(materials, palette);
    const sea = world.map.sea ? new SeaSurface(world.map.sea, palette) : null;
    const distant = world.map.sea
      ? new DistantFleet(world.map.sea, world.map.seed, materials, palette)
      : null;
    const ships = new ShipModels(materials, palette);
    const torpedoes = new TorpedoModels(materials, palette);
    const raiders = new RaiderModels(materials, palette);
    const gates = new GateModels(world, materials, palette);
    const fog = new FogBanks(world.map, palette, (x) => world.terrain.heightAt(x));
    this.scene.add(
      terrain.mesh,
      props.group,
      backdrop.group,
      actors.group,
      ships.group,
      torpedoes.group,
      raiders.group,
      gates.group,
      fog.group,
    );
    if (sea) this.scene.add(sea.group);
    if (distant) this.scene.add(distant.group);
    this.scene.fog = new Fog(new Color(palette.haze), 700, 9000);
    const stage: Stage = {
      world,
      lighting: palette.lighting,
      terrain,
      props,
      backdrop,
      actors,
      sea,
      distant,
      ships,
      torpedoes,
      raiders,
      gates,
      fog,
      materials,
    };
    this.stage = stage;
    return stage;
  }

  private teardown(stage: Stage) {
    this.scene.remove(
      stage.terrain.mesh,
      stage.props.group,
      stage.backdrop.group,
      stage.actors.group,
      stage.ships.group,
      stage.torpedoes.group,
      stage.raiders.group,
      stage.gates.group,
      stage.fog.group,
    );
    if (stage.sea) this.scene.remove(stage.sea.group);
    if (stage.distant) this.scene.remove(stage.distant.group);
    stage.terrain.dispose();
    stage.props.dispose();
    stage.backdrop.dispose();
    stage.actors.dispose();
    stage.sea?.dispose();
    stage.distant?.dispose();
    stage.ships.dispose();
    stage.torpedoes.dispose();
    stage.raiders.dispose();
    stage.gates.dispose();
    stage.fog.dispose();
    stage.materials.dispose();
    for (const { model } of this.planes.values()) {
      this.scene.remove(model.group);
      model.dispose();
    }
    this.planes.clear();
  }

  /** The sun (or moon) from above and in front, casting the planes' shadows on the land. */
  private light(palette: Palette, cameraX: number) {
    const day = palette.daylight;
    this.sun.color.set(day > 0.5 ? '#fff1d6' : '#a9b8e8');
    this.sun.intensity = 0.7 + day * 1.5;
    const sideways = (palette.sun.x - 0.5) * 600;
    this.sun.position.set(cameraX + sideways, 520, 380);
    this.sun.target.position.set(cameraX, 40, -20);
    this.sky.color.set(palette.sky[1]);
    this.sky.groundColor.set(palette.grass[2]);
    this.sky.intensity = 0.9 + day * 0.5;
    if (this.scene.fog instanceof Fog) this.scene.fog.color.set(palette.haze);
  }

  private updatePlanes(frame: Frame, viewport: Viewport) {
    const seen = new Set<number>();
    for (const planeFrame of frame.planes) {
      const { plane } = planeFrame;
      if (plane.state === 'out' || plane.ghost) continue;
      seen.add(plane.id);
      let entry = this.planes.get(plane.id);
      if (!entry) {
        const materials = this.stage?.materials ?? new MaterialCache();
        entry = {
          model: buildBiplane(
            frame.liveries.get(plane.id) ?? frame.palette.liveries[plane.side],
            materials,
          ),
          side: plane.side,
        };
        entry.model.group.scale.setScalar(PLANE_DRAW_SCALE);
        this.planes.set(plane.id, entry);
        this.scene.add(entry.model.group);
      }
      this.posePlane(entry.model, planeFrame, frame, viewport);
    }
    for (const [id, entry] of this.planes) {
      if (seen.has(id)) continue;
      this.scene.remove(entry.model.group);
      entry.model.dispose();
      this.planes.delete(id);
    }
  }

  private posePlane(model: BiplaneModel, planeFrame: PlaneFrame, frame: Frame, viewport: Viewport) {
    const { plane } = planeFrame;
    const group = model.group;
    group.position.set(plane.x, plane.y, 0);
    group.rotation.set(planeFrame.roll, 0, (plane.heading / TURN) * Math.PI * 2, 'ZYX');
    group.scale.setScalar(PLANE_DRAW_SCALE);
    model.propeller.rotation.x = planeFrame.spin;
    model.scarf.rotation.y = Math.sin(frame.time * 13 + plane.id) * 0.25;
    if (plane.state === 'victory' && frame.sun !== null && plane === frame.focus) {
      // Into the sun: fly off towards it, into the distance.
      const t = ease(Math.max(0, (frame.sun - 0.25) / 0.75));
      const target = this.sunPoint(frame.palette, viewport);
      group.position.lerp(target, t * 0.9);
    }
  }

  /** A point far away in the direction of the painted sun, for the winner to fly towards. */
  private sunPoint(palette: Palette, viewport: Viewport): Vector3 {
    const bandTop = viewport.insetTop / viewport.height;
    const band = (viewport.height - viewport.insetTop - viewport.insetBottom) / viewport.height;
    const screenY = bandTop + band * palette.sun.y;
    const point = new Vector3(palette.sun.x * 2 - 1, 1 - screenY * 2, 0.995).unproject(this.camera);
    return point;
  }

  /** At night each enemy airfield and big warship sweeps a pale cone of light across the sky: the engine's own beams. */
  private updateSearchlights(world: World, palette: Palette) {
    const beams = searchlightBeams(world);
    while (this.searchlights.length < beams.length) {
      const beam = new Mesh(
        new ConeGeometry(
          BEAM_REACH * Math.tan((BEAM_HALF_ANGLE / TURN) * Math.PI * 2),
          BEAM_REACH,
          24,
          1,
          true,
        ),
        new MeshBasicMaterial({
          color: '#fff6d6',
          transparent: true,
          opacity: 0.1,
          blending: AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      );
      beam.geometry.translate(0, -BEAM_REACH / 2, 0);
      this.searchlights.push(beam);
      this.scene.add(beam);
    }
    this.searchlights.forEach((cone, index) => {
      const beam = beams[index];
      cone.visible = palette.daylight < 0.5 && beam !== undefined;
      if (!beam) return;
      cone.position.set(beam.x, beam.y, -6);
      // The cone's axis points down its own −y; turn it to the beam's heading.
      cone.rotation.z = (beam.heading / TURN) * Math.PI * 2 + Math.PI / 2;
    });
  }

  dispose() {
    if (this.stage) this.teardown(this.stage);
    this.effects.dispose();
    this.renderer.dispose();
    this.fx.dispose();
  }
}

function ease(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}
