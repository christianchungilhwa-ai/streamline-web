# streamline-web

Deployed at **https://streamline.claraity.app** — the lecture-processing
viewer + uploader. Mirror of `audiofile-web`'s deployment pattern:
separate subdomain, shared `.claraity.app` session cookie, all per-user
data + persistence handled by Claraity-web's `/api/streamline/*` routes.

## Architecture

```
┌────────────────────────────┐    cross-domain fetch       ┌─────────────────────┐
│ streamline.claraity.app    │  ───────────────────────▶   │ claraity.app        │
│ (this repo: Vite + React)  │       (cookie-auth)         │ (Claraity-web)      │
└────────────────────────────┘                             │  /api/streamline/*  │
                                                           └─────────┬───────────┘
                                                                     │ X-API-Key
                                                                     ▼
                                              ┌──────────────────────────────────┐
                                              │ streamline-server-production…    │
                                              │ (FastAPI on Railway)             │
                                              └──────────────────────────────────┘
```

This repo is **purely a frontend SPA**. No DB, no business logic.
Authentication and per-user ownership live in Claraity-web; this repo
just renders the experience.

## Stack

- Vite 7 + React 19 + TypeScript
- Tailwind v4 (via `@tailwindcss/vite`)
- shadcn/ui (new-york theme, neutral base color)
- react-router-dom v7
- Minimal Express server (dev-only proxy + prod SPA static serving)

## Local dev

```bash
npm install
cp .env.example .env       # edit if your local claraity-server is on a different port
npm run dev                # Vite on :5002, Express dev-proxy on :3003
```

In another terminal, run claraity-server (typically on :3001). The Vite
dev server proxies `/api` → `:3003` → claraity-server, so you get
working session cookies on `localhost`.

## Deploy

Railway service backed by this repo. Set:
- `NODE_ENV=production`
- `VITE_API_BASE_URL=https://claraity.app`
- (Railway sets `PORT` automatically.)

DNS: CNAME `streamline.claraity.app` → Railway service. The session
cookie is scoped to `.claraity.app` by Claraity-web so users sign in
once and stay signed in across subdomains.

## Routes (client-side)

| Path | Component | Notes |
| ---- | --------- | ----- |
| `/`, `/lectures` | LecturesPage | Library — calls `GET /api/streamline/lectures` |
| `/lectures/new` | UploadPage | Two-file upload + start |
| `/lectures/:id` | LectureViewerPage | Detail view (Phase C: full slide+video+transcript UI lands here) |
