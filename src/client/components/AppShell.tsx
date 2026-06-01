import { useEffect, useState } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { getSessionUser, type SessionUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";
import {
  BookOpen,
  NotebookText,
  Users,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { CommunityIcon } from "@/lib/icons";

/** Auth-gated layout. On mount, hits Claraity-web's /api/auth/user via the
 *  shared session cookie. Anonymous → redirect to claraity.app/login with
 *  ?returnTo back to wherever they were headed. Authed → render the
 *  sidebar + the matched route via <Outlet>.
 *
 *  Sidebar layout mirrors Claraity-web's:
 *   - Header: STREAMLINE wordmark (left) + user avatar (right)
 *   - Breathing room, then the nav rows
 *   - Footer: theme toggle + show/hide-sidebar (collapse) toggle, side
 *     by side. No account/email row.
 *
 *  Collapse shrinks the sidebar to an icon rail (desktop only; on mobile
 *  the whole sidebar is hidden under `md`).
 */
export function AppShell() {
  const location = useLocation();
  const [user, setUser] = useState<SessionUser | null | "loading">("loading");
  const { theme, toggle: toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

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

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          "hidden shrink-0 flex-col md:flex",
          "border-r border-border bg-card/85 backdrop-blur-xl",
          "transition-[width] duration-200",
          collapsed ? "w-[68px]" : "w-[220px]",
        )}
      >
        {/* Header — wordmark + avatar. When collapsed, just the avatar,
            centered. */}
        <div
          className={cn(
            "flex h-14 items-center px-3",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          {!collapsed && (
            <Link
              to="/lectures"
              className="flex items-center transition-opacity hover:opacity-80"
            >
              <img
                src="/Streamline_logo.png"
                alt="Streamline"
                className="h-5 w-auto select-none brightness-0 dark:brightness-100"
                draggable={false}
              />
            </Link>
          )}
          <Avatar user={user} />
        </div>

        {/* Breathing room between the header and the first nav row. */}
        <div className="h-3" />

        <nav className="flex-1 space-y-1 px-2">
          <NavRow
            to="/lectures"
            icon={<BookOpen className="h-4 w-4" />}
            label="My Library"
            active={onLibrary}
            collapsed={collapsed}
          />
          <NavRow
            to="/lectures?filter=shared"
            icon={<Users className="h-4 w-4" />}
            label="Shared with me"
            active={onShared}
            collapsed={collapsed}
          />
          <NavRow
            to="/studyguides"
            icon={<NotebookText className="h-4 w-4" />}
            label="My Studyguides"
            active={onStudyguides}
            collapsed={collapsed}
          />
          <NavRow
            to="/community"
            icon={<CommunityIcon className="h-4 w-4" />}
            label="Community"
            active={onCommunity}
            collapsed={collapsed}
          />
        </nav>

        {/* Footer — theme toggle + collapse toggle. */}
        <div className="border-t border-border p-2">
          <div
            className={cn(
              "flex items-center gap-1",
              collapsed ? "flex-col" : "justify-between",
            )}
          >
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className={cn(
                "flex h-9 items-center gap-2 rounded-lg text-sm font-medium transition-colors",
                "text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed ? "w-9 justify-center" : "px-3",
              )}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {!collapsed && <span>{theme === "dark" ? "Light" : "Dark"}</span>}
            </button>

            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

/** Circular initials avatar. Sky-tinted (brand) with the user's first
 *  initial — fallback when there's no profile picture (SessionUser
 *  doesn't carry one today). */
function Avatar({ user, size = 28 }: { user: SessionUser; size?: number }) {
  const initial = (user.firstName?.[0] || user.email?.[0] || "?").toUpperCase();
  return (
    <div
      className="flex shrink-0 select-none items-center justify-center rounded-full bg-primary/20 font-semibold text-primary"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      title={user.email}
      aria-label={user.email}
    >
      {initial}
    </div>
  );
}

/** A single sidebar nav row. Idle / hover / active states. When the
 *  sidebar is collapsed, renders icon-only (centered) with the label as
 *  a native tooltip. */
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
        "flex h-9 items-center rounded-lg text-sm font-medium transition-colors",
        collapsed ? "w-9 justify-center" : "gap-3 px-3",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
