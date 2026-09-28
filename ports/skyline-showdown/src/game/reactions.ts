import type { Point } from '../engine/geometry';
import { gorillaCentre, type Gorilla, type PlayerIndex } from '../engine/gorillas';
import { POWER_UPS } from '../engine/powerups';
import type { ShotEvent } from '../engine/shot';
import type { SoundName } from '../audio/sounds';
import type { Camera } from '../render/camera';
import { POWER_UP_COLOURS, type Scene } from '../render/scene';

/** How close a banana must pass for a gorilla to panic. */
const PANIC_DISTANCE = 45;
/** Steps before the thrower starts worrying about its own banana. */
const THROWER_CALM_STEPS = 12;

export interface ReactionContext {
  scene: Scene;
  camera: Camera;
  gorillas: readonly [Gorilla, Gorilla];
  names: readonly [string, string];
  thrower: PlayerIndex;
  /** Replays are quieter and skip the toasts. */
  replaying: boolean;
  sound(name: SoundName, velocity?: number): void;
  /** A short message, in a player's colour or (null) in white. */
  toast(text: string, player: PlayerIndex | null): void;
}

/**
 * What the city does when a shot event is reached during playback: holes,
 * fire and debris, the sun's gasp, popped balloons, shields and the big one.
 */
export function reactTo(event: ShotEvent, context: ReactionContext) {
  const { scene, camera, replaying, names, thrower } = context;
  const { effects, city } = scene;
  const volume = replaying ? 0.6 : 1;
  const throwerLook = scene.actors[thrower].look;
  switch (event.type) {
    case 'sun':
      scene.skyBody.gasp();
      context.sound('gasp', volume);
      break;
    case 'balloon':
      effects.pop(event.x, event.y, POWER_UP_COLOURS[event.kind]);
      scene.balloon = null;
      context.sound('pop', volume);
      if (!replaying)
        context.toast(`${names[thrower]} grabs the ${POWER_UPS[event.kind].name}!`, thrower);
      break;
    case 'split':
      effects.whoosh(event.x, event.y);
      context.sound('tick', volume);
      break;
    case 'bounce':
      effects.whoosh(event.x, event.y);
      context.sound('bounce', volume);
      break;
    case 'explosion': {
      const big = event.radius > 7;
      city.carve({ x: event.x, y: event.y, radius: event.radius });
      city.darkenAround(event.x, event.y, event.radius * 3);
      effects.explode(
        event.x,
        event.y,
        event.radius,
        city.facadeAt(event.building),
        big,
        throwerLook.outfit.explosion,
        throwerLook.accent,
      );
      camera.shake(0.25, big ? 5 : 2.5);
      context.sound(big ? 'bigBoom' : 'explosion', volume);
      break;
    }
    case 'topple': {
      const piece = city.knockOff(event.cut);
      effects.dropPiece(piece, event.cut.x, event.cut.y, event.cut.width, event.cut.height);
      break;
    }
    case 'drone':
      effects.dust(event.x, event.y);
      effects.shimmer(event.x, event.y, '#ff3fa4');
      context.sound('shield', volume);
      if (!replaying) context.toast('The drone caught it!', null);
      break;
    case 'shield':
      effects.shimmer(event.x, event.y, scene.accentOf(event.player));
      scene.actors[event.player].shielded = false;
      context.sound('shield', volume);
      if (!replaying) context.toast(`${names[event.player]}'s shield holds!`, event.player);
      break;
    case 'gorilla': {
      const gorilla = context.gorillas[event.player];
      const centre = gorillaCentre(gorilla);
      const look = scene.actors[event.player].look;
      city.carve({ ...centre, radius: 16 });
      effects.gorillaBlast(
        centre.x,
        centre.y,
        look.fur,
        look.accent,
        city.facadeAt(gorilla.building),
        throwerLook.outfit.explosion,
        throwerLook.accent,
      );
      scene.actors[event.player].setMood('gone');
      camera.shake(replaying ? 0.4 : 0.8, replaying ? 5 : 9);
      context.sound('bigBoom', volume);
      break;
    }
    case 'street':
      effects.dust(event.x, event.y);
      context.sound('street', volume);
      break;
    case 'offscreen':
      break;
  }
}

/** Gorillas panic while a banana whistles past close by, and calm down after. */
export function reactToNearMisses(
  scene: Scene,
  gorillas: readonly [Gorilla, Gorilla],
  bananas: readonly Point[],
  thrower: PlayerIndex,
  clock: number,
) {
  gorillas.forEach((gorilla, index) => {
    const actor = scene.actors[index as PlayerIndex];
    if (actor.mood === 'gone' || actor.mood === 'throw') return;
    if (index === thrower && clock < THROWER_CALM_STEPS) return;
    const centre = gorillaCentre(gorilla);
    const close = bananas.some(
      (banana) => Math.hypot(banana.x - centre.x, banana.y - centre.y) < PANIC_DISTANCE,
    );
    if (close) actor.setMood('panic');
    else if (actor.mood === 'panic' && actor.moodTime > 0.5) actor.setMood('idle');
  });
}
