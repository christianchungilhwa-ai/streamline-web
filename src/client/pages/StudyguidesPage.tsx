import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listStudyguides, type StudyguideListItem } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateFull, plural } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { ProjectCard } from "@/components/ProjectCard";
import { Loader2, NotebookText, FileText } from "lucide-react";

const TITLE = "My study guides";

/** "My study guides" — the user's projects that have a generated study
 *  guide (server-derived; no separate store). Same shell and card grid as
 *  My Library; each card opens the viewer's Study guide tab. */
export function StudyguidesPage() {
  usePageTitle(TITLE);
  const [items, setItems] = useState<StudyguideListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    listStudyguides()
      .then((r) => {
        if (!alive) return;
        setItems(r.studyguides);
        setError(null);
      })
      .catch((e: unknown) => {
        if (alive) setError(friendlyError(e));
      });
    return () => {
      alive = false;
    };
  }, [loadNonce]);

  return (
    <PageContainer>
      <PageHeader title={TITLE} description="Study guides generated from your projects" />

      {error && items === null && (
        <Callout
          tone="danger"
          action={
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                setError(null);
                setLoadNonce((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {error}
        </Callout>
      )}

      {items === null && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading study guides…
        </div>
      )}

      {items && items.length === 0 && (
        <EmptyState
          icon={<NotebookText />}
          title="No study guides yet"
          description="Open a project and switch to the Study guide tab to generate one."
          action={
            <Button asChild variant="outline">
              <Link to="/lectures">Go to My Library</Link>
            </Button>
          }
        />
      )}

      {items && items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4 lg:gap-5">
          {items.map((sg) => (
            <li key={sg.id}>
              <ProjectCard
                to={`/lectures/${sg.id}?tab=studyguide`}
                // Keeps "My study guides" highlighted in the sidebar (AppShell).
                linkState={{ from: "studyguides" }}
                lectureId={sg.id}
                thumbnailKey={sg.thumbnailKey}
                fallbackIcon={<FileText />}
                title={sg.name}
                meta={<StudyguideMeta item={sg} />}
              />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

/** "12 sections · Oct 15" — either half is dropped when the server
 *  doesn't know it. */
function StudyguideMeta({ item }: { item: StudyguideListItem }) {
  const generated = item.generatedAt != null ? new Date(item.generatedAt * 1000) : null;
  const sections = item.sectionCount != null ? plural(item.sectionCount, "section") : null;
  if (!sections && !generated) return null;
  return (
    <>
      {sections}
      {sections && generated && " · "}
      {generated && (
        <time dateTime={generated.toISOString()} title={formatDateFull(generated)}>
          {formatDate(generated)}
        </time>
      )}
    </>
  );
}
