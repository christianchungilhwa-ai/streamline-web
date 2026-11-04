import * as React from "react";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";

/**
 * Segmented control — pick ONE of N (Slides | Study guide, grid | list,
 * library filters, Original | Annotated). A radiogroup: arrow keys move
 * the selection, only the selected segment is in the tab order.
 *
 *   <Segmented value={v} onValueChange={setV} aria-label="View">
 *     <SegmentedItem value="slides" icon={<LayoutList />} label="Slides" />
 *     <SegmentedItem value="guide" icon={<FileText />} label="Study guide" />
 *   </Segmented>
 */

type Variant = "default" | "chips" | "overlay";
type Size = "md" | "sm" | "xs";

interface Ctx {
  value: string;
  onValueChange: (v: string) => void;
  variant: Variant;
  size: Size;
  register: (v: string) => void;
  values: React.MutableRefObject<string[]>;
}
const SegmentedContext = React.createContext<Ctx | null>(null);

const rootClass: Record<Variant, string> = {
  default: "rounded-full border border-border bg-muted p-0.5 gap-0.5",
  chips: "gap-1",
  overlay: "rounded-full border border-white/10 bg-black/55 p-0.5 gap-0.5 backdrop-blur",
};
const rootSize: Record<Size, string> = { md: "h-9", sm: "h-8", xs: "h-7" };

const itemClass: Record<Variant, string> = {
  default:
    "rounded-full text-muted-foreground hover:text-foreground aria-checked:bg-segment-thumb aria-checked:text-foreground aria-checked:shadow-sm",
  chips:
    "flex-none rounded-full text-muted-foreground hover:bg-accent hover:text-foreground aria-checked:bg-foreground/[0.08] aria-checked:text-foreground",
  overlay:
    "rounded-full text-white/75 hover:text-white aria-checked:bg-white/90 aria-checked:text-black",
};
const itemSize: Record<Size, string> = {
  md: "h-8 px-3 text-sm [&_svg]:size-4",
  sm: "h-7 px-2.5 text-[13px] [&_svg]:size-4",
  xs: "h-6 px-2 text-xs [&_svg]:size-3.5",
};
const iconOnlySize: Record<Size, string> = { md: "w-8 px-0", sm: "w-7 px-0", xs: "w-6 px-0" };

export interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
  "aria-label": string;
}

export function Segmented<T extends string>({
  value,
  onValueChange,
  variant = "default",
  size = "md",
  className,
  children,
  ...aria
}: SegmentedProps<T>) {
  const values = React.useRef<string[]>([]);
  values.current = [];
  const ctx: Ctx = {
    value,
    onValueChange: onValueChange as (v: string) => void,
    variant,
    size,
    register: (v) => {
      if (!values.current.includes(v)) values.current.push(v);
    },
    values,
  };
  return (
    <SegmentedContext.Provider value={ctx}>
      <div
        role="radiogroup"
        aria-label={aria["aria-label"]}
        className={cn("inline-flex items-center", rootClass[variant], variant !== "chips" && rootSize[size], className)}
      >
        {children}
      </div>
    </SegmentedContext.Provider>
  );
}

export interface SegmentedItemProps {
  value: string;
  label: string;
  icon?: React.ReactNode;
  /** Show only the icon (label becomes the accessible name + tooltip). */
  iconOnly?: boolean;
  tooltip?: string;
  className?: string;
}

export function SegmentedItem({ value, label, icon, iconOnly, tooltip, className }: SegmentedItemProps) {
  const ctx = React.useContext(SegmentedContext);
  if (!ctx) throw new Error("SegmentedItem must be inside <Segmented>");
  ctx.register(value);
  const checked = ctx.value === value;

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const vals = ctx.values.current;
    const i = vals.indexOf(value);
    const next = vals[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : vals.length - 1)) % vals.length];
    ctx.onValueChange(next);
    const group = e.currentTarget.parentElement;
    requestAnimationFrame(() => {
      group?.querySelector<HTMLButtonElement>(`[data-segment-value="${CSS.escape(next)}"]`)?.focus();
    });
  };

  const button = (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={iconOnly ? label : undefined}
      tabIndex={checked ? 0 : -1}
      data-segment-value={value}
      onClick={() => ctx.onValueChange(value)}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "[&_svg]:shrink-0",
        itemClass[ctx.variant],
        itemSize[ctx.size],
        iconOnly && cn("flex-none", iconOnlySize[ctx.size]),
        className,
      )}
    >
      {icon}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
  const tip = tooltip ?? (iconOnly ? label : undefined);
  return tip ? <Tip label={tip}>{button}</Tip> : button;
}
