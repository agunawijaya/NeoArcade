import { lit, type Lighting } from './colour';

/**
 * Things at a waypoint that the rig drives past in the side view: a toll
 * plaza, a scale house, a work zone, a radar car behind a billboard, a
 * rock slide, the truck stop's pole sign, state-line and guide signs, and
 * the warehouse at the end. Each is drawn with its foot at the far edge of
 * the road (`y`), centred on `x`, with `u` a size unit (1 % of the view's
 * height).
 */
export type LandmarkKind =
  | 'toll'
  | 'scale'
  | 'construction'
  | 'radar'
  | 'slide'
  | 'truck-stop'
  | 'welcome'
  | 'guide'
  | 'limit'
  | 'dock'
  | 'tunnel';

export interface Landmark {
  id: string;
  kind: LandmarkKind;
  /** Scroll position at which it is level with the cab. */
  u: number;
  label?: string;
  detail?: string;
}

export interface LandmarkFrame {
  light: Lighting;
  night: number;
  time: number;
  reducedMotion: boolean;
}

function sign(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  border: string,
  lines: readonly string[],
  text: string,
  light: Lighting,
  u: number,
) {
  ctx.fillStyle = lit('#6b6f75', light);
  ctx.fillRect(x - width * 0.3, y - height - u * 4, u * 0.5, height + u * 4);
  ctx.fillRect(x + width * 0.3 - u * 0.5, y - height - u * 4, u * 0.5, height + u * 4);
  ctx.fillStyle = lit(fill, light);
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height - u * 4, width, height, u * 0.8);
  ctx.fill();
  ctx.strokeStyle = lit(border, light);
  ctx.lineWidth = Math.max(1, u * 0.35);
  ctx.beginPath();
  ctx.roundRect(x - width / 2 + u * 0.5, y - height - u * 3.5, width - u, height - u, u * 0.6);
  ctx.stroke();
  ctx.fillStyle = lit(text, light);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineHeight = (height - u * 1.5) / lines.length;
  lines.forEach((line, index) => {
    ctx.font = `700 ${Math.min(lineHeight * 0.72, (width / Math.max(4, line.length)) * 1.7)}px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif`;
    ctx.fillText(line, x, y - height - u * 4 + u * 0.75 + lineHeight * (index + 0.5));
  });
}

export function paintLandmark(
  ctx: CanvasRenderingContext2D,
  landmark: Landmark,
  x: number,
  y: number,
  u: number,
  frame: LandmarkFrame,
) {
  const { light } = frame;
  switch (landmark.kind) {
    case 'guide':
      sign(
        ctx,
        x,
        y,
        u * 22,
        u * 9,
        '#1f6e45',
        '#f2f2ea',
        [landmark.label ?? '', landmark.detail ?? ''],
        '#f7f7f0',
        light,
        u,
      );
      return;
    case 'welcome':
      sign(
        ctx,
        x,
        y,
        u * 20,
        u * 8,
        '#2a4f8f',
        '#f2f2ea',
        ['WELCOME TO', (landmark.label ?? '').toUpperCase()],
        '#f7f7f0',
        light,
        u,
      );
      return;
    case 'limit':
      sign(
        ctx,
        x,
        y,
        u * 6.5,
        u * 8.5,
        '#f6f6f2',
        '#1b1b1b',
        ['SPEED', 'LIMIT', landmark.label ?? '55'],
        '#1b1b1b',
        light,
        u,
      );
      return;
    case 'toll':
      paintToll(ctx, x, y, u, frame, landmark.label ?? '');
      return;
    case 'scale':
      paintScale(ctx, x, y, u, frame, landmark.detail !== 'closed');
      return;
    case 'construction':
      sign(
        ctx,
        x - u * 18,
        y,
        u * 9,
        u * 9,
        '#f28c1a',
        '#1b1b1b',
        ['ROAD', 'WORK'],
        '#1b1b1b',
        light,
        u,
      );
      sign(
        ctx,
        x + u * 6,
        y,
        u * 6.5,
        u * 8.5,
        '#f6f6f2',
        '#1b1b1b',
        ['SPEED', 'LIMIT', '35'],
        '#1b1b1b',
        light,
        u,
      );
      return;
    case 'radar':
      paintRadarCar(ctx, x, y, u, frame);
      return;
    case 'slide':
      paintSlide(ctx, x, y, u, frame);
      return;
    case 'truck-stop':
      paintPoleSign(ctx, x, y, u, frame, landmark.label ?? 'TRUCK STOP', landmark.detail ?? '');
      return;
    case 'dock':
      paintDock(ctx, x, y, u, frame, landmark.label ?? '');
      return;
    case 'tunnel':
      paintTunnel(ctx, x, y, u, frame);
      return;
  }
}

function paintToll(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  frame: LandmarkFrame,
  label: string,
) {
  const { light } = frame;
  ctx.fillStyle = lit('#c9c6bc', light);
  for (const offset of [-14, 0, 14])
    ctx.fillRect(x + offset * u - u * 0.6, y - u * 13, u * 1.2, u * 13);
  ctx.fillStyle = lit('#f2c23a', light);
  ctx.fillRect(x - u * 18, y - u * 16, u * 36, u * 3.4);
  ctx.fillStyle = lit('#1b1b1b', light);
  ctx.font = `800 ${u * 2.4}px "Arial Narrow", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`TOLL ${label}`.trim(), x, y - u * 14.3);
  ctx.fillStyle = lit('#e9e5da', light);
  ctx.fillRect(x - u * 4, y - u * 7, u * 5, u * 7);
  ctx.fillStyle = frame.night > 0.4 ? 'rgba(255, 220, 140, 0.9)' : lit('#7fa7c2', light);
  ctx.fillRect(x - u * 3.4, y - u * 6, u * 3.8, u * 2.5);
  ctx.fillStyle =
    frame.reducedMotion || Math.floor(frame.time * 2) % 2 === 0 ? '#3ad16a' : '#1f6e3a';
  ctx.beginPath();
  ctx.arc(x + u * 16, y - u * 11, u * 0.8, 0, Math.PI * 2);
  ctx.fill();
}

function paintScale(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  frame: LandmarkFrame,
  open: boolean,
) {
  const { light } = frame;
  ctx.fillStyle = lit('#d8d1c2', light);
  ctx.fillRect(x - u * 9, y - u * 9, u * 14, u * 9);
  ctx.fillStyle = lit('#5a5048', light);
  ctx.beginPath();
  ctx.moveTo(x - u * 10, y - u * 9);
  ctx.lineTo(x - u * 2, y - u * 12.5);
  ctx.lineTo(x + u * 6, y - u * 9);
  ctx.fill();
  ctx.fillStyle = frame.night > 0.4 ? 'rgba(255, 220, 140, 0.9)' : lit('#7fa7c2', light);
  ctx.fillRect(x - u * 7, y - u * 6.5, u * 10, u * 3);
  sign(
    ctx,
    x + u * 16,
    y,
    u * 13,
    u * 8,
    '#1b1b1b',
    '#f2f2ea',
    ['WEIGH STATION', open ? 'OPEN' : 'CLOSED'],
    open ? '#ffd23a' : '#f7f7f0',
    light,
    u,
  );
}

function paintRadarCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  frame: LandmarkFrame,
) {
  const { light } = frame;
  // A billboard, and the patrol car tucked behind its legs.
  ctx.fillStyle = lit('#55504a', light);
  ctx.fillRect(x - u * 9, y - u * 9, u * 0.8, u * 9);
  ctx.fillRect(x + u * 8, y - u * 9, u * 0.8, u * 9);
  ctx.fillStyle = lit('#e9e1cf', light);
  ctx.fillRect(x - u * 11, y - u * 17, u * 22, u * 8.5);
  ctx.fillStyle = lit('#c0392b', light);
  ctx.font = `800 ${u * 2.6}px "Arial Narrow", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EAT AT JOE’S', x, y - u * 14.2);
  ctx.fillStyle = lit('#2c2a28', light);
  ctx.fillText('NEXT EXIT', x, y - u * 11.2);
  ctx.fillStyle = lit('#1d2a44', light);
  ctx.beginPath();
  ctx.roundRect(x - u * 7, y - u * 3.6, u * 13, u * 2.6, u * 0.6);
  ctx.fill();
  ctx.fillStyle = lit('#f2f2ee', light);
  ctx.fillRect(x - u * 4.2, y - u * 5, u * 6, u * 1.6);
  ctx.fillStyle = lit('#1b1b1b', light);
  ctx.beginPath();
  ctx.arc(x - u * 4.2, y - u * 0.9, u * 1, 0, Math.PI * 2);
  ctx.arc(x + u * 3.4, y - u * 0.9, u * 1, 0, Math.PI * 2);
  ctx.fill();
  const flash = frame.reducedMotion ? 0 : Math.floor(frame.time * 4) % 2;
  ctx.fillStyle = flash === 0 ? '#ff3b30' : '#2f6bff';
  ctx.fillRect(x - u * 1.8, y - u * 5.6, u * 1.6, u * 0.6);
}

function paintSlide(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  frame: LandmarkFrame,
) {
  const { light } = frame;
  paintTunnel(ctx, x + u * 10, y, u, frame);
  ctx.fillStyle = lit('#7d6d5d', light);
  for (let rock = 0; rock < 7; rock++) {
    const rx = x - u * 8 + rock * u * 3.2;
    const r = u * (1.6 + ((rock * 37) % 7) / 4);
    ctx.beginPath();
    ctx.arc(rx, y - r * 0.6, r, Math.PI, 0);
    ctx.fill();
  }
  sign(
    ctx,
    x - u * 20,
    y,
    u * 8,
    u * 8,
    '#f28c1a',
    '#1b1b1b',
    ['ROAD', 'CLOSED'],
    '#1b1b1b',
    light,
    u,
  );
}

function paintTunnel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  frame: LandmarkFrame,
) {
  const { light } = frame;
  ctx.fillStyle = lit('#5d6a4a', light);
  ctx.beginPath();
  ctx.moveTo(x - u * 4, y);
  ctx.quadraticCurveTo(x + u * 8, y - u * 34, x + u * 40, y - u * 26);
  ctx.lineTo(x + u * 40, y);
  ctx.fill();
  ctx.fillStyle = lit('#8f8b82', light);
  ctx.fillRect(x, y - u * 15, u * 16, u * 15);
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  ctx.moveTo(x + u * 2.5, y);
  ctx.lineTo(x + u * 2.5, y - u * 8);
  ctx.arc(x + u * 8, y - u * 8, u * 5.5, Math.PI, 0);
  ctx.lineTo(x + u * 13.5, y);
  ctx.fill();
}

function paintPoleSign(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  frame: LandmarkFrame,
  name: string,
  price: string,
) {
  const { light } = frame;
  const glow = frame.night > 0.3;
  ctx.fillStyle = lit('#5f6266', light);
  ctx.fillRect(x - u * 0.6, y - u * 36, u * 1.2, u * 36);
  // The name, painted by day and in neon after dark.
  ctx.fillStyle = glow ? '#1b1d22' : lit('#f4efe2', light);
  ctx.beginPath();
  ctx.roundRect(x - u * 13, y - u * 46, u * 26, u * 10, u * 1.4);
  ctx.fill();
  ctx.strokeStyle = glow ? '#ff5a4f' : lit('#c8312a', light);
  ctx.lineWidth = u * 0.6;
  ctx.beginPath();
  ctx.roundRect(x - u * 12.2, y - u * 45.2, u * 24.4, u * 8.4, u * 1);
  if (glow) {
    ctx.shadowColor = 'rgba(255, 90, 79, 0.9)';
    ctx.shadowBlur = u * 1.6;
  }
  ctx.stroke();
  ctx.fillStyle = glow ? '#ffd9a0' : lit('#1d2330', light);
  ctx.font = `800 ${Math.min(u * 3.6, (u * 38) / Math.max(6, name.length))}px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), x, y - u * 40.8);
  ctx.shadowBlur = 0;
  // The price board.
  ctx.fillStyle = glow ? '#fff6dc' : lit('#f4f1e6', light);
  ctx.fillRect(x - u * 7.5, y - u * 34.5, u * 15, u * 7.5);
  ctx.strokeStyle = lit('#1d7a46', light);
  ctx.lineWidth = u * 0.4;
  ctx.strokeRect(x - u * 7, y - u * 34, u * 14, u * 6.5);
  ctx.fillStyle = '#1b1b1b';
  ctx.font = `800 ${u * 1.9}px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText('DIESEL', x, y - u * 32.4);
  ctx.fillStyle = '#b3261e';
  ctx.font = `800 ${u * 2.9}px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText(price, x, y - u * 29.6);
  // EAT, with an arrow to the exit.
  ctx.fillStyle = lit('#1d7a46', light);
  ctx.beginPath();
  ctx.moveTo(x - u * 6, y - u * 25.5);
  ctx.lineTo(x + u * 4.5, y - u * 25.5);
  ctx.lineTo(x + u * 7, y - u * 23.2);
  ctx.lineTo(x + u * 4.5, y - u * 21);
  ctx.lineTo(x - u * 6, y - u * 21);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = glow ? '#ffd166' : '#f6f4ea';
  ctx.font = `800 ${u * 2.4}px "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`;
  ctx.fillText('EAT · EXIT', x, y - u * 23.2);
}

function paintDock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  frame: LandmarkFrame,
  name: string,
) {
  const { light } = frame;
  ctx.fillStyle = lit('#9a8f84', light);
  ctx.fillRect(x - u * 22, y - u * 18, u * 44, u * 18);
  ctx.fillStyle = lit('#6f655c', light);
  ctx.fillRect(x - u * 22, y - u * 19.5, u * 44, u * 1.6);
  ctx.fillStyle = lit('#3c3a38', light);
  for (let door = 0; door < 4; door++)
    ctx.fillRect(x - u * 19 + door * u * 10, y - u * 11, u * 7, u * 10);
  ctx.fillStyle = lit('#f4f1e6', light);
  ctx.font = `800 ${u * 2.4}px "Arial Narrow", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), x, y - u * 15);
}
