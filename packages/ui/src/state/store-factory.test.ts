// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-171: the places (run-view-168). The local store and two seat
// stores, each over a fake client of its own, keep each core's state
// in a store of that core's own: what one core sends — an approval
// snapshot, a ledger reply, a backfill — lands in its store alone, and
// a read in flight at one place is never overtaken by another's. A
// seat's language is that seat's state: it activates no language on
// the page, writes none, and its re-read asks its own core alone
// (localization-11). Preferences are kept by place and project, the
// local place's under today's keys. Ids are the cores' own, so the
// same project and session ids stand at two places here, as one
// repository cloned on two machines has one id on both.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  ApprovalState,
  LedgerState,
  PendingApproval,
  ServerMessage,
  TmuxPlayRecord,
} from "@sublang/spex-core/protocol";

import type { SpexClient } from "../lib/client.js";
import { activateLanguage, i18n } from "../i18n.js";
import {
  LANGUAGE_KEY,
  LOCAL_PLACE,
  createAppStore,
  deliverServerMessageForTests,
  placeKey,
  placeLabel,
  setClientForTests,
  useAppStore,
  type AppStore,
  type Place,
} from "./store.js";

/** Two seats, each keyed `<instance origin>#<server id>` and shown by
 * its server's name (core-service-128). */
const ALPHA: Place = { key: "https://spex.pub#41", name: "build-box" };
const BETA: Place = { key: "https://spex.pub#42", name: "gpu-box" };

const PROJECT = "me/alpha-spex";
const SESSION = "s1";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** The reply a command with no test-specific answer gets: one the
 * protocol allows, so a re-read folds what a core would send. */
function defaultReply(type: string): unknown {
  switch (type) {
    case "session.list":
    case "project.list":
    case "readiness.get":
    case "draft.list":
      return [];
    case "config.get":
      return { status: "missing", path: "/home/playbook.config.yaml" };
    case "ledger.get":
      return { intents: [], attention: [], badge: 0 };
    case "history.get":
      return { records: [] };
    case "language.set":
    case "language.get":
      return { language: null };
    default:
      return {};
  }
}

type Answer = (fields: Record<string, unknown>) => unknown;

/** A fake core: every command recorded, answered from `answers` where
 * the test names one and from the protocol's defaults otherwise. */
function fakeClient(answers: Record<string, Answer> = {}) {
  const command = vi.fn(async (type: string, fields: Record<string, unknown> = {}) =>
    type in answers ? answers[type]!(fields) : defaultReply(type),
  );
  const subscribe = vi.fn(async () => null);
  const unsubscribe = vi.fn(async () => null);
  const client = { command, subscribe, unsubscribe } as unknown as SpexClient;
  return { client, command, subscribe };
}

type Fake = ReturnType<typeof fakeClient>;

/** A turn's opening record, folded into a view by the run view's
 * reducer like any other. */
function turnStarted(turnId: number, prompt: string): TmuxPlayRecord {
  return {
    type: "turn_started",
    turnId,
    timestamp: 1_000 + turnId,
    turn: { id: turnId, prompt },
  } as unknown as TmuxPlayRecord;
}

function recordMessage(seq: number, record: TmuxPlayRecord): ServerMessage {
  return { type: "record", sessionId: SESSION, seq, record } as ServerMessage;
}

const PENDING: PendingApproval = {
  id: "request-1",
  owner: { kind: "session", id: SESSION },
  ownerLabel: "Inspect example",
  projectName: "alpha",
  actorId: "inspector",
  invocationId: "invocation-1",
  turnId: 3,
  request: {
    id: "native-id",
    kind: "tool",
    agent: "claude-code",
    sessionId: "native-session",
    toolUseId: "tool-1",
    toolName: "desktop.inspect",
    details: { title: "Read the Example window?" },
    input: { app: "Example" },
    choices: ["allow_once", "deny"],
    createdAt: 1,
    expiresAt: Date.now() + 600_000,
  },
} as PendingApproval;

function ledger(badge: number): LedgerState {
  return { intents: [], attention: [], badge };
}

/** This page's storage, stood in for: the environment's own answers
 * no call. Every write is recorded, so a write that must not happen
 * can be told from one that left no trace. */
let kept: Map<string, string>;
let writes: string[];
let realStorage: PropertyDescriptor | undefined;

/** The local store as every surface reads it, before this file's tests. */
const pristine = useAppStore.getState();

let local: Fake;
let alphaFake: Fake;
let betaFake: Fake;
let alpha: AppStore;
let beta: AppStore;

beforeEach(() => {
  kept = new Map();
  writes = [];
  realStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes.push(key);
        kept.set(key, value);
      },
      removeItem: (key: string) => {
        writes.push(key);
        kept.delete(key);
      },
      key: (index: number) => [...kept.keys()][index] ?? null,
      get length() {
        return kept.size;
      },
    },
  });
  activateLanguage("en");
  local = fakeClient();
  setClientForTests(local.client);
  alphaFake = fakeClient();
  betaFake = fakeClient();
  alpha = createAppStore(ALPHA, alphaFake.client);
  beta = createAppStore(BETA, betaFake.client);
});

afterEach(() => {
  setClientForTests(undefined);
  useAppStore.setState(pristine, true);
  if (realStorage) Object.defineProperty(window, "localStorage", realStorage);
  vi.restoreAllMocks();
  activateLanguage("en");
});

describe("run-view-171: each core's state stays in its own store", () => {
  test("a place is shown by \"This computer\" or its server's name", () => {
    // [run-view-168] each core a place, "This computer" or the server's name.
    expect(useAppStore.place).toEqual(LOCAL_PLACE);
    expect(placeLabel(useAppStore.place)).toBe("This computer");
    expect(alpha.place).toBe(ALPHA);
    expect(placeLabel(alpha.place)).toBe("build-box");
    expect(placeLabel(beta.place)).toBe("gpu-box");
  });

  test("an approval snapshot in one store leaves the others untouched", () => {
    const snapshot: ApprovalState = { generation: "generation-alpha", revision: 1, pending: [PENDING] };
    alpha.deliver({ type: "approval.state", state: snapshot });
    // [run-view-171] the seat's snapshot is its store's alone.
    expect(alpha.getState().approvals).toEqual(snapshot);
    expect(useAppStore.getState().approvals).toBeUndefined();
    expect(beta.getState().approvals).toBeUndefined();

    // Each store judges a snapshot by its own core's generation: the
    // local core's arriving now is taken whole, and a new connection at
    // the other seat clears that seat's authority alone.
    const localSnapshot: ApprovalState = { generation: "generation-local", revision: 7, pending: [] };
    deliverServerMessageForTests({ type: "approval.state", state: localSnapshot });
    beta.deliver({ type: "hello", protocolVersion: 0 } as unknown as ServerMessage);
    // [run-view-171] neither reaches the seat that holds a snapshot.
    expect(useAppStore.getState().approvals).toEqual(localSnapshot);
    expect(alpha.getState().approvals).toEqual(snapshot);
    expect(beta.getState().approvals).toBeUndefined();
  });

  test("a ledger reply in one store leaves the others untouched", async () => {
    // The local core's read is slow: it is still in flight when the
    // seat's read is asked and answered.
    const localReply = deferred<LedgerState>();
    local.command.mockImplementation(async (type: string) =>
      type === "ledger.get" ? localReply.promise : defaultReply(type),
    );
    alphaFake.command.mockImplementation(async (type: string) =>
      type === "ledger.get" ? ledger(2) : defaultReply(type),
    );
    const localRead = useAppStore.getState().loadLedger();
    await alpha.getState().loadLedger();

    // [run-view-171] the seat's ledger reply lands in the seat's store.
    expect(alpha.getState().ledger).toEqual(ledger(2));
    expect(useAppStore.getState().ledger).toBeUndefined();
    expect(beta.getState().ledger).toBeUndefined();

    localReply.resolve(ledger(5));
    await localRead;
    // [run-view-168] a read counts against its own core's reads alone:
    // the seat's newer read overtakes nothing at this computer.
    expect(useAppStore.getState().ledger).toEqual(ledger(5));
    expect(alpha.getState().ledger).toEqual(ledger(2));
    expect(beta.getState().ledger).toBeUndefined();
    // Each read went to its own core.
    expect(local.command.mock.calls.filter(([type]) => type === "ledger.get")).toHaveLength(1);
    expect(alphaFake.command.mock.calls.filter(([type]) => type === "ledger.get")).toHaveLength(1);
    expect(betaFake.command).not.toHaveBeenCalled();
  });

  test("a backfill in one store leaves the others untouched", async () => {
    const history = deferred<{ records: { seq: number; record: TmuxPlayRecord }[] }>();
    alphaFake.command.mockImplementation(async (type: string) =>
      type === "history.get" ? history.promise : defaultReply(type),
    );
    const backfill = alpha.getState().loadPastSession(SESSION);
    await vi.waitFor(() =>
      expect(alphaFake.command).toHaveBeenCalledWith("history.get", { sessionId: SESSION, afterSeq: 0 }),
    );
    expect(alphaFake.subscribe).toHaveBeenCalledWith({ kind: "session", sessionId: SESSION });

    // The other seat's live record for a session of the same id folds
    // into that seat's view at once: the backfill buffering records is
    // the first seat's, and takes none of the other's.
    beta.deliver(recordMessage(1, turnStarted(1, "beta's turn")));
    // [run-view-171] the record is the other seat's, folded there.
    expect(beta.getState().views[SESSION]?.lastSeq).toBe(1);
    expect(beta.getState().views[SESSION]?.currentTurnId).toBe(1);
    expect(alpha.getState().views[SESSION]?.loading).toBe(true);
    expect(alpha.getState().views[SESSION]?.lastSeq).toBe(0);

    // The backfilling seat's own live record waits in its own buffer.
    alpha.deliver(recordMessage(3, turnStarted(3, "alpha's third turn")));
    expect(alpha.getState().views[SESSION]?.lastSeq).toBe(0);

    history.resolve({
      records: [
        { seq: 1, record: turnStarted(1, "alpha's turn") },
        { seq: 2, record: turnStarted(2, "alpha's second turn") },
      ],
    });
    await backfill;
    // [run-view-171] the backfill and its buffer reach that seat's view alone.
    const alphaView = alpha.getState().views[SESSION]!;
    expect(alphaView.loading).toBe(false);
    expect(alphaView.lastSeq).toBe(3);
    expect(alphaView.currentTurnId).toBe(3);
    expect(beta.getState().views[SESSION]?.lastSeq).toBe(1);
    expect(beta.getState().views[SESSION]?.currentTurnId).toBe(1);
    expect(useAppStore.getState().views[SESSION]).toBeUndefined();
    expect(betaFake.command).not.toHaveBeenCalled();
    expect(betaFake.subscribe).not.toHaveBeenCalled();
    expect(local.command).not.toHaveBeenCalled();
  });
});

describe("run-view-171: a seat's language state activates no language and writes none", () => {
  test("a seat's choice, its re-read and its own setting stay the seat's", async () => {
    const activate = vi.spyOn(i18n, "activate");
    const localLanguage = useAppStore.getState().language;
    alpha.setState({ connection: "open" });

    alpha.deliver({ type: "language.state", language: "zh" });
    // [run-view-171] no language activates and the page's mirror is
    // never written: the page speaks this computer's home's language.
    expect(activate).not.toHaveBeenCalled();
    expect(i18n.locale).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(writes).not.toContain(LANGUAGE_KEY);
    expect(kept.has(LANGUAGE_KEY)).toBe(false);
    expect(useAppStore.getState().language).toEqual(localLanguage);
    expect(beta.getState().language.choice).toBeNull();
    // The seat's choice is the seat's state, in its own store.
    expect(alpha.getState().language.choice).toBe("zh");

    // [run-view-168] the seat's phrases are re-read from that seat's
    // core alone, as it composed them; no other core is asked.
    await vi.waitFor(() => expect(alphaFake.command).toHaveBeenCalledWith("config.get", {}));
    expect(alphaFake.command).toHaveBeenCalledWith("readiness.get", {});
    expect(alphaFake.command).toHaveBeenCalledWith("project.list", {});
    expect(local.command).not.toHaveBeenCalled();
    expect(betaFake.command).not.toHaveBeenCalled();

    // The seat's own setting is sent to the seat's core alone, and its
    // landing activates and writes nothing here either.
    await alpha.getState().setLanguage(null);
    // [run-view-171] a seat's language writes none here.
    expect(alphaFake.command).toHaveBeenCalledWith("language.set", { language: null });
    expect(local.command).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    expect(writes).not.toContain(LANGUAGE_KEY);
    expect(alpha.getState().language.choice).toBeNull();
    expect(alpha.getState().language.savedAt).toBeTypeOf("number");
  });

  test("the local store alone drives the page's language", () => {
    const activate = vi.spyOn(i18n, "activate");
    deliverServerMessageForTests({ type: "language.state", language: "zh" });
    // [run-view-168] the page's language stays this computer's home's.
    expect(activate).toHaveBeenCalledWith("zh");
    expect(i18n.locale).toBe("zh");
    expect(kept.get(LANGUAGE_KEY)).toBe("zh");
    expect(alpha.getState().language.choice).toBeNull();
    expect(beta.getState().language.choice).toBeNull();

    deliverServerMessageForTests({ type: "language.state", language: null });
    expect(i18n.locale).toBe("en");
    expect(kept.has(LANGUAGE_KEY)).toBe(false);
  });
});

describe("run-view-171: preferences are kept by place and project", () => {
  test("a seat's land under a place-qualified key, the local place's under today's", () => {
    useAppStore.getState().toggleProjectExpanded(PROJECT, true);
    useAppStore.getState().setDashboardGroupCollapsed(PROJECT, true);
    useAppStore.getState().setFrameHeight(`history:${PROJECT}`, 4);
    useAppStore.getState().setCurrentProject(PROJECT);
    alpha.getState().toggleProjectExpanded(PROJECT, false);
    alpha.getState().setFrameHeight(`history:${PROJECT}`, 9);
    alpha.getState().setCurrentProject(PROJECT);

    // [run-view-168] the local place's under today's keys, so an
    // existing home's preferences stand.
    expect(kept.get("spex.expandedProjects")).toBe(JSON.stringify({ [PROJECT]: true }));
    expect(kept.get("spex.dashboardGroupsCollapsed")).toBe(JSON.stringify({ [PROJECT]: true }));
    expect(kept.get(`spex.frame:history:${PROJECT}`)).toBe("4");
    expect(kept.get("spex.currentProject")).toBe(PROJECT);
    // [run-view-168] the seat's by place and project, the project's id
    // as its core sent it.
    expect(placeKey(ALPHA, "spex.expandedProjects")).toBe("spex.expandedProjects@https://spex.pub#41");
    expect(kept.get("spex.expandedProjects@https://spex.pub#41")).toBe(JSON.stringify({ [PROJECT]: false }));
    expect(kept.get(`spex.frame@https://spex.pub#41:history:${PROJECT}`)).toBe("9");
    expect(kept.get("spex.currentProject@https://spex.pub#41")).toBe(PROJECT);
    // [run-view-171] nothing written at one place reaches another.
    expect(kept.has("spex.dashboardGroupsCollapsed@https://spex.pub#41")).toBe(false);
    expect([...kept.keys()].some((key) => key.includes(BETA.key))).toBe(false);
    expect(useAppStore.getState().expandedProjects).toEqual({ [PROJECT]: true });
    expect(alpha.getState().expandedProjects).toEqual({ [PROJECT]: false });
    expect(beta.getState().expandedProjects).toEqual({});
    expect(alpha.getState().dashboardGroupsCollapsed).toEqual({});

    // A store made again at each place reads its own preferences back.
    const localAgain = createAppStore(LOCAL_PLACE);
    const alphaAgain = createAppStore(ALPHA);
    const betaAgain = createAppStore(BETA);
    // [run-view-168] today's keys at this computer; the place's own at a seat.
    expect(localAgain.getState().expandedProjects).toEqual({ [PROJECT]: true });
    expect(localAgain.getState().dashboardGroupsCollapsed).toEqual({ [PROJECT]: true });
    expect(localAgain.getState().frameHeights).toEqual({ [`history:${PROJECT}`]: 4 });
    expect(alphaAgain.getState().expandedProjects).toEqual({ [PROJECT]: false });
    expect(alphaAgain.getState().dashboardGroupsCollapsed).toEqual({});
    expect(alphaAgain.getState().frameHeights).toEqual({ [`history:${PROJECT}`]: 9 });
    expect(betaAgain.getState().expandedProjects).toEqual({});
    expect(betaAgain.getState().frameHeights).toEqual({});
  });
});
