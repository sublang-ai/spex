<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-188: Registry Sign-in Opens the Browser

## Status

Accepted (2026-11-02) on approval of the solution for issue #326.
Amends [DR-127](127-a-home-signed-in-to-several-instances.md) in the desktop's permitted sign-in origins and completes [DR-168](168-independent-package-registry.md) in independent registry sign-in from the app.

## Context

- Registry sign-in creates no Space entry, but the desktop's browser opener permits only origins listed as Spaces or named by the running Space sign-in.
- A home with no Spaces therefore cannot open its registry sign-in automatically.
- The manual sign-in link cancels navigation before asking the same opener and ignores a refusal or failure, leaving the reader no working fallback.

## Decision

- The native browser opener also permits the origin of each registry sign-in currently running.
  A registry's configuration, cached metadata or saved account alone grants no permission to open it automatically.
  Ending one flow removes only its permission; another running flow or a listed Space can still permit that origin.
- Automatic opening keeps the existing exact-origin, transport and URL-credential checks.
- The shared Space and registry continuation link is an ordinary external link carrying the complete sign-in URL, independent of the automatic opener's presence or result.
  On the desktop, activating it uses the shell's existing external-link behavior; in a browser, it opens a new tab.

## Consequences

- A registry-only home can sign in from the app without creating a Space or changing its Space account state.
- Integration coverage exercises registry-only opening and the lifetime of its permission, plus manual activation after automatic opening succeeds, refuses, fails or is unavailable.
