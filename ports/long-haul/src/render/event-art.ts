import type { EventArt } from '../game/event-copy';
import { placedCamera, type Camera } from './vehicles/camera';
import { posterLight, poseCamera, RigPortrait, SedanPortrait, WHOLE_SEDAN } from './vehicles/hero';
import { RIG_LIGHTS_OFF, type RigModel } from './vehicles/rig/model';
import { barFlash, washWith } from './vehicles/sedan/lightbar';
import { PATROL, SEDAN_LIGHTS_OFF } from './vehicles/sedan/model';
import { wheelPart } from './vehicles/wheels';
import { drawPart } from './vehicles/parts';

/**
 * The pictures on the event cards: bold and simple, a little like a road
 * safety poster, with the rig and the patrol car drawn from the same models
 * as the road, in the rig's own paint. Each is drawn on a 480 × 270 board
 * and scaled to the card.
 */
const W = 480;
const H = 270;

interface ArtFrame {
  time: number;
  rig: RigModel;
  reducedMotion: boolean;
}

type Draw = (ctx: CanvasRenderingContext2D, frame: ArtFrame) => void;

const INK = '#1d1a16';
const ROAD = '#3f4247';
const LINE = '#f0e6c8';

function sky(ctx: CanvasRenderingContext2D, top: string, bottom: string) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

function road(ctx: CanvasRenderingContext2D, y = 200) {
  ctx.fillStyle = ROAD;
  ctx.fillRect(0, y, W, H - y);
  ctx.fillStyle = LINE;
  for (let x = 10; x < W; x += 70) ctx.fillRect(x, y + (H - y) * 0.45, 38, 5);
}

/** The vehicles on the cards, kept painted between frames. */
const portraits = {
  rig: new RigPortrait(),
  cruiser: new SedanPortrait(),
};

function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b9bec4';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * The road under a posed vehicle, in the same projection: asphalt from
 * `near` to `far` across, with a shoulder line, so the vehicle stands on it.
 */
function groundPlane(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  colour: string,
  from: number,
  to: number,
) {
  const corners = [
    camera.project([from, 0, -14]),
    camera.project([to, 0, -14]),
    camera.project([to, 0, 16]),
    camera.project([from, 0, 16]),
  ];
  ctx.fillStyle = colour;
  ctx.beginPath();
  corners.forEach((corner, index) =>
    index === 0 ? ctx.moveTo(corner.x, corner.y) : ctx.lineTo(corner.x, corner.y),
  );
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(240, 230, 200, 0.75)';
  ctx.lineWidth = 2;
  const a = camera.project([from, 0, 6.5]);
  const b = camera.project([to, 0, 6.5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/** The rig, three-quarters from the front, filling a rectangle of the board. */
function rigPortrait(
  ctx: CanvasRenderingContext2D,
  frame: ArtFrame,
  key: string,
  rect: { x: number; y: number; width: number; height: number },
  sunAltitude: number,
  azimuth = 34,
) {
  const camera = poseCamera({
    azimuth,
    elevation: 9,
    min: [0, 0, -4.8],
    max: [65.6, 13.6, 4.8],
    rect,
  });
  const night = sunAltitude < -4;
  groundPlane(ctx, camera, night ? '#23262c' : ROAD, -40, 110);
  portraits.rig.draw(
    ctx,
    frame.rig,
    { ...RIG_LIGHTS_OFF, head: night, markers: night },
    posterLight(sunAltitude),
    camera,
    key,
  );
}

/** Pulled over at night: the rig on the shoulder, the cruiser ahead of it, the light bar going. */
function pulledOver(ctx: CanvasRenderingContext2D, frame: ArtFrame) {
  const env = posterLight(-18);
  const camera = poseCamera({
    azimuth: 46,
    elevation: 8,
    min: [0, 0, -4.8],
    max: [92, 13.6, 7],
    rect: { x: 6, y: 38, width: 468, height: 196 },
  });
  groundPlane(ctx, camera, '#1c1f26', -40, 130);
  const blink = frame.reducedMotion || Math.floor(frame.time * 3) % 2 === 0;
  portraits.rig.draw(
    ctx,
    frame.rig,
    { ...RIG_LIGHTS_OFF, head: true, markers: true, left: blink, right: blink, cab: 0.4 },
    env,
    camera,
    'police',
  );
  const car = placedCamera(camera, [72, 0, 2.6]);
  portraits.cruiser.draw(
    ctx,
    PATROL,
    {
      lights: { ...SEDAN_LIGHTS_OFF, head: true, markers: true, bar: true, spot: true },
      turn: 0,
      steer: 0,
      sway: 0,
    },
    env,
    car,
    'police',
    frame.time,
    frame.reducedMotion,
  );
  const roof = car.project([7.5, 5, 0]);
  washWith(ctx, roof.x, roof.y + 20, 230, barFlash(frame.time, frame.reducedMotion), 0.85, 0.6);
}

/** The cruiser parked by the road, nose out, its radar on the traffic. */
function radarCar(ctx: CanvasRenderingContext2D, frame: ArtFrame) {
  const camera = poseCamera({
    azimuth: 24,
    elevation: 8,
    ...WHOLE_SEDAN,
    rect: { x: 228, y: 112, width: 236, height: 118 },
  });
  groundPlane(ctx, camera, ROAD, -30, 60);
  portraits.cruiser.draw(
    ctx,
    PATROL,
    { lights: SEDAN_LIGHTS_OFF, turn: 0, steer: 0, sway: 0 },
    posterLight(38),
    camera,
    'radar',
    frame.time,
    frame.reducedMotion,
  );
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  colour = INK,
) {
  ctx.fillStyle = colour;
  ctx.font = `800 ${size}px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function signPost(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  lines: string[],
  ink = INK,
) {
  ctx.fillStyle = '#5f6266';
  ctx.fillRect(x - 3, y, 6, 200 - y + 30);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h, w, h, 6);
  ctx.fill();
  lines.forEach((line, index) =>
    label(
      ctx,
      line,
      x,
      y - h + ((index + 0.5) * h) / lines.length,
      Math.min(26, (h / lines.length) * 0.62),
      ink,
    ),
  );
}

const ART: Readonly<Record<EventArt, Draw>> = {
  police(ctx, frame) {
    sky(ctx, '#0b1128', '#3a2f55');
    ctx.fillStyle = '#12151c';
    ctx.fillRect(0, 150, W, H - 150);
    pulledOver(ctx, frame);
    label(ctx, 'PULL OVER', 396, 30, 30, '#ffd23a');
  },
  radar(ctx, frame) {
    sky(ctx, '#8fc4e8', '#e6d9b8');
    ctx.fillStyle = '#5f6266';
    ctx.fillRect(60, 70, 8, 130);
    ctx.fillRect(220, 70, 8, 130);
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(30, 40, 230, 90);
    label(ctx, 'SPEED CHECKED', 145, 72, 28, '#b3261e');
    label(ctx, 'BY RADAR', 145, 106, 24);
    radarCar(ctx, frame);
  },
  scale(ctx, frame) {
    sky(ctx, '#9bc9e6', '#efe3c4');
    ctx.fillStyle = '#b9b29a';
    ctx.fillRect(0, 196, W, H - 196);
    ctx.fillStyle = '#d9d1c1';
    ctx.fillRect(30, 110, 150, 100);
    ctx.fillStyle = '#5a5048';
    ctx.beginPath();
    ctx.moveTo(20, 110);
    ctx.lineTo(105, 75);
    ctx.lineTo(190, 110);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(60, 135, 90, 34);
    label(ctx, '61,040', 105, 152, 26, '#ff4a2e');
    rigPortrait(ctx, frame, 'scale', { x: 196, y: 92, width: 280, height: 128 }, 45, 62);
    label(ctx, 'WEIGH STATION', 330, 40, 30, '#1d7a46');
  },
  construction(ctx) {
    sky(ctx, '#9fd0ef', '#f4e4bf');
    road(ctx);
    for (let cone = 0; cone < 7; cone++) {
      const x = 40 + cone * 62;
      ctx.fillStyle = '#f07a1a';
      ctx.beginPath();
      ctx.moveTo(x - 16, 232);
      ctx.lineTo(x, 182);
      ctx.lineTo(x + 16, 232);
      ctx.fill();
      ctx.fillStyle = '#f4f1e6';
      ctx.fillRect(x - 9, 204, 18, 7);
    }
    signPost(ctx, 380, 140, 110, 90, '#f28c1a', ['ROAD', 'WORK', 'AHEAD']);
    signPost(ctx, 110, 150, 80, 100, '#f6f6f2', ['SPEED', 'LIMIT', '35']);
  },
  toll(ctx) {
    sky(ctx, '#a7d3ee', '#f1e6c9');
    road(ctx);
    ctx.fillStyle = '#f2c23a';
    ctx.fillRect(30, 60, 420, 34);
    label(ctx, 'TOLL', 240, 78, 30);
    ctx.fillStyle = '#d0ccc0';
    for (const x of [60, 200, 340]) ctx.fillRect(x, 94, 14, 110);
    ctx.fillStyle = '#efe9db';
    ctx.fillRect(220, 120, 80, 84);
    ctx.fillStyle = '#9fc3d9';
    ctx.fillRect(232, 132, 56, 34);
    ctx.fillStyle = '#e9c27a';
    ctx.beginPath();
    ctx.arc(330, 150, 18, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, '$', 330, 151, 22, '#7a5a1a');
  },
  slide(ctx) {
    sky(ctx, '#8ab4cf', '#c9c2ad');
    ctx.fillStyle = '#5d6a4a';
    ctx.beginPath();
    ctx.moveTo(0, 210);
    ctx.quadraticCurveTo(200, 20, 480, 60);
    ctx.lineTo(480, 210);
    ctx.fill();
    road(ctx, 210);
    ctx.fillStyle = '#8f8b82';
    ctx.fillRect(250, 110, 150, 100);
    ctx.fillStyle = '#121212';
    ctx.beginPath();
    ctx.moveTo(275, 210);
    ctx.lineTo(275, 160);
    ctx.arc(325, 160, 50, Math.PI, 0);
    ctx.lineTo(375, 210);
    ctx.fill();
    ctx.fillStyle = '#7d6d5d';
    for (let rock = 0; rock < 9; rock++) {
      ctx.beginPath();
      ctx.arc(230 + rock * 22, 214 - (rock % 3) * 6, 16 + (rock % 4) * 4, Math.PI, 0);
      ctx.fill();
    }
    signPost(ctx, 110, 150, 100, 80, '#f28c1a', ['ROAD', 'CLOSED']);
  },
  reefer(ctx, frame) {
    sky(ctx, '#f0c58a', '#f5e6c8');
    road(ctx);
    // The trailer's nose and its sick refrigeration unit, smoking.
    const camera = poseCamera({
      azimuth: 42,
      elevation: 12,
      min: [38, 5, -4.5],
      max: [50, 14, 4.5],
      rect: { x: 230, y: 30, width: 240, height: 200 },
    });
    portraits.rig.draw(
      ctx,
      { ...frame.rig, cargo: 'oranges' },
      RIG_LIGHTS_OFF,
      posterLight(14),
      camera,
      'reefer',
    );
    const unit = camera.project([46.9, 12.4, 0]);
    for (let puff = 0; puff < 4; puff++) {
      const t = ((frame.reducedMotion ? 0.5 : frame.time * 0.6) + puff / 4) % 1;
      ctx.fillStyle = `rgba(60, 60, 60, ${0.5 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(unit.x + t * 30, unit.y - t * 60, 10 + t * 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f28c28';
    ctx.beginPath();
    ctx.arc(170, 140, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(158, 132, 3.5, 0, Math.PI * 2);
    ctx.arc(182, 132, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(170, 160, 10, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.fillStyle = '#5fb4ff';
    ctx.beginPath();
    ctx.ellipse(196, 122, 4, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
  },
  blowout(ctx, frame) {
    sky(ctx, '#a7d3ee', '#f1e6c9');
    road(ctx);
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    for (let point = 0; point < 16; point++) {
      const angle = (point / 16) * Math.PI * 2;
      const r = point % 2 === 0 ? 110 : 60;
      ctx.lineTo(240 + Math.cos(angle) * r, 140 + Math.sin(angle) * r * 0.8);
    }
    ctx.closePath();
    ctx.fill();
    // One of the rig's own tyres, its rim polished.
    const camera = poseCamera({
      azimuth: 70,
      elevation: 6,
      min: [-1.8, 0, 2.9],
      max: [1.8, 3.5, 3.9],
      rect: { x: 180, y: 92, width: 120, height: 116 },
    });
    drawPart(
      ctx,
      wheelPart(
        { centre: [0, 1.72, 3.4], radius: 1.72, width: 0.9, rim: 'polished', side: 1 },
        frame.reducedMotion ? 0 : frame.time * 2,
        frame.rig.dirt,
      ),
      camera,
      posterLight(40),
    );
    ctx.fillStyle = INK;
    for (const [x, y, a] of [
      [120, 220, 0.4],
      [370, 210, -0.6],
      [330, 60, 1.2],
      [150, 70, -1],
    ] as const) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillRect(-18, -5, 36, 10);
      ctx.restore();
    }
    label(ctx, 'BANG!', 240, 40, 40, '#b3261e');
  },
  tow(ctx) {
    sky(ctx, '#f2b77a', '#f6e2c0');
    road(ctx);
    ctx.fillStyle = '#e0a21a';
    ctx.beginPath();
    ctx.roundRect(250, 150, 120, 50, 8);
    ctx.fill();
    ctx.fillRect(250, 120, 60, 40);
    ctx.fillStyle = '#9fc3d9';
    ctx.fillRect(262, 128, 36, 22);
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(360, 150);
    ctx.lineTo(420, 90);
    ctx.lineTo(430, 160);
    ctx.stroke();
    wheel(ctx, 280, 205, 18);
    wheel(ctx, 350, 205, 18);
    wheel(ctx, 120, 190, 34);
    label(ctx, '$400', 120, 70, 40, '#b3261e');
  },
  dry(ctx) {
    sky(ctx, '#f0b27a', '#f8e5c6');
    road(ctx);
    ctx.fillStyle = '#0b0c0f';
    ctx.beginPath();
    ctx.arc(160, 130, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9e6dc';
    ctx.beginPath();
    ctx.arc(160, 130, 70, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, 'E', 112, 160, 26);
    label(ctx, 'F', 208, 160, 26);
    ctx.strokeStyle = '#ff4a2e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(160, 150);
    ctx.lineTo(100, 120);
    ctx.stroke();
    ctx.fillStyle = '#2f6e45';
    ctx.beginPath();
    ctx.roundRect(300, 80, 110, 130, 10);
    ctx.fill();
    ctx.fillStyle = '#26583a';
    for (const y of [110, 150, 190]) ctx.fillRect(300, y, 110, 8);
    label(ctx, 'DUMMY !!', 360, 40, 34, '#b3261e');
  },
  detour(ctx) {
    sky(ctx, '#9fd0ef', '#efe4c4');
    road(ctx);
    signPost(ctx, 140, 150, 170, 70, '#f28c1a', ['DETOUR', '→']);
    ctx.fillStyle = '#e9dfc4';
    ctx.beginPath();
    ctx.roundRect(270, 50, 180, 130, 8);
    ctx.fill();
    ctx.strokeStyle = '#b3261e';
    ctx.lineWidth = 5;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(285, 150);
    ctx.quadraticCurveTo(360, 50, 435, 150);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, '+200 MI', 360, 160, 24, '#2c2418');
  },
  crash(ctx, frame) {
    sky(ctx, '#3a3048', '#a0607a');
    ctx.fillStyle = '#4a3a4a';
    ctx.fillRect(0, 200, W, H - 200);
    ctx.save();
    ctx.translate(240, 160);
    ctx.rotate(-0.22);
    ctx.translate(-240, -160);
    rigPortrait(ctx, frame, 'crash', { x: 40, y: 80, width: 400, height: 150 }, 2, 28);
    ctx.restore();
    for (let star = 0; star < 6; star++) {
      const angle = (frame.reducedMotion ? 0 : frame.time * 2) + (star / 6) * Math.PI * 2;
      label(ctx, '✶', 250 + Math.cos(angle) * 120, 110 + Math.sin(angle) * 50, 24, '#ffd23a');
    }
    label(ctx, 'C R A S H !!', 240, 40, 42, '#ffd23a');
  },
  jail(ctx) {
    sky(ctx, '#3e4a5e', '#7d8aa0');
    ctx.fillStyle = '#d8d1c2';
    ctx.fillRect(100, 60, 280, 170);
    ctx.fillStyle = '#5a5048';
    ctx.beginPath();
    ctx.moveTo(80, 60);
    ctx.lineTo(240, 15);
    ctx.lineTo(400, 60);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(170, 110, 140, 100);
    ctx.fillStyle = '#9aa0a6';
    for (let bar = 0; bar < 7; bar++) ctx.fillRect(176 + bar * 20, 110, 8, 100);
    label(ctx, 'COUNTY JAIL', 240, 85, 28);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 230, W, 40);
  },
  'time-zone'(ctx) {
    sky(ctx, '#bfe1f3', '#efe7cf');
    ctx.fillStyle = '#f4f1e6';
    ctx.beginPath();
    ctx.arc(240, 135, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 8;
    ctx.stroke();
    for (let hour = 0; hour < 12; hour++) {
      const angle = (hour / 12) * Math.PI * 2;
      ctx.fillStyle = INK;
      ctx.fillRect(240 + Math.cos(angle) * 72 - 3, 135 + Math.sin(angle) * 72 - 3, 6, 6);
    }
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(240, 135);
    ctx.lineTo(240, 80);
    ctx.moveTo(240, 135);
    ctx.lineTo(285, 135);
    ctx.stroke();
    ctx.strokeStyle = '#1d7a46';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(240, 135, 110, -Math.PI * 0.4, -Math.PI * 0.1);
    ctx.stroke();
  },
  arrival(ctx) {
    sky(ctx, '#ff9f6a', '#ffe0b0');
    ctx.fillStyle = '#4f5664';
    for (let tower = 0; tower < 18; tower++) {
      const height = 40 + ((tower * 53) % 9) * 14;
      ctx.fillRect(tower * 27, 200 - height, 24, height);
    }
    road(ctx, 200);
    label(ctx, 'WELCOME', 240, 60, 40, '#2c2418');
  },
  warehouse(ctx) {
    sky(ctx, '#141a30', '#3b3f66');
    ctx.fillStyle = '#f1ead2';
    ctx.beginPath();
    ctx.arc(390, 60, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a8178';
    ctx.fillRect(40, 90, 330, 130);
    ctx.fillStyle = '#3c3a38';
    for (let door = 0; door < 4; door++) ctx.fillRect(60 + door * 80, 140, 55, 80);
    signPost(ctx, 420, 170, 90, 60, '#b3261e', ['CLOSED'], '#f4f1e6');
    road(ctx, 220);
  },
};

export function paintEventArt(
  ctx: CanvasRenderingContext2D,
  art: EventArt,
  width: number,
  height: number,
  frame: ArtFrame,
) {
  ctx.save();
  ctx.scale(width / W, height / H);
  ART[art](ctx, frame);
  ctx.restore();
}
