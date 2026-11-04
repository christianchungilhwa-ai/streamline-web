import { useState, type ReactNode } from "react";
import { Video, VideoOff, ArrowDownUp, Sparkles, Play } from "lucide-react";
import type { SlideNote, TranscriptWord } from "@/lib/types";
import { assetUrl } from "@/lib/api";
import { cn, formatTimestamp } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { PDFPageView } from "@/components/PDFPageView";
import { NotesMarkdown } from "@/components/NotesMarkdown";

export interface SlideDetailViewProps {
  lectureId: string;
  note: SlideNote;
  /** 1-based PDF total page count, used to bounds-check pdfPageIndex. */
  pdfPageCount: number;
  /** True when this slide is the one currently being narrated. */
  isActive: boolean;
  activeWord: TranscriptWord | null;
  onSeekTo: (t: number) => void;
  /** Toggle for the annotated-slide image (when editedSlideKey is set). */
  annotationsVisible: boolean;
}

/**
 * Per-slide card. Mirrors `Streamline/Views/Results/SlideDetailView.swift`
 * — three rendering branches with the same priority:
 *
 *   1. `annotationsVisible && note.editedSlideKey` → server-baked
 *      GPT-Image-2 annotated PNG (`<img>` via assetUrl).
 *   2. `note.pdfPageIndex != null` → local PDFKit-style render via
 *      `PDFPageView` against the lecture's slides.pdf.
 *   3. `note.videoFrameKey != null` → server-stored video frame
 *      (`<img>` via assetUrl).
 *
 * Plus the badges:
 *   - **Reordered** (orange) when `isReordered`
 *   - **Video-only Slide** (pink) when rendered via videoFrameKey
 *   - **Not covered in this recording** (orange banner) when
 *     `!wasPresented`
 *
 * "Now playing" gets a subtle blue ring + dim opacity for everything
 * else. The whole card is dimmed (0.78) when `!wasPresented` since
 * those are skeleton entries the speaker never reached.
 */
export function SlideDetailView({
  lectureId,
  note,
  pdfPageCount,
  isActive,
  activeWord,
  onSeekTo,
  annotationsVisible,
}: SlideDetailViewProps) {
  // Local toggle: show annotations even when the global flag is on.
  // The global flag is the default; tapping the badge inverts for
  // this slide only.
  const [annOn, setAnnOn] = useState(annotationsVisible);

  const useAnnotated = annOn && !!note.editedSlideKey;
  const useVideoFrame = !useAnnotated && note.pdfPageIndex === null && !!note.videoFrameKey;
  const usePdfPage = !useAnnotated && note.pdfPageIndex !== null;
  // Where the slide is first shown in the recording; clicking the slide
  // (or this time) jumps the video there. null for slides never presented.
  const visits = note.transcriptVisits ?? [];
  const firstShown = visits.length ? Math.min(...visits.map((v) => v.startTime)) : null;

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-5 shadow-sm transition-all",
        isActive ? "ring-2 ring-primary/60" : "",
        !note.wasPresented && "opacity-[0.78]",
      )}
      data-slide-index={note.slideIndex}
    >
      {/* Header row: slide number + badges */}
      <header className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono font-semibold text-muted-foreground">
          Slide {note.slideIndex + 1}
        </span>
        {firstShown !== null && (
          <button
            type="button"
            onClick={() => onSeekTo(firstShown)}
            title="Play the video from this slide"
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Play className="h-3 w-3" />
            {formatTimestamp(firstShown)}
          </button>
        )}
        {note.isReordered && (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 font-medium text-orange-600 dark:text-orange-400">
            <ArrowDownUp className="h-3 w-3" />
            Reordered
          </span>
        )}
        {useVideoFrame && (
          <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2 py-0.5 font-medium text-pink-600 dark:text-pink-400">
            <Video className="h-3 w-3" />
            Video-only Slide
          </span>
        )}
        {note.editedSlideKey && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAnnOn((v) => !v)}
            className="h-6 px-2 text-xs"
          >
            <Sparkles />
            {annOn ? "Hide annotations" : "Show annotations"}
          </Button>
        )}
      </header>

      {/* Not-covered banner */}
      {!note.wasPresented && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-orange-500/10 px-3 py-2 text-sm text-orange-700 dark:text-orange-300">
          <VideoOff className="h-4 w-4 shrink-0" />
          <span className="font-medium">Not covered in this recording</span>
          <span className="text-xs text-orange-600/80 dark:text-orange-400/80">
            — slide is in the deck but the speaker did not present it
          </span>
        </div>
      )}

      {/* Two-column body: image on left, transcript+notes on right */}
      <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <SeekOnClick
          at={firstShown}
          label={`Play the video from slide ${note.slideIndex + 1}`}
          onSeekTo={onSeekTo}
        >
          {useAnnotated && note.editedSlideKey && (
            <img
              src={assetUrl(lectureId, note.editedSlideKey)}
              alt={`Slide ${note.slideIndex + 1} (annotated)`}
              className="w-full rounded-md border bg-white shadow-sm"
              crossOrigin="use-credentials"
            />
          )}
          {usePdfPage && note.pdfPageIndex !== null && (
            <PDFPageView
              pdfUrl={assetUrl(lectureId, "slides.pdf")}
              pageNumber={note.pdfPageIndex + 1}
              width={400}
            />
          )}
          {useVideoFrame && note.videoFrameKey && (
            <img
              src={assetUrl(lectureId, note.videoFrameKey)}
              alt={`Slide ${note.slideIndex + 1} (video frame)`}
              className="w-full rounded-md border-2 border-pink-500/40 bg-white shadow-sm"
              crossOrigin="use-credentials"
            />
          )}
          {!useAnnotated && !usePdfPage && !useVideoFrame && (
            <div className="flex aspect-video items-center justify-center rounded-md border border-dashed bg-muted text-xs text-muted-foreground">
              No slide image
            </div>
          )}
        </SeekOnClick>

        <div className="min-w-0 space-y-4">
          {/* Transcript */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Transcript
            </h3>
            <TranscriptPanel
              note={note}
              activeWord={isActive ? activeWord : null}
              onSeekTo={onSeekTo}
            />
          </section>

          {/* AI Notes */}
          {note.aiNotes && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                AI notes
              </h3>
              <NotesMarkdown markdown={note.aiNotes} />
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

/** The slide image column. When the slide was presented, the whole image
 *  is a button that seeks the video to `at`, with a play badge on hover /
 *  keyboard focus; otherwise a plain container. */
function SeekOnClick({
  at,
  label,
  onSeekTo,
  children,
}: {
  at: number | null;
  label: string;
  onSeekTo: (t: number) => void;
  children: ReactNode;
}) {
  if (at === null) return <div className="min-w-0">{children}</div>;
  return (
    <button
      type="button"
      onClick={() => onSeekTo(at)}
      title={label}
      aria-label={`${label} (${formatTimestamp(at)})`}
      className="group relative block w-full min-w-0 cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
      <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 font-mono text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <Play className="h-3 w-3" />
        {formatTimestamp(at)}
      </span>
    </button>
  );
}

// Bounds check var to silence noUnusedParameters when pdfPageCount isn't used yet.
// Kept in the prop list because future iterations will use it to
// guard against out-of-range pdfPageIndex.
void ((p: number) => p)(0);
