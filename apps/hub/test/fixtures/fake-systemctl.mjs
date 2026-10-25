// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The tests' fake service manager (hub-9): `show -p ActiveState --value
// spex-seat@<id>.service` answered as systemctl answers it — `active`
// while the stub seat the fake helper started for <id> runs, its pid in
// FAKE_RUN_DIR/<id>/seat.pid a live process, else `inactive`, exit 0
// either way — and every other invocation refused with 64 and its usage
// line. Every call is logged to FAKE_SYSTEMCTL_LOG when it is set.

import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const logFile = process.env.FAKE_SYSTEMCTL_LOG;
const unit =
  argv.length === 5 && argv[0] === "show" && argv[1] === "-p" && argv[2] === "ActiveState" && argv[3] === "--value"
    ? /^spex-seat@([0-9]{1,20})\.service$/.exec(argv[4])
    : null;

if (logFile) appendFileSync(logFile, `${JSON.stringify(unit ? { argv } : { argv, refused: true })}\n`);

if (!unit) {
  console.error("usage: systemctl show -p ActiveState --value spex-seat@<id>.service");
  process.exit(64);
}

function running(id) {
  try {
    process.kill(Number(readFileSync(join(process.env.FAKE_RUN_DIR, id, "seat.pid"), "utf8")), 0);
    return true;
  } catch {
    return false;
  }
}

console.log(running(unit[1]) ? "active" : "inactive");
