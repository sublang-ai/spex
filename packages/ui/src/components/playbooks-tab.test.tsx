// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A project's Playbooks tab over a simulated document, through the
// real store against a stand-in client answering as the core does: the
// project's and your own group's playbooks together, once by id, with
// no switch — a playbook both environments export carrying the
// project's act and your own group's in its overflow
// (playbook-library-1, -94);
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

import { NEUTRAL_BLOCK, PlaybooksTab } from "./PlaybooksTab.js";
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

/** Render the project's tab, its lists answered as `next` says. */
async function renderTab(
  next: Partial<CommandResults["environment.playbooks"]> = {},
  over: Partial<ReturnType<typeof useAppStore.getState>> = {},
) {
  lists = { project: [], own: [CODE_OWN, REVIEW_NOWHERE], ...next };
  seed(over);
  const view = render(<PlaybooksTab project={PROJECT} />);
  await vi.waitFor(() => expect(useAppStore.getState().playbookLists).toBeTruthy());
  return view;
}

/** A playbook's one card under `root`: a playbook both environments
 * export is listed once by its id (playbook-library-1). */
function cardOf(id: string, root: ParentNode = document): HTMLElement {
  const cards = root.querySelectorAll<HTMLElement>(`[data-testid="playbook-card-${id}"]`);
  if (cards.length !== 1) throw new Error(`${cards.length} cards for ${id}`);
  return cards[0]!;
}

/** The acts in a row's overflow, opened (playbook-library-1). */
function overflowOf(card: HTMLElement, id: string): HTMLElement {
  fireEvent.click(within(card).getByTestId(`playbook-personal-${id}`));
  return within(card).getByTestId(`playbook-personal-${id}-menu`);
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
    await renderTab();
    // The role's own line says which session player answers it, and
    // the chip describes that lane's agent (DR-032).
    expect(screen.getByTestId("role-binding-code-coder").textContent).toBe("Ccoder");
    // Its name and mark, its id in the tooltip beside what it runs.
    expect(screen.getByTestId("role-binding-code-coder").title).toBe("dev.coder · claude-opus-5 @ high");
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
    await renderTab();
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
    await renderTab();
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
    await renderTab({
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
    await renderTab();
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
    await renderTab();
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
    await renderTab(
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
    );
    // Both environments export code, enabled in both: its one row shows
    // the project's bindings, the ones a session in the project runs.
    const card = await vi.waitFor(() => cardOf("code"));
    fireEvent.click(within(card).getByTestId("role-bind-code-reviewer"));
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
    await renderTab();
    const card = within(screen.getByTestId("playbooks-available")).getByTestId("playbook-card-review");
    expect(card.textContent).toContain("/review");
    expect(card.textContent).toContain("review of committed phases");
    expect(card.textContent).toContain("host:");
    // Enabled nowhere, it wears no mark of where (DR-172), and names
    // where it comes from.
    expect(within(card).queryByTestId("playbook-enabled-review")).toBeNull();
    expect(within(card).getByTestId("playbook-from-review").textContent).toBe("built in");
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
    await renderTab({ project: [{ ...REVIEW_NOWHERE, repository: PROJECT_ID }] });
    // Both environments export review: its primary act writes the
    // project's config.
    const card = await vi.waitFor(() => cardOf("review"));
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
    await renderTab();
    fireEvent.click(screen.getByTestId("playbook-enable-review"));
    await vi.waitFor(() =>
      expect(edits()[0]).toEqual({ op: { kind: "player.set", playerId: "dev.host", patch: NEUTRAL_BLOCK } }),
    );
    cleanup();
    commandMock.mockClear();

    // The proposed id is editable: naming a lane the roster holds
    // writes no player and shares that lane by choice (DR-032).
    await renderTab();
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
    await renderTab();
    fireEvent.change(screen.getByTestId("enable-player-review-host"), { target: { value: "Dev Host" } });
    const enable = screen.getByTestId("playbook-enable-review") as HTMLButtonElement;
    expect(enable.disabled).toBe(true);
    expect(enable.title).toContain("host needs a player id");
  });

  test("an enabling failure surfaces inline on the card", async () => {
    await renderTab();
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
    await renderTab();
    const disable = screen.getByTestId("playbook-disable-code");
    expect(disable.textContent).toBe("Disable");
    fireEvent.click(disable);
    await vi.waitFor(() =>
      expect(edits()).toEqual([{ repository: OWN_KEY, op: { kind: "playbook.delete", playbookId: "code" } }]),
    );
  });

  test("[playbook-library-34] with no playbook enabled the list says so as a key phrase", async () => {
    await renderTab({ own: [REVIEW_NOWHERE] });
    expect(screen.getByTestId("playbooks-empty").textContent).toBe("Nothing enabled yet");
    // The other playbooks stand under Available (playbook-library-1).
    expect(within(screen.getByTestId("playbooks-available")).getByRole("heading").textContent).toBe("Available");
  });

  test("[playbook-library-1] a project whose config enables nothing lists your own group's enabled playbook under Enabled, never as empty", async () => {
    // Both environments export code and review: each is listed once,
    // with no switch, and code, which your own group enables, stands
    // under Enabled.
    await renderTab(
      { project: [{ ...REVIEW_NOWHERE, repository: PROJECT_ID }, { ...CODE_OWN, repository: PROJECT_ID }], own: [CODE_OWN, REVIEW_NOWHERE] },
    );
    expect(screen.queryByTestId("playbooks-switch")).toBeNull();
    const enabled = screen.getByTestId("playbooks-enabled");
    expect(screen.getAllByTestId("playbook-card-code")).toHaveLength(1);
    const code = cardOf("code", enabled);
    expect(within(code).getByTestId("playbook-enabled-code").textContent).toBe("Personal");
    // The row is the playbook's, naming no environment it comes from.
    expect(within(code).queryByTestId("playbook-origin-code")).toBeNull();
    // Enabled for you alone, its primary act is "Enable for <project>",
    // writing the project's config (playbook-library-3); its overflow
    // holds Disable for Personal, writing yours.
    const forProject = within(code).getByTestId("playbook-enable-code");
    expect(forProject.textContent).toBe("Enable for demo");
    expect(forProject.title).toBe("Members of demo get it too");
    expect(within(code).queryByTestId("playbook-disable-code")).toBeNull();
    const menu = overflowOf(code, "code");
    const disablePersonal = within(menu).getByTestId("playbook-disable-personal-code");
    expect(disablePersonal.textContent).toBe("Disable for Personal");
    expect(disablePersonal.title).toBe("Stops /code in every project of yours; the package stays");
    expect(within(menu).queryByTestId("playbook-enable-personal-code")).toBeNull();
    fireEvent.click(disablePersonal);
    await vi.waitFor(() =>
      expect(edits()).toEqual([{ repository: OWN_KEY, op: { kind: "playbook.delete", playbookId: "code" } }]),
    );
    expect(screen.getAllByTestId("playbook-card-review")).toHaveLength(1);
    expect(cardOf("review", screen.getByTestId("playbooks-available"))).toBeTruthy();
    expect(screen.queryByTestId("playbooks-empty")).toBeNull();

    cleanup();
    commandMock.mockClear();
    // Your own group's environment alone exports code: one row writing
    // your own group's config, with no overflow, and the list still
    // never reads as empty.
    await renderTab({ project: [{ ...REVIEW_NOWHERE, repository: PROJECT_ID }], own: [CODE_OWN] });
    const after = cardOf("code", screen.getByTestId("playbooks-enabled"));
    expect(within(after).getByTestId("playbook-disable-code").textContent).toBe("Disable");
    expect(within(after).queryByTestId("playbook-personal-code")).toBeNull();
    expect(screen.queryByTestId("playbooks-empty")).toBeNull();
  });
});

describe("playbook-library-1: both environments' playbooks on one tab, once each", () => {
  test("each playbook lists once by its id, reading where it is enabled, with no switch and no package list", async () => {
    await renderTab({
      project: [
        available({
          id: "triage",
          package: "acme/triage",
          version: "1.2.3",
          source: "registry",
          repository: PROJECT_ID,
          roles: ["triager"],
          enabled: ["project"],
          bindings: { project: { triager: { playerId: "dev.coder", display: "claude-opus-5 @ high" } } },
        }),
        available({ id: "code", repository: PROJECT_ID, roles: ["coder", "reviewer"] }),
        available({ id: "review", repository: PROJECT_ID, roles: ["host"], enabled: ["own"] }),
      ],
      own: [
        available({ id: "code", roles: ["coder", "reviewer"] }),
        available({
          id: "review",
          roles: ["host"],
          enabled: ["own"],
          bindings: { own: { host: { playerId: "dev.reviewer", display: "gpt-5.6-sol" } } },
        }),
      ],
    });
    await screen.findByTestId("playbook-card-triage");
    // No switch between the project and your own group, and nothing of
    // the packages: they stand on the Packages tab (playbook-library-1).
    expect(screen.queryByTestId("playbooks-switch")).toBeNull();
    expect(screen.queryByTestId("environment-section")).toBeNull();
    expect(screen.queryByTestId("add-packages")).toBeNull();
    expect(screen.queryByTestId("registry-account")).toBeNull();
    // The project's environment alone exports triage, enabled there:
    // one row writing the project's config, with no overflow.
    const triage = cardOf("triage");
    expect(within(triage).getByTestId("playbook-enabled-triage").textContent).toBe("in demo");
    expect(within(triage).getByTestId("role-binding-triage-triager").textContent).toBe("Ccoder");
    expect(within(triage).queryByTestId("playbook-personal-triage")).toBeNull();
    // [playbook-library-29] the package and version it comes from,
    // its source in the tooltip.
    expect(screen.getByTestId("playbook-from-triage").textContent).toBe("from acme/triage 1.2.3");
    expect(screen.getByTestId("playbook-from-triage").title).toBe("From the registry");
    // Both export code and review: one row each.
    expect(screen.getAllByTestId("playbook-card-code")).toHaveLength(1);
    expect(screen.getAllByTestId("playbook-card-review")).toHaveLength(1);
    expect(within(cardOf("code")).queryByTestId("playbook-enabled-code")).toBeNull();
    expect(within(cardOf("code")).getByTestId("playbook-from-code").textContent).toBe("built in");
    // The source in the Packages tab's words (playbook-library-92).
    expect(within(cardOf("code")).getByTestId("playbook-from-code").title).toBe("Built in");
    // Sectioned by what a session effectively runs: review, which your
    // own group enables, stands under Enabled, bound as your own
    // group's config binds it and offering Enable for the project; code,
    // which neither enables, below.
    const enabled = screen.getByTestId("playbooks-enabled");
    const available_ = screen.getByTestId("playbooks-available");
    expect(cardOf("triage", enabled)).toBeTruthy();
    const review = cardOf("review", enabled);
    expect(within(review).getByTestId("playbook-enabled-review").textContent).toBe("Personal");
    expect(within(review).getByTestId("role-binding-review-host").textContent).toBe("Rreviewer");
    expect(within(review).getByTestId("playbook-enable-review").textContent).toBe("Enable for demo");
    expect(available_.querySelectorAll('[data-testid="playbook-card-review"]')).toHaveLength(0);
    expect(cardOf("code", available_)).toBeTruthy();
    expect(screen.queryByTestId("playbooks-empty")).toBeNull();

    // Code's "Enable for Personal" writes your own group's config with
    // the players proposed.
    const code = cardOf("code");
    fireEvent.change(within(code).getByTestId("enable-player-code-coder"), { target: { value: "dev.coder" } });
    fireEvent.change(within(code).getByTestId("enable-player-code-reviewer"), { target: { value: "dev.reviewer" } });
    fireEvent.click(within(overflowOf(code, "code")).getByTestId("playbook-enable-personal-code"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([
        { repository: OWN_KEY, op: { kind: "playbook.add", playbookId: "code", roles: { coder: "dev.coder", reviewer: "dev.reviewer" } } },
      ]),
    );
    // Review's "Enable for <project>" writes the project's config,
    // naming the player your own group's entry binds.
    fireEvent.click(within(review).getByTestId("playbook-enable-review"));
    await vi.waitFor(() =>
      expect(edits()).toContainEqual({ repository: PROJECT_ID, op: { kind: "playbook.add", playbookId: "review", roles: { host: "dev.reviewer" } } }),
    );
  });

  test("[playbook-library-94] a playbook both environments export is one row in each state: where it is enabled, whose bindings it shows, the project's act and your own group's in its overflow", async () => {
    // Four playbooks both environments export, one coder role each: the
    // project's entry binds it to dev.reviewer, yours to dev.coder.
    const projectRoles = { coder: { playerId: "dev.reviewer", display: "gpt-5.6-sol" } };
    const ownRoles = { coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" } };
    const both = (id: string, enabled: ("project" | "own")[]): [PlaybookAvailability, PlaybookAvailability] => {
      const bindings = {
        ...(enabled.includes("project") ? { project: projectRoles } : {}),
        ...(enabled.includes("own") ? { own: ownRoles } : {}),
      };
      return [available({ id, repository: PROJECT_ID, enabled, bindings }), available({ id, enabled, bindings })];
    };
    const pairs = [both("ship", ["project"]), both("mine", ["own"]), both("pair", ["project", "own"]), both("idle", [])];
    await renderTab({ project: pairs.map(([inProject]) => inProject), own: pairs.map(([, inOwn]) => inOwn) });
    const enabled = screen.getByTestId("playbooks-enabled");
    const available_ = screen.getByTestId("playbooks-available");
    // Each state: its section, where it is enabled, the binding shown —
    // the project's where it is enabled there, else yours, else the
    // proposed player — its primary act, and its overflow's one act.
    const matrix = [
      ["ship", enabled, "in demo", "Rreviewer", "playbook-disable-ship", "Disable", "playbook-enable-personal-ship", "Enable for Personal"],
      ["mine", enabled, "Personal", "Ccoder", "playbook-enable-mine", "Enable for demo", "playbook-disable-personal-mine", "Disable for Personal"],
      ["pair", enabled, "in demo · Personal", "Rreviewer", "playbook-disable-pair", "Disable", "playbook-disable-personal-pair", "Disable for Personal"],
      ["idle", available_, null, null, "playbook-enable-idle", "Enable for demo", "playbook-enable-personal-idle", "Enable for Personal"],
    ] as const;
    for (const [id, section, where, bound, primary, primaryText, personal, personalText] of matrix) {
      expect(screen.getAllByTestId(`playbook-card-${id}`)).toHaveLength(1);
      const card = cardOf(id, section);
      if (where === null) expect(within(card).queryByTestId(`playbook-enabled-${id}`)).toBeNull();
      else expect(within(card).getByTestId(`playbook-enabled-${id}`).textContent).toBe(where);
      if (bound === null) expect((within(card).getByTestId(`enable-player-${id}-coder`) as HTMLInputElement).value).toBe("dev.coder");
      else expect(within(card).getByTestId(`role-binding-${id}-coder`).textContent).toBe(bound);
      expect(within(card).getByTestId(primary).textContent).toBe(primaryText);
      const trigger = within(card).getByTestId(`playbook-personal-${id}`);
      expect(trigger.getAttribute("aria-label")).toBe(`More for /${id}`);
      const menu = overflowOf(card, id);
      expect(within(menu).getAllByRole("menuitem").map((item) => item.dataset.testid)).toEqual([personal]);
      expect(within(menu).getByTestId(personal).textContent).toBe(personalText);
      fireEvent.click(trigger);
      expect(within(card).queryByTestId(`playbook-personal-${id}-menu`)).toBeNull();
    }

    // Each act writes its config — the primary the project's, the
    // overflow yours — an enabling naming the players the shown
    // bindings name.
    const ship = cardOf("ship");
    fireEvent.click(within(ship).getByTestId("playbook-disable-ship"));
    await vi.waitFor(() => expect(edits()).toHaveLength(1));
    await vi.waitFor(() => expect((within(ship).getByTestId("playbook-personal-ship") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(overflowOf(ship, "ship")).getByTestId("playbook-enable-personal-ship"));
    await vi.waitFor(() => expect(edits()).toHaveLength(2));
    fireEvent.click(within(cardOf("mine")).getByTestId("playbook-enable-mine"));
    await vi.waitFor(() => expect(edits()).toHaveLength(3));
    fireEvent.click(within(overflowOf(cardOf("pair"), "pair")).getByTestId("playbook-disable-personal-pair"));
    await vi.waitFor(() => expect(edits()).toHaveLength(4));
    fireEvent.click(within(overflowOf(cardOf("idle"), "idle")).getByTestId("playbook-enable-personal-idle"));
    await vi.waitFor(() => expect(edits()).toHaveLength(5));
    expect(edits()).toEqual([
      { repository: PROJECT_ID, op: { kind: "playbook.delete", playbookId: "ship" } },
      { repository: OWN_KEY, op: { kind: "playbook.add", playbookId: "ship", roles: { coder: "dev.reviewer" } } },
      { repository: PROJECT_ID, op: { kind: "playbook.add", playbookId: "mine", roles: { coder: "dev.coder" } } },
      { repository: OWN_KEY, op: { kind: "playbook.delete", playbookId: "pair" } },
      { repository: OWN_KEY, op: { kind: "playbook.add", playbookId: "idle", roles: { coder: "dev.coder" } } },
    ]);
  });

  test("a read for another project lists nothing here", async () => {
    seed({ playbookLists: { project: [available({ id: "elsewhere", repository: "acme/other-spex" })], own: [], projectId: "acme/other-spex" } });
    commandMock.mockImplementation(async (type: string) => (type === "environment.playbooks" ? new Promise(() => {}) : type === "draft.list" ? [] : null));
    render(<PlaybooksTab project={PROJECT} />);
    expect(screen.queryByTestId("playbook-card-elsewhere")).toBeNull();
    expect(screen.getByTestId("playbooks-enabled").textContent).toContain("loading…");
  });

  test("a playbook both configs enable reads both places, one whose files are gone says so, and Manage packages opens the Packages tab", async () => {
    await renderTab({
      project: [
        available({
          id: "triage",
          package: "acme/triage",
          version: "0.1.0",
          source: "path",
          folder: "/work/demo/spex-packages/acme/triage",
          repository: PROJECT_ID,
          enabled: ["project", "own"],
          present: false,
          bindings: {
            project: { coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" } },
            own: { coder: { playerId: "dev.coder", display: "claude-opus-5 @ high" } },
          },
        }),
      ],
      own: [],
    });
    const card = await vi.waitFor(() => cardOf("triage"));
    expect(within(card).getByTestId("playbook-enabled-triage").textContent).toBe("in demo · Personal");
    // A folder package names its folder in the source's tooltip.
    expect(within(card).getByTestId("playbook-from-triage").textContent).toBe("from acme/triage 0.1.0");
    expect(within(card).getByTestId("playbook-from-triage").title).toBe("From folder /work/demo/spex-packages/acme/triage");
    // Enabled in its own config, the row offers Disable alone.
    expect(within(card).queryByTestId("playbook-enable-triage")).toBeNull();
    expect(within(card).getByTestId("playbook-disable-triage").title).toBe(
      "Stops /triage for every member of demo; the package stays",
    );
    expect(within(card).getByTestId("playbook-absent-triage").textContent).toBe("Its files are not on this computer");

    // Nothing of the packages stands here but the way to their tab.
    useAppStore.setState({ workspaceTabs: { [PROJECT_ID]: "playbooks" } });
    const manage = screen.getByTestId("manage-packages");
    expect(manage.textContent).toBe("Manage packages");
    fireEvent.click(manage);
    expect(useAppStore.getState().workspaceTabs[PROJECT_ID]).toBe("packages");
    expect(edits()).toEqual([]);
  });

  test("an act names in its tooltip whose config it writes", async () => {
    await renderTab({
      project: [available({ id: "dev", repository: PROJECT_ID })],
      own: [available({ id: "dev" }), available({ id: "inspect" })],
    });
    // Both environments export dev: the primary act writes the
    // project's config, the overflow's yours.
    const dev = await vi.waitFor(() => cardOf("dev"));
    const enable = within(dev).getByTestId("playbook-enable-dev");
    expect(enable.textContent).toBe("Enable for demo");
    expect(enable.title).toBe("For you and every member of demo");
    expect(enable.getAttribute("aria-label")).toBe("Enable /dev for demo");
    expect(within(overflowOf(dev, "dev")).getByTestId("playbook-enable-personal-dev").title).toBe(
      "For you, in every project of yours",
    );
    // Your own group's environment alone exports inspect: a plain
    // Enable writing your own group's config, with no overflow.
    const inspect = cardOf("inspect");
    expect(within(inspect).getByTestId("playbook-enable-inspect").textContent).toBe("Enable");
    expect(within(inspect).getByTestId("playbook-enable-inspect").title).toBe("For you, in every project of yours");
    expect(within(inspect).queryByTestId("playbook-personal-inspect")).toBeNull();
  });
});

describe("playbook-library-2: invalid entries stand marked", () => {
  test("a listed entry carries its failure, and one no environment exports lists with it", async () => {
    await renderTab({
      invalid: [
        { config: "own", playbook: "code", reason: "duplicate command /code" },
        { config: "own", playbook: "ghost", reason: "no environment of the session exports ghost" },
        { config: "project", playbook: "elsewhere", reason: "not in the project's environment" },
      ],
    });
    expect(screen.getByTestId("playbook-invalid-code").textContent).toBe("Invalid: duplicate command /code");
    const ghost = cardOf("ghost");
    expect(within(ghost).getByTestId("playbook-invalid-ghost").textContent).toBe(
      "Invalid: no environment of the session exports ghost",
    );
    fireEvent.click(within(ghost).getByTestId("playbook-disable-ghost"));
    await vi.waitFor(() =>
      expect(edits()).toEqual([{ repository: OWN_KEY, op: { kind: "playbook.delete", playbookId: "ghost" } }]),
    );
    // The project's config's failure stands beside it, its Disable
    // writing the project's config.
    const elsewhere = cardOf("elsewhere");
    expect(within(elsewhere).getByTestId("playbook-invalid-elsewhere").textContent).toBe(
      "Invalid: not in the project's environment",
    );
    fireEvent.click(within(elsewhere).getByTestId("playbook-disable-elsewhere"));
    await vi.waitFor(() =>
      expect(edits()).toContainEqual({ repository: PROJECT_ID, op: { kind: "playbook.delete", playbookId: "elsewhere" } }),
    );
  });
});

describe("playbook-library-89/90: packaged work names its required review", () => {
  test.each(["en", "zh"] as const)("code and decide name their effective commands until validated review is enabled (%s)", async (language) => {
    activateLanguage(language);
    await renderTab({
      own: [configured("code", { command: "build" }), configured("decide", { command: "design" })],
    });
    expect(screen.getByTestId("review-required-hint-code").textContent).toBe(
      language === "zh" ? "/build 需要先启用 /review" : "/build needs /review enabled",
    );
    expect(screen.getByTestId("review-required-hint-decide").textContent).toBe(
      language === "zh" ? "/design 需要先启用 /review" : "/design needs /review enabled",
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
    await renderTab({
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
    await renderTab({
      own: [configured("code"), configured("review")],
      invalid: [{ config: "own", playbook: "review", reason: "role host is unresolved" }],
    });
    expect(screen.getByTestId("review-required-hint-code")).toBeTruthy();
  });
});

describe("playbook-library-48/49: dev names the delivery built-ins it lacks", () => {
  test("dev without branch or pr carries the hint naming both", async () => {
    await renderTab({ own: [configured("dev", { intent: "plan a development request" })] });
    const hint = screen.getByTestId("dev-delivery-hint");
    expect(hint.textContent).toBe("Pull requests need /branch and /pr · /dev still runs");
    // A hint, not an invalid mark.
    expect(screen.queryByTestId("playbook-invalid-dev")).toBeNull();
  });

  test("dev with branch enabled in the project but not pr names only pr", async () => {
    await renderTab({
      own: [configured("dev")],
      project: [available({ id: "branch", repository: PROJECT_ID, enabled: ["project"] })],
    });
    expect(screen.getByTestId("dev-delivery-hint").textContent).toBe("Pull requests need /pr · /dev still runs");
  });

  test("dev with both enabled carries no hint", async () => {
    await renderTab({ own: [configured("dev"), configured("branch"), configured("pr")] });
    expect(screen.queryByTestId("dev-delivery-hint")).toBeNull();
  });
});

describe("playbook-library-28/31: the config gate", () => {
  const invalid: ConfigState = { status: "invalid", path: "/tmp/config.yaml", errors: ["playbooks must be an object"] };

  test("an invalid own config replaces the tab with the gate, Settings a control where navigation is offered", async () => {
    const onNavigate = vi.fn();
    seed({ configState: invalid });
    render(<PlaybooksTab project={PROJECT} onNavigate={onNavigate} />);
    expect(screen.queryByText("The Captain can only run playbooks listed here.")).toBeNull();
    const settings = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(settings);
    expect(onNavigate).toHaveBeenCalledWith("Settings");
    expect(screen.queryByTestId("playbooks-enabled")).toBeNull();
    expect(screen.queryByTestId("register-form")).toBeNull();
  });

  test("a missing config without navigation names Settings as plain text", () => {
    seed({ configState: { status: "missing", path: "/tmp/config.yaml" } });
    render(<PlaybooksTab project={PROJECT} />);
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
    await renderTab({ own: [CODE_OWN] });
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
    await renderTab({ own: [CODE_OWN] });
    const row = screen.getByTestId("stages-code");
    fireEvent.click(within(row).getByRole("button", { name: "Gears" }));
    await vi.waitFor(() =>
      expect(screen.getByTestId("item-CODE-1")).toBeTruthy(),
    );

    // A row is the ID chip in its group colour and the first line,
    // under its section's heading — a Gears section outside the
    // package grammar heads by its own words — and the body waits
    // behind the toggle.
    expect(screen.getByTestId("section-CODE-1").textContent).toBe("Coder · 2");
    const second = screen.getByTestId("item-CODE-2");
    expect(second.textContent).toContain("CODE-2");
    expect(second.textContent).not.toContain("external");
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
    await renderTab({ own: [CODE_OWN] });
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
    await renderTab({ own: [CODE_OWN] });
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
    await renderTab({ own: [CODE_OWN] });
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
      await renderTab({ own: [CODE_OWN] });
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
    await renderTab({ own: [CODE_OWN] });
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
    await renderTab();
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

  test("the prefill waits for New playbook's Org and License", async () => {
    // No defaults read: the fields stand empty for the person to fill.
    await renderTab();
    const prefill = screen.getByTestId("example-prefill") as HTMLButtonElement;
    expect(prefill.disabled).toBe(true);
    expect(prefill.title).toBe("Org and License first");
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
