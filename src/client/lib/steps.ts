/** Human labels for the processing `step` strings streamline-server
 *  reports on GET /jobs/{id}/status (app/workers.py `_set_status`).
 *  Unknown steps fall back to the raw string split into words, so a step
 *  added server-side still reads sensibly before this map learns it. */
const STEP_LABELS: Record<string, string> = {
  queued: "Waiting to start",
  starting: "Starting",
  convertingSlides: "Converting PowerPoint to PDF",
  detectingROI: "Finding the slide area",
  detectingSlides: "Detecting slide changes",
  extractingDeck: "Building the slide deck from the recording",
  extractingAudio: "Extracting audio",
  processingPDF: "Reading the slide deck",
  extractingSlideFrames: "Capturing slides from the video",
  ocrSlideFrames: "Reading slide text",
  detectComplete: "Slides detected",
  transcribing: "Transcribing the lecture",
  aligningTranscript: "Matching the transcript to slides",
  rescuingVideoOnly: "Double-checking unmatched slides",
  generatingNotes: "Writing notes",
  generatingAnnotations: "Annotating slides",
  savingResults: "Saving",
  completed: "Done",
};

export function stepLabel(step: string | null | undefined): string {
  if (!step) return "Processing";
  const known = STEP_LABELS[step];
  if (known) return known;
  const words = step.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
