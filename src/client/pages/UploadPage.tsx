import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { createLecture, startLecture, uploadFile, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Loader2, Upload, FileText, Video } from "lucide-react";

type Phase = "idle" | "creating" | "uploading" | "starting" | "done" | "error";

/** New-lecture upload page. Flow unchanged from earlier:
 *
 *   1. POST /api/streamline/lectures → jobId + 2 upload URLs
 *   2. PUT both files DIRECTLY to streamline-server (parallel)
 *   3. POST /api/streamline/lectures/:id/start to kick off processing
 *   4. Navigate to the viewer (which shows the processing UI)
 *
 *  Layout mirrors the iOS "New Lecture Project" sheet — centered
 *  title, a single Project Name input, then two big dashed cards
 *  side-by-side for the two file slots, centered Cancel + Continue
 *  at the bottom. Each card gets its own accent: sky-blue (brand)
 *  for the video, red for the PDF — matches the iOS mockup so
 *  the slots are instantly distinguishable. */
export function UploadPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  const submitDisabled = !pdf || !video || phase !== "idle";
  const busy = phase === "creating" || phase === "uploading" || phase === "starting";

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
      navigate(`/lectures/${created.id}`, { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : String(e);
      setError(msg);
      setPhase("error");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 md:py-16">
      <h1 className="page-title text-center">New Lecture Project</h1>

      <form onSubmit={onSubmit} className="mt-10 space-y-5">
        {/* Project name — large dark input, full-width. */}
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

        {/* Two big file slots, side-by-side on tablet/desktop, stacked on mobile. */}
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

        {/* Centered buttons. Cancel is text-style brand-blue, Continue is
            the solid primary action. */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/lectures")}
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
    </div>
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

/** A single big file-select card. Two accents only: `"sky"` (brand,
 *  for video) and `"red"` (for PDF). Kept as a closed enum so
 *  Tailwind's JIT compiler can statically resolve the class strings.
 *
 *  Card states:
 *  - Empty   → icon + "Tap to select"
 *  - Filled  → icon + filename + size
 *  - Upload  → progress bar fills bottom edge, dims rest
 *  - Disabled → pointer-events-none + opacity-60 */
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
  // Static class branches — Tailwind needs to see literal strings.
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

      {/* Upload progress — thin bar pinned to the bottom edge of the card. */}
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
