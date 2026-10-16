/**
 * A faint paper-and-brush texture laid over the whole picture, so the
 * flat code-drawn shapes read as gouache on paper rather than vector art.
 */
let pattern: { canvas: HTMLCanvasElement } | null = null;

function grainCanvas(): HTMLCanvasElement {
  if (pattern) return pattern.canvas;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(size, size);
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let index = 0; index < image.data.length; index += 4) {
      const value = 128 + (random() - 0.5) * 70;
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    // Dry-brush streaks, mostly horizontal like the strokes of a landscape.
    for (let stroke = 0; stroke < 90; stroke++) {
      const shade = random() < 0.5 ? 255 : 0;
      ctx.strokeStyle = `rgba(${shade}, ${shade}, ${shade}, ${(0.04 + random() * 0.05).toFixed(3)})`;
      ctx.lineWidth = 1 + random() * 3;
      const x = random() * size;
      const y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 20 + random() * 50, y + (random() - 0.5) * 6);
      ctx.stroke();
    }
  }
  pattern = { canvas };
  return canvas;
}

export function paintGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strength: number,
) {
  const fill = ctx.createPattern(grainCanvas(), 'repeat');
  if (!fill) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = strength;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
