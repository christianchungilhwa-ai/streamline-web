/**
 * Studyguide-specific API surface — the resolved-rendering / section-
 * regeneration additions layered on top of the base client in api.ts.
 *
 * Kept separate so the base client stays a faithful mirror of
 * Claraity-web's proxy routes while the studyguide viewer evolves.
 * Same conventions: cookie-credentialed fetches against
 * `/api/streamline/*`, `{error}` bodies normalized into ApiError.
 */

import { ApiError, getStudyguide, type StudyguideMeta, type StudyguideResponse } from "./api";

/** Mirrors api.ts — "" in dev (Vite proxy), https://claraity.app in prod. */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

// ---- Types ----------------------------------------------------------------

/** One section row from the planner blueprint persisted in
 *  `studyguide.meta.json` (see streamline-server's
 *  StudyguideSection.to_dict). Only `sectionIndex` + `title` are
 *  needed client-side; the rest is carried for completeness. */
export interface SgBlueprintSection {
  sectionIndex: number;
  title: string;
  summary?: string;
  slideIndices?: number[];
  objectives?: string[];
}

/** The GET /studyguide payload once the server-side visual resolution
 *  pass exists: the raw `markdown` field is unchanged, and
 *  `resolvedMarkdown` (when present) carries the fully-resolved text —
 *  slide/nano images as relative `studyguide_images/<file>` refs,
 *  drawio + sg-pair regions as fenced code blocks. */
export interface ResolvedStudyguide extends StudyguideResponse {
  resolvedMarkdown?: string | null;
  /** True while the server is producing the resolved copy on a
   *  background thread (resolution can take minutes of image-gen /
   *  render time). The viewer shows the raw copy and polls until the
   *  resolved payload lands. */
  resolving?: boolean;
}

// ---- Helpers --------------------------------------------------------------

/** Safely narrow `meta.blueprint` (typed `unknown` in api.ts) into the
 *  section list the regenerate submenu needs. Returns [] whenever the
 *  payload predates the blueprint sidecar or has an unexpected shape. */
export function blueprintSections(meta: StudyguideMeta | null | undefined): SgBlueprintSection[] {
  const bp = meta?.blueprint;
  if (!bp || typeof bp !== "object") return [];
  const sections = (bp as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((s, i) => {
    if (!s || typeof s !== "object") return [];
    const rec = s as Record<string, unknown>;
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    if (!title) return [];
    return [
      {
        sectionIndex: typeof rec.sectionIndex === "number" ? rec.sectionIndex : i,
        title,
        summary: typeof rec.summary === "string" ? rec.summary : undefined,
        slideIndices: Array.isArray(rec.slideIndices)
          ? rec.slideIndices.filter((n): n is number => typeof n === "number")
          : undefined,
        objectives: Array.isArray(rec.objectives)
          ? rec.objectives.filter((o): o is string => typeof o === "string")
          : undefined,
      },
    ];
  });
}

/** URL for a resolved-studyguide image (`studyguide_images/<file>` on
 *  the server). Like api.ts's assetUrl, this only builds the URL — the
 *  browser loads the bytes via the shared session cookie. */
export function sgAssetUrl(lectureId: string, filename: string): string {
  return `${API_BASE}/api/streamline/lectures/${lectureId}/sg-asset/${encodeURIComponent(filename)}`;
}

/** The markdown the viewer should render: the server-resolved text when
 *  the payload carries it, else the raw writer output. */
export function displayMarkdown(sg: ResolvedStudyguide): { markdown: string; resolved: boolean } {
  const resolved = sg.resolvedMarkdown;
  if (typeof resolved === "string" && resolved.trim().length > 0) {
    return { markdown: resolved, resolved: true };
  }
  return { markdown: sg.markdown, resolved: false };
}

// ---- Calls ----------------------------------------------------------------

/** getStudyguide, typed to surface `resolvedMarkdown` (the proxy passes
 *  the field through untouched; api.ts's type just predates it). */
export async function getResolvedStudyguide(id: string): Promise<ResolvedStudyguide | null> {
  return (await getStudyguide(id)) as ResolvedStudyguide | null;
}

/**
 * Re-run the section writer for one blueprint section and return the
 * re-stitched studyguide — same payload shape as GET /studyguide
 * (including `resolvedMarkdown`). Long-running: the server re-prompts
 * the writer model for that section, so this can take ~a minute.
 */
export async function regenerateStudyguideSection(
  id: string,
  sectionIndex: number,
  signal?: AbortSignal,
): Promise<ResolvedStudyguide> {
  const url = `${API_BASE}/api/streamline/lectures/${id}/studyguide/sections/${sectionIndex}/regenerate`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
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
      parsed && typeof parsed === "object" && "error" in parsed &&
      typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `Section regenerate failed: ${res.status}`;
    throw new ApiError(res.status, msg, parsed);
  }
  return parsed as ResolvedStudyguide;
}

/** Client-side .md download of the (resolved) studyguide markdown. */
export function downloadMarkdownFile(markdown: string, filename = "studyguide.md"): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
