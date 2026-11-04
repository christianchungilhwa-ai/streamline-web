import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-standard className composer. Merges Tailwind classes intelligently
 *  (later utility classes override earlier ones in the same group). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Video position as m:ss, or h:mm:ss past an hour. */
export function formatTimestamp(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(t % 60)}` : `${m}:${pad(t % 60)}`;
}
