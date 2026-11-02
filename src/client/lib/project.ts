import type { LectureProject, TranscriptWord } from "./types";

/**
 * project.json as the server writes it → the shape the viewer reads.
 *
 * Two server conventions the types don't capture on their own:
 *   - transcript words are `{word, startTime, endTime}` (TranscriptWord
 *     .to_dict in Streamline-Server models.py), not `{text, start, end}`;
 *   - `wasPresented` is written only when false — absence means presented.
 *
 * Reading the raw JSON directly rendered every transcript word empty and
 * put a "Not covered in this recording" banner on every slide.
 */
export function normalizeProject(raw: unknown): LectureProject | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as LectureProject;
  return {
    ...p,
    slideNotes: (p.slideNotes ?? []).map((n) => ({
      ...n,
      wasPresented: n.wasPresented !== false,
      transcriptVisits: (n.transcriptVisits ?? []).map((v) => ({
        ...v,
        words: v.words?.map(normalizeWord),
      })),
    })),
  };
}

function normalizeWord(w: TranscriptWord): TranscriptWord {
  return {
    ...w,
    text: typeof w.text === "string" ? w.text : String(w.word ?? ""),
    start: typeof w.start === "number" ? w.start : Number(w.startTime ?? 0),
    end: typeof w.end === "number" ? w.end : Number(w.endTime ?? 0),
  };
}
