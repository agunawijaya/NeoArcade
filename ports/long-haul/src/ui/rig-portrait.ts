import { poseCamera, posterLight, WHOLE_RIG } from '../render/vehicles/hero';
import { RIG_LIGHTS_OFF, type RigModel } from '../render/vehicles/rig/model';
import { drawRig } from '../render/vehicles/rig/rig';
import { h } from './dom';

/**
 * A picture of the rig, three-quarters from the front, in its paint and
 * with the parts it carries: a snapshot for the garage wall or pinned to
 * the logbook. Drawn once, at the screen's resolution.
 */
export function rigPortrait(
  model: RigModel,
  options: { width: number; height: number; sunAltitude: number; label: string; className: string },
): HTMLCanvasElement {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const canvas = h('canvas', {
    class: options.className,
    width: Math.round(options.width * ratio),
    height: Math.round(options.height * ratio),
    role: 'img',
    'aria-label': options.label,
  }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(ratio, ratio);
  const env = posterLight(options.sunAltitude);
  // A studio backdrop rather than a road: sky colour fading to a paler floor.
  const backdrop = ctx.createLinearGradient(0, 0, 0, options.height);
  backdrop.addColorStop(0, `rgb(${env.skyTop.join(', ')})`);
  backdrop.addColorStop(0.6, `rgb(${env.skyHorizon.join(', ')})`);
  backdrop.addColorStop(1, '#8b8577');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, options.width, options.height);
  const camera = poseCamera({
    azimuth: 32,
    elevation: 9,
    ...WHOLE_RIG,
    rect: { x: 0, y: 0, width: options.width, height: options.height },
    margin: Math.round(options.height * 0.08),
  });
  const footprint = [
    camera.project([-1, 0, -5]),
    camera.project([67, 0, -5]),
    camera.project([67, 0, 5]),
    camera.project([-1, 0, 5]),
  ];
  ctx.fillStyle = 'rgba(20, 16, 10, 0.28)';
  ctx.filter = 'blur(4px)';
  ctx.beginPath();
  footprint.forEach((point, index) =>
    index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
  );
  ctx.closePath();
  ctx.fill();
  ctx.filter = 'none';
  drawRig(ctx, model, { lights: RIG_LIGHTS_OFF, turn: 0, steer: 0, sway: 0 }, camera, env);
  return canvas;
}
