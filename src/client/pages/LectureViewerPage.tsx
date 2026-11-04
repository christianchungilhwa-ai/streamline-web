import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, FileText, LayoutList, Loader2, LocateFixed, Sparkles } from "lucide-react";
import {
  getLecture,
  getLectureStatus,
  startLecture,
  assetUrl,
  type LectureDetail,
  type StatusResponse,
} from "@/lib/api";
import { normalizeProject } from "@/lib/project";
import type { SlideNote } from "@/lib/types";
import { friendlyError } from "@/lib/errors";
import { formatDuration, plural } from "@/lib/format";
import { lectureStatus } from "@/lib/status";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { usePageTitle } from "@/lib/usePageTitle";
import { usePlaybackSync, seekVideoTo } from "@/lib/usePlaybackSync";
import { cn, scrollWithin } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { Tip } from "@/components/ui/tooltip";
import { VideoPlayer } from "@/components/VideoPlayer";
import { SlideDetailView } from "@/components/SlideDetailView";
import { StudyguidePanel } from "@/components/StudyguidePanel";
import { SlideOutline, firstShownAt } from "@/components/SlideOutline";
import { ProcessingStatus } from "@/components/ProcessingStatus";

type View = "slides" | "studyguide";

/** The slide card wrapper for slideNotes[i] inside the slide list. */
function cardIn(list: HTMLElement | null, i: number): HTMLElement | null {
  return list?.querySelector<HTMLElement>(`[data-slide-pos="${i}"]`) ?? null;
}

/**
 * Lecture viewer — video + slide list with playback-driven highlighting
 * and "Follow video" scrolling, plus the Study guide tab.
 *
 *   lg and up   header ─────────────────────────────────────────────
 *               rail (video, toolbar, outline) │ slide cards (scrolls)
 *               each column scrolls on its own; the root does not.
 *
 *   below lg    the root is the only scroller: sticky header, then a
 *               sticky video (full-bleed on phones; a compact video +
 *               toolbar row at md), then the cards. `data-sticky-offset`
 *               on the root tells scrollWithin how much is covered.
 *
 * Both tabs stay mounted once visited (the inactive one is `hidden`), so
 * switching tabs keeps the <video> element, its playhead and the sync.
 */
export function LectureViewerPage() {
  const { id } = useParams<{ id: string }>();
  // The element itself, in state: usePlaybackSync restarts when it mounts.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLElement | null>(null);
  const slidesContainerRef = useRef<HTMLDivElement | null>(null);

  const [detail, setDetail] = useState<LectureDetail | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  // Bumped to restart the polling loop after a retry re-starts the job.
  const [pollNonce, setPollNonce] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);

  const isLg = useMediaQuery("(min-width: 1024px)");
  usePageTitle(detail?.lecture.name ?? null);

  // Slides ↔ Study guide view. URL-synced via ?tab=studyguide so the
  // My study guides list can deep-link straight into the guide.
  const [searchParams, setSearchParams] = useSearchParams();
  const view: View = searchParams.get("tab") === "studyguide" ? "studyguide" : "slides";
  const setView = (v: View) => {
    const next = new URLSearchParams(searchParams);
    if (v === "studyguide") next.set("tab", "studyguide");
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  };

  // The study guide mounts on first visit and then stays mounted.
  const [sgMounted, setSgMounted] = useState(view === "studyguide");
  useEffect(() => {
    if (view === "studyguide") setSgMounted(true);
  }, [view]);
  const showStudyguide = sgMounted || view === "studyguide";

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
        if (d.lecture.status !== "completed") {
          // Fetch status for failed/canceled too — it carries the error
          // message (e.g. which phase died and why); only keep polling
          // while the job is actually running.
          const s = await getLectureStatus(id);
          if (!alive) return;
          setStatus(s);
          if (d.lecture.status !== "failed" && d.lecture.status !== "canceled") {
            timer = window.setTimeout(tick, 4000);
          }
        }
      } catch (e: unknown) {
        if (alive) setLoadError(friendlyError(e));
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [id, pollNonce]);

  // Memoized so usePlaybackSync and the auto-scroll effect see a stable
  // object between renders.
  const project = useMemo(() => normalizeProject(detail?.project ?? null), [detail?.project]);
  const playback = usePlaybackSync(videoEl, project);
  const ready = detail?.lecture.status === "completed" && !!project;
  const phase = loadError ? "error" : !detail ? "loading" : ready ? "ready" : "status";
  // Don't scroll anything before the video has been started or moved.
  const started = playback.isPlaying || playback.currentTime > 0;

  const hasAnnotated = useMemo(() => !!project?.slideNotes.some((n) => n.editedSlideKey), [project]);

  // "1 h 55 min · 109 slides", with the breakdown on hover.
  const meta = useMemo(() => {
    if (!project) return null;
    const notes = project.slideNotes;
    const fromPdf = notes.filter((n) => n.pdfPageIndex !== null).length;
    const fromVideo = notes.length - fromPdf;
    const skipped = notes.filter((n) => !n.wasPresented).length;
    const dur = formatDuration(project.videoDuration);
    return {
      subtitle: [dur !== "—" ? dur : null, plural(notes.length, "slide")].filter(Boolean).join(" · "),
      breakdown: [
        fromPdf ? `${fromPdf} from your PDF` : null,
        fromVideo ? `${fromVideo} captured from video` : null,
        skipped ? `${skipped} not shown` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }, [project]);

  // Leaving the Slides tab pauses the video (it stays mounted, hidden).
  useEffect(() => {
    if (view !== "slides") videoEl?.pause();
  }, [view, videoEl]);

  // Below lg the root scrolls under a sticky header + sticky video; tell
  // scrollWithin (and the transcript follow) how much of the top that
  // covers. At lg the columns scroll on their own, with nothing over them.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      const covered = isLg ? 0 : (headerRef.current?.offsetHeight ?? 0) + (stickyRef.current?.offsetHeight ?? 0);
      root.dataset.stickyOffset = String(covered);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    if (headerRef.current) ro.observe(headerRef.current);
    if (stickyRef.current) ro.observe(stickyRef.current);
    return () => ro.disconnect();
  }, [isLg, phase, view]);

  /** The element that scrolls the slide cards at the current width. */
  const getScroller = useCallback(() => (isLg ? slidesContainerRef.current : rootRef.current), [isLg]);

  // Follow video: bring the active card's top just under the sticky area.
  useEffect(() => {
    if (view !== "slides" || !autoScroll || !started) return;
    const i = playback.activeSlideIndex;
    if (i === null) return;
    scrollWithin(getScroller(), cardIn(slidesContainerRef.current, i), "start");
  }, [autoScroll, started, playback.activeSlideIndex, project, view, getScroller]);

  const onSeekTo = useCallback((t: number) => seekVideoTo(videoEl, t), [videoEl]);

  // Outline row: play from where the slide is first shown, and bring its
  // card in (slides never shown just scroll).
  const onOutlineSelect = useCallback(
    (i: number) => {
      const note = project?.slideNotes[i];
      if (!note) return;
      const at = firstShownAt(note);
      if (at !== null) seekVideoTo(videoEl, at);
      scrollWithin(getScroller(), cardIn(slidesContainerRef.current, i), "start");
    },
    [project, videoEl, getScroller],
  );

  // ---- Loading / error / pre-completion -------------------------------------
  if (!id) return null;

  if (loadError) {
    return (
      <div ref={rootRef} className="flex h-full flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-md px-6 py-16">
          <Callout tone="danger" icon={<AlertCircle />}>
            {loadError}
          </Callout>
          <div className="mt-4 flex justify-center">
            <Button asChild variant="ghost">
              <Link to="/lectures">
                <ArrowLeft />
                Back to My Library
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div ref={rootRef} className="flex h-full flex-col overflow-y-auto">
        <ViewerHeader ref={headerRef} loading />
        <div role="status" className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading project…
        </div>
      </div>
    );
  }

  // Pre-completion (or a finished job whose project couldn't be read).
  if (!ready || !project) {
    const retry = async () => {
      setRetrying(true);
      setRetryError(null);
      try {
        // No roi argument: the server keeps the userRoi persisted at the
        // original start.
        await startLecture(detail.lecture.id);
        setStatus(null);
        setDetail({ ...detail, lecture: { ...detail.lecture, status: "processing" } });
        setPollNonce((n) => n + 1);
      } catch (e: unknown) {
        setRetryError(friendlyError(e));
      } finally {
        setRetrying(false);
      }
    };
    return (
      <div ref={rootRef} className="flex h-full flex-col overflow-y-auto">
        <ViewerHeader
          ref={headerRef}
          title={detail.lecture.name}
          subtitle={lectureStatus(detail.lecture.status)?.label}
        />
        <ProcessingStatus
          status={detail.lecture.status}
          step={status?.step}
          progress={status?.progress}
          error={status?.error}
          projectError={detail.projectError}
          onRetry={retry}
          retrying={retrying}
          retryError={retryError}
        />
      </div>
    );
  }

  // ---- Completed: rich viewer ----------------------------------------------
  const notes = project.slideNotes;
  const activeIndex = playback.activeSlideIndex;
  const toggleProps = {
    autoScroll,
    setAutoScroll,
    annotationsVisible,
    setAnnotationsVisible,
    hasAnnotated,
  };

  return (
    <div ref={rootRef} className="flex h-full flex-col overflow-y-auto lg:overflow-hidden">
      <ViewerHeader
        ref={headerRef}
        title={detail.lecture.name}
        subtitle={meta?.subtitle}
        subtitleTitle={meta?.breakdown}
        view={view}
        onViewChange={setView}
        mobileControls={<ViewerToggles {...toggleProps} iconOnly />}
      />

      {showStudyguide && (
        <div className={cn("lg:min-h-0 lg:flex-1 lg:overflow-y-auto", view !== "studyguide" && "hidden")}>
          <StudyguidePanel lectureId={id} />
        </div>
      )}

      <div
        className={cn(
          "lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[440px_minmax(0,1fr)]",
          view !== "slides" && "hidden lg:hidden",
        )}
      >
        {/* Video rail (lg) / sticky video row (below lg). */}
        <aside
          ref={stickyRef}
          className="sticky top-11 z-10 flex flex-col border-b bg-background/95 backdrop-blur md:top-14 md:flex-row md:items-center md:gap-4 md:p-3 lg:static lg:h-full lg:min-h-0 lg:flex-col lg:items-stretch lg:gap-3 lg:border-b-0 lg:border-r lg:bg-background lg:p-4 lg:backdrop-blur-none"
        >
          <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-black md:w-[min(50%,calc(28svh*16/9))] md:rounded-lg lg:w-full lg:rounded-xl">
            <VideoPlayer
              videoRef={setVideoEl}
              src={assetUrl(id, project.videoFileName ?? "video.mp4")}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
          <PlayerToolbar
            className="hidden md:flex"
            activeNote={activeIndex !== null ? notes[activeIndex] : null}
            total={notes.length}
          >
            <ViewerToggles {...toggleProps} />
          </PlayerToolbar>
          <SlideOutline
            className="hidden lg:flex"
            notes={notes}
            activeIndex={activeIndex}
            onSelect={onOutlineSelect}
          />
        </aside>

        {/* Slide cards. */}
        <div ref={slidesContainerRef} className="space-y-3 p-3 sm:p-4 lg:min-h-0 lg:overflow-y-auto lg:p-6">
          {notes.map((note, i) => (
            <div key={note.id} data-slide-pos={i}>
              <SlideDetailView
                lectureId={id}
                note={note}
                pdfPageCount={project.pdfPageCount}
                isActive={activeIndex === i}
                activeWord={playback.activeWord}
                onSeekTo={onSeekTo}
                annotationsVisible={annotationsVisible}
                autoScroll={autoScroll}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Header ------------------------------------------------------------------

/**
 * md and up: Back · title + subtitle | Slides/Study guide | actions slot.
 * Below md: one bar with the view switch and icon-only toggles (the
 * AppShell top bar already shows the lecture name and the menu).
 * Without `onViewChange` (loading / processing) only the title row shows.
 */
function ViewerHeader({
  ref,
  title,
  loading,
  subtitle,
  subtitleTitle,
  view,
  onViewChange,
  mobileControls,
}: {
  ref?: Ref<HTMLDivElement>;
  title?: string;
  loading?: boolean;
  subtitle?: string;
  /** Native tooltip on the subtitle (the slide-count breakdown). */
  subtitleTitle?: string;
  view?: View;
  onViewChange?: (v: View) => void;
  mobileControls?: ReactNode;
}) {
  const tabs = view && onViewChange ? { view, onViewChange } : null;
  return (
    <div ref={ref} className="sticky top-0 z-20 shrink-0 lg:static">
      {/* md and up — the view switch sits in the middle column, so it stays
          at the same x on both tabs. */}
      <div className="hidden h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b bg-card/85 px-4 backdrop-blur-xl md:grid md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Tip label="Back to My Library">
            <Button asChild variant="ghost" size="icon-sm" className="-ml-1.5">
              <Link to="/lectures" aria-label="Back to My Library">
                <ArrowLeft />
              </Link>
            </Button>
          </Tip>
          <div className="min-w-0">
            {loading ? (
              <div aria-hidden className="h-4 w-48 max-w-full animate-pulse rounded bg-muted" />
            ) : (
              <>
                <h1 className="truncate text-[15px] font-semibold leading-tight">{title}</h1>
                {subtitle && (
                  <p className="meta truncate" title={subtitleTitle || undefined}>
                    {subtitle}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        <div>{tabs && <ViewSwitch {...tabs} />}</div>
        <div className="flex items-center justify-self-end gap-1">
          {/* SLOT — "Download slides (PDF)": a <Button variant="ghost" size="sm">
              with <Download /> goes here; the download-slides session adds it.
              Render it only when `tabs` is set (completed lectures). */}
        </div>
      </div>

      {/* Below md. */}
      {tabs && (
        <div className="flex h-11 items-center gap-1.5 border-b bg-card/85 px-3 backdrop-blur-xl md:hidden">
          {title && <h1 className="sr-only">{title}</h1>}
          <ViewSwitch {...tabs} size="sm" className="flex-1" />
          {/* Invisible (not removed) on the Study guide tab so the switch
              doesn't change width between tabs. */}
          <div className={cn("flex items-center gap-0.5", tabs.view !== "slides" && "invisible")}>
            {mobileControls}
          </div>
          {/* SLOT — "Download slides (PDF)", icon-only: <Button variant="ghost"
              size="icon-sm" aria-label="Download slides (PDF)"><Download /></Button>
              goes here; the download-slides session adds it. */}
        </div>
      )}
    </div>
  );
}

function ViewSwitch({
  view,
  onViewChange,
  size = "md",
  className,
}: {
  view: View;
  onViewChange: (v: View) => void;
  size?: "md" | "sm";
  className?: string;
}) {
  return (
    <Segmented aria-label="View" value={view} onValueChange={onViewChange} size={size} className={className}>
      <SegmentedItem value="slides" icon={<LayoutList />} label="Slides" />
      <SegmentedItem value="studyguide" icon={<FileText />} label="Study guide" />
    </Segmented>
  );
}

// ---- Player controls ---------------------------------------------------------

function ViewerToggles({
  autoScroll,
  setAutoScroll,
  annotationsVisible,
  setAnnotationsVisible,
  hasAnnotated,
  iconOnly,
}: {
  autoScroll: boolean;
  setAutoScroll: (v: boolean) => void;
  annotationsVisible: boolean;
  setAnnotationsVisible: (v: boolean) => void;
  hasAnnotated: boolean;
  iconOnly?: boolean;
}) {
  return (
    <>
      <Toggle
        pressed={autoScroll}
        onPressedChange={setAutoScroll}
        icon={<LocateFixed />}
        label="Follow video"
        tooltip="Keep the current slide in view while the video plays"
        iconOnly={iconOnly}
      />
      {hasAnnotated && (
        <Toggle
          pressed={annotationsVisible}
          onPressedChange={setAnnotationsVisible}
          icon={<Sparkles />}
          label="Annotations"
          tooltip="Show annotated slide images"
          iconOnly={iconOnly}
        />
      )}
    </>
  );
}

/** Under the video: where the video is ("Slide 12 of 109") + the toggles.
 *  A row at lg; stacked beside the compact video at md; hidden on phones
 *  (the toggles live in the header bar there). */
function PlayerToolbar({
  activeNote,
  total,
  className,
  children,
}: {
  activeNote: SlideNote | null;
  total: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 md:flex-1 md:flex-col md:items-start md:gap-2 lg:flex-none lg:flex-row lg:items-center lg:gap-1",
        className,
      )}
    >
      <span className="meta px-1">
        {activeNote ? `Slide ${activeNote.slideIndex + 1} of ${total}` : plural(total, "slide")}
      </span>
      <div className="flex flex-wrap items-center gap-1 lg:ml-auto">{children}</div>
    </div>
  );
}
