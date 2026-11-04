import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Inline message box for errors, warnings and notes. */
export interface CalloutProps {
  tone?: "danger" | "warning" | "info";
  icon?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
  children?: React.ReactNode;
}

const toneClass = {
  danger: "border-destructive/30 bg-destructive/10 text-destructive-text",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-primary/25 bg-primary/10 text-foreground",
};

export function Callout({ tone = "danger", icon, title, action, onDismiss, className, children }: CalloutProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
        toneClass[tone],
        className,
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cn(title && "mt-0.5 text-xs opacity-85")}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="icon-xs" className="-mr-1 -mt-0.5 ml-auto shrink-0 text-current" aria-label="Dismiss" onClick={onDismiss}>
          <X />
        </Button>
      )}
    </div>
  );
}
