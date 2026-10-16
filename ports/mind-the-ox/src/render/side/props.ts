import type { Terrain } from '../../engine/terrain';
import type { Palette } from '../palette';
import type { Prop } from '../scenery';
import type { SideCamera } from './camera';
import { depthLift } from './ground';
import { mix, shade, withAlpha } from './colour';

/**
 * The scenery standing on the near land: trees, farms, a church, a
 * windmill, the airfield tents and windsocks, wire and stumps along the
 * front, and observation balloons hanging over the lines.
 */
export function paintProps(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  terrain: Terrain,
  props: readonly Prop[],
  time: number,
) {
  const left = camera.worldX(-80);
  const right = camera.worldX(camera.viewport.width + 80);
  for (const prop of props) {
    if (prop.x < left || prop.x > right) continue;
    const x = camera.x(prop.x);
    const ground = camera.y(depthLift(terrain, prop.x, prop.depth));
    const unit = camera.scale * prop.scale;
    // Further back is a little hazier.
    const haze = prop.depth * 0.22;
    ctx.save();
    ctx.translate(x, ground);
    ctx.scale(prop.facing, 1);
    paintProp(ctx, prop, unit, palette, haze, time);
    ctx.restore();
  }
}

function paintProp(
  ctx: CanvasRenderingContext2D,
  prop: Prop,
  unit: number,
  palette: Palette,
  haze: number,
  time: number,
) {
  const tint = (colour: string) => mix(colour, palette.haze, haze);
  switch (prop.kind) {
    case 'poplar':
      trunk(ctx, unit, 0.5, 3, tint(palette.trunk));
      blob(
        ctx,
        0,
        -unit * 8.5,
        unit * 1.9,
        unit * 7.5,
        tint(palette.foliage[1]),
        tint(palette.foliage[0]),
      );
      return;
    case 'oak':
      trunk(ctx, unit, 0.8, 4, tint(palette.trunk));
      blob(
        ctx,
        -unit * 1.6,
        -unit * 6,
        unit * 3.6,
        unit * 3.2,
        tint(palette.foliage[2]),
        tint(palette.foliage[1]),
      );
      blob(
        ctx,
        unit * 1.8,
        -unit * 6.4,
        unit * 3.2,
        unit * 3,
        tint(palette.foliage[1]),
        tint(palette.foliage[0]),
      );
      blob(
        ctx,
        0,
        -unit * 8.6,
        unit * 3.4,
        unit * 2.8,
        tint(palette.foliage[1]),
        tint(palette.foliage[0]),
      );
      return;
    case 'bush':
      blob(
        ctx,
        0,
        -unit * 1.3,
        unit * 2.6,
        unit * 1.6,
        tint(palette.foliage[2]),
        tint(palette.foliage[1]),
      );
      return;
    case 'haystack':
      ctx.fillStyle = tint('#d9b45a');
      ctx.beginPath();
      ctx.moveTo(-unit * 2.4, 0);
      ctx.quadraticCurveTo(-unit * 2.2, -unit * 4.6, 0, -unit * 4.8);
      ctx.quadraticCurveTo(unit * 2.2, -unit * 4.6, unit * 2.4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = withAlpha('#8a6a2a', 0.35);
      ctx.fillRect(-unit * 2.4, -unit * 1.2, unit * 4.8, unit * 0.5);
      return;
    case 'fence':
      ctx.strokeStyle = tint(palette.trunk);
      ctx.lineWidth = Math.max(1, unit * 0.3);
      for (let post = -2; post <= 2; post++) {
        ctx.beginPath();
        ctx.moveTo(post * unit * 2, 0);
        ctx.lineTo(post * unit * 2, -unit * 1.8);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-unit * 4.2, -unit * 1.3);
      ctx.lineTo(unit * 4.2, -unit * 1.3);
      ctx.moveTo(-unit * 4.2, -unit * 0.7);
      ctx.lineTo(unit * 4.2, -unit * 0.7);
      ctx.stroke();
      return;
    case 'farmhouse':
    case 'barn':
      house(ctx, unit, palette, tint, prop.kind === 'barn', prop.variant);
      return;
    case 'church':
      church(ctx, unit, palette, tint, prop.variant);
      return;
    case 'windmill':
      windmill(ctx, unit, palette, tint, time);
      return;
    case 'stump':
      ctx.strokeStyle = tint(shade(palette.trunk, -0.2));
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.5, unit * 0.7);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(unit * 0.3, -unit * 5);
      ctx.moveTo(unit * 0.2, -unit * 3.2);
      ctx.lineTo(unit * 1.6, -unit * 4.4);
      ctx.stroke();
      ctx.lineCap = 'butt';
      return;
    case 'wire':
      // A knife rest: crossed wooden trestles strung with wire.
      ctx.strokeStyle = tint(palette.trunk);
      ctx.lineWidth = Math.max(1, unit * 0.3);
      ctx.beginPath();
      for (const end of [-4, 4]) {
        ctx.moveTo(unit * (end - 1.1), 0);
        ctx.lineTo(unit * (end + 1.1), -unit * 2.4);
        ctx.moveTo(unit * (end + 1.1), 0);
        ctx.lineTo(unit * (end - 1.1), -unit * 2.4);
      }
      ctx.moveTo(-unit * 4, -unit * 1.2);
      ctx.lineTo(unit * 4, -unit * 1.2);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(palette.ink, 0.55);
      ctx.lineWidth = Math.max(0.6, unit * 0.1);
      ctx.beginPath();
      for (const height of [0.5, 1.2, 1.9]) {
        ctx.moveTo(-unit * 5, -unit * height);
        for (let step = -5; step <= 5; step += 0.5)
          ctx.lineTo(unit * step, -unit * (height + (Math.round(step * 2) % 2) * 0.18));
      }
      ctx.stroke();
      return;
    case 'tent':
      hangarTent(ctx, unit, palette, tint);
      return;
    case 'windsock':
      windsock(ctx, unit, palette, time);
      return;
    case 'balloon':
      if (palette.theme === 'great-war') balloon(ctx, unit, palette, tint, time);
      else if (palette.theme === 'airshow')
        hotAirBalloon(ctx, unit, palette, tint, time, prop.variant);
      else blimp(ctx, unit, palette, tint, time);
      return;
    case 'sign':
      signpost(ctx, unit, palette, tint);
      return;
    case 'marquee':
      marquee(ctx, unit, palette, tint, prop.variant);
      return;
    case 'grandstand':
      grandstand(ctx, unit, palette, tint, prop.variant);
      return;
    case 'bunting':
      bunting(ctx, unit, palette, time);
      return;
    case 'ferris':
      ferrisWheel(ctx, unit, palette, tint, time);
      return;
  }
}

/** A wooden signpost pointing both ways across no man's land. */
function signpost(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
) {
  ctx.fillStyle = tint(palette.trunk);
  ctx.fillRect(-unit * 0.3, -unit * 5, unit * 0.6, unit * 5);
  const [left, right] = palette.accents;
  ctx.fillStyle = tint(left);
  ctx.beginPath();
  ctx.moveTo(-unit * 3.6, -unit * 4.6);
  ctx.lineTo(-unit * 0.2, -unit * 4.6);
  ctx.lineTo(-unit * 0.2, -unit * 3.4);
  ctx.lineTo(-unit * 3.6, -unit * 3.4);
  ctx.lineTo(-unit * 4.2, -unit * 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tint(right);
  ctx.beginPath();
  ctx.moveTo(unit * 0.2, -unit * 3);
  ctx.lineTo(unit * 3.6, -unit * 3);
  ctx.lineTo(unit * 4.2, -unit * 2.4);
  ctx.lineTo(unit * 3.6, -unit * 1.8);
  ctx.lineTo(unit * 0.2, -unit * 1.8);
  ctx.closePath();
  ctx.fill();
}

/** A cartoon blimp with fins, on a long mooring line. */
function blimp(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
  time: number,
) {
  const sway = Math.sin(time * 0.5) * unit * 2;
  const height = unit * 115;
  ctx.strokeStyle = withAlpha(palette.ink, 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(sway * 0.5, -height * 0.5, sway, -height);
  ctx.stroke();
  const magenta = palette.accents[1];
  ctx.fillStyle = tint(mix(magenta, palette.wall, 0.25));
  ctx.beginPath();
  ctx.ellipse(sway, -height - unit * 3, unit * 8, unit * 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tint(palette.wall);
  ctx.fillRect(sway - unit * 7.6, -height - unit * 3.4, unit * 15.2, unit * 0.8);
  ctx.fillStyle = tint(shade(magenta, -0.2));
  for (const fin of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sway - unit * 6, -height - unit * 3);
    ctx.lineTo(sway - unit * 9.5, -height - unit * 3 + fin * unit * 3);
    ctx.lineTo(sway - unit * 8.6, -height - unit * 3);
    ctx.fill();
  }
}

/** A hot-air balloon in show colours, its basket swinging underneath. */
function hotAirBalloon(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
  time: number,
  variant: number,
) {
  const drift = Math.sin(time * 0.3 + variant) * unit * 3;
  const y = -unit * (100 + (variant % 3) * 12) + Math.sin(time * 0.6 + variant) * unit;
  const colours = palette.festive;
  // Vertical gores: thin ellipses of alternating colour over the envelope.
  const gores = 5;
  for (let gore = gores - 1; gore >= 0; gore--) {
    const share = (gore + 1) / gores;
    ctx.fillStyle = tint(colours[(gore + variant) % colours.length] as string);
    ctx.beginPath();
    ctx.ellipse(drift, y, unit * 6 * share, unit * 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = withAlpha(palette.ink, 0.5);
  ctx.lineWidth = Math.max(0.5, unit * 0.1);
  ctx.beginPath();
  ctx.moveTo(drift - unit * 3, y + unit * 6);
  ctx.lineTo(drift - unit * 1, y + unit * 10);
  ctx.moveTo(drift + unit * 3, y + unit * 6);
  ctx.lineTo(drift + unit * 1, y + unit * 10);
  ctx.stroke();
  ctx.fillStyle = tint(palette.trunk);
  ctx.fillRect(drift - unit * 1.2, y + unit * 10, unit * 2.4, unit * 1.6);
}

/** A striped marquee with a pennant on its pole. */
function marquee(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
  variant: number,
) {
  const colour = palette.festive[variant % palette.festive.length] as string;
  const width = 8;
  ctx.fillStyle = tint(palette.wall);
  ctx.fillRect(-unit * width, -unit * 4, unit * width * 2, unit * 4);
  ctx.fillStyle = tint(colour);
  for (let stripe = 0; stripe < 8; stripe += 2) {
    ctx.fillRect(-unit * width + stripe * unit * 2, -unit * 4, unit * 2, unit * 4);
  }
  ctx.beginPath();
  ctx.moveTo(-unit * (width + 1), -unit * 4);
  ctx.lineTo(0, -unit * 9);
  ctx.lineTo(unit * (width + 1), -unit * 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = tint(palette.trunk);
  ctx.lineWidth = Math.max(0.6, unit * 0.2);
  ctx.beginPath();
  ctx.moveTo(0, -unit * 9);
  ctx.lineTo(0, -unit * 11);
  ctx.stroke();
  ctx.fillStyle = tint(palette.festive[(variant + 1) % palette.festive.length] as string);
  ctx.beginPath();
  ctx.moveTo(0, -unit * 11);
  ctx.lineTo(unit * 2, -unit * 10.4);
  ctx.lineTo(0, -unit * 9.8);
  ctx.fill();
}

/** A wooden grandstand full of tiny spectators. */
function grandstand(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
  variant: number,
) {
  ctx.fillStyle = tint(palette.trunk);
  ctx.beginPath();
  ctx.moveTo(-unit * 9, 0);
  ctx.lineTo(-unit * 9, -unit * 2);
  ctx.lineTo(unit * 9, -unit * 7);
  ctx.lineTo(unit * 9, 0);
  ctx.closePath();
  ctx.fill();
  for (let row = 0; row < 3; row++) {
    for (let seat = 0; seat < 12; seat++) {
      if ((seat * 7 + row * 3 + variant) % 5 === 0) continue;
      const x = -unit * 8.3 + seat * unit * 1.45;
      const rise = (x + unit * 9) / (unit * 18);
      const y = -unit * (2.4 + rise * 5) + row * unit * 0.95 - unit * 0.6;
      ctx.fillStyle = tint(
        palette.festive[(seat + row + variant) % palette.festive.length] as string,
      );
      ctx.beginPath();
      ctx.arc(x, y - row * unit * 1.6, unit * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = tint(palette.roof);
  ctx.beginPath();
  ctx.moveTo(-unit * 10, -unit * 7.5);
  ctx.lineTo(unit * 10, -unit * 12);
  ctx.lineTo(unit * 10, -unit * 11);
  ctx.lineTo(-unit * 10, -unit * 6.5);
  ctx.closePath();
  ctx.fill();
}

/** A string of triangular flags between two poles, flapping. */
function bunting(ctx: CanvasRenderingContext2D, unit: number, palette: Palette, time: number) {
  ctx.strokeStyle = palette.trunk;
  ctx.lineWidth = Math.max(0.6, unit * 0.2);
  ctx.beginPath();
  ctx.moveTo(-unit * 6, 0);
  ctx.lineTo(-unit * 6, -unit * 4.5);
  ctx.moveTo(unit * 6, 0);
  ctx.lineTo(unit * 6, -unit * 4.5);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(palette.ink, 0.6);
  ctx.lineWidth = Math.max(0.4, unit * 0.08);
  ctx.beginPath();
  ctx.moveTo(-unit * 6, -unit * 4.4);
  ctx.quadraticCurveTo(0, -unit * 3.2, unit * 6, -unit * 4.4);
  ctx.stroke();
  for (let flag = 0; flag < 7; flag++) {
    const t = (flag + 0.5) / 7;
    const x = -unit * 6 + t * unit * 12;
    const y = -unit * 4.4 + Math.sin(t * Math.PI) * unit * 0.6;
    const flap = Math.sin(time * 5 + flag) * unit * 0.2;
    ctx.fillStyle = palette.festive[flag % palette.festive.length] as string;
    ctx.beginPath();
    ctx.moveTo(x - unit * 0.6, y);
    ctx.lineTo(x + unit * 0.6, y);
    ctx.lineTo(x + flap, y + unit * 1.3);
    ctx.closePath();
    ctx.fill();
  }
}

/** The big wheel, turning slowly; its cars light up at night. */
function ferrisWheel(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
  time: number,
) {
  const radius = unit * 14;
  const hubY = -unit * 17;
  ctx.strokeStyle = tint(palette.metal);
  ctx.lineWidth = Math.max(0.8, unit * 0.3);
  ctx.beginPath();
  ctx.moveTo(-unit * 6, 0);
  ctx.lineTo(0, hubY);
  ctx.lineTo(unit * 6, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, hubY, radius, 0, Math.PI * 2);
  ctx.stroke();
  const cars = 10;
  const turn = time * 0.15;
  for (let car = 0; car < cars; car++) {
    const angle = turn + (car / cars) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = hubY + Math.sin(angle) * radius;
    ctx.lineWidth = Math.max(0.4, unit * 0.1);
    ctx.beginPath();
    ctx.moveTo(0, hubY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = tint(palette.festive[car % palette.festive.length] as string);
    ctx.fillRect(x - unit * 1, y, unit * 2, unit * 1.6);
    if (palette.daylight < 0.5) {
      ctx.fillStyle = withAlpha('#ffe6a0', 0.85);
      ctx.beginPath();
      ctx.arc(x, y, unit * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function trunk(
  ctx: CanvasRenderingContext2D,
  unit: number,
  width: number,
  height: number,
  colour: string,
) {
  ctx.fillStyle = colour;
  ctx.fillRect(-unit * width * 0.5, -unit * height, unit * width, unit * height);
}

/** A gouache foliage mass: dark body, a lighter sunlit cap. */
function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  dark: string,
  light: string,
) {
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(
    x - radiusX * 0.18,
    y - radiusY * 0.22,
    radiusX * 0.72,
    radiusY * 0.66,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

function house(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
  barn: boolean,
  variant: number,
) {
  const width = barn ? 9 : 7;
  const height = barn ? 4.5 : 4;
  ctx.fillStyle = tint(barn ? mix(palette.roof, palette.trunk, 0.5) : palette.wall);
  ctx.fillRect((-unit * width) / 2, -unit * height, unit * width, unit * height);
  ctx.fillStyle = tint(palette.roof);
  ctx.beginPath();
  ctx.moveTo(-unit * (width / 2 + 0.8), -unit * height);
  ctx.lineTo(0, -unit * (height + (barn ? 3.4 : 3.8)));
  ctx.lineTo(unit * (width / 2 + 0.8), -unit * height);
  ctx.closePath();
  ctx.fill();
  // Windows: dark by day, warm lanterns by night.
  const lit = palette.daylight < 0.5;
  ctx.fillStyle = lit ? palette.window : tint(palette.window);
  const windows = barn ? [0] : [-1.8, 1.8];
  windows.forEach((offset, index) => {
    if (lit && (variant + index) % 3 === 0) return;
    ctx.fillRect(unit * (offset - 0.55), -unit * (height - 1.2), unit * 1.1, unit * 1.2);
  });
  if (lit) {
    ctx.fillStyle = 'rgba(255, 190, 90, 0.18)';
    ctx.beginPath();
    ctx.arc(0, -unit * height * 0.5, unit * 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!barn) {
    ctx.fillStyle = tint(shade(palette.roof, -0.25));
    ctx.fillRect(unit * 1.6, -unit * (height + 3.2), unit * 0.9, unit * 1.6);
  }
}

function church(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
  variant: number,
) {
  ctx.fillStyle = tint(palette.wall);
  ctx.fillRect(-unit * 5, -unit * 5, unit * 8, unit * 5);
  ctx.fillRect(unit * 2, -unit * 10, unit * 3, unit * 10);
  ctx.fillStyle = tint(palette.roof);
  ctx.beginPath();
  ctx.moveTo(-unit * 5.6, -unit * 5);
  ctx.lineTo(-unit * 1, -unit * 8);
  ctx.lineTo(unit * 2, -unit * 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tint(shade(palette.roof, -0.3));
  ctx.beginPath();
  ctx.moveTo(unit * 1.6, -unit * 10);
  ctx.lineTo(unit * 3.5, -unit * (variant % 2 === 0 ? 16 : 14));
  ctx.lineTo(unit * 5.4, -unit * 10);
  ctx.closePath();
  ctx.fill();
}

function windmill(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
  time: number,
) {
  ctx.fillStyle = tint(palette.wall);
  ctx.beginPath();
  ctx.moveTo(-unit * 2.4, 0);
  ctx.lineTo(-unit * 1.5, -unit * 9);
  ctx.lineTo(unit * 1.5, -unit * 9);
  ctx.lineTo(unit * 2.4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tint(palette.roof);
  ctx.beginPath();
  ctx.arc(0, -unit * 9, unit * 1.8, Math.PI, 0);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -unit * 9.4);
  ctx.rotate(time * 0.6);
  ctx.strokeStyle = tint(palette.trunk);
  ctx.fillStyle = tint(withAlpha(palette.canvas, 0.85));
  for (let sail = 0; sail < 4; sail++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillRect(unit * 0.4, -unit * 0.7, unit * 6, unit * 1.4);
  }
  ctx.restore();
}

/** A Bessonneau-style canvas hangar: arched, on a wooden frame. */
function hangarTent(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
) {
  ctx.fillStyle = tint(palette.canvas);
  ctx.beginPath();
  ctx.moveTo(-unit * 9, 0);
  ctx.lineTo(-unit * 9, -unit * 4);
  ctx.quadraticCurveTo(0, -unit * 11, unit * 9, -unit * 4);
  ctx.lineTo(unit * 9, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = tint(palette.canvasShade);
  ctx.lineWidth = Math.max(1, unit * 0.3);
  for (let rib = -6; rib <= 6; rib += 3) {
    ctx.beginPath();
    ctx.moveTo(rib * unit, 0);
    ctx.lineTo(rib * unit * 0.9, -unit * (7.4 - Math.abs(rib) * 0.4));
    ctx.stroke();
  }
}

function windsock(ctx: CanvasRenderingContext2D, unit: number, palette: Palette, time: number) {
  ctx.strokeStyle = palette.trunk;
  ctx.lineWidth = Math.max(1, unit * 0.3);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -unit * 8);
  ctx.stroke();
  const flap = Math.sin(time * 5) * unit * 0.3;
  const stripes = ['#e8582f', '#f3eee2', '#e8582f'];
  stripes.forEach((colour, index) => {
    ctx.fillStyle = colour;
    const x = index * unit * 1.3;
    ctx.beginPath();
    ctx.moveTo(x, -unit * (8 - index * 0.1));
    ctx.lineTo(x + unit * 1.3, -unit * (8 - (index + 1) * 0.12) + flap * index * 0.4);
    ctx.lineTo(x + unit * 1.3, -unit * (6.8 + (index + 1) * 0.12) + flap * index * 0.4);
    ctx.lineTo(x, -unit * (6.6 + index * 0.1));
    ctx.closePath();
    ctx.fill();
  });
}

/** A kite balloon high over the lines, swaying on its long cable. */
function balloon(
  ctx: CanvasRenderingContext2D,
  unit: number,
  palette: Palette,
  tint: (colour: string) => string,
  time: number,
) {
  const sway = Math.sin(time * 0.4) * unit * 2;
  const height = unit * 120;
  ctx.strokeStyle = withAlpha(palette.ink, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(sway * 0.5, -height * 0.5, sway, -height);
  ctx.stroke();
  ctx.fillStyle = tint(mix(palette.canvas, palette.haze, 0.2));
  ctx.beginPath();
  ctx.ellipse(sway, -height - unit * 2.5, unit * 7, unit * 2.6, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tint(palette.canvasShade);
  for (const fin of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(
      sway - unit * 6,
      -height - unit * 2.5 + fin * unit * 1.6,
      unit * 1.8,
      unit * 0.9,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.strokeStyle = withAlpha(palette.ink, 0.6);
  ctx.strokeRect(sway - unit * 0.6, -height + unit * 0.4, unit * 1.2, unit * 0.9);
}
