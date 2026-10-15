import { describe, expect, it } from 'vitest';
import { summariseResult, templateProblems, type ResultRule } from './daily-result';

const haulRules: ResultRule[] = [
  { when: { outcome: 'crashed' }, text: 'Lost the rig' },
  { when: { late: true }, text: 'Delivered late, {profitCents|money}' },
  { text: 'Delivered, {profitCents|money} in {hours|hours}' },
];

describe('summariseResult', () => {
  it('uses the first rule whose fields all match', () => {
    const delivered = { outcome: 'delivered', late: false, profitCents: 123_456, hours: 53 };
    expect(summariseResult(haulRules, delivered)).toBe('Delivered, $1,235 in 2 d 5 h');
    expect(summariseResult(haulRules, { ...delivered, late: true, profitCents: -4_000 })).toBe(
      'Delivered late, −$40',
    );
    expect(summariseResult(haulRules, { ...delivered, outcome: 'crashed' })).toBe('Lost the rig');
  });

  it('formats numbers and passes over rules naming missing fields', () => {
    const rules: ResultRule[] = [{ text: '{metres|number} m by {driver}' }, { text: 'Played' }];
    expect(summariseResult(rules, { metres: 1840, driver: 'Ada' })).toBe('1,840 m by Ada');
    expect(summariseResult(rules, { metres: 1840 })).toBe('Played');
    expect(summariseResult([{ text: '{hours|hours}' }], { hours: 7 })).toBe('7 h');
  });

  it('gives up on results that are not records, or that no rule describes', () => {
    expect(summariseResult(haulRules, null)).toBeNull();
    expect(summariseResult(haulRules, 'delivered')).toBeNull();
    expect(summariseResult([{ when: { outcome: 'hit' }, text: 'Hit' }], { outcome: 'miss' })).toBe(
      null,
    );
  });
});

describe('templateProblems', () => {
  it('flags formats the Hall does not know', () => {
    expect(templateProblems('{a} {b|number} {c|money} {d|hours}')).toEqual([]);
    expect(templateProblems('{a|furlongs}')).toEqual(['unknown format "furlongs"']);
  });
});
