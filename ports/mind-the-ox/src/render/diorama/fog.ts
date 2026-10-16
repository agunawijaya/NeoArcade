import {
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { WorldMap } from '../../engine/map';
import type { Palette } from '../palette';

/** Sheets of fog, front to back, through the depth of the diorama. */
const LAYERS = [12, -6, -30, -70];

/**
 * The fog banks as a few soft sheets standing one behind another across
 * the diorama's depth, faded at their ends and their tops, so a plane
 * slipping into one disappears into the same grey the side view paints.
 */
export class FogBanks {
  readonly group = new Group();
  private readonly owned: { dispose(): void }[] = [];

  constructor(map: WorldMap, palette: Palette, groundAt: (x: number) => number) {
    if (map.fog.length === 0) return;
    const texture = fogTexture(palette.fog);
    this.owned.push(texture);
    for (const bank of map.fog) {
      const width = bank.right - bank.left + 80;
      const bottom =
        Math.min(
          groundAt(bank.left),
          groundAt(bank.right),
          groundAt((bank.left + bank.right) / 2),
        ) - 20;
      const height = bank.top + 12 - bottom;
      LAYERS.forEach((z, index) => {
        const geometry = new PlaneGeometry(width, height);
        const material = new MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: index === 0 ? 0.55 : 0.75,
          depthWrite: false,
          side: DoubleSide,
          fog: false,
        });
        this.owned.push(geometry, material);
        const sheet = new Mesh(geometry, material);
        sheet.position.set((bank.left + bank.right) / 2, bottom + height / 2, z);
        sheet.renderOrder = 14;
        this.group.add(sheet);
      });
    }
  }

  dispose() {
    for (const thing of this.owned) thing.dispose();
    this.group.clear();
  }
}

/** A grey wash, solid in the middle, fading out at both ends and towards the top. */
function fogTexture(colour: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (let x = 0; x < canvas.width; x++) {
      const across = Math.min(x, canvas.width - 1 - x) / (canvas.width * 0.22);
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      const edge = Math.min(1, across);
      gradient.addColorStop(0, `rgba(255, 255, 255, 0)`);
      gradient.addColorStop(0.2, `rgba(255, 255, 255, ${(0.7 * edge).toFixed(3)})`);
      gradient.addColorStop(1, `rgba(255, 255, 255, ${(0.95 * edge).toFixed(3)})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, 1, canvas.height);
    }
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
