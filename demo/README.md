<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Course Website Spec Demo

This directory is a specification-only example project for Spex.
It describes a minimal course website with a public catalog and private video playback; it contains no application code.
Open `demo/` as the project and `demo/specs/` as its spec tree.

The demo deliberately exercises a proposed next revision of the Spex convention:

- one cohesive file per package;
- package-relative `External Behavior` for every guarantee a human, host, or component user may rely on;
- `Internal Behavior` for provider-neutral consumed requirements and private semantic invariants hidden from package users, never source-code design;
- human-readable domain shapes, policies, and state tables placed beside the behavior that needs them rather than collected in a machine-facing package manifest;
- reusable package sources left free of installation annotations and peer-Internal citations, with exact peer-External citations reserved for intentional fixed dependencies;
- `compositions/` rather than `interactions/` for installed bindings as well as cross-package outcomes;
- one authoritative Binding item for each installed External assembly or Internal supply seam, with package overlays derived from those items;
- Scenario items for system-user- or operator-meaningful outcomes, with `Composes:`, optional `Bindings:`, and acceptance `Verifies:` traces;
- replaceable code dependencies omitted from behavioral specs;
- nested directories under `packages/` and `compositions/` as navigation-only collections.

The current Spex linter and desktop parser do not yet implement this proposed revision.
In particular, they know `interactions/`, not the `Binding`/`Scenario` grammar and derived overlays proposed here.
This demo is therefore both product input and a concrete compatibility fixture for that follow-up work.

`compositions/` is intentional: these files specify how independently understandable package contracts combine into system outcomes.
The word `interactions` remains available for user-interface interaction design and is therefore less precise here.

New spec authors should start with [the authoring guidelines](guidelines.md), then use [the spec map](specs/map.md) to follow packages into concrete compositions.
