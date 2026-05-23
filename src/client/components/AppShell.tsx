import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { getSessionUser, type SessionUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus, BookOpen } from "lucide-react";

/** Auth-gated layout. On mount, hits Claraity-web's /api/auth/user via the
 *  shared session cookie. Anonymous → redirect to claraity.app/login with
 *  ?returnTo back to wherever they were headed. Authed → render the
 *  sidebar + the matched route via <Outlet>. */
export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<SessionUser | null | "loading">("loading");

  useEffect(() => {
    let alive = true;
    getSessionUser()
      .then((u) => {
        if (!alive) return;
        if (!u) {
          // Bounce to the canonical Claraity login. After login, Claraity
          // sets the .claraity.app session cookie which is then visible
          // here on the next visit.
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

  const onLibrary = location.pathname === "/lectures" || location.pathname === "/";

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Sparkles className="h-5 w-5" />
          <span className="font-semibold tracking-tight">Streamline</span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          <Link to="/lectures">
            <Button
              variant={onLibrary ? "secondary" : "ghost"}
              className="w-full justify-start"
            >
              <BookOpen />
              Library
            </Button>
          </Link>
          <Link to="/lectures/new">
            <Button
              variant={location.pathname === "/lectures/new" ? "secondary" : "ghost"}
              className="w-full justify-start"
            >
              <Plus />
              New lecture
            </Button>
          </Link>
        </nav>
        <div className="border-t p-3 text-xs text-muted-foreground">
          <div>{user.email}</div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
