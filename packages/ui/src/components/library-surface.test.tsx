// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// DR-015 Library coverage: unconfigured built-ins render from the
// catalog with browsable sources and a playbook.add flow, and the
// slc demo example card stages the pipeline and prefills the
// compile form with the normalized text.

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

import { LibrarySurface } from "./LibrarySurface.js";
import { useAppStore } from "../state/store.js";
import { SLC_DEMO } from "../examples/slc-demo.js";
import type {
  BuiltinPlaybookInfo,
  ConfigState,
} from "@sublang/spex-core/protocol";

const CONFIG_STATE: ConfigState = {
  status: "valid",
  seeded: false,
  summary: {
    path: "/tmp/config.yaml",
    captain: "claude-opus",
    profiles: [
      { id: "claude-opus", adapter: "claude", model: "claude-opus-4-8" },
      { id: "codex-mini", adapter: "codex", model: "gpt-5.5-codex" },
    ],
    playbooks: [
      {
        id: "code",
        from: "@sublang/playbook/code/registry",
        command: "code",
        intent: "software development workflow",
        players: {
          coder: { ref: "claude-opus", display: "claude-opus-4-8" },
        },
      },
    ],
  },
};

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
    readiness: [],
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

describe("DR-015: built-ins section from the catalog", () => {
  test("only unconfigured entries render as available built-ins", () => {
    renderLibrary();
    const section = screen.getByTestId("builtins-section");
    const card = within(section).getByTestId("builtin-discuss");
    expect(card.textContent).toContain("/discuss");
    expect(card.textContent).toContain("structured design discussion");
    expect(card.textContent).toContain("host:");
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

  test("the add flow applies playbook.add with the mapped players", async () => {
    renderLibrary();
    const card = screen.getByTestId("builtin-discuss");
    fireEvent.change(within(card).getByRole("combobox"), {
      target: { value: "codex-mini" },
    });
    fireEvent.click(screen.getByTestId("builtin-add-discuss"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: {
          kind: "playbook.add",
          playbookId: "discuss",
          from: "@sublang/playbook/discuss/registry",
          players: { host: "codex-mini" },
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
  });
});
