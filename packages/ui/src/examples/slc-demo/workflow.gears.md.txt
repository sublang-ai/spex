# Two-Agent Task Workflow

Players:

- Coder
- Reviewer

### REPO-1

When the workflow starts, Captain shall run:

> [ -e .git ] || git init

Results:
- `ok`: The command exited with status zero.
- `failed`: The command exited with a nonzero status.

### IMPL-1

When Boss gives the input task and the working directory is a Git repository root, Captain shall prompt Coder:

> Modify the code in the current directory to carry out the input task: <task>.
> Commit the change to Git.

### REVIEW-1

When Coder has committed a change, Captain shall prompt Reviewer:

> Review the latest commit in the current directory.
> Raise any reasonable findings about it.

Results:
- `findings`: Reviewer raised reasonable findings and handed them back to Coder. Output shall include `findings: <the findings, verbatim>`.
- `clean`: Reviewer raised no findings, so the workflow finishes.

### JUDGE-1

When Reviewer has raised findings and handed them back to Coder, Captain shall prompt Coder:

> Judge the findings Reviewer raised: <findings>.
> Accept or reject each finding, and explain why for each.

Results:
- `agreed`: Coder and Reviewer have reached agreement on the findings. Output shall include `conclusion: <the agreed changes to make>`.
- `disagreed`: Disagreement remains after Coder's judgment. Output shall include `judgment: <Coder's accept-or-reject decisions and reasons>` and `conclusion: <the changes Coder currently intends to make>`.

### ARGUE-1

When Coder has judged the findings, disagreement remains, and Coder has judged fewer than three times in total, Captain shall prompt Reviewer:

> Consider Coder's judgment of your findings: <judgment>.
> Argue your case for any finding you still disagree with.

Results:
- `findings`: Reviewer maintains outstanding findings for Coder to judge again. Output shall include `findings: <the outstanding findings>`.
- `agreed`: Reviewer accepts Coder's judgment and no finding remains in dispute.

### IMPL-2

When Coder and Reviewer have concluded the discussion — by agreement or after the third judgment — and fewer than two review loops have completed, Captain shall prompt Coder:

> Change the code in the current directory according to the conclusion: <conclusion>.
> Commit the change to Git.

## Optimizations

- REPO-1: direct Captain → script
