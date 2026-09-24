// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The authoring workspace (DR-058, playbook-library-52): in place of
// the playbook list, a header with the way back, the draft's id and
// its state chip; the conversation on the left; on the right a pane
// of four tabs — Source, Gears, Machine, Register — with the Compile
// control at the strip's end and the compile watched in a band under
// it. The house divider stands between the panes from the @2xl step
// and turns into the horizontal grip once they stack (DR-030,
// DR-041 §9); each pane scrolls in its own box and the page never
// does. Both splits are app preferences.

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CommandResults,
  DraftInfo,
  PlaybookArtifacts,
} from "@sublang/spex-core/protocol";

import {
  DRAFT_SPLIT_DEFAULT,
  DRAFT_SPLIT_MAX,
  DRAFT_SPLIT_MIN,
  DRAFT_STACK_DEFAULT,
  DRAFT_STACK_MAX,
  DRAFT_STACK_MIN,
  getClient,
  useAppStore,
} from "../state/store.js";
import { draftChipTitle, draftChipTone, draftChipWord } from "../lib/drafts.js";
import { i18n } from "../i18n.js";
import { useClock } from "../lib/useClock.js";
import { CompileBand } from "./CompileBand.js";
import { DraftConversation } from "./DraftConversation.js";
import { DraftRegisterTab } from "./DraftRegisterTab.js";
import { DraftSourceTab } from "./DraftSourceTab.js";
import { Icon, type IconName } from "./Icon.js";
import { GearsItems, StageBox, StateList } from "./PlaybookStages.js";
import { RunningMark } from "./RunningMark.js";
import { SplitDivider } from "./RunView.js";

type Toolchain = CommandResults["compile.check"];
type Tab = "source" | "gears" | "machine" | "register";

/** The four tabs. Each label and hint is read when the strip draws,
 * never when this module loads, so the table never freezes the
 * language it was imported in (localization-4). */
const TABS: readonly { key: Tab; label: string; icon: IconName; hint: string }[] = [
  {
    key: "source",
    get label() {
      return i18n._({ id: "Source", comment: "pipeline stage: the authored workflow" });
    },
    icon: "file",
    get hint() {
      return i18n._("The draft's markdown as it stands on disk");
    },
  },
  {
    key: "gears",
    get label() {
      return i18n._({
        id: "Gears",
        comment: "pipeline stage: the compiler's normative spec items (a proper name)",
      });
    },
    icon: "list",
    get hint() {
      return i18n._("One spec item per state behavior, from the last compile");
    },
  },
  {
    key: "machine",
    get label() {
      return i18n._({ id: "Machine", comment: "tab: the compiled state machine" });
    },
    icon: "hexagon",
    get hint() {
      return i18n._("The compiled state machine, from the last compile");
    },
  },
  {
    key: "register",
    get label() {
      return i18n._({ id: "Register", comment: "tab: write the compiled playbook into the config" });
    },
    icon: "check",
    get hint() {
      return i18n._("Confirm the command, intent, and players");
    },
  },
];

const TONE_CLASSES: Record<string, string> = {
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  neutral: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

/** The draft's state chip (playbook-library-50): one word within the
 * budget, the details in its title, the running mark on a live
 * compile — worn by the list's rows and the workspace header alike. */
export function DraftStateChip({ draft }: { draft: DraftInfo }) {
  const now = useClock(draft.state === "compiling");
  const word = draftChipWord(draft);
  return (
    <span
      data-testid="draft-chip"
      data-state={draft.sourceMissing ? "source-missing" : draft.state}
      title={draftChipTitle(draft, now)}
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${TONE_CLASSES[draftChipTone(draft)]}`}
    >
      {draft.state === "compiling" && !draft.sourceMissing ? (
        <RunningMark running title={i18n._({ id: "Compiling", comment: "the draft's compile is running" })} />
      ) : null}
      {word}
    </span>
  );
}

/** What the thread's last compile line said about the failure, so the
 * band repeats it rather than guessing (playbook-library-58). The line
 * is the core's, printed verbatim, so both the pattern and what it
 * yields are data, never texts of the catalog. */
function threadCompileCaption(lines: readonly { kind: string; text: string }[]): string | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.kind !== "status") continue;
    const match = /^◇\s*Compile failed at [^—]+—\s*(.+)$/u.exec(line.text);
    if (match) return match[1].trim();
    if (/^◇\s*Compil(?:ing|ed)/u.test(line.text)) return undefined;
  }
  return undefined;
}

export function AuthoringWorkspace({
  draftId,
  onBack,
}: {
  draftId: string;
  /** Back to the list; the draft stays open in the core. */
  onBack: () => void;
}) {
  const draft = useAppStore((state) => state.drafts[draftId]);
  const draftView = useAppStore((state) => state.draftViews[draftId]);
  const source = useAppStore((state) => state.draftSources[draftId]);
  const artifacts = useAppStore((state) => state.draftArtifacts[draftId]);
  const composer = useAppStore((state) => state.draftComposers[draftId]);
  const sourceMode = useAppStore((state) => state.draftSourceModes[draftId]);
  const editor = useAppStore((state) => state.draftEditors[draftId]);
  const form = useAppStore((state) => state.draftForms[draftId]);
  const error = useAppStore((state) => state.draftErrors[draftId]);
  const lines = useAppStore((state) => state.compileProgress[draftId]);
  const times = useAppStore((state) => state.compileProgressAt[draftId]);
  const configState = useAppStore((state) => state.configState);
  const readiness = useAppStore((state) => state.readiness);
  const connection = useAppStore((state) => state.connection);
  const draftSplit = useAppStore((state) => state.draftSplit);
  const draftStackSplit = useAppStore((state) => state.draftStackSplit);
  const setDraftSplit = useAppStore((state) => state.setDraftSplit);
  const setDraftStackSplit = useAppStore((state) => state.setDraftStackSplit);
  const sendDraft = useAppStore((state) => state.sendDraft);
  const abortDraft = useAppStore((state) => state.abortDraft);
  const writeDraftSource = useAppStore((state) => state.writeDraftSource);
  const refreshDraftSource = useAppStore((state) => state.refreshDraftSource);
  const compileDraft = useAppStore((state) => state.compileDraft);
  const abortDraftCompile = useAppStore((state) => state.abortDraftCompile);
  const registerDraft = useAppStore((state) => state.registerDraft);
  const setDraftPlayer = useAppStore((state) => state.setDraftPlayer);
  const loadDraftArtifacts = useAppStore((state) => state.loadDraftArtifacts);
  const setDraftComposer = useAppStore((state) => state.setDraftComposer);
  const setDraftSourceMode = useAppStore((state) => state.setDraftSourceMode);
  const setDraftEditor = useAppStore((state) => state.setDraftEditor);
  const setDraftForm = useAppStore((state) => state.setDraftForm);
  const clearDraftError = useAppStore((state) => state.clearDraftError);
  const reportDraftError = useAppStore((state) => state.reportDraftError);

  const [tab, setTab] = useState<Tab>("source");
  const [toolchain, setToolchain] = useState<Toolchain>();
  const [artifactsError, setArtifactsError] = useState<string>();
  const [registerSeen, setRegisterSeen] = useState<string>();
  const splitRef = useRef<HTMLDivElement>(null);
  const connected = connection === "open";

  useEffect(() => {
    if (connected) {
      getClient().command("compile.check", {}).then(setToolchain).catch(() => {});
    }
  }, [connected]);

  // The compiled tabs draw the artifacts of the last successful
  // compile (playbook-library-60); a restored failure may still have a
  // good compile behind it, so any recorded compile asks once.
  const compileAt = draft?.compile?.at;
  const compileOutcome = draft?.compile?.outcome;
  useEffect(() => {
    if (!connected || compileAt === undefined || compileOutcome === "running") return;
    loadDraftArtifacts(draftId)
      .then(() => setArtifactsError(undefined))
      .catch((cause: Error) => setArtifactsError(cause.message));
  }, [connected, draftId, compileAt, compileOutcome, loadDraftArtifacts]);

  const compiledOk = draft?.compile?.outcome === "ok";
  // What the draft holds: a registry never written resolves to every
  // stage absent, which is no compile to show — the tabs stay disabled
  // until one succeeds (playbook-library-60).
  const hasArtifacts = artifacts !== undefined && (artifacts.gears !== null || artifacts.fsm !== null);
  const artifactsReady = compiledOk || hasArtifacts;
  // The Register tab's dot stays until it is opened after the agent's
  // proposal lands (playbook-library-60).
  const registerKey =
    draft && compiledOk
      ? `${draft.compile?.at}:${JSON.stringify(draft.proposal ?? null)}`
      : undefined;
  useEffect(() => {
    if (tab === "register" && registerKey !== undefined) setRegisterSeen(registerKey);
  }, [tab, registerKey]);
  useEffect(() => {
    // A tab that stops being available yields to Source.
    if ((tab === "gears" || tab === "machine") && !artifactsReady) setTab("source");
    if (tab === "register" && !compiledOk) setTab("source");
  }, [tab, artifactsReady, compiledOk]);

  const threadCaption = useMemo(
    () => (draftView ? threadCompileCaption(draftView.view.captain) : undefined),
    [draftView],
  );

  if (!draft) return null;
  const summary = configState?.status === "valid" ? configState.summary : undefined;
  const compiling = draft.activity === "compiling";
  // A diagnostic and the toolchain's guidance are the core's own
  // words; the rest is ours.
  const compileReason = draft.diagnostic
    ? draft.diagnostic
    : !source
    ? i18n._("No source yet")
    : draft.activity === "turn"
      ? i18n._({ id: "Waits for the reply", comment: "why a control is held: the draft's agent turn is running" })
      : compiling
        ? i18n._({ id: "Compiling", comment: "why a control is held: the draft's compile is running" })
        : toolchain && !toolchain.node.ok
          ? toolchain.node.guidance
          : toolchain?.slc.guidance && !toolchain.slc.ok
            ? toolchain.slc.guidance
            : undefined;
  const staleCaption =
    draft.state === "changed"
      ? i18n._("from the compile before this change")
      : !compiledOk && hasArtifacts
        ? i18n._("from the last good compile")
        : undefined;
  const sourceDot = Boolean(source) && (!compiledOk || draft.state === "changed");
  const registerDot = registerKey !== undefined && registerSeen !== registerKey;
  const enabled: Record<Tab, boolean> = {
    source: true,
    gears: artifactsReady,
    machine: artifactsReady,
    register: compiledOk,
  };
  const mode = sourceMode ?? { mode: "view" as const, pasteText: "", pastePath: "" };
  const pickFile = window.spexNative?.pickFile
    ? () => window.spexNative!.pickFile!()
    : undefined;

  const artifactPanel = (kind: "gears" | "machine", loaded: PlaybookArtifacts | undefined) => {
    if (artifactsError && !loaded) {
      return <div className="text-xs text-red-500">{artifactsError}</div>;
    }
    if (!loaded) return <div className="text-xs text-neutral-500">{i18n._({ id: "loading…", comment: "a request for this pane's content is in flight" })}</div>;
    return (
      <div className="flex flex-col gap-2">
        {staleCaption ? (
          <span data-testid="artifact-caption" className="text-xs text-amber-700 dark:text-amber-300">
            {staleCaption}
          </span>
        ) : null}
        {kind === "gears" ? (
          <StageBox id={`draft-${draftId}`} stage={i18n._({ id: "Gears", comment: "pipeline stage: the compiled spec items" })}>
            {loaded.gearsItems ? (
              <GearsItems id={`draft-${draftId}`} file={loaded.gearsItems} />
            ) : loaded.gears ? (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                {loaded.gears}
              </pre>
            ) : (
              <div className="text-xs text-neutral-500">{i18n._("this stage was not found for this draft")}</div>
            )}
          </StageBox>
        ) : (
          <StageBox
            id={`draft-${draftId}`}
            stage={i18n._({ id: "Machine", comment: "pipeline stage: the compiled state machine" })}
            header={
              loaded.stateIds ? <StateList id={`draft-${draftId}`} states={loaded.stateIds} /> : undefined
            }
          >
            {loaded.fsm ? (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                {loaded.fsm}
              </pre>
            ) : (
              <div className="text-xs text-neutral-500">{i18n._("this stage was not found for this draft")}</div>
            )}
          </StageBox>
        )}
      </div>
    );
  };

  return (
    <div data-testid="authoring-workspace" className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-4 py-1.5 text-sm dark:border-neutral-800">
        <button
          type="button"
          data-testid="workspace-back"
          onClick={onBack}
          title={i18n._("Back to the playbook list — the draft stays as it is")}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <span aria-hidden="true">‹</span>
          {i18n._({ id: "Playbooks", comment: "the surface listing every playbook" })}
        </button>
        <span className="min-w-0 truncate font-mono font-semibold" title={draft.id}>
          {draft.id}
        </span>
        <DraftStateChip draft={draft} />
      </header>
      {/* The split is layout by its own width: side by side with the
          divider from 42rem, stacked beneath with the grip between. */}
      <div data-testid="workspace-split" className="@container flex min-h-0 flex-1 flex-col">
        <div
          ref={splitRef}
          style={
            {
              "--draft-split": `${draftSplit}%`,
              "--draft-stack": `${draftStackSplit}%`,
            } as React.CSSProperties
          }
          className="flex min-h-0 flex-1 flex-col gap-3 p-3 @2xl:flex-row"
        >
          <div
            data-testid="conversation-pane"
            className="flex h-(--draft-stack) min-h-0 min-w-0 flex-none flex-col @2xl:h-auto @2xl:w-(--draft-split) @2xl:min-w-[280px]"
          >
            <DraftConversation
              draft={draft}
              draftView={draftView}
              players={summary?.players ?? []}
              captain={summary?.captain}
              readiness={readiness}
              connected={connected}
              composerText={composer?.draft ?? ""}
              error={error}
              onComposerChange={(text) => setDraftComposer(draftId, text)}
              onSend={async (text) => {
                await sendDraft(draftId, text);
              }}
              onAbort={() => void abortDraft(draftId)}
              onPickAgent={(playerId) => setDraftPlayer(draftId, playerId)}
              onDismissError={() => clearDraftError(draftId)}
              onOpenRegister={() => setTab("register")}
              onUseSkill={async () => {
                // playbook-library-84: a picked file is the source when
                // the draft has none, else the paste mode's path for
                // "Use as source" to confirm; with no pick to run, the
                // paste mode with its text focused.
                if (!pickFile) {
                  setDraftSourceMode(draftId, { mode: "paste" });
                  setTab("source");
                  return "paste";
                }
                const picked = await pickFile();
                if (!picked) return null;
                setTab("source");
                if (draft.state === "no-source") {
                  try {
                    await writeDraftSource(draftId, { sourcePath: picked });
                  } catch (cause) {
                    reportDraftError(draftId, (cause as Error).message);
                  }
                  return "field";
                }
                setDraftSourceMode(draftId, { mode: "paste", pastePath: picked, pasteText: "" });
                return "paste";
              }}
            />
          </div>
          <div className="hidden @2xl:contents">
            <SplitDivider
              percent={draftSplit}
              onChange={setDraftSplit}
              containerRef={splitRef}
              label={i18n._("Resize the conversation pane")}
              testId="authoring-divider"
              min={DRAFT_SPLIT_MIN}
              max={DRAFT_SPLIT_MAX}
              defaultPercent={DRAFT_SPLIT_DEFAULT}
            />
          </div>
          <div className="contents @2xl:hidden">
            <SplitDivider
              orientation="horizontal"
              percent={draftStackSplit}
              onChange={setDraftStackSplit}
              containerRef={splitRef}
              label={i18n._("Resize the conversation pane")}
              testId="authoring-grip"
              min={DRAFT_STACK_MIN}
              max={DRAFT_STACK_MAX}
              defaultPercent={DRAFT_STACK_DEFAULT}
            />
          </div>
          <section
            data-testid="artifacts-pane"
            aria-label={i18n._("Draft artifacts")}
            className="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white @2xl:min-w-[280px] dark:border-neutral-800 dark:bg-neutral-900"
          >
            {/* The strip: the tab list, then the Compile control at its
                right end — a sibling, since a tab list holds tabs alone. */}
            <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
              <div
                role="tablist"
                aria-label={i18n._("Draft artifacts")}
                className="flex flex-wrap items-center gap-1"
              >
              {TABS.map((entry) => {
                const on = tab === entry.key;
                const label = entry.label;
                const dot =
                  entry.key === "source" ? sourceDot : entry.key === "register" ? registerDot : false;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    role="tab"
                    id={`draft-tab-${entry.key}`}
                    data-testid={`tab-${entry.key}`}
                    aria-selected={on}
                    aria-controls="draft-tabpanel"
                    aria-label={label}
                    aria-disabled={!enabled[entry.key]}
                    disabled={!enabled[entry.key]}
                    title={enabled[entry.key] ? entry.hint : i18n._({ id: "Compiles first", comment: "why a tab is disabled: nothing to show until a compile succeeds" })}
                    onClick={() => setTab(entry.key)}
                    className={`inline-flex min-h-6 items-center gap-1 rounded-md px-2 text-xs ${
                      on
                        ? "bg-brand-100 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                        : "text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-neutral-300 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {/* Below @xs the tab is its icon and tooltip; the
                        accessible name never changes (DR-041 §9). */}
                    <Icon name={entry.icon} className="h-3.5 w-3.5 @xs:hidden" />
                    <span className="hidden @xs:inline">{label}</span>
                    {dot ? (
                      <span
                        data-testid={`tab-dot-${entry.key}`}
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-amber-500"
                      />
                    ) : null}
                  </button>
                );
              })}
              </div>
              <span className="ml-auto" />
              <button
                type="button"
                data-testid="compile-button"
                disabled={compiling || compileReason !== undefined || !connected}
                title={
                  !connected
                    ? i18n._({ id: "Not connected", comment: "why a control is held: the page has no core" })
                    : (compileReason ?? i18n._("Runs slc over the draft's source — 30 to 120 minutes"))
                }
                onClick={() => void compileDraft(draftId)}
                className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40"
              >
                {compiling ? i18n._({ id: "Compiling…", comment: "a compile is in flight" }) : i18n._({ id: "Compile", comment: "start a compile of the draft's source" })}
              </button>
            </div>
            <CompileBand
              draftId={draftId}
              draft={draft}
              lines={lines ?? []}
              times={times ?? []}
              threadCaption={threadCaption}
              connected={connected}
              onCancel={() => void abortDraftCompile(draftId)}
            />
            <div
              role="tabpanel"
              id="draft-tabpanel"
              aria-labelledby={`draft-tab-${tab}`}
              data-testid={`panel-${tab}`}
              className={`relative flex min-h-0 flex-1 flex-col p-3 ${
                mode.mode === "edit" && tab === "source" ? "" : "overflow-y-auto"
              }`}
            >
              {tab === "source" ? (
                <DraftSourceTab
                  draftId={draftId}
                  draft={draft}
                  source={source}
                  mode={mode}
                  editor={editor}
                  connected={connected}
                  pickFile={pickFile}
                  onMode={(next) => setDraftSourceMode(draftId, next)}
                  onEditor={(next) => setDraftEditor(draftId, next)}
                  onWrite={(input) => writeDraftSource(draftId, input)}
                  onRead={() => refreshDraftSource(draftId)}
                />
              ) : tab === "gears" ? (
                artifactPanel("gears", artifacts)
              ) : tab === "machine" ? (
                artifactPanel("machine", artifacts)
              ) : (
                <DraftRegisterTab
                  draft={draft}
                  source={source}
                  players={summary?.players ?? []}
                  captain={summary?.captain}
                  readiness={readiness}
                  form={form}
                  connected={connected}
                  onForm={(next) => setDraftForm(draftId, next)}
                  onRegister={(input) => registerDraft(draftId, input)}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
