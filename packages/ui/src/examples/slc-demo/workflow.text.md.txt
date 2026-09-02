# Two-Agent Change-and-Review Workflow

Roles:

- Coder
- Reviewer

## Procedure

1. Before work begins, ensure the current directory is the root of its own Git
   repository; if `.git` is absent there, initialize a repository there.

2. Use two agents, Coder and Reviewer, to carry out the input task.

3. Coder modifies the code in the current directory as the task requires and
   commits it to Git.

4. Reviewer reviews the resulting commit and raises reasonable findings,
   handing them back to Coder to judge — Coder may accept or reject them, but
   must explain why.

5. The two agents argue until they reach agreement (arguing no more than 2
   rounds, i.e. after the 3rd judgment in total they stop arguing), and Coder
   is responsible for changing the code according to the conclusion and
   committing again.

6. Loop like this until the review raises no findings, then finish.

7. No more than 2 loops.
