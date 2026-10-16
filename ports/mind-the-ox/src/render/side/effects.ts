import { TURN } from '../../engine/trig';
import type { World } from '../../engine/world';
import type { Palette } from '../palette';
import type { Particle } from '../particles';
import type { Splat } from '../view';
import type { SideCamera } from './camera';
import { mix, shade, withAlpha } from './colour';

/** Smoke and dust go behind the planes; fire, sparks and flashes in front. */
export function isBackParticle(particle: Particle): boolean {
  return (
    particle.kind === 'smoke' ||
    particle.kind === 'puff' ||
    particle.kind === 'dirt' ||
    particle.kind === 'flour' ||
    particle.kind === 'contrail'
  );
}

/** A contrail's colour: its own, or for a rainbow one a hue that walks along the trail. */
export function contrailColour(particle: Particle): string {
  if (particle.tint !== 'rainbow') return particle.tint ?? '#ffffff';
  const hue = (particle.seed * 37) % 360;
  return `hsl(${hue}, 85%, 68%)`;
}

/** A parachute canopy in its side's colour. */
export function canopyColour(particle: Particle, palette: Palette): string {
  return particle.tint === 'foe' ? palette.liveries[1].linen : palette.liveries[0].linen;
}

export function paintParticles(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  particles: readonly Particle[],
  back: boolean,
) {
  const left = camera.worldX(-40);
  const right = camera.worldX(camera.viewport.width + 40);
  for (const particle of particles) {
    if (particle.x < left || particle.x > right || isBackParticle(particle) !== back) continue;
    const t = particle.age / particle.life;
    const x = camera.x(particle.x);
    const y = camera.y(particle.y);
    const unit = camera.scale;
    switch (particle.kind) {
      case 'smoke':
      case 'puff': {
        const radius = particle.size * (0.7 + t * 1.7) * unit;
        const colour = mix(
          mix(palette.cloud.light, palette.smoke, 0.35),
          shade(palette.smoke, -0.4),
          particle.darkness,
        );
        const alpha =
          (particle.kind === 'puff' ? 0.45 : 0.6) * (1 - t) * Math.min(1, particle.age * 12);
        const soft = ctx.createRadialGradient(x, y, 0, x, y, radius);
        soft.addColorStop(0, withAlpha(colour, alpha));
        soft.addColorStop(0.55, withAlpha(colour, alpha * 0.75));
        soft.addColorStop(1, withAlpha(colour, 0));
        ctx.fillStyle = soft;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'spray':
        ctx.fillStyle = withAlpha(palette.sea.foam, 0.85 * (1 - t * 0.5));
        ctx.beginPath();
        ctx.ellipse(x, y, particle.size * unit * 0.7, particle.size * unit, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'column': {
        // A plume of water thrown up from the surface: rising fast, then falling back to foam.
        const rise =
          Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - Math.max(0, t - 0.55) * 1.6);
        const height = particle.size * 18 * unit * Math.max(0, rise);
        const width = particle.size * unit * (2.4 + t * 3);
        const water = ctx.createLinearGradient(0, y - height, 0, y);
        water.addColorStop(0, withAlpha(palette.sea.foam, 0.35 * (1 - t)));
        water.addColorStop(0.3, withAlpha(palette.sea.foam, 0.85 * (1 - t * 0.7)));
        water.addColorStop(1, withAlpha(mix(palette.sea.foam, palette.sea.near, 0.35), 0.7));
        ctx.fillStyle = water;
        ctx.beginPath();
        ctx.moveTo(x - width, y);
        ctx.quadraticCurveTo(x - width * 0.9, y - height * 0.6, x - width * 0.35, y - height);
        ctx.quadraticCurveTo(x, y - height * 1.08, x + width * 0.35, y - height);
        ctx.quadraticCurveTo(x + width * 0.9, y - height * 0.6, x + width, y);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'fire': {
        // A licking flame: hot core, orange body, red edge, stretched upwards.
        const radius = particle.size * (1 - t * 0.6) * unit;
        const alpha = 0.85 * (1 - t);
        const flame = ctx.createRadialGradient(x, y + radius * 0.3, 0, x, y, radius);
        flame.addColorStop(0, withAlpha(palette.fire[0], alpha));
        flame.addColorStop(0.45, withAlpha(palette.fire[1], alpha * 0.85));
        flame.addColorStop(1, withAlpha(palette.fire[2], 0));
        ctx.fillStyle = flame;
        ctx.beginPath();
        ctx.ellipse(x, y - radius * 0.35, radius * 0.75, radius * 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'spark':
        ctx.strokeStyle = withAlpha(palette.fire[0], 1 - t);
        ctx.lineWidth = Math.max(1, unit * 0.3);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - particle.vx * 0.03 * unit, y + particle.vy * 0.03 * unit);
        ctx.stroke();
        break;
      case 'contrail': {
        const radius = particle.size * (0.6 + t * 1.4) * unit;
        ctx.fillStyle = withAlpha(contrailColour(particle), 0.55 * (1 - t));
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'confetti':
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(particle.age * particle.spin);
        ctx.fillStyle = withAlpha(
          palette.festive[particle.seed % palette.festive.length] as string,
          1 - t * 0.6,
        );
        ctx.fillRect(
          -unit * 0.45,
          -unit * 0.25,
          unit * 0.9,
          unit * 0.5 * Math.cos(particle.age * 9),
        );
        ctx.restore();
        break;
      case 'flour':
        ctx.fillStyle = withAlpha('#fbf8f0', 0.9 * (1 - t));
        ctx.beginPath();
        ctx.arc(x, y, particle.size * unit * (0.8 + t), 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'dirt':
        ctx.fillStyle = withAlpha(palette.soil[0], 1 - t * 0.5);
        ctx.fillRect(
          x - particle.size * unit * 0.5,
          y - particle.size * unit * 0.5,
          particle.size * unit,
          particle.size * unit,
        );
        break;
      case 'splinter':
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(particle.spin * particle.age);
        ctx.fillStyle = particle.seed % 2 === 0 ? palette.liveries[0].strut : palette.canvas;
        ctx.fillRect(-particle.size * unit, -unit * 0.25, particle.size * unit * 2, unit * 0.5);
        ctx.restore();
        break;
      case 'feather':
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(particle.age * 5 + particle.seed) * 0.8);
        ctx.fillStyle = withAlpha(
          particle.seed % 3 === 0 ? palette.cloud.light : palette.bird,
          1 - t * 0.7,
        );
        ctx.beginPath();
        ctx.ellipse(0, 0, particle.size * unit, particle.size * unit * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      case 'flash': {
        const radius = particle.size * (0.6 + t) * unit;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, withAlpha(palette.fire[0], 0.95 * (1 - t)));
        glow.addColorStop(0.4, withAlpha(palette.fire[1], 0.6 * (1 - t)));
        glow.addColorStop(1, withAlpha(palette.fire[1], 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ring':
        ctx.strokeStyle = withAlpha(palette.cloud.light, 0.5 * (1 - t));
        ctx.lineWidth = Math.max(1, unit * 0.6 * (1 - t));
        ctx.beginPath();
        ctx.arc(x, y, particle.size * t * unit, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'parachute':
        paintParachute(ctx, x, y, unit, particle, palette);
        break;
    }
  }
}

function paintParachute(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  unit: number,
  particle: Particle,
  palette: Palette,
) {
  const sway = Math.sin(particle.age * 1.3) * 0.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.fillStyle = canopyColour(particle, palette);
  ctx.beginPath();
  ctx.ellipse(0, -unit * 6, unit * 3.4, unit * 2, 0, Math.PI, 0);
  ctx.fill();
  // Gores in the canopy.
  ctx.strokeStyle = withAlpha(palette.ink, 0.25);
  ctx.lineWidth = Math.max(0.5, unit * 0.12);
  ctx.beginPath();
  for (const gore of [-1.7, 0, 1.7]) {
    ctx.moveTo(gore * unit, -unit * 6);
    ctx.quadraticCurveTo(gore * unit * 0.8, -unit * 7.5, gore * unit * 0.6, -unit * 7.9);
  }
  ctx.stroke();
  ctx.strokeStyle = withAlpha(palette.ink, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const end of [-3.2, -1.1, 1.1, 3.2]) {
    ctx.moveTo(end * unit, -unit * 6);
    ctx.lineTo(0, -unit * 1.2);
  }
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.fillRect(-unit * 0.35, -unit * 1.2, unit * 0.7, unit * 1.6);
  ctx.restore();
}

/** Bullets as glowing tracer streaks; bombs, rockets, flares and wreckage. */
export function paintProjectiles(
  ctx: CanvasRenderingContext2D,
  camera: SideCamera,
  palette: Palette,
  world: World,
  time: number,
) {
  const unit = camera.scale;
  const night = palette.daylight < 0.5;
  ctx.lineCap = 'round';
  for (const shot of world.shots) {
    const x = camera.x(shot.x);
    const y = camera.y(shot.y);
    if (shot.shell) {
      // An anti-aircraft shell on its way up: a dark dot, a spark of its fuze by night.
      ctx.fillStyle = night ? withAlpha(palette.fire[1], 0.8) : withAlpha(palette.ink, 0.75);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, unit * 0.32), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const tailX = camera.x(shot.x - shot.vx * 2.2);
    const tailY = camera.y(shot.y - shot.vy * 2.2);
    if (night) {
      ctx.strokeStyle = withAlpha(palette.tracer, 0.25);
      ctx.lineWidth = Math.max(3, unit * 1.2);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.strokeStyle = palette.tracer;
    ctx.lineWidth = Math.max(1.2, unit * 0.4);
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  for (const bomb of world.bombs) {
    paintBomb(
      ctx,
      camera.x(bomb.x),
      camera.y(bomb.y),
      Math.atan2(-bomb.vy, bomb.vx),
      unit,
      palette,
    );
  }
  for (const missile of world.missiles) {
    const x = camera.x(missile.x);
    const y = camera.y(missile.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-(missile.heading / TURN) * Math.PI * 2);
    ctx.fillStyle = palette.metal;
    ctx.fillRect(-unit * 1.6, -unit * 0.35, unit * 3.2, unit * 0.7);
    ctx.fillStyle = '#c8412f';
    ctx.beginPath();
    ctx.moveTo(unit * 1.6, -unit * 0.4);
    ctx.lineTo(unit * 2.4, 0);
    ctx.lineTo(unit * 1.6, unit * 0.4);
    ctx.fill();
    if (!missile.burnedOut) {
      ctx.fillStyle = withAlpha(palette.fire[1], 0.6 + Math.sin(time * 40) * 0.3);
      ctx.beginPath();
      ctx.ellipse(-unit * 2.4, 0, unit * 1, unit * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  for (const burst of world.bursts) {
    const x = camera.x(burst.x);
    const y = camera.y(burst.y);
    const flicker = 0.75 + Math.sin(time * 30 + burst.id) * 0.25;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, unit * 6 * flicker);
    glow.addColorStop(0, 'rgba(255, 255, 240, 0.95)');
    glow.addColorStop(0.3, withAlpha(palette.fire[1], 0.55));
    glow.addColorStop(1, withAlpha(palette.fire[1], 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, unit * 6 * flicker, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const piece of world.debris) {
    const x = camera.x(piece.x);
    const y = camera.y(piece.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * (3 + piece.shape) + piece.id);
    ctx.fillStyle =
      piece.shape % 3 === 0
        ? palette.fire[1]
        : piece.shape % 3 === 1
          ? shade(palette.metal, -0.3)
          : palette.liveries[0].strut;
    ctx.fillRect(-unit * 0.9, -unit * 0.4, unit * 1.8, unit * 0.8);
    ctx.restore();
  }
}

function paintBomb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  unit: number,
  palette: Palette,
) {
  ctx.save();
  ctx.translate(x, y);
  if (palette.theme === 'airshow') {
    paintFlourBag(ctx, unit, angle);
    ctx.restore();
    return;
  }
  ctx.rotate(angle);
  ctx.fillStyle = shade(palette.metal, -0.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, unit * 1.5, unit * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(palette.metal, -0.45);
  ctx.beginPath();
  ctx.moveTo(-unit * 1.2, 0);
  ctx.lineTo(-unit * 2.3, -unit * 0.8);
  ctx.lineTo(-unit * 2.3, unit * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The Airshow's bomb: a tied sack of flour, tumbling. */
function paintFlourBag(ctx: CanvasRenderingContext2D, unit: number, angle: number) {
  ctx.rotate(angle * 0.5 + Math.PI / 2);
  ctx.fillStyle = '#f6f0e0';
  ctx.beginPath();
  ctx.ellipse(0, unit * 0.2, unit * 0.9, unit * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8a46a';
  ctx.fillRect(-unit * 0.35, -unit * 1.2, unit * 0.7, unit * 0.45);
  ctx.strokeStyle = 'rgba(120, 96, 60, 0.6)';
  ctx.lineWidth = Math.max(0.5, unit * 0.12);
  ctx.beginPath();
  ctx.moveTo(-unit * 0.5, unit * 0.1);
  ctx.lineTo(unit * 0.5, unit * 0.1);
  ctx.stroke();
}

/**
 * Marks on the pilot's goggles, drawn over the whole screen: 1984's splatted
 * bird and bullet holes, here as goo with a feather or two, and starred
 * glass. They fade as the pilot wipes them.
 */
export function paintSplats(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  splats: readonly Splat[],
  daylight: number,
) {
  for (const splat of splats) {
    const fade = Math.max(0, Math.min(1, 1 - (splat.age - 4) / 2));
    if (fade <= 0) continue;
    const x = splat.x * width;
    const y = splat.y * height;
    const radius = splat.size * Math.min(width, height);
    ctx.save();
    ctx.globalAlpha = fade;
    if (splat.kind === 'hole') paintCrackedGlass(ctx, x, y, radius, splat.seed);
    else paintGoo(ctx, x, y, radius, splat.seed, splat.kind === 'ox', daylight < 0.5);
    ctx.restore();
  }
}

function paintGoo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  seed: number,
  mud: boolean,
  moonlit: boolean,
) {
  // By moonlight the goo is as dim as everything else, not a white glare over the night.
  const [base, edge] = mud
    ? moonlit
      ? ['rgba(60, 46, 38, 0.9)', 'rgba(42, 32, 26, 0.95)']
      : ['rgba(98, 70, 44, 0.9)', 'rgba(70, 50, 30, 0.95)']
    : moonlit
      ? ['rgba(150, 158, 182, 0.9)', 'rgba(108, 114, 138, 0.95)']
      : ['rgba(244, 240, 226, 0.92)', 'rgba(205, 198, 172, 0.95)'];
  ctx.fillStyle = base;
  ctx.beginPath();
  for (let lobe = 0; lobe < 11; lobe++) {
    const angle = (lobe / 11) * Math.PI * 2;
    const reach = radius * (0.65 + ((seed * (lobe + 3)) % 7) * 0.07);
    const px = x + Math.cos(angle) * reach;
    const py = y + Math.sin(angle) * reach;
    if (lobe === 0) ctx.moveTo(px, py);
    else
      ctx.quadraticCurveTo(
        x + Math.cos(angle - 0.3) * reach * 1.2,
        y + Math.sin(angle - 0.3) * reach * 1.2,
        px,
        py,
      );
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(2, radius * 0.06);
  ctx.stroke();
  // Drips running down the goggles.
  ctx.fillStyle = base;
  for (let drip = 0; drip < 3; drip++) {
    const dx = (((seed * (drip + 2)) % 9) / 9 - 0.5) * radius;
    const length = radius * (0.5 + ((seed + drip) % 5) * 0.18);
    ctx.fillRect(x + dx - radius * 0.05, y + radius * 0.4, radius * 0.1, length);
    ctx.beginPath();
    ctx.arc(x + dx, y + radius * 0.4 + length, radius * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!mud) {
    ctx.strokeStyle = 'rgba(60, 54, 50, 0.85)';
    ctx.lineWidth = Math.max(1.5, radius * 0.04);
    for (let feather = 0; feather < 2; feather++) {
      const angle = seed + feather * 2.1;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * radius * 0.2, y + Math.sin(angle) * radius * 0.2);
      ctx.quadraticCurveTo(
        x + Math.cos(angle + 0.4) * radius * 0.9,
        y + Math.sin(angle + 0.4) * radius * 0.6,
        x + Math.cos(angle) * radius * 1.3,
        y + Math.sin(angle) * radius,
      );
      ctx.stroke();
    }
  }
}

function paintCrackedGlass(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  seed: number,
) {
  ctx.strokeStyle = 'rgba(240, 246, 250, 0.85)';
  ctx.lineWidth = Math.max(1, radius * 0.03);
  ctx.beginPath();
  for (let crack = 0; crack < 9; crack++) {
    const angle = (crack / 9) * Math.PI * 2 + seed;
    const reach = radius * (0.6 + ((seed * (crack + 1)) % 5) * 0.12);
    ctx.moveTo(x, y);
    ctx.lineTo(
      x + Math.cos(angle) * reach * 0.5,
      y + Math.sin(angle) * reach * 0.5 + radius * 0.04,
    );
    ctx.lineTo(x + Math.cos(angle + 0.06) * reach, y + Math.sin(angle + 0.06) * reach);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(20, 18, 16, 0.85)';
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.08, 0, Math.PI * 2);
  ctx.fill();
}
