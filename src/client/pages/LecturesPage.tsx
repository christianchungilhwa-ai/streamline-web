import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listLectures, type Lecture } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, FileVideo } from "lucide-react";

/** Lectures library — the landing page. Calls
 *  /api/streamline/lectures and renders a card per row. Polling for
 *  in-flight rows is deferred to a future iteration; for now the
 *  status badge reflects the cached `status` column. */
export function LecturesPage() {
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listLectures()
      .then((r) => alive && setLectures(r.lectures))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your lectures</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a PDF + recording and Streamline aligns the slides to the transcript.
          </p>
        </div>
        <Link to="/lectures/new">
          <Button>
            <Plus />
            New lecture
          </Button>
        </Link>
      </header>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {lectures === null && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading lectures…
        </div>
      )}

      {lectures && lectures.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <FileVideo className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-medium">No lectures yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your first PDF + recording to get started.
          </p>
          <Link to="/lectures/new" className="mt-4 inline-block">
            <Button>
              <Plus />
              New lecture
            </Button>
          </Link>
        </div>
      )}

      {lectures && lectures.length > 0 && (
        <ul className="grid gap-3">
          {lectures.map((l) => (
            <li key={l.id}>
              <Link
                to={`/lectures/${l.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{l.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(l.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <StatusPill status={l.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const variants: Record<string, string> = {
    completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    processing: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    uploading: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    failed: "bg-destructive/15 text-destructive",
    canceled: "bg-muted text-muted-foreground",
  };
  const klass = variants[status] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${klass}`}>
      {status}
    </span>
  );
}
