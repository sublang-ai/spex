// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Disposal-failure coverage (CORE-40/41): one runtime that fails to
// dispose must not strand its project (CORE-4) nor skip another
// session's disposal at shutdown (CORE-39) — that would orphan the
// other session's agent processes.
//
// The failure is real rather than stubbed: the captain's dispose
// rejects, and cligent's own runtime disposal surfaces it, so the
// path under test is the one a broken SDK teardown takes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import type { Captain } from "@sublang/cligent/tmux-play";
import type { Command, CommandResults, ServerMessage } from "./protocol.js";

const CONFIG = `
captain:
  adapter: claude
  model: claude-test
players:
  dev.coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev.coder
`;

const DISPOSE_FAILURE = "captain teardown exploded";

/** A captain whose disposal fails the way a dead SDK child would. */
function brokenCaptain(): Captain {
  const captain = createScriptedCaptain(async () => {});
  return {
    ...captain,
    async dispose(): Promise<void> {
      throw new Error(DISPOSE_FAILURE);
    },
  };
}

/** A captain that records whether its disposal actually ran. */
function healthyCaptain(): { captain: Captain; disposed: () => boolean } {
  const inner = createScriptedCaptain(async () => {});
  let ran = false;
  return {
    captain: {
      ...inner,
      async dispose(): Promise<void> {
        ran = true;
        await inner.dispose?.();
      },
    },
    disposed: () => ran,
  };
}

class Client {
  private readonly socket: WebSocket;
  private readonly messages: ServerMessage[] = [];
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
    });
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) return resolve();
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
    await this.waitFor((message) => message.type === "hello");
  }

  close(): void {
    this.socket.close();
  }

  async command<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<
    | { ok: true; result: CommandResults[T] }
    | { ok: false; error: { code: string; message: string } }
  > {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await this.waitFor(
      (message) => message.type === "reply" && message.id === id,
    );
    if (reply.type !== "reply") throw new Error("unreachable");
    return reply.ok
      ? { ok: true, result: reply.result as CommandResults[T] }
      : { ok: false, error: reply.error };
  }

  async expectOk<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) {
      throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    }
    return reply.result;
  }

  private async waitFor(
    predicate: (message: ServerMessage) => boolean,
  ): Promise<ServerMessage> {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const found = this.messages.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) throw new Error("timed out waiting for message");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

interface Harness {
  service: CoreService;
  projectDirs: string[];
}

/** Start a core whose captains are handed out in creation order. */
async function startHarness(captains: Captain[]): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "spex-shutdown-it-"));
  const configPath = join(dir, "playbook.config.yaml");
  writeFileSync(configPath, CONFIG);
  const projectDirs = ["project-a", "project-b"].map((name) => {
    const path = join(dir, name);
    mkdirSync(path);
    execFileSync("git", ["init", "-q", path]);
    return path;
  });
  const { imports } = fakeAdapterImports({
    rules: [],
    fallback: { result: "ok" },
  });
  let handed = 0;
  const service = await CoreService.start({
    token: "test",
    configPath,
    dbPath: join(dir, "spex.db"),
    adapterImports: imports,
    adapterRuntime: () => ({ usable: true }),
    captainFactory: async () => {
      const captain = captains[handed];
      handed += 1;
      if (!captain) throw new Error("no captain scripted for this session");
      return captain;
    },
    env: {},
    home: join(dir, "home"),
    watchConfig: false,
  });
  return { service, projectDirs };
}

test("CORE-40: a failed disposal ends the session and frees its project", async () => {
  const harness = await startHarness([brokenCaptain(), healthyCaptain().captain]);
  const client = new Client(harness.service.port());
  await client.open();
  try {
    const project = await client.expectOk("project.register", {
      path: harness.projectDirs[0] as string,
    });
    const session = await client.expectOk("session.create", {
      projectId: project.id,
    });

    // The client is told what went wrong (CORE-4).
    const disposal = await client.command("session.dispose", {
      sessionId: session.id,
    });
    assert.equal(disposal.ok, false);
    assert.match(
      disposal.ok === false ? disposal.error.message : "",
      new RegExp(DISPOSE_FAILURE),
    );

    // ...and the project is not stranded: it takes a new session.
    const replacement = await client.expectOk("session.create", {
      projectId: project.id,
    });
    assert.notEqual(replacement.id, session.id);
  } finally {
    client.close();
    await harness.service.stop().catch(() => {
      // The replacement session's disposal is not under test here.
    });
  }
});

test("CORE-41: a failed disposal neither skips another nor holds the endpoint open", async () => {
  const healthy = healthyCaptain();
  const harness = await startHarness([brokenCaptain(), healthy.captain]);
  const port = harness.service.port();
  const client = new Client(port);
  await client.open();

  for (const path of harness.projectDirs) {
    const project = await client.expectOk("project.register", { path });
    await client.expectOk("session.create", { projectId: project.id });
  }
  client.close();

  // The first session's runtime fails to dispose; the stop reports it
  // only after every session has been attempted (CORE-39).
  await assert.rejects(
    harness.service.stop(),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError, "failures are reported together");
      assert.match(String(error.errors[0]), new RegExp(DISPOSE_FAILURE));
      return true;
    },
  );
  assert.ok(
    healthy.disposed(),
    "the second session's runtime is disposed despite the first one's failure",
  );

  // The endpoint is closed even though the disposal failed.
  await assert.rejects(
    new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
      socket.once("open", () => {
        socket.close();
        resolve();
      });
      socket.once("error", reject);
    }),
  );
});
