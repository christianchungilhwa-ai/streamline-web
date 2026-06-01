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
 *      processing-progress UI as the job runs)
 *
 *  Layout: title + subtitle on the page, form wrapped in a Claraity
 *  card-surface panel for visual containment. */
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
      <header className="mb-8">
        <h1 className="page-title">New lecture</h1>
        <p className="page-subtitle">
          Upload the slide deck (PDF) and the lecture recording (MP4). Both go
          directly to the processing server — Claraity isn’t in the byte path.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="card-surface space-y-6 p-6 md:p-8"
      >
        <Field label="Lecture name" htmlFor="name">
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. OMPR Final, Lec 33"
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            maxLength={200}
            disabled={phase !== "idle"}
          />
        </Field>

        <FilePicker
          label="Slide deck (PDF)"
          accept="application/pdf"
          icon={<FileText className="h-5 w-5 text-primary" />}
          file={pdf}
          onPick={setPdf}
          progress={phase === "uploading" ? pdfProgress : null}
          disabled={phase !== "idle"}
        />

        <FilePicker
          label="Lecture recording (MP4)"
          accept="video/mp4,video/quicktime,video/*"
          icon={<Film className="h-5 w-5 text-primary" />}
          file={video}
          onPick={setVideo}
          progress={phase === "uploading" ? videoProgress : null}
          disabled={phase !== "idle"}
        />

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
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

/** A labeled form field. Keeps the label/input pairing consistent
 *  with Claraity's `.form-group` spacing (label tight to its
 *  control, group-to-group spacing handled by parent `space-y-6`). */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-semibold text-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
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
      <span className="mb-2 block text-sm font-semibold text-foreground">
        {label}
      </span>
      <label
        className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-dashed border-border bg-background px-4 py-4 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5 ${
          disabled ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          {icon}
          {file ? (
            <span className="truncate">
              <span className="font-medium">{file.name}</span>{" "}
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
