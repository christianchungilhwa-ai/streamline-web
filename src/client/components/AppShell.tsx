import { useEffect, useState } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { getSessionUser, type SessionUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";
import { BookOpen, NotebookText, Users, Sun, Moon, PanelLeft } from "lucide-react";
import { CommunityIcon } from "@/lib/icons";

/** Auth-gated layout. On mount, hits Claraity-web's /api/auth/user via the
 *  shared session cookie. Anonymous → redirect to claraity.app/login.
 *
 *  The sidebar is a 1:1 translation of Claraity-web's `.sidebar` CSS box
 *  model (padding 16/12, 4px child gap, 220px → 56px collapsed, header
 *  padding 12/8/20, nav gap 2px + 100px top, nav-item padding 10/12 with
 *  hover scale, footer column with theme-toggle + collapse-btn). Values
 *  are taken verbatim from Claraity's index.css so the two apps match.
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
      {/* .sidebar — padding 16px 12px, gap 4px, 220px (56px collapsed). */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col gap-1 md:flex",
          "border-r border-border bg-card/85 backdrop-blur-xl",
          "transition-[width,min-width] duration-200",
          collapsed
            ? "w-14 min-w-14 items-center px-1.5 py-4"
            : "w-[220px] min-w-[220px] px-3 py-4",
        )}
      >
        {/* .sidebar-header — padding 12px 8px 20px, space-between. */}
        <div
          className={cn(
            "flex items-center pb-5 pt-3",
            collapsed ? "justify-center px-0" : "justify-between px-2",
          )}
        >
          {!collapsed && (
            <Link
              to="/lectures"
              className="flex items-center overflow-hidden transition-opacity hover:opacity-80"
            >
              {/* .sidebar-logo img — height 25px. */}
              <img
                src="/Streamline_logo.png"
                alt="Streamline"
                className="h-[25px] w-auto select-none brightness-0 dark:brightness-100"
                draggable={false}
              />
            </Link>
          )}
          <Avatar user={user} size={collapsed ? 24 : 28} />
        </div>

        {/* .sidebar-nav — gap 2px, padding-top 100px. */}
        <nav className="flex flex-1 flex-col gap-0.5 pt-[100px]">
          <NavRow
            to="/lectures"
            icon={<BookOpen className="h-[18px] w-[18px]" />}
            label="My Library"
            active={onLibrary}
            collapsed={collapsed}
          />
          <NavRow
            to="/lectures?filter=shared"
            icon={<Users className="h-[18px] w-[18px]" />}
            label="Shared with me"
            active={onShared}
            collapsed={collapsed}
          />
          <NavRow
            to="/studyguides"
            icon={<NotebookText className="h-[18px] w-[18px]" />}
            label="My Studyguides"
            active={onStudyguides}
            collapsed={collapsed}
          />
          <NavRow
            to="/community"
            icon={<CommunityIcon className="h-[18px] w-[18px]" />}
            label="Community"
            active={onCommunity}
            collapsed={collapsed}
          />
        </nav>

        {/* .sidebar-footer — column, padding 8px, margin-top 8px, border-top. */}
        <div className="mt-2 flex w-full flex-col items-center border-t border-border p-2">
          {collapsed && (
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
                collapsed && "justify-center",
              )}
            >
              {theme === "dark" ? (
                <Sun className="h-[15px] w-[15px]" />
              ) : (
                <Moon className="h-[15px] w-[15px]" />
              )}
              {!collapsed && <span>{theme === "dark" ? "Light" : "Dark"}</span>}
            </button>

            {!collapsed && (
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
