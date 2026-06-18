<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-001: Scaffold Localization

## Status

Accepted

## Context

- `spex scaffold` emits English-only specs templates.
- Teams authoring in another language want newly generated specs in that language without forking the tool.
- The goal is that generated specs read in the target language while the bundled translation surface stays minimal.
- English must remain the canonical source of truth; most bundled content stays English.
- The first non-English target is Chinese (`zh`).

## Decision

### Language selection

- `spex scaffold [<path>] [--lang <code>]` selects the scaffold language for a fresh scaffold.
- `--lang` defaults to `en`; the initial supported set is `{en, zh}`.
- For this first cut, `zh` is a Spex alias for Simplified Chinese (script subtag `zh-Hans` [[2]]); Traditional Chinese, if added later, will use a distinct code such as `zh-Hant`.
- An unsupported code aborts non-zero and lists the supported codes.
- The authoring language is fixed at the first scaffold. In create mode, when `specs/meta.md` is absent (a fresh scaffold) the language is the explicit `--lang` value, or `en` when `--lang` is omitted; when `specs/meta.md` already exists, its META-27 declaration is the active language — or `en` when the file predates META-27 — and an explicit `--lang` that mismatches the active language aborts non-zero rather than silently skipping the existing file under [SCAF-4](../user/scaffold.md#scaf-4).
- Switching an existing scaffold's language is out of scope and reserved for a future migration path.
- `spex scaffold --update` does not accept `--lang`; it likewise reads the language from the existing META-27 declaration (see [Language as a spec item](#language-as-a-spec-item)).

### Localization model

- English content under `scaffold/` is the complete, canonical source.
- Localized files live in a sparse overlay `scaffold/i18n/<lang>/` that mirrors the same relative paths.
- Resolving a bundled file uses the overlay version when present and falls back to English otherwise.
- Introducing localization adds META-27 (declaring `en`) to the English base once, as a language-neutral hook; thereafter, adding a language adds overlay files only and never edits the English base.

### Localization scope

- A bundled file is localized in one of two cases: (a) it carries a surface form the agent reproduces in generated specs — a heading, a section title, or a clause keyword; or (b) it is a living authoring surface that users and agents read and extend in the project's language, such as the spec index.
- Language-neutral mechanics (item IDs, citation links, package rules, path naming) stay English.
- A kept-English item must not hard-code a surface form that a localized item changes; instead it cites the localizing item by ID (for example, the intent section required by [META-3](../meta.md#meta-3)), which keeps kept-English byte-identical parity valid across overlays.
- No word-level glossary is shipped.

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

- Kept English in the first cut: [DR-000](000-spec-structure-format.md), the GIT and LIC packages, IR-000, the `agent-specs.txt` body, and every other META item.
- [DR-000](000-spec-structure-format.md) is not translated, but it is clarified once so the two framework documents in a localized scaffold cannot disagree: rather than restating English DR/IR headings, the GWT mapping, and GEARS clause forms as normative, it defers those surface forms to the active `meta.md`, which localized scaffolds render in the project's language.

### Authoritative translations

- The localized META-6 and META-7 draw on the published Chinese GEARS reference [[1]], which defines the clause meanings (静态前置条件 / 状态前置条件 / 触发 / 所要求的行为) and the GWT mapping; this DR does not treat the reference as fixing the exact Chinese clause keywords.
- The exact Chinese surface wording is fixed in the localized `meta.md` (META-6), not mandated by this DR, so it stays anchored to the cited reference without shipping a separate glossary.

### Language as a spec item

- META-27 is a new framework item whose primary role is an authoring rule: specs shall be authored in the language it declares.
- Because that rule names the language, the same item is the value `--update` reads to select localized templates; this dual use keeps the language self-described in `meta.md`, with no separate marker or configuration file.
- Agents read `meta.md` — reinforced by the `agent-specs.txt` pointer and `map.md` — before authoring, making the path explicit: `--lang zh` writes a localized `meta.md` carrying META-27, so new specs are authored in Chinese.
- `--update` derives the language from the existing META-27 declaration before overwriting framework files — `en` when no declaration is present (a missing or pre-META-27 `meta.md`) — and rejects a `--lang` argument; deliberate language switching is out of scope for the first cut.

### Overlay form and drift guard

- Because several `meta.md` items are localized, each localized `meta.md` is a full overlay file rather than a set of injected regions.
- The drift guard is a test with three parts: (a) completeness — every item in the base `meta.md` also appears in each overlay, so a newly added base item cannot be silently dropped; (b) kept-English parity — untranslated items are byte-identical between the base and every overlay, catching accidental edits; (c) translation freshness — each translated overlay item is pinned to the canonical hash of its English source item, so the test fails when the source changes without the translation being refreshed (for example a META-6 edited in English but not in the `zh` overlay).

### File-history manifest

- Localized overlay files are recorded in `scaffold/.file-history.json` under their own overlay paths (for example `i18n/zh/specs/map.md`). This extends SCAF-21's coverage from `scaffold/specs/` to the `i18n/<lang>/` overlay tree, while its per-path semantics — the final hash equals that file's current bundled content — are preserved for both base and overlay entries.
- `--update` pristine detection ([SCAF-22](../dev/scaffold.md#scaf-22)) becomes language-aware: a target is pristine when it matches a recognized version under either its English base path or its active-language overlay path.

## Consequences

- English remains the source of truth; localization is additive and opt-in.
- Generated specs read in the target language while the bundled translation surface stays small.
- GEARS terminology matches the published reference, avoiding a maintained glossary.
- Exact Chinese clause renderings live in the localized `meta.md` (META-6), informed by the cited reference [[1]]; this DR does not pin individual renderings such as the one for `shall`.
- The authoring language is self-described in `meta.md`, so `--update` needs no hidden state.
- New languages are added by dropping in an `i18n/<lang>/` overlay.
- `meta.md` becomes bilingual — English mechanics alongside localized surface-form items — and full overlay files duplicate both, so the drift guard must enforce parity and translation freshness per overlay; region injection would avoid the duplication but was set aside for whole-file simplicity.
- `--update` must resolve the language before overwriting framework files.
- The authoring language is immutable after the first scaffold in the first cut; a repo that chose the wrong language waits for the future migration path, and a mismatched `--lang` on an existing scaffold errors rather than silently diverging.
- The curated translate-set is a judgment call and may expand later (for example META-20, the DR-000 item-syntax section, or seed examples).
- Follow-ups: add META-27 to the bundled `meta.md`; clarify [DR-000](000-spec-structure-format.md) and its bundled copy to defer heading and clause surface forms to the active `meta.md`; rewrite base META-13, META-14, and META-15 once so they cite [META-3](../meta.md#meta-3) and [META-6](../meta.md#meta-6) by ID instead of hard-coding the `## Intent` heading and the GEARS keywords; extend the SCAF package ([SCAF-4](../user/scaffold.md#scaf-4), [SCAF-11](../user/scaffold.md#scaf-11), [SCAF-19](../user/scaffold.md#scaf-19)) for `--lang`, the existing-language mismatch error, overlay resolution, and language inference; extend the file-history manifest contract ([SCAF-21](../dev/scaffold.md#scaf-21)) to cover `i18n/<lang>/` overlay entries and make pristine detection ([SCAF-22](../dev/scaffold.md#scaf-22)) language-aware; add the three-part drift guard (completeness, kept-English parity, translation freshness); add an IR to implement.

## References

[1]: https://sublang.ai/zh/ref/gears-ai-ready-spec-syntax "GEARS：面向 AI 的规约语法（中文）"
[2]: https://www.w3.org/International/articles/language-tags/ "W3C — Language tags in HTML and XML"
