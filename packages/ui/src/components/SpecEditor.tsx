// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The whole-file spec editor (spec-view-48 to spec-view-50; DR-043):
// plain text in a monospace field or a preview rendered as the reader
// renders a record with every link inert, Save under the token the
// read handed out, a conflict strip offering Reload or Overwrite, and
// an inline confirm before any discard. The draft itself is lifted
// state (spec-view-51) — the host keeps it while this component is
// away — so only the transient outcomes live here.

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type { SpecEditorState } from "../lib/spec-view-model.js";
import { keyLabel } from "../lib/shortcuts.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { Markdown } from "./Markdown.js";

export interface SpecEditorProps {
  state: SpecEditorState;
  /** Every draft and mode change lands in the lifted state. */
  onState: (next: SpecEditorState) => void;
  /** Write the draft; no `baseVersion` overwrites (spec-view-47). */
  onWrite: (
    content: string,
    baseVersion?: string,
  ) => Promise<{ version: string }>;
  /** Re-fetch the file for a conflict's Reload (spec-view-50). */
  onRead: () => Promise<{ markdown: string; version?: string }>;
  /** The write landed: the host closes the editor showing `content`. */
  onSaved: (content: string, version: string) => void;
  /** Close without writing; the editor has already asked when dirty. */
  onCancel: () => void;
}

/** Which discard is awaiting its confirm (spec-view-49). */
type Pending = "cancel" | "reload";

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

const TOGGLE_CLASS = (on: boolean) =>
  `rounded border px-2 py-0.5 text-xs ${
    on
      ? "border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950 dark:text-brand-300"
      : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
  }`;

export function SpecEditor({
  state,
  onState,
  onWrite,
  onRead,
  onSaved,
  onCancel,
}: SpecEditorProps) {
  const dirty = state.draft !== state.original;
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<Pending | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  // Async outcomes read the state as it is when they land, not as it
  // was when they started.
  const stateRef = useRef(state);
  stateRef.current = state;

  // The field takes focus on open (DR-010 §6) and, opened from an
  // item, lands its caret on the item's heading line, scrolled into
  // view (spec-view-48). The landing consumes the line, so a later
  // return from Preview leaves the caret where the person left it.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    const line = stateRef.current.caretLine;
    if (line === undefined) return;
    const offset = stateRef.current.draft
      .split("\n")
      .slice(0, line)
      .reduce((sum, text) => sum + text.length + 1, 0);
    field.setSelectionRange(offset, offset);
    const lineHeight = parseFloat(getComputedStyle(field).lineHeight) || 20;
    field.scrollTop = Math.max(0, line - 2) * lineHeight;
    onState({ ...stateRef.current, caretLine: undefined });
    // The landing belongs to the field's mount, not to every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.preview]);

  const save = async (baseVersion: string | undefined) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setConflict(false);
    const content = stateRef.current.draft;
    try {
      const { version } = await onWrite(content, baseVersion);
      onSaved(content, version);
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      if (code === "conflict") setConflict(true);
      else setError((cause as Error).message || "the save failed");
      setBusy(false);
    }
  };

  const reload = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const fresh = await onRead();
      onState({
        ...stateRef.current,
        original: fresh.markdown,
        draft: fresh.markdown,
        version: fresh.version,
        caretLine: undefined,
      });
      setConflict(false);
    } catch (cause) {
      setError((cause as Error).message || "the reload failed");
    } finally {
      setBusy(false);
    }
  };

  // A changed draft is never dropped without asking (spec-view-49);
  // a clean one closes at once.
  const cancel = () => {
    if (dirty) setPending("cancel");
    else onCancel();
  };
  const askReload = () => {
    if (dirty) setPending("reload");
    else void reload();
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "s"
    ) {
      event.preventDefault();
      if (dirty && !busy) void save(state.version);
      return;
    }
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      cancel();
    }
  };

  // The preview renders the draft as the reader renders a record, but
  // nothing here is routable: every link stays inert (spec-view-48).
  const inert = (event: ReactMouseEvent) => {
    if ((event.target as Element | null)?.closest?.("a")) {
      event.preventDefault();
    }
  };

  return (
    <div
      data-testid="spec-editor"
      onKeyDown={onKeyDown}
      className="flex h-full min-h-0 w-full flex-col gap-3 p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1
          className="min-w-0 truncate font-mono text-sm font-semibold"
          title={state.path}
        >
          {state.path}
          {dirty ? (
            <>
              <span className="sr-only">, unsaved changes</span>
              <span aria-hidden="true" data-testid="editor-dirty">
                {" "}
                •
              </span>
            </>
          ) : null}
        </h1>
        <span
          role="group"
          aria-label="Editor mode"
          className="ml-auto flex items-center gap-1"
        >
          <button
            type="button"
            data-testid="editor-edit"
            aria-pressed={!state.preview}
            onClick={() => onState({ ...state, preview: false })}
            className={TOGGLE_CLASS(!state.preview)}
          >
            Edit
          </button>
          <button
            type="button"
            data-testid="editor-preview"
            aria-pressed={state.preview}
            onClick={() => onState({ ...state, preview: true })}
            className={TOGGLE_CLASS(state.preview)}
          >
            Preview
          </button>
        </span>
        <button
          type="button"
          data-testid="editor-cancel"
          onClick={cancel}
          disabled={busy}
          className={BUTTON_CLASS}
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="editor-save"
          onClick={() => void save(state.version)}
          disabled={!dirty || busy}
          title={`Save (${keyLabel("S")})`}
          className={BUTTON_CLASS}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {pending ? (
        <div data-testid="editor-confirm">
          <InlineConfirm
            question={
              pending === "cancel"
                ? "Discard unsaved changes?"
                : "Reload from disk and lose unsaved changes?"
            }
            confirmLabel={pending === "cancel" ? "Discard" : "Reload"}
            cancelLabel="Keep"
            onConfirm={() => {
              setPending(null);
              if (pending === "cancel") onCancel();
              else void reload();
            }}
            onCancel={() => {
              setPending(null);
              fieldRef.current?.focus();
            }}
          />
        </div>
      ) : null}
      {conflict ? (
        <div
          role="alert"
          data-testid="editor-conflict"
          className="flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <span className="min-w-0 flex-1">
            This file changed on disk since you opened it.
          </span>
          <button
            type="button"
            data-testid="editor-reload"
            onClick={askReload}
            disabled={busy}
            className="rounded-md border border-amber-400 px-2 py-0.5 text-xs hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
          >
            Reload
          </button>
          <button
            type="button"
            data-testid="editor-overwrite"
            onClick={() => void save(undefined)}
            disabled={busy}
            className="rounded-md border border-amber-400 px-2 py-0.5 text-xs hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
          >
            Overwrite
          </button>
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          data-testid="editor-error"
          className="flex items-center gap-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => void save(state.version)}
            disabled={busy}
            className="rounded-md border border-red-300 px-2 py-0.5 text-xs hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
          >
            Retry
          </button>
        </div>
      ) : null}
      {state.preview ? (
        <div
          data-testid="editor-preview-pane"
          onClick={inert}
          className="relative min-h-0 flex-1 overflow-auto rounded border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <Markdown text={state.draft} />
        </div>
      ) : (
        <textarea
          ref={fieldRef}
          data-testid="editor-text"
          aria-label={`Edit ${state.path}`}
          spellCheck={false}
          value={state.draft}
          onChange={(event) => onState({ ...state, draft: event.target.value })}
          className="h-full min-h-0 w-full flex-1 resize-none rounded border border-neutral-300 bg-white p-3 font-mono text-sm leading-relaxed text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        />
      )}
    </div>
  );
}
