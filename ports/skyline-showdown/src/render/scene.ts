import { createRng } from '@shared/rng';
import type { Point } from '../engine/geometry';
import { gorillaCentre, type PlayerIndex } from '../engine/gorillas';
import type { Round } from '../engine/match';
import type { Balloon, PowerUpKind } from '../engine/powerups';
import type { ShotRecord } from '../engine/shot';
import { Atmosphere, rollWeather } from './atmosphere';
import { Backdrop } from './backdrop';
import type { Camera } from './camera';
import { City } from './city';
import { Effects } from './effects';
import { drawBananaShape, GORILLA_LOOKS, GorillaActor } from './gorilla';
import { isNight, paletteFor, withAlpha, type Palette, type TimeOfDay } from './palette';
import { SkyBody } from './sky-body';

export const POWER_UP_COLOURS: Record<PowerUpKind, string> = {
  golden: '#ffd23f',
  tri: '#ff7ad9',
  calm: '#8ff0ff',
  bouncer: '#7dff8a',
  shield: '#a99bff',
};

export interface FlyingBanana {
  id: number;
  x: number;
  y: number;
  golden: boolean;
}

interface Trail {
  points: Point[];
  golden: boolean;
}

const TRAIL_LENGTH = 16;
/** The whole-path guide turns this colour when the throw would hit the opponent. */
const GUIDE_HIT_COLOUR = '#7dff8a';
/** Aim assist shows this share of the flight: enough to judge the launch, not the landing. */
const ASSIST_SHARE = 1 / 3;

/** A predicted throw to draw while aiming: all of it, or only its opening third. */
export interface ThrowPreview {
  shot: ShotRecord;
  whole: boolean;
}

/**
 * One round's worth of visuals: the city, sky, gorillas and everything in
 * the air, drawn back to front through the camera.
 */
export class Scene {
  readonly palette: Palette;
  readonly city: City;
  readonly backdrop: Backdrop;
  readonly atmosphere: Atmosphere;
  readonly skyBody: SkyBody;
  readonly effects = new Effects();
  readonly actors: [GorillaActor, GorillaActor] = [new GorillaActor(0), new GorillaActor(1)];

  bananas: FlyingBanana[] = [];
  /** Where the current thrower's previous banana went, drawn faintly. */
  ghost: Point[] | null = null;
  balloon: Balloon | null = null;
  /** The rubber band while dragging to aim. */
  aimLine: { from: Point; to: Point } | null = null;
  /** Aim assist, or the hidden whole-path guide, for the throw being aimed. */
  guide: ThrowPreview | null = null;
  activePlayer: PlayerIndex | null = null;
  wind: number;
  time = 0;

  private trails = new Map<number, Trail>();
  private windowTimer = 0;

  constructor(
    readonly round: Round,
    timeOfDay: TimeOfDay,
    weatherEnabled: boolean,
    onThunder: () => void,
  ) {
    const world = round.world.id;
    this.palette = paletteFor(world, timeOfDay);
    const occupied = round.gorillas.map((gorilla) => gorilla.building);
    this.city = new City(round.terrain.buildings, occupied, round.seed, this.palette);
    this.backdrop = new Backdrop(round.seed, this.palette, world);
    const weather = rollWeather(createRng(round.seed + 5), world, weatherEnabled);
    this.atmosphere = new Atmosphere(round.seed, this.palette, weather, world, onThunder);
    this.skyBody = new SkyBody(world, isNight(timeOfDay));
    this.wind = round.wind;
    this.balloon = round.balloon;
  }

  get weather() {
    return this.atmosphere.weather;
  }

  resize(paintScale: number) {
    this.city.render(paintScale);
    this.backdrop.render(paintScale);
  }

  update(delta: number, reducedMotion: boolean) {
    this.time += delta;
    this.windowTimer -= delta;
    if (this.windowTimer <= 0) {
      this.windowTimer = 0.35;
      this.city.flicker();
    }
    this.atmosphere.update(delta, this.wind, this.city.rooftops, reducedMotion);
    this.effects.update(delta, this.wind);
    this.skyBody.update(delta);
    for (const actor of this.actors) actor.update(delta);

    const live = new Set(this.bananas.map((banana) => banana.id));
    for (const banana of this.bananas) {
      const trail = this.trails.get(banana.id) ?? { points: [], golden: banana.golden };
      trail.points.push({ x: banana.x, y: banana.y });
      if (trail.points.length > TRAIL_LENGTH) trail.points.shift();
      this.trails.set(banana.id, trail);
    }
    // Trails of bananas that have landed shrink away instead of vanishing.
    for (const [id, trail] of this.trails) {
      if (live.has(id)) continue;
      trail.points.shift();
      if (trail.points.length === 0) this.trails.delete(id);
    }
  }

  clearTrails() {
    this.trails.clear();
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera) {
    const area = camera.visibleArea();
    const { time } = this;
    camera.apply(ctx);

    this.backdrop.drawSky(ctx, area, time, this.atmosphere.flash + this.effects.brightness * 0.08);
    this.skyBody.draw(ctx, time, this.palette.bodyGlow);
    this.atmosphere.drawBolt(ctx);
    this.backdrop.drawFar(ctx, camera.panX);
    this.atmosphere.drawClouds(ctx);
    this.backdrop.drawMid(ctx, camera.panX * 0.5);
    this.atmosphere.drawFog(ctx, area, time);

    this.city.draw(ctx);
    this.effects.drawEmbers(ctx);
    this.atmosphere.drawRooftops(ctx, this.city.rooftops, this.wind, time);
    this.backdrop.drawStreet(ctx, area, this.weather.rain, time);

    this.drawGhost(ctx);
    this.drawBalloon(ctx);
    this.actors.forEach((actor, index) => {
      const gorilla = this.round.gorillas[index as PlayerIndex];
      actor.draw(ctx, gorilla, GORILLA_LOOKS[index as PlayerIndex], this.palette.rimLight, time);
    });
    this.drawTurnMarker(ctx);
    this.drawGuide(ctx);
    this.drawAimLine(ctx);
    this.drawBananas(ctx);
    this.effects.draw(ctx);
    this.atmosphere.drawRain(ctx, this.wind);
  }

  private drawTurnMarker(ctx: CanvasRenderingContext2D) {
    if (this.activePlayer === null) return;
    const gorilla = this.round.gorillas[this.activePlayer];
    const accent = GORILLA_LOOKS[this.activePlayer].accent;
    const bob = Math.sin(this.time * 4) * 1.5;
    const x = gorilla.x + 15;
    const y = gorilla.y - 16 + bob;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = withAlpha(accent, 0.9);
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 2.5);
    ctx.lineTo(x + 3.5, y - 2.5);
    ctx.lineTo(x, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawAimLine(ctx: CanvasRenderingContext2D) {
    if (!this.aimLine) return;
    const { from, to } = this.aimLine;
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = withAlpha('#ffffff', 0.55);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = withAlpha('#ffffff', 0.8);
    ctx.beginPath();
    ctx.arc(to.x, to.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawGuide(ctx: CanvasRenderingContext2D) {
    if (!this.guide) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (this.guide.whole) this.drawWholePath(ctx, this.guide.shot);
    else this.drawOpeningPath(ctx, this.guide.shot);
    ctx.restore();
  }

  /** Aim assist: dots that fade out a third of the way into the flight. */
  private drawOpeningPath(ctx: CanvasRenderingContext2D, shot: ShotRecord) {
    const colour = GORILLA_LOOKS[shot.input.thrower].accent;
    const lastStep = shot.steps * ASSIST_SHARE;
    for (const track of shot.tracks) {
      track.points.forEach((point, index) => {
        const step = track.startStep + index;
        if (index === 0 || step > lastStep) return;
        const fade = 1 - step / lastStep;
        ctx.fillStyle = withAlpha(colour, 0.25 + 0.65 * fade);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 0.7 + 0.6 * fade, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  /** The hidden guide: the whole path, where it lands, and a crosshair on a hit. */
  private drawWholePath(ctx: CanvasRenderingContext2D, shot: ShotRecord) {
    const thrower = shot.input.thrower;
    const hitsOpponent = shot.victim !== null && shot.victim !== thrower;
    const colour = hitsOpponent ? GUIDE_HIT_COLOUR : GORILLA_LOOKS[thrower].accent;
    ctx.strokeStyle = withAlpha(colour, 0.75);
    ctx.lineWidth = 0.9;
    ctx.setLineDash([2.5, 2.5]);
    for (const track of shot.tracks) {
      ctx.beginPath();
      track.points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineWidth = 1.1;
    for (const event of shot.events) {
      if (event.type === 'explosion') {
        ctx.beginPath();
        ctx.arc(event.x, event.y, event.radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (event.type === 'gorilla') {
        drawCrosshair(ctx, gorillaCentre(this.round.gorillas[event.player]));
      }
    }
  }

  private drawGhost(ctx: CanvasRenderingContext2D) {
    if (!this.ghost || this.activePlayer === null) return;
    const accent = GORILLA_LOOKS[this.activePlayer].accent;
    ctx.fillStyle = withAlpha(accent, 0.28);
    this.ghost.forEach((point, index) => {
      if (index % 3 !== 0) return;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 0.9, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawBananas(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const trail of this.trails.values()) {
      const colour = trail.golden ? '#ffd23f' : '#ffe68a';
      for (let index = 1; index < trail.points.length; index++) {
        const from = trail.points[index - 1] as Point;
        const to = trail.points[index] as Point;
        const share = index / trail.points.length;
        ctx.strokeStyle = withAlpha(colour, share * 0.7);
        ctx.lineWidth = share * 3.2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    for (const banana of this.bananas) {
      ctx.save();
      ctx.translate(banana.x, banana.y);
      ctx.rotate(this.time * 13 + banana.id);
      ctx.scale(1.35, 1.35);
      drawBananaShape(ctx, banana.golden);
      ctx.restore();
    }
  }

  private drawBalloon(ctx: CanvasRenderingContext2D) {
    if (!this.balloon) return;
    const colour = POWER_UP_COLOURS[this.balloon.kind];
    const x = this.balloon.x;
    const y = this.balloon.y + Math.sin(this.time * 1.6) * 1.2;
    ctx.strokeStyle = withAlpha('#e8e0f0', 0.7);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x - 1.5, y + 12);
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x + 1.5, y + 12);
    ctx.stroke();

    const envelope = ctx.createRadialGradient(x - 2.5, y - 3, 1, x, y, 8);
    envelope.addColorStop(0, '#ffffff');
    envelope.addColorStop(0.3, colour);
    envelope.addColorStop(1, withAlpha(colour, 0.75));
    ctx.fillStyle = envelope;
    ctx.beginPath();
    ctx.ellipse(x, y, 6.5, 7.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7a5230';
    ctx.fillRect(x - 3.5, y + 12, 7, 5.5);
    ctx.strokeStyle = '#4a2e18';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - 3.5, y + 12, 7, 5.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = withAlpha(colour, 0.9);
    ctx.beginPath();
    ctx.arc(x, y + 14.75, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCrosshair(ctx: CanvasRenderingContext2D, centre: Point) {
  const radius = 20;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    ctx.moveTo(centre.x + dx * (radius - 6), centre.y + dy * (radius - 6));
    ctx.lineTo(centre.x + dx * (radius + 5), centre.y + dy * (radius + 5));
  }
  ctx.stroke();
}
