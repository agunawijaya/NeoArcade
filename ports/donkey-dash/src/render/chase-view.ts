import { BARRIER_DEPTH, CAR_LENGTH, DONKEY_DEPTH } from '../engine/constants';
import { AHEAD_DISTANCE } from '../engine/rival';
import { closingLaneAt, edgesAt, laneLateral, layoutAt, type Road } from '../engine/road';
import { revealGap } from '../engine/sight';
import { drawCrash } from './crash';
import { drawParticle } from './effects';
import { parcelBeside, type Parcel } from './fields';
import {
  chevronShape,
  chevronsOf,
  conesOf,
  LANE_METRES,
  laneEndsBetween,
  laneEndsSign,
  LANE_END_PAINT,
  mergeArrowShape,
  mergeArrowsOf,
  sliceAt,
  type Shape,
} from './lanes';
import { coatFor, DRIVER_COLOURS, mix, withAlpha, type Palette } from './palette';
import { hash, hasFence, polesBetween, propsBetween } from './scenery';
import {
  drawBarrier,
  drawCarrot,
  drawCone,
  drawDriverTag,
  drawLaneEndsSign,
  drawSign,
} from './sprites/bits';
import { drawCarRear } from './sprites/car';
import { DONKEY_HEIGHT, DONKEY_LENGTH, drawDonkey, drawDonkeyShadow } from './sprites/donkey';
import { drawPole, drawProp, PROP_HEIGHT } from './sprites/props';
import {
  ghostAlpha,
  summitProgress,
  type Box,
  type CarFrame,
  type CrashFrame,
  type Frame,
  type HazardFrame,
  type RoadView,
  type Viewport,
  type ViewLayout,
} from './view';
import { drawWeather } from './weather';

/**
 * The Chase view: behind and above the car, OutRun style. The road climbs
 * gently to a crest that sits exactly at the sight line, so donkeys come
 * over the top of the hill just as they come into view, and nothing beyond
 * the crest is ever on the road. In the duels the crest draws nearer with
 * every dodge: you are climbing to the top.
 *
 * Distances ahead are stretched by a factor so the crest can sit at a good
 * distance on screen; the time a donkey takes from the crest to the car is
 * exactly the engine's reaction window. Beside the car a metre stays a metre,
 * and in Rival Driver beside a car riding Ahead too.
 *
 * When the road shifts, it bends towards its new lanes: the camera follows
 * the car across, and the road ahead curves off the way the lanes are going.
 */
export interface ChaseLayout extends ViewLayout {
  focal: number;
  horizonY: number;
  cameraHeight: number;
  /** Depth of the car's rear bumper, metres in front of the camera. */
  carDepth: number;
  noseDepth: number;
  crestDepth: number;
  crestHeight: number;
  /** Metres of chase depth per metre of road ahead, beyond the stretch kept true to scale. */
  stretch: number;
  centreX: number;
  width: number;
  height: number;
  /** Depth of a spot `gap` metres ahead of the nose (negative: alongside or behind the car). */
  depthOf(gap: number): number;
  /** The other way: how far ahead of the nose a depth is. */
  gapAt(depth: number): number;
  /** Screen point of a spot on the road: `across` metres from the middle, `up` metres high. */
  project(
    depth: number,
    across: number,
    up?: number,
    curve?: number,
  ): { x: number; y: number; scale: number };
}

const CAR_DEPTH = 4.2;
const CAR_WIDTH = 1.8;
/** The crest stands this fraction of the camera's height above the road at the car. */
const CREST_RISE = 0.45;
/** The smallest a donkey on the crest may look, in pixels across. */
const CREST_DONKEY_PIXELS = 30;

/**
 * With two cars side by side the camera stands further back, so that both
 * stay on screen even on the outer lanes of a road four lanes wide.
 */
const TWO_CAR_SHARE = 0.14;
/**
 * With two cars the road is true to scale up to a car riding Ahead; beyond
 * it, the crest stands far enough back that the rest of the road is squeezed
 * no more than this, or donkeys would seem to dawdle on the crest and then
 * rush the cars.
 */
const TWO_CAR_LEAST_STRETCH = 0.45;

export function chaseLayout(viewport: Viewport, climb: number, twoCars = false): ChaseLayout {
  const { width, height, insetTop, insetBottom } = viewport;
  const portrait = height > width;
  const oneCar = portrait ? 0.32 : Math.max(0.15, Math.min(0.21, 300 / width));
  const carShare = twoCars ? Math.min(oneCar, TWO_CAR_SHARE) : oneCar;
  const focal = (carShare * width * CAR_DEPTH) / CAR_WIDTH;
  const noseDepth = CAR_DEPTH + CAR_LENGTH;
  const sightAhead = revealGap(climb);
  const trueAhead = twoCars ? AHEAD_DISTANCE : 0;
  const crestDepth = Math.max(
    16,
    Math.min(46, (focal * DONKEY_LENGTH) / CREST_DONKEY_PIXELS),
    noseDepth + trueAhead + (sightAhead - trueAhead) * (twoCars ? TWO_CAR_LEAST_STRETCH : 0),
  );
  const carBottom = height - Math.max(insetBottom + 24, height * 0.08);
  const available = carBottom - insetTop;
  // The crest, with a donkey standing on it, must clear the HUD.
  const crestY = insetTop + Math.max(available * 0.2, (focal * DONKEY_HEIGHT) / crestDepth + 12);
  const cameraHeight =
    (carBottom - crestY) / (focal * (1 / CAR_DEPTH - (1 - CREST_RISE) / crestDepth));
  const horizonY = carBottom - (cameraHeight * focal) / CAR_DEPTH;
  const stretch = (crestDepth - noseDepth - trueAhead) / (sightAhead - trueAhead);
  const crestHeight = cameraHeight * CREST_RISE;
  const centreX = width / 2;

  const roadHeight = (depth: number) => {
    const t = Math.min(1, Math.max(0, (depth - CAR_DEPTH) / (crestDepth - CAR_DEPTH)));
    return crestHeight * (1 - (1 - t) * (1 - t));
  };
  const project = (depth: number, across: number, up = 0, curve = 0) => {
    const scale = focal / depth;
    const bend = curve * Math.max(0, depth - CAR_DEPTH) ** 2;
    return {
      x: centreX + (across + bend) * scale,
      y: horizonY + (cameraHeight - roadHeight(depth) - up) * scale,
      scale,
    };
  };
  // Only the road ahead is stretched; alongside the car, a metre is a metre,
  // so dust leaves the rear wheels and a passing donkey stays car-sized.
  const depthOf = (gap: number) =>
    noseDepth + (gap <= trueAhead ? gap : trueAhead + (gap - trueAhead) * stretch);
  const gapAt = (depth: number) => {
    const gap = depth - noseDepth;
    return gap <= trueAhead ? gap : trueAhead + (gap - trueAhead) / stretch;
  };

  return {
    focal,
    horizonY,
    cameraHeight,
    carDepth: CAR_DEPTH,
    noseDepth,
    crestDepth,
    crestHeight,
    stretch,
    centreX,
    width,
    height,
    sightAhead,
    depthOf,
    gapAt,
    project,
    donkeyBox(gap, lateral) {
      const depth = depthOf(gap + DONKEY_DEPTH / 2);
      const foot = project(depth, lateral * LANE_METRES);
      const long = DONKEY_LENGTH * foot.scale;
      const tall = DONKEY_HEIGHT * foot.scale;
      return { x: foot.x - long / 2, y: foot.y - tall, width: long, height: tall };
    },
    carBox(lateral, ahead = 0) {
      const rear = project(depthOf(ahead - CAR_LENGTH), lateral * LANE_METRES);
      const wide = CAR_WIDTH * 1.1 * rear.scale;
      const tall = 1.6 * rear.scale;
      return { x: rear.x - wide / 2, y: rear.y - tall, width: wide, height: tall };
    },
  };
}

interface Sprite {
  depth: number;
  draw(): void;
}

/** One slice of the ground from the crest to the car: its depth, road position and edges, in metres. */
interface RoadRow {
  depth: number;
  position: number;
  left: number;
  right: number;
}

/** Metres behind the bumper over which dust and trails fade away. */
const TRAIL_FADE = 2.5;

/** How far the fields reach out from the road, in metres: past the edge of any screen. */
const FIELD_REACH = 400;
const FURROWS = 14;
const FURROW_SPACING = 1.6;

/** Road bands alternate colour every this many metres of road. */
const BAND = 2;

export class ChaseView implements RoadView {
  readonly camera = 'chase' as const;
  private cameraAcross = 0;

  layout(viewport: Viewport, climb: number, twoCars = false): ChaseLayout {
    return chaseLayout(viewport, climb, twoCars);
  }

  draw(ctx: CanvasRenderingContext2D, frame: Frame, viewport: Viewport) {
    const layout = this.layout(viewport, frame.climb, frame.twoCars);
    const curve = bendOf(frame.road, frame.nose, layout.sightAhead);
    // The camera follows the car (or, with two, the road) across, but only part of the way, so the road sways.
    this.cameraAcross = frame.focus * LANE_METRES * 0.6;
    const across = (metres: number) => metres - this.cameraAcross;
    const roadPosition = (depth: number) => frame.nose + layout.gapAt(depth);

    this.drawBackdrop(ctx, frame, viewport, layout, curve);
    this.drawRoad(ctx, frame, viewport, layout, curve, across, roadPosition);
    for (const car of frame.cars) this.drawSightMarks(ctx, layout, car, curve, across);

    const sprites: Sprite[] = [];
    this.collectScenery(ctx, frame, layout, curve, across, sprites);
    this.collectHazards(ctx, frame, layout, curve, across, sprites);
    this.collectLaneEnds(ctx, frame, layout, curve, across, sprites);
    for (const car of frame.cars) {
      const depth = layout.depthOf(car.ahead - CAR_LENGTH);
      sprites.push({
        depth,
        draw: () =>
          this.drawCar(ctx, frame, layout, car, depth, curve, across(car.lateral * LANE_METRES)),
      });
    }
    sprites.sort((a, b) => b.depth - a.depth);
    for (const sprite of sprites) sprite.draw();

    for (const particle of frame.particles) {
      const depth = layout.depthOf(particle.along - frame.nose);
      // Dust and trails drift back past the bumper towards the camera, where
      // they would balloon: pin them to the car's tail and let them fade.
      const behind = layout.carDepth - depth;
      if (behind > TRAIL_FADE) continue;
      const point = layout.project(
        Math.max(depth, layout.carDepth),
        across(particle.across),
        particle.up,
        curve,
      );
      const fade = behind > 0 ? 1 - behind / TRAIL_FADE : 1;
      drawParticle(ctx, particle, point.x, point.y, point.scale, fade);
    }

    this.drawNight(ctx, frame, viewport, layout, across);
    drawWeather(ctx, frame, viewport);
    this.drawTags(ctx, frame, layout, across);
    for (const crash of frame.crashes) this.drawCrash(ctx, frame, crash, viewport, layout, across);
  }

  /** Rival Driver's labels, on each car's rear window, after the night and the weather so nothing hides them. */
  private drawTags(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: ChaseLayout,
    across: (metres: number) => number,
  ) {
    for (const car of frame.cars) {
      if (car.tag === null || car.driver === null) continue;
      const rear = layout.project(
        layout.depthOf(car.ahead - CAR_LENGTH),
        across(car.lateral * LANE_METRES),
        0,
        bendOf(frame.road, frame.nose, layout.sightAhead),
      );
      const { shape } = car.look;
      const rearWindow = car.hop + car.bounce + 0.3 + shape.height + shape.cabinHeight / 2;
      const height = Math.max(11, Math.min(18, rear.scale * 0.22));
      drawDriverTag(
        ctx,
        car.tag,
        DRIVER_COLOURS[car.driver],
        rear.x,
        rear.y - rearWindow * rear.scale,
        height,
      );
    }
  }

  private drawBackdrop(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    viewport: Viewport,
    layout: ChaseLayout,
    curve: number,
  ) {
    const { palette } = frame;
    const { width, height } = viewport;
    const crestY = layout.project(layout.crestDepth, 0).y;
    const sky = ctx.createLinearGradient(0, 0, 0, crestY);
    sky.addColorStop(0, palette.sky[0]);
    sky.addColorStop(0.6, palette.sky[1]);
    sky.addColorStop(1, palette.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, crestY + 2);

    if (palette.stars) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for (let index = 0; index < 90; index++) {
        const x = hash(index) * width;
        const y = hash(index + 300) * crestY * 0.8;
        const twinkle = frame.reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(frame.time * 2 + index);
        ctx.globalAlpha = twinkle * 0.8;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }

    // The sun (or moon) drifts with the bends of the road.
    const drift = curve * 9000;
    const sunX = wrap(width * palette.sun.x - drift, width * 1.4) - width * 0.2;
    const sunY = crestY * (1 - palette.sun.height * 0.9);
    const sunRadius = Math.max(18, Math.min(width, height) * 0.06);
    const glow = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.5, sunX, sunY, sunRadius * 5);
    glow.addColorStop(0, palette.sun.glow);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - sunRadius * 5, sunY - sunRadius * 5, sunRadius * 10, sunRadius * 10);
    ctx.fillStyle = palette.sun.colour;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    if (palette.sun.moon) {
      // A crescent: a second disc bites into the moon, clipped so none of it pokes out.
      ctx.save();
      ctx.clip();
      ctx.moveTo(sunX + sunRadius * 1.3, sunY - sunRadius * 0.2);
      ctx.arc(sunX + sunRadius * 0.45, sunY - sunRadius * 0.2, sunRadius * 0.85, 0, Math.PI * 2);
      ctx.fill('evenodd');
      ctx.restore();
    } else {
      ctx.fill();
    }

    // Two ranges of mountains, the nearer moving more as the road bends. The
    // Mountain Pass gets real peaks, with snow on top.
    const alpine = palette.look === 'mountain';
    const farPeaks = ridge(
      ctx,
      width,
      crestY,
      palette.mountains[0],
      crestY * (alpine ? 0.52 : 0.34),
      drift * 0.3,
      11,
      alpine ? 0.3 : 0.12,
    );
    if (alpine) snowCaps(ctx, farPeaks, width, crestY - crestY * 0.52 * 0.62, drift * 0.3);
    ridge(ctx, width, crestY, palette.mountains[1], crestY * 0.2, drift * 0.6, 23, 0.2);
    // Rolling fields just beyond the crest, fading into the haze.
    ridge(
      ctx,
      width,
      crestY,
      mix(palette.grass[2], palette.haze, 0.45),
      crestY * 0.06,
      drift,
      41,
      0.35,
    );
    const haze = ctx.createLinearGradient(0, crestY - height * 0.12, 0, crestY);
    haze.addColorStop(0, withOpacity(palette.haze, 0));
    haze.addColorStop(1, withOpacity(palette.haze, palette.fog * 0.8));
    ctx.fillStyle = haze;
    ctx.fillRect(0, crestY - height * 0.12, width, height * 0.12 + 2);
  }

  private drawRoad(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    viewport: Viewport,
    layout: ChaseLayout,
    curve: number,
    across: (metres: number) => number,
    roadPosition: (depth: number) => number,
  ) {
    const { palette, road } = frame;
    const depths: number[] = [];
    for (let depth = layout.crestDepth; depth > 1.4; depth /= 1.045) depths.push(depth);
    depths.push(1.4);
    const rows: RoadRow[] = depths.map((depth) => {
      const position = roadPosition(depth);
      const { left, right } = sliceAt(road, position);
      return { depth, position, left: left * LANE_METRES, right: right * LANE_METRES };
    });
    const crestY = layout.project(layout.crestDepth, across(0), 0, curve).y;

    // Big shapes first, each drawn once, so no seams show between strips.
    ctx.fillStyle = palette.grass[0];
    ctx.fillRect(0, crestY, viewport.width, viewport.height - crestY);
    const outline = (inner: (row: RoadRow) => number, outer: (row: RoadRow) => number) => {
      ctx.beginPath();
      rows.forEach((row, index) => {
        const point = layout.project(row.depth, across(inner(row)), 0, curve);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      for (const row of [...rows].reverse()) {
        const point = layout.project(row.depth, across(outer(row)), 0, curve);
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
      ctx.fill();
    };
    const strip = (
      far: (typeof rows)[number],
      near: (typeof rows)[number],
      farInner: number,
      farOuter: number,
      nearInner: number,
      nearOuter: number,
    ) => {
      const a = layout.project(far.depth, across(farInner), 0, curve);
      const b = layout.project(far.depth, across(farOuter), 0, curve);
      const c = layout.project(near.depth, across(nearOuter), 0, curve);
      const d = layout.project(near.depth, across(nearInner), 0, curve);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    };

    this.drawFields(ctx, frame, rows, (depth, metres) =>
      layout.project(depth, across(metres), 0, curve),
    );

    // Bands of light across the land, rushing past like mown stripes.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    for (let index = 0; index < rows.length - 1; index++) {
      const far = rows[index] as (typeof rows)[number];
      const near = rows[index + 1] as (typeof rows)[number];
      if (Math.floor(near.position / (BAND * 2)) % 2 !== 0) continue;
      const top = layout.project(far.depth, 0, 0, curve).y;
      const bottom = layout.project(near.depth, 0, 0, curve).y;
      ctx.fillRect(0, top, viewport.width, bottom - top);
    }

    ctx.fillStyle = palette.verge;
    outline(
      (row) => row.left - 1.1,
      (row) => row.right + 1.1,
    );
    ctx.fillStyle = palette.asphalt;
    outline(
      (row) => row.left,
      (row) => row.right,
    );

    const dash = mix(palette.dash, '#ffffff', frame.beatPulse * 0.6);
    for (let index = 0; index < rows.length - 1; index++) {
      const far = rows[index] as (typeof rows)[number];
      const near = rows[index + 1] as (typeof rows)[number];
      const band = Math.floor(near.position / BAND) % 2 === 0;
      if (band) {
        ctx.fillStyle = palette.asphaltLight;
        ctx.globalAlpha = 0.5;
        strip(far, near, far.left, far.right, near.left, near.right);
        ctx.globalAlpha = 1;
        // Lane dashes on every other band; they flash on the beat.
        ctx.fillStyle = dash;
        for (const lateral of sliceAt(road, near.position).dividers) {
          const x = lateral * LANE_METRES;
          strip(far, near, x - 0.08, x + 0.08, x - 0.08, x + 0.08);
        }
      }
      for (const patch of road.mud) {
        if (near.position >= patch.to || far.position < patch.from) continue;
        ctx.fillStyle = palette.mud;
        for (const lane of patch.lanes) {
          const x = laneLateral(lane) * LANE_METRES;
          const wobble = 0.3 * Math.sin(near.position * 1.7 + lane);
          strip(far, near, x - 1.3 + wobble, x + 1.3, x - 1.3 + wobble, x + 1.3);
        }
      }
      const finish = road.finish;
      if (finish !== null && finish >= near.position && finish < far.position) {
        const cells = 10;
        const width = near.right - near.left;
        for (let cell = 0; cell < cells; cell++) {
          const from = near.left + (cell * width) / cells;
          const to = from + width / cells;
          ctx.fillStyle = cell % 2 === 0 ? '#ffffff' : '#1d1a20';
          strip(far, near, from, to, from, to);
        }
      }
    }
    this.paintLaneEnds(ctx, frame, layout, curve, across, rows);
    ctx.fillStyle = palette.edgeLine;
    outline(
      (row) => row.left,
      (row) => row.left + 0.18,
    );
    outline(
      (row) => row.right - 0.18,
      (row) => row.right,
    );

    // Distance fades into the haze.
    const bottom = layout.project(layout.carDepth, 0, 0, curve).y;
    const haze = ctx.createLinearGradient(0, crestY, 0, bottom);
    haze.addColorStop(0, withOpacity(palette.haze, palette.fog * 0.7));
    haze.addColorStop(0.5, withOpacity(palette.haze, palette.fog * 0.12));
    haze.addColorStop(1, withOpacity(palette.haze, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, crestY, viewport.width, bottom - crestY);

    // The crest: a lighter lip where the road tips over the top.
    const crest = sliceAt(road, frame.nose + layout.sightAhead);
    const lipLeft = layout.project(
      layout.crestDepth,
      across(crest.left * LANE_METRES - 1.2),
      0,
      curve,
    );
    const lipRight = layout.project(
      layout.crestDepth,
      across(crest.right * LANE_METRES + 1.2),
      0,
      curve,
    );
    ctx.strokeStyle = mix(palette.verge, '#ffffff', 0.3);
    ctx.lineWidth = Math.max(1, lipLeft.scale * 0.2);
    ctx.beginPath();
    ctx.moveTo(lipLeft.x, lipLeft.y);
    ctx.lineTo(lipRight.x, lipRight.y);
    ctx.stroke();

    if (frame.commitGap !== null) {
      const depth = layout.depthOf(frame.commitGap);
      const edges = sliceAt(road, frame.nose + frame.commitGap);
      const left = layout.project(depth, across(edges.left * LANE_METRES), 0, curve);
      const right = layout.project(depth, across(edges.right * LANE_METRES), 0, curve);
      ctx.save();
      ctx.setLineDash([left.scale * 0.6, left.scale * 0.4]);
      ctx.strokeStyle = '#ff5e8a';
      ctx.lineWidth = Math.max(2, left.scale * 0.2);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
      ctx.restore();
    }
    if (frame.dropLane !== null) {
      // Where the next donkey drops in: a marker hanging over its lane on the crest.
      const lane = laneLateral(frame.dropLane) * LANE_METRES;
      const tip = layout.project(layout.crestDepth, across(lane), 0.4, curve);
      const size = Math.max(7, tip.scale * 0.7);
      ctx.fillStyle = 'rgba(255, 94, 138, 0.85)';
      ctx.beginPath();
      ctx.moveTo(tip.x - size, tip.y - size * 1.3);
      ctx.lineTo(tip.x + size, tip.y - size * 1.3);
      ctx.lineTo(tip.x, tip.y);
      ctx.fill();
    }
  }

  /**
   * Farmland either side, parcel by parcel as in the other views, with crop
   * rows running off towards the crest. Each run of one parcel is a single
   * shape, so no seams show where the road's rows meet.
   */
  private drawFields(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    rows: readonly RoadRow[],
    point: (depth: number, metres: number) => { x: number; y: number },
  ) {
    const edge = (row: RoadRow, side: -1 | 1) => (side < 0 ? row.left : row.right);
    const band = (run: readonly RoadRow[], side: -1 | 1, inner: number, outer: number) => {
      ctx.beginPath();
      run.forEach((row, index) => {
        const { x, y } = point(row.depth, edge(row, side) + side * inner);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (const row of [...run].reverse()) {
        const { x, y } = point(row.depth, edge(row, side) + side * outer);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    };
    for (const side of [-1, 1] as const) {
      for (const { parcel, run } of parcelRuns(frame.palette, rows, side)) {
        ctx.fillStyle = parcel.colour;
        band(run, side, 1.1, FIELD_REACH);
        if (parcel.kind !== 'crop' && parcel.kind !== 'plough') continue;
        ctx.fillStyle = parcel.texture;
        for (let furrow = 1; furrow <= FURROWS; furrow++) {
          const offset = 1.1 + furrow * FURROW_SPACING;
          band(run, side, offset, offset + FURROW_SPACING * 0.35);
        }
      }
    }
  }

  private collectScenery(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: ChaseLayout,
    curve: number,
    across: (metres: number) => number,
    sprites: Sprite[],
  ) {
    const { palette, road } = frame;
    const behind = frame.nose + layout.gapAt(1.6);
    const crest = frame.nose + layout.sightAhead;
    const place = (position: number, offsetFromEdge: number, side: -1 | 1) => {
      const depth = layout.depthOf(position - frame.nose);
      const { left, right } = sliceAt(road, position);
      const metres = (side < 0 ? left : right) * LANE_METRES + side * offsetFromEdge;
      return { depth, point: layout.project(depth, across(metres), 0, curve) };
    };
    for (const prop of propsBetween(palette, behind, crest, 40, 3)) {
      const { depth, point } = place(prop.along, 2 + prop.offset, prop.side);
      if (depth < layout.carDepth + 1.5) continue;
      if (point.x < -point.scale * 12 || point.x > layout.width + point.scale * 12) continue;
      sprites.push({
        depth,
        draw: () => {
          const fade = fadeFor(depth, layout, frame.palette);
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.translate(point.x, point.y);
          ctx.scale(point.scale, point.scale);
          groundShadow(ctx, palette, PROP_HEIGHT[prop.kind] * 0.3);
          drawProp(ctx, prop.kind, {
            palette,
            variant: prop.variant,
            time: frame.time,
            simple: point.scale < 8,
          });
          ctx.restore();
        },
      });
    }
    for (const position of polesBetween(palette, behind, crest)) {
      const { depth, point } = place(position, 2.4, -1);
      if (depth < layout.carDepth + 1.5) continue;
      sprites.push({
        depth,
        draw: () => {
          ctx.save();
          ctx.translate(point.x, point.y);
          ctx.scale(point.scale, point.scale);
          drawPole(ctx, palette);
          ctx.restore();
        },
      });
    }
    for (const side of [-1, 1] as const) {
      for (let position = Math.ceil(behind / 2.5) * 2.5; position < crest; position += 2.5) {
        if (!hasFence(palette, position, side)) continue;
        const { depth, point } = place(position, 1.2, side);
        const next = place(position + 2.5, 1.2, side);
        if (depth < 1.6) continue;
        sprites.push({
          depth,
          draw: () => {
            ctx.fillStyle = palette.fence;
            const post = Math.max(1, point.scale * 0.14);
            ctx.fillRect(point.x - post / 2, point.y - point.scale * 1.1, post, point.scale * 1.1);
            ctx.strokeStyle = palette.fence;
            ctx.lineWidth = Math.max(1, point.scale * 0.08);
            for (const rail of [0.95, 0.55]) {
              ctx.beginPath();
              ctx.moveTo(point.x, point.y - point.scale * rail);
              ctx.lineTo(next.point.x, next.point.y - next.point.scale * rail);
              ctx.stroke();
            }
          },
        });
      }
    }
    for (const sign of road.signs) {
      if (sign.at > crest || sign.at < behind) continue;
      const { depth, point } = place(sign.at, 0.8, 1);
      sprites.push({
        depth,
        draw: () => {
          ctx.save();
          ctx.translate(point.x, point.y);
          ctx.scale(point.scale, point.scale);
          drawSign(ctx, sign.kind);
          ctx.restore();
        },
      });
    }
  }

  private collectHazards(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: ChaseLayout,
    curve: number,
    across: (metres: number) => number,
    sprites: Sprite[],
  ) {
    for (const hazard of frame.hazards) {
      if (hazard.gap > layout.sightAhead + 0.01) continue;
      const middle =
        hazard.kind === 'donkey'
          ? DONKEY_DEPTH / 2
          : hazard.kind === 'barrier'
            ? BARRIER_DEPTH / 2
            : 0.25;
      const depth = layout.depthOf(hazard.gap + middle);
      // Past the car's bumper a donkey would loom huge over the camera.
      if (depth < layout.carDepth - 0.5) continue;
      const point = layout.project(depth, across(hazard.lateral * LANE_METRES), 0, curve);
      sprites.push({
        depth,
        draw: () => {
          ctx.save();
          ctx.translate(point.x, point.y);
          ctx.scale(point.scale, point.scale);
          if (hazard.kind === 'carrot') {
            groundShadow(ctx, frame.palette, 0.25);
            ctx.scale(1.6, 1.6);
            drawCarrot(ctx, frame.time, hazard.seed);
          } else if (hazard.kind === 'barrier') {
            groundShadow(ctx, frame.palette, 1.2);
            drawBarrier(ctx, frame.time);
          } else {
            drawDonkeyShadow(ctx, frame.palette.shadow);
            drawChaseDonkey(ctx, hazard, frame, point.scale < 14);
          }
          ctx.restore();
        },
      });
    }
  }

  /** The cones and the "lane ends" sign of a lane that is ending, as upright things on the road. */
  private collectLaneEnds(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: ChaseLayout,
    curve: number,
    across: (metres: number) => number,
    sprites: Sprite[],
  ) {
    const { road } = frame;
    const behind = frame.nose + layout.gapAt(layout.carDepth);
    const crest = frame.nose + layout.sightAhead;
    const stand = (along: number, metres: number, draw: () => void) => {
      const depth = layout.depthOf(along - frame.nose);
      if (along > crest || depth < layout.carDepth - 0.5) return;
      const point = layout.project(depth, across(metres), 0, curve);
      sprites.push({
        depth,
        draw: () => {
          ctx.save();
          ctx.translate(point.x, point.y);
          ctx.scale(point.scale, point.scale);
          draw();
          ctx.restore();
        },
      });
    };
    for (const end of laneEndsBetween(road, behind, crest)) {
      for (const cone of conesOf(end)) {
        stand(cone.along, cone.lateral * LANE_METRES, () => drawCone(ctx));
      }
      const sign = laneEndsSign(road, end);
      const edges = sliceAt(road, sign.along);
      const metres = (sign.side < 0 ? edges.left : edges.right) * LANE_METRES + sign.side * 0.9;
      stand(sign.along, metres, () => drawLaneEndsSign(ctx, end.merge));
    }
  }

  /** Chevrons and merge arrows painted down a lane that is ending, from the car to the crest. */
  private paintLaneEnds(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: ChaseLayout,
    curve: number,
    across: (metres: number) => number,
    rows: readonly RoadRow[],
  ) {
    const nearest = rows.at(-1)?.position ?? frame.nose;
    const crest = frame.nose + layout.sightAhead;
    const paint = (shape: Shape) => {
      if (shape.some(([along]) => along > crest || along < nearest)) return;
      ctx.beginPath();
      shape.forEach(([along, metres], index) => {
        const point = layout.project(layout.depthOf(along - frame.nose), across(metres), 0, curve);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.fill();
    };
    for (const end of laneEndsBetween(frame.road, nearest, crest)) {
      ctx.fillStyle = withAlpha(LANE_END_PAINT, 0.85);
      for (const along of chevronsOf(end)) paint(chevronShape(end, along));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      for (const along of mergeArrowsOf(end)) paint(mergeArrowShape(end, along));
    }
  }

  private drawCar(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: ChaseLayout,
    car: CarFrame,
    rearDepth: number,
    curve: number,
    metres: number,
  ) {
    // Reaching the top, the car races away over the crest.
    const depth = rearDepth + summitProgress(frame) * (layout.crestDepth - rearDepth + 6);
    const rear = layout.project(depth, metres, 0, curve);
    ctx.save();
    ctx.globalAlpha = ghostAlpha(car, frame);
    if (car.driver !== null) {
      // Each Rival driver's car sits in a pool of its own colour.
      ctx.fillStyle = withAlpha(DRIVER_COLOURS[car.driver], 0.5);
      ctx.beginPath();
      ctx.ellipse(rear.x, rear.y, rear.scale * 1.5, rear.scale * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = frame.palette.shadow;
    ctx.beginPath();
    ctx.ellipse(rear.x, rear.y, rear.scale * 1.15, rear.scale * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(rear.x, rear.y - (car.hop + car.bounce) * rear.scale);
    ctx.scale(rear.scale, rear.scale);
    drawCarRear(ctx, {
      shape: car.look.shape,
      paint: car.look.paint,
      lean: car.lean,
      daylight: frame.palette.daylight,
      stuck: car.stuck,
      time: frame.time,
      braking: car.shifting < 0,
    });
    ctx.restore();
  }

  /**
   * Riding Ahead, a car sees less of the road: a bracket in its colour runs
   * up both sides of its lane from its nose to the crest, where donkeys come
   * over the top, so the shorter stretch is plain to see.
   */
  private drawSightMarks(
    ctx: CanvasRenderingContext2D,
    layout: ChaseLayout,
    car: CarFrame,
    curve: number,
    across: (metres: number) => number,
  ) {
    if (car.driver === null || car.ahead <= 0) return;
    const near = layout.depthOf(car.ahead);
    const middle = car.lateral * LANE_METRES;
    const half = LANE_METRES * 0.46;
    const edge = (side: -1 | 1, inset = 0) =>
      Array.from({ length: 13 }, (_, index) => {
        const depth = near + ((layout.crestDepth - near) * index) / 12;
        return layout.project(depth, across(middle + side * (half - inset)), 0, curve);
      });
    const [left, right] = [edge(-1), edge(1)];
    ctx.save();
    ctx.globalAlpha = Math.min(1, car.ahead / AHEAD_DISTANCE);
    ctx.fillStyle = withAlpha(DRIVER_COLOURS[car.driver], 0.12);
    ctx.beginPath();
    [...left, ...right.reverse()].forEach((point, index) =>
      index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
    );
    ctx.fill();
    ctx.strokeStyle = withAlpha(DRIVER_COLOURS[car.driver], 0.9);
    ctx.lineJoin = 'round';
    for (const side of [-1, 1] as const) {
      const points = edge(side);
      const tick = edge(side, LANE_METRES * 0.16).at(-1) as { x: number; y: number };
      ctx.lineWidth = Math.max(2, (points[0]?.scale ?? 0) * 0.12);
      ctx.beginPath();
      points.forEach((point, index) =>
        index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
      );
      ctx.lineTo(tick.x, tick.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawNight(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    viewport: Viewport,
    layout: ChaseLayout,
    across: (metres: number) => number,
  ) {
    const dark = 1 - frame.palette.daylight;
    if (dark <= 0.35) return;
    // Headlights only once it is properly dark, not in a misty or golden dusk.
    const lights = dark > 0.6;
    ctx.save();
    ctx.fillStyle = `rgba(6, 8, 26, ${(dark - 0.35) * 0.5})`;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    if (lights) {
      ctx.globalCompositeOperation = 'lighter';
      const curve = bendOf(frame.road, frame.nose, layout.sightAhead);
      for (const car of frame.cars) {
        // The beams leave the road just over the car's roof, so they seem to come from it.
        const roof = layout.carBox(0, car.ahead).y;
        const metres = across(car.lateral * LANE_METRES);
        let near = layout.depthOf(car.ahead - CAR_LENGTH);
        let far = layout.crestDepth;
        for (let step = 0; step < 16; step++) {
          const middle = (near + far) / 2;
          if (layout.project(middle, metres, 0, curve).y > roof) near = middle;
          else far = middle;
        }
        const start = layout.project(far, metres, 0, curve);
        const end = layout.project(layout.noseDepth + 26, metres, 0, curve);
        const beam = ctx.createLinearGradient(0, start.y, 0, end.y);
        beam.addColorStop(0, 'rgba(255, 238, 180, 0)');
        beam.addColorStop(0.15, 'rgba(255, 238, 180, 0.09)');
        beam.addColorStop(1, 'rgba(255, 238, 180, 0)');
        ctx.fillStyle = beam;
        // Nested cones of faint light add up to a soft-edged beam.
        for (const width of [1.5, 2.3, 3.1, 3.9]) {
          const spread = layout.project(layout.noseDepth + 26, metres + width, 0, curve);
          ctx.beginPath();
          ctx.moveTo(start.x - start.scale * width * 0.3, start.y);
          ctx.lineTo(end.x - (spread.x - end.x), end.y);
          ctx.lineTo(spread.x, end.y);
          ctx.lineTo(start.x + start.scale * width * 0.3, start.y);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  private drawCrash(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    crash: CrashFrame,
    viewport: Viewport,
    layout: ChaseLayout,
    across: (metres: number) => number,
  ) {
    const carMetres = across(crash.carLateral * LANE_METRES);
    const rear = layout.project(layout.depthOf(crash.carAhead - CAR_LENGTH), carMetres);
    const carBox: Box = {
      x: rear.x - rear.scale * 1.05,
      y: rear.y - rear.scale * 1.7,
      width: rear.scale * 2.1,
      height: rear.scale * 1.7,
    };
    const donkeyDepth = layout.depthOf(crash.carAhead) + 1.2;
    const foot = layout.project(donkeyDepth, across(crash.donkeyLateral * LANE_METRES));
    const donkeyBox: Box = {
      x: foot.x - foot.scale * DONKEY_LENGTH * 0.55,
      y: foot.y - foot.scale * DONKEY_HEIGHT,
      width: foot.scale * DONKEY_LENGTH * 1.1,
      height: foot.scale * DONKEY_HEIGHT,
    };
    const donkey: HazardFrame = {
      id: -1,
      kind: 'donkey',
      role: 'single',
      gap: 0,
      lateral: crash.donkeyLateral,
      hop: 0,
      committed: true,
      age: 1,
      startled: 1,
      dazed: false,
      dizzy: false,
      facing: crash.donkeyFacing,
      seed: crash.donkeySeed,
      hat: crash.donkeyHat,
    };
    drawCrash(
      ctx,
      crash.age,
      viewport,
      {
        box: carBox,
        draw: (context) => {
          context.save();
          context.translate(rear.x, rear.y);
          context.scale(rear.scale, rear.scale);
          drawCarRear(context, {
            shape: crash.look.shape,
            paint: crash.look.paint,
            lean: 0,
            daylight: frame.palette.daylight,
            stuck: false,
            time: frame.time,
          });
          context.restore();
        },
      },
      {
        box:
          crash.obstacle === 'donkey'
            ? donkeyBox
            : {
                x: foot.x - foot.scale * 1.6,
                y: foot.y - foot.scale * 1.5,
                width: foot.scale * 3.2,
                height: foot.scale * 1.5,
              },
        draw: (context, wobble = 0) => {
          context.save();
          context.translate(foot.x, foot.y);
          context.scale(foot.scale, foot.scale);
          if (crash.obstacle === 'barrier') drawBarrier(context, frame.time, wobble);
          else drawChaseDonkey(context, donkey, frame, false);
          context.restore();
        },
      },
      frame.reducedMotion,
      crash.obstacle,
    );
  }
}

function drawChaseDonkey(
  ctx: CanvasRenderingContext2D,
  hazard: HazardFrame,
  frame: Frame,
  simple: boolean,
) {
  const rise = Math.sin(hazard.hop * Math.PI) * 0.7;
  // Coming over the crest, a donkey pops up rather than fading in.
  const popIn = frame.reducedMotion ? 1 : Math.min(1, 0.55 + hazard.age * 5);
  ctx.save();
  ctx.translate(0, -rise);
  ctx.scale(popIn, popIn);
  drawDonkey(ctx, {
    coat: coatFor(hazard.seed),
    facing: hazard.facing,
    time: frame.time,
    seed: hazard.seed,
    startled: hazard.startled,
    dazed: hazard.dazed,
    dizzy: hazard.dizzy,
    hop: hazard.hop,
    hat: hazard.hat,
    simple,
  });
  ctx.restore();
}

/** Splits the rows into runs that pass the same parcel; neighbouring runs share a row. */
function parcelRuns(palette: Palette, rows: readonly RoadRow[], side: -1 | 1) {
  const runs: { parcel: Parcel; run: RoadRow[] }[] = [];
  let current: { parcel: Parcel; run: RoadRow[] } | null = null;
  for (const row of rows) {
    const parcel = parcelBeside(palette, row.position, side);
    if (current && current.parcel.from === parcel.from) {
      current.run.push(row);
      continue;
    }
    // The old run reaches this row too, so the two meet without a gap.
    current?.run.push(row);
    current = { parcel, run: [row] };
    runs.push(current);
  }
  return runs;
}

/** How the road bends here: a slow, smooth wander left and right, for looks only. */
export function curveAt(position: number): number {
  return 0.0022 * Math.sin(position / 95) + 0.0011 * Math.sin(position / 41 + 1.3);
}

/** The most a shift of the road adds to the bend; with a third of the wander, never more than before. */
const SHIFT_BEND = 0.0022;

/**
 * The bend the Chase view draws: a third of the gentle wander, plus a curve
 * towards where the road is shifting. The open road's middle at the crest is
 * compared with where the car is, so the road swings over as soon as the new
 * lane comes into view, and straightens out once the car has followed it.
 */
export function bendOf(road: Road, nose: number, sightAhead: number): number {
  const shift = openMiddle(road, nose + sightAhead) - openMiddle(road, nose);
  return curveAt(nose) / 3 + Math.max(-1, Math.min(1, shift)) * SHIFT_BEND;
}

/** The middle of the lanes a car may stay in: the open ones, eased in as a new one widens. */
function openMiddle(road: Road, position: number): number {
  const closing = closingLaneAt(road, position);
  const { left, right } = edgesAt(road, position);
  // A closing lane is still paved but already on its way out: leave it out of the middle.
  if (closing === null) return (left + right) / 2;
  const layout = layoutAt(road, position);
  return laneLateral(layout.first) + (layout.count - 1) / 2;
}

function fadeFor(depth: number, layout: ChaseLayout, palette: Palette): number {
  return 1 - Math.min(1, depth / layout.crestDepth) * palette.fog * 0.35;
}

function groundShadow(ctx: CanvasRenderingContext2D, palette: Palette, radius: number) {
  ctx.fillStyle = palette.shadow;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.3, radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A jagged range of hills across the sky, standing on `baseY`. Returns its outline. */
function ridge(
  ctx: CanvasRenderingContext2D,
  width: number,
  baseY: number,
  colour: string,
  heightPx: number,
  offset: number,
  seed: number,
  roughness: number,
): Path2D {
  const outline = new Path2D();
  outline.moveTo(0, baseY + 2);
  const step = Math.max(8, width / 60);
  for (let x = 0; x <= width + step; x += step) {
    const u = (x + offset) / width;
    const shape =
      0.55 +
      0.3 * Math.sin(u * 5.1 + seed) +
      0.15 * Math.sin(u * 13.7 + seed * 2) +
      roughness * Math.sin(u * 41 + seed * 3);
    outline.lineTo(x, baseY - heightPx * Math.max(0.1, shape));
  }
  outline.lineTo(width, baseY + 2);
  outline.closePath();
  ctx.fillStyle = colour;
  ctx.fill(outline);
  return outline;
}

/** Whitens every part of a range above a ragged snow line. */
function snowCaps(
  ctx: CanvasRenderingContext2D,
  range: Path2D,
  width: number,
  snowLine: number,
  offset: number,
) {
  ctx.save();
  ctx.clip(range);
  ctx.fillStyle = 'rgba(248, 250, 255, 0.9)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, 0);
  const step = Math.max(6, width / 90);
  for (let x = width; x >= -step; x -= step) {
    const u = (x + offset) / width;
    const ragged = Math.sin(u * 97) * 0.5 + Math.sin(u * 211 + 1.7) * 0.5;
    ctx.lineTo(x, snowLine + ragged * step * 1.2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function withOpacity(colour: string, alpha: number): string {
  const value = Number.parseInt(colour.replace('#', ''), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
