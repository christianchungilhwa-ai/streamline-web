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

/** SF Symbol "menucard.fill" (Regular-S) — the exact vector exported from
 *  Apple's SF Symbols app: a folded "tent" menu card (tilted body + a
 *  separate triangular top flap) with two text lines cut out (even-odd).
 *  The viewBox + path are the symbol's native coordinate space; the
 *  translate keeps the Regular-S group's origin. Confirmed My Library glyph. */
export function LibraryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="1416 614 68 94"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        transform="translate(1409.32 696)"
        d="M17.2852 0.78125L59.082 8.1543C66.748 9.52148 71.2891 5.22461 71.2891-3.17383L71.2891-49.0723C71.2891-56.9336 67.2852-59.5703 59.6191-60.9375L19.1895-68.0664C13.5254-69.043 9.76562-65.8203 9.76562-60.2051L9.76562-7.86133C9.76562-2.97852 12.3047-0.0488281 17.2852 0.78125ZM28.125-72.3145L60.5957-66.5527C64.1113-65.918 66.9922-64.9902 69.3359-63.6719L69.3359-66.0645C69.3359-74.5117 63.7207-78.5645 54.1992-76.9043ZM24.4141-46.3379C22.9492-46.582 22.1191-47.7051 22.1191-49.2676C22.1191-51.123 23.584-52.2949 25.6348-52.002L55.1758-46.8262C56.7383-46.4844 57.5684-45.6543 57.5684-43.8965C57.5684-42.041 56.25-40.7227 54.1992-41.0645ZM24.4141-30.7129C22.9492-30.9082 22.1191-32.0801 22.1191-33.5938C22.1191-35.4492 23.584-36.6211 25.6348-36.2793L55.1758-31.1523C56.7383-30.8594 57.5684-29.9316 57.5684-28.2715C57.5684-26.3184 56.25-25.0488 54.1992-25.3906Z"
      />
    </svg>
  );
}
