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

/** SF Symbol "menucard.fill" — a filled card with a left-edge margin/spine
 *  and horizontal text lines. The confirmed "My Library" glyph (mirrors
 *  iOS / Claraity). evenodd so the text lines read as cut-outs. */
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
        d="M5.5 3h13a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 4a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5h-9zm0 3a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5h-9zm0 3a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5h-6z"
      />
    </svg>
  );
}
