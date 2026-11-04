import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-standard className composer. Merges Tailwind classes intelligently
 *  (later utility classes override earlier ones in the same group). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Nearest ancestor that actually scrolls vertically (or null). */
export function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Scroll `el` into view inside `container` only — never the page or other
 * ancestors (scrollIntoView moves every scroller up the tree). `start`
 * puts the element's top just below the container's sticky inset
 * (`data-sticky-offset` on the container, plus `pad`); `nearest` does
 * nothing when the element is already fully visible.
 */
export function scrollWithin(
  container: HTMLElement | null,
  el: HTMLElement | null,
  mode: "start" | "nearest" = "start",
  pad = 16,
) {
  if (!container || !el) return;
  const inset = Number(container.dataset.stickyOffset ?? 0) + pad;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = r.top - c.top; // element top relative to the container's visible top
  const bottom = r.bottom - c.top;
  let delta: number;
  if (mode === "nearest") {
    if (top >= inset && bottom <= container.clientHeight - pad) return;
    delta = top < inset || r.height > container.clientHeight - inset - pad
      ? top - inset
      : bottom - (container.clientHeight - pad);
  } else {
    delta = top - inset;
  }
  if (Math.abs(delta) < 1) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  container.scrollTo({ top: container.scrollTop + delta, behavior: reduce ? "auto" : "smooth" });
}

/** Video position as m:ss, or h:mm:ss past an hour. */
export function formatTimestamp(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(t % 60)}` : `${m}:${pad(t % 60)}`;
}
