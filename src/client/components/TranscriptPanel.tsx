import { useMemo, useRef, useEffect } from "react";
import type { SlideNote, TranscriptWord } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface TranscriptPanelProps {
  note: SlideNote;
  activeWord: TranscriptWord | null;
  /** Called when the user clicks a word (to seek the video). */
  onSeekTo?: (timeSeconds: number) => void;
  className?: string;
}

/**
 * Renders one slide's transcript as visit-paragraphs. When word-level
 * timings are present, each word is a click target that seeks the
 * video. The currently-spoken word is highlighted.
 *
 * Auto-scrolls the active word into view (smooth, nearest-block) so
 * during playback the panel tracks the speaker without the user
 * needing to scroll manually.
 */
export function TranscriptPanel({ note, activeWord, onSeekTo, className }: TranscriptPanelProps) {
  const wordRefs = useRef<Map<TranscriptWord, HTMLSpanElement | null>>(new Map());

  // Auto-scroll the active word into view when it changes.
  useEffect(() => {
    if (!activeWord) return;
    const el = wordRefs.current.get(activeWord);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [activeWord]);

  const visits = useMemo(() => {
    // Drop visits with zero content — they're synthetic and would
    // render as empty paragraphs.
    return note.transcriptVisits.filter((v) => (v.text ?? "").trim() || (v.words?.length ?? 0) > 0);
  }, [note.transcriptVisits]);

  if (visits.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        {note.transcriptText.trim() ? (
          <p>{note.transcriptText}</p>
        ) : (
          <p className="italic">No transcript for this slide.</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {visits.map((visit, i) => (
        <p key={i} className="text-foreground">
          {visit.words?.length ? (
            visit.words.map((w, j) => {
              const isActive = w === activeWord;
              return (
                <span
                  key={j}
                  ref={(el) => {
                    wordRefs.current.set(w, el);
                  }}
                  onClick={() => onSeekTo?.(w.start)}
                  className={cn(
                    "cursor-pointer rounded px-0.5 transition-colors",
                    // Active word — sky-blue tint, not full saturation,
                    // so the reading flow isn't broken by a loud
                    // highlight on every spoken word.
                    isActive
                      ? "bg-primary/25 text-primary font-medium"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {w.text}
                  {j < (visit.words?.length ?? 0) - 1 ? " " : ""}
                </span>
              );
            })
          ) : (
            <span
              onClick={() => onSeekTo?.(visit.startTime)}
              className="cursor-pointer rounded hover:bg-accent"
            >
              {visit.text}
            </span>
          )}
        </p>
      ))}
    </div>
  );
}
