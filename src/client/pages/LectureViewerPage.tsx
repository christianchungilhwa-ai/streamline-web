import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getLecture, getLectureStatus, type LectureDetail, type StatusResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

/** Lecture viewer. PLACEHOLDER for Phase C — the rich slide+transcript+video
 *  UI lives here. For now it's a stub that proves the API + auth + routing
 *  chain works: fetches /lectures/:id and polls /status until completion. */
export function LectureViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<LectureDetail | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const d = await getLecture(id);
        if (!alive) return;
        setDetail(d);
        // If the row is still in flight, keep polling /status.
        if (d.lecture.status !== "completed" && d.lecture.status !== "failed" && d.lecture.status !== "canceled") {
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

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <div className="mb-6 flex items-center gap-2">
        <Link to="/lectures">
          <Button variant="ghost" size="sm">
            <ArrowLeft />
            Back
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!detail && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {detail && (
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight">{detail.lecture.name}</h1>

          {detail.lecture.status !== "completed" ? (
            <div className="rounded-lg border bg-card p-6">
              <div className="text-sm font-medium">{detail.lecture.status}</div>
              {status?.step && (
                <div className="mt-1 text-xs text-muted-foreground">
                  step: {status.step}
                  {typeof status.progress === "number" ? ` (${Math.round(status.progress * 100)}%)` : ""}
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
              {status?.error && (
                <div className="mt-3 text-sm text-destructive">{status.error}</div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-6">
              <div className="text-sm text-muted-foreground">
                Lecture processed.{" "}
                {detail.project ? "Slide-by-slide viewer coming in Phase C." : "Project data unavailable."}
              </div>
              <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(detail.project, null, 2)?.slice(0, 4000) ?? "(no project data)"}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
