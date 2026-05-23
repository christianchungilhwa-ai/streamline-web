import { type RefObject } from "react";

export interface VideoPlayerProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string;
  className?: string;
}

/**
 * Thin HTMLVideoElement wrapper. Exposes the underlying element via
 * `videoRef` so the parent (`LectureViewerPage`) can drive playback
 * from `usePlaybackSync` + `seekVideoTo`.
 *
 * No custom controls today — the browser-native ones are fine for a v1.
 * `crossOrigin="use-credentials"` is required because the video bytes
 * come from a credentialed asset proxy route on Claraity-web.
 */
export function VideoPlayer({ videoRef, src, className }: VideoPlayerProps) {
  return (
    <video
      ref={videoRef}
      src={src}
      controls
      playsInline
      preload="metadata"
      crossOrigin="use-credentials"
      className={className ?? "w-full rounded-lg bg-black"}
    />
  );
}
