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
      <circle cx="12" cy="5.5" r="2.6" />
      <circle cx="5.5" cy="17.5" r="2.6" />
      <circle cx="18.5" cy="17.5" r="2.6" />
    </svg>
  );
}
