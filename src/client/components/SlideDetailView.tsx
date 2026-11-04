import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Video, VideoOff, ArrowDownUp, Sparkles, Play, ChevronDown, ChevronUp } from "lucide-react";
import type { SlideNote, TranscriptWord } from "@/lib/types";
import { assetUrl } from "@/lib/api";
import { plural } from "@/lib/format";
import { hasSpeech } from "@/lib/transcriptTokens";
import { cn, formatTimestamp, getScrollParent, scrollWithin } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { PDFPageView } from "@/components/PDFPageView";
import { NotesMarkdown } from "@/components/NotesMarkdown";

export interface SlideDetailViewProps {
  lectureId: string;
  note: SlideNote;
  /** PDF page count, used to bounds-check pdfPageIndex. */
  pdfPageCount: number;
  /** True when this slide is the one currently being narrated. */
  isActive: boolean;
  activeWord: TranscriptWord | null;
  onSeekTo: (t: number) => void;
  /** Global "Annotations" setting: the default for the annotated-slide
   *  image (when editedSlideKey is set). Each card can override it. */
  annotationsVisible: boolean;
  /** Global "Follow video" setting. The active card's transcript keeps
   *  the spoken word in view only while this is on. */
  autoScroll: boolean;
}

/** Transcripts longer than this are clamped until the card has been active. */
const CLAMP_WORDS = 120;

const countWords = (text: string) => text.trim().split(/\s+/).filter(hasSpeech).length;

/**
 * Per-slide card. Mirrors `Streamline/Views/Results/SlideDetailView.swift`.
 * The slide image has three rendering branches with the same priority:
 *
 *   1. annotations on && `note.editedSlideKey` → server-baked annotated
 *      PNG (`<img>` via assetUrl).
 *   2. `note.pdfPageIndex != null` → local render of that page of the
 *      lecture's slides.pdf (`PDFPageView`).
 *   3. `note.videoFrameKey != null` → server-stored video frame.
 *
 * Header badges: the time chip (seeks + plays), "Out of order" when
 * `isReordered`, "From video" when the image is a captured frame. Slides
 * the speaker never reached get a "Skipped in the recording" callout and
 * are dimmed.
 *
 * Layout follows the card's own width (container query): one column when
 * narrow, image | notes + transcript side by side from @2xl, with the
 * image sticky while the transcript scrolls on lg.
 */
export function SlideDetailView({
  lectureId,
  note,
  pdfPageCount,
  isActive,
  activeWord,
  onSeekTo,
  annotationsVisible,
  autoScroll,
}: SlideDetailViewProps) {
  const id = useId();
  const headingId = `${id}-title`;
  const transcriptId = `${id}-transcript`;

  // Per-slide annotations override on top of the global setting. Any flip
  // of the global setting clears it, so every card follows the new value
  // (and an old override doesn't resurface when the global flips back).
  // Adjusted during render: no effect, no stale copy of the prop.
  const [override, setOverride] = useState<boolean | null>(null);
  const [overrideBase, setOverrideBase] = useState(annotationsVisible);
  if (overrideBase !== annotationsVisible) {
    setOverrideBase(annotationsVisible);
    setOverride(null);
  }
  const annOn = override ?? annotationsVisible;
  const setSlideAnn = (on: boolean) => setOverride(on === annotationsVisible ? null : on);

  const pdfIndex =
    typeof note.pdfPageIndex === "number" &&
    note.pdfPageIndex >= 0 &&
    (!pdfPageCount || note.pdfPageIndex < pdfPageCount)
      ? note.pdfPageIndex
      : null;
  const useAnnotated = annOn && !!note.editedSlideKey;
  const useVideoFrame = !useAnnotated && pdfIndex === null && !!note.videoFrameKey;
  const usePdfPage = !useAnnotated && pdfIndex !== null;

  // Where the slide is first shown in the recording; clicking the slide
  // (or the time chip) jumps the video there. null for slides never presented.
  const visits = note.transcriptVisits ?? [];
  const firstShown = visits.length ? Math.min(...visits.map((v) => v.startTime)) : null;

  const stats = useMemo(() => {
    const spoken = (note.transcriptVisits ?? []).filter(
      (v) => hasSpeech(v.text) || (v.words ?? []).some((w) => hasSpeech(String(w.text ?? ""))),
    );
    let words = 0;
    for (const v of spoken) {
      words += v.words?.length ? v.words.filter((w) => hasSpeech(String(w.text ?? ""))).length : countWords(v.text);
    }
    if (!spoken.length && hasSpeech(note.transcriptText)) words = countWords(note.transcriptText);
    return {
      words,
      start: spoken.length ? Math.min(...spoken.map((v) => v.startTime)) : null,
      end: spoken.length ? Math.max(...spoken.map((v) => v.endTime)) : null,
    };
  }, [note.transcriptVisits, note.transcriptText]);

  // Long transcripts stay clamped until the card has been active once;
  // after that they stay open so cards never collapse under the reader.
  // (State adjusted during render, not in an effect, so the expanded
  // layout is the first one painted when the card becomes active.)
  const [expanded, setExpanded] = useState(isActive);
  const [wasActive, setWasActive] = useState(isActive);
  if (isActive !== wasActive) {
    setWasActive(isActive);
    if (isActive) setExpanded(true);
  }
  const isLong = stats.words > CLAMP_WORDS;
  const clamp = isLong && !expanded;

  const transcriptRef = useRef<HTMLElement | null>(null);
  const toggleTranscript = () => {
    if (clamp) {
      setExpanded(true);
      return;
    }
    setExpanded(false);
    // Collapsing a long transcript can leave the reader below the card;
    // bring its top back into view (inside the list's own scroller).
    requestAnimationFrame(() => {
      const el = transcriptRef.current;
      if (el) scrollWithin(getScrollParent(el), el, "nearest");
    });
  };

  // Stable seek handler for the memoized children below: the viewer
  // passes a fresh closure on every render (every spoken word).
  const seekRef = useRef(onSeekTo);
  useLayoutEffect(() => {
    seekRef.current = onSeekTo;
  });
  const seek = useCallback((t: number) => seekRef.current(t), []);

  // Every card re-renders on each spoken word; only the active one's
  // transcript actually changes, and the notes never do.
  const panelWord = isActive ? activeWord : null;
  const follow = autoScroll && isActive;
  const transcriptPanel = useMemo(
    () => <TranscriptPanel note={note} activeWord={panelWord} follow={follow} onSeekTo={seek} />,
    [note, panelWord, follow, seek],
  );
  const notes = useMemo(() => (note.aiNotes?.trim() ? <NotesMarkdown markdown={note.aiNotes} /> : null), [note.aiNotes]);

  const showTranscript = note.wasPresented || stats.words > 0;
  const n = note.slideIndex + 1;

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "@container card-surface scroll-mt-4 p-4 transition-shadow md:p-5",
        isActive && "ring-2 ring-primary/60",
        !note.wasPresented && "opacity-80",
      )}
      data-slide-index={note.slideIndex}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="text-sm font-semibold tabular-nums text-foreground">
          Slide {n}
        </h2>
        {firstShown !== null && (
          <Badge tone="info" asChild>
            <button
              type="button"
              onClick={() => onSeekTo(firstShown)}
              aria-label={`Play from ${formatTimestamp(firstShown)}`}
              title="Play the video from this slide"
              className={cn(
                "relative cursor-pointer tabular-nums transition-colors hover:bg-primary/25",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // Bigger hit area than the 20px pill, without changing its look.
                "after:absolute after:-inset-x-1 after:-inset-y-2",
              )}
            >
              <Play />
              {formatTimestamp(firstShown)}
            </button>
          </Badge>
        )}
        {note.isReordered && (
          <Badge tone="warning" title="Presented in a different order than the deck">
            <ArrowDownUp />
            Out of order
          </Badge>
        )}
        {useVideoFrame && (
          <Badge tone="neutral" title="Not in your deck — captured from the recording">
            <Video />
            From video
          </Badge>
        )}
      </header>

      {!note.wasPresented && (
        <Callout tone="warning" icon={<VideoOff />} title="Skipped in the recording" className="mb-4">
          This slide is in the deck but wasn't shown.
        </Callout>
      )}

      <div className="grid gap-5 @2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="relative min-w-0 self-start lg:@2xl:sticky lg:@2xl:top-4">
          <SeekOnClick at={firstShown} label={`Play the video from slide ${n}`} onSeekTo={onSeekTo}>
            {useAnnotated && note.editedSlideKey && (
              <img
                src={assetUrl(lectureId, note.editedSlideKey)}
                alt={`Slide ${n} (annotated)`}
                className="block w-full rounded-lg border bg-white"
                crossOrigin="use-credentials"
              />
            )}
            {usePdfPage && pdfIndex !== null && (
              <PDFPageView pdfUrl={assetUrl(lectureId, "slides.pdf")} pageNumber={pdfIndex + 1} />
            )}
            {useVideoFrame && note.videoFrameKey && (
              <img
                src={assetUrl(lectureId, note.videoFrameKey)}
                alt={`Slide ${n} (captured from the video)`}
                className="block w-full rounded-lg border bg-white"
                crossOrigin="use-credentials"
              />
            )}
            {!useAnnotated && !usePdfPage && !useVideoFrame && (
              <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed bg-muted text-xs text-muted-foreground">
                No slide image
              </div>
            )}
          </SeekOnClick>
          {note.editedSlideKey && (
            // A sibling of the seek button, never inside it.
            <Segmented
              variant="overlay"
              size="xs"
              aria-label="Slide image"
              className="absolute right-2 top-2 z-10"
              value={annOn ? "annotated" : "original"}
              onValueChange={(v) => setSlideAnn(v === "annotated")}
            >
              <SegmentedItem value="original" label="Original" />
              <SegmentedItem value="annotated" label="Annotated" />
            </Segmented>
          )}
        </div>

        {(notes || showTranscript) && (
          <div className="min-w-0 space-y-5">
            {notes && (
              <section aria-labelledby={`${id}-notes`}>
                <h3
                  id={`${id}-notes`}
                  className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-foreground"
                  title="Generated from this slide and its transcript"
                >
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  Notes
                </h3>
                {notes}
              </section>
            )}

            {showTranscript && (
              <section ref={transcriptRef} aria-labelledby={`${id}-transcript-title`} className="scroll-mt-4">
                <div className="mb-2 flex items-baseline gap-1.5">
                  <h3 id={`${id}-transcript-title`} className="text-[13px] font-semibold text-foreground">
                    Transcript
                  </h3>
                  {stats.words > 0 && (
                    <span className="meta">
                      · {plural(stats.words, "word")}
                      {stats.start !== null && stats.end !== null && (
                        <> · {formatTimestamp(stats.start)}–{formatTimestamp(stats.end)}</>
                      )}
                    </span>
                  )}
                </div>
                <div
                  id={transcriptId}
                  className={cn(
                    clamp && "max-h-44 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]",
                  )}
                >
                  {transcriptPanel}
                </div>
                {isLong && (
                  <Button
                    variant="subtle"
                    size="sm"
                    className="-ml-2 mt-1"
                    aria-expanded={!clamp}
                    aria-controls={transcriptId}
                    onClick={toggleTranscript}
                  >
                    {clamp ? <ChevronDown /> : <ChevronUp />}
                    {clamp ? "Show full transcript" : "Show less"}
                  </Button>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** The slide image. When the slide was presented, the whole image is a
 *  button that seeks the video to `at`, with a play badge on hover /
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
  if (at === null) return <div className="block w-full overflow-hidden rounded-lg">{children}</div>;
  return (
    <button
      type="button"
      onClick={() => onSeekTo(at)}
      title={label}
      aria-label={`${label} (${formatTimestamp(at)})`}
      className="group relative block w-full cursor-pointer overflow-hidden rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
    >
      {children}
      <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs tabular-nums text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <Play className="size-3" />
        {formatTimestamp(at)}
      </span>
    </button>
  );
}
