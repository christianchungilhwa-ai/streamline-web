import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Small status/label pill. Color only where a state needs attention. */
export const badgeVariants = cva(
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-medium leading-none [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-foreground/[0.06] text-muted-foreground",
        info: "bg-primary/15 text-brand-text",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-destructive/12 text-destructive-text",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, tone, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "span";
  return <Comp ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />;
});
Badge.displayName = "Badge";
