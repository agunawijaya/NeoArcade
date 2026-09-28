import { describe, expect, it } from 'vitest';
import { timeAgo } from './time';

describe('timeAgo', () => {
  const now = new Date('2026-09-28T15:00:00');

  it('counts minutes and hours on the same day', () => {
    expect(timeAgo('2026-09-28T14:59:40', now)).toBe('just now');
    expect(timeAgo('2026-09-28T14:35:00', now)).toBe('25 min ago');
    expect(timeAgo('2026-09-28T09:00:00', now)).toBe('6 h ago');
  });

  it('speaks in calendar days after that', () => {
    expect(timeAgo('2026-09-27T23:30:00', now)).toBe('yesterday');
    expect(timeAgo('2026-09-24T12:00:00', now)).toBe('4 days ago');
    expect(timeAgo('2026-08-02T12:00:00', now)).toBe('Aug 2');
    expect(timeAgo('2025-12-30T12:00:00', now)).toBe('Dec 30, 2025');
  });
});
