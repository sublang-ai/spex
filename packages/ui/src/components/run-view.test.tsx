// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-19/20/21 component coverage: the run view rendered from the
// fixture stream shows the expected panes and never hidden content.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen,
  within,
} from "@testing-library/react";

afterEach(cleanup);

import { RunView } from "./RunView.js";
import { applyRecords, initialSessionView } from "../state/reducer.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import type {
  DerivedIntent,
  IntentInfo,
  LedgerState,
} from "@sublang/spex-core/protocol";
import {
  FULL_RUN,
  HIDDEN_LEAK,
  INITIAL_VISIBLE,
  PLAYERS,
  TURN_ONE,
  TURN_TWO_QUESTION,
} from "../fixtures/sample-run.js";
import type {
  SessionInfo,
  TmuxPlayRecord,
} from "@sublang/spex-core/protocol";
import {
  MACHINE_ORPHAN,
  MACHINE_RUN,
  MACHINE_STOPPED,
} from "../fixtures/sample-run.js";

const SESSION: SessionInfo = {
  id: "s1",
  projectId: "p1",
  projectPath: "/tmp/demo",
  createdAt: 0,
  live: true,
  endedAt: null,
  players: PLAYERS,
  initialVisible: INITIAL_VISIBLE,
  turns: 0,
  failed: false,
};

function renderRun(entries: typeof FULL_RUN) {
  const view = applyRecords(
    initialSessionView(PLAYERS),
    entries,
  );
  return render(
    <RunView
      session={SESSION}
      view={view}
      composer={{ queued: [] }}
      connected
      onSubmit={async () => {}}
      onAbort={() => {}}
      onRemoveQueued={() => {}}
      onDismissError={() => {}}
    />,
  );
}

describe("RUN-30: boss messages echo as user bubbles", () => {
  test("the submitted turn text renders as a boss bubble", () => {
    renderRun(TURN_ONE);
    const bubble = screen.getByTestId("boss-bubble");
    expect(bubble.textContent).toContain("/code fix the bug");
  });
});

describe("RUN-19: pane structure from the fixture stream", () => {
  test("captain pane and both player panes render with content", () => {
    renderRun(TURN_ONE);
    expect(screen.getByTestId("captain-pane")).toBeTruthy();
    expect(screen.getByTestId("player-pane-dev.coder")).toBeTruthy();
    expect(screen.getByTestId("player-pane-dev.reviewer")).toBeTruthy();
    expect(screen.getByText("◇ /code started")).toBeTruthy();
    // Markdown rendered: **auth** becomes a <strong>.
    expect(screen.getByText("auth").tagName).toBe("STRONG");
    // A collapsed tool card says the tool and what it acts on; an
    // input naming nothing recognizable stays the name alone.
    expect(screen.getByText("Edit", { exact: false })).toBeTruthy();
    expect(screen.getByText("src/auth.ts")).toBeTruthy();
    const todo = screen.getByText("TodoWrite").closest("summary");
    expect(todo?.querySelector('[data-testid^="tool-subject-"]')).toBeNull();
    // Only what the shell can open wears a link's affordance.
    expect(screen.getByText("the SDK docs").tagName).toBe("A");
    expect(screen.getByText("auth.md").tagName).toBe("SPAN");
    expect(screen.getByText("auth.md").title).toBe(
      "specs/packages/auth.md#auth-3",
    );
  });

  test("a narrowing visibility record takes no pane away", () => {
    // What a nested call does when it returns: the runtime reports
    // only the players it still engages. The lanes are the session's,
    // so both panes stand (run-view-7).
    renderRun([
      ...TURN_ONE,
      {
        seq: 99,
        record: {
          type: "player_view_changed",
          turnId: 1,
          timestamp: Date.now(),
          visiblePlayerIds: ["dev.coder"],
        },
      } as (typeof TURN_ONE)[number],
    ]);
    expect(screen.getByTestId("player-pane-dev.coder")).toBeTruthy();
    expect(screen.getByTestId("player-pane-dev.reviewer")).toBeTruthy();
  });
});

describe("RUN-20: hidden records never appear", () => {
  test("hidden captain prompt content is absent from the DOM", () => {
    const { container } = renderRun([...TURN_ONE, ...HIDDEN_LEAK]);
    expect(container.textContent).not.toContain("secret router prompt");
  });
});

describe("RUN-21: awaitBossReply as a first-class chat moment", () => {
  test("the question renders as an incoming bubble from the player", () => {
    renderRun([...TURN_ONE, ...TURN_TWO_QUESTION]);
    const bubble = screen.getByTestId("question-bubble");
    expect(bubble.textContent).toContain("dev.reviewer");
    expect(bubble.textContent).toContain(
      "Which auth flow should I prioritize?",
    );
    // The runtime's status-line echo of the same question is replaced
    // by the bubble, not duplicated.
    expect(
      screen.queryByText(/asks: Which auth flow/, { exact: false }),
    ).toBeNull();
  });

  test("the banner names the player without repeating the question", () => {
    renderRun([...TURN_ONE, ...TURN_TWO_QUESTION]);
    const banner = screen.getByTestId("boss-reply-banner");
    expect(banner.textContent).toContain(
      "dev.reviewer is waiting for your reply",
    );
  });

  test("banner clears after the reply turn", () => {
    renderRun(FULL_RUN);
    expect(screen.queryByTestId("boss-reply-banner")).toBeNull();
  });
});

const TURN_ONLY_STARTED = [
  {
    seq: 1,
    record: {
      type: "turn_started",
      turnId: 9,
      timestamp: 1,
      turn: { id: 9, prompt: "go", timestamp: 1 },
    } as unknown as TmuxPlayRecord,
  },
];

describe("RUN-37: the thread stays alive while a turn runs", () => {
  test("a working indicator shows when the captain is silent", () => {
    renderRun(TURN_ONLY_STARTED);
    expect(screen.getByTestId("working-indicator").textContent).toContain(
      "Captain is thinking…",
    );
  });
});

describe("RUN-38: queued messages read as pending, not sent", () => {
  test("queue entries render full text with the delivery caption", () => {
    const view = applyRecords(
      initialSessionView(PLAYERS),
      TURN_ONLY_STARTED,
    );
    render(
      <RunView
        session={SESSION}
        view={view}
        composer={{ queued: [{ text: "also update the changelog please" }] }}
        connected
        onSubmit={async () => {}}
        onAbort={() => {}}
        onRemoveQueued={() => {}}
        onDismissError={() => {}}
      />,
    );
    const queue = screen.getByTestId("queue-indicator");
    expect(queue.textContent).toContain("also update the changelog please");
    expect(queue.textContent).toContain("sends when this turn ends");
  });
});

describe("RUN-39: drafts come from the store", () => {
  test("the composer renders the stored draft and reports edits", () => {
    const view = applyRecords(
      initialSessionView(PLAYERS),
      TURN_ONE,
    );
    const onDraftChange = vi.fn();
    render(
      <RunView
        session={SESSION}
        view={view}
        composer={{ queued: [], draft: "half-typed reply" }}
        connected
        onDraftChange={onDraftChange}
        onSubmit={async () => {}}
        onAbort={() => {}}
        onRemoveQueued={() => {}}
        onDismissError={() => {}}
      />,
    );
    const composer = screen.getByTestId(
      "boss-composer",
    ) as HTMLTextAreaElement;
    expect(composer.value).toBe("half-typed reply");
    fireEvent.change(composer, { target: { value: "half-typed reply!" } });
    expect(onDraftChange).toHaveBeenCalledWith("half-typed reply!");
  });
});

describe("RUN-40: abort acknowledges instantly", () => {
  test("clicking Abort disables it and relabels to Aborting…", () => {
    renderRun(TURN_ONLY_STARTED);
    const abort = screen.getByTestId("abort-button") as HTMLButtonElement;
    fireEvent.click(abort);
    expect(abort.disabled).toBe(true);
    expect(abort.textContent).toContain("Aborting…");
  });
});

describe("RUN-36: ended sessions render read-only", () => {
  test("readOnly hides the composer and shows the ended notice", () => {
    const view = applyRecords(
      initialSessionView(PLAYERS),
      TURN_ONE,
    );
    render(
      <RunView
        session={{ ...SESSION, live: false, endedAt: 5 }}
        view={view}
        composer={{ queued: [] }}
        connected
        readOnly
        onStartNew={() => {}}
        onSubmit={async () => {}}
        onAbort={() => {}}
        onRemoveQueued={() => {}}
        onDismissError={() => {}}
      />,
    );
    expect(screen.getByTestId("ended-notice").textContent).toContain(
      "read-only",
    );
    expect(screen.queryByTestId("boss-composer")).toBeNull();
    expect(screen.getByText("Start a new session")).toBeTruthy();
  });
});

// run-view-66: the machine call tree over a fixture replay (DR-031).
describe("run-view-66: the machine call tree from the trace", () => {
  test("a running child nests under its caller, which folds to a strip", () => {
    // Replay to the review's first transition: /code is delegating,
    // /review is the running leaf.
    renderRun(MACHINE_RUN.slice(0, 13));
    const live = screen.getByTestId("live-machines");
    const cards = within(live).getAllByTestId(/^machine-card-/);
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute("data-playbook")).toBe("code");
    expect(cards[1].getAttribute("data-playbook")).toBe("review");

    // A caption longer than its box is trimmed rather than spilling
    // over the border, and the box's title keeps it whole (run-view-63).
    const captions = [...cards[1].querySelectorAll("text")].map(
      (node) => node.textContent ?? "",
    );
    expect(
      captions.every((text) => text.length <= 24),
      `a caption overflowed its box: ${captions.join(" | ")}`,
    ).toBe(true);

    // A drawing wider than its column scrolls, and the column masks
    // its edge so the cut reads as "more this way" (run-view-81).
    const scroller = within(live).getAllByTestId(/^machine-scroll-/)[0];
    expect(scroller.className).toContain("overflow-x-auto");
    expect(scroller.className).toContain("mask-image");

    // The caller is the ancestor: a strip that still names the calling
    // state and the callee, so the containment survives the fold.
    expect(cards[0].getAttribute("data-expanded")).toBe("false");
    expect(cards[0].getAttribute("aria-label")).toContain("review first commit");
    expect(cards[0].getAttribute("aria-label")).toContain("/review");
    expect(
      within(live).getByTestId("machine-connector-t-code"),
    ).toBeTruthy();

    // The running leaf is what is drawn, and its header names the
    // state that called it.
    expect(cards[1].getAttribute("data-expanded")).toBe("true");
    expect(cards[1].getAttribute("data-caller-state")).toBe("reviewFirstCommit");
    const active = within(cards[1]).getByTestId(
      "machine-state-t-review-reviewing",
    );
    expect(active.getAttribute("data-active")).toBe("true");

    // The running mark is the app's one pulse, and it says so.
    const mark = within(cards[1]).getByTestId("machine-running-t-review");
    expect(mark.getAttribute("data-running")).toBe("true");
    expect(mark.className).toContain("motion-safe:animate-pulse");

    // The card absorbs the run's progress while ◇ engagement lines
    // stay — including the bare event ids the runtime narrates with
    // no glyph, which used to reach the reader as raw jargon.
    expect(screen.getByText("◇ /code started")).toBeTruthy();
    expect(screen.queryByText(/⤷ Coder: implement/)).toBeNull();
    expect(screen.queryByText("START_CODE")).toBeNull();
    expect(screen.queryByText("→ directCommit")).toBeNull();
  });

  test("expanding the caller is arrangement, and shows both drawings", () => {
    renderRun(MACHINE_RUN.slice(0, 13));
    const before = screen
      .getAllByTestId(/^machine-card-/)
      .map((card) => card.getAttribute("data-playbook"));

    fireEvent.click(screen.getByTestId("machine-disclose-t-code"));

    const cards = screen.getAllByTestId(/^machine-card-/);
    expect(cards[0].getAttribute("data-expanded")).toBe("true");
    // The delegating state wears the call voice and names its callee.
    const delegating = within(cards[0]).getByTestId(
      "machine-state-t-code-reviewFirstCommit",
    );
    expect(delegating.getAttribute("data-delegating")).toBe("true");
    expect(within(delegating).getByText("call /review")).toBeTruthy();
    // The child is untouched: the same tree, differently disclosed.
    expect(cards.map((card) => card.getAttribute("data-playbook"))).toEqual(
      before,
    );
    expect(cards[1].getAttribute("data-expanded")).toBe("true");
  });

  test("one card per run: the reports that trail a finish revive none", () => {
    renderRun(MACHINE_RUN);
    // Nothing left running, and the root settled into the thread with
    // its child settled inside it — not two loose cards.
    expect(screen.queryByTestId("live-machines")).toBeNull();
    const settled = screen.getAllByTestId(/^machine-card-/);
    expect(settled).toHaveLength(2);
    expect(settled[0].getAttribute("data-playbook")).toBe("code");
    expect(settled[1].getAttribute("data-playbook")).toBe("review");
    for (const card of settled) {
      expect(card.getAttribute("data-settled")).toBe("true");
    }
    // The status, settlement and disposal that follow a finished run
    // used to raise a blank second card labelled "stopped".
    expect(screen.getByTestId("machine-outcome-t-code").textContent).toBe(
      "done",
    );
    expect(screen.getByTestId("machine-outcome-t-review").textContent).toBe(
      "done",
    );
    // The settled child stays anchored to the state that called it.
    expect(settled[1].getAttribute("data-caller-state")).toBe(
      "reviewFirstCommit",
    );
  });

  test("a settled strip expands to its final drawing", () => {
    renderRun(MACHINE_RUN);
    const card = screen.getByTestId("machine-card-t-code");
    expect(card.getAttribute("data-expanded")).toBe("false");
    fireEvent.click(screen.getByTestId("machine-disclose-t-code"));
    expect(
      within(card).getByTestId("machine-state-t-code-done"),
    ).toBeTruthy();
  });

  test("a run disposed where it stands settles unfinished", () => {
    renderRun(MACHINE_STOPPED);
    expect(screen.getAllByTestId(/^machine-card-/)).toHaveLength(1);
    expect(screen.getByTestId("machine-outcome-t-halt").textContent).toBe(
      "stopped",
    );
  });

  test("a child whose caller is unknown draws at the top level", () => {
    renderRun(MACHINE_ORPHAN);
    const live = screen.getByTestId("live-machines");
    const cards = within(live).getAllByTestId(/^machine-card-/);
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-playbook")).toBe("review");
  });
});


// ---------------------------------------------------------------------------
// Intent ledger coverage (run-view-92..96, DR-035): the composer's
// queue-instead capture, the staged chip, the delivery card with
// confirm-pulls-next, and attention activation landing at the
// intent's place.
// ---------------------------------------------------------------------------

function makeIntent(over: Partial<IntentInfo> & { id: string }): IntentInfo {
  return {
    projectId: "p1",
    text: "Address #7: fix the login bug\nfull context for the run",
    rank: "m",
    createdAt: 0,
    ...over,
  };
}

const EMPTY_LEDGER: LedgerState = { intents: [], attention: [], badge: 0 };

/** The turn-1 intent, finished and awaiting its verdict. */
const FINISHED: DerivedIntent = {
  intent: makeIntent({
    id: "i1",
    source: {
      kind: "issue",
      ref: "7",
      url: "https://github.com/acme/demo/issues/7",
    },
    dispatched: { sessionId: "s1", turnId: 1, at: 1000 },
  }),
  state: "finished",
  stats: { reviewRounds: 2, turns: 1, elapsedMs: 12 * 60_000 },
};

const QUEUED_NEXT: DerivedIntent = {
  intent: makeIntent({ id: "i2", text: "Review PR 45: tighten the docs" }),
  state: "queued",
};

function seedLedger(ledger: LedgerState): void {
  useAppStore.setState({ ledger });
}

function renderRunWith(
  entries: typeof FULL_RUN,
  over: Partial<Parameters<typeof RunView>[0]> = {},
) {
  const view = applyRecords(initialSessionView(PLAYERS), entries);
  return render(
    <RunView
      session={SESSION}
      view={view}
      composer={{ queued: [] }}
      connected
      onSubmit={async () => {}}
      onAbort={() => {}}
      onRemoveQueued={() => {}}
      onDismissError={() => {}}
      {...over}
    />,
  );
}

describe("run-view-92: queue instead of send captures a chat intent", () => {
  const command = vi.fn();

  beforeEach(() => {
    command.mockReset();
    command.mockImplementation(async (type: string) => {
      if (type === "intent.queue") return makeIntent({ id: "chat-1" });
      if (type === "ledger.get") return EMPTY_LEDGER;
      return {};
    });
    setClientForTests({ command } as never);
  });

  afterEach(() => {
    useAppStore.setState({ ledger: undefined, stagedIntents: {} });
    setClientForTests(undefined);
  });

  test("the typed text queues with chat provenance, nothing sends", async () => {
    const onSubmit = vi.fn(async () => {});
    renderRunWith(TURN_ONE, { onSubmit });

    fireEvent.change(screen.getByTestId("boss-composer"), {
      target: { value: "also fix the logout flow later" },
    });
    fireEvent.click(screen.getByTestId("queue-intent-button"));

    await vi.waitFor(() =>
      expect(command).toHaveBeenCalledWith("intent.queue", {
        projectId: "p1",
        text: "also fix the logout flow later",
        source: { kind: "chat", ref: "s1" },
      }),
    );
    // Shelved, not sent (run-view-85): no dispatch, no queued bubble.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalledWith(
      "turn.submit",
      expect.anything(),
    );
    expect(screen.queryByTestId("queue-indicator")).toBeNull();
    // The inline acknowledgment names where the row landed.
    await vi.waitFor(() =>
      expect(
        screen.getByTestId("queued-intent-note").textContent,
      ).toContain("Up next"),
    );
    // The draft cleared: the text lives in the queue now.
    expect(
      (screen.getByTestId("boss-composer") as HTMLTextAreaElement).value,
    ).toBe("");
  });
});

describe("run-view-93: the staged chip governs what a send stamps", () => {
  afterEach(() => {
    useAppStore.setState({ ledger: undefined, stagedIntents: {} });
    setClientForTests(undefined);
  });

  test("the composer wears the staged chip; emptying detaches it", () => {
    useAppStore.setState({
      stagedIntents: {
        s1: { intentId: "i1", title: "Address #7: fix the login bug" },
      },
    });
    renderRunWith(TURN_ONE);
    const chip = screen.getByTestId("staged-intent-chip");
    expect(chip.textContent).toContain("Address #7: fix the login bug");

    const composer = screen.getByTestId("boss-composer");
    fireEvent.change(composer, { target: { value: "extra context" } });
    expect(screen.getByTestId("staged-intent-chip")).toBeTruthy();
    fireEvent.change(composer, { target: { value: "" } });
    // Emptying the composer detaches the intent (run-view-86): the
    // chip leaves and the store drops the staging.
    expect(useAppStore.getState().stagedIntents.s1).toBeUndefined();
    expect(screen.queryByTestId("staged-intent-chip")).toBeNull();
  });

  test("a queued submission carries the chip on its pending bubble", () => {
    const view = applyRecords(initialSessionView(PLAYERS), [
      {
        seq: 1,
        record: {
          type: "turn_started",
          turnId: 9,
          timestamp: 1,
          turn: { id: 9, prompt: "go", timestamp: 1 },
        },
      } as (typeof TURN_ONE)[number],
    ]);
    render(
      <RunView
        session={SESSION}
        view={view}
        composer={{ queued: [{ text: "start the next one", intentId: "i1" }] }}
        connected
        onSubmit={async () => {}}
        onAbort={() => {}}
        onRemoveQueued={() => {}}
        onDismissError={() => {}}
      />,
    );
    const queue = screen.getByTestId("queue-indicator");
    expect(within(queue).getByTestId("queued-intent-chip")).toBeTruthy();
    expect(queue.textContent).toContain("sends when this turn ends");
  });
});

describe("run-view-90/89: the working line and the bound turn's chip", () => {
  afterEach(() => {
    useAppStore.setState({ ledger: undefined, stagedIntents: {} });
  });

  test("an open dispatched intent names itself above the composer", () => {
    seedLedger({
      intents: [
        {
          intent: makeIntent({
            id: "i1",
            dispatched: { sessionId: "s1", turnId: 9, at: 1 },
          }),
          state: "working",
        },
      ],
      attention: [],
      badge: 0,
    });
    renderRunWith(TURN_ONLY_STARTED as typeof FULL_RUN);
    const line = screen.getByTestId("working-line");
    expect(line.textContent).toContain("Working:");
    expect(line.textContent).toContain("Address #7: fix the login bug");
    // Hover is never the only channel, but the raw text rides along.
    expect(line.title).toContain("full context for the run");
  });

  test("the newest open intent owns the line; the bubble wears the chip", () => {
    seedLedger({
      intents: [
        {
          intent: makeIntent({
            id: "i-old",
            text: "the older intent",
            dispatched: { sessionId: "s1", turnId: 1, at: 1 },
          }),
          state: "interrupted",
          reason: "question",
        },
        {
          intent: makeIntent({
            id: "i-new",
            text: "the newest intent",
            source: { kind: "chat", ref: "s1" },
            dispatched: { sessionId: "s1", turnId: 2, at: 2 },
          }),
          state: "working",
        },
      ],
      attention: [],
      badge: 0,
    });
    renderRunWith([...TURN_ONE, ...TURN_TWO_QUESTION]);
    expect(screen.getByTestId("working-line").textContent).toContain(
      "the newest intent",
    );
    // The bound turn's Boss bubble wears the source chip (run-view-89);
    // an unsourced intent's bubble wears none.
    const bubbles = screen.getAllByTestId("boss-bubble");
    expect(within(bubbles[1]).getByTestId("intent-source-chip").textContent)
      .toBe("chat");
    expect(within(bubbles[0]).queryByTestId("intent-source-chip")).toBeNull();
  });
});

describe("run-view-94/87: the delivery card and confirm-pulls-next", () => {
  const command = vi.fn();
  let servedLedger: LedgerState;

  beforeEach(() => {
    servedLedger = { intents: [FINISHED, QUEUED_NEXT], attention: [], badge: 1 };
    command.mockReset();
    command.mockImplementation(async (type: string) => {
      if (type === "ledger.get") return servedLedger;
      if (type === "intent.queue") return makeIntent({ id: "i3" });
      return {};
    });
    setClientForTests({ command, subscribe: vi.fn(async () => {}) } as never);
    useAppStore.setState({
      ledger: { intents: [FINISHED, QUEUED_NEXT], attention: [], badge: 1 },
      sessions: [],
      stagedIntents: {},
    });
  });

  afterEach(() => {
    useAppStore.setState({
      ledger: undefined,
      stagedIntents: {},
      sessions: [],
      homeDraft: "",
    });
    setClientForTests(undefined);
  });

  test("the bound bubble wears the source chip as a canonical link", () => {
    renderRunWith(TURN_ONE);
    const bubble = screen.getByTestId("boss-bubble");
    const chip = within(bubble).getByTestId("intent-source-chip");
    expect(chip.textContent).toBe("#7");
    expect(chip.tagName).toBe("A");
    expect(chip.getAttribute("href")).toBe(
      "https://github.com/acme/demo/issues/7",
    );
    // Raw provenance lives in the tooltip (DR-010 §2).
    expect(chip.getAttribute("title")).toContain("issue 7");
  });

  test("the card carries title, chip, stats, verdicts, and the note", () => {
    renderRunWith(TURN_ONE);
    const card = screen.getByTestId("delivery-card-i1");
    expect(card.getAttribute("data-settled")).toBe("0");
    expect(card.textContent).toContain("Address #7: fix the login bug");
    expect(within(card).getByTestId("intent-source-chip").textContent).toBe(
      "#7",
    );
    // Review rounds foremost, then turns, then elapsed (run-view-87).
    expect(within(card).getByTestId("delivery-stats").textContent).toBe(
      "2 review rounds · 1 turn · 12m",
    );
    expect(within(card).getByTestId("delivery-confirm").textContent).toBe(
      "Confirm",
    );
    expect(within(card).getByTestId("delivery-drop").textContent).toBe(
      "Drop",
    );
    expect(card.textContent).toContain(
      "A follow-up message continues this intent.",
    );
  });

  test("a verdict closes over the protocol and resolves into Up next", async () => {
    renderRunWith(TURN_ONE);
    // The verdict re-derives the fold without the closed intent.
    servedLedger = { intents: [QUEUED_NEXT], attention: [], badge: 0 };

    const confirm = screen.getByTestId(
      "delivery-confirm",
    ) as HTMLButtonElement;
    fireEvent.click(confirm);
    // The action acknowledges in place (DR-010): busy until it lands.
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toContain("Confirming…");

    await vi.waitFor(() =>
      expect(command).toHaveBeenCalledWith("intent.close", {
        intentId: "i1",
        as: "done",
      }),
    );
    // The card resolves in place into the project's next queued
    // unblocked intent with Start (run-view-87).
    await vi.waitFor(() => {
      const card = screen.getByTestId("delivery-card-i1");
      expect(card.getAttribute("data-settled")).toBe("1");
      expect(card.textContent).toContain("Review PR 45: tighten the docs");
    });

    // Start stages the dispatch — no live session here, so it stages
    // the Captain home (run-view-86).
    fireEvent.click(screen.getByTestId("upnext-start"));
    await vi.waitFor(() => {
      expect(useAppStore.getState().stagedIntents.home?.intentId).toBe("i2");
      expect(useAppStore.getState().homeDraft).toBe(
        "Review PR 45: tighten the docs",
      );
    });
  });

  test("an empty queue resolves into the inline add affordance", async () => {
    useAppStore.setState({
      ledger: { intents: [FINISHED], attention: [], badge: 1 },
    });
    servedLedger = EMPTY_LEDGER;
    renderRunWith(TURN_ONE);

    fireEvent.click(screen.getByTestId("delivery-drop"));
    await vi.waitFor(() =>
      expect(command).toHaveBeenCalledWith("intent.close", {
        intentId: "i1",
        as: "dropped",
      }),
    );
    const input = await vi.waitFor(() =>
      screen.getByTestId("upnext-add-input"),
    );
    fireEvent.change(input, { target: { value: "polish the changelog" } });
    fireEvent.click(screen.getByTestId("upnext-add"));
    await vi.waitFor(() =>
      expect(command).toHaveBeenCalledWith("intent.queue", {
        projectId: "p1",
        text: "polish the changelog",
      }),
    );
  });

  test("an ended session's replay renders the card inert", () => {
    renderRunWith(TURN_ONE, {
      session: { ...SESSION, live: false, endedAt: 5 },
      readOnly: true,
      onStartNew: () => {},
    });
    const card = screen.getByTestId("delivery-card-i1");
    expect(card.textContent).toContain("Address #7: fix the login bug");
    expect(
      (within(card).getByTestId("delivery-confirm") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(card).getByTestId("delivery-drop") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // And an ended lane shows no working line.
    expect(screen.queryByTestId("working-line")).toBeNull();
  });
});

describe("run-view-96/91: attention activation lands at the place", () => {
  afterEach(() => {
    useAppStore.setState({ ledger: undefined, stagedIntents: {} });
  });

  test("a pending question focuses the question bubble", () => {
    const onFocusHandled = vi.fn();
    renderRunWith([...TURN_ONE, ...TURN_TWO_QUESTION], {
      focusTurn: 2,
      onFocusHandled,
    });
    const wrapper = screen
      .getByTestId("question-bubble")
      .closest("[data-focus-key]");
    expect(wrapper?.getAttribute("data-focused")).toBe("1");
    expect(onFocusHandled).toHaveBeenCalled();
  });

  test("an unacknowledged failure focuses the failure line", () => {
    const TURN_FAILED = [
      {
        seq: 1,
        record: {
          type: "turn_started",
          turnId: 5,
          timestamp: 1,
          turn: { id: 5, prompt: "go", timestamp: 1 },
        },
      },
      {
        seq: 2,
        record: {
          type: "runtime_error",
          turnId: 5,
          timestamp: 2,
          message: "the coder crashed",
        },
      },
      {
        seq: 3,
        record: { type: "turn_finished", turnId: 5, timestamp: 3 },
      },
    ] as typeof FULL_RUN;
    renderRunWith(TURN_FAILED, { focusTurn: 5 });
    const wrapper = screen
      .getByText("the coder crashed")
      .closest("[data-focus-key]");
    expect(wrapper?.getAttribute("data-focused")).toBe("1");
  });

  test("a finish awaiting its verdict focuses the delivery card", async () => {
    useAppStore.setState({
      ledger: { intents: [FINISHED], attention: [], badge: 1 },
    });
    const onFocusHandled = vi.fn();
    const { container } = renderRunWith(TURN_ONE, {
      focusTurn: 1,
      onFocusHandled,
    });
    await vi.waitFor(() => {
      const wrapper = container.querySelector('[data-focus-key="card-i1"]');
      expect(wrapper?.getAttribute("data-focused")).toBe("1");
    });
    expect(onFocusHandled).toHaveBeenCalled();
  });
});
