# Streamline Web — Mac→Web Upgrade Tracker

Goal: the web app is the **flagship** — everything the Mac app does, done better.
Baseline: 12-agent adversarial parity audit, 2026-09-21 (22 material diffs confirmed,
1 refuted). Mac-side-only bugs (discarded ROI confirm, lying Cancel button) are noted
but NOT roadmap items — the Mac app is being superseded.

## Audit verdicts (2026-09-21 baseline)

| Stage | Verdict | Material gaps (web-side) |
|---|---|---|
| Core lecture processing | 🟢 parity by construction | 0 — both clients use the shared server engine |
| Upload transport | 🔴 behind | whole-file PUT (Railway 300s → 502 on big/slow uploads), zero retry, Try-again button dead |
| Studyguide generation | 🔴 reduced port | 3-of-4 marker grammar, no Adobe figure pre-extraction, "FIGURES PRE-EXTRACTED: (none)" hardcoded |
| Studyguide visuals | 🔴 missing entirely | markers pass through unresolved: no slide images, no Nano Banana, no draw.io render, no SG_PAIR tabs; raw XML debris in output |
| Results viewing | 🟡 mixed | no export (Mac: 5-item menu); no public share for web lectures |
| Lifecycle | 🟡 mixed | per-section regen sidecar persisted but unused (no route/UI); rename/delete routes exist but no UI; deletion never frees the server volume |

## Roadmap

| # | Item | Repo(s) | Status |
|---|------|---------|--------|
| 1 | Chunked upload (16MB, ?offset=&total=, per-chunk retry incl. 5xx) + working retry UX | Streamline-Web | ✅ |
| 2 | Wire rename/delete UI in lecture list (routes already live) | Streamline-Web | ✅ |
| 3 | Studyguide writer: full 4-marker grammar (SLIDE_FIGURE/S, SG_PAIR) | Streamline-Server | ✅ `e3c3495` |
| 4 | Adobe PDF Extract Phase-0 figure pre-extraction (env-gated ADOBE_CLIENT_ID/SECRET) | Streamline-Server | ✅ `e3c3495` |
| 5 | Visual resolution pass: SLIDE_IMG, SLIDE_FIGURE(S), VX_NANO_VISUAL (fal.ai, FAL_KEY env), DRAWIO→fenced blocks, SG_PAIR→structured blocks; persisted studyguide_images/ | Streamline-Server | ✅ `e3c3495` |
| 6 | Per-section regenerate: server route (sidecar already persisted) + proxy + UI submenu | Server + Claraity-web + Streamline-Web | ✅ `e3c3495`/`136dd11` |
| 7 | Studyguide viewer upgrade: resolved assets, drawio client render, SG_PAIR tabs, export (PDF + .md download) | Streamline-Web | ✅ |
| 8 | Storage lifecycle: delete frees server volume; TTL cleanup (failed/canceled/stale-uploading; completed jobs keep media for the viewer) | Streamline-Server + Claraity-web | ✅ `e3c3495`/`136dd11` |
| 9 | Proxy: studyguide asset pass-through + regen forward + delete-purge forward | Claraity-web | ✅ `136dd11` |

Env vars the server needs on Railway (values set by the owner, never committed):
`FAL_KEY`, `ADOBE_CLIENT_ID`, `ADOBE_CLIENT_SECRET` — all features degrade gracefully
when unset (placeholder illustrations upgrade automatically once FAL_KEY appears).
Optional: `STREAMLINE_MEDIA_TTL_DAYS` (default 30, 0 disables the sweep).

## Fixed log

- 2026-09-21 — Wave 1 (all 9 items) shipped across three repos:
  Streamline-Server `e3c3495`, Claraity-web `136dd11`, Streamline-Web (this commit).
  Adversarial review (16 agents over the combined diffs) confirmed 11 material
  findings, all fixed pre-push — highlights: upload sibling-abort so a retry never
  races a zombie writer against the same server file; per-job resolve locks +
  background resolution (no double image-gen spend, no proxy timeouts, no stale
  resolved copies); TTL sweep re-scoped so completed lectures keep streamable
  media; purge route hardened (403 in keyless dev mode, job-id validation,
  pre-purge studyguide resolution).

### Known minors (accepted, tracked)

- Upload token TTL (6h) can expire mid-upload on sub-Mbps uplinks; retry mints a
  fresh job. A token re-mint endpoint would allow true cross-job resume.
- draw.io diagrams load viewer JS from viewer.diagrams.net (documented CSP note).
- PDF print-export doesn't await lazy images in inactive sg-pair tabs.
- SSE `resolvingVisuals` progress shows a spinner label, not a per-marker count.
