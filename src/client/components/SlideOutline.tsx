import { memo, useEffect, useMemo, useRef } from "react";
import type { SlideNote } from "@/lib/types";
import { cn, formatTimestamp, scrollWithin } from "@/lib/utils";

export interface SlideOutlineProps {
  notes: SlideNote[];
  /** Index into `notes` of the slide being narrated, or null. */
  activeIndex: number | null;
  /** Row clicked: the viewer seeks the video there and scrolls the card in. */
  onSelect: (index: number) => void;
  className?: string;
}

const MD_NOISE = /^[#>*\-\s]+|[*_`~]|<[^>]+>/g;
const TITLE_MAX = 80;

/** First non-empty line of the AI notes (markdown stripped), else the
 *  first line of the slide's OCR text, else "Slide n" — cut to 80 chars. */
export function slideTitle(note: SlideNote): string {
  const firstLine = (s: string | null | undefined) =>
    (s ?? "")
      .split("\n")
      .map((l) => l.replace(MD_NOISE, "").trim())
      .find(Boolean);
  // OCR text arrives normalized (all lowercase) — sentence-case it so the
  // outline doesn't mix "Attendance Flexibility…" with "session 1 clinical…".
  const ocr = firstLine(note.slideOCRText);
  const t =
    firstLine(note.aiNotes) ??
    (ocr ? ocr.charAt(0).toUpperCase() + ocr.slice(1) : null) ??
    `Slide ${note.slideIndex + 1}`;
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1).trimEnd()}…` : t;
}

/** Where the slide is first shown in the recording, or null if never. */
export function firstShownAt(note: SlideNote): number | null {
  const visits = note.transcriptVisits ?? [];
  return visits.length ? Math.min(...visits.map((v) => v.startTime)) : null;
}

/**
 * Slide outline for the viewer's desktop rail: one row per slide (number,
 * title, first-shown time). The active row follows the video, and the
 * list keeps it in view without moving any other scroller.
 */
export const SlideOutline = memo(function SlideOutline({
  notes,
  activeIndex,
  onSelect,
  className,
}: SlideOutlineProps) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const rows = useMemo(
    () => notes.map((n) => ({ id: n.id, num: n.slideIndex + 1, title: slideTitle(n), at: firstShownAt(n), presented: n.wasPresented })),
    [notes],
  );

  // Keep the active row in view as the video plays.
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  const revealActive = () => {
    const list = listRef.current;
    const i = activeRef.current;
    if (!list || i === null || list.clientHeight === 0) return; // hidden (below lg / other tab)
    scrollWithin(list, list.querySelector<HTMLElement>(`[data-outline-index="${i}"]`), "nearest", 8);
  };
  useEffect(revealActive, [activeIndex]);

  // The rail is display:none below lg and on the Study guide tab; when it
  // reappears, bring the active row back into view.
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    let wasHidden = list.clientHeight === 0;
    const ro = new ResizeObserver(() => {
      const hidden = list.clientHeight === 0;
      if (wasHidden && !hidden) revealActive();
      wasHidden = hidden;
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, []); // revealActive reads refs only

  return (
    <nav aria-label="Slide outline" className={cn("min-h-0 flex-1 flex-col border-t pt-3", className)}>
      <div className="flex items-center justify-between px-2 pb-2">
        <h2 className="eyebrow">Slides · {notes.length}</h2>
      </div>
      <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((r, i) => {
          const active = i === activeIndex;
          return (
            <li key={r.id}>
              <button
                type="button"
                data-outline-index={i}
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(i)}
                title={r.title}
                className={cn(
                  "flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm text-foreground/85 transition-colors hover:bg-accent hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active && "bg-primary/10 font-medium text-foreground hover:bg-primary/15",
                  !r.presented && "opacity-60",
                )}
              >
                <span className="meta w-7 shrink-0">{r.num}</span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="meta ml-auto shrink-0">{r.at !== null ? formatTimestamp(r.at) : "—"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
});
