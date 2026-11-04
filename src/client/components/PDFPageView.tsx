import { useEffect, useRef, useState } from "react";
import { pdfjs } from "@/lib/pdfWorker";
import { cn } from "@/lib/utils";

/**
 * Single-page PDF renderer. Loads the PDF once (cached at module scope
 * via `documentCache` so the same URL doesn't re-parse for every
 * slide), renders the requested page onto a canvas.
 *
 * The canvas fills its column (CSS `w-full h-auto`); its bitmap is
 * rendered at the column's measured width × devicePixelRatio, capped at
 * `width` CSS px, so it stays sharp without every slide in a 150-page
 * deck holding a full-resolution bitmap. While loading, an aspect-ratio
 * placeholder holds the space so the slide list doesn't jump.
 *
 * Tuned for use inside a scrolling slide-list: each `<PDFPageView>`
 * mounts once for its slide and stays in the DOM, but only holds a bitmap
 * while it is near the visible part of its scroller — it renders once it
 * comes within RENDER_MARGIN px (again if its column grows noticeably)
 * and frees the bitmap past RELEASE_MARGIN px, so a 150-page deck never
 * keeps 150 canvases alive (iOS caps total canvas memory).
 */

// Per-URL document cache. PDF parsing is expensive (10s+ for 100-page
// decks) so we never want to redo it.
type DocCacheEntry = ReturnType<typeof pdfjs.getDocument> extends { promise: infer P } ? P : never;
const documentCache = new Map<string, DocCacheEntry>();
// Page aspect (width / height) per URL, from the first page rendered, so
// later placeholders already have the deck's shape.
const aspectCache = new Map<string, number>();

function getDocument(url: string): DocCacheEntry {
  const existing = documentCache.get(url);
  if (existing) return existing;
  const task = pdfjs.getDocument({ url, withCredentials: true });
  const promise = task.promise;
  documentCache.set(url, promise);
  // A failed load mustn't stick: drop it so a later mount retries.
  promise.catch(() => {
    if (documentCache.get(url) === promise) documentCache.delete(url);
  });
  return promise;
}

/** Render a page once it is this close (px) to its scroller's viewport… */
const RENDER_MARGIN = 1500;
/** …and free its bitmap once it is farther than this. */
const RELEASE_MARGIN = 4000;

/** The nearest ancestor that scrolls vertically (by style, whether or not
 *  it overflows yet), or null for the viewport. IntersectionObserver's
 *  rootMargin only grows its root, so the root has to be the scroller. */
function scrollRootOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/** Bitmaps beyond 2× don't look sharper on a slide thumbnail but cost
 *  2.25× the memory (and iOS caps total canvas memory). */
const MAX_DPR = 2;
/** Re-render only when the column grows by more than this factor. */
const GROW_FACTOR = 1.25;

export interface PDFPageViewProps {
  /** URL to the PDF — typically `assetUrl(lectureId, "slides.pdf")` */
  pdfUrl: string;
  /** 1-based page number. */
  pageNumber: number;
  /** Maximum render width in CSS pixels (the bitmap is this × DPR at
   *  most). The canvas itself always fills its container. Default 800. */
  width?: number;
  className?: string;
}

export function PDFPageView({ pdfUrl, pageNumber, width = 800, className }: PDFPageViewProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"loading" | "rendered" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState<number | null>(() => aspectCache.get(pdfUrl) ?? null);
  // CSS width to render at: the column's width, capped at `width`. Null
  // until the wrapper has been measured (e.g. while its pane is hidden).
  const [renderWidth, setRenderWidth] = useState<number | null>(null);
  // Within RENDER_MARGIN of the viewport (until it goes past RELEASE_MARGIN).
  // Without IntersectionObserver, render straight away and keep it.
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let root: HTMLElement | null = null;
    let observers: IntersectionObserver[] = [];
    const connect = () => {
      observers.forEach((o) => o.disconnect());
      root = scrollRootOf(el);
      const enter = new IntersectionObserver(
        (entries) => {
          if (entries[entries.length - 1]?.isIntersecting) setNear(true);
        },
        { root, rootMargin: `${RENDER_MARGIN}px 0px` },
      );
      const leave = new IntersectionObserver(
        (entries) => {
          const e = entries[entries.length - 1];
          // A hidden pane (display: none) reports a zero box: keep the
          // bitmap so switching back is instant.
          if (e && !e.isIntersecting && e.boundingClientRect.height > 0) setNear(false);
        },
        { root, rootMargin: `${RELEASE_MARGIN}px 0px` },
      );
      enter.observe(el);
      leave.observe(el);
      observers = [enter, leave];
    };
    connect();
    // The scroller can change with the layout (e.g. the viewer's columns
    // scroll on their own at lg, the page root below it).
    const onResize = () => {
      if (scrollRootOf(el) !== root) connect();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      observers.forEach((o) => o.disconnect());
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (!w) return; // hidden (display: none) — wait until it's shown
      const target = Math.min(Math.ceil(w), width);
      setRenderWidth((prev) => (prev === null || target > prev * GROW_FACTOR ? target : prev));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  useEffect(() => {
    if (renderWidth === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!near) {
      // Far away: free the bitmap; the placeholder keeps the page's shape.
      if (canvas.width || canvas.height) {
        canvas.width = 0;
        canvas.height = 0;
      }
      setStatus((s) => (s === "rendered" ? "loading" : s));
      return;
    }
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;

    (async () => {
      try {
        const doc = await getDocument(pdfUrl);
        if (cancelled) return;
        if (pageNumber < 1 || pageNumber > doc.numPages) {
          setError(`page ${pageNumber} out of range (1..${doc.numPages})`);
          setStatus("error");
          return;
        }
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1 });
        const pageAspect = viewport.width / viewport.height;
        if (!aspectCache.has(pdfUrl)) aspectCache.set(pdfUrl, pageAspect);
        setAspect(pageAspect);

        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const scale = (renderWidth * dpr) / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setError("no 2d context");
          setStatus("error");
          return;
        }
        canvas.width = Math.floor(scaledViewport.width);
        canvas.height = Math.floor(scaledViewport.height);

        const task = page.render({ canvas, canvasContext: ctx, viewport: scaledViewport });
        renderTask = task;
        await task.promise;
        if (cancelled) return;
        setStatus("rendered");
      } catch (e: unknown) {
        if (cancelled) return;
        setError(String((e as Error)?.message ?? e));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfUrl, pageNumber, renderWidth, near]);

  const placeholderStyle = { aspectRatio: String(aspect ?? 4 / 3) };

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      <canvas
        ref={canvasRef}
        className={cn("block h-auto w-full rounded-lg border bg-white", status !== "rendered" && "hidden")}
      />
      {status === "loading" && (
        <div
          className="w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
          style={placeholderStyle}
          aria-hidden
        />
      )}
      {status === "error" && (
        <div
          className="flex w-full items-center justify-center rounded-lg border bg-muted px-4 text-center text-xs text-muted-foreground"
          style={placeholderStyle}
          title={error ?? undefined}
        >
          Couldn't load this slide.
        </div>
      )}
    </div>
  );
}
