import { CGA_PALETTE, createPostFx, type PostFx } from '@shared/fx';
import { deckHeight, deckLength, offsetOnDeck } from '../engine/deck';
import { BEAM_HALF_ANGLE, BEAM_REACH, searchlightBeams } from '../engine/sight';
import { TURN } from '../engine/trig';
import type { Plane, World } from '../engine/world';
import type { Livery, Palette } from './palette';
import { paintBird, paintFlock, paintOx } from './side/animals';
import { drawBiplane } from './side/biplane';
import { FLOOR, SKY_TOP, SideCamera } from './side/camera';
import { mix, withAlpha } from './side/colour';
import { paintParticles, paintProjectiles, paintSplats } from './side/effects';
import { depthLift, paintGroundBand, paintGroundLine } from './side/ground';
import { paintGrain } from './side/grain';
import { paintSunGlare, paintSunShafts } from './screen-light';
import { paintHills } from './side/landscape';
import { paintProps } from './side/props';
import { paintGates } from './side/gates';
import { paintRaider } from './side/raiders';
import {
  clipToLand,
  hillSink,
  paintSeaBackdrop,
  paintSeaSection,
  paintSeaSurface,
} from './side/sea';
import { paintRescues, paintShip } from './side/ships';
import { paintTorpedoWakes, paintTorpedoes } from './side/torpedoes';
import { SkyPainter } from './side/sky';
import { paintTarget } from './side/targets';
import type { Frame, PlaneFrame, ViewRenderer, Viewport, WorldWindow } from './view';

/** How much bigger than its hitbox a biplane is drawn: wings and propeller reach past it. */
const PLANE_DRAW_SCALE = 1.15;
const VIGNETTE = 0.32;

/**
 * The classic side-on view, in layers: sky and sun, far clouds, receding
 * hills, the near land in section, the scenery, targets and oxen on the
 * line of play, smoke, bullets and bombs, the planes, birds, fire and
 * sparks, and a few see-through clouds drifting in front. Classic 1984's
 * CGA picture keeps only the line of play: no sky, hills or scenery, as
 * on the 1984 screen.
 */
export class SideView implements ViewRenderer {
  readonly id = 'side' as const;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fx: PostFx;
  private sky: SkyPainter | null = null;
  private skySeed = -1;
  private pixelRatio = 1;
  private graded: Palette | null = null;
  private cga = false;

  constructor() {
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is not available.');
    this.ctx = context;
    this.fx = createPostFx(this.canvas, {
      bloom: { strength: 0.3, threshold: 0.8, radius: 1.4 },
      vignette: VIGNETTE,
    });
    this.fx.canvas.classList.add('stage__canvas');
  }

  get element(): HTMLCanvasElement {
    return this.fx.canvas;
  }

  fieldOfView(viewport: Viewport, cameraX: number): WorldWindow {
    return SideCamera.fieldOfView(viewport, cameraX);
  }

  resize(viewport: Viewport, pixelRatio: number) {
    this.pixelRatio = pixelRatio;
    this.canvas.width = Math.round(viewport.width * pixelRatio);
    this.canvas.height = Math.round(viewport.height * pixelRatio);
  }

  setFilter(cga: boolean) {
    this.cga = cga;
    // The world is already painted in the four colours (see cgaPalette), so no dither is needed.
    this.fx.update({
      palette: cga ? { ...CGA_PALETTE, dither: 0 } : false,
      vignette: cga ? 0 : VIGNETTE,
    });
  }

  render(frame: Frame, viewport: Viewport) {
    const { world, palette, scenery, time } = frame;
    if (this.skySeed !== world.map.seed || !this.sky) {
      this.sky = new SkyPainter(world.map.seed);
      this.skySeed = world.map.seed;
    }
    this.grade(palette);
    const ctx = this.ctx;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    const camera = cameraFor(frame, viewport);
    const sunBoost = frame.sun === null ? 0 : ease(frame.sun);

    if (this.cga) {
      ctx.fillStyle = palette.sky[0];
      ctx.fillRect(0, 0, viewport.width, viewport.height);
      paintGroundLine(ctx, camera, palette, world.terrain);
    } else {
      this.sky.paintSky(ctx, camera, palette, time, sunBoost);
      this.sky.paintClouds(ctx, camera, palette, scenery.clouds, 0, 0.5);
      paintHills(ctx, camera, palette, scenery, hillSink(world, camera));
      paintSeaBackdrop(ctx, camera, palette, world, time);
      this.sky.paintClouds(ctx, camera, palette, scenery.clouds, 0.5, 1);
      if (palette.daylight < 0.5) paintSearchlights(ctx, camera, palette, world);
      if (frame.sun !== null) paintSunShafts(ctx, viewport, sunBoost, palette);
      ctx.save();
      clipToLand(ctx, camera, world);
      paintGroundBand(ctx, camera, palette, world.terrain, world.map, scenery);
      paintProps(ctx, camera, palette, world.terrain, scenery.props, time);
      ctx.restore();
      paintSeaSection(ctx, camera, palette, world, time);
    }
    if (world.ships.length > 0 || world.torpedoes.length > 0) {
      const ships = { palette, theme: frame.theme, time, focus: frame.focus, world };
      for (const ship of world.ships)
        if (isVisible(camera, ship.x, 90)) paintShip(ctx, camera, ship, ships);
      paintTorpedoes(ctx, camera, palette, world, time);
    }
    if (!this.cga) paintSeaSurface(ctx, camera, palette, world, time);
    if (world.torpedoes.length > 0) paintTorpedoWakes(ctx, camera, palette, world, time);
    if (frame.rescues.length > 0) paintRescues(ctx, camera, palette, world, frame.rescues, time);
    for (const target of world.targets) {
      if (isVisible(camera, target.x, 20)) paintTarget(ctx, camera, palette, target, time);
    }
    for (const ox of world.oxen) {
      if (isVisible(camera, ox.x, 20))
        paintOx(ctx, camera, palette, ox, time, oxAttention(world, ox.x, ox.y));
    }

    paintParticles(ctx, camera, palette, frame.particles, true);
    if (!this.cga)
      for (const planeFrame of frame.planes)
        paintShadow(ctx, camera, world, planeFrame.plane, palette);
    paintProjectiles(ctx, camera, palette, world, time);
    if (world.map.gates.length > 0) paintGates(ctx, camera, palette, world, time);
    for (const raider of world.raiders) {
      if (isVisible(camera, raider.x, 60))
        paintRaider(ctx, camera, palette, palette.liveries[raider.side], raider, time);
    }
    for (const planeFrame of frame.planes) this.paintPlane(camera, palette, planeFrame, frame);
    for (const flock of world.flocks)
      if (isVisible(camera, flock.x, 20)) paintFlock(ctx, camera, palette, flock, time);
    for (const bird of world.birds)
      if (isVisible(camera, bird.x, 10)) paintBird(ctx, camera, palette, bird, time);
    paintParticles(ctx, camera, palette, frame.particles, false);
    if (!this.cga) {
      paintFog(ctx, camera, palette, world, time);
      this.sky.paintClouds(ctx, camera, palette, scenery.clouds, 1, 9, 0.34);
      if (frame.sun !== null) paintSunGlare(ctx, viewport, sunBoost, palette);
      paintGrain(ctx, viewport.width, viewport.height, 0.14);
    }
    paintSplats(ctx, viewport.width, viewport.height, frame.splats, palette.daylight);
    this.fx.render();
  }

  private paintPlane(camera: SideCamera, palette: Palette, planeFrame: PlaneFrame, frame: Frame) {
    const { plane } = planeFrame;
    if (plane.state === 'out') return;
    if (!isVisible(camera, plane.x, 30)) return;
    const livery = frame.liveries.get(plane.id) ?? palette.liveries[plane.side];
    let scale = camera.scale * PLANE_DRAW_SCALE;
    let x = camera.x(plane.x);
    let y = camera.y(plane.y);
    let paint = livery;
    if (plane.state === 'victory' && frame.sun !== null && plane === frame.focus) {
      // Into the sun: the plane climbs away into the glare, shrinking to a silhouette.
      const t = ease(Math.max(0, (frame.sun - 0.25) / 0.75));
      scale *= 1 - t * 0.8;
      x += (camera.viewport.width * palette.sun.x - x) * t * 0.92;
      y += (camera.bandTop + (camera.bandBottom - camera.bandTop) * palette.sun.y - y) * t * 0.92;
      paint = silhouette(livery, Math.min(1, ease(frame.sun) * 1.2));
    }
    if (plane.ghost) this.ctx.globalAlpha = 0.38;
    drawBiplane(
      this.ctx,
      {
        x,
        y,
        scale,
        pitch: (plane.heading / TURN) * Math.PI * 2,
        roll: planeFrame.roll,
        spin: planeFrame.spin,
        power: planeFrame.power,
        wounded: plane.wounded || plane.state === 'falling',
        seed: plane.id,
        time: frame.time,
        daylight: palette.daylight,
      },
      paint,
    );
    this.ctx.globalAlpha = 1;
  }

  private grade(palette: Palette) {
    if (this.graded === palette) return;
    this.graded = palette;
    this.fx.update({
      grade: { ...palette.grade },
      bloom: {
        strength: 0.06 + (1 - palette.daylight) * 0.55,
        threshold: 0.7 + palette.daylight * 0.24,
      },
    });
  }

  dispose() {
    this.fx.dispose();
  }
}

function ease(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * The camera, pushed in on the winner during the flight into the sun, but
 * never so far that the land drops out of the bottom of the picture. With
 * reduced motion asked for, it holds still and lets the plane fly away.
 */
function cameraFor(frame: Frame, viewport: Viewport): SideCamera {
  const focus = frame.focus;
  if (frame.sun === null || !focus || frame.reducedMotion)
    return new SideCamera(viewport, frame.cameraX);
  const zoom = 1 + ease(frame.sun) * 0.6;
  const visible = (SKY_TOP - FLOOR) / zoom;
  // Keep the land along the bottom: the winner leaves the world behind, not out of the picture.
  const ground = frame.world.terrain.heightAt(frame.cameraX);
  const centreY = Math.max(FLOOR + visible / 2, ground - 22 + visible / 2);
  return new SideCamera(viewport, frame.cameraX, zoom, centreY);
}

function isVisible(camera: SideCamera, x: number, margin: number): boolean {
  return x > camera.worldX(0) - margin && x < camera.right + margin;
}

/** How closely an ox watches: it looks up when a plane comes low overhead. */
function oxAttention(world: World, x: number, y: number): number {
  let attention = 0;
  for (const plane of world.planes) {
    if (plane.state !== 'flying' && plane.state !== 'falling' && plane.state !== 'stalled')
      continue;
    const dx = Math.abs(plane.x - x);
    const dy = plane.y - y;
    if (dx < 70 && dy < 70)
      attention = Math.max(attention, (1 - dx / 70) * (1 - Math.max(0, dy) / 70));
  }
  return Math.min(1, attention * 1.6);
}

/** A soft shadow on the land straight below each plane, fading with height. */
function paintShadow(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  world: World,
  plane: Plane,
  palette: Palette,
) {
  if (plane.state === 'crashed' || plane.state === 'out' || !isVisible(camera, plane.x, 20)) return;
  const ground = deckBelow(world, plane.x) ?? depthLift(world.terrain, plane.x, 0.35);
  const height = plane.y - ground;
  if (height > 120) return;
  const strength = (1 - height / 120) * (0.25 + palette.daylight * 0.2);
  ctx.fillStyle = withAlpha(palette.ink, strength);
  ctx.beginPath();
  ctx.ellipse(
    camera.x(plane.x),
    camera.y(ground),
    camera.scale * 8 * (1 - height / 300),
    camera.scale * 1.1,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

/** The top of a carrier's flight deck under x, where a shadow falls on it, if there is one. */
function deckBelow(world: World, x: number): number | null {
  for (const ship of world.ships) {
    if (ship.kind !== 'carrier' || ship.state === 'sunk') continue;
    const offset = offsetOnDeck(ship, x);
    if (offset >= 0 && offset <= deckLength(ship)) return deckHeight(ship) + 1;
  }
  return null;
}

/**
 * At night each enemy airfield and big enemy warship sweeps the sky with a
 * searchlight: the engine's own beams, so on a night raid what looks lit
 * is lit.
 */
function paintSearchlights(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
) {
  for (const beam of searchlightBeams(world)) {
    if (!isVisible(camera, beam.x, BEAM_REACH)) continue;
    const x = camera.x(beam.x);
    const y = camera.y(beam.y);
    const angle = -(beam.heading / TURN) * Math.PI * 2;
    const length = BEAM_REACH * camera.scale;
    const spread = (BEAM_HALF_ANGLE / TURN) * Math.PI * 2;
    const gradient = ctx.createLinearGradient(
      x,
      y,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length,
    );
    gradient.addColorStop(0, palette.searchlight.replace(/[\d.]+\)$/, '0.32)'));
    gradient.addColorStop(1, palette.searchlight.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle - spread) * length, y + Math.sin(angle - spread) * length);
    ctx.lineTo(x + Math.cos(angle + spread) * length, y + Math.sin(angle + spread) * length);
    ctx.closePath();
    ctx.fill();
  }
}

/** One offscreen canvas, reused, for building a fog bank before it is laid over the picture. */
let fogLayer: HTMLCanvasElement | null = null;

/**
 * Fog banks: a soft wall of low cloud from the ground up to their top,
 * thick enough to hide what is inside but not to lose it altogether. Each
 * bank is built on its own layer (a body thickening towards the ground,
 * a ragged line of billows along its top) and then faded out at both ends,
 * so it has no hard edge anywhere.
 */
function paintFog(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
  time: number,
) {
  const ratio = ctx.getTransform().a || 1;
  for (const bank of world.map.fog) {
    if (bank.right < camera.worldX(0) - 60 || bank.left > camera.right + 60) continue;
    const unit = camera.scale;
    const feather = unit * 46;
    const left = Math.max(-feather, camera.x(bank.left) - feather);
    const right = Math.min(camera.viewport.width + feather, camera.x(bank.right) + feather);
    const top = camera.y(bank.top) - unit * 14;
    const bottom = camera.bandBottom;
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) continue;
    fogLayer ??= document.createElement('canvas');
    const layer = fogLayer;
    layer.width = Math.ceil(width * ratio);
    layer.height = Math.ceil(height * ratio);
    const fog = layer.getContext('2d');
    if (!fog) return;
    fog.setTransform(ratio, 0, 0, ratio, -left * ratio, -top * ratio);

    const body = fog.createLinearGradient(0, top, 0, bottom);
    body.addColorStop(0, withAlpha(palette.fog, 0));
    body.addColorStop(0.2, withAlpha(palette.fog, 0.6));
    body.addColorStop(1, withAlpha(palette.fog, 0.84));
    fog.fillStyle = body;
    fog.fillRect(left, top, width, height);

    // A ragged line of billows along the top, each its own size, drifting slowly.
    fog.fillStyle = withAlpha(palette.fog, 0.42);
    const crest = camera.y(bank.top) + unit * 3;
    for (let x = bank.left - 20; x <= bank.right + 20; x += 15) {
      const size = 0.6 + 0.4 * Math.abs(Math.sin(x * 12.9898));
      const drift = Math.sin(time * 0.25 + x * 0.07) * 4;
      fog.beginPath();
      fog.ellipse(
        camera.x(x + drift),
        crest + Math.sin(x * 0.31) * unit * 2.5,
        unit * 15 * size,
        unit * 6.5 * size,
        0,
        0,
        Math.PI * 2,
      );
      fog.fill();
    }

    // Fade both ends to nothing.
    const ends = fog.createLinearGradient(left, 0, right, 0);
    const edge = Math.min(0.45, feather / width);
    ends.addColorStop(0, 'rgba(0, 0, 0, 0)');
    ends.addColorStop(edge, 'rgba(0, 0, 0, 1)');
    ends.addColorStop(1 - edge, 'rgba(0, 0, 0, 1)');
    ends.addColorStop(1, 'rgba(0, 0, 0, 0)');
    fog.globalCompositeOperation = 'destination-in';
    fog.fillStyle = ends;
    fog.fillRect(left, top, width, height);
    fog.globalCompositeOperation = 'source-over';

    ctx.drawImage(layer, left, top, width, height);
  }
}

/** A livery darkened towards a silhouette against the low sun. */
function silhouette(livery: Livery, share: number): Livery {
  const dark = '#3b2a34';
  return {
    ...livery,
    fabric: mix(livery.fabric, dark, share * 0.8),
    fabricShade: mix(livery.fabricShade, dark, share * 0.85),
    linen: mix(livery.linen, dark, share * 0.75),
    cowling: mix(livery.cowling, dark, share * 0.6),
    strut: mix(livery.strut, dark, share * 0.7),
  };
}
