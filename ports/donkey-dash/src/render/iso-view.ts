import { CAR_LENGTH, DONKEY_DEPTH } from '../engine/constants';
import { halfWidthAt, lanesAt, lateralAt } from '../engine/road';
import { revealGap } from '../engine/sight';
import { LANE_METRES } from './classic-view';
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
import { coatFor, mix, type Palette, type PropKind } from './palette';
import { hash, hasFence, polesBetween, propsBetween } from './scenery';
import { drawCarrot, drawSign } from './sprites/bits';
import {
  summitProgress,
  type Box,
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
 * ahead so that line lands on the edge of any screen. Only low things stand
 * on the viewer's side of the road, so nothing can hide a lane.
 */
export interface IsoLayout extends ViewLayout {
  viewport: Viewport;
  projection: IsoProjection;
  /** Metres along the diorama per metre of road ahead. */
  stretch: number;
  /** Where the nose is on screen. */
  nose: { x: number; y: number };
  width: number;
  height: number;
}

const DONKEY_TALL = 1.95;

export function isoLayout(viewport: Viewport, climb: number): IsoLayout {
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
  const boxAt = (stretch: number, gap: number, lateral: number): Box => {
    const foot = iso(projection, (gap + DONKEY_DEPTH / 2) * stretch, lateral * LANE_METRES);
    return {
      x: foot.x - unit * 1.3,
      y: foot.y - unit * DONKEY_TALL * 1.25,
      width: unit * 2.6,
      height: unit * (DONKEY_TALL * 1.25 + 0.9),
    };
  };
  // The longest reach at which a donkey on the sight line, in any lane, is whole on screen.
  const fits = (stretch: number) =>
    [-1, 1].every((lateral) => {
      const box = boxAt(stretch, sightAhead, lateral);
      return box.x + box.width <= width - 2 && box.y >= insetTop + 2;
    });
  let low = 1;
  let high = (width + height) / unit;
  for (let step = 0; step < 32; step++) {
    const middle = (low + high) / 2;
    if (fits(middle / sightAhead)) low = middle;
    else high = middle;
  }
  const stretch = low / sightAhead;
  return {
    viewport,
    projection,
    stretch,
    nose,
    width,
    height,
    sightAhead,
    donkeyBox: (gap, lateral) => boxAt(stretch, gap, lateral),
    carBox(lateral) {
      const front = iso(projection, 0, lateral * LANE_METRES);
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

  layout(viewport: Viewport, climb: number): IsoLayout {
    return isoLayout(viewport, climb);
  }

  draw(ctx: CanvasRenderingContext2D, frame: Frame, viewport: Viewport) {
    const layout = this.layout(viewport, frame.climb);
    const { projection, stretch } = layout;
    const { palette } = frame;
    const u = (position: number) => (position - frame.nose) * stretch;
    const behind =
      frame.nose - (projection.originX + projection.unit * 40) / (projection.unit * stretch);
    const ahead = frame.nose + (viewport.width * 1.2) / (projection.unit * stretch);

    this.drawBackground(ctx, frame, viewport);
    this.drawSlab(ctx, frame, layout, behind, ahead, u);
    this.drawRoad(ctx, frame, layout, behind, ahead, u);

    const pieces: Piece[] = [];
    this.collectScenery(ctx, frame, layout, behind, ahead, u, pieces);
    for (const hazard of frame.hazards) {
      if (hazard.gap > layout.sightAhead + 0.01) continue;
      const along = hazard.gap * stretch;
      const across = hazard.lateral * LANE_METRES;
      pieces.push({
        depth: isoDepth(along, across),
        draw: () => {
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
    if (!frame.crash) {
      const across = frame.car.lateral * LANE_METRES;
      pieces.push({
        depth: isoDepth(-CAR_LENGTH / 2, across),
        draw: () => {
          if (frame.car.ghost && Math.floor(frame.time * 12) % 2 === 0) return;
          // Reaching the top, the car zooms off up the road.
          const ahead = summitProgress(frame) * layout.stretch * layout.sightAhead * 1.4;
          isoShadow(ctx, projection, ahead - CAR_LENGTH / 2, across, 2.2, palette.shadow);
          drawIsoCar(ctx, projection, ahead, across, frame.car.hop + frame.car.bounce, {
            shape: frame.car.look.shape,
            paint: frame.car.look.paint,
            daylight: palette.daylight,
            lean: frame.car.lean,
          });
        },
      });
    }
    pieces.sort((a, b) => a.depth - b.depth);
    for (const piece of pieces) piece.draw();

    for (const particle of frame.particles) {
      // Dust and trails start at the car, which is drawn at true length, so behind
      // the nose they are placed unstretched.
      const gap = particle.along - frame.nose;
      const point = iso(projection, gap >= 0 ? gap * stretch : gap, particle.across, particle.up);
      drawParticle(ctx, particle, point.x, point.y, projection.unit);
    }
    drawSunlight(ctx, frame, viewport);
    this.drawNight(ctx, frame, viewport, layout);
    drawWeather(ctx, frame, viewport);
    if (frame.crash) this.drawCrash(ctx, frame, viewport, layout);
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
    const half = (position: number) => halfWidthAt(road, position) * LANE_METRES;
    band(
      (position) => -half(position) - 1,
      (position) => half(position) + 1,
      palette.verge,
    );
    band(
      (position) => -half(position),
      (position) => half(position),
      palette.asphalt,
    );
    band(
      (position) => -half(position),
      (position) => -half(position) + 0.2,
      palette.edgeLine,
    );
    band(
      (position) => half(position) - 0.2,
      (position) => half(position),
      palette.edgeLine,
    );

    for (const river of riversBetween(behind, ahead)) {
      // The bridge deck and its rails.
      isoFlat(
        ctx,
        projection,
        [
          [u(river), -half(river) - 0.6],
          [u(river + 5), -half(river) - 0.6],
          [u(river + 5), half(river) + 0.6],
          [u(river), half(river) + 0.6],
        ],
        mix(palette.fence, '#000000', 0.1),
        0.05,
      );
      for (const side of [-1, 1]) {
        isoBox(
          ctx,
          projection,
          u(river),
          side * (half(river) + 0.6) - 0.15,
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
      const lanes = lanesAt(road, position);
      for (let divider = 0; divider < lanes - 1; divider++) {
        const middle =
          ((lateralAt(road, position, divider) + lateralAt(road, position, divider + 1)) / 2) *
          LANE_METRES;
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
        const middle = lateralAt(road, patch.from, lane) * LANE_METRES;
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
    if (road.finish !== null && road.finish > behind && road.finish < ahead) {
      const cells = 8;
      const width = half(road.finish) * 2;
      for (let cell = 0; cell < cells; cell++) {
        const from = -width / 2 + (cell * width) / cells;
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
      const width = half(frame.nose + frame.commitGap);
      ctx.save();
      ctx.setLineDash([projection.unit * 0.6, projection.unit * 0.4]);
      ctx.strokeStyle = '#ff5e8a';
      ctx.lineWidth = Math.max(2, projection.unit * 0.2);
      const a = iso(projection, along, -width);
      const b = iso(projection, along, width);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
    if (frame.dropLane !== null) {
      // Where the next donkey drops in: a chevron painted at the far end of the road.
      const along = layout.sightAhead * layout.stretch;
      const lane = lateralAt(road, frame.nose + layout.sightAhead, frame.dropLane) * LANE_METRES;
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
        prop.side *
        (halfWidthAt(road, prop.along) * LANE_METRES + 2 + prop.offset * (near ? 0.6 : 1));
      const along = u(prop.along);
      pieces.push({
        depth: isoDepth(along, across),
        draw: () =>
          drawIsoProp(ctx, projection, along, across, kind, prop.variant, palette, frame.time),
      });
    }
    for (const position of polesBetween(palette, behind, ahead)) {
      const along = u(position);
      const across = -(halfWidthAt(road, position) * LANE_METRES + 2.5);
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
        const across = side * (halfWidthAt(road, position) * LANE_METRES + 1.4);
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
      const across = -(halfWidthAt(road, sign.at) * LANE_METRES + 1.2);
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
    if (lights && !frame.crash) {
      ctx.globalCompositeOperation = 'lighter';
      const across = frame.car.lateral * LANE_METRES;
      const corners = [
        iso(layout.projection, 0, across - 0.8),
        iso(layout.projection, 12, across - 2.6),
        iso(layout.projection, 12, across + 2.6),
        iso(layout.projection, 0, across + 0.8),
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
    ctx.restore();
  }

  private drawCrash(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    viewport: Viewport,
    layout: IsoLayout,
  ) {
    const crash = frame.crash;
    if (!crash) return;
    const { projection } = layout;
    const carAcross = crash.carLateral * LANE_METRES;
    const donkeyAcross = crash.donkeyLateral * LANE_METRES;
    const carBox: Box = layout.carBox(crash.carLateral);
    const donkeyBox: Box = layout.donkeyBox(0, crash.donkeyLateral);
    drawCrash(
      ctx,
      crash.age,
      viewport,
      {
        box: carBox,
        draw: (context) =>
          drawIsoCar(context, projection, 0, carAcross, 0, {
            shape: frame.car.look.shape,
            paint: frame.car.look.paint,
            daylight: frame.palette.daylight,
            lean: 0,
          }),
      },
      {
        box: donkeyBox,
        draw: (context) =>
          drawIsoDonkey(context, projection, 0.4, donkeyAcross, {
            coat: coatFor(crash.donkeySeed),
            facing: crash.donkeyFacing,
            time: frame.time,
            seed: crash.donkeySeed,
            startled: 1,
            dazed: false,
            hop: 0,
            hat: crash.donkeyHat,
          }),
      },
      frame.reducedMotion,
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
