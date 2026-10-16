import type { CrewCommand } from '../../engine/crew';
import type { Flight } from '../../engine/flight';
import type { CduKey, Region } from '../actions';
import { roundRect } from '../canvas-kit';
import type { Palette } from '../palette';
import {
  CDU_PAGES,
  DELETE,
  type CduColour,
  type CduOutcome,
  type CduPageId,
  type CduRow,
  type CduText,
} from './cdu-pages';
import {
  CDU_FONT,
  DISPLAY_FONT,
  label,
  screen,
  type Context,
  type DisplayColours,
} from './glass-kit';

/**
 * The control display unit of the glass deck's flight management
 * computer, kept to what the game's routes need: the route and its legs,
 * the approach, the takeoff and approach speeds, the progress page and
 * the navigation radios. Its screen has fourteen lines of twenty-four
 * characters with six line select keys either side; under it the page
 * keys, EXEC, and the keypad. Whatever the crew types collects in the
 * scratchpad on the bottom line; every change to the flight comes out of
 * `press` as the crew's commands, for the cockpit to carry out.
 */
const COLUMNS = 24;
const LINES = 14;
const SCRATCHPAD_LIMIT = 24;

type PageKey = Extract<CduKey, { page: string }>['page'];

/** The pages each page key opens: INIT REF chooses takeoff or approach by the phase of flight. */
const GROUPS: Record<PageKey, CduPageId[]> = {
  'INIT REF': ['TAKEOFF', 'APPROACH'],
  RTE: ['RTE'],
  'DEP ARR': ['DEP ARR'],
  LEGS: ['LEGS'],
  PROG: ['PROG'],
  'NAV RAD': ['NAV RAD'],
};

/** The CDU's keys under the screen, in the real unit's places; the ones the game has no use for are blank. */
const FUNCTION_ROWS: (PageKey | 'EXEC' | 'PREV' | 'NEXT' | string)[][] = [
  ['INIT REF', 'RTE', 'DEP ARR', 'ATC', 'VNAV', ''],
  ['FIX', 'LEGS', 'HOLD', 'FMC COMM', 'PROG', 'EXEC'],
  ['MENU', 'NAV RAD', '', '', 'PREV', 'NEXT'],
];
const NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '+/-'];
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'SP', 'DEL', '/', 'CLR'];

const KEY_NAMES: Record<string, string> = {
  PREV: 'PREV\nPAGE',
  NEXT: 'NEXT\nPAGE',
  'FMC COMM': 'FMC\nCOMM',
  'INIT REF': 'INIT\nREF',
  'DEP ARR': 'DEP\nARR',
  'NAV RAD': 'NAV\nRAD',
};

export class Cdu {
  private page: CduPageId = 'RTE';
  private pageNumber = 1;
  private typed = '';
  private message: string | null = null;

  get scratchpad(): string {
    return this.message ?? this.typed;
  }

  /** The EXEC key's light: an edit to the route waits for it. */
  execLit(flight: Flight): boolean {
    return Boolean(flight.fms?.pending);
  }

  press(key: CduKey, flight: Flight): CrewCommand[] {
    if ('page' in key) {
      this.openPage(key.page, flight);
      return [];
    }
    if ('char' in key) {
      this.addCharacter(key.char);
      return [];
    }
    if ('edit' in key) return this.edit(key.edit, flight);
    return this.selectLine(key.lsk, key.line, flight);
  }

  /** A key on the computer's own keyboard while the CDU has it: characters, Backspace, Delete, Enter. */
  type(key: string, flight: Flight): CrewCommand[] {
    if (key === 'Backspace') return this.press({ edit: 'CLR' }, flight);
    if (key === 'Delete') return this.press({ edit: 'DEL' }, flight);
    if (key === 'Enter') return this.press({ edit: 'EXEC' }, flight);
    if (key === 'PageUp') return this.press({ edit: 'PREV' }, flight);
    if (key === 'PageDown') return this.press({ edit: 'NEXT' }, flight);
    if (key === ' ' || /^[A-Za-z0-9./]$/.test(key))
      return this.press({ char: key.toUpperCase() }, flight);
    return [];
  }

  private openPage(key: PageKey, flight: Flight) {
    const group = GROUPS[key];
    // Pressed again on its own page, a page key leaves the page as it is: a click on the screen does that too.
    if (group.includes(this.page)) return;
    const airborne = flight.liftoffAt !== null || !flight.readout.onGround;
    this.page = key === 'INIT REF' ? (airborne ? 'APPROACH' : 'TAKEOFF') : (group[0] as CduPageId);
    this.pageNumber = 1;
  }

  private addCharacter(character: string) {
    this.message = null;
    if (this.typed === DELETE) this.typed = '';
    const next = character === 'SP' ? ' ' : character;
    if (this.typed.length < SCRATCHPAD_LIMIT) this.typed += next;
  }

  private edit(edit: Extract<CduKey, { edit: string }>['edit'], flight: Flight): CrewCommand[] {
    switch (edit) {
      case 'CLR':
        if (this.message) this.message = null;
        else this.typed = this.typed === DELETE ? '' : this.typed.slice(0, -1);
        return [];
      case 'DEL':
        if (!this.message && this.typed === '') this.typed = DELETE;
        return [];
      case 'EXEC':
        return this.execLit(flight) ? [{ kind: 'fms', edit: { op: 'execute' } }] : [];
      case 'PREV':
      case 'NEXT':
        this.turnPage(edit === 'NEXT' ? 1 : -1, flight);
        return [];
    }
  }

  private turnPage(direction: 1 | -1, flight: Flight) {
    if (this.page === 'TAKEOFF' || this.page === 'APPROACH') {
      this.page = this.page === 'TAKEOFF' ? 'APPROACH' : 'TAKEOFF';
      return;
    }
    const count = CDU_PAGES[this.page].count(flight);
    this.pageNumber = ((this.pageNumber - 1 + direction + count) % count) + 1;
  }

  private selectLine(side: 'L' | 'R', line: number, flight: Flight): CrewCommand[] {
    if (!flight.fms) return [];
    // A message must be cleared before the scratchpad can be used again.
    if (this.message) return [];
    const outcome: CduOutcome = CDU_PAGES[this.page].select(
      flight,
      this.pageNumber,
      side,
      line,
      this.typed,
    );
    if (outcome.scratchpad !== undefined) this.typed = outcome.scratchpad;
    if (outcome.message) this.message = outcome.message;
    if (outcome.page) {
      this.page = outcome.page;
      this.pageNumber = outcome.pageNumber ?? 1;
    }
    return outcome.commands ?? [];
  }

  draw(
    context: Context,
    x: number,
    y: number,
    width: number,
    height: number,
    flight: Flight,
    colours: DisplayColours,
    panel: Palette,
    regions: Region[],
  ) {
    // The unit is 62 by 100 of these, centred in the space it is given.
    const unit = Math.min(width / 62, height / 100);
    const left = x + (width - unit * 62) / 2;
    const top = y + (height - unit * 100) / 2;
    const u = (value: number) => value * unit;
    const X = (value: number) => left + u(value);
    const Y = (value: number) => top + u(value);
    context.fillStyle = panel.panelShade;
    roundRect(context, X(0), Y(0), u(62), u(100), u(2.4));
    context.fill();
    context.strokeStyle = panel.panelEdge;
    context.lineWidth = Math.max(1, u(0.3));
    context.stroke();
    context.fillStyle = '#16171a';
    roundRect(context, X(7.2), Y(2.4), u(47.6), u(36), u(1.2));
    context.fill();
    this.drawScreen(context, X(8.2), Y(3.4), u(45.6), u(34), flight, colours);
    regions.push({
      x: X(8.2),
      y: Y(3.4),
      width: u(45.6),
      height: u(34),
      label: 'CDU screen',
      click: { kind: 'cdu', key: { page: pageKeyOf(this.page) } },
    });
    const rowHeight = 34 / LINES;
    for (let line = 1; line <= 6; line++) {
      const cy = 3.4 + rowHeight * (line * 2 + 0.5);
      this.key(
        context,
        X(1.2),
        Y(cy - 1.5),
        u(5),
        u(3),
        '',
        { lsk: 'L', line },
        regions,
        panel,
        unit,
      );
      this.key(
        context,
        X(55.8),
        Y(cy - 1.5),
        u(5),
        u(3),
        '',
        { lsk: 'R', line },
        regions,
        panel,
        unit,
      );
      context.strokeStyle = '#8a8d90';
      context.lineWidth = Math.max(1, u(0.25));
      context.beginPath();
      context.moveTo(X(6.4), Y(cy));
      context.lineTo(X(7.2), Y(cy));
      context.moveTo(X(54.8), Y(cy));
      context.lineTo(X(55.6), Y(cy));
      context.stroke();
    }
    this.drawLights(context, X, Y, u, colours);
    FUNCTION_ROWS.forEach((row, rowIndex) => {
      row.forEach((name, column) => {
        if (!name) return;
        const kx = X(3 + column * 9.5);
        const ky = Y(41.5 + rowIndex * 5.6);
        this.key(
          context,
          kx,
          ky,
          u(8.6),
          u(4.6),
          KEY_NAMES[name] ?? name,
          keyFor(name),
          regions,
          panel,
          unit,
        );
        if (name === 'EXEC') {
          context.fillStyle = this.execLit(flight) ? '#f4f6f2' : '#3a3c3f';
          context.fillRect(kx + u(1.2), ky - u(1.1), u(6.2), u(0.7));
        }
      });
    });
    NUMBERS.forEach((name, index) => {
      const kx = X(5 + (index % 3) * 6.2);
      const ky = Y(60 + Math.floor(index / 3) * 6.4);
      const key: CduKey | null = name === '+/-' ? null : { char: name };
      this.key(context, kx, ky, u(5.4), u(5.2), name, key, regions, panel, unit, true);
    });
    LETTERS.forEach((name, index) => {
      const kx = X(24.2 + (index % 5) * 6.8);
      const ky = Y(60 + Math.floor(index / 5) * 6.4);
      const key: CduKey = name === 'DEL' || name === 'CLR' ? { edit: name } : { char: name };
      this.key(context, kx, ky, u(6), u(5.2), name, key, regions, panel, unit, name.length === 1);
    });
  }

  /** The annunciators either side of the keypad: MSG lit while a message waits in the scratchpad. */
  private drawLights(
    context: Context,
    X: (value: number) => number,
    Y: (value: number) => number,
    u: (value: number) => number,
    colours: DisplayColours,
  ) {
    const lights: [string, boolean][] = [
      ['DSPY', false],
      ['FAIL', false],
      ['MSG', this.message !== null],
      ['OFST', false],
    ];
    lights.forEach(([name, lit], index) => {
      const lx = X(index < 2 ? 0.8 : 58.4);
      const ly = Y(61 + (index % 2) * 6.4);
      context.fillStyle = lit ? colours.amber : '#232427';
      context.fillRect(lx, ly, u(3), u(4.4));
      label(
        context,
        name,
        lx + u(1.5),
        ly + u(2.2),
        u(0.95),
        lit ? '#1a1206' : '#55575b',
        'center',
        DISPLAY_FONT,
      );
    });
  }

  private key(
    context: Context,
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    key: CduKey | null,
    regions: Region[],
    panel: Palette,
    unit: number,
    large = false,
  ) {
    context.fillStyle = '#2b2d30';
    roundRect(context, x, y, width, height, unit * 0.6);
    context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.08)';
    roundRect(context, x, y, width, height * 0.45, unit * 0.6);
    context.fill();
    const lines = text.split('\n');
    const size = unit * (large ? 2.4 : lines.length > 1 ? 1.35 : 1.5);
    lines.forEach((one, index) =>
      label(
        context,
        one,
        x + width / 2,
        y + height / 2 + (index - (lines.length - 1) / 2) * size * 1.05,
        size,
        key ? panel.marking : '#7b7e82',
        'center',
        DISPLAY_FONT,
      ),
    );
    if (key)
      regions.push({
        x,
        y,
        width,
        height,
        label: 'lsk' in key ? `CDU ${key.line}${key.lsk}` : `CDU ${lines.join(' ')}`,
        click: { kind: 'cdu', key },
      });
  }

  private drawScreen(
    context: Context,
    x: number,
    y: number,
    width: number,
    height: number,
    flight: Flight,
    colours: DisplayColours,
  ) {
    screen(context, x, y, width, height, colours, () => {
      const cell = { width: width / COLUMNS, height: height / LINES };
      const tone: Record<CduColour, string> = {
        white: colours.white,
        green: colours.green,
        magenta: colours.magenta,
        cyan: colours.cyan,
        amber: colours.amber,
      };
      const write = (
        line: number,
        column: number,
        text: CduText,
        align: 'left' | 'right' | 'centre',
      ) => {
        const length = [...text.text].length;
        const start =
          align === 'left' ? column : align === 'right' ? column - length : column - length / 2;
        const size = cell.height * (text.small ? 0.7 : 0.92);
        // The CDU's characters are broad: each glyph is stretched to fill most of its cell.
        const stretch = (cell.width * (text.small ? 0.66 : 0.8)) / (size * 0.6);
        context.fillStyle = tone[text.colour ?? 'white'];
        context.font = `${size}px ${CDU_FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        [...text.text].forEach((character, index) => {
          context.save();
          context.translate(
            x + (start + index + 0.5) * cell.width,
            y + (line + 0.56) * cell.height,
          );
          context.scale(stretch, 1);
          context.fillText(character, 0, 0);
          context.restore();
        });
      };
      if (!flight.fms) {
        write(0, COLUMNS / 2, { text: 'FMC' }, 'centre');
        return;
      }
      const view = CDU_PAGES[this.page].view(
        flight,
        Math.min(this.pageNumber, CDU_PAGES[this.page].count(flight)),
      );
      write(0, COLUMNS / 2, { text: view.title }, 'centre');
      if (view.page)
        write(0, COLUMNS, { text: `${view.page[0]}/${view.page[1]}`, small: true }, 'right');
      view.rows.forEach((row: CduRow, index) => {
        const labelLine = 1 + index * 2;
        const dataLine = labelLine + 1;
        const small = (text?: string) => (text ? { text, small: true } : null);
        const labelLeft = small(row.labelLeft);
        const labelCentre = small(row.labelCentre);
        const labelRight = small(row.labelRight);
        if (labelLeft) write(labelLine, 1, labelLeft, 'left');
        if (labelCentre) write(labelLine, 12, labelCentre, 'centre');
        if (labelRight) write(labelLine, COLUMNS - 1, labelRight, 'right');
        if (row.left) write(dataLine, 0, row.left, 'left');
        if (row.centre) write(dataLine, 12, row.centre, 'centre');
        if (row.right) write(dataLine, COLUMNS, row.right, 'right');
      });
      write(LINES - 1, 0, { text: this.scratchpad }, 'left');
    });
  }
}

function pageKeyOf(page: CduPageId): PageKey {
  if (page === 'TAKEOFF' || page === 'APPROACH') return 'INIT REF';
  return page;
}

/** What a key under the screen sends: a page, an edit, or nothing for the keys the game leaves blank. */
function keyFor(name: string): CduKey | null {
  if (name === 'EXEC' || name === 'PREV' || name === 'NEXT') return { edit: name };
  if (name in GROUPS) return { page: name as PageKey };
  return null;
}
