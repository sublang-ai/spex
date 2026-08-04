<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-001: Scaffold Localization

## Status

Accepted

## Context

- `spex scaffold` emits English-only specs templates.
- Teams authoring in another language need its writable syntax without forking the tool.
- Generated specs should expose enough target-language syntax to author valid specs while instructions remain canonical English.
- English remains canonical; most bundled content stays English.
- The first non-English target is Chinese (`zh`).

## Decision

### Language selection

- `spex scaffold [--lang <code>] [<path>]` selects the language for a fresh scaffold.
- `--lang` defaults to `en`; the initial supported codes are `{en, zh}`.
- In this first cut, `zh` means Simplified Chinese (`zh-Hans` [[2]]).
- Unsupported codes abort non-zero and list the supported codes.
- The authoring language is set by the first scaffold. In create mode, absent `specs/meta.md` uses the explicit `--lang`, or `en` when omitted. An existing `specs/meta.md` makes its meta-27 declaration active, or `en` when the file predates meta-27. An explicit `--lang` that mismatches the active language aborts non-zero rather than silently skipping the existing file under [[scaffold-4](../packages/scaffold.md#scaffold-4)].
- Switching an existing scaffold's language was out of scope in this first cut; `spex scaffold --update --lang <code>` now performs it, rewriting the bundled specs in the target language and leaving the project's own specs to a printed translation prompt [[scaffold-39](../packages/scaffold.md#scaffold-39)].
- `spex scaffold --update` without `--lang` reads the language from the existing meta-27 declaration (see [Language as a spec item](#language-as-a-spec-item)).

### Localization model

- English under `scaffold/` is the complete, canonical source.
- Localized files live in a sparse overlay `scaffold/i18n/<lang>/` that mirrors the same relative paths.
- Bundled file resolution uses the overlay when present and falls back to English otherwise.
- Localization adds meta-27 (declaring `en`) to the English base once as a language-neutral hook; later languages add overlay files only and do not edit the English base.

### Localization scope

- Localization is limited to surface forms project authors must emit and the frequently read spec index.
- Outside the spec index, instructions and language-neutral mechanics stay English.
- Every localized item body or non-item file that differs from English is source-pinned; file titles are the only unpinned difference.
- No word-level glossary ships.

Localized for `zh` in the first cut:

| Target | Surface form | Why localize |
| --- | --- | --- |
| [[meta-4](../meta.md#meta-4)] | DR section-name literals | headings project authors must emit |
| [[meta-5](../meta.md#meta-5)] | IR section-name literals | headings project authors must emit |
| [[meta-6](../meta.md#meta-6)] | GEARS pattern + clause keywords | the keywords every item is written in |
| [[meta-7](../meta.md#meta-7)] | GWT-to-GEARS mapping | the mapping authors use for Chinese test items |
| [[meta-30](../meta.md#meta-30)] | package section-name literals | headings project authors must emit |
| [[meta-27](../meta.md#meta-27)] (new) | `Authoring language: zh` | selects Chinese authoring; its instruction stays English |
| `meta.md` reference `[1]` | Chinese GEARS source | supports the localized GEARS forms |
| `meta.md` | file title | allowed title-only convenience |
| `map.md` | complete spec index | read frequently by humans and updated in the project's language |

- The first cut keeps these English: [DR-000](000-spec-structure-format.md), the git and licensing packages, the sample intent record, the `agent-specs.txt` body, and every other meta item.
- meta-19 stays English because meta-4 and meta-30 own the localized reference-section names.
- [DR-000](000-spec-structure-format.md) is not translated, but it is clarified once so localized scaffolds cannot make framework documents disagree: it defers DR/IR headings, the GWT mapping, and GEARS clause forms to the active `meta.md` instead of restating English forms as normative.

### Authoritative translations

- Localized meta-6 and meta-7 draw on the published Chinese GEARS reference [[1]], which defines the clause meanings (静态前置条件 / 状态前置条件 / 触发条件 / 所要求的行为) and the GWT mapping.
- Exact Chinese wording is fixed in localized `meta.md`, not by this DR, so it stays anchored to the cited reference without a separate glossary.

### Language as a spec item

- meta-27 is a new framework item: spec content added for a project shall be authored in the language it declares; bundled instructions may remain English.
- `--update` reads the same item to select localized templates, keeping the language self-described in `meta.md` with no separate marker or configuration file.
- Agents read `meta.md` — reinforced by the `agent-specs.txt` pointer and `map.md` — before authoring: `--lang zh` writes a localized `meta.md` carrying meta-27, so new specs are authored in Chinese.
- Before overwriting framework files, `--update` resolves the language from the existing meta-27 declaration, or from `--lang` when given — which switches the tree [[scaffold-39](../packages/scaffold.md#scaffold-39)] — and stops rather than guessing where an existing `meta.md` declares none [[scaffold-53](../packages/scaffold.md#scaffold-53)].

### Overlay form and drift guard

- Localized `meta.md` and `map.md` are full overlay files, not injected regions.
- The drift guard checks `meta.md` item completeness and per-item pins, with a whole-file pin for translated non-item content; translated `map.md` carries one whole-file pin and preserves the English index's link targets.

### File-history manifest

- Localized overlay files are recorded in `scaffold/.file-history.json` under their overlay paths (for example, `i18n/zh/specs/map.md`). This extends [[scaffold-21](../packages/scaffold.md#scaffold-21)] from `scaffold/specs/` to `i18n/<lang>/` while preserving its per-path rule for base and overlay entries: the final hash equals that file's current bundled content.
- `--update` pristine detection ([[scaffold-22](../packages/scaffold.md#scaffold-22)]) becomes language-aware: a target is pristine when it matches a recognized version under its English base path or active-language overlay path.
- The manifest records one hash per *released* version plus one working entry for the current bundled content, rewritten in place between releases ([[scaffold-21](../packages/scaffold.md#scaffold-21)]). Pristine detection asks whether a target file is an untouched copy of something we shipped, and only a released version can be in a target tree, so a hash for an intermediate commit can never match: appending per commit grew the manifest without adding reachable states — `specs/meta.md` reached 48 entries against 3 released contents — and buried the released hashes that do the work.

## Consequences

- English remains the source of truth; localization is additive and opt-in.
- Generated specs expose a target-language index and the forms needed for authoring while other instructions remain English.
- GEARS terminology matches the published reference, avoiding a maintained glossary.
- Exact Chinese clause renderings live in localized `meta.md` (meta-6), informed by the cited reference [[1]]; this DR does not pin individual renderings such as `shall`.
- The authoring language is self-described in `meta.md`, so `--update` needs no hidden state.
- New languages are added by adding an `i18n/<lang>/` overlay.
- Full overlays duplicate canonical content, so the drift guard enforces source freshness per translated item or file; region injection was set aside for whole-file simplicity.
- `--update` must resolve the language before overwriting framework files.
- The authoring language is set by the first scaffold and changed afterwards only by `--update --lang` [[scaffold-39](../packages/scaffold.md#scaffold-39)]; on the create path a mismatched `--lang` still errors rather than silently diverging.
- The translated set expands only when another target-language form is necessary to author valid specs.

## References

[1]: https://sublang.ai/zh/ref/gears-ai-ready-spec-syntax "GEARS：面向 AI 的规约语法（中文）"
[2]: https://www.w3.org/International/articles/language-tags/ "W3C — Language tags in HTML and XML"
