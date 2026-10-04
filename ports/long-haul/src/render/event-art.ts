import type { EventArt } from '../game/event-copy';

/**
 * The pictures on the event cards: bold, flat, a little like a road safety
 * poster. Each is drawn on a 480 × 270 board and scaled to the card.
 */
const W = 480;
const H = 270;

type Draw = (ctx: CanvasRenderingContext2D, time: number) => void;

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

function rigNose(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  colour = '#b8312a',
) {
  // The front of the rig, side on, facing right.
  ctx.fillStyle = '#d7dadd';
  ctx.fillRect(x - 160 * s, y - 92 * s, 150 * s, 66 * s);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(x, y - 96 * s, 46 * s, 70 * s, 6 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 44 * s, y - 64 * s);
  ctx.lineTo(x + 110 * s, y - 58 * s);
  ctx.lineTo(x + 112 * s, y - 26 * s);
  ctx.lineTo(x + 44 * s, y - 26 * s);
  ctx.fill();
  ctx.fillStyle = '#9fc3d9';
  ctx.fillRect(x + 20 * s, y - 88 * s, 22 * s, 22 * s);
  ctx.fillStyle = '#e5e7ea';
  ctx.fillRect(x + 108 * s, y - 60 * s, 6 * s, 34 * s);
  wheel(ctx, x + 88 * s, y - 14 * s, 14 * s);
  wheel(ctx, x - 10 * s, y - 14 * s, 14 * s);
  wheel(ctx, x - 130 * s, y - 14 * s, 14 * s);
}

function police(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, time: number) {
  ctx.fillStyle = '#e9e6dc';
  ctx.beginPath();
  ctx.roundRect(x - 70 * s, y - 40 * s, 140 * s, 28 * s, 8 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x - 36 * s, y - 62 * s, 70 * s, 26 * s, 8 * s);
  ctx.fill();
  ctx.fillStyle = '#20314f';
  ctx.fillRect(x - 70 * s, y - 28 * s, 140 * s, 10 * s);
  ctx.fillStyle = '#9fc3d9';
  ctx.fillRect(x - 28 * s, y - 58 * s, 26 * s, 18 * s);
  ctx.fillRect(x + 4 * s, y - 58 * s, 26 * s, 18 * s);
  const flash = Math.floor(time * 4) % 2 === 0;
  ctx.fillStyle = flash ? '#ff2a2a' : '#5a1010';
  ctx.fillRect(x - 22 * s, y - 70 * s, 20 * s, 9 * s);
  ctx.fillStyle = flash ? '#163a7a' : '#2f7bff';
  ctx.fillRect(x + 2 * s, y - 70 * s, 20 * s, 9 * s);
  wheel(ctx, x - 42 * s, y - 10 * s, 12 * s);
  wheel(ctx, x + 42 * s, y - 10 * s, 12 * s);
  if (flash) {
    const glow = ctx.createRadialGradient(x, y - 66 * s, 0, x, y - 66 * s, 120 * s);
    glow.addColorStop(0, 'rgba(255, 40, 40, 0.35)');
    glow.addColorStop(1, 'rgba(255, 40, 40, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 120 * s, y - 180 * s, 240 * s, 220 * s);
  }
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
  police(ctx, time) {
    sky(ctx, '#20263f', '#5a4a6e');
    road(ctx);
    rigNose(ctx, 250, 215, 0.95);
    police(ctx, 80, 228, 0.85, time);
    label(ctx, 'PULL OVER', 380, 50, 34, '#ffd23a');
  },
  radar(ctx, time) {
    sky(ctx, '#8fc4e8', '#e6d9b8');
    road(ctx);
    ctx.fillStyle = '#5f6266';
    ctx.fillRect(120, 70, 8, 130);
    ctx.fillRect(300, 70, 8, 130);
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(90, 40, 250, 90);
    label(ctx, 'SPEED CHECKED', 215, 72, 30, '#b3261e');
    label(ctx, 'BY RADAR', 215, 106, 26);
    police(ctx, 220, 222, 0.7, time);
  },
  scale(ctx) {
    sky(ctx, '#9bc9e6', '#efe3c4');
    road(ctx, 215);
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
    ctx.fillStyle = '#7d7f84';
    ctx.fillRect(200, 205, 270, 12);
    rigNose(ctx, 330, 205, 0.8);
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
  reefer(ctx, time) {
    sky(ctx, '#f0c58a', '#f5e6c8');
    road(ctx);
    ctx.fillStyle = '#eef0ee';
    ctx.fillRect(40, 80, 330, 120);
    ctx.fillStyle = '#c9cdd1';
    ctx.fillRect(370, 95, 50, 80);
    ctx.fillStyle = '#5b6066';
    for (let vent = 0; vent < 4; vent++) ctx.fillRect(380, 105 + vent * 16, 30, 8);
    for (let puff = 0; puff < 4; puff++) {
      const t = (time * 0.6 + puff / 4) % 1;
      ctx.fillStyle = `rgba(60, 60, 60, ${0.5 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(400 + t * 30, 90 - t * 60, 10 + t * 18, 0, Math.PI * 2);
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
  blowout(ctx) {
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
    wheel(ctx, 240, 150, 50);
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
  crash(ctx, time) {
    sky(ctx, '#3a3048', '#a0607a');
    road(ctx, 215);
    ctx.save();
    ctx.translate(250, 175);
    ctx.rotate(-0.28);
    ctx.fillStyle = '#d7dadd';
    ctx.fillRect(-170, -60, 170, 60);
    ctx.fillStyle = '#b8312a';
    ctx.fillRect(5, -70, 70, 70);
    ctx.restore();
    for (let star = 0; star < 6; star++) {
      const angle = time * 2 + (star / 6) * Math.PI * 2;
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
  time: number,
) {
  ctx.save();
  ctx.scale(width / W, height / H);
  ART[art](ctx, time);
  ctx.restore();
}
