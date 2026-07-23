import { setup, assign, fromPromise } from 'xstate';

// Actor input/output contracts the linker must provide.

export interface PendingBossQuestion {
  questionId: string;
  resumeStateId: string;
  sourceItem: string;
  player: string;
  question: string;
}

interface NormalizedError {
  name: string;
  message: string;
  stack?: string;
}

export interface PlayerInput {
  stateId: string;
  player: string;
  sourceItem: string;
  prompt: string;
  result: Record<string, string>;
  pendingBossQuestion?: PendingBossQuestion;
  bossReply?: string;
  task?: string;
  findings?: string;
  judgment?: string;
  conclusion?: string;
}

export type PlayerOutput =
  | { guard: 'done' }
  | { guard: 'findings'; findings: string }
  | { guard: 'clean' }
  | { guard: 'agreed'; conclusion: string }
  | { guard: 'disagreed'; judgment: string; conclusion: string }
  | { guard: 'needsBossReply'; question: string };

export interface ScriptInput {
  stateId: string;
  sourceItem: string;
  command: string;
  result: Record<string, string>;
}

export type ScriptOutput =
  | { guard: 'ok'; exitStatus: number }
  | { guard: 'failed'; exitStatus: number };

export interface WorkflowInput {
  task?: string;
}

interface WorkflowContext {
  task: string;
  findings: string;
  judgment: string;
  conclusion: string;
  judgeCount: number;
  loopCount: number;
  lastError?: NormalizedError;
  pendingBossQuestion?: PendingBossQuestion;
  bossReply?: string;
}

type WorkflowEvent =
  | { type: 'START'; task: string }
  | { type: 'BOSS_REPLY'; answer: string; questionId?: string };

// Fixed descriptions.

const DONE_DESCRIPTION = 'The acting agent completed the behavior.';

const STD_NEEDS_BOSS_REPLY =
  "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";

// Structural narrowing helpers: invoked-actor output may reach shared guards
// and actions as unknown, so narrow to the declared contract before reading.

function playerOutputOf(event: unknown): PlayerOutput | undefined {
  const output = (event as { output?: unknown }).output;
  if (
    typeof output === 'object' &&
    output !== null &&
    'guard' in output &&
    typeof (output as { guard: unknown }).guard === 'string'
  ) {
    return output as PlayerOutput;
  }
  return undefined;
}

function guardOf(event: unknown): string {
  return playerOutputOf(event)?.guard ?? '';
}

function findingsOf(event: unknown): string {
  const output = playerOutputOf(event);
  return output?.guard === 'findings' ? output.findings : '';
}

function judgmentOf(event: unknown): string {
  const output = playerOutputOf(event);
  return output?.guard === 'disagreed' ? output.judgment : '';
}

function conclusionOf(event: unknown): string {
  const output = playerOutputOf(event);
  return output?.guard === 'agreed' || output?.guard === 'disagreed'
    ? output.conclusion
    : '';
}

function questionOf(event: unknown): string {
  const output = playerOutputOf(event);
  return output?.guard === 'needsBossReply' ? output.question : '';
}

function scriptGuardOf(event: unknown): string {
  const output = (event as { output?: unknown }).output;
  if (
    typeof output === 'object' &&
    output !== null &&
    'guard' in output &&
    typeof (output as { guard: unknown }).guard === 'string'
  ) {
    return (output as ScriptOutput).guard;
  }
  return '';
}

function normalizeError(event: unknown): NormalizedError {
  const error = (event as { error?: unknown }).error;
  if (error instanceof Error) {
    const normalized: NormalizedError = {
      name: error.name,
      message: error.message,
    };
    if (typeof error.stack === 'string') {
      normalized.stack = error.stack;
    }
    return normalized;
  }
  return { name: 'Error', message: String(error) };
}

function buildPending(
  resumeStateId: string,
  sourceItem: string,
  player: string,
  event: unknown,
): PendingBossQuestion {
  return {
    questionId: resumeStateId,
    resumeStateId,
    sourceItem,
    player,
    question: questionOf(event),
  };
}

// Carry the pending question and reply for the working leaf, omitting absent
// optional members so actor input stays JSON-safe.
function bossReplyFields(context: WorkflowContext): {
  pendingBossQuestion?: PendingBossQuestion;
  bossReply?: string;
} {
  const fields: {
    pendingBossQuestion?: PendingBossQuestion;
    bossReply?: string;
  } = {};
  if (context.pendingBossQuestion !== undefined) {
    fields.pendingBossQuestion = context.pendingBossQuestion;
  }
  if (context.bossReply !== undefined) {
    fields.bossReply = context.bossReply;
  }
  return fields;
}

// One guarded BOSS_REPLY arm per resumable working leaf.
function resumableStates(ids: readonly string[]) {
  return ids.map((id) => ({
    guard: { type: 'isResumeTarget' as const, params: { id } },
    target: `#${id}`,
    actions: 'applyBossReply' as const,
    reenter: true as const,
  }));
}

export const workflowMachine = setup({
  types: {
    context: {} as WorkflowContext,
    events: {} as WorkflowEvent,
    input: {} as WorkflowInput,
  },
  actors: {
    script: fromPromise<ScriptOutput, ScriptInput>(async () => {
      throw new Error('script actor must be provided by the runner');
    }),
    player: fromPromise<PlayerOutput, PlayerInput>(async () => {
      throw new Error('player actor must be provided by the runner');
    }),
  },
  guards: {
    scriptOk: ({ event }) => scriptGuardOf(event) === 'ok',
    scriptFailed: ({ event }) => scriptGuardOf(event) === 'failed',
    isDone: ({ event }) => guardOf(event) === 'done',
    isFindings: ({ event }) => guardOf(event) === 'findings',
    isClean: ({ event }) => guardOf(event) === 'clean',
    needsBossReply: ({ event }) =>
      guardOf(event) === 'needsBossReply' && questionOf(event).length > 0,
    needsBossReplyNoQuestion: ({ event }) =>
      guardOf(event) === 'needsBossReply' && questionOf(event).length === 0,
    agreedCanLoop: ({ context, event }) =>
      guardOf(event) === 'agreed' && context.loopCount < 2,
    agreedNoLoop: ({ context, event }) =>
      guardOf(event) === 'agreed' && context.loopCount >= 2,
    disagreedCanArgue: ({ context, event }) =>
      guardOf(event) === 'disagreed' && context.judgeCount < 2,
    disagreedStopCanLoop: ({ context, event }) =>
      guardOf(event) === 'disagreed' &&
      context.judgeCount >= 2 &&
      context.loopCount < 2,
    disagreedStopNoLoop: ({ context, event }) =>
      guardOf(event) === 'disagreed' &&
      context.judgeCount >= 2 &&
      context.loopCount >= 2,
    bossReplyEmpty: ({ event }) => {
      const reply = event as { answer?: unknown };
      return (
        typeof reply.answer !== 'string' || reply.answer.trim().length === 0
      );
    },
    isResumeTarget: ({ context }, params: { id: string }) =>
      context.pendingBossQuestion?.resumeStateId === params.id,
  },
  actions: {
    assignTask: assign(({ event }) => {
      if (event.type !== 'START') {
        return {};
      }
      return {
        task: event.task,
        findings: '',
        judgment: '',
        conclusion: '',
        judgeCount: 0,
        loopCount: 0,
        lastError: undefined,
        pendingBossQuestion: undefined,
        bossReply: undefined,
      };
    }),
    applyBossReply: assign(({ event }) => {
      if (event.type !== 'BOSS_REPLY') {
        return {};
      }
      return { bossReply: event.answer };
    }),
    clearBossReplyContext: assign({
      pendingBossQuestion: () => undefined,
      bossReply: () => undefined,
    }),
    assignFindings: assign({ findings: ({ event }) => findingsOf(event) }),
    assignConclusion: assign({
      conclusion: ({ event }) => conclusionOf(event),
    }),
    assignJudgmentAndConclusion: assign({
      judgment: ({ event }) => judgmentOf(event),
      conclusion: ({ event }) => conclusionOf(event),
    }),
    incJudge: assign({ judgeCount: ({ context }) => context.judgeCount + 1 }),
    incLoop: assign({ loopCount: ({ context }) => context.loopCount + 1 }),
    rememberError: assign({ lastError: ({ event }) => normalizeError(event) }),
  },
}).createMachine({
  id: 'twoAgentWorkflow',
  context: ({ input }) => ({
    task: input.task ?? '',
    findings: '',
    judgment: '',
    conclusion: '',
    judgeCount: 0,
    loopCount: 0,
  }),
  initial: 'ready',
  states: {
    ready: {
      id: 'ready',
      description: 'Idle hub awaiting Boss to supply the input task.',
      tags: ['playbook.parked'],
      meta: {
        playbook: {
          stateId: 'ready',
          description: 'Idle hub awaiting Boss to supply the input task.',
        },
      },
      on: {
        START: { target: 'repoSetup', actions: 'assignTask' },
      },
    },

    repoSetup: {
      id: 'repoSetup',
      description:
        'Ensure the working directory is a Git repository root before committing.',
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'repoSetup',
          description:
            'Ensure the working directory is a Git repository root before committing.',
        },
      },
      invoke: {
        src: 'script',
        input: (): ScriptInput => ({
          stateId: 'repoSetup',
          sourceItem: 'REPO-1',
          command: '[ -e .git ] || git init',
          result: {
            ok: 'The command exited with status zero.',
            failed: 'The command exited with a nonzero status.',
          },
        }),
        onDone: [
          { guard: 'scriptOk', target: 'implement' },
          { guard: 'scriptFailed', target: 'failed' },
          { target: 'failed' },
        ],
        onError: { target: 'failed', actions: 'rememberError' },
      },
    },

    implement: {
      id: 'implement',
      description: 'Coder implements the input task and commits it.',
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'implement',
          description: 'Coder implements the input task and commits it.',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'implement',
          player: 'Coder',
          sourceItem: 'IMPL-1',
          prompt: [
            'Modify the code in the current directory to carry out the input task: <task>.',
            'Commit the change to Git.',
          ].join('\n'),
          result: {
            done: DONE_DESCRIPTION,
            needsBossReply: STD_NEEDS_BOSS_REPLY,
          },
          task: context.task,
          ...bossReplyFields(context),
        }),
        onDone: [
          {
            guard: 'needsBossReply',
            target: 'awaitBossReply',
            actions: assign({
              pendingBossQuestion: ({ event }) =>
                buildPending('implement', 'IMPL-1', 'Coder', event),
              bossReply: () => undefined,
            }),
          },
          { guard: 'needsBossReplyNoQuestion', target: 'failed' },
          {
            guard: 'isDone',
            target: 'review',
            actions: 'clearBossReplyContext',
          },
          { target: 'failed' },
        ],
        onError: { target: 'failed', actions: 'rememberError' },
      },
    },

    review: {
      id: 'review',
      description: 'Reviewer reviews the latest commit and may raise findings.',
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'review',
          description:
            'Reviewer reviews the latest commit and may raise findings.',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'review',
          player: 'Reviewer',
          sourceItem: 'REVIEW-1',
          prompt: [
            'Review the latest commit in the current directory.',
            'Raise any reasonable findings about it.',
          ].join('\n'),
          result: {
            findings:
              'Reviewer raised reasonable findings and handed them back to Coder. Output shall include `findings: <the findings, verbatim>`.',
            clean: 'Reviewer raised no findings, so the workflow finishes.',
            needsBossReply: STD_NEEDS_BOSS_REPLY,
          },
          ...bossReplyFields(context),
        }),
        onDone: [
          {
            guard: 'needsBossReply',
            target: 'awaitBossReply',
            actions: assign({
              pendingBossQuestion: ({ event }) =>
                buildPending('review', 'REVIEW-1', 'Reviewer', event),
              bossReply: () => undefined,
            }),
          },
          { guard: 'needsBossReplyNoQuestion', target: 'failed' },
          {
            guard: 'isFindings',
            target: 'judge',
            actions: ['assignFindings', 'clearBossReplyContext'],
          },
          {
            guard: 'isClean',
            target: 'done',
            actions: 'clearBossReplyContext',
          },
          { target: 'failed' },
        ],
        onError: { target: 'failed', actions: 'rememberError' },
      },
    },

    judge: {
      id: 'judge',
      description: 'Coder judges the findings, accepting or rejecting each.',
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'judge',
          description:
            'Coder judges the findings, accepting or rejecting each.',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'judge',
          player: 'Coder',
          sourceItem: 'JUDGE-1',
          prompt: [
            'Judge the findings Reviewer raised: <findings>.',
            'Accept or reject each finding, and explain why for each.',
          ].join('\n'),
          result: {
            agreed:
              'Coder and Reviewer have reached agreement on the findings. Output shall include `conclusion: <the agreed changes to make>`.',
            disagreed:
              "Disagreement remains after Coder's judgment. Output shall include `judgment: <Coder's accept-or-reject decisions and reasons>` and `conclusion: <the changes Coder currently intends to make>`.",
            needsBossReply: STD_NEEDS_BOSS_REPLY,
          },
          findings: context.findings,
          ...bossReplyFields(context),
        }),
        onDone: [
          {
            guard: 'needsBossReply',
            target: 'awaitBossReply',
            actions: assign({
              pendingBossQuestion: ({ event }) =>
                buildPending('judge', 'JUDGE-1', 'Coder', event),
              bossReply: () => undefined,
            }),
          },
          { guard: 'needsBossReplyNoQuestion', target: 'failed' },
          {
            guard: 'agreedCanLoop',
            target: 'reimplement',
            actions: ['assignConclusion', 'incJudge', 'clearBossReplyContext'],
          },
          {
            guard: 'agreedNoLoop',
            target: 'done',
            actions: ['assignConclusion', 'incJudge', 'clearBossReplyContext'],
          },
          {
            guard: 'disagreedCanArgue',
            target: 'argue',
            actions: [
              'assignJudgmentAndConclusion',
              'incJudge',
              'clearBossReplyContext',
            ],
          },
          {
            guard: 'disagreedStopCanLoop',
            target: 'reimplement',
            actions: [
              'assignJudgmentAndConclusion',
              'incJudge',
              'clearBossReplyContext',
            ],
          },
          {
            guard: 'disagreedStopNoLoop',
            target: 'done',
            actions: [
              'assignJudgmentAndConclusion',
              'incJudge',
              'clearBossReplyContext',
            ],
          },
          { target: 'failed' },
        ],
        onError: { target: 'failed', actions: 'rememberError' },
      },
    },

    argue: {
      id: 'argue',
      description: 'Reviewer argues its case against Coder’s judgment.',
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'argue',
          description: 'Reviewer argues its case against Coder’s judgment.',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'argue',
          player: 'Reviewer',
          sourceItem: 'ARGUE-1',
          prompt: [
            "Consider Coder's judgment of your findings: <judgment>.",
            'Argue your case for any finding you still disagree with.',
          ].join('\n'),
          result: {
            findings:
              'Reviewer maintains outstanding findings for Coder to judge again. Output shall include `findings: <the outstanding findings>`.',
            agreed:
              "Reviewer accepts Coder's judgment and no finding remains in dispute.",
            needsBossReply: STD_NEEDS_BOSS_REPLY,
          },
          judgment: context.judgment,
          ...bossReplyFields(context),
        }),
        onDone: [
          {
            guard: 'needsBossReply',
            target: 'awaitBossReply',
            actions: assign({
              pendingBossQuestion: ({ event }) =>
                buildPending('argue', 'ARGUE-1', 'Reviewer', event),
              bossReply: () => undefined,
            }),
          },
          { guard: 'needsBossReplyNoQuestion', target: 'failed' },
          {
            guard: 'isFindings',
            target: 'judge',
            actions: ['assignFindings', 'clearBossReplyContext'],
          },
          {
            guard: 'agreedCanLoop',
            target: 'reimplement',
            actions: 'clearBossReplyContext',
          },
          {
            guard: 'agreedNoLoop',
            target: 'done',
            actions: 'clearBossReplyContext',
          },
          { target: 'failed' },
        ],
        onError: { target: 'failed', actions: 'rememberError' },
      },
    },

    reimplement: {
      id: 'reimplement',
      description:
        'Coder changes the code according to the conclusion and commits again.',
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'reimplement',
          description:
            'Coder changes the code according to the conclusion and commits again.',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'reimplement',
          player: 'Coder',
          sourceItem: 'IMPL-2',
          prompt: [
            'Change the code in the current directory according to the conclusion: <conclusion>.',
            'Commit the change to Git.',
          ].join('\n'),
          result: {
            done: DONE_DESCRIPTION,
            needsBossReply: STD_NEEDS_BOSS_REPLY,
          },
          conclusion: context.conclusion,
          ...bossReplyFields(context),
        }),
        onDone: [
          {
            guard: 'needsBossReply',
            target: 'awaitBossReply',
            actions: assign({
              pendingBossQuestion: ({ event }) =>
                buildPending('reimplement', 'IMPL-2', 'Coder', event),
              bossReply: () => undefined,
            }),
          },
          { guard: 'needsBossReplyNoQuestion', target: 'failed' },
          {
            guard: 'isDone',
            target: 'review',
            actions: ['incLoop', 'clearBossReplyContext'],
          },
          { target: 'failed' },
        ],
        onError: { target: 'failed', actions: 'rememberError' },
      },
    },

    awaitBossReply: {
      id: 'awaitBossReply',
      description: "Waiting for Boss to answer the acting agent's question.",
      tags: ['playbook.parked'],
      meta: {
        playbook: {
          stateId: 'awaitBossReply',
          description:
            "Waiting for Boss to answer the acting agent's question.",
        },
      },
      on: {
        BOSS_REPLY: [
          { guard: 'bossReplyEmpty', target: 'failed' },
          ...resumableStates([
            'implement',
            'review',
            'judge',
            'argue',
            'reimplement',
          ]),
          { target: 'failed' },
        ],
      },
    },

    failed: {
      id: 'failed',
      description:
        'Recoverable failure; retains typed context and accepts a fresh task.',
      tags: ['playbook.parked'],
      meta: {
        playbook: {
          stateId: 'failed',
          description:
            'Recoverable failure; retains typed context and accepts a fresh task.',
        },
      },
      on: {
        START: { target: 'repoSetup', actions: 'assignTask' },
      },
    },

    done: {
      id: 'done',
      type: 'final',
      description:
        'Workflow finished: the review raised no findings or the loop limit was reached.',
      meta: {
        playbook: {
          stateId: 'done',
          description:
            'Workflow finished: the review raised no findings or the loop limit was reached.',
        },
      },
    },
  },
});
