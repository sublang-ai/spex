// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// playbook-library-94 over a simulated document: a project's Packages
// tab rendering the project's packages under "Packages" and yours under
// "Personal" through the real store, against a stand-in client answering
// as the core does — each heading with its registry chooser, the account
// there and one "Add…"; each row's name, version, source glyph, what it
// provides and its standing, the required package under the one
// requiring it; the built-in playbooks as one line; the chips with
// Update and Place skills again; Remove in the overflow; a row expanding
// to its artifacts, a playbook's Enable writing that heading's config in
// place (playbook-library-3); Add…'s Registry,
// Folder and Git tabs with the receipt; Publish from a folder package's
// overflow; every control standing while that spex repository syncs and
// while the core installs, every command naming that heading's spex
// repository, neither heading naming one (playbook-library-92,
// playbook-library-93, playbook-library-113, playbook-library-119,
// DR-172).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CommandResults, EnvironmentState, RegistryState } from "@sublang/spex-core/protocol";

import { PackagesTab } from "./PackagesTab.js";
import { instanceState } from "../fixtures/groups-state.js";
import { deliverServerMessageForTests, setClientForTests, useAppStore } from "../state/store.js";
import { NEUTRAL_BLOCK } from "../lib/config-ops.js";
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

const commandMock = vi.fn();
/** The public registry, as `registry.get` naming no origin replies. */
const REGISTRY = "https://spex.example";
const OTHER_REGISTRY = "https://packages.example";

const LISTS: CommandResults["environment.playbooks"] = {
  project: [available({ id: "triage", package: "acme/triage", version: "1.2.3", source: "registry", repository: PROJECT_ID })],
  own: [available({ id: "code", roles: ["coder", "reviewer"] })],
};

function account(signedIn: boolean, over: Partial<RegistryState> = {}): RegistryState {
  return {
    origin: REGISTRY,
    displayName: "Spex Example",
    account: signedIn ? { id: "registry", login: "me" } : null,
    signIn: { phase: "idle" },
    error: null,
    ...over,
  };
}

let environments: Record<string, EnvironmentState>;

function seed(over: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  useAppStore.setState({
    connection: "open",
    configState: CONFIG_STATE,
    readiness: READINESS,
    projects: [PROJECT],
    currentProjectId: PROJECT_ID,
    space: home(),
    registryAccounts: { [REGISTRY]: account(true) },
    playbookLists: undefined,
    environments: {},
    environmentErrors: {},
    workspaceTabs: {},
    drafts: {},
    draftsLoaded: true,
    openDraftId: undefined,
    revealPlaybook: undefined,
    newPlaybookRequested: false,
    ...over,
  });
}

/** The project's heading and yours, each found by itself: both stand at
 * once, with the same controls (playbook-library-92). */
const projectSection = () => within(screen.getByTestId("packages-project"));
const personalSection = () => within(screen.getByTestId("packages-personal"));

async function renderTab(over: Partial<ReturnType<typeof useAppStore.getState>> = {}) {
  seed(over);
  const view = render(<PackagesTab project={PROJECT} />);
  await screen.findByTestId("env-package-acme/triage");
  await vi.waitFor(() => personalSection().getByTestId("environment-builtin"));
  return view;
}

/** Deliver the state the core broadcasts for a spex repository. */
function update(repository: string, state: EnvironmentState) {
  environments[repository] = state;
  act(() => deliverServerMessageForTests({ type: "environment.state", repository, state }));
}

/** Open a row's overflow and choose one of its entries. */
function choose(section: ReturnType<typeof within>, name: string, entry: "remove" | "publish") {
  fireEvent.click(section.getByTestId(`env-more-${name}`));
  fireEvent.click(section.getByTestId(`env-${entry}-${name}`));
}

/** Open a heading's Add… on one of its tabs. */
function openAdd(section: ReturnType<typeof within>, tab: "registry" | "folder" | "git" = "registry") {
  fireEvent.click(section.getByTestId("add-open"));
  fireEvent.click(section.getByTestId(`add-from-${tab}`));
}

beforeEach(() => {
  environments = {
    [PROJECT_ID]: { ...PROJECT_ENVIRONMENT, registry: { origin: REGISTRY, legacy: false } },
    [OWN_KEY]: { ...OWN_ENVIRONMENT, registry: { origin: REGISTRY, legacy: false } },
  };
  commandMock.mockReset();
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
    switch (type) {
      case "environment.playbooks":
        return LISTS;
      case "environment.get":
        return environments[String(params?.repository)];
      case "environment.search":
        return {
          packages: [
            { name: "acme/triage", description: "Sort issues into labels", versions: ["1.2.3", "1.2.0"] },
            { name: "acme/tidy", description: null, versions: ["0.3.0"] },
          ],
        };
      case "environment.request":
      case "environment.remove":
      case "environment.resolve":
      case "environment.install":
        return { accepted: true };
      case "environment.registry.set":
        return environments[String(params?.repository)];
      case "registry.get": {
        const origin = params?.origin === undefined ? REGISTRY : String(params.origin);
        return (
          useAppStore.getState().registryAccounts?.[origin] ??
          account(false, { origin, displayName: origin === OTHER_REGISTRY ? "Packages Example" : "Spex Example" })
        );
      }
      case "registry.directory":
        return {
          spaces: [
            { origin: REGISTRY, displayName: "Spex Example", signIn: ["github"] },
            { origin: "https://space.example", displayName: "Space Example", signIn: ["gitlab"] },
          ],
        };
      case "registry.signin.start":
        return { flow: "device", userCode: "ABCD-EFGH", verificationUri: `${REGISTRY}/device?code=ABCD-EFGH`, expiresAt: 0, interval: 5 };
      case "registry.signin.cancel":
        return { stopped: true };
      case "registry.signout":
        return account(false);
      case "space.get":
        return home();
      default:
        return null;
    }
  });
  setClientForTests({ command: commandMock } as unknown as Parameters<typeof setClientForTests>[0]);
});

afterEach(() => {
  cleanup();
  setClientForTests(undefined);
});

describe("playbook-library-94: each heading and its rows", () => {
  test("the project's packages stand under Packages and yours under Personal, each with its registry, its account and one Add…, naming no spex repository", async () => {
    await renderTab();
    const project = projectSection().getByTestId("environment-section");
    // [playbook-library-92] the headings, in this order, and the
    // Personal heading's tooltip.
    expect(within(project).getByRole("heading").textContent).toBe("Packages");
    const own = personalSection().getByTestId("environment-section");
    const personal = within(own).getByRole("heading");
    expect(personal.textContent).toBe("Personal");
    expect(personal.title).toBe("Packages added for yourself, available in every project");
    expect(
      screen.getByTestId("packages-project").compareDocumentPosition(screen.getByTestId("packages-personal")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // [playbook-library-92] neither heading names a spex repository.
    for (const section of [project, own]) {
      expect(section.textContent).not.toContain(PROJECT_ID);
      expect(section.textContent).not.toContain(OWN_KEY);
      expect(section.textContent).not.toContain("-spex");
      expect(section.textContent).not.toMatch(/environment|request|resolve|this device/i);
    }
    // [playbook-library-119] each heading carries its registry and the
    // account there; [playbook-library-92] and one Add….
    for (const section of [projectSection(), personalSection()]) {
      expect(section.getByTestId("registry-chooser").textContent).toBe("Registry: Spex Example");
      expect(section.getByTestId("registry-login").textContent).toBe("@me");
      expect(section.getAllByTestId("add-open").map((control) => control.textContent)).toEqual(["Add…"]);
    }
    // No playbook stands here: they are the Playbooks tab's (DR-172).
    expect(screen.queryByTestId(/^playbook-card-/)).toBeNull();
    expect(commandMock).toHaveBeenCalledWith("environment.get", { repository: OWN_KEY });
  });

  test("a row reads its name, version, source glyph, what it provides and its standing; a required package stands under its requirer; the built-in playbooks are one line", async () => {
    await renderTab();
    // [playbook-library-92] a package spex.yaml names.
    const triage = projectSection().getByTestId("env-package-acme/triage");
    expect(within(triage).getByTestId("env-version-acme/triage").textContent).toBe("1.2.3");
    const glyph = within(triage).getByTestId("env-source-acme/triage");
    expect(glyph.title).toBe("From the registry · any 1.x");
    expect(glyph.getAttribute("aria-label")).toBe("From the registry · any 1.x");
    expect(within(triage).getByTestId("env-provides-acme/triage").textContent).toBe("1 spec · 1 playbook");
    expect(within(triage).getByTestId("env-installed-acme/triage").textContent).toBe("Installed");
    expect(within(triage).queryByTestId("env-install-acme/triage")).toBeNull();

    // [playbook-library-92] the package it requires stands under it,
    // its files missing with Install.
    const labels = projectSection().getByTestId("env-package-acme/labels");
    expect(labels.style.marginInlineStart).toBe("1.25rem");
    expect(triage.compareDocumentPosition(labels) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(labels).getByTestId("env-source-acme/labels").title).toBe("From the registry");
    expect(within(labels).getByTestId("env-provides-acme/labels").textContent).toBe("1 skill");
    expect(within(labels).getByTestId("env-installed-acme/labels").textContent).toBe("Files missing");
    expect(labels.textContent).not.toContain("required by");
    // A required package has no overflow: only what spex.yaml names is removed.
    expect(within(labels).queryByTestId("env-more-acme/labels")).toBeNull();

    // [playbook-library-92] a folder package this computer lacks.
    const tools = projectSection().getByTestId("env-package-acme/local-tools");
    expect(within(tools).getByTestId("env-source-acme/local-tools").title).toBe("From folder spex-packages/local-tools");
    const missing = within(tools).getByTestId("env-installed-acme/local-tools");
    expect(missing.textContent).toBe("Files missing");
    expect(missing.title).toBe("Not on this computer: spex-packages/local-tools");
    fireEvent.click(within(tools).getByTestId("env-install-acme/local-tools"));
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("environment.install", { repository: PROJECT_ID }));

    // [playbook-library-92] the built-in playbooks: one quiet line, never
    // a removable row.
    expect(projectSection().queryByTestId("env-package-sublang/playbooks")).toBeNull();
    expect(projectSection().getByTestId("environment-builtin-line").textContent).toBe("Built-in playbooks 17.4.1");
    expect(projectSection().queryByTestId("environment-builtin-update")).toBeNull();
    expect(personalSection().getByTestId("environment-builtin-line").textContent).toBe("Built-in playbooks 17.4.1");
    expect(personalSection().queryByTestId("environment-packages")).toBeNull();
    expect(screen.queryByTestId("env-more-sublang/playbooks")).toBeNull();
  });

  test("a package spex.yaml names without a version yet reads a dash and Not installed; refused for want of a sign-in, Not installed · private with Sign in", async () => {
    environments[PROJECT_ID] = {
      ...environments[PROJECT_ID]!,
      requests: { ...PROJECT_ENVIRONMENT.requests, "private/notes": { kind: "registry", version: "~1.2.0" } },
    };
    await renderTab();
    const row = projectSection().getByTestId("env-package-private/notes");
    const version = within(row).getByTestId("env-version-private/notes");
    expect(version.textContent).toBe("—");
    expect(version.title).toBe("no version yet");
    expect(within(row).getByTestId("env-source-private/notes").title).toBe("From the registry · any 1.2.x");
    expect(within(row).queryByTestId("env-provides-private/notes")).toBeNull();
    expect(within(row).getByTestId("env-installed-private/notes").textContent).toBe("Not installed");

    // [playbook-library-92] signed out there, a failure the state lists
    // no refusal for — an outage, a requirement no version meets — reads
    // Not installed, with no Sign in.
    act(() => deliverServerMessageForTests({ type: "registry.state", state: account(false) }));
    update(PROJECT_ID, { ...environments[PROJECT_ID]!, error: "private/notes: Spex Example could not be reached — check the connection, then Retry" });
    expect(within(row).getByTestId("env-installed-private/notes").textContent).toBe("Not installed");
    expect(within(row).queryByTestId("env-signin-private/notes")).toBeNull();
    // A refusal listing another package leaves this one Not installed.
    update(PROJECT_ID, { ...environments[PROJECT_ID]!, error: "acme/other is not shared with you at Spex Example — ask its owner", refused: ["acme/other"] });
    expect(within(row).getByTestId("env-installed-private/notes").textContent).toBe("Not installed");
    expect(within(row).queryByTestId("env-signin-private/notes")).toBeNull();

    // [playbook-library-92] the state lists it among the packages the
    // registry refused for want of a grant: Not installed · private.
    update(PROJECT_ID, { ...environments[PROJECT_ID]!, error: "private/notes is not shared with you at Spex Example — ask its owner", refused: ["private/notes"] });
    expect(within(row).getByTestId("env-installed-private/notes").textContent).toBe("Not installed · private");
    const signIn = within(row).getByTestId("env-signin-private/notes");
    expect(signIn.textContent).toBe("Sign in");
    expect(signIn.title).toBe("For publishing and private packages");
    fireEvent.click(signIn);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("registry.signin.start", { origin: REGISTRY }));
    // The failure still shows its cause in place.
    expect(projectSection().getByTestId("environment-error").textContent).toContain("not shared with you at Spex Example");
  });

  test("Git source tooltips use the display summary through live state updates", async () => {
    const withSource = (repository: string): EnvironmentState => ({
      ...environments[PROJECT_ID]!,
      requests: { "acme/triage": { kind: "git", repository, rev: "v1", path: "pkg" } },
      packages: PROJECT_ENVIRONMENT.packages
        .filter((pkg) => pkg.name === "acme/triage")
        .map((pkg) => ({ ...pkg, source: { kind: "git" as const, detail: repository } })),
    });
    environments[PROJECT_ID] = withSource("the remote");
    await renderTab();
    const source = projectSection().getByTestId("env-source-acme/triage");
    expect(source.title).toBe("From Git the remote at v1");
    for (const label of ["Spex Example", "https://example.test/acme/flows.git"]) {
      update(PROJECT_ID, withSource(label));
      expect(source.title).toBe(`From Git ${label} at v1`);
    }
    expect(projectSection().getByTestId("environment-section").innerHTML).not.toContain("secret-user");
  });

  test("a project that is your own group's spex repository stands as one heading", async () => {
    const space = home();
    space.own.repositories = space.own.repositories.map((entry) => ({ ...entry, key: PROJECT_ID }));
    seed({ space });
    render(<PackagesTab project={PROJECT} />);
    await screen.findByTestId("env-package-acme/triage");
    expect(screen.getAllByTestId("environment-section")).toHaveLength(1);
    expect(screen.queryByTestId("packages-personal")).toBeNull();
    expect(commandMock).not.toHaveBeenCalledWith("environment.get", { repository: OWN_KEY });
  });

  test("an empty spex.yaml says so", async () => {
    environments[PROJECT_ID] = environment({ repository: PROJECT_ID });
    seed();
    render(<PackagesTab project={PROJECT} />);
    expect((await projectSection().findByTestId("environment-empty")).textContent).toBe("No packages yet");
  });
});

describe("playbook-library-94: the chips", () => {
  test("spex.yaml, spex.lock not committed stands on the project's heading while its files are not both in the code's HEAD", async () => {
    environments[PROJECT_ID] = { ...environments[PROJECT_ID]!, committed: false };
    await renderTab();
    const chip = projectSection().getByTestId("environment-uncommitted");
    expect(chip.textContent).toBe("spex.yaml, spex.lock not committed");
    expect(chip.title).toBe("Commit them with the code so every member installs the same packages");
    // [playbook-library-92] a commit holding both: the chip goes.
    update(PROJECT_ID, { ...environments[PROJECT_ID]!, committed: true });
    expect(projectSection().queryByTestId("environment-uncommitted")).toBeNull();
    // Your own group's syncs with its records and never reads it.
    update(OWN_KEY, { ...environments[OWN_KEY]!, committed: null });
    expect(personalSection().queryByTestId("environment-uncommitted")).toBeNull();
  });

  test("spex.yaml changed stands with Update while the lock is stale, a conflict listed beneath it", async () => {
    environments[PROJECT_ID] = { ...environments[PROJECT_ID]!, stale: ["acme/tidy added"] };
    await renderTab();
    const stale = projectSection().getByTestId("environment-stale");
    expect(stale.textContent).toBe("spex.yaml changed");
    expect(stale.title).toBe("acme/tidy added");
    const updateControl = projectSection().getByTestId("environment-update");
    expect(updateControl.textContent).toBe("Update");
    fireEvent.click(updateControl);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("environment.resolve", { repository: PROJECT_ID }));
    expect(commandMock).not.toHaveBeenCalledWith("environment.install", expect.anything());

    // The state the core broadcasts replaces the last wholesale: the
    // lock current again, a conflict now stands.
    update(PROJECT_ID, {
      ...environments[PROJECT_ID]!,
      stale: null,
      conflicts: [
        {
          name: "acme/labels",
          requirements: [
            { by: "acme/triage", requirement: "^0.4.0" },
            { by: "acme/local-tools", requirement: "^1.0.0" },
          ],
        },
        { name: "acme/tidy", requirements: [{ by: "spex.yaml", requirement: "^2.0.0" }] },
      ],
    });
    // Each package with what asks for it, joined as the interface
    // language lists them (localization-5).
    expect(projectSection().getByTestId("environment-conflicts").textContent).toBe(
      "No version fits every package: acme/labels (^0.4.0 by acme/triage and ^1.0.0 by acme/local-tools) and acme/tidy (^2.0.0 by spex.yaml)",
    );
    expect(projectSection().getByTestId("environment-update")).toBeTruthy();
    update(PROJECT_ID, { ...environments[PROJECT_ID]!, conflicts: null });
    expect(projectSection().queryByTestId("environment-stale")).toBeNull();
    expect(projectSection().queryByTestId("environment-update")).toBeNull();
  });

  test("a newer built-in release reads on the built-in line with Update to, which updates; a state naming none reads the version alone", async () => {
    environments[PROJECT_ID] = { ...environments[PROJECT_ID]!, builtinUpdate: { shipped: "17.8.0", locked: "17.4.1" } };
    await renderTab();
    expect(projectSection().getByTestId("environment-builtin-line").textContent).toBe(
      "Built-in playbooks 17.4.1 · 17.8.0 shipped with this app",
    );
    const updateTo = projectSection().getByTestId("environment-builtin-update");
    expect(updateTo.textContent).toBe("Update to 17.8.0");
    fireEvent.click(updateTo);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("environment.resolve", { repository: PROJECT_ID }));
    expect(commandMock).not.toHaveBeenCalledWith("environment.install", expect.anything());
    update(PROJECT_ID, { ...PROJECT_ENVIRONMENT, registry: { origin: REGISTRY, legacy: false } });
    expect(projectSection().getByTestId("environment-builtin-line").textContent).toBe("Built-in playbooks 17.4.1");
    expect(projectSection().queryByTestId("environment-builtin-update")).toBeNull();
    expect(personalSection().queryByTestId("environment-builtin-update")).toBeNull();
  });

  test("Not in the agents' folders names each skill and package with its reason, Place skills again installing; no chip once nothing is left out", async () => {
    environments[PROJECT_ID] = {
      ...environments[PROJECT_ID]!,
      unexported: { skipped: [{ name: "lint", folder: ".agents/skills" }], missing: ["acme/local-tools"] },
    };
    await renderTab();
    const chip = projectSection().getByTestId("environment-unexported");
    expect(chip.textContent).toContain("Not in the agents' folders");
    expect(projectSection().getByTestId("environment-unexported-.agents/skills-lint").textContent).toBe(
      "lint — .agents/skills holds a folder of yours by that name",
    );
    expect(projectSection().getByTestId("environment-unexported-package-acme/local-tools").textContent).toBe(
      "acme/local-tools — Its files are not on this computer",
    );
    const again = projectSection().getByTestId("environment-place-skills");
    expect(again.textContent).toBe("Place skills again");
    fireEvent.click(again);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("environment.install", { repository: PROJECT_ID }));
    expect(commandMock).not.toHaveBeenCalledWith("environment.resolve", expect.anything());
    update(PROJECT_ID, { ...environments[PROJECT_ID]!, unexported: undefined });
    expect(projectSection().queryByTestId("environment-unexported")).toBeNull();
  });
});

describe("playbook-library-94: Remove", () => {
  test("Remove carries its consequence as its tooltip and removes a package nothing requires at once", async () => {
    await renderTab();
    fireEvent.click(projectSection().getByTestId("env-more-acme/triage"));
    const remove = projectSection().getByTestId("env-remove-acme/triage");
    expect(remove.textContent).toBe("Remove");
    expect(remove.title).toBe("Removes acme/triage from spex.yaml and uninstalls it");
    fireEvent.click(remove);
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.remove", { repository: PROJECT_ID, name: "acme/triage" }),
    );
    expect(projectSection().getByTestId("env-package-acme/triage").textContent).not.toContain("Keep");
  });

  test("a package another package requires asks Remove or Keep; Keep writes nothing", async () => {
    environments[PROJECT_ID] = {
      ...environments[PROJECT_ID]!,
      requests: { ...PROJECT_ENVIRONMENT.requests, "acme/labels": { kind: "registry", version: "^0.4.0" } },
      packages: PROJECT_ENVIRONMENT.packages.map((pkg) => (pkg.name === "acme/labels" ? { ...pkg, direct: true } : pkg)),
    };
    await renderTab();
    const row = projectSection().getByTestId("env-package-acme/labels");
    choose(projectSection(), "acme/labels", "remove");
    expect(row.textContent).toContain("Required by acme/triage");
    const keep = within(row).getByRole("button", { name: "Keep" });
    expect(document.activeElement).toBe(keep);
    fireEvent.click(keep);
    expect(commandMock).not.toHaveBeenCalledWith("environment.remove", expect.anything());
    expect(document.activeElement).toBe(projectSection().getByTestId("env-more-acme/labels"));
    choose(projectSection(), "acme/labels", "remove");
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.remove", { repository: PROJECT_ID, name: "acme/labels" }),
    );
  });
});

/** The lists the core reads again after a write: what the config
 * enables moves with each `playbook.add` (playbook-library-3). */
function listsFollowEdits(lists: CommandResults["environment.playbooks"]) {
  const base = commandMock.getMockImplementation()!;
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
    if (type === "environment.playbooks") return lists;
    if (type === "config.edit") {
      const op = params?.op as { kind: string; playbookId?: string };
      if (op.kind === "playbook.add") {
        const side = params?.repository === PROJECT_ID ? lists.project : lists.own;
        const entry = side?.find((candidate) => candidate.id === op.playbookId);
        if (entry) entry.enabled = [...entry.enabled, params?.repository === PROJECT_ID ? "project" : "own"];
      }
      return CONFIG_STATE;
    }
    return base(type, params);
  });
}

/** What the core's dry run of a request by path reads of each folder's
 * meta.yaml (environments-15): its name and version, nulls where it
 * names none, or a refusal. */
function foldersRead(folders: Record<string, { name: string | null; version: string | null } | Error>) {
  const base = commandMock.getMockImplementation()!;
  commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
    if (type === "environment.request" && params?.dryRun === true) {
      const path = (params.request as { path: string }).path;
      const read = folders[path] ?? { name: null, version: null };
      if (read instanceof Error) throw read;
      return { accepted: true, preview: read };
    }
    return base(type, params);
  });
}

/** The requests sent that write spex.yaml, no dry run among them. */
const writes = () => commandMock.mock.calls.filter(([type, params]) => type === "environment.request" && params?.dryRun !== true);

describe("playbook-library-94: a row's artifacts", () => {
  test("a row expands to one line per artifact; a playbook's Enable writes the project's config in place and then reads Enabled in the project", async () => {
    environments[PROJECT_ID] = {
      ...environments[PROJECT_ID]!,
      packages: environments[PROJECT_ID]!.packages.map((pkg) =>
        pkg.name === "acme/triage"
          ? { ...pkg, exports: [{ name: "triage", artifact: "triage" }, { name: "acme-triage", artifact: "triage-spec" }] }
          : pkg,
      ),
    };
    listsFollowEdits({
      project: [available({ id: "triage", package: "acme/triage", version: "1.2.3", source: "registry", repository: PROJECT_ID })],
      own: [available({ id: "code", roles: ["coder", "reviewer"] })],
    });
    await renderTab();
    const row = projectSection().getByTestId("env-package-acme/triage");
    // [playbook-library-92] a disclosure with its accessible name,
    // folded at first.
    const disclosure = within(row).getByRole("button", { name: "What acme/triage provides" });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(within(row).queryByTestId("env-artifacts-acme/triage")).toBeNull();
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    const lines = within(row).getByTestId("env-artifacts-acme/triage");
    expect(disclosure.getAttribute("aria-controls")).toBe(lines.id);
    // [playbook-library-92] one line per artifact: the playbook with
    // Enable, the spec placed as a skill marked with the language it is
    // shown in, its tooltip naming the language it has no text in.
    const playbook = within(lines).getByTestId("env-artifact-acme/triage-triage");
    expect(playbook.textContent).toBe("/triage·Enable");
    const spec = within(lines).getByTestId("env-artifact-acme/triage-triage-spec");
    expect(spec.textContent).toBe("spec · placed as a skillEnglish");
    expect(within(spec).getByTestId("env-fallback-acme/triage-triage-spec").title).toBe("No Simplified Chinese text yet");
    expect(within(playbook).queryByTestId("env-fallback-acme/triage-triage")).toBeNull();
    // The playbook line's Enable says whom it reaches.
    const enable = await within(playbook).findByRole("button", { name: "Enable /triage" });
    expect(enable.title).toBe("For you and every member of demo");
    fireEvent.click(enable);
    // [playbook-library-3] the Playbooks tab's write, into the project's
    // config: a player per role, none minted where the roster holds it.
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        repository: PROJECT_ID,
        op: { kind: "playbook.add", playbookId: "triage", roles: { coder: "dev.coder" } },
      }),
    );
    expect(commandMock).not.toHaveBeenCalledWith("config.edit", expect.objectContaining({ op: expect.objectContaining({ kind: "player.set" }) }));
    // [playbook-library-92] after: where it is enabled, focus kept on the line.
    const enabled = await within(playbook).findByTestId("env-enabled-acme/triage-triage");
    expect(enabled.textContent).toBe("Enabled in demo");
    await vi.waitFor(() => expect(document.activeElement).toBe(enabled));
    expect(within(playbook).queryByRole("button", { name: "Enable /triage" })).toBeNull();
    // A row with nothing to show has no disclosure.
    update(PROJECT_ID, {
      ...environments[PROJECT_ID]!,
      requests: { ...environments[PROJECT_ID]!.requests, "private/notes": { kind: "registry", version: "~1.2.0" } },
    });
    expect(within(projectSection().getByTestId("env-package-private/notes")).queryByRole("button", { name: /provides$/ })).toBeNull();
  });

  test("under Personal, Enable writes your own config, minting the player your roster lacks first, then reads Enabled · Personal; a refusal shows in place", async () => {
    environments[OWN_KEY] = {
      ...environments[OWN_KEY]!,
      requests: { ...OWN_ENVIRONMENT.requests, "acme/notes": { kind: "registry", version: "^0.2.0" } },
      packages: [
        ...OWN_ENVIRONMENT.packages,
        specPackage({
          name: "acme/notes",
          version: "0.2.0",
          artifacts: [{ id: "note", kind: "playbook", language: "en", fallback: false, provided: true }],
          exports: [{ name: "note", artifact: "note" }],
        }),
      ],
    };
    listsFollowEdits({
      project: [],
      own: [available({ id: "note", command: "jot", roles: ["Writer"], package: "acme/notes", version: "0.2.0", source: "registry" })],
    });
    let refuse = true;
    const followed = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "config.edit" && refuse && (params?.op as { kind: string }).kind === "playbook.add") {
        refuse = false;
        throw new Error("The config changed meanwhile — retry");
      }
      return followed(type, params);
    });
    await renderTab();
    const row = personalSection().getByTestId("env-package-acme/notes");
    fireEvent.click(within(row).getByRole("button", { name: "What acme/notes provides" }));
    const line = within(row).getByTestId("env-artifact-acme/notes-note");
    // The playbook reads by its command, the line starting with it, so
    // its Enable reads bare.
    const enable = await within(line).findByRole("button", { name: "Enable /jot" });
    expect(enable.textContent).toBe("Enable");
    expect(enable.title).toBe("For you, in every project of yours");
    fireEvent.click(enable);
    // [playbook-library-92] a refusal shows its cause in place, Enable standing.
    expect((await within(line).findByTestId("env-enable-error-acme/notes-note")).textContent).toBe(
      "The config changed meanwhile — retry",
    );
    expect(within(line).getByRole("button", { name: "Enable /jot" })).toBeTruthy();
    commandMock.mockClear();
    fireEvent.click(within(line).getByRole("button", { name: "Enable /jot" }));
    // [playbook-library-3] the player your roster lacks first, then the
    // entry in your own config.
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        repository: OWN_KEY,
        op: { kind: "playbook.add", playbookId: "note", roles: { Writer: "dev.writer" } },
      }),
    );
    const edits = commandMock.mock.calls.filter(([type]) => type === "config.edit").map(([, params]) => params);
    expect(edits[0]).toEqual({ op: { kind: "player.set", playerId: "dev.writer", patch: NEUTRAL_BLOCK } });
    expect(edits).toHaveLength(2);
    expect((await within(line).findByTestId("env-enabled-acme/notes-note")).textContent).toBe("Enabled · Personal");
    expect(within(line).queryByTestId("env-enable-error-acme/notes-note")).toBeNull();
  });

  test("skills read placed for your agents or not placed, the spec placed as a skill, an applet its page opening its tab", async () => {
    environments[PROJECT_ID] = {
      ...environments[PROJECT_ID]!,
      requests: {
        ...PROJECT_ENVIRONMENT.requests,
        "acme/kit": { kind: "registry", version: "^1.0.0" },
        "acme/away": { kind: "registry", version: "^1.0.0" },
      },
      packages: [
        ...PROJECT_ENVIRONMENT.packages,
        specPackage({
          name: "acme/kit",
          artifacts: [
            { id: "greet", kind: "skill", language: "en", fallback: false, provided: true },
            { id: "kit", kind: "spec", language: "en", fallback: false, provided: true },
            { id: "report", kind: "applet", language: null, fallback: false, provided: true },
            { id: "review", kind: "skill", language: "en", fallback: true, provided: true },
            { id: "notes", kind: "source", language: "en", fallback: false, provided: true },
          ],
          exports: [
            { name: "acme-kit", artifact: "kit" },
            { name: "greet", artifact: "greet" },
            { name: "review", artifact: "review" },
          ],
        }),
        specPackage({
          name: "acme/away",
          artifacts: [
            { id: "away", kind: "skill", language: "en", fallback: false, provided: true },
            { id: "board", kind: "applet", language: null, fallback: false, provided: true },
          ],
          exports: [{ name: "away", artifact: "away" }],
          installed: false,
        }),
      ],
    };
    await renderTab();
    const kit = projectSection().getByTestId("env-package-acme/kit");
    // [playbook-library-92] what it provides counts what has a line and
    // an act: a source is not counted.
    expect(within(kit).getByTestId("env-provides-acme/kit").textContent).toBe("1 spec · 2 skills · 1 applet");
    fireEvent.click(within(kit).getByRole("button", { name: "What acme/kit provides" }));
    const lines = within(kit).getByTestId("env-artifacts-acme/kit");
    // [playbook-library-92] every skill placed: one line naming them;
    // a source has no line of its own.
    expect(within(lines).getByTestId("env-skills-placed-acme/kit").textContent).toBe(
      "skills: greet, review · placed for your agentsEnglish",
    );
    expect(within(lines).queryByTestId("env-skills-unplaced-acme/kit")).toBeNull();
    expect(within(lines).getByTestId("env-artifact-acme/kit-kit").textContent).toBe("spec · placed as a skill");
    expect(within(lines).queryByTestId("env-artifact-acme/kit-notes")).toBeNull();
    expect(within(lines).getAllByRole("listitem")).toHaveLength(3);
    // [playbook-library-92] an applet's page opens its tab (applets-1).
    const applet = within(lines).getByTestId("env-artifact-acme/kit-report");
    expect(applet.textContent).toBe("report·its page");
    fireEvent.click(within(applet).getByRole("button", { name: "Open report" }));
    expect(useAppStore.getState().workspaceTabs[PROJECT_ID]).toBe(`applet:${PROJECT_ID}:report`);
    // A skill the last placing kept out of an agent folder reads not
    // placed beside the others; the spec's skill missed reads so too.
    update(PROJECT_ID, {
      ...environments[PROJECT_ID]!,
      unexported: { skipped: [{ name: "review", folder: ".agents/skills" }, { name: "acme-kit", folder: ".claude/skills" }], missing: [] },
    });
    expect(within(lines).getByTestId("env-skills-placed-acme/kit").textContent).toBe("skill: greet · placed for your agents");
    expect(within(lines).getByTestId("env-skills-unplaced-acme/kit").textContent).toBe("skill: review · not placedEnglish");
    expect(within(lines).getByTestId("env-artifact-acme/kit-kit").textContent).toBe("spec · not placed");
    // A package whose files are not here: its skills not placed, its
    // applet with no page to open.
    const away = projectSection().getByTestId("env-package-acme/away");
    fireEvent.click(within(away).getByRole("button", { name: "What acme/away provides" }));
    expect(within(away).getByTestId("env-skills-unplaced-acme/away").textContent).toBe("skill: away · not placed");
    expect(within(away).getByTestId("env-artifact-acme/away-board").textContent).toBe("board");
    expect(within(away).queryByRole("button", { name: "Open board" })).toBeNull();
  });
});

describe("playbook-library-94: Add…", () => {
  test("the Registry tab searches the heading's registry, reads each version's requirement, adds the chosen one, and the receipt reads what arrived with Enable", async () => {
    const lists: CommandResults["environment.playbooks"] = {
      project: [available({ id: "triage", package: "acme/triage", version: "1.2.3", source: "registry", repository: PROJECT_ID })],
      own: [available({ id: "code", roles: ["coder", "reviewer"] })],
    };
    listsFollowEdits(lists);
    await renderTab();
    openAdd(projectSection());
    const popover = projectSection().getByTestId("add-packages");
    expect(within(popover).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Registry", "Folder", "Git"]);
    const query = projectSection().getByTestId("registry-query") as HTMLInputElement;
    expect(query.placeholder).toBe("Search, or type org/name");
    fireEvent.change(query, { target: { value: "tri" } });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.search", { repository: PROJECT_ID, query: "tri" }),
    );
    const result = await projectSection().findByTestId("registry-result-acme/triage");
    // The description stands on its own line beneath the name, clamped,
    // its whole text the title.
    const description = within(result).getByTitle("Sort issues into labels");
    expect(description.textContent).toBe("Sort issues into labels");
    expect(description.parentElement).toBe(result);
    expect(description.className).toContain("line-clamp-2");
    const versions = within(result).getByTestId("registry-version-acme/triage") as HTMLSelectElement;
    expect([...versions.options].map((option) => [option.value, option.textContent])).toEqual([
      ["^1.2.3", "1.2.3 and newer 1.x"],
      ["1.2.3", "1.2.3 exactly"],
      ["^1.2.0", "1.2.0 and newer 1.x"],
      ["1.2.0", "1.2.0 exactly"],
    ]);
    // A major-zero version's series is its minor.
    const tidy = within(projectSection().getByTestId("registry-result-acme/tidy")).getByTestId("registry-version-acme/tidy") as HTMLSelectElement;
    expect([...tidy.options].map((option) => option.textContent)).toEqual(["0.3.0 and newer 0.3.x", "0.3.0 exactly"]);
    fireEvent.change(versions, { target: { value: "1.2.0" } });
    fireEvent.click(within(result).getByTestId("registry-add-acme/triage"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.request", {
        repository: PROJECT_ID,
        name: "acme/triage",
        request: { kind: "registry", version: "1.2.0" },
      }),
    );
    // [playbook-library-92] the popover closes on the receipt.
    expect((await projectSection().findByTestId("add-note")).textContent).toBe("Added acme/triage 1.2.3 · 1 spec · 1 playbook");
    expect(projectSection().queryByTestId("add-packages")).toBeNull();
    // [playbook-library-92] it provides one playbook: the receipt's
    // Enable enables it in place in the project's config, the write its
    // row's line makes (playbook-library-3), and then reads where it is
    // enabled, focus moving there; no tab opens. Its label names the
    // command, no line before it doing so.
    const receiptEnable = await projectSection().findByTestId("add-note-enable");
    expect(receiptEnable.textContent).toBe("Enable /triage");
    expect(receiptEnable.getAttribute("aria-label")).toBe("Enable /triage");
    expect(receiptEnable.title).toBe("For you and every member of demo");
    fireEvent.click(receiptEnable);
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("config.edit", {
        repository: PROJECT_ID,
        op: { kind: "playbook.add", playbookId: "triage", roles: { coder: "dev.coder" } },
      }),
    );
    const receiptEnabled = await projectSection().findByTestId("add-note-enabled");
    expect(receiptEnabled.textContent).toBe("Enabled in demo");
    await vi.waitFor(() => expect(document.activeElement).toBe(receiptEnabled));
    expect(projectSection().queryByTestId("add-note-enable")).toBeNull();
    expect(useAppStore.getState().workspaceTabs[PROJECT_ID]).toBeUndefined();

    // Your own heading searches its own registry.
    commandMock.mockClear();
    openAdd(personalSection());
    fireEvent.change(personalSection().getByTestId("registry-query"), { target: { value: "tidy" } });
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.search", { repository: OWN_KEY, query: "tidy" }),
    );
    expect(commandMock).not.toHaveBeenCalledWith("environment.search", expect.objectContaining({ repository: PROJECT_ID }));
  });

  test("the receipt reads the name alone until the lock holds the package, then its version and what it provides", async () => {
    await renderTab();
    openAdd(projectSection());
    fireEvent.change(projectSection().getByTestId("registry-query"), { target: { value: "tidy" } });
    const result = await projectSection().findByTestId("registry-result-acme/tidy");
    fireEvent.click(within(result).getByTestId("registry-add-acme/tidy"));
    expect((await projectSection().findByTestId("add-note")).textContent).toBe("Added acme/tidy");
    update(PROJECT_ID, {
      ...environments[PROJECT_ID]!,
      requests: { ...environments[PROJECT_ID]!.requests, "acme/tidy": { kind: "registry", version: "^0.3.0" } },
      packages: [...environments[PROJECT_ID]!.packages, specPackage({ name: "acme/tidy", version: "0.3.0", artifacts: [{ id: "tidy", kind: "skill", language: "en", fallback: false, provided: true }] })],
    });
    expect(projectSection().getByTestId("add-note").textContent).toBe("Added acme/tidy 0.3.0 · 1 skill");
    // No playbook, no Enable.
    expect(projectSection().queryByTestId("add-note-enable")).toBeNull();
  });

  test("a package of several playbooks: the receipt's Enable opens its row to its playbooks, each with its own Enable", async () => {
    listsFollowEdits({
      project: [
        available({ id: "sort", package: "acme/tidy", version: "0.3.0", source: "registry", repository: PROJECT_ID }),
        available({ id: "sweep", package: "acme/tidy", version: "0.3.0", source: "registry", repository: PROJECT_ID }),
      ],
      own: [],
    });
    await renderTab();
    openAdd(projectSection());
    fireEvent.change(projectSection().getByTestId("registry-query"), { target: { value: "tidy" } });
    fireEvent.click(within(await projectSection().findByTestId("registry-result-acme/tidy")).getByTestId("registry-add-acme/tidy"));
    await projectSection().findByTestId("add-note");
    update(PROJECT_ID, {
      ...environments[PROJECT_ID]!,
      requests: { ...environments[PROJECT_ID]!.requests, "acme/tidy": { kind: "registry", version: "^0.3.0" } },
      packages: [
        ...environments[PROJECT_ID]!.packages,
        specPackage({
          name: "acme/tidy",
          version: "0.3.0",
          artifacts: [
            { id: "sort", kind: "playbook", language: "en", fallback: false, provided: true },
            { id: "sweep", kind: "playbook", language: "en", fallback: false, provided: true },
          ],
        }),
      ],
    });
    expect(projectSection().getByTestId("add-note").textContent).toBe("Added acme/tidy 0.3.0 · 2 playbooks");
    const enable = projectSection().getByTestId("add-note-enable");
    expect(enable.title).toBe("Shows its playbooks, each with Enable");
    const row = projectSection().getByTestId("env-package-acme/tidy");
    expect(within(row).queryByTestId("env-artifacts-acme/tidy")).toBeNull();
    fireEvent.click(enable);
    // [playbook-library-92] its row opens, focus on its disclosure; each
    // playbook's line carries its own Enable, and nothing is written yet.
    const lines = await within(row).findByTestId("env-artifacts-acme/tidy");
    expect(within(row).getByTestId("env-expand-acme/tidy").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(within(row).getByTestId("env-expand-acme/tidy"));
    expect(await within(lines).findByTestId("env-enable-acme/tidy-sort")).toBeTruthy();
    expect(within(lines).getByTestId("env-enable-acme/tidy-sweep")).toBeTruthy();
    expect(commandMock).not.toHaveBeenCalledWith("config.edit", expect.anything());
  });

  test("an add the core refuses shows its cause in place", async () => {
    await renderTab();
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "environment.request") throw new Error("acme/tidy has no release meeting ^0.3.0");
      return base(type, params);
    });
    openAdd(projectSection());
    fireEvent.change(projectSection().getByTestId("registry-query"), { target: { value: "tidy" } });
    const result = await projectSection().findByTestId("registry-result-acme/tidy");
    fireEvent.click(within(result).getByTestId("registry-add-acme/tidy"));
    expect((await projectSection().findByTestId("registry-add-error-acme/tidy")).textContent).toBe(
      "acme/tidy has no release meeting ^0.3.0",
    );
    expect(projectSection().queryByTestId("add-note")).toBeNull();
  });

  test("the Folder tab starts from spex-packages/, reads the name and version from the folder's meta.yaml, asks for a name only where it names none, and refuses a bad name before anything is sent", async () => {
    foldersRead({
      "spex-packages/acme/tools": { name: "acme/tools", version: "0.1.0" },
      // A meta.yaml naming another package than its path suggests.
      "vendor/tools": { name: "acme/vendored", version: "2.0.0" },
      "vendor/bare": { name: null, version: null },
      "../out": new Error("../out is outside the project folder"),
    });
    await renderTab();
    openAdd(projectSection(), "folder");
    const form = projectSection().getByTestId("folder-request");
    expect(form.textContent).toContain(`Folder inside ${PROJECT.path}`);
    const path = projectSection().getByTestId("folder-request-path") as HTMLInputElement;
    expect(path.value).toBe("spex-packages/");
    // The prefill alone reads nothing and adds nothing.
    expect((projectSection().getByTestId("folder-request-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(commandMock).not.toHaveBeenCalledWith("environment.request", expect.anything());

    // [playbook-library-92] a package under development: the core's dry
    // run reads its meta.yaml (environments-15), writing nothing; its
    // name and version show, and no name is asked for.
    fireEvent.change(path, { target: { value: "spex-packages/acme/tools/" } });
    expect(projectSection().getByTestId("folder-request-reading").textContent).toBe("Reading meta.yaml…");
    expect((projectSection().getByTestId("folder-request-submit") as HTMLButtonElement).disabled).toBe(true);
    expect((await projectSection().findByTestId("folder-request-derived")).textContent).toBe("acme/tools");
    expect(projectSection().getByTestId("folder-request-version").textContent).toBe("0.1.0");
    expect(commandMock).toHaveBeenCalledWith("environment.request", {
      repository: PROJECT_ID,
      request: { kind: "path", path: "spex-packages/acme/tools" },
      dryRun: true,
    });
    expect(projectSection().queryByTestId("folder-request-name")).toBeNull();
    expect(writes()).toEqual([]);
    fireEvent.click(projectSection().getByTestId("folder-request-submit"));
    await vi.waitFor(() =>
      expect(writes()).toEqual([
        ["environment.request", { repository: PROJECT_ID, name: "acme/tools", request: { kind: "path", path: "spex-packages/acme/tools" } }],
      ]),
    );
    expect((await projectSection().findByTestId("add-note")).textContent).toBe("Added acme/tools");

    // Anywhere else the name is meta.yaml's, not the path's.
    commandMock.mockClear();
    openAdd(projectSection(), "folder");
    fireEvent.change(projectSection().getByTestId("folder-request-path"), { target: { value: "vendor/tools" } });
    expect((await projectSection().findByTestId("folder-request-derived")).textContent).toBe("acme/vendored");
    expect(projectSection().getByTestId("folder-request-version").textContent).toBe("2.0.0");
    expect(projectSection().queryByTestId("folder-request-name")).toBeNull();
    fireEvent.click(projectSection().getByTestId("folder-request-submit"));
    await vi.waitFor(() =>
      expect(writes()).toEqual([
        ["environment.request", { repository: PROJECT_ID, name: "acme/vendored", request: { kind: "path", path: "vendor/tools" } }],
      ]),
    );
    expect((await projectSection().findByTestId("add-note")).textContent).toBe("Added acme/vendored");

    // A folder the core refuses says why in place, asks no name and adds nothing.
    commandMock.mockClear();
    openAdd(projectSection(), "folder");
    fireEvent.change(projectSection().getByTestId("folder-request-path"), { target: { value: "../out" } });
    expect((await projectSection().findByTestId("folder-request-refusal")).textContent).toBe("../out is outside the project folder");
    expect(projectSection().queryByTestId("folder-request-name")).toBeNull();
    expect((projectSection().getByTestId("folder-request-submit") as HTMLButtonElement).disabled).toBe(true);

    // [playbook-library-92] a meta.yaml naming no package: a name field,
    // a bad name refused before anything is sent.
    fireEvent.change(projectSection().getByTestId("folder-request-path"), { target: { value: "vendor/bare" } });
    const name = await projectSection().findByTestId("folder-request-name");
    expect(name.title).toBe("No name in its meta.yaml");
    expect(projectSection().queryByTestId("folder-request-derived")).toBeNull();
    expect(projectSection().queryByTestId("folder-request-refusal")).toBeNull();
    fireEvent.change(name, { target: { value: "Acme/Tools" } });
    fireEvent.click(projectSection().getByTestId("folder-request-submit"));
    expect((await projectSection().findByTestId("folder-request-error")).textContent).toBe("Use org/name: lowercase words joined by hyphens");
    expect(writes()).toEqual([]);
    fireEvent.change(projectSection().getByTestId("folder-request-name"), { target: { value: "acme/bare" } });
    fireEvent.click(projectSection().getByTestId("folder-request-submit"));
    await vi.waitFor(() =>
      expect(writes()).toEqual([
        ["environment.request", { repository: PROJECT_ID, name: "acme/bare", request: { kind: "path", path: "vendor/bare" } }],
      ]),
    );
  });

  test("under Personal, the Folder tab asks for a folder inside its own folder and adds the path there", async () => {
    foldersRead({ "spex-packages/me/notes": { name: "me/notes", version: "0.2.0" } });
    await renderTab();
    openAdd(personalSection(), "folder");
    expect(personalSection().getByTestId("folder-request").textContent).toContain(`Folder inside ${OWN_ENVIRONMENT.pathRoot}`);
    fireEvent.change(personalSection().getByTestId("folder-request-path"), { target: { value: "spex-packages/me/notes" } });
    // Read and sent at your own records, never the project's.
    expect((await personalSection().findByTestId("folder-request-derived")).textContent).toBe("me/notes");
    expect(commandMock).toHaveBeenCalledWith("environment.request", {
      repository: OWN_KEY,
      request: { kind: "path", path: "spex-packages/me/notes" },
      dryRun: true,
    });
    fireEvent.click(personalSection().getByTestId("folder-request-submit"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.request", {
        repository: OWN_KEY,
        name: "me/notes",
        request: { kind: "path", path: "spex-packages/me/notes" },
      }),
    );
    expect(commandMock).not.toHaveBeenCalledWith("environment.request", expect.objectContaining({ repository: PROJECT_ID }));
  });

  test("the Folder tab waits for a folder on this computer: a state naming none disables it, saying which", async () => {
    environments[PROJECT_ID] = { ...environments[PROJECT_ID]!, pathRoot: null };
    environments[OWN_KEY] = { ...environments[OWN_KEY]!, pathRoot: null };
    await renderTab();
    fireEvent.click(projectSection().getByTestId("add-open"));
    const folder = projectSection().getByTestId("add-from-folder") as HTMLButtonElement;
    expect(folder.disabled).toBe(true);
    expect(folder.title).toBe("The project folder is not on this computer");
    fireEvent.click(personalSection().getByTestId("add-open"));
    const own = personalSection().getByTestId("add-from-folder") as HTMLButtonElement;
    expect(own.disabled).toBe(true);
    expect(own.title).toBe("Your Personal records are not on this computer");
  });

  test("the Git tab adds a repository at a branch or tag by the package's name", async () => {
    await renderTab();
    openAdd(projectSection(), "git");
    fireEvent.change(projectSection().getByTestId("git-request-name"), { target: { value: "acme/flows" } });
    fireEvent.change(projectSection().getByTestId("git-request-url"), { target: { value: "https://example.test/acme/flows.git" } });
    fireEvent.change(projectSection().getByTestId("git-request-rev"), { target: { value: "v0.2.0" } });
    fireEvent.click(projectSection().getByTestId("git-request-submit"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.request", {
        repository: PROJECT_ID,
        name: "acme/flows",
        request: { kind: "git", git: "https://example.test/acme/flows.git", rev: "v0.2.0" },
      }),
    );
  });
});

describe("playbook-library-92, playbook-library-117: a name the registry does not list", () => {
  const name = "private/notes";
  async function typeName(section = projectSection(), typed = name) {
    openAdd(section);
    fireEvent.change(section.getByTestId("registry-query"), { target: { value: typed } });
    return section.findByTestId("known-package-request");
  }

  test.each(["1.2.3", "^1.2.3", "~1.2.3"])("reads as one row and adds %s as typed without a further search", async (version) => {
    await renderTab();
    const row = await typeName();
    expect(within(row).getByTestId("known-package-name").textContent).toBe(`${name} · not listed publicly`);
    expect(projectSection().queryByTestId("registry-none")).toBeNull();
    const searches = commandMock.mock.calls.filter(([type]) => type === "environment.search").length;
    fireEvent.change(within(row).getByTestId("known-package-version"), { target: { value: `  ${version}  ` } });
    fireEvent.click(within(row).getByTestId("known-package-request-submit"));
    expect((await projectSection().findByTestId("add-note")).textContent).toBe(`Added ${name}`);
    expect(commandMock).toHaveBeenCalledWith("environment.request", {
      repository: PROJECT_ID, name, request: { kind: "registry", version },
    });
    expect(commandMock.mock.calls.filter(([type]) => type === "environment.search")).toHaveLength(searches);
    // Never presented as installed.
    expect(projectSection().queryByTestId(`env-installed-${name}`)).toBeNull();
  });

  test("an empty version holds Add; the core's refusal of a requirement shows in place; a listed name offers no such row", async () => {
    await renderTab();
    const row = await typeName();
    const submit = within(row).getByTestId("known-package-request-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(row).getByTestId("known-package-version"), { target: { value: "   " } });
    expect(submit.disabled).toBe(true);
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "environment.request") throw new Error('"*" is not a version requirement: use 1.2.3, ^1.2.3 or ~1.2.3');
      return base(type, params);
    });
    fireEvent.change(within(row).getByTestId("known-package-version"), { target: { value: "*" } });
    fireEvent.click(submit);
    expect((await projectSection().findByTestId("known-package-request-error")).textContent).toContain("not a version requirement");
    expect(projectSection().queryByTestId("add-note")).toBeNull();
    // A name the search lists adds from its own row.
    fireEvent.change(projectSection().getByTestId("registry-query"), { target: { value: "acme/triage" } });
    await projectSection().findByTestId("registry-result-acme/triage");
    await vi.waitFor(() => expect(projectSection().queryByTestId("known-package-request")).toBeNull());
  });

  test.each(["resolve", "reject"])("a delayed %s stays with the heading that sent it", async (outcome) => {
    const base = commandMock.getMockImplementation()!;
    let finish!: () => void;
    commandMock.mockImplementation((type: string, params?: Record<string, unknown>) => {
      if (type === "environment.request" && params?.repository === PROJECT_ID) {
        return new Promise((resolve, reject) => {
          finish = () => (outcome === "resolve" ? resolve({ accepted: true }) : reject(new Error("old destination refusal")));
        });
      }
      return base(type, params);
    });
    await renderTab();
    const row = await typeName();
    fireEvent.change(within(row).getByTestId("known-package-version"), { target: { value: "1.2.3" } });
    fireEvent.click(within(row).getByTestId("known-package-request-submit"));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    // Your own heading holds an Add… of its own, empty.
    const own = await typeName(personalSection());
    expect((within(own).getByTestId("known-package-version") as HTMLInputElement).value).toBe("");
    await act(async () => finish());
    // The delayed outcome lands in the heading that sent it, never yours.
    expect(personalSection().queryByTestId("add-note")).toBeNull();
    expect(personalSection().queryByTestId("known-package-request-error")).toBeNull();
    if (outcome === "resolve") {
      expect(projectSection().getByTestId("add-note").textContent).toBe(`Added ${name}`);
    } else {
      expect(projectSection().getByTestId("known-package-request-error").textContent).toBe("old destination refusal");
    }
    fireEvent.change(within(own).getByTestId("known-package-version"), { target: { value: "~1.2.3" } });
    fireEvent.click(within(own).getByTestId("known-package-request-submit"));
    await personalSection().findByTestId("add-note");
    expect(commandMock).toHaveBeenCalledWith("environment.request", {
      repository: OWN_KEY, name, request: { kind: "registry", version: "~1.2.3" },
    });
  });
});

describe("playbook-library-94: nothing waits on the core's other work", () => {
  test("every control stays available while that spex repository syncs: the sync refuses nothing", async () => {
    environments[PROJECT_ID] = {
      ...environments[PROJECT_ID]!,
      unexported: { skipped: [{ name: "lint", folder: ".agents/skills" }], missing: [] },
    };
    await renderTab({ space: home({ syncing: PROJECT_ID }) });
    expect(projectSection().queryByTestId("environment-progress")).toBeNull();
    const controls = [
      "env-more-acme/triage",
      "env-more-acme/local-tools",
      "env-install-acme/local-tools",
      "environment-place-skills",
      "add-open",
      "registry-chooser",
      "registry-signout",
    ].map((id) => projectSection().getByTestId(id) as HTMLButtonElement);
    for (const control of controls) {
      expect(control.disabled, control.dataset.testid).toBe(false);
      expect(control.title, control.dataset.testid).not.toMatch(/sync/i);
    }
    // [playbook-library-92] the acts inside a row's overflow and inside
    // Add… stand too: Remove and Publish, each Add… tab and a result's Add.
    fireEvent.click(projectSection().getByTestId("env-more-acme/local-tools"));
    for (const id of ["env-remove-acme/local-tools", "env-publish-acme/local-tools"]) {
      const entry = projectSection().getByTestId(id) as HTMLButtonElement;
      expect(entry.disabled, id).toBe(false);
      expect(entry.title, id).not.toMatch(/sync/i);
    }
    fireEvent.click(projectSection().getByTestId("env-more-acme/local-tools"));
    fireEvent.click(projectSection().getByTestId("add-open"));
    for (const id of ["add-from-registry", "add-from-folder", "add-from-git"]) {
      expect((projectSection().getByTestId(id) as HTMLButtonElement).disabled, id).toBe(false);
    }
    fireEvent.change(projectSection().getByTestId("registry-query"), { target: { value: "tri" } });
    const add = within(await projectSection().findByTestId("registry-result-acme/triage")).getByTestId("registry-add-acme/triage") as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    fireEvent.click(projectSection().getByTestId("add-open"));
    fireEvent.click(projectSection().getByTestId("env-install-acme/local-tools"));
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("environment.install", { repository: PROJECT_ID }));
  });

  test("the core's work reads in place as progress, holding no control; a failure shows its cause", async () => {
    environments[PROJECT_ID] = {
      ...environments[PROJECT_ID]!,
      busy: "installing",
      unexported: { skipped: [{ name: "lint", folder: ".agents/skills" }], missing: [] },
    };
    await renderTab();
    expect(projectSection().getByTestId("environment-progress").textContent).toBe("Installing…");
    for (const id of ["add-open", "environment-place-skills", "env-more-acme/triage", "env-install-acme/labels"]) {
      expect((projectSection().getByTestId(id) as HTMLButtonElement).disabled, id).toBe(false);
    }
    update(PROJECT_ID, { ...environments[PROJECT_ID]!, busy: "resolving" });
    expect(projectSection().getByTestId("environment-progress").textContent).toBe("Updating…");
    update(PROJECT_ID, { ...environments[PROJECT_ID]!, busy: null, error: "acme/labels 0.4.0: a file's digest does not match the lock" });
    expect(projectSection().queryByTestId("environment-progress")).toBeNull();
    expect(projectSection().getByTestId("environment-error").textContent).toBe("acme/labels 0.4.0: a file's digest does not match the lock");
    expect((projectSection().getByTestId("add-open") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("playbook-library-119: each heading's registry and the account there", () => {
  test("the chooser lists the public registry, the one spex.yaml names where that is another, and Other…, reading no directory", async () => {
    await renderTab();
    const entries = () => [...projectSection().getByTestId("registry-chooser-menu").querySelectorAll("button")].map((entry) => entry.textContent);
    // A spex.yaml naming the public registry: it alone, checked, then
    // Other…; no Space of the directory stands as a registry.
    fireEvent.click(projectSection().getByTestId("registry-chooser"));
    await vi.waitFor(() => expect(entries()).toEqual(["✓Spex Example", "Other…"]));
    expect(commandMock).toHaveBeenCalledWith("registry.get", {});
    expect(commandMock).not.toHaveBeenCalledWith("registry.directory", expect.anything());
    fireEvent.click(projectSection().getByTestId("registry-chooser"));

    // A spex.yaml naming another registry: the public one, then that
    // one by its display name, checked.
    update(PROJECT_ID, { ...environments[PROJECT_ID]!, registry: { origin: OTHER_REGISTRY, legacy: false } });
    await vi.waitFor(() => expect(projectSection().getByTestId("registry-chooser").textContent).toBe("Registry: Packages Example"));
    fireEvent.click(projectSection().getByTestId("registry-chooser"));
    await vi.waitFor(() => expect(entries()).toEqual(["Spex Example", "✓Packages Example", "Other…"]));
    const menu = projectSection().getByTestId("registry-chooser-menu");
    expect(within(menu).getByTestId(`registry-choice-${OTHER_REGISTRY}`).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(menu).getByTestId(`registry-choice-${REGISTRY}`));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.registry.set", { repository: PROJECT_ID, origin: REGISTRY }),
    );
    // Your own heading's choice is its own.
    expect(commandMock).not.toHaveBeenCalledWith("environment.registry.set", expect.objectContaining({ repository: OWN_KEY }));
    expect(personalSection().getByTestId("registry-chooser").textContent).toBe("Registry: Spex Example");
    fireEvent.click(personalSection().getByTestId("registry-chooser"));
    expect([...personalSection().getByTestId("registry-chooser-menu").querySelectorAll("button")].map((entry) => entry.textContent)).toEqual([
      "✓Spex Example",
      "Other…",
    ]);
    expect(commandMock).not.toHaveBeenCalledWith("registry.directory", expect.anything());
  });

  test("Other… reveals a field for a registry's address; a refusal shows in place", async () => {
    await renderTab();
    fireEvent.click(projectSection().getByTestId("registry-chooser"));
    fireEvent.click(projectSection().getByTestId("registry-choice-other"));
    const field = projectSection().getByTestId("registry-address") as HTMLInputElement;
    expect(field.getAttribute("aria-label")).toBe("Registry address");
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) => {
      if (type === "environment.registry.set" && params?.origin === "https://nowhere.test") throw new Error("spex.yaml changed meanwhile, retry.");
      return base(type, params);
    });
    fireEvent.change(field, { target: { value: "https://nowhere.test" } });
    fireEvent.click(projectSection().getByTestId("registry-use"));
    expect((await projectSection().findByTestId("registry-account-error")).textContent).toBe("spex.yaml changed meanwhile, retry");
    fireEvent.change(field, { target: { value: "https://registry.test" } });
    fireEvent.click(projectSection().getByTestId("registry-use"));
    await vi.waitFor(() =>
      expect(commandMock).toHaveBeenCalledWith("environment.registry.set", { repository: PROJECT_ID, origin: "https://registry.test" }),
    );
    await vi.waitFor(() => expect(projectSection().queryByTestId("registry-address")).toBeNull());
  });

  test("signed in reads @login with Sign out; signed out, Sign in starts a cancellable sign-in continuing in the browser", async () => {
    await renderTab();
    expect(projectSection().getByTestId("registry-login").textContent).toBe("@me");
    fireEvent.click(projectSection().getByTestId("registry-signout"));
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("registry.signout", { origin: REGISTRY }));
    // Signing out of the registry signs out of no Space.
    expect(commandMock).not.toHaveBeenCalledWith("space.signout", expect.anything());

    act(() => deliverServerMessageForTests({ type: "registry.state", state: account(false) }));
    expect(projectSection().queryByTestId("registry-login")).toBeNull();
    const signIn = projectSection().getByTestId("registry-signin");
    expect(signIn.textContent).toBe("Sign in");
    expect(signIn.title).toBe("For publishing and private packages");
    fireEvent.click(signIn);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("registry.signin.start", { origin: REGISTRY }));
    act(() =>
      deliverServerMessageForTests({
        type: "registry.state",
        state: account(false, { signIn: { phase: "running", flow: "device", userCode: "ABCD-EFGH", verificationUri: `${REGISTRY}/device?code=ABCD-EFGH` } }),
      }),
    );
    expect(projectSection().getByTestId("registry-signin").textContent).toBe("Signing in…");
    expect(projectSection().getByTestId("registry-signin-finish").textContent).toContain("Continue in your browser");
    expect(projectSection().getByTestId("registry-signin-link").textContent).toBe("Open Spex Example");
    fireEvent.click(projectSection().getByTestId("registry-cancel"));
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("registry.signin.cancel", { origin: REGISTRY }));
    act(() => deliverServerMessageForTests({ type: "registry.state", state: account(true) }));
    expect(projectSection().getByTestId("registry-login").textContent).toBe("@me");
    expect(projectSection().queryByTestId("registry-signin-finish")).toBeNull();
  });
});

describe("playbook-library-113: Publish a folder package from its row", () => {
  const NAME = "acme/triage";
  const PATH = "spex-packages/current";
  const PREVIEW = {
    instance: { origin: REGISTRY, name: "Spex Example" },
    name: NAME,
    version: "1.2.3",
    files: ["meta.yaml", "specs/en/triage.md", "skills/en/tidy/SKILL.md"],
  };
  const receipt = { name: NAME, version: "1.2.3", url: `${REGISTRY}/${NAME}` };
  const row = () => within(projectSection().getByTestId(`env-package-${NAME}`));
  const local = (): EnvironmentState => ({
    ...PROJECT_ENVIRONMENT,
    // The current request, not its older registry lock, owns the folder.
    requests: { ...PROJECT_ENVIRONMENT.requests, [NAME]: { kind: "path", path: PATH } },
    stale: ["acme/triage changed"],
    pathRoot: "/project",
    registry: { origin: REGISTRY, legacy: false },
  });
  function publishingReplies() {
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.publish"
        ? params?.dryRun ? { accepted: true, preview: PREVIEW } : { accepted: true }
        : base(type, params));
  }
  async function confirm(name = NAME) {
    const target = within(projectSection().getByTestId(`env-package-${name}`));
    choose(projectSection(), name, "publish");
    const summary = await target.findByTestId("publish-summary");
    fireEvent.click(within(summary).getByTestId("publish-confirm"));
    await vi.waitFor(() => expect(target.queryByTestId("publish-summary")).toBeNull());
  }

  test("the overflow offers Publish on a folder package alone; its preview names the registry, the package, the version, the files and the org; Cancel uploads nothing", async () => {
    environments[PROJECT_ID] = local();
    publishingReplies();
    await renderTab();
    // A required package has no overflow, and the built-in line no act.
    expect(projectSection().queryByTestId("env-more-acme/labels")).toBeNull();
    expect(within(projectSection().getByTestId("environment-builtin")).queryByRole("button")).toBeNull();

    choose(projectSection(), NAME, "publish");
    const summary = await row().findByTestId("publish-summary");
    // By name: the core reads the current request's folder (environments-10).
    expect(commandMock).toHaveBeenCalledWith("environment.publish", { repository: PROJECT_ID, name: NAME, dryRun: true });
    const destination = within(summary).getByTestId("publish-target");
    expect(destination.textContent).toBe(`Publish ${NAME} 1.2.3 to Spex Example`);
    expect(destination.title).toBe(REGISTRY);
    expect(within(summary).getByTestId("publish-count").textContent).toBe("3 files");
    expect(within(summary).getByTestId("publish-files").textContent).toContain("skills/en/tidy/SKILL.md");
    expect(within(summary).getByTestId("publish-account").textContent).toBe("as @me in acme");
    fireEvent.click(within(summary).getByTestId("publish-cancel"));
    expect(row().queryByTestId("publish")).toBeNull();
    expect(document.activeElement).toBe(row().getByTestId(`env-more-${NAME}`));
    expect(commandMock.mock.calls.some(([type, params]) => type === "environment.publish" && !params.dryRun)).toBe(false);

    // A registry or Git request, or no folder here: no Publish.
    for (const request of [{ kind: "registry" as const, version: "^1.2.0" }, { kind: "git" as const, repository: "remote", rev: "main" }]) {
      update(PROJECT_ID, { ...local(), requests: { ...local().requests, [NAME]: request } });
      fireEvent.click(row().getByTestId(`env-more-${NAME}`));
      expect(row().queryByTestId(`env-publish-${NAME}`)).toBeNull();
      fireEvent.keyDown(window, { key: "Escape" });
    }
    update(PROJECT_ID, { ...local(), pathRoot: null });
    fireEvent.click(row().getByTestId(`env-more-${NAME}`));
    expect(row().queryByTestId(`env-publish-${NAME}`)).toBeNull();
  });

  test("success reads the published version linking its page; a retained success cannot hide two identical refusals, and a different package can succeed", async () => {
    let state = local();
    environments[PROJECT_ID] = state;
    publishingReplies();
    await renderTab();
    await confirm();
    update(PROJECT_ID, (state = { ...state, published: receipt, error: null }));
    expect(row().getByTestId("publish-done").textContent).toBe("Published 1.2.3");
    expect(row().getByTestId("publish-link").getAttribute("href")).toBe(receipt.url);
    const refusal = "the registry refused acme/triage 1.2.3: that version exists";
    for (let attempt = 0; attempt < 2; attempt++) {
      await confirm();
      update(PROJECT_ID, (state = { ...state, busy: "publishing" }));
      expect(row().getByTestId("publish-button").textContent).toBe("Publishing…");
      expect(row().queryByTestId("publish-done")).toBeNull();
      expect(row().queryByTestId("publish-error")).toBeNull();
      update(PROJECT_ID, (state = { ...state, busy: null, error: refusal }));
      expect(row().getByTestId("publish-error").textContent).toBe(refusal);
      expect(row().queryByTestId("publish-done")).toBeNull();
    }
    // [playbook-library-93] a receipt stands only on the package it
    // names: another folder package's publish succeeds on its own row.
    const other = "acme/local-tools";
    const otherRow = within(projectSection().getByTestId(`env-package-${other}`));
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation(async (type: string, params?: Record<string, unknown>) =>
      type === "environment.publish" && params?.dryRun
        ? { accepted: true, preview: { ...PREVIEW, name: other } }
        : base(type, params));
    await confirm(other);
    expect(commandMock).toHaveBeenCalledWith("environment.publish", { repository: PROJECT_ID, name: other });
    update(PROJECT_ID, { ...state, error: null, published: { ...receipt, name: other, url: `${REGISTRY}/${other}` } });
    expect(otherRow.getByTestId("publish-done").textContent).toBe("Published 1.2.3");
    expect(otherRow.getByTestId("publish-link").getAttribute("href")).toBe(`${REGISTRY}/${other}`);
    expect(row().queryByTestId("publish-done")).toBeNull();
  });

  test("the overflow's Publish asks for the preview once: Checking… stands disabled until the summary takes the button's place", async () => {
    environments[PROJECT_ID] = local();
    let finish!: (reply: { accepted: true; preview: typeof PREVIEW }) => void;
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation((type: string, params?: Record<string, unknown>) =>
      type === "environment.publish" && params?.dryRun
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : base(type, params));
    await renderTab();
    choose(projectSection(), NAME, "publish");
    // The choice itself asks: no Publish of the control's own to press.
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const checking = row().getByTestId("publish-button");
    expect(checking.textContent).toBe("Checking…");
    expect((checking as HTMLButtonElement).disabled).toBe(true);
    expect(row().queryByTestId("publish-summary")).toBeNull();
    await act(async () => {
      finish({ accepted: true, preview: PREVIEW });
    });
    // The summary replaces the button; nothing asked a second time.
    expect(row().getByTestId("publish-summary")).not.toBeNull();
    expect(row().queryByTestId("publish-button")).toBeNull();
    expect(commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && params.dryRun)).toHaveLength(1);
  });

  test("a changed path discards a delayed preview; a changed registry or a sign-out discards an open one, Sign in to publish taking Publish's place", async () => {
    environments[PROJECT_ID] = local();
    let finish!: (reply: { accepted: true; preview: typeof PREVIEW }) => void;
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation((type: string, params?: Record<string, unknown>) =>
      type === "environment.publish" && params?.dryRun
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : base(type, params));
    await renderTab();
    choose(projectSection(), NAME, "publish");
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    update(PROJECT_ID, { ...local(), requests: { ...local().requests, [NAME]: { kind: "path", path: "spex-packages/replacement" } } });
    await act(async () => {
      finish({ accepted: true, preview: PREVIEW });
    });
    // The preview goes with the folder it was for; Publish asks again.
    expect(row().queryByTestId("publish-summary")).toBeNull();
    expect(commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && params.dryRun)).toHaveLength(1);
    expect(row().getByTestId("publish-button").textContent).toBe("Publish");

    publishingReplies();
    choose(projectSection(), NAME, "publish");
    await row().findByTestId("publish-summary");
    // A Space's change is not the registry's.
    const changed = home({ account: null });
    changed.defaultInstance = "https://second.test";
    changed.instances = [instanceState("https://second.test", { displayName: "Spex Example" })];
    act(() => useAppStore.setState({ space: changed }));
    expect(row().queryByTestId("publish-summary")).not.toBeNull();
    update(PROJECT_ID, { ...local(), registry: { origin: "https://second.test", legacy: false } });
    act(() => deliverServerMessageForTests({ type: "registry.state", state: account(true, { origin: "https://second.test" }) }));
    expect(row().queryByTestId("publish-summary")).toBeNull();
    choose(projectSection(), NAME, "publish");
    await row().findByTestId("publish-summary");
    // Signed out at that registry, the open preview goes with the
    // account it would have published as.
    act(() => deliverServerMessageForTests({ type: "registry.state", state: account(false, { origin: "https://second.test" }) }));
    expect(row().queryByTestId("publish-summary")).toBeNull();
    const signIn = row().getByTestId("publish-signin");
    expect(signIn.textContent).toBe("Sign in to publish");
    fireEvent.click(signIn);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("registry.signin.start", { origin: "https://second.test" }));
  });

  test.each([
    { lands: "signed in", reply: () => account(true) },
    { lands: "signed out", reply: () => account(false) },
    { lands: "as a failure", reply: () => new Error("Spex Example could not be reached.") },
  ])("until the account at the registry is read, Publish waits as Checking… and nothing judges it; the read landing $lands decides", async ({ lands, reply }) => {
    environments[PROJECT_ID] = local();
    publishingReplies();
    // The core answers each read of the account once released, its state
    // broadcast first as the core sends it, or the read failing.
    const reads: (() => void)[] = [];
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation((type: string, params?: Record<string, unknown>) =>
      type === "registry.get" && params?.origin === REGISTRY
        ? new Promise((resolve, reject) =>
            reads.push(() => {
              const answer = reply();
              if (answer instanceof Error) return reject(answer);
              deliverServerMessageForTests({ type: "registry.state", state: answer });
              resolve(answer);
            }),
          )
        : base(type, params));
    await renderTab({ registryAccounts: {} });
    fireEvent.click(projectSection().getByTestId(`env-more-${NAME}`));
    const entry = projectSection().getByTestId(`env-publish-${NAME}`);
    expect(entry.textContent).toBe("Publish");
    fireEvent.click(entry);
    const waiting = row().getByTestId("publish-button") as HTMLButtonElement;
    expect(waiting.textContent).toBe("Checking…");
    expect(waiting.disabled).toBe(true);
    expect(row().queryByTestId("publish-signin")).toBeNull();
    expect(commandMock.mock.calls.some(([type]) => type === "environment.publish" || type === "registry.signin.start")).toBe(false);

    await vi.waitFor(() => expect(reads.length).toBeGreaterThan(0));
    await act(async () => {
      for (const land of reads.splice(0)) land();
    });
    const dryRuns = () => commandMock.mock.calls.filter(([type, params]) => type === "environment.publish" && params?.dryRun);
    if (lands === "signed in") {
      // One ask for the preview, its summary in the button's place.
      await row().findByTestId("publish-summary");
      expect(row().queryByTestId("publish-button")).toBeNull();
      expect(dryRuns()).toHaveLength(1);
      expect(commandMock).not.toHaveBeenCalledWith("registry.signin.start", expect.anything());
      return;
    }
    // Sign in to publish in Publish's place, its sign-in started only
    // when chosen, nothing previewed.
    const signIn = await row().findByTestId("publish-signin");
    expect(signIn.textContent).toBe("Sign in to publish");
    expect(row().queryByTestId("publish-button")).toBeNull();
    if (lands === "as a failure") expect(row().getByTestId("publish-signin-error").textContent).toBe("Spex Example could not be reached");
    expect(commandMock).not.toHaveBeenCalledWith("registry.signin.start", expect.anything());
    expect(dryRuns()).toHaveLength(0);
    fireEvent.click(signIn);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("registry.signin.start", { origin: REGISTRY }));
  });

  test("a failed read of one registry's account judges no other: a changed registry waits for its own read", async () => {
    environments[PROJECT_ID] = local();
    publishingReplies();
    // The first registry's read fails; the second's is held until released.
    const reads: (() => void)[] = [];
    const base = commandMock.getMockImplementation()!;
    commandMock.mockImplementation((type: string, params?: Record<string, unknown>) =>
      type === "registry.get" && params?.origin === REGISTRY
        ? Promise.reject(new Error("Spex Example could not be reached."))
        : type === "registry.get" && params?.origin === OTHER_REGISTRY
          ? new Promise((resolve) =>
              reads.push(() => {
                const answer = account(true, { origin: OTHER_REGISTRY, displayName: "Packages Example" });
                deliverServerMessageForTests({ type: "registry.state", state: answer });
                resolve(answer);
              }),
            )
          : base(type, params));
    await renderTab({ registryAccounts: {} });
    choose(projectSection(), NAME, "publish");
    expect((await row().findByTestId("publish-signin-error")).textContent).toBe("Spex Example could not be reached");
    update(PROJECT_ID, { ...local(), registry: { origin: OTHER_REGISTRY, legacy: false } });
    // Nothing judges the second registry before its own read lands.
    expect(row().queryByTestId("publish-signin")).toBeNull();
    expect(row().queryByTestId("publish-signin-error")).toBeNull();
    expect(row().getByTestId("publish").textContent).toBe("Loading registry…");
    await vi.waitFor(() => expect(reads.length).toBeGreaterThan(0));
    await act(async () => {
      for (const land of reads.splice(0)) land();
    });
    expect((await row().findByTestId("publish-button")).textContent).toBe("Publish");
    expect(commandMock).not.toHaveBeenCalledWith("registry.signin.start", expect.anything());
  });

  test("signed out at the registry, the overflow reads Sign in to publish in Publish's place and starts the sign-in", async () => {
    environments[PROJECT_ID] = local();
    await renderTab();
    act(() => deliverServerMessageForTests({ type: "registry.state", state: account(false) }));
    fireEvent.click(projectSection().getByTestId(`env-more-${NAME}`));
    const entry = projectSection().getByTestId(`env-publish-${NAME}`);
    expect(entry.textContent).toBe("Sign in to publish");
    fireEvent.click(entry);
    await vi.waitFor(() => expect(commandMock).toHaveBeenCalledWith("registry.signin.start", { origin: REGISTRY }));
    // Nothing is previewed before the account can publish.
    expect(commandMock.mock.calls.some(([type]) => type === "environment.publish")).toBe(false);
    expect(row().getByTestId("publish-signin").textContent).toBe("Signing in…");
    // Signed in, the row offers its Publish again, the preview asked for
    // only by pressing it.
    act(() => deliverServerMessageForTests({ type: "registry.state", state: account(true) }));
    expect(row().getByTestId("publish-button").textContent).toBe("Publish");
    expect(commandMock.mock.calls.some(([type]) => type === "environment.publish")).toBe(false);
  });
});
