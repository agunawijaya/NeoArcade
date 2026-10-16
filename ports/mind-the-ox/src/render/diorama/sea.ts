import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  ShadowMaterial,
} from 'three';
import type { Sea, WaterSpan } from '../../engine/map';
import type { Palette } from '../palette';
import { FLOOR } from '../side/camera';
import { mix } from '../side/colour';
import { CAMERA_DISTANCE, CAMERA_HEIGHT } from './camera';
import { SLAB_BACK, SLAB_FRONT } from './terrain-mesh';

/**
 * The sea in the diorama: over each stretch of water, a surface running
 * from the front of the slab back to the horizon, shading from near to
 * far, clear enough near the front to see the hulls and torpedoes under
 * it, with the swell drifting across; a translucent face along the front
 * showing the water in section; and a line of foam where the two meet.
 *
 * Seen from the camera's height a flat sea would climb the screen almost
 * to eye level. Instead, behind the slab the surface bends down out of
 * sight, so its horizon stands a little over the sea's level, as in the
 * side view, and the sky keeps its share of the picture.
 */

/** Depths of the surface's rows, front to back: close together near the front, where its clearness changes. */
const ROWS = [
  SLAB_FRONT,
  8,
  0,
  -10,
  -25,
  -45,
  -70,
  -SLAB_BACK,
  -170,
  -260,
  -400,
  -600,
  -900,
  -1300,
  -1900,
];
/** The horizon stands this far over the sea's level, on the line of play's scale. */
const HORIZON_RISE = 32;
/** Hills behind the sea sink to this far over its level, a little under the horizon, as the side view's do. */
const HILL_FLOOR = HORIZON_RISE - 6;
/** Near the front the water is this clear, clouding over by `CLEAR_DEPTH` behind the line of play. */
const FRONT_OPACITY = 0.5;
const CLEAR_DEPTH = 80;
/** Behind the line of play the sea spreads this far past its ends, into the bays of the coast. */
const COAST_REACH = 120;
/** Past that, the hills behind rise out of the sea over this much more. */
const COAST_RISE = 200;
/** One tile of the swell's strokes, world units. */
const SWELL_TILE = 60;

/** Where something at height y and depth z shows on screen, as a height on the line of play. */
function seenAt(y: number, z: number): number {
  return CAMERA_HEIGHT + ((y - CAMERA_HEIGHT) * CAMERA_DISTANCE) / (CAMERA_DISTANCE - z);
}

/** The height at depth z that shows on screen at `shown`. */
function heightShowing(shown: number, z: number): number {
  return CAMERA_HEIGHT + ((shown - CAMERA_HEIGHT) * (CAMERA_DISTANCE - z)) / CAMERA_DISTANCE;
}

/**
 * The surface's height at depth z: the sea's level under the slab, then
 * bending away so that on screen it eases up towards the horizon instead
 * of running on up to the camera's eye.
 */
export function seaSurfaceAt(level: number, z: number): number {
  if (z >= -SLAB_BACK) return level;
  const bend = seenAt(level, -SLAB_BACK);
  const room = level + HORIZON_RISE - bend;
  const flat = seenAt(level, z);
  return heightShowing(bend + room * (1 - Math.exp(-(flat - bend) / room)), z);
}

/** 1 where the sea runs back to the horizon behind x, easing to 0 along the coast beyond its ends. */
export function seaWetness(sea: Sea, x: number): number {
  let wettest = 0;
  for (const span of sea.spans) {
    const away = Math.max(span.left - x, x - span.right, 0);
    wettest = Math.max(wettest, 1 - Math.max(0, away - COAST_REACH * 0.5) / COAST_RISE);
  }
  return Math.max(0, wettest);
}

/**
 * A hill's height as the side view would paint it (before it is set at
 * its depth), sunk towards the horizon where there is sea in front: by
 * `share` of the way, so the farthest hills stay on the horizon as a coast.
 */
export function sinkHill(sea: Sea | null, x: number, height: number, share: number): number {
  if (!sea) return height;
  const floor = sea.level + HILL_FLOOR;
  return height - Math.max(0, height - floor) * seaWetness(sea, x) * share;
}

export class SeaSurface {
  readonly group = new Group();
  private readonly swellCanvas = document.createElement('canvas');
  private readonly swellTexture: CanvasTexture;
  private readonly surfaceMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    fog: false,
  });
  private readonly swellMaterial: MeshBasicMaterial;
  private readonly faceMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly foamMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0.85 });
  /** Behind the bed, under the surface: deep water, where the slab of sea is cut off. */
  private readonly deepMaterial = new MeshBasicMaterial({ fog: false });
  /** The shadows of planes and ships, laid over the water. */
  private readonly shadowMaterial = new ShadowMaterial({ opacity: 0.22, depthWrite: false });
  private readonly surfaces: Mesh[] = [];
  private readonly faces: Mesh[] = [];
  private readonly others: Mesh[] = [];

  constructor(
    private readonly sea: Sea,
    private palette: Palette,
  ) {
    this.swellCanvas.width = 256;
    this.swellCanvas.height = 256;
    this.swellTexture = new CanvasTexture(this.swellCanvas);
    this.swellTexture.colorSpace = SRGBColorSpace;
    this.swellTexture.wrapS = RepeatWrapping;
    this.swellTexture.wrapT = RepeatWrapping;
    this.swellMaterial = new MeshBasicMaterial({
      map: this.swellTexture,
      transparent: true,
      depthWrite: false,
    });
    for (const span of sea.spans) this.build(span);
    this.paint();
  }

  setPalette(palette: Palette) {
    if (palette === this.palette) return;
    this.palette = palette;
    this.paint();
  }

  /** The swell drifts across the water. */
  update(time: number) {
    this.swellTexture.offset.set(time * 0.004, time * 0.012);
  }

  private build(span: WaterSpan) {
    const left = span.left - COAST_REACH;
    const right = span.right + COAST_REACH;
    const surfaceGeometry = surfaceRows(left, right, this.sea.level);
    const water = new Mesh(surfaceGeometry, this.surfaceMaterial);
    water.renderOrder = 1;
    const swell = new Mesh(surfaceGeometry, this.swellMaterial);
    swell.position.y = 0.05;
    swell.renderOrder = 2;
    const shadows = new Mesh(surfaceGeometry, this.shadowMaterial);
    shadows.position.y = 0.08;
    shadows.receiveShadow = true;
    shadows.renderOrder = 2;

    const bottom = FLOOR - 40;
    const deep = new Mesh(
      new PlaneGeometry(right - left, this.sea.level - 0.3 - bottom),
      this.deepMaterial,
    );
    deep.position.set((left + right) / 2, (this.sea.level - 0.3 + bottom) / 2, -SLAB_BACK - 0.5);

    const width = span.right - span.left;
    const centre = (span.left + span.right) / 2;
    const faceGeometry = new PlaneGeometry(width, this.sea.level - bottom, 1, 6);
    faceGeometry.setAttribute(
      'color',
      new BufferAttribute(new Float32Array(faceGeometry.getAttribute('position').count * 4), 4),
    );
    const face = new Mesh(faceGeometry, this.faceMaterial);
    face.position.set(centre, (this.sea.level + bottom) / 2, SLAB_FRONT + 0.05);
    face.renderOrder = 6;

    const foam = new Mesh(new PlaneGeometry(width, 1.2), this.foamMaterial);
    foam.position.set(centre, this.sea.level + 0.2, SLAB_FRONT + 0.1);
    foam.renderOrder = 7;

    this.surfaces.push(water);
    this.faces.push(face);
    this.others.push(deep, foam);
    this.group.add(water, swell, shadows, deep, face, foam);
  }

  /**
   * Colours the water for the light. The surface follows the side view's
   * gradient by where it shows on screen: deep near the line of play, the
   * open sea's own colour further off, hazy at the horizon; and it is
   * clear near the front. The face runs from the shallows down into the deep.
   */
  private paint() {
    const { sea, haze } = this.palette;
    const near = new Color(sea.near);
    const far = new Color(sea.far);
    const hazy = new Color(mix(sea.far, haze, 0.25));
    const colour = new Color();
    for (const surface of this.surfaces) {
      const positions = surface.geometry.getAttribute('position') as BufferAttribute;
      const colours = surface.geometry.getAttribute('color') as BufferAttribute;
      for (let index = 0; index < positions.count; index++) {
        const z = positions.getZ(index);
        const shown = (seenAt(positions.getY(index), z) - this.sea.level) / HORIZON_RISE;
        const fromHorizon = 1 - Math.min(1, Math.max(0, shown));
        if (fromHorizon < 0.35) colour.copy(hazy).lerp(far, fromHorizon / 0.35);
        else colour.copy(far).lerp(near, (fromHorizon - 0.35) / 0.65);
        const clouded = Math.min(1, (SLAB_FRONT - z) / (SLAB_FRONT + CLEAR_DEPTH));
        colours.setXYZW(
          index,
          colour.r,
          colour.g,
          colour.b,
          FRONT_OPACITY + (1 - FRONT_OPACITY) * clouded,
        );
      }
      colours.needsUpdate = true;
    }
    const shallow = new Color(sea.shallow);
    const deep = new Color(sea.deep);
    for (const face of this.faces) {
      const positions = face.geometry.getAttribute('position') as BufferAttribute;
      const colours = face.geometry.getAttribute('color') as BufferAttribute;
      for (let index = 0; index < positions.count; index++) {
        const depth = this.sea.level - (positions.getY(index) + face.position.y);
        colour.copy(shallow).lerp(deep, Math.min(1, depth / 18));
        colours.setXYZW(index, colour.r, colour.g, colour.b, 0.42 + Math.min(1, depth / 14) * 0.38);
      }
      colours.needsUpdate = true;
    }
    this.deepMaterial.color.copy(deep);
    this.foamMaterial.color.set(sea.foam);
    this.paintSwell();
  }

  /**
   * Strokes of swell on a clear ground, some light with foam and some
   * dark in the troughs. They lie along the waves and are broad across
   * them, because the camera sees the water at a low angle.
   */
  private paintSwell() {
    const ctx = this.swellCanvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.swellCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    for (let stroke = 0; stroke < 46; stroke++) {
      const hash = Math.abs(Math.sin(stroke * 12.9898) * 43758.5453) % 1;
      const second = Math.abs(Math.sin(stroke * 78.233) * 12345.6789) % 1;
      ctx.strokeStyle =
        stroke % 3 === 0 ? this.palette.sea.foam : mix(this.palette.sea.near, '#000000', 0.25);
      ctx.globalAlpha = 0.12 + hash * 0.22;
      ctx.lineWidth = 6 + hash * 9;
      const x = second * width;
      const y = hash * height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 24 + hash * 50, y + (second - 0.5) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.swellTexture.needsUpdate = true;
  }

  dispose() {
    for (const mesh of [...this.surfaces, ...this.faces, ...this.others]) mesh.geometry.dispose();
    for (const material of [
      this.surfaceMaterial,
      this.swellMaterial,
      this.faceMaterial,
      this.foamMaterial,
      this.deepMaterial,
      this.shadowMaterial,
    ])
      material.dispose();
    this.swellTexture.dispose();
  }
}

/**
 * The surface as rows across the water, front to back, bending away
 * behind the slab; coloured in `paint`, and tiled with the swell's
 * strokes by world position.
 */
function surfaceRows(left: number, right: number, level: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  ROWS.forEach((z, row) => {
    const y = seaSurfaceAt(level, z);
    positions.push(left, y, z, right, y, z);
    uvs.push(left / SWELL_TILE, z / SWELL_TILE, right / SWELL_TILE, z / SWELL_TILE);
    if (row === 0) return;
    const front = (row - 1) * 2;
    // Counter-clockwise seen from above.
    index.push(front, front + 1, front + 2, front + 1, front + 3, front + 2);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute(
    'color',
    new BufferAttribute(new Float32Array((positions.length / 3) * 4), 4),
  );
  geometry.setIndex(index);
  return geometry;
}
