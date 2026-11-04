import { ApiError } from "@/lib/api";

/** A sentence a person can act on, for any thrown API/network error. */
export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "Can't reach Streamline. Check your connection and try again.";
    if (e.status === 401 || e.status === 403) return "Your session expired. Sign in again.";
    if (e.status === 404) return "This project couldn't be found — it may have been deleted.";
    if (e.status === 413) return "That file is too large to upload.";
    if (e.status >= 500) return "Something went wrong on our end. Please try again.";
    const msg = (e.message || "").trim();
    if (/^[A-Z].*[.!?]$/.test(msg)) return msg;
    return "Something went wrong. Please try again.";
  }
  const msg = String((e as Error)?.message ?? e ?? "");
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Can't reach Streamline. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}
