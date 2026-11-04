import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

/** Determinate progress bar; `value` is 0–100. */
export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <ProgressPrimitive.Root
      value={v}
      aria-label={label}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-foreground/10", className)}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-primary transition-[width] duration-300"
        style={{ width: `${v}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
