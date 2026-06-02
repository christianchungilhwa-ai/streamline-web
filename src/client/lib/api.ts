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

/**
 * Upload a file (PUT, raw body) directly to streamline-server using a
 * pre-shared URL returned by `createLecture`. These URLs already point
 * at streamline-server (NOT Claraity-web), and the streamline-server's
 * `allow_origins=["*"]` config allows the browser to PUT directly.
 *
 * Returns a Promise that resolves on completion (one progress callback
 * per upload chunk, derived from the XHR `progress` event).
 */
export function uploadFile(
  url: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(xhr.status, `upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new ApiError(0, "network error during upload"));
    xhr.send(file);
  });
}
