import * as React from "react";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";

/**
 * On/off control ("Follow video", "Annotations"). The label never changes
 * with state; the pressed state shows as a brand tint (aria-pressed), so
 * it reads at a glance in both themes.
 */
export interface ToggleProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  label: string;
  icon?: React.ReactNode;
  iconOnly?: boolean;
  size?: "sm" | "xs";
  tooltip?: string;
  className?: string;
  /** Extra classes for the visible label (e.g. "max-lg:sr-only"). */
  labelClassName?: string;
}

export function Toggle({
  pressed,
  onPressedChange,
  label,
  icon,
  iconOnly,
  size = "sm",
  tooltip,
  className,
  labelClassName,
}: ToggleProps) {
  const button = (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={iconOnly ? label : undefined}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "aria-pressed:bg-primary/15 aria-pressed:text-brand-text aria-pressed:hover:bg-primary/20",
        "[&_svg]:shrink-0",
        size === "sm" ? "h-8 px-3 text-sm [&_svg]:size-4" : "h-6 px-2 text-xs [&_svg]:size-3.5",
        iconOnly && (size === "sm" ? "w-8 px-0" : "w-6 px-0"),
        className,
      )}
    >
      {icon}
      {!iconOnly && <span className={labelClassName}>{label}</span>}
    </button>
  );
  const tip = tooltip ?? (iconOnly ? label : undefined);
  return tip ? <Tip label={tip}>{button}</Tip> : button;
}
