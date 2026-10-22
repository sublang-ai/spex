<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-110: Package Required Runtime Options

## Status

Implemented and independently reviewed (2026-10-21).

## Intent

Package a structurally valid compiled entry without inventing an absent runtime configuration.

## Deliverables

- [x] Keep required option validation at configuration and runtime admission.
- [x] Package entries with required options without constructing a runtime.
- [x] Verify compilation, repackaging and configured validation through the real bundler and loader.

## Tasks

1. Clarify the packaging boundary, remove its missing-options probe, and verify the integrated paths.

## Verification

A real linked artifact with a required option must package while preserving that option's validator and configured refusal of missing or invalid options.
The regression first failed at the unchanged packaging probe with `catalog is required`.
The local candidate passed all 18 compile tests and the existing nine-test selected-project option-admission flow, plus the core build and spec lint (zero errors; one existing `core-service-41` sentence warning).
