/**
 * pdf.js worker setup. Centralized here so every PDF rendering component
 * imports from the same module and we don't accidentally register the
 * worker twice (which logs a warning).
 *
 * Vite bundles the worker file via `?url`. The .mjs extension matters
 * — pdfjs-dist 5.x ships an ES-module worker.
 */
import * as pdfjs from "pdfjs-dist";
// eslint-disable-next-line import/no-unresolved -- Vite's ?url import
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { pdfjs };
