import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { assetUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Grid card for a lecture or a study guide: 16:9 media (thumbnail, else a
 * quiet icon), a two-line title and a meta line. The actions menu is a
 * SIBLING of the link (never nested inside it) so the menu button stays a
 * real button for keyboard and screen readers.
 */
export function ProjectCard({
  to,
  linkState,
  lectureId,
  thumbnailKey,
  fallbackIcon,
  title,
  meta,
  badge,
  actions,
}: {
  to: string;
  linkState?: unknown;
  lectureId: string;
  thumbnailKey?: string | null;
  fallbackIcon: ReactNode;
  title: string;
  meta?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!thumbnailKey && !imgFailed;
  return (
    <div
      className={cn(
        "group relative card-interactive overflow-hidden",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
      )}
    >
      <Link to={to} state={linkState} className="flex flex-col focus-visible:outline-none">
        <div className="relative aspect-video overflow-hidden bg-muted">
          {showImg ? (
            <img
              src={assetUrl(lectureId, thumbnailKey!)}
              alt=""
              crossOrigin="use-credentials"
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/50 [&_svg]:size-8">
              {fallbackIcon}
            </div>
          )}
          {badge && <div className="absolute left-2 top-2">{badge}</div>}
        </div>
        <div className="p-3 pr-10">
          <div className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{title}</div>
          {meta && <div className="meta mt-1">{meta}</div>}
        </div>
      </Link>
      {actions && <div className="absolute bottom-2 right-1.5">{actions}</div>}
    </div>
  );
}
