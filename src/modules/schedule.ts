/**
 * Pure scheduling logic, kept free of Zotero APIs so it can be unit tested.
 * Dates are local calendar days formatted as YYYY-MM-DD, so they compare
 * correctly as strings.
 */

export interface QueueEntry {
  libraryID: number;
  itemKey: string;
  /** 0 (most important) to 100 (least important), as in SuperMemo */
  priority: number;
  due: string;
  /** Days between readings; grows each time the item is read */
  interval: number;
  reviews: number;
  addedAt: string;
  lastReadAt: string | null;
}

export function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return formatDate(new Date());
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const ms = parseDate(to).getTime() - parseDate(from).getTime();
  return Math.round(ms / 86400000);
}

export function clampPriority(p: number): number {
  return Math.min(100, Math.max(0, Math.round(p)));
}

/**
 * Next interval after a reading: multiply by `multiplier` with ±10% jitter so
 * items added together drift apart, and always grow by at least one day.
 */
export function nextInterval(
  interval: number,
  multiplier: number,
  rand: () => number = Math.random,
): number {
  const jitter = 0.9 + 0.2 * rand();
  return Math.max(interval + 1, Math.round(interval * multiplier * jitter));
}

/** Postponing skips half an interval without growing it. */
export function postponeDays(interval: number): number {
  return Math.max(1, Math.ceil(interval / 2));
}

export function isDue(entry: QueueEntry, on: string): boolean {
  return entry.due <= on;
}

/** Queue order: most important first, then most overdue. */
export function compareEntries(a: QueueEntry, b: QueueEntry): number {
  return a.priority - b.priority || a.due.localeCompare(b.due);
}

export function describeDue(due: string, on: string): string {
  const days = daysBetween(on, due);
  if (days === 0) return "today";
  if (days > 0) return `in ${days}d`;
  return `${-days}d overdue`;
}
