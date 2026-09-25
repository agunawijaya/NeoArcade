import { createMatch } from '../engine/match';
import { gorillaCentre } from '../engine/gorillas';
import { Scene } from '../render/scene';
import type { Stage } from '../render/stage';

/** The city the title screen opens on: chosen for a handsome, varied skyline. */
const SHOWCASE_SEED = 1990;
const PAN_SECONDS = 26;

/**
 * The establishing shot behind the title: dusk over the city, the camera
 * drifting slowly along the skyline and easing back, gorillas idling on
 * their rooftops and the sun keeping an eye on things.
 */
export class TitleShow {
  readonly scene: Scene;
  private time = 0;

  constructor(
    private readonly stage: Stage,
    weather: boolean,
  ) {
    const match = createMatch({
      seed: SHOWCASE_SEED,
      world: 'earth',
      points: 3,
      format: 'firstTo',
      powerUps: [],
    });
    this.scene = new Scene(match.round, 0.15, weather, () => {});
    this.scene.wind = 3;
    // One gorilla on the right, gazing across the city; the left side belongs to the logo.
    this.scene.actors[0].setMood('gone');
    this.scene.actors[1].lookAt = gorillaCentre(match.round.gorillas[0]);
    stage.setScene(this.scene);
    stage.camera.aim({ x: 480, y: 165 }, 1.28, 1, true);
  }

  update(delta: number, reducedMotion: boolean) {
    this.time += delta;
    const { camera } = this.stage;
    if (reducedMotion) {
      camera.aim({ x: 320, y: 175 }, 1, 2);
    } else {
      // A slow sway along the right of the skyline, like a crane shot,
      // leaving the left side calm for the logo.
      const sway = (1 - Math.cos((this.time / PAN_SECONDS) * Math.PI * 2)) / 2;
      camera.aim({ x: 480 + sway * 50, y: 165 - sway * 12 }, 1.28 - sway * 0.05, 0.8);
    }
    this.scene.skyBody.lookAt = { x: 200 + Math.sin(this.time * 0.4) * 200, y: 200 };
    this.scene.update(delta, reducedMotion);
    camera.update(delta);
  }
}
