import { AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { lectureStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/** Lecture status pill. Renders nothing for a finished lecture — color is
 *  only spent on states that need attention. `overlay` adds a backing so
 *  it reads on top of a thumbnail. */
export function StatusBadge({ status, overlay, className }: { status: string; overlay?: boolean; className?: string }) {
  const info = lectureStatus(status);
  if (!info) return null;
  const badge = (
    <Badge tone={info.tone} className={className}>
      {info.spin && <Loader2 className="animate-spin" />}
      {info.alert && <AlertCircle />}
      {info.label}
    </Badge>
  );
  if (!overlay) return badge;
  return <span className={cn("inline-flex rounded-full bg-card/90 shadow-sm backdrop-blur")}>{badge}</span>;
}
