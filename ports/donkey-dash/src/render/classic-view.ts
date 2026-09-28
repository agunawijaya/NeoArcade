import { CAR_LENGTH, DONKEY_DEPTH } from '../engine/constants';
import { halfWidthAt, lanesAt, lateralAt } from '../engine/road';
import { revealGap } from '../engine/sight';
import { drawCrash } from './crash';
import { drawParticle } from './effects';
import { mix, type Palette } from './palette';
import { parcelsBetween, type ParcelKind } from './fields';
import { hash, hasFence, polesBetween, propsBetween } from './scenery';
import { drawCarrot, drawChequers, drawSign } from './sprites/bits';
import { drawCarTop } from './sprites/car';
import { DONKEY_HEIGHT, DONKEY_LENGTH, drawDonkey, drawDonkeyShadow } from './sprites/donkey';
import { drawPole, drawProp, PROP_HEIGHT } from './sprites/props';
import {
  summitProgress,
  type Box,
  type Frame,
  type HazardFrame,
  type RoadView,
  type Viewport,
  type ViewLayout,
} from './view';
import { coatFor } from './palette';
import { drawWeather } from './weather';

/**
 * The Classic view: the road runs up the middle of the screen, as it did on
 * the CGA screen in 1981, with the car creeping upward as it dodges. Here it
 * is a little table-top diorama: fields on either side, soft shadows,
 * swaying grass, a hedge-row at the far end that donkeys trot out from.
 *
 * One metre is the same number of pixels along and across the road, so the
 * car and the donkeys keep their true proportions.
 */
export const LANE_METRES = 3.5;
/** Donkeys and props are upright cut-outs, drawn a touch squat as on a tilted table. */
const TILT = 0.82;
/** How much of a donkey rises above the sight line when it appears. */
const DONKEY_REACH = DONKEY_DEPTH / 2 + DONKEY_HEIGHT * TILT;
const ROAD_BEHIND = 1.2;

export interface ClassicLayout extends ViewLayout {
  scale: number;
  sightY: number;
  noseY: number;
  centreX: number;
  laneWidth: number;
  /** Screen y of a point `gap` metres ahead of the nose. */
  y(gap: number): number;
  x(lateral: number): number;
}

export function classicLayout(viewport: Viewport, climb: number): ClassicLayout {
  const { width, height, insetTop, insetBottom } = viewport;
  // A few pixels of air under the HUD, so a donkey never touches it.
  const available = Math.max(1, height - insetTop - insetBottom - 6);
  const span = DONKEY_REACH + revealGap(0) + CAR_LENGTH + ROAD_BEHIND;
  // Three lanes and their verges must fit across, whatever the shape of the screen.
  const scale = Math.min(available / span, (width - 20) / (3 * LANE_METRES + 2.2));
  const top = insetTop + 3 + (available - span * scale) / 2;
  const sightY = top + DONKEY_REACH * scale;
  const sightAhead = revealGap(climb);
  const noseY = sightY + sightAhead * scale;
  const centreX = width / 2;
  const laneWidth = LANE_METRES * scale;
  const y = (gap: number) => noseY - gap * scale;
  const x = (lateral: number) => centreX + lateral * laneWidth;
  return {
    scale,
    sightY,
    noseY,
    centreX,
    laneWidth,
    sightAhead,
    y,
    x,
    donkeyBox(gap, lateral): Box {
      const foot = y(gap + DONKEY_DEPTH / 2);
      const tall = DONKEY_HEIGHT * TILT * scale;
      const long = DONKEY_LENGTH * scale;
      return { x: x(lateral) - long / 2, y: foot - tall, width: long, height: tall };
    },
    carBox(lateral): Box {
      const wide = 1.9 * scale;
      return { x: x(lateral) - wide / 2, y: noseY, width: wide, height: CAR_LENGTH * scale };
    },
  };
}

interface Billboard {
  y: number;
  draw(): void;
}

export class ClassicView implements RoadView {
  readonly camera = 'classic' as const;

  layout(viewport: Viewport, climb: number): ClassicLayout {
    return classicLayout(viewport, climb);
  }

  draw(ctx: CanvasRenderingContext2D, frame: Frame, viewport: Viewport) {
    const layout = this.layout(viewport, frame.climb);
    const nearest = frame.nose - (viewport.height - layout.noseY) / layout.scale - 2;
    const farthest = frame.nose + layout.sightAhead + 4;

    this.drawGround(ctx, frame, viewport, layout, nearest, farthest);
    this.drawRoad(ctx, frame, layout, nearest, farthest);
    this.drawRoadMarks(ctx, frame, layout);

    const billboards: Billboard[] = [];
    this.collectScenery(ctx, frame, viewport, layout, nearest, farthest, billboards);
    this.collectHazards(ctx, frame, layout, billboards);
    if (!frame.crash) this.collectCar(ctx, frame, layout, billboards);
    billboards.sort((a, b) => a.y - b.y);
    for (const billboard of billboards) billboard.draw();

    for (const particle of frame.particles) {
      const lateral = particle.across / LANE_METRES;
      drawParticle(
        ctx,
        particle,
        layout.x(lateral),
        layout.y(particle.along - frame.nose) - particle.up * layout.scale * TILT,
        layout.scale,
      );
    }

    this.drawLight(ctx, frame, viewport);
    this.drawNight(ctx, frame, viewport, layout);
    this.drawHedgerow(ctx, frame, viewport, layout);
    drawWeather(ctx, frame, viewport);
    if (frame.crash) this.drawCrash(ctx, frame, viewport, layout);
  }

  private drawGround(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    viewport: Viewport,
    layout: ClassicLayout,
    nearest: number,
    farthest: number,
  ) {
    const { palette } = frame;
    ctx.fillStyle = palette.grass[0];
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    const sway = frame.reducedMotion ? 0 : Math.sin(frame.time * 1.7);
    for (const parcel of parcelsBetween(palette, nearest - 2, farthest + 40)) {
      const top = layout.y(parcel.to - frame.nose);
      const bottom = layout.y(parcel.from - frame.nose);
      const inner = layout.centreX + parcel.side * layout.scale;
      const outer = parcel.side > 0 ? viewport.width : 0;
      const left = Math.min(inner, outer);
      const width = Math.abs(outer - inner);
      ctx.fillStyle = parcel.colour;
      ctx.fillRect(left, top, width, bottom - top);
      drawParcelTexture(ctx, parcel.kind, parcel.texture, {
        left,
        width,
        top,
        bottom,
        scale: layout.scale,
        seed: Math.round(parcel.from) * 3 + parcel.side,
        sway,
      });
      if (parcel.hedge) {
        drawHedgeLine(ctx, palette, left, width, bottom, layout.scale, parcel.from);
      }
    }
  }

  private drawRoad(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: ClassicLayout,
    nearest: number,
    farthest: number,
  ) {
    const { palette, road } = frame;
    const steps: number[] = [];
    for (let along = nearest; along <= farthest + 30; along += 0.5) steps.push(along);
    const edge = (along: number, side: -1 | 1, extra: number) =>
      layout.centreX + side * (halfWidthAt(road, along) * layout.laneWidth + extra * layout.scale);
    const outline = (extra: number) => {
      ctx.beginPath();
      steps.forEach((along, index) => {
        const point = [edge(along, -1, extra), layout.y(along - frame.nose)] as const;
        if (index === 0) ctx.moveTo(...point);
        else ctx.lineTo(...point);
      });
      for (const along of [...steps].reverse())
        ctx.lineTo(edge(along, 1, extra), layout.y(along - frame.nose));
      ctx.closePath();
    };
    ctx.fillStyle = palette.verge;
    outline(1);
    ctx.fill();
    ctx.fillStyle = palette.shadow;
    outline(0.3);
    ctx.fill();
    ctx.fillStyle = palette.asphalt;
    outline(0);
    ctx.fill();
    // Edge lines.
    ctx.strokeStyle = palette.edgeLine;
    ctx.lineWidth = Math.max(1.5, layout.scale * 0.14);
    for (const side of [-1, 1] as const) {
      ctx.beginPath();
      steps.forEach((along, index) => {
        const x = edge(along, side, -0.25);
        const y = layout.y(along - frame.nose);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    // Lane dashes, scrolling; they flash gently on the beat.
    const dash = 3;
    ctx.fillStyle = mix(palette.dash, '#ffffff', frame.beatPulse * 0.6);
    for (
      let along = Math.floor(nearest / (dash * 2)) * dash * 2;
      along < farthest + 30;
      along += dash * 2
    ) {
      const lanes = lanesAt(road, along);
      for (let divider = 0; divider < lanes - 1; divider++) {
        const lateral = (lateralAt(road, along, divider) + lateralAt(road, along, divider + 1)) / 2;
        const top = layout.y(along + dash - frame.nose);
        const width = Math.max(2, layout.scale * 0.16);
        ctx.fillRect(layout.x(lateral) - width / 2, top, width, dash * layout.scale);
      }
    }
  }

  private drawRoadMarks(ctx: CanvasRenderingContext2D, frame: Frame, layout: ClassicLayout) {
    const { road, palette } = frame;
    for (const patch of road.mud) {
      for (const lane of patch.lanes) {
        for (let along = patch.from; along < patch.to; along += 2.2) {
          const lateral = lateralAt(road, along, lane);
          const x = layout.x(lateral);
          const y = layout.y(along - frame.nose);
          ctx.fillStyle = palette.mud;
          ctx.beginPath();
          ctx.ellipse(x, y, layout.laneWidth * 0.42, layout.scale * 1.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = palette.mudShine;
          ctx.beginPath();
          ctx.ellipse(
            x - layout.laneWidth * 0.12,
            y - layout.scale * 0.3,
            layout.laneWidth * 0.1,
            layout.scale * 0.2,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }
    if (road.finish !== null) {
      const gap = road.finish - frame.nose;
      if (gap < layout.sightAhead + 30 && gap > -20) {
        ctx.save();
        ctx.translate(layout.centreX, layout.y(gap));
        ctx.scale(layout.scale, layout.scale);
        drawChequers(ctx, halfWidthAt(road, road.finish) * 2 * LANE_METRES, 1.4);
        ctx.restore();
      }
    }
    if (frame.commitGap !== null) {
      const y = layout.y(frame.commitGap);
      const half = halfWidthAt(road, frame.nose + frame.commitGap) * layout.laneWidth;
      ctx.save();
      ctx.setLineDash([layout.scale * 0.6, layout.scale * 0.4]);
      ctx.lineDashOffset = -frame.time * layout.scale * 2;
      ctx.strokeStyle = '#ff5e8a';
      ctx.lineWidth = Math.max(2, layout.scale * 0.18);
      ctx.beginPath();
      ctx.moveTo(layout.centreX - half, y);
      ctx.lineTo(layout.centreX + half, y);
      ctx.stroke();
      ctx.restore();
    }
    if (frame.dropLane !== null) {
      const x = layout.x(lateralAt(road, frame.nose + layout.sightAhead, frame.dropLane));
      ctx.fillStyle = 'rgba(255, 94, 138, 0.75)';
      ctx.beginPath();
      ctx.moveTo(x - layout.scale * 0.6, layout.sightY - layout.scale * 0.2);
      ctx.lineTo(x + layout.scale * 0.6, layout.sightY - layout.scale * 0.2);
      ctx.lineTo(x, layout.sightY + layout.scale * 0.7);
      ctx.fill();
    }
  }

  private collectScenery(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    viewport: Viewport,
    layout: ClassicLayout,
    nearest: number,
    farthest: number,
    billboards: Billboard[],
  ) {
    const { palette, road } = frame;
    const reach = viewport.width / 2 / layout.scale;
    const hidden = farthest - 1.5;
    for (const prop of propsBetween(palette, nearest - 6, hidden, reach, 2.4)) {
      const roadEdge = halfWidthAt(road, prop.along) * LANE_METRES;
      const across = prop.side * (roadEdge + 1.2 + prop.offset);
      const x = layout.centreX + across * layout.scale;
      if (Math.abs(across) > reach + 6) continue;
      const y = layout.y(prop.along - frame.nose);
      billboards.push({
        y,
        draw: () => {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(layout.scale, layout.scale * TILT);
          shadow(ctx, palette, PROP_HEIGHT[prop.kind] * 0.35);
          drawProp(ctx, prop.kind, {
            palette,
            variant: prop.variant,
            time: frame.time,
            simple: layout.scale < 12,
          });
          ctx.restore();
        },
      });
    }
    for (const along of polesBetween(palette, nearest - 10, hidden)) {
      const x = layout.centreX - (halfWidthAt(road, along) * LANE_METRES + 2.2) * layout.scale;
      const y = layout.y(along - frame.nose);
      billboards.push({
        y,
        draw: () => {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(layout.scale, layout.scale * TILT);
          drawPole(ctx, palette);
          ctx.restore();
        },
      });
    }
    // Fences: posts and two rails along the verge.
    for (const side of [-1, 1] as const) {
      for (let along = Math.floor(nearest / 2.5) * 2.5; along < hidden; along += 2.5) {
        if (!hasFence(palette, along, side)) continue;
        const x =
          layout.centreX + side * (halfWidthAt(road, along) * LANE_METRES + 1.1) * layout.scale;
        const y = layout.y(along - frame.nose);
        const next = layout.y(along + 2.5 - frame.nose);
        billboards.push({
          y,
          draw: () => {
            ctx.fillStyle = palette.fence;
            const post = Math.max(1, layout.scale * 0.14);
            ctx.fillRect(
              x - post / 2,
              y - layout.scale * 1.1 * TILT,
              post,
              layout.scale * 1.1 * TILT,
            );
            ctx.fillRect(x - post / 4, next - layout.scale * 0.95 * TILT, post / 2, y - next);
          },
        });
      }
    }
  }

  private collectHazards(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: ClassicLayout,
    billboards: Billboard[],
  ) {
    const { palette } = frame;
    for (const hazard of frame.hazards) {
      if (hazard.gap > layout.sightAhead + 0.01) continue;
      const x = layout.x(hazard.lateral);
      const y = layout.y(hazard.gap + (hazard.kind === 'donkey' ? DONKEY_DEPTH / 2 : 0.25));
      billboards.push({
        y,
        draw: () => {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(layout.scale, layout.scale * TILT);
          if (hazard.kind === 'carrot') {
            shadow(ctx, palette, 0.25);
            drawCarrot(ctx, frame.time, hazard.seed);
          } else {
            drawDonkeyShadow(ctx, palette.shadow);
            drawDonkeySprite(ctx, hazard, frame, layout.scale < 12);
          }
          ctx.restore();
        },
      });
    }
    for (const sign of frame.road.signs) {
      const gap = sign.at - frame.nose;
      if (gap > layout.sightAhead || gap < -20) continue;
      const x = layout.x(halfWidthAt(frame.road, sign.at) + 0.35);
      const y = layout.y(gap);
      billboards.push({
        y,
        draw: () => {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(layout.scale, layout.scale * TILT);
          drawSign(ctx, sign.kind);
          ctx.restore();
        },
      });
    }
  }

  private collectCar(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: ClassicLayout,
    billboards: Billboard[],
  ) {
    const { car } = frame;
    const centreY = layout.noseY + (CAR_LENGTH / 2) * layout.scale;
    billboards.push({
      y: layout.noseY + CAR_LENGTH * layout.scale,
      draw: () => {
        if (car.ghost && Math.floor(frame.time * 12) % 2 === 0) return;
        const x = layout.x(car.lateral);
        // Reaching the top, the car sails off the far end of the road.
        const summit = summitProgress(frame) * (layout.noseY + CAR_LENGTH * layout.scale * 2);
        const lift = (car.hop + car.bounce) * layout.scale + summit;
        ctx.save();
        ctx.fillStyle = frame.palette.shadow;
        ctx.beginPath();
        // The shadow stays on the road through a hop, but drives off with the car.
        ctx.ellipse(
          x + layout.scale * 0.35,
          centreY + layout.scale * 0.3 - summit,
          layout.scale * 1.05,
          layout.scale * 2.3,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.translate(x, centreY - lift);
        ctx.scale(layout.scale, layout.scale);
        drawCarTop(ctx, {
          shape: car.look.shape,
          paint: car.look.paint,
          lean: car.lean,
          daylight: frame.palette.daylight,
          stuck: car.stuck,
          time: frame.time,
        });
        ctx.restore();
      },
    });
  }

  private drawNight(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    viewport: Viewport,
    layout: ClassicLayout,
  ) {
    const dark = 1 - frame.palette.daylight;
    if (dark <= 0.35) return;
    // Headlights only once it is properly dark, not in a misty or golden dusk.
    const lights = dark > 0.6;
    ctx.save();
    ctx.fillStyle = `rgba(8, 10, 30, ${(dark - 0.35) * 0.55})`;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    if (lights && !frame.crash) {
      ctx.globalCompositeOperation = 'lighter';
      const x = layout.x(frame.car.lateral);
      const beam = ctx.createRadialGradient(
        x,
        layout.noseY,
        layout.scale,
        x,
        layout.noseY - layout.scale * 10,
        layout.scale * 11,
      );
      beam.addColorStop(0, 'rgba(255, 238, 180, 0.1)');
      beam.addColorStop(1, 'rgba(255, 238, 180, 0)');
      ctx.fillStyle = beam;
      // Nested cones of faint light add up to a soft-edged beam.
      for (const spread of [1.6, 2.4, 3.2, 4]) {
        ctx.beginPath();
        ctx.moveTo(x - layout.scale * spread * 0.3, layout.noseY);
        ctx.lineTo(x - layout.scale * spread, layout.noseY - layout.scale * 14);
        ctx.lineTo(x + layout.scale * spread, layout.noseY - layout.scale * 14);
        ctx.lineTo(x + layout.scale * spread * 0.3, layout.noseY);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * The far end of the diorama: tree-tops that hide the road beyond the sight
   * line. In the desert, a tumble of red boulders does the same job.
   */
  private drawHedgerow(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    viewport: Viewport,
    layout: ClassicLayout,
  ) {
    const { palette } = frame;
    const edge = layout.sightY - DONKEY_DEPTH * layout.scale;
    const unit = layout.scale * 0.9;
    const [back, middle, front, highlight] =
      palette.look === 'desert'
        ? [palette.rock, palette.rock, mix(palette.rock, '#ffffff', 0.12), palette.crop]
        : [palette.foliage[0], palette.foliage[0], palette.foliage[1], palette.foliage[2]];
    ctx.fillStyle = mix(back, '#000000', 0.35);
    ctx.fillRect(0, 0, viewport.width, Math.max(0, edge - unit));
    // Three layers of clumps, darkest at the back, sunlit on top.
    const layers: [string, number, number][] = [
      [mix(back, '#000000', 0.3), 1.25, 0.2],
      [mix(middle, '#000000', palette.look === 'desert' ? 0.12 : 0), 1.0, 0.75],
      [front, 0.7, 1.25],
    ];
    layers.forEach(([colour, size, lift], layer) => {
      ctx.fillStyle = colour;
      for (let index = -1; index * unit * 1.3 < viewport.width + unit * 2; index++) {
        const roll = hash(index * 3 + layer * 101);
        const x = index * unit * 1.3 + roll * unit * 0.6;
        const radius = unit * size * (0.75 + roll * 0.5);
        ctx.beginPath();
        ctx.arc(x, edge - unit * lift - roll * unit * 0.3, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.fillStyle = mix(highlight, '#ffffff', 0.15);
    ctx.globalAlpha = 0.5;
    for (let index = 0; index * unit * 2.1 < viewport.width; index++) {
      const roll = hash(index * 7 + 5);
      ctx.beginPath();
      ctx.arc(index * unit * 2.1 + roll * unit, edge - unit * 1.7, unit * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Its shadow falls across the road below.
    const shade = ctx.createLinearGradient(0, edge, 0, edge + layout.scale * 1.6);
    shade.addColorStop(0, palette.shadow);
    shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, edge, viewport.width, layout.scale * 1.6);
  }

  /** Golden-hour light: a warm glow from the sun's side of the sky. */
  private drawLight(ctx: CanvasRenderingContext2D, frame: Frame, viewport: Viewport) {
    const { palette } = frame;
    if (palette.daylight <= 0) return;
    const x = viewport.width * palette.sun.x;
    const y = -viewport.height * 0.2;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, viewport.height * 1.3);
    glow.addColorStop(0, palette.sun.glow);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    ctx.restore();
  }

  private drawCrash(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    viewport: Viewport,
    layout: ClassicLayout,
  ) {
    const crash = frame.crash;
    if (!crash) return;
    const car = frame.car;
    const carBox = layout.carBox(crash.carLateral);
    const donkeyBox = layout.donkeyBox(0, crash.donkeyLateral);
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
          context.translate(carBox.x + carBox.width / 2, carBox.y + carBox.height / 2);
          context.scale(layout.scale, layout.scale);
          drawCarTop(context, {
            shape: car.look.shape,
            paint: car.look.paint,
            lean: 0,
            daylight: frame.palette.daylight,
            stuck: false,
            time: frame.time,
          });
          context.restore();
        },
      },
      {
        box: donkeyBox,
        draw: (context) => {
          context.save();
          context.translate(donkeyBox.x + donkeyBox.width / 2, donkeyBox.y + donkeyBox.height);
          context.scale(layout.scale, layout.scale * TILT);
          drawDonkeySprite(context, donkey, frame, false);
          context.restore();
        },
      },
      frame.reducedMotion,
    );
  }
}

function drawDonkeySprite(
  ctx: CanvasRenderingContext2D,
  hazard: HazardFrame,
  frame: Frame,
  simple: boolean,
) {
  const rise = Math.sin(hazard.hop * Math.PI) * 0.6;
  const popIn = frame.reducedMotion ? 1 : Math.min(1, 0.6 + hazard.age * 5);
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

function shadow(ctx: CanvasRenderingContext2D, palette: Palette, radius: number) {
  ctx.fillStyle = palette.shadow;
  ctx.beginPath();
  ctx.ellipse(radius * 0.4, 0, radius * 1.3, radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
}

interface ParcelArea {
  left: number;
  width: number;
  top: number;
  bottom: number;
  scale: number;
  seed: number;
  sway: number;
}

/** Rows of crops, furrows, wildflowers or tufts of grass, seen from above. */
function drawParcelTexture(
  ctx: CanvasRenderingContext2D,
  kind: ParcelKind,
  colour: string,
  area: ParcelArea,
) {
  const { left, width, top, bottom, scale, seed, sway } = area;
  const height = bottom - top;
  if (height <= 0 || width <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  switch (kind) {
    case 'crop':
    case 'plough': {
      const spacing = scale * (kind === 'crop' ? 1.1 : 0.8);
      ctx.fillStyle = colour;
      ctx.globalAlpha = kind === 'crop' ? 0.4 : 0.5;
      for (let x = left + spacing * 0.3; x < left + width; x += spacing) {
        ctx.fillRect(x, top, spacing * 0.36, height);
      }
      break;
    }
    case 'meadow':
      for (let index = 0; index < (width * height) / (scale * scale * 5); index++) {
        const x = left + hash(seed * 131 + index) * width;
        const y = top + hash(seed * 71 + index * 3) * height;
        ctx.fillStyle = index % 3 === 0 ? '#ffffff' : colour;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, scale * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'pasture':
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(1, scale * 0.05);
      ctx.lineCap = 'round';
      for (let index = 0; index < (width * height) / (scale * scale * 2.2); index++) {
        const x = left + hash(seed * 97 + index) * width;
        const y = top + hash(seed * 53 + index * 5) * height;
        const tall = scale * (0.22 + hash(index + seed) * 0.18);
        for (const lean of [-0.5, 0, 0.5]) {
          ctx.beginPath();
          ctx.moveTo(x + lean * tall * 0.3, y);
          ctx.lineTo(x + lean * tall * 0.7 + sway * tall * 0.2, y - tall);
          ctx.stroke();
        }
      }
      break;
  }
  ctx.restore();
}

/** A hedge along the edge between two parcels. */
function drawHedgeLine(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  left: number,
  width: number,
  y: number,
  scale: number,
  seed: number,
) {
  const radius = scale * 0.45;
  ctx.fillStyle = palette.shadow;
  ctx.fillRect(left, y, width, radius * 0.9);
  for (let x = left; x < left + width + radius; x += radius * 1.2) {
    const roll = hash(Math.round(x) + seed * 13);
    ctx.fillStyle = roll < 0.5 ? palette.foliage[0] : palette.foliage[1];
    ctx.beginPath();
    ctx.arc(x, y - radius * 0.3, radius * (0.8 + roll * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
}
