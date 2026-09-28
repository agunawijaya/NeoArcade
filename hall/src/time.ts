const dayFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' });
const yearFormat = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a date. */
export function timeAgo(isoTime: string, now: Date = new Date()): string {
  const then = new Date(isoTime);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && then.getDate() === now.getDate()) return `${hours} h ago`;
  const days = calendarDaysBetween(then, now);
  if (days <= 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return (then.getFullYear() === now.getFullYear() ? dayFormat : yearFormat).format(then);
}

function calendarDaysBetween(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export const formatNumber = (value: number) => value.toLocaleString('en');
