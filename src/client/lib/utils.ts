import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-standard className composer. Merges Tailwind classes intelligently
 *  (later utility classes override earlier ones in the same group). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
