// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Source tab (playbook-library-56, playbook-library-5): the
// draft's `<id>.md` rendered as it stands on disk, refreshed on every
// source message so text appears while the agent writes, captioned
// with who changed it last and when; Edit through the whole-file
// editor idiom with its version-token conflicts (spec-view-48/50);
// Paste — text or a picked file — as the way in for a source of one's
// own. Save and Use as source wait while the agent may be editing the
// same file.

import { useState } from "react";
import type { DraftInfo } from "@sublang/spex-core/protocol";

import type { SpecEditorState } from "../lib/spec-view-model.js";
import type { DraftSourceMode, DraftSourceState } from "../state/store.js";
import { busyReason } from "../lib/drafts.js";
import { relativeAge } from "../lib/time.js";
import { currentLocale } from "../i18n.js";
import { useClock } from "../lib/useClock.js";
import { Markdown } from "./Markdown.js";
import { SpecEditor } from "./SpecEditor.js";

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

export function DraftSourceTab({
  draftId,
  draft,
  source,
  mode,
  editor,
  connected,
  pickFile,
  onMode,
  onEditor,
  onWrite,
  onRead,
}: {
  draftId: string;
  draft: DraftInfo;
  /** The source as last streamed; null with none; undefined until
   * the open replied. */
  source: DraftSourceState | null | undefined;
  mode: DraftSourceMode;
  editor?: SpecEditorState;
  connected: boolean;
  /** The native bridge's file picker, where the shell offers one. */
  pickFile?: () => Promise<string | null>;
  onMode: (mode: Partial<DraftSourceMode>) => void;
  onEditor: (editor: SpecEditorState | undefined) => void;
  onWrite: (input: {
    content?: string;
    sourcePath?: string;
    baseVersion?: string;
  }) => Promise<{ version: string; mtime: number }>;
  onRead: () => Promise<DraftSourceState | null>;
}) {
  const now = useClock(false);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteError, setPasteError] = useState<string>();
  // Save and Use as source wait while a turn or a compile runs
  // (playbook-library-56); Edit and Paste stay open, so the Boss can
  // prepare a change through a long compile and save when it ends.
  const waiting = busyReason(draft);
  const path = `${draftId}.md`;

  if (mode.mode === "edit" && editor) {
    return (
      <div data-testid="source-editor" className="flex min-h-0 flex-1 flex-col">
        <SpecEditor
          key={path}
          state={editor}
          onState={onEditor}
          saveBlocked={waiting}
          onWrite={(content, baseVersion) =>
            onWrite({
              content,
              ...(baseVersion !== undefined ? { baseVersion } : {}),
            })
          }
          onRead={async () => {
            const fresh = await onRead();
            return {
              markdown: fresh?.markdown ?? "",
              ...(fresh?.version ? { version: fresh.version } : {}),
            };
          }}
          onSaved={() => {
            onEditor(undefined);
            onMode({ mode: "view" });
          }}
          onCancel={() => {
            onEditor(undefined);
            onMode({ mode: "view" });
          }}
        />
      </div>
    );
  }

  if (mode.mode === "paste") {
    const canUse =
      connected &&
      !pasteBusy &&
      !waiting &&
      (mode.pasteText.trim().length > 0 || mode.pastePath.trim().length > 0);
    const useAsSource = async (): Promise<void> => {
      if (!canUse) return;
      setPasteBusy(true);
      setPasteError(undefined);
      try {
        const filePath = mode.pastePath.trim();
        await onWrite(filePath ? { sourcePath: filePath } : { content: mode.pasteText });
        onMode({ mode: "view", pasteText: "", pastePath: "" });
      } catch (cause) {
        setPasteError((cause as Error).message);
      } finally {
        setPasteBusy(false);
      }
    };
    return (
      <div data-testid="source-paste" className="flex min-h-0 flex-1 flex-col gap-2">
        <label className="flex min-h-0 flex-col gap-0.5 text-sm">
          <span className="text-xs text-neutral-500">Workflow source</span>
          <textarea
            data-testid="paste-text"
            value={mode.pasteText}
            onChange={(event) => onMode({ pasteText: event.target.value })}
            rows={6}
            placeholder="Paste the playbook source — prose, a SKILL.md, or workflow markdown…"
            className="rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-sm">
          <span className="text-xs text-neutral-500">Source file path (overrides the text)</span>
          <span className="flex items-center gap-1.5">
            <input
              data-testid="paste-path"
              value={mode.pastePath}
              onChange={(event) => onMode({ pastePath: event.target.value })}
              placeholder="/path/to/workflow.md"
              className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
            {pickFile ? (
              <button
                type="button"
                data-testid="paste-pick"
                onClick={() => {
                  void pickFile().then((picked) => {
                    if (picked) onMode({ pastePath: picked });
                  });
                }}
                className={BUTTON_CLASS}
              >
                Pick file
              </button>
            ) : null}
          </span>
        </label>
        {pasteError ? (
          <div
            role="alert"
            data-testid="paste-error"
            className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {pasteError}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="paste-caption" className="text-xs text-neutral-500">
            {waiting ??
              (mode.pastePath.trim()
                ? "The file is copied in as the draft's source"
                : "Replaces the draft's source")}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              data-testid="paste-cancel"
              onClick={() => onMode({ mode: "view" })}
              className={BUTTON_CLASS}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="paste-use"
              disabled={!canUse}
              title={waiting}
              onClick={() => void useAsSource()}
              className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40"
            >
              {pasteBusy ? "Writing…" : "Use as source"}
            </button>
          </span>
        </div>
      </div>
    );
  }

  const openEditor = (): void => {
    onEditor({
      path,
      original: source?.markdown ?? "",
      draft: source?.markdown ?? "",
      ...(source?.version ? { version: source.version } : {}),
      preview: false,
    });
    onMode({ mode: "edit" });
  };

  if (!source) {
    return (
      <div
        data-testid="source-empty"
        className="m-auto flex max-w-sm flex-col items-center gap-2 text-center text-sm text-neutral-500"
      >
        <span>
          No source yet — the agent writes <span className="font-mono">{path}</span> here as
          you talk.
        </span>
        <span className="flex items-center gap-2 text-xs">
          Prefer your own?
          <button
            type="button"
            data-testid="source-paste"
            title="Paste a source or pick a file"
            onClick={() => onMode({ mode: "paste" })}
            className={BUTTON_CLASS}
          >
            Paste
          </button>
        </span>
      </div>
    );
  }

  const who =
    source.by === "agent" ? " by the agent" : source.by === "you" ? " by you" : "";
  return (
    <div data-testid="source-view" className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="source-caption"
          title={new Date(source.mtime).toLocaleString(currentLocale())}
          className="min-w-0 truncate text-xs text-neutral-500"
        >
          Updated {relativeAge(source.mtime, now)}
          {who}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            data-testid="source-edit"
            title="Edit the whole file"
            onClick={openEditor}
            className={BUTTON_CLASS}
          >
            Edit
          </button>
          <button
            type="button"
            data-testid="source-paste"
            title="Replace the source with pasted text or a file"
            onClick={() => onMode({ mode: "paste" })}
            className={BUTTON_CLASS}
          >
            Paste
          </button>
        </span>
      </div>
      <div
        data-testid="source-markdown"
        className="relative min-h-0 flex-1 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
      >
        <Markdown text={source.markdown} links="web-only" />
      </div>
    </div>
  );
}
