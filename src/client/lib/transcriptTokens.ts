import type { TranscriptVisit, TranscriptWord } from "./types";

/**
 * Transcript display helpers.
 *
 * The server stores each visit twice: `text` is the punctuated,
 * human-readable transcript, while `words` are the timed tokens with the
 * punctuation stripped ("Let me duplicate it What the hell If I…"). The
 * viewer wants both — readable sentences AND clickable, highlightable
 * words — so we align the two: every word gets the original text token
 * it belongs to, punctuation and casing included.
 */

export interface AlignedTokens {
  /** What to render for word `j`: the original token (with punctuation)
   *  for the first word of a token, `""` for the words folded into it
   *  ("16-year-old" spans three words). */
  display: string[];
  /** `owner[j]` is the index of the word whose span renders word `j`.
   *  Highlight / ref the span of `owner[activeIndex]`. Groups are
   *  contiguous: `owner[j] <= j`. */
  owner: number[];
}

/** Lowercase letters and digits only (any script). */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** True when the string has something to read (not just "…" or "—"). */
export const hasSpeech = (s: string | undefined) => !!s && norm(s).length > 0;

/** How many words / tokens ahead to look when the two sides drift apart. */
const LOOKAHEAD = 3;
/** How many following tokens a recovery candidate is scored on. */
const SCORE_RUN = 4;

/**
 * Greedy forward alignment of `text`'s whitespace tokens onto `words`.
 *
 * - Each token consumes words until their normalized concatenation equals
 *   the normalized token ("16-year-old" → "16" "year" "old").
 * - Pure punctuation tokens ("—", "…") are glued to the previous display.
 * - When the two sides drift apart, a few candidates are scored by how
 *   many of the following tokens then line up: extra timed words (shown
 *   bare), a token with no words of its own (glued to the previous
 *   display, e.g. "over."), or a substitution ("16" vs "sixteen",
 *   rendered as the text token over the word's span).
 *
 * Returns null when more than 10% of tokens (and more than one) fail to
 * align, so the caller can fall back to sentence-level spans.
 */
export function alignDisplayTokens(text: string | undefined, words: TranscriptWord[] | undefined): AlignedTokens | null {
  if (!text?.trim() || !words?.length) return null;
  const tokens = text.trim().split(/\s+/);
  const tn = tokens.map(norm);
  const wn = words.map((w) => norm(String(w.text ?? "")));
  const n = words.length;
  const display: string[] = new Array(n).fill("");
  const owner: number[] = words.map((_, j) => j);

  /** End word index (exclusive) when token `i` matches words from `start`, else -1. */
  const matchAt = (i: number, start: number): number => {
    const nt = tn[i];
    if (!nt || start >= n) return -1;
    let acc = "";
    let k = start;
    while (k < n && acc.length < nt.length) {
      acc += wn[k];
      k++;
      if (!nt.startsWith(acc)) return -1;
    }
    return acc === nt ? k : -1;
  };

  /** How many readable tokens from `i` line up, in order, from word `j`. */
  const runLength = (i: number, j: number): number => {
    let run = 0;
    for (let x = i; x < tokens.length && run < SCORE_RUN; x++) {
      if (!tn[x]) continue;
      const end = matchAt(x, j);
      if (end < 0) break;
      run++;
      j = end;
    }
    return run;
  };

  let j = 0; // next unconsumed word
  let lastShown = -1; // last word index whose display is non-empty
  let pending = ""; // leading punctuation with no word to sit on yet
  let failed = 0;
  let readable = 0;

  const glue = (tok: string) => {
    if (lastShown >= 0) display[lastShown] += ` ${tok}`;
    else pending += `${tok} `;
  };
  const claim = (from: number, to: number, tok: string) => {
    display[from] = pending + tok;
    pending = "";
    for (let x = from; x < to; x++) owner[x] = from;
    lastShown = from;
  };
  const bare = (from: number, to: number) => {
    for (let x = from; x < to; x++) {
      const t = String(words[x].text ?? "");
      if (!t) continue;
      display[x] = pending + t;
      pending = "";
      lastShown = x;
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tn[i]) {
      glue(tok);
      continue;
    }
    readable++;

    const end = matchAt(i, j);
    if (end >= 0) {
      claim(j, end, tok);
      j = end;
      continue;
    }

    // Drifted. Score each way of getting back in step.
    type Plan = { score: number; apply: () => void };
    let best: Plan | null = null;
    const consider = (score: number, apply: () => void) => {
      if (score > 0 && (!best || score > best.score)) best = { score, apply };
    };
    for (let s = 1; s <= LOOKAHEAD; s++) {
      // Extra timed words the text doesn't have.
      const e = matchAt(i, j + s);
      if (e >= 0) {
        consider(1 + runLength(i + 1, e), () => {
          bare(j, j + s);
          claim(j + s, e, tok);
          j = e;
          failed++;
        });
      }
    }
    // A token with no words of its own.
    consider(runLength(i + 1, j), () => {
      glue(tok);
      failed++;
    });
    for (let s = 1; s <= LOOKAHEAD && j + s <= n; s++) {
      // Substitution: the text says it differently ("16" / "sixteen").
      consider(runLength(i + 1, j + s), () => {
        claim(j, j + s, tok);
        j += s;
      });
    }

    const plan = best as Plan | null;
    if (plan) plan.apply();
    else {
      glue(tok);
      failed++;
    }
  }

  // Timed words the text never mentioned: still shown, still clickable.
  if (j < n) {
    for (let x = j; x < n; x++) if (wn[x]) failed++;
    bare(j, n);
  }
  if (pending.trim() && lastShown >= 0) display[lastShown] += ` ${pending.trim()}`;

  // One stray token is fine even in a short visit; beyond that, 10%.
  if (readable === 0 || failed > Math.max(1, readable * 0.1)) return null;
  return { display, owner };
}

/** Pause long enough to read as a paragraph break. */
const PARAGRAPH_GAP_S = 1.5;
/** A pause this long breaks even mid-sentence. */
const HARD_GAP_S = 4;
/** Paragraph length after which the next sentence end starts a new one. */
const PARAGRAPH_WORDS = 60;

const SENTENCE_END = /[.?!…]["'”’)\]]*$/;

/**
 * Group word indices into paragraphs. A new paragraph starts after a
 * pause longer than 1.5 s at a sentence end (or any pause over 4 s), or
 * once a paragraph has 60+ words and the previous token ends a sentence.
 * Never splits inside a multi-word token.
 */
export function splitParagraphs(words: TranscriptWord[], display: string[]): number[][] {
  const paras: number[][] = [];
  let cur: number[] = [];
  let count = 0; // visible tokens in `cur`
  let prevShown = "";
  for (let j = 0; j < words.length; j++) {
    const starts = display[j] !== "";
    if (starts && cur.length) {
      const gap = words[j].start - words[j - 1].end;
      const sentenceEnd = SENTENCE_END.test(prevShown);
      if ((gap > PARAGRAPH_GAP_S && sentenceEnd) || gap > HARD_GAP_S || (count >= PARAGRAPH_WORDS && sentenceEnd)) {
        paras.push(cur);
        cur = [];
        count = 0;
      }
    }
    cur.push(j);
    if (starts) {
      count++;
      prevShown = display[j];
    }
  }
  if (cur.length) paras.push(cur);
  return paras;
}

export interface SentenceSpan {
  text: string;
  /** Estimated seek time, proportional to the sentence's offset in the visit. */
  start: number;
  /** Estimated end (the next sentence's start, or the visit's end). */
  end: number;
}

/**
 * Fallback when words and text don't align (or there are no word
 * timings): split the visit's text into sentences and estimate each
 * one's start time from its character offset.
 */
export function sentenceSpans(visit: Pick<TranscriptVisit, "text" | "startTime" | "endTime">): SentenceSpan[] {
  const text = (visit.text ?? "").trim();
  if (!text) return [];
  const parts = text.split(/(?<=[.?!])\s+/);
  const t0 = visit.startTime;
  const t1 = Math.max(t0, visit.endTime ?? t0);
  const at = (offset: number) => t0 + ((t1 - t0) * offset) / text.length;
  const spans: SentenceSpan[] = [];
  let offset = 0;
  for (const part of parts) {
    const found = text.indexOf(part, offset);
    if (found >= 0) offset = found;
    spans.push({ text: part, start: at(offset), end: at(offset + part.length) });
    offset += part.length;
  }
  return spans;
}
