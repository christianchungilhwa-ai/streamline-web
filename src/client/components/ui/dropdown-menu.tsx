import * as React from "react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** One menu style for the whole app (sort, card actions, export, account…). */

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;
export const DropdownMenuRadioGroup = DM.RadioGroup;
export const DropdownMenuSub = DM.Sub;

const contentClass =
  "z-50 min-w-44 max-w-80 rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-raised outline-none";
const itemClass =
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2.5 outline-none transition-colors data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DM.Content>,
  React.ComponentPropsWithoutRef<typeof DM.Content>
>(({ className, align = "end", sideOffset = 6, ...props }, ref) => (
  <DM.Portal>
    <DM.Content ref={ref} align={align} sideOffset={sideOffset} className={cn(contentClass, className)} {...props} />
  </DM.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DM.Item>,
  React.ComponentPropsWithoutRef<typeof DM.Item> & { variant?: "default" | "destructive" }
>(({ className, variant = "default", ...props }, ref) => (
  <DM.Item
    ref={ref}
    className={cn(
      itemClass,
      variant === "destructive" &&
        "text-destructive-text data-[highlighted]:bg-destructive/10 [&_svg]:text-destructive-text",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DM.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DM.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DM.RadioItem ref={ref} className={cn(itemClass, "pl-8", className)} {...props}>
    <span className="absolute left-2.5 flex size-4 items-center justify-center">
      <DM.ItemIndicator>
        <Check className="!text-brand-text" />
      </DM.ItemIndicator>
    </span>
    {children}
  </DM.RadioItem>
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

export const DropdownMenuLabel = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof DM.Label>) => (
  <DM.Label className={cn("px-2.5 py-1.5 text-xs text-muted-foreground", className)} {...props} />
);

export const DropdownMenuSeparator = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof DM.Separator>) => (
  <DM.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
);

export const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DM.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DM.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DM.SubTrigger ref={ref} className={cn(itemClass, "data-[state=open]:bg-accent", className)} {...props}>
    {children}
    <ChevronRight className="ml-auto" />
  </DM.SubTrigger>
));
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

export const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DM.SubContent>,
  React.ComponentPropsWithoutRef<typeof DM.SubContent>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DM.Portal>
    <DM.SubContent ref={ref} sideOffset={sideOffset} className={cn(contentClass, className)} {...props} />
  </DM.Portal>
));
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";
