import type { AudioEngine } from '@shared/audio';
import type { UnlockToasts } from '@shared/pass';
import type { Stage } from '../render/stage';
import type { Theme } from '../render/palette';
import type { Settings } from '../settings';
import type { Hud } from '../ui/hud';
import type { Outfit } from '../wardrobe/items';
import type { Controls } from './controls';
import type { SkylinePass } from './pass-reporter';

/** What every mode's play needs from the page: the stage, the HUD and the player's things. */
export interface PlayContext {
  stage: Stage;
  hud: Hud;
  audio: AudioEngine;
  controls: Controls;
  pass: SkylinePass;
  toasts: UnlockToasts;
  reducedMotion(): boolean;
  touch(): boolean;
  theme(): Theme;
  settings(): Settings;
  outfits(): [Outfit, Outfit];
  /** Opens the pause menu over whatever is playing. */
  pause(): void;
}

/** The parts of the context a session plays through. */
export function sessionParts(context: PlayContext) {
  const { stage, hud, audio, controls, reducedMotion, touch } = context;
  return { stage, hud, audio, controls, reducedMotion, touch };
}
