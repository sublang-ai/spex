// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The one record row (dashboard-40, spec-view-7): an identifier chip,
// a truncating title, and an optional trailing slot, activating as a
// button that opens the record in the records reader — the Specs
// decisions branch, History, Sources, and the Up next menu draw it
// alike. A record opens in place, so the row reads as an in-app row —
// hover background, pointer, no underline; the brand-coloured
// underline link stays reserved for what leaves the app, issues and
// PRs (DR-013).

import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { SpecRecordInfo } from "@sublang/spex-core/protocol";

/** The identifier chip the package rows of the Specs outline wear
 * (spec-view-2): a record's ID wears the same one. */
export const RECORD_CHIP =
  "shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";

export type RecordRowProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type"
> & {
  record: Pick<SpecRecordInfo, "id" | "title">;
  /** Content after the title — a verdict tag, a state. */
  trailing?: ReactNode;
};

export function RecordRow({
  record,
  trailing,
  className = "",
  ...rest
}: RecordRowProps) {
  const opener = record.title
    ? `Open ${record.id}: ${record.title}`
    : `Open ${record.id}`;
  return (
    <button
      type="button"
      data-testid={`record-row-${record.id}`}
      title={`Open ${record.id}`}
      aria-label={opener}
      className={`flex min-h-6 min-w-0 cursor-pointer items-center gap-2 rounded px-1 text-left hover:bg-neutral-100 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-neutral-800 ${className}`}
      {...rest}
    >
      <span className={RECORD_CHIP}>{record.id}</span>
      <span className="min-w-0 flex-1 truncate">{record.title}</span>
      {trailing}
    </button>
  );
}
