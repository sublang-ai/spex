<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Course Website Spec Demo

This directory is a specification-only example project for Spex.
It describes a minimal private course website; it contains no application code.
Open `demo/` as the project and `demo/specs/` as its spec tree.

The demo deliberately exercises a proposed next revision of the Spex convention:

- one cohesive file per package;
- an explicit final package `Binding` section declaring users, owned concepts, required and provided contracts, exclusions, and reuse intent;
- external behavior as the language visible to a package's named human users;
- internal behavior as hidden state, invariants, and collaborator contracts, not source-code design;
- `compositions/` rather than `interactions/` for cross-package outcomes;
- stable `<PACKAGE>-0` binding-contract items that other packages may consume without seeing hidden behavior;
- `Composes:` links from a system scenario to user-visible package behavior, `Binds:` links for provided-to-received package contracts, and `Verifies:` links from acceptance checks to that scenario;
- nested directories under `packages/` and `compositions/` as navigation-only collections.

The current Spex linter and desktop parser do not yet implement this proposed revision.
In particular, they know `interactions/`, not `compositions/`, and the current package format has no final `Binding` section.
This demo is therefore both product input and a concrete compatibility fixture for that follow-up work.

`compositions/` is intentional: these files specify how independently understandable package contracts combine into system outcomes.
The word `interactions` remains available for user-interface interaction design and is therefore less precise here.

Start with [the spec map](specs/map.md), then read the package files involved in a composition.
