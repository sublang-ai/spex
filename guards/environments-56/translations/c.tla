---- MODULE c ----
\* SPDX-License-Identifier: Apache-2.0
\* SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
EXTENDS Declaration

\* The model's state: whose copy of the `kit` spec stands at specs/packages/kit.md, or Missing.
Start == [standing |-> Missing]

\* environments-41, environments-55: the items say when an install runs in no way; it can always happen.
Legal(s, e) == TRUE

\* The selected packages whose releases provide a `kit` spec.
Candidates(e) == e.selected \cap e.providing

\* environments-41 and environments-55, what an install does to the path:
\*   a standing copy whose package is still selected and still provides stays (environments-55);
\*   a copy whose package is no longer selected or no longer provides leaves (environments-41, third bullet);
\*   where no copy stands, the first candidate by <org> is placed (environments-41, fourth bullet).
After(s, e) ==
  IF Candidates(e) = {}
  THEN [standing |-> Missing]
  ELSE IF s.standing \in Candidates(e)
       THEN s
       ELSE [standing |-> PackageFirst(Candidates(e))]

\* environments-41 and environments-55, what an install reports: exactly the other candidates are blocked.
Effect(s, e) ==
  [standing |-> After(s, e).standing,
   blocked  |-> IF Candidates(e) = {}
                THEN {}
                ELSE Candidates(e) \ {After(s, e).standing}]

\* environments-55, When clause: an install runs.
When(e) == e.event = "install"

\* environments-55, While clauses: a package's copy stands, that package is still selected and its release still provides the spec.
While(s, e) ==
  s.standing # Missing /\ s.standing \in e.selected /\ s.standing \in e.providing

\* environments-55, shall: the copy stays in place as that package's, and exactly the other
\* selected packages providing the spec are reported blocked.
Shall(s, e, f) ==
  f.standing = s.standing
  /\ f.blocked = (e.selected \cap e.providing) \ {s.standing}
====
