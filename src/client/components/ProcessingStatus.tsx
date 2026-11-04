import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, Ban, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Progress } from "@/components/ui/progress";
import { stepLabel } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface ProcessingStatusProps {
  /** Lecture status from the server: uploading, processing, failed,
   *  canceled — or completed when the project file couldn't be read. */
  status: string;
  /** Server processing step (`detectingSlides`, `transcribing`, …). */
  step?: string | null;
  /** 0–1 job progress, when the server reports it. */
  progress?: number | null;
  /** The server's error text for a failed job (kept verbatim: it often
   *  says what to do, e.g. "upload a PDF instead"). */
  error?: string | null;
  /** Why the finished project couldn't be loaded, if it couldn't. */
  projectError?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
  /** Already made friendly by the caller. */
  retryError?: string | null;
  /** "slides": the deck (or the recording's slides) couldn't be used, so
   *  retrying the same job would fail the same way — lead with a new
   *  project instead. */
  errorKind?: string | null;
}

/**
 * The viewer body before a lecture can be shown: processing (step label,
 * percentage, progress bar), failed or canceled (where it stopped, the
 * server's error, Try again), or finished-but-unreadable.
 */
export function ProcessingStatus({
  status,
  step,
  progress,
  error,
  projectError,
  onRetry,
  retrying,
  retryError,
  errorKind,
}: ProcessingStatusProps) {
  const pct = typeof progress === "number" && Number.isFinite(progress) ? Math.round(progress * 100) : null;

  if (status === "failed" || status === "canceled") {
    const failed = status === "failed";
    const deckProblem = failed && errorKind === "slides";
    const stoppedAt = step && step !== "completed" ? stepLabel(step) : null;
    return (
      <StatusBody
        tile={
          <Tile className={failed ? "bg-destructive/10 text-destructive-text" : "bg-muted text-muted-foreground"}>
            {failed ? <AlertCircle /> : <Ban />}
          </Tile>
        }
        title={failed ? "Processing failed" : "Processing canceled"}
      >
        {stoppedAt && (
          <p className="mt-1 text-sm text-muted-foreground">Stopped while {lowerFirst(stoppedAt)}</p>
        )}
        {error && (
          <Callout tone="danger" className="mt-4 text-left">
            {error}
          </Callout>
        )}
        {deckProblem ? (
          <>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/lectures?new=1">Start a new project</Link>
              </Button>
              {onRetry && (
                <Button variant="ghost" onClick={onRetry} disabled={retrying}>
                  {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                  Try again
                </Button>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Retrying will most likely fail the same way. Start a new project with the deck as a
              PDF — or without a deck, to build the slides from the recording.
            </p>
          </>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {onRetry && (
                <Button onClick={onRetry} disabled={retrying}>
                  {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                  Try again
                </Button>
              )}
              <Button asChild variant="ghost">
                <Link to="/lectures?new=1">Start a new project</Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Your uploaded files are kept, so nothing needs to re-upload.
            </p>
          </>
        )}
        {retryError && (
          <Callout tone="danger" className="mt-4 text-left">
            {retryError}
          </Callout>
        )}
        {projectError && <p className="meta mt-3">{projectError}</p>}
      </StatusBody>
    );
  }

  if (status === "completed") {
    // Finished on the server, but the project file is missing or unreadable.
    return (
      <StatusBody
        tile={
          <Tile className="bg-destructive/10 text-destructive-text">
            <AlertCircle />
          </Tile>
        }
        title="This project couldn't be opened"
      >
        <p className="mt-1 text-sm text-muted-foreground">
          Processing finished, but its results couldn't be loaded. Please try again later.
        </p>
        {projectError && <p className="meta mt-3">{projectError}</p>}
        <div className="mt-5 flex justify-center">
          <Button asChild variant="ghost">
            <Link to="/lectures">
              <ArrowLeft />
              Back to My Library
            </Link>
          </Button>
        </div>
      </StatusBody>
    );
  }

  // uploading / processing (and anything else still running)
  return (
    <StatusBody
      tile={
        <Tile className="bg-primary/10 text-brand-text">
          <Loader2 className="animate-spin" />
        </Tile>
      }
      title="Processing your project"
    >
      <p className="mt-1 text-sm text-muted-foreground" role="status">
        {stepLabel(step)}
        {pct !== null && <span className="tabular-nums"> · {pct}%</span>}
      </p>
      <Progress className="mt-4" value={pct ?? 0} label="Processing progress" />
      <p className="mt-4 text-xs text-muted-foreground">
        This usually takes a few minutes. You can leave this page — it'll appear in My Library when ready.
      </p>
      {projectError && <p className="meta mt-3">{projectError}</p>}
    </StatusBody>
  );
}

function StatusBody({ tile, title, children }: { tile: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
      {tile}
      <h2 className="section-title">{title}</h2>
      {children}
    </div>
  );
}

function Tile({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className={cn("mx-auto mb-4 flex size-12 items-center justify-center rounded-xl [&_svg]:size-6", className)}
    >
      {children}
    </div>
  );
}

/** "Reading the slide deck" → "reading the slide deck" (keeps acronyms). */
function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}
