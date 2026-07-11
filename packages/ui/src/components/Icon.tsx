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
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  refresh: (
    <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.8v2.7h-2.7" />
  ),
  caretDown: <path d="M4 6.5 8 10.5 12 6.5" />,
  arrowDown: <path d="M8 3v10M4 9l4 4 4-4" />,
  plus: <path d="M8 3v10M3 8h10" />,
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
