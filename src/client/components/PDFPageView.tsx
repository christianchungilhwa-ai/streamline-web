import { useEffect, useRef, useState } from "react";
import { pdfjs } from "@/lib/pdfWorker";
import { Loader2 } from "lucide-react";

/**
 * Single-page PDF renderer. Loads the PDF once (cached at module scope
 * via `documentCache` so the same URL doesn't re-parse for every
 * slide), renders the requested page onto a canvas at a target width.
 *
 * Tuned for use inside a scrolling slide-list: each `<PDFPageView>`
 * mounts once for its slide, renders once, and stays in the DOM (so
 * scrolling back to it doesn't re-render).
 */

// Per-URL document cache. PDF parsing is expensive (10s+ for 100-page
// decks) so we never want to redo it.
type DocCacheEntry = ReturnType<typeof pdfjs.getDocument> extends { promise: infer P } ? P : never;
const documentCache = new Map<string, DocCacheEntry>();

function getDocument(url: string): DocCacheEntry {
  const existing = documentCache.get(url);
  if (existing) return existing;
  const task = pdfjs.getDocument({ url, withCredentials: true });
  documentCache.set(url, task.promise);
  return task.promise;
}

export interface PDFPageViewProps {
  /** URL to the PDF — typically `assetUrl(lectureId, "slides.pdf")` */
  pdfUrl: string;
  /** 1-based page number. */
  pageNumber: number;
  /** Target render width in CSS pixels. Default 800. */
  width?: number;
  className?: string;
}

export function PDFPageView({ pdfUrl, pageNumber, width = 800, className }: PDFPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"loading" | "rendered" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

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

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: 1 });
        const scale = (width * dpr) / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = Math.floor(scaledViewport.width);
        canvas.height = Math.floor(scaledViewport.height);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${Math.floor(scaledViewport.height / dpr)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setError("no 2d context");
          setStatus("error");
          return;
        }

        await page.render({ canvas, canvasContext: ctx, viewport: scaledViewport }).promise;
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
    };
  }, [pdfUrl, pageNumber, width]);

  return (
    <div className={className} style={{ position: "relative" }}>
      <canvas ref={canvasRef} className="rounded-md border bg-white shadow-sm" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 text-xs text-destructive">
          {error ?? "Failed to render PDF page"}
        </div>
      )}
    </div>
  );
}
