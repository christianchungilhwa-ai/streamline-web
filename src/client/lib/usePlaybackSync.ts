import { useEffect, useRef, useState, type RefObject } from "react";
import type { LectureProject, TranscriptWord } from "./types";

/**
 * Port of Swift `VideoPlaybackCoordinator.updateActiveState`
 * (`Streamline/ViewModels/VideoPlaybackCoordinator.swift:80`).
 *
 * Two-tier resolution:
 *   1. **Primary** — walk each slide's `transcriptVisits`. If the
 *      current time falls inside `[visit.startTime, visit.endTime)`,
 *      that slide is the active one. Inside that visit, walk
 *      `visit.words` to find the active word for sub-line highlighting.
 *
 *   2. **Fallback** — walk the sorted `slideTransitions`. The bracketing
 *      pair (transition[i].timestamp <= t < transition[i+1].timestamp)
 *      tells us which slide was on-screen; we map its `pdfPageIndex`
 *      back to a slideNote (or use slideIndex when there's no PDF
 *      page). This catches the in-between gaps where no visit covers
 *      the current time (e.g., the presenter is silent / off-mic).
 *
 * Returns `{ activeSlideIndex, activeWord }` derived from a 10 Hz
 * `timeupdate`-like loop. The hook uses requestAnimationFrame batched
 * to ~100ms so we don't re-render React at 60 FPS for what's effectively
 * a slow-changing value.
 */
export interface PlaybackSyncResult {
  /** Index into `project.slideNotes` of the currently-active slide, or null. */
  activeSlideIndex: number | null;
  /** The currently-spoken word in the active visit, or null. */
  activeWord: TranscriptWord | null;
  /** Current playback time in seconds (echoed for convenience). */
  currentTime: number;
  /** True while video is playing (not paused). */
  isPlaying: boolean;
}

const TICK_MS = 100;

export function usePlaybackSync(
  videoRef: RefObject<HTMLVideoElement | null>,
  project: LectureProject | null,
): PlaybackSyncResult {
  const [result, setResult] = useState<PlaybackSyncResult>({
    activeSlideIndex: null,
    activeWord: null,
    currentTime: 0,
    isPlaying: false,
  });

  // Precompute a sorted transitions list for the fallback path. Empty
  // array when project hasn't loaded yet — guards the binary-search
  // step below.
  const sortedTransitions = useRef<{ idx: number; t: number; pdfPageIndex: number | null }[]>([]);
  useEffect(() => {
    if (!project) {
      sortedTransitions.current = [];
      return;
    }
    sortedTransitions.current = project.slideTransitions
      .map((t) => ({ idx: t.slideIndex, t: t.timestamp, pdfPageIndex: t.pdfPageIndex }))
      .sort((a, b) => a.t - b.t);
  }, [project]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !project) return;

    let raf = 0;
    let lastTick = 0;

    function compute(t: number): PlaybackSyncResult {
      if (!project) {
        return { activeSlideIndex: null, activeWord: null, currentTime: t, isPlaying: false };
      }

      // ---- Primary: transcript-visit walk -------------------------
      for (let i = 0; i < project.slideNotes.length; i++) {
        const note = project.slideNotes[i];
        for (const visit of note.transcriptVisits) {
          if (t >= visit.startTime && t < visit.endTime) {
            let word: TranscriptWord | null = null;
            if (visit.words?.length) {
              for (const w of visit.words) {
                if (t >= w.start && t < w.end) {
                  word = w;
                  break;
                }
              }
            }
            return {
              activeSlideIndex: i,
              activeWord: word,
              currentTime: t,
              isPlaying: !(video?.paused ?? true),
            };
          }
        }
      }

      // ---- Fallback: slideTransitions binary-bracket --------------
      const transitions = sortedTransitions.current;
      if (transitions.length) {
        let lo = 0;
        let hi = transitions.length - 1;
        let chosen = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (transitions[mid].t <= t) {
            chosen = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (chosen >= 0) {
          const transition = transitions[chosen];
          // Map back to a slideNote: prefer matching by pdfPageIndex,
          // fall back to slideIndex when video-only.
          const matchIdx = project.slideNotes.findIndex((n) =>
            transition.pdfPageIndex !== null
              ? n.pdfPageIndex === transition.pdfPageIndex
              : n.slideIndex === transition.idx,
          );
          if (matchIdx >= 0) {
            return {
              activeSlideIndex: matchIdx,
              activeWord: null,
              currentTime: t,
              isPlaying: !(video?.paused ?? true),
            };
          }
        }
      }

      return {
        activeSlideIndex: null,
        activeWord: null,
        currentTime: t,
        isPlaying: !(video?.paused ?? true),
      };
    }

    function tick(now: number) {
      if (now - lastTick >= TICK_MS) {
        lastTick = now;
        const t = video!.currentTime;
        setResult((prev) => {
          const next = compute(t);
          // Tight diff — avoid re-renders when nothing relevant changed.
          if (
            prev.activeSlideIndex === next.activeSlideIndex &&
            prev.activeWord === next.activeWord &&
            Math.abs(prev.currentTime - next.currentTime) < 0.05 &&
            prev.isPlaying === next.isPlaying
          ) {
            return prev;
          }
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [project, videoRef]);

  return result;
}

/** Seek the video to `t`, accounting for paused/playing state. */
export function seekVideoTo(video: HTMLVideoElement | null, t: number) {
  if (!video) return;
  try {
    video.currentTime = Math.max(0, t);
  } catch {
    // ignore — some readyStates throw on seek
  }
}
