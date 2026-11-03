// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent cards and the Workshop adapter limit (settings-58 to
// settings-63, DR-204), rendered over fixture readiness, catalogs and
// configs: what each card says for each base-URL state and computer,
// the one-model batch, and the batch setting official names behind a
// third-party service to Provider default.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

afterEach(cleanup);

const flags = vi.hoisted(() => ({ workshop: true }));
vi.mock("../lib/workshop.js", async (original) => ({
  ...(await original<typeof import("../lib/workshop.js")>()),
  get WORKSHOP() { return flags.workshop; },
  WORKSHOP_ADAPTERS: ["claude", "codex"],
  WORKSHOP_GUIDE_URL: "https://merico.feishu.cn/docx/AjiHdkmV1oIAd6xY4CPcWJZpnah",
}));

/** Each adapter's catalog, and the refresh a Retry calls. */
const catalogs = vi.hoisted(() => ({
  defaultModel: "deepseek-flash" as string | undefined,
  /** Claude's rows where a test reads its own, else the two below. */
  claude: undefined as { id: string; name: string; resolvedModel?: string; description?: string }[] | undefined,
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
            ? catalogs.claude ?? [{ id: "deepseek-flash", name: "deepseek-flash" }, { id: "deepseek-v4-pro", name: "deepseek-v4-pro" }]
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
import { createAppStore, deliverServerMessageForTests, setClientForTests, useAppStore } from "../state/store.js";
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
    standsAside: [],
    captain: { adapter: "claude", model: "claude-opus-5-5" },
    players: [
      { id: "dev.coder", agent: { adapter: "claude", model: "claude-opus-5-5" }, display: "claude-opus-5-5", boundBy: ["code.coder", "review.coder"] },
      { id: "dev.writer", agent: { adapter: "claude" }, display: "claude", boundBy: [] },
      { id: "dev.reviewer", agent: { adapter: "codex", model: "gpt-6-sol" }, display: "gpt-6-sol", boundBy: ["review.reviewer"] },
    ],
    playbooks: [
      { id: "code", from: "", origin: "own", command: "code", intent: "", roles: { coder: { playerId: "dev.coder", display: "claude-opus-5-5" } } },
      {
        id: "review", from: "", origin: "own", command: "review", intent: "",
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
    standsAside: [],
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
        id: "code", from: "", origin: "own", command: "code", intent: "",
        roles: {
          // An official player, a third-party binding: not listed.
          coder: { playerId: "dev.coder", model: "deepseek-v4-pro", display: "" },
          // A third-party player, an official binding: listed.
          reviewer: { playerId: "dev.writer", model: "claude-sonnet-5", display: "" },
        },
      },
      { id: "review", from: "", origin: "own", command: "review", intent: "", roles: { coder: { playerId: "dev.official", display: "" } } },
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
        { id: "fix", from: "", origin: "own", command: "fix", intent: "", roles: Object.fromEntries(Object.entries(roles).map(([role, playerId]) => [role, { playerId, display: "" }])) },
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
/** Opens a ready card's model setting where it is folded (settings-5). */
function openChange(adapter: string) {
  if (!screen.queryByTestId(`agent-unify-${adapter}`)) fireEvent.click(screen.getByTestId(`agent-change-${adapter}`));
}

function choose(adapter: string, words: RegExp) {
  openChange(adapter);
  fireEvent.click(screen.getByTestId(`agent-unify-model-${adapter}-trigger`));
  const row = screen.getAllByTestId(`agent-unify-model-${adapter}-option`).find((option) => words.test(option.textContent ?? ""));
  fireEvent.click(row!);
}

beforeEach(() => {
  flags.workshop = true;
  catalogs.defaultModel = "deepseek-flash";
  catalogs.claude = undefined;
  catalogs.refresh.mockReset();
  commandMock.mockReset();
  setClientForTests({ command: commandMock } as never);
  // The place's hold outlives a page; no case starts under another's.
  useAppStore.setState({ configReread: undefined });
});

afterEach(() => setClientForTests(undefined));

describe("settings-64: the Workshop switch limits adapter choices", () => {
  const adapters = () => screen.getAllByRole("radio").map((radio) => radio.textContent?.replace("●", "").trim());

  test("on: Claude and Codex, and an adapter the block already names, which may be changed", () => {
    render(<AgentEditor initial={{ adapter: "claude" }} readiness={[]} onSave={vi.fn(async () => {})} onCancel={() => {}} />);
    // settings-58: only the two.
    expect(adapters()).toEqual(["claude", "codex"]);
    cleanup();
    render(<AgentEditor initial={{ adapter: "gemini" }} readiness={[]} onSave={vi.fn(async () => {})} onCancel={() => {}} />);
    // settings-58: the block's own adapter reads as itself and stands.
    expect(adapters()).toEqual(["claude", "codex", "gemini"]);
    expect(screen.getByTestId("agent-adapter-gemini").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByTestId("agent-adapter-claude"));
    expect(screen.getByTestId("agent-adapter-claude").getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("agent-adapter-kimi")).toBeNull();
  });

  test("off: every adapter the runtime knows", () => {
    flags.workshop = false;
    render(<AgentEditor initial={{ adapter: "claude" }} readiness={[]} onSave={vi.fn(async () => {})} onCancel={() => {}} />);
    // settings-58: with the switch off, all five.
    expect(adapters()).toEqual(["claude", "codex", "gemini", "kimi", "opencode"]);
  });
});

describe("settings-65: each base-URL state", () => {
  const RECHECK = "After signing in, re-check; after setting the key, quit Spex completely and open it again — see How to configure.";
  const RESTART = "Then quit Spex completely and open it again — see How to configure.";
  const cases: { label: string; baseUrl: BaseUrlState; service: string | null; listed: boolean; missing: RegExp; off: RegExp; closing: string; mark: boolean }[] = [
    { label: "unset", baseUrl: { state: "unset" }, service: "Anthropic official", listed: false, missing: /^Not signed in on this computer, and no key set\.$/, off: /Sign in by running claude in a terminal, or set ANTHROPIC_API_KEY/, closing: RECHECK, mark: false },
    { label: "third-party", baseUrl: { state: "third-party", host: "api.deepseek.com" }, service: "Third party api.deepseek.com", listed: true, missing: /^The third-party service api\.deepseek\.com is set, but its key is not\.$/, off: /Set ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL/, closing: RESTART, mark: true },
    { label: "unknown", baseUrl: { state: "unknown" }, service: "Unrecognized", listed: false, missing: /^ANTHROPIC_BASE_URL is not an address Spex recognizes\.$/, off: /ANTHROPIC_BASE_URL is not recognized: check the address/, closing: RESTART, mark: false },
  ];
  for (const each of cases) {
    test(`${each.label}: the model service, the official-name list, the guidance and the mark`, () => {
      show(CROSSED, [entry("claude", { baseUrl: each.baseUrl }), entry("codex")]);
      const ready = screen.getByTestId("agent-card-claude");
      // settings-5: the model service by the base URL's state.
      expect(within(ready).getByTestId("agent-service").textContent).toBe(each.service);
      // settings-61: listed only behind a third party.
      expect(within(ready).queryByTestId("agent-official") !== null).toBe(each.listed);
      // settings-34, settings-39: Provider default recommended only
      // behind a third party with a default model read.
      choose("claude", /Provider default/);
      fireEvent.click(screen.getByTestId("agent-unify-model-claude-trigger"));
      expect(screen.queryByTestId("agent-unify-model-claude-mark") !== null).toBe(each.mark);
      if (each.mark) expect(screen.getByTestId("agent-unify-model-claude-mark").textContent).toBe("Recommended");
      cleanup();
      for (const workshop of [true, false]) {
        flags.workshop = workshop;
        show(CROSSED, [notReady("claude", [CLAUDE_CREDENTIAL], { baseUrl: each.baseUrl }), entry("codex")]);
        const card = screen.getByTestId("agent-card-claude");
        const fault = within(card).getByTestId("agent-fault-credential");
        if (workshop) {
          // settings-71: what is missing, then the setup guide by the
          // state; the route's own line closes it.
          expect(fault.textContent).toMatch(each.missing);
          expect(within(card).getByTestId("agent-route-local").textContent).toBe("Connect Claude with a Claude subscription, or an Anthropic-compatible API key such as DeepSeek's: the setup guide walks you through it.Open the setup guide");
          expect(within(card).getByTestId("agent-routes-closing-claude").textContent).toBe("Once connected, press Re-check; if nothing changes, quit Spex completely and open it again.");
          expect(fault.textContent).not.toContain(RECHECK);
          expect(fault.textContent).not.toContain(RESTART);
        } else {
          // settings-63: guidance by the state; re-check after a
          // sign-in, restart after a variable.
          expect(fault.textContent).toMatch(each.off);
          expect(fault.textContent).toContain(each.closing);
          if (each.closing === RESTART) expect(fault.textContent).not.toContain(RECHECK);
          expect(within(card).queryByTestId("agent-routes-claude")).toBeNull();
        }
        // settings-23, settings-63: the core's own words whole, in the
        // guidance's tooltip and nowhere else.
        expect(within(fault).getByTestId("agent-fault-guidance").getAttribute("title")).toBe(CLAUDE_CREDENTIAL.requirement);
        expect(within(fault).queryByTestId("agent-fault-core")).toBeNull();
        expect(card.textContent).not.toContain(CLAUDE_CREDENTIAL.requirement);
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
    // settings-61: no list.
    expect(within(card).queryByTestId("agent-official")).toBeNull();
    // settings-63: the class's phrase, no local step.
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
    // settings-63: the core's requirement alone, no key to set.
    expect(within(claude).getByTestId("agent-fault-runtime").textContent).toBe(runtime.requirement);
    expect(within(claude).queryByTestId("agent-fault-credential")).toBeNull();
    // settings-63: both halves unmet, both lines.
    const codex = screen.getByTestId("agent-card-codex");
    expect(within(codex).getByTestId("agent-fault-runtime").textContent).toContain("codex runtime failed to load");
    const codexCredential = within(codex).getByTestId("agent-fault-credential");
    expect(codexCredential.textContent).toBe("Not signed in on this computer, and no key set.");
    expect(within(codexCredential).getByTestId("agent-fault-guidance").getAttribute("title")).toBe(CODEX_CREDENTIAL.requirement);
  });
  test("a sign-in not confirmed just now reads as such, apart from an adapter with no check, and asks for a re-check", () => {
    show(CROSSED, [
      entry("claude", { ready: null, unconfirmed: "its status command did not answer in time", baseUrl: { state: "unset" } }),
      entry("codex", { ready: null }),
    ]);
    // settings-5: the reason and the next step, no sign-in steps.
    const claude = screen.getByTestId("agent-card-claude");
    expect(claude.textContent).toContain("sign-in unconfirmed");
    expect(within(claude).getByTestId("agent-unconfirmed-claude").textContent).toBe("Sign-in could not be confirmed just now: its status command did not answer in time. Re-check to try again.");
    expect(within(claude).queryByTestId("agent-howto-claude")).toBeNull();
    expect(within(claude).queryByTestId("agent-checked-later-claude")).toBeNull();
    // An adapter with no check stays unknown, with no such line.
    const codex = screen.getByTestId("agent-card-codex");
    expect(codex.textContent).toContain("unverified");
    expect(codex.textContent).not.toContain("sign-in unconfirmed");
    expect(within(codex).queryByTestId("agent-unconfirmed-codex")).toBeNull();
    expect(screen.getByRole("button", { name: /^Re-check$/ })).toBeTruthy();
  });
});

describe("settings-66: how to configure, per place and computer", () => {
  const computers: { platform: string; shell?: string; file: RegExp }[] = [
    { platform: "darwin", shell: "zsh", file: /~\/\.zshrc[\s\S]*export ANTHROPIC_API_KEY=/ },
    { platform: "darwin", shell: "bash", file: /~\/\.bash_profile[\s\S]*export ANTHROPIC_API_KEY=/ },
    { platform: "darwin", shell: "fish", file: /your shell's login configuration file[\s\S]*export ANTHROPIC_API_KEY=/ },
    { platform: "win32", file: /user environment variable[\s\S]*setx ANTHROPIC_API_KEY/ },
  ];
  for (const computer of computers) {
    test(`${computer.platform} ${computer.shell ?? ""}: the manual steps, with and without the Workshop's routes`, () => {
      for (const workshop of [true, false]) {
        flags.workshop = workshop;
        show(UNIFY, [
          notReady("claude", [CLAUDE_CREDENTIAL], { usedBy: ["captain", "dev.coder (code.coder, review.coder)", "dev.reviewer (review.reviewer)"], baseUrl: { state: "unset" }, platform: computer.platform, ...(computer.shell ? { shell: computer.shell } : {}) }),
          notReady("codex", [CODEX_CREDENTIAL], { platform: computer.platform, ...(computer.shell ? { shell: computer.shell } : {}) }),
        ]);
        const claude = screen.getByTestId("agent-card-claude");
        const codex = screen.getByTestId("agent-card-codex");
        if (workshop) {
          // settings-71: one route, the setup guide as the primary
          // action, no online service; the guide opens at the platform.
          const routes = within(claude).getByTestId("agent-routes-claude");
          expect(routes.textContent).toMatch(/^Connect Claude with a Claude subscription/);
          expect(routes.textContent).not.toMatch(/online/i);
          expect(within(claude).queryByTestId("agent-online")).toBeNull();
          expect(within(claude).queryByTestId("agent-howto-claude")).toBeNull();
          expect(claude.textContent).not.toMatch(/export |setx/);
          const guide = within(claude).getByTestId("agent-guide");
          expect(guide.textContent).toBe("Open the setup guide");
          expect(guide.getAttribute("target")).toBe("_blank");
          expect(guide.getAttribute("href")).toBe(`https://merico.feishu.cn/docx/AjiHdkmV1oIAd6xY4CPcWJZpnah${computer.platform === "win32" ? "#doxcnAdFPoFFjXyeRrnquz98wQ4" : "#doxcnEXXdRnpDfvWb8k8vHYt16d"}`);
          // settings-71: what is missing in plain text, the badge
          // carrying the tone.
          expect(within(claude).getByTestId("agent-fault-guidance").dataset.tone).toBeUndefined();
          // settings-71: Codex's route names OpenAI's alone.
          expect(within(codex).getByTestId("agent-route-local").textContent).toContain("Connect Codex with a ChatGPT subscription or an official OpenAI API key: the setup guide walks you through it.");
          // settings-71: Codex's guide opens at its own section.
          expect(within(codex).getByTestId("agent-guide").getAttribute("href")).toBe(`https://merico.feishu.cn/docx/AjiHdkmV1oIAd6xY4CPcWJZpnah${computer.platform === "win32" ? "#doxcn7rsGnFZ0EKTepBD0qSnXrd" : "#doxcnfsvh6ogCgUgDtH1qeSIrhh"}`);
        } else {
          // settings-5: off, the manual steps closed under How to
          // configure, ending with the restart; Codex's naming its key.
          expect(within(claude).queryByTestId("agent-routes-claude")).toBeNull();
          const howto = screen.getByTestId("agent-howto-claude") as HTMLDetailsElement;
          expect(howto.open).toBe(false);
          expect(howto.querySelector("summary")?.textContent).toBe("How to configure");
          const manual = within(howto).getByTestId("agent-howto-manual").textContent ?? "";
          expect(manual).toMatch(computer.file);
          expect(manual).toContain("Quit Spex completely and open it again.");
          const codexManual = within(codex).getByTestId("agent-howto-manual").textContent ?? "";
          expect(codexManual).toContain("Codex needs an official OpenAI key.");
          expect(codexManual).toMatch(computer.platform === "win32" ? /setx OPENAI_API_KEY/ : /export OPENAI_API_KEY=/);
        }
        // settings-5: positions in brief, the whole list in the tooltip
        // and beneath on a press; no model settings while not ready.
        const users = screen.getByTestId("agent-users-claude");
        expect(users.textContent).toBe("Needed by Captain and 2 more roles");
        expect(users.getAttribute("title")).toBe("Captain, dev.coder, dev.reviewer");
        expect(screen.queryByTestId("agent-users-list-claude")).toBeNull();
        fireEvent.click(users);
        expect(screen.getByTestId("agent-users-list-claude").textContent).toBe("Needed byCaptaindev.coderdev.reviewer");
        expect(within(claude).queryByTestId("agent-default-claude")).toBeNull();
        expect(within(claude).queryByTestId("agent-service")).toBeNull();
        expect(within(claude).queryByTestId("agent-unify-claude")).toBeNull();
        // settings-5: one tone for every not-ready card, used or not,
        // and Claude's tag alone while it is not ready.
        expect(screen.getByTestId("agent-badge-codex").dataset.tone).toBe("attention");
        expect(screen.getByTestId("agent-badge-claude").dataset.tone).toBe("attention");
        expect(screen.getByTestId("agent-tag-claude").textContent).toBe("Recommended");
        expect(screen.queryByTestId("agent-tag-codex")).toBeNull();
        // settings-5: no position uses Codex here.
        expect(screen.getByTestId("agent-users-codex").textContent).toBe("No role uses Codex yet.");
        cleanup();
      }
    });
  }

  test("a ready card's badge says the connection is checked on the first task, beside its users, and Re-check stands with its line", () => {
    show(UNIFY, [entry("claude", { usedBy: ["captain", "dev.coder (code.coder, review.coder)"], baseUrl: { state: "unset" } }), entry("codex")]);
    // settings-5
    expect(screen.getByTestId("agent-badge-claude").getAttribute("title")).toBe("Found a sign-in or key; whether it works is checked on your first task.");
    expect(screen.queryByTestId("agent-checked-later-claude")).toBeNull();
    const users = screen.getByTestId("agent-users-claude");
    expect(users.textContent).toBe("Used by Captain and 1 more role");
    expect(users.getAttribute("title")).toBe("Captain, dev.coder");
    fireEvent.click(users);
    expect(screen.getByTestId("agent-users-list-claude").textContent).toBe("Used byCaptaindev.coder");
    expect(screen.queryByTestId("agent-howto-claude")).toBeNull();
    // settings-5: ready, what runs on one line, the model setting
    // folded behind Change model with where a single role's model is set.
    // UNIFY's agents run different models.
    expect(screen.getByTestId("agent-runs-claude").textContent).toBe("Anthropic official · Several models");
    // Codex's one agent runs one model, named.
    expect(screen.getByTestId("agent-runs-codex").textContent).toMatch(/gpt-6-sol/);
    expect(screen.queryByTestId("agent-unify-claude")).toBeNull();
    fireEvent.click(screen.getByTestId("agent-change-claude"));
    expect(screen.getByTestId("agent-unify-claude")).toBeTruthy();
    expect(screen.getByTestId("agent-unify-label-claude").textContent).toBe("This changes the model of every Captain and player on Claude at once. To change only the Captain's or one player's, edit its settings above.");
    // settings-5: Re-check alone in the heading, its tooltip saying
    // what it reads.
    expect(screen.queryByTestId("agents-recheck-note")).toBeNull();
    expect(screen.getByTestId("agents-recheck").textContent).toBe("Re-check");
    expect(screen.getByTestId("agents-recheck").getAttribute("title")).toBe("Reads each agent's sign-in and Claude Code's settings again; a key set as an environment variable needs Spex quit and opened again.");
  });
});

describe("settings-67: with no config to read", () => {
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
      expect(screen.getByTestId("agent-routes-claude")).toBeTruthy();
      // settings-59, settings-61: nothing to batch without a config.
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

describe("settings-73: the section's verdict and Claude's tag", () => {
  test("what needs doing before a task starts or runs whole, read from the Captain's agent", () => {
    const cases: { label: string; readiness: ReadinessEntry[]; text: string | null }[] = [
      { label: "none ready", readiness: [notReady("claude", [CLAUDE_CREDENTIAL], { usedBy: ["captain"] }), notReady("codex", [CODEX_CREDENTIAL])], text: "Set up at least one agent to start a task; Claude is recommended." },
      { label: "the Captain's not ready, another is", readiness: [notReady("claude", [CLAUDE_CREDENTIAL], { usedBy: ["captain"] }), entry("codex")], text: "The Captain uses Claude, which is not ready: set it up, or switch the Captain to Codex." },
      { label: "the Captain's ready, the other unused", readiness: [entry("claude", { usedBy: ["captain"] }), notReady("codex", [CODEX_CREDENTIAL])], text: null },
      { label: "the Captain's ready, a role waiting on the other", readiness: [entry("claude", { usedBy: ["captain"] }), notReady("codex", [CODEX_CREDENTIAL], { usedBy: ["dev.reviewer (review.reviewer)"] })], text: "Tasks can start, but dev.reviewer uses Codex, which is not ready, so its steps fail until it is set up." },
      { label: "both ready", readiness: [entry("claude", { usedBy: ["captain"] }), entry("codex")], text: null },
    ];
    for (const each of cases) {
      show(UNIFY, each.readiness);
      expect(screen.queryByTestId("agents-verdict")?.textContent ?? null, each.label).toBe(each.text);
      // Claude's tag stands while it is not ready, and goes once it is.
      expect(screen.queryByTestId("agent-tag-claude")?.textContent ?? null).toBe(each.readiness[0]!.ready === true ? null : "Recommended");
      expect(screen.queryByTestId("agent-tag-codex")).toBeNull();
      cleanup();
    }
    // Before the core answers, nothing is said.
    show(UNIFY, []);
    expect(screen.queryByTestId("agents-verdict")).toBeNull();
  });
});

describe("settings-68: one model for every agent of an adapter", () => {
  test("the confirmation, the batch, the done notice and a conflict", async () => {
    commandMock.mockResolvedValue({ ...UNIFY, revision: "rev-2" });
    show(UNIFY, [entry("claude", { baseUrl: { state: "unset" } }), entry("codex")]);
    choose("claude", /deepseek-v4-pro/);
    fireEvent.click(screen.getByTestId("agent-unify-apply-claude"));
    const confirm = screen.getByTestId("agent-unify-confirm-claude");
    // settings-60: the agents it changes, and the role it leaves.
    expect(within(confirm).getByTestId("agent-unify-changes").textContent).toBe("Captaindev.coderdev.writer");
    expect(within(confirm).getByTestId("agent-unify-left").textContent).toBe("review.coder");
    await act(async () => { fireEvent.click(screen.getByTestId("agent-unify-confirm-claude-confirm")); });
    // settings-59, settings-60: one batch, the shown revision, nothing
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
    // settings-60: done, the left role listed again.
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
    // settings-60: a conflict asks for a retry over the config now
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
    // settings-60: disabled on Provider default, with its line and Retry.
    openChange("claude");
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

describe("settings-39: one row per model behind a third-party service", () => {
  test("the runtime's aliases of one model read as one row, and Provider default stands for its own", () => {
    // Claude Code's catalog behind DeepSeek, as it reports it.
    catalogs.defaultModel = "deepseek-flash[1m]";
    catalogs.claude = [
      { id: "default", name: "Default (recommended)", resolvedModel: "deepseek-flash[1m]", description: "Use the default model (currently deepseek-flash[1m])" },
      { id: "opus", name: "deepseek-flash[1m]", resolvedModel: "deepseek-flash[1m]", description: "Custom Opus model (1M context)" },
      { id: "claude-fable-5-1", name: "Fable", resolvedModel: "claude-fable-5-1" },
      { id: "sonnet", name: "deepseek-flash[1m]", resolvedModel: "deepseek-flash[1m]", description: "Custom Sonnet model (1M context)" },
      { id: "haiku", name: "deepseek-flash", resolvedModel: "deepseek-flash", description: "Custom Haiku model" },
      { id: "deepseek-flash[1m]", name: "deepseek-flash[1m]", resolvedModel: "deepseek-flash[1m]", description: "Custom model" },
    ];
    show(UNIFY, [entry("claude", { baseUrl: { state: "third-party", host: "api.deepseek.com" } }), entry("codex")]);
    openChange("claude");
    fireEvent.click(screen.getByTestId("agent-unify-model-claude-trigger"));
    const rows = screen.getAllByTestId("agent-unify-model-claude-option").map((option) => option.getAttribute("data-value"));
    // settings-39: the default alias, the Opus and Sonnet slots and the
    // model's own row all run Provider default's model: none lists.
    expect(rows).toEqual(["", "claude-fable-5-1", "haiku", "__spex_custom__"]);
    // settings-38: a resolution the name already says reads once.
    const haiku = screen.getAllByTestId("agent-unify-model-claude-option")[2]!;
    expect(haiku.textContent).not.toMatch(/deepseek-flash.*deepseek-flash/);
  });
});

describe("settings-69: official names behind a third-party service", () => {
  const thirdParty = () => [entry("claude", { baseUrl: { state: "third-party", host: "api.deepseek.com" } }), entry("codex")];

  test("listed by the model each role runs, confirmed with their targets, written where each stands, recomputed after", async () => {
    show(CROSSED, thirdParty(), { [PROJECT]: projectComposition(CROSSED) });
    // settings-61: one line naming the service, the fix by the model it
    // sets, the roles folded beneath.
    const official = screen.getByTestId("agent-official");
    expect(official.textContent).toContain("Some roles still name a Claude model, which api.deepseek.com may bill as another model or refuse.");
    expect(screen.getByTestId("agent-official-fix").textContent).toBe("Use deepseek-flash for all");
    expect((screen.getByTestId("agent-official-roles") as HTMLDetailsElement).open).toBe(false);
    const list = screen.getByTestId("agent-official-list");
    // settings-61: by the effective model.
    expect(list.textContent).toContain("Captain · claude-opus-5-5");
    expect(list.textContent).toContain("code.reviewer · claude-sonnet-5");
    expect(list.textContent).toContain("review.coder · opus[1m]");
    expect(list.textContent).toContain("fix.coder (shop) · claude-haiku-4");
    expect(list.textContent).not.toContain("code.coder");

    fireEvent.click(screen.getByTestId("agent-official-fix"));
    const rows = screen.getAllByTestId("agent-official-confirm-row").map((row) => row.textContent);
    // settings-62: each role, its model, its target; the project's elsewhere.
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
    // settings-62: one batch, the shown revision, written where each stands.
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
    // settings-62: recomputed from the newest state — the project's
    // new binding listed, and nothing says all were set.
    const done = screen.getByTestId("agent-official-done");
    expect(done.textContent).toBe("Written, but these roles still name an official model:");
    const remaining = screen.getByTestId("agent-official-list").textContent;
    expect(remaining).toBe("fix.reviewer (shop) · opus");
    expect(remaining).not.toContain("Captain");
    expect(screen.getByTestId("agent-card-claude").textContent).not.toContain("Every role now uses Provider default.");
  });

  test("a conflict holds every batch from its first reading again, a failed read across leaving the page, until read again", async () => {
    show(CROSSED, thirdParty(), { [PROJECT]: projectComposition(CROSSED) });
    let releaseOwn: (state: ConfigState) => void = () => {};
    let projectFails = true;
    commandMock.mockImplementation((type: string, args: { projectId?: string }) => {
      if (type === "config.batch") return Promise.reject(new SpexCommandError("conflict", "changed meanwhile; retry"));
      if (type === "config.get" && args.projectId === undefined) return new Promise<ConfigState>((resolve) => { releaseOwn = resolve; });
      if (type === "config.get") return projectFails ? Promise.reject(new Error("the project's settings could not be read")) : Promise.resolve(projectComposition(CROSSED));
      return Promise.reject(new Error(`unexpected ${type}`));
    });
    const fix = () => screen.getByTestId("agent-official-fix") as HTMLButtonElement;
    const apply = () => { openChange("claude"); return screen.getByTestId("agent-unify-apply-claude") as HTMLButtonElement; };
    // The other control's confirmation stands open meanwhile.
    fireEvent.click(fix());
    // The conflict comes from the one-model control.
    choose("claude", /deepseek-flash/);
    fireEvent.click(apply());
    await act(async () => { fireEvent.click(screen.getByTestId("agent-unify-confirm-claude-confirm")); });
    // settings-60: the project's read failed, but your own is still
    // being read — nothing is reported until both settle, and nothing
    // submits meanwhile, the other control's open confirmation included.
    expect(screen.queryByTestId("agents-stale")).toBeNull();
    expect(fix().disabled).toBe(true);
    expect((screen.getByTestId("agent-official-confirm-confirm") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { releaseOwn({ ...CROSSED, revision: "rev-9" }); });
    const stale = screen.getByTestId("agents-stale");
    expect(stale.textContent).toContain("could not be read again: the project's settings could not be read");
    // settings-60, settings-62: the lists may be the refused batch's —
    // no batch from either control, the open confirmation included.
    expect(apply().disabled).toBe(true);
    expect(fix().disabled).toBe(true);
    expect((screen.getByTestId("agent-official-confirm-confirm") as HTMLButtonElement).disabled).toBe(true);
    // Leaving Settings and entering again keeps the hold: it is the
    // place's, not the page's.
    cleanup();
    render(<AgentCards />);
    expect(screen.getByTestId("agents-stale").textContent).toContain("could not be read again");
    expect(fix().disabled).toBe(true);
    expect(apply().disabled).toBe(true);
    // Read again: held until your own read settles too, then offered.
    projectFails = false;
    await act(async () => { fireEvent.click(within(screen.getByTestId("agents-stale")).getByRole("button", { name: "Read again" })); });
    expect(fix().disabled).toBe(true);
    await act(async () => { releaseOwn({ ...CROSSED, revision: "rev-9" }); });
    expect(screen.queryByTestId("agents-stale")).toBeNull();
    expect(fix().disabled).toBe(false);
    expect(apply().disabled).toBe(false);
    fireEvent.click(fix());
    commandMock.mockResolvedValue({ ...CROSSED, revision: "rev-10" });
    await act(async () => { fireEvent.click(screen.getByTestId("agent-official-confirm-confirm")); });
    expect(commandMock).toHaveBeenLastCalledWith("config.batch", expect.objectContaining({ revision: "rev-9" }));
  });

  test("readings again answered out of order: no late answer replaces a newer one", async () => {
    show(CROSSED, thirdParty(), { [PROJECT]: projectComposition(CROSSED) });
    // Each reading again's answers, released by the test.
    const pending: { own: (state: ConfigState) => void; project: (state: ConfigState) => void }[] = [];
    commandMock.mockImplementation((type: string, args: { projectId?: string }) => {
      if (type !== "config.get") return Promise.reject(new Error(`unexpected ${type}`));
      if (args.projectId === undefined) pending.push({ own: () => {}, project: () => {} });
      const round = pending.at(-1)!;
      return new Promise<ConfigState>((resolve) => { if (args.projectId === undefined) round.own = resolve; else round.project = resolve; });
    });
    const older = { ...CROSSED, revision: "rev-old" };
    const newer = { ...CROSSED, revision: "rev-new" };
    // The older still binds the official-named player; the newer not.
    const olderProject = projectComposition(CROSSED);
    const newerProject = projectComposition(CROSSED, { coder: "dev.writer" });
    let first!: Promise<void>, second!: Promise<void>;
    act(() => { first = useAppStore.getState().rereadConfig(); });
    act(() => { second = useAppStore.getState().rereadConfig(); });
    // The second answers first and lifts the hold…
    await act(async () => { pending[1]!.own(newer); pending[1]!.project(newerProject); await second; });
    expect(useAppStore.getState().configReread).toBeUndefined();
    // …then the first answers late: it writes nothing (settings-62).
    await act(async () => { pending[0]!.own(older); pending[0]!.project(olderProject); await first; });
    expect(useAppStore.getState().configState).toBe(newer);
    expect(useAppStore.getState().projectConfigs[PROJECT]).toBe(newerProject);
    expect(screen.getByTestId("agent-official-list").textContent).not.toContain("fix.coder");
    expect(useAppStore.getState().configReread).toBeUndefined();
  });

  test("a broadcast newer than a reading again keeps its states", async () => {
    show(CROSSED, thirdParty(), { [PROJECT]: projectComposition(CROSSED) });
    let releaseOwn: (state: ConfigState) => void = () => {};
    let releaseProject: (state: ConfigState) => void = () => {};
    commandMock.mockImplementation((_type: string, args: { projectId?: string }) =>
      new Promise<ConfigState>((resolve) => { if (args.projectId === undefined) releaseOwn = resolve; else releaseProject = resolve; }));
    let reading!: Promise<void>;
    act(() => { reading = useAppStore.getState().rereadConfig(); });
    const broadcast = { ...CROSSED, revision: "rev-broadcast" };
    const broadcastProject = projectComposition(CROSSED, { coder: "dev.writer" });
    act(() => { deliverServerMessageForTests({ type: "config.state", state: broadcast, projects: { [PROJECT]: broadcastProject } }); });
    // Still held until the reads settle.
    expect((screen.getByTestId("agent-official-fix") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { releaseOwn({ ...CROSSED, revision: "rev-older" }); releaseProject(projectComposition(CROSSED)); await reading; });
    expect(useAppStore.getState().configState).toBe(broadcast);
    expect(useAppStore.getState().projectConfigs[PROJECT]).toBe(broadcastProject);
    expect(useAppStore.getState().configReread).toBeUndefined();
  });

  test("with no default model the control is disabled, with its line and a Retry", () => {
    catalogs.defaultModel = undefined;
    show(CROSSED, thirdParty());
    // settings-62
    expect((screen.getByTestId("agent-official-fix") as HTMLButtonElement).disabled).toBe(true);
    const blind = screen.getByTestId("agent-official-blind");
    expect(blind.textContent).toContain("The default model can't be read right now.");
    fireEvent.click(within(blind).getByRole("button", { name: "Retry" }));
    expect(catalogs.refresh).toHaveBeenCalled();
  });
});
