import type { CrewCommand, KnobId } from '../engine/crew';
import type { LowerPage, NdMode } from './glass/glass-model';

/**
 * What the cockpit's switches, knobs and levers can do: the crew's commands
 * (applied to the flight the same way the keyboard and the gamepad apply
 * them), and what stays in the cockpit — where to look, what the glass
 * deck's screens show, and the keys of its CDU, which turn into commands
 * once an entry is made.
 */
export type CockpitView =
  'main' | 'pedestal' | 'overhead' | 'engineer' | 'left' | 'right' | 'outside';

/** The glass deck's EFIS control panels and display select panel. */
export type DisplayChange =
  { ndRange: 1 | -1 } | { ndMode: NdMode } | { lowerPage: LowerPage } | { minimums: number };

/** A key on the CDU: a line select key, a page, a character, or one of the editing keys. */
export type CduKey =
  | { lsk: 'L' | 'R'; line: number }
  | { page: 'INIT REF' | 'RTE' | 'DEP ARR' | 'PROG' | 'NAV RAD' | 'LEGS' }
  | { char: string }
  | { edit: 'CLR' | 'DEL' | 'EXEC' | 'PREV' | 'NEXT' };

export type CockpitAction =
  | CrewCommand
  | { kind: 'view'; view: CockpitView }
  | { kind: 'display'; change: DisplayChange }
  | { kind: 'cdu'; key: CduKey };

/** A clickable place on a panel, laid out in screen pixels as the panel is drawn. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  click?: CockpitAction;
  /** A knob: each wheel notch or dragged step is a click. */
  knob?: KnobId;
  /** A lever dragged up and down: the value at a height, 0 at the bottom of its travel … 1 at the top. */
  drag?: (fraction: number) => CockpitAction;
}
