import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

/** Mount once at the app root (AppShell). */
export const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={200}>
    {children}
  </TooltipPrimitive.Provider>
);

/**
 * `<Tip label="Collapse sidebar"><Button …/></Tip>` — a styled tooltip for
 * icon-only controls and the collapsed sidebar (replaces native `title`).
 * The child must accept a ref (Button, a, button…).
 */
export function Tip({
  label,
  side = "top",
  children,
  disabled,
}: {
  label: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactElement;
  disabled?: boolean;
}) {
  if (disabled) return children;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 max-w-64 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-raised",
            "select-none",
          )}
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
