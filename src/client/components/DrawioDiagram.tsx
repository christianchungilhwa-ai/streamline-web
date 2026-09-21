import { useEffect, useRef, useState } from "react";

/**
 * Inline draw.io (mxGraph) diagram renderer for `language-drawio`
 * fenced code blocks in the resolved studyguide (contract C3).
 *
 * Mirrors the Mac app's WKWebView pattern (StudyguideView.swift):
 * a container div carrying the raw mxGraph XML as `data-mxgraph`
 * JSON config, rendered by drawio's public GraphViewer from
 * `viewer-static.min.js`. Differences from the Mac:
 *   - the ~3.6MB viewer script is loaded lazily from the diagrams.net
 *     CDN, once per page, and only when a diagram actually mounts
 *     (the Mac inlines a bundled copy conditionally for the same
 *     reason — a typical studyguide has zero diagrams);
 *   - if the script fails to load, we degrade to a collapsed
 *     <details> with the diagram XML instead of an empty box.
 *
 * After rendering we run the same SVG normalization pass as the Mac:
 * ensure a viewBox, then force the SVG + drawio's inline-block
 * wrappers to `width: 100%` so the diagram scales to its column
 * instead of clipping at its natural pixel width. We deliberately
 * touch nothing INSIDE the SVG — drawio's text labels live in
 * foreignObject children positioned in SVG units, and resizing those
 * breaks the labels.
 */

declare global {
  interface Window {
    GraphViewer?: {
      createViewerForElement?: (el: Element, callback?: () => void) => void;
      processElements?: (className?: string) => void;
    };
  }
}

const VIEWER_SRC = "https://viewer.diagrams.net/js/viewer-static.min.js";

let viewerLoad: Promise<boolean> | null = null;

/** Load viewer-static.min.js once per page, lazily. Resolves false on
 *  load failure (offline, CDN blocked) so callers can fall back. A
 *  failed load clears the cache so a later mount can retry. */
function loadGraphViewer(): Promise<boolean> {
  if (viewerLoad) return viewerLoad;
  viewerLoad = new Promise<boolean>((resolve) => {
    if (window.GraphViewer) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = VIEWER_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.GraphViewer));
    script.onerror = () => {
      viewerLoad = null;
      script.remove();
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return viewerLoad;
}

/** The Mac's live-view normalization pass, ported 1:1. */
function normalizeDrawioSvg(container: HTMLElement): void {
  // Find the outermost SVG (skip SVG-in-foreignObject nesting).
  let outerSvg: SVGSVGElement | null = null;
  const candidates = container.querySelectorAll("svg");
  for (const s of Array.from(candidates)) {
    let p = s.parentElement;
    let nested = false;
    while (p && p !== container) {
      if (p.tagName.toLowerCase() === "svg") {
        nested = true;
        break;
      }
      p = p.parentElement;
    }
    if (!nested) {
      outerSvg = s;
      break;
    }
  }
  if (!outerSvg) return;

  // (1) Ensure viewBox so the SVG can scale below its natural size.
  if (!outerSvg.hasAttribute("viewBox")) {
    const w = parseFloat(outerSvg.getAttribute("width") ?? "") || 0;
    const h = parseFloat(outerSvg.getAttribute("height") ?? "") || 0;
    if (w > 0 && h > 0) outerSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }

  // (2a) Walk upward, neutralizing drawio's inline-block pixel-width
  // wrappers so width:100% cascades from the container to the SVG.
  let node: HTMLElement | null = outerSvg.parentElement;
  while (node && node !== container.parentElement) {
    if (node.tagName.toLowerCase() === "div" || node === container) {
      node.style.setProperty("width", "100%", "important");
      node.style.setProperty("max-width", "100%", "important");
      node.style.setProperty("height", "auto", "important");
      node.style.setProperty("display", "block", "important");
      node.style.setProperty("overflow", "visible", "important");
    }
    if (node === container) break;
    node = node.parentElement;
  }

  // (2b) Normalize the SVG itself.
  outerSvg.removeAttribute("width");
  outerSvg.removeAttribute("height");
  outerSvg.style.setProperty("width", "100%", "important");
  outerSvg.style.setProperty("max-width", "100%", "important");
  outerSvg.style.setProperty("height", "auto", "important");
  outerSvg.style.setProperty("display", "block", "important");
  outerSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

export function DrawioDiagram({ xml }: { xml: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    setFailed(false);
    host.innerHTML = "";

    // Build the viewer container imperatively so React never diffs the
    // DOM that GraphViewer replaces. Class kept as `sg-drawio` (like
    // the Mac) — never `mxgraph`, so the viewer's own auto-processing
    // pass at script load can't double-render our instances.
    const div = document.createElement("div");
    div.className = "sg-drawio";
    div.setAttribute(
      "data-mxgraph",
      JSON.stringify({ editable: false, xml, toolbar: "", layout: 1 }),
    );
    host.appendChild(div);

    loadGraphViewer().then((ok) => {
      if (!alive) return;
      const gv = window.GraphViewer;
      if (!ok || !gv) {
        setFailed(true);
        return;
      }
      try {
        if (typeof gv.createViewerForElement === "function") {
          gv.createViewerForElement(div);
        } else if (typeof gv.processElements === "function") {
          gv.processElements("sg-drawio");
        } else {
          setFailed(true);
          return;
        }
        normalizeDrawioSvg(div);
      } catch {
        setFailed(true);
      }
    });

    return () => {
      alive = false;
    };
  }, [xml]);

  if (failed) {
    return (
      <figure className="sg-drawio-wrap sg-drawio-fallback">
        <figcaption>
          <span className="sg-drawio-badge">⬡ Diagram</span> Diagram viewer unavailable
        </figcaption>
        <details>
          <summary>Show diagram source</summary>
          <pre>
            <code>{xml}</code>
          </pre>
        </details>
      </figure>
    );
  }

  return (
    <figure className="sg-drawio-wrap">
      <div ref={hostRef} />
    </figure>
  );
}
