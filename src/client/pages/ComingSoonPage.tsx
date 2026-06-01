import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

/**
 * Reusable placeholder for a sidebar destination whose backend isn't
 * built yet. Keeps the nav surface area honest: the tab exists and
 * the URL is reservable, but the page is upfront about being a
 * stub. Title + icon + one descriptive sentence + a Back-to-Library
 * button.
 *
 * To swap in a real page later, just replace the route's `element`
 * in App.tsx — no AppShell change needed since the sidebar nav
 * already points to the same URL.
 */
export interface ComingSoonPageProps {
  title: string;
  description: string;
  /** Display icon — pass a JSX element so the caller controls size/stroke. */
  icon: React.ReactNode;
}

export function ComingSoonPage({ title, description, icon }: ComingSoonPageProps) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 md:py-24">
      <div className="flex flex-col items-center text-center">
        <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </span>
        <h1 className="page-title">{title}</h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Coming soon
        </p>
        <Link to="/lectures" className="mt-8">
          <Button variant="ghost" className="text-primary hover:text-primary">
            <ArrowLeft />
            Back to My Library
          </Button>
        </Link>
      </div>
    </div>
  );
}
