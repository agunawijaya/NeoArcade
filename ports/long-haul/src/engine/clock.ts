/**
 * Time on the road. The original's clock is HR, hours since the trip began
 * at 8 AM on Monday, which also jumps an hour at each time-zone line. Here a
 * trip may start at any hour of the week, so a reading is "hours since
 * Monday 00:00, local time" and HR is added on top.
 */
export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const HOURS_PER_DAY = 24;
export const HOURS_PER_WEEK = 7 * HOURS_PER_DAY;

export interface ClockReading {
  /** 0 is Monday. */
  day: number;
  /** 0–23, local time. */
  hour: number;
}

export function readClock(weekHours: number): ClockReading {
  const wrapped = ((weekHours % HOURS_PER_WEEK) + HOURS_PER_WEEK) % HOURS_PER_WEEK;
  return { day: Math.floor(wrapped / HOURS_PER_DAY), hour: wrapped % HOURS_PER_DAY };
}

/** "8 AM", "Noon", "Midnight", "11 PM". The original meant to print Midnight too. */
export function hourName(hour: number): string {
  if (hour === 0) return 'Midnight';
  if (hour === 12) return 'Noon';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function dayName(weekHours: number): string {
  return DAY_NAMES[readClock(weekHours).day] ?? 'Monday';
}

/** "Thursday 4 PM". */
export function clockName(weekHours: number): string {
  const { day, hour } = readClock(weekHours);
  return `${DAY_NAMES[day] ?? 'Monday'} ${hourName(hour)}`;
}

/** "Thu 4 PM", for tight spaces. */
export function shortClockName(weekHours: number): string {
  const { day, hour } = readClock(weekHours);
  return `${(DAY_NAMES[day] ?? 'Monday').slice(0, 3)} ${hourName(hour)}`;
}

export function isNight(hour: number): boolean {
  return hour < 6 || hour >= 20;
}

/** "2 days 7 h", "15 h". */
export function durationName(hours: number): string {
  const days = Math.floor(hours / HOURS_PER_DAY);
  const rest = hours - days * HOURS_PER_DAY;
  if (days === 0) return `${rest} h`;
  const dayPart = `${days} day${days === 1 ? '' : 's'}`;
  return rest === 0 ? dayPart : `${dayPart} ${rest} h`;
}
