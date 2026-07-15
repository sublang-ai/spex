<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-001: Scaffold Localization

## Status

Accepted

## Context

- `spex scaffold` emits English-only specs templates.
- Teams authoring in another language need generated specs in that language without forking the tool.
- Generated specs should read in the target language while the bundled translation surface stays minimal.
- English remains canonical; most bundled content stays English.
- The first non-English target is Chinese (`zh`).

## Decision

### Language selection

- `spex scaffold [--lang <code>] [<path>]` selects the language for a fresh scaffold.
- `--lang` defaults to `en`; the initial supported codes are `{en, zh}`.
- In this first cut, `zh` means Simplified Chinese (`zh-Hans` [[2]]).
- Unsupported codes abort non-zero and list the supported codes.
- The authoring language is set by the first scaffold. In create mode, absent `specs/meta.md` uses the explicit `--lang`, or `en` when omitted. An existing `specs/meta.md` makes its META-27 declaration active, or `en` when the file predates META-27. An explicit `--lang` that mismatches the active language aborts non-zero rather than silently skipping the existing file under [SCAF-4](../packages/scaffold.md#scaf-4).
- Switching an existing scaffold's language is out of scope and reserved for a future migration.
- `spex scaffold --update` rejects `--lang` and reads the language from the existing META-27 declaration (see [Language as a spec item](#language-as-a-spec-item)).

### Localization model

- English under `scaffold/` is the complete, canonical source.
- Localized files live in a sparse overlay `scaffold/i18n/<lang>/` that mirrors the same relative paths.
- Bundled file resolution uses the overlay when present and falls back to English otherwise.
- Localization adds META-27 (declaring `en`) to the English base once as a language-neutral hook; later languages add overlay files only and do not edit the English base.

### Localization scope

- A bundled file is localized only if it carries a surface form reproduced in generated specs — a heading, section title, or clause keyword — or is a living authoring surface that users and agents read and extend in the project's language, such as the spec index.
- Language-neutral mechanics (item IDs, citation links, package rules, path naming) stay English.
- A kept-English item must cite a localized surface form by item ID instead of hard-coding it (for example, the intent section required by [META-3](../meta.md#meta-3)); this keeps byte-identical parity valid across overlays.
- No word-level glossary ships.

Localized for `zh` in the first cut:

| Target | Surface form | Why localize |
| --- | --- | --- |
| [META-3](../meta.md#meta-3) | `## Intent` heading | appears in every item file |
| [META-4](../meta.md#meta-4) | DR section titles | headings in every decision record |
| [META-5](../meta.md#meta-5) | IR section titles | headings in every iteration record |
| [META-6](../meta.md#meta-6) | GEARS pattern + clause keywords | the keywords every item is written in |
| [META-7](../meta.md#meta-7) | GWT-to-GEARS mapping | companion to META-6 |
| [META-19](../meta.md#meta-19) | `## References` section convention | heading in specs that cite sources |
| META-27 (new) | authoring-language declaration | see [Language as a spec item](#language-as-a-spec-item) |
| `meta.md` reference `[1]` | GEARS reference URL | repointed to the Chinese page [[1]] |
| `map.md` | spec index | short, user-facing, agent-extended |

- The first cut keeps these English: [DR-000](000-spec-structure-format.md), the GIT and LIC packages, IR-000, the `agent-specs.txt` body, and every other META item.
- [DR-000](000-spec-structure-format.md) is not translated, but it is clarified once so localized scaffolds cannot make framework documents disagree: it defers DR/IR headings, the GWT mapping, and GEARS clause forms to the active `meta.md` instead of restating English forms as normative.

### Authoritative translations

- Localized META-6 and META-7 draw on the published Chinese GEARS reference [[1]], which defines the clause meanings (静态前置条件 / 状态前置条件 / 触发 / 所要求的行为) and the GWT mapping; this DR does not treat the reference as fixing the exact Chinese clause keywords.
- Exact Chinese surface wording is fixed in localized `meta.md` (META-6), not by this DR, so it stays anchored to the cited reference without a separate glossary.

### Language as a spec item

- META-27 is a new framework item: specs shall be authored in the language it declares.
- `--update` reads the same item to select localized templates, keeping the language self-described in `meta.md` with no separate marker or configuration file.
- Agents read `meta.md` — reinforced by the `agent-specs.txt` pointer and `map.md` — before authoring: `--lang zh` writes a localized `meta.md` carrying META-27, so new specs are authored in Chinese.
- Before overwriting framework files, `--update` reads the existing META-27 declaration, falls back to `en` when no declaration is present (a missing or pre-META-27 `meta.md`), and rejects `--lang`; deliberate language switching is out of scope for the first cut.

### Overlay form and drift guard

- Because several `meta.md` items are localized, each localized `meta.md` is a full overlay file, not injected regions.
- The drift guard tests three things: completeness — every base `meta.md` item appears in each overlay, so new base items cannot be silently dropped; kept-English parity — untranslated items are byte-identical between the base and each overlay, catching accidental edits; translation freshness — each translated overlay item is pinned to the canonical hash of its English source item, so the test fails when the source changes without the translation being refreshed (for example, META-6 changes in English but not in the `zh` overlay).

### File-history manifest

- Localized overlay files are recorded in `scaffold/.file-history.json` under their overlay paths (for example, `i18n/zh/specs/map.md`). This extends SCAF-21 from `scaffold/specs/` to `i18n/<lang>/` while preserving its per-path rule for base and overlay entries: the final hash equals that file's current bundled content.
- `--update` pristine detection ([SCAF-22](../packages/scaffold.md#scaf-22)) becomes language-aware: a target is pristine when it matches a recognized version under its English base path or active-language overlay path.

## Consequences

- English remains the source of truth; localization is additive and opt-in.
- Generated specs read in the target language while bundled translations stay small.
- GEARS terminology matches the published reference, avoiding a maintained glossary.
- Exact Chinese clause renderings live in localized `meta.md` (META-6), informed by the cited reference [[1]]; this DR does not pin individual renderings such as `shall`.
- The authoring language is self-described in `meta.md`, so `--update` needs no hidden state.
- New languages are added by adding an `i18n/<lang>/` overlay.
- `meta.md` mixes English mechanics with localized surface-form items, and full overlay files duplicate both, so the drift guard must enforce parity and translation freshness per overlay; region injection would avoid duplication but was set aside for whole-file simplicity.
- `--update` must resolve the language before overwriting framework files.
- The authoring language is immutable after the first scaffold in the first cut; a repo that chose the wrong language waits for the future migration path, and mismatched `--lang` on an existing scaffold errors rather than silently diverging.
- The translated set is a judgment call and may expand later (for example, META-20, the DR-000 item-syntax section, or seed examples).

## References

[1]: https://sublang.ai/zh/ref/gears-ai-ready-spec-syntax "GEARS：面向 AI 的规约语法（中文）"
[2]: https://www.w3.org/International/articles/language-tags/ "W3C — Language tags in HTML and XML"
