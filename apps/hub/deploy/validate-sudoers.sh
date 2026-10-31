#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

# Validate the whole rendered fragment. sudo-rs has no requiretty setting;
# retry only that precise optional directive, never the command allowlist.
set -euo pipefail
[ "$#" -eq 1 ] || exit 64
fragment=$1
if diagnostics=$(LC_ALL=C visudo -cf "$fragment" 2>&1); then
  exit 0
fi
printf '%s\n' "$diagnostics" >&2
line=$(grep -nFx 'Defaults:spex-hub !requiretty' "$fragment") || exit 1
[[ "$line" != *$'\n'* ]] || exit 1
line=${line%%:*}
unsupported=false
while IFS= read -r diagnostic; do
  case "$diagnostic" in
    "$fragment:$line:"*)
      [[ "${diagnostic#"$fragment:$line:"}" =~ ^[0-9]+:\ syntax\ error:\ unknown\ setting:\ \'requiretty\'$ ]] && unsupported=true
      ;;
  esac
done <<<"$diagnostics"
$unsupported || exit 1
candidate=$(mktemp "${fragment}.XXXXXX")
trap 'rm -f -- "$candidate"' EXIT
sed '/^Defaults:spex-hub !requiretty$/d' "$fragment" >"$candidate"
LC_ALL=C visudo -cf "$candidate" >/dev/null || exit 1
cat -- "$candidate" >"$fragment"
