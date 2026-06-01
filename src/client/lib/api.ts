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

export function startLecture(id: string) {
  return request<{ jobId: string; executionArn?: string }>(`/api/streamline/lectures/${id}/start`, {
    method: "POST",
  });
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
