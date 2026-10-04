import { previewTurn, type MatchState, type TurnAim } from '../engine/match';
import type { ShotRecord } from '../engine/shot';

/**
 * Predicts the throw being aimed, for aim assist and for the hidden guide.
 * The hidden guide is a practice aid for a person playing the computer (a
 * CPU, a tour rival or the Daily Skyline's target), kept off every menu and
 * out of the player's guide: press C at any point of the match and, on your
 * turn, the throw is drawn exactly as it will fly, wind, buildings, balloons
 * and all.
 */
export class AimGuide {
  /** The hidden whole-path guide is switched on. */
  enabled = false;
  private cachedFor = '';
  private cached: ShotRecord | null = null;

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /** Forgets the last prediction; the city or the thrower has changed. */
  reset() {
    this.cachedFor = '';
    this.cached = null;
  }

  /** The predicted throw, worked out again only when the aim changes. */
  predict(state: MatchState, aim: TurnAim): ShotRecord {
    const key = `${aim.angle}:${Math.round(aim.velocity)}:${aim.usePowerUp === true}`;
    if (!this.cached || key !== this.cachedFor) {
      this.cached = previewTurn(state, aim);
      this.cachedFor = key;
    }
    return this.cached;
  }
}
