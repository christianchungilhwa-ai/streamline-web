/** Display formatting for dates, durations and counts. */

function toDate(d: string | number | Date): Date {
  return d instanceof Date ? d : new Date(d);
}

/** "Today", "Yesterday", "Oct 15" (this year) or "Jun 2, 2025". */
export function formatDate(d: string | number | Date): string {
  const date = toDate(d);
  if (Number.isNaN(+date)) return "—";
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Full timestamp for <time title>. */
export function formatDateFull(d: string | number | Date): string {
  const date = toDate(d);
  if (Number.isNaN(+date)) return "";
  return date.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
}

/** "1 h 55 min", "48 min", "Under 1 min", or "—". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 1) return "Under 1 min";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "1 slide", "109 slides". */
export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`;
}
