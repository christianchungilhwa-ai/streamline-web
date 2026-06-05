import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ROIRegion } from "@/lib/types";

/** Matches streamline-server's ROIRegion.full_frame() default. */
const DEFAULT_ROI: ROIRegion = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
const MIN = 0.05; // min normalized ROI size (mirrors iOS ROIOverlayView)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Corner = "tl" | "tr" | "bl" | "br";
interface Frame {
  time: number;
  src: string;
}

/** mm:ss (or h:mm:ss) — mirrors iOS ThumbnailButton.formatTimestamp. */
function fmtTime(s: number): string {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Seek a <video> to `time` and capture the frame to a downscaled JPEG data
 *  URL. Resolves on the `seeked` event (or a 2.5s safety timeout so a sparse
 *  seek table at the tail of the video can't hang the strip). */
function seekAndCapture(video: HTMLVideoElement, time: number, maxW = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    let done = false;
    const onSeeked = () => finish(true);
    const timer = setTimeout(() => finish(true), 2500);
    function finish(ok: boolean) {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", onSeeked);
      clearTimeout(timer);
      if (!ok) return reject(new Error("seek failed"));
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return reject(new Error("no dims"));
        const scale = Math.min(1, maxW / w);
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(video, 0, 0, cw, ch);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      } catch (e) {
        reject(e as Error);
      }
    }
    video.addEventListener("seeked", onSeeked, { once: true });
    try {
      video.currentTime = time;
    } catch {
      finish(false);
    }
  });
}

/** Apply a corner drag to the ROI — direct port of iOS ROIOverlayView.updateROI. */
function updateCorner(prev: ROIRegion, corner: Corner, nx: number, ny: number): ROIRegion {
  let { x, y, width, height } = prev;
  if (corner === "tl") {
    const w = x + width - nx;
    const h = y + height - ny;
    if (w > MIN && h > MIN) { x = nx; y = ny; width = w; height = h; }
  } else if (corner === "tr") {
    const w = nx - x;
    const h = y + height - ny;
    if (w > MIN && h > MIN) { y = ny; width = w; height = h; }
  } else if (corner === "bl") {
    const w = x + width - nx;
    const h = ny - y;
    if (w > MIN && h > MIN) { x = nx; width = w; height = h; }
  } else {
    const w = nx - x;
    const h = ny - y;
    if (w > MIN && h > MIN) { width = w; height = h; }
  }
  return { x, y, width, height };
}

export interface RoiConfirmProps {
  videoFile: File;
  /** Server-suggested ROI; null while detecting or if detection failed. */
  suggestion: ROIRegion | null;
  detecting: boolean;
  /** True while the start request is in flight — disables controls. */
  busy: boolean;
  error: string | null;
  onConfirm: (roi: ROIRegion) => void;
  onCancel: () => void;
}

/**
 * Mirrors the iOS "Detect Slide Region" flow (ROIDetectionView):
 * six frames sampled across the timeline, a draggable orange ROI box with a
 * dimmed surround on the selected frame, a "verify across the timeline"
 * thumbnail strip (tap to swap the canvas; each thumb previews the ROI in
 * green), and Adjust Manually / Reset / Use This Region controls.
 *
 * Frames are extracted client-side from the just-uploaded video; the ROI is
 * pre-filled with the server's auto-detected suggestion (the web analogue of
 * iOS's on-device RectangleDetector).
 */
export function RoiConfirm({
  videoFile,
  suggestion,
  detecting,
  busy,
  error,
  onConfirm,
  onCancel,
}: RoiConfirmProps) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [extracting, setExtracting] = useState(true);
  const [aspect, setAspect] = useState(16 / 9);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [roi, setRoi] = useState<ROIRegion>(suggestion ?? DEFAULT_ROI);
  const [touched, setTouched] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragCorner = useRef<Corner | null>(null);

  // Extract 6 frames across the timeline (mirrors iOS sampleTimes).
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(videoFile);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    setExtracting(true);

    video.onloadedmetadata = async () => {
      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) {
        if (!cancelled) setExtracting(false);
        return;
      }
      if (video.videoWidth && video.videoHeight) {
        setAspect(video.videoWidth / video.videoHeight);
      }
      const times = [
        Math.min(15, dur * 0.05),
        Math.min(60, dur * 0.15),
        Math.min(120, dur * 0.25),
        dur * 0.45,
        dur * 0.65,
        dur * 0.85,
      ]
        .filter((t) => Number.isFinite(t) && t >= 0 && t < dur)
        .sort((a, b) => a - b);

      const out: Frame[] = [];
      for (const t of times) {
        if (cancelled) return;
        try {
          out.push({ time: t, src: await seekAndCapture(video, t) });
        } catch {
          /* skip a frame we couldn't grab */
        }
      }
      if (!cancelled) {
        setFrames(out);
        // Default to an early-but-not-first frame (iOS picks the
        // best-detected; this approximates "a stable early frame").
        setSelectedIdx(Math.min(2, Math.max(0, out.length - 1)));
        setExtracting(false);
      }
    };
    video.onerror = () => {
      if (!cancelled) setExtracting(false);
    };

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [videoFile]);

  // Adopt the server suggestion when it arrives, unless the user already
  // started adjusting the box.
  useEffect(() => {
    if (suggestion && !touched) setRoi(suggestion);
  }, [suggestion, touched]);

  function beginDrag(e: React.PointerEvent, corner: Corner) {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    setTouched(true);
    dragCorner.current = corner;
    canvasRef.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const corner = dragCorner.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!corner || !rect || !rect.width || !rect.height) return;
    const nx = clamp01((e.clientX - rect.left) / rect.width);
    const ny = clamp01((e.clientY - rect.top) / rect.height);
    setRoi((prev) => updateCorner(prev, corner, nx, ny));
  }
  function endDrag(e: React.PointerEvent) {
    dragCorner.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  const pct = (v: number) => `${v * 100}%`;
  const boxStyle = {
    left: pct(roi.x),
    top: pct(roi.y),
    width: pct(roi.width),
    height: pct(roi.height),
  } as const;

  const selectedFrame = frames[selectedIdx];
  const showSpinner = extracting && frames.length === 0;

  return (
    <div className="mt-1 max-h-[78vh] space-y-3 overflow-y-auto">
      <div className="text-center">
        <h3 className="text-base font-semibold text-foreground">Detect Slide Region</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          We detected the slide area in your video. Adjust if needed, and tap a
          thumbnail below to verify it holds up at different points in the
          recording.
        </p>
      </div>

      {showSpinner ? (
        <div className="flex h-44 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing video frames…
        </div>
      ) : selectedFrame ? (
        <>
          {/* Main editing canvas: selected frame + orange ROI box. */}
          <div className="flex justify-center">
            <div
              ref={canvasRef}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="relative inline-block max-w-full touch-none select-none overflow-hidden rounded-xl bg-black"
            >
              <img
                src={selectedFrame.src}
                alt=""
                className="block h-auto max-h-[42vh] w-auto max-w-full"
                draggable={false}
              />
              {/* Box dims everything outside via a huge spread box-shadow. */}
              <div
                className="pointer-events-none absolute border-2 border-orange-500"
                style={{ ...boxStyle, boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)" }}
              >
                {adjusting &&
                  (["tl", "tr", "bl", "br"] as Corner[]).map((c) => (
                    <span
                      key={c}
                      onPointerDown={(e) => beginDrag(e, c)}
                      className={cn(
                        "pointer-events-auto absolute h-5 w-5 rounded-full border-2 border-orange-500 bg-background",
                        c === "tl" && "-left-2.5 -top-2.5 cursor-nwse-resize",
                        c === "tr" && "-right-2.5 -top-2.5 cursor-nesw-resize",
                        c === "bl" && "-left-2.5 -bottom-2.5 cursor-nesw-resize",
                        c === "br" && "-right-2.5 -bottom-2.5 cursor-nwse-resize",
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
          </div>

          {/* "Verify across the timeline" thumbnail strip. */}
          {frames.length > 1 && (
            <div>
              <p className="px-1 pb-1 text-xs text-muted-foreground">
                Verify across the timeline
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {frames.map((f, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedIdx(i)}
                    className={cn(
                      "relative shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                      i === selectedIdx ? "border-primary" : "border-border hover:border-muted-foreground",
                    )}
                    style={{ width: 104, height: 104 / aspect }}
                    aria-label={`Frame at ${fmtTime(f.time)}`}
                  >
                    <img src={f.src} alt="" className="block h-full w-full object-cover" draggable={false} />
                    <span
                      className="pointer-events-none absolute border border-green-500"
                      style={boxStyle}
                    />
                    <span className="pointer-events-none absolute bottom-0.5 right-1 rounded bg-black/65 px-1 text-[10px] tabular-nums text-white">
                      {fmtTime(f.time)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-36 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          Couldn't read frames from this video, but you can still continue — the
          server will auto-detect the slide region.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
          className="text-primary hover:text-primary"
        >
          Cancel
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {adjusting && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRoi(suggestion ?? DEFAULT_ROI);
                setTouched(false);
                setAdjusting(false);
              }}
              disabled={busy}
            >
              Reset
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAdjusting((a) => !a)}
            disabled={busy || !selectedFrame}
          >
            {adjusting ? "Done Adjusting" : "Adjust Manually"}
          </Button>
          <Button type="button" onClick={() => onConfirm(roi)} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Use This Region
          </Button>
        </div>
      </div>
    </div>
  );
}
