// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// DR-015/DR-032 Library coverage: configured roles name the session
// player that answers them and are rebound in place (PBLIB-4),
// unconfigured built-ins render from the catalog with browsable
// sources and an add flow that mints a lane per role (PBLIB-34), and the
// slc demo example card stages the pipeline and prefills the compile
// form with the normalized text and the neutral block (PBLIB-35).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

afterEach(cleanup);

const { commandMock } = vi.hoisted(() => ({
  commandMock: vi.fn(),
}));

// LibrarySurface talks to the core through getClient; the store and
// its hooks stay real so state stubbing goes through setState.
vi.mock("../state/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/store.js")>();
  return {
    ...actual,
    getClient: () => ({ command: commandMock }),
  };
});

import { LibrarySurface, NEUTRAL_BLOCK } from "./LibrarySurface.js";
import { agentChipText } from "./AgentChip.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import { SLC_DEMO } from "../examples/slc-demo.js";
import type {
  BuiltinPlaybookInfo,
  ConfigState,
  ReadinessEntry,
} from "@sublang/spex-core/protocol";

const CONFIG_STATE: ConfigState = {
  status: "valid",
  seeded: false,
  summary: {
    path: "/tmp/config.yaml",
    // The Captain is an inline agent block, not a profile ref (DR-019).
    captain: {
      adapter: "claude",
      model: "claude-opus-4-8",
      effort: "high",
      permissions: { mode: "auto" },
    },
    // The roster is flat and top-level; playbooks only bind to it.
    players: [
      {
        id: "dev.coder",
        agent: {
          adapter: "claude",
          model: "claude-opus-5",
          effort: "high",
          instruction: "Keep the diff small.",
        },
        display: "claude-opus-5 @ high",
        boundBy: ["code.coder", "fix.coder"],
      },
      {
        id: "dev.reviewer",
        agent: { adapter: "codex", model: "gpt-5.6-sol" },
        display: "gpt-5.6-sol",
        boundBy: ["code.reviewer"],
      },
    ],
    playbooks: [
      {
        id: "code",
        from: "@sublang/playbook/code/registry",
        command: "code",
        intent: "software development workflow",
        roles: {
          coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" },
          reviewer: {
            playerId: "dev.reviewer",
            effort: "max",
            display: "gpt-5.6-sol @ max",
          },
        },
      },
    ],
  },
};

const READINESS: ReadinessEntry[] = [
  {
    adapter: "claude",
    ready: true,
    usedBy: ["captain", "dev.coder (code.coder)"],
    fastModeSupported: true,
  },
  {
    adapter: "codex",
    ready: false,
    requirement: "set OPENAI_API_KEY or run `codex login`",
    usedBy: [],
    fastModeSupported: false,
  },
];

const BUILTINS: BuiltinPlaybookInfo[] = [
  {
    id: "code",
    command: "code",
    intent: "software development workflow",
    from: "@sublang/playbook/code/registry",
    roles: ["coder", "reviewer"],
    configured: true,
    source: "# Code Playbook",
  },
  {
    id: "review",
    command: "review",
    intent: "review of committed phases",
    from: "@sublang/playbook/review/registry",
    roles: ["host"],
    configured: false,
    source: "# Review Playbook\n\nA **structured** review workflow.",
  },
];

function renderLibrary() {
  useAppStore.setState({
    connection: "open",
    configState: CONFIG_STATE,
    readiness: READINESS,
    compileProgress: {},
    activeCompile: undefined,
    builtins: BUILTINS,
    // The surface refreshes the catalog on activation; state above
    // already carries it, so the load is a stub here.
    loadBuiltins: vi.fn(async () => {}),
  });
  return render(<LibrarySurface />);
}

beforeEach(() => {
  commandMock.mockReset();
  commandMock.mockImplementation(async (type: string) => {
    if (type === "compile.check") {
      return {
        node: { ok: true, version: "v23.6.0", command: "node" },
        slc: { ok: true, command: ["npx", "@sublang/slc"] },
      };
    }
    if (type === "config.edit") return CONFIG_STATE;
    if (type === "library.builtins") return { builtins: BUILTINS };
    if (type === "playbook.artifacts") {
      return { source: null, gears: null, fsm: null, stateIds: null, missing: [] };
    }
    return null;
  });
});

describe("PBLIB-4: configured roles name the player that answers them", () => {
  test("a role prints its lane, its agent, and that the lane is shared", () => {
    renderLibrary();
    // The role's own line says which session player answers it, and
    // the chip describes that lane's agent (DR-032).
    expect(screen.getByTestId("role-binding-code-coder").textContent).toBe(
      "dev.coder",
    );
    expect(
      screen.getByLabelText("dev.coder: claude · claude-opus-5 @ high (ready)"),
    ).toBeTruthy();
    // dev.coder answers a second position, so it is one conversation
    // across both and the badge says so.
    expect(screen.getByTestId("role-shared-code-coder").title).toContain(
      "fix.coder",
    );
    // dev.reviewer answers this binding alone: no shared badge.
    expect(screen.queryByTestId("role-shared-code-reviewer")).toBeNull();
  });

  test("the gear rebinds the role and pins its own effort", async () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    const editor = screen.getByTestId("binding-editor-coder");
    // Every lane in the roster is offerable, none invented here.
    expect(
      Array.from(
        within(editor).getByTestId("binding-player").querySelectorAll("option"),
      ).map((option) => (option as HTMLOptionElement).value),
    ).toEqual(["dev.coder", "dev.reviewer"]);

    fireEvent.change(within(editor).getByTestId("binding-effort-mode"), {
      target: { value: "pin" },
    });
    fireEvent.change(within(editor).getByTestId("binding-effort-value"), {
      target: { value: "ultracode" },
    });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      // A binding carries a player and its own tuning only — adapter
      // and permissions belong to the lane (DR-032).
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: {
          kind: "playbook.role.bind",
          playbookId: "code",
          role: "coder",
          playerId: "dev.coder",
          effort: "ultracode",
        },
      }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByTestId("binding-editor-coder")).toBeNull(),
    );
  });

  test("choosing a busy lane warns that the conversation is shared", () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId("role-bind-code-reviewer"));
    const editor = screen.getByTestId("binding-editor-reviewer");
    // On its own lane the reviewer holds the only position.
    expect(within(editor).queryByTestId("binding-shared-note")).toBeNull();

    fireEvent.change(within(editor).getByTestId("binding-player"), {
      target: { value: "dev.coder" },
    });
    expect(
      within(editor).getByTestId("binding-shared-note").textContent,
    ).toContain("code.coder, fix.coder");
  });

  test("a refused rebind surfaces inline and keeps the editor open", async () => {
    commandMock.mockImplementation(async (type: string) => {
      if (type === "config.edit") throw new Error("dev.ghost is not a player");
      if (type === "compile.check") {
        return {
          node: { ok: true, version: "v23.6.0", command: "node" },
          slc: { ok: true, command: ["npx", "@sublang/slc"] },
        };
      }
      return null;
    });
    renderLibrary();
    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    fireEvent.click(screen.getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(
        screen.getByTestId("binding-editor-coder").textContent,
      ).toContain("dev.ghost is not a player"),
    );
  });
});

describe("DR-015: built-ins section from the catalog", () => {
  test("only unconfigured entries render as available built-ins", () => {
    renderLibrary();
    const section = screen.getByTestId("builtins-section");
    const card = within(section).getByTestId("builtin-review");
    expect(card.textContent).toContain("/review");
    expect(card.textContent).toContain("review of committed phases");
    expect(card.textContent).toContain("host:");
    // An unassigned role starts on the fixed neutral block (DR-019).
    expect(within(card).getByTestId("agent-chip").textContent).toContain(
      agentChipText(NEUTRAL_BLOCK),
    );
    // The configured /code built-in stays in the configured list only.
    expect(within(section).queryByTestId("builtin-code")).toBeNull();
  });

  test("the source toggle renders the playbook markdown", () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId("builtin-source-toggle-review"));
    // Markdown rendered: **structured** becomes a <strong>.
    expect(screen.getByText("structured").tagName).toBe("STRONG");
    fireEvent.click(screen.getByTestId("builtin-source-toggle-review"));
    expect(screen.queryByText("structured")).toBeNull();
  });

  test("the add flow mints a lane per role, then binds to it", async () => {
    renderLibrary();
    const card = screen.getByTestId("builtin-review");
    fireEvent.click(within(card).getByTestId("builtin-player-host"));
    const popover = within(card).getByTestId("agent-popover");
    fireEvent.click(within(popover).getByTestId("agent-adapter-codex"));
    fireEvent.change(within(popover).getByTestId("agent-model"), {
      target: { value: "gpt-5.5-codex" },
    });
    fireEvent.change(within(popover).getByTestId("agent-effort"), {
      target: { value: "ultra" },
    });
    fireEvent.click(within(popover).getByTestId("agent-save"));
    expect(within(card).getByTestId("agent-chip").textContent).toContain(
      "codex · gpt-5.5-codex @ ultra",
    );

    fireEvent.click(screen.getByTestId("builtin-add-review"));
    // The lane the roster lacks is minted first, carrying the whole
    // agent block, so the binding that follows never dangles (DR-032).
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: {
          kind: "player.set",
          playerId: "dev.host",
          patch: {
            adapter: "codex",
            model: "gpt-5.5-codex",
            effort: "ultra",
            permissions: { mode: "auto" },
          },
        },
      }),
    );
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: {
          kind: "playbook.add",
          playbookId: "review",
          from: "@sublang/playbook/review/registry",
          roles: { host: "dev.host" },
        },
      }),
    );
  });

  test("an untouched role mints its lane on the neutral block", async () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId("builtin-add-review"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: { kind: "player.set", playerId: "dev.host", patch: NEUTRAL_BLOCK },
      }),
    );
  });

  test("an add failure surfaces inline on the card", async () => {
    commandMock.mockImplementation(async (type: string) => {
      if (type === "config.edit") throw new Error("config file is read-only");
      if (type === "compile.check") {
        return {
          node: { ok: true, version: "v23.6.0", command: "node" },
          slc: { ok: true, command: ["npx", "@sublang/slc"] },
        };
      }
      return null;
    });
    renderLibrary();
    fireEvent.click(screen.getByTestId("builtin-add-review"));
    await vi.waitFor(() => {
      const card = screen.getByTestId("builtin-review");
      expect(card.textContent).toContain("config file is read-only");
    });
  });
});

describe("playbook-library-34/26: plain words on the list", () => {
  test("a built-in is enabled, not added to a config", () => {
    renderLibrary();
    expect(screen.getByTestId("builtin-add-review").textContent).toBe("Enable");
  });

  test("removal asks with Remove and Keep, and Keep writes nothing", () => {
    renderLibrary();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove /code from the config" }),
    );
    expect(screen.getByText("Remove this playbook from the config?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(commandMock).not.toHaveBeenCalledWith(
      "config.edit",
      expect.objectContaining({ op: expect.objectContaining({ kind: "playbook.delete" }) }),
    );
  });

  test("an empty list says how to get a playbook", () => {
    useAppStore.setState({
      connection: "open",
      configState: {
        ...CONFIG_STATE,
        summary: { ...CONFIG_STATE.summary, playbooks: [] },
      },
      readiness: READINESS,
      compileProgress: {},
      activeCompile: undefined,
      builtins: BUILTINS,
      loadBuiltins: vi.fn(async () => {}),
    });
    render(<LibrarySurface />);
    expect(screen.getByTestId("playbooks-empty").textContent).toBe(
      "No playbooks enabled yet — enable a built-in below, or compile your own.",
    );
  });
});

const ARTIFACTS = {
  source: "# Code workflow\n\nThe coder writes.",
  gears: "### CODE-1\n\nThe coder shall write the change.",
  fsm: "import { setup } from 'xstate';",
  stateIds: ["idle", "coding"],
  machine: null,
  missing: [] as string[],
};

/** Answer playbook.artifacts with `load`, leaving the surface's other
 * commands on the default stub. */
function withArtifacts(load: () => Promise<unknown>): void {
  const base = commandMock.getMockImplementation()!;
  commandMock.mockImplementation(async (type: string, params?: unknown) =>
    type === "playbook.artifacts" ? load() : base(type, params),
  );
}

function artifactCalls(): number {
  return commandMock.mock.calls.filter(
    ([type]) => type === "playbook.artifacts",
  ).length;
}

describe("PBLIB-22/23: a configured playbook wears its pipeline as a row", () => {
  test("a press opens a stage, a second closes it, another swaps — on one request", async () => {
    withArtifacts(async () => ARTIFACTS);
    renderLibrary();
    const row = screen.getByTestId("stages-code");
    expect(
      within(row)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Source", "Gears", "State machine"]);
    // The row stands before anything is asked for: nothing loads and
    // no stage is open.
    expect(artifactCalls()).toBe(0);
    expect(screen.queryByTestId("pipeline-code")).toBeNull();

    fireEvent.click(within(row).getByRole("button", { name: "Source" }));
    expect(
      within(row).getByRole("button", { name: "Source" }).getAttribute("aria-pressed"),
    ).toBe("true");
    // The first open asks, and says so until the answer lands.
    expect(artifactCalls()).toBe(1);
    expect(screen.getByTestId("pipeline-code").textContent).toContain("loading…");
    await vi.waitFor(() =>
      expect(screen.getByTestId("pipeline-code").textContent).toContain(
        "The coder writes.",
      ),
    );

    // Another stage swaps to it; the state list sits above the code.
    fireEvent.click(within(row).getByRole("button", { name: "State machine" }));
    const box = screen.getByTestId("pipeline-code");
    expect(box.textContent).not.toContain("The coder writes.");
    expect(box.textContent).toContain("idle");
    expect(box.textContent!.indexOf("idle")).toBeLessThan(
      box.textContent!.indexOf("xstate"),
    );

    // Pressing the open stage closes it, and reopening reuses what
    // arrived: one request for this card.
    fireEvent.click(within(row).getByRole("button", { name: "State machine" }));
    expect(screen.queryByTestId("pipeline-code")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Gears" }));
    expect(screen.getByTestId("pipeline-code").textContent).toContain("CODE-1");
    expect(artifactCalls()).toBe(1);
  });

  test("a stage the load cannot locate is struck out, inactive, and named in the box", async () => {
    withArtifacts(async () => ({ ...ARTIFACTS, gears: null, missing: ["gears"] }));
    renderLibrary();
    const row = screen.getByTestId("stages-code");
    const gears = () =>
      within(row).getByRole("button", { name: "Gears" }) as HTMLButtonElement;
    // Before the load the row knows of no absence and offers it.
    expect(gears().disabled).toBe(false);

    fireEvent.click(within(row).getByRole("button", { name: "Source" }));
    await vi.waitFor(() => expect(gears().disabled).toBe(true));
    // Struck out as well as quiet: never colour alone (DR-010 §7).
    expect(gears().className).toContain("line-through");
    expect(gears().title).toBe(
      "Gears not found next to this playbook's registry",
    );
    // The absence is named in the open stage, not on the card.
    expect(screen.getByTestId("pipeline-code").textContent).toContain(
      "missing stages: Gears",
    );
  });

  test("a failed request leaves its message in the open stage", async () => {
    withArtifacts(async () => {
      throw new Error("no registry beside /tmp/code");
    });
    renderLibrary();
    fireEvent.click(
      within(screen.getByTestId("stages-code")).getByRole("button", {
        name: "Source",
      }),
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("pipeline-code").textContent).toContain(
        "no registry beside /tmp/code",
      ),
    );
  });
});

describe("PBLIB-35: the slc demo example card", () => {
  test("the row stands on the card and opens all four in-memory stages", () => {
    renderLibrary();
    const card = screen.getByTestId("example-card");
    expect(card.textContent).toContain("Example: Two-Agent Change-and-Review Workflow");
    expect(card.textContent).toContain("from the slc demo");

    // The row is permanent — no toggle stands between card and stages.
    const row = within(card).getByTestId("example-stages");
    for (const label of ["Source", "Normalized", "Gears", "State machine"]) {
      expect(within(row).getByRole("button", { name: label })).toBeTruthy();
    }
    // Nothing is open until a stage is pressed.
    expect(
      within(row)
        .getAllByRole("button")
        .every((button) => button.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
    expect(card.textContent).not.toContain(
      "handing them back to the first agent to judge",
    );

    fireEvent.click(within(row).getByRole("button", { name: "Source" }));
    // The raw prose, pre-normalization.
    expect(card.textContent).toContain(
      "handing them back to the first agent to judge",
    );
    expect(
      within(row).getByRole("button", { name: "Source" }).getAttribute("aria-pressed"),
    ).toBe("true");

    // Another stage swaps; the label holds the budget, the title
    // carries the longer truth (DR-041).
    const normalized = within(row).getByRole("button", { name: "Normalized" });
    expect(normalized.title).toContain("Normalized text");
    fireEvent.click(normalized);
    expect(card.textContent).toContain("Use two agents, Coder and Reviewer");
    expect(card.textContent).not.toContain(
      "handing them back to the first agent to judge",
    );

    fireEvent.click(within(row).getByRole("button", { name: "Gears" }));
    // Gears render as markdown: the item heading becomes an <h3>.
    expect(within(card).getByText("WORKFLOW-1").tagName).toBe("H3");

    fireEvent.click(within(row).getByRole("button", { name: "State machine" }));
    expect(card.textContent).toContain("from 'xstate'");

    // Pressing the open stage closes it.
    fireEvent.click(within(row).getByRole("button", { name: "State machine" }));
    expect(card.textContent).not.toContain("from 'xstate'");
  });

  test("prefill copies the normalized text and suggestions into the form", () => {
    renderLibrary();
    fireEvent.change(screen.getByTestId("compile-source-path"), {
      target: { value: "/tmp/other.md" },
    });
    fireEvent.click(screen.getByTestId("example-prefill"));

    const id = screen.getByTestId("compile-playbook-id") as HTMLInputElement;
    const command = screen.getByTestId("compile-command") as HTMLInputElement;
    const intent = screen.getByTestId("compile-intent") as HTMLInputElement;
    const roles = screen.getByTestId("compile-roles") as HTMLInputElement;
    const source = screen.getByTestId(
      "compile-source-text",
    ) as HTMLTextAreaElement;
    const path = screen.getByTestId("compile-source-path") as HTMLInputElement;

    expect(id.value).toBe("workflow");
    expect(command.value).toBe("workflow");
    expect(intent.value).toBe(
      "Two-Agent Change-and-Review Workflow — Use two agents to carry out the input task.",
    );
    expect(roles.value).toBe("Coder, Reviewer");
    // The NORMALIZED text, never the raw prose (DR-015): the compile
    // pipeline skips slc's normalize phase.
    expect(source.value).toBe(SLC_DEMO.stages.normalized);
    expect(source.value).toContain("# Two-Agent Change-and-Review Workflow");
    expect(source.value).not.toBe(SLC_DEMO.stages.source);
    // A stale source path would override the text: prefill clears it.
    expect(path.value).toBe("");

    // The demo roles are pre-mapped onto the fixed neutral block
    // (DR-019) so the chips show a deliberate choice, not a blank.
    for (const role of ["Coder", "Reviewer"]) {
      const row = screen.getByTestId(`compile-player-${role}`).parentElement!;
      expect(within(row).getByTestId("agent-chip").textContent).toContain(
        agentChipText(NEUTRAL_BLOCK),
      );
    }
  });

  test("a compile role's agent is chosen in place before compiling", () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId("example-prefill"));
    fireEvent.click(screen.getByTestId("compile-player-Reviewer"));
    const popover = screen.getByTestId("agent-popover");
    // The compile form knows the Captain, so copying from it is offered.
    expect(within(popover).getByTestId("agent-same-as-captain")).toBeTruthy();
    fireEvent.click(within(popover).getByTestId("agent-adapter-gemini"));
    fireEvent.click(within(popover).getByTestId("agent-save"));

    const row = screen.getByTestId("compile-player-Reviewer").parentElement!;
    expect(within(row).getByTestId("agent-chip").textContent).toContain(
      "gemini · claude-opus-5 @ high",
    );
    // The untouched role keeps the neutral block.
    const coderRow = screen.getByTestId("compile-player-Coder").parentElement!;
    expect(within(coderRow).getByTestId("agent-chip").textContent).toContain(
      agentChipText(NEUTRAL_BLOCK),
    );
  });
});

describe("DR-015: repeated Academy seeding opens the existing project", () => {
  beforeEach(() => {
    // Store actions resolve the module-local client, not the mocked
    // export — inject the fake through the seam.
    setClientForTests({ command: commandMock } as unknown as Parameters<
      typeof setClientForTests
    >[0]);
  });

  test("a conflict on the default path selects the registered example", async () => {
    const academy = {
      id: "p-academy",
      path: "/Users/dev/spex-academy",
      name: "spex-academy",
      createdAt: 1,
    };
    commandMock.mockImplementation(async (type: string) => {
      if (type === "project.create") {
        throw new Error("/Users/dev/spex-academy is already registered");
      }
      if (type === "project.list") return [academy];
      if (type === "specs.get") {
        return {
          present: false,
          legacy: false,
          files: [],
          decisions: [],
          intents: [],
          notices: [],
          readAt: 0,
        };
      }
      return {};
    });
    const project = await useAppStore.getState().openAcademyExample();
    expect(project.id).toBe("p-academy");
    expect(useAppStore.getState().currentProjectId).toBe("p-academy");
  });

  test("a non-conflict failure still rejects", async () => {
    commandMock.mockImplementation(async (type: string) => {
      if (type === "project.create") {
        throw new Error("target directory exists and is not empty");
      }
      if (type === "project.list") return [];
      return {};
    });
    await expect(
      useAppStore.getState().openAcademyExample(),
    ).rejects.toThrow(/not empty/);
  });
});
