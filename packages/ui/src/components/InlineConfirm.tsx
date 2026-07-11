// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The one destructive-action confirm (DR-010 §4): inline, safe
// default focused so a keyboard user's next Enter cancels, Escape
// cancels, and the confirm never moves focus to <body>.

export function InlineConfirm({
  question,
  confirmLabel = "yes",
  cancelLabel = "no",
  onConfirm,
  onCancel,
}: {
  question: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <span
      className="flex items-center gap-1 text-xs"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      {question}
      <button
        type="button"
        className="rounded border border-red-300 px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        // Safe default: focus lands here, Enter backs out.
        autoFocus
        className="rounded border border-neutral-300 px-1.5 py-0.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
    </span>
  );
}
