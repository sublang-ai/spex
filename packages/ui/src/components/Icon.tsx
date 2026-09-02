// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One icon language (DR-010 §8): inline SVG on currentColor, so every
// glyph inherits the surrounding text color and weight. Replaces the
// mixed emoji/text glyphs whose rendering varies per platform.

import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  folder: (
    <path d="M2.5 4.5A1.5 1.5 0 0 1 4 3h3l1.7 1.8H12A1.5 1.5 0 0 1 13.5 6.3v5.2A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5v-7Z" />
  ),
  gear: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4" />
    </>
  ),
  // The gear names the Settings surface; an in-place editor wears the
  // pencil, so one glyph never means two things (DR-010 §8).
  edit: (
    <path d="M11.4 2.6a1.5 1.5 0 0 1 2 2L6 12l-3 1 1-3 7.4-7.4Z" />
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  // Closing files a thing away; deleting destroys it, so the bin is
  // its own glyph (DR-038, DR-010 §8).
  trash: (
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8M6.8 7v4M9.2 7v4" />
  ),
  refresh: (
    <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.8v2.7h-2.7" />
  ),
  caretDown: <path d="M4 6.5 8 10.5 12 6.5" />,
  caretRight: <path d="M6.5 4 10.5 8 6.5 12" />,
  arrowDown: <path d="M8 3v10M4 9l4 4 4-4" />,
  plus: <path d="M8 3v10M3 8h10" />,
  grid: (
    <>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </>
  ),
  book: (
    <path d="M3 3.5h4a2 2 0 0 1 2 2v7a1.6 1.6 0 0 0-1.6-1.6H3v-7ZM13 3.5H9.6A1.6 1.6 0 0 0 8 5.1v7.4a1.6 1.6 0 0 1 1.6-1.6H13v-7Z" />
  ),
  sidebar: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M6.5 3v10" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

/** 16x16 stroke icon inheriting currentColor. Decorative by default
 * (aria-hidden); the enclosing control carries the accessible name. */
export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "h-4 w-4"}
    >
      {PATHS[name]}
    </svg>
  );
}
