/**
 * The machines the originals ran on, as small silhouettes for the Origins
 * timeline. Each is a few filled shapes on a 48 × 40 grid; screens, slots
 * and keys are holes cut with the even-odd rule, so one colour draws it.
 */
export const MACHINE_IDS = ['ibm-pc', 'dos-pc', 'home-computer', 'terminal', 'windows-pc'] as const;

export type MachineId = (typeof MACHINE_IDS)[number];

export interface Machine {
  id: MachineId;
  /** What the silhouette shows, for screen readers and the facts card. */
  name: string;
  /** Path data, each drawn filled with fill-rule="evenodd". */
  shapes: readonly string[];
}

const circle = (x: number, y: number, r: number) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

export const MACHINES: Record<MachineId, Machine> = {
  // The 1981 IBM PC: the monochrome or colour monitor sitting on the system
  // unit with its two full-height floppy drives, the keyboard on a cable.
  'ibm-pc': {
    id: 'ibm-pc',
    name: 'The IBM Personal Computer',
    shapes: [
      'M14 2h20a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM15.5 5v11.5h17V5z',
      'M4 21.2h40v9.8H4zM26 24h15v1.7H26zM26 27.3h15v1.7H26z',
      'M7 33h34l2.6 4.6H4.4z',
    ],
  },
  // An early-nineties PC: a VGA monitor on its stand and a mini tower.
  'dos-pc': {
    id: 'dos-pc',
    name: 'An MS-DOS PC',
    shapes: [
      'M5 4h24a2.5 2.5 0 0 1 2.5 2.5v15A2.5 2.5 0 0 1 29 24H5a2.5 2.5 0 0 1-2.5-2.5v-15A2.5 2.5 0 0 1 5 4zM5.5 7v13.5h23V7z',
      'M13 24h8l1.6 3H11.4z',
      `M35 6h9.5a1 1 0 0 1 1 1v26a1 1 0 0 1-1 1H35a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM36.5 9.5H43V11h-6.5zM36.5 13H43v1.5h-6.5z${circle(39.75, 29, 1.3)}`,
      'M3 30.5h28l2 5.5H1z',
    ],
  },
  // A keyboard computer plugged into the family television.
  'home-computer': {
    id: 'home-computer',
    name: 'An 8-bit home computer on a TV',
    shapes: [
      `M12 1.5h24A2.5 2.5 0 0 1 38.5 4v16a2.5 2.5 0 0 1-2.5 2.5H12A2.5 2.5 0 0 1 9.5 20V4A2.5 2.5 0 0 1 12 1.5zM13 5v13.5h17V5z${circle(34.3, 8, 1.5)}${circle(34.3, 13.5, 1.5)}`,
      'M15 22.5h3l-1 2h-3zM30 22.5h3l1 2h-3z',
      'M6.5 26h35c1.4 0 2.4.9 2.6 2.2l1.4 8.3h-43l1.4-8.3c.2-1.3 1.2-2.2 2.6-2.2zM8.5 28.6h31v1.5h-31zM9.5 31.8h29v1.5h-29z',
    ],
  },
  // A text terminal on a time-sharing system.
  terminal: {
    id: 'terminal',
    name: 'A text terminal',
    shapes: [
      'M8 2h32a2 2 0 0 1 2 2v21H6V4a2 2 0 0 1 2-2zM10 5v16h24V5zM36 17h3.5v2H36z',
      'M9 25h30l1.5 3h-33z',
      'M6 31h36l2 5H4zM9 32.6h30v1.2H9z',
    ],
  },
  // A turn-of-the-century PC: a bigger screen with windows on it, and a tower.
  'windows-pc': {
    id: 'windows-pc',
    name: 'A Windows PC',
    shapes: [
      'M4 3h26a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM4.5 5.5v15h25v-15z',
      'M8 8h13v9H8zM9 10.4h11V16H9zM4.5 19h25v1.5h-25z',
      'M13 24h8v2.5h-8zM10 26.5h14V28H10z',
      'M35 4h10v30H35zM36.5 7h7v2.6h-7zM36.5 11.5h7v1.2h-7z',
      'M2 31h30l1.5 5H.5z',
    ],
  },
};

export function isMachineId(value: unknown): value is MachineId {
  return typeof value === 'string' && (MACHINE_IDS as readonly string[]).includes(value);
}

/** The silhouette as SVG markup, in currentColor. */
export function machineSvg(id: MachineId): string {
  const paths = MACHINES[id].shapes
    .map((shape) => `<path fill-rule="evenodd" d="${shape}"/>`)
    .join('');
  return `<svg class="machine" viewBox="0 0 48 40" fill="currentColor">${paths}</svg>`;
}
