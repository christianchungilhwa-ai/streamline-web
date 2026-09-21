/**
 * Streamline-Web API client.
 *
 * Every call goes to Claraity-web's `/api/streamline/*` routes. In dev,
 * Vite proxies /api → localhost:3003 (our minimal Express, which in
 * turn proxies to localhost:3001 = claraity-server). In prod, the SPA
 * is served from streamline.claraity.app and the browser issues
 * cross-domain credentialed fetches to claraity.app/api/streamline/*.
 * The shared `.claraity.app` session cookie carries the user identity.
 *
 * Error shape: Claraity-web returns `{error: string}` on failure (the
 * proxy in streamline.ts normalizes FastAPI's `{detail}` into `{error}`).
 * All helpers below throw `ApiError` on non-2xx responses.
 */

import type { ROIRegion } from "./types";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Base URL for cross-domain API calls in production. In dev this is "" so
 *  Vite's proxy handles /api/* via localhost. In prod, set
 *  VITE_API_BASE_URL=https://claraity.app at build time. */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body && !(init.body instanceof FormData) && !(init.body instanceof ReadableStream)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init.headers as Record<string, string> ?? {}),
    },
    ...init,
  });
  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && "error" in parsed && typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `Request failed: ${res.status}`);
    throw new ApiError(res.status, msg, parsed);
  }
  return parsed as T;
}

// ---- Types mirror what Claraity-web's streamline.ts returns ---------------

export interface Lecture {
  id: string;
  name: string;
  status: string; // "uploading" | "processing" | "completed" | "failed" | "canceled"
  thumbnailKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLectureResponse {
  id: string;
  name: string;
  status: string;
  videoUploadUrl: string;
  pdfUploadUrl: string;
}

export interface StatusResponse {
  jobId?: string;
  status?: string;
  step?: string;
  progress?: number;
  error?: string;
}

export interface LectureDetail {
  lecture: Lecture;
  project: unknown | null; // The full project.json shape — typed in models.ts later
  projectError?: string;
}

// ---- Auth ----------------------------------------------------------------

export interface SessionUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  /** Google profile photo URL (or null). Same value Claraity-web's
   *  /api/auth/user returns, so the avatar matches the main app. */
  profilePicture?: string | null;
}

/** Hits Claraity-web's existing /api/auth/user. Returns null if not signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    return await request<SessionUser>("/api/auth/user");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

// ---- Lectures ------------------------------------------------------------

export function listLectures() {
  return request<{ lectures: Lecture[] }>("/api/streamline/lectures");
}

export function getLecture(id: string) {
  return request<LectureDetail>(`/api/streamline/lectures/${id}`);
}

export function createLecture(name: string) {
  return request<CreateLectureResponse>("/api/streamline/lectures", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function startLecture(id: string, roi?: ROIRegion) {
  return request<{ jobId: string; executionArn?: string }>(`/api/streamline/lectures/${id}/start`, {
    method: "POST",
    body: roi ? JSON.stringify({ roi }) : undefined,
  });
}

/** Ask the server to suggest a slide-region ROI for the uploaded video so the
 *  user can confirm/adjust it before processing (parity with the iOS step).
 *  Runs Claude vision server-side, so it can take several seconds. */
export function suggestRoi(id: string) {
  return request<{ roi: ROIRegion; autoDetected: boolean }>(
    `/api/streamline/lectures/${id}/roi-suggest`,
    { method: "POST" },
  );
}

export function getLectureStatus(id: string) {
  return request<StatusResponse>(`/api/streamline/lectures/${id}/status`);
}

export function cancelLecture(id: string) {
  return request<{ ok?: boolean }>(`/api/streamline/lectures/${id}/cancel`, { method: "POST" });
}

export function renameLecture(id: string, name: string) {
  return request<{ id: string; name: string }>(`/api/streamline/lectures/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteLecture(id: string) {
  return request<void>(`/api/streamline/lectures/${id}`, { method: "DELETE" });
}

// ---- Studyguides ---------------------------------------------------------

export interface StudyguideMeta {
  model?: string;
  sectionCount?: number;
  blueprint?: unknown;
  generatedAt?: number;
  slideCount?: number;
}

export interface StudyguideResponse {
  jobId?: string;
  markdown: string;
  meta: StudyguideMeta | null;
}

/** One row in the "My Studyguides" listing — a lecture that has a
 *  generated studyguide. `id` is the lecture/job id (opens the same
 *  viewer, studyguide tab). */
export interface StudyguideListItem {
  id: string;
  name: string;
  status: string;
  thumbnailKey: string | null;
  createdAt: string;
  generatedAt: number | null;
  sectionCount: number | null;
}

/** List the user's generated studyguides (newest first). */
export function listStudyguides() {
  return request<{ studyguides: StudyguideListItem[] }>("/api/streamline/studyguides");
}

/** Fetch the cached studyguide for a lecture. Returns null if none has
 *  been generated yet (404 from upstream). */
export async function getStudyguide(id: string): Promise<StudyguideResponse | null> {
  try {
    return await request<StudyguideResponse>(`/api/streamline/lectures/${id}/studyguide`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** SSE event shapes emitted by the generate stream. Mirrors
 *  streamline-server's `event: phase|section|done|error`. */
export type StudyguideEvent =
  | { type: "phase"; name: string; [k: string]: unknown }
  | { type: "section"; index: number; total: number; markdown: string }
  | { type: "done"; markdown: string; meta: StudyguideMeta | null }
  | { type: "error"; message: string };

/**
 * Trigger studyguide generation and stream progress. The endpoint is a
 * POST SSE, so we can't use EventSource (GET-only) — we read the
 * `fetch` response body and parse SSE frames by hand. Resolves when the
 * stream closes; rejects on a non-2xx open or network error. The server
 * persists the result regardless of whether we read to the end, so a
 * later `getStudyguide` returns the cached markdown.
 */
export async function generateStudyguide(
  id: string,
  onEvent: (ev: StudyguideEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${API_BASE}/api/streamline/lectures/${id}/studyguide`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "text/event-stream" },
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text.slice(0, 300) || "studyguide generation failed");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const ev = parseSseFrame(frame);
      if (ev) onEvent(ev);
    }
  }
}

function parseSseFrame(raw: string): StudyguideEvent | null {
  let eventType = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue; // comment / keep-alive
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (dataLines.length === 0) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
  switch (eventType) {
    case "phase":
      return { type: "phase", name: String(payload.name ?? ""), ...payload };
    case "section":
      return {
        type: "section",
        index: Number(payload.index ?? 0),
        total: Number(payload.total ?? 0),
        markdown: String(payload.markdown ?? ""),
      };
    case "done":
      return {
        type: "done",
        markdown: String(payload.markdown ?? ""),
        meta: (payload.meta as StudyguideMeta | null) ?? null,
      };
    case "error":
      return { type: "error", message: String(payload.message ?? "error") };
    default:
      return null;
  }
}

/** Build an asset URL for use as `<img src>` / `<video src>`. Doesn't fetch
 *  the bytes itself — just returns the URL the browser can load via the
 *  shared session cookie. */
export function assetUrl(lectureId: string, filename: string): string {
  return `${API_BASE}/api/streamline/lectures/${lectureId}/asset/${encodeURI(filename)}`;
}

/** Files at or below this size go up as one legacy PUT (fewer
 *  round-trips; comfortably inside Railway's edge cap on any real
 *  uplink). Mirrors the Mac S3Uploader's `chunkThreshold`. */
const CHUNK_THRESHOLD = 16 * 1024 * 1024;
/** Chunk size for large files. 16 MB ≈ 13 s at 10 Mbps, ~2 min at
 *  1 Mbps — always far below the ~300 s edge cap. */
const CHUNK_SIZE = 16 * 1024 * 1024;
const MAX_UPLOAD_ATTEMPTS = 3;

/**
 * Upload a file (PUT, raw body) directly to streamline-server using a
 * pre-shared URL returned by `createLecture`. These URLs already point
 * at streamline-server (NOT Claraity-web), and the streamline-server's
 * `allow_origins=["*"]` config allows the browser to PUT directly.
 *
 * Mirrors the Mac S3Uploader: files over 16 MB upload as SEQUENTIAL
 * 16 MB chunks, each a separate PUT with `&offset=&total=` appended to
 * the (already `?token=`-carrying) URL. This exists because Railway's
 * edge proxy hard-kills any single request at ~300 s — a multi-GB
 * video on a residential uplink can never finish in one PUT (that's
 * the "Upload failed: HTTP 502" failure). Chunks small enough to
 * finish well inside the cap make total upload time unbounded, and a
 * mid-upload failure only re-sends one chunk instead of restarting
 * the whole file from byte 0.
 *
 * Each request retries up to 3 attempts on transient failures (HTTP
 * 5xx, network error, timeout) with attempt*2s backoff. An HTTP 409
 * means our offset doesn't match the bytes on the server's disk — its
 * body says "Resume from offset N", and the chunk loop restarts there.
 *
 * `onProgress` reports whole-file progress: bytes completed in prior
 * chunks + the in-flight XHR's sent bytes, over the full file size.
 */
/** Message carried by the ApiError a deliberately-aborted upload rejects
 *  with — callers use it to tell "we cancelled this" apart from a real
 *  failure (an aborted sibling must never repaint error state). */
export const UPLOAD_ABORTED = "upload aborted";

export function isUploadAborted(e: unknown): boolean {
  return e instanceof ApiError && e.message === UPLOAD_ABORTED;
}

export function uploadFile(
  url: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const contentType = file.type || "application/octet-stream";
  if (file.size <= CHUNK_THRESHOLD) {
    return putRetrying(url, file, contentType, onProgress, signal);
  }
  return uploadChunked(url, file, contentType, onProgress, signal);
}

async function uploadChunked(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const total = file.size;
  let offset = 0;
  while (offset < total) {
    if (signal?.aborted) throw new ApiError(0, UPLOAD_ABORTED);
    const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, total));
    const base = offset;
    try {
      await putRetrying(
        `${url}&offset=${offset}&total=${total}`,
        chunk,
        contentType,
        (loaded) => {
          if (onProgress) onProgress(Math.min(base + loaded, total), total);
        },
        signal,
      );
    } catch (e) {
      const resume = resumeOffsetFrom409(e);
      if (resume === null || resume >= total) throw e;
      offset = resume;
      continue;
    }
    offset += chunk.size;
    if (onProgress) onProgress(offset, total);
  }
}

/** PUT with up to 3 attempts. Transient failures (HTTP 5xx, network
 *  error, timeout) back off attempt*2s and retry — the server truncates
 *  a retried chunk back to its offset, so re-sending is always safe.
 *  Anything else (4xx incl. 409) throws immediately, as does an abort. */
async function putRetrying(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await putOnce(url, body, contentType, onProgress, signal);
      return;
    } catch (e) {
      if (isUploadAborted(e)) throw e;
      if (!isTransientUploadError(e) || attempt >= MAX_UPLOAD_ATTEMPTS) throw e;
      await sleep(attempt * 2000);
    }
  }
}

/** One PUT of `body`. Chunk PUTs answer
 *  `{jobId, kind, bytes, chunkBytes, complete}`; we track offsets
 *  locally (like the Mac uploader) so the body is only kept for the
 *  409 resume hint. */
function putOnce(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError(0, UPLOAD_ABORTED));
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort);
    const settle = (fn: () => void) => {
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    xhr.open("PUT", url);
    xhr.timeout = 600_000;
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) settle(resolve);
      else settle(() => reject(new ApiError(xhr.status, `upload failed: ${xhr.status}`, xhr.responseText)));
    };
    xhr.onabort = () => settle(() => reject(new ApiError(0, UPLOAD_ABORTED)));
    xhr.onerror = () => settle(() => reject(new ApiError(0, "network error during upload")));
    xhr.ontimeout = () => settle(() => reject(new ApiError(0, "upload timed out")));
    xhr.send(body);
  });
}

function isTransientUploadError(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 0 || e.status >= 500);
}

/** A 409 chunk response carries "Resume from offset N" in its body
 *  (raw FastAPI `{detail}` — uploads bypass the Claraity-web proxy).
 *  Returns N, or null if `e` isn't a parseable 409. */
function resumeOffsetFrom409(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const text = typeof e.body === "string" ? e.body : JSON.stringify(e.body ?? "");
  const m = /Resume from offset (\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
