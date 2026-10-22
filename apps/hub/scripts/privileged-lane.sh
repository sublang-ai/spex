#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

# The privileged lane (hub-10): run privileged-lane.mjs beside this
# script as root on a disposable Linux host with systemd and sudo, from
# a release checkout outside any home (e.g. /usr/local/src/spex), with
# Node.js 22.19 or later at /usr/bin/node:
#
#   sudo apps/hub/scripts/privileged-lane.sh [--fresh]
#
# The run's output, PASS and FAIL lines with no secret, is kept in
# $LANE_LOGS (default /root/lane-logs) as lane-<UTC time>.log; the exit
# status is the driver's: 0 when every assertion passed. LANE_COMMIT,
# when set, names the commit the checkout was made from.

set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo "privileged-lane.sh: run as root (sudo $0)" >&2
  exit 77
fi
here=$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
logs=${LANE_LOGS:-/root/lane-logs}
install -d -m 0700 "$logs"
log="$logs/lane-$(date -u +%Y%m%dT%H%M%SZ).log"
set +e
/usr/bin/node "$here/privileged-lane.mjs" "$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
set -e
echo "privileged-lane.sh: the run's output is in $log (exit $status)"
exit "$status"
