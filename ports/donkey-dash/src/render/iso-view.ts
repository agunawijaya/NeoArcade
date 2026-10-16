import { CAR_LENGTH, DONKEY_DEPTH } from '../engine/constants';
import { AHEAD_DISTANCE } from '../engine/rival';
import { laneLateral, LANE_POSITIONS } from '../engine/road';
import { revealGap } from '../engine/sight';
import { drawCrash } from './crash';
import { drawParticle } from './effects';
import { parcelsBetween } from './fields';
import {
  drawIsoCar,
  drawIsoDonkey,
  iso,
  isoBox,
  isoDepth,
  isoFlat,
  isoShadow,
  shaded,
  type IsoProjection,
} from './iso';
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
import { coatFor, DRIVER_COLOURS, mix, withAlpha, type Palette, type PropKind } from './palette';
import { hash, hasFence, polesBetween, propsBetween } from './scenery';
import { drawCarrot, drawDriverTag, drawLaneEndsSign, drawSign } from './sprites/bits';
import {
  ghostAlpha,
  summitProgress,
  type Box,
  type CarFrame,
  type CrashFrame,
  type Frame,
  type RoadView,
  type Viewport,
  type ViewLayout,
} from './view';
import { drawWeather } from './weather';

/**
 * The Isometric view: the road as a little model world seen at 2:1, running
 * from the bottom left up to the top right. Blocky trees, fences, farm
 * buildings, hay bales, a windmill and the odd river bridge; the car and the
 * donkeys as chunky block figures with soft contact shadows.
 *
 * The car stays put in the lower left. Donkeys appear where the road leaves
 * the screen, which is exactly the sight line; the view stretches distance
 * ahead so that line lands on the edge of any screen, but not beside or
 * behind the car, where donkeys pass it at true scale. Only low things stand
 * on the viewer's side of the road, so nothing can hide a lane. The camera
 * stays over the lane band, so a shifting road visibly snakes across the
 * model world.
 */
export interface IsoLayout extends ViewLayout {
  viewport: Viewport;
  projection: IsoProjection;
  /** Metres along the diorama per metre of road ahead. */
  stretch: number;
  /**
   * Metres along the diorama for a gap from the nose. Only the road ahead is
   * stretched; alongside and behind the car, which is drawn at the length the
   * engine counts, a metre is a metre, so a donkey has passed the car exactly
   * when it looks it. With two cars that holds up to AHEAD_DISTANCE, beside a
   * car riding Ahead too.
   */
  along(gap: number): number;
  /** Where the nose is on screen. */
  nose: { x: number; y: number };
  width: number;
  height: number;
}

const DONKEY_TALL = 1.95;
/** How much road the iso donkey covers, standing across it (see drawIsoDonkey). */
const ISO_DONKEY_DEPTH = 0.5;

export function isoLayout(viewport: Viewport, climb: number, twoCars = false): IsoLayout {
  const { width, height, insetTop, insetBottom } = viewport;
  const portrait = height > width;
  const unit = Math.max(9, Math.min(34, Math.min(width, height * 1.3) / (portrait ? 26 : 38)));
  // Far enough in that the whole car, tail and all, stays on screen in either lane.
  const nose = {
    x: Math.max(width * (portrait ? 0.2 : 0.3), unit * 7.6 + 8),
    y: height - insetBottom - Math.max(unit * 5, height * (portrait ? 0.3 : 0.24)),
  };
  const projection: IsoProjection = { originX: nose.x, originY: nose.y, unit };
  const sightAhead = revealGap(climb);
  const trueAhead = twoCars ? AHEAD_DISTANCE : 0;
  const alongFor = (stretch: number) => (gap: number) =>
    gap <= trueAhead ? gap : trueAhead + (gap - trueAhead) * stretch;
  const boxAt = (stretch: number, gap: number, lateral: number): Box => {
    const foot = iso(projection, alongFor(stretch)(gap + DONKEY_DEPTH / 2), lateral * LANE_METRES);
    return {
      x: foot.x - unit * 1.3,
      y: foot.y - unit * DONKEY_TALL * 1.25,
      width: unit * 2.6,
      height: unit * (DONKEY_TALL * 1.25 + 0.9),
    };
  };
  // The longest reach at which a donkey on the sight line, in any lane, is whole on screen.
  const outermost = laneLateral(LANE_POSITIONS - 1);
  const fits = (stretch: number) =>
    [-outermost, outermost].every((lateral) => {
      const box = boxAt(stretch, sightAhead, lateral);
      return box.x + box.width <= width - 2 && box.y >= insetTop + 2;
    });
  // How far along the diorama the sight line may stand, and the stretch that puts it there.
  const stretchFor = (reach: number) => (reach - trueAhead) / (sightAhead - trueAhead);
  let low = trueAhead + 1;
  let high = (width + height) / unit;
  for (let step = 0; step < 32; step++) {
    const middle = (low + high) / 2;
    if (fits(stretchFor(middle))) low = middle;
    else high = middle;
  }
  const stretch = stretchFor(low);
  return {
    viewport,
    projection,
    stretch,
    along: alongFor(stretch),
    nose,
    width,
    height,
    sightAhead,
    donkeyBox: (gap, lateral) => boxAt(stretch, gap, lateral),
    carBox(lateral, ahead = 0) {
      const front = iso(projection, alongFor(stretch)(ahead), lateral * LANE_METRES);
      return {
        x: front.x - unit * 5.2,
        y: front.y - unit * 2.4,
        width: unit * 6.2,
        height: unit * 4.6,
      };
    },
  };
}

interface Piece {
  depth: number;
  draw(): void;
}

/** How far the ground slab reaches either side of the road, metres. */
const SLAB = 26;
/** Tall things stand only on the far side of the road; the near side stays low. */
const LOW_PROPS = new Set<PropKind>(['bush', 'hay', 'rock', 'flowers', 'snowman']);

export class IsoView implements RoadView {
  readonly camera = 'iso' as const;

  layout(viewport: Viewport, climb: number, twoCars = false): IsoLayout {
    return isoLayout(viewport, climb, twoCars);
  }

  draw(ctx: CanvasRenderingContext2D, frame: Frame, viewport: Viewport) {
    const layout = this.layout(viewport, frame.climb, frame.twoCars);
    const { projection, stretch } = layout;
    const { palette } = frame;
    const u = (position: number) => layout.along(position - frame.nose);
    const behind = frame.nose - (projection.originX + projection.unit * 40) / projection.unit;
    const ahead = frame.nose + (viewport.width * 1.2) / (projection.unit * stretch);

    this.drawBackground(ctx, frame, viewport);
    this.drawSlab(ctx, frame, layout, behind, ahead, u);
    this.drawRoad(ctx, frame, layout, behind, ahead, u);
    for (const car of frame.cars) this.drawSightMarks(ctx, layout, car);

    const pieces: Piece[] = [];
    this.collectScenery(ctx, frame, layout, behind, ahead, u, pieces);
    for (const hazard of frame.hazards) {
      if (hazard.gap > layout.sightAhead + 0.01) continue;
      // A donkey stands across the road, thinner than the stretch of road it
      // blocks: it is drawn in the middle of that stretch, as the other views do.
      const along = layout.along(
        hazard.kind === 'donkey' ? hazard.gap + (DONKEY_DEPTH - ISO_DONKEY_DEPTH) / 2 : hazard.gap,
      );
      const across = hazard.lateral * LANE_METRES;
      pieces.push({
        depth: isoDepth(along, across),
        draw: () => {
          if (hazard.kind === 'barrier') {
            drawIsoBarrier(ctx, projection, along, across, frame.time, 0);
            return;
          }
          if (hazard.kind === 'carrot') {
            isoShadow(ctx, projection, along + 0.2, across, 0.3, palette.shadow);
            const point = iso(projection, along + 0.2, across);
            ctx.save();
            ctx.translate(point.x, point.y);
            ctx.scale(projection.unit * 1.5, projection.unit * 1.5);
            drawCarrot(ctx, frame.time, hazard.seed);
            ctx.restore();
            return;
          }
          isoShadow(ctx, projection, along + 0.25, across, 0.85, palette.shadow);
          const popIn = frame.reducedMotion ? 1 : Math.min(1, 0.5 + hazard.age * 6);
          const scaled = { ...projection, unit: projection.unit * popIn };
          const base = iso(projection, along, across);
          const shifted = iso(scaled, along, across);
          drawIsoDonkey(
            ctx,
            {
              ...scaled,
              originX: scaled.originX + base.x - shifted.x,
              originY: scaled.originY + base.y - shifted.y,
            },
            along,
            across,
            {
              coat: coatFor(hazard.seed),
              facing: hazard.facing,
              time: frame.time,
              seed: hazard.seed,
              startled: hazard.startled,
              dazed: hazard.dazed,
              hop: hazard.hop,
              hat: hazard.hat,
            },
          );
        },
      });
    }
    this.collectLaneEnds(ctx, frame, layout, u, pieces);
    for (const car of frame.cars) this.collectCar(ctx, frame, layout, car, pieces);
    pieces.sort((a, b) => a.depth - b.depth);
    for (const piece of pieces) piece.draw();

    for (const particle of frame.particles) {
      const point = iso(
        projection,
        layout.along(particle.along - frame.nose),
        particle.across,
        particle.up,
      );
      drawParticle(ctx, particle, point.x, point.y, projection.unit);
    }
    drawSunlight(ctx, frame, viewport);
    this.drawNight(ctx, frame, viewport, layout);
    this.drawTags(ctx, frame, layout);
    drawWeather(ctx, frame, viewport);
    for (const crash of frame.crashes) this.drawCrash(ctx, frame, crash, viewport, layout);
  }

  private collectCar(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: IsoLayout,
    car: CarFrame,
    pieces: Piece[],
  ) {
    const { projection } = layout;
    const { palette } = frame;
    const across = car.lateral * LANE_METRES;
    const nose = layout.along(car.ahead);
    pieces.push({
      depth: isoDepth(nose - CAR_LENGTH / 2, across),
      draw: () => {
        // Reaching the top, the car zooms off up the road.
        const ahead = nose + summitProgress(frame) * layout.stretch * layout.sightAhead * 1.4;
        ctx.save();
        ctx.globalAlpha = ghostAlpha(car, frame);
        if (car.driver !== null) {
          // Each Rival driver's car sits in a pool of its own colour.
          isoShadow(
            ctx,
            projection,
            ahead - CAR_LENGTH / 2,
            across,
            2.7,
            withAlpha(DRIVER_COLOURS[car.driver], 0.5),
          );
        }
        isoShadow(ctx, projection, ahead - CAR_LENGTH / 2, across, 2.2, palette.shadow);
        drawIsoCar(ctx, projection, ahead, across, car.hop + car.bounce, {
          // As long as the engine counts it, so it is clear of a donkey exactly when it looks it.
          shape: { ...car.look.shape, length: CAR_LENGTH },
          paint: car.look.paint,
          daylight: palette.daylight,
          lean: car.lean,
          braking: car.shifting < 0,
        });
        ctx.restore();
      },
    });
  }

  /**
   * Riding Ahead, a car sees less of the road: a bracket in its colour runs
   * up both sides of its lane from its nose to the sight line, where donkeys
   * step out, so the shorter stretch is plain to see.
   */
  private drawSightMarks(ctx: CanvasRenderingContext2D, layout: IsoLayout, car: CarFrame) {
    if (car.driver === null || car.ahead <= 0) return;
    const { projection } = layout;
    const near = layout.along(car.ahead);
    const far = layout.along(layout.sightAhead);
    const middle = car.lateral * LANE_METRES;
    const half = LANE_METRES * 0.46;
    const corners = [
      iso(projection, near, middle - half),
      iso(projection, far, middle - half),
      iso(projection, far, middle + half),
      iso(projection, near, middle + half),
    ];
    ctx.save();
    ctx.globalAlpha = Math.min(1, car.ahead / AHEAD_DISTANCE);
    ctx.fillStyle = withAlpha(DRIVER_COLOURS[car.driver], 0.12);
    ctx.beginPath();
    corners.forEach((point, index) =>
      index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
    );
    ctx.fill();
    ctx.strokeStyle = withAlpha(DRIVER_COLOURS[car.driver], 0.9);
    ctx.lineWidth = Math.max(2, projection.unit * 0.14);
    ctx.lineJoin = 'round';
    for (const side of [-1, 1]) {
      const from = iso(projection, near, middle + side * half);
      const corner = iso(projection, far, middle + side * half);
      const tick = iso(projection, far, middle + side * (half - LANE_METRES * 0.16));
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(corner.x, corner.y);
      ctx.lineTo(tick.x, tick.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The cones and the "lane ends" sign of a lane that is ending, up to the sight line. */
  private collectLaneEnds(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: IsoLayout,
    u: (position: number) => number,
    pieces: Piece[],
  ) {
    const { projection } = layout;
    const { road } = frame;
    const sight = frame.nose + layout.sightAhead;
    for (const end of laneEndsBetween(road, frame.nose - 20, sight)) {
      for (const cone of conesOf(end)) {
        if (cone.along > sight) continue;
        const along = u(cone.along);
        const across = cone.lateral * LANE_METRES;
        pieces.push({
          depth: isoDepth(along, across),
          draw: () => drawIsoCone(ctx, projection, along, across),
        });
      }
      const sign = laneEndsSign(road, end);
      if (sign.along > sight) continue;
      const edges = sliceAt(road, sign.along);
      const along = u(sign.along);
      const across = (sign.side < 0 ? edges.left : edges.right) * LANE_METRES + sign.side * 1.2;
      pieces.push({
        depth: isoDepth(along, across),
        draw: () => {
          const point = iso(projection, along, across);
          ctx.save();
          ctx.translate(point.x, point.y);
          ctx.scale(projection.unit * 1.2, projection.unit * 1.2);
          drawLaneEndsSign(ctx, end.merge);
          ctx.restore();
        },
      });
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D, frame: Frame, viewport: Viewport) {
    const { palette } = frame;
    const sky = ctx.createLinearGradient(0, 0, viewport.width, viewport.height);
    sky.addColorStop(0, palette.sky[1]);
    sky.addColorStop(1, palette.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  }

  /** The ground as a thick slab, with parcels on top and soil showing along its near edge. */
  private drawSlab(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: IsoLayout,
    behind: number,
    ahead: number,
    u: (position: number) => number,
  ) {
    const { projection } = layout;
    const { palette } = frame;
    const from = u(behind);
    const to = u(ahead);
    // Soil under the near edge: layers of earth, like a slice of cake.
    const soil = [
      mix(palette.verge, '#000000', 0.25),
      mix(palette.mud, '#000000', 0.1),
      palette.mud,
    ];
    soil.forEach((colour, layer) => {
      ctx.fillStyle = colour;
      const top = -layer * 1.2;
      const a = iso(projection, from, SLAB, top);
      const b = iso(projection, to, SLAB, top);
      const c = iso(projection, to, SLAB, top - 1.2);
      const d = iso(projection, from, SLAB, top - 1.2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    });
    isoFlat(
      ctx,
      projection,
      [
        [from, -SLAB * 2],
        [to, -SLAB * 2],
        [to, SLAB],
        [from, SLAB],
      ],
      palette.grass[0],
    );
    for (const parcel of parcelsBetween(palette, behind, ahead)) {
      const near = parcel.side > 0;
      const inner = near ? 5.5 : -5.5;
      const outer = near ? SLAB : -SLAB * 2;
      isoFlat(
        ctx,
        projection,
        [
          [u(parcel.from), inner],
          [u(parcel.to), inner],
          [u(parcel.to), outer],
          [u(parcel.from), outer],
        ],
        parcel.colour,
      );
      if (parcel.kind === 'crop' || parcel.kind === 'plough') {
        ctx.globalAlpha = 0.4;
        for (let row = inner; near ? row < outer : row > outer; row += near ? 1.2 : -1.2) {
          isoFlat(
            ctx,
            projection,
            [
              [u(parcel.from), row],
              [u(parcel.to), row],
              [u(parcel.to), row + 0.4],
              [u(parcel.from), row + 0.4],
            ],
            parcel.texture,
          );
        }
        ctx.globalAlpha = 1;
      }
    }
    // Rivers cross the road now and then, under a little bridge.
    for (const river of riversBetween(behind, ahead)) {
      isoFlat(
        ctx,
        projection,
        [
          [u(river), -SLAB * 2],
          [u(river + 5), -SLAB * 2],
          [u(river + 5), SLAB],
          [u(river), SLAB],
        ],
        '#4f95c9',
      );
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = Math.max(1, projection.unit * 0.08);
      for (let ripple = 0; ripple < 8; ripple++) {
        const across = -SLAB + ripple * 6 + ((frame.time * 1.5) % 6);
        const a = iso(projection, u(river + 1.5), across);
        const b = iso(projection, u(river + 3.5), across + 1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  private drawRoad(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: IsoLayout,
    behind: number,
    ahead: number,
    u: (position: number) => number,
  ) {
    const { projection } = layout;
    const { palette, road } = frame;
    const steps: number[] = [];
    for (let position = behind; position <= ahead; position += 1) steps.push(position);
    const band = (
      inner: (position: number) => number,
      outer: (position: number) => number,
      colour: string,
    ) => {
      const corners: [number, number][] = [
        ...steps.map((position) => [u(position), inner(position)] as [number, number]),
        ...[...steps]
          .reverse()
          .map((position) => [u(position), outer(position)] as [number, number]),
      ];
      isoFlat(ctx, projection, corners, colour);
    };
    const left = (position: number) => sliceAt(road, position).left * LANE_METRES;
    const right = (position: number) => sliceAt(road, position).right * LANE_METRES;
    band(
      (position) => left(position) - 1,
      (position) => right(position) + 1,
      palette.verge,
    );
    band(left, right, palette.asphalt);
    band(left, (position) => left(position) + 0.2, palette.edgeLine);
    band((position) => right(position) - 0.2, right, palette.edgeLine);

    for (const river of riversBetween(behind, ahead)) {
      // The bridge deck and its rails.
      isoFlat(
        ctx,
        projection,
        [
          [u(river), left(river) - 0.6],
          [u(river + 5), left(river) - 0.6],
          [u(river + 5), right(river) + 0.6],
          [u(river), right(river) + 0.6],
        ],
        mix(palette.fence, '#000000', 0.1),
        0.05,
      );
      for (const rail of [left(river) - 0.6, right(river) + 0.6]) {
        isoBox(
          ctx,
          projection,
          u(river),
          rail - 0.15,
          0,
          u(river + 5) - u(river),
          0.3,
          0.9,
          shaded(palette.fence),
        );
      }
    }

    const dash = mix(palette.dash, '#ffffff', frame.beatPulse * 0.6);
    for (let position = Math.floor(behind / 4) * 4; position < ahead; position += 4) {
      for (const lateral of sliceAt(road, position).dividers) {
        const middle = lateral * LANE_METRES;
        isoFlat(
          ctx,
          projection,
          [
            [u(position), middle - 0.1],
            [u(position + 2), middle - 0.1],
            [u(position + 2), middle + 0.1],
            [u(position), middle + 0.1],
          ],
          dash,
        );
      }
    }
    for (const patch of road.mud) {
      if (patch.to < behind || patch.from > ahead) continue;
      for (const lane of patch.lanes) {
        const middle = laneLateral(lane) * LANE_METRES;
        isoFlat(
          ctx,
          projection,
          [
            [u(patch.from), middle - 1.4],
            [u(patch.to), middle - 1.2],
            [u(patch.to), middle + 1.3],
            [u(patch.from), middle + 1.4],
          ],
          palette.mud,
        );
      }
    }
    this.paintLaneEnds(ctx, frame, layout, u);
    if (road.finish !== null && road.finish > behind && road.finish < ahead) {
      const cells = 8;
      const width = right(road.finish) - left(road.finish);
      for (let cell = 0; cell < cells; cell++) {
        const from = left(road.finish) + (cell * width) / cells;
        isoFlat(
          ctx,
          projection,
          [
            [u(road.finish), from],
            [u(road.finish + 1.2), from],
            [u(road.finish + 1.2), from + width / cells],
            [u(road.finish), from + width / cells],
          ],
          cell % 2 === 0 ? '#ffffff' : '#1d1a20',
        );
      }
    }
    if (frame.commitGap !== null) {
      const along = frame.commitGap * layout.stretch;
      const at = frame.nose + frame.commitGap;
      ctx.save();
      ctx.setLineDash([projection.unit * 0.6, projection.unit * 0.4]);
      ctx.strokeStyle = '#ff5e8a';
      ctx.lineWidth = Math.max(2, projection.unit * 0.2);
      const a = iso(projection, along, left(at));
      const b = iso(projection, along, right(at));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
    if (frame.dropLane !== null) {
      // Where the next donkey drops in: a chevron painted at the far end of the road.
      const along = layout.sightAhead * layout.stretch;
      const lane = laneLateral(frame.dropLane) * LANE_METRES;
      isoFlat(
        ctx,
        projection,
        [
          [along, lane - 0.9],
          [along, lane + 0.9],
          [along - 1.4, lane],
        ],
        'rgba(255, 94, 138, 0.8)',
      );
    }
  }

  private collectScenery(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: IsoLayout,
    behind: number,
    ahead: number,
    u: (position: number) => number,
    pieces: Piece[],
  ) {
    const { projection } = layout;
    const { palette, road } = frame;
    const rivers = riversBetween(behind - 10, ahead + 10);
    const onRiver = (position: number) =>
      rivers.some((river) => position > river - 2 && position < river + 7);
    // Spaced by the resting stretch, so props stay put while a duel's climb changes it.
    const spacing = 3.4 / isoLayout(layout.viewport, 0).stretch;
    for (const prop of propsBetween(palette, behind, ahead, SLAB - 6, spacing)) {
      if (onRiver(prop.along)) continue;
      const near = prop.side > 0;
      const kind: PropKind =
        near && !LOW_PROPS.has(prop.kind) ? lowFor(palette, prop.variant) : prop.kind;
      const across =
        edgeOf(road, prop.along, prop.side) + prop.side * (2 + prop.offset * (near ? 0.6 : 1));
      const along = u(prop.along);
      pieces.push({
        depth: isoDepth(along, across),
        draw: () =>
          drawIsoProp(ctx, projection, along, across, kind, prop.variant, palette, frame.time),
      });
    }
    for (const position of polesBetween(palette, behind, ahead)) {
      const along = u(position);
      const across = edgeOf(road, position, -1) - 2.5;
      pieces.push({
        depth: isoDepth(along, across),
        draw: () => {
          isoBox(ctx, projection, along, across, 0, 0.25, 0.25, 7, shaded(palette.trunk));
          isoBox(ctx, projection, along, across - 0.9, 6.4, 0.2, 2, 0.18, shaded(palette.trunk));
        },
      });
    }
    for (const side of [-1, 1] as const) {
      for (let position = Math.ceil(behind / 2.5) * 2.5; position < ahead; position += 2.5) {
        if (!hasFence(palette, position, side) || onRiver(position)) continue;
        const along = u(position);
        const across = edgeOf(road, position, side) + side * 1.4;
        const next = u(position + 2.5);
        pieces.push({
          depth: isoDepth(along, across),
          draw: () => {
            isoBox(ctx, projection, along, across, 0, 0.18, 0.18, 1, shaded(palette.fence));
            isoBox(
              ctx,
              projection,
              along,
              across + 0.04,
              0.7,
              next - along,
              0.1,
              0.12,
              shaded(palette.fence),
            );
          },
        });
      }
    }
    for (const sign of road.signs) {
      if (sign.at < behind || sign.at > ahead) continue;
      const along = u(sign.at);
      const across = edgeOf(road, sign.at, -1) - 1.2;
      pieces.push({
        depth: isoDepth(along, across),
        draw: () => {
          const point = iso(projection, along, across);
          ctx.save();
          ctx.translate(point.x, point.y);
          ctx.scale(projection.unit * 1.2, projection.unit * 1.2);
          drawSign(ctx, sign.kind);
          ctx.restore();
        },
      });
    }
  }

  private drawNight(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    viewport: Viewport,
    layout: IsoLayout,
  ) {
    const dark = 1 - frame.palette.daylight;
    if (dark <= 0.35) return;
    // Headlights only once it is properly dark, not in a misty or golden dusk.
    const lights = dark > 0.6;
    ctx.save();
    ctx.fillStyle = `rgba(6, 8, 26, ${(dark - 0.35) * 0.55})`;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    if (lights) {
      ctx.globalCompositeOperation = 'lighter';
      for (const car of frame.cars) {
        const across = car.lateral * LANE_METRES;
        const nose = layout.along(car.ahead);
        // The beams reach the sight line and no further: a car Ahead lights less road.
        const far = layout.along(layout.sightAhead);
        const corners = [
          iso(layout.projection, nose, across - 0.8),
          iso(layout.projection, far, across - 2.6),
          iso(layout.projection, far, across + 2.6),
          iso(layout.projection, nose, across + 0.8),
        ];
        const start = corners[0] as { x: number; y: number };
        const end = corners[1] as { x: number; y: number };
        const beam = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
        beam.addColorStop(0, 'rgba(255, 238, 180, 0.32)');
        beam.addColorStop(1, 'rgba(255, 238, 180, 0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        corners.forEach((point, index) =>
          index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Rival Driver's labels, floating over each car's roof, over the night so nothing hides them. */
  private drawTags(ctx: CanvasRenderingContext2D, frame: Frame, layout: IsoLayout) {
    const { projection } = layout;
    for (const car of frame.cars) {
      if (car.tag === null || car.driver === null) continue;
      const { shape } = car.look;
      const above = car.hop + car.bounce + 0.3 + shape.height + shape.cabinHeight + 0.6;
      const along = layout.along(car.ahead) - CAR_LENGTH / 2;
      const point = iso(projection, along, car.lateral * LANE_METRES, above);
      const height = Math.max(11, Math.min(18, projection.unit * 0.55));
      drawDriverTag(ctx, car.tag, DRIVER_COLOURS[car.driver], point.x, point.y, height);
    }
  }

  /** Chevrons and merge arrows painted down a lane that is ending, up to the sight line. */
  private paintLaneEnds(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    layout: IsoLayout,
    u: (position: number) => number,
  ) {
    const sight = frame.nose + layout.sightAhead;
    const paint = (shape: Shape, colour: string) => {
      if (shape.some(([along]) => along > sight)) return;
      isoFlat(
        ctx,
        layout.projection,
        shape.map(([along, across]) => [u(along), across] as const),
        colour,
      );
    };
    for (const end of laneEndsBetween(frame.road, frame.nose - 30, sight)) {
      for (const along of chevronsOf(end)) {
        paint(chevronShape(end, along), withAlpha(LANE_END_PAINT, 0.85));
      }
      for (const along of mergeArrowsOf(end)) {
        paint(mergeArrowShape(end, along), 'rgba(255, 255, 255, 0.85)');
      }
    }
  }

  private drawCrash(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    crash: CrashFrame,
    viewport: Viewport,
    layout: IsoLayout,
  ) {
    const { projection } = layout;
    const carAcross = crash.carLateral * LANE_METRES;
    const donkeyAcross = crash.donkeyLateral * LANE_METRES;
    const nose = layout.along(crash.carAhead);
    const carBox: Box = layout.carBox(crash.carLateral, crash.carAhead);
    const donkeyBox: Box = layout.donkeyBox(crash.carAhead, crash.donkeyLateral);
    drawCrash(
      ctx,
      crash.age,
      viewport,
      {
        box: carBox,
        draw: (context) =>
          drawIsoCar(context, projection, nose, carAcross, 0, {
            shape: { ...crash.look.shape, length: CAR_LENGTH },
            paint: crash.look.paint,
            daylight: frame.palette.daylight,
            lean: 0,
          }),
      },
      {
        box: donkeyBox,
        draw: (context, wobble = 0) => {
          if (crash.obstacle === 'barrier') {
            drawIsoBarrier(context, projection, nose + 0.4, donkeyAcross, frame.time, wobble);
            return;
          }
          drawIsoDonkey(context, projection, nose + 0.4, donkeyAcross, {
            coat: coatFor(crash.donkeySeed),
            facing: crash.donkeyFacing,
            time: frame.time,
            seed: crash.donkeySeed,
            startled: 1,
            dazed: false,
            hop: 0,
            hat: crash.donkeyHat,
          });
        },
      },
      frame.reducedMotion,
      crash.obstacle,
    );
  }
}

/** Golden-hour light from the sun's side of the sky. */
function drawSunlight(ctx: CanvasRenderingContext2D, frame: Frame, viewport: Viewport) {
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

/** Metres from the middle of the lane band to the road's edge on one side. */
function edgeOf(road: Frame['road'], position: number, side: -1 | 1): number {
  const { left, right } = sliceAt(road, position);
  return (side < 0 ? left : right) * LANE_METRES;
}

/** A traffic cone as three stacked blocks, with its white band. */
function drawIsoCone(
  ctx: CanvasRenderingContext2D,
  projection: IsoProjection,
  u: number,
  v: number,
) {
  isoBox(ctx, projection, u - 0.25, v - 0.25, 0, 0.5, 0.5, 0.08, shaded('#3a3640'));
  isoBox(ctx, projection, u - 0.17, v - 0.17, 0.08, 0.34, 0.34, 0.22, shaded('#ff7a1f'));
  isoBox(ctx, projection, u - 0.13, v - 0.13, 0.3, 0.26, 0.26, 0.12, shaded('#ffffff'));
  isoBox(ctx, projection, u - 0.09, v - 0.09, 0.42, 0.18, 0.18, 0.2, shaded('#ff7a1f'));
}

/**
 * The barrier across an ending lane: two posts, a red and white board in
 * blocks, a blinking lamp on each post, and cones in front. `wobble` (metres)
 * rocks the board after a hit.
 */
function drawIsoBarrier(
  ctx: CanvasRenderingContext2D,
  projection: IsoProjection,
  u: number,
  v: number,
  time: number,
  wobble: number,
) {
  const lean = wobble * 3;
  for (const offset of [-1.25, 1.25]) {
    isoBox(ctx, projection, u - 0.08, v + offset - 0.08, 0, 0.16, 0.16, 1.3, shaded('#4a4650'));
  }
  const blocks = 6;
  for (let block = 0; block < blocks; block++) {
    const from = v - 1.5 + (block * 3) / blocks;
    const colour = block % 2 === 0 ? '#e8364f' : '#ffffff';
    isoBox(ctx, projection, u - 0.06 + lean, from, 0.75, 0.12, 3 / blocks, 0.45, shaded(colour));
  }
  const on = Math.floor(time * 2.5) % 2 === 0;
  for (const [index, offset] of [-1.25, 1.25].entries()) {
    const lit = on === (index === 0);
    isoBox(
      ctx,
      projection,
      u - 0.1 + lean,
      v + offset - 0.1,
      1.3,
      0.2,
      0.2,
      0.2,
      shaded(lit ? '#ffcf33' : '#9a7a2a'),
    );
  }
  for (const offset of [-0.85, 0, 0.85]) drawIsoCone(ctx, projection, u - 0.5, v + offset);
}

/** Every 260 m or so a river crosses the road. */
function riversBetween(from: number, to: number): number[] {
  const rivers: number[] = [];
  for (let index = Math.floor(from / 260); index * 260 < to; index++) {
    if (hash(index + 4242) < 0.6) rivers.push(index * 260 + 120 + hash(index) * 60);
  }
  return rivers.filter((river) => river > from - 10 && river < to + 10);
}

function lowFor(palette: Palette, variant: number): PropKind {
  const low = palette.props.filter((kind) => LOW_PROPS.has(kind));
  return low[Math.floor(variant * low.length)] ?? 'bush';
}

/** Roadside things as blocks. */
function drawIsoProp(
  ctx: CanvasRenderingContext2D,
  projection: IsoProjection,
  u: number,
  v: number,
  kind: PropKind,
  variant: number,
  palette: Palette,
  time: number,
) {
  const size = 0.8 + variant * 0.4;
  const leaf = (index: number) => shaded(palette.foliage[index % 3] as string);
  isoShadow(ctx, projection, u, v, 0.9 * size, palette.shadow);
  switch (kind) {
    case 'tree':
      isoBox(ctx, projection, u - 0.2, v - 0.2, 0, 0.4, 0.4, 2 * size, shaded(palette.trunk));
      isoBox(
        ctx,
        projection,
        u - 1.1 * size,
        v - 1.1 * size,
        1.8 * size,
        2.2 * size,
        2.2 * size,
        1.8 * size,
        leaf(0),
      );
      isoBox(
        ctx,
        projection,
        u - 0.7 * size,
        v - 0.7 * size,
        3.5 * size,
        1.4 * size,
        1.4 * size,
        1 * size,
        leaf(1),
      );
      break;
    case 'pine':
      isoBox(ctx, projection, u - 0.2, v - 0.2, 0, 0.4, 0.4, 1.2, shaded(palette.trunk));
      for (let tier = 0; tier < 3; tier++) {
        const w = (1.8 - tier * 0.5) * size;
        isoBox(
          ctx,
          projection,
          u - w / 2,
          v - w / 2,
          1 + tier * 1.3 * size,
          w,
          w,
          1.2 * size,
          leaf(tier === 2 && palette.look === 'snow' ? 2 : tier),
        );
      }
      break;
    case 'bush':
      isoBox(ctx, projection, u - 0.6, v - 0.6, 0, 1.2, 1.2, 0.8 * size, leaf(1));
      isoBox(ctx, projection, u - 0.3, v - 0.3, 0.8 * size, 0.6, 0.6, 0.3, leaf(2));
      break;
    case 'hay':
      isoBox(ctx, projection, u - 0.7, v - 0.5, 0, 1.4, 1, 1, shaded('#e0b54c'));
      break;
    case 'barn':
      isoBox(ctx, projection, u - 3, v - 4, 0, 6, 8, 4, shaded(palette.roof));
      isoBox(
        ctx,
        projection,
        u - 3.2,
        v - 4.2,
        4,
        6.4,
        8.4,
        1.6,
        shaded(mix(palette.roof, '#000000', 0.2)),
      );
      isoBox(ctx, projection, u - 3.01, v + 1, 0, 0.02, 2.2, 2.6, shaded(palette.wall));
      break;
    case 'windmill': {
      isoBox(ctx, projection, u - 1.2, v - 1.2, 0, 2.4, 2.4, 8, shaded(palette.wall));
      isoBox(ctx, projection, u - 1.4, v - 1.4, 8, 2.8, 2.8, 1.2, shaded(palette.roof));
      const hub = iso(projection, u - 1.4, v, 8.2);
      ctx.save();
      ctx.translate(hub.x, hub.y);
      ctx.rotate(time * 0.8 + variant * 6);
      ctx.fillStyle = '#f4eadc';
      for (let blade = 0; blade < 4; blade++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillRect(
          -projection.unit * 0.25,
          -projection.unit * 4,
          projection.unit * 0.5,
          projection.unit * 3.6,
        );
      }
      ctx.restore();
      break;
    }
    case 'cactus':
      isoBox(ctx, projection, u - 0.3, v - 0.3, 0, 0.6, 0.6, 3 * size, leaf(1));
      isoBox(ctx, projection, u - 0.2, v - 1.1, 1.2, 0.4, 0.8, 0.35, leaf(1));
      isoBox(ctx, projection, u - 0.2, v - 1.1, 1.2, 0.4, 0.35, 1.2, leaf(1));
      break;
    case 'rock':
      isoBox(ctx, projection, u - 0.8, v - 0.6, 0, 1.6, 1.2, 0.9 * size, shaded(palette.rock));
      isoBox(ctx, projection, u - 0.4, v - 0.3, 0.9 * size, 0.8, 0.6, 0.4, shaded(palette.rock));
      break;
    case 'mesa':
      isoBox(ctx, projection, u - 5, v - 6, 0, 10, 12, 7, shaded(palette.rock));
      break;
    case 'lamp':
      isoBox(ctx, projection, u - 0.1, v - 0.1, 0, 0.2, 0.2, 4, shaded('#3a3a44'));
      isoBox(
        ctx,
        projection,
        u - 0.3,
        v - 0.3,
        4,
        0.6,
        0.6,
        0.3,
        shaded(palette.daylight < 0.5 ? '#fff1b0' : '#d8d8d8'),
      );
      break;
    case 'snowman':
      isoBox(ctx, projection, u - 0.5, v - 0.5, 0, 1, 1, 0.9, shaded('#ffffff'));
      isoBox(ctx, projection, u - 0.35, v - 0.35, 0.9, 0.7, 0.7, 0.6, shaded('#ffffff'));
      isoBox(ctx, projection, u - 0.08, v + 0.3, 1.2, 0.16, 0.4, 0.1, shaded('#e8743a'));
      break;
    case 'flowers':
      for (let flower = 0; flower < 4; flower++) {
        isoBox(
          ctx,
          projection,
          u + flower * 0.3 - 0.5,
          v + (flower % 2) * 0.4,
          0,
          0.18,
          0.18,
          0.35,
          shaded(flower % 2 === 0 ? palette.accent : '#ffffff'),
        );
      }
      break;
    case 'fence':
    case 'pole':
      break;
  }
}
