// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-29/31/35: the project start explains its scope, discovers
// playbooks through slash, and tunes the Captain in place (DR-138).

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

afterEach(cleanup);

import { CaptainHome, popoverRoom } from "./CaptainHome.js";

const PROJECT = { id: "p1", path: "/tmp/demo", name: "demo", registeredAt: 0 };

import type {
  AgentSummary,
  IntentInfo,
  PlaybookSummary,
  QueueSchedule,
  ReadinessEntry,
  SpecTreeState,
} from "@sublang/spex-core/protocol";
import type { ComposerAttachmentControls } from "./ComposerAttachments.js";
import type { AgentPatch } from "../lib/config-ops.js";
import { keyLabel } from "../lib/shortcuts.js";
import {
  setClientForTests,
  useAppStore,
  type StagedIntent,
} from "../state/store.js";

// A hand-written `instruction` rides along in the summary: the editor
// never surfaces it, so a merge patch must leave it out (DR-019).
const CAPTAIN: AgentSummary = {
  adapter: "claude",
  model: "claude-opus-4-8",
  effort: "high",
  instruction: "Route the boss's words to a playbook.",
  permissions: { mode: "auto" },
};

const READY: ReadinessEntry[] = [
  {
    adapter: "claude",
    ready: true,
    usedBy: ["captain", "code.coder"],
    fastModeSupported: true, subagentModelSupported: true,
  },
];

const PLAYBOOKS: PlaybookSummary[] = [
  {
    id: "code",
    from: "@sublang/playbook/code/registry",
    command: "code",
    intent: "software development workflow",
    roles: { coder: { playerId: "dev.coder", display: "claude-opus-5" } },
  },
  {
    id: "review",
    from: "@sublang/playbook/review/registry",
    command: "review",
    intent: "design review",
    roles: { host: { playerId: "dev.coder", display: "claude-opus-5" } },
  },
];

function renderHome({
  attachments = undefined as ComposerAttachmentControls | undefined,
  onStart = vi.fn(async () => {}),
  onSaveCaptain = vi.fn(async (_patch: AgentPatch) => {}),
  onNavigate = vi.fn(),
  onOpenPalette = vi.fn(),
  onOpenOwnProject = vi.fn(),
  hasProject = true,
  hasProjects = true,
  playbooks = PLAYBOOKS as PlaybookSummary[],
  specTree = undefined as SpecTreeState | undefined,
  specError = undefined as string | undefined,
  onOpenSpecs = undefined as (() => void) | undefined,
  // null renders the no-captain state; undefined would fall back to
  // this default the way an omitted option does.
  captain = CAPTAIN as AgentSummary | null,
  onRecheckReadiness = undefined as (() => Promise<unknown>) | undefined,
  readiness = READY,
  configStatus = undefined as "valid" | "invalid" | "missing" | undefined,
  configErrors = undefined as string[] | undefined,
  next = undefined as
    | { intent: IntentInfo; schedule: QueueSchedule; more: number }
    | undefined,
  onStartIntent = undefined as
    | ((intent: IntentInfo) => Promise<void>)
    | undefined,
  staged = undefined as StagedIntent | undefined,
  onDetachStaged = undefined as (() => void) | undefined,
  onQueueInstead = undefined as ((text: string) => Promise<void>) | undefined,
} = {}) {
  const view = render(
    <CaptainHome
      hasProject={hasProject}
      hasProjects={hasProjects}
      projectName={hasProject ? PROJECT.name : undefined}
      specTree={specTree}
      specError={specError}
      onOpenSpecs={onOpenSpecs}
      playbooks={playbooks}
      captain={captain ?? undefined}
      readiness={readiness}
      connected
      configStatus={configStatus}
      configErrors={configErrors}
      onRecheckReadiness={onRecheckReadiness}
      onOpenPalette={onOpenPalette}
      onOpenOwnProject={onOpenOwnProject}
      onNavigate={onNavigate}
      onSaveCaptain={onSaveCaptain}
      onStart={onStart}
      attachments={attachments}
      next={next}
      onStartIntent={onStartIntent}
      staged={staged}
      onDetachStaged={onDetachStaged}
      onQueueInstead={onQueueInstead}
    />,
  );
  return {
    onStart,
    onSaveCaptain,
    onNavigate,
    onOpenPalette,
    onOpenOwnProject,
    view,
  };
}

describe("RUN-29: captain home structure and one-motion start", () => {
  test("project task framing, composer, and Captain role render", () => {
    renderHome();
    expect(screen.getByText("What would you change in demo?")).toBeTruthy();
    expect(screen.getByTestId("start-composer")).toBeTruthy();
    const chip = screen.getByTestId("agent-chip");
    expect(chip.textContent).toContain("claude · claude-opus-4-8 @ high");
    expect(chip.getAttribute("aria-label")).toBe("Captain: claude · claude-opus-4-8 @ high (ready)");
    const settings = screen.getByTestId("captain-settings");
    expect(settings.contains(chip)).toBe(true);
    expect(settings.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("project-task-start").className).toContain("w-full");
  });

  test("a config with no captain reads as not set, model control inert", () => {
    renderHome({ captain: null, configStatus: "invalid" });
    expect(screen.queryByTestId("agent-chip")).toBeNull();
    expect(screen.getByText("not set")).toBeTruthy();
    expect(
      (screen.getByTestId("captain-settings") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test("submitting in the bar's project starts with the text", async () => {
    const { onStart } = renderHome();
    fireEvent.change(screen.getByTestId("start-composer"), {
      target: { value: "fix the bug" },
    });
    fireEvent.click(screen.getByTestId("start-send"));
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledWith("fix the bug"));
  });

  test("with no project registered, welcome gives two clear paths without Captain chrome", () => {
    const { onOpenOwnProject } = renderHome({ hasProject: false, hasProjects: false,
      readiness: [{ adapter: "claude", ready: false, requirement: "sign in", usedBy: ["captain"], fastModeSupported: true, subagentModelSupported: true }],
    });
    expect(screen.getByTestId("welcome-home")).toBeTruthy();
    expect(screen.getByText("Define checkable specs. Deliver through playbooks.")).toBeTruthy();
    expect(screen.getByText("Specs")).toBeTruthy();
    expect(screen.getByText("Define goals and acceptance criteria")).toBeTruthy();
    expect(screen.getByText("Playbooks")).toBeTruthy();
    expect(screen.getByText("Compile natural-language playbooks into executable workflows")).toBeTruthy();
    expect(screen.getByText("Delivery")).toBeTruthy();
    expect(screen.getByText("Coordinate AI implementation and review, with traceable changes")).toBeTruthy();
    const primary = screen.getByTestId("home-add-project");
    const academy = screen.getByTestId("home-academy");
    expect(primary.className).toContain("bg-brand-600");
    expect(academy.className).toContain("border-neutral-300");
    expect(primary.compareDocumentPosition(academy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("home-academy").textContent).toContain("Academy example project");
    expect(screen.queryByText(/does not play a recorded task yet/)).toBeNull();
    expect(screen.queryByTestId("start-composer")).toBeNull();
    expect(screen.queryByTestId("quick-start")).toBeNull();
    expect(screen.queryByTestId("captain-readiness")).toBeNull();
    fireEvent.click(screen.getByTestId("home-add-project"));
    expect(onOpenOwnProject).toHaveBeenCalledOnce();
  });

  test("task scope and slash discovery sit outside the input", () => {
    renderHome();
    expect(screen.getByText(/Specs clarify goals and acceptance criteria/)).toBeTruthy();
    const hint = document.getElementById("start-playbook-hint")!;
    expect(hint.textContent).toBe("Type / in the task box to see all 2 playbooks");
    expect(hint.querySelector("code")?.textContent).toBe("/");
    expect(hint.compareDocumentPosition(screen.getByTestId("composer-box")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    const field = screen.getByLabelText("Describe a project task");
    expect(field).toBe(screen.getByTestId("start-composer"));
    expect(field.getAttribute("aria-describedby")).toBe("start-playbook-hint");
    expect(screen.getByText("Describe a project task").className).toContain("sr-only");
    expect(screen.queryByTestId("quick-start")).toBeNull();
    expect(screen.queryByText("/ for playbooks · Enter sends")).toBeNull();
    expect(screen.getByTestId("start-send").textContent).toBe("Start task");
    expect(screen.getByTestId("start-send").title).toBe(
      "Enter to send · Shift+Enter for a new line",
    );
  });

  test("a quiet preview explains only configured playbooks without another command control", () => {
    const inspect: PlaybookSummary = {
      id: "inspect", from: "@sublang/playbook/inspect/registry", command: "inspect",
      intent: "inspect supplied material or a running web interface and explain observed evidence without changing the repository",
      roles: {},
    };
    renderHome({ playbooks: [
      { ...PLAYBOOKS[1], intent: "review a supplied scope of committed work until no unsettled findings remain" },
      inspect,
      { ...PLAYBOOKS[0], intent: "implement a coding intent in reviewed, one-commit phases, using an intent record when needed" },
    ] });
    const preview = screen.getByTestId("playbook-preview");
    expect(preview.textContent).toContain("like a Skill compiled into an executable workflow");
    expect(preview.textContent).toContain("/code");
    expect(preview.textContent).toContain("/review");
    expect(preview.textContent).not.toContain("/inspect");
    expect(preview.querySelectorAll("p")).toHaveLength(1);
    expect(preview.querySelectorAll("button")).toHaveLength(0);
    const hint = document.getElementById("start-playbook-hint")!;
    expect(hint.textContent).toBe("Type / in the task box to see all 3 playbooks");
    expect(preview.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview.textContent).toContain("implement in reviewed phases");
    expect(preview.textContent).toContain("review committed changes");
    expect(preview.querySelector("code")?.className).toBe(hint.querySelector("code")?.className);
  });

  test("no playbook preview appears without configured playbooks", () => {
    renderHome({ playbooks: [] });
    expect(screen.queryByTestId("playbook-preview")).toBeNull();
  });

  test("existing project specs are counted and open the pinned Specs tab", () => {
    const onOpenSpecs = vi.fn();
    const specTree: SpecTreeState = {
      present: true, legacy: false, decisions: [], intents: [], notices: [], readAt: 1,
      files: [
        { path: "specs/packages/design.md", key: "design", dir: "", basename: "design", notices: [], items: [
          { id: "design-1", group: "external", section: "External Behavior", firstLine: "A checkable goal", text: "A checkable goal", cites: [] },
        ] },
        { path: "specs/packages/git.md", key: "git", dir: "", basename: "git", notices: [], items: [] },
      ],
    };
    renderHome({ specTree, onOpenSpecs });
    const status = screen.getByTestId("project-spec-status");
    expect(status.textContent).toContain("2 packages · 1 item");
    fireEvent.click(within(status).getByRole("button", { name: "View specs" }));
    expect(onOpenSpecs).toHaveBeenCalledOnce();
  });

  test("a missing specs tree offers guidance without presenting a false count", () => {
    const onOpenSpecs = vi.fn();
    const view = renderHome({ onOpenSpecs });
    const status = screen.getByTestId("project-spec-status");
    expect(status.textContent).toBe("Reading project specs…");
    expect(status.querySelector("button")).toBeNull();
    view.view.rerender(<CaptainHome hasProject hasProjects projectName="demo" playbooks={PLAYBOOKS} readiness={READY} connected
      onOpenPalette={vi.fn()} onNavigate={vi.fn()} onSaveCaptain={vi.fn(async () => {})} onStart={vi.fn(async () => {})}
      specTree={{ present: false, legacy: false, files: [], decisions: [], intents: [], notices: [], readAt: 1 }}
      onOpenSpecs={onOpenSpecs} />);
    expect(status.textContent).toContain("No project specs yet");
    fireEvent.click(within(status).getByRole("button", { name: "See how to start" }));
    expect(onOpenSpecs).toHaveBeenCalledOnce();
  });

  test("submitting without a project opens the palette, draft intact", () => {
    const { onStart, onOpenPalette } = renderHome({ hasProject: false,
      readiness: [{ adapter: "claude", ready: false, requirement: "sign in", usedBy: ["captain"], fastModeSupported: true, subagentModelSupported: true }],
    });
    expect(screen.getByText(/Pick a project in the sidebar/)).toBeTruthy();
    expect(screen.getByTestId("start-send").title).toBe(
      `Pick a project first (${keyLabel("P")})`,
    );
    const composer = screen.getByTestId(
      "start-composer",
    ) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "do it" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(onStart).not.toHaveBeenCalled();
    expect(onOpenPalette).toHaveBeenCalled();
    expect(composer.value).toBe("do it");
  });
});

describe("run-view-168: with nothing registered, the welcome page carries the ways in", () => {
  test("a seeding failure lands on the page, the controls stay", async () => {
    useAppStore.setState({
      openAcademyExample: vi.fn(async (): Promise<never> => {
        throw new Error("target directory is not empty");
      }),
    });
    renderHome({ hasProject: false, hasProjects: false });
    fireEvent.click(screen.getByTestId("home-academy"));
    await vi.waitFor(() =>
      expect(screen.getByText(/not empty/).textContent).toBeTruthy(),
    );
    expect(
      (screen.getByTestId("home-academy") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  test("with projects to pick from, the greeting carries no add controls", () => {
    renderHome({ hasProject: false, hasProjects: true });
    expect(screen.queryByTestId("home-add-project")).toBeNull();
    expect(screen.queryByTestId("home-academy")).toBeNull();
  });
});

describe("RUN-31: slash menu discovery", () => {
  test("typing / lists playbooks with intents and filters by prefix", () => {
    renderHome();
    const composer = screen.getByTestId("start-composer");
    fireEvent.change(composer, { target: { value: "/" } });
    expect(screen.getByTestId("slash-menu").textContent).toContain("/code");
    expect(screen.getByTestId("slash-menu").textContent).toContain(
      "design review",
    );
    fireEvent.change(composer, { target: { value: "/re" } });
    const menu = screen.getByTestId("slash-menu");
    expect(menu.textContent).toContain("/review");
    expect(menu.textContent).not.toContain("/code");
  });

  test("selecting from the slash menu inserts without dispatching", async () => {
    const { onStart } = renderHome();
    const composer = screen.getByTestId(
      "start-composer",
    ) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "/co" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(composer.value).toBe("/code ");
    expect(onStart).not.toHaveBeenCalled();
  });

  test("no command list at rest; slash shows every configured playbook", () => {
    renderHome();
    expect(screen.queryByTestId("slash-menu")).toBeNull();
    fireEvent.change(screen.getByTestId("start-composer"), { target: { value: "/" } });
    const menu = screen.getByTestId("slash-menu");
    expect(menu.textContent).toContain("/code");
    expect(menu.textContent).toContain("/review");
  });
});

describe("RUN-35: in-place captain agent editing (DR-019)", () => {
  test("the gear opens the shared editor over the captain's block", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("captain-settings"));
    const popover = screen.getByTestId("agent-popover");
    expect(popover.getAttribute("aria-label")).toBe("Captain agent");
    expect(within(popover).getByTestId("agent-editor")).toBeTruthy();
    // Every adapter the embedded runtime knows is offered, the
    // captain's own selected, and readiness rides on the choice.
    for (const adapter of ["claude", "codex", "gemini", "kimi", "opencode"]) {
      expect(within(popover).getByTestId(`agent-adapter-${adapter}`)).toBeTruthy();
    }
    expect(
      within(popover)
        .getByTestId("agent-adapter-claude")
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(within(popover).getByTitle("ready")).toBeTruthy();
    expect(
      (within(popover).getByTestId("agent-model") as HTMLInputElement).value,
    ).toBe("claude-opus-4-8");
    // Copying from the Captain is meaningless in the Captain's own
    // editor: the action is absent here (DR-019).
    expect(within(popover).queryByTestId("agent-same-as-captain")).toBeNull();
  });

  test("a model edit saves a merge patch and never leaves the home", async () => {
    const { onSaveCaptain } = renderHome();
    fireEvent.click(screen.getByTestId("captain-settings"));
    fireEvent.change(screen.getByTestId("agent-model"), {
      target: { value: "claude-opus-4-8[1m]" },
    });
    fireEvent.click(screen.getByTestId("agent-save"));
    await vi.waitFor(() =>
      expect(onSaveCaptain).toHaveBeenCalledWith({
        adapter: "claude",
        model: "claude-opus-4-8[1m]",
        effort: "high",
        permissions: { mode: "auto" },
      }),
    );
    // The patch carries the surfaced keys only: the hand-written
    // instruction survives by being absent from the patch.
    expect(onSaveCaptain.mock.calls[0][0]).not.toHaveProperty("instruction");
    await vi.waitFor(() =>
      expect(screen.queryByTestId("agent-popover")).toBeNull(),
    );
    // Never navigated anywhere: the home is still mounted.
    expect(screen.getByTestId("captain-home")).toBeTruthy();
  });

  test("an adapter switch resets tuning through the same patch path", async () => {
    const { onSaveCaptain } = renderHome({
      captain: { ...CAPTAIN, fastMode: true },
    });
    fireEvent.click(screen.getByTestId("captain-settings"));
    fireEvent.click(screen.getByTestId("agent-adapter-codex"));
    fireEvent.click(screen.getByTestId("agent-save"));
    await vi.waitFor(() =>
      expect(onSaveCaptain).toHaveBeenCalledWith({
        adapter: "codex",
        model: null,
        effort: null,
        fastMode: null,
        permissions: { mode: "auto" },
      }),
    );
  });
});

describe("RUN-44: broken config surfaces in the thread", () => {
  test("an invalid config renders the errors and a Settings link", () => {
    const { onNavigate } = renderHome({
      configStatus: "invalid",
      configErrors: ["playbooks.code.players.coder: unknown adapter 'gpt'"],
    });
    expect(
      screen.getByText(/config file has errors/).textContent,
    ).toBeTruthy();
    expect(
      screen.getByText(/unknown adapter/, { exact: false }),
    ).toBeTruthy();
    fireEvent.click(screen.getByText("Open Settings →"));
    expect(onNavigate).toHaveBeenCalledWith("Settings");
  });
});

describe("RUN-45: readiness heals at hand", () => {
  test("only the selected Captain blocks dispatch and offers a re-check", async () => {
    const onRecheckReadiness = vi.fn(async () => {});
    renderHome({
      onRecheckReadiness,
      readiness: [
        {
          adapter: "claude",
          ready: false,
          requirement: "set ANTHROPIC_API_KEY or sign in with Claude Code",
          usedBy: ["captain", "code.coder"],
          fastModeSupported: true, subagentModelSupported: true,
        },
      ],
    });
    const status = screen.getByTestId("captain-readiness");
    expect(status.textContent).toContain("selected agent is not ready");
    const composer = screen.getByTestId("start-composer") as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "Review this task" } });
    expect(composer.value).toBe("Review this task");
    expect((screen.getByTestId("start-send") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("recheck-readiness").textContent).toBe("Re-check");
    fireEvent.click(screen.getByTestId("recheck-readiness"));
    await vi.waitFor(() => expect(onRecheckReadiness).toHaveBeenCalled());
  });

  test("a ready alternative opens the Captain agent picker", () => {
    renderHome({
      readiness: [
        { adapter: "claude", ready: false, requirement: "sign in", usedBy: ["captain"], fastModeSupported: true, subagentModelSupported: true },
        { adapter: "codex", ready: true, usedBy: ["code.coder"], fastModeSupported: false, subagentModelSupported: false },
      ],
    });
    fireEvent.click(screen.getByText("Switch to a ready agent"));
    expect(screen.getByTestId("agent-popover")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Intent ledger coverage (run-view-95/88, DR-035): the next card and
// the home composer's staging and queue-instead wiring.
// ---------------------------------------------------------------------------

const NEXT_INTENT: IntentInfo = {
  id: "i-next",
  projectId: "p1",
  text: "Address #12: harden the auth flow\nwith the full context below",
  createdAt: 0,
  source: { kind: "issue", ref: "12" },
};

const MANUAL_READY: QueueSchedule = {
  standing: "manual-ready",
  manualStart: true,
};

function nextCard(
  schedule: QueueSchedule = MANUAL_READY,
  over: Partial<IntentInfo> = {},
  more = 0,
) {
  return { intent: { ...NEXT_INTENT, ...over }, schedule, more };
}

describe("run-view-88: the Captain home names the queue's head", () => {
  const standings: Array<{
    name: string;
    schedule: QueueSchedule;
    phrase?: string;
  }> = [
    {
      name: "current work",
      schedule: { standing: "after-current-work", manualStart: false },
      phrase: "after current work",
    },
    {
      name: "a parked failure",
      schedule: {
        standing: "failure-park",
        manualStart: false,
        cause: { code: "commit-missing" },
      },
      phrase: "waiting — current work failed — Committed nothing",
    },
    {
      name: "a parked question",
      schedule: { standing: "question-park", manualStart: false },
      phrase: "waiting — your reply",
    },
    {
      name: "an unparked failure",
      schedule: {
        standing: "failed",
        manualStart: true,
        cause: { code: "commit-missing" },
      },
      phrase: "waiting — previous work failed — Committed nothing",
    },
    {
      name: "stopped work",
      schedule: { standing: "stopped", manualStart: true },
      phrase: "waiting — previous work stopped",
    },
    { name: "manual readiness", schedule: MANUAL_READY },
  ];

  test.each(standings)(
    "the next card renders the published standing for $name",
    ({ schedule, phrase }) => {
      renderHome({ next: nextCard(schedule, {}, 2) });

      const card = screen.getByTestId("next-card");
      expect(screen.queryByTestId("playbook-preview")).toBeNull();
      expect(card.textContent).toContain("Up next");
      expect(card.textContent).toContain("Address #12: harden the auth flow");
      expect(card.textContent).toContain("+2 more queued");
      expect(screen.getByTestId("next-queued").textContent).toBe("Queued");
      expect(screen.getByTestId("next-remove")).toBeTruthy();
      const standing = screen.queryByTestId("next-standing");
      if (phrase) {
        expect(standing?.textContent).toBe(phrase);
        expect(standing?.getAttribute("title")).toBe(phrase);
      } else {
        expect(standing).toBeNull();
      }
      expect(Boolean(screen.queryByTestId("next-start"))).toBe(
        schedule.manualStart,
      );
      expect(screen.getByTestId("project-task-start")).toBeTruthy();
    },
  );

  test("a manual-ready Start stages the published intent", async () => {
    const onStartIntent = vi.fn(async () => {});
    renderHome({ next: nextCard(MANUAL_READY, {}, 2), onStartIntent });

    expect(screen.getByTestId("next-start").title).toBe(
      "Put this task in the message — Send starts it",
    );
    expect(screen.getByTestId("next-start").getAttribute("aria-label")).toBe(
      "Start Address #12: harden the auth flow",
    );

    fireEvent.click(screen.getByTestId("next-start"));
    await vi.waitFor(() =>
      expect(onStartIntent).toHaveBeenCalledWith(NEXT_INTENT),
    );
  });

  test("no queued intent, no card — task start stands alone", () => {
    renderHome();
    expect(screen.queryByTestId("next-card")).toBeNull();
    expect(screen.getByTestId("project-task-start")).toBeTruthy();
  });

  test("Remove closes the head dropped on the click; Undo re-queues the same text and provenance (run-view-114)", async () => {
    const command = vi.fn(async (type: string) => {
      if (type === "ledger.get") return { intents: [], attention: [], badge: 0 };
      if (type === "intent.queue") return { ...NEXT_INTENT, id: "i-back" };
      return {};
    });
    setClientForTests({ command, subscribe: vi.fn(async () => {}) } as never);
    const props = {
      hasProject: true,
      hasProjects: true,
      projectName: PROJECT.name,
      playbooks: PLAYBOOKS,
      captain: CAPTAIN,
      readiness: READY,
      connected: true,
      onOpenPalette: vi.fn(),
      onNavigate: vi.fn(),
      onSaveCaptain: vi.fn(async () => {}),
      onStart: vi.fn(async () => {}),
    };
    const view = render(
      <CaptainHome {...props} next={nextCard()} />,
    );

    const remove = screen.getByTestId("next-remove");
    expect(remove.textContent).toBe("Remove");
    // One click, no confirm — the Undo line is the way back.
    fireEvent.click(remove);
    await vi.waitFor(() =>
      expect(command).toHaveBeenCalledWith("intent.close", {
        intentId: "i-next",
        as: "dropped",
      }),
    );
    const removed = await screen.findByTestId("next-removed");
    expect(removed.getAttribute("role")).toBe("status");
    expect(removed.textContent).toContain(
      "Removed “Address #12: harden the auth flow”",
    );
    const undo = within(removed).getByRole("button", { name: "Undo" });
    // The move lands in the commit's effect; a loaded runner reaches
    // this line before it.
    await vi.waitFor(() => expect(document.activeElement).toBe(undo));
    // The host's fold now serves no next: the card stays for its Undo
    // line alone.
    view.rerender(<CaptainHome {...props} next={undefined} />);
    expect(screen.getByTestId("next-card")).toBeTruthy();
    expect(screen.queryByTestId("next-start")).toBeNull();
    expect(screen.getByTestId("next-removed")).toBeTruthy();

    fireEvent.click(undo);
    await vi.waitFor(() =>
      expect(command).toHaveBeenCalledWith(
        "intent.queue",
        expect.objectContaining({
          projectId: "p1",
          text: NEXT_INTENT.text,
          source: NEXT_INTENT.source,
        }),
      ),
    );
    // The queue is ordered by age: the capture names no place in it.
    const queued = (command.mock.calls as unknown as [string, Record<string, unknown>][])
      .find(([type]) => type === "intent.queue");
    expect(queued?.[1]).not.toHaveProperty("at");
    expect(screen.queryByTestId("next-removed")).toBeNull();
    // Served again, the restored intent's Start takes focus.
    view.rerender(
      <CaptainHome
        {...props}
        next={nextCard(MANUAL_READY, { id: "i-back" })}
      />,
    );
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("next-start")),
    );
    setClientForTests(undefined);
  });

  test("Undo focuses Remove when the restored row has no Start", async () => {
    const waiting: QueueSchedule = {
      standing: "after-current-work",
      manualStart: false,
    };
    const command = vi.fn(async (type: string) => {
      if (type === "ledger.get") return { intents: [], attention: [], badge: 0 };
      if (type === "intent.queue") return { ...NEXT_INTENT, id: "i-waiting" };
      return {};
    });
    setClientForTests({ command, subscribe: vi.fn(async () => {}) } as never);
    const props = {
      hasProject: true,
      hasProjects: true,
      projectName: PROJECT.name,
      playbooks: PLAYBOOKS,
      captain: CAPTAIN,
      readiness: READY,
      connected: true,
      onOpenPalette: vi.fn(),
      onNavigate: vi.fn(),
      onSaveCaptain: vi.fn(async () => {}),
      onStart: vi.fn(async () => {}),
    };
    const view = render(<CaptainHome {...props} next={nextCard(waiting)} />);
    expect(screen.queryByTestId("next-start")).toBeNull();

    fireEvent.click(screen.getByTestId("next-remove"));
    const undo = await within(
      await screen.findByTestId("next-removed"),
    ).findByRole("button", { name: "Undo" });
    await vi.waitFor(() => expect(document.activeElement).toBe(undo));
    view.rerender(<CaptainHome {...props} next={undefined} />);
    fireEvent.click(undo);
    await vi.waitFor(() =>
      expect(command).toHaveBeenCalledWith(
        "intent.queue",
        expect.objectContaining({
          text: NEXT_INTENT.text,
          source: NEXT_INTENT.source,
        }),
      ),
    );

    // A different visible head cannot consume the restored row's focus.
    view.rerender(
      <CaptainHome
        {...props}
        next={nextCard(MANUAL_READY, { id: "intervening" })}
      />,
    );
    expect(document.activeElement).not.toBe(screen.getByTestId("next-start"));
    view.rerender(
      <CaptainHome
        {...props}
        next={nextCard(waiting, { id: "i-waiting" })}
      />,
    );
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("next-remove")),
    );
    expect(screen.queryByTestId("next-start")).toBeNull();
    setClientForTests(undefined);
  });

  test("a pointer Remove leaves the pointer where it is; the Undo line lapses on schedule (run-view-114)", async () => {
    vi.useFakeTimers();
    const command = vi.fn(async (type: string) => {
      if (type === "ledger.get") return { intents: [], attention: [], badge: 0 };
      return {};
    });
    setClientForTests({ command, subscribe: vi.fn(async () => {}) } as never);
    try {
      renderHome({ next: nextCard() });
      // A mouse click carries its click count; a keyboard activation
      // carries none (detail 0), which is what fireEvent.click sends
      // by default and the keyboard test above relies on.
      await act(async () => {
        fireEvent.click(screen.getByTestId("next-remove"), { detail: 1 });
      });
      // The removal's promise chain settles inside act; the line is
      // up before the clock moves.
      await act(async () => {});
      const removed = screen.getByTestId("next-removed");
      const undo = within(removed).getByRole("button", { name: "Undo" });
      expect(document.activeElement).not.toBe(undo);
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      // Nothing held the line open, so it went: the card stands as a
      // finished removal, never as a prompt.
      expect(screen.queryByTestId("next-removed")).toBeNull();
    } finally {
      vi.useRealTimers();
      setClientForTests(undefined);
    }
  });
});

describe("run-view-86: the home composer wears the staged chip", () => {
  test("the chip names the intent and detaches on demand", () => {
    const onDetachStaged = vi.fn();
    renderHome({
      staged: { intentId: "i-next", title: "Address #12: harden the auth flow" },
      onDetachStaged,
    });
    const chip = screen.getByTestId("staged-intent-chip");
    expect(chip.textContent).toContain("Address #12: harden the auth flow");
    // Plain words for the control (DR-010 §8), on a 24px target.
    const detach = screen.getByLabelText("Take the task out of the message");
    expect(detach.className).toContain("h-6 w-6");
    fireEvent.click(detach);
    expect(onDetachStaged).toHaveBeenCalled();
  });

  test("emptying the composer detaches the staged intent", () => {
    const onDetachStaged = vi.fn();
    renderHome({
      staged: { intentId: "i-next", title: "Address #12: harden the auth flow" },
      onDetachStaged,
    });
    const composer = screen.getByTestId(
      "start-composer",
    ) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "some context" } });
    expect(onDetachStaged).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: "" } });
    expect(onDetachStaged).toHaveBeenCalled();
  });
});

describe("run-view-85: queue instead of send, from the home", () => {
  test("the control queues the text and acknowledges in place", async () => {
    const onQueueInstead = vi.fn(async () => {});
    const { onStart } = renderHome({ onQueueInstead });
    const composer = screen.getByTestId(
      "start-composer",
    ) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "later: tidy the docs" } });
    // The secondary action is named by where the text goes.
    expect(screen.getByTestId("queue-intent-button").textContent).toBe(
      "Add to Up next",
    );
    fireEvent.click(screen.getByTestId("queue-intent-button"));
    await vi.waitFor(() =>
      expect(onQueueInstead).toHaveBeenCalledWith("later: tidy the docs"),
    );
    // Shelved, not sent: no session starts, the draft clears, and the
    // acknowledgment names where the row landed.
    expect(onStart).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(composer.value).toBe(""));
    expect(
      screen.getByTestId("queued-intent-note").textContent,
    ).toContain("Up next");
  });

  test("without a current project the control hides", () => {
    renderHome({ hasProject: false });
    expect(screen.queryByTestId("queue-intent-button")).toBeNull();
  });
});

describe("run-view-25: Captain chip carries current tuning and opens the editor", () => {
  test("a captain in fast mode shows the mark and keeps the setting in the editor", () => {
    renderHome({ captain: { ...CAPTAIN, fastMode: true } });
    expect(screen.getByTestId("fast-mode-mark")).toBeTruthy();
    fireEvent.click(screen.getByTestId("captain-settings"));
    expect((screen.getByTestId("agent-fast-mode") as HTMLInputElement).checked).toBe(true);
  });

  test("without fast mode the editor leaves it off", () => {
    renderHome();
    fireEvent.click(screen.getByTestId("captain-settings"));
    expect((screen.getByTestId("agent-fast-mode") as HTMLInputElement).checked).toBe(false);
  });
});

describe("run-view-32: the popover opens where the window can show it", () => {
  /** An anchor whose box the document actually reports. */
  function place(el: HTMLElement, top: number, bottom: number): void {
    el.getBoundingClientRect = () =>
      ({
        top,
        bottom,
        left: 0,
        right: 24,
        width: 24,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  test("the roomier side wins, and the room is what the window can show", () => {
    // jsdom reports a 768px window: a gear near its foot has more room
    // above it, one near its head more room below.
    const gear = document.createElement("button");
    place(gear, 640, 660);
    expect(popoverRoom(gear)).toEqual({ direction: "up", room: 632 });
    place(gear, 20, 40);
    expect(popoverRoom(gear)).toEqual({ direction: "down", room: 720 });
  });

  test("an unmeasured anchor leaves the popover its natural place", () => {
    // A simulated or unpainted document measures nothing.
    expect(popoverRoom(null)).toEqual({ direction: "up" });
    expect(popoverRoom(document.createElement("button"))).toEqual({
      direction: "up",
    });
  });

  test("a gear with less room above opens downward, capped to the room", () => {
    renderHome();
    const gear = screen.getByTestId("captain-settings");
    place(gear, 340, 360);
    fireEvent.click(gear);
    const popover = screen.getByTestId("agent-popover");
    expect(popover.className).toContain("top-full");
    expect(popover.className).not.toContain("bottom-full");
    // The anchor grants the room its dialog may take.
    expect(popover.parentElement!.style.getPropertyValue("--popover-room")).toBe(
      "400px",
    );
  });

  test("a gear with room above keeps opening upward", () => {
    renderHome();
    const gear = screen.getByTestId("captain-settings");
    place(gear, 600, 620);
    fireEvent.click(gear);
    const popover = screen.getByTestId("agent-popover");
    expect(popover.className).toContain("bottom-full");
    expect(popover.parentElement!.style.getPropertyValue("--popover-room")).toBe(
      "592px",
    );
  });
});


test("run-view-159: Captain home sends selected files with empty text and keeps failed content visible", async () => {
  const onStart = vi.fn(async () => { throw new Error("Start unavailable"); });
  renderHome({ onStart, attachments: { files: [{ id: "one", name: "screen.png", mimeType: "image/png", size: 4, state: "ready" }], onFiles() {}, onRemove() {} } });
  const send = screen.getByTestId("start-send") as HTMLButtonElement;
  expect(send.disabled).toBe(false);
  fireEvent.click(send);
  await vi.waitFor(() => expect(onStart).toHaveBeenCalledWith(""));
  expect(screen.getByText("screen.png")).toBeTruthy();
});
