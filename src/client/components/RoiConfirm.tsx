import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ROIRegion } from "@/lib/types";

/** Matches streamline-server's ROIRegion.full_frame() default. */
const DEFAULT_ROI: ROIRegion = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
const MIN_SIZE = 0.06; // don't let the box collapse to nothing

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Corner = "tl" | "tr" | "bl" | "br";

export interface RoiConfirmProps {
  /** The just-uploaded video — used to render a representative frame locally. */
  videoFile: File;
  /** Server-suggested ROI; null while detecting or if detection failed. */
  suggestion: ROIRegion | null;
  /** True while the suggestion request is in flight. */
  detecting: boolean;
  /** True while the start request is in flight — disables the controls. */
  busy: boolean;
  error: string | null;
  onConfirm: (roi: ROIRegion) => void;
  onAutoDetect: () => void;
  onCancel: () => void;
}

/**
 * iOS-parity ROI confirm step. Shows a frame from the just-uploaded video
 * with a draggable box (pre-filled with the server's auto-detected
 * suggestion) so the user can frame exactly the slide area before
 * processing. The box is normalized [0,1] and overlaid via percentages, so
 * it maps 1:1 onto the rendered <video> regardless of resolution.
 *
 * Ported from the iOS ROIOverlayView (draggable corner handles + dimmed
 * surround). "Auto-detect for me" sends no ROI, letting the server decide.
 */
export function RoiConfirm({
  videoFile,
  suggestion,
  detecting,
  busy,
  error,
  onConfirm,
  onAutoDetect,
  onCancel,
}: RoiConfirmProps) {
  const url = useMemo(() => URL.createObjectURL(videoFile), [videoFile]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [roi, setRoi] = useState<ROIRegion>(suggestion ?? DEFAULT_ROI);
  const [touched, setTouched] = useState(false);

  // Adopt the server suggestion when it arrives — unless the user already
  // started adjusting the box (don't yank it out from under them).
  useEffect(() => {
    if (suggestion && !touched) setRoi(suggestion);
  }, [suggestion, touched]);

  // Seek to a representative frame (~midpoint) once dimensions are known.
  function onLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    if (Number.isFinite(d) && d > 0) {
      try {
        v.currentTime = Math.min(Math.max(d * 0.5, 0.1), Math.max(d - 0.1, 0.1));
      } catch {
        /* seeking not ready yet — ignore */
      }
    }
  }

  const drag = useRef<{ mode: Corner | "move"; sx: number; sy: number; start: ROIRegion } | null>(null);

  function beginDrag(e: React.PointerEvent, mode: Corner | "move") {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    setTouched(true);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: roi };
    containerRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const ds = drag.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!ds || !rect || rect.width === 0 || rect.height === 0) return;
    const dx = (e.clientX - ds.sx) / rect.width;
    const dy = (e.clientY - ds.sy) / rect.height;
    const s = ds.start;

    if (ds.mode === "move") {
      const x = Math.max(0, Math.min(clamp01(s.x + dx), 1 - s.width));
      const y = Math.max(0, Math.min(clamp01(s.y + dy), 1 - s.height));
      setRoi({ x, y, width: s.width, height: s.height });
      return;
    }

    let left = s.x;
    let top = s.y;
    let right = s.x + s.width;
    let bottom = s.y + s.height;
    if (ds.mode === "tl") {
      left = clamp01(s.x + dx);
      top = clamp01(s.y + dy);
    } else if (ds.mode === "tr") {
      right = clamp01(s.x + s.width + dx);
      top = clamp01(s.y + dy);
    } else if (ds.mode === "bl") {
      left = clamp01(s.x + dx);
      bottom = clamp01(s.y + s.height + dy);
    } else if (ds.mode === "br") {
      right = clamp01(s.x + s.width + dx);
      bottom = clamp01(s.y + s.height + dy);
    }
    const x = Math.min(left, right);
    const y = Math.min(top, bottom);
    const width = Math.max(MIN_SIZE, Math.abs(right - left));
    const height = Math.max(MIN_SIZE, Math.abs(bottom - top));
    setRoi({
      x,
      y,
      width: Math.min(width, 1 - x),
      height: Math.min(height, 1 - y),
    });
  }

  function endDrag(e: React.PointerEvent) {
    drag.current = null;
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const pct = (v: number) => `${v * 100}%`;

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-muted-foreground">
        Drag the box to frame just the slides. We crop the video to this region
        for slide matching — same as the iOS app.
      </p>

      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative w-full touch-none select-none overflow-hidden rounded-xl bg-black"
      >
        <video
          ref={videoRef}
          src={url}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={onLoadedMetadata}
          className="block h-auto w-full"
        />

        {/* The box dims everything outside it via a huge spread box-shadow. */}
        <div
          onPointerDown={(e) => beginDrag(e, "move")}
          className={cn(
            "absolute border-2 border-primary",
            busy ? "cursor-default" : "cursor-move",
          )}
          style={{
            left: pct(roi.x),
            top: pct(roi.y),
            width: pct(roi.width),
            height: pct(roi.height),
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
          }}
        >
          {(["tl", "tr", "bl", "br"] as Corner[]).map((c) => (
            <span
              key={c}
              onPointerDown={(e) => beginDrag(e, c)}
              className={cn(
                "absolute h-4 w-4 rounded-full border-2 border-primary bg-background",
                c === "tl" && "-left-2 -top-2 cursor-nwse-resize",
                c === "tr" && "-right-2 -top-2 cursor-nesw-resize",
                c === "bl" && "-left-2 -bottom-2 cursor-nesw-resize",
                c === "br" && "-right-2 -bottom-2 cursor-nwse-resize",
                busy && "cursor-default",
              )}
            />
          ))}
        </div>

        {detecting && (
          <div className="absolute inset-x-0 top-2 mx-auto flex w-fit items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            <Loader2 className="h-3 w-3 animate-spin" />
            Detecting slide region…
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
          className="text-primary hover:text-primary"
        >
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={onAutoDetect} disabled={busy}>
            Auto-detect for me
          </Button>
          <Button type="button" onClick={() => onConfirm(roi)} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Use this region
          </Button>
        </div>
      </div>
    </div>
  );
}
