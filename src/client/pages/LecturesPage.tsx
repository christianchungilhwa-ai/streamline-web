import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listLectures,
  renameLecture,
  deleteLecture,
  assetUrl,
  type Lecture,
} from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateFull, plural } from "@/lib/format";
import { usePageTitle } from "@/lib/usePageTitle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/PageHeader";
import { ProjectCard } from "@/components/ProjectCard";
import { StatusBadge } from "@/components/StatusBadge";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { cn } from "@/lib/utils";
import {
  Plus,
  Loader2,
  Film,
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  ArrowUpDown,
  X,
  MoreVertical,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";

/** Library — the landing page.
 *
 *  Layout:
 *  - PageHeader: title (follows the filter) + project count + "New
 *    project" (desktop). On phones the AppShell top bar shows the title
 *    and "New project" becomes an icon button at the end of the toolbar.
 *  - Toolbar: filter chips (All / My projects / Shared with me) on the
 *    left; a persistent search field, grid/list view and sort on the
 *    right.
 *  - Body: card grid or list. Every project carries an actions menu
 *    (Rename / Delete) rendered as a sibling of its link.
 *
 *  URL state:
 *  - `?new=1` opens the NewProjectDialog (keeps the old /lectures/new
 *    bookmark working).
 *  - `?filter=mine|shared` selects the chip, so the sidebar's "Shared
 *    with me" entry can deep-link here. View / sort / search are local.
 *
 *  Filter chips note:
 *  - "All" / "My projects" currently show the same data (everything
 *    visible to you is yours until sharing lands). "Shared with me"
 *    shows an empty state.
 *
 *  Freshness: while any project is uploading or processing, the list is
 *  re-fetched every 5 s (skipped while the tab is hidden) so status
 *  badges clear on their own. */

type Filter = "all" | "mine" | "shared";
type View = "grid" | "list";
type Sort = "recent" | "oldest" | "alpha";

/** Which row-action dialog is up. `open: false` keeps the target lecture
 *  mounted through the dialog's exit animation instead of unmounting it
 *  mid-fade. */
type LectureAction = {
  kind: "rename" | "delete";
  lecture: Lecture;
  open: boolean;
};

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest first" },
  { value: "alpha", label: "Alphabetical" },
];

const POLL_MS = 5000;

const isWorking = (l: Lecture) => l.status === "uploading" || l.status === "processing";

export function LecturesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>("grid");
  const [sort, setSort] = useState<Sort>("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [action, setAction] = useState<LectureAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filterParam = searchParams.get("filter");
  const filter: Filter =
    filterParam === "mine" || filterParam === "shared" ? filterParam : "all";
  const setFilter = (f: Filter) => {
    const next = new URLSearchParams(searchParams);
    if (f === "all") next.delete("filter");
    else next.set("filter", f);
    setSearchParams(next, { replace: true });
  };

  const dialogOpen = searchParams.get("new") === "1";
  const setDialogOpen = (open: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (open) next.set("new", "1");
    else next.delete("new");
    setSearchParams(next, { replace: true });
  };

  const title = filter === "shared" ? "Shared with me" : "My Library";
  usePageTitle(title);

  // ── Loading ──────────────────────────────────────────────────────────
  // `loadNonce` drives a fetch (initial load, Try again, polling);
  // `loadSettled` ticks after every fetch so the poll timer re-arms even
  // when a background refresh fails.
  const [loadNonce, setLoadNonce] = useState(0);
  const [loadSettled, setLoadSettled] = useState(0);
  const reload = useCallback(() => setLoadNonce((n) => n + 1), []);

  // Local edits a background refresh must not undo: a rename whose PATCH
  // is still in flight, and rows deleted after the refresh started.
  const pendingRenames = useRef(new Map<string, string>());
  const deletedIds = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    listLectures()
      .then((r) => {
        if (!alive) return;
        setLectures(
          r.lectures
            .filter((l) => !deletedIds.current.has(l.id))
            .map((l) => {
              const name = pendingRenames.current.get(l.id);
              return name === undefined ? l : { ...l, name };
            }),
        );
        setError(null);
      })
      .catch((e: unknown) => {
        if (alive) setError(friendlyError(e));
      })
      .finally(() => {
        if (alive) setLoadSettled((n) => n + 1);
      });
    return () => {
      alive = false;
    };
  }, [loadNonce]);

  // Poll while anything is still uploading/processing. A tick that lands
  // while the tab is hidden is deferred until the tab is visible again.
  const anyWorking = lectures?.some(isWorking) ?? false;
  useEffect(() => {
    if (!anyWorking) return;
    let missed = false;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "hidden") missed = true;
      else reload();
    }, POLL_MS);
    const onVisibility = () => {
      if (missed && document.visibilityState === "visible") {
        missed = false;
        reload();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [anyWorking, loadSettled, reload]);

  const closeAction = () => setAction((a) => (a ? { ...a, open: false } : a));

  /** Optimistic rename — apply the new name locally right away, then
   *  PATCH. On failure, revert just this lecture's name and say so. */
  function applyRename(lecture: Lecture, name: string) {
    setActionError(null);
    pendingRenames.current.set(lecture.id, name);
    setLectures(
      (ls) => ls?.map((l) => (l.id === lecture.id ? { ...l, name } : l)) ?? ls,
    );
    renameLecture(lecture.id, name)
      .catch((e: unknown) => {
        // A newer rename of the same row supersedes this one.
        if (pendingRenames.current.get(lecture.id) !== name) return;
        setLectures(
          (ls) =>
            ls?.map((l) =>
              l.id === lecture.id ? { ...l, name: lecture.name } : l,
            ) ?? ls,
        );
        setActionError(`Couldn't rename “${lecture.name}”. ${friendlyError(e)}`);
      })
      .finally(() => {
        if (pendingRenames.current.get(lecture.id) === name) {
          pendingRenames.current.delete(lecture.id);
        }
      });
  }

  /** Derived: lectures after filter + search + sort. */
  const query = searchQuery.trim();
  const displayed = useMemo(() => {
    if (!lectures) return null;
    let list = [...lectures];

    // Filter — "shared" returns empty until the sharing backend lands.
    if (filter === "shared") list = [];

    // Search by name.
    const q = query.toLowerCase();
    if (q) list = list.filter((l) => l.name.toLowerCase().includes(q));

    switch (sort) {
      case "recent":
        list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        break;
      case "oldest":
        list.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        break;
      case "alpha":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return list;
  }, [lectures, filter, sort, query]);

  const rowActions: LectureRowActions = {
    onRename: (l) => setAction({ kind: "rename", lecture: l, open: true }),
    onDelete: (l) => setAction({ kind: "delete", lecture: l, open: true }),
  };

  const newProjectButton = (
    <Button onClick={() => setDialogOpen(true)} className="max-md:hidden">
      <Plus />
      New project
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={
          filter !== "shared" && lectures ? plural(lectures.length, "project") : undefined
        }
        actions={newProjectButton}
      >
        <Toolbar
          filter={filter}
          onFilterChange={setFilter}
          view={view}
          onViewChange={setView}
          sort={sort}
          onSortChange={setSort}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNewProject={() => setDialogOpen(true)}
        />
      </PageHeader>

      {error && lectures === null && (
        <Callout
          tone="danger"
          action={
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                setError(null);
                reload();
              }}
            >
              Try again
            </Button>
          }
        >
          {error}
        </Callout>
      )}

      {actionError && (
        <Callout tone="danger" onDismiss={() => setActionError(null)} className="mb-4">
          {actionError}
        </Callout>
      )}

      {displayed === null && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading projects…
        </div>
      )}

      {/* Empty states — three flavors:
          (1) Shared filter is active and there's nothing shared yet
          (2) User has no projects at all (first run)
          (3) Projects exist but the search matched none */}
      {displayed && displayed.length === 0 && (
        filter === "shared" ? (
          <EmptyState
            icon={<Users />}
            title="Nothing shared with you yet"
            description="Projects and study guides shared by classmates or instructors will appear here."
          />
        ) : (lectures?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Film />}
            title="Your library is empty"
            description="Add a lecture recording — with its slide deck if you have one, or let Streamline build the slides from the video — and get notes for every slide."
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus />
                New project
              </Button>
            }
          />
        ) : (
          <EmptyState
            size="inline"
            title={`No projects match “${query}”`}
            action={
              <Button variant="subtle" size="sm" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            }
          />
        )
      )}

      {displayed && displayed.length > 0 && (
        view === "grid" ? (
          <LectureGrid lectures={displayed} {...rowActions} />
        ) : (
          <LectureList lectures={displayed} {...rowActions} />
        )
      )}

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {action?.kind === "rename" && (
        <RenameLectureDialog
          lecture={action.lecture}
          open={action.open}
          onOpenChange={(open) => !open && closeAction()}
          onSave={(name) => applyRename(action.lecture, name)}
        />
      )}
      {action?.kind === "delete" && (
        <DeleteLectureDialog
          lecture={action.lecture}
          open={action.open}
          onOpenChange={(open) => !open && closeAction()}
          onDeleted={(id) => {
            deletedIds.current.add(id);
            setLectures((ls) => ls?.filter((l) => l.id !== id) ?? ls);
          }}
        />
      )}
    </PageContainer>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────

interface ToolbarProps {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  view: View;
  onViewChange: (v: View) => void;
  sort: Sort;
  onSortChange: (s: Sort) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNewProject: () => void;
}

function Toolbar({
  filter,
  onFilterChange,
  view,
  onViewChange,
  sort,
  onSortChange,
  searchQuery,
  onSearchChange,
  onNewProject,
}: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Sort";

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      {/* Filter chips — scroll sideways on narrow phones instead of
          wrapping. The vertical padding keeps focus rings unclipped. */}
      <div className="-mx-4 -my-1 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:mx-0 md:px-0">
        <Segmented variant="chips" aria-label="Filter" value={filter} onValueChange={onFilterChange}>
          <SegmentedItem value="all" label="All" />
          <SegmentedItem value="mine" label="My projects" />
          <SegmentedItem value="shared" label="Shared with me" />
        </Segmented>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 md:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              if (searchQuery) {
                e.preventDefault();
                onSearchChange("");
              } else {
                e.currentTarget.blur();
              }
            }}
            placeholder="Search projects"
            aria-label="Search projects"
            className={cn(
              "h-8 rounded-full bg-card pl-9 pr-8",
              "transition-[width,color,background-color,border-color,box-shadow]",
              searchQuery ? "md:w-64" : "md:w-48 md:focus:w-64",
            )}
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              shape="pill"
              aria-label="Clear search"
              onClick={() => {
                onSearchChange("");
                inputRef.current?.focus();
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X />
            </Button>
          )}
        </div>

        <Segmented size="sm" aria-label="View" value={view} onValueChange={onViewChange}>
          <SegmentedItem value="grid" label="Grid view" icon={<LayoutGrid />} iconOnly />
          <SegmentedItem value="list" label="List view" icon={<List />} iconOnly />
        </Segmented>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              shape="pill"
              aria-label={`Sort: ${sortLabel}`}
              className="max-sm:w-8 max-sm:px-0"
            >
              <ArrowUpDown className="text-muted-foreground sm:hidden" />
              <span className="max-sm:hidden">{sortLabel}</span>
              <ChevronDown className="text-muted-foreground max-sm:hidden" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSortChange(v as Sort)}>
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                  {opt.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="icon-sm"
          shape="pill"
          className="md:hidden"
          aria-label="New project"
          onClick={onNewProject}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

// ─── Lecture renderings ─────────────────────────────────────────────────

interface LectureRowActions {
  onRename: (l: Lecture) => void;
  onDelete: (l: Lecture) => void;
}

function CreatedAt({ lecture }: { lecture: Lecture }) {
  return (
    <time dateTime={lecture.createdAt} title={formatDateFull(lecture.createdAt)}>
      {formatDate(lecture.createdAt)}
    </time>
  );
}

function LectureGrid({
  lectures,
  onRename,
  onDelete,
}: { lectures: Lecture[] } & LectureRowActions) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4 lg:gap-5">
      {lectures.map((l) => (
        <li key={l.id}>
          <ProjectCard
            to={`/lectures/${l.id}`}
            lectureId={l.id}
            thumbnailKey={l.thumbnailKey}
            fallbackIcon={<Film />}
            title={l.name}
            meta={<CreatedAt lecture={l} />}
            badge={<StatusBadge status={l.status} overlay />}
            actions={<LectureActionsMenu lecture={l} onRename={onRename} onDelete={onDelete} />}
          />
        </li>
      ))}
    </ul>
  );
}

function LectureList({
  lectures,
  onRename,
  onDelete,
}: { lectures: Lecture[] } & LectureRowActions) {
  return (
    <ul className="space-y-2">
      {lectures.map((l) => (
        <li key={l.id} className="relative">
          <Link
            to={`/lectures/${l.id}`}
            className={cn(
              "card-surface flex items-center gap-3 p-2.5 pr-12 transition-colors",
              "hover:border-foreground/15 hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            <ListThumb lecture={l} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{l.name}</div>
              <div className="meta mt-0.5">
                <CreatedAt lecture={l} />
              </div>
            </div>
            <StatusBadge status={l.status} className="shrink-0" />
          </Link>
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <LectureActionsMenu lecture={l} onRename={onRename} onDelete={onDelete} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 16:9 mini thumbnail for list rows; falls back to a quiet icon. */
function ListThumb({ lecture }: { lecture: Lecture }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!lecture.thumbnailKey && !failed;
  return (
    <span className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground/60">
      {showImg ? (
        <img
          src={assetUrl(lecture.id, lecture.thumbnailKey!)}
          alt=""
          crossOrigin="use-credentials"
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Film className="size-4" />
      )}
    </span>
  );
}

// ─── Row actions: rename / delete ───────────────────────────────────────

/** Actions menu for one project. Rendered as a SIBLING of the row's Link
 *  (absolutely positioned over it), never inside it — nesting a button in
 *  an anchor breaks keyboard/AT semantics. */
function LectureActionsMenu({
  lecture,
  onRename,
  onDelete,
}: { lecture: Lecture } & LectureRowActions) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          shape="pill"
          aria-label={`Actions for ${lecture.name}`}
          className="text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onRename(lecture)}>
          <Pencil />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(lecture)}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Rename modal: seeded with the current name, trims whitespace, rejects
 *  empty names, and treats an unchanged name as a no-op success (close,
 *  no request). */
function RenameLectureDialog({
  lecture,
  open,
  onOpenChange,
  onSave,
}: {
  lecture: Lecture;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(lecture.name);
  const [formError, setFormError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  // Fresh draft on every open so the field never carries stale state.
  useEffect(() => {
    if (open) {
      setDraft(lecture.name);
      setFormError(null);
    }
  }, [open, lecture]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      setFormError("Name can't be empty.");
      return;
    }
    if (trimmed !== lecture.name) onSave(trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>Enter a new name for this project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={inputId} className="text-sm font-medium">
              Name
            </label>
            <Input
              id={inputId}
              autoFocus
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setFormError(null);
              }}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="Project name"
              maxLength={200}
              aria-invalid={!!formError}
              aria-describedby={formError ? errorId : undefined}
            />
            {formError && (
              <p id={errorId} className="text-sm text-destructive-text">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Delete confirmation — names the project so there's no ambiguity about
 *  what's going away. Unlike rename, the removal is NOT optimistic: the
 *  DELETE is awaited (spinner on the button) so a failed delete never
 *  vanishes a row that still exists on the server. */
function DeleteLectureDialog({
  lecture,
  open,
  onOpenChange,
  onDeleted,
}: {
  lecture: Lecture;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBusy(false);
      setDeleteError(null);
    }
  }, [open, lecture]);

  async function confirmDelete() {
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteLecture(lecture.id);
      onDeleted(lecture.id);
      onOpenChange(false);
    } catch (e: unknown) {
      setDeleteError(friendlyError(e));
      setBusy(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (busy && !next) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete project?</DialogTitle>
          <DialogDescription>
            {`“${lecture.name}” will be permanently deleted. This can't be undone.`}
          </DialogDescription>
        </DialogHeader>
        {deleteError && <Callout tone="danger">{deleteError}</Callout>}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirmDelete}
            disabled={busy}
          >
            {busy && <Loader2 className="animate-spin" />}
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
