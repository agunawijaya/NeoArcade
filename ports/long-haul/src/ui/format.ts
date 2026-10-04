import type { Units } from '../settings';

/**
 * How numbers read on screen. The engine keeps miles, gallons and cents;
 * kilometres and litres are for display only.
 */
const KM_PER_MILE = 1.609344;
const LITRES_PER_GALLON = 3.785411784;

/** "$1,234.50", or "$1,235" when `whole`. Negative amounts get a real minus sign. */
export function money(cents: number, whole = false): string {
  const sign = cents < 0 ? '−' : '';
  const dollars = Math.abs(cents) / 100;
  const text = whole
    ? Math.round(dollars).toLocaleString('en-US')
    : dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}$${text}`;
}

export function distance(miles: number, units: Units, digits = 0): string {
  const value = units === 'km' ? miles * KM_PER_MILE : miles;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units}`;
}

export function distanceValue(miles: number, units: Units): number {
  return units === 'km' ? miles * KM_PER_MILE : miles;
}

export function speed(mph: number, units: Units): string {
  return units === 'km' ? `${Math.round(mph * KM_PER_MILE)} km/h` : `${Math.round(mph)} mph`;
}

export function speedValue(mph: number, units: Units): number {
  return Math.round(units === 'km' ? mph * KM_PER_MILE : mph);
}

export function speedUnit(units: Units): string {
  return units === 'km' ? 'km/h' : 'mph';
}

export function fuel(gallons: number, units: Units): string {
  return units === 'km'
    ? `${Math.round(gallons * LITRES_PER_GALLON).toLocaleString('en-US')} L`
    : `${Math.round(gallons).toLocaleString('en-US')} gal`;
}

export function pounds(lb: number): string {
  return `${Math.round(lb).toLocaleString('en-US')} lb`;
}

/** "a", "an": for "an overweight fine", "a toll". */
export function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}
