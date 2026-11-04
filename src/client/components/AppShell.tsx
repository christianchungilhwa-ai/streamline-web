import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  ChevronsUpDown,
  ExternalLink,
  Menu,
  Moon,
  NotebookText,
  PanelLeft,
  Sun,
  Users,
  X,
} from "lucide-react";
import { getSessionUser, type SessionUser } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/lib/useTheme";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { PageTitleContext } from "@/lib/usePageTitle";
import { CommunityIcon, LibraryIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tip, TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** sessionStorage key for the user's explicit collapse choice. */
const COLLAPSE_KEY = "streamline-sidebar-collapsed";

function readCollapsedPref(): boolean | null {
  try {
    const v = window.sessionStorage.getItem(COLLAPSE_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

/** Auth-gated layout. On mount, hits Claraity-web's /api/auth/user via the
 *  shared session cookie. Anonymous → redirect to claraity.app/login.
 *
 *  Desktop (≥768px): a static sidebar rail, expanded (220px) or collapsed
 *  (56px). Below 1280px it starts collapsed; an explicit collapse/expand
 *  choice wins for the rest of the session.
 *
 *  Mobile (<768px): a 48px top bar (menu button + page title + logo) and the
 *  sidebar becomes a slide-in drawer over a dimmed backdrop, always expanded.
 *
 *  Pages report their title through PageTitleContext (usePageTitle) so the
 *  mobile top bar can show e.g. the lecture name on the viewer.
 */
export function AppShell() {
  const location = useLocation();
  const [user, setUser] = useState<SessionUser | null | "loading" | "error">("loading");
  const [authError, setAuthError] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isNarrow = useMediaQuery("(max-width: 1279px)");
  const [collapsedPref, setCollapsedPrefState] = useState<boolean | null>(readCollapsedPref);

  const setCollapsedPref = useCallback((v: boolean) => {
    setCollapsedPrefState(v);
    try {
      window.sessionStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {
      // Storage can be blocked; the in-memory choice still holds.
    }
  }, []);

  // Close the mobile drawer whenever the route changes (i.e. on nav tap).
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  // Escape closes the open drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  useEffect(() => {
    let alive = true;
    getSessionUser()
      .then((u) => {
        if (!alive) return;
        if (!u) {
          const here = encodeURIComponent(window.location.href);
          // Stay on "Loading…" while the browser navigates away.
          window.location.href = `https://claraity.app/login?returnTo=${here}`;
          return;
        }
        setUser(u);
      })
      .catch((e) => {
        if (!alive) return;
        setAuthError(friendlyError(e));
        setUser("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (user === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (user === "error") {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <EmptyState
          icon={<AlertCircle />}
          title="Couldn't load your account"
          description={authError ?? undefined}
          action={<Button onClick={() => window.location.reload()}>Reload</Button>}
        />
      </div>
    );
  }
  if (!user) return null; // redirecting to claraity.app/login

  const { pathname } = location;
  const onLibraryPath =
    pathname === "/" || pathname === "/lectures" || pathname.startsWith("/lectures/");
  const onViewer = pathname.startsWith("/lectures/");
  const filterParam = new URLSearchParams(location.search).get("filter");
  // A lecture opened from My study guides keeps that section highlighted.
  const fromStudyguides =
    onViewer && (location.state as { from?: string } | null)?.from === "studyguides";
  const onLibrary = onLibraryPath && filterParam !== "shared" && !fromStudyguides;
  const onShared = onLibraryPath && filterParam === "shared";
  const onStudyguides = pathname === "/studyguides" || fromStudyguides;
  const onCommunity = pathname === "/community";

  // The collapsed rail is a desktop affordance; the mobile drawer is always
  // expanded. Below 1280px the rail starts collapsed unless the user chose.
  const effCollapsed = !isMobile && (collapsedPref ?? isNarrow);

  const routeTitle = onShared
    ? "Shared with me"
    : pathname === "/studyguides"
      ? "My study guides"
      : onCommunity
        ? "Community"
        : onViewer
          ? "Project"
          : "My Library";
  const topBarTitle = pageTitle ?? routeTitle;

  const iconClass = "size-4.5";

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col md:flex-row">
        {/* Mobile top bar — menu button + page title + logo (md:hidden). */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/85 px-2 backdrop-blur-xl md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="[&_svg]:size-5"
          >
            <Menu />
          </Button>
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
            {topBarTitle}
          </span>
          <img
            src="/Streamline_logo.png"
            alt="Streamline"
            className="mr-1 h-[18px] w-auto shrink-0 select-none brightness-0 dark:brightness-100"
            draggable={false}
          />
        </header>

        {/* Backdrop behind the open mobile drawer. */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}

        {/* Sidebar — static/collapsible on desktop, slide-in drawer on mobile. */}
        <aside
          aria-label="Sidebar"
          inert={isMobile && !mobileOpen}
          className={cn(
            "flex shrink-0 flex-col border-r border-border bg-card/85 backdrop-blur-xl",
            // Mobile: fixed slide-in drawer (always 220px expanded).
            "fixed inset-y-0 left-0 z-50 w-[220px] px-3 py-4 transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
            // Desktop: in-flow, collapsible, no transform.
            "md:static md:z-auto md:translate-x-0 md:transition-[width,min-width]",
            effCollapsed
              ? "md:w-14 md:min-w-14 md:items-center md:px-2"
              : "md:w-[220px] md:min-w-[220px] md:px-3",
          )}
        >
          {/* Header row — logo + collapse (desktop) / close (mobile).
              Collapsed: the expand button alone, centered. */}
          <div
            className={cn(
              "flex w-full items-center pb-4 pt-3",
              effCollapsed ? "justify-center" : "justify-between pl-2",
            )}
          >
            {!effCollapsed && (
              <Link
                to="/lectures"
                className="flex items-center overflow-hidden rounded-md transition-opacity hover:opacity-80"
              >
                <img
                  src="/Streamline_logo.png"
                  alt="Streamline"
                  className="h-[22px] w-auto select-none brightness-0 dark:brightness-100"
                  draggable={false}
                />
              </Link>
            )}
            {isMobile ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="text-muted-foreground"
              >
                <X />
              </Button>
            ) : (
              <Tip
                side={effCollapsed ? "right" : "bottom"}
                label={effCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setCollapsedPref(!effCollapsed)}
                  aria-label={effCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  className="text-muted-foreground"
                >
                  <PanelLeft />
                </Button>
              </Tip>
            )}
          </div>

          <nav aria-label="Main" className="flex w-full flex-col gap-0.5 pt-2">
            <NavRow
              to="/lectures"
              icon={<LibraryIcon className={iconClass} />}
              label="My Library"
              active={onLibrary}
              collapsed={effCollapsed}
            />
            <NavRow
              to="/lectures?filter=shared"
              icon={<Users className={iconClass} />}
              label="Shared with me"
              active={onShared}
              collapsed={effCollapsed}
            />
            <NavRow
              to="/studyguides"
              icon={<NotebookText className={iconClass} />}
              label="My study guides"
              active={onStudyguides}
              collapsed={effCollapsed}
            />
            <NavRow
              to="/community"
              icon={<CommunityIcon className={iconClass} />}
              label="Community"
              active={onCommunity}
              collapsed={effCollapsed}
            />
          </nav>

          <div className="flex-1" />

          {/* Cross-app shortcuts — the rest of the CLARAiTY family (excludes
              Streamline itself). Same-tab navigation. */}
          <div className="flex w-full flex-col gap-0.5 pb-2">
            {!effCollapsed && <div className="eyebrow px-2.5 pb-1">CLARAiTY apps</div>}
            <CrossAppShortcut
              href="https://claraity.app"
              label="CLARAiTY"
              icon="/claraity-icon.png"
              light
              collapsed={effCollapsed}
            />
            <CrossAppShortcut
              href="https://claraity.app/streamlinevx"
              label="StreamlineVX"
              icon="/vx-logo.png"
              collapsed={effCollapsed}
            />
            <CrossAppShortcut
              href="https://audiofile.claraity.app"
              label="AudioFile"
              icon="/audiofile-icon.png"
              light
              collapsed={effCollapsed}
            />
          </div>

          <AccountMenu user={user} collapsed={effCollapsed} theme={theme} onThemeChange={setTheme} />
        </aside>

        <main className="min-w-0 flex-1 overflow-auto">
          <PageTitleContext.Provider value={setPageTitle}>
            <Outlet />
          </PageTitleContext.Provider>
        </main>
      </div>
    </TooltipProvider>
  );
}

function displayName(user: SessionUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
}

/** Account row at the foot of the sidebar: avatar + name + email, opening a
 *  menu with the account details, the Appearance (theme) choice and a link
 *  back to CLARAiTY. Collapsed rail → avatar-only button with a tooltip. */
function AccountMenu({
  user,
  collapsed,
  theme,
  onThemeChange,
}: {
  user: SessionUser;
  collapsed: boolean;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}) {
  const name = displayName(user);
  const showEmailLine = name !== user.email;
  const ringClass =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div className={cn("flex w-full border-t border-border pt-2", collapsed && "justify-center")}>
      <DropdownMenu>
        <Tip side="right" label="Account" disabled={!collapsed}>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <button
                type="button"
                aria-label="Account"
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-accent data-[state=open]:bg-accent",
                  ringClass,
                )}
              >
                <Avatar user={user} size={28} />
              </button>
            ) : (
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent data-[state=open]:bg-accent",
                  ringClass,
                )}
              >
                <Avatar user={user} size={28} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{name}</span>
                  {showEmailLine && (
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  )}
                </span>
                <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </button>
            )}
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent
          side={collapsed ? "right" : "top"}
          align={collapsed ? "end" : "start"}
          className="min-w-56"
        >
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            {showEmailLine && <span className="truncate">{user.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(v) => onThemeChange(v === "dark" ? "dark" : "light")}
          >
            <DropdownMenuRadioItem value="light">
              <Sun />
              Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon />
              Dark
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="https://claraity.app">
              <ExternalLink />
              Open CLARAiTY
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Circular avatar — real profile photo (matches Claraity) with a tinted
 *  initial fallback. Decorative: the name is always shown or labelled next
 *  to it. */
function Avatar({ user, size = 28 }: { user: SessionUser; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const initial = (user.firstName?.[0] || user.email?.[0] || "?").toUpperCase();
  const showImg = !!user.profilePicture && !imgError;

  if (showImg) {
    return (
      <img
        src={user.profilePicture!}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="shrink-0 select-none rounded-full object-cover"
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center rounded-full bg-primary/15 font-semibold text-brand-text"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initial}
    </span>
  );
}

const rowBase =
  "flex items-center rounded-lg text-sm font-medium transition-colors";
const rowExpanded = "h-9 w-full gap-2.5 px-2.5";
const rowCollapsed = "size-10 justify-center px-0";
const rowIdle = "text-muted-foreground hover:bg-accent hover:text-foreground";

/** Sidebar nav row. Active = tinted fill + brand text + 600. Collapsed →
 *  centered icon-only square with a right-side tooltip. */
function NavRow({
  to,
  icon,
  label,
  active,
  collapsed,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Tip side="right" label={label} disabled={!collapsed}>
      <Link
        to={to}
        aria-label={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          rowBase,
          collapsed ? rowCollapsed : rowExpanded,
          active ? "bg-primary/12 font-semibold text-brand-text" : rowIdle,
        )}
      >
        <span className="flex w-6 shrink-0 items-center justify-center">{icon}</span>
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    </Tip>
  );
}

/** Cross-app shortcut — app icon + name + trailing ↗, styled like an idle
 *  NavRow. Light icons (CLARAiTY / AudioFile) get a hairline ring so their
 *  edge reads on the light sidebar. Collapsed → icon only, with a tooltip. */
function CrossAppShortcut({
  href,
  label,
  icon,
  light = false,
  collapsed,
}: {
  href: string;
  label: string;
  icon: string;
  light?: boolean;
  collapsed: boolean;
}) {
  return (
    <Tip side="right" label={label} disabled={!collapsed}>
      <a
        href={href}
        aria-label={collapsed ? label : undefined}
        className={cn(rowBase, collapsed ? rowCollapsed : rowExpanded, rowIdle)}
      >
        <span className="flex w-6 shrink-0 items-center justify-center">
          <img
            src={icon}
            alt=""
            className={cn(
              "size-4 shrink-0 rounded-sm",
              light && "shadow-[0_0_0_0.5px_rgba(0,0,0,0.12)]",
            )}
            draggable={false}
          />
        </span>
        {!collapsed && (
          <>
            <span className="truncate">{label}</span>
            <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-muted-foreground/60" />
          </>
        )}
      </a>
    </Tip>
  );
}
