import { createRng } from '@shared/rng';
import type { RegionId } from '../data/regions';
import { css, lit, litRgb, mix, rgb, type Lighting } from './colour';
import { paintFarLayer, type FarLayer } from './horizon';
import { paintLandmark, type Landmark } from './landmarks';
import { LANDSCAPES, type Landscape, type NearKind } from './landscapes';
import { HEIGHTS, PAINTERS, type SceneEnv, type SceneryKind } from './scenery';
import { rigLightsFor, type DriveScene, type PatrolScene } from './scene';
import { lightingFor, paintSky } from './sky';
import { daylight } from './sun';
import type { Vec3 } from './vehicles/geometry';
import { environmentFor, sunAcross, type Environment } from './vehicles/light';
import { drawOfficerSide } from './vehicles/officer';
import { RIG } from './vehicles/rig/model';
import { RigSideView } from './vehicles/rig/side';
import { BEACONS } from './vehicles/sedan/body';
import { barFlash, washWith } from './vehicles/sedan/lightbar';
import { PATROL, SEDAN } from './vehicles/sedan/model';
import { SedanSideView } from './vehicles/sedan/sedan';
import { paintFatigue, paintPrecipitation } from './weather-fx';

/**
 * The side view: the rig crossing a layered landscape from left to right.
 * Far ranges barely move, fields and farms drift by, fence posts and the
 * road rush past. Each band of scenery is built tile by tile from a seed, in
 * the landscape of the region the tile first appeared in, so a new region
 * rolls in from the right edge as the rig crosses into it.
 */
interface Prop {
  kind: SceneryKind;
  offset: number;
  /** 0 by the road … 1 towards the horizon. */
  depth: number;
  variant: number;
}

interface Tile {
  region: RegionId;
  props: Prop[];
}

/** Scenery bands: how deep they sit and how fast they move against the road. */
const BANDS = [
  { depth: 0.85, parallax: 0.12, tile: 900, share: 0.3 },
  { depth: 0.5, parallax: 0.22, tile: 700, share: 0.35 },
  { depth: 0.15, parallax: 0.4, tile: 600, share: 0.35 },
] as const;

const FIELD_KINDS: ReadonlySet<SceneryKind> = new Set(['corn', 'wheat', 'cotton']);

/** Landscapes where the road climbs: the exhaust runs darker there. */
const CLIMBS: ReadonlySet<RegionId> = new Set([
  'rockies',
  'sierra',
  'appalachian',
  'ponderosa',
  'northwest',
  'turnpike',
]);
/**
 * The sun's lean across the road. Painted in the sky it stands in front of
 * the camera, but a low sun that only ever lit the far side would leave the
 * rig in its own shadow all golden hour; like any illustrator, the diorama
 * lets it reach round to the side we see.
 */
const SUNWARD: readonly [number, number, number] = [-0.1, 0, 0.75];

export class DioramaView {
  private readonly tiles = BANDS.map(() => new Map<number, Tile>());
  private readonly rig = new RigSideView();
  private readonly cruiser = new SedanSideView();
  private farLayers = new Map<RegionId, FarLayer[]>();

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, scene: DriveScene) {
    const light = lightingFor(scene.sunAltitude, scene.condition);
    const night = 1 - daylight(scene.sunAltitude);
    // On a short screen the dashboard sits along the bottom, so the road rides higher.
    const compact = height < 520;
    const horizon = Math.round(height * (compact ? 0.44 : 0.5));
    const roadTop = Math.round(height * (compact ? 0.64 : 0.745));
    const roadBottom = Math.round(height * (compact ? 0.79 : 0.9));
    // A paved shoulder beyond the edge line, where a rig pulls over.
    const shoulder = Math.round(roadBottom + (roadBottom - roadTop) * 0.34);
    const unit = height / 100;
    const landscape = LANDSCAPES[scene.region];
    const before = LANDSCAPES[scene.previousRegion];
    const blend = Math.max(0, Math.min(1, scene.regionBlend));

    paintSky(
      ctx,
      width,
      horizon,
      {
        sunAltitude: scene.sunAltitude,
        sunArc: scene.sunArc,
        condition: scene.condition,
        time: scene.time,
        scroll: scene.scroll,
      },
      scene.reducedMotion,
    );

    const farFrame = { width, horizon, scroll: scene.scroll, light, night, alpha: 1 };
    if (blend < 1)
      for (const layer of this.farFor(scene.previousRegion, before))
        paintFarLayer(ctx, layer, { ...farFrame, alpha: 1 - blend });
    for (const layer of this.farFor(scene.region, landscape))
      paintFarLayer(ctx, layer, { ...farFrame, alpha: blend });
    if (scene.city > 0.05) {
      // The town rises as it nears: a few blocks for a small city, towers for a hub.
      const city = Math.min(1, scene.city);
      paintFarLayer(
        ctx,
        { kind: 'skyline', colour: '#6a7282', height: 0.12 + 0.4 * city, depth: 0.55, seed: 4242 },
        { ...farFrame, alpha: Math.min(1, city * 2.5) },
      );
    }

    // The ground, from the horizon down to the road.
    const snow = scene.snow;
    const groundTop = mix(rgb(before.groundFar), rgb(landscape.groundFar), blend);
    const groundBottom = mix(rgb(before.ground), rgb(landscape.ground), blend);
    const snowy = rgb('#eef2f6');
    const ground = ctx.createLinearGradient(0, horizon, 0, roadTop);
    ground.addColorStop(0, css(litRgb(snow ? mix(groundTop, snowy, 0.8) : groundTop, light, 0.6)));
    ground.addColorStop(
      1,
      css(litRgb(snow ? mix(groundBottom, snowy, 0.75) : groundBottom, light, 0.15)),
    );
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, width, roadTop - horizon + 1);
    this.paintGroundTexture(ctx, width, horizon, roadTop, scene, landscape, light);

    const env = (distance: number): SceneEnv => ({
      light,
      season: scene.season,
      snow,
      time: scene.time,
      distance,
      reducedMotion: scene.reducedMotion,
    });

    BANDS.forEach((band, index) => {
      this.paintBand(ctx, index, band, scene, width, horizon, roadTop, unit, env(band.depth * 0.8));
    });

    // Clear of the dashboard readings on the left and the throttle on the right.
    const rigLength = Math.min(width * 0.42, height * 0.8);
    const rigX = width * (compact ? 0.21 : 0.235);
    const cabX = rigX + rigLength * 0.97;
    this.paintLandmarks(
      ctx,
      scene.landmarks,
      scene,
      width,
      cabX,
      roadTop,
      unit,
      light,
      night,
      'behind',
    );
    this.paintRoad(ctx, width, roadTop, roadBottom, shoulder, scene, landscape, light);
    this.paintNear(ctx, width, roadTop, roadBottom, scene, landscape, unit, env(0));

    this.paintTraffic(
      ctx,
      scene,
      { roadTop, roadBottom, shoulder, rigX, rigLength },
      landscape,
      night,
    );
    this.paintLandmarks(
      ctx,
      scene.landmarks,
      scene,
      width,
      cabX,
      roadTop,
      unit,
      light,
      night,
      'front',
    );
    this.paintForeground(ctx, width, height, shoulder, scene, landscape, light, unit);

    paintPrecipitation(ctx, {
      width,
      height,
      condition: scene.condition,
      time: scene.time,
      wind: scene.stopped ? 0 : Math.min(1, scene.speed / 70),
      night,
      reducedMotion: scene.reducedMotion,
    });
    paintFatigue(ctx, width, height, scene.fatigue, scene.time, scene.reducedMotion);
  }

  /**
   * The rig and, when there is one, the patrol car: each in its lane, the
   * one further across the road drawn first and a little smaller.
   */
  private paintTraffic(
    ctx: CanvasRenderingContext2D,
    scene: DriveScene,
    road: {
      roadTop: number;
      roadBottom: number;
      shoulder: number;
      rigX: number;
      rigLength: number;
    },
    landscape: Landscape,
    night: number,
  ) {
    const wet = scene.condition === 'wet' || scene.condition === 'rain';
    const env = environmentFor({
      sunAltitude: scene.sunAltitude,
      condition: scene.condition,
      sun: sunAcross(scene.sunArc, scene.sunAltitude, SUNWARD),
      ground: wet ? '#2e3136' : scene.snow ? '#8d939a' : '#4a4d52',
      horizon: landscape.groundFar,
    });
    const band = road.roadBottom - road.roadTop;
    const ourLane = road.roadTop + band * 0.62;
    // Across the road: the passing lane (1), ours (0), the shoulder (−1).
    const laneY = (lane: number) =>
      lane >= 0
        ? ourLane - band * 0.42 * lane
        : ourLane + (road.roadBottom + (road.shoulder - road.roadBottom) * 0.6 - ourLane) * -lane;
    const depthScale = (y: number) => 1 + ((y - ourLane) / band) * 0.1;
    const patrol = scene.patrol;
    const rigY = laneY(patrol?.rigLane ?? 0);
    // Pulling onto the shoulder slides the rig's painting down rather than repainting it.
    const drawRig = () => {
      ctx.save();
      ctx.translate(0, rigY - ourLane);
      this.paintRig(ctx, scene, road.rigX, ourLane, road.rigLength, env, night);
      ctx.restore();
    };
    if (!patrol) {
      drawRig();
      return;
    }
    const carY = laneY(patrol.lane);
    const rigCamera = this.rig.camera({ left: road.rigX, road: rigY, length: road.rigLength });
    const bumper = rigCamera.project([RIG.bumper, 0, 0]).x;
    const scale = rigCamera.pixelsAt([0, 0, 0]) * (depthScale(carY) / depthScale(rigY));
    const left = bumper + (patrol.gap - SEDAN.length) * scale;
    const drawCar = () => {
      this.paintCruiser(ctx, scene, patrol, left, carY, scale, env);
      if (patrol.lights.spot && patrol.gap > 0)
        this.paintSpotlight(
          ctx,
          left + 11.4 * scale,
          carY - 3.6 * scale,
          rigCamera.project([56, 7.5, 4]),
          env.night,
        );
    };
    if (patrol.lane > patrol.rigLane) {
      drawCar();
      drawRig();
    } else {
      drawRig();
      drawCar();
    }
    const officer = patrol.officer;
    if (!officer) return;
    // He walks the shoulder on the near side, so he is drawn over both.
    const feet: Vec3 = [RIG.bumper + officer.along, 0, RIG.trailer.halfWidth + officer.out];
    const at = rigCamera.project(feet);
    drawOfficerSide(ctx, at.x, at.y, rigCamera.pixelsAt(feet), officer, {
      light: litByTheCruiser(env.lighting, env.night),
      night: env.night,
      time: scene.reducedMotion ? 0 : scene.time,
    });
  }

  private paintCruiser(
    ctx: CanvasRenderingContext2D,
    scene: DriveScene,
    patrol: PatrolScene,
    left: number,
    road: number,
    scale: number,
    env: Environment,
  ) {
    this.cruiser.draw(ctx, {
      model: PATROL,
      state: {
        lights: patrol.lights,
        turn: patrol.rolled / SEDAN.tyreRadius,
        steer: 0,
        sway: 0,
        door: patrol.door,
      },
      env,
      time: scene.time,
      reducedMotion: scene.reducedMotion,
      left,
      road,
      scale,
      lift: 0,
    });
    if (env.night > 0.3) {
      // The rig's headlights on the cruiser's back.
      const glare = ctx.createRadialGradient(
        left,
        road - scale * 2,
        0,
        left,
        road - scale * 2,
        scale * 14,
      );
      glare.addColorStop(0, `rgba(255, 236, 200, ${0.3 * env.night})`);
      glare.addColorStop(1, 'rgba(255, 236, 200, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glare;
      ctx.fillRect(left - scale * 14, road - scale * 16, scale * 28, scale * 28);
      ctx.restore();
    }
    if (!patrol.lights.bar) return;
    // The beacons light the road round the car, the rig beside it, and after dark the whole scene.
    const flash = barFlash(scene.time, scene.reducedMotion);
    const x = left + BEACONS.blue[0] * scale;
    washWith(ctx, x, road, scale * 60, flash, 0.25 + env.night * 0.9, 0.12);
    washWith(ctx, x, road - BEACONS.blue[1] * scale, scale * 42, flash, 0.12 + env.night * 0.6);
    if (env.night > 0.3)
      washWith(ctx, x - scale * 30, road - scale * 8, scale * 110, flash, env.night * 0.35, 0.7);
  }

  /** The officer's spotlight turned back on the rig's door: a pale beam and a bright patch. */
  private paintSpotlight(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    target: { x: number; y: number },
    night: number,
  ) {
    if (night < 0.3) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(x, y, target.x, target.y);
    beam.addColorStop(0, `rgba(255, 248, 225, ${0.16 * night})`);
    beam.addColorStop(1, `rgba(255, 248, 225, ${0.02 * night})`);
    ctx.fillStyle = beam;
    const spread = Math.hypot(target.x - x, target.y - y) * 0.06;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(target.x, target.y - spread);
    ctx.lineTo(target.x, target.y + spread);
    ctx.closePath();
    ctx.fill();
    const patch = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, spread * 1.4);
    patch.addColorStop(0, `rgba(255, 250, 235, ${0.38 * night})`);
    patch.addColorStop(1, 'rgba(255, 250, 235, 0)');
    ctx.fillStyle = patch;
    ctx.fillRect(target.x - spread * 1.4, target.y - spread * 1.4, spread * 2.8, spread * 2.8);
    ctx.restore();
  }

  private paintRig(
    ctx: CanvasRenderingContext2D,
    scene: DriveScene,
    left: number,
    road: number,
    length: number,
    env: Environment,
    night: number,
  ) {
    const scale = this.rig.camera({ left, road, length }).pixelsAt([0, 0, 0]);
    const rough = scene.condition === 'blizzard' || scene.condition === 'light-snow' ? 1.6 : 1;
    // The tractor rides its springs; the trailer follows a beat later over the same bumps.
    const ride = (t: number) => (Math.sin(t * 9) * 0.07 + Math.sin(t * 3.3) * 0.03) * rough;
    const moving = !scene.stopped && !scene.reducedMotion;
    // The trailer rocking on its springs as the brakes take hold.
    const settle = scene.reducedMotion ? 0 : (scene.patrol?.settle ?? 0);
    this.rig.draw(ctx, {
      model: scene.rig,
      lights: rigLightsFor(scene, night),
      env,
      left,
      road,
      length,
      turn: scene.scroll / (RIG.tyreRadius * scale),
      steer: 0,
      tractorLift: (moving ? ride(scene.time) : 0) + settle * 0.4,
      trailerLift: (moving ? ride(scene.time - 0.12) * 0.9 : 0) + settle,
      throttle: scene.stopped ? 0 : Math.min(1, scene.speed / 70),
      climb: CLIMBS.has(scene.region) ? 0.7 : 0,
      time: scene.time,
      reducedMotion: scene.reducedMotion,
    });
  }

  private farFor(region: RegionId, landscape: Landscape): FarLayer[] {
    let layers = this.farLayers.get(region);
    if (!layers) {
      const seed = [...region].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) >>> 0;
      layers = landscape.far.map((layer, index) => ({ ...layer, seed: seed + index * 977 }));
      this.farLayers.set(region, layers);
    }
    return layers;
  }

  private tileFor(
    band: number,
    index: number,
    region: RegionId,
    tileWidth: number,
    share: number,
  ): Tile {
    const cache = this.tiles[band] as Map<number, Tile>;
    let tile = cache.get(index);
    if (tile) return tile;
    const landscape = LANDSCAPES[region];
    const rng = createRng(`band${band}:${index}`);
    const total = landscape.mid.reduce((sum, [, weight]) => sum + weight, 0);
    const count = Math.round(
      ((landscape.midDensity * tileWidth) / 1000) * share * 1.9 * rng.float(0.6, 1.5),
    );
    const props: Prop[] = [];
    for (let item = 0; item < count; item++) {
      let roll = rng.next() * total;
      let kind: SceneryKind = landscape.mid[0]?.[0] ?? 'oak';
      for (const [candidate, weight] of landscape.mid) {
        roll -= weight;
        if (roll < 0) {
          kind = candidate;
          break;
        }
      }
      props.push({ kind, offset: rng.next() * tileWidth, depth: rng.next(), variant: rng.next() });
    }
    props.sort((a, b) => b.depth - a.depth);
    tile = { region, props };
    cache.set(index, tile);
    // Forget tiles far behind, so a long trip does not keep every field it ever passed.
    for (const old of cache.keys()) if (old < index - 6) cache.delete(old);
    return tile;
  }

  private paintBand(
    ctx: CanvasRenderingContext2D,
    bandIndex: number,
    band: (typeof BANDS)[number],
    scene: DriveScene,
    width: number,
    horizon: number,
    roadTop: number,
    unit: number,
    env: SceneEnv,
  ) {
    const offset = scene.scroll * band.parallax;
    const first = Math.floor((offset - width * 0.3) / band.tile);
    const last = Math.floor((offset + width * 1.2) / band.tile);
    const top = horizon + (roadTop - horizon) * (1 - band.depth) * 0.75;
    const bandHeight = (roadTop - horizon) * 0.22;
    for (let index = first; index <= last; index++) {
      const tile = this.tileFor(bandIndex, index, scene.region, band.tile, band.share);
      for (const prop of tile.props) {
        const x = index * band.tile + prop.offset - offset;
        if (x < -width * 0.2 || x > width * 1.2) continue;
        const y = top + bandHeight * (0.5 - prop.depth * 0.5);
        const scale = unit * (6 + (1 - band.depth) * 9) * (1 - prop.depth * 0.25);
        const size = scale * HEIGHTS[prop.kind];
        PAINTERS[prop.kind](
          ctx,
          x,
          y,
          FIELD_KINDS.has(prop.kind) ? scale * 2 : size,
          prop.variant,
          env,
        );
      }
    }
  }

  /**
   * Patches of darker and paler ground in bands that slide at their own
   * depth, and furrows where the land is farmed: enough to read distance.
   */
  private paintGroundTexture(
    ctx: CanvasRenderingContext2D,
    width: number,
    horizon: number,
    roadTop: number,
    scene: DriveScene,
    landscape: Landscape,
    light: ReturnType<typeof lightingFor>,
  ) {
    const bands = 6;
    const farmed = landscape.mid.some(
      ([kind]) => kind === 'corn' || kind === 'wheat' || kind === 'cotton',
    );
    for (let band = 0; band < bands; band++) {
      const t = band / bands;
      const y = horizon + (roadTop - horizon) * (t * t * 0.9 + 0.04);
      const thickness = (roadTop - horizon) * (0.04 + t * 0.12);
      const parallax = 0.06 + t * 0.4;
      const spacing = 120 + t * 260;
      const offset = (scene.scroll * parallax) % spacing;
      const base = scene.snow ? '#e4e9ee' : landscape.ground;
      for (
        let x = -offset - spacing, step = Math.floor((scene.scroll * parallax) / spacing);
        x < width + spacing;
        x += spacing, step++
      ) {
        const seed = (step * 7919 + band * 104729) >>> 0;
        const jitter = (seed % 97) / 97;
        const tone = (seed % 13) / 13 < 0.5 ? -0.08 : 0.06;
        ctx.fillStyle = lit(base, { ...light, day: light.day * (1 + tone) }, 0.5 - t * 0.45);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.ellipse(
          x + jitter * spacing,
          y,
          spacing * (0.25 + jitter * 0.3),
          thickness * 0.5,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      if (farmed && !scene.snow && band > 1) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = lit('#3f4a26', light, 0.4 - t * 0.35);
        ctx.fillRect(0, y - thickness * 0.1, width, Math.max(1, thickness * 0.08));
      }
      ctx.globalAlpha = 1;
    }
  }

  private paintRoad(
    ctx: CanvasRenderingContext2D,
    width: number,
    roadTop: number,
    roadBottom: number,
    shoulder: number,
    scene: DriveScene,
    landscape: Landscape,
    light: ReturnType<typeof lightingFor>,
  ) {
    const wet = scene.condition === 'wet' || scene.condition === 'rain';
    const snowRoad = scene.condition === 'blizzard' || scene.condition === 'light-snow';
    ctx.fillStyle = lit(landscape.shoulder, light, 0.05);
    ctx.fillRect(0, roadTop - 4, width, 5);
    // The near shoulder: paler asphalt, with a rumble strip beside the edge line.
    const verge = ctx.createLinearGradient(0, roadBottom, 0, shoulder);
    const pale = rgb(wet ? '#3c3f44' : snowRoad ? '#a9aeb4' : '#5f6267');
    verge.addColorStop(0, css(litRgb(mix(pale, rgb(landscape.shoulder), 0.3), light)));
    verge.addColorStop(1, css(litRgb(mix(pale, rgb(landscape.shoulder), 0.6), light)));
    ctx.fillStyle = verge;
    ctx.fillRect(0, roadBottom, width, shoulder - roadBottom);
    ctx.fillStyle = lit('#2e3034', light);
    const rumble = Math.max(2, (shoulder - roadBottom) * 0.1);
    for (let x = -(scene.scroll % 9); x < width; x += 9)
      ctx.fillRect(x, roadBottom + rumble, 4, rumble);
    const asphalt = ctx.createLinearGradient(0, roadTop, 0, roadBottom);
    const base = wet ? '#2e3136' : snowRoad ? '#8d939a' : '#4a4d52';
    asphalt.addColorStop(0, lit(base, light));
    asphalt.addColorStop(1, lit(wet ? '#24272b' : '#3c3f44', light));
    ctx.fillStyle = asphalt;
    ctx.fillRect(0, roadTop, width, roadBottom - roadTop);
    // Lane line: dashes ten feet long every forty, rushing past.
    const laneY = roadTop + (roadBottom - roadTop) * 0.36;
    const dash = (roadBottom - roadTop) * 0.9;
    const gap = dash * 2.6;
    const shift = scene.scroll % (dash + gap);
    ctx.fillStyle = lit(snowRoad ? '#dfe4ea' : '#efe8d0', light);
    for (let x = -shift; x < width; x += dash + gap)
      ctx.fillRect(x, laneY, dash, Math.max(2, (roadBottom - roadTop) * 0.035));
    ctx.fillStyle = lit('#e9e1c4', light);
    ctx.fillRect(
      0,
      roadBottom - Math.max(2, (roadBottom - roadTop) * 0.04),
      width,
      Math.max(2, (roadBottom - roadTop) * 0.04),
    );
    if (wet) {
      ctx.fillStyle = `rgba(200, 220, 240, ${0.08 + light.day * 0.06})`;
      for (let x = -((scene.scroll * 0.5) % 160); x < width; x += 160)
        ctx.fillRect(x, roadTop + (roadBottom - roadTop) * 0.55, 90, 2);
    }
  }

  private paintNear(
    ctx: CanvasRenderingContext2D,
    width: number,
    roadTop: number,
    _roadBottom: number,
    scene: DriveScene,
    landscape: Landscape,
    unit: number,
    env: SceneEnv,
  ) {
    for (const kind of landscape.near)
      this.paintNearKind(ctx, kind, width, roadTop, scene, unit, env);
  }

  private paintNearKind(
    ctx: CanvasRenderingContext2D,
    kind: NearKind,
    width: number,
    roadTop: number,
    scene: DriveScene,
    unit: number,
    env: SceneEnv,
  ) {
    const light = env.light;
    const y = roadTop - 5;
    if (kind === 'poles') {
      const spacing = unit * 60;
      const shift = (scene.scroll * 0.85) % spacing;
      ctx.strokeStyle = lit('#4c3b2e', light);
      ctx.lineWidth = Math.max(1.5, unit * 0.45);
      for (let x = -shift; x < width + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - unit * 20);
        ctx.moveTo(x - unit * 2.5, y - unit * 18.5);
        ctx.lineTo(x + unit * 2.5, y - unit * 18.5);
        ctx.stroke();
      }
      ctx.strokeStyle = lit('#2f2a26', light);
      ctx.lineWidth = 1;
      for (let x = -shift; x < width + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x - unit * 2.4, y - unit * 18.5);
        ctx.quadraticCurveTo(
          x + spacing / 2,
          y - unit * 15.5,
          x + spacing - unit * 2.4,
          y - unit * 18.5,
        );
        ctx.moveTo(x + unit * 2.4, y - unit * 18.5);
        ctx.quadraticCurveTo(
          x + spacing / 2,
          y - unit * 15.8,
          x + spacing + unit * 2.4,
          y - unit * 18.5,
        );
        ctx.stroke();
      }
    } else if (kind === 'fence' || kind === 'board-fence') {
      const spacing = unit * 7;
      const shift = (scene.scroll * 0.9) % spacing;
      ctx.strokeStyle = lit(kind === 'board-fence' ? '#e8e2d2' : '#6b5440', light);
      ctx.lineWidth = Math.max(1, unit * 0.3);
      for (let x = -shift; x < width + spacing; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - unit * 3.2);
        ctx.stroke();
      }
      ctx.lineWidth = Math.max(1, unit * (kind === 'board-fence' ? 0.35 : 0.12));
      ctx.beginPath();
      ctx.moveTo(0, y - unit * 2.6);
      ctx.lineTo(width, y - unit * 2.6);
      ctx.moveTo(0, y - unit * 1.4);
      ctx.lineTo(width, y - unit * 1.4);
      ctx.stroke();
    } else if (kind === 'rail') {
      const spacing = unit * 6;
      const shift = scene.scroll % spacing;
      ctx.fillStyle = lit('#8d939a', light);
      ctx.fillRect(0, y - unit * 2.4, width, unit * 0.9);
      ctx.fillStyle = lit('#5f646b', light);
      for (let x = -shift; x < width + spacing; x += spacing)
        ctx.fillRect(x, y - unit * 2.4, unit * 0.4, unit * 2.4);
    } else if (kind === 'posts') {
      const spacing = unit * 26;
      const shift = scene.scroll % spacing;
      for (let x = -shift; x < width + spacing; x += spacing) {
        ctx.fillStyle = lit('#ecebe6', light);
        ctx.fillRect(x, y - unit * 3.5, unit * 0.5, unit * 3.5);
        ctx.fillStyle = env.light.day < 0.5 ? '#ffcf66' : lit('#d98c1f', light);
        ctx.fillRect(x, y - unit * 3.4, unit * 0.5, unit * 0.6);
      }
    } else if (kind === 'rocks' || kind === 'grass') {
      const spacing = unit * 13;
      const shift = scene.scroll % spacing;
      ctx.fillStyle = lit(kind === 'rocks' ? '#8f8272' : '#6f8a45', light);
      for (let x = -shift, step = 0; x < width + spacing; x += spacing, step++) {
        const jitter = ((step * 53) % 7) * unit * 0.6;
        ctx.beginPath();
        ctx.ellipse(
          x + jitter,
          y - unit * 0.3,
          unit * (kind === 'rocks' ? 1.2 : 1.6),
          unit * (kind === 'rocks' ? 0.8 : 1.2),
          0,
          Math.PI,
          0,
        );
        ctx.fill();
      }
    }
  }

  private paintLandmarks(
    ctx: CanvasRenderingContext2D,
    landmarks: readonly Landmark[],
    scene: DriveScene,
    width: number,
    cabX: number,
    roadTop: number,
    unit: number,
    light: ReturnType<typeof lightingFor>,
    night: number,
    layer: 'behind' | 'front',
  ) {
    const frame = { light, night, time: scene.time, reducedMotion: scene.reducedMotion };
    for (const landmark of landmarks) {
      const x = cabX + (landmark.u - scene.scroll);
      if (x < -width * 0.4 || x > width * 1.4) continue;
      if (layer === 'behind' && landmark.kind !== 'construction')
        paintLandmark(ctx, landmark, x, roadTop - 4, unit, frame);
      if (layer === 'front' && landmark.kind === 'construction')
        this.paintCones(ctx, x, roadTop, unit, light);
      if (layer === 'behind' && landmark.kind === 'construction')
        paintLandmark(ctx, landmark, x, roadTop - 4, unit, frame);
    }
  }

  private paintCones(
    ctx: CanvasRenderingContext2D,
    x: number,
    roadTop: number,
    unit: number,
    light: ReturnType<typeof lightingFor>,
  ) {
    for (let cone = -4; cone <= 6; cone++) {
      const cx = x + cone * unit * 7;
      const base = roadTop + unit * 15;
      ctx.fillStyle = lit('#f07a1a', light);
      ctx.beginPath();
      ctx.moveTo(cx - unit * 1.4, base);
      ctx.lineTo(cx, base - unit * 4.5);
      ctx.lineTo(cx + unit * 1.4, base);
      ctx.fill();
      ctx.fillStyle = lit('#f4f1e6', light);
      ctx.fillRect(cx - unit * 0.7, base - unit * 2.8, unit * 1.4, unit * 0.6);
    }
  }

  private paintForeground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    roadBottom: number,
    scene: DriveScene,
    landscape: Landscape,
    light: ReturnType<typeof lightingFor>,
    unit: number,
  ) {
    const colour = scene.snow ? '#e8edf2' : landscape.ground;
    ctx.fillStyle = lit(colour, light);
    ctx.fillRect(0, roadBottom, width, height - roadBottom);
    // Tufts rushing past even faster than the road, for depth.
    const spacing = unit * 9;
    const shift = (scene.scroll * 1.3) % spacing;
    ctx.fillStyle = lit(scene.snow ? '#ffffff' : '#56703a', light);
    for (let x = -shift, step = 0; x < width + spacing; x += spacing, step++) {
      const h = unit * (1.5 + ((step * 37) % 5) * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(x + unit * 0.8, height - h);
      ctx.lineTo(x + unit * 1.6, height);
      ctx.fill();
    }
  }
}

/** After dark the trooper stands in the cruiser's headlights and spotlight, never lost in the black. */
function litByTheCruiser(light: Lighting, night: number): Lighting {
  return { ...light, day: Math.max(light.day, 0.3 + night * 0.15) };
}
