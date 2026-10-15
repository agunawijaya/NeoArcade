/**
 * The bands behind the Origins timeline: the broad ages of home computing
 * the originals came from. The years are the usual rough edges of each age,
 * not exact dates, and the page says so.
 */
export interface Era {
  id: string;
  name: string;
  from: number;
  /** null: still going. */
  to: number | null;
  /** Which of the Hall's palette colours tints the band. */
  tone: 'violet' | 'cyan' | 'magenta' | 'amber';
}

export const ERAS: readonly Era[] = [
  { id: 'home-8bit', name: '8-bit home computers', from: 1977, to: 1990, tone: 'violet' },
  { id: 'ibm-dos', name: 'IBM PC and MS-DOS', from: 1981, to: 1995, tone: 'cyan' },
  { id: 'qbasic', name: 'The QBasic years', from: 1991, to: 2000, tone: 'magenta' },
  { id: 'windows', name: 'Windows PCs', from: 1995, to: null, tone: 'amber' },
];
