import { assign, fromPromise, setup } from 'xstate';

/*
 * Compiled from the GEARS package "Two-Agent Change-and-Review Workflow"
 * (items WORKFLOW-1 .. WORKFLOW-7).
 *
 * Object artifact only: it defines the machine, actor contracts, and typed
 * inputs. It binds no runner and supplies no concrete actor implementation.
 */

/* -- Roles and stable state identities ----------------------------------- */

/** Canonical lowercase ids of the roles declared by the GEARS `Roles:` section. */
export type RoleId = 'coder' | 'reviewer';

/** Stable ids of the agent-invoking working leaves a Boss reply can resume. */
export type ResumableStateId =
  | 'implement'
  | 'review'
  | 'judgeFindings'
  | 'argue'
  | 'judgeArgument'
  | 'apply';

/** Stable ids Boss may pre-empt into. The script leaf takes no Boss turn. */
export type InterruptTargetId = ResumableStateId;

/* -- Shared boundary types ----------------------------------------------- */

export type PendingBossQuestion = {
  readonly questionId: ResumableStateId;
  readonly resumeStateId: ResumableStateId;
  readonly sourceItem: string;
  readonly asker: { readonly kind: 'role'; readonly roleId: RoleId };
  readonly question: string;
};

export type NormalizedError = {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
};

/* -- Player actor contract ------------------------------------------------ */

export type PlayerInput = {
  readonly stateId: ResumableStateId;
  readonly role: RoleId;
  readonly sourceItem: string;
  readonly prompt: string;
  readonly result: Readonly<Record<string, string>>;
  /** Backs the `<input-task>` prompt placeholder of WORKFLOW-2. */
  readonly inputTask?: string;
  /** Backs the `<reviewFindings>` prompt placeholder of WORKFLOW-4. */
  readonly reviewFindings?: string;
  /** Backs the `<coderJudgment>` prompt placeholders of WORKFLOW-5 and WORKFLOW-7. */
  readonly coderJudgment?: string;
  /** Backs the `<reviewerArgument>` prompt placeholder of WORKFLOW-6. */
  readonly reviewerArgument?: string;
  readonly pendingBossQuestion?: PendingBossQuestion;
  readonly bossReply?: string;
};

export type PlayerOutput =
  | { readonly guard: 'done' }
  | { readonly guard: 'findings'; readonly reviewFindings: string }
  | { readonly guard: 'clean' }
  | { readonly guard: 'judged'; readonly coderJudgment: string }
  | { readonly guard: 'agreement' }
  | { readonly guard: 'argument'; readonly reviewerArgument: string }
  | { readonly guard: 'needsBossReply'; readonly question: string };

/* -- Script actor contract ------------------------------------------------ */

export type ScriptInput = {
  readonly stateId: string;
  readonly sourceItem: string;
  readonly command: string;
  readonly result: Readonly<Record<string, string>>;
};

export type ScriptOutput =
  | { readonly guard: 'ok'; readonly exitStatus: number }
  | { readonly guard: 'failed'; readonly exitStatus: number };

/* -- Machine context, events, and input ----------------------------------- */

export type WorkflowContext = {
  /** The input task Boss gave with the entry event; backs `<input-task>`. */
  readonly inputTask?: string;
  /** Review loops started so far; WORKFLOW-3 allows the first and the second. */
  readonly reviewLoops: number;
  /** Judgments made in the current loop; WORKFLOW-5 argues below three. */
  readonly judgmentCount: number;
  readonly reviewFindings?: string;
  readonly coderJudgment?: string;
  readonly reviewerArgument?: string;
  readonly pendingBossQuestion?: PendingBossQuestion;
  readonly bossReply?: string;
  readonly lastError?: NormalizedError;
};

export type WorkflowEvent =
  | { readonly type: 'START'; readonly inputTask: string }
  | { readonly type: 'BOSS_INTERRUPT'; readonly targetId: InterruptTargetId }
  | {
      readonly type: 'BOSS_REPLY';
      readonly answer: string;
      readonly questionId?: string;
    };

/** The machine carries no host-owned configuration input. */
export type WorkflowMachineInput = Record<string, never>;

/* -- Source-fixed limits and standard descriptions ------------------------ */

/** WORKFLOW-3: "this review starts the first or the second loop". */
const MAX_REVIEW_LOOPS = 2;

/** WORKFLOW-5: "fewer than 3 judgments in total" in one loop. */
const MAX_JUDGMENTS_PER_LOOP = 3;

/** Default single-outcome contract for an item that declares no `Results:`. */
const COMPLETED_BEHAVIOR = 'The acting agent completed the behavior.';

/** Universal Boss-reply result added to every agent-invoking state. */
const NEEDS_BOSS_REPLY =
  "The acting agent's prose surfaces a clarifying question for Boss that the agent cannot answer alone. Output shall include `question: <verbatim question text from the acting agent's prose>`.";

const AWAIT_BOSS_REPLY_DESCRIPTION =
  "Waiting for Boss to answer the acting agent's question.";

/* -- Structural narrowing helpers ---------------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Narrows an unknown XState event's `output` to the declared player contract. */
const playerOutputOf = (event: unknown): PlayerOutput | undefined => {
  if (!isRecord(event)) return undefined;
  const output = event.output;
  if (!isRecord(output)) return undefined;
  const guard = output.guard;
  if (typeof guard !== 'string') return undefined;
  switch (guard) {
    case 'done':
    case 'clean':
    case 'agreement':
      return { guard };
    case 'findings':
      return typeof output.reviewFindings === 'string'
        ? { guard, reviewFindings: output.reviewFindings }
        : undefined;
    case 'judged':
      return typeof output.coderJudgment === 'string'
        ? { guard, coderJudgment: output.coderJudgment }
        : undefined;
    case 'argument':
      return typeof output.reviewerArgument === 'string'
        ? { guard, reviewerArgument: output.reviewerArgument }
        : undefined;
    case 'needsBossReply':
      return typeof output.question === 'string'
        ? { guard, question: output.question }
        : undefined;
    default:
      return undefined;
  }
};

/** Narrows an unknown XState event's `output` to the declared script contract. */
const scriptOutputOf = (event: unknown): ScriptOutput | undefined => {
  if (!isRecord(event)) return undefined;
  const output = event.output;
  if (!isRecord(output)) return undefined;
  const guard = output.guard;
  const exitStatus = output.exitStatus;
  if (typeof exitStatus !== 'number' || !Number.isFinite(exitStatus))
    return undefined;
  if (guard !== 'ok' && guard !== 'failed') return undefined;
  return { guard, exitStatus };
};

const errorOf = (event: unknown): unknown =>
  isRecord(event) ? event.error : undefined;

const normalizeError = (error: unknown): NormalizedError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(typeof error.stack === 'string' ? { stack: error.stack } : {}),
    };
  }
  return {
    name: 'Error',
    message:
      typeof error === 'string'
        ? error
        : 'The invoked actor rejected with a non-Error value.',
  };
};

/* -- Boss-control helpers ------------------------------------------------- */

const WORKING_LEAF_REFS = {
  implement: '#implement',
  review: '#review',
  judgeFindings: '#judgeFindings',
  argue: '#argue',
  judgeArgument: '#judgeArgument',
  apply: '#apply',
} as const satisfies Record<ResumableStateId, string>;

const RESUMABLE_STATE_IDS = [
  'implement',
  'review',
  'judgeFindings',
  'argue',
  'judgeArgument',
  'apply',
] as const satisfies readonly ResumableStateId[];

const INTERRUPT_TARGET_IDS = [
  'implement',
  'review',
  'judgeFindings',
  'argue',
  'judgeArgument',
  'apply',
] as const satisfies readonly InterruptTargetId[];

/** Typed context preconditions each interrupt target needs to run safely. */
const interruptPreconditions: Readonly<
  Record<InterruptTargetId, (context: WorkflowContext) => boolean>
> = {
  implement: (context) => hasText(context.inputTask),
  review: () => true,
  judgeFindings: (context) => hasText(context.reviewFindings),
  argue: (context) => hasText(context.coderJudgment),
  judgeArgument: (context) => hasText(context.reviewerArgument),
  apply: (context) => hasText(context.coderJudgment),
};

const bossInterrupts = (ids: readonly InterruptTargetId[]) =>
  ids.map((id) => ({
    guard: ({
      context,
      event,
    }: {
      context: WorkflowContext;
      event: WorkflowEvent;
    }): boolean =>
      event.type === 'BOSS_INTERRUPT' &&
      event.targetId === id &&
      interruptPreconditions[id](context),
    target: WORKING_LEAF_REFS[id],
    reenter: true as const,
    actions: 'clearBossReplyContext' as const,
  }));

const canResume = (
  context: WorkflowContext,
  event: WorkflowEvent,
  id: ResumableStateId,
): boolean => {
  if (event.type !== 'BOSS_REPLY') return false;
  if (!hasText(event.answer)) return false;
  const pending = context.pendingBossQuestion;
  if (pending === undefined || pending.resumeStateId !== id) return false;
  return (
    event.questionId === undefined || event.questionId === pending.questionId
  );
};

const resumableStates = (ids: readonly ResumableStateId[]) =>
  ids.map((id) => ({
    guard: ({
      context,
      event,
    }: {
      context: WorkflowContext;
      event: WorkflowEvent;
    }): boolean => canResume(context, event, id),
    target: WORKING_LEAF_REFS[id],
    actions: 'recordBossReply' as const,
  }));

type PendingQuestionParams = {
  readonly stateId: ResumableStateId;
  readonly sourceItem: string;
  readonly roleId: RoleId;
};

/** No parallel group in this package. */
export const concurrentRoleSets: readonly (readonly RoleId[])[] = [];

/* -- Machine -------------------------------------------------------------- */

export const workflowMachine = setup({
  types: {
    context: {} as WorkflowContext,
    events: {} as WorkflowEvent,
    input: {} as WorkflowMachineInput,
  },
  actors: {
    player: fromPromise<PlayerOutput, PlayerInput>(async () => {
      throw new Error('player actor must be provided by the runner');
    }),
    script: fromPromise<ScriptOutput, ScriptInput>(async () => {
      throw new Error('script actor must be provided by the runner');
    }),
  },
  guards: {
    scriptSucceeded: ({ event }) => scriptOutputOf(event)?.guard === 'ok',
    scriptFailed: ({ event }) => scriptOutputOf(event)?.guard === 'failed',
    playerAskedBoss: ({ event }) =>
      playerOutputOf(event)?.guard === 'needsBossReply',
    playerCompleted: ({ event }) => playerOutputOf(event)?.guard === 'done',
    reviewRaisedFindings: ({ event }) =>
      playerOutputOf(event)?.guard === 'findings',
    reviewIsClean: ({ event }) => playerOutputOf(event)?.guard === 'clean',
    coderJudged: ({ event }) => playerOutputOf(event)?.guard === 'judged',
    coderJudgedWithRoundsLeft: ({ context, event }) =>
      playerOutputOf(event)?.guard === 'judged' &&
      context.judgmentCount < MAX_JUDGMENTS_PER_LOOP,
    reviewerAgreed: ({ event }) => playerOutputOf(event)?.guard === 'agreement',
    reviewerArgued: ({ event }) => playerOutputOf(event)?.guard === 'argument',
    completedWithLoopsLeft: ({ context, event }) =>
      playerOutputOf(event)?.guard === 'done' &&
      context.reviewLoops < MAX_REVIEW_LOOPS,
  },
  actions: {
    startRun: assign(
      ({ context, event }): Partial<WorkflowContext> => ({
        inputTask: event.type === 'START' ? event.inputTask : context.inputTask,
        reviewLoops: 0,
        judgmentCount: 0,
        reviewFindings: undefined,
        coderJudgment: undefined,
        reviewerArgument: undefined,
        pendingBossQuestion: undefined,
        bossReply: undefined,
        lastError: undefined,
      }),
    ),
    startReviewLoop: assign(
      ({ context }): Partial<WorkflowContext> => ({
        reviewLoops: context.reviewLoops + 1,
        judgmentCount: 0,
      }),
    ),
    countFirstJudgment: assign(
      (): Partial<WorkflowContext> => ({ judgmentCount: 1 }),
    ),
    countNextJudgment: assign(
      ({ context }): Partial<WorkflowContext> => ({
        judgmentCount: context.judgmentCount + 1,
      }),
    ),
    recordReviewFindings: assign(({ event }): Partial<WorkflowContext> => {
      const output = playerOutputOf(event);
      return output?.guard === 'findings'
        ? { reviewFindings: output.reviewFindings }
        : {};
    }),
    recordCoderJudgment: assign(({ event }): Partial<WorkflowContext> => {
      const output = playerOutputOf(event);
      return output?.guard === 'judged'
        ? { coderJudgment: output.coderJudgment }
        : {};
    }),
    recordReviewerArgument: assign(({ event }): Partial<WorkflowContext> => {
      const output = playerOutputOf(event);
      return output?.guard === 'argument'
        ? { reviewerArgument: output.reviewerArgument }
        : {};
    }),
    setPendingBossQuestion: assign(
      ({ event }, params: PendingQuestionParams): Partial<WorkflowContext> => {
        const output = playerOutputOf(event);
        if (output?.guard !== 'needsBossReply') return {};
        return {
          pendingBossQuestion: {
            questionId: params.stateId,
            resumeStateId: params.stateId,
            sourceItem: params.sourceItem,
            asker: { kind: 'role', roleId: params.roleId },
            question: output.question,
          },
        };
      },
    ),
    recordBossReply: assign(
      ({ event }): Partial<WorkflowContext> =>
        event.type === 'BOSS_REPLY' ? { bossReply: event.answer } : {},
    ),
    clearBossReplyContext: assign(
      (): Partial<WorkflowContext> => ({
        pendingBossQuestion: undefined,
        bossReply: undefined,
      }),
    ),
    rememberActorError: assign(
      ({ event }): Partial<WorkflowContext> => ({
        lastError: normalizeError(errorOf(event)),
      }),
    ),
    rememberScriptFailure: assign(({ event }): Partial<WorkflowContext> => {
      const output = scriptOutputOf(event);
      return {
        lastError: {
          name: 'ScriptFailed',
          message:
            output === undefined
              ? 'The setup script exited with a nonzero status.'
              : `The setup script exited with status ${output.exitStatus}.`,
        },
      };
    }),
    rememberInvalidResult: assign(
      (): Partial<WorkflowContext> => ({
        lastError: {
          name: 'InvalidActorResult',
          message:
            "The invoked actor returned a result outside the state's declared result contract.",
        },
      }),
    ),
    rememberInvalidBossReply: assign(
      (): Partial<WorkflowContext> => ({
        lastError: {
          name: 'InvalidBossReply',
          message:
            'BOSS_REPLY carried no non-empty answer for the pending question.',
        },
      }),
    ),
  },
}).createMachine({
  id: 'workflow',
  initial: 'ready',
  context: { reviewLoops: 0, judgmentCount: 0 },
  on: {
    BOSS_INTERRUPT: bossInterrupts(INTERRUPT_TARGET_IDS),
  },
  states: {
    ready: {
      id: 'ready',
      description: 'Idle hub waiting for Boss to start the two-agent workflow.',
      tags: ['playbook.parked'],
      meta: {
        playbook: {
          stateId: 'ready',
          description:
            'Idle hub waiting for Boss to start the two-agent workflow.',
        },
      },
      on: {
        START: { target: 'setup', actions: 'startRun' },
      },
    },

    setup: {
      id: 'setup',
      description:
        'Ensures the current directory is the root of its own Git repository.',
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'setup',
          description:
            'Ensures the current directory is the root of its own Git repository.',
        },
      },
      invoke: {
        src: 'script',
        input: (): ScriptInput => ({
          stateId: 'setup',
          sourceItem: 'WORKFLOW-1',
          command: '[ -e .git ] || git init',
          result: {
            ok: 'The command exited with status zero.',
            failed: 'The command exited with a nonzero status.',
          },
        }),
        onDone: [
          { guard: 'scriptSucceeded', target: 'implement' },
          {
            guard: 'scriptFailed',
            target: 'failed',
            actions: 'rememberScriptFailure',
          },
          { target: 'failed', actions: 'rememberInvalidResult' },
        ],
        onError: { target: 'failed', actions: 'rememberActorError' },
      },
    },

    implement: {
      id: 'implement',
      description:
        'Coder modifies the code for the input task and commits it to Git.',
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'implement',
          description:
            'Coder modifies the code for the input task and commits it to Git.',
          role: 'coder',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'implement',
          role: 'coder',
          sourceItem: 'WORKFLOW-2',
          prompt: [
            'Modify the code in the current directory as the input task requires.',
            'Commit the change to Git.',
            'The input task:',
            '<input-task>',
          ].join('\n'),
          result: {
            done: COMPLETED_BEHAVIOR,
            needsBossReply: NEEDS_BOSS_REPLY,
          },
          ...(context.inputTask !== undefined
            ? { inputTask: context.inputTask }
            : {}),
          ...(context.pendingBossQuestion !== undefined
            ? { pendingBossQuestion: context.pendingBossQuestion }
            : {}),
          ...(context.bossReply !== undefined
            ? { bossReply: context.bossReply }
            : {}),
        }),
        onDone: [
          {
            guard: 'playerAskedBoss',
            target: 'awaitBossReply',
            actions: {
              type: 'setPendingBossQuestion',
              params: {
                stateId: 'implement',
                sourceItem: 'WORKFLOW-2',
                roleId: 'coder',
              },
            },
          },
          {
            guard: 'playerCompleted',
            target: 'review',
            actions: ['clearBossReplyContext', 'startReviewLoop'],
          },
          { target: 'failed', actions: 'rememberInvalidResult' },
        ],
        onError: { target: 'failed', actions: 'rememberActorError' },
      },
    },

    review: {
      id: 'review',
      description:
        "Reviewer reviews Coder's commit and raises reasonable findings.",
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'review',
          description:
            "Reviewer reviews Coder's commit and raises reasonable findings.",
          role: 'reviewer',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'review',
          role: 'reviewer',
          sourceItem: 'WORKFLOW-3',
          prompt: [
            'Review the resulting commit.',
            'Raise reasonable findings.',
          ].join('\n'),
          result: {
            findings:
              'Reviewer raised findings to hand back to Coder. Output shall include `reviewFindings: <verbatim final text>`.',
            clean: 'Reviewer raised no findings, so the workflow finishes.',
            needsBossReply: NEEDS_BOSS_REPLY,
          },
          ...(context.pendingBossQuestion !== undefined
            ? { pendingBossQuestion: context.pendingBossQuestion }
            : {}),
          ...(context.bossReply !== undefined
            ? { bossReply: context.bossReply }
            : {}),
        }),
        onDone: [
          {
            guard: 'playerAskedBoss',
            target: 'awaitBossReply',
            actions: {
              type: 'setPendingBossQuestion',
              params: {
                stateId: 'review',
                sourceItem: 'WORKFLOW-3',
                roleId: 'reviewer',
              },
            },
          },
          {
            guard: 'reviewRaisedFindings',
            target: 'judgeFindings',
            actions: [
              'clearBossReplyContext',
              'recordReviewFindings',
              'countFirstJudgment',
            ],
          },
          {
            guard: 'reviewIsClean',
            target: 'reviewedClean',
            actions: 'clearBossReplyContext',
          },
          { target: 'failed', actions: 'rememberInvalidResult' },
        ],
        onError: { target: 'failed', actions: 'rememberActorError' },
      },
    },

    judgeFindings: {
      id: 'judgeFindings',
      description:
        "Coder judges Reviewer's findings, accepting or rejecting them with reasons.",
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'judgeFindings',
          description:
            "Coder judges Reviewer's findings, accepting or rejecting them with reasons.",
          role: 'coder',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'judgeFindings',
          role: 'coder',
          sourceItem: 'WORKFLOW-4',
          prompt: [
            'Judge the findings Reviewer raised on your commit.',
            'You may accept or reject them, but you must explain why.',
            "Reviewer's findings:",
            '<reviewFindings>',
          ].join('\n'),
          result: {
            judged:
              "Coder judged Reviewer's findings. Output shall include `coderJudgment: <verbatim final text>`.",
            needsBossReply: NEEDS_BOSS_REPLY,
          },
          ...(context.reviewFindings !== undefined
            ? { reviewFindings: context.reviewFindings }
            : {}),
          ...(context.pendingBossQuestion !== undefined
            ? { pendingBossQuestion: context.pendingBossQuestion }
            : {}),
          ...(context.bossReply !== undefined
            ? { bossReply: context.bossReply }
            : {}),
        }),
        onDone: [
          {
            guard: 'playerAskedBoss',
            target: 'awaitBossReply',
            actions: {
              type: 'setPendingBossQuestion',
              params: {
                stateId: 'judgeFindings',
                sourceItem: 'WORKFLOW-4',
                roleId: 'coder',
              },
            },
          },
          {
            guard: 'coderJudged',
            target: 'argue',
            actions: ['clearBossReplyContext', 'recordCoderJudgment'],
          },
          { target: 'failed', actions: 'rememberInvalidResult' },
        ],
        onError: { target: 'failed', actions: 'rememberActorError' },
      },
    },

    argue: {
      id: 'argue',
      description:
        "Reviewer states agreement with Coder's judgment or argues its case.",
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'argue',
          description:
            "Reviewer states agreement with Coder's judgment or argues its case.",
          role: 'reviewer',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'argue',
          role: 'reviewer',
          sourceItem: 'WORKFLOW-5',
          prompt: [
            "Consider Coder's judgment of your findings.",
            'State whether you agree with it.',
            'If you do not agree, argue your case.',
            "Coder's judgment:",
            '<coderJudgment>',
          ].join('\n'),
          result: {
            agreement:
              "Reviewer agreed with Coder's judgment, so the two agents stop arguing.",
            argument:
              "Reviewer argued against Coder's judgment. Output shall include `reviewerArgument: <verbatim final text>`.",
            needsBossReply: NEEDS_BOSS_REPLY,
          },
          ...(context.coderJudgment !== undefined
            ? { coderJudgment: context.coderJudgment }
            : {}),
          ...(context.pendingBossQuestion !== undefined
            ? { pendingBossQuestion: context.pendingBossQuestion }
            : {}),
          ...(context.bossReply !== undefined
            ? { bossReply: context.bossReply }
            : {}),
        }),
        onDone: [
          {
            guard: 'playerAskedBoss',
            target: 'awaitBossReply',
            actions: {
              type: 'setPendingBossQuestion',
              params: {
                stateId: 'argue',
                sourceItem: 'WORKFLOW-5',
                roleId: 'reviewer',
              },
            },
          },
          {
            guard: 'reviewerArgued',
            target: 'judgeArgument',
            actions: [
              'clearBossReplyContext',
              'recordReviewerArgument',
              'countNextJudgment',
            ],
          },
          {
            guard: 'reviewerAgreed',
            target: 'apply',
            actions: 'clearBossReplyContext',
          },
          { target: 'failed', actions: 'rememberInvalidResult' },
        ],
        onError: { target: 'failed', actions: 'rememberActorError' },
      },
    },

    judgeArgument: {
      id: 'judgeArgument',
      description:
        "Coder judges Reviewer's argument, accepting or rejecting it with reasons.",
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'judgeArgument',
          description:
            "Coder judges Reviewer's argument, accepting or rejecting it with reasons.",
          role: 'coder',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'judgeArgument',
          role: 'coder',
          sourceItem: 'WORKFLOW-6',
          prompt: [
            "Judge Reviewer's argument.",
            'You may accept or reject it, but you must explain why.',
            "Reviewer's argument:",
            '<reviewerArgument>',
          ].join('\n'),
          result: {
            judged:
              "Coder judged Reviewer's argument. Output shall include `coderJudgment: <verbatim final text>`.",
            needsBossReply: NEEDS_BOSS_REPLY,
          },
          ...(context.reviewerArgument !== undefined
            ? { reviewerArgument: context.reviewerArgument }
            : {}),
          ...(context.pendingBossQuestion !== undefined
            ? { pendingBossQuestion: context.pendingBossQuestion }
            : {}),
          ...(context.bossReply !== undefined
            ? { bossReply: context.bossReply }
            : {}),
        }),
        onDone: [
          {
            guard: 'playerAskedBoss',
            target: 'awaitBossReply',
            actions: {
              type: 'setPendingBossQuestion',
              params: {
                stateId: 'judgeArgument',
                sourceItem: 'WORKFLOW-6',
                roleId: 'coder',
              },
            },
          },
          {
            guard: 'coderJudgedWithRoundsLeft',
            target: 'argue',
            actions: ['clearBossReplyContext', 'recordCoderJudgment'],
          },
          {
            guard: 'coderJudged',
            target: 'apply',
            actions: ['clearBossReplyContext', 'recordCoderJudgment'],
          },
          { target: 'failed', actions: 'rememberInvalidResult' },
        ],
        onError: { target: 'failed', actions: 'rememberActorError' },
      },
    },

    apply: {
      id: 'apply',
      description:
        'Coder changes the code per the concluded judgment and commits again.',
      tags: ['playbook.busy'],
      meta: {
        playbook: {
          stateId: 'apply',
          description:
            'Coder changes the code per the concluded judgment and commits again.',
          role: 'coder',
        },
      },
      invoke: {
        src: 'player',
        input: ({ context }): PlayerInput => ({
          stateId: 'apply',
          role: 'coder',
          sourceItem: 'WORKFLOW-7',
          prompt: [
            'Change the code in the current directory according to the conclusion you and Reviewer reached.',
            'Commit the change to Git again.',
            'The concluding judgment:',
            '<coderJudgment>',
          ].join('\n'),
          result: {
            done: COMPLETED_BEHAVIOR,
            needsBossReply: NEEDS_BOSS_REPLY,
          },
          ...(context.coderJudgment !== undefined
            ? { coderJudgment: context.coderJudgment }
            : {}),
          ...(context.pendingBossQuestion !== undefined
            ? { pendingBossQuestion: context.pendingBossQuestion }
            : {}),
          ...(context.bossReply !== undefined
            ? { bossReply: context.bossReply }
            : {}),
        }),
        onDone: [
          {
            guard: 'playerAskedBoss',
            target: 'awaitBossReply',
            actions: {
              type: 'setPendingBossQuestion',
              params: {
                stateId: 'apply',
                sourceItem: 'WORKFLOW-7',
                roleId: 'coder',
              },
            },
          },
          {
            guard: 'completedWithLoopsLeft',
            target: 'review',
            actions: ['clearBossReplyContext', 'startReviewLoop'],
          },
          {
            guard: 'playerCompleted',
            target: 'loopLimitReached',
            actions: 'clearBossReplyContext',
          },
          { target: 'failed', actions: 'rememberInvalidResult' },
        ],
        onError: { target: 'failed', actions: 'rememberActorError' },
      },
    },

    awaitBossReply: {
      id: 'awaitBossReply',
      description: AWAIT_BOSS_REPLY_DESCRIPTION,
      tags: ['playbook.parked'],
      meta: {
        playbook: {
          stateId: 'awaitBossReply',
          description: AWAIT_BOSS_REPLY_DESCRIPTION,
        },
      },
      on: {
        BOSS_REPLY: [
          ...resumableStates(RESUMABLE_STATE_IDS),
          { target: 'failed', actions: 'rememberInvalidBossReply' },
        ],
      },
    },

    failed: {
      id: 'failed',
      description:
        'A call failed or returned an invalid result; parked for Boss recovery.',
      tags: ['playbook.parked'],
      meta: {
        playbook: {
          stateId: 'failed',
          description:
            'A call failed or returned an invalid result; parked for Boss recovery.',
        },
      },
      on: {
        START: { target: 'setup', actions: 'startRun' },
      },
    },

    reviewedClean: {
      id: 'reviewedClean',
      type: 'final',
      description: 'The review raised no findings, so the workflow finished.',
      meta: {
        playbook: {
          stateId: 'reviewedClean',
          description:
            'The review raised no findings, so the workflow finished.',
        },
      },
    },

    loopLimitReached: {
      id: 'loopLimitReached',
      type: 'final',
      description:
        'The workflow stopped at its limit of 2 loops, its last commit unreviewed.',
      meta: {
        playbook: {
          stateId: 'loopLimitReached',
          description:
            'The workflow stopped at its limit of 2 loops, its last commit unreviewed.',
        },
      },
    },
  },
});
