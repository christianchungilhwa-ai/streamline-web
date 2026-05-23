/**
 * TypeScript types mirroring the `project.json` shape that
 * streamline-server emits and that Claraity-web's proxy returns
 * verbatim. Source of truth on the server side is
 * `Streamline-Server/app/processing/models.py` (SlideNote.to_dict,
 * build_project_json) — keep these in sync when fields are added.
 */

/** One word in a transcript visit, with its time range and slide tracker. */
export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
  /** Server may also emit `word`/`probability`/`speaker` — opaque pass-through. */
  [k: string]: unknown;
}

/** A continuous span during which a slide was visible. A slide can have
 *  multiple visits when the presenter revisits it later in the talk. */
export interface TranscriptVisit {
  startTime: number;
  endTime: number;
  text: string;
  words?: TranscriptWord[];
}

/** A transition between slides as detected from video frame hashes.
 *  `pdfPageIndex` is the matched PDF page (0-based) or null for
 *  video-only transitions. */
export interface SlideTransition {
  slideIndex: number;
  pdfPageIndex: number | null;
  timestamp: number;
  videoFrameKey?: string | null;
}

/** A continuous segment of transcript audio. */
export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
  words?: TranscriptWord[];
}

/** Highlight / underline / circle / arrow / margin-note plan emitted by
 *  the Sonnet annotation planner. The renderer (`editedSlideKey`)
 *  bakes these into the PDF page image. Kept as opaque dicts for now —
 *  full schema lives in api_clients.py:ANNOTATION_PLANNER_SYSTEM_PROMPT. */
export interface Annotation {
  id: string;
  shape: "highlight" | "underline" | "circle" | "arrow" | "marginNote";
  color?: string;
  wordIds?: number[];
  anchorWordId?: number;
  fromWordId?: number;
  toWordId?: number;
  text?: string;
  emphasis?: number;
  confidence?: number;
  rationale?: string;
  [k: string]: unknown;
}

/** Per-slide aligned bundle: the actual notes data the UI renders. */
export interface SlideNote {
  /** Stable UUID (server-generated). Used as React key. */
  id: string;
  /** 0-based index in `slideNotes`. */
  slideIndex: number;
  /** Matched PDF page (0-based), or null for "video-only" slides. */
  pdfPageIndex: number | null;
  /** Asset path (relative to job root) for the captured video frame.
   *  Only set on video-only slides (`pdfPageIndex == null`). */
  videoFrameKey?: string | null;
  /** Asset path for the GPT-Image-2-baked annotated slide image.
   *  Only set when the annotation phase ran. */
  editedSlideKey?: string | null;
  /** OCR text from the slide frame (for video-only) or the printed PDF
   *  page text (for in-deck). */
  slideOCRText: string;
  /** Transcript text for this slide, joined across all visits. */
  transcriptText: string;
  /** Markdown notes produced by the per-slide LLM. */
  aiNotes: string;
  /** Structured bullet-point summaries parsed from `aiNotes`. */
  keyPoints: string[];
  summaryPoints: string[];
  verbalOnlyPoints: string[];
  /** Word-timed transcript intervals per visit. */
  transcriptVisits: TranscriptVisit[];
  /** Position in the speaker's actual sequence (0..N-1 for presented slides;
   *  N..N+M for skeleton entries that come after). */
  presentationOrder: number;
  /** True when `pdfPageIndex` was shown out of natural PDF order vs
   *  the longest-increasing-subsequence of presented slides. */
  isReordered: boolean;
  /** True (default, omitted on most rows) for slides the speaker
   *  actually presented. False for skeleton entries (PDF pages the
   *  speaker never reached). */
  wasPresented: boolean;
  /** Optional annotation plan from the planner phase. */
  annotations?: Annotation[];
}

/** ROI = the cropped region of the video frame used for similarity
 *  matching. (x, y, w, h) all normalized [0, 1]. Not used by the UI
 *  today, but emitted for completeness. */
export interface ROIRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Top-level project.json shape. */
export interface LectureProject {
  id: string;
  name: string;
  createdAt: number;
  videoFileName: string;
  pdfFileName: string;
  audioFileName?: string;
  roi?: ROIRegion;
  slideTransitions: SlideTransition[];
  transcriptSegments: TranscriptSegment[];
  slideNotes: SlideNote[];
  processingState: string;
  videoDuration: number;
  pdfPageCount: number;
}
