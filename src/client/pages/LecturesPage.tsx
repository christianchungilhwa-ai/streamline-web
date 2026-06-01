import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listLectures, type Lecture } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";

/** Lectures library — the landing page.
 *
 *  Layout:
 *  - Header: page title + "New Project" button (top-right) that
 *    opens NewProjectDialog
 *  - Toolbar: NotebookLM-style row — filter chips (All / My Projects
 *    / Shared with me) on the left, search-icon + view toggle + sort
 *    dropdown on the right
 *  - Body: card grid or list, depending on the view toggle
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
          <p className="page-subtitle">
            Upload a PDF + recording and Streamline aligns the slides to the
            transcript.
          </p>
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

      {displayed === null && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading lectures…
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
            <h2 className="mt-4 text-lg font-medium">No lectures yet</h2>
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
            No lectures match your search.
          </div>
        )
      )}

      {displayed && displayed.length > 0 && (
        view === "grid" ? (
          <LectureGrid lectures={displayed} />
        ) : (
          <LectureList lectures={displayed} />
        )
      )}

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
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

function LectureGrid({ lectures }: { lectures: Lecture[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {lectures.map((l) => (
        <li key={l.id}>
          <LectureCard lecture={l} />
        </li>
      ))}
    </ul>
  );
}

function LectureList({ lectures }: { lectures: Lecture[] }) {
  return (
    <ul className="space-y-2">
      {lectures.map((l) => (
        <li key={l.id}>
          <Link
            to={`/lectures/${l.id}`}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent"
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
        </li>
      ))}
    </ul>
  );
}

function LectureCard({ lecture }: { lecture: Lecture }) {
  return (
    <Link
      to={`/lectures/${lecture.id}`}
      className="group flex h-[240px] flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
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
        <div className="mt-auto pt-2 text-xs text-muted-foreground">
          {new Date(lecture.createdAt).toLocaleDateString()}
        </div>
      </div>
    </Link>
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
