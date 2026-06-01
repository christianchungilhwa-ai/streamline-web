import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getStudyguide,
  generateStudyguide,
  type StudyguideEvent,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles, FileText, RefreshCw } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "generating"; phase: string; done: number; total: number }
  | { kind: "ready"; markdown: string }
  | { kind: "error"; message: string };

/** Studyguide reader + generator for a single lecture.
 *  - On mount, fetches the cached studyguide (if any).
 *  - If none, shows a "Generate" CTA → streams generation (SSE) with
 *    phase + section progress, then renders the markdown.
 *  - Once present, offers a "Regenerate" affordance.
 *  The server persists the result, so re-opening just GETs the cache. */
export function StudyguidePanel({ lectureId }: { lectureId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    getStudyguide(lectureId)
      .then((sg) => {
        if (!alive) return;
        setState(sg?.markdown ? { kind: "ready", markdown: sg.markdown } : { kind: "empty" });
      })
      .catch((e) => alive && setState({ kind: "error", message: String(e?.message ?? e) }));
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, [lectureId]);

  async function generate() {
    setState({ kind: "generating", phase: "Starting…", done: 0, total: 0 });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let gotDone = false;
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
            gotDone = true;
            setState({ kind: "ready", markdown: ev.markdown });
          } else if (ev.type === "error") {
            gotDone = true;
            setState({ kind: "error", message: ev.message });
          }
        },
        ctrl.signal,
      );
      // Stream closed without an explicit `done` (e.g. proxy hiccup) —
      // the server still persisted the result, so fall back to the cache.
      if (!gotDone) {
        const sg = await getStudyguide(lectureId);
        setState(
          sg?.markdown
            ? { kind: "ready", markdown: sg.markdown }
            : { kind: "error", message: "Generation finished but no studyguide was returned." },
        );
      }
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return;
      setState({ kind: "error", message: String((e as Error)?.message ?? e) });
    }
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
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <div className="mb-6 flex items-center justify-end">
        <Button onClick={generate} variant="ghost" size="sm" className="text-muted-foreground">
          <RefreshCw />
          Regenerate
        </Button>
      </div>
      <article className={cn("studyguide-prose")}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {stripMarkers(state.markdown)}
        </ReactMarkdown>
      </article>
    </div>
  );
}

/** The persisted markdown can carry `SLIDE_IMG:N` reference markers meant
 *  for the visual renderer. Until we wire those to asset URLs, drop the
 *  bare markers so they don't show as literal text in the reader. */
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
    case "done":
      return "Done";
    default:
      return name ? name[0].toUpperCase() + name.slice(1) + "…" : "Working…";
  }
}
