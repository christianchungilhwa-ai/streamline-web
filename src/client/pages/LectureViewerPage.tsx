import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getLecture,
  getLectureStatus,
  assetUrl,
  type LectureDetail,
  type StatusResponse,
} from "@/lib/api";
import type { LectureProject } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { VideoPlayer } from "@/components/VideoPlayer";
import { SlideDetailView } from "@/components/SlideDetailView";
import { usePlaybackSync, seekVideoTo } from "@/lib/usePlaybackSync";

/**
 * Rich lecture viewer — sticky video + scrolling slide list, with
 * playback-driven slide highlighting and auto-scroll. The layout
 * mirrors `Streamline/Views/Results/ResultsView.swift` from the iOS
 * app:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Video (sticky, ~40% width on desktop)               │
 *   │                                                       │
 *   ├──────────────────────────────────────────────────────┤
 *   │  Slide 1: PDF page + transcript + AI notes            │
 *   │  Slide 2: PDF page + transcript + AI notes  ◀── now playing │
 *   │  Slide 3: Video-only slide + transcript + AI notes     │
 *   │  ...                                                  │
 *   └──────────────────────────────────────────────────────┘
 *
 * Mobile fallback: video stacks above slide list (no sticky).
 */
export function LectureViewerPage() {
  const { id } = useParams<{ id: string }>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const slidesContainerRef = useRef<HTMLDivElement | null>(null);

  const [detail, setDetail] = useState<LectureDetail | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);

  // ---- Data fetch + polling ---------------------------------------------
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const d = await getLecture(id);
        if (!alive) return;
        setDetail(d);
        if (
          d.lecture.status !== "completed" &&
          d.lecture.status !== "failed" &&
          d.lecture.status !== "canceled"
        ) {
          const s = await getLectureStatus(id);
          if (!alive) return;
          setStatus(s);
          timer = window.setTimeout(tick, 4000);
        }
      } catch (e: unknown) {
        if (alive) setError(String((e as Error)?.message ?? e));
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);

  const project = (detail?.project ?? null) as LectureProject | null;
  const playback = usePlaybackSync(videoRef, project);

  // Auto-scroll to the active slide. Toggle gives the user manual
  // control during read-ahead.
  useEffect(() => {
    if (!autoScroll) return;
    if (playback.activeSlideIndex === null) return;
    const container = slidesContainerRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `[data-slide-index="${project?.slideNotes[playback.activeSlideIndex]?.slideIndex}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [autoScroll, playback.activeSlideIndex, project]);

  // ---- Loading / error / pre-completion -------------------------------------
  if (!id) return null;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <BackLink />
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <BackLink />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading lecture…
        </div>
      </div>
    );
  }

  // Pre-completion: show the progress panel.
  if (detail.lecture.status !== "completed" || !project) {
    return (
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <BackLink />
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">{detail.lecture.name}</h1>
        <div className="rounded-lg border bg-card p-6">
          <div className="text-sm font-medium capitalize">{detail.lecture.status}</div>
          {status?.step && (
            <div className="mt-1 text-xs text-muted-foreground">
              step: {status.step}
              {typeof status.progress === "number"
                ? ` (${Math.round(status.progress * 100)}%)`
                : ""}
            </div>
          )}
          {typeof status?.progress === "number" && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round(status.progress * 100)}%` }}
              />
            </div>
          )}
          {status?.error && <div className="mt-3 text-sm text-destructive">{status.error}</div>}
          {detail.projectError && (
            <div className="mt-3 text-xs text-muted-foreground">{detail.projectError}</div>
          )}
        </div>
      </div>
    );
  }

  // ---- Completed: rich viewer ----------------------------------------------
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b bg-card/40 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/lectures">
            <Button variant="ghost" size="sm">
              <ArrowLeft />
              Back
            </Button>
          </Link>
          <h1 className="truncate text-lg font-semibold tracking-tight">{detail.lecture.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoScroll ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setAutoScroll((v) => !v)}
          >
            Auto-scroll {autoScroll ? "on" : "off"}
          </Button>
          <Button
            variant={annotationsVisible ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setAnnotationsVisible((v) => !v)}
          >
            <Sparkles />
            Annotations
          </Button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Video column — sticky on desktop, top of stack on mobile. */}
        <aside className="border-b bg-card/30 p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <VideoPlayer
            videoRef={videoRef}
            src={assetUrl(id, project.videoFileName ?? "video.mp4")}
            className="w-full rounded-lg bg-black shadow"
          />
          <div className="mt-3 text-xs text-muted-foreground">
            {project.slideNotes.length} slide
            {project.slideNotes.length === 1 ? "" : "s"} ·{" "}
            {formatDuration(project.videoDuration)} ·{" "}
            {project.pdfPageCount} PDF page{project.pdfPageCount === 1 ? "" : "s"}
          </div>
        </aside>

        {/* Slide list. */}
        <div
          ref={slidesContainerRef}
          className="space-y-4 overflow-y-auto p-4 md:p-6"
        >
          {project.slideNotes.map((note, i) => (
            <SlideDetailView
              key={note.id}
              lectureId={id}
              note={note}
              pdfPageCount={project.pdfPageCount}
              isActive={playback.activeSlideIndex === i}
              activeWord={playback.activeWord}
              onSeekTo={(t) => seekVideoTo(videoRef.current, t)}
              annotationsVisible={annotationsVisible}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <div className="mb-6 flex items-center gap-2">
      <Link to="/lectures">
        <Button variant="ghost" size="sm">
          <ArrowLeft />
          Back
        </Button>
      </Link>
    </div>
  );
}

function formatDuration(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  if (m < 60) return `${m}:${sec}`;
  const h = Math.floor(m / 60);
  return `${h}:${(m % 60).toString().padStart(2, "0")}:${sec}`;
}
