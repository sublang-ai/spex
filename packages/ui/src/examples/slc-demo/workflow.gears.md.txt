# Two-Agent Change-and-Review Workflow

Roles:

- Coder
- Reviewer

## Workflow

### WORKFLOW-1

When Boss gives the input task and work has not begun, Captain shall run:

> [ -e .git ] || git init

Results:
- `ok`: The command exited with status zero.
- `failed`: The command exited with a nonzero status.

### WORKFLOW-2

When the current directory is the root of its own Git repository and the input task has not been implemented yet, Captain shall prompt Coder:

> Modify the code in the current directory as the input task requires.
> Commit the change to Git.
> The input task:
> <input-task>

### WORKFLOW-3

When Coder has committed a change and this review starts the first or the second loop, Captain shall prompt Reviewer:

> Review the resulting commit.
> Raise reasonable findings.

Results:
- `findings`: Reviewer raised findings to hand back to Coder. Output shall include `reviewFindings: <verbatim final text>`.
- `clean`: Reviewer raised no findings, so the workflow finishes.

### WORKFLOW-4

When Reviewer has raised findings on Coder's commit, Captain shall prompt Coder:

> Judge the findings Reviewer raised on your commit.
> You may accept or reject them, but you must explain why.
> Reviewer's findings:
> <reviewFindings>

Results:
- `judged`: Coder judged Reviewer's findings. Output shall include `coderJudgment: <verbatim final text>`.

### WORKFLOW-5

When Coder has judged and this loop has had fewer than 3 judgments in total, so the two agents may still argue for no more than 2 rounds, Captain shall prompt Reviewer:

> Consider Coder's judgment of your findings.
> State whether you agree with it.
> If you do not agree, argue your case.
> Coder's judgment:
> <coderJudgment>

Results:
- `agreement`: Reviewer agreed with Coder's judgment, so the two agents stop arguing.
- `argument`: Reviewer argued against Coder's judgment. Output shall include `reviewerArgument: <verbatim final text>`.

### WORKFLOW-6

When Reviewer has argued against Coder's judgment, Captain shall prompt Coder:

> Judge Reviewer's argument.
> You may accept or reject it, but you must explain why.
> Reviewer's argument:
> <reviewerArgument>

Results:
- `judged`: Coder judged Reviewer's argument. Output shall include `coderJudgment: <verbatim final text>`.

### WORKFLOW-7

When Reviewer has agreed with Coder's judgment, or the third judgment of this loop has been made and the two agents stop arguing, Captain shall prompt Coder:

> Change the code in the current directory according to the conclusion you and Reviewer reached.
> Commit the change to Git again.
> The concluding judgment:
> <coderJudgment>

## Optimizations

- WORKFLOW-1: direct Captain work → script
