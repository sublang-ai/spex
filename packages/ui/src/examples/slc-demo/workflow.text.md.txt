# Two-Agent Task Workflow

Use two agents to carry out the input task.

Players:

- Coder
- Reviewer

Coder is the agent that modifies the code and commits; Reviewer is the agent
that reviews the resulting commit.

## Procedure

1. Ensure the current directory is the root of its own Git repository; if
   `.git` is absent there, initialize a repository there.

2. Coder modifies the code in the current directory as the input task requires
   and commits it to Git.

3. Reviewer reviews the resulting commit and raises reasonable findings, then
   hands them back to Coder to judge.

4. Coder judges the findings: Coder may accept or reject them, but must explain
   why.

5. Coder and Reviewer argue until they reach agreement, arguing no more than 2
   rounds (i.e., after the 3rd judgment in total they stop arguing).

6. Coder changes the code according to the conclusion and commits again.

7. Loop through steps 2–6 until the review raises no findings, then finish. No
   more than 2 loops.
