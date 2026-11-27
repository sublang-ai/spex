---- MODULE b ----
\* SPDX-License-Identifier: Apache-2.0
\* SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
EXTENDS Declaration, FiniteSets

\* The model's state: whose copy stands at specs/packages/kit.md, or Missing.
Start == [standing |-> Missing]

\* The selected packages whose releases provide a `kit` spec;
\* a package listed as providing but not selected changes nothing.
Providers(e) == e.selected \cap e.providing

\* The standing copy is still that of a selected package whose release still provides the spec.
Kept(s, e) == s.standing # Missing /\ s.standing \in Providers(e)

\* The items say nothing about when an install can happen: it can always run.
Legal(s, e) == TRUE

After(s, e) ==
  \* environments-55: the standing copy stays in place as its package's.
  IF Kept(s, e)
  THEN [standing |-> s.standing]
  \* environments-41: no copy of theirs stands there (none stands, or it left because
  \* its package is no longer selected or no longer provides the spec):
  \* the first provider by <org> is placed.
  ELSE IF Providers(e) = {}
       \* environments-41: a copy whose package the lock no longer holds, or whose
       \* release no longer provides its spec, leaves, and nothing provides one now.
       THEN [standing |-> Missing]
       ELSE [standing |-> PackageFirst(Providers(e))]

Effect(s, e) ==
  \* environments-55: exactly the other selected providers are reported blocked.
  IF Kept(s, e)
  THEN [standing |-> s.standing, blocked |-> Providers(e) \ {s.standing}]
  \* environments-41: the first by <org> is placed and each other provider reported blocked.
  ELSE IF Providers(e) = {}
       THEN [standing |-> Missing, blocked |-> {}]
       ELSE [standing |-> PackageFirst(Providers(e)),
             blocked |-> Providers(e) \ {PackageFirst(Providers(e))}]

\* environments-55, clause by clause.
\* When an install runs in a project's environment:
When(e) == e.event = "install"
\* While a package's copy stands, that package still selected and its release still providing the spec:
While(s, e) == s.standing # Missing /\ s.standing \in e.selected /\ s.standing \in e.providing
\* The core shall leave that copy in place as that package's and report exactly the other
\* selected packages whose releases provide the spec as blocked:
Shall(s, e, f) ==
  /\ f.standing = s.standing
  /\ f.blocked = (e.selected \cap e.providing) \ {s.standing}
====
