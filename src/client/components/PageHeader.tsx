import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Standard page gutter + max width for list pages. */
export function PageContainer({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 py-5 md:px-10 md:py-10", className)}>{children}</div>;
}

/**
 * Page title row + optional description, actions and toolbar (children).
 * On phones the AppShell top bar already shows the title, so the h1 is
 * visually hidden there (kept for screen readers) and the actions move
 * into the page's toolbar.
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 space-y-4">
      <div className="flex items-start justify-between gap-4 max-md:sr-only">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
