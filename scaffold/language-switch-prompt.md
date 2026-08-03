<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Translate this project's own specs into the authoring language now declared by @specs/meta.md:

- Translate the prose of every spec file the project owns under @specs/ — package Intents, behavior and test statements, decision records, intent records, and @specs/map.md entries. The bundled framework files are already in the new language.
- Preserve every item ID, heading anchor, and citation target exactly: `[[pack-3](pack.md#pack-3)]` keeps its ID text and link, and `pack-3` stays `pack-3` in the heading it names.
- Use the section names the active @specs/meta.md defines for package files and records; do not invent alternatives.
- Leave untranslated what is not prose: file paths, identifiers, code, commands, `Authoring language:` and other machine-readable marker lines, and external reference URLs.
- Preserve meaning over style. Where a term is a defined concept in @specs/meta.md, translate it the way meta.md translates it, and keep one rendering per term throughout.
- Translate only. Do not add, drop, split, merge, or restructure any requirement while translating.
- Finish by running `spex lint` and resolving any error.
