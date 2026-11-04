/** Server lecture statuses and processing steps, written for people. */

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StatusInfo {
  label: string;
  tone: StatusTone;
  /** Show a spinner (work in progress). */
  spin?: boolean;
  /** Show an alert icon (needs attention). */
  alert?: boolean;
}

/** `null` = nothing worth a badge (the normal, finished state). */
export const LECTURE_STATUS: Record<string, StatusInfo | null> = {
  completed: null,
  processing: { label: "Processing", tone: "info", spin: true },
  uploading: { label: "Uploading", tone: "info", spin: true },
  failed: { label: "Failed", tone: "danger", alert: true },
  canceled: { label: "Canceled", tone: "neutral" },
};

export function lectureStatus(status: string | undefined | null): StatusInfo | null {
  if (!status) return null;
  if (status in LECTURE_STATUS) return LECTURE_STATUS[status];
  return { label: humanize(status), tone: "neutral" };
}

/** "detectingSlides" / "extracting_frames" → "Detecting slides" / "Extracting frames". */
export function humanize(s: string): string {
  const words = s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : s;
}

const STEP_LABELS: Record<string, string> = {
  queued: "Waiting to start",
  starting: "Waiting to start",
  downloading: "Preparing your files",
  uploading: "Uploading",
  convertingSlides: "Converting PowerPoint to PDF",
  detectingROI: "Finding the slide area",
  detectingTransitions: "Finding slide changes",
  detectingSlides: "Finding slide changes",
  extractingDeck: "Building the slide deck from the recording",
  extractingAudio: "Extracting audio",
  processingPDF: "Reading the slide deck",
  extractingSlideFrames: "Capturing slides from the video",
  extracting_frames: "Capturing slides from the video",
  ocrSlideFrames: "Reading slide text",
  detectComplete: "Slides found",
  transcribing: "Transcribing the lecture",
  aligningTranscript: "Matching speech to slides",
  aligning: "Matching speech to slides",
  rescuingVideoOnly: "Double-checking unmatched slides",
  generatingNotes: "Writing notes",
  notes: "Writing notes",
  generatingAnnotations: "Annotating slides",
  annotating: "Annotating slides",
  savingResults: "Finishing up",
  completed: "Done",
};

export function stepLabel(step: string | undefined | null): string {
  if (!step) return "Working";
  return STEP_LABELS[step] ?? humanize(step);
}
