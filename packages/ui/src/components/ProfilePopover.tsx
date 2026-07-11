// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// In-place profile editor (DR-009, RUN-32): an anchored popover that
// switches a profile reference and edits the selected profile's
// essentials without leaving the surface. Pure props so RUN-35 can
// exercise it without a live core.

import { useEffect, useRef, useState } from "react";
import type {
  ProfileSummary,
  ReadinessEntry,
} from "@sublang/spex-core/protocol";

const EFFORTS = ["", "minimal", "low", "medium", "high", "xhigh", "max"];

export interface ProfilePopoverProps {
  title: string;
  profiles: ProfileSummary[];
  readiness: ReadinessEntry[];
  /** The currently referenced profile id (or adapter shorthand). */
  currentRef: string;
  onSelect: (ref: string) => Promise<unknown> | void;
  onSaveProfile: (
    profile: ProfileSummary,
    patch: { model?: string; reasoningEffort?: string },
  ) => Promise<unknown>;
  onOpenSettings?: () => void;
  onClose: () => void;
}

export function ProfilePopover(props: ProfilePopoverProps) {
  const { profiles, readiness, currentRef } = props;
  const selected = profiles.find((profile) => profile.id === currentRef);
  const [model, setModel] = useState(selected?.model ?? "");
  const [effort, setEffort] = useState(selected?.reasoningEffort ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setModel(selected?.model ?? "");
    setEffort(selected?.reasoningEffort ?? "");
  }, [selected?.id, selected?.model, selected?.reasoningEffort]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) props.onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty =
    selected !== undefined &&
    (model !== (selected.model ?? "") ||
      effort !== (selected.reasoningEffort ?? ""));

  function save() {
    if (!selected || !dirty) return;
    setBusy(true);
    setError(undefined);
    Promise.resolve(
      props.onSaveProfile(selected, {
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(effort ? { reasoningEffort: effort } : {}),
      }),
    )
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setBusy(false));
  }

  return (
    <div
      ref={rootRef}
      data-testid="profile-popover"
      className="absolute bottom-full right-0 z-20 mb-1 w-80 rounded-lg border border-neutral-200 bg-white p-2 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
    >
      <div className="px-1 pb-1 text-xs font-semibold text-neutral-500">
        {props.title}
      </div>
      <div className="flex max-h-48 flex-col overflow-y-auto">
        {profiles.map((profile) => {
          const entry = readiness.find(
            (item) => item.profileId === profile.id,
          );
          return (
            <button
              key={profile.id}
              type="button"
              data-testid={`profile-option-${profile.id}`}
              onClick={() => {
                setError(undefined);
                void Promise.resolve(props.onSelect(profile.id)).catch(
                  (cause: Error) => setError(cause.message),
                );
              }}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                profile.id === currentRef
                  ? "bg-indigo-50 dark:bg-indigo-950"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800"
              }`}
            >
              <span className="font-mono text-xs font-semibold">
                {profile.id}
              </span>
              <span className="truncate text-xs text-neutral-500">
                {profile.model ?? profile.adapter}
              </span>
              <span className="ml-auto">
                {entry?.ready === true ? (
                  <span className="text-emerald-500" title="ready">
                    ●
                  </span>
                ) : entry?.ready === false ? (
                  <span className="text-red-500" title={entry.requirement}>
                    ●
                  </span>
                ) : null}
              </span>
              {profile.id === currentRef ? (
                <span className="text-indigo-500">✓</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="mt-1 border-t border-neutral-100 pt-2 dark:border-neutral-800">
          <div className="px-1 pb-1 text-[11px] text-neutral-400">
            Edit <span className="font-mono">{selected.id}</span>
          </div>
          <div className="flex flex-col gap-1.5 px-1">
            <input
              data-testid="popover-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={`model (default for ${selected.adapter})`}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            />
            <div className="flex items-center gap-2">
              <select
                data-testid="popover-effort"
                value={effort}
                onChange={(event) => setEffort(event.target.value)}
                className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
              >
                {EFFORTS.map((name) => (
                  <option key={name} value={name}>
                    {name || "effort (default)"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid="popover-save"
                disabled={!dirty || busy}
                onClick={save}
                className="ml-auto rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mx-1 mt-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {props.onOpenSettings ? (
        <button
          type="button"
          onClick={props.onOpenSettings}
          className="mt-1 w-full rounded-md px-2 py-1 text-left text-[11px] text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          All settings (permissions, new profiles…) →
        </button>
      ) : null}
    </div>
  );
}
