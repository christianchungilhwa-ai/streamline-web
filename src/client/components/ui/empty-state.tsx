import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** Centered empty / placeholder state. No dashed boxes. */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  size?: "page" | "inline";
  /** Render the title as the page's h1 (placeholder pages). */
  titleAs?: "h1" | "h2" | "h3";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  badge,
  size = "page",
  titleAs = "h2",
  className,
}: EmptyStateProps) {
  const Title = titleAs;
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center px-6 text-center",
        size === "page" ? "py-12 md:py-16" : "py-8",
        className,
      )}
    >
      {icon && size === "page" && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-6">
          {icon}
        </div>
      )}
      {badge && <Badge className="mb-2">{badge}</Badge>}
      <Title className={titleAs === "h1" ? "page-title" : "section-title"}>{title}</Title>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
