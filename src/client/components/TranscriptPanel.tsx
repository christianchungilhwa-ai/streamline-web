import { Fragment, useEffect, useMemo, useRef } from "react";
import type { SlideNote, TranscriptVisit, TranscriptWord } from "@/lib/types";
import { cn, getScrollParent, scrollWithin } from "@/lib/utils";
import {
  alignDisplayTokens,
  hasSpeech,
  sentenceSpans,
  splitParagraphs,
  wordTokens,
  type SentenceSpan,
} from "@/lib/transcriptTokens";

export interface TranscriptPanelProps {
  note: SlideNote;
  activeWord: TranscriptWord | null;
  /** Keep the spoken word in view inside its scroller (Follow video on and
   *  this slide active). Off → never scrolls. */
  follow: boolean;
  /** Called when the user clicks a word (to seek the video). */
  onSeekTo?: (timeSeconds: number) => void;
  className?: string;
}

/** One rendered token: words `first..last` (inclusive) under one span. */
interface Token {
  first: number;
  last: number;
  text: string;
}

type VisitModel =
  | { kind: "words"; visit: TranscriptVisit; words: TranscriptWord[]; paragraphs: Token[][] }
  | { kind: "sentences"; visit: TranscriptVisit; sentences: SentenceSpan[] };

/** Visit → paragraphs of clickable tokens (punctuation restored from the
 *  visit text; the words' own text when the two don't align), or
 *  estimated sentence spans when the visit has no timed words. */
function buildVisit(visit: TranscriptVisit): VisitModel {
  const words = visit.words ?? [];
  if (!words.some((w) => hasSpeech(String(w.text ?? "")))) {
    return { kind: "sentences", visit, sentences: sentenceSpans(visit) };
  }
  const { display, owner } = alignDisplayTokens(visit.text, words) ?? wordTokens(words);
  const paragraphs = splitParagraphs(words, display).map((indices) => {
    const tokens: Token[] = [];
    for (const j of indices) {
      const last = tokens[tokens.length - 1];
      if (last && owner[j] === last.first) last.last = j;
      else if (display[j]) tokens.push({ first: j, last: j, text: display[j] });
      else if (last) last.last = j; // empty bare word: fold into the previous span
    }
    return tokens;
  });
  return { kind: "words", visit, words, paragraphs };
}

const wordClass = "cursor-pointer rounded-[3px] transition-colors duration-150 [box-decoration-break:clone]";
const activeClass =
  "bg-primary/20 text-foreground shadow-[0_0_0_2px_color-mix(in_oklab,var(--color-primary)_20%,transparent)]";
const idleClass = "hover:bg-primary/10";

/**
 * One slide's transcript. Each visit is split into paragraphs (pauses and
 * sentence ends); with word timings every word is a click target that
 * seeks the video and the spoken word is highlighted. Punctuation comes
 * from the visit text, aligned onto the timed words.
 *
 * With `follow`, the spoken word is kept in view inside the nearest
 * scrolling ancestor only (never `scrollIntoView`, which would also move
 * the page and every other scroller).
 */
export function TranscriptPanel({ note, activeWord, follow, onSeekTo, className }: TranscriptPanelProps) {
  const activeRef = useRef<HTMLSpanElement | null>(null);

  const visits = useMemo(
    () =>
      (note.transcriptVisits ?? [])
        // Drop visits with nothing to read (synthetic, or "…" only).
        .filter((v) => hasSpeech(v.text) || (v.words ?? []).some((w) => hasSpeech(String(w.text ?? ""))))
        .map(buildVisit),
    [note.transcriptVisits],
  );

  useEffect(() => {
    if (!activeWord || !follow) return;
    const el = activeRef.current;
    if (el) keepInView(el);
  }, [activeWord, follow]);

  if (visits.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        {hasSpeech(note.transcriptText) ? <p>{note.transcriptText}</p> : <p>No transcript for this slide.</p>}
      </div>
    );
  }

  return (
    <div className={cn("max-w-[70ch] space-y-4 text-[15px] leading-7 text-foreground/90", className)}>
      {visits.map((m, i) => {
        if (m.kind === "sentences") {
          const words = m.visit.words ?? [];
          const activeAt = activeWord && words.includes(activeWord) ? activeWord.start : null;
          return (
            <p key={i}>
              {m.sentences.map((s, k) => {
                const isActive =
                  activeAt !== null && activeAt >= s.start && (activeAt < s.end || k === m.sentences.length - 1);
                return (
                  <Fragment key={k}>
                    <span
                      ref={isActive ? activeRef : undefined}
                      onClick={() => onSeekTo?.(s.start)}
                      className={cn(wordClass, isActive ? activeClass : idleClass)}
                    >
                      {s.text}
                    </span>
                    {k < m.sentences.length - 1 ? " " : null}
                  </Fragment>
                );
              })}
            </p>
          );
        }
        const activeIdx = activeWord ? m.words.indexOf(activeWord) : -1;
        return (
          <Fragment key={i}>
            {m.paragraphs.map((tokens, p) => (
              <p key={p}>
                {tokens.map((t, k) => {
                  const isActive = activeIdx >= t.first && activeIdx <= t.last;
                  return (
                    <Fragment key={t.first}>
                      <span
                        ref={isActive ? activeRef : undefined}
                        onClick={() => onSeekTo?.(m.words[t.first].start)}
                        className={cn(wordClass, isActive ? activeClass : idleClass)}
                      >
                        {t.text}
                      </span>
                      {k < tokens.length - 1 ? " " : null}
                    </Fragment>
                  );
                })}
              </p>
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}

/** Follow the spoken word: nothing while it's comfortably visible; once
 *  it leaves the view, bring it back to about a third of the way down
 *  (below any sticky header) so the next lines are readable ahead of the
 *  speaker, instead of creeping along the bottom edge. */
function keepInView(el: HTMLElement) {
  const sc = getScrollParent(el);
  if (!sc) return;
  const inset = Number(sc.dataset.stickyOffset ?? 0);
  const pad = 24;
  const c = sc.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = r.top - c.top;
  const bottom = r.bottom - c.top;
  if (top >= inset + pad && bottom <= sc.clientHeight - pad) return;
  scrollWithin(sc, el, "start", Math.max(pad, Math.round((sc.clientHeight - inset) / 3)));
}
