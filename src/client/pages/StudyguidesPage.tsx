import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listStudyguides, type StudyguideListItem } from "@/lib/api";
import { Loader2, NotebookText, FileText } from "lucide-react";

/** "My Studyguides" — lists the user's lectures that have a generated
 *  studyguide (server-derived; no separate store). Each row deep-links to
 *  the lecture viewer's studyguide tab. */
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
    <div className="mx-auto max-w-4xl p-6 md:p-10">
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
          <Link to="/lectures" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            Go to My Library →
          </Link>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((sg) => (
            <li key={sg.id}>
              <Link
                to={`/lectures/${sg.id}?tab=studyguide`}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5">
                  <FileText className="h-5 w-5 text-primary/80" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {sg.name}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {sg.sectionCount != null && (
                      <>
                        {sg.sectionCount} section{sg.sectionCount === 1 ? "" : "s"}
                        {sg.generatedAt != null && " · "}
                      </>
                    )}
                    {sg.generatedAt != null &&
                      `Generated ${new Date(sg.generatedAt * 1000).toLocaleDateString()}`}
                  </div>
                </div>
                <svg
                  width={8}
                  height={14}
                  viewBox="0 0 8 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-muted-foreground"
                >
                  <path d="M1 1l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
