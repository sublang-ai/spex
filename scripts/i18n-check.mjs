// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The catalog gate (localization-7, localization-8), shared by every
// package that speaks: run from the package directory, it reads that
// package's `lingui.config.js` and fails when
//
//   - a catalog does not list exactly the messages the source uses,
//   - a translated locale leaves an entry untranslated, or
//   - a message does not compile as ICU MessageFormat.
//
// Lingui 6.7 ships no `check` command, so this drives the same API its
// `extract` and `compile` commands drive — and, unlike them, writes
// nothing: a check that repaired the catalog it checks would pass on a
// source nobody had translated.

import { join, relative } from "node:path";

import { getConfig } from "@lingui/conf";
import { createCompiledCatalog, getCatalogs } from "@lingui/cli/api";

const packageDir = process.cwd();
const config = getConfig({
  cwd: packageDir,
  configPath: join(packageDir, "lingui.config.js"),
});

const failures = [];
const report = (locale, problem, items) => {
  failures.push(
    `${locale}: ${problem}\n${items.map((item) => `    ${item}`).join("\n")}`,
  );
};

for (const catalog of await getCatalogs(config)) {
  const extracted = await catalog.collect();
  if (!extracted) {
    failures.push(`could not extract messages from ${catalog.include.join(", ")}`);
    break;
  }
  const source = Object.keys(extracted);
  const onDisk = await catalog.readAll(config.locales);

  for (const locale of config.locales) {
    const entries = onDisk[locale] ?? {};
    const listed = Object.keys(entries);

    const missing = source.filter((id) => !(id in entries));
    if (missing.length) {
      report(locale, "the source uses messages the catalog does not list", missing);
    }
    const obsolete = listed.filter((id) => !source.includes(id));
    if (obsolete.length) {
      report(locale, "the catalog lists messages no source uses", obsolete);
    }

    if (locale !== config.sourceLocale) {
      const untranslated = listed.filter((id) => !entries[id].translation);
      if (untranslated.length) {
        report(locale, "entries carry no translation", untranslated);
      }
    }

    // What the runtime would hold: the translation, or the English id
    // where a source-locale entry states it in itself.
    const messages = Object.fromEntries(
      listed.map((id) => [id, entries[id].translation || entries[id].message || id]),
    );
    const { errors } = createCompiledCatalog(locale, messages, {
      strict: false,
      namespace: "ts",
    });
    if (errors.length) {
      report(
        locale,
        "messages do not compile as ICU MessageFormat",
        errors.map(({ id, error }) => `${id}: ${error.message}`),
      );
    }
  }
}

const where = relative(process.env.INIT_CWD ?? packageDir, packageDir) || ".";
if (failures.length) {
  console.error(
    `Catalog check failed for ${config.locales.join(", ")}:\n\n${failures.join("\n\n")}\n\n` +
      `Run \`npm run i18n:extract\` in ${where} and translate every new entry.`,
  );
  process.exit(1);
}

console.log(`Catalogs checked: ${config.locales.join(", ")} whole and compiling.`);
