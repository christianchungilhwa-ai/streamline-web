import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listLectures, type Lecture } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, FileVideo, Film } from "lucide-react";

/** Lectures library — the landing page. Calls
 *  /api/streamline/lectures and renders a card per row. Polling for
 *  in-flight rows is deferred to a future iteration; for now the
 *  status badge reflects the cached `status` column.
 *
 *  Layout mirrors Claraity-web's deck-card grid: 220px min, rounded
 *  corners, hover-lift, sky-blue (brand) accent on status when
 *  completed. */
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
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">My Library</h1>
          <p className="page-subtitle">
            Upload a PDF + recording and Streamline aligns the slides to the
            transcript.
          </p>
        </div>
        <Link to="/lectures/new" className="shrink-0">
          <Button>
            <Plus />
            New lecture
          </Button>
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
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
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
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
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {lectures.map((l) => (
            <li key={l.id}>
              <LectureCard lecture={l} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Single lecture card. Mirrors Claraity-web's `.deck-card`:
 *  rounded-xl, top media region (here: an icon-only placeholder until
 *  we wire up real thumbnails), body with title + date + status. */
function LectureCard({ lecture }: { lecture: Lecture }) {
  return (
    <Link
      to={`/lectures/${lecture.id}`}
      className="group flex h-[240px] flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
    >
      {/* Media region — placeholder thumbnail. Tinted with the
          brand color so completed lectures feel inviting. */}
      <div className="relative flex h-[120px] items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
        <Film className="h-9 w-9 text-primary/80 transition-transform group-hover:scale-110" />
        <div className="absolute right-2 top-2">
          <StatusPill status={lecture.status} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-3 py-3">
        <div className="truncate text-sm font-semibold text-foreground">
          {lecture.name}
        </div>
        <div className="mt-auto pt-2 text-xs text-muted-foreground">
          {new Date(lecture.createdAt).toLocaleDateString()}
        </div>
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  // Map server statuses to readable + semantic colors.
  // - completed → sky-blue (brand) so it reads as "ready"
  // - processing → blue (in-flight, distinct from completed brand)
  // - uploading → amber
  // - failed → destructive
  // - canceled → muted
  const variants: Record<string, string> = {
    completed: "bg-primary/20 text-primary",
    processing: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    uploading: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    failed: "bg-destructive/15 text-destructive",
    canceled: "bg-muted text-muted-foreground",
  };
  const klass = variants[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm ${klass}`}
    >
      {status}
    </span>
  );
}
