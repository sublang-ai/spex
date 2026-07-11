<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PBLIB: Playbook Library Acceptance Tests

## Intent

This spec defines required integration coverage for the Library
surface's compile, registration, and shared-config write paths,
where correctness spans the external `slc` process, generated
registry artifacts, and the shared config file.

## Compile Coverage

### PBLIB-17
Verifies: [PBLIB-5](../user/playbook-library.md#pblib-5), [PBLIB-7](../user/playbook-library.md#pblib-7), [PBLIB-10](../user/playbook-library.md#pblib-10), [PBLIB-12](../dev/playbook-library.md#pblib-12), [PBLIB-14](../dev/playbook-library.md#pblib-14)

Where a stub `slc` executable that emits a valid compiled
playbook output is placed on the toolchain resolution path, when
the compile flow is driven end to end — source provided, role
names entered, registry form submitted — the test suite shall
assert that the stub ran as an external process in the per-id
library directory, that a registry manifest was emitted whose
entry passes the fail-closed registry validation
([PBLIB-15](../dev/playbook-library.md#pblib-15)), that the
shared config gained a `playbooks.<id>` entry whose `from`
resolves to that manifest, and that the Library lists the new
playbook.

### PBLIB-18
Verifies: [PBLIB-8](../user/playbook-library.md#pblib-8), [PBLIB-11](../dev/playbook-library.md#pblib-11)

Where no `slc` is resolvable, or the resolved Node.js fails the
version floor, the test suite shall assert that the compile flow
is reported unavailable with guidance naming the missing
prerequisite, that no external process is spawned, and that the
shared config file is unmodified.

### PBLIB-19
Verifies: [PBLIB-9](../user/playbook-library.md#pblib-9), [PBLIB-12](../dev/playbook-library.md#pblib-12)

Where a stub `slc` fails at a known pipeline phase with error
output, when a compile is run, the test suite shall assert that
the failing phase is identified, that the phase's captured output
is surfaced, that no config write occurs, and that previously
compiled outputs for the same playbook id remain unchanged.

## Registration and Config Coverage

### PBLIB-20
Verifies: [PBLIB-7](../user/playbook-library.md#pblib-7), [PBLIB-15](../dev/playbook-library.md#pblib-15)

When the registry form is submitted with an entry violating a
fail-closed rule, covering at least a command duplicating an
existing playbook's and an id failing the `^[a-z][a-z0-9_-]*$`
character rule
([DR-004](../decisions/004-config-and-persistence.md)), the test
suite shall assert that each submission is rejected naming the
violated rule and that the shared config file bytes are
unchanged.

### PBLIB-21
Verifies: [PBLIB-3](../user/playbook-library.md#pblib-3), [PBLIB-16](../dev/playbook-library.md#pblib-16)

Where the shared config file contains comments and entries
unrelated to the toggled playbook, when a playbook is disabled
and then re-enabled, the test suite shall assert after each write
that comments and unrelated entries are byte-identical to the
original and that the list reflects the new state, and after the
round trip that the playbook's entry is enabled again.

### PBLIB-25

Verifies: [PBLIB-22](../user/playbook-library.md#pblib-22),
[PBLIB-24](../dev/playbook-library.md#pblib-24)

Where a playbook was compiled into the library directory, when its
artifacts are requested over the protocol, the test suite shall
assert the response carries the source markdown, the gears
markdown, the FSM code, and the derived state ids; where a stage
file is removed, the test suite shall assert the response names the
missing stage while still serving the others.

## Cancellation and Gate Coverage

### PBLIB-30

Verifies: [PBLIB-27](../user/playbook-library.md#pblib-27)

While a compile driven through the app store is running, the test
suite shall assert that a cancel control is rendered beside the
compile progress output, that activating it issues the compile
abort command for the running playbook id, that the recorded
cancellation appears in the progress log, and that the compile
start control stays disabled until the compile settles.

### PBLIB-31

Verifies: [PBLIB-28](../user/playbook-library.md#pblib-28)

Where the shared config state is missing or invalid, the test
suite shall assert that the Library renders the config gate — the
Captain-scope explanation and the fix-it-in-Settings direction —
with "Settings" as an activatable navigation control when a
navigation callback is supplied and as plain text when it is not,
and that no playbook list or compile form is rendered.
