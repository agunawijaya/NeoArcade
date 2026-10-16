import { createRng } from '@shared/rng';
import { CabVehicles, type CabWorld, type Rect } from './cab-vehicles';
import { css, lit, litRgb, mix, rgb, type Lighting } from './colour';
import { paintFarLayer, type FarLayer } from './horizon';
import type { Landmark } from './landmarks';
import { LANDSCAPES } from './landscapes';
import { HEIGHTS, PAINTERS, type SceneEnv, type SceneryKind } from './scenery';
import type { DriveScene } from './scene';
import { lightingFor, paintSky } from './sky';
import { daylight } from './sun';
import { environmentFor, sunAcross } from './vehicles/light';
import { barFlash, washWith } from './vehicles/sedan/lightbar';
import { paintFatigue, paintPrecipitation } from './weather-fx';

/**
 * The view from the driver's seat: the road through the windscreen, the
 * mirrors, and a dashboard with the gauges, the CB set and a folded road
 * atlas clipped to it. The atlas is painted by whoever owns the map (the
 * drive screen passes a callback), so it is the same map as everywhere else.
 */
export interface CabLayout {
  width: number;
  height: number;
  /** The windscreen's bottom edge, where the dashboard begins. */
  dashTop: number;
  horizon: number;
  vanishX: number;
  /** Where the atlas sits on the dash, for drawing into and for taps. */
  atlas: { x: number; y: number; width: number; height: number; tilt: number };
}

/** The road atlas on the dash: a canvas the drive screen keeps up to date. */
export type AtlasSource = CanvasImageSource & { width: number; height: number };

/** Lane widths of road per pixel of scroll: how fast the road comes at you. */
const Z_PER_SCROLL = 0.045;
const DRAW_DISTANCE = 220;
const EYE_HEIGHT = 0.75;

interface RoadsideProp {
  z: number;
  side: -1 | 1;
  offset: number;
  kind: SceneryKind | 'pole' | 'post';
  variant: number;
}

/** Ahead of the camera, into the picture: where a sun painted in the sky stands. */
const AHEAD: readonly [number, number, number] = [1, 0, 0];

export class CabView {
  private readonly propCache = new Map<number, RoadsideProp[]>();
  private farLayers = new Map<string, FarLayer[]>();
  private readonly vehicles = new CabVehicles();

  layout(width: number, height: number): CabLayout {
    const compact = height < 520;
    const dashTop = Math.round(height * (compact ? 0.6 : 0.63));
    const horizon = Math.round(dashTop * 0.46);
    const atlasWidth = Math.min(width * 0.24, (height - dashTop) * 1.25);
    const atlasHeight = atlasWidth * 0.72;
    return {
      width,
      height,
      dashTop,
      horizon,
      vanishX: width * 0.53,
      atlas: {
        x: width * 0.74 - atlasWidth / 2,
        y: dashTop + (height - dashTop) * 0.12,
        width: atlasWidth,
        height: Math.min(atlasHeight, (height - dashTop) * 0.82),
        tilt: -0.05,
      },
    };
  }

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scene: DriveScene,
    atlas: AtlasSource | null,
  ) {
    const layout = this.layout(width, height);
    const light = lightingFor(scene.sunAltitude, scene.condition);
    const night = 1 - daylight(scene.sunAltitude);
    const world = this.world(layout, scene, night);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, layout.dashTop);
    ctx.clip();
    this.paintOutside(ctx, layout, scene, light, night, world);
    paintPrecipitation(ctx, {
      width,
      height: layout.dashTop,
      condition: scene.condition,
      time: scene.time,
      wind: scene.stopped ? 0 : Math.min(1, scene.speed / 70),
      night,
      reducedMotion: scene.reducedMotion,
    });
    this.paintGlass(ctx, layout, scene, night);
    ctx.restore();

    this.paintFrame(ctx, layout, scene, light, night);
    this.paintSideWindows(ctx, layout, scene, world, light);
    this.paintMirrors(ctx, layout, scene, world);
    this.paintDash(ctx, layout, scene, night, atlas);
    paintFatigue(ctx, width, height, scene.fatigue, scene.time, scene.reducedMotion);
  }

  /** The world the cab's vehicles stand in: the road's camera, the light, where the rig is. */
  private world(layout: CabLayout, scene: DriveScene, night: number): CabWorld {
    const landscape = LANDSCAPES[scene.region];
    const wet = scene.condition === 'wet' || scene.condition === 'rain';
    return {
      scene,
      env: environmentFor({
        sunAltitude: scene.sunAltitude,
        condition: scene.condition,
        sun: sunAcross(scene.sunArc, scene.sunAltitude, AHEAD),
        ground: wet ? '#2c2f34' : scene.snow ? '#8f959c' : '#46494e',
        horizon: landscape.groundFar,
      }),
      night,
      vanishX: layout.vanishX,
      horizon: layout.horizon,
      focal: (layout.dashTop - layout.horizon) * 3.2,
      dashTop: layout.dashTop,
      width: layout.width,
      shift: -(scene.patrol?.rigLane ?? 0) * 8.8,
    };
  }

  // ——— Through the windscreen ———

  private paintOutside(
    ctx: CanvasRenderingContext2D,
    layout: CabLayout,
    scene: DriveScene,
    light: Lighting,
    night: number,
    world: CabWorld,
  ) {
    const { width, horizon, dashTop, vanishX } = layout;
    paintSky(
      ctx,
      width,
      horizon,
      {
        sunAltitude: scene.sunAltitude,
        sunArc: scene.sunArc,
        condition: scene.condition,
        time: scene.time,
        scroll: scene.scroll * 0.2,
      },
      scene.reducedMotion,
    );
    const landscape = LANDSCAPES[scene.region];
    const farFrame = { width, horizon, scroll: scene.scroll * 0.25, light, night, alpha: 1 };
    for (const layer of this.farFor(scene.region))
      paintFarLayer(ctx, layer, { ...farFrame, alpha: scene.regionBlend });
    if (scene.regionBlend < 1) {
      for (const layer of this.farFor(scene.previousRegion))
        paintFarLayer(ctx, layer, { ...farFrame, alpha: 1 - scene.regionBlend });
    }
    if (scene.city > 0.05) {
      paintFarLayer(
        ctx,
        { kind: 'skyline', colour: '#59606e', height: 0.5, depth: 0.7, seed: 4242 },
        { ...farFrame, alpha: Math.min(1, scene.city) },
      );
    }

    // Ground to the horizon.
    const snowy = rgb('#edf1f5');
    const groundFar = scene.snow
      ? mix(rgb(landscape.groundFar), snowy, 0.8)
      : rgb(landscape.groundFar);
    const groundNear = scene.snow ? mix(rgb(landscape.ground), snowy, 0.75) : rgb(landscape.ground);
    const ground = ctx.createLinearGradient(0, horizon, 0, dashTop);
    ground.addColorStop(0, css(litRgb(groundFar, light, 0.7)));
    ground.addColorStop(1, css(litRgb(groundNear, light, 0)));
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, width, dashTop - horizon);

    const z0 = scene.scroll * Z_PER_SCROLL;
    const focal = world.focal;
    // Pulled onto the shoulder, the eyes move right of their lane and the road with them.
    const across = 0.5 + world.shift / 12;
    const project = (x: number, z: number) => {
      const s = focal / Math.max(0.5, z);
      return { x: vanishX + (x - across) * s, y: horizon + EYE_HEIGHT * s, s };
    };

    this.paintRoad(ctx, layout, scene, light, night, z0, project);
    this.paintRoadside(ctx, layout, scene, light, z0, project);
    this.paintLandmarksAhead(ctx, layout, scene, light, night, project);
    this.vehicles.drawTraffic(ctx, world, z0);
    if (night > 0.3) this.paintBeams(ctx, layout, night, project);
    if (light.veil > 0) {
      const veil = ctx.createLinearGradient(0, horizon - 40, 0, dashTop);
      veil.addColorStop(0, css(light.haze, light.veil));
      veil.addColorStop(1, css(light.haze, light.veil * 0.25));
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, width, dashTop);
    }
    const bounce = scene.stopped || scene.reducedMotion ? 0 : Math.sin(scene.time * 9) * 0.6;
    this.vehicles.drawOfficer(ctx, world);
    this.vehicles.drawHood(ctx, world, bounce);
  }

  private farFor(region: DriveScene['region']): FarLayer[] {
    let layers = this.farLayers.get(region);
    if (!layers) {
      const seed = [...region].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 11) >>> 0;
      layers = LANDSCAPES[region].far.map((layer, index) => ({
        ...layer,
        height: layer.height * 0.75,
        seed: seed + index * 977,
      }));
      this.farLayers.set(region, layers);
    }
    return layers;
  }

  private paintRoad(
    ctx: CanvasRenderingContext2D,
    layout: CabLayout,
    scene: DriveScene,
    light: Lighting,
    night: number,
    z0: number,
    project: (x: number, z: number) => { x: number; y: number; s: number },
  ) {
    const wet = scene.condition === 'wet' || scene.condition === 'rain';
    const snowRoad = scene.condition === 'light-snow' || scene.condition === 'blizzard';
    const near = 1.1;
    const far = DRAW_DISTANCE;
    const quad = (x0: number, x1: number, fill: string) => {
      const a = project(x0, far);
      const b = project(x1, far);
      const c = project(x1, near);
      const d = project(x0, near);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    };
    const landscape = LANDSCAPES[scene.region];
    const shoulder = lit(snowRoad ? '#cfd5dc' : landscape.shoulder, light);
    quad(1, 1.45, shoulder);
    quad(-1.45, -1, shoulder);
    // The median and the other carriageway, far to the left.
    quad(-3.4, -1.45, lit(scene.snow ? '#e9edf2' : landscape.ground, light, 0.05));
    quad(-5.4, -3.4, lit(wet ? '#2f3237' : snowRoad ? '#9aa0a7' : '#4a4d52', light, 0.1));
    const asphalt = wet ? '#2c2f34' : snowRoad ? '#8f959c' : '#46494e';
    quad(-1, 1, lit(asphalt, light));

    // Lane lines rushing towards the windscreen.
    const dash = 3;
    const gap = 9;
    const period = dash + gap;
    const phase = z0 % period;
    ctx.fillStyle = lit(snowRoad ? '#e4e8ec' : '#f0ead4', light);
    for (let z = period - phase; z < far; z += period) {
      const a = project(-0.02, z);
      const b = project(0.02, z);
      const c = project(0.02, z + dash);
      const d = project(-0.02, z + dash);
      if (a.y < layout.horizon) continue;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.closePath();
      ctx.fill();
    }
    for (const edge of [-1, 1]) {
      const a = project(edge - 0.02, far);
      const b = project(edge + 0.02, far);
      const c = project(edge + 0.02, near);
      const d = project(edge - 0.02, near);
      ctx.fillStyle = lit(edge > 0 ? '#f0ead4' : '#f2c14e', light);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
    if (wet && night < 0.6) {
      ctx.fillStyle = `rgba(210, 225, 240, ${0.07 + light.day * 0.06})`;
      const top = project(0, 30);
      const bottom = project(0, near);
      ctx.fillRect(top.x - 6, top.y, 12, bottom.y - top.y);
    }
  }

  private propsFor(tile: number, region: DriveScene['region']): RoadsideProp[] {
    let props = this.propCache.get(tile);
    if (props) return props;
    const rng = createRng(`cab:${tile}`);
    const landscape = LANDSCAPES[region];
    const total = landscape.mid.reduce((sum, [, weight]) => sum + weight, 0);
    props = [];
    const start = tile * 40;
    // A telephone pole every so often on the right; scenery on both sides.
    if (landscape.near.includes('poles'))
      props.push({ z: start + 4, side: 1, offset: 2.4, kind: 'pole', variant: 0 });
    for (let post = 0; post < 4; post++)
      props.push({ z: start + post * 10, side: 1, offset: 1.7, kind: 'post', variant: 0 });
    const count = Math.round(landscape.midDensity * 0.55 * rng.float(0.6, 1.4));
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
      props.push({
        z: start + rng.next() * 40,
        side: rng.chance(0.65) ? 1 : -1,
        offset: rng.float(3, 14),
        kind,
        variant: rng.next(),
      });
    }
    props.sort((a, b) => b.z - a.z);
    this.propCache.set(tile, props);
    for (const old of this.propCache.keys()) if (old < tile - 4) this.propCache.delete(old);
    return props;
  }

  private paintRoadside(
    ctx: CanvasRenderingContext2D,
    layout: CabLayout,
    scene: DriveScene,
    light: Lighting,
    z0: number,
    project: (x: number, z: number) => { x: number; y: number; s: number },
  ) {
    const first = Math.floor(z0 / 40);
    const env = (distance: number): SceneEnv => ({
      light,
      season: scene.season,
      snow: scene.snow,
      time: scene.time,
      distance,
      reducedMotion: scene.reducedMotion,
    });
    const visible: (RoadsideProp & { rel: number })[] = [];
    for (let tile = first + Math.ceil(DRAW_DISTANCE / 40); tile >= first; tile--) {
      for (const prop of this.propsFor(tile, scene.region)) {
        const rel = prop.z - z0;
        if (rel < 0.8 || rel > DRAW_DISTANCE) continue;
        visible.push({ ...prop, rel });
      }
    }
    visible.sort((a, b) => b.rel - a.rel);
    for (const prop of visible) {
      const x = prop.side > 0 ? 1 + prop.offset : -1.45 - prop.offset - (prop.offset > 3 ? 2 : 0);
      const p = project(x, prop.rel);
      if (p.x < -200 || p.x > layout.width + 200) continue;
      const distance = Math.min(1, prop.rel / DRAW_DISTANCE);
      if (prop.kind === 'pole') {
        ctx.strokeStyle = lit('#4c3b2e', light, distance);
        ctx.lineWidth = Math.max(1, p.s * 0.08);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - p.s * 3.5);
        ctx.moveTo(p.x - p.s * 0.5, p.y - p.s * 3.3);
        ctx.lineTo(p.x + p.s * 0.5, p.y - p.s * 3.3);
        ctx.stroke();
      } else if (prop.kind === 'post') {
        ctx.fillStyle = lit('#efede6', light, distance);
        ctx.fillRect(p.x, p.y - p.s * 0.45, Math.max(1, p.s * 0.05), p.s * 0.45);
        ctx.fillStyle = 1 - light.day > 0.4 ? '#ffcf66' : lit('#d98c1f', light, distance);
        ctx.fillRect(p.x, p.y - p.s * 0.45, Math.max(1, p.s * 0.05), Math.max(1, p.s * 0.08));
      } else {
        PAINTERS[prop.kind](
          ctx,
          p.x,
          p.y,
          p.s * 2.4 * HEIGHTS[prop.kind],
          prop.variant,
          env(distance),
        );
      }
    }
  }

  private paintLandmarksAhead(
    ctx: CanvasRenderingContext2D,
    layout: CabLayout,
    scene: DriveScene,
    light: Lighting,
    night: number,
    project: (x: number, z: number) => { x: number; y: number; s: number },
  ) {
    const ahead: (Landmark & { rel: number })[] = [];
    for (const landmark of scene.landmarks) {
      const rel = (landmark.u - scene.scroll) * Z_PER_SCROLL + 2;
      if (rel > 1 && rel < DRAW_DISTANCE) ahead.push({ ...landmark, rel });
    }
    ahead.sort((a, b) => b.rel - a.rel);
    for (const landmark of ahead) {
      const sideX = landmark.kind === 'toll' ? 0 : landmark.kind === 'radar' ? -2.3 : 1.9;
      const p = project(sideX, landmark.rel);
      if (p.x < -300 || p.x > layout.width + 300) continue;
      paintCabLandmark(ctx, landmark, p.x, p.y, p.s, light, night, scene);
    }
  }

  private paintBeams(
    ctx: CanvasRenderingContext2D,
    layout: CabLayout,
    night: number,
    project: (x: number, z: number) => { x: number; y: number; s: number },
  ) {
    // Darkness beyond the headlights, then the pool of light on the road.
    const beamEnd = project(0.5, 45);
    const dark = ctx.createLinearGradient(0, layout.horizon, 0, beamEnd.y);
    dark.addColorStop(0, `rgba(4, 6, 14, ${0.35 * night})`);
    dark.addColorStop(1, 'rgba(4, 6, 14, 0)');
    ctx.fillStyle = dark;
    ctx.fillRect(0, layout.horizon, layout.width, beamEnd.y - layout.horizon);
    const a = project(-1.2, 45);
    const b = project(2.2, 45);
    const c = project(2.6, 1.2);
    const d = project(-1.6, 1.2);
    const glow = ctx.createLinearGradient(0, a.y, 0, c.y);
    glow.addColorStop(0, 'rgba(255, 238, 190, 0)');
    glow.addColorStop(1, `rgba(255, 238, 190, ${0.22 * night})`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  private paintGlass(
    ctx: CanvasRenderingContext2D,
    layout: CabLayout,
    scene: DriveScene,
    night: number,
  ) {
    const { width, dashTop } = layout;
    const raining = scene.condition === 'rain' || scene.condition === 'wet';
    const snowing = scene.condition === 'light-snow' || scene.condition === 'blizzard';
    if (raining || snowing) {
      const rng = createRng('glass');
      const drops = raining ? (scene.condition === 'rain' ? 70 : 24) : 40;
      for (let index = 0; index < drops; index++) {
        const x = rng.next() * width;
        const y = rng.next() * dashTop;
        const r = rng.float(1.5, 4.5);
        ctx.fillStyle = snowing
          ? 'rgba(250, 252, 255, 0.75)'
          : `rgba(220, 235, 250, ${0.18 + night * 0.1})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      this.paintWipers(ctx, layout, scene);
    }
    if (snowing || (scene.season === 'winter' && scene.condition !== 'clear')) {
      // Frost creeping in from the corners.
      for (const [cx, cy] of [
        [0, dashTop],
        [width, dashTop],
        [0, 0],
        [width, 0],
      ] as const) {
        const frost = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, dashTop) * 0.45);
        frost.addColorStop(0, 'rgba(235, 242, 250, 0.55)');
        frost.addColorStop(1, 'rgba(235, 242, 250, 0)');
        ctx.fillStyle = frost;
        ctx.fillRect(0, 0, width, dashTop);
      }
    }
    if (scene.condition === 'fog') {
      ctx.fillStyle = 'rgba(220, 225, 228, 0.12)';
      ctx.fillRect(0, 0, width, dashTop);
    }
  }

  private paintWipers(ctx: CanvasRenderingContext2D, layout: CabLayout, scene: DriveScene) {
    const period = scene.condition === 'rain' || scene.condition === 'blizzard' ? 1.1 : 2.4;
    const phase = scene.reducedMotion ? 0.25 : (scene.time % period) / period;
    const sweep = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
    const angle = -Math.PI * 0.08 - sweep * Math.PI * 0.62;
    ctx.strokeStyle = '#141414';
    ctx.lineCap = 'round';
    for (const pivot of [layout.width * 0.3, layout.width * 0.7]) {
      const length = layout.dashTop * 0.62;
      ctx.lineWidth = Math.max(3, layout.width * 0.004);
      ctx.beginPath();
      ctx.moveTo(pivot, layout.dashTop);
      ctx.lineTo(pivot + Math.cos(angle) * length, layout.dashTop + Math.sin(angle) * length);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // ——— The cab around the glass ———

  private paintFrame(
    ctx: CanvasRenderingContext2D,
    layout: CabLayout,
    scene: DriveScene,
    light: Lighting,
    night: number,
  ) {
    const { width, dashTop } = layout;
    const interior = night > 0.5 ? '#14161b' : css(mix(rgb('#2a2c31'), rgb('#3a3d44'), light.day));
    ctx.fillStyle = interior;
    // A-pillars and the header above the glass.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width * 0.07, 0);
    ctx.lineTo(width * 0.035, dashTop);
    ctx.lineTo(0, dashTop);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(width, 0);
    ctx.lineTo(width * 0.93, 0);
    ctx.lineTo(width * 0.965, dashTop);
    ctx.lineTo(width, dashTop);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(0, 0, width, dashTop * 0.06);
    // Sun visor and a pennant.
    ctx.fillStyle = night > 0.5 ? '#1c1f25' : '#4a4d55';
    ctx.beginPath();
    ctx.roundRect(width * 0.1, dashTop * 0.04, width * 0.3, dashTop * 0.09, 6);
    ctx.fill();
    // Centre divider of a split windscreen.
    ctx.fillStyle = interior;
    ctx.fillRect(width * 0.497, 0, Math.max(3, width * 0.006), dashTop);
    if (scene.patrol?.lights.bar) {
      // The beacons wash across the inside of the glass from wherever the car is.
      const behind = scene.patrol.gap < 0;
      washWith(
        ctx,
        behind ? width * 0.05 : width * 0.6,
        dashTop * 0.45,
        width * 0.6,
        barFlash(scene.time, scene.reducedMotion),
        0.08 + night * 0.25,
        0.7,
      );
    }
  }

  /**
   * Glances out of the side windows, slid in over the windscreen's corners
   * while something is happening there: the patrol car passing on the
   * driver's side, the trooper at the passenger's window.
   */
  private paintSideWindows(
    ctx: CanvasRenderingContext2D,
    layout: CabLayout,
    scene: DriveScene,
    world: CabWorld,
    light: Lighting,
  ) {
    const patrol = scene.patrol;
    if (!patrol) return;
    const ramp = (value: number, from: number, to: number) =>
      Math.max(0, Math.min(1, (value - from) / (to - from)));
    const alongside =
      ramp(patrol.lane, 0.3, 0.6) * ramp(patrol.gap, -26, -14) * (1 - ramp(patrol.gap, 16, 28));
    const atWindow = patrol.officer?.atWindow ?? 0;
    for (const [side, amount] of [
      [-1, alongside],
      [1, atWindow],
    ] as const) {
      if (amount <= 0) continue;
      const glass = this.sideWindow(layout, side);
      const eased = amount * amount * (3 - 2 * amount);
      ctx.save();
      ctx.globalAlpha = eased;
      ctx.translate(side * (1 - eased) * glass.width * 0.35, 0);
      const shape = sideWindowPath(glass, side);
      ctx.save();
      ctx.clip(shape);
      this.vehicles.drawSideWindow(ctx, world, side, glass, scene.scroll * Z_PER_SCROLL);
      paintSideGlass(ctx, glass, light.day);
      ctx.restore();
      const interior =
        world.night > 0.5 ? '#14161b' : css(mix(rgb('#2a2c31'), rgb('#3a3d44'), light.day));
      ctx.strokeStyle = interior;
      ctx.lineWidth = Math.max(6, glass.width * 0.07);
      ctx.lineJoin = 'round';
      ctx.stroke(shape);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke(shape);
      ctx.restore();
    }
  }

  private sideWindow(layout: CabLayout, side: -1 | 1): Rect {
    const { width, dashTop } = layout;
    const glassWidth = Math.min(width * 0.27, dashTop * 0.82);
    const glassHeight = Math.min(dashTop * 0.56, glassWidth * 0.76);
    return {
      x: side < 0 ? width * 0.105 : width * 0.895 - glassWidth,
      y: dashTop * 0.3,
      width: glassWidth,
      height: glassHeight,
    };
  }

  /** The two West Coast mirrors on their arms, each showing the road behind. */
  private paintMirrors(
    ctx: CanvasRenderingContext2D,
    layout: CabLayout,
    scene: DriveScene,
    world: CabWorld,
  ) {
    const { width, dashTop } = layout;
    const glassWidth = Math.max(54, width * 0.074);
    const glassHeight = Math.min(dashTop * 0.66, glassWidth * 2.1);
    for (const side of [-1, 1] as const) {
      const glass: Rect = {
        x: side < 0 ? width * 0.014 : width * 0.986 - glassWidth,
        y: dashTop * 0.24,
        width: glassWidth,
        height: glassHeight,
      };
      this.paintMirrorArms(ctx, glass, side, layout, world.night);
      this.vehicles.drawMirror(ctx, world, side, glass, scene.scroll * Z_PER_SCROLL);
      this.paintMirrorFrame(ctx, glass, world.night);
    }
  }

  /** The chrome arms from the door to the mirror head, off the edge of the picture. */
  private paintMirrorArms(
    ctx: CanvasRenderingContext2D,
    glass: Rect,
    side: -1 | 1,
    layout: CabLayout,
    night: number,
  ) {
    const door = side < 0 ? 0 : layout.width;
    const near = side < 0 ? glass.x + glass.width * 0.2 : glass.x + glass.width * 0.8;
    const arm = night > 0.5 ? '#3a3e44' : '#b9c0c7';
    ctx.strokeStyle = arm;
    ctx.lineWidth = Math.max(2, glass.width * 0.06);
    ctx.lineCap = 'round';
    for (const at of [0.12, 0.88]) {
      ctx.beginPath();
      ctx.moveTo(door, glass.y + glass.height * at + glass.height * 0.04);
      ctx.lineTo(near, glass.y + glass.height * at);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /** The mirror head's polished rim, thick at the bottom where the light catches it. */
  private paintMirrorFrame(ctx: CanvasRenderingContext2D, glass: Rect, night: number) {
    const rim = Math.max(3, glass.width * 0.07);
    const chrome = ctx.createLinearGradient(0, glass.y - rim, 0, glass.y + glass.height + rim);
    const bright = night > 0.5 ? '#4c525a' : '#eef1f4';
    const dark = night > 0.5 ? '#16181c' : '#5d646c';
    chrome.addColorStop(0, bright);
    chrome.addColorStop(0.45, dark);
    chrome.addColorStop(0.55, bright);
    chrome.addColorStop(1, dark);
    ctx.strokeStyle = chrome;
    ctx.lineWidth = rim;
    ctx.beginPath();
    ctx.roundRect(
      glass.x - rim / 2,
      glass.y - rim / 2,
      glass.width + rim,
      glass.height + rim,
      rim * 1.4,
    );
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(glass.x, glass.y, glass.width, glass.height, Math.min(6, glass.width * 0.08));
    ctx.stroke();
  }

  private paintDash(
    ctx: CanvasRenderingContext2D,
    layout: CabLayout,
    scene: DriveScene,
    night: number,
    atlas: AtlasSource | null,
  ) {
    const { width, height, dashTop } = layout;
    const dashColour = night > 0.5 ? '#16181d' : '#2b2e34';
    const dash = ctx.createLinearGradient(0, dashTop, 0, height);
    dash.addColorStop(0, '#3b3f46');
    dash.addColorStop(0.08, dashColour);
    dash.addColorStop(1, '#0f1013');
    ctx.fillStyle = dash;
    ctx.beginPath();
    ctx.moveTo(0, dashTop + 10);
    ctx.quadraticCurveTo(width / 2, dashTop - 14, width, dashTop + 10);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    const unit = Math.min(width / 100, (height - dashTop) / 32);
    const glow = night > 0.4;
    const gaugeY = dashTop + (height - dashTop) * 0.46;
    const speedX = width * 0.17;
    const radius = Math.min(unit * 11, (height - dashTop) * 0.38);
    const maxSpeed = scene.dash.units === 'km' ? 140 : 90;
    const shown = scene.dash.units === 'km' ? scene.speed * 1.609 : scene.speed;
    const set = scene.dash.units === 'km' ? scene.dash.setSpeed * 1.609 : scene.dash.setSpeed;
    paintDial(
      ctx,
      speedX,
      gaugeY,
      radius,
      shown / maxSpeed,
      set / maxSpeed,
      glow,
      maxSpeed,
      scene.dash.units === 'km' ? 'KM/H' : 'MPH',
    );
    paintOdometer(ctx, speedX, gaugeY + radius * 0.42, radius * 0.9, scene.dash.odometer);

    const fuelR = radius * 0.5;
    const fuelX = speedX + radius + fuelR * 1.5;
    paintFuel(
      ctx,
      fuelX,
      gaugeY - radius * 0.35,
      fuelR,
      scene.dash.fuel / scene.dash.tank,
      glow,
      scene.time,
    );
    paintClock(
      ctx,
      fuelX,
      gaugeY + radius * 0.62,
      fuelR * 0.8,
      scene.dash.minutes,
      scene.dash.clock,
      glow,
    );

    const cbX = Math.max(width * 0.5, fuelX + fuelR * 1.4 + Math.min(width * 0.1, unit * 13));
    paintCb(
      ctx,
      cbX,
      dashTop + (height - dashTop) * 0.2,
      Math.min(width * 0.2, unit * 26),
      unit * 9.5,
      scene,
      glow,
    );
    paintLimitSign(
      ctx,
      cbX + Math.min(width * 0.1, unit * 13),
      dashTop + (height - dashTop) * 0.7,
      unit * 4.2,
      scene.dash.limit,
      scene.dash.units,
    );
    if (scene.dash.detector !== 'off')
      paintDetector(
        ctx,
        cbX - unit * 10,
        dashTop + (height - dashTop) * 0.72,
        unit,
        scene.dash.detector,
        scene.time,
        scene.reducedMotion,
      );

    const a = layout.atlas;
    ctx.save();
    ctx.translate(a.x + a.width / 2, a.y + a.height / 2);
    ctx.rotate(a.tilt);
    ctx.translate(-a.width / 2, -a.height / 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(4, 6, a.width, a.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, a.width, a.height);
    ctx.clip();
    if (atlas) ctx.drawImage(atlas, 0, 0, a.width, a.height);
    else {
      ctx.fillStyle = '#f3e7c9';
      ctx.fillRect(0, 0, a.width, a.height);
    }
    // The fold down the middle and a warm cab-light tint at night.
    const fold = ctx.createLinearGradient(a.width * 0.45, 0, a.width * 0.55, 0);
    fold.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fold.addColorStop(0.5, 'rgba(0, 0, 0, 0.18)');
    fold.addColorStop(1, 'rgba(255, 255, 255, 0.06)');
    ctx.fillStyle = fold;
    ctx.fillRect(0, 0, a.width, a.height);
    if (night > 0.4) {
      ctx.fillStyle = `rgba(40, 24, 8, ${0.35 * night})`;
      ctx.fillRect(0, 0, a.width, a.height);
    }
    ctx.restore();
    // The bulldog clip holding it to the dash.
    ctx.fillStyle = '#9aa0a8';
    ctx.fillRect(a.width * 0.42, -unit * 1.2, a.width * 0.16, unit * 2.4);
    ctx.fillStyle = '#5c6168';
    ctx.fillRect(a.width * 0.47, -unit * 2.2, a.width * 0.06, unit * 1.4);
    ctx.restore();

    // The steering wheel, low and to the left.
    ctx.strokeStyle = '#0c0c0e';
    ctx.lineWidth = unit * 2.6;
    ctx.beginPath();
    ctx.arc(
      speedX + radius * 0.6,
      height + radius * 1.35,
      radius * 2.15,
      Math.PI * 1.13,
      Math.PI * 1.87,
    );
    ctx.stroke();
  }
}

function paintDial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  value: number,
  set: number,
  glow: boolean,
  max: number,
  label: string,
) {
  ctx.fillStyle = '#0b0c0f';
  ctx.beginPath();
  ctx.arc(x, y, r * 1.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = glow ? '#101820' : '#e9e6dc';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const ink = glow ? '#7fe3ff' : '#1b1b1b';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = max > 100 ? 20 : 10;
  for (let mark = 0; mark <= max; mark += step / 2) {
    const angle = start + (mark / max) * sweep;
    const major = mark % step === 0;
    ctx.lineWidth = major ? Math.max(1.5, r * 0.035) : 1;
    ctx.beginPath();
    ctx.moveTo(
      x + Math.cos(angle) * r * (major ? 0.78 : 0.84),
      y + Math.sin(angle) * r * (major ? 0.78 : 0.84),
    );
    ctx.lineTo(x + Math.cos(angle) * r * 0.92, y + Math.sin(angle) * r * 0.92);
    ctx.stroke();
    if (major) {
      ctx.font = `700 ${r * 0.15}px "Arial Narrow", system-ui, sans-serif`;
      ctx.fillText(String(mark), x + Math.cos(angle) * r * 0.62, y + Math.sin(angle) * r * 0.62);
    }
  }
  // The 55 band, and the set speed as a small bug on the rim.
  ctx.strokeStyle = glow ? 'rgba(80, 220, 140, 0.6)' : 'rgba(29, 122, 70, 0.6)';
  ctx.lineWidth = r * 0.06;
  const limit = (max > 100 ? 89 : 55) / max;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.96, start + limit * sweep - 0.04, start + limit * sweep + 0.04);
  ctx.stroke();
  const bug = start + Math.min(1, set) * sweep;
  ctx.fillStyle = '#ffb02e';
  ctx.beginPath();
  ctx.arc(x + Math.cos(bug) * r * 0.98, y + Math.sin(bug) * r * 0.98, r * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.font = `700 ${r * 0.12}px "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText(label, x, y - r * 0.32);
  const needle = start + Math.min(1, Math.max(0, value)) * sweep;
  ctx.strokeStyle = '#ff4a2e';
  ctx.lineWidth = Math.max(2, r * 0.035);
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(needle) * r * 0.12, y - Math.sin(needle) * r * 0.12);
  ctx.lineTo(x + Math.cos(needle) * r * 0.86, y + Math.sin(needle) * r * 0.86);
  ctx.stroke();
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function paintOdometer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  miles: number,
) {
  const digits = String(Math.floor(miles) % 10_000_000).padStart(7, '0');
  const cell = (width * 0.62) / digits.length;
  const left = x - (cell * digits.length) / 2;
  ctx.fillStyle = '#121212';
  ctx.fillRect(left - 3, y - cell * 0.75, cell * digits.length + 6, cell * 1.5);
  ctx.font = `700 ${cell * 1.05}px "Consolas", "Menlo", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fraction = miles - Math.floor(miles);
  [...digits].forEach((digit, index) => {
    const last = index === digits.length - 1;
    ctx.fillStyle = last ? '#f4f1e6' : '#e9e6dc';
    if (last) {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(left + index * cell, y - cell * 0.7, cell, cell * 1.4);
      ctx.fillStyle = '#ffffff';
    }
    // The last wheel rolls between digits.
    const roll = last ? fraction * cell * 1.2 : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left + index * cell, y - cell * 0.7, cell, cell * 1.4);
    ctx.clip();
    ctx.fillText(digit, left + index * cell + cell / 2, y - roll);
    if (last)
      ctx.fillText(
        String((Number(digit) + 1) % 10),
        left + index * cell + cell / 2,
        y - roll + cell * 1.2,
      );
    ctx.restore();
  });
}

function paintFuel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  level: number,
  glow: boolean,
  time: number,
) {
  ctx.fillStyle = '#0b0c0f';
  ctx.beginPath();
  ctx.arc(x, y, r * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = glow ? '#101820' : '#e9e6dc';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  const ink = glow ? '#7fe3ff' : '#1b1b1b';
  ctx.fillStyle = ink;
  ctx.font = `700 ${r * 0.28}px "Arial Narrow", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', x - r * 0.62, y + r * 0.35);
  ctx.fillText('F', x + r * 0.62, y + r * 0.35);
  ctx.font = `700 ${r * 0.2}px "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText('FUEL', x, y + r * 0.55);
  const angle = Math.PI * 1.2 + Math.max(0, Math.min(1, level)) * Math.PI * 0.6;
  ctx.strokeStyle = '#ff4a2e';
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.2);
  ctx.lineTo(x + Math.cos(angle) * r * 0.85, y + r * 0.2 + Math.sin(angle) * r * 0.85);
  ctx.stroke();
  if (level < 0.15) {
    ctx.fillStyle = Math.floor(time * 2) % 2 === 0 ? '#ffb02e' : '#5a3c08';
    ctx.beginPath();
    ctx.arc(x, y - r * 0.45, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintClock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  minutes: number,
  label: string,
  glow: boolean,
) {
  ctx.fillStyle = '#0b0c0f';
  ctx.beginPath();
  ctx.roundRect(x - r * 1.6, y - r * 0.55, r * 3.2, r * 1.1, r * 0.2);
  ctx.fill();
  ctx.fillStyle = glow ? '#ffb02e' : '#7ad4a0';
  ctx.font = `700 ${r * 0.62}px "Consolas", "Menlo", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hours24 = Math.floor(minutes / 60) % 24;
  const display = `${String(((hours24 + 11) % 12) + 1).padStart(2, ' ')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`;
  ctx.fillText(display, x, y - r * 0.05);
  ctx.font = `700 ${r * 0.3}px "Arial Narrow", system-ui, sans-serif`;
  ctx.fillStyle = glow ? 'rgba(255, 176, 46, 0.8)' : 'rgba(122, 212, 160, 0.8)';
  ctx.fillText(label.split(' ')[0] ?? '', x, y + r * 0.38);
}

function paintCb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  scene: DriveScene,
  glow: boolean,
) {
  ctx.fillStyle = '#1a1b1e';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = '#2e3035';
  ctx.fillRect(x - w / 2 + 4, y + 4, w - 8, h * 0.18);
  ctx.fillStyle = '#090a0b';
  ctx.fillRect(x - w / 2 + w * 0.05, y + h * 0.3, w * 0.9, h * 0.38);
  ctx.fillStyle = '#ff4a2e';
  ctx.font = `700 ${h * 0.24}px "Consolas", "Menlo", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(scene.dash.cbChannel), x - w / 2 + w * 0.08, y + h * 0.49);
  ctx.fillStyle = glow ? '#ffd9a0' : '#a6e3b8';
  ctx.font = `600 ${h * 0.15}px "Consolas", "Menlo", monospace`;
  const text = scene.dash.cbSpeaker
    ? `${scene.dash.cbSpeaker}: ${scene.dash.cbLine}`
    : 'channel 19 · quiet';
  const room = Math.floor((w * 0.72) / (h * 0.09));
  const offset = scene.reducedMotion
    ? 0
    : Math.floor(scene.time * 5) % Math.max(1, text.length + 8);
  const ticker = `${text}        ${text}`.slice(offset, offset + room);
  ctx.fillText(ticker, x - w / 2 + w * 0.22, y + h * 0.49);
  // Knobs and the microphone on its hook.
  ctx.fillStyle = '#4a4d53';
  for (const knob of [0.2, 0.4, 0.6]) {
    ctx.beginPath();
    ctx.arc(x - w / 2 + w * knob, y + h * 0.84, h * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#121315';
  ctx.beginPath();
  ctx.roundRect(x + w * 0.33, y + h * 0.75, w * 0.12, h * 0.55, 4);
  ctx.fill();
  ctx.strokeStyle = '#121315';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.39, y + h * 1.3);
  ctx.bezierCurveTo(
    x + w * 0.39,
    y + h * 1.8,
    x + w * 0.1,
    y + h * 1.5,
    x + w * 0.05,
    y + h * 1.95,
  );
  ctx.stroke();
}

function paintLimitSign(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  limit: number,
  units: 'mi' | 'km',
) {
  ctx.fillStyle = '#f4f2ea';
  ctx.beginPath();
  ctx.roundRect(x - size, y - size * 1.3, size * 2, size * 2.6, size * 0.2);
  ctx.fill();
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.strokeRect(x - size * 0.85, y - size * 1.15, size * 1.7, size * 2.3);
  ctx.fillStyle = '#1b1b1b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size * 0.34}px "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText('SPEED', x, y - size * 0.82);
  ctx.fillText('LIMIT', x, y - size * 0.45);
  ctx.font = `800 ${size * 0.9}px "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText(String(units === 'km' ? Math.round(limit * 1.609) : limit), x, y + size * 0.4);
}

function paintDetector(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  unit: number,
  state: 'quiet' | 'alert',
  time: number,
  reducedMotion: boolean,
) {
  ctx.fillStyle = '#121315';
  ctx.beginPath();
  ctx.roundRect(x - unit * 4, y - unit * 1.5, unit * 8, unit * 3, unit * 0.5);
  ctx.fill();
  const on = state === 'alert' && (reducedMotion || Math.floor(time * 4) % 2 === 0);
  ctx.fillStyle = state === 'alert' ? (on ? '#ff3b30' : '#5a1410') : '#2fbf71';
  ctx.beginPath();
  ctx.arc(x - unit * 2.4, y, unit * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9cdd3';
  ctx.font = `700 ${unit * 1.1}px "Arial Narrow", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(state === 'alert' ? 'RADAR' : 'X·K', x - unit * 1.4, y);
}

/** Landmarks seen coming down the road: a sign, a plaza, a scale house, a patrol car. */
function paintCabLandmark(
  ctx: CanvasRenderingContext2D,
  landmark: Landmark,
  x: number,
  y: number,
  s: number,
  light: Lighting,
  night: number,
  scene: DriveScene,
) {
  const sign = (fill: string, text: string, lines: string[], w: number, h: number, raise = 1.6) => {
    ctx.fillStyle = lit('#6b6f75', light);
    ctx.fillRect(x - w * 0.3, y - (raise + h) * s, Math.max(1, s * 0.05), (raise + h) * s);
    ctx.fillRect(x + w * 0.3, y - (raise + h) * s, Math.max(1, s * 0.05), (raise + h) * s);
    ctx.fillStyle = lit(fill, light);
    ctx.beginPath();
    ctx.roundRect(x - (w * s) / 2, y - (raise + h) * s, w * s, h * s, s * 0.1);
    ctx.fill();
    ctx.fillStyle = lit(text, light);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, index) => {
      ctx.font = `700 ${Math.max(6, (h / lines.length) * s * 0.55)}px "Arial Narrow", system-ui, sans-serif`;
      ctx.fillText(line, x, y - (raise + h) * s + ((index + 0.5) * h * s) / lines.length);
    });
  };
  switch (landmark.kind) {
    case 'guide':
      sign('#1f6e45', '#f7f7f0', [landmark.label ?? '', landmark.detail ?? ''], 2.6, 1.1);
      return;
    case 'welcome':
      sign('#2a4f8f', '#f7f7f0', ['WELCOME TO', (landmark.label ?? '').toUpperCase()], 2.4, 1);
      return;
    case 'truck-stop':
      sign(
        '#b3261e',
        night > 0.3 ? '#ffe9b0' : '#fff4dc',
        [(landmark.label ?? '').toUpperCase(), `DIESEL ${landmark.detail ?? ''}`],
        2.6,
        1.1,
        2.6,
      );
      return;
    case 'construction':
      sign('#f28c1a', '#1b1b1b', ['ROAD', 'WORK'], 1, 1, 0.8);
      for (let cone = 0; cone < 4; cone++) {
        ctx.fillStyle = lit('#f07a1a', light);
        const cx = x - s * (2.9 - cone * 0.12);
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.12, y);
        ctx.lineTo(cx, y - s * 0.4);
        ctx.lineTo(cx + s * 0.12, y);
        ctx.fill();
      }
      return;
    case 'scale':
      sign(
        '#1b1b1b',
        '#ffd23a',
        ['WEIGH STATION', landmark.detail === 'closed' ? 'CLOSED' : 'OPEN'],
        2.6,
        1,
      );
      return;
    case 'toll': {
      ctx.fillStyle = lit('#f2c23a', light);
      ctx.fillRect(x - s * 3, y - s * 2.4, s * 6, s * 0.4);
      ctx.fillStyle = lit('#c9c6bc', light);
      for (const post of [-2.8, -0.9, 0.9, 2.8])
        ctx.fillRect(x + post * s, y - s * 2.1, Math.max(1, s * 0.15), s * 2.1);
      ctx.fillStyle = lit('#1b1b1b', light);
      ctx.font = `800 ${Math.max(6, s * 0.3)}px "Arial Narrow", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`TOLL ${landmark.label ?? ''}`, x, y - s * 2.2);
      return;
    }
    case 'radar': {
      ctx.fillStyle = lit('#1d2a44', light);
      ctx.fillRect(x - s * 0.5, y - s * 0.4, s, s * 0.35);
      const flash = scene.reducedMotion ? 0 : Math.floor(scene.time * 4) % 2;
      ctx.fillStyle = flash === 0 ? '#ff3b30' : '#2f6bff';
      ctx.fillRect(x - s * 0.2, y - s * 0.5, s * 0.4, s * 0.1);
      return;
    }
    case 'slide':
      ctx.fillStyle = lit('#7d6d5d', light);
      for (let rock = -3; rock <= 3; rock++) {
        ctx.beginPath();
        ctx.arc(x - s * 1.9 + rock * s * 0.35, y, s * 0.35, Math.PI, 0);
        ctx.fill();
      }
      return;
    case 'dock':
      sign('#3c3a38', '#f4f1e6', [(landmark.label ?? '').toUpperCase(), 'WAREHOUSE'], 3, 1.2);
      return;
    default:
      return;
  }
}

/** A cab door's glass: square at the back, its front edge raked to follow the windscreen. */
function sideWindowPath(glass: Rect, side: -1 | 1): Path2D {
  const { x, y, width, height } = glass;
  // Looking out of the left door the cab's front is to the right of the picture, and the other way round.
  const front = (along: number) => (side < 0 ? x + width * along : x + width * (1 - along));
  const path = new Path2D();
  path.moveTo(front(0), y + height);
  path.lineTo(front(0), y + height * 0.06);
  path.lineTo(front(0.7), y);
  path.lineTo(front(1), y + height * 0.42);
  path.lineTo(front(1), y + height);
  path.closePath();
  return path;
}

/** The door glass itself: a soft diagonal sheen across it. */
function paintSideGlass(ctx: CanvasRenderingContext2D, glass: Rect, day: number) {
  const sheen = ctx.createLinearGradient(
    glass.x,
    glass.y,
    glass.x + glass.width,
    glass.y + glass.height,
  );
  const strength = 0.05 + day * 0.06;
  sheen.addColorStop(0.18, 'rgba(210, 230, 248, 0)');
  sheen.addColorStop(0.28, `rgba(210, 230, 248, ${strength})`);
  sheen.addColorStop(0.42, 'rgba(210, 230, 248, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(glass.x, glass.y, glass.width, glass.height);
}
