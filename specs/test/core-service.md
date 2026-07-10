<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CORE: Core Service Acceptance Tests

## Intent

This spec defines required integration coverage for the Spex core
service, exercised end to end over the WebSocket protocol against
the scripted fake adapter required by
[CORE-18](../dev/core-service.md#core-18).

## Session Coverage

### CORE-19
Verifies: [CORE-4](../user/core-service.md#core-4), [CORE-5](../user/core-service.md#core-5), [CORE-7](../user/core-service.md#core-7), [CORE-18](../dev/core-service.md#core-18)

Where the core service runs with a valid config and the scripted
fake adapter, the test suite shall connect a WebSocket client,
create a session for a temporary project directory, submit a Boss
turn, and assert that:

- the session's runtime working directory is the project directory;
- every non-hidden scripted record arrives on the session
  subscription in script order;
- the turn ends with a finished record;
- a second Boss submission during the turn is rejected with a busy
  error and starts no turn;
- no network connection is opened during the run.

## Record Visibility Coverage

### CORE-20
Verifies: [CORE-8](../user/core-service.md#core-8), [CORE-14](../dev/core-service.md#core-14)

Where the fake adapter script contains records marked hidden, the
test suite shall subscribe one client to the session and a second
client to the debug channel, and assert that the session subscriber
receives no hidden record while the debug subscriber receives every
hidden record.

## Configuration Coverage

### CORE-21
Verifies: [CORE-2](../user/core-service.md#core-2), [CORE-16](../dev/core-service.md#core-16)

Where the config file carries a defect from each launcher
fail-closed defect class recorded in
[DR-004](../decisions/004-config-and-persistence.md), the test suite
shall assert, per defect, that the core service reports a config
error naming the offending entry and rejects a session creation
request while that config is active.

## Persistence Coverage

### CORE-22
Verifies: [CORE-10](../user/core-service.md#core-10), [CORE-15](../dev/core-service.md#core-15)

Where a session has completed a Boss turn, the test suite shall stop
the core service, start it again on the same store file, and assert
that the session, its turns, its records (content and order), and
its usage totals are served identically after restart, and that a
session live at shutdown is reported as no longer live.

## Readiness Coverage

### CORE-23
Verifies: [CORE-9](../user/core-service.md#core-9)

Where the config defines both a profile whose adapter readiness
requirements are satisfied and one whose requirements are not (via
controlled environment variables and home-directory fixtures), the
test suite shall assert that readiness reporting marks each profile
accordingly and names the unmet requirement for the not-ready
profile.
