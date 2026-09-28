/**
 * A still, code-drawn "game" behind the lab's toasts, so they can be judged
 * over something that looks like play: a night sky, a neon grid and a row of
 * towers with lit windows.
 */
export function paintPlayfield(canvas: HTMLCanvasElement): void {
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#120a2e');
  sky.addColorStop(0.6, '#3a1461');
  sky.addColorStop(1, '#ff5e8a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  ctx.fillStyle = '#fff';
  for (let star = 0; star < 90; star++) {
    ctx.globalAlpha = 0.3 + random() * 0.7;
    ctx.fillRect(random() * width, random() * height * 0.55, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  const horizon = height * 0.72;
  const sun = ctx.createRadialGradient(
    width * 0.7,
    horizon,
    10,
    width * 0.7,
    horizon,
    height * 0.3,
  );
  sun.addColorStop(0, 'rgb(255 214 100 / 0.95)');
  sun.addColorStop(0.35, 'rgb(255 110 150 / 0.5)');
  sun.addColorStop(1, 'rgb(255 110 150 / 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, width, height);

  let x = 0;
  while (x < width) {
    const towerWidth = 40 + random() * 70;
    const towerHeight = height * (0.18 + random() * 0.4);
    ctx.fillStyle = '#1a0f33';
    ctx.fillRect(x, horizon - towerHeight, towerWidth - 4, towerHeight);
    ctx.fillStyle = 'rgb(255 214 120 / 0.8)';
    for (let wy = horizon - towerHeight + 10; wy < horizon - 10; wy += 14) {
      for (let wx = x + 8; wx < x + towerWidth - 14; wx += 12) {
        if (random() > 0.55) ctx.fillRect(wx, wy, 5, 7);
      }
    }
    x += towerWidth;
  }

  ctx.fillStyle = '#0c0620';
  ctx.fillRect(0, horizon, width, height - horizon);
  ctx.strokeStyle = 'rgb(255 63 164 / 0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let line = -12; line <= 12; line++) {
    ctx.moveTo(width / 2, horizon);
    ctx.lineTo(width / 2 + line * width * 0.12, height);
  }
  for (let row = 1; row < 8; row++) {
    const y = horizon + (height - horizon) * (row / 8) ** 1.8;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}
