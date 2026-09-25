import type { Input } from '@shared/input';
import type { Point } from '../engine/geometry';
import { gorillaCentre, throwingHand, type Gorilla, type PlayerIndex } from '../engine/gorillas';
import type { Camera } from '../render/camera';
import { aimFromDrag, clampAim, swing, type Aim } from './aim';
import type { Action } from './controls';
import { TypedEntry, type TypedResult } from './typed-entry';

/** How far from a gorilla's middle a press still grabs the slingshot. */
const GRAB_RADIUS = 70;
/** Holding a key this long switches from single nudges to a smooth sweep. */
const SWEEP_AFTER = 0.3;

export interface AimStep {
  aim: Aim;
  /** The player let go of a drag or pressed throw. */
  throwNow: boolean;
  /** The rubber band to draw, if dragging. */
  band: { from: Point; to: Point } | null;
  /** The angle crossed a whole degree, worth a tick of sound. */
  ticked: boolean;
}

/**
 * A person aiming: keys and sticks nudge on a tap and sweep when held (Shift
 * or LB for fine steps), the pointer works as a slingshot, and Classic mode
 * types numbers like 1990.
 */
export class HumanAim {
  readonly typed = new TypedEntry();
  private dragging = false;
  private holdTime = 0;

  reset() {
    this.dragging = false;
    this.holdTime = 0;
    this.typed.reset();
  }

  update(
    delta: number,
    player: PlayerIndex,
    current: Aim,
    input: Input<Action>,
    camera: Camera,
    gorilla: Gorilla,
  ): AimStep {
    let aim = this.steer(delta, player, current, input);
    const ticked = Math.floor(aim.angle) !== Math.floor(current.angle);

    const { pointer } = input;
    const hand = throwingHand(gorilla, player);
    const at = camera.toWorld({ x: pointer.x, y: pointer.y });
    if (pointer.wasPressed) {
      const centre = gorillaCentre(gorilla);
      this.dragging = Math.hypot(at.x - centre.x, at.y - centre.y) < GRAB_RADIUS;
    }
    if (!this.dragging) {
      return { aim, throwNow: input.wasPressed('fire'), band: null, ticked };
    }

    const pulled = aimFromDrag(player, hand, at);
    if (pulled) aim = pulled;
    if (pointer.wasReleased) {
      this.dragging = false;
      return { aim, throwNow: pulled !== null, band: null, ticked };
    }
    return { aim, throwNow: false, band: pulled ? { from: hand, to: at } : null, ticked };
  }

  typeKey(key: string): TypedResult {
    return this.typed.key(key);
  }

  private steer(delta: number, player: PlayerIndex, current: Aim, input: Input<Action>): Aim {
    const fine = input.isDown('fine');
    const horizontal = input.value('left') - input.value('right');
    const vertical = input.value('up') - input.value('down');
    this.holdTime = horizontal !== 0 || vertical !== 0 ? this.holdTime + delta : 0;

    let aim = current;
    const nudge = fine ? 0.1 : 1;
    if (input.wasPressed('left')) aim = swing(player, aim, nudge);
    if (input.wasPressed('right')) aim = swing(player, aim, -nudge);
    if (input.wasPressed('up')) aim = clampAim({ ...aim, power: aim.power + 1 });
    if (input.wasPressed('down')) aim = clampAim({ ...aim, power: aim.power - 1 });
    if (this.holdTime > SWEEP_AFTER) {
      const turnRate = fine ? 3 : Math.min(90, 25 + this.holdTime * 45);
      const powerRate = fine ? 3 : Math.min(60, 15 + this.holdTime * 30);
      aim = swing(player, aim, horizontal * turnRate * delta);
      aim = clampAim({ ...aim, power: aim.power + vertical * powerRate * delta });
    }
    return aim;
  }
}
