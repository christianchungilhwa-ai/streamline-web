import { useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ApiError, generateStudyguide, type StudyguideEvent } from "@/lib/api";
import {
  blueprintSections,
  displayMarkdown,
  downloadMarkdownFile,
  getResolvedStudyguide,
  regenerateStudyguideSection,
  type ResolvedStudyguide,
} from "@/lib/studyguideApi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SgMarkdown } from "@/components/SgMarkdown";
import {
  ChevronRight,
  Download,
  FileDown,
  FileText,
  Loader2,
  MoreHorizontal,
  Printer,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "generating"; phase: string; done: number; total: number }
  | { kind: "ready"; sg: ResolvedStudyguide }
  | { kind: "error"; message: string };

/** Studyguide reader + generator for a single lecture.
 *  - On mount, fetches the cached studyguide (if any).
 *  - If none, shows a "Generate" CTA → streams generation (SSE) with
 *    phase + section progress, then renders the markdown.
 *  - Once present, renders the server-resolved markdown (slide/nano
 *    images, drawio diagrams, sg-pair tabs) with a toolbar offering
 *    export (.md download + print-to-PDF) and full or per-section
 *    regeneration.
 *  The server persists the result, so re-opening just GETs the cache. */
export function StudyguidePanel({ lectureId }: { lectureId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [regenSection, setRegenSection] = useState<number | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
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
    getResolvedStudyguide(lectureId)
      .then((sg) => {
        if (!alive) return;
        setState(sg?.markdown ? { kind: "ready", sg } : { kind: "empty" });
        pollWhileResolving(sg);
      })
      .catch((e) => alive && setState({ kind: "error", message: String(e?.message ?? e) }));
    return () => {
      alive = false;
      pollRef.current++;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId]);

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
            setState({
              kind: "generating",
              phase: "Writing sections…",
              done: ev.index + 1,
              total: ev.total,
            });
          } else if (ev.type === "done") {
            // Show the raw markdown immediately; the resolved payload
            // (with image/diagram assets) is fetched right after the
            // stream closes, below.
            setState({ kind: "ready", sg: { markdown: ev.markdown, meta: ev.meta } });
          } else if (ev.type === "error") {
            gotError = true;
            setState({ kind: "error", message: ev.message });
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
              : { kind: "error", message: "Generation finished but no studyguide was returned." },
        );
        pollWhileResolving(sg);
      }
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return;
      setState({ kind: "error", message: String((e as Error)?.message ?? e) });
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
      // refreshed studyguide instead of showing a false failure.
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
        setRegenError(String((e as Error)?.message ?? e));
      }
    } finally {
      setRegenSection(null);
    }
  }

  /** Print-to-PDF: flag the document so the @media print stylesheet in
   *  index.css isolates the studyguide (print-root pattern), then hand
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
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading studyguide…
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-semibold">No studyguide yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate an AI study guide from this lecture — distilled notes,
          key points, and concept breakdowns drawn from the aligned slides
          and transcript.
        </p>
        <Button onClick={generate} className="mt-5">
          <Sparkles />
          Generate study guide
        </Button>
      </div>
    );
  }

  if (state.kind === "generating") {
    const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : null;
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
        <h2 className="mt-4 text-base font-semibold">{state.phase}</h2>
        {state.total > 0 && (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Section {state.done} of {state.total}
            </p>
            <div className="mx-auto mt-4 h-1.5 max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
          </>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          This can take a minute — Opus is reading the whole lecture.
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {state.message}
        </div>
        <Button onClick={generate} variant="secondary" className="mt-4">
          <RefreshCw />
          Try again
        </Button>
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
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <div className="sg-toolbar mb-6 flex items-center justify-end gap-1">
        {busy && (
          <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Regenerating section {regenSection! + 1}…
          </span>
        )}

        {/* Export menu — .md download + print-optimized PDF. */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy}>
              <Download />
              Export
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menuContentClass} align="end" sideOffset={6}>
              <DropdownMenu.Item className={menuItemClass} onSelect={() => downloadMarkdownFile(markdown)}>
                <FileDown />
                Download Markdown
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItemClass} onSelect={exportPdf}>
                <Printer />
                Export PDF
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Overflow menu — regenerate all / per-section, plus meta. */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              disabled={busy}
              aria-label="Studyguide options"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menuContentClass} align="end" sideOffset={6}>
              <DropdownMenu.Item className={menuItemClass} onSelect={generate}>
                <RefreshCw />
                Regenerate All
              </DropdownMenu.Item>
              {sections.length > 0 && (
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className={menuItemClass}>
                    <RefreshCw />
                    Regenerate Section
                    <ChevronRight className="ml-auto" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent className={menuContentClass} sideOffset={4}>
                      {sections.map((s) => (
                        <DropdownMenu.Item
                          key={s.sectionIndex}
                          className={menuItemClass}
                          onSelect={() => regenerateSection(s.sectionIndex)}
                        >
                          {s.sectionIndex + 1}. {s.title}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              )}
              {sg.meta && (
                <>
                  <DropdownMenu.Separator className="my-1 h-px bg-border" />
                  <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
                    {metaLines(sg.meta.generatedAt, sg.meta.sectionCount, sg.meta.model).map(
                      (line, i) => (
                        <div key={i}>{line}</div>
                      ),
                    )}
                  </div>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {regenError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{regenError}</span>
          <button
            type="button"
            onClick={() => setRegenError(null)}
            className="rounded p-0.5 hover:bg-destructive/10"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <article className={cn("studyguide-prose sg-print-root")}>
        <SgMarkdown
          markdown={resolved ? markdown : stripMarkers(markdown)}
          lectureId={lectureId}
          regeneratingTitle={regeneratingTitle}
        />
      </article>
    </div>
  );
}

const menuContentClass =
  "z-50 min-w-[210px] max-w-[320px] rounded-xl border bg-popover p-1 text-sm text-popover-foreground shadow-lg";

const menuItemClass =
  "flex w-full cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";

function metaLines(
  generatedAt: number | undefined,
  sectionCount: number | undefined,
  model: string | undefined,
): string[] {
  const lines: string[] = [];
  if (generatedAt) {
    lines.push(
      `Generated ${new Date(generatedAt * 1000).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })}`,
    );
  }
  const parts: string[] = [];
  if (sectionCount) parts.push(`${sectionCount} section${sectionCount === 1 ? "" : "s"}`);
  if (model) parts.push(model);
  if (parts.length > 0) lines.push(parts.join(" · "));
  return lines;
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
      return "Writing sections…";
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
      return name ? name[0].toUpperCase() + name.slice(1) + "…" : "Working…";
  }
}
