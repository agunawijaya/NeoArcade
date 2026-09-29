import { POWER_UPS } from '../engine/powerups';
import type { Failure } from './judge';
import type { Puzzle, Rule, StyleGoal } from './puzzle';

/** Trick Shot in words, for the cards, the in-play panel and the verdicts. */
export function styleText(style: StyleGoal): string {
  switch (style.kind) {
    case 'bullseye':
      return `Land within ${style.metres} m of the middle`;
    case 'sun':
      return 'Pass through the sun on the way';
    case 'quick':
      return `Get there in under ${style.seconds} s`;
    case 'sky':
      return 'Fly out above the top of the screen';
    case 'clean':
      return 'Leave the city without a scratch';
    case 'bonk':
      return 'Bonk the dummy on the head';
  }
}

export function ruleText(rule: Rule): string {
  switch (rule) {
    case 'sun':
      return 'Through the sun first';
    case 'bounceTwice':
      return 'Two bounces first';
    case 'allBananas':
      return 'All three bananas on target';
  }
}

/** The three star goals, in order. */
export function goalTexts(puzzle: Puzzle): [string, string, string] {
  return [
    'Solve it',
    `Solve it within ${puzzle.par} attempt${puzzle.par === 1 ? '' : 's'}`,
    styleText(puzzle.style),
  ];
}

/** A line about what the throw comes with: the power-up, and anything unusual in the air. */
export function kitText(puzzle: Puzzle): string | null {
  const parts = [
    puzzle.powerUp ? `Every throw is a ${POWER_UPS[puzzle.powerUp].name}` : null,
    puzzle.hazards?.bouncy ? 'springy roofs' : null,
    puzzle.hazards?.jetStream ? 'a jet stream up high' : null,
    puzzle.hazards?.dustDevil ? 'a dust devil' : null,
    puzzle.hazards?.drone
      ? puzzle.hazards.drone.speed > 0
        ? 'a patrolling drone'
        : 'a billboard'
      : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const [first, ...rest] = parts;
  const sentence = `${first}${rest.length > 0 ? `, ${rest.join(', ')}` : ''}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** What went wrong with a throw that reached its targets but broke the rule, or never got there. */
export function failureText(failure: Failure): string | null {
  switch (failure) {
    case 'selfHit':
      return 'Ouch. What goes up…';
    case 'noSun':
      return 'Close, but it has to go through the sun first.';
    case 'fewBounces':
      return 'It has to bounce twice first.';
    case 'strayBanana':
      return 'All three bananas have to land on target.';
    case 'missed':
      return null;
  }
}
