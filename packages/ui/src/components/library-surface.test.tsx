// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Playbooks surface coverage over a simulated document, through the
// real store against a stand-in client answering as the core does:
// enabled roles name the session player that answers them and are
// rebound in place — with tuning on your own group's entry, the player
// alone on a project's (playbook-library-4, -38, -39); a playbook
// enabled nowhere offers Enable, writing a missing player to your own
// roster first (playbook-library-3, -34, -40), and Disable asks no
// confirm; invalid entries stand marked (playbook-library-2); the
// review and delivery hints (playbook-library-48, -49, -89, -90); the
// config gate (playbook-library-28, -31); the permanent stage row
// (playbook-library-22, -23, -45); and the example card
// (playbook-library-35).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type {
  CommandResults,
  ConfigState,
  PlaybookAvailability,
} from "@sublang/spex-core/protocol";

import { LibrarySurface, NEUTRAL_BLOCK } from "./LibrarySurface.js";
import { agentChipText } from "./AgentChip.js";
import { activateLanguage } from "../i18n.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import { SpexCommandError } from "../lib/client.js";
import {
  CONFIG_STATE,
  OWN_ENVIRONMENT,
  OWN_KEY,
  PROJECT,
  PROJECT_ENVIRONMENT,
  PROJECT_ID,
  READINESS,
  available,
  home,
} from "../fixtures/playbooks.js";

const commandMock = vi.fn();

afterEach(() => {
  cleanup();
  activateLanguage("en");
  setClientForTests(undefined);
});

/** `code` enabled in your own group's config: its coder on a lane a
 * second position shares, its reviewer with its own effort. */
const CODE_OWN = available({
  id: "code",
  intent: "software development workflow",
  roles: ["coder", "reviewer"],
  enabled: ["own"],
  bindings: {
    own: {
      coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" },
      reviewer: { playerId: "dev.reviewer", effort: "max", display: "gpt-5.6-sol @ max" },
    },
  },
});

/** `review`, a built-in no config enables. */
const REVIEW_NOWHERE = available({ id: "review", intent: "review of committed phases", roles: ["host"] });

let lists: CommandResults["environment.playbooks"];

function seed(over: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    connection: "open",
    configState: CONFIG_STATE,
    readiness: READINESS,
    projects: [PROJECT],
    currentProjectId: PROJECT_ID,
    space: home(),
    playbooksSide: "own",
    playbookLists: undefined,
    environments: {},
    environmentErrors: {},
    drafts: {},
    draftsLoaded: true,
    openDraftId: undefined,
    revealPlaybook: undefined,
    newPlaybookRequested: false,
    compileProgress: {},
    activeCompile: undefined,
    ...over,
  });
}

/** Render the surface on a side, its lists answered as `next` says. */
async function renderLibrary(
  next: Partial<CommandResults["environment.playbooks"]> = {},
  over: Partial<ReturnType<typeof useAppStore.getState>> = {},
) {
  lists = { project: [], own: [CODE_OWN, REVIEW_NOWHERE], ...next };
  seed(over);
  const view = render(<LibrarySurface />);
  await vi.waitFor(() => expect(useAppStore.getState().playbookLists).toBeTruthy());
  return view;
}

/** A playbook of your own group's config, its single coder role. */
const configured = (id: string, over: Partial<PlaybookAvailability> = {}) =>
  available({
    id,
    intent: `${id} intent`,
    enabled: ["own"],
    bindings: { own: { coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" } } },
    ...over,
  });

beforeEach(() => {
  useAppStore.setState({ loadAgentOptions: async (adapter) => ({
    adapter, effortValues: adapter === "claude" ? ["high", "ultracode"] : adapter === "codex" ? ["high", "ultra"] : ["high"],
    fastModeSupported: adapter === "claude" || adapter === "codex", subagentModelSupported: adapter === "claude",
    // The core lists a subagent's efforts less the orchestration value.
    subagentEffortValues: adapter === "claude" ? ["high"] : [],
    discovery: { status: "unavailable", reason: "Fixture" },
  }) });
  commandMock.mockReset();
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
    switch (type) {
      case "environment.playbooks":
        return lists;
      case "environment.get":
        return params?.repository === PROJECT_ID ? PROJECT_ENVIRONMENT : OWN_ENVIRONMENT;
      case "config.edit":
        return CONFIG_STATE;
      case "draft.list":
        return [];
      case "playbook.artifacts":
        return { source: null, gears: null, fsm: null, stateIds: null, machine: null, missing: [] };
      default:
        return null;
    }
  });
  setClientForTests({ command: commandMock } as unknown as Parameters<typeof setClientForTests>[0]);
});

function edits(): unknown[] {
  return commandMock.mock.calls.filter(([type]) => type === "config.edit").map(([, params]) => params);
}

describe("playbook-library-1/38/39: enabled roles name the player that answers them", () => {
  test("a role prints its lane, what it runs, and that the lane is shared", async () => {
    await renderLibrary();
    // The role's own line says which session player answers it, and
    // the chip describes that lane's agent (DR-032).
    expect(screen.getByTestId("role-binding-code-coder").textContent).toBe("dev.coder");
    expect(screen.getByTestId("role-binding-code-coder").title).toBe("claude-opus-5 @ high");
    expect(
      screen.getByLabelText("dev.coder: claude · claude-opus-5 @ high (ready)"),
    ).toBeTruthy();
    // dev.coder answers a second position, so it is one conversation
    // across both and the badge names the other.
    expect(screen.getByTestId("role-shared-code-coder").title).toContain("fix.coder");
    // dev.reviewer answers this binding alone: no shared badge.
    expect(screen.queryByTestId("role-shared-code-reviewer")).toBeNull();
  });

  test("on your own group's entry the gear rebinds the role and pins its own effort", async () => {
    await renderLibrary();
    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    const editor = screen.getByTestId("binding-editor-coder");
    await within(editor).findByText("Model list unavailable: Fixture");
    // Every lane in the roster is offerable, none invented here.
    expect(
      Array.from(
        within(editor).getByTestId("binding-player").querySelectorAll("option"),
      ).map((option) => (option as HTMLOptionElement).value),
    ).toEqual(["dev.coder", "dev.reviewer"]);
    expect(within(editor).queryByTestId("binding-personal-note")).toBeNull();

    fireEvent.change(within(editor).getByTestId("binding-effort-mode"), {
      target: { value: "pin" },
    });
    fireEvent.change(within(editor).getByTestId("binding-effort-value"), {
      target: { value: "ultracode" },
    });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      // A binding carries a player and its own tuning only — adapter
      // and permissions belong to the lane (DR-032) — in your own
      // group's config.
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: {
          kind: "playbook.role.bind",
          playbookId: "code",
          role: "coder",
          playerId: "dev.coder",
          effort: "ultracode",
        },
        repository: OWN_KEY,
      }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByTestId("binding-editor-coder")).toBeNull(),
    );
  });

  test("the gear pins the role's subagent model and effort where the lane's adapter serves one (DR-093, DR-095)", async () => {
    await renderLibrary();
    // A codex lane is offered neither.
    fireEvent.click(screen.getByTestId("role-bind-code-reviewer"));
    const reviewer = screen.getByTestId("binding-editor-reviewer");
    await within(reviewer).findByText("Model list unavailable: Fixture");
    expect(within(reviewer).queryByTestId("binding-subagent-model-mode")).toBeNull();
    expect(within(reviewer).queryByTestId("binding-subagent-effort-mode")).toBeNull();
    fireEvent.keyDown(reviewer, { key: "Escape" });

    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    const editor = screen.getByTestId("binding-editor-coder");
    await within(editor).findByText("Model list unavailable: Fixture");
    // [playbook-library-4] the model and its effort, then the subagent
    // model and its effort, as the cells of one paired grid.
    const rows = within(editor).getByTestId("binding-tuning-rows");
    expect(rows.className).toContain("@xs:grid-cols-2");
    expect([...rows.querySelectorAll("select[data-testid$='-mode']")].map((select) => select.getAttribute("data-testid"))).toEqual([
      "binding-model-mode", "binding-effort-mode", "binding-subagent-model-mode", "binding-subagent-effort-mode",
    ]);
    const mode = within(editor).getByTestId("binding-subagent-model-mode") as HTMLSelectElement;
    // [playbook-library-4] an unset player's subagent model inherits as
    // "Same as agent", and "Off" is offered only while it stands.
    expect([...mode.options].map((option) => option.textContent)).toEqual([
      "inherit the player (Same as agent)", "pin a value…",
    ]);
    fireEvent.change(mode, { target: { value: "pin" } });
    fireEvent.change(within(editor).getByTestId("binding-subagent-model-value"), {
      target: { value: "claude-haiku-5" },
    });
    // [playbook-library-4] an unset player's subagent effort inherits as
    // "Agent chooses", which is also the provider-default choice; a pin
    // lists the adapter's subagent efforts, never its orchestration one.
    const effort = within(editor).getByTestId("binding-subagent-effort-mode") as HTMLSelectElement;
    expect([...effort.options].map((option) => option.textContent)).toEqual([
      "inherit the player (Agent chooses)", "Agent chooses", "pin a value…",
    ]);
    fireEvent.change(effort, { target: { value: "pin" } });
    const pinned = within(editor).getByTestId("binding-subagent-effort-value") as HTMLSelectElement;
    expect([...pinned.options].map((option) => option.value)).toEqual(["", "high"]);
    fireEvent.change(pinned, { target: { value: "high" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: {
          kind: "playbook.role.bind",
          playbookId: "code",
          role: "coder",
          playerId: "dev.coder",
          subagentModel: "claude-haiku-5",
          subagentEffort: "high",
        },
        repository: OWN_KEY,
      }),
    );
  });

  test("a binding's standing Off reads as such and stays clearable (DR-095)", async () => {
    await renderLibrary({
      own: [
        {
          ...CODE_OWN,
          bindings: {
            own: {
              ...CODE_OWN.bindings!.own!,
              coder: { playerId: "dev.coder", display: "claude-opus-5 @ high", subagentModel: false, subagentEffort: false },
            },
          },
        },
      ],
    });
    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    const editor = screen.getByTestId("binding-editor-coder");
    await within(editor).findByText("Model list unavailable: Fixture");
    const mode = within(editor).getByTestId("binding-subagent-model-mode") as HTMLSelectElement;
    expect(mode.value).toBe("provider");
    expect([...mode.options].map((option) => option.textContent)).toEqual([
      "inherit the player (Same as agent)", "Off", "pin a value…",
    ]);
    expect((within(editor).getByTestId("binding-subagent-effort-mode") as HTMLSelectElement).value).toBe("provider");
    fireEvent.change(mode, { target: { value: "inherit" } });
    // Cleared, the Off choice is gone: it is offered only while it stands.
    expect([...mode.options].map((option) => option.textContent)).toEqual([
      "inherit the player (Same as agent)", "pin a value…",
    ]);
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: expect.objectContaining({ kind: "playbook.role.bind", role: "coder", subagentModel: null, subagentEffort: false }),
        repository: OWN_KEY,
      }),
    );
  });

  test("choosing a busy lane warns that the conversation is shared", async () => {
    await renderLibrary();
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
    await renderLibrary();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "config.edit") throw new Error("dev.ghost is not a player");
      return base(type, params);
    });
    fireEvent.click(screen.getByTestId("role-bind-code-coder"));
    fireEvent.click(screen.getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(
        screen.getByTestId("binding-editor-coder").textContent,
      ).toContain("dev.ghost is not a player"),
    );
  });

  test("on a project's entry the editor offers the player alone, says tuning is personal, and writes the name alone", async () => {
    await renderLibrary(
      {
        project: [
          available({
            id: "code",
            repository: PROJECT_ID,
            roles: ["coder", "reviewer"],
            enabled: ["project"],
            bindings: {
              project: {
                coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" },
                reviewer: { playerId: "dev.reviewer", display: "gpt-5.6-sol" },
              },
            },
          }),
        ],
      },
      { playbooksSide: "project" },
    );
    await screen.findByTestId("role-bind-code-reviewer");
    fireEvent.click(screen.getByTestId("role-bind-code-reviewer"));
    const editor = screen.getByTestId("binding-editor-reviewer");
    expect(within(editor).getByTestId("binding-personal-note").textContent).toBe(
      "Tuning is personal — set it in Settings",
    );
    // No tuning field stands: the player is the only choice.
    expect(within(editor).queryByTestId("binding-tuning-rows")).toBeNull();
    expect(within(editor).queryByTestId("binding-fast-mode")).toBeNull();
    fireEvent.change(within(editor).getByTestId("binding-player"), { target: { value: "dev.coder" } });
    fireEvent.click(within(editor).getByTestId("binding-save"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        op: { kind: "playbook.role.bind", playbookId: "code", role: "reviewer", playerId: "dev.coder" },
        repository: PROJECT_ID,
      }),
    );
  });
});

describe("playbook-library-3/34/40: enabling and disabling", () => {
  test("a built-in enabled in neither config lists its command, intent and roles with Enable, and its source browses with no write", async () => {
    await renderLibrary();
    const card = within(screen.getByTestId("playbooks-available")).getByTestId("playbook-card-review");
    expect(card.textContent).toContain("/review");
    expect(card.textContent).toContain("review of committed phases");
    expect(card.textContent).toContain("host:");
    expect(within(card).getByTestId("playbook-enabled-review").textContent).toBe("Not enabled");
    // The proposed player is dev.<role>, on the fixed neutral block
    // until the reader tunes it (DR-019, DR-032).
    expect((within(card).getByTestId("enable-player-review-host") as HTMLInputElement).value).toBe("dev.host");
    expect(within(card).getByTestId("agent-chip").textContent).toContain(agentChipText(NEUTRAL_BLOCK));
    expect(within(card).getByTestId("playbook-enable-review").textContent).toBe("Enable");
    // The source browses through the stage row, writing nothing.
    fireEvent.click(within(within(card).getByTestId("stages-review")).getByRole("button", { name: "Source" }));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("playbook.artifacts", { playbookId: "review", repository: OWN_KEY }),
    );
    expect(edits()).toEqual([]);
  });

  test("[playbook-library-40] enabling writes the missing player to your own roster first, with the block chosen, then the entry", async () => {
    await renderLibrary({ project: [{ ...REVIEW_NOWHERE, repository: PROJECT_ID }] }, { playbooksSide: "project" });
    const card = await screen.findByTestId("playbook-card-review");
    fireEvent.click(within(card).getByTestId("enable-configure-review-host"));
    const popover = within(card).getByTestId("agent-popover");
    fireEvent.click(within(popover).getByTestId("agent-adapter-codex"));
    await within(popover).findByText("Model list unavailable: Fixture");
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

    fireEvent.click(within(card).getByTestId("playbook-enable-review"));
    await vi.waitFor(() => expect(edits()).toHaveLength(2));
    // The player the roster lacks is written to your own roster first,
    // carrying the whole block, so the binding that follows never
    // dangles; the project's entry names the player alone, with no
    // `from` (playbook-library-3, DR-104).
    expect(edits()).toEqual([
      {
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
      },
      {
        repository: PROJECT_ID,
        op: { kind: "playbook.add", playbookId: "review", roles: { host: "dev.host" } },
      },
    ]);
    // The list reads again to show where it is now enabled.
    await vi.waitFor(() =>
      expect(commandMock.mock.calls.filter(([type]) => type === "environment.playbooks").length).toBeGreaterThan(1),
    );
  });

  test("an untouched role is written on the neutral block; an id the roster holds is bound as it stands", async () => {
    await renderLibrary();
    fireEvent.click(screen.getByTestId("playbook-enable-review"));
    await vi.waitFor(() =>
      expect(edits()[0]).toEqual({ op: { kind: "player.set", playerId: "dev.host", patch: NEUTRAL_BLOCK } }),
    );
    cleanup();
    commandMock.mockClear();

    // The proposed id is editable: naming a lane the roster holds
    // writes no player and shares that lane by choice (DR-032).
    await renderLibrary();
    const input = screen.getByTestId("enable-player-review-host");
    fireEvent.change(input, { target: { value: "dev.reviewer" } });
    // A lane the roster holds wears its own agent and needs no block.
    expect(screen.queryByTestId("enable-configure-review-host")).toBeNull();
    fireEvent.click(screen.getByTestId("playbook-enable-review"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        { repository: OWN_KEY, op: { kind: "playbook.add", playbookId: "review", roles: { host: "dev.reviewer" } } },
      ]),
    );
  });

  test("an id outside the player rule holds Enable, naming the role", async () => {
    await renderLibrary();
    fireEvent.change(screen.getByTestId("enable-player-review-host"), { target: { value: "Dev Host" } });
    const enable = screen.getByTestId("playbook-enable-review") as HTMLButtonElement;
    expect(enable.disabled).toBe(true);
    expect(enable.title).toContain("host needs a player id");
  });

  test("an enabling failure surfaces inline on the card", async () => {
    await renderLibrary();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "config.edit") throw new Error("config file is read-only");
      return base(type, params);
    });
    fireEvent.click(screen.getByTestId("playbook-enable-review"));
    await vi.waitFor(() =>
      expect(screen.getByTestId("playbook-error-review").textContent).toBe("config file is read-only"),
    );
  });

  test("[playbook-library-26] Disable asks no confirm and writes the side's config", async () => {
    await renderLibrary();
    const disable = screen.getByTestId("playbook-disable-code");
    expect(disable.textContent).toBe("Disable");
    fireEvent.click(disable);
    await vi.waitFor(() =>
      expect(edits()).toEqual([{ repository: OWN_KEY, op: { kind: "playbook.delete", playbookId: "code" } }]),
    );
  });

  test("[playbook-library-34] with no playbook enabled the list says so and points at enabling a built-in or authoring one", async () => {
    await renderLibrary({ own: [REVIEW_NOWHERE] });
    expect(screen.getByTestId("playbooks-empty").textContent).toBe(
      "No playbooks enabled yet — enable a built-in below, or make your own with New playbook.",
    );
  });
});

describe("playbook-library-2: invalid entries stand marked", () => {
  test("a listed entry carries its failure, and one no environment exports lists with it", async () => {
    await renderLibrary({
      invalid: [
        { config: "own", playbook: "code", reason: "duplicate command /code" },
        { config: "own", playbook: "ghost", reason: "no environment of the session exports ghost" },
        { config: "project", playbook: "elsewhere", reason: "not on this side" },
      ],
    });
    expect(screen.getByTestId("playbook-invalid-code").textContent).toBe("Invalid: duplicate command /code");
    const ghost = screen.getByTestId("playbook-card-ghost");
    expect(within(ghost).getByTestId("playbook-invalid-ghost").textContent).toBe(
      "Invalid: no environment of the session exports ghost",
    );
    // Another side's failure is that side's.
    expect(screen.queryByTestId("playbook-card-elsewhere")).toBeNull();
    fireEvent.click(within(ghost).getByTestId("playbook-disable-ghost"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([{ repository: OWN_KEY, op: { kind: "playbook.delete", playbookId: "ghost" } }]),
    );
  });
});

describe("playbook-library-89/90: packaged work names its required review", () => {
  test.each(["en", "zh"] as const)("code and decide name their effective commands until validated review is enabled (%s)", async (language) => {
    activateLanguage(language);
    await renderLibrary({
      own: [configured("code", { command: "build" }), configured("decide", { command: "design" })],
    });
    expect(screen.getByTestId("review-required-hint-code").textContent).toBe(
      language === "zh" ? "/build 暂不可运行；请先在下方启用 /review。" : "/build is unavailable until /review is enabled below.",
    );
    expect(screen.getByTestId("review-required-hint-decide").textContent).toBe(
      language === "zh" ? "/design 暂不可运行；请先在下方启用 /review。" : "/design is unavailable until /review is enabled below.",
    );
    expect(edits()).toEqual([]);

    // The list read again with review enabled: the hints go.
    lists = {
      project: [],
      own: [configured("code", { command: "build" }), configured("decide", { command: "design" }), configured("review")],
    };
    await act(async () => {
      await useAppStore.getState().loadPlaybookLists(PROJECT_ID);
    });
    expect(screen.queryByTestId("review-required-hint-code")).toBeNull();
    expect(screen.queryByTestId("review-required-hint-decide")).toBeNull();
    expect(edits()).toEqual([]);
  });

  test.each(["en", "zh"] as const)("another spec package's same ids and unrelated built-ins receive no hint (%s)", async (language) => {
    activateLanguage(language);
    await renderLibrary({
      own: [
        configured("code", { package: "acme/flows", source: "registry" }),
        configured("decide", { package: "acme/flows", source: "path" }),
        configured("inspect"),
      ],
    });
    expect(screen.queryByTestId("review-required-hint-code")).toBeNull();
    expect(screen.queryByTestId("review-required-hint-decide")).toBeNull();
    expect(screen.queryByTestId("review-required-hint-inspect")).toBeNull();
    expect(edits()).toEqual([]);
  });

  test("a review that fails validation does not count as enabled", async () => {
    await renderLibrary({
      own: [configured("code"), configured("review")],
      invalid: [{ config: "own", playbook: "review", reason: "role host is unresolved" }],
    });
    expect(screen.getByTestId("review-required-hint-code")).toBeTruthy();
  });
});

describe("playbook-library-48/49: dev names the delivery built-ins it lacks", () => {
  test("dev without branch or pr carries the hint naming both", async () => {
    await renderLibrary({ own: [configured("dev", { intent: "plan a development request" })] });
    const hint = screen.getByTestId("dev-delivery-hint");
    expect(hint.textContent).toContain("/branch and /pr are enabled");
    expect(hint.textContent).toContain("plain /dev request still runs");
    // A hint, not an invalid mark.
    expect(screen.queryByTestId("playbook-invalid-dev")).toBeNull();
  });

  test("dev with branch enabled in the project but not pr names only pr", async () => {
    await renderLibrary({
      own: [configured("dev")],
      project: [available({ id: "branch", repository: PROJECT_ID, enabled: ["project"] })],
    });
    expect(screen.getByTestId("dev-delivery-hint").textContent).toContain("/pr is enabled");
  });

  test("dev with both enabled carries no hint", async () => {
    await renderLibrary({ own: [configured("dev"), configured("branch"), configured("pr")] });
    expect(screen.queryByTestId("dev-delivery-hint")).toBeNull();
  });
});

describe("playbook-library-28/31: the config gate", () => {
  const invalid: ConfigState = { status: "invalid", path: "/tmp/config.yaml", errors: ["playbooks must be an object"] };

  test("an invalid own config replaces the surface with the gate, Settings a control where navigation is offered", async () => {
    const onNavigate = vi.fn();
    seed({ configState: invalid });
    render(<LibrarySurface onNavigate={onNavigate} />);
    expect(screen.getByText("The Captain can only run playbooks listed here.")).toBeTruthy();
    const settings = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(settings);
    expect(onNavigate).toHaveBeenCalledWith("Settings");
    expect(screen.queryByTestId("playbooks-enabled")).toBeNull();
    expect(screen.queryByTestId("register-form")).toBeNull();
  });

  test("a missing config without navigation names Settings as plain text", () => {
    seed({ configState: { status: "missing", path: "/tmp/config.yaml" } });
    render(<LibrarySurface />);
    expect(screen.getByText(/Playbooks need a valid config/).textContent).toBe(
      "Playbooks need a valid config — fix it in Settings.",
    );
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByTestId("playbooks-enabled")).toBeNull();
  });
});

/** The Gears artifact as the core serves it: the markdown plus the
 * parse the card draws as rows (playbook-library-24). */
const GEARS_ITEMS = {
  path: "specs/packages/code.md",
  key: "code",
  dir: "",
  basename: "code",
  title: "Coding Workflow",
  items: [
    {
      id: "CODE-1",
      group: "external",
      section: "Coder",
      firstLine: "The coder shall write the change.",
      text: "The coder shall write the change.",
      cites: [] as string[],
    },
    {
      id: "CODE-2",
      group: "external",
      section: "Coder",
      firstLine: "The reviewer shall read it.",
      text: "The reviewer shall read it [[CODE-1](code.md#CODE-1)]:\n\n- the review names the commit.",
      cites: ["CODE-1"],
    },
  ],
  notices: [] as string[],
};

const ARTIFACTS = {
  source: "# Code workflow\n\nThe coder writes.",
  gears:
    "### CODE-1\n\nThe coder shall write the change.\n\n### CODE-2\n\nThe reviewer shall read it.",
  gearsItems: GEARS_ITEMS,
  fsm: "import { setup } from 'xstate';",
  stateIds: ["idle", "coding"],
  machine: null,
  missing: [] as string[],
};

/** Answer playbook.artifacts with `load`, leaving the surface's other
 * commands on the default stub. */
function withArtifacts(load: () => Promise<unknown>): void {
  const base = commandMock.getMockImplementation()!;
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
    type === "playbook.artifacts" ? load() : base(type, params),
  );
}

function artifactCalls(): number {
  return commandMock.mock.calls.filter(
    ([type]) => type === "playbook.artifacts",
  ).length;
}

describe("playbook-library-22/23/45: a listed playbook wears its pipeline as a row", () => {
  test("a press opens a stage, a second closes it, another swaps — on one request for that environment's artifact", async () => {
    withArtifacts(async () => ARTIFACTS);
    await renderLibrary({ own: [CODE_OWN] });
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
    expect(commandMock).toHaveBeenCalledWith("playbook.artifacts", { playbookId: "code", repository: OWN_KEY });
    expect(artifactCalls()).toBe(1);
    expect(screen.getByTestId("pipeline-code").textContent).toContain("loading…");
    await vi.waitFor(() =>
      expect(screen.getByTestId("pipeline-code").textContent).toContain(
        "The coder writes.",
      ),
    );

    // Another stage swaps to it; the code is what scrolls.
    fireEvent.click(within(row).getByRole("button", { name: "State machine" }));
    const box = screen.getByTestId("pipeline-code");
    expect(box.textContent).not.toContain("The coder writes.");
    expect(box.textContent).toContain("xstate");

    // Pressing the open stage closes it, and reopening reuses what
    // arrived: one request for this card.
    fireEvent.click(within(row).getByRole("button", { name: "State machine" }));
    expect(screen.queryByTestId("pipeline-code")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Gears" }));
    expect(screen.getByTestId("pipeline-code").textContent).toContain("CODE-1");
    expect(artifactCalls()).toBe(1);
  });

  test("the Gears stage stands as the outline's rows, collapsed", async () => {
    withArtifacts(async () => ARTIFACTS);
    await renderLibrary({ own: [CODE_OWN] });
    const row = screen.getByTestId("stages-code");
    fireEvent.click(within(row).getByRole("button", { name: "Gears" }));
    await vi.waitFor(() =>
      expect(screen.getByTestId("item-CODE-1")).toBeTruthy(),
    );

    // A row is the ID chip in its group colour, the group word, and
    // the first line — the body waits behind the toggle.
    const second = screen.getByTestId("item-CODE-2");
    expect(second.textContent).toContain("CODE-2");
    expect(second.textContent).toContain("external");
    expect(second.textContent).toContain("The reviewer shall read it.");
    expect(second.textContent).not.toContain("the review names the commit");
    const toggle = screen.getByTestId("item-toggle-CODE-2");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Read-only: no Edit control and no copy chip on this surface.
    expect(screen.queryByTestId("item-edit-CODE-2")).toBeNull();
    expect(screen.queryByLabelText("Copy CODE-2")).toBeNull();

    // Expanding renders the body with its citations.
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("item-CODE-2").textContent).toContain(
      "the review names the commit",
    );

    // A settled hover previews the cited item at hand, the same card
    // the outline raises.
    fireEvent.mouseEnter(screen.getByTestId("link-CODE-2-CODE-1"));
    await vi.waitFor(() =>
      expect(screen.getByTestId("citation-preview").textContent).toContain(
        "The coder shall write the change.",
      ),
    );

    // A citation of a sibling lands on it inside the box: the target
    // expands and flashes, with no navigation away from the card.
    fireEvent.click(screen.getByTestId("link-CODE-2-CODE-1"));
    expect(screen.queryByTestId("citation-preview")).toBeNull();
    expect(
      screen.getByTestId("item-toggle-CODE-1").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByTestId("item-CODE-1").className).toContain("ring-2");
    expect(screen.getByTestId("stages-code")).toBeTruthy();
  });

  test("gears the parser could not read fall back to the markdown", async () => {
    withArtifacts(async () => ({ ...ARTIFACTS, gearsItems: undefined }));
    await renderLibrary({ own: [CODE_OWN] });
    fireEvent.click(
      within(screen.getByTestId("stages-code")).getByRole("button", {
        name: "Gears",
      }),
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("pipeline-code").textContent).toContain(
        "The coder shall write the change.",
      ),
    );
    expect(screen.queryByTestId("item-CODE-1")).toBeNull();
  });

  test("the State machine's stage names its states", async () => {
    withArtifacts(async () => ARTIFACTS);
    await renderLibrary({ own: [CODE_OWN] });
    fireEvent.click(
      within(screen.getByTestId("stages-code")).getByRole("button", {
        name: "State machine",
      }),
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("stage-states-code")).toBeTruthy(),
    );
    const states = screen.getByTestId("stage-states-code");
    expect(states.textContent).toContain("states");
    expect(states.textContent).toContain("idle");
    expect(states.textContent).toContain("coding");
  });

  test("a stage the load cannot locate is struck out, inactive, and named in the box", async () => {
    withArtifacts(async () => ({ ...ARTIFACTS, gears: null, missing: ["gears"] }));
    await renderLibrary({ own: [CODE_OWN] });
    const row = screen.getByTestId("stages-code");
    const gears = () =>
      within(row).getByRole("button", { name: "Gears" }) as HTMLButtonElement;
    // Before the load the row knows of no absence and offers it.
    expect(gears().disabled).toBe(false);

    fireEvent.click(within(row).getByRole("button", { name: "Source" }));
    await vi.waitFor(() => expect(gears().disabled).toBe(true));
    // Struck out as well as quiet: never colour alone (DR-010 §7).
    expect(gears().className).toContain("line-through");
    expect(gears().title).toBe("Gears not found beside this playbook's module");
    // The absence is named in the open stage, not on the card.
    expect(screen.getByTestId("pipeline-code").textContent).toContain(
      "missing stages: Gears",
    );
  });

  /** jsdom measures nothing, so the capped box is given its cap and
   * content taller than it — the state the grip stands in. */
  function sized(scrollHeight: number): () => void {
    const prior = (["clientHeight", "scrollHeight"] as const).map(
      (name) =>
        [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const,
    );
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return parseFloat(this.style.maxHeight) || 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.style.maxHeight ? scrollHeight : 0;
      },
    });
    return () => {
      for (const [name, descriptor] of prior) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
        else Reflect.deleteProperty(HTMLElement.prototype, name);
      }
      useAppStore.setState({ frameHeights: {} });
    };
  }

  test("the open stage's box is a frame the reader sets, one height for the card", async () => {
    const REM = 16;
    const restore = sized(1000);
    try {
      useAppStore.setState({ frameHeights: {} });
      withArtifacts(async () => ARTIFACTS);
      await renderLibrary({ own: [CODE_OWN] });
      const row = screen.getByTestId("stages-code");
      fireEvent.click(within(row).getByRole("button", { name: "Source" }));
      await vi.waitFor(() =>
        expect(screen.getByTestId("pipeline-code").textContent).toContain(
          "The coder writes.",
        ),
      );
      const box = screen.getByTestId("stage-box-code");
      expect(box.style.maxHeight).toBe(`${24 * REM}px`);

      // The bottom edge is a control naming the stage it caps, and it
      // reports the height in the box's own unit (DR-010 §7).
      const grip = screen.getByTestId("stage-box-code-grip");
      expect(grip.getAttribute("role")).toBe("separator");
      expect(grip.getAttribute("aria-orientation")).toBe("horizontal");
      expect(grip.getAttribute("aria-label")).toBe("Resize the Source stage");
      expect(grip.getAttribute("aria-valuenow")).toBe("24");
      expect(grip.getAttribute("aria-valuemin")).toBe("8");
      expect(grip.getAttribute("aria-valuemax")).toBe("48");
      expect(grip.getAttribute("tabindex")).toBe("0");

      // Dragged, the edge follows the pointer a step at a time.
      fireEvent.pointerDown(grip, { clientY: 40 });
      fireEvent.pointerMove(grip, { clientY: 40 + 8 * REM });
      fireEvent.pointerUp(grip, { clientY: 40 + 8 * REM });
      expect(box.style.maxHeight).toBe(`${32 * REM}px`);

      // Arrow keys move it a step at a time; neither bound is passed.
      for (let nudge = 0; nudge < 60; nudge += 1) {
        fireEvent.keyDown(grip, { key: "ArrowDown" });
      }
      expect(box.style.maxHeight).toBe(`${48 * REM}px`);
      for (let nudge = 0; nudge < 60; nudge += 1) {
        fireEvent.keyDown(grip, { key: "ArrowUp" });
      }
      expect(box.style.maxHeight).toBe(`${8 * REM}px`);

      // A double-click restores the default.
      fireEvent.doubleClick(grip);
      expect(box.style.maxHeight).toBe(`${24 * REM}px`);

      // The height is remembered for the playbook, one height serving
      // its stages (DR-030).
      fireEvent.keyDown(grip, { key: "ArrowDown" });
      expect(useAppStore.getState().frameHeights["stage:code"]).toBe(25);
      fireEvent.click(within(row).getByRole("button", { name: "Gears" }));
      expect(screen.getByTestId("stage-box-code").style.maxHeight).toBe(
        `${25 * REM}px`,
      );
      expect(
        screen.getByTestId("stage-box-code-grip").getAttribute("aria-label"),
      ).toBe("Resize the Gears stage");
    } finally {
      restore();
    }
  });

  test("a failed request leaves its message in the open stage", async () => {
    withArtifacts(async () => {
      throw new Error("no module beside /tmp/code");
    });
    await renderLibrary({ own: [CODE_OWN] });
    fireEvent.click(
      within(screen.getByTestId("stages-code")).getByRole("button", {
        name: "Source",
      }),
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId("pipeline-code").textContent).toContain(
        "no module beside /tmp/code",
      ),
    );
  });
});

describe("playbook-library-35: the example card", () => {
  test("the row stands on the card and opens all four in-memory stages", async () => {
    await renderLibrary();
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

  test("the prefill is offered only with a project chosen", async () => {
    await renderLibrary({ project: null }, { projects: [], currentProjectId: undefined });
    const prefill = screen.getByTestId("example-prefill") as HTMLButtonElement;
    expect(prefill.disabled).toBe(true);
    expect(prefill.title).toBe("Add a project first");
  });
});

describe("DR-015: repeated Academy seeding opens the existing project", () => {
  test("a conflict on the default path selects the registered example", async () => {
    const academy = {
      id: "p-academy",
      path: "/Users/dev/spex-academy",
      name: "spex-academy",
      createdAt: 1,
    };
    commandMock.mockImplementation(async (type: string) => {
      if (type === "project.create") {
        // The words follow the home's language; the facts do not.
        throw new SpexCommandError("conflict", "已注册", { path: "/Users/dev/spex-academy" });
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
