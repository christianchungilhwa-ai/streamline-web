import { ApiError } from "@/lib/api";

/** Turn a raw server reason into a sentence: first letter capitalized, a
 *  closing period added when it has no terminal punctuation. */
function asSentence(msg: string): string {
  const s = msg.charAt(0).toUpperCase() + msg.slice(1);
  return /[.!?…]$/.test(s) ? s : `${s}.`;
}

/** A sentence a person can act on, for any thrown API/network error.
 *  `notFound` replaces the generic 404 copy where the caller knows better
 *  what was missing. */
export function friendlyError(e: unknown, opts?: { notFound?: string }): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "Can't reach Streamline. Check your connection and try again.";
    if (e.status === 401 || e.status === 403) return "Your session expired. Sign in again.";
    if (e.status === 404) {
      return opts?.notFound ?? "This project couldn't be found — it may have been deleted.";
    }
    if (e.status === 413) return "That file is too large to upload.";
    if (e.status >= 500) return "Something went wrong on our end. Please try again.";
    const msg = (e.message || "").trim();
    // api.ts falls back to "Request failed: <status>" when the server sent
    // no reason — that is not worth showing.
    const hasReason = !!msg && !/^Request failed: \d+$/.test(msg);
    // Validation / conflict errors carry the server's reason: show it.
    if (hasReason && (e.status === 400 || e.status === 409 || e.status === 422)) {
      return asSentence(msg);
    }
    if (hasReason && /^[A-Z].*[.!?]$/.test(msg)) return msg;
    return "Something went wrong. Please try again.";
  }
  const msg = String((e as Error)?.message ?? e ?? "");
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Can't reach Streamline. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}
