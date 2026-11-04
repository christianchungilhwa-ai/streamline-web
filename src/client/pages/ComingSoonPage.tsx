import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/PageHeader";
import { usePageTitle } from "@/lib/usePageTitle";

/**
 * Reusable placeholder for a sidebar destination whose backend isn't
 * built yet. Keeps the nav surface area honest: the tab exists and the
 * URL is reservable, but the page is upfront about being a stub.
 * Icon + "Coming soon" badge + title + one sentence + a way back.
 *
 * To swap in a real page later, just replace the route's `element` in
 * App.tsx — no AppShell change needed since the sidebar nav already
 * points to the same URL.
 */
export interface ComingSoonPageProps {
  title: string;
  description: string;
  /** Display icon — pass a JSX element (sized by the empty-state tile). */
  icon: React.ReactNode;
}

export function ComingSoonPage({ title, description, icon }: ComingSoonPageProps) {
  usePageTitle(title);
  return (
    <PageContainer>
      <EmptyState
        titleAs="h1"
        icon={icon}
        badge="Coming soon"
        title={title}
        description={description}
        action={
          <Button asChild variant="ghost">
            <Link to="/lectures">
              <ArrowLeft />
              Back to My Library
            </Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
