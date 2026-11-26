<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-001: Scaffold Localization

## Status

Accepted.
Amended by [DR-101](101-chinese-scaffolds-for-chinese-only-teams.md), [DR-234](234-translation-source-pins-stay-in-the-overlay.md).

## Context

- `spex scaffold` emits English-only specs templates.
- Teams authoring in another language need its writable syntax without forking the tool.
- Teams working only in that language also need to read the authoring rules and starter specs.
- English remains canonical.
- The first non-English target is Chinese (`zh`).

## Decision

### Language selection

- `spex scaffold [--lang <code>] [<path>]` selects the language for a fresh scaffold.
- `--lang` defaults to `en`; the initial supported codes are `{en, zh}`.
- `zh` means Simplified Chinese (`zh-Hans` [[2]]).
- Unsupported codes abort non-zero and list the supported codes.
- The authoring language is set by the first scaffold. In create mode, absent `specs/meta.md` uses the explicit `--lang`, or `en` when omitted. An existing `specs/meta.md` makes its meta-27 declaration active, or `en` when the file predates meta-27. An explicit `--lang` that mismatches the active language aborts non-zero rather than silently skipping the existing file under [[scaffold-4](../packages/scaffold.md#scaffold-4)].
- `spex scaffold --update --lang <code>` switches an existing scaffold's language, rewriting the bundled specs in the target language and leaving the project's own specs to a printed translation prompt [[scaffold-39](../packages/scaffold.md#scaffold-39)].
- `spex scaffold --update` without `--lang` reads the language from the existing meta-27 declaration (see [Language as a spec item](#language-as-a-spec-item)).

### Localization model

- English under `scaffold/` is the complete, canonical source.
- Localized files live in a sparse overlay `scaffold/i18n/<lang>/` that mirrors the same relative paths.
- Bundled file resolution uses the overlay when present and falls back to English otherwise.
- Localization adds meta-27 (declaring `en`) to the English base once as a language-neutral hook; later languages add overlay files only and do not edit the English base.

### Localization scope

- A language overlay translates the complete bundled spec tree ([DR-101](101-chinese-scaffolds-for-chinese-only-teams.md)); the root license text, the managed agent-instruction marker and body, and tool-facing support prompts stay in their current language.
- Item and record IDs, filenames, machine-readable markers, code syntax and citation targets keep their canonical forms.
- Every localized item body or non-item file that differs from English is source-pinned; file titles are the only unpinned difference.
- No word-level glossary ships.
- [DR-000](000-spec-structure-format.md) defers DR/IR headings, the GWT mapping and GEARS clause forms to the active `meta.md`, so localized scaffolds cannot make framework documents disagree.

### Authoritative translations

- Localized meta-6 and meta-7 draw on the published Chinese GEARS reference [[1]], which defines the clause meanings (静态前置条件 / 状态前置条件 / 触发条件 / 所要求的行为) and the GWT mapping.
- Exact Chinese wording is fixed in localized `meta.md`, not by this DR, so it stays anchored to the cited reference without a separate glossary.

### Language as a spec item

- meta-27 is a new framework item: spec content added for a project shall be authored in the language it declares; bundled instructions may remain English.
- `--update` reads the same item to select localized templates, keeping the language self-described in `meta.md` with no separate marker or configuration file.
- Agents read `meta.md` — reinforced by the `agent-specs.txt` pointer and `map.md` — before authoring: `--lang zh` writes a localized `meta.md` carrying meta-27, so new specs are authored in Chinese.
- Before overwriting framework files, `--update` resolves the language from the existing meta-27 declaration, or from `--lang` when given — which switches the tree [[scaffold-39](../packages/scaffold.md#scaffold-39)] — and stops rather than guessing where an existing `meta.md` declares none [[scaffold-53](../packages/scaffold.md#scaffold-53)].

### Overlay form and drift guard

- Localized files are full overlay files, not injected regions.
- Each language keeps its per-item and whole-file source pins in a manifest beside its `specs/` directory, never in the translated Markdown ([DR-234](234-translation-source-pins-stay-in-the-overlay.md)); the drift guard checks `meta.md` item completeness and those pins, and translated `map.md` preserves the English index's link targets.

### File-history manifest

- Localized overlay files are recorded in `scaffold/.file-history.json` under their overlay paths (for example, `i18n/zh/specs/map.md`). This extends [[scaffold-21](../packages/scaffold.md#scaffold-21)] from `scaffold/specs/` to `i18n/<lang>/` while preserving its per-path rule for base and overlay entries: the final hash equals that file's current bundled content.
- `--update` pristine detection ([[scaffold-22](../packages/scaffold.md#scaffold-22)]) becomes language-aware: a target is pristine when it matches a recognized version under its English base path or active-language overlay path.
- The manifest records one hash per *released* version plus one working entry for the current bundled content, rewritten in place between releases ([[scaffold-21](../packages/scaffold.md#scaffold-21)]). Pristine detection asks whether a target file is an untouched copy of something we shipped, and only a released version can be in a target tree, so a hash for an intermediate commit can never match: appending per commit grew the manifest without adding reachable states — `specs/meta.md` reached 48 entries against 3 released contents — and buried the released hashes that do the work.

## Consequences

- English remains the source of truth; localization is additive and opt-in.
- Generated specs are readable entirely in the target language, while requirement meanings stay those of the English source.
- GEARS terminology matches the published reference, avoiding a maintained glossary.
- Exact Chinese clause renderings live in localized `meta.md` (meta-6), informed by the cited reference [[1]]; this DR does not pin individual renderings such as `shall`.
- The authoring language is self-described in `meta.md`, so `--update` needs no hidden state.
- New languages are added by adding an `i18n/<lang>/` overlay.
- Full overlays duplicate canonical content, so the drift guard enforces source freshness per translated item or file; region injection was set aside for whole-file simplicity.
- `--update` must resolve the language before overwriting framework files.
- The authoring language is set by the first scaffold and changed afterwards only by `--update --lang` [[scaffold-39](../packages/scaffold.md#scaffold-39)]; on the create path a mismatched `--lang` still errors rather than silently diverging.
- The interface language is a separate choice sharing these language codes ([DR-078](078-the-interface-speaks-the-readers-language.md)).

## References

[1]: https://sublang.ai/zh/ref/gears-ai-ready-spec-syntax "GEARS：面向 AI 的规约语法（中文）"
[2]: https://www.w3.org/International/articles/language-tags/ "W3C — Language tags in HTML and XML"
