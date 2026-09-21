import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { ROIRegion } from "@/lib/types";
import { RoiConfirm } from "@/components/RoiConfirm";
import { cn } from "@/lib/utils";
import { Loader2, FileText, Video } from "lucide-react";

type Phase = "idle" | "creating" | "uploading" | "roi" | "starting" | "done" | "error";

type FailedUpload = { kind: "video" | "pdf"; name: string; percent: number };

/**
 * "New Project" sheet modal — opens over the LecturesPage.
 *
 *   1. POST /api/streamline/lectures → jobId + 2 upload URLs
 *   2. PUT both files DIRECTLY to streamline-server (parallel)
 *   3. ROI step (parity with iOS): confirm/adjust the slide region across
 *      six frames of the just-uploaded video, pre-filled with the server's
 *      auto-detected suggestion.
 *   4. POST /api/streamline/lectures/:id/start (with the confirmed ROI)
 *   5. Close + navigate to the viewer
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
  const [pdf, setPdf] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);
  const [created, setCreated] = useState<CreateLectureResponse | null>(null);
  const [suggestion, setSuggestion] = useState<ROIRegion | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [failedUpload, setFailedUpload] = useState<FailedUpload | null>(null);

  const busy = phase === "creating" || phase === "uploading" || phase === "starting";
  // Once the job exists on the server, only leave via explicit buttons.
  const locked = busy || phase === "roi";
  // "error" stays submittable — that's the in-place "Try again".
  const submitDisabled = !pdf || !video || (phase !== "idle" && phase !== "error");
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

  // PUT both files to the job's pre-shared URLs (parallel), recording
  // which file failed and how far it got so the error state can say so.
  async function uploadBoth(c: CreateLectureResponse) {
    if (!pdf || !video) return;
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
        put("pdf", pdf, c.pdfUploadUrl, setPdfProgress),
        put("video", video, c.videoUploadUrl, setVideoProgress),
      ]);
    } finally {
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pdf || !video) return;
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
        await uploadBoth(c);
      } catch (err) {
        // Only when the RETRY itself fails because the job/token is gone
        // server-side do we fall back to a fresh job and upload there
        // instead. An expired upload token surfaces as 401/403 (the HMAC
        // gate rejects before any 404 could), a deleted job as 404.
        if (!(priorJob && err instanceof ApiError && [401, 403, 404].includes(err.status))) throw err;
        setFailedUpload(null);
        setPdfProgress(0);
        setVideoProgress(0);
        setPhase("creating");
        c = await createLecture(name.trim() || "Untitled Lecture");
        setCreated(c);
        setPhase("uploading");
        await uploadBoth(c);
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
  async function finishStart(roi?: ROIRegion) {
    if (!created) return;
    setError(null);
    try {
      setPhase("starting");
      await startLecture(created.id, roi);
      setPhase("done");
      onOpenChange(false);
      navigate(`/lectures/${created.id}`);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : String(e);
      setError(msg);
      setPhase("roi"); // stay on the ROI screen so they can retry
    }
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
    setPdfProgress(0);
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
          <DialogTitle>{inRoi ? "Confirm slide region" : "New Project"}</DialogTitle>
        </DialogHeader>

        {inRoi && video ? (
          <RoiConfirm
            videoFile={video}
            suggestion={suggestion}
            detecting={detecting}
            busy={phase === "starting"}
            error={error}
            onConfirm={(roi) => finishStart(roi)}
            onCancel={cancelFromRoi}
          />
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-5">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project Name"
              aria-label="Project name"
              className={cn(
                "block w-full rounded-2xl border border-border bg-card px-5 py-4",
                "text-base text-foreground placeholder:text-muted-foreground",
                "transition-colors",
                "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              )}
              maxLength={200}
              disabled={busy}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FileSelectCard
                accent="sky"
                title="Lecture Recording"
                icon={<Video className="h-11 w-11" strokeWidth={2.2} />}
                accept="video/mp4,video/quicktime,video/*"
                file={video}
                onPick={setVideo}
                progress={showUploadProgress ? videoProgress : null}
                disabled={busy}
              />
              <FileSelectCard
                accent="red"
                title="Slide Deck (PDF)"
                icon={<FileText className="h-11 w-11" strokeWidth={2.2} />}
                accept="application/pdf"
                file={pdf}
                onPick={setPdf}
                progress={showUploadProgress ? pdfProgress : null}
                disabled={busy}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <p>{error}</p>
                {failedUpload && (
                  <p className="mt-1 text-xs opacity-80">
                    {failedUpload.kind === "video" ? "Recording" : "Slide deck"}{" "}
                    &ldquo;{failedUpload.name}&rdquo; failed at {failedUpload.percent}% —
                    Try again resumes with the same project.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={busy}
                className="text-primary hover:text-primary"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitDisabled}>
                {busy && <Loader2 className="animate-spin" />}
                {phaseLabel(phase)}
              </Button>
            </div>
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
  accent,
  title,
  icon,
  accept,
  file,
  onPick,
  progress,
  disabled,
}: {
  accent: "sky" | "red";
  title: string;
  icon: React.ReactNode;
  accept: string;
  file: File | null;
  onPick: (f: File | null) => void;
  progress: number | null;
  disabled: boolean;
}) {
  const cardTone =
    accent === "sky"
      ? "border-primary/50 bg-primary/[0.06] hover:border-primary/70 hover:bg-primary/10"
      : "border-red-500/50 bg-red-500/[0.06] hover:border-red-500/70 hover:bg-red-500/10";
  const iconTone =
    accent === "sky" ? "text-primary" : "text-red-500";
  const progressTone =
    accent === "sky" ? "bg-primary" : "bg-red-500";

  return (
    <label
      className={cn(
        "group relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center",
        "gap-3 overflow-hidden rounded-2xl border-2 border-dashed",
        "px-6 py-10 text-center transition-all",
        cardTone,
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <span className={cn(iconTone)}>{icon}</span>
      <span className="text-base font-semibold text-foreground">{title}</span>
      {file ? (
        <span className="line-clamp-1 max-w-full text-xs text-muted-foreground">
          <span className="text-foreground">{file.name}</span>
          <span> · {(file.size / (1024 * 1024)).toFixed(1)} MB</span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Tap to select</span>
      )}

      {progress !== null && (
        <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-black/10 dark:bg-white/10">
          <div
            className={cn("h-full transition-[width]", progressTone)}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        disabled={disabled}
      />
    </label>
  );
}
