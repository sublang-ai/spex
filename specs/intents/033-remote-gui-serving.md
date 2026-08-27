<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-033: Remote GUI Serving

## Status

Done

## Intent

Let a user run Spex headless on a machine they own and browse its GUI remotely through one tokenized URL, per [DR-033](../decisions/033-remote-gui-serving.md) and the [server-shell](../packages/server-shell.md) package.

## Deliverables

- [x] DR-033, the server-shell package, and the amended core-service endpoint items, lint-clean.
- [x] Core: shell-attached HTTP endpoint mode and same-host origin admission, covered by [[core-service-38](../packages/core-service.md#core-service-38)].
- [x] UI: served-page endpoint resolution — same-origin connect, token adoption and scrub — covered by [[server-shell-13](../packages/server-shell.md#server-shell-13)].
- [x] `apps/server`: the server shell CLI with staged UI, TLS, bind safety, and shutdown, covered by [[server-shell-9](../packages/server-shell.md#server-shell-9)]–[[server-shell-12](../packages/server-shell.md#server-shell-12)].

## Tasks

1. Author DR-033 and the server-shell package; amend core-service-1/-24 and the map.
2. Core: `httpServer` attach option, same-host origin admission, endpoint integration test.
3. UI: served-page core-URL resolution with token adoption, scrub, and page-session reuse, with tests.
4. `apps/server`: CLI, static serving with CSP retarget, TLS, bind refusal, shutdown, staging script, integration tests.

## Verification

`spex lint` clean; workspace test suites green including the new endpoint, resolution, and server-shell tests; a live check serving the real bundle to a browser over a tokenized URL.
