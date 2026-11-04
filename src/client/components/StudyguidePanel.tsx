import { useEffect, useRef, useState } from "react";
import { ApiError, generateStudyguide, type StudyguideEvent, type StudyguideMeta } from "@/lib/api";
import {
  blueprintSections,
  displayMarkdown,
  downloadMarkdownFile,
  getResolvedStudyguide,
  regenerateStudyguideSection,
  type ResolvedStudyguide,
} from "@/lib/studyguideApi";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateFull, plural } from "@/lib/format";
import { humanize } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SgMarkdown } from "@/components/SgMarkdown";
import {
  AlertCircle,
  Download,
  FileDown,
  FileText,
  Loader2,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Sparkles,
} from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "generating"; phase: string; done: number; total: number }
  | { kind: "ready"; sg: ResolvedStudyguide }
  | { kind: "error"; message: string; stage: "load" | "generate" };

/** Phase label while the writer is producing sections; the generating
 *  view swaps it for "Writing section x of y" once totals are known. */
const WRITING_PHASE = "Writing sections…";

/** Study guide reader + generator for a single lecture.
 *  - On mount, fetches the cached study guide (if any).
 *  - If none, shows a "Generate" CTA → streams generation (SSE) with
 *    phase + section progress, then renders the markdown.
 *  - Once present, renders the server-resolved markdown (slide/nano
 *    images, drawio diagrams, sg-pair tabs) under a toolbar row with the
 *    generated date and section count, an Export menu (.md download +
 *    print-to-PDF) and an options menu for full (confirmed) or
 *    per-section regeneration.
 *  The server persists the result, so re-opening just GETs the cache. */
export function StudyguidePanel({ lectureId }: { lectureId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [regenSection, setRegenSection] = useState<number | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  // Bumped by "Try again" after a failed load to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef<HTMLButtonElement>(null);
  // Monotonic token invalidating any in-flight resolved-copy poll when
  // the lecture changes, a newer poll starts, or the panel unmounts.
  const pollRef = useRef(0);

  /** While the server resolves visuals on a background thread
   *  (`resolving: true`), re-fetch on a 15s cadence (~5 min budget)
   *  and swap the resolved payload in when it lands. */
  function pollWhileResolving(sg: ResolvedStudyguide | null | undefined) {
    if (!sg?.resolving) return;
    const token = ++pollRef.current;
    let tries = 0;
    const tick = async () => {
      if (token !== pollRef.current || tries++ >= 20) return;
      try {
        const next = await getResolvedStudyguide(lectureId);
        if (token !== pollRef.current) return;
        if (next?.markdown) {
          setState({ kind: "ready", sg: next });
          if (!next.resolving) return;
        }
      } catch {
        // Transient — keep polling.
      }
      setTimeout(tick, 15_000);
    };
    setTimeout(tick, 15_000);
  }

  /** After a regen request dies at a proxy/edge timeout, the server is
   *  usually still finishing — poll until meta.generatedAt moves past
   *  its pre-regen value (15s cadence, ~4 min budget). */
  async function waitForRegenLanding(
    beforeGeneratedAt: number | null,
  ): Promise<ResolvedStudyguide | null> {
    const token = ++pollRef.current;
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 15_000));
      if (token !== pollRef.current) return null;
      try {
        const sg = await getResolvedStudyguide(lectureId);
        if (token !== pollRef.current) return null;
        const at = sg?.meta?.generatedAt ?? null;
        if (sg?.markdown && at !== null && at !== beforeGeneratedAt) return sg;
      } catch {
        // Transient — keep polling.
      }
    }
    return null;
  }

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    setRegenSection(null);
    setRegenError(null);
    setConfirmRegen(false);
    getResolvedStudyguide(lectureId)
      .then((sg) => {
        if (!alive) return;
        setState(sg?.markdown ? { kind: "ready", sg } : { kind: "empty" });
        pollWhileResolving(sg);
      })
      .catch((e) => alive && setState({ kind: "error", message: friendlyError(e), stage: "load" }));
    return () => {
      alive = false;
      pollRef.current++;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId, reloadKey]);

  async function generate() {
    setState({ kind: "generating", phase: "Starting…", done: 0, total: 0 });
    setRegenError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let gotError = false;
    try {
      await generateStudyguide(
        lectureId,
        (ev: StudyguideEvent) => {
          if (ev.type === "phase") {
            setState((s) =>
              s.kind === "generating"
                ? { ...s, phase: phaseLabel(ev.name) }
                : { kind: "generating", phase: phaseLabel(ev.name), done: 0, total: 0 },
            );
          } else if (ev.type === "section") {
            // Count completed sections rather than trusting the index, so
            // progress stays monotonic if sections land out of order.
            setState((s) => {
              const prev = s.kind === "generating" ? s.done : 0;
              return {
                kind: "generating",
                phase: WRITING_PHASE,
                done: Math.min(ev.total, prev + 1),
                total: ev.total,
              };
            });
          } else if (ev.type === "done") {
            // Show the raw markdown immediately; the resolved payload
            // (with image/diagram assets) is fetched right after the
            // stream closes, below.
            setState({ kind: "ready", sg: { markdown: ev.markdown, meta: ev.meta } });
          } else if (ev.type === "error") {
            gotError = true;
            setState({ kind: "error", message: streamErrorMessage(ev.message), stage: "generate" });
          }
        },
        ctrl.signal,
      );
      // Stream closed — whether or not a `done` frame arrived (proxy
      // hiccups can drop it), the server persisted the result, so the
      // cache GET is the source of truth AND carries `resolvedMarkdown`,
      // which the SSE `done` event does not.
      if (!gotError) {
        const sg = await getResolvedStudyguide(lectureId);
        setState((s) =>
          sg?.markdown
            ? { kind: "ready", sg }
            : s.kind === "ready"
              ? s
              : {
                  kind: "error",
                  message: "Generation finished, but no study guide came back. Please try again.",
                  stage: "generate",
                },
        );
        pollWhileResolving(sg);
      }
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return;
      setState({ kind: "error", message: friendlyError(e), stage: "generate" });
    }
  }

  async function regenerateSection(sectionIndex: number) {
    setRegenSection(sectionIndex);
    setRegenError(null);
    const beforeGeneratedAt =
      state.kind === "ready" ? (state.sg.meta?.generatedAt ?? null) : null;
    try {
      const sg = await regenerateStudyguideSection(lectureId, sectionIndex);
      setState({ kind: "ready", sg });
      pollWhileResolving(sg);
    } catch (e: unknown) {
      // A proxy/edge timeout (502/504) or dropped connection usually
      // means the server is STILL writing the section — poll for the
      // refreshed study guide instead of showing a false failure.
      const status = e instanceof ApiError ? e.status : null;
      if (status === 502 || status === 504 || status === 0) {
        const landed = await waitForRegenLanding(beforeGeneratedAt);
        if (landed) {
          setState({ kind: "ready", sg: landed });
          pollWhileResolving(landed);
          return;
        }
        setRegenError(
          "Regeneration is taking longer than expected — it may still finish; check back in a minute.",
        );
      } else {
        setRegenError(friendlyError(e));
      }
    } finally {
      setRegenSection(null);
    }
  }

  /** Print-to-PDF: flag the document so the @media print stylesheet in
   *  index.css isolates the study guide (print-root pattern), then hand
   *  off to the browser's print dialog ("Save as PDF"). */
  function exportPdf() {
    const cleanup = () => {
      document.body.classList.remove("sg-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    document.body.classList.add("sg-printing");
    // Two frames so the class change paints before the print snapshot.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        cleanup();
      }),
    );
  }

  if (state.kind === "loading") {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground"
      >
        <Loader2 className="size-4 animate-spin" />
        Loading study guide…
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <EmptyState
        icon={<FileText />}
        title="No study guide yet"
        description="Generate a study guide from this lecture — distilled notes, key points and concept breakdowns drawn from the aligned slides and transcript."
        action={
          <Button onClick={generate}>
            <Sparkles />
            Generate study guide
          </Button>
        }
      />
    );
  }

  if (state.kind === "generating") {
    const writing = state.phase === WRITING_PHASE && state.total > 0;
    const heading = writing ? `Writing section ${state.done} of ${state.total}` : state.phase;
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center md:py-16"
      >
        <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
        <h2 className="section-title mt-4">{heading}</h2>
        {state.total > 0 && (
          <Progress
            value={(state.done / state.total) * 100}
            label="Study guide progress"
            className="mx-auto mt-4 max-w-xs"
          />
        )}
        <p className="mt-4 text-xs text-muted-foreground">This usually takes a few minutes.</p>
      </div>
    );
  }

  if (state.kind === "error") {
    const loadFailed = state.stage === "load";
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6 md:py-16">
        <Callout
          tone="danger"
          icon={<AlertCircle />}
          title={loadFailed ? "Couldn't load the study guide" : "Couldn't generate the study guide"}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={loadFailed ? () => setReloadKey((k) => k + 1) : generate}
            >
              <RefreshCw />
              Try again
            </Button>
          }
        >
          {state.message}
        </Callout>
      </div>
    );
  }

  // ready
  const { sg } = state;
  const { markdown, resolved } = displayMarkdown(sg);
  const sections = blueprintSections(sg.meta);
  const busy = regenSection !== null;
  const regeneratingTitle =
    regenSection !== null
      ? sections.find((s) => s.sectionIndex === regenSection)?.title ?? null
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 md:px-10 md:py-8">
      <div className="sg-toolbar mb-6 flex items-center gap-2 border-b border-border pb-3">
        <div className="mr-auto min-w-0">
          {busy ? (
            <span role="status" className="meta flex items-center gap-2">
              <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden />
              <span className="truncate">Regenerating section {regenSection + 1}…</span>
            </span>
          ) : (
            <GeneratedMeta meta={sg.meta} fallbackSections={sections.length} />
          )}
        </div>

        {/* Export menu — .md download + print-optimized PDF. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy}>
              <Download />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => downloadMarkdownFile(markdown)}>
              <FileDown />
              Download Markdown (.md)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportPdf}>
              <Printer />
              Print or save as PDF…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Options menu — regenerate the whole guide (confirmed) or one section. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={optionsRef}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              disabled={busy}
              aria-label="Study guide options"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-52">
            <DropdownMenuItem onSelect={() => setConfirmRegen(true)}>
              <RefreshCw />
              Regenerate entire guide…
            </DropdownMenuItem>
            {sections.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <RefreshCw />
                  Regenerate one section
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {sections.map((s) => (
                    <DropdownMenuItem
                      key={s.sectionIndex}
                      onSelect={() => regenerateSection(s.sectionIndex)}
                    >
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {s.sectionIndex + 1}.
                      </span>
                      <span className="min-w-0 truncate" title={s.title}>
                        {s.title}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {regenError && (
        <Callout
          tone="danger"
          icon={<AlertCircle />}
          onDismiss={() => setRegenError(null)}
          className="mb-4"
        >
          {regenError}
        </Callout>
      )}

      <article className="studyguide-prose sg-print-root">
        <SgMarkdown
          markdown={resolved ? markdown : stripMarkers(markdown)}
          lectureId={lectureId}
          regeneratingTitle={regeneratingTitle}
        />
      </article>

      <Dialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <DialogContent
          className="max-w-md"
          onCloseAutoFocus={(e) => {
            // No Dialog trigger exists (it opens from a menu item), so hand
            // focus back to the options button explicitly.
            const btn = optionsRef.current;
            if (btn?.isConnected) {
              e.preventDefault();
              btn.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Regenerate the whole study guide?</DialogTitle>
            <DialogDescription>
              The current version will be replaced. This can take a few minutes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                setConfirmRegen(false);
                void generate();
              }}
            >
              <RefreshCw />
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "Generated Oct 15 · 8 sections" — the toolbar's left-hand meta line. */
function GeneratedMeta({
  meta,
  fallbackSections,
}: {
  meta: StudyguideMeta | null | undefined;
  fallbackSections: number;
}) {
  const generatedAt = meta?.generatedAt;
  const sectionCount = meta?.sectionCount || fallbackSections;
  const date = generatedAt ? new Date(generatedAt * 1000) : null;
  if (!date && !sectionCount) return null;
  const day = date ? formatDate(date) : "";
  // formatDate says "Today"/"Yesterday"; mid-sentence they read lowercase.
  const dayText = day === "Today" || day === "Yesterday" ? day.toLowerCase() : day;
  return (
    <p className="meta truncate">
      {date && (
        <time dateTime={date.toISOString()} title={formatDateFull(date)}>
          Generated {dayText}
        </time>
      )}
      {date && sectionCount ? " · " : null}
      {sectionCount ? plural(sectionCount, "section") : null}
    </p>
  );
}

/** SSE `error` frames carry the server's raw message; show it only when
 *  it already reads as a sentence, otherwise a plain fallback. */
function streamErrorMessage(message: string | undefined): string {
  const msg = (message ?? "").trim();
  if (msg.length <= 200 && /^[A-Z].*[.!?]$/.test(msg)) return msg;
  return "Something went wrong while writing the study guide. Please try again.";
}

/** The RAW (pre-resolution) markdown can carry `SLIDE_IMG:N` reference
 *  markers meant for the visual resolver. When we have to fall back to
 *  it (no `resolvedMarkdown` in the payload yet), drop the bare markers
 *  so they don't show as literal text in the reader. */
function stripMarkers(md: string): string {
  return md.replace(/!?\[?SLIDE_IMG:\d+\]?/g, "").replace(/\n{3,}/g, "\n\n");
}

function phaseLabel(name: string): string {
  switch (name) {
    case "planning":
      return "Planning the study guide…";
    case "writing":
      return WRITING_PHASE;
    case "monolith":
      return "Assembling…";
    case "persisting":
      return "Saving…";
    case "extractingFigures":
      return "Extracting figures…";
    case "resolvingVisuals":
      return "Rendering visuals…";
    case "done":
      return "Done";
    default:
      return name ? `${humanize(name)}…` : "Working…";
  }
}
