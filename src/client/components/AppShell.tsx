import { useEffect, useState } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { getSessionUser, type SessionUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";
import { NotebookText, Users, Sun, Moon, PanelLeft, Menu, X } from "lucide-react";
import { CommunityIcon, LibraryIcon } from "@/lib/icons";

/** Auth-gated layout. On mount, hits Claraity-web's /api/auth/user via the
 *  shared session cookie. Anonymous → redirect to claraity.app/login.
 *
 *  The sidebar is a 1:1 translation of Claraity-web's `.sidebar` CSS box
 *  model. On desktop it's a static, collapsible rail (220px → 56px). On
 *  mobile (<768px) it mirrors Claraity-web's mobile pattern: a 48px top bar
 *  with a hamburger + section title + logo, and the sidebar becomes a
 *  slide-in drawer over a dimmed backdrop.
 */
export function AppShell() {
  const location = useLocation();
  const [user, setUser] = useState<SessionUser | null | "loading">("loading");
  const { theme, toggle: toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Track the mobile breakpoint so the drawer always renders expanded on
  // phones (the desktop "collapsed" rail doesn't apply there).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Close the mobile drawer whenever the route changes (i.e. on nav tap).
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    let alive = true;
    getSessionUser()
      .then((u) => {
        if (!alive) return;
        if (!u) {
          const here = encodeURIComponent(window.location.href);
          window.location.href = `https://claraity.app/login?returnTo=${here}`;
          return;
        }
        setUser(u);
      })
      .catch(() => alive && setUser(null));
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
  if (!user) return null; // redirecting

  const onLibraryPath =
    location.pathname === "/lectures" || location.pathname === "/";
  const filterParam = new URLSearchParams(location.search).get("filter");
  const onLibrary = onLibraryPath && filterParam !== "shared";
  const onShared = onLibraryPath && filterParam === "shared";
  const onStudyguides = location.pathname === "/studyguides";
  const onCommunity = location.pathname === "/community";

  // The collapsed rail is a desktop affordance; on mobile the drawer is
  // always full-width/expanded.
  const effCollapsed = collapsed && !isMobile;
  const title = onShared
    ? "Shared with me"
    : onStudyguides
      ? "My Studyguides"
      : onCommunity
        ? "Community"
        : location.pathname.startsWith("/lectures/")
          ? "Lecture"
          : "My Library";

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Mobile top bar — hamburger + section title + logo (md:hidden). */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/85 px-3 backdrop-blur-xl md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="flex-1 truncate text-base font-semibold text-foreground">{title}</span>
        <img
          src="/Streamline_logo.png"
          alt="Streamline"
          className="h-[18px] w-auto select-none brightness-0 dark:brightness-100"
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

      {/* .sidebar — static/collapsible on desktop, slide-in drawer on mobile. */}
      <aside
        className={cn(
          "flex shrink-0 flex-col gap-1 border-r border-border bg-card/85 backdrop-blur-xl",
          // Mobile: fixed slide-in drawer (always 220px expanded).
          "fixed inset-y-0 left-0 z-50 w-[220px] px-3 py-4 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: in-flow, collapsible, no transform.
          "md:static md:z-auto md:translate-x-0 md:transition-[width,min-width]",
          collapsed
            ? "md:w-14 md:min-w-14 md:items-center md:px-1.5 md:py-4"
            : "md:w-[220px] md:min-w-[220px] md:px-3 md:py-4",
        )}
      >
        {/* .sidebar-header — logo + avatar (+ close button on mobile). */}
        <div
          className={cn(
            "flex items-center pb-5 pt-3",
            effCollapsed ? "justify-center px-0" : "justify-between px-2",
          )}
        >
          {!effCollapsed && (
            <Link
              to="/lectures"
              className="flex items-center overflow-hidden transition-opacity hover:opacity-80"
            >
              <img
                src="/Streamline_logo.png"
                alt="Streamline"
                className="h-[22px] w-auto select-none brightness-0 dark:brightness-100"
                draggable={false}
              />
            </Link>
          )}
          <div className="flex items-center gap-1.5">
            <Avatar user={user} size={26} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* .sidebar-nav — gap 2px, padding-top 100px. */}
        <nav className="flex flex-1 flex-col gap-0.5 pt-[100px]">
          <NavRow
            to="/lectures"
            icon={<LibraryIcon className="h-[18px] w-[18px]" />}
            label="My Library"
            active={onLibrary}
            collapsed={effCollapsed}
          />
          <NavRow
            to="/lectures?filter=shared"
            icon={<Users className="h-[18px] w-[18px]" />}
            label="Shared with me"
            active={onShared}
            collapsed={effCollapsed}
          />
          <NavRow
            to="/studyguides"
            icon={<NotebookText className="h-[18px] w-[18px]" />}
            label="My Studyguides"
            active={onStudyguides}
            collapsed={effCollapsed}
          />
          <NavRow
            to="/community"
            icon={<CommunityIcon className="h-[18px] w-[18px]" />}
            label="Community"
            active={onCommunity}
            collapsed={effCollapsed}
          />

          {/* Cross-app shortcuts — the rest of the CLARAiTY family (CLARAiTY
              + StreamlineVX + AudioFile; excludes Streamline itself). Pinned
              to the bottom of the nav (mt-auto) with a divider on top. Each
              row = ↗ arrow + the app's 16px icon; the light CLARAiTY /
              AudioFile icons get a hairline ring. Collapses to the icon. */}
          <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-2">
            <CrossAppShortcut href="https://claraity.app" label="CLARAiTY" icon="/claraity-icon.png" light collapsed={effCollapsed} />
            <CrossAppShortcut href="https://claraity.app/streamlinevx" label="StreamlineVX" icon="/vx-logo.png" collapsed={effCollapsed} />
            <CrossAppShortcut href="https://audiofile.claraity.app" label="AudioFile" icon="/audiofile-icon.png" light collapsed={effCollapsed} />
          </div>
        </nav>

        {/* .sidebar-footer — theme toggle + (desktop-only) collapse control. */}
        <div className="mt-2 flex w-full flex-col items-center border-t border-border p-2">
          {effCollapsed && (
            <CollapseButton
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              className="mb-2"
            />
          )}
          <div className="flex w-full items-center justify-between">
            {/* .theme-toggle — gap 6px, padding 6px 10px, radius-sm. */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className={cn(
                "flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                effCollapsed && "justify-center",
              )}
            >
              {theme === "dark" ? (
                <Sun className="h-[15px] w-[15px]" />
              ) : (
                <Moon className="h-[15px] w-[15px]" />
              )}
              {!effCollapsed && <span>{theme === "dark" ? "Light" : "Dark"}</span>}
            </button>

            {/* Collapse is a desktop-only affordance. */}
            {!effCollapsed && !isMobile && (
              <CollapseButton onClick={() => setCollapsed(true)} title="Collapse sidebar" />
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

/** .sidebar-collapse-btn — 28×28, radius 6px, plain panel glyph (matches
 *  Claraity exactly; same icon for expand + collapse). */
function CollapseButton({
  onClick,
  title,
  className,
}: {
  onClick: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  );
}

/** Circular avatar — real profile photo (matches Claraity) with a
 *  sky-tinted initial fallback. */
function Avatar({ user, size = 28 }: { user: SessionUser; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const initial = (user.firstName?.[0] || user.email?.[0] || "?").toUpperCase();
  const showImg = !!user.profilePicture && !imgError;

  if (showImg) {
    return (
      <img
        src={user.profilePicture!}
        alt={user.email}
        title={user.email}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="shrink-0 select-none rounded-full object-cover transition-[opacity,transform] hover:scale-105 hover:opacity-85"
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }

  return (
    <div
      className="flex shrink-0 select-none items-center justify-center rounded-full bg-primary/20 font-semibold text-primary transition-[opacity,transform] hover:scale-105 hover:opacity-85"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      title={user.email}
      aria-label={user.email}
    >
      {initial}
    </div>
  );
}

/** Cross-app shortcut row — a ↗ arrow + the target app's icon, styled like
 *  an idle NavRow. External link to a sibling CLARAiTY-family app. Light
 *  icons (CLARAiTY / AudioFile) get a hairline ring so their edge reads on
 *  the light sidebar; collapses to the app icon only. */
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
    <a
      href={href}
      title={label}
      className={cn(
        "flex items-center gap-2.5 rounded-md text-sm font-medium transition-all",
        collapsed ? "justify-center p-2.5" : "px-3 py-1",
        "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {!collapsed && (
        <span className="flex w-6 shrink-0 items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[15px] w-[15px]"
          >
            <line x1="6" y1="19" x2="19" y2="6" />
            <polyline points="9 6 19 6 19 16" />
          </svg>
        </span>
      )}
      {/* App icon — always shown; in the collapsed rail it's the only mark
          (centered), which is how you tell the shortcuts apart. */}
      <img
        src={icon}
        alt={label}
        className={cn(
          "h-4 w-4 shrink-0 rounded-[4px]",
          light && "shadow-[0_0_0_0.5px_rgba(0,0,0,0.12)]",
        )}
        draggable={false}
      />
    </a>
  );
}

/** .nav-item — gap 10px, padding 10px 12px, radius-md, font 14/500,
 *  hover scale 1.02, active = accent text + 600 + tinted bg. Collapsed
 *  → centered icon-only with 10px padding + label tooltip. */
function NavRow({
  to,
  icon,
  label,
  active,
  collapsed,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md text-sm font-medium transition-all",
        collapsed ? "justify-center p-2.5" : "px-3 py-2.5",
        active
          ? "bg-primary/15 font-semibold text-primary"
          : "text-muted-foreground hover:scale-[1.02] hover:bg-accent hover:text-foreground",
      )}
    >
      {/* .nav-icon — width 24px, centered. */}
      <span className="flex w-6 shrink-0 items-center justify-center">
        {icon}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
