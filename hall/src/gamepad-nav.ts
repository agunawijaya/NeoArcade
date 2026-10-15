import { createInput } from '@shared/input';
import { isVisible } from './dom';
import { nearestInDirection, type Direction } from './spatial-nav';
import { animate } from './ticker';

/**
 * Lets a gamepad drive the Hall like a TV remote: the stick or d-pad moves
 * focus to the nearest control in that direction, A presses it, B goes back.
 */
export interface GamepadActions {
  /** The part of the page that currently has the player's attention. */
  scope(): HTMLElement;
  /** Lets the page move focus its own way first, e.g. along shelves; true when it did. */
  move?(direction: Direction): boolean;
  back(): void;
  stepGenre(delta: number): void;
  start(): void;
}

type PadAction = Direction | 'confirm' | 'back' | 'previousGenre' | 'nextGenre' | 'start';

const REPEAT_DELAY = 0.4;
const REPEAT_INTERVAL = 0.14;
const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]';
// Where the first press lands on each page: Play in the spotlight, the picked
// original on the timeline, or a page's first row of games.
const STARTING_POINTS =
  '.spotlight .button--play, .origin-marker[aria-selected="true"], [data-row-item][tabindex="0"]';

export function startGamepadNavigation(actions: GamepadActions): void {
  const input = createInput<PadAction>({
    bindings: {
      up: ['pad:up', 'pad:leftY-'],
      down: ['pad:down', 'pad:leftY+'],
      left: ['pad:left', 'pad:leftX-'],
      right: ['pad:right', 'pad:leftX+'],
      confirm: ['pad:a'],
      back: ['pad:b'],
      previousGenre: ['pad:lb'],
      nextGenre: ['pad:rb'],
      start: ['pad:start'],
    },
    deadzone: 0.5,
  });

  const untilRepeat = new Map<Direction, number>();
  let polling = false;

  const move = (direction: Direction) => {
    if (!document.querySelector('dialog[open]') && actions.move?.(direction)) return;
    const scope = actions.scope();
    const candidates = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => isVisible(element) && !element.closest('[data-pointer-only]'),
    );
    const current = document.activeElement as HTMLElement | null;
    const from = current && current !== document.body && scope.contains(current) ? current : null;
    const next = from
      ? nearestInDirection(
          from.getBoundingClientRect(),
          candidates.map((element) =>
            Object.assign(element.getBoundingClientRect().toJSON(), { element }),
          ),
          direction,
        )?.element
      : ([...scope.querySelectorAll<HTMLElement>(STARTING_POINTS)].find(isVisible) ??
        candidates[0]);
    if (!next) return;
    next.focus();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const poll = (delta: number): boolean => {
    input.update();
    if (!input.gamepadConnected) {
      polling = false;
      document.documentElement.dataset.input = 'pointer';
      return false;
    }
    if (input.lastDevice === 'gamepad') document.documentElement.dataset.input = 'gamepad';

    for (const direction of DIRECTIONS) {
      if (input.wasPressed(direction)) {
        move(direction);
        untilRepeat.set(direction, REPEAT_DELAY);
      } else if (input.isDown(direction)) {
        // Holding a direction repeats the move, like a keyboard key held down.
        let wait = (untilRepeat.get(direction) ?? REPEAT_DELAY) - delta;
        if (wait <= 0) {
          move(direction);
          wait += REPEAT_INTERVAL;
        }
        untilRepeat.set(direction, wait);
      }
    }

    if (input.wasPressed('confirm')) {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && !(focused instanceof HTMLInputElement)) focused.click();
    }
    if (input.wasPressed('back')) actions.back();
    if (input.wasPressed('previousGenre')) actions.stepGenre(-1);
    if (input.wasPressed('nextGenre')) actions.stepGenre(1);
    if (input.wasPressed('start')) actions.start();
    return true;
  };

  const startPolling = () => {
    if (polling) return;
    polling = true;
    animate(poll);
  };

  window.addEventListener('gamepadconnected', startPolling);
  // A pad that was already connected shows up on the first button press after load.
  if (navigator.getGamepads?.().some((pad) => pad?.connected)) startPolling();
}
