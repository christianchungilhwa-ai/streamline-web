import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  createLecture,
  startLecture,
  uploadFile,
  isUploadAborted,
  suggestRoi,
  deleteLecture,
  ApiError,
  type CreateLectureResponse,
} from "@/lib/api";
import type { ROIRegion, SlideSource } from "@/lib/types";
import { RoiConfirm } from "@/components/RoiConfirm";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Loader2, FileText, Sparkles, Video, X } from "lucide-react";

type Phase = "idle" | "creating" | "uploading" | "roi" | "starting" | "done" | "error";

type FailedUpload = { kind: "video" | "pdf"; name: string; percent: number };

// The deck goes to the job's "pdf" upload URL whatever its format; the
// server tells PDF from PowerPoint by content and converts PowerPoint.
const DECK_ACCEPT = [
  ".pdf",
  ".pptx",
  ".ppt",
  ".odp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.presentation",
].join(",");

/** Why `file` can't be the slide deck, or null when it can. Checks the
 *  name, then the first KiB the way the server does (PDF header anywhere
 *  in it, or a ZIP / legacy-Office container) — so a web page saved as
 *  ".pdf" is caught before a multi-GB recording uploads. The file
 *  picker's `accept` is only a hint ("All files" is one click away). */
async function deckProblem(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "key") {
    return "Keynote files can't be read — export the deck as a PDF or PowerPoint file first.";
  }
  if (!["pdf", "pptx", "ppt", "odp"].includes(ext)) {
    return "Choose a PDF or PowerPoint (.pptx) file for the slide deck.";
  }
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  } catch {
    return "That file couldn't be read. Choose it again.";
  }
  const startsWith = (sig: number[]) => sig.every((b, i) => head[i] === b);
  const hasPdfHeader = new TextDecoder("latin1").decode(head).includes("%PDF");
  const isZip = startsWith([0x50, 0x4b, 0x03, 0x04]);
  const isOle = startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (hasPdfHeader || isZip || isOle) return null;
  return `“${file.name}” isn't really a PDF or PowerPoint file (it may be damaged, or a web page saved under that name).`;
}

/**
 * "New Project" sheet modal — opens over the LecturesPage.
 *
 *   1. POST /api/streamline/lectures → jobId + 2 upload URLs
 *   2. PUT the recording (and the deck, if one was chosen) DIRECTLY to
 *      streamline-server (parallel)
 *   3. ROI step (parity with iOS): confirm/adjust the slide region across
 *      six frames of the just-uploaded video, pre-filled with the server's
 *      auto-detected suggestion.
 *   4. POST /api/streamline/lectures/:id/start (with the confirmed ROI and
 *      the slide source: "upload", or "extract" when no deck was chosen —
 *      the server then builds the deck from the slides in the recording)
 *   5. Close + navigate to the viewer
 *
 * The deck is optional and may be a PDF or a PowerPoint file.
 *
 * The dialog is controlled (`open`/`onOpenChange`) so the caller can sync
 * with URL state (`?new=1`). Once the job is created+uploaded we lock the
 * backdrop/esc close and exit only via the explicit buttons (Cancel during
 * the ROI step best-effort deletes the un-started job).
 *
 * A failed upload is retryable IN PLACE: "Try again" re-uploads the same
 * files to the same job (the upload tokens live 6 h), and only falls back
 * to creating a fresh job when that retry 404s (job/token gone). The
 * error box says which file failed and at what percent.
 */
export interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [deck, setDeck] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [deckProgress, setDeckProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [created, setCreated] = useState<CreateLectureResponse | null>(null);
  const [suggestion, setSuggestion] = useState<ROIRegion | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [failedUpload, setFailedUpload] = useState<FailedUpload | null>(null);
  // Why the last deck pick was refused — shown on the deck card, apart from
  // upload/start errors so neither overwrites or outlives the other.
  const [deckPickError, setDeckPickError] = useState<string | null>(null);
  // The server refused the uploaded deck at start (content it can't use):
  // the ROI step then offers to replace or drop the deck.
  const [deckRejected, setDeckRejected] = useState<string | null>(null);
  // A note for the ROI step after the deck was replaced there.
  const [deckNote, setDeckNote] = useState<string | null>(null);
  // A replacement deck PUT that didn't finish: the server's copy is partial.
  const [deckIncomplete, setDeckIncomplete] = useState(false);
  const replaceDeckInputRef = useRef<HTMLInputElement | null>(null);
  // Deck picks are checked asynchronously (first KiB): only the latest pick
  // may land, and Continue waits until it has.
  const pickSeq = useRef(0);
  const [checkingDeck, setCheckingDeck] = useState(false);

  const busy = phase === "creating" || phase === "uploading" || phase === "starting";
  // Once the job exists on the server, only leave via explicit buttons.
  const locked = busy || phase === "roi";
  // "error" stays submittable — that's the in-place "Try again".
  const submitDisabled = !video || checkingDeck || (phase !== "idle" && phase !== "error");
  // No deck chosen: the server extracts one from the recording.
  const extractDeck = deck === null;

  async function pickDeck(file: File | null) {
    const seq = ++pickSeq.current;
    if (file) {
      setCheckingDeck(true);
      const problem = await deckProblem(file);
      if (seq !== pickSeq.current) return; // a newer pick (or removal) won
      setCheckingDeck(false);
      if (problem) {
        setDeckPickError(problem);
        return;
      }
    } else {
      setCheckingDeck(false);
    }
    setDeckPickError(null);
    setDeck(file);
    setDeckProgress(0);
    // A failure report about the previous deck no longer describes anything.
    if (failedUpload?.kind === "pdf") {
      setFailedUpload(null);
      setError(null);
    }
  }
  const inRoi = phase === "roi" || phase === "starting";
  // Keep the bars frozen at their failure percents while showing the error.
  const showUploadProgress =
    phase === "uploading" || (phase === "error" && failedUpload !== null);

  // One controller per upload attempt: when either file's upload fails,
  // the surviving sibling is aborted BEFORE the error state renders —
  // otherwise a zombie XHR keeps streaming during the error phase and a
  // "Try again" would race a second writer against the same server file
  // (the chunk handler's truncate-per-request makes two interleaved
  // writers corrupt it). Also aborted on dialog cancel/close.
  const uploadAbortRef = useRef<AbortController | null>(null);

  function abortInflightUploads() {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
  }

  // PUT the files to the job's pre-shared URLs (parallel), recording
  // which file failed and how far it got so the error state can say so.
  async function uploadFiles(c: CreateLectureResponse) {
    if (!video) return;
    abortInflightUploads();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    const put = (
      kind: FailedUpload["kind"],
      file: File,
      url: string,
      setProgress: (p: number) => void,
    ) => {
      let fraction = 0;
      return uploadFile(
        url,
        file,
        (loaded, total) => {
          if (controller.signal.aborted) return;
          fraction = total ? loaded / total : 0;
          setProgress(fraction);
        },
        controller.signal,
      ).catch((err) => {
        // A deliberate abort is us tearing down the sibling — it must
        // never repaint failure state over the real failure's record.
        if (!isUploadAborted(err)) {
          controller.abort();
          setFailedUpload((prev) =>
            prev ?? { kind, name: file.name, percent: Math.round(fraction * 100) },
          );
        }
        throw err;
      });
    };
    try {
      await Promise.all([
        deck ? put("pdf", deck, c.pdfUploadUrl, setDeckProgress) : Promise.resolve(),
        put("video", video, c.videoUploadUrl, setVideoProgress),
      ]);
    } finally {
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!video) return;
    setError(null);
    setFailedUpload(null);
    // After a failed upload, "Try again" reuses the already-created job —
    // the upload tokens live 6 h, so the same URLs still work.
    const priorJob = phase === "error" ? created : null;
    try {
      let c = priorJob;
      if (!c) {
        setPhase("creating");
        c = await createLecture(name.trim() || "Untitled Lecture");
        setCreated(c);
      }

      setPhase("uploading");
      try {
        await uploadFiles(c);
      } catch (err) {
        // Only when the RETRY itself fails because the job/token is gone
        // server-side do we fall back to a fresh job and upload there
        // instead. An expired upload token surfaces as 401/403 (the HMAC
        // gate rejects before any 404 could), a deleted job as 404.
        if (!(priorJob && err instanceof ApiError && [401, 403, 404].includes(err.status))) throw err;
        setFailedUpload(null);
        setDeckProgress(0);
        setVideoProgress(0);
        setPhase("creating");
        c = await createLecture(name.trim() || "Untitled Lecture");
        setCreated(c);
        setPhase("uploading");
        await uploadFiles(c);
      }

      // Parity with iOS: confirm the slide region before processing. Kick
      // off the (slow, vision-based) suggestion but don't block on it — the
      // editor shows a default box until it arrives.
      setPhase("roi");
      setDetecting(true);
      suggestRoi(c.id)
        .then((r) => setSuggestion(r.roi))
        .catch(() => setSuggestion(null))
        .finally(() => setDetecting(false));
    } catch (e: unknown) {
      // When the sibling-teardown abort races the real failure into
      // Promise.all's rejection, the recorded failedUpload (set by the
      // file that actually failed) is the truthful message — never show
      // "upload aborted" to the user.
      const msg = isUploadAborted(e)
        ? "Upload failed — see details below."
        : e instanceof ApiError
          ? e.message
          : String(e);
      setError(msg);
      setPhase("error");
    }
  }

  // Confirm the ROI (or `undefined` → server auto-detects) and start.
  // `source` is explicit because callers may have just changed `deck` in
  // this same event (state updates land on the next render).
  async function finishStart(roi?: ROIRegion) {
    if (!created) return;
    const source: SlideSource = extractDeck ? "extract" : "upload";
    if (source === "upload" && deckIncomplete) {
      setDeckRejected(
        `“${deck?.name}” didn't finish uploading — choose it again, or remove the deck to extract the slides from the recording.`,
      );
      return;
    }
    setError(null);
    setDeckRejected(null);
    setDeckNote(null);
    try {
      setPhase("starting");
      // A deck left over from an earlier, failed attempt on this same job
      // is ignored in extract mode — the server builds its own.
      await startLecture(created.id, roi, source);
      openStarted(created.id);
    } catch (e: unknown) {
      const status = e instanceof ApiError ? e.status : 0;
      const msg = e instanceof ApiError ? e.message : String(e);
      if (status === 409 && /processing/i.test(msg)) {
        // An earlier attempt did start it (its response was lost): it is
        // running — open it rather than offering to change the deck.
        openStarted(created.id);
        return;
      }
      // The server can't use the uploaded deck (its content isn't a deck it
      // reads, it's missing, or it changed): retrying can't help; offer to
      // replace or drop the deck without re-uploading the recording.
      const deckProblemFromServer =
        source === "upload" &&
        ((status === 400 && !/video/i.test(msg)) || (status === 409 && /deck/i.test(msg)));
      if (deckProblemFromServer) setDeckRejected(msg);
      else setError(msg);
      setPhase("roi"); // stay on the ROI screen so they can retry
    }
  }

  function openStarted(id: string) {
    setPhase("done");
    onOpenChange(false);
    navigate(`/lectures/${id}`);
  }

  // From the ROI step after the server refused the deck: upload only the
  // new deck to this job (the recording is already on the server), then
  // let the user start again with "Use This Region" — the region on screen
  // then, not the one sent with the refused attempt.
  async function replaceDeck(file: File) {
    if (!created) return;
    const problem = await deckProblem(file);
    if (problem) {
      setDeckRejected(problem);
      return;
    }
    abortInflightUploads();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setDeck(file);
    setDeckRejected(null);
    setDeckNote(null);
    setDeckProgress(0);
    setDeckIncomplete(true); // until the PUT completes, the server copy is partial
    setPhase("starting");
    try {
      await uploadFile(
        created.pdfUploadUrl,
        file,
        (loaded, total) => {
          if (!controller.signal.aborted) setDeckProgress(total ? loaded / total : 0);
        },
        controller.signal,
      );
    } catch (e: unknown) {
      if (isUploadAborted(e)) return; // dialog cancelled
      setDeckRejected(
        `Uploading “${file.name}” failed: ${e instanceof ApiError ? e.message : String(e)}`,
      );
      setPhase("roi");
      return;
    } finally {
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
    }
    setDeckIncomplete(false);
    setDeckNote(`“${file.name}” uploaded — confirm the slide region to start.`);
    setPhase("roi");
  }

  function dropDeckAndExtract() {
    setDeck(null);
    setDeckRejected(null);
    setDeckIncomplete(false);
    setDeckNote("No deck — confirm the slide region to build the deck from the recording.");
  }

  // Back out during the ROI step: best-effort delete the un-started job so
  // it doesn't linger in My Library, then close + reset.
  async function cancelFromRoi() {
    abortInflightUploads();
    const id = created?.id;
    setPhase("idle");
    setCreated(null);
    setSuggestion(null);
    setError(null);
    setFailedUpload(null);
    setDeckRejected(null);
    setDeckNote(null);
    setDeckIncomplete(false);
    setDeckProgress(0);
    setVideoProgress(0);
    onOpenChange(false);
    if (id) {
      try {
        await deleteLecture(id);
      } catch {
        // best-effort — the per-job TTL cleanup catches it otherwise
      }
    }
  }

  function handleOpenChange(next: boolean) {
    if (locked && !next) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(inRoi && "sm:max-w-2xl")}>
        <DialogHeader>
          <DialogTitle>{inRoi ? "Confirm slide region" : "New project"}</DialogTitle>
          {!inRoi && (
            <DialogDescription>
              Add a lecture recording and, if you have it, its slide deck — Streamline lines them up
              and writes notes for every slide.
            </DialogDescription>
          )}
        </DialogHeader>

        {inRoi && video ? (
          <>
            {extractDeck && (
              <Callout tone="info" icon={<Sparkles className="text-primary" />}>
                The slide deck will be built from this region of the recording — frame it tightly
                around the slides.
              </Callout>
            )}
            {deckRejected && (
              <Callout
                tone="danger"
                icon={<AlertCircle />}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => replaceDeckInputRef.current?.click()}
                    >
                      <FileText />
                      Choose another deck…
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={dropDeckAndExtract}>
                      <Sparkles />
                      Remove deck — extract slides from the recording
                    </Button>
                  </div>
                }
              >
                {deckRejected}
              </Callout>
            )}
            {deckRejected && (
              <div className="hidden">
                <input
                  ref={replaceDeckInputRef}
                  type="file"
                  accept={DECK_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void replaceDeck(f);
                  }}
                />
              </div>
            )}
            {phase === "starting" && deck && deckProgress > 0 && deckProgress < 1 && (
              <div className="space-y-1.5">
                <p className="meta">
                  Uploading {deck.name}… {Math.round(deckProgress * 100)}%
                </p>
                <Progress value={deckProgress * 100} label="Slide deck upload" />
              </div>
            )}
            {deckNote && !deckRejected && phase === "roi" && (
              <Callout tone="info" icon={<CheckCircle2 className="text-primary" />}>
                {deckNote}
              </Callout>
            )}
            <RoiConfirm
              videoFile={video}
              suggestion={suggestion}
              detecting={detecting}
              busy={phase === "starting"}
              error={error}
              onConfirm={(roi) => finishStart(roi)}
              onCancel={cancelFromRoi}
            />
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="np-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="np-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Renal physiology — lecture 12"
                maxLength={200}
                disabled={busy}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FileSelectCard
                title="Recording"
                hint="MP4 or MOV"
                icon={<Video />}
                accept="video/mp4,video/quicktime,video/*"
                file={video}
                onPick={setVideo}
                progress={showUploadProgress ? videoProgress : null}
                disabled={busy}
              />
              <FileSelectCard
                title="Slide deck"
                hint="Optional · PDF or PowerPoint"
                icon={<FileText />}
                accept={DECK_ACCEPT}
                file={deck}
                onPick={(f) => void pickDeck(f)}
                onClear={() => void pickDeck(null)}
                problem={deckPickError}
                progress={showUploadProgress && deck ? deckProgress : null}
                disabled={busy}
              />
            </div>

            {extractDeck && (
              <Callout
                tone="info"
                icon={<Sparkles className="text-primary" />}
                title="Extract & Create Slide deck from the Video Recording"
              >
                No deck? Streamline builds one from the slides shown in the recording (desktop,
                websites and other apps are left out). Download it as a PDF once processing finishes.
              </Callout>
            )}

            {error && (
              <Callout
                tone="danger"
                icon={<AlertCircle />}
                title={failedUpload ? error : undefined}
              >
                {failedUpload ? (
                  <>
                    {failedUpload.kind === "video" ? "Recording" : "Slide deck"} &ldquo;
                    {failedUpload.name}&rdquo; failed at {failedUpload.percent}% — Try again resumes
                    with the same project.
                  </>
                ) : (
                  error
                )}
              </Callout>
            )}

            <DialogFooter>
              {phase === "idle" && !video && (
                <p id="np-hint" className="text-xs text-muted-foreground sm:mr-auto">
                  Add the lecture recording to continue
                </p>
              )}
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitDisabled}
                aria-describedby={phase === "idle" && !video ? "np-hint" : undefined}
              >
                {busy && <Loader2 className="animate-spin" />}
                {phaseLabel(phase)}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function phaseLabel(p: Phase): string {
  switch (p) {
    case "idle":
      return "Continue";
    case "creating":
      return "Creating…";
    case "uploading":
      return "Uploading…";
    case "roi":
      return "Confirm region";
    case "starting":
      return "Starting…";
    case "done":
      return "Done";
    case "error":
      return "Try again";
  }
}

/** Same FileSelectCard as the old UploadPage — kept private here
 *  since it's not used anywhere else. */
function FileSelectCard({
  title,
  hint,
  icon,
  accept,
  file,
  onPick,
  onClear,
  problem,
  progress,
  disabled,
}: {
  title: string;
  /** Shown while no file is picked. */
  hint: string;
  icon: React.ReactNode;
  accept: string;
  file: File | null;
  onPick: (f: File | null) => void;
  /** When given, a picked file gets a remove button (optional inputs). */
  onClear?: () => void;
  /** Why the last pick was refused, shown on the card. */
  problem?: string | null;
  progress: number | null;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    // The remove button sits OUTSIDE the <label>: inside it, a <button> would
    // become the label's labeled control and every click on the card would
    // "remove" instead of opening the file picker.
    <div className="relative h-full">
      <label
        className={cn(
          "group relative flex h-full min-h-36 cursor-pointer flex-col items-center justify-center gap-2",
          "overflow-hidden rounded-xl border border-dashed px-5 py-6 text-center transition-colors",
          // The input is visually hidden but focusable: show its focus on the card.
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-card",
          problem
            ? "border-destructive/50 bg-destructive/5"
            : file
              ? "border-solid border-primary/60 bg-primary/5"
              : "border-border bg-muted/40 hover:border-primary/50 hover:bg-primary/5",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        {file && !problem && !onClear && (
          <CheckCircle2 aria-hidden className="absolute right-2.5 top-2.5 size-4 text-primary" />
        )}
        <span
          aria-hidden
          className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-6"
        >
          {icon}
        </span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {file ? (
          <span className="line-clamp-1 max-w-full text-xs text-muted-foreground">
            <span className="text-foreground">{file.name}</span>
            <span className="tabular-nums"> · {(file.size / (1024 * 1024)).toFixed(1)} MB</span>
          </span>
        ) : (
          <span className="meta">{hint}</span>
        )}
        {problem && <span className="text-xs text-destructive-text">{problem}</span>}

        {progress !== null && (
          <Progress
            className="absolute inset-x-0 bottom-0 h-1 rounded-none"
            value={progress * 100}
            label={`${title} upload`}
          />
        )}

        {/* sr-only, not display:none, so the card can be reached and opened
            from the keyboard (Tab, then Enter/Space); the ring above shows
            its focus. */}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          aria-label={`Choose ${title.toLowerCase()} file`}
          onChange={(e) => {
            onPick(e.target.files?.[0] ?? null);
            // Reset so picking the same file again (after removing it, or
            // after a rejected pick) still fires onChange.
            e.target.value = "";
          }}
          disabled={disabled}
        />
      </label>
      {file && onClear && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${file.name}`}
          className="absolute right-2 top-2 text-muted-foreground"
          onClick={() => {
            onClear();
            // The button unmounts with the file: keep keyboard focus on the card.
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
