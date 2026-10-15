import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, type Texture } from 'three';
import { AIRPORTS } from '../data/airport-data';
import { LAKES, LAND, RIVERS, URBAN } from '../data/geography-data';
import { REGION_GRID } from '../data/terrain-data';

/**
 * A map of what covers the ground, drawn by code from Natural Earth's
 * shapes: water in the red channel (sea, lakes, rivers), towns in the green.
 * The terrain shader reads it to paint fields, forests, snow, water and
 * town lights; nothing here is an image file. One map covers the whole
 * region, and a sharper one is drawn around each airport for the approach.
 */
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const REGION_BOUNDS: Bounds = {
  west: REGION_GRID.west,
  south: REGION_GRID.south,
  east: REGION_GRID.west + (REGION_GRID.cols - 1) * REGION_GRID.step,
  north: REGION_GRID.south + (REGION_GRID.rows - 1) * REGION_GRID.step,
};

/** Rivers by Natural Earth's scale rank: the big ones wider, the small ones only on the sharp maps. */
function riverWidthMetres(rank: number): number {
  if (rank <= 2) return 900;
  if (rank <= 4) return 450;
  if (rank <= 6) return 220;
  return 110;
}

export function drawLandUse(bounds: Bounds, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const x = (lon: number) => ((lon - bounds.west) / (bounds.east - bounds.west)) * width;
  const y = (lat: number) => ((bounds.north - lat) / (bounds.north - bounds.south)) * height;
  const metresPerPixel = ((bounds.north - bounds.south) * 111_195) / height;

  const trace = (ring: number[], close: boolean) => {
    context.beginPath();
    for (let index = 0; index < ring.length; index += 2) {
      const px = x(ring[index] as number);
      const py = y(ring[index + 1] as number);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    if (close) context.closePath();
  };

  // Everything starts as sea; the land is cut out of it, the lakes put back.
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#000000';
  for (const ring of LAND) {
    trace(ring, true);
    context.fill();
  }
  context.fillStyle = '#ff0000';
  for (const lake of LAKES) {
    trace(lake.ring, true);
    context.fill();
  }
  context.strokeStyle = '#ff0000';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const river of RIVERS) {
    const widthPx = riverWidthMetres(river.rank) / metresPerPixel;
    if (widthPx < 0.35) continue;
    context.lineWidth = Math.max(widthPx, 0.6);
    trace(river.line, false);
    context.stroke();
  }
  context.globalCompositeOperation = 'lighter';
  context.fillStyle = '#00ff00';
  for (const ring of URBAN) {
    trace(ring, true);
    context.fill();
  }
  context.globalCompositeOperation = 'source-over';

  // The airfields are dry land whatever the coastline at this scale says: a band round every runway.
  context.strokeStyle = '#000000';
  context.lineCap = 'round';
  for (const airport of AIRPORTS) {
    for (const strip of airport.runways) {
      const [a, b] = strip.ends;
      context.lineWidth = Math.max(AIRFIELD_BAND_METRES / metresPerPixel, 1);
      context.beginPath();
      context.moveTo(x(a.lon), y(a.lat));
      context.lineTo(x(b.lon), y(b.lat));
      context.stroke();
    }
  }
  return canvas;
}

/** The width of dry ground drawn along every runway, metres. */
const AIRFIELD_BAND_METRES = 900;

export function landUseTexture(canvas: HTMLCanvasElement): Texture {
  // A map of coverage, not a picture: read as plain numbers, with no colour conversion.
  const texture = new CanvasTexture(canvas);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}
