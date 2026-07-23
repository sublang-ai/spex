<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PBLIB: Playbook Library

## Intent

This spec covers the Spex Library surface — presented to the
user as **Playbooks** — across its user-visible behavior, the
implementation behind it, and the integration coverage that
verifies it: browsing and enabling configured playbooks, mapping
playbook roles to player profiles, and compiling new playbooks,
backed by compile execution, registry generation, and
shared-config writes.

Playbook entries live in the shared playbook config file, which
remains the source of truth under its fail-closed validation
rules; compilation runs the external `slc` toolchain with its
Node.js version floor and compiled outputs.

Verification requires integration coverage of the Library
surface's compile, registration, and shared-config write paths,
where correctness spans the external `slc` process, generated
registry artifacts, and the shared config file.

## External Behavior

### Playbook List

#### PBLIB-1

When the Library surface is opened, the Library shall list every
playbook configured in the shared config's `playbooks` map
([DR-004](../decisions/004-config-and-persistence.md)), showing
for each entry its id, command, intent, required roles, per-role
player-profile mapping, and enabled state.

#### PBLIB-2

Where a configured playbook entry fails the fail-closed config
validation ([DR-004](../decisions/004-config-and-persistence.md))
— for example, an unresolved required role or a duplicate
command — the Library shall list the entry marked invalid with
the specific validation failure, rather than hiding it.

### Enable and Disable

#### PBLIB-3

When the user toggles a playbook's enabled state, the Library
shall persist the new state to that playbook's entry in the
shared config file (state encoding per
[DR-004](../decisions/004-config-and-persistence.md)), shall
modify no other entry, and shall reflect the new state in the
list. Disabling shall not remove the playbook's entry or its
role-profile mapping from the shared config.

### Role Mapping

#### PBLIB-4

Where the shared config defines a `profiles` map
([DR-004](../decisions/004-config-and-persistence.md)), when the
user edits a playbook's per-role player mapping, the Library
shall offer each configured profile id and each supported adapter
shorthand as mapping choices, shall reject a mapping that leaves
a required role unresolved or that references an undefined
profile — naming the affected role — and shall write only
accepted mappings to the playbook's `players` map in the shared
config.

### Compile Flow

#### PBLIB-5

When the user starts the compile flow, the Library shall accept
the playbook source as either a picked markdown file or in-app
markdown text, and shall require the playbook's role names before
compilation starts. The Library shall reject a role name that
does not match `^[a-z][a-z0-9_-]*$` before starting compilation.

#### PBLIB-6

While a compile is running, the Library shall display each phase
of the compile pipeline
([DR-005](../decisions/005-compilation-integration.md)) with its
name and live status — running, succeeded, or failed — updating
as phases complete.

#### PBLIB-7

When the compile pipeline succeeds, the Library shall present a
registry form with fields for command, intent, and summary
policy, prefilled where derivable from the playbook source and
compiled output. When the form is submitted and passes registry
validation ([PBLIB-15](#pblib-15)), the
Library shall register the playbook by writing its entry —
including the role-profile mapping per [PBLIB-4](#pblib-4) —
into the shared config's `playbooks` map. A rejected submission
shall name the violated rule and shall cause no config write.

#### PBLIB-8

Where the compile toolchain cannot be resolved — no `slc`, or no
Node.js meeting the version floor
([PBLIB-11](#pblib-11)) — the Library
shall mark the compile flow unavailable, shall show guidance
naming each missing prerequisite and how to install or configure
it, and shall not start a compile.

#### PBLIB-9

While a compile is running, when a pipeline phase fails, the
Library shall mark that phase failed, shall surface that phase's
captured output, shall write nothing to the shared config, and
shall allow the user to retry the compile after editing the
source.

#### PBLIB-10

When a compiled playbook is registered, the Library shall list it
with its registry fields and enabled state, and shall indicate
that project sessions started before registration must be
restarted before the playbook is available in them.

### Pipeline Artifacts

#### PBLIB-22

When the user opens a configured playbook's pipeline view, the
Library shall present the playbook's compilation stages as three
tabs — Source (the workflow markdown the playbook was compiled
from), Gears (the GEARS spec items), and State machine (the
compiled FSM with its derived state list) — rendering markdown
stages as formatted text and the FSM as code.

#### PBLIB-23

Where a stage artifact cannot be located for a playbook, when the
pipeline view is opened, the Library shall show which stages are
available and name the missing ones, keeping the available stages
readable.

### Naming and Copy

#### PBLIB-26

The Library surface shall be presented to the user as "Playbooks":
the navigation entry and the surface's user-facing copy shall say
"Playbooks" or "playbook", reserving the word "library" for the
on-disk compiled-artifact store
([DR-010](../decisions/010-interface-craft.md) §2).

#### PBLIB-29

While a configured playbook is listed, the Library shall label the
playbook's registry source path with a muted "from" prefix that
stays visible outside any truncation, and shall expose the full,
untruncated path — introduced as the source the playbook was
loaded from — in the entry's tooltip.

### Compile Cancellation

#### PBLIB-27

While a compile is running, the Library shall render a secondary
cancel control beside the streamed compile progress; when the user
activates it, the Library shall request that the core abort the
compile ([DR-010](../decisions/010-interface-craft.md) §5), and
the compile progress log shall record the cancellation. The
compile start control shall remain disabled for the whole time the
compile runs.

### Config Gate

#### PBLIB-28

While the shared config is missing or invalid, the Library shall
replace its content with a gate that (1) explains that the Captain
can only run playbooks listed on this surface, (2) states that
playbooks need a valid config and directs the user to fix it in
Settings, and (3) renders "Settings" as a navigation control when
the host app provides surface navigation, falling back to plain
text otherwise.

## Internal Behavior

### Toolchain Resolution

#### PBLIB-11

When toolchain resolution is requested, the toolchain resolver
shall locate `slc` and `node` in this order: (1) an explicitly
configured toolchain path in app settings
([DR-004](../decisions/004-config-and-persistence.md)), then
(2) the captured login-shell `PATH`
([DR-004](../decisions/004-config-and-persistence.md)). It shall
verify that the resolved Node.js satisfies the version floor
required by `slc`
([DR-005](../decisions/005-compilation-integration.md)). When any
prerequisite cannot be resolved, it shall return an
unavailability result naming that prerequisite and the locations
attempted, and shall spawn no process.

### Compile Execution

#### PBLIB-12

When a compile is started for playbook id `<id>`, the compile
runner shall run `slc` as an external child process in a
per-playbook directory `<library-root>/<id>/` under the
app-managed library root
([DR-004](../decisions/004-config-and-persistence.md)),
materializing in-app source text as a markdown file there and
linking the app-bundled runtime contract
([DR-005](../decisions/005-compilation-integration.md)). It shall
capture the process output per pipeline phase, reporting phase
transitions for progress ([PBLIB-6](#pblib-6))
and the failing phase's output on failure
([PBLIB-9](#pblib-9)). Compiled
outputs of a previously successful compile for the same id shall
be replaced only after the new compile succeeds.

### Registry Generation

#### PBLIB-13

When `slc` completes successfully, the registry generator shall
derive `idleStateId`, `finalStateId`, and `parkStateIds` by
introspecting the emitted machine definition
([DR-005](../decisions/005-compilation-integration.md)), each
derived id naming a state present in that machine, and shall
report them as compile metadata for display
([PBLIB-22](#pblib-22)) — never as registry-entry fields
([DR-014](../decisions/014-released-toolchain.md)). When a
derivation is ambiguous, the registry generator shall surface the
candidate state ids for user selection in the registry form
([PBLIB-7](#pblib-7)) instead of
choosing silently.

#### PBLIB-14

When the registry form
([PBLIB-7](#pblib-7)) is submitted
with valid entries, the registry generator shall emit a registry
manifest module into the playbook's library directory as a
normalization wrapper over the `slc`-emitted registry entry
([DR-014](../decisions/014-released-toolchain.md)): the user's
command and intent override the entry's, the entry's role ids are
lowercased for the host boundary with player ids re-cased to the
entry's canonical casing at the port seam, and the module carries
the registry-contract marker. A derived role id that cannot form
a valid host player id, or two role ids colliding after
lowercasing, shall fail the compile naming the offending role.
It shall return the manifest path for the config entry's `from`
key and the derived role ids.

### Registry Validation

#### PBLIB-15

When a registry entry is about to be registered into the shared
config, the registry validator shall apply the same fail-closed
rules the playbook loader applies at load
([DR-004](../decisions/004-config-and-persistence.md)) —
including: the `playbooks` key equals the manifest id; the
manifest at `from` imports successfully; no duplicate id or
command among configured playbooks; no reserved captain role
among role names; every required role resolved; at least one
visible role; no profile-id-vs-adapter-shorthand collision — and
shall reject a violating registration naming the violated rule,
leaving the shared config file unmodified.

### Config Writes

#### PBLIB-32

When a registration writes the `playbooks.<id>` entry after a
compile, the compile flow shall re-key the submitted role-profile
assignments onto the derived role ids
([PBLIB-14](#pblib-14)) by case-insensitive name match; when a
derived role matches no assignment, the compile flow shall fail
naming the derived roles and the unmatched ones, shall write no
config change, and shall keep the compiled artifacts so a
corrected submission can register without recompiling.

#### PBLIB-33

When playbook loading imports a config `from` module that is a
file path, and the module carries no registry-contract marker
([PBLIB-14](#pblib-14)), the registry validator shall treat the
config as invalid with guidance naming the playbook and
recompilation as the remedy
([DR-014](../decisions/014-released-toolchain.md)); a package
specifier `from` shall not require the marker.

#### PBLIB-16

When the config writer updates the shared config file — enabled
state ([PBLIB-3](#pblib-3)),
role-mapping edits
([PBLIB-4](#pblib-4)), or registration
([PBLIB-7](#pblib-7)) — it shall
preserve comments, key order, and formatting of untouched content
byte-for-byte, shall modify only the targeted keys, and shall
replace the file atomically so an interrupted write cannot leave
a partially written config.

### Pipeline Artifact Handling

#### PBLIB-24

When a client requests a playbook's artifacts, the core package
shall resolve them from the registry module's location: the
compiled library layout (`<id>.md`, `<id>.playbook/<id>.gears.md`,
`<id>.playbook/<id>.fsm.ts`) and the published-package layout used
by `@sublang/playbook` registries, serving each stage's content and
the state ids derived from the FSM over the protocol, and naming
absent stages without failing the request.

## Verification

### Compile Coverage

#### PBLIB-17
Where a stub `slc` executable that emits a valid compiled
playbook output is placed on the toolchain resolution path, when
the compile flow is driven end to end — source provided
([PBLIB-5](#pblib-5)), role names entered, registry form
submitted ([PBLIB-7](#pblib-7)) — the test suite shall assert
that the stub ran as an external process in the per-id library
directory ([PBLIB-12](#pblib-12)), that a registry manifest was
emitted whose entry passes the fail-closed registry validation
([PBLIB-15](#pblib-15)), that the shared config gained a
`playbooks.<id>` entry whose `from` resolves to that manifest
([PBLIB-14](#pblib-14)), and that the Library lists the new
playbook ([PBLIB-10](#pblib-10)).

#### PBLIB-18
Where no `slc` is resolvable, or the resolved Node.js fails the
version floor ([PBLIB-11](#pblib-11)), the test suite shall
assert that the compile flow is reported unavailable with
guidance naming the missing prerequisite ([PBLIB-8](#pblib-8)),
that no external process is spawned, and that the shared config
file is unmodified.

#### PBLIB-19
Where a stub `slc` fails at a known pipeline phase with error
output, when a compile is run, the test suite shall assert that
the failing phase is identified, that the phase's captured output
is surfaced ([PBLIB-9](#pblib-9)), that no config write occurs,
and that previously compiled outputs for the same playbook id
remain unchanged ([PBLIB-12](#pblib-12)).

### Registration and Config Coverage

#### PBLIB-20
When the registry form ([PBLIB-7](#pblib-7)) is submitted with an
entry violating a fail-closed rule, covering at least a command
duplicating an existing playbook's and an id failing the
`^[a-z][a-z0-9_-]*$` character rule
([DR-004](../decisions/004-config-and-persistence.md)), the test
suite shall assert that each submission is rejected naming the
violated rule ([PBLIB-15](#pblib-15)) and that the shared config
file bytes are unchanged.

#### PBLIB-21
Where the shared config file contains comments and entries
unrelated to the toggled playbook, when a playbook is disabled
and then re-enabled ([PBLIB-3](#pblib-3)), the test suite shall
assert after each write that comments and unrelated entries are
byte-identical to the original ([PBLIB-16](#pblib-16)) and that
the list reflects the new state, and after the round trip that
the playbook's entry is enabled again.

#### PBLIB-25

Where a playbook was compiled into the library directory, when its
artifacts are requested over the protocol, the test suite shall
assert the response carries the source markdown, the gears
markdown, the FSM code ([PBLIB-22](#pblib-22)), and the derived
state ids ([PBLIB-24](#pblib-24)); where a stage file is removed,
the test suite shall assert the response names the missing stage
while still serving the others ([PBLIB-24](#pblib-24)).

### Cancellation and Gate Coverage

#### PBLIB-30

While a compile driven through the app store is running, the test
suite shall assert that a cancel control is rendered beside the
compile progress output, that activating it issues the compile
abort command for the running playbook id
([PBLIB-27](#pblib-27)), that the recorded cancellation appears
in the progress log, and that the compile start control stays
disabled until the compile settles.

#### PBLIB-31

Where the shared config state is missing or invalid, the test
suite shall assert that the Library renders the config gate — the
Captain-scope explanation and the fix-it-in-Settings direction
([PBLIB-28](#pblib-28)) — with "Settings" as an activatable
navigation control when a navigation callback is supplied and as
plain text when it is not, and that no playbook list or compile
form is rendered.
