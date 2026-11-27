---- MODULE a ----
\* SPDX-License-Identifier: Apache-2.0
\* SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
\* A translation of environments-55 (the rule) and of the model that
\* environments-41 and environments-55 give for the one event `install`,
\* read by the cases of environments-56.
EXTENDS Declaration

\* The model's state: whose copy stands at specs/packages/kit.md, or Missing.
\* environments-41: before any install nothing has been placed.
Start == [standing |-> Missing]

\* The selected packages whose releases provide a `kit` spec
\* (environments-41, fourth case; environments-55).
\* A package listed as providing but not selected is left out.
Providers(e) == e.selected \cap e.providing

\* environments-55, its While clause: a package's copy stands, that package
\* is still selected and its release still provides the spec.
Keeps(s, e) == s.standing # Missing /\ s.standing \in Providers(e)

\* environments-41, environments-55: the items name no condition under which
\* an install cannot run.
Legal(s, e) == TRUE

After(s, e) ==
  CASE e.event = "install" ->
         \* environments-55: the standing copy is left in place as that package's.
         IF Keeps(s, e)
         THEN [standing |-> s.standing]
         \* environments-41, third case: a copy whose package the lock no
         \* longer holds, or whose release no longer provides its spec, leaves;
         \* with no selected package providing the spec, nothing is placed.
         ELSE IF Providers(e) = {}
         THEN [standing |-> Missing]
         \* environments-41, fourth case: where no copy of theirs stands there,
         \* the first by <org> is placed.
         ELSE [standing |-> PackageFirst(Providers(e))]

Effect(s, e) ==
  CASE e.event = "install" ->
         \* environments-55: exactly the other selected providing packages are
         \* reported blocked at that path.
         IF Keeps(s, e)
         THEN [standing |-> s.standing,
               blocked  |-> Providers(e) \ {s.standing}]
         \* environments-41, third case: the copy leaves and no package is
         \* placed, so none is blocked.
         ELSE IF Providers(e) = {}
         THEN [standing |-> Missing, blocked |-> {}]
         \* environments-41, fourth case: the first by <org> is placed and
         \* each other reported blocked.
         ELSE [standing |-> PackageFirst(Providers(e)),
               blocked  |-> Providers(e) \ {PackageFirst(Providers(e))}]

\* environments-55, clause by clause.
\* When an install runs in a project's environment.
When(e) == e.event = "install"

\* While a package's copy stands at specs/packages/<pkg>.md, with that package
\* still selected and its release still providing the spec.
While(s, e) ==
  /\ s.standing # Missing
  /\ s.standing \in e.selected
  /\ s.standing \in e.providing

\* The core shall leave that copy in place as that package's and report
\* exactly the other selected packages whose releases provide a <pkg> spec
\* as blocked at that path.
Shall(s, e, f) ==
  /\ f.standing = s.standing
  /\ f.blocked = (e.selected \cap e.providing) \ {s.standing}
====
