import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Streamline-Web dev server runs on its own port so it doesn't collide
// with Claraity (5000), claraity-server (3001), audiofile-web (5001),
// or audiofile-server (3002). Express is on 3003 for parallel reasons.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: ".",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/client"),
    },
  },
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
  server: {
    host: "0.0.0.0",
    port: 5002,
    allowedHosts: true,
    proxy: {
      // The vast majority of /api/* calls go cross-domain to claraity.app
      // (where the session cookie lives). For local dev, we proxy them
      // through our Express on 3003 which can either forward to localhost
      // claraity-server or to production claraity.app — controlled by
      // CLARAITY_PROXY_TARGET in .env.
      "/api": {
        target: "http://localhost:3003",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache";
              proxyRes.headers["x-accel-buffering"] = "no";
            }
          });
        },
      },
    },
  },
});
