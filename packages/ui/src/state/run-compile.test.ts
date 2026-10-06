// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The one-shot compile names the project whose working folder holds
// the spec package it writes (environments-10): the store's runCompile
// sends the current project, else the first, and the command it sends
// is one the core's schema accepts.

import { afterEach, describe, expect, test, vi } from "vitest";
import { commandSchema } from "@sublang/spex-core/protocol";

import { setClientForTests, useAppStore } from "./store.js";

const INPUT = {
  playbookId: "triage",
  sourceText: "# Triage\n",
  roles: ["triager"],
  command: "triage",
  intent: "Label new issues",
  bindings: { triager: "dev.coder" },
};

function fakeClient() {
  const command = vi.fn(async () => ({ status: "missing", path: "/x" }));
  setClientForTests({
    command,
    subscribe: async () => null,
    unsubscribe: async () => null,
  } as unknown as Parameters<typeof setClientForTests>[0]);
  return command;
}

function projects(...ids: string[]) {
  return ids.map((id) => ({ id })) as unknown as ReturnType<typeof useAppStore.getState>["projects"];
}

afterEach(() => {
  setClientForTests(undefined);
  useAppStore.setState({ projects: [], currentProjectId: undefined });
});

describe("compile.run names its project", () => {
  test("the current project is sent, and the command parses", async () => {
    const command = fakeClient();
    useAppStore.setState({ projects: projects("me/a-spex", "me/b-spex"), currentProjectId: "me/b-spex" });
    await useAppStore.getState().runCompile(INPUT);
    expect(command).toHaveBeenCalledTimes(1);
    const [type, fields] = command.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(type).toBe("compile.run");
    expect(fields.projectId).toBe("me/b-spex");
    expect(commandSchema.safeParse({ type, id: "c1", ...fields }).success).toBe(true);
    // Without a project the core's schema refuses it.
    const { projectId: _dropped, ...without } = fields;
    expect(commandSchema.safeParse({ type, id: "c2", ...without }).success).toBe(false);
  });

  test("with no current project the first is sent; an explicit one wins", async () => {
    const command = fakeClient();
    useAppStore.setState({ projects: projects("me/a-spex", "me/b-spex"), currentProjectId: "gone/x-spex" });
    await useAppStore.getState().runCompile(INPUT);
    await useAppStore.getState().runCompile({ ...INPUT, projectId: "me/b-spex" });
    const sent = command.mock.calls.map((call) => (call as unknown as [string, { projectId: string }])[1].projectId);
    expect(sent).toEqual(["me/a-spex", "me/b-spex"]);
  });

  test("with no project at all nothing is sent", async () => {
    const command = fakeClient();
    await expect(useAppStore.getState().runCompile(INPUT)).rejects.toThrow("Add a project first");
    expect(command).not.toHaveBeenCalled();
  });
});
