import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
} from 'three';
import { runwaySpan, type WaterSpan, type WorldMap } from '../../engine/map';
import type { Terrain } from '../../engine/terrain';
import type { Palette } from '../palette';
import type { Scenery } from '../scenery';
import { FLOOR } from '../side/camera';
import { mix } from '../side/colour';
import { bedDepth } from '../side/sea';

/** The ground slab: from just in front of the line of play back into the countryside. */
export const SLAB_FRONT = 16;
export const SLAB_BACK = 110;
const STEP = 2;
/** Depths of the rows across the top, front to back. */
const ROWS = [SLAB_FRONT, 0, -8, -20, -38, -60, -85, -SLAB_BACK];
/** Depths of the rows down the cut face, below the turf. */
const FACE = [0, 1.4, 6, 9, 15, 20, 28, 60];
const FIELD_WIDTH = 46;
/** Sand runs this far up a beach from the water's edge. */
const SAND_WIDTH = 26;

/**
 * The land as one mesh: fields and hedgerows painted on top, the soil in
 * section along the front, built from the engine's heights so craters show
 * up as dents in the same place as in the side view. Under the sea it
 * drops to the sandy bed, which the water's surface covers.
 */
export class TerrainMesh {
  readonly mesh: Mesh;
  private readonly geometry = new BufferGeometry();
  private readonly columns: number;
  private readonly fieldCanvas = document.createElement('canvas');
  private readonly fieldTexture: CanvasTexture;
  private readonly topMaterial: MeshLambertMaterial;
  private readonly faceMaterial = new MeshLambertMaterial({ vertexColors: true });
  private revision = -1;
  private scorched = 0;

  constructor(
    private readonly terrain: Terrain,
    private readonly map: WorldMap,
    private readonly scenery: Scenery,
    private palette: Palette,
  ) {
    this.columns = Math.floor((terrain.width - 1) / STEP) + 1;
    const vertices = this.columns * (ROWS.length + FACE.length);
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3));
    this.geometry.setAttribute('color', new BufferAttribute(new Float32Array(vertices * 3), 3));
    this.geometry.setAttribute('uv', new BufferAttribute(this.buildUvs(vertices), 2));
    const index = this.buildIndex();
    this.geometry.setIndex(index.all);
    this.geometry.addGroup(0, index.top, 0);
    this.geometry.addGroup(index.top, index.all.length - index.top, 1);
    this.fieldCanvas.width = Math.min(4096, terrain.width);
    this.fieldCanvas.height = 128;
    this.fieldTexture = new CanvasTexture(this.fieldCanvas);
    this.fieldTexture.colorSpace = SRGBColorSpace;
    this.fieldTexture.anisotropy = 4;
    this.topMaterial = new MeshLambertMaterial({ map: this.fieldTexture });
    this.mesh = new Mesh(this.geometry, [this.topMaterial, this.faceMaterial]);
    this.mesh.receiveShadow = true;
    this.refresh(true);
  }

  setPalette(palette: Palette) {
    if (palette === this.palette) return;
    this.palette = palette;
    this.refresh(true);
  }

  /** Rebuilds the heights after a crater, and repaints the fields when the light changes. */
  refresh(force = false) {
    if (force) this.paintFields();
    else if (this.scorched < this.terrain.craters.length) this.paintScorches();
    if (!force && this.revision === this.terrain.revision) return;
    this.revision = this.terrain.revision;
    const positions = this.geometry.getAttribute('position') as BufferAttribute;
    const colours = this.geometry.getAttribute('color') as BufferAttribute;
    const colour = new Color();
    for (let column = 0; column < this.columns; column++) {
      const x = Math.min(this.terrain.width - 1, column * STEP);
      const near = this.groundAt(x);
      ROWS.forEach((z, row) => {
        positions.setXYZ(
          row * this.columns + column,
          x,
          row <= 1 ? near : this.backHeight(x, z),
          z,
        );
      });
      FACE.forEach((depth, row) => {
        const index = (ROWS.length + row) * this.columns + column;
        const y = row === FACE.length - 1 ? FLOOR - 40 : near - depth;
        positions.setXYZ(index, x, y, SLAB_FRONT);
        this.faceColour(colour, row, x);
        colours.setXYZ(index, colour.r, colour.g, colour.b);
      });
    }
    positions.needsUpdate = true;
    colours.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  /** The land behind the line of play: the same hills, gentler the further back. */
  backHeight(x: number, z: number): number {
    const reach = Math.round(6 + -z * 0.6);
    let sum = 0;
    let count = 0;
    for (let offset = -reach; offset <= reach; offset += 3) {
      sum += this.groundAt(Math.min(this.terrain.width - 1, Math.max(0, x + offset)));
      count++;
    }
    return sum / count + Math.sin(x * 0.031 + z * 0.17) * 1.2;
  }

  /** The ground's height at x: the engine's, or the bed under the sea. */
  private groundAt(x: number): number {
    const span = this.waterAt(x);
    if (!span || !this.map.sea) return this.terrain.heightAt(x);
    return this.map.sea.level - bedDepth(span, x);
  }

  private waterAt(x: number): WaterSpan | undefined {
    return this.map.sea?.spans.find((span) => x >= span.left && x <= span.right);
  }

  /**
   * The fields as a painting along the whole strip: crops and hedgerows,
   * mown runways, the mud and trenches of the front, and a scorch for
   * every crater.
   */
  private paintFields() {
    const ctx = this.fieldCanvas.getContext('2d');
    if (!ctx) return;
    const palette = this.palette;
    const { width, height } = this.fieldCanvas;
    const u = (x: number) => (x / this.terrain.width) * width;
    // v runs from the line of play (0) to the back of the slab (height).
    const v = (depth: number) => (depth / SLAB_BACK) * height;
    ctx.fillStyle = palette.grass[2];
    ctx.fillRect(0, 0, width, height);
    const crops = [
      palette.grass[0],
      mix(palette.grass[0], '#d9c46a', 0.6),
      palette.grass[1],
      mix(palette.soil[0], palette.grass[1], 0.4),
    ];
    for (let field = 0; field * FIELD_WIDTH < this.terrain.width; field++) {
      for (let band = 0; band < 3; band++) {
        const hash = Math.abs(Math.sin(field * 78.233 + band * 3.1) * 43758.5453) % 1;
        const left = u(field * FIELD_WIDTH);
        const top = v(band * 36 + 2);
        ctx.fillStyle = crops[Math.floor(hash * crops.length)] as string;
        ctx.fillRect(left, top, u(FIELD_WIDTH - 3), v(33));
        if (hash > 0.55) {
          ctx.fillStyle = 'rgba(60, 50, 30, 0.16)';
          for (let furrow = 0; furrow < 6; furrow++)
            ctx.fillRect(left, top + v(3 + furrow * 5), u(FIELD_WIDTH - 3), 1);
        }
      }
    }
    for (const front of this.scenery.fronts) {
      ctx.fillStyle = palette.mud;
      ctx.fillRect(u(front.left), 0, u(front.right - front.left), height);
      ctx.strokeStyle = mix(palette.mud, '#000000', 0.45);
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = front.left + 8; x < front.right - 8; x += 6) {
        ctx.lineTo(u(x), v(Math.floor((x - front.left) / 6) % 2 === 0 ? 40 : 58));
      }
      ctx.stroke();
    }
    this.paintShore(ctx, u, height);
    for (const base of this.map.bases) {
      if (base.carrier !== undefined) continue;
      const { left, right } = runwaySpan(base);
      ctx.fillStyle = palette.runway;
      ctx.fillRect(u(left), 0, u(right - left), v(44));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(u(left), v(14), u(right - left), v(10));
    }
    this.scorched = 0;
    this.paintScorches();
    this.fieldTexture.needsUpdate = true;
  }

  /** Sand under the sea, and running up the beaches. */
  private paintShore(ctx: CanvasRenderingContext2D, u: (x: number) => number, height: number) {
    const sea = this.palette.sea;
    for (const span of this.map.sea?.spans ?? []) {
      ctx.fillStyle = sea.bed;
      ctx.fillRect(u(span.left), 0, u(span.right - span.left), height);
      span.shores.forEach((shore, end) => {
        if (shore !== 'beach') return;
        const edge = end === 0 ? span.left : span.right;
        const inland = end === 0 ? -SAND_WIDTH : SAND_WIDTH;
        const sand = ctx.createLinearGradient(u(edge), 0, u(edge + inland), 0);
        sand.addColorStop(0, mix(sea.bed, '#f2e6c4', 0.35));
        sand.addColorStop(1, mix(sea.bed, this.palette.grass[2], 0.9));
        ctx.fillStyle = sand;
        ctx.fillRect(Math.min(u(edge), u(edge + inland)), 0, u(SAND_WIDTH), height);
      });
    }
  }

  private paintScorches() {
    const ctx = this.fieldCanvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.fieldCanvas;
    const craters = this.terrain.craters;
    for (; this.scorched < craters.length; this.scorched++) {
      const crater = craters[this.scorched];
      if (!crater) continue;
      const x = (crater.x / this.terrain.width) * width;
      const reach = crater.radius * 2;
      const gradient = ctx.createRadialGradient(x, 2, 0, x, 2, reach);
      gradient.addColorStop(0, 'rgba(40, 30, 24, 0.85)');
      gradient.addColorStop(1, 'rgba(40, 30, 24, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - reach, 0, reach * 2, Math.min(height, reach));
    }
    this.fieldTexture.needsUpdate = true;
  }

  private faceColour(colour: Color, row: number, x: number) {
    const palette = this.palette;
    const wobble = Math.sin(x * 0.05 + row) * 0.04;
    if (this.waterAt(x)) colour.set(palette.sea.bed).lerp(new Color('#000000'), row * 0.09);
    else if (row === 0) colour.set(palette.grass[2]);
    else if (row === 1) colour.set(palette.soil[0]);
    else if (row === 3) colour.set(palette.chalk).lerp(new Color(palette.soil[0]), 0.65 + wobble);
    else if (row < 5) colour.set(palette.soil[0]).lerp(new Color(palette.soil[1]), row * 0.12);
    else colour.set(palette.soil[1]).lerp(new Color('#000000'), (row - 5) * 0.18);
  }

  /** Texture coordinates for the top: along the strip, and from the line of play backwards. */
  private buildUvs(vertices: number): Float32Array {
    const uvs = new Float32Array(vertices * 2);
    for (let column = 0; column < this.columns; column++) {
      const along = (column * STEP) / this.terrain.width;
      ROWS.forEach((z, row) => {
        const index = row * this.columns + column;
        uvs[index * 2] = along;
        // Canvas row 0 is the top of the image, which a texture puts at v = 1.
        uvs[index * 2 + 1] = 1 - Math.max(0, -z) / SLAB_BACK;
      });
    }
    return uvs;
  }

  private buildIndex(): { all: number[]; top: number } {
    const index: number[] = [];
    const quad = (a: number, b: number, c: number, d: number) => index.push(a, b, c, b, d, c);
    const columns = this.columns;
    for (let row = 0; row + 1 < ROWS.length; row++) {
      for (let column = 0; column + 1 < columns; column++) {
        const back = (row + 1) * columns + column;
        const front = row * columns + column;
        // Counter-clockwise seen from above, so the top faces the sky.
        quad(front, front + 1, back, back + 1);
      }
    }
    const top = index.length;
    const faceStart = ROWS.length * columns;
    for (let row = 0; row + 1 < FACE.length; row++) {
      for (let column = 0; column + 1 < columns; column++) {
        const upper = faceStart + row * columns + column;
        const lower = faceStart + (row + 1) * columns + column;
        quad(lower, lower + 1, upper, upper + 1);
      }
    }
    return { all: index, top };
  }

  dispose() {
    this.geometry.dispose();
    this.topMaterial.dispose();
    this.faceMaterial.dispose();
    this.fieldTexture.dispose();
  }
}
