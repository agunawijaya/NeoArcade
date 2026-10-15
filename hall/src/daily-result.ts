/**
 * Turns a game's stored daily result into one short line for the Today
 * panel, using rules from the game's catalog entry, so the Hall never needs
 * the game's code to read it:
 *
 *   [{ "when": { "outcome": "hit" }, "text": "Hit in {throws} of 10" },
 *    { "text": "Missed" }]
 *
 * The first rule whose `when` fields all equal the result's wins. `{field}`
 * prints a field; `{field|number}`, `{field|money}` (cents) and
 * `{field|hours}` format it. A rule naming a field the result lacks is
 * passed over.
 */
export type ResultValue = string | number | boolean;

export interface ResultRule {
  when?: Record<string, ResultValue>;
  text: string;
}

const FORMATS = ['number', 'money', 'hours'] as const;
type Format = (typeof FORMATS)[number];

const PLACEHOLDER = /\{([A-Za-z][\w]*)(?:\|([a-z]+))?\}/g;

/** Formats a template names that the Hall does not know. */
export function templateProblems(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)]
    .map((match) => match[2])
    .filter((format): format is string => format !== undefined)
    .filter((format) => !(FORMATS as readonly string[]).includes(format))
    .map((format) => `unknown format "${format}"`);
}

export function summariseResult(rules: readonly ResultRule[], result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null;
  const fields = result as Record<string, unknown>;
  for (const rule of rules) {
    const matches = Object.entries(rule.when ?? {}).every(([key, value]) => fields[key] === value);
    if (!matches) continue;
    const text = fillTemplate(rule.text, fields);
    if (text !== null) return text;
  }
  return null;
}

function fillTemplate(text: string, fields: Record<string, unknown>): string | null {
  let complete = true;
  const filled = text.replace(PLACEHOLDER, (_match, key: string, format?: string) => {
    const value = fields[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return formatNumber(value, format as Format | undefined);
    }
    if (typeof value === 'string' && format === undefined) return value;
    complete = false;
    return '';
  });
  return complete ? filled : null;
}

function formatNumber(value: number, format: Format | undefined): string {
  switch (format) {
    case 'money': {
      const dollars = Math.round(Math.abs(value) / 100).toLocaleString('en');
      return `${value < 0 ? '−' : ''}$${dollars}`;
    }
    case 'hours': {
      const days = Math.floor(value / 24);
      const hours = Math.round(value - days * 24);
      return days > 0 ? `${days} d ${hours} h` : `${hours} h`;
    }
    case 'number':
      return value.toLocaleString('en');
    default:
      return String(value);
  }
}
