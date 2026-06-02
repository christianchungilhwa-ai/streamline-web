/**
 * One-off custom SVG icons that don't have a clean lucide-react match.
 * Keep this file tiny — drop icons here only when:
 *   - the lucide alternative doesn't fit semantically, AND
 *   - we'd otherwise inline the same SVG more than once.
 *
 * Each icon accepts a `className` so the caller controls size/color
 * (use `text-*` for color since we draw with `fill="currentColor"`).
 */

import type { SVGProps } from "react";

/** Three filled circles arranged in a triangle — used for the
 *  "Community" sidebar tab. The arrangement reads as a small group
 *  of people without explicit body figures, which fits the
 *  "community = broad audience" feel better than lucide's Globe. */
export function CommunityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle cx="12" cy="7.5" r="3.5" />
      <circle cx="7" cy="16.5" r="3.5" />
      <circle cx="17" cy="16.5" r="3.5" />
    </svg>
  );
}

/** Closed book — a left spine + horizontal text lines on the cover
 *  (SF Symbol "text.book.closed.fill"). Matches the iOS app's My Library /
 *  project glyph (ProjectListView + Workflow views) rather than an open book.
 *  Uses evenodd so the spine + text lines read as cut-outs. */
export function LibraryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.5 3H17a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 2.65a.6.6 0 0 0-.6.6v11.5a.6.6 0 0 0 1.2 0V6.25a.6.6 0 0 0-.6-.6Zm3.4 1.6a.7.7 0 1 0 0 1.4h4.7a.7.7 0 1 0 0-1.4h-4.7Zm0 3a.7.7 0 1 0 0 1.4h4.7a.7.7 0 1 0 0-1.4h-4.7Z"
      />
    </svg>
  );
}
