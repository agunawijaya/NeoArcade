import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Scene,
} from 'three';
import { createRng } from '@shared/rng';
import type { Sea } from '../../engine/map';
import { paintCloudCanvas } from '../cloud-art';
import type { Cloud } from '../clouds';
import type { Palette } from '../palette';
import type { Scenery } from '../scenery';
import { FLOOR } from '../side/camera';
import { mix } from '../side/colour';
import type { Viewport } from '../view';
import { paintSunShafts } from '../screen-light';
import { CAMERA_HEIGHT, depthForParallax } from './camera';
import { sinkHill } from './sea';

/**
 * The same three ridges the side view paints, as curtains standing at the
 * depth of their parallax; over the sea they sink as the side view's do,
 * by `sink` of the way to the horizon.
 */
const RIDGES: readonly {
  parallax: number;
  shift: number;
  lift: number;
  source: 'far' | 'mid';
  haze: number;
  sink: number;
}[] = [
  { parallax: 0.22, shift: 0, lift: 6, source: 'far', haze: 0.5, sink: 0.45 },
  { parallax: 0.36, shift: 731, lift: -16, source: 'far', haze: 0.32, sink: 0.8 },
  { parallax: 0.5, shift: 0, lift: 0, source: 'mid', haze: 0.12, sink: 1.1 },
];
const HILL_OFFSET = 2000;
const HILL_STEP = 8;
const CLOUD_PIXELS_PER_UNIT = 5;

/**
 * Everything behind and above the field: the sky (a painted background
 * with the sun or moon, so it always sits where the side view has it),
 * the receding ridges, and the clouds, some of them in front of the play.
 */
export class Backdrop {
  readonly group = new Group();
  private readonly skyCanvas = document.createElement('canvas');
  private readonly skyTexture: CanvasTexture;
  private readonly stars: { x: number; y: number; size: number }[];
  private ridges: Mesh[] = [];
  private clouds: Sprite[] = [];
  private painted: string | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly scenery: Scenery,
    seed: number,
    private readonly sea: Sea | null,
  ) {
    this.skyCanvas.width = 1024;
    this.skyCanvas.height = 640;
    this.skyTexture = new CanvasTexture(this.skyCanvas);
    this.skyTexture.colorSpace = SRGBColorSpace;
    scene.background = this.skyTexture;
    const rng = createRng(`mind-the-ox:stars:${seed}`);
    this.stars = Array.from({ length: 160 }, () => ({
      x: rng.next(),
      y: rng.next() * rng.next(),
      size: rng.float(0.6, 1.8),
    }));
  }

  /** Repaints the sky and rebuilds ridges and clouds when the light changes. */
  update(palette: Palette, viewport: Viewport, sunBoost: number) {
    const key = `${palette.sky.join()}:${palette.sun.x}:${palette.sun.y}:${sunBoost.toFixed(2)}:${viewport.width}x${viewport.height}`;
    if (key === this.painted) return;
    const relight = this.painted === null || !this.painted.startsWith(palette.sky.join());
    this.painted = key;
    this.paintSky(palette, viewport, sunBoost);
    if (relight || this.ridges.length === 0) {
      this.buildRidges(palette);
      this.buildClouds(palette);
    }
  }

  private paintSky(palette: Palette, viewport: Viewport, sunBoost: number) {
    const ctx = this.skyCanvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.skyCanvas;
    const bandTop = viewport.insetTop / viewport.height;
    const bandHeight =
      (viewport.height - viewport.insetTop - viewport.insetBottom) / viewport.height;
    const gradient = ctx.createLinearGradient(0, 0, 0, height * 0.82);
    gradient.addColorStop(0, palette.sky[0]);
    gradient.addColorStop(0.55, palette.sky[1]);
    gradient.addColorStop(1, palette.sky[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    if (palette.stars) {
      ctx.fillStyle = 'rgba(255, 250, 230, 0.8)';
      for (const star of this.stars)
        ctx.fillRect(star.x * width, star.y * height * 0.7, star.size, star.size);
    }
    const x = palette.sun.x * width;
    const y = (bandTop + bandHeight * palette.sun.y) * height;
    const radius =
      height *
      0.045 *
      (1 + sunBoost * 0.8) *
      (viewport.height / Math.min(viewport.width, viewport.height));
    // The sky is stretched over the screen whatever its shape: squeeze the sun
    // and its glow across by the same amount, so they come out round.
    const squeeze = (width / height) * (viewport.height / viewport.width);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squeeze, 1);
    const glow = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, radius * (6 + sunBoost * 10));
    glow.addColorStop(0, palette.sun.glow);
    glow.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-x / squeeze, -y, width / squeeze, height);
    ctx.fillStyle = palette.sun.body;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (sunBoost > 0) {
      // The low sun's shafts sit in the sky, behind the hills, as in the side view.
      ctx.save();
      ctx.scale(width / viewport.width, height / viewport.height);
      paintSunShafts(ctx, viewport, sunBoost, palette);
      ctx.restore();
    }
    this.skyTexture.needsUpdate = true;
  }

  private buildRidges(palette: Palette) {
    for (const ridge of this.ridges) {
      this.group.remove(ridge);
      ridge.geometry.dispose();
      (ridge.material as MeshBasicMaterial).dispose();
    }
    this.ridges = RIDGES.map((ridge, index) => {
      const hills = ridge.source === 'far' ? this.scenery.farHills : this.scenery.midHills;
      const colours: readonly [string, string] =
        index === 1
          ? [mix(palette.farHills[0], palette.midHills[0], 0.5), palette.farHills[1]]
          : ridge.source === 'far'
            ? palette.farHills
            : palette.midHills;
      const mesh = ridgeMesh(
        hills,
        ridge.parallax,
        ridge.shift,
        ridge.lift,
        colours,
        palette.haze,
        ridge.haze,
        index === 2 ? palette : null,
        (x, height) => sinkHill(this.sea, x, height, ridge.sink),
      );
      this.group.add(mesh);
      return mesh;
    });
  }

  private buildClouds(palette: Palette) {
    for (const sprite of this.clouds) {
      this.group.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    this.clouds = this.scenery.clouds.map((cloud) => cloudSprite(cloud, palette));
    for (const sprite of this.clouds) this.group.add(sprite);
  }

  dispose() {
    this.buildRidgesEmpty();
    this.skyTexture.dispose();
    if (this.scene.background === this.skyTexture) this.scene.background = null;
  }

  private buildRidgesEmpty() {
    for (const object of [...this.ridges, ...this.clouds]) this.group.remove(object);
  }
}

/** Heights in the side view become heights at depth: further back, further from the camera's eye level. */
function heightAtDepth(sideHeight: number, parallax: number): number {
  return CAMERA_HEIGHT + (sideHeight - CAMERA_HEIGHT) / parallax;
}

function ridgeMesh(
  hills: Float64Array,
  parallax: number,
  shift: number,
  lift: number,
  colours: readonly [string, string],
  haze: string,
  hazeShare: number,
  patchwork: Palette | null,
  sunk: (x: number, y: number) => number,
): Mesh {
  const z = depthForParallax(parallax);
  const rows = patchwork ? [0, 3, 10, 11, 20, 60] : [0, 60];
  const samples = hills.length;
  const positions = new Float32Array(samples * rows.length * 3);
  const colourData = new Float32Array(samples * rows.length * 3);
  const top = new Color(mix(colours[0], haze, hazeShare));
  const bottom = new Color(mix(colours[1], haze, hazeShare * 0.6));
  const colour = new Color();
  for (let sample = 0; sample < samples; sample++) {
    const layerX = sample * HILL_STEP - HILL_OFFSET - shift;
    const x = layerX / parallax;
    const ridgeTop = (hills[sample] as number) + lift;
    rows.forEach((drop, row) => {
      const index = row * samples + sample;
      const sideHeight = row === rows.length - 1 ? FLOOR - 60 : ridgeTop - drop;
      positions[index * 3] = x;
      positions[index * 3 + 1] = heightAtDepth(sunk(x, sideHeight), parallax);
      positions[index * 3 + 2] = z;
      colour.copy(top).lerp(bottom, row / (rows.length - 1));
      if (patchwork && row > 0 && row < rows.length - 1) {
        const hash = Math.abs(Math.sin(Math.floor(layerX / 26) * 33.71 + row) * 13758.5453) % 1;
        const crop =
          hash < 0.33
            ? mix('#d8c06a', patchwork.midHills[1], 1 - patchwork.daylight * 0.8)
            : hash < 0.66
              ? patchwork.midHills[0]
              : patchwork.midHills[1];
        colour.lerp(new Color(crop), 0.3);
      }
      colourData[index * 3] = colour.r;
      colourData[index * 3 + 1] = colour.g;
      colourData[index * 3 + 2] = colour.b;
    });
  }
  const index: number[] = [];
  for (let row = 0; row + 1 < rows.length; row++) {
    for (let sample = 0; sample + 1 < samples; sample++) {
      const upper = row * samples + sample;
      const lower = (row + 1) * samples + sample;
      index.push(lower, lower + 1, upper, lower + 1, upper + 1, upper);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colourData, 3));
  geometry.setIndex(index);
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.renderOrder = -10;
  return mesh;
}

function cloudSprite(cloud: Cloud, palette: Palette): Sprite {
  const haze = Math.max(0, 0.55 - cloud.parallax * 0.6);
  const canvas = paintCloudCanvas(cloud, CLOUD_PIXELS_PER_UNIT, palette, haze);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: cloud.parallax > 1 ? 0.34 : 1,
    depthWrite: false,
    fog: false,
  });
  const sprite = new Sprite(material);
  const size = canvas.width / CLOUD_PIXELS_PER_UNIT / cloud.parallax;
  sprite.scale.set(size, size, 1);
  sprite.position.set(
    cloud.x / cloud.parallax,
    heightAtDepth(cloud.y, cloud.parallax),
    depthForParallax(cloud.parallax),
  );
  sprite.renderOrder = cloud.parallax > 1 ? 20 : -5;
  return sprite;
}
