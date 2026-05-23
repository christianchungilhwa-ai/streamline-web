import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { createLecture, startLecture, uploadFile, ApiError } from "@/lib/api";
import { Loader2, Upload, FileText, Film } from "lucide-react";

type Phase = "idle" | "creating" | "uploading" | "starting" | "done" | "error";

/** Two-file upload page: PDF (slide deck) + video (recording).
 *  Flow:
 *   1. POST /api/streamline/lectures → get back jobId + 2 upload URLs
 *   2. PUT both files DIRECTLY to streamline-server (cross-domain,
 *      no Claraity-web in the byte path — multi-GB videos never
 *      touch our request handler)
 *   3. POST /api/streamline/lectures/:id/start to kick off processing
 *   4. Navigate to the lecture viewer (which will show the
 *      processing-progress UI as the job runs) */
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pdf || !video) return;
    setError(null);
    try {
      setPhase("creating");
      const created = await createLecture(name.trim() || "Untitled Lecture");

      setPhase("uploading");
      // Run uploads in parallel — they're independent S3-style PUTs.
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
    <div className="mx-auto max-w-2xl p-6 md:p-10">
      <h1 className="text-2xl font-semibold tracking-tight">New lecture</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload the slide deck (PDF) and the lecture recording (MP4). Both go
        directly to the processing server — Claraity isn’t in the byte path.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        <div>
          <label className="text-sm font-medium" htmlFor="name">
            Lecture name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. OMPR Final, Lec 33"
            className="mt-2 block w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            maxLength={200}
            disabled={phase !== "idle"}
          />
        </div>

        <FilePicker
          label="Slide deck (PDF)"
          accept="application/pdf"
          icon={<FileText />}
          file={pdf}
          onPick={setPdf}
          progress={phase === "uploading" ? pdfProgress : null}
          disabled={phase !== "idle"}
        />

        <FilePicker
          label="Lecture recording (MP4)"
          accept="video/mp4,video/quicktime,video/*"
          icon={<Film />}
          file={video}
          onPick={setVideo}
          progress={phase === "uploading" ? videoProgress : null}
          disabled={phase !== "idle"}
        />

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitDisabled}>
            {phase === "idle" || phase === "error" ? <Upload /> : <Loader2 className="animate-spin" />}
            {phaseLabel(phase)}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/lectures")}
            disabled={phase === "uploading" || phase === "starting" || phase === "creating"}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function phaseLabel(p: Phase): string {
  switch (p) {
    case "idle":
      return "Upload and start";
    case "creating":
      return "Creating lecture…";
    case "uploading":
      return "Uploading files…";
    case "starting":
      return "Kicking off processing…";
    case "done":
      return "Done";
    case "error":
      return "Try again";
  }
}

function FilePicker({
  label,
  accept,
  icon,
  file,
  onPick,
  progress,
  disabled,
}: {
  label: string;
  accept: string;
  icon: React.ReactNode;
  file: File | null;
  onPick: (f: File | null) => void;
  progress: number | null;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <label
        className={`mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed bg-background px-4 py-3 text-sm transition-colors hover:bg-accent ${
          disabled ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <span className="flex items-center gap-2">
          {icon}
          {file ? (
            <span className="truncate">
              {file.name}{" "}
              <span className="text-muted-foreground">
                ({(file.size / (1024 * 1024)).toFixed(1)} MB)
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Choose file…</span>
          )}
        </span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          disabled={disabled}
        />
      </label>
      {progress !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
