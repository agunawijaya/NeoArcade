import { css, lit } from './colour';
import { LANDSCAPES } from './landscapes';
import { rigLightsFor, type DriveScene, type PatrolScene } from './scene';
import { pinholeCamera, placedCamera, type Camera } from './vehicles/camera';
import { normalize, X, type Vec3 } from './vehicles/geometry';
import { drawLamps } from './vehicles/lamps';
import { environmentKey, type Environment } from './vehicles/light';
import { drawOfficerAtWindow, drawOfficerFront } from './vehicles/officer';
import { drawParts, type Part } from './vehicles/parts';
import { RIG, rigModel, RIG_PAINTS, type RigModel } from './vehicles/rig/model';
import { rigLampStrength } from './vehicles/rig/rig';
import { tractorBehindCab, tractorFront, tractorWheels } from './vehicles/rig/tractor';
import { trailerBody, trailerLamps, trailerWheels } from './vehicles/rig/trailer';
import type { SedanState } from './vehicles/sedan/body';
import { barFlash, washWith } from './vehicles/sedan/lightbar';
import {
  CIVILIAN_PAINTS,
  PATROL,
  SEDAN,
  SEDAN_LIGHTS_OFF,
  type SedanModel,
} from './vehicles/sedan/model';
import { drawSedan } from './vehicles/sedan/sedan';
import { mayRelight, VehicleSprite } from './vehicles/sprite';

/**
 * The vehicles of the cab view, all from the same models as the side view:
 * our own hood over the dash, the traffic through the windscreen, and in
 * the mirrors our trailer, our stack and whatever is coming up behind.
 *
 * The world here is in feet: x ahead of the driver's eyes, y up, z to the
 * right of the road's centre line. The eyes are 9 feet up in the middle of
 * the right-hand lane, as the cab view's road has always been drawn.
 */
export interface CabWorld {
  scene: DriveScene;
  env: Environment;
  night: number;
  /** Where the windscreen's road lands: its vanishing point, focal length and the dash. */
  vanishX: number;
  horizon: number;
  focal: number;
  dashTop: number;
  width: number;
  /** Feet the eyes have moved right of their lane, when the rig is on the shoulder. */
  shift: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EYE: Vec3 = [0, 9, 6];
/** Our rig in the world: its model's driver's seat put at the eyes. */
const OURS: Vec3 = [-RIG.eye[0], 0, EYE[2] - RIG.eye[2]];
const LEAD_DISTANCE = 520;
const HOOD_EYE = 7.7;
/** The far carriageway's lane, where the oncoming cars drive. */
const ONCOMING = -52.8;
const BILLBOARD_FOCAL = 900;
const BILLBOARD_DISTANCE = 140;

/** Feet from the driver's eyes to the patrol car's front bumper. */
const patrolFront = (patrol: PatrolScene) => RIG.bumper - RIG.eye[0] + patrol.gap;

const patrolState = (patrol: PatrolScene, time: number): SedanState => ({
  lights: patrol.lights,
  turn: patrol.rolled / SEDAN.tyreRadius,
  steer: 0,
  sway: time,
  door: patrol.door,
});

/** Across the road, for a lane value: the passing lane, ours, the shoulder. */
function laneZ(lane: number): number {
  return lane >= 0 ? 6 - lane * 12 : 6 - lane * 8.8;
}

export function roadCamera(world: CabWorld): Camera {
  return pinholeCamera({
    eye: [EYE[0], EYE[1], EYE[2] + world.shift],
    forward: X,
    focal: world.focal,
    cx: world.vanishX,
    cy: world.horizon,
  });
}

export class CabVehicles {
  private readonly hood = new VehicleSprite();
  private readonly mirrors = [new VehicleSprite(), new VehicleSprite()];
  private readonly lead = new Billboard();
  private readonly oncoming = CIVILIAN_PAINTS.slice(0, 4).map(() => new Billboard());
  private readonly leadModel = rigModel({ paint: RIG_PAINTS.highway, cargo: 'freight', dirt: 0.4 });

  /** Traffic through the windscreen: a truck far ahead, cars on the other carriageway, the patrol. */
  drawTraffic(ctx: CanvasRenderingContext2D, world: CabWorld, roadScroll: number) {
    const camera = roadCamera(world);
    const { scene, env } = world;
    const headlights = world.night > 0.35;
    // Cars on the far carriageway, coming the other way.
    const spacing = 720;
    const flow = scene.reducedMotion ? 0 : scene.time * 336;
    this.oncoming.forEach((board, index) => {
      const z =
        ((((index * spacing - roadScroll * 6 - flow) % (spacing * 4)) + spacing * 4) %
          (spacing * 4)) +
        70;
      if (z > 2600) return;
      const paint = CIVILIAN_PAINTS[index] ?? '#8a8f96';
      const model: SedanModel = { kind: 'civilian', paint, dirt: 0.2 };
      board.draw(ctx, {
        shape: `${paint}|${headlights}`,
        light: environmentKey(env),
        foot: [BILLBOARD_DISTANCE, 0, ONCOMING],
        at: camera.project([z, 0, ONCOMING]),
        scale: (world.focal / BILLBOARD_FOCAL) * (BILLBOARD_DISTANCE / z),
        paint: (paper, reference) =>
          drawSedan(
            paper,
            placedCamera(reference, [BILLBOARD_DISTANCE + SEDAN.length / 2, 0, ONCOMING], Math.PI),
            {
              model,
              state: {
                lights: { ...SEDAN_LIGHTS_OFF, head: headlights, markers: headlights },
                turn: 0,
                steer: 0,
                sway: 0,
              },
              env,
              time: 0,
              reducedMotion: true,
            },
          ),
      });
    });
    // A rig far ahead in our lane, its doors and tail lamps.
    const distance = LEAD_DISTANCE + Math.sin(scene.time * 0.15) * 60;
    const lights = { ...rigLightsFor(scene, world.night), brake: false, left: false, right: false };
    this.lead.draw(ctx, {
      shape: String(lights.markers),
      light: environmentKey(env),
      foot: [BILLBOARD_DISTANCE, 0, 6],
      at: camera.project([distance, 0, 6]),
      scale: (world.focal / BILLBOARD_FOCAL) * (BILLBOARD_DISTANCE / distance),
      paint: (paper, reference) => {
        const placed = placedCamera(reference, [BILLBOARD_DISTANCE, 0, 6]);
        drawParts(
          paper,
          [...trailerBody(this.leadModel), ...trailerWheels(this.leadModel, 0)],
          placed,
          env,
        );
        drawLamps(
          paper,
          trailerLamps(),
          placed,
          (lamp) => rigLampStrength(lamp, lights),
          env.night,
        );
      },
    });
    const patrol = scene.patrol;
    if (!patrol) return;
    const front = patrolFront(patrol);
    // Once all of it is ahead of us: alongside, it is seen out of the side window instead.
    if (front - SEDAN.length > 1.5)
      drawSedan(ctx, placedCamera(camera, [front - SEDAN.length, 0, laneZ(patrol.lane)]), {
        model: PATROL,
        state: patrolState(patrol, scene.time),
        env,
        time: scene.time,
        reducedMotion: scene.reducedMotion,
      });
  }

  /**
   * The trooper walking back along our right-hand side to the passenger
   * door, from the cruiser's door until the hood hides him.
   */
  drawOfficer(ctx: CanvasRenderingContext2D, world: CabWorld) {
    const { scene, env } = world;
    const officer = scene.patrol?.officer;
    if (!officer || officer.atWindow >= 1) return;
    const camera = roadCamera(world);
    const feet: Vec3 = [
      RIG.bumper - RIG.eye[0] + officer.along,
      0,
      OURS[2] + world.shift + RIG.trailer.halfWidth + officer.out,
    ];
    if (feet[0] < 3) return;
    const at = camera.project(feet);
    drawOfficerFront(ctx, at.x, at.y, camera.pixelsAt(feet) * 6.35, officer, {
      light: { ...env.lighting, day: Math.max(env.lighting.day, 0.3 + env.night * 0.15) },
      night: env.night,
      time: scene.reducedMotion ? 0 : scene.time,
    });
  }

  /**
   * A glance out of a side window, framed like the door's glass: out of the
   * driver's, the patrol car alongside as it passes; out of the passenger's,
   * the trooper up on the step.
   */
  drawSideWindow(
    ctx: CanvasRenderingContext2D,
    world: CabWorld,
    side: -1 | 1,
    glass: Rect,
    roadScroll: number,
  ) {
    const { scene, env } = world;
    const patrol = scene.patrol;
    if (!patrol) return;
    const camera = pinholeCamera({
      eye: [EYE[0], EYE[1], EYE[2] + world.shift],
      forward: normalize(side < 0 ? [0.08, -0.48, -1] : [-0.1, -0.25, 1]),
      focal: glass.width * 0.5,
      cx: glass.x + glass.width / 2,
      cy: glass.y + glass.height * 0.42,
    });
    this.paintAside(ctx, camera, world, glass, side, roadScroll);
    if (side < 0) {
      drawSedan(
        ctx,
        placedCamera(camera, [patrolFront(patrol) - SEDAN.length, 0, laneZ(patrol.lane)]),
        {
          model: PATROL,
          state: patrolState(patrol, scene.time),
          env,
          time: scene.time,
          reducedMotion: scene.reducedMotion,
        },
      );
    } else if (patrol.officer) {
      drawOfficerAtWindow(ctx, glass, patrol.officer, {
        light: { ...env.lighting, day: Math.max(env.lighting.day, 0.4) },
        night: env.night,
        time: scene.reducedMotion ? 0 : scene.time,
      });
    }
    if (patrol.lights.bar) {
      const flash = barFlash(scene.time, scene.reducedMotion);
      washWith(
        ctx,
        glass.x + glass.width * (side < 0 ? 0.5 : 0.2),
        glass.y + glass.height * 0.5,
        glass.width * 0.9,
        flash,
        side < 0 ? 0.2 + world.night * 0.5 : 0.1 + world.night * 0.25,
      );
    }
  }

  /** Sky, verge and road out of a side window. */
  private paintAside(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    world: CabWorld,
    glass: Rect,
    side: -1 | 1,
    roadScroll: number,
  ) {
    const { scene, env } = world;
    const horizon = Math.min(
      glass.y + glass.height,
      camera.project([1500, 0, EYE[2] + world.shift + side * 4000]).y,
    );
    const sky = ctx.createLinearGradient(0, glass.y, 0, horizon);
    sky.addColorStop(0, css(env.skyTop));
    sky.addColorStop(1, css(env.skyHorizon));
    ctx.fillStyle = sky;
    ctx.fillRect(glass.x, glass.y, glass.width, horizon - glass.y + 1);
    const landscape = LANDSCAPES[scene.region];
    ctx.fillStyle = lit(scene.snow ? '#e9edf2' : landscape.ground, env.lighting, 0.25);
    ctx.fillRect(glass.x, horizon, glass.width, glass.y + glass.height - horizon);
    const wet = scene.condition === 'wet' || scene.condition === 'rain';
    const snowRoad = scene.condition === 'light-snow' || scene.condition === 'blizzard';
    const strip = (from: number, to: number, colour: string) => {
      const corners = [
        camera.project([-8, 0, from]),
        camera.project([-8, 0, to]),
        camera.project([600, 0, to]),
        camera.project([600, 0, from]),
      ];
      ctx.fillStyle = colour;
      ctx.beginPath();
      for (const corner of corners) ctx.lineTo(corner.x, corner.y);
      ctx.closePath();
      ctx.fill();
    };
    const asphalt = lit(wet ? '#2c2f34' : snowRoad ? '#8f959c' : '#46494e', env.lighting);
    if (side < 0) {
      strip(-65, -41, lit(wet ? '#2f3237' : '#4a4d52', env.lighting, 0.15));
      strip(-12, 12, asphalt);
      strip(-12, -11.7, lit('#f2c14e', env.lighting));
      // Lane dashes running past under the window.
      ctx.fillStyle = lit(snowRoad ? '#e4e8ec' : '#f0ead4', env.lighting);
      const phase = (roadScroll * 12) % 144;
      for (let x = -phase + 150; x > -10; x -= 144) {
        const a = camera.project([x, 0, -0.25]);
        const b = camera.project([x + 36, 0, -0.25]);
        const c = camera.project([x + 36, 0, 0.25]);
        const d = camera.project([x, 0, 0.25]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      strip(12, 17.4, lit(snowRoad ? '#cfd5dc' : landscape.shoulder, env.lighting));
      strip(11.7, 12, lit('#f0ead4', env.lighting));
    }
  }

  /** Our own hood, filling the bottom of the windscreen. */
  drawHood(ctx: CanvasRenderingContext2D, world: CabWorld, bounce: number) {
    const { scene, env } = world;
    // The hood is seen from a little lower than the road is, so more of it shows over the
    // dash; its lines still run to the road's vanishing point.
    const camera = pinholeCamera({
      eye: [RIG.eye[0], HOOD_EYE, RIG.eye[2]],
      forward: X,
      focal: world.focal,
      cx: world.vanishX,
      cy: world.horizon,
    });
    this.hood.draw(ctx, {
      shape: [world.width, world.dashTop, world.horizon, JSON.stringify(scene.rig)].join('|'),
      light: environmentKey(env),
      camera,
      env,
      min: [57.5, 1, -4.5],
      max: [65.6, 7.2, 4.5],
      body: () => tractorFront(scene.rig),
      wheels: [],
      lift: bounce,
      within: {
        x: 0,
        y: world.horizon,
        width: world.width,
        height: world.dashTop - world.horizon + 8,
      },
    });
  }

  /**
   * One of the big West Coast mirrors: the road behind, our trailer and
   * stack down its inner edge, and the patrol car when it comes, all seen
   * the wrong way round, as a mirror sees them.
   */
  drawMirror(
    ctx: CanvasRenderingContext2D,
    world: CabWorld,
    side: -1 | 1,
    glass: Rect,
    roadScroll: number,
  ) {
    const { scene, env } = world;
    const eye: Vec3 = [57.47 + OURS[0], 7.55, side * 4.46 + OURS[2] + world.shift];
    const camera = pinholeCamera({
      eye,
      forward: normalize([-1, -0.035, side * 0.075]),
      focal: glass.width * 3.1,
      cx: glass.x + glass.width / 2,
      cy: glass.y + glass.height * 0.4,
      mirror: true,
    });
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(glass.x, glass.y, glass.width, glass.height, Math.min(6, glass.width * 0.08));
    ctx.clip();
    this.paintBehind(ctx, camera, world, glass, roadScroll);
    const patrol = scene.patrol;
    // Only while all of it is behind the mirror; alongside, the side window shows it.
    if (patrol && patrolFront(patrol) < eye[0] - 1) {
      drawSedan(
        ctx,
        placedCamera(camera, [patrolFront(patrol) - SEDAN.length, 0, laneZ(patrol.lane)]),
        {
          model: PATROL,
          state: patrolState(patrol, scene.time),
          env,
          time: scene.time,
          reducedMotion: scene.reducedMotion,
        },
      );
    }
    const ours = placedCamera(camera, [OURS[0], 0, OURS[2] + world.shift]);
    const state = { lights: rigLightsFor(scene, world.night), turn: 0, steer: 0, sway: 0 };
    const sprite = this.mirrors[side < 0 ? 0 : 1] as VehicleSprite;
    sprite.draw(ctx, {
      shape: [
        glass.x,
        glass.y,
        glass.width,
        glass.height,
        world.shift,
        JSON.stringify(scene.rig),
      ].join('|'),
      light: environmentKey(env),
      camera: ours,
      env,
      min: [0, 0, -4.8],
      max: [55, 13.6, 4.8],
      body: () => mirrorParts(scene.rig, state),
      wheels: [],
      lift: 0,
      within: glass,
    });
    drawLamps(ctx, trailerLamps(), ours, (lamp) => rigLampStrength(lamp, state.lights), env.night);
    if (patrol?.lights.bar) {
      // The beacons wash over the whole glass, red and blue in turn.
      const flash = barFlash(scene.time, scene.reducedMotion);
      washWith(
        ctx,
        glass.x + glass.width / 2,
        glass.y + glass.height * 0.5,
        glass.height * 0.9,
        flash,
        0.35 + world.night * 0.6,
      );
    }
    this.paintGlass(ctx, glass, world.night);
    ctx.restore();
  }

  /** Sky and road behind, drawn through the mirror's camera. */
  private paintBehind(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    world: CabWorld,
    glass: Rect,
    roadScroll: number,
  ) {
    const { scene, env } = world;
    const horizon = camera.project([-4000, 0, world.shift + 6]).y;
    const sky = ctx.createLinearGradient(0, glass.y, 0, horizon);
    sky.addColorStop(0, css(env.skyTop));
    sky.addColorStop(1, css(env.skyHorizon));
    ctx.fillStyle = sky;
    ctx.fillRect(glass.x, glass.y, glass.width, horizon - glass.y + 1);
    const landscape = LANDSCAPES[scene.region];
    ctx.fillStyle = lit(scene.snow ? '#e9edf2' : landscape.ground, env.lighting, 0.2);
    ctx.fillRect(glass.x, horizon, glass.width, glass.y + glass.height - horizon);
    const wet = scene.condition === 'wet' || scene.condition === 'rain';
    const snowRoad = scene.condition === 'light-snow' || scene.condition === 'blizzard';
    const strip = (from: number, to: number, colour: string) => {
      const a = camera.project([-3, 0, from]);
      const b = camera.project([-3, 0, to]);
      const c = camera.project([-3000, 0, to]);
      const d = camera.project([-3000, 0, from]);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    };
    const asphalt = lit(wet ? '#2c2f34' : snowRoad ? '#8f959c' : '#46494e', env.lighting);
    strip(12, 17.4, lit(snowRoad ? '#cfd5dc' : landscape.shoulder, env.lighting));
    strip(-12, 12, asphalt);
    strip(-65, -41, lit(wet ? '#2f3237' : '#4a4d52', env.lighting, 0.1));
    strip(11.7, 12, lit('#f0ead4', env.lighting));
    strip(-12, -11.7, lit('#f2c14e', env.lighting));
    // Lane dashes streaming away behind.
    ctx.fillStyle = lit(snowRoad ? '#e4e8ec' : '#f0ead4', env.lighting);
    const phase = (roadScroll * 12) % 144;
    for (let x = -phase - 10; x > -1500; x -= 144) {
      const a = camera.project([x, 0, -0.25]);
      const b = camera.project([x, 0, 0.25]);
      const c = camera.project([x - 36, 0, 0.25]);
      const d = camera.project([x - 36, 0, -0.25]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** A flat mirror's glass: a faint tint, darker edges, a streak of reflected cab light. */
  private paintGlass(ctx: CanvasRenderingContext2D, glass: Rect, night: number) {
    const edge = ctx.createRadialGradient(
      glass.x + glass.width / 2,
      glass.y + glass.height / 2,
      Math.min(glass.width, glass.height) * 0.3,
      glass.x + glass.width / 2,
      glass.y + glass.height / 2,
      Math.max(glass.width, glass.height) * 0.75,
    );
    edge.addColorStop(0, 'rgba(10, 18, 28, 0)');
    edge.addColorStop(1, `rgba(10, 18, 28, ${0.35 + night * 0.2})`);
    ctx.fillStyle = edge;
    ctx.fillRect(glass.x, glass.y, glass.width, glass.height);
    ctx.fillStyle = `rgba(200, 225, 245, ${0.07 + (1 - night) * 0.06})`;
    ctx.beginPath();
    ctx.moveTo(glass.x + glass.width * 0.15, glass.y);
    ctx.lineTo(glass.x + glass.width * 0.45, glass.y);
    ctx.lineTo(glass.x, glass.y + glass.height * 0.55);
    ctx.lineTo(glass.x, glass.y + glass.height * 0.25);
    ctx.closePath();
    ctx.fill();
  }
}

function mirrorParts(model: RigModel, state: Parameters<typeof tractorBehindCab>[1]): Part[] {
  return [
    ...trailerBody(model),
    ...trailerWheels(model, 0),
    ...tractorBehindCab(model, state),
    ...tractorWheels(model, state).filter(
      (wheel) => wheel.kind === 'cylinder' && wheel.centre[0] < 50,
    ),
  ];
}

/**
 * A distant vehicle kept as a picture and scaled with its distance: from
 * far away its angle hardly changes, so it need not be redrawn every frame.
 */
class Billboard {
  private readonly canvas = document.createElement('canvas');
  private shape = '';
  private light = '';
  private paintedAt = -Infinity;
  private anchor = { x: 0, y: 0 };

  draw(ctx: CanvasRenderingContext2D, options: BillboardOptions) {
    if (options.scale < 0.02) return;
    const relit = options.light !== this.light && mayRelight(this.paintedAt);
    if (options.shape !== this.shape || relit) this.repaint(options);
    ctx.drawImage(
      this.canvas,
      options.at.x - this.anchor.x * options.scale,
      options.at.y - this.anchor.y * options.scale,
      (this.canvas.width / 2) * options.scale,
      (this.canvas.height / 2) * options.scale,
    );
  }

  private repaint(options: BillboardOptions) {
    this.shape = options.shape;
    this.light = options.light;
    this.paintedAt = performance.now() / 1000;
    const width = 420;
    const height = 260;
    this.canvas.width = width * 2;
    this.canvas.height = height * 2;
    const paper = this.canvas.getContext('2d');
    if (!paper) return;
    paper.setTransform(2, 0, 0, 2, 0, 0);
    // A camera like the road's, turned so the vehicle stands in the middle of the picture.
    const { foot } = options;
    const reference = pinholeCamera({
      eye: EYE,
      forward: X,
      focal: BILLBOARD_FOCAL,
      cx: width / 2 - (BILLBOARD_FOCAL * (foot[2] - EYE[2])) / foot[0],
      cy: 60,
    });
    this.anchor = reference.project(foot);
    options.paint(paper, reference);
  }
}

interface BillboardOptions {
  /** What the vehicle looks like, apart from the light. */
  shape: string;
  light: string;
  /** The vehicle's foot in the picture's own world, which the picture is centred on. */
  foot: Vec3;
  /** Where that foot lands on screen now, and how big the vehicle is against its picture. */
  at: { x: number; y: number };
  scale: number;
  paint: (paper: CanvasRenderingContext2D, reference: Camera) => void;
}
