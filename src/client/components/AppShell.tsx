import { useEffect, useState } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { getSessionUser, type SessionUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Plus, BookOpen } from "lucide-react";

/** Auth-gated layout. On mount, hits Claraity-web's /api/auth/user via the
 *  shared session cookie. Anonymous → redirect to claraity.app/login with
 *  ?returnTo back to wherever they were headed. Authed → render the
 *  sidebar + the matched route via <Outlet>.
 *
 *  Styling mirrors Claraity-web's `.sidebar` vocabulary: 220px wide,
 *  backdrop-blur surface, soft-tinted active nav rows. Brand accent is
 *  sky-blue (`--primary`).
 */
export function AppShell() {
  const location = useLocation();
  const [user, setUser] = useState<SessionUser | null | "loading">("loading");

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

  const onLibrary =
    location.pathname === "/lectures" || location.pathname === "/";
  const onNew = location.pathname === "/lectures/new";

  return (
    <div className="flex h-full">
      {/* Sidebar — mirrors Claraity-web .sidebar: 220px, backdrop-blur,
          translucent card surface. Hidden under md (mobile), shown md+. */}
      <aside
        className={cn(
          "hidden w-[220px] shrink-0 flex-col md:flex",
          "border-r border-border",
          "bg-card/85 backdrop-blur-xl",
        )}
      >
        {/* Brand mark — STREAMLINE wordmark image. Lives in public/
            so Vite copies it verbatim to dist/. Thin white outline on
            transparent, so it sits cleanly on the sidebar's
            backdrop-blur surface in dark mode. */}
        <Link
          to="/lectures"
          className="flex h-14 items-center px-4 transition-opacity hover:opacity-80"
        >
          <img
            src="/Streamline_logo.png"
            alt="Streamline"
            className="h-5 w-auto select-none"
            draggable={false}
          />
        </Link>

        {/* Nav rows — hand-rolled to match Claraity's `.nav-item`:
            soft hover, accent-tinted active row, brand-colored text/icon
            when active. */}
        <nav className="flex-1 space-y-1 px-2 py-2">
          <NavRow to="/lectures" icon={<BookOpen className="h-4 w-4" />} active={onLibrary}>
            Library
          </NavRow>
          <NavRow to="/lectures/new" icon={<Plus className="h-4 w-4" />} active={onNew}>
            New lecture
          </NavRow>
        </nav>

        {/* User footer — divider + email. Matches Claraity sidebar's
            bottom block. */}
        <div className="border-t border-border px-3 py-3">
          <div className="truncate text-xs text-muted-foreground">
            {user.email}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

/** A single sidebar nav row. Three visual states: idle, hover, active.
 *  Active = sky-blue tinted background + brand-colored text/icon. */
function NavRow({
  to,
  icon,
  active,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </Link>
  );
}
