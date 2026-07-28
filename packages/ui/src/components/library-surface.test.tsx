// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// DR-015/DR-019 Library coverage: configured roles carry inline agent
// blocks edited in place as merge patches (PBLIB-4), unconfigured
// built-ins render from the catalog with browsable sources and an add
// flow that maps every role to a full agent block (PBLIB-34), and the
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
    playbooks: [
      {
        id: "code",
        from: "@sublang/playbook/code/registry",
        command: "code",
        intent: "software development workflow",
        players: {
          coder: {
            agent: {
              adapter: "claude",
              model: "claude-opus-4-8",
              effort: "high",
              instruction: "Keep the diff small.",
            },
            display: "claude-opus-4-8",
          },
        },
      },
    ],
  },
};

const READINESS: ReadinessEntry[] = [
  { adapter: "claude", ready: true, usedBy: ["captain", "code.coder"] },
  {
    adapter: "codex",
    ready: false,
    requirement: "set OPENAI_API_KEY or run `codex login`",
    usedBy: [],
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
    id: "discuss",
    command: "discuss",
    intent: "structured design discussion",
    from: "@sublang/playbook/discuss/registry",
    roles: ["host"],
    configured: false,
    source: "# Discuss Playbook\n\nA **structured** discussion workflow.",
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

describe("PBLIB-4: configured roles carry editable inline agents", () => {
  test("each role shows its agent chip with the adapter's readiness", () => {
    renderLibrary();
    const chip = screen.getByLabelText(
      "coder: claude · claude-opus-4-8 @ high (ready)",
    );
    expect(chip.textContent).toContain("claude · claude-opus-4-8 @ high");
    expect(screen.getByTestId("player-gear-code-coder")).toBeTruthy();
  });

  test("the gear edits the role's block in place as a merge patch", async () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId("player-gear-code-coder"));
    const popover = screen.getByTestId("agent-popover");
    expect(popover.getAttribute("aria-label")).toBe("coder agent");

    fireEvent.change(within(popover).getByTestId("agent-effort"), {
      target: { value: "ultracode" },
    });
    fireEvent.click(within(popover).getByTestId("agent-save"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: {
          kind: "playbook.player.set",
          playbookId: "code",
          role: "coder",
          // Surfaced keys only: the hand-written instruction survives
          // by never appearing in the patch (DR-019).
          patch: {
            adapter: "claude",
            model: "claude-opus-4-8",
            effort: "ultracode",
          },
        },
      }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByTestId("agent-popover")).toBeNull(),
    );
  });

  test("a refused player edit surfaces inline and keeps the editor open", async () => {
    commandMock.mockImplementation(async (type: string) => {
      if (type === "config.edit") throw new Error("coder would be unresolved");
      if (type === "compile.check") {
        return {
          node: { ok: true, version: "v23.6.0", command: "node" },
          slc: { ok: true, command: ["npx", "@sublang/slc"] },
        };
      }
      return null;
    });
    renderLibrary();
    fireEvent.click(screen.getByTestId("player-gear-code-coder"));
    fireEvent.change(screen.getByTestId("agent-effort"), {
      target: { value: "max" },
    });
    fireEvent.click(screen.getByTestId("agent-save"));
    await vi.waitFor(() =>
      expect(
        screen.getByTestId("agent-popover").textContent,
      ).toContain("coder would be unresolved"),
    );
  });
});

describe("DR-015: built-ins section from the catalog", () => {
  test("only unconfigured entries render as available built-ins", () => {
    renderLibrary();
    const section = screen.getByTestId("builtins-section");
    const card = within(section).getByTestId("builtin-discuss");
    expect(card.textContent).toContain("/discuss");
    expect(card.textContent).toContain("structured design discussion");
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
    fireEvent.click(screen.getByTestId("builtin-source-toggle-discuss"));
    // Markdown rendered: **structured** becomes a <strong>.
    expect(screen.getByText("structured").tagName).toBe("STRONG");
    fireEvent.click(screen.getByTestId("builtin-source-toggle-discuss"));
    expect(screen.queryByText("structured")).toBeNull();
  });

  test("the add flow applies playbook.add with a block per role", async () => {
    renderLibrary();
    const card = screen.getByTestId("builtin-discuss");
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

    fireEvent.click(screen.getByTestId("builtin-add-discuss"));
    await vi.waitFor(() =>
      // Every role maps to a whole agent block, keyed by role — never
      // a profile reference (DR-019).
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: {
          kind: "playbook.add",
          playbookId: "discuss",
          from: "@sublang/playbook/discuss/registry",
          players: {
            host: {
              adapter: "codex",
              model: "gpt-5.5-codex",
              effort: "ultra",
              permissions: { mode: "auto" },
            },
          },
        },
      }),
    );
  });

  test("an untouched role is added on the neutral block", async () => {
    renderLibrary();
    fireEvent.click(screen.getByTestId("builtin-add-discuss"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: {
          kind: "playbook.add",
          playbookId: "discuss",
          from: "@sublang/playbook/discuss/registry",
          players: { host: NEUTRAL_BLOCK },
        },
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
    fireEvent.click(screen.getByTestId("builtin-add-discuss"));
    await vi.waitFor(() => {
      const card = screen.getByTestId("builtin-discuss");
      expect(card.textContent).toContain("config file is read-only");
    });
  });
});

describe("DR-015: the slc demo example card", () => {
  test("collapsed by default; opening stages all four artifacts", () => {
    renderLibrary();
    const card = screen.getByTestId("example-card");
    expect(card.textContent).toContain("Example: Two-Agent Task Workflow");
    expect(card.textContent).toContain("from the slc demo");
    // Collapsed: no stage rail yet.
    expect(card.textContent).not.toContain("Normalized text");

    fireEvent.click(screen.getByTestId("example-toggle"));
    for (const label of ["Source", "Normalized text", "Gears", "State machine"]) {
      expect(within(card).getByRole("button", { name: label })).toBeTruthy();
    }
    // Source opens first: the raw prose, pre-normalization.
    expect(card.textContent).toContain(
      "handing them back to the first agent to judge",
    );

    fireEvent.click(within(card).getByRole("button", { name: "Normalized text" }));
    expect(card.textContent).toContain("Coder is the agent that modifies");

    fireEvent.click(within(card).getByRole("button", { name: "Gears" }));
    // Gears render as markdown: the item heading becomes an <h3>.
    expect(within(card).getByText("REPO-1").tagName).toBe("H3");

    fireEvent.click(within(card).getByRole("button", { name: "State machine" }));
    expect(card.textContent).toContain("from 'xstate'");
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
      "Two-Agent Task Workflow — Use two agents to carry out the input task.",
    );
    expect(roles.value).toBe("Coder, Reviewer");
    // The NORMALIZED text, never the raw prose (DR-015): the compile
    // pipeline skips slc's normalize phase.
    expect(source.value).toBe(SLC_DEMO.stages.normalized);
    expect(source.value).toContain("# Two-Agent Task Workflow");
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
      "gemini · claude-opus-4-8 @ high",
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
