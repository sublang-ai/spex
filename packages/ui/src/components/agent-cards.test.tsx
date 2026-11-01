// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent cards and the Workshop adapter limit (settings-56 to
// settings-61, DR-174), rendered over fixture readiness, catalogs and
// configs: what each card says for each base-URL state and computer,
// the one-model batch, and the batch setting official names behind a
// third-party service to Provider default.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

afterEach(cleanup);

const flags = vi.hoisted(() => ({ workshop: true }));
vi.mock("../lib/workshop.js", () => ({
  get WORKSHOP() { return flags.workshop; },
  WORKSHOP_ADAPTERS: ["claude", "codex"],
}));

/** Each adapter's catalog, and the refresh a Retry calls. */
const catalogs = vi.hoisted(() => ({
  defaultModel: "deepseek-flash" as string | undefined,
  refresh: vi.fn(),
}));
vi.mock("../lib/agent-options.js", async (original) => {
  const actual = await original<typeof import("../lib/agent-options.js")>();
  return {
    ...actual,
    useAgentOptions: (adapter: string) => ({
      options: {
        adapter,
        effortValues: ["low", "medium", "high"],
        fastModeSupported: false,
        subagentModelSupported: adapter === "claude",
        subagentEffortValues: [],
        discovery: {
          status: "available",
          models: adapter === "claude"
            ? [{ id: "deepseek-flash", name: "deepseek-flash" }, { id: "deepseek-v4-pro", name: "deepseek-v4-pro" }]
            : [{ id: "gpt-6-sol", name: "gpt-6-sol" }],
          ...(adapter === "claude" && catalogs.defaultModel ? { defaultModel: catalogs.defaultModel } : {}),
          ...(adapter === "codex" ? { defaultModel: "gpt-6-sol" } : {}),
        },
      },
      loading: false,
      refresh: catalogs.refresh,
    }),
  };
});

const { commandMock } = vi.hoisted(() => ({ commandMock: vi.fn() }));

import { AgentCards } from "./AgentCards.js";
import { AgentEditor } from "./AgentEditor.js";
import { SettingsSurface } from "./SettingsSurface.js";
import { PlaceStoreContext } from "../state/place-context.js";
import { createAppStore, setClientForTests, useAppStore } from "../state/store.js";
import { SpexCommandError } from "../lib/client.js";
import type { BaseUrlState, ConfigState, ReadinessEntry } from "@sublang/spex-core/protocol";

type Valid = Extract<ConfigState, { status: "valid" }>;

/** A Captain and two players on Claude, one role's binding naming a
 * model of its own, and a Codex reviewer. */
const UNIFY: Valid = {
  status: "valid",
  seeded: false,
  revision: "rev-1",
  summary: {
    path: "/tmp/playbook.config.yaml",
    captain: { adapter: "claude", model: "claude-opus-5-5" },
    players: [
      { id: "dev.coder", agent: { adapter: "claude", model: "claude-opus-5-5" }, display: "claude-opus-5-5", boundBy: ["code.coder", "review.coder"] },
      { id: "dev.writer", agent: { adapter: "claude" }, display: "claude", boundBy: [] },
      { id: "dev.reviewer", agent: { adapter: "codex", model: "gpt-6-sol" }, display: "gpt-6-sol", boundBy: ["review.reviewer"] },
    ],
    playbooks: [
      { id: "code", from: "", command: "code", intent: "", roles: { coder: { playerId: "dev.coder", display: "claude-opus-5-5" } } },
      {
        id: "review", from: "", command: "review", intent: "",
        roles: {
          coder: { playerId: "dev.coder", model: "claude-opus-5-5", display: "claude-opus-5-5" },
          reviewer: { playerId: "dev.reviewer", display: "gpt-6-sol" },
        },
      },
    ],
  },
};

/** Official and third-party names crossing on players and bindings. */
const CROSSED: Valid = {
  status: "valid",
  seeded: false,
  revision: "rev-7",
  summary: {
    path: "/tmp/playbook.config.yaml",
    captain: { adapter: "claude", model: "claude-opus-5-5" },
    players: [
      { id: "dev.coder", agent: { adapter: "claude", model: "claude-opus-5-5" }, display: "", boundBy: ["code.coder"] },
      { id: "dev.writer", agent: { adapter: "claude", model: "deepseek-flash" }, display: "", boundBy: ["code.reviewer"] },
      { id: "dev.official", agent: { adapter: "claude", model: "opus[1m]" }, display: "", boundBy: ["review.coder"] },
      // Bound by no role of your own, only by a project's.
      { id: "dev.spare", agent: { adapter: "claude", model: "claude-haiku-4" }, display: "", boundBy: [] },
      { id: "dev.late", agent: { adapter: "claude", model: "opus" }, display: "", boundBy: [] },
    ],
    playbooks: [
      {
        id: "code", from: "", command: "code", intent: "",
        roles: {
          // An official player, a third-party binding: not listed.
          coder: { playerId: "dev.coder", model: "deepseek-v4-pro", display: "" },
          // A third-party player, an official binding: listed.
          reviewer: { playerId: "dev.writer", model: "claude-sonnet-5", display: "" },
        },
      },
      { id: "review", from: "", command: "review", intent: "", roles: { coder: { playerId: "dev.official", display: "" } } },
    ],
  },
};

const PROJECT = "alice/shop-spex";
/** A project's composition over `own` as core-service-2 composes it:
 * the project's file enabling `fix` and binding its roles by player
 * name alone, the players and their models your own group's. */
function projectComposition(own: Valid, roles: Record<string, string> = { coder: "dev.spare" }): ConfigState {
  return {
    ...own,
    revision: undefined,
    summary: {
      ...own.summary,
      playbooks: [
        ...own.summary.playbooks,
        { id: "fix", from: "", command: "fix", intent: "", roles: Object.fromEntries(Object.entries(roles).map(([role, playerId]) => [role, { playerId, display: "" }])) },
      ],
    },
  } as Valid;
}

function entry(adapter: "claude" | "codex", fields: Partial<ReadinessEntry> = {}): ReadinessEntry {
  return {
    adapter,
    ready: true,
    usedBy: [],
    fastModeSupported: false,
    subagentModelSupported: adapter === "claude",
    faults: [],
    platform: "darwin",
    shell: "zsh",
    ...fields,
  };
}

const CLAUDE_CREDENTIAL = { kind: "credential" as const, requirement: "sign in by running claude in a terminal, or set ANTHROPIC_API_KEY" };
const CODEX_CREDENTIAL = { kind: "credential" as const, requirement: "sign in by running codex in a terminal, or set OPENAI_API_KEY" };
const notReady = (adapter: "claude" | "codex", faults: ReadinessEntry["faults"], fields: Partial<ReadinessEntry> = {}) =>
  entry(adapter, { ready: false, faults, requirement: faults!.map((f) => f.requirement).join("; "), ...fields });

function show(configState: ConfigState | undefined, readiness: ReadinessEntry[], projectConfigs: Record<string, ConfigState> = {}) {
  useAppStore.setState({
    configState,
    readiness,
    projectConfigs,
    projects: [{ id: PROJECT, name: "shop", path: "/work/shop", registeredAt: 0 }] as never,
    refreshReadiness: vi.fn(async () => {}),
  });
  return render(<AgentCards />);
}

/** Choose a row of a card's one-model field by its words. */
function choose(adapter: string, words: RegExp) {
  fireEvent.click(screen.getByTestId(`agent-unify-model-${adapter}-trigger`));
  const row = screen.getAllByTestId(`agent-unify-model-${adapter}-option`).find((option) => words.test(option.textContent ?? ""));
  fireEvent.click(row!);
}

beforeEach(() => {
  flags.workshop = true;
  catalogs.defaultModel = "deepseek-flash";
  catalogs.refresh.mockReset();
  commandMock.mockReset();
  setClientForTests({ command: commandMock } as never);
});

afterEach(() => setClientForTests(undefined));

describe("settings-62: the Workshop switch limits adapter choices", () => {
  const adapters = () => screen.getAllByRole("radio").map((radio) => radio.textContent?.replace("●", "").trim());

  test("on: Claude and Codex, and an adapter the block already names, which may be changed", () => {
    render(<AgentEditor initial={{ adapter: "claude" }} readiness={[]} onSave={vi.fn(async () => {})} onCancel={() => {}} />);
    // settings-56: only the two.
    expect(adapters()).toEqual(["claude", "codex"]);
    cleanup();
    render(<AgentEditor initial={{ adapter: "gemini" }} readiness={[]} onSave={vi.fn(async () => {})} onCancel={() => {}} />);
    // settings-56: the block's own adapter reads as itself and stands.
    expect(adapters()).toEqual(["claude", "codex", "gemini"]);
    expect(screen.getByTestId("agent-adapter-gemini").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByTestId("agent-adapter-claude"));
    expect(screen.getByTestId("agent-adapter-claude").getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("agent-adapter-kimi")).toBeNull();
  });

  test("off: every adapter the runtime knows", () => {
    flags.workshop = false;
    render(<AgentEditor initial={{ adapter: "claude" }} readiness={[]} onSave={vi.fn(async () => {})} onCancel={() => {}} />);
    // settings-56: with the switch off, all five.
    expect(adapters()).toEqual(["claude", "codex", "gemini", "kimi", "opencode"]);
  });
});

describe("settings-63: each base-URL state", () => {
  const cases: { label: string; baseUrl: BaseUrlState; service: string | null; listed: boolean; on: RegExp; off: RegExp; mark: boolean }[] = [
    { label: "unset", baseUrl: { state: "unset" }, service: "Model service: Anthropic official", listed: false, on: /Sign in by running claude in a terminal, or set ANTHROPIC_API_KEY/, off: /Sign in by running claude in a terminal, or set ANTHROPIC_API_KEY/, mark: false },
    { label: "third-party", baseUrl: { state: "third-party", host: "api.deepseek.com" }, service: "Model service: Third party api.deepseek.com", listed: true, on: /Run the setup script to configure it again/, off: /Set ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL/, mark: true },
    { label: "unknown", baseUrl: { state: "unknown" }, service: "Model service: Unrecognized", listed: false, on: /Run the setup script to configure it again/, off: /ANTHROPIC_BASE_URL is not recognized: check the address/, mark: false },
  ];
  for (const each of cases) {
    test(`${each.label}: the model service, the official-name list, the guidance and the mark`, () => {
      for (const workshop of [true, false]) {
        flags.workshop = workshop;
        show(CROSSED, [notReady("claude", [CLAUDE_CREDENTIAL], { baseUrl: each.baseUrl }), entry("codex")]);
        const card = screen.getByTestId("agent-card-claude");
        // settings-5: the model service by the base URL's state.
        expect(within(card).getByTestId("agent-service").textContent).toBe(each.service);
        // settings-59: listed only behind a third party.
        expect(within(card).queryByTestId("agent-official") !== null).toBe(each.listed);
        // settings-61: guidance by the state, and the switch.
        const fault = within(card).getByTestId("agent-fault-credential");
        expect(fault.textContent).toMatch(workshop ? each.on : each.off);
        expect(fault.textContent).toContain("Then quit Spex completely and open it again — see How to configure.");
        // settings-23: the core's own words whole beneath.
        expect(within(fault).getByTestId("agent-fault-core").textContent).toBe(CLAUDE_CREDENTIAL.requirement);
        // settings-34, settings-39: Provider default recommended only
        // behind a third party with a default model read.
        choose("claude", /Provider default/);
        fireEvent.click(screen.getByTestId("agent-unify-model-claude-trigger"));
        expect(screen.queryByTestId("agent-unify-model-claude-mark") !== null).toBe(each.mark);
        if (each.mark) expect(screen.getByTestId("agent-unify-model-claude-mark").textContent).toBe("Recommended");
        cleanup();
      }
    });
  }

  test("hidden, on a seat: no model service, no list, the class's phrase and the Credentials section", () => {
    const seat = createAppStore({ key: "https://space.test#1", name: "lab-1" }, { command: commandMock } as never);
    seat.setState({
      configState: CROSSED,
      projectConfigs: {},
      readiness: [
        notReady("claude", [{ kind: "credential", requirement: "sign in by setting your own credential for claude in the Credentials section" }], {
          baseUrl: { state: "hidden" },
          credential: { class: "none", phrase: "sign in by setting your own credential for claude in the Credentials section" },
        }),
        entry("codex"),
      ],
    });
    render(<PlaceStoreContext.Provider value={seat}><AgentCards /></PlaceStoreContext.Provider>);
    const card = screen.getByTestId("agent-card-claude");
    // settings-5: nothing for hidden.
    expect(within(card).queryByTestId("agent-service")).toBeNull();
    // settings-59: no list.
    expect(within(card).queryByTestId("agent-official")).toBeNull();
    // settings-61: the class's phrase, no local step.
    const fault = within(card).getByTestId("agent-fault-credential");
    expect(fault.textContent).toContain("Credentials section");
    expect(fault.textContent).not.toContain("quit Spex");
    // settings-5: the seat's steps point to the Credentials section.
    const howto = within(card).getByTestId("agent-howto-claude");
    expect(howto.textContent).toContain("Credentials section");
    expect(howto.textContent).not.toMatch(/setup script|export |setx/);
  });

  test("a runtime fault reads as the core's words, and both kinds show both", () => {
    const runtime = { kind: "runtime" as const, requirement: "the claude runtime failed to load — reinstall the app, or run npm install in a checkout" };
    show(CROSSED, [notReady("claude", [runtime]), notReady("codex", [{ kind: "runtime", requirement: "the codex runtime failed to load" }, CODEX_CREDENTIAL])]);
    const claude = screen.getByTestId("agent-card-claude");
    // settings-61: the core's requirement alone, no key to set.
    expect(within(claude).getByTestId("agent-fault-runtime").textContent).toBe(runtime.requirement);
    expect(within(claude).queryByTestId("agent-fault-credential")).toBeNull();
    // settings-61: both halves unmet, both lines.
    const codex = screen.getByTestId("agent-card-codex");
    expect(within(codex).getByTestId("agent-fault-runtime").textContent).toContain("codex runtime failed to load");
    expect(within(codex).getByTestId("agent-fault-credential").textContent).toMatch(/Run codex login, or set OPENAI_API_KEY \(an official OpenAI key\)/);
  });
});

describe("settings-64: how to configure, per place and computer", () => {
  const computers: { platform: string; shell?: string; file: RegExp }[] = [
    { platform: "darwin", shell: "zsh", file: /~\/\.zshrc[\s\S]*export ANTHROPIC_API_KEY=/ },
    { platform: "darwin", shell: "bash", file: /~\/\.bash_profile[\s\S]*export ANTHROPIC_API_KEY=/ },
    { platform: "darwin", shell: "fish", file: /your shell's login configuration file[\s\S]*export ANTHROPIC_API_KEY=/ },
    { platform: "win32", file: /user environment variable[\s\S]*setx ANTHROPIC_API_KEY/ },
  ];
  for (const computer of computers) {
    test(`${computer.platform} ${computer.shell ?? ""}: the manual steps, with and without the setup script`, () => {
      for (const workshop of [true, false]) {
        flags.workshop = workshop;
        show(UNIFY, [
          notReady("claude", [CLAUDE_CREDENTIAL], { baseUrl: { state: "unset" }, platform: computer.platform, ...(computer.shell ? { shell: computer.shell } : {}) }),
          notReady("codex", [CODEX_CREDENTIAL], { platform: computer.platform, ...(computer.shell ? { shell: computer.shell } : {}) }),
        ]);
        const howto = screen.getByTestId("agent-howto-claude");
        // settings-5: the script first only with the switch on.
        expect(within(howto).queryByTestId("agent-howto-script") !== null).toBe(workshop);
        const manual = within(howto).getByTestId("agent-howto-manual").textContent ?? "";
        expect(manual).toMatch(computer.file);
        expect(manual).toContain("Quit Spex completely and open it again.");
        // settings-5: Codex names its key.
        const codex = screen.getByTestId("agent-card-codex");
        expect(codex.textContent).toContain("Codex needs an official OpenAI key.");
        expect(within(codex).getByTestId("agent-howto-manual").textContent).toMatch(computer.platform === "win32" ? /setx OPENAI_API_KEY/ : /export OPENAI_API_KEY=/);
        // settings-5: no position uses Codex here.
        expect(screen.getByTestId("agent-users-codex").textContent).toBe("No role uses Codex yet.");
        cleanup();
      }
    });
  }

  test("a ready card says the connection is checked on the first task, beside its users, and Re-check stands with its line", () => {
    show(UNIFY, [entry("claude", { usedBy: ["captain", "dev.coder (code.coder, review.coder)"], baseUrl: { state: "unset" } }), entry("codex")]);
    // settings-5
    expect(screen.getByTestId("agent-checked-later-claude").textContent).toBe("Whether the connection works is checked on your first task");
    expect(screen.getByTestId("agent-users-claude").textContent).toMatch(/Captain.*dev\.coder/);
    expect(screen.queryByTestId("agent-howto-claude")).toBeNull();
    expect(screen.getByTestId("agent-default-claude").textContent).toBe("Default model: Provider default · deepseek-flash");
    expect(screen.getByTestId("agents-recheck-note").textContent).toBe("Changed a key and still not ready? Quit Spex completely and open it again.");
    expect(screen.getByRole("button", { name: /Re-check readiness/ })).toBeTruthy();
  });
});

describe("settings-65: with no config to read", () => {
  for (const configState of [
    { status: "missing", path: "/tmp/playbook.config.yaml" },
    { status: "invalid", path: "/tmp/playbook.config.yaml", errors: ["captain must resolve an adapter"] },
  ] as ConfigState[]) {
    test(`${configState.status}: both cards still show readiness and steps, with no batch control`, () => {
      useAppStore.setState({
        configState,
        projectConfigs: {},
        readiness: [notReady("claude", [CLAUDE_CREDENTIAL], { baseUrl: { state: "third-party", host: "api.deepseek.com" } }), entry("codex")],
        refreshReadiness: vi.fn(async () => {}),
      });
      render(<SettingsSurface />);
      expect(screen.getByTestId("config-broken")).toBeTruthy();
      // settings-5: both cards beside the broken-config notice.
      expect(screen.getByTestId("agent-card-claude").textContent).toContain("not ready");
      expect(screen.getByTestId("agent-card-codex").textContent).toContain("ready");
      expect(screen.getByTestId("agent-howto-claude")).toBeTruthy();
      // settings-57, settings-59: nothing to batch without a config.
      expect(screen.queryByTestId("agent-unify-claude")).toBeNull();
      expect(screen.queryByTestId("agent-official")).toBeNull();
    });

    test(`${configState.status}, on a seat: the cards' steps point to a Credentials section that stands`, () => {
      const seat = createAppStore({ key: "https://space.test#1", name: "lab-1" }, { command: commandMock } as never);
      commandMock.mockResolvedValue({ hosts: [], agents: [] });
      seat.setState({
        configState,
        projectConfigs: {},
        readiness: [notReady("claude", [{ kind: "credential", requirement: "sign in by setting your own credential for claude in the Credentials section" }], { baseUrl: { state: "hidden" } }), entry("codex")],
      });
      render(<PlaceStoreContext.Provider value={seat}><SettingsSurface /></PlaceStoreContext.Provider>);
      expect(screen.getByTestId("config-broken")).toBeTruthy();
      // settings-5: the seat's steps name the Credentials section…
      expect(screen.getByTestId("agent-howto-claude").textContent).toContain("Credentials section");
      // settings-48: …and it is there, the config broken or not.
      expect(screen.getByTestId("credentials-section")).toBeTruthy();
    });
  }
});

describe("settings-66: one model for every agent of an adapter", () => {
  test("the confirmation, the batch, the done notice and a conflict", async () => {
    commandMock.mockResolvedValue({ ...UNIFY, revision: "rev-2" });
    show(UNIFY, [entry("claude", { baseUrl: { state: "unset" } }), entry("codex")]);
    choose("claude", /deepseek-v4-pro/);
    fireEvent.click(screen.getByTestId("agent-unify-apply-claude"));
    const confirm = screen.getByTestId("agent-unify-confirm-claude");
    // settings-58: the agents it changes, and the role it leaves.
    expect(within(confirm).getByTestId("agent-unify-changes").textContent).toBe("Captaindev.coderdev.writer");
    expect(within(confirm).getByTestId("agent-unify-left").textContent).toBe("review.coder");
    await act(async () => { fireEvent.click(screen.getByTestId("agent-unify-confirm-claude-confirm")); });
    // settings-57, settings-58: one batch, the shown revision, nothing
    // for Codex or the binding.
    expect(commandMock).toHaveBeenCalledTimes(1);
    expect(commandMock).toHaveBeenCalledWith("config.batch", {
      revision: "rev-1",
      ops: [
        { kind: "captain.set", patch: { model: "deepseek-v4-pro" } },
        { kind: "player.set", playerId: "dev.coder", patch: { model: "deepseek-v4-pro" } },
        { kind: "player.set", playerId: "dev.writer", patch: { model: "deepseek-v4-pro" } },
      ],
    });
    // settings-58: done, the left role listed again.
    expect(screen.getByTestId("agent-unify-done-claude").textContent).toContain("review.coder");

    // Provider default removes each `model`.
    commandMock.mockReset();
    // The file gained a player meanwhile: the refusal reads it again.
    const grown: Valid = {
      ...UNIFY,
      revision: "rev-2",
      summary: { ...UNIFY.summary, players: [...UNIFY.summary.players, { id: "dev.late", agent: { adapter: "claude", model: "opus" }, display: "", boundBy: [] }] },
    };
    commandMock.mockImplementation(async (type: string) => {
      if (type === "config.get") return grown;
      throw new SpexCommandError("conflict", "changed meanwhile; retry");
    });
    choose("claude", /Provider default/);
    fireEvent.click(screen.getByTestId("agent-unify-apply-claude"));
    await act(async () => { fireEvent.click(screen.getByTestId("agent-unify-confirm-claude-confirm")); });
    expect(commandMock.mock.calls[0]?.[1]).toMatchObject({ ops: [
      { kind: "captain.set", patch: { model: null } },
      { kind: "player.set", playerId: "dev.coder", patch: { model: null } },
    ] });
    // settings-58: a conflict asks for a retry over the config now
    // shown, read again: the next confirmation lists the new player and
    // carries its revision.
    expect(screen.getByTestId("agent-unify-error-claude").textContent).toMatch(/changed meanwhile and nothing was written: check the list and try again/);
    expect(commandMock).toHaveBeenCalledWith("config.get", {});
    fireEvent.click(screen.getByTestId("agent-unify-apply-claude"));
    expect(screen.getByTestId("agent-unify-changes").textContent).toContain("dev.late");
    commandMock.mockReset();
    commandMock.mockResolvedValue(grown);
    await act(async () => { fireEvent.click(screen.getByTestId("agent-unify-confirm-claude-confirm")); });
    expect(commandMock.mock.calls[0]?.[1]).toMatchObject({ revision: "rev-2" });
  });

  test("behind a third party with no default model, Provider default cannot apply until a model is chosen", () => {
    catalogs.defaultModel = undefined;
    show(UNIFY, [entry("claude", { baseUrl: { state: "third-party", host: "api.deepseek.com" } }), entry("codex")]);
    // settings-58: disabled on Provider default, with its line and Retry.
    const apply = screen.getByTestId("agent-unify-apply-claude") as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    const blind = screen.getByTestId("agent-unify-blind-claude");
    expect(blind.textContent).toContain("The default model can't be read right now: retry, or choose a specific model.");
    fireEvent.click(within(blind).getByRole("button", { name: "Retry" }));
    expect(catalogs.refresh).toHaveBeenCalled();
    choose("claude", /deepseek-flash/);
    expect((screen.getByTestId("agent-unify-apply-claude") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("settings-67: official names behind a third-party service", () => {
  const thirdParty = () => [entry("claude", { baseUrl: { state: "third-party", host: "api.deepseek.com" } }), entry("codex")];

  test("listed by the model each role runs, confirmed with their targets, written where each stands, recomputed after", async () => {
    show(CROSSED, thirdParty(), { [PROJECT]: projectComposition(CROSSED) });
    const list = screen.getByTestId("agent-official-list");
    // settings-59: by the effective model.
    expect(list.textContent).toContain("Captain · claude-opus-5-5");
    expect(list.textContent).toContain("code.reviewer · claude-sonnet-5");
    expect(list.textContent).toContain("review.coder · opus[1m]");
    expect(list.textContent).toContain("fix.coder (shop) · claude-haiku-4");
    expect(list.textContent).not.toContain("code.coder");

    fireEvent.click(screen.getByTestId("agent-official-fix"));
    const rows = screen.getAllByTestId("agent-official-confirm-row").map((row) => row.textContent);
    // settings-60: each role, its model, its target; the project's elsewhere.
    expect(rows).toContain("Captain: claude-opus-5-5 → Provider default · deepseek-flash");
    expect(rows).toContain("code.reviewer: claude-sonnet-5 → Provider default · deepseek-flash");
    // A project's role runs your own player's model: written there.
    expect(rows).toContain("fix.coder (shop): claude-haiku-4 → Provider default · deepseek-flash");
    expect(rows.join("\n")).not.toContain("dev.late");

    // After the write a project binds a further official name.
    const after: Valid = {
      ...CROSSED,
      revision: "rev-8",
      summary: {
        ...CROSSED.summary,
        captain: { adapter: "claude" },
        players: CROSSED.summary.players.map((player) => (player.id === "dev.official" || player.id === "dev.spare" ? { ...player, agent: { adapter: "claude" } } : player)),
        playbooks: CROSSED.summary.playbooks.map((playbook) => (playbook.id === "code"
          ? { ...playbook, roles: { ...playbook.roles, reviewer: { playerId: "dev.writer", model: false, display: "" } } }
          : playbook)),
      },
    };
    commandMock.mockImplementation(async () => {
      // The project's file now binds a role to an official-named player.
      useAppStore.setState({ projectConfigs: { [PROJECT]: projectComposition(after, { coder: "dev.spare", reviewer: "dev.late" }) } });
      return after;
    });
    await act(async () => { fireEvent.click(screen.getByTestId("agent-official-confirm-confirm")); });
    // settings-60: one batch, the shown revision, written where each stands.
    expect(commandMock).toHaveBeenCalledTimes(1);
    const [type, batch] = commandMock.mock.calls[0]!;
    expect(type).toBe("config.batch");
    expect(batch.revision).toBe("rev-7");
    expect(batch.ops).toHaveLength(4);
    expect(batch.ops).toEqual(expect.arrayContaining([
      { kind: "captain.set", patch: { model: null } },
      { kind: "player.set", playerId: "dev.official", patch: { model: null } },
      { kind: "player.set", playerId: "dev.spare", patch: { model: null } },
      { kind: "playbook.role.bind", playbookId: "code", role: "reviewer", playerId: "dev.writer", model: false },
    ]));
    // settings-60: recomputed from the newest state — the project's
    // new binding listed, and nothing says all were set.
    const done = screen.getByTestId("agent-official-done");
    expect(done.textContent).toBe("Written, but these roles still name an official model:");
    const remaining = screen.getByTestId("agent-official-list").textContent;
    expect(remaining).toBe("fix.reviewer (shop) · opus");
    expect(remaining).not.toContain("Captain");
    expect(screen.getByTestId("agent-card-claude").textContent).not.toContain("Every role now uses Provider default.");
  });

  test("a conflict whose project read fails says so once every read settles, and holds the batch until read again", async () => {
    show(CROSSED, thirdParty(), { [PROJECT]: projectComposition(CROSSED) });
    let releaseOwn: (state: ConfigState) => void = () => {};
    let projectFails = true;
    commandMock.mockImplementation((type: string, args: { projectId?: string }) => {
      if (type === "config.batch") return Promise.reject(new SpexCommandError("conflict", "changed meanwhile; retry"));
      if (type === "config.get" && args.projectId === undefined) return new Promise<ConfigState>((resolve) => { releaseOwn = resolve; });
      if (type === "config.get") return projectFails ? Promise.reject(new Error("the project's settings could not be read")) : Promise.resolve(projectComposition(CROSSED));
      return Promise.reject(new Error(`unexpected ${type}`));
    });
    fireEvent.click(screen.getByTestId("agent-official-fix"));
    await act(async () => { fireEvent.click(screen.getByTestId("agent-official-confirm-confirm")); });
    // settings-60: the project's read failed, but your own is still
    // being read — nothing is reported until both settle.
    expect(screen.queryByTestId("agent-official-error")).toBeNull();
    await act(async () => { releaseOwn({ ...CROSSED, revision: "rev-9" }); });
    const error = screen.getByTestId("agent-official-error");
    expect(error.textContent).toContain("could not be read again: the project's settings could not be read");
    // The list may be the refused batch's: no batch from it.
    expect((screen.getByTestId("agent-official-fix") as HTMLButtonElement).disabled).toBe(true);
    // Read again: once every read succeeds, the batch is offered again.
    projectFails = false;
    await act(async () => { fireEvent.click(within(error).getByRole("button", { name: "Read again" })); });
    // Held while your own config is read again too.
    expect(screen.getByTestId("agent-official-error")).toBeTruthy();
    await act(async () => { releaseOwn({ ...CROSSED, revision: "rev-9" }); });
    expect(screen.queryByTestId("agent-official-error")).toBeNull();
    expect((screen.getByTestId("agent-official-fix") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("agent-official-fix"));
    commandMock.mockResolvedValue({ ...CROSSED, revision: "rev-10" });
    await act(async () => { fireEvent.click(screen.getByTestId("agent-official-confirm-confirm")); });
    expect(commandMock).toHaveBeenLastCalledWith("config.batch", expect.objectContaining({ revision: "rev-9" }));
  });

  test("with no default model the control is disabled, with its line and a Retry", () => {
    catalogs.defaultModel = undefined;
    show(CROSSED, thirdParty());
    // settings-60
    expect((screen.getByTestId("agent-official-fix") as HTMLButtonElement).disabled).toBe(true);
    const blind = screen.getByTestId("agent-official-blind");
    expect(blind.textContent).toContain("The default model can't be read right now.");
    fireEvent.click(within(blind).getByRole("button", { name: "Retry" }));
    expect(catalogs.refresh).toHaveBeenCalled();
  });
});
