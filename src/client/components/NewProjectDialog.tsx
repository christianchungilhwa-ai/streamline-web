import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createLecture, startLecture, uploadFile, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Loader2, Upload, FileText, Video } from "lucide-react";

type Phase = "idle" | "creating" | "uploading" | "starting" | "done" | "error";

/**
 * "New Lecture Project" sheet modal — opens over the LecturesPage.
 * Behavior unchanged from the previous full-page UploadPage flow:
 *
 *   1. POST /api/streamline/lectures → jobId + 2 upload URLs
 *   2. PUT both files DIRECTLY to streamline-server (parallel)
 *   3. POST /api/streamline/lectures/:id/start to kick off processing
 *   4. Close the dialog + navigate to the viewer
 *
 * Layout mirrors the iOS sheet — centered title, single project-name
 * input, two big accent-colored file cards (sky for video, red for
 * PDF), centered Cancel + Continue at the bottom.
 *
 * The dialog is controlled (`open`/`onOpenChange`) so the caller can
 * sync with URL state (`?new=1`). On successful submission, we
 * navigate away — the dialog unmounts with the LecturesPage.
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

  const busy = phase === "creating" || phase === "uploading" || phase === "starting";
  const submitDisabled = !pdf || !video || phase !== "idle";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pdf || !video) return;
    setError(null);
    try {
      setPhase("creating");
      const created = await createLecture(name.trim() || "Untitled Lecture");

      setPhase("uploading");
      await Promise.all([
        uploadFile(created.pdfUploadUrl, pdf, (loaded, total) =>
          setPdfProgress(total ? loaded / total : 0),
        ),
        uploadFile(created.videoUploadUrl, video, (loaded, total) =>
          setVideoProgress(total ? loaded / total : 0),
        ),
      ]);

      setPhase("starting");
      await startLecture(created.id);

      setPhase("done");
      onOpenChange(false);
      navigate(`/lectures/${created.id}`);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : String(e);
      setError(msg);
      setPhase("error");
    }
  }

  // Prevent closing the dialog mid-upload — if we tear down the
  // XHR mid-flight the user loses the upload progress.
  function handleOpenChange(next: boolean) {
    if (busy && !next) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>

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
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {phaseLabel(phase)}
            </Button>
          </div>
        </form>
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
