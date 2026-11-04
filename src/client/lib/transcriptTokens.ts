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
/** How far ahead to look for a resync point when nothing nearby lines up
 *  (a run of dropped disfluencies / false starts). */
const RESYNC_WINDOW = 15;

/** Symbols that are spoken as a word of their own ("50%" → "50 percent"). */
const SPOKEN_SYMBOL = /[%$€£&+=]/;
/** Standalone symbol tokens and the word they're read as. */
const SYMBOL_WORDS: Record<string, string> = { "&": "and", "+": "plus", "=": "equals", "%": "percent" };

/** Normalized text token: letters/digits, or the spoken word for a
 *  standalone symbol ("&" → "and"); "" for pure punctuation. */
const tokenNorm = (tok: string) => {
  const n = norm(tok);
  if (n) return n;
  const core = tok.replace(/[^%&+=]/g, "");
  return core.length === 1 ? (SYMBOL_WORDS[core] ?? "") : "";
};

/** A timed word's text, trimmed ("" when it has none). */
const wordText = (w: TranscriptWord) => String(w.text ?? "").trim();

/**
 * Fallback when the visit text and the timed words don't align: one span
 * per word, showing the word's own text (punctuated where the word is).
 */
export function wordTokens(words: TranscriptWord[]): AlignedTokens {
  return { display: words.map(wordText), owner: words.map((_, j) => j) };
}

/**
 * Greedy forward alignment of `text`'s whitespace tokens onto `words`.
 *
 * - Each token consumes words until their normalized concatenation equals
 *   the normalized token ("16-year-old" → "16" "year" "old").
 * - Pure punctuation tokens ("—", "…") are glued to the previous display;
 *   standalone "&" "+" "=" "%" are read as and / plus / equals / percent.
 * - A token with a spoken symbol ("50%", "$5") also takes the unit word
 *   that follows its number ("percent", "dollars") when the next token
 *   only lines up after it.
 * - When the two sides drift apart, a few candidates are scored by how
 *   many of the following tokens then line up: extra timed words (shown
 *   bare), a token with no words of its own (glued to the previous
 *   display, e.g. "over."), or a substitution ("16" vs "sixteen",
 *   rendered as the text token over the word's span). If none lines up,
 *   a wider window is searched for a resync point (the skipped words are
 *   shown bare); failing that, a token at the tail of the text takes the
 *   remaining words as a substitution ("2024." / "twenty twenty four").
 *
 * Returns null when more than 10% of tokens (and more than one) fail to
 * align, so the caller can fall back to per-word spans.
 */
export function alignDisplayTokens(text: string | undefined, words: TranscriptWord[] | undefined): AlignedTokens | null {
  if (!text?.trim() || !words?.length) return null;
  const tokens = text.trim().split(/\s+/);
  const tn = tokens.map(tokenNorm);
  const wn = words.map((w) => norm(String(w.text ?? "")));
  const n = words.length;
  const display: string[] = new Array(n).fill("");
  const owner: number[] = words.map((_, j) => j);
  /** `after[i]`: readable tokens after token `i`. */
  const after: number[] = new Array(tokens.length).fill(0);
  for (let i = tokens.length - 2; i >= 0; i--) after[i] = after[i + 1] + (tn[i + 1] ? 1 : 0);
  /** Index of the next readable token after `i`, or -1. */
  const nextReadable = (i: number) => {
    for (let x = i + 1; x < tokens.length; x++) if (tn[x]) return x;
    return -1;
  };

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
      j = symbolEnd(x, end, false);
    }
    return run;
  };

  /** Token `i` (with a spoken symbol: "50%", "$5") matched words up to
   *  `end`: also take the unit words the speaker added after the number
   *  ("percent", "dollars") when the next readable token only lines up
   *  after them. Returns the new end. `scored` picks the skip that lines
   *  up the most following tokens; otherwise (inside `runLength`) the
   *  first one where the next token matches. */
  const symbolEnd = (i: number, end: number, scored = true): number => {
    if (end >= n || !SPOKEN_SYMBOL.test(tokens[i]) || !norm(tokens[i])) return end;
    const next = nextReadable(i);
    if (next < 0) return n - end <= LOOKAHEAD ? n : end;
    if (matchAt(next, end) >= 0) return end;
    let to = end;
    let bestRun = 0;
    for (let s = 1; s <= LOOKAHEAD && end + s < n; s++) {
      const run = scored ? runLength(next, end + s) : matchAt(next, end + s) >= 0 ? 1 : 0;
      if (run > bestRun) {
        bestRun = run;
        to = end + s;
      }
    }
    return to;
  };

  /** True when token `i` is the last readable token, or none of the few
   *  readable tokens after it matches anywhere in the words from `from`. */
  const tailFails = (i: number, from: number): boolean => {
    if (after[i] === 0) return true;
    if (after[i] > SCORE_RUN) return false;
    for (let x = i + 1; x < tokens.length; x++) {
      if (!tn[x]) continue;
      for (let k = from; k < n; k++) if (matchAt(x, k) >= 0) return false;
    }
    return true;
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
      const t = wordText(words[x]);
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
      const to = symbolEnd(i, end);
      claim(j, to, tok);
      j = to;
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
        consider(1 + runLength(i + 1, symbolEnd(i, e, false)), () => {
          const to = symbolEnd(i, e);
          bare(j, j + s);
          claim(j + s, to, tok);
          j = to;
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
    if (plan) {
      plan.apply();
      continue;
    }

    // Nothing nearby lines up: a longer run of extra words (dropped
    // disfluencies, false starts). Resync further ahead on a run of at
    // least two tokens (one for the last token); the skipped words are
    // shown bare so no speech is lost.
    const need = Math.min(2, 1 + after[i]);
    let resync = -1;
    let resyncRun = 0;
    for (let s = LOOKAHEAD + 1; s <= RESYNC_WINDOW && j + s < n; s++) {
      const run = runLength(i, j + s);
      if (run >= need && run > resyncRun) {
        resync = j + s;
        resyncRun = run;
      }
    }
    if (resync >= 0) {
      const to = symbolEnd(i, matchAt(i, resync));
      bare(j, resync);
      claim(resync, to, tok);
      j = to;
      failed++;
      continue;
    }

    // The tail of the text with words left over and nothing after it
    // lining up: a substitution the scoring can't see ("2024." spoken as
    // "twenty twenty four" as the last token). Claim the remaining words
    // (leaving one for each later tail token) rather than gluing the token
    // and showing those words again, bare.
    if (j < n && tailFails(i, j)) {
      const take = Math.max(1, Math.min(LOOKAHEAD, n - j - after[i]));
      claim(j, j + take, tok);
      j += take;
      continue;
    }

    glue(tok);
    failed++;
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
/** Abbreviations whose "." doesn't end a sentence (lowercase, no dot). */
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "mx", "dr", "prof", "sr", "jr", "st", "mt", "vs", "cf", "al",
  "fig", "figs", "eq", "eqs", "approx", "ca", "dept", "vol", "pp",
]);

/** True when the shown text ends a sentence: ".", "?", "!" or "…", but
 *  not an abbreviation ("Dr.", "vs.") or dotted initials ("e.g.", "U.S."). */
function endsSentence(shown: string): boolean {
  if (!SENTENCE_END.test(shown)) return false;
  const last = shown.trim().split(/\s+/).pop() ?? "";
  const core = last.replace(/["'”’)\]]+$/, "").replace(/^[^\p{L}\p{N}]+/u, "");
  if (!core.endsWith(".") || core.endsWith("..")) return true;
  if (/^(?:\p{L}\.)+$/u.test(core)) return false;
  return !ABBREVIATIONS.has(core.slice(0, -1).toLowerCase());
}

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
      const sentenceEnd = endsSentence(prevShown);
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
 * Fallback for visits without word timings: split the visit's text into
 * sentences and estimate each one's start time from its character offset.
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
