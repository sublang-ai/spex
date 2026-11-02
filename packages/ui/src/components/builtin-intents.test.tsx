// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// localization-9: a built-in playbook's intent in the reader's language
// (localization-4). The intents are read from the installed Playbook's
// own registry entries — the playbooks the core stages and seeds as
// the built-in spec package — so a Playbook whose intent moved, or a
// catalog key that drifted from it by a byte, fails here rather than
// reading English to a Chinese team. With `zh` resolved, the
// slash menu, the project's Playbooks tab under its Global heading
// (全局) and the Playbooks surface each show a built-in's intent as the
// catalog translates that English text, while a team's own playbook
// keeps its own words — even words the catalog happens to hold for a
// label of its own (DR-176).

import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CommandResults, PlaybookSummary } from "@sublang/spex-core/protocol";

import { CaptainHome } from "./CaptainHome.js";
import { PlaybooksSurface } from "./PlaybooksSurface.js";
import { PlaybooksTab } from "./PlaybooksTab.js";
import { activateLanguage, i18n } from "../i18n.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import {
  CONFIG_STATE,
  OWN_ENVIRONMENT,
  OWN_KEY,
  PROJECT,
  PROJECT_ENVIRONMENT,
  PROJECT_ID,
  READINESS,
  available,
  environment,
  home,
  specPackage,
} from "../fixtures/playbooks.js";

/** The built-in spec package's playbooks, in the order it carries them. */
const BUILTIN_IDS = ["code", "review", "decide", "dev", "branch", "pr", "inspect"] as const;

/** A team's own playbook. Its intent is a word the catalog holds as a
 * label ("发布"), so the lookup is shown confined to the built-ins'. */
const TEAM = { id: "ship", intent: "Publish" };

/** Each built-in's intent as its registry entry in the installed
 * Playbook carries it. */
let builtinIntents: Record<string, string>;

beforeAll(async () => {
  builtinIntents = {};
  for (const id of BUILTIN_IDS) {
    const module = (await import(/* @vite-ignore */ `@sublang/playbook/${id}/registry`)) as {
      default: { id: string; intent: string };
    };
    expect(module.default.id).toBe(id);
    builtinIntents[id] = module.default.intent;
  }
});

afterEach(() => {
  cleanup();
  activateLanguage("en");
  setClientForTests(undefined);
});

/** The catalog's Chinese for a built-in's English intent: the message
 * keyed by that exact text, which must exist and must be Chinese. */
function chinese(id: string): string {
  const english = builtinIntents[id];
  const translated = i18n._(english);
  expect(translated, `the zh catalog holds /${id}'s intent "${english}"`).not.toBe(english);
  expect(translated).toMatch(/\p{Script=Han}/u);
  return translated;
}

function summaries(): PlaybookSummary[] {
  return [TEAM.id, ...BUILTIN_IDS].map((id) => ({
    id,
    from: id === TEAM.id ? "./ship.registry.js" : `@sublang/playbook/${id}/registry`,
    command: id,
    intent: id === TEAM.id ? TEAM.intent : builtinIntents[id],
    roles: {},
    origin: "own" as const,
  }));
}

function renderHome(): void {
  render(
    <CaptainHome
      hasProject
      hasProjects
      projectName={PROJECT.name}
      playbooks={summaries()}
      readiness={READINESS}
      connected
      onOpenPalette={vi.fn()}
      onNavigate={vi.fn()}
      onSaveCaptain={vi.fn(async () => {})}
      onStart={vi.fn(async () => {})}
    />,
  );
}

describe("localization-4: slash menu discovery", () => {
  test("with zh resolved a built-in's intent reads Chinese and a team's own reads as given", () => {
    activateLanguage("zh");
    renderHome();

    expect(screen.queryByTestId("quick-start")).toBeNull();
    const hint = document.getElementById("start-playbook-hint")!;
    expect(hint.textContent).toBe(`在输入框输入 /，查看 ${summaries().length} 个规程`);
    expect(hint.querySelector("code")?.textContent).toBe("/");

    // The slash menu offers every playbook, each intent its hint.
    fireEvent.change(screen.getByTestId("start-composer"), { target: { value: "/" } });
    const menu = screen.getByTestId("slash-menu");
    expect(within(menu).getByText(TEAM.intent)).toBeTruthy();
    expect(within(menu).queryByText("发布")).toBeNull();
    for (const id of BUILTIN_IDS) {
      expect(within(menu).getByText(chinese(id))).toBeTruthy();
      expect(menu.textContent).not.toContain(builtinIntents[id]);
    }
  });

  test("with en resolved a built-in's intent reads as its registry entry gives it", () => {
    renderHome();
    fireEvent.change(screen.getByTestId("start-composer"), { target: { value: "/" } });
    const menu = screen.getByTestId("slash-menu");
    for (const id of BUILTIN_IDS) {
      expect(within(menu).getByText(builtinIntents[id])).toBeTruthy();
    }
  });
});

describe("localization-4: the project's Playbooks tab and the Playbooks surface", () => {
  const commandMock = vi.fn();

  beforeEach(() => {
    const lists: CommandResults["environment.playbooks"] = {
      project: [],
      own: [
        ...BUILTIN_IDS.map((id) => available({ id, intent: builtinIntents[id] })),
        available({
          id: TEAM.id,
          intent: TEAM.intent,
          package: "me/team-playbooks",
          version: "0.1.0",
          source: "path",
        }),
      ],
    };
    commandMock.mockReset();
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      switch (type) {
        case "environment.playbooks":
          return lists;
        case "environment.get":
          return params?.repository === PROJECT_ID
            ? PROJECT_ENVIRONMENT
            : environment({
                ...OWN_ENVIRONMENT,
                requests: { ...OWN_ENVIRONMENT.requests, "me/team-playbooks": { kind: "path", path: "spex-packages/me/team-playbooks" } },
                packages: [
                  ...OWN_ENVIRONMENT.packages,
                  specPackage({ name: "me/team-playbooks", version: "0.1.0", source: { kind: "path", detail: "spex-packages/me/team-playbooks" } }),
                ],
              });
        case "draft.list":
          return [];
        default:
          return null;
      }
    });
    setClientForTests({ command: commandMock } as unknown as Parameters<typeof setClientForTests>[0]);
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
    });
  });

  test("with zh resolved each built-in's card reads its intent in Chinese and the team's as given", async () => {
    activateLanguage("zh");
    render(<PlaybooksTab project={PROJECT} />);
    await vi.waitFor(() => expect(useAppStore.getState().playbookLists).toBeTruthy());

    for (const id of BUILTIN_IDS) {
      const card = await screen.findByTestId(`playbook-card-${id}`);
      const intent = within(card).getByText(chinese(id));
      // The tooltip carries the whole intent a truncated row clips.
      expect(intent.getAttribute("title")).toBe(chinese(id));
      expect(card.textContent).not.toContain(builtinIntents[id]);
    }
    const team = screen.getByTestId(`playbook-card-${TEAM.id}`);
    expect(within(team).getByText(TEAM.intent).getAttribute("title")).toBe(TEAM.intent);
    // They stand under the Global heading, in the reader's language
    // (localization-9, DR-176).
    const global = screen.getByTestId("playbooks-global");
    expect(global.querySelector("h2")!.textContent).toBe("全局");
    for (const id of [...BUILTIN_IDS, TEAM.id]) {
      expect(global.contains(screen.getByTestId(`playbook-card-${id}`))).toBe(true);
    }
  });

  test("with zh resolved the Playbooks surface reads each built-in's intent in Chinese and the team's as given", async () => {
    activateLanguage("zh");
    render(<PlaybooksSurface />);
    await vi.waitFor(() => expect(useAppStore.getState().playbookLists?.projectId).toBeNull());
    for (const id of BUILTIN_IDS) {
      const card = await screen.findByTestId(`playbook-card-${id}`);
      expect(within(card).getByText(chinese(id)).getAttribute("title")).toBe(chinese(id));
      expect(card.textContent).not.toContain(builtinIntents[id]);
      // Beneath the built-in spec package's row.
      expect(screen.getByTestId("surface-playbooks-sublang/playbooks").contains(card)).toBe(true);
    }
    const team = await screen.findByTestId(`playbook-card-${TEAM.id}`);
    expect(within(team).getByText(TEAM.intent).getAttribute("title")).toBe(TEAM.intent);
    expect(screen.getByTestId("surface-playbooks-me/team-playbooks").contains(team)).toBe(true);
    expect(commandMock).toHaveBeenCalledWith("environment.get", { repository: OWN_KEY });
  });
});
