import type { Point } from '../engine/geometry';
import type { Gorilla, PlayerIndex } from '../engine/gorillas';
import { furColour, type Outfit } from '../wardrobe/items';
import {
  drawBanana,
  drawCape,
  drawEyewear,
  drawHeadBandana,
  drawHeadwear,
  drawNeckwear,
} from './outfit';
import { shade, withAlpha } from './palette';

/**
 * The gorillas: chunky vector apes drawn from a tiny skeleton in the 30 × 30
 * box the original sprite used. Everything is drawn facing right; player 2 is
 * mirrored. The throwing arm is the back arm, as in 1990 (player 1 threw
 * with its left, player 2 with its right).
 */
export type Mood = 'idle' | 'aim' | 'throw' | 'facepalm' | 'taunt' | 'panic' | 'dance' | 'gone';

type Mouth = 'smile' | 'grin' | 'o' | 'flat' | 'frown';
type Eyes = 'open' | 'wide' | 'closed' | 'happy';

interface Pose {
  /** Shoulder and elbow angles; 0 hangs straight down, π/2 points forward, π straight up. */
  backShoulder: number;
  backElbow: number;
  frontShoulder: number;
  frontElbow: number;
  /** 0 standing, 1 crouched. */
  crouch: number;
  headTilt: number;
  mouth: Mouth;
  eyes: Eyes;
}

/** How one gorilla looks: its outfit, and the signature colour of whoever plays it. */
export interface GorillaLook {
  fur: string;
  accent: string;
  outfit: Outfit;
}

/** Player 1 is orange and player 2 cyan, as the name plates have always been. */
export const PLAYER_ACCENTS: readonly [string, string] = ['#ff7a3d', '#3fe0ff'];

export function lookFor(outfit: Outfit, accent: string): GorillaLook {
  return { fur: furColour(outfit), accent, outfit };
}

const SHOULDER_BACK = { x: 7, y: 11.5 };
const SHOULDER_FRONT = { x: 23, y: 11.5 };
const UPPER_ARM = 7;
const FOREARM = 6.5;

/** Keeps each gorilla's mood, its aim and where it is looking, and eases between poses. */
export class GorillaActor {
  mood: Mood = 'idle';
  /** Seconds in the current mood. */
  moodTime = 0;
  /** The aim angle the raised arm shows, in the player's own degrees. */
  aimAngle = 45;
  lookAt: Point | null = null;
  holdingBanana = false;
  shielded = false;
  private pose: Pose = poseFor('idle', 0, 45, 0, 'dance-classic');
  private breath = Math.random() * 10;
  private blinkIn = 2 + Math.random() * 3;
  private blinking = 0;

  constructor(
    readonly player: PlayerIndex,
    public look: GorillaLook,
  ) {}

  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.moodTime = 0;
  }

  update(delta: number) {
    this.moodTime += delta;
    this.breath += delta;
    this.blinkIn -= delta;
    if (this.blinkIn <= 0) {
      this.blinking = 0.12;
      this.blinkIn = 2.5 + Math.random() * 3.5;
    }
    this.blinking = Math.max(0, this.blinking - delta);

    const target = poseFor(this.mood, this.moodTime, this.aimAngle, this.breath, this.dance);
    // Snappy for a throw or a robot's step, softer for everything else.
    const snappy = this.mood === 'throw' || (this.mood === 'dance' && this.dance === 'dance-robot');
    const ease = 1 - Math.exp(-delta * (snappy ? 40 : 14));
    this.pose = blendPose(this.pose, target, ease);
  }

  private get dance(): string {
    return this.look.outfit.dance;
  }

  draw(ctx: CanvasRenderingContext2D, gorilla: Gorilla, rimLight: string, time: number) {
    if (this.mood === 'gone') return;
    const pose = this.pose;
    const facingRight = this.player === 0;
    const dancing = this.mood === 'dance';
    const bounce = dancing ? danceLift(this.dance, this.moodTime) : 0;

    ctx.save();
    ctx.translate(gorilla.x, gorilla.y - bounce);
    if (!facingRight) {
      ctx.translate(30, 0);
      ctx.scale(-1, 1);
    }
    if (dancing && this.dance === 'dance-spin') {
      // Turning on the spot: the body narrows to nothing and comes back facing the other way.
      ctx.translate(15, 0);
      ctx.scale(Math.cos(this.moodTime * Math.PI * 1.6), 1);
      ctx.translate(-15, 0);
    }
    const lookDirection = this.lookDirection(gorilla, facingRight);
    const eyes = this.blinking > 0 && pose.eyes !== 'closed' ? 'closed' : pose.eyes;
    drawBody(ctx, pose, this.look, rimLight, lookDirection, eyes, this.holdingBanana, time);
    ctx.restore();

    if (this.shielded) drawShield(ctx, gorilla, this.look.accent, time);
  }

  /** Unit-ish vector from the eyes to whatever the gorilla is watching, in its own facing. */
  private lookDirection(gorilla: Gorilla, facingRight: boolean): Point {
    if (!this.lookAt) return { x: 0.6, y: 0 };
    const dx = this.lookAt.x - (gorilla.x + 15);
    const dy = this.lookAt.y - (gorilla.y + 5);
    const length = Math.hypot(dx, dy) || 1;
    return { x: ((facingRight ? dx : -dx) / length) * 0.8, y: (dy / length) * 0.8 };
  }
}

function poseFor(mood: Mood, time: number, aimAngle: number, breath: number, dance: string): Pose {
  const sway = Math.sin(breath * 2.1) * 0.05;
  const idle: Pose = {
    backShoulder: -0.28 + sway,
    backElbow: 0.35,
    frontShoulder: 0.25 - sway,
    frontElbow: -0.35,
    crouch: 0.15 + Math.sin(breath * 2.1) * 0.06,
    headTilt: 0,
    mouth: 'smile',
    eyes: 'open',
  };
  switch (mood) {
    case 'idle':
    case 'gone':
      return idle;
    case 'aim': {
      // The throwing arm cocks back over the head; steeper aims lift it higher.
      const lift = Math.min(1, Math.max(0, aimAngle / 90));
      return {
        ...idle,
        backShoulder: -Math.PI + 0.25 - lift * 0.45,
        backElbow: -1.1,
        frontShoulder: 1.1,
        frontElbow: -0.6,
        crouch: 0.35,
        mouth: 'flat',
      };
    }
    case 'throw':
      return {
        ...idle,
        backShoulder: Math.PI * 0.62,
        backElbow: 0.1,
        frontShoulder: -0.2,
        frontElbow: 0.3,
        crouch: 0.25,
        mouth: 'grin',
      };
    case 'facepalm':
      return {
        ...idle,
        frontShoulder: Math.PI * 0.72,
        frontElbow: 2.25,
        backShoulder: -0.1,
        headTilt: 0.22,
        crouch: 0.3,
        mouth: 'frown',
        eyes: 'closed',
      };
    case 'taunt': {
      const beat = Math.sin(time * Math.PI * 7) > 0;
      return {
        ...idle,
        backShoulder: beat ? 1.35 : 0.9,
        backElbow: 2.1,
        frontShoulder: beat ? 0.9 : 1.35,
        frontElbow: -2.1,
        crouch: 0.1,
        headTilt: -0.15,
        mouth: 'o',
        eyes: 'happy',
      };
    }
    case 'panic': {
      const shake = Math.sin(time * 38) * 0.12;
      return {
        ...idle,
        backShoulder: -Math.PI + 0.45 + shake,
        backElbow: -0.4,
        frontShoulder: Math.PI - 0.45 - shake,
        frontElbow: 0.4,
        crouch: 0.45,
        headTilt: -0.1,
        mouth: 'o',
        eyes: 'wide',
      };
    }
    case 'dance':
      return dancePose(dance, idle, time);
  }
}

/** The victory dances from the wardrobe. */
function dancePose(dance: string, idle: Pose, time: number): Pose {
  const happy: Pose = { ...idle, mouth: 'grin', eyes: 'happy' };
  switch (dance) {
    case 'dance-jump': {
      const airborne = Math.sin(time * Math.PI * 2) > 0;
      return {
        ...happy,
        backShoulder: -Math.PI + 0.3,
        backElbow: airborne ? -0.1 : -0.6,
        frontShoulder: Math.PI - 0.3,
        frontElbow: airborne ? 0.1 : 0.6,
        crouch: airborne ? 0 : 0.6,
      };
    }
    case 'dance-robot': {
      const step = Math.floor(time * 4) % 4;
      const up = step % 2 === 0;
      return {
        ...idle,
        backShoulder: -Math.PI / 2,
        backElbow: up ? -Math.PI / 2 : Math.PI / 2,
        frontShoulder: Math.PI / 2,
        frontElbow: up ? Math.PI / 2 : -Math.PI / 2,
        crouch: 0.15,
        headTilt: step < 2 ? -0.12 : 0.12,
        mouth: 'flat',
      };
    }
    case 'dance-spin':
      return {
        ...happy,
        backShoulder: -1.9,
        backElbow: 0.2,
        frontShoulder: 1.9,
        frontElbow: -0.2,
        crouch: 0.1,
      };
    case 'dance-flex': {
      const squeeze = (1 + Math.sin(time * Math.PI * 3)) / 2;
      return {
        ...happy,
        backShoulder: -Math.PI / 2 - 0.25 * squeeze,
        backElbow: -Math.PI / 2 - 0.2 * squeeze,
        frontShoulder: Math.PI / 2 + 0.25 * squeeze,
        frontElbow: Math.PI / 2 + 0.2 * squeeze,
        crouch: 0.3 - 0.15 * squeeze,
      };
    }
    case 'dance-thump': {
      const left = Math.sin(time * Math.PI * 6) > 0;
      return {
        ...idle,
        backShoulder: left ? 0.6 : 0.2,
        backElbow: left ? 1.6 : 0.4,
        frontShoulder: left ? 0.3 : -0.6,
        frontElbow: left ? -0.4 : -1.6,
        crouch: 0.25,
        headTilt: -0.18,
        mouth: 'o',
        eyes: 'closed',
      };
    }
    default: {
      const left = Math.sin(time * Math.PI * 2.4) > 0;
      return {
        ...happy,
        backShoulder: left ? -Math.PI + 0.2 : -0.35,
        backElbow: left ? -0.3 : 0.4,
        frontShoulder: left ? 0.35 : Math.PI - 0.2,
        frontElbow: left ? -0.4 : 0.3,
        crouch: 0.2,
        headTilt: left ? -0.08 : 0.08,
      };
    }
  }
}

/** How high a dance lifts the gorilla off its roof. */
function danceLift(dance: string, time: number): number {
  if (dance === 'dance-jump') return Math.max(0, Math.sin(time * Math.PI * 2)) * 7;
  if (dance === 'dance-robot' || dance === 'dance-spin') return 0;
  return Math.abs(Math.sin(time * Math.PI * 2.4)) * 2.2;
}

function blendPose(from: Pose, to: Pose, amount: number): Pose {
  const mix = (a: number, b: number) => a + (b - a) * amount;
  return {
    backShoulder: mix(from.backShoulder, to.backShoulder),
    backElbow: mix(from.backElbow, to.backElbow),
    frontShoulder: mix(from.frontShoulder, to.frontShoulder),
    frontElbow: mix(from.frontElbow, to.frontElbow),
    crouch: mix(from.crouch, to.crouch),
    headTilt: mix(from.headTilt, to.headTilt),
    mouth: amount > 0.3 ? to.mouth : from.mouth,
    eyes: amount > 0.3 ? to.eyes : from.eyes,
  };
}

interface Limb {
  shoulder: Point;
  elbow: Point;
  hand: Point;
}

function limb(shoulder: Point, shoulderAngle: number, elbowAngle: number): Limb {
  const elbow = {
    x: shoulder.x + Math.sin(shoulderAngle) * UPPER_ARM,
    y: shoulder.y + Math.cos(shoulderAngle) * UPPER_ARM,
  };
  const forearm = shoulderAngle + elbowAngle;
  return {
    shoulder,
    elbow,
    hand: { x: elbow.x + Math.sin(forearm) * FOREARM, y: elbow.y + Math.cos(forearm) * FOREARM },
  };
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  look: GorillaLook,
  rimLight: string,
  lookDirection: Point,
  eyes: Eyes,
  holdingBanana: boolean,
  time: number,
) {
  const drop = pose.crouch * 1.6;
  const { fur, outfit, accent } = look;
  const furDark = shade(fur, -0.35);
  const skin = shade(fur, 0.42);
  const outline = shade(fur, -0.75);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const back = limb(
    { x: SHOULDER_BACK.x, y: SHOULDER_BACK.y + drop },
    pose.backShoulder,
    pose.backElbow,
  );
  const front = limb(
    { x: SHOULDER_FRONT.x, y: SHOULDER_FRONT.y + drop },
    pose.frontShoulder,
    pose.frontElbow,
  );

  if (outfit.neckwear === 'neck-cape') drawCape(ctx, accent, drop, time);

  // Back arm and back leg sit behind the body, a shade darker.
  drawArm(ctx, back, furDark, outline);
  if (holdingBanana) drawHeldBanana(ctx, back.hand, outfit.banana, time);
  drawLeg(ctx, 11, 21 + drop, 9.3, 29.2, furDark, outline);

  // Torso: broad shoulders tapering to the hips.
  ctx.beginPath();
  ctx.moveTo(8, 23 + drop);
  ctx.bezierCurveTo(4.5, 19 + drop, 3.6, 12 + drop, 6.5, 9.5 + drop);
  ctx.bezierCurveTo(9.5, 6.8 + drop, 20.5, 6.8 + drop, 23.5, 9.5 + drop);
  ctx.bezierCurveTo(26.4, 12 + drop, 25.5, 19 + drop, 22, 23 + drop);
  ctx.closePath();
  ctx.fillStyle = fur;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = outline;
  ctx.stroke();

  // Chest plates.
  ctx.fillStyle = withAlpha(skin, 0.55);
  ctx.beginPath();
  ctx.ellipse(12.8, 14.2 + drop, 3.3, 2.8, -0.2, 0, Math.PI * 2);
  ctx.ellipse(17.8, 14.2 + drop, 3.3, 2.8, 0.2, 0, Math.PI * 2);
  ctx.fill();

  drawLeg(ctx, 19, 21 + drop, 20.8, 29.2, fur, outline);

  // Sky light catching the top of the shoulders.
  ctx.beginPath();
  ctx.moveTo(6.2, 10.8 + drop);
  ctx.bezierCurveTo(9.5, 7.6 + drop, 20.5, 7.6 + drop, 23.8, 10.8 + drop);
  ctx.strokeStyle = withAlpha(rimLight, 0.8);
  ctx.lineWidth = 0.9;
  ctx.stroke();

  drawNeckwear(ctx, outfit.neckwear, accent, drop, time);
  drawHead(ctx, pose, look, skin, furDark, outline, rimLight, lookDirection, eyes, drop, time);
  drawArm(ctx, front, fur, outline);
}

function drawArm(ctx: CanvasRenderingContext2D, arm: Limb, colour: string, outline: string) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(arm.shoulder.x, arm.shoulder.y);
    ctx.lineTo(arm.elbow.x, arm.elbow.y);
    ctx.lineTo(arm.hand.x, arm.hand.y);
  };
  path();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 6.2;
  ctx.stroke();
  path();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 4.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(arm.hand.x, arm.hand.y, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  footX: number,
  footY: number,
  colour: string,
  outline: string,
) {
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(footX, footY - 1.4);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 6.6;
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(footX + 0.8, footY - 0.4, 3, 1.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(colour, -0.15);
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  look: GorillaLook,
  skin: string,
  furDark: string,
  outline: string,
  rimLight: string,
  lookDirection: Point,
  eyes: Eyes,
  drop: number,
  time: number,
) {
  const { outfit, accent } = look;
  ctx.save();
  ctx.translate(16, 6 + drop);
  ctx.rotate(pose.headTilt);

  // Skull with the classic sagittal crest.
  ctx.beginPath();
  ctx.moveTo(-5.4, 1.5);
  ctx.bezierCurveTo(-6, -3.5, -2.5, -6.4, 0.3, -6.2);
  ctx.bezierCurveTo(3.8, -6, 6.2, -3.4, 5.8, 1.2);
  ctx.bezierCurveTo(5.4, 4.6, -5, 4.8, -5.4, 1.5);
  ctx.fillStyle = look.fur;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = outline;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0.3, -1.2, 5.2, Math.PI * 1.15, Math.PI * 1.6);
  ctx.strokeStyle = withAlpha(rimLight, 0.6);
  ctx.lineWidth = 0.7;
  ctx.stroke();

  if (outfit.neckwear === 'neck-bandana') drawHeadBandana(ctx, accent);

  // Muzzle.
  ctx.beginPath();
  ctx.ellipse(1.6, 1.8, 3.9, 2.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin;
  ctx.fill();
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = withAlpha(outline, 0.7);
  ctx.stroke();

  // Heavy brow over the eyes.
  ctx.fillStyle = furDark;
  ctx.beginPath();
  ctx.ellipse(1.2, -1.3, 4.6, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();

  drawEyes(ctx, eyes, lookDirection, outline);

  ctx.fillStyle = outline;
  ctx.beginPath();
  ctx.arc(1, 1.2, 0.45, 0, Math.PI * 2);
  ctx.arc(2.6, 1.2, 0.45, 0, Math.PI * 2);
  ctx.fill();

  drawMouth(ctx, pose.mouth, outline);
  drawEyewear(ctx, outfit.eyewear, accent);
  drawHeadwear(ctx, outfit.headwear, accent, time);
  ctx.restore();
}

function drawEyes(ctx: CanvasRenderingContext2D, eyes: Eyes, look: Point, outline: string) {
  const sockets = [-0.6, 3];
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.6;
  for (const x of sockets) {
    if (eyes === 'closed') {
      ctx.beginPath();
      ctx.moveTo(x - 1, -0.2);
      ctx.lineTo(x + 1, -0.2);
      ctx.stroke();
      continue;
    }
    if (eyes === 'happy') {
      ctx.beginPath();
      ctx.arc(x, 0.3, 0.9, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      continue;
    }
    const size = eyes === 'wide' ? 1.25 : 0.95;
    ctx.beginPath();
    ctx.ellipse(x, -0.2, size, size * 0.85, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fbf6ee';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + look.x * 0.45, -0.2 + look.y * 0.35, eyes === 'wide' ? 0.4 : 0.55, 0, Math.PI * 2);
    ctx.fillStyle = '#140a0c';
    ctx.fill();
  }
}

function drawMouth(ctx: CanvasRenderingContext2D, mouth: Mouth, outline: string) {
  ctx.strokeStyle = outline;
  ctx.fillStyle = '#3a1418';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  switch (mouth) {
    case 'smile':
      ctx.arc(1.8, 2.2, 1.6, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      return;
    case 'grin':
      ctx.moveTo(-0.4, 2.6);
      ctx.quadraticCurveTo(1.8, 5.2, 4, 2.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    case 'o':
      ctx.ellipse(1.8, 3.2, 1.1, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    case 'frown':
      ctx.arc(1.8, 4.4, 1.6, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      return;
    case 'flat':
      ctx.moveTo(0.4, 3.1);
      ctx.lineTo(3.2, 3);
      ctx.stroke();
  }
}

function drawHeldBanana(ctx: CanvasRenderingContext2D, hand: Point, skin: string, time: number) {
  ctx.save();
  ctx.translate(hand.x, hand.y - 1.5);
  ctx.rotate(-0.6);
  drawBanana(ctx, skin, false, time);
  ctx.restore();
}

function drawShield(ctx: CanvasRenderingContext2D, gorilla: Gorilla, colour: string, time: number) {
  const centre = { x: gorilla.x + 15, y: gorilla.y + 16 };
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(centre.x, centre.y, 10, centre.x, centre.y, 21);
  glow.addColorStop(0, withAlpha(colour, 0));
  glow.addColorStop(0.8, withAlpha(colour, 0.12 + pulse * 0.08));
  glow.addColorStop(1, withAlpha(colour, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, 21, Math.PI, Math.PI * 2);
  ctx.lineTo(centre.x + 21, gorilla.y + 30);
  ctx.lineTo(centre.x - 21, gorilla.y + 30);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, 19.5, Math.PI * 1.02, Math.PI * 1.98);
  ctx.strokeStyle = withAlpha(colour, 0.55 + pulse * 0.3);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}
