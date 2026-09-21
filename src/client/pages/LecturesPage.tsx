import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listLectures,
  renameLecture,
  deleteLecture,
  ApiError,
  type Lecture,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Plus,
  Loader2,
  FileVideo,
  Film,
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  Check,
  X,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";

/** Lectures library — the landing page.
 *
 *  Layout:
 *  - Header: page title + "New Project" button (top-right) that
 *    opens NewProjectDialog
 *  - Toolbar: NotebookLM-style row — filter chips (All / My Projects
 *    / Shared with me) on the left, search-icon + view toggle + sort
 *    dropdown on the right
 *  - Body: card grid or list, depending on the view toggle. Every
 *    lecture carries a kebab menu (Rename / Delete) — the web analog
 *    of the Mac app's long-press context menu on a project row
 *
 *  URL state:
 *  - `?new=1` opens the NewProjectDialog (lets us preserve the old
 *    /lectures/new bookmark). Other toolbar state is local-only — we
 *    can promote to URL params later if deep-linkable filter/sort
 *    becomes useful.
 *
 *  Filter chips note:
 *  - "All" / "My Projects" currently show the same data (everything
 *    visible to you is yours, since Shared/Community aren't wired
 *    yet). "Shared with me" shows an empty list. The chips exist so
 *    when sharing lands, the surface area is already in place. */

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

export function LecturesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter is URL-synced via `?filter=mine|shared` so the sidebar's
  // "Shared with me" entry can deep-link straight into this view with
  // the right chip already selected. View / sort / search stay local
  // because they don't have a sidebar entry that drives them.
  const [view, setView] = useState<View>("grid");
  const [sort, setSort] = useState<Sort>("recent");
  const [searchOpen, setSearchOpen] = useState(false);
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

  useEffect(() => {
    let alive = true;
    listLectures()
      .then((r) => alive && setLectures(r.lectures))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  const closeAction = () => setAction((a) => (a ? { ...a, open: false } : a));

  /** Optimistic rename — apply the new name locally right away (same
   *  instant feedback as the Mac app's local store save), then PATCH.
   *  On failure, revert just this lecture's name and surface the error. */
  function applyRename(lecture: Lecture, name: string) {
    setActionError(null);
    setLectures(
      (ls) => ls?.map((l) => (l.id === lecture.id ? { ...l, name } : l)) ?? ls,
    );
    renameLecture(lecture.id, name).catch((e: unknown) => {
      setLectures(
        (ls) =>
          ls?.map((l) =>
            l.id === lecture.id ? { ...l, name: lecture.name } : l,
          ) ?? ls,
      );
      const msg = e instanceof ApiError ? e.message : String(e);
      setActionError(`Rename failed: ${msg}`);
    });
  }

  /** Derived: lectures after filter + search + sort. */
  const displayed = useMemo(() => {
    if (!lectures) return null;
    let list = [...lectures];

    // Filter — "shared" returns empty until the sharing backend lands.
    if (filter === "shared") list = [];

    // Search by name.
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((l) => l.name.toLowerCase().includes(q));

    // Sort.
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
  }, [lectures, filter, sort, searchQuery]);

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">My Library</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus />
          New Project
        </Button>
      </header>

      <Toolbar
        filter={filter}
        onFilterChange={setFilter}
        view={view}
        onViewChange={setView}
        sort={sort}
        onSortChange={setSort}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        onSearchToggle={(open) => {
          setSearchOpen(open);
          if (!open) setSearchQuery("");
        }}
        onSearchChange={setSearchQuery}
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {actionError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss"
            className="rounded-full p-1 transition-colors hover:bg-destructive/15"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {displayed === null && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Projects…
        </div>
      )}

      {/* Empty states — three flavors:
          (1) Shared filter is active and there's nothing shared yet
          (2) User has zero lectures at all (first-run)
          (3) Lectures exist but the search/filter combo returned none */}
      {displayed && displayed.length === 0 && (
        filter === "shared" ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
            <FileVideo className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-medium">Nothing shared with you yet</h2>
            <p className="mt-1 max-w-md mx-auto text-sm text-muted-foreground">
              Lectures and study guides shared by classmates or instructors
              will appear here.
            </p>
          </div>
        ) : (lectures?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
            <FileVideo className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-medium">No Projects yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your first PDF + recording to get started.
            </p>
            <Button onClick={() => setDialogOpen(true)} className="mt-4">
              <Plus />
              New Project
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
            No Projects match your search.
          </div>
        )
      )}

      {displayed && displayed.length > 0 && (
        view === "grid" ? (
          <LectureGrid
            lectures={displayed}
            onRename={(l) => setAction({ kind: "rename", lecture: l, open: true })}
            onDelete={(l) => setAction({ kind: "delete", lecture: l, open: true })}
          />
        ) : (
          <LectureList
            lectures={displayed}
            onRename={(l) => setAction({ kind: "rename", lecture: l, open: true })}
            onDelete={(l) => setAction({ kind: "delete", lecture: l, open: true })}
          />
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
          onDeleted={(id) =>
            setLectures((ls) => ls?.filter((l) => l.id !== id) ?? ls)
          }
        />
      )}
    </div>
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
  searchOpen: boolean;
  searchQuery: string;
  onSearchToggle: (open: boolean) => void;
  onSearchChange: (q: string) => void;
}

function Toolbar(props: ToolbarProps) {
  const {
    filter,
    onFilterChange,
    view,
    onViewChange,
    sort,
    onSortChange,
    searchOpen,
    searchQuery,
    onSearchToggle,
    onSearchChange,
  } = props;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      {/* Left: filter chips (or search input when expanded) */}
      {searchOpen ? (
        <div className="flex flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onSearchToggle(false);
            }}
            placeholder="Search lectures…"
            aria-label="Search lectures"
            className="block w-full max-w-md bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() => onSearchToggle(false)}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <FilterChip active={filter === "all"} onClick={() => onFilterChange("all")}>
            All
          </FilterChip>
          <FilterChip active={filter === "mine"} onClick={() => onFilterChange("mine")}>
            My Projects
          </FilterChip>
          <FilterChip active={filter === "shared"} onClick={() => onFilterChange("shared")}>
            Shared with me
          </FilterChip>
        </div>
      )}

      {/* Right: search + view toggle + sort. Hidden when search input
          is expanded — its X button doubles as the way back. */}
      {!searchOpen && (
        <div className="flex items-center gap-2">
          <IconButton onClick={() => onSearchToggle(true)} aria-label="Search">
            <Search className="h-4 w-4" />
          </IconButton>
          <ViewToggle view={view} onChange={onViewChange} />
          <SortDropdown value={sort} onChange={onSortChange} />
        </div>
      )}
    </div>
  );
}

/** A pill-shaped filter chip. Active = subtle filled background; idle =
 *  plain text in the muted foreground color. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Round icon-only button used for the search trigger. */
function IconButton({
  onClick,
  children,
  "aria-label": ariaLabel,
}: {
  onClick: () => void;
  children: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** Two-segment grid/list view toggle. */
function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  return (
    <div className="flex h-9 items-center rounded-full border border-border bg-card p-0.5">
      <ViewSegment active={view === "grid"} onClick={() => onChange("grid")} aria-label="Grid view">
        <LayoutGrid className="h-4 w-4" />
      </ViewSegment>
      <ViewSegment active={view === "list"} onClick={() => onChange("list")} aria-label="List view">
        <List className="h-4 w-4" />
      </ViewSegment>
    </div>
  );
}

function ViewSegment({
  active,
  onClick,
  children,
  "aria-label": ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        "flex h-8 items-center gap-1 rounded-full px-2.5 text-sm transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && <Check className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/** Sort dropdown — pill trigger + Radix popover menu. */
function SortDropdown({
  value,
  onChange,
}: {
  value: Sort;
  onChange: (s: Sort) => void;
}) {
  const currentLabel = SORT_OPTIONS.find((o) => o.value === value)?.label ?? "Sort";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <span>{currentLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[180px] rounded-xl border border-border bg-card p-1 text-sm shadow-lg"
        >
          {SORT_OPTIONS.map((opt) => (
            <DropdownMenu.Item
              key={opt.value}
              onSelect={() => onChange(opt.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2",
                "outline-none transition-colors",
                "data-[highlighted]:bg-accent data-[highlighted]:text-foreground",
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center text-primary">
                {value === opt.value && <Check className="h-3.5 w-3.5" />}
              </span>
              <span>{opt.label}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ─── Lecture renderings ─────────────────────────────────────────────────

interface LectureRowActions {
  onRename: (l: Lecture) => void;
  onDelete: (l: Lecture) => void;
}

function LectureGrid({
  lectures,
  onRename,
  onDelete,
}: { lectures: Lecture[] } & LectureRowActions) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {lectures.map((l) => (
        <li key={l.id}>
          <LectureCard lecture={l} onRename={onRename} onDelete={onDelete} />
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
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 pr-14 transition-colors hover:bg-accent"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5">
              <Film className="h-5 w-5 text-primary/80" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">
                {l.name}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {new Date(l.createdAt).toLocaleDateString()}
              </div>
            </div>
            <StatusPill status={l.status} />
          </Link>
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <LectureActionsMenu lecture={l} onRename={onRename} onDelete={onDelete} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LectureCard({
  lecture,
  onRename,
  onDelete,
}: { lecture: Lecture } & LectureRowActions) {
  return (
    <div className="group relative rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
      <Link
        to={`/lectures/${lecture.id}`}
        className="flex h-[240px] flex-col overflow-hidden rounded-xl border border-border bg-card"
      >
        <div className="relative flex h-[120px] items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
          <Film className="h-9 w-9 text-primary/80 transition-transform group-hover:scale-110" />
          <div className="absolute right-2 top-2">
            <StatusPill status={lecture.status} />
          </div>
        </div>
        <div className="flex flex-1 flex-col px-3 py-3">
          <div className="truncate text-sm font-semibold text-foreground">
            {lecture.name}
          </div>
          <div className="mt-auto pt-2 pr-8 text-xs text-muted-foreground">
            {new Date(lecture.createdAt).toLocaleDateString()}
          </div>
        </div>
      </Link>
      <div className="absolute bottom-2 right-2">
        <LectureActionsMenu lecture={lecture} onRename={onRename} onDelete={onDelete} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
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

// ─── Row actions: rename / delete ───────────────────────────────────────

/** Kebab menu with the per-lecture actions. Rendered as a SIBLING of the
 *  row's Link (absolutely positioned over it), never inside it — nesting
 *  a button in an anchor breaks keyboard/AT semantics. */
function LectureActionsMenu({
  lecture,
  onRename,
  onDelete,
}: { lecture: Lecture } & LectureRowActions) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${lecture.name}`}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground",
            "transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            "data-[state=open]:bg-accent data-[state=open]:text-foreground",
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[160px] rounded-xl border border-border bg-card p-1 text-sm shadow-lg"
        >
          <DropdownMenu.Item
            onSelect={() => onRename(lecture)}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2",
              "outline-none transition-colors",
              "data-[highlighted]:bg-accent data-[highlighted]:text-foreground",
            )}
          >
            <Pencil className="h-4 w-4" />
            <span>Rename</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => onDelete(lecture)}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-destructive",
              "outline-none transition-colors",
              "data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive",
            )}
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Rename modal — mirrors the Mac app's "Rename Project" alert: seeded
 *  with the current name, trims whitespace, rejects empty names, and
 *  treats an unchanged name as a no-op success (close, no request). */
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

  // Fresh draft on every open (parity with the Mac alert, which is
  // remounted per open so its TextField never carries stale state).
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
          <DialogTitle>Rename Project</DialogTitle>
          <DialogDescription>
            Enter a new name for this lecture.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="mt-2 space-y-4">
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setFormError(null);
            }}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Project name"
            aria-label="Project name"
            maxLength={200}
            className={cn(
              "block w-full rounded-2xl border border-border bg-card px-5 py-4",
              "text-base text-foreground placeholder:text-muted-foreground",
              "transition-colors",
              "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              formError &&
                "border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive/30",
            )}
          />
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-primary hover:text-primary"
            >
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Delete confirmation — names the lecture so there's no ambiguity about
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
      setDeleteError(e instanceof ApiError ? e.message : String(e));
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
          <DialogTitle>Delete Project</DialogTitle>
          <DialogDescription>
            {`Delete "${lecture.name}"? This can't be undone.`}
          </DialogDescription>
        </DialogHeader>
        {deleteError && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {deleteError}
          </div>
        )}
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
            className="text-primary hover:text-primary"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
