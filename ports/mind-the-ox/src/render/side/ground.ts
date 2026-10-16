import { runwaySpan, type WorldMap } from '../../engine/map';
import type { Terrain } from '../../engine/terrain';
import type { Palette } from '../palette';
import type { Scenery } from '../scenery';
import type { SideCamera } from './camera';
import { mix, shade, withAlpha } from './colour';

/** How far back the near land runs behind the line of play, in world units of height on screen. */
export const BAND_DEPTH = 14;
const STEP_PX = 3;

/** The far edge of the near land: the play line raised and smoothed, as land recedes. */
export function farEdge(terrain: Terrain, x: number): number {
  let sum = 0;
  for (let offset = -24; offset <= 24; offset += 6)
    sum += terrain.heightAt(Math.min(terrain.width - 1, Math.max(0, x + offset)));
  return sum / 9 + BAND_DEPTH;
}

/** Height on screen of something standing `depth` (0…1) back from the line of play. */
export function depthLift(terrain: Terrain, x: number, depth: number): number {
  const near = terrain.heightAt(x);
  return near + (farEdge(terrain, x) - near) * depth;
}

/**
 * The near ground as a cut-away diorama: the fields and hedgerows running
 * back from the line of play on top, and below the line the soil in
 * section, with its layers, chalk and roots.
 */
export function paintGroundBand(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  terrain: Terrain,
  map: WorldMap,
  scenery: Scenery,
) {
  const { width } = camera.viewport;
  const columns: { sx: number; x: number; near: number; far: number }[] = [];
  for (let sx = -STEP_PX; sx <= width + STEP_PX; sx += STEP_PX) {
    const x = camera.worldX(sx);
    columns.push({ sx, x, near: terrain.heightAt(x), far: farEdge(terrain, x) });
  }

  // Fields running back from the line of play.
  const bandTop = Math.min(...columns.map((column) => camera.y(column.far)));
  const fields = ctx.createLinearGradient(0, bandTop, 0, bandTop + BAND_DEPTH * camera.scale * 1.6);
  fields.addColorStop(0, mix(palette.grass[0], palette.haze, 0.35));
  fields.addColorStop(1, palette.grass[1]);
  ctx.fillStyle = fields;
  ctx.beginPath();
  columns.forEach((column, index) => {
    const y = camera.y(column.far);
    if (index === 0) ctx.moveTo(column.sx, y);
    else ctx.lineTo(column.sx, y);
  });
  for (let index = columns.length - 1; index >= 0; index--) {
    const column = columns[index] as (typeof columns)[number];
    ctx.lineTo(column.sx, camera.y(column.near));
  }
  ctx.closePath();
  ctx.fill();

  paintPatchwork(ctx, camera, palette, terrain);
  if (palette.theme === 'airshow') paintShowgrounds(ctx, camera, palette, terrain, scenery);
  else paintFronts(ctx, camera, palette, terrain, scenery);
  paintRunways(ctx, camera, palette, terrain, map);
  paintScorches(ctx, camera, palette, terrain);

  // The soil in section, below the line.
  const bottom = camera.viewport.height;
  const soil = ctx.createLinearGradient(0, camera.y(60), 0, bottom);
  soil.addColorStop(0, palette.soil[0]);
  soil.addColorStop(0.55, palette.soil[1]);
  soil.addColorStop(1, shade(palette.soil[1], -0.45));
  ctx.fillStyle = soil;
  ctx.beginPath();
  columns.forEach((column, index) => {
    const y = camera.y(column.near);
    if (index === 0) ctx.moveTo(column.sx, y);
    else ctx.lineTo(column.sx, y);
  });
  ctx.lineTo(width + STEP_PX, bottom);
  ctx.lineTo(-STEP_PX, bottom);
  ctx.closePath();
  ctx.fill();
  paintStrata(ctx, camera, palette, columns);

  // The turf lip along the line of play.
  ctx.strokeStyle = palette.grass[2];
  ctx.lineWidth = Math.max(2, camera.scale * 1.1);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  columns.forEach((column, index) => {
    const y = camera.y(column.near) + camera.scale * 0.45;
    if (index === 0) ctx.moveTo(column.sx, y);
    else ctx.lineTo(column.sx, y);
  });
  ctx.stroke();
  ctx.strokeStyle = palette.grass[0];
  ctx.lineWidth = Math.max(1, camera.scale * 0.35);
  ctx.beginPath();
  columns.forEach((column, index) => {
    const y = camera.y(column.near);
    if (index === 0) ctx.moveTo(column.sx, y);
    else ctx.lineTo(column.sx, y);
  });
  ctx.stroke();
  paintTufts(ctx, camera, palette, terrain);
}

/**
 * The ground as the 1984 screen drew it: one line along the line of play,
 * craters and all, two of the CGA filter's 200 rows thick so it never breaks up.
 */
export function paintGroundLine(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  terrain: Terrain,
) {
  ctx.strokeStyle = palette.grass[0];
  ctx.lineWidth = Math.max(2, (camera.viewport.height / 200) * 2);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let sx = -STEP_PX; sx <= camera.viewport.width + STEP_PX; sx += STEP_PX) {
    const y = camera.y(terrain.heightAt(camera.worldX(sx)));
    if (sx === -STEP_PX) ctx.moveTo(sx, y);
    else ctx.lineTo(sx, y);
  }
  ctx.stroke();
}

/** Grass tufts and the odd root hanging over the cut edge of the turf. */
function paintTufts(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  terrain: Terrain,
) {
  const first = Math.floor(camera.worldX(0) / 2.5);
  const last = Math.ceil(camera.right / 2.5);
  ctx.strokeStyle = palette.grass[2];
  ctx.lineWidth = Math.max(1, camera.scale * 0.32);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let index = first; index <= last; index++) {
    const hash = Math.abs(Math.sin(index * 45.164) * 9283.21) % 1;
    const x = index * 2.5 + hash * 2;
    const y = camera.y(terrain.heightAt(x));
    const length = camera.scale * (0.6 + hash * 1.4);
    ctx.moveTo(camera.x(x), y);
    ctx.lineTo(camera.x(x) + (hash - 0.5) * length, y + length);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Fields of different crops, divided by hedgerows that run back from the line of play. */
function paintPatchwork(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  terrain: Terrain,
) {
  const fieldWidth = 46;
  const first = Math.floor(camera.worldX(0) / fieldWidth) - 1;
  const last = Math.ceil(camera.right / fieldWidth) + 1;
  const crops = [
    palette.grass[0],
    mix(palette.grass[0], '#d9c46a', 0.55),
    mix(palette.soil[0], palette.grass[1], 0.35),
    palette.grass[1],
  ];
  for (let index = first; index <= last; index++) {
    const hash = Math.abs(Math.sin(index * 78.233) * 43758.5453) % 1;
    const left = index * fieldWidth + hash * 8;
    const right = left + fieldWidth - 4;
    const crop = crops[Math.floor(hash * crops.length)] as string;
    ctx.fillStyle = withAlpha(crop, 0.55);
    ctx.beginPath();
    for (let x = left; x <= right; x += 4)
      ctx.lineTo(camera.x(x), camera.y(depthLift(terrain, x, 0.82)));
    for (let x = right; x >= left; x -= 4)
      ctx.lineTo(camera.x(x), camera.y(depthLift(terrain, x, 0.18)));
    ctx.closePath();
    ctx.fill();
    // A hedgerow running back between this field and the next: bushes, smaller further off.
    for (let bush = 0; bush < 6; bush++) {
      const depth = 0.12 + bush * 0.16;
      const radius = camera.scale * (1.15 - depth * 0.55);
      const x = camera.x(right + 2 + Math.sin(index + bush) * 0.6);
      const y = camera.y(depthLift(terrain, right + 2, depth));
      ctx.fillStyle = mix(palette.hedge, palette.haze, depth * 0.3);
      ctx.beginPath();
      ctx.ellipse(x, y - radius * 0.6, radius * 1.1, radius * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mix(palette.foliage[0], palette.haze, depth * 0.3);
      ctx.beginPath();
      ctx.ellipse(
        x - radius * 0.2,
        y - radius * 0.9,
        radius * 0.6,
        radius * 0.45,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

/** The front: churned mud, shell holes and a zig-zag trench across the near land. */
function paintFronts(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  terrain: Terrain,
  scenery: Scenery,
) {
  for (const front of scenery.fronts) {
    if (front.right < camera.worldX(0) || front.left > camera.right) continue;
    ctx.fillStyle = withAlpha(palette.mud, 0.85);
    ctx.beginPath();
    for (let x = front.left; x <= front.right; x += 3) {
      const ragged = Math.sin(x * 0.7) * 0.06;
      ctx.lineTo(camera.x(x), camera.y(depthLift(terrain, x, 1 + ragged)));
    }
    for (let x = front.right; x >= front.left; x -= 3)
      ctx.lineTo(camera.x(x), camera.y(terrain.heightAt(x)));
    ctx.closePath();
    ctx.fill();
    // The trench, zig-zagging across.
    ctx.strokeStyle = shade(palette.mud, -0.45);
    ctx.lineWidth = Math.max(2, camera.scale * 1.1);
    ctx.beginPath();
    for (let x = front.left + 8; x <= front.right - 8; x += 6) {
      const zig = Math.floor((x - front.left) / 6) % 2 === 0 ? 0.42 : 0.62;
      ctx.lineTo(camera.x(x), camera.y(depthLift(terrain, x, zig)));
    }
    ctx.stroke();
    ctx.strokeStyle = withAlpha(palette.chalk, 0.8);
    ctx.lineWidth = Math.max(1, camera.scale * 0.35);
    ctx.stroke();
    // Shell holes, flooded at the bottom.
    for (let hole = 0; hole < 7; hole++) {
      const x = front.left + ((hole * 37) % (front.right - front.left));
      const y = camera.y(depthLift(terrain, x, 0.2 + ((hole * 0.37) % 0.6)));
      ctx.fillStyle = shade(palette.mud, -0.35);
      ctx.beginPath();
      ctx.ellipse(camera.x(x), y, camera.scale * 2.4, camera.scale * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha(palette.sky[1], 0.5);
      ctx.beginPath();
      ctx.ellipse(
        camera.x(x),
        y + camera.scale * 0.15,
        camera.scale * 1.3,
        camera.scale * 0.32,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

/** The Airshow's crowd line: trampled grass behind a white rail. */
function paintShowgrounds(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  terrain: Terrain,
  scenery: Scenery,
) {
  for (const front of scenery.fronts) {
    if (front.right < camera.worldX(0) || front.left > camera.right) continue;
    ctx.fillStyle = withAlpha(mix(palette.grass[0], palette.chalk, 0.35), 0.8);
    ctx.beginPath();
    for (let x = front.left; x <= front.right; x += 3)
      ctx.lineTo(camera.x(x), camera.y(depthLift(terrain, x, 0.95)));
    for (let x = front.right; x >= front.left; x -= 3)
      ctx.lineTo(camera.x(x), camera.y(depthLift(terrain, x, 0.3)));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha('#ffffff', 0.9);
    ctx.lineWidth = Math.max(1, camera.scale * 0.35);
    ctx.beginPath();
    for (let x = front.left; x <= front.right; x += 3)
      ctx.lineTo(camera.x(x), camera.y(depthLift(terrain, x, 0.3)) - camera.scale * 1.2);
    ctx.stroke();
    for (let x = front.left; x <= front.right; x += 6) {
      const y = camera.y(depthLift(terrain, x, 0.3));
      ctx.beginPath();
      ctx.moveTo(camera.x(x), y);
      ctx.lineTo(camera.x(x), y - camera.scale * 1.6);
      ctx.stroke();
    }
  }
}

/** Mown grass runways with their marker stones. */
function paintRunways(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  terrain: Terrain,
  map: WorldMap,
) {
  for (const base of map.bases) {
    const { left, right } = runwaySpan(base);
    if (right < camera.worldX(0) || left > camera.right) continue;
    ctx.fillStyle = palette.runway;
    ctx.beginPath();
    for (let x = left; x <= right; x += 3)
      ctx.lineTo(camera.x(x), camera.y(depthLift(terrain, x, 0.72)));
    for (let x = right; x >= left; x -= 3) ctx.lineTo(camera.x(x), camera.y(terrain.heightAt(x)));
    ctx.closePath();
    ctx.fill();
    // Mowing stripes.
    ctx.fillStyle = withAlpha(shade(palette.runway, -0.12), 0.7);
    ctx.beginPath();
    for (let x = left; x <= right; x += 3)
      ctx.lineTo(camera.x(x), camera.y(depthLift(terrain, x, 0.5)));
    for (let x = right; x >= left; x -= 3)
      ctx.lineTo(camera.x(x), camera.y(depthLift(terrain, x, 0.32)));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.chalk;
    for (let x = left; x <= right; x += 12) {
      ctx.beginPath();
      ctx.arc(
        camera.x(x),
        camera.y(depthLift(terrain, x, 0.08)),
        Math.max(1, camera.scale * 0.45),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

/** Every crater leaves a scorch on the land behind it. */
function paintScorches(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  terrain: Terrain,
) {
  for (const crater of terrain.craters) {
    if (crater.x < camera.worldX(-60) || crater.x > camera.worldX(camera.viewport.width + 60))
      continue;
    const x = camera.x(crater.x);
    const y = camera.y(depthLift(terrain, crater.x, 0.25));
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, crater.radius * camera.scale * 1.4);
    gradient.addColorStop(0, withAlpha(palette.scorch, 0.75));
    gradient.addColorStop(1, withAlpha(palette.scorch, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      crater.radius * camera.scale * 1.4,
      crater.radius * camera.scale * 0.45,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/** Layers in the soil that follow the ground's shape, with chalk and the odd root. */
function paintStrata(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  columns: { sx: number; x: number; near: number }[],
) {
  const layers: [depth: number, colour: string, alpha: number][] = [
    [6, shade(palette.soil[0], 0.1), 0.28],
    [14, palette.chalk, 0.16],
    [26, shade(palette.soil[1], -0.2), 0.3],
  ];
  for (const [depth, colour, alpha] of layers) {
    ctx.strokeStyle = withAlpha(colour, alpha);
    ctx.lineWidth = Math.max(1, camera.scale * 0.8);
    ctx.beginPath();
    columns.forEach((column, index) => {
      const wobble =
        Math.sin(column.x * 0.05 + depth) * 1.6 + Math.sin(column.x * 0.17 + depth * 3) * 0.7;
      const y = camera.y(column.near - depth + wobble);
      if (index === 0) ctx.moveTo(column.sx, y);
      else ctx.lineTo(column.sx, y);
    });
    ctx.stroke();
  }
  // Stones and chalk lumps, fixed to the world.
  const first = Math.floor(camera.worldX(0) / 5);
  const last = Math.ceil(camera.right / 5);
  for (let index = first; index <= last; index++) {
    const hash = Math.abs(Math.sin(index * 91.17) * 24634.6345) % 1;
    if (hash > 0.3) continue;
    const x = index * 5 + hash * 5;
    const near = columns.find((column) => column.x >= x)?.near ?? 0;
    const depth = 3 + hash * 60;
    ctx.fillStyle = withAlpha(hash < 0.12 ? palette.chalk : shade(palette.soil[1], -0.25), 0.55);
    ctx.beginPath();
    ctx.ellipse(
      camera.x(x),
      camera.y(near - depth),
      camera.scale * (0.4 + hash * 1.2),
      camera.scale * (0.3 + hash * 0.6),
      hash * 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
