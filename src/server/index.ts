/**
 * Minimal Express server for streamline-web.
 *
 * Two jobs:
 *   1. In production, serve the Vite-built SPA from `dist/` (so Railway's
 *      single-port deployment is satisfied).
 *   2. In dev, proxy `/api/*` to Claraity-server (typically localhost:3001).
 *      Vite handles SPA serving on port 5002.
 *
 * Auth and per-user data ALL live on Claraity-web. We never reach into
 * the streamline-server FastAPI directly from here — the browser talks
 * to Claraity-web's /api/streamline/* routes, which proxy upstream.
 */
import "dotenv/config";
import express from "express";
import compression from "compression";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3003;
const isProd = process.env.NODE_ENV === "production";

app.use(compression());
app.use(express.json({ limit: "1mb" }));

// In dev, forward /api/* to Claraity-server (or claraity.app prod).
// In prod, the SPA fetches cross-domain directly to claraity.app via
// VITE_API_BASE_URL — this proxy is a dev-only convenience.
if (!isProd) {
  const claraityTarget = process.env.CLARAITY_PROXY_TARGET || "http://localhost:3001";
  app.use("/api", async (req, res) => {
    const upstreamUrl = `${claraityTarget}${req.originalUrl}`;
    try {
      const upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers: {
          ...(req.headers as Record<string, string>),
          host: new URL(claraityTarget).host,
        },
        body:
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : JSON.stringify(req.body),
      });
      res.status(upstream.status);
      upstream.headers.forEach((v, k) => {
        if (k.toLowerCase() !== "content-encoding" && k.toLowerCase() !== "transfer-encoding") {
          res.setHeader(k, v);
        }
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (e: unknown) {
      console.error("[dev-proxy] failed:", (e as Error)?.message);
      res.status(502).json({ error: "Dev proxy to Claraity failed" });
    }
  });
} else {
  // Production: serve the built SPA. Vite outputs into `dist/`.
  const distDir = path.resolve(__dirname, "..", "..", "dist");
  app.use(express.static(distDir));
  // SPA fallback — any non-API path returns index.html so react-router
  // handles deep links.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[streamline-web] listening on :${PORT} (${isProd ? "prod" : "dev"})`);
});
