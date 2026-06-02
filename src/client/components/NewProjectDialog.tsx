import { useState } from "react";
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

/**
 * "New Project" sheet modal — opens over the LecturesPage.
 *
 *   1. POST /api/streamline/lectures → jobId + 2 upload URLs
 *   2. PUT both files DIRECTLY to streamline-server (parallel)
 *   3. ROI step (parity with iOS): confirm/adjust the slide region on a
 *      frame of the just-uploaded video, pre-filled with the server's
 *      auto-detected suggestion. "Auto-detect for me" skips it.
 *   4. POST /api/streamline/lectures/:id/start (with the confirmed ROI)
 *   5. Close + navigate to the viewer
 *
 * The dialog is controlled (`open`/`onOpenChange`) so the caller can sync
 * with URL state (`?new=1`). Once the job is created+uploaded we lock the
 * backdrop/esc close and exit only via the explicit buttons (Cancel during
 * the ROI step best-effort deletes the un-started job).
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

  const busy = phase === "creating" || phase === "uploading" || phase === "starting";
  // Once the job exists on the server, only leave via explicit buttons.
  const locked = busy || phase === "roi";
  const submitDisabled = !pdf || !video || phase !== "idle";
  const inRoi = phase === "roi" || phase === "starting";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pdf || !video) return;
    setError(null);
    try {
      setPhase("creating");
      const c = await createLecture(name.trim() || "Untitled Lecture");
      setCreated(c);

      setPhase("uploading");
      await Promise.all([
        uploadFile(c.pdfUploadUrl, pdf, (loaded, total) =>
          setPdfProgress(total ? loaded / total : 0),
        ),
        uploadFile(c.videoUploadUrl, video, (loaded, total) =>
          setVideoProgress(total ? loaded / total : 0),
        ),
      ]);

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
      const msg = e instanceof ApiError ? e.message : String(e);
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
    const id = created?.id;
    setPhase("idle");
    setCreated(null);
    setSuggestion(null);
    setError(null);
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
      <DialogContent>
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
            onAutoDetect={() => finishStart(undefined)}
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
                progress={phase === "uploading" ? videoProgress : null}
                disabled={busy}
              />
              <FileSelectCard
                accent="red"
                title="Slide Deck (PDF)"
                icon={<FileText className="h-11 w-11" strokeWidth={2.2} />}
                accept="application/pdf"
                file={pdf}
                onPick={setPdf}
                progress={phase === "uploading" ? pdfProgress : null}
                disabled={busy}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
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
