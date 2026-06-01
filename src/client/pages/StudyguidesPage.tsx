import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listStudyguides, type StudyguideListItem } from "@/lib/api";
import { Loader2, NotebookText, FileText } from "lucide-react";

/** "My Studyguides" — lists the user's lectures that have a generated
 *  studyguide (server-derived; no separate store). Mirrors My Library's
 *  layout: max-w-6xl container + card grid, each card opening the
 *  lecture viewer's studyguide tab. */
export function StudyguidesPage() {
  const [items, setItems] = useState<StudyguideListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listStudyguides()
      .then((r) => alive && setItems(r.studyguides))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <header className="mb-8">
        <h1 className="page-title">My Studyguides</h1>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {items === null && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading studyguides…
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <NotebookText className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-medium">No studyguides yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Open a lecture from My Library and switch to the{" "}
            <span className="font-medium text-foreground">Studyguide</span> tab
            to generate one. It'll show up here.
          </p>
          <Link
            to="/lectures"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            Go to My Library →
          </Link>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {items.map((sg) => (
            <li key={sg.id}>
              <StudyguideCard item={sg} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mirrors LecturesPage's LectureCard: gradient media region (doc icon)
 *  + body with title and meta. Opens the viewer's studyguide tab. */
function StudyguideCard({ item }: { item: StudyguideListItem }) {
  const meta: string[] = [];
  if (item.sectionCount != null) {
    meta.push(`${item.sectionCount} section${item.sectionCount === 1 ? "" : "s"}`);
  }
  if (item.generatedAt != null) {
    meta.push(new Date(item.generatedAt * 1000).toLocaleDateString());
  }

  return (
    <Link
      to={`/lectures/${item.id}?tab=studyguide`}
      className="group flex h-[240px] flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
    >
      <div className="relative flex h-[120px] items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
        <FileText className="h-9 w-9 text-primary/80 transition-transform group-hover:scale-110" />
      </div>
      <div className="flex flex-1 flex-col px-3 py-3">
        <div className="line-clamp-2 text-sm font-semibold text-foreground">
          {item.name}
        </div>
        <div className="mt-auto pt-2 text-xs text-muted-foreground">
          {meta.join(" · ")}
        </div>
      </div>
    </Link>
  );
}
