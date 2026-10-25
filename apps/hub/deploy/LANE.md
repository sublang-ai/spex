<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# The privileged lane (hub-10)

`apps/hub/scripts/privileged-lane.sh` runs `privileged-lane.mjs` as root on a disposable Linux host with systemd and sudo, from a release checkout outside any home, with Node.js 22.19 or later at `/usr/bin/node`.
It installs the hub with `deploy/install.sh`, attaches it to a stand-in instance it serves on the loopback, admits two members and prints one PASS or FAIL line per assertion; it exits 1 on any FAIL and keeps its output in `/root/lane-logs/`.
It refuses a host holding an earlier install unless `--fresh`, which removes that install first.
The stubborn agent is put in the seat unit's control group through `cgroup.procs`, not started by a turn of the seat's core.

## Running it

```sh
multipass launch 24.04 --name spex-lane --cpus 2 --memory 4G --disk 24G
git archive --format=tar HEAD > spex.tar
multipass transfer spex.tar spex-lane:/home/ubuntu/spex.tar
multipass exec spex-lane -- sudo bash -c '
  install -d -m 0755 /usr/local/src/spex &&
  tar --no-same-owner -xf /home/ubuntu/spex.tar -C /usr/local/src/spex'
# Node.js 22 at /usr/bin/node, e.g. the nodejs.org tarball under
# /usr/local/lib/nodejs, owned by root, linked from /usr/bin.
multipass exec spex-lane -- sudo LANE_COMMIT=<commit> \
  /usr/local/src/spex/apps/hub/scripts/privileged-lane.sh [--fresh]
multipass delete spex-lane && multipass purge
```

## On CI

Since [DR-149](../../../specs/decisions/149-the-privileged-lane-runs-on-ci.md) the lane runs on GitHub's Ubuntu runner by the workflow `.github/workflows/hub-lane.yml`: on a nightly schedule, on a push to `main` that touches `apps/hub/` or `apps/server/`, on a pull request that changes the workflow itself, and on request (`gh workflow run hub-lane.yml`).
The workflow prepares the runner as the procedure above prepares a host — the newest Node 22 from nodejs.org under `/usr/lib/nodejs`, linked from `/usr/bin` and `/usr/local/bin`; `/opt` made root's alone, as a plain host has it, since the runner leaves it writable for its toolcache; the commit's tree unpacked by `git archive` into `/usr/local/src/spex` — runs `privileged-lane.sh` as root, and keeps the lane's redacted output as the artifact `hub-lane-log`.
It is no required check of a pull request.
The procedure above stays the fallback for a host of one's own.

## Accepted run on CI

- Date: 2026-10-25 (04:40 UTC)
- Commit: 198edf0a, as the pull request sublang-ai/spex#246 merged it onto `main` for the run (6256dce940f3342e9bfa18faeadfbd4d3d71ae37); workflow run 40162710625
- Host: GitHub-hosted `ubuntu-latest` — Ubuntu 24.04.5 LTS, kernel 6.17.0-1022-azure, systemd 255 (255.4-1ubuntu8.17), sudo 1.9.15p5 — with Node.js 22.23.4 from nodejs.org under `/usr/lib/nodejs`
- Result: 97 passed, 0 failed, the sweep's phase of [DR-148](../../../specs/decisions/148-a-lapsed-seat-is-stopped-by-a-sweep.md) among them for the first time: with the hub's unit stopped, the sweep stopped the seat 43.5 s after its lease's end, its files standing, and the restarted hub recorded the lease ended.
- Noted: the first seat's start on the fresh runner took 30 s, at the hub's thirty-second bound (hub-2), where the second took 2 s and the by-hand run's took 2 s; the run before this one, on the same code, saw no answer to that admission within the lane's 60 s and failed there. A repeat is read from the journals the workflow now keeps on a failure.

## Accepted run by hand

- Date: 2026-10-22 (11:47 UTC)
- Commit: 53c25bc3a08e7077b16a8ebf040fdc7db5ed91bd, from `git archive`
- Host: Ubuntu 24.04.5 LTS (arm64) under Multipass 1.16.1 on macOS, launched from the release's cloud image checked against its SHA256SUMS; kernel 6.8.0-147-generic, systemd 255, sudo 1.9.15p5
- Node.js: 22.23.4 (nodejs.org linux-arm64 tarball)
- The VM had no outbound network, so `npm ci` ran with `npm_config_offline=true` from `/var/cache/spex-hub-npm`, seeded with the lockfile's linux-arm64 tarballs (each checked against its lockfile integrity), the one packument the lockfile leaves unresolved (`packages/ui/node_modules/@vitejs/plugin-react`) and the better-sqlite3 prebuilt for Node ABI 127.
- Result: 78 passed, 0 failed.

```text
PASS hub-10 [hub-7] install.sh run by an account other than root refuses with 77
PASS hub-10 [hub-7] the refused run changed nothing: no account, group, prefix, unit, fragment or /etc/spex
PASS hub-10 [hub-7] install.sh as root builds and installs from the checkout (22 s)
PASS hub-10 [hub-7] the hub's system account spex-hub, in its group spex-hub, with no login shell, its home the state directory
PASS hub-10 [hub-7] the seats' group spex-seats exists
PASS hub-10 [hub-8] the hub's state directory is spex-hub's alone (0700)
PASS hub-10 [hub-4] the helper is installed root:root 0755
PASS hub-10 [hub-7] the spex-hub command is installed root:root 0755
PASS hub-10 [hub-7] the unit spex-hub.service is installed root:root 0644
PASS hub-10 [hub-7] the unit spex-seat@.service is installed root:root 0644
PASS hub-10 [hub-4] systemd reads the seat unit: User=spex-<id>, KillMode=mixed, TimeoutStopSec=30s, above the core's own bounds
PASS hub-10 [hub-4] the sudoers fragment is installed root:root 0440
PASS hub-10 [hub-4] the sudoers fragment passes visudo -cf
PASS hub-10 [hub-4] sudo lets spex-hub run the helper's four forms as root and neither a shell nor another program
PASS hub-10 [hub-4] the tmpfiles fragment is installed root:root 0644
PASS hub-10 [hub-4] the tmpfiles fragment made /run/spex and /run/spex/seats root:root 0711
PASS hub-10 [hub-7] the shared credential file is made empty, root:spex-seats 0640
PASS hub-10 [hub-7] the spex-hub command runs as the hub's account
PASS hub-10 [hub-7] install.sh prints the four files to write and the attach and enable commands
PASS hub-10 [hub-1] a self-signed TLS pair for 127.0.0.1 is made
PASS hub-10 [hub-7] the administrator's files stand as install.sh asked: server.env 0644, server.token root:spex-hub 0640, agents.env root:spex-seats 0640, the key readable by spex-hub
PASS hub-10 [hub-7] install.sh runs again and updates the installed files
PASS hub-10 [hub-7] the second run leaves the administrator's files as they were
PASS hub-10 [hub-7] the second run leaves the hub's account and the groups as they were
PASS hub-10 [hub-1] the printed attach command, filled in, attaches the server as spex-hub
PASS hub-10 [hub-1] [hub-8] the hub keeps the server and its token in its own state, owner-only
PASS hub-10 [hub-2] systemctl enable --now spex-hub starts the hub
PASS hub-10 [hub-2] the hub serves https://127.0.0.1:8443 over TLS with the administrator's certificate
PASS hub-10 [hub-2] the hub runs as spex-hub
PASS hub-10 [hub-2] [hub-4] POST /admit for ada-lane (4100001) answers 200 with the seat's endpoint, a bearer and the lease's expiry (2 s, the seat started)
PASS hub-10 [hub-2] the same ticket presented again answers 401 ticket_invalid
PASS hub-10 [hub-2] [hub-4] POST /admit for bob-lane (4100002) answers 200 with the seat's endpoint, a bearer and the lease's expiry (1 s, the seat started)
PASS hub-10 [hub-4] the helper made the account spex-4100001 in the group spex-seats, not in the hub's group
PASS hub-10 [hub-4] spex-4100001's home is readable by that account alone (0700)
PASS hub-10 [hub-4] the unit spex-seat@4100001.service is active and every process in its control group runs as spex-4100001
PASS hub-10 [hub-4] the helper made the account spex-4100002 in the group spex-seats, not in the hub's group
PASS hub-10 [hub-4] spex-4100002's home is readable by that account alone (0700)
PASS hub-10 [hub-4] the unit spex-seat@4100002.service is active and every process in its control group runs as spex-4100002
PASS hub-10 [hub-4] spex-4100001 cannot read spex-4100002's home: test -r fails, ls fails, a file there cannot be opened
PASS hub-10 [hub-4] spex-4100002 cannot read spex-4100001's home: test -r fails, ls fails, a file there cannot be opened
PASS hub-10 [hub-4] the group spex-hub holds the hub's account alone
PASS hub-10 [hub-4] the seat's runtime directory, token and socket carry spex-4100001 as owner, spex-hub as group, nothing for others
PASS hub-10 [hub-4] /run/spex/seats/4100001/token is read by spex-hub and spex-4100001, and neither by spex-4100002 nor by nobody
PASS hub-10 [hub-4] /run/spex/seats/4100001/core.sock admits a connection from spex-hub and spex-4100001, and refuses spex-4100002 and nobody (EACCES)
PASS hub-10 [hub-4] the seat's runtime directory, token and socket carry spex-4100002 as owner, spex-hub as group, nothing for others
PASS hub-10 [hub-4] /run/spex/seats/4100002/token is read by spex-hub and spex-4100002, and neither by spex-4100001 nor by nobody
PASS hub-10 [hub-4] /run/spex/seats/4100002/core.sock admits a connection from spex-hub and spex-4100002, and refuses spex-4100001 and nobody (EACCES)
PASS hub-10 [hub-3] a relay opens with the bearer in the Authorization header and no Origin
PASS hub-10 [hub-3] the relay reaches the seat's core: its hello, then a project.list round trip
PASS hub-10 [hub-3] a relay with an Origin is refused 403, another seat's bearer or none 401
PASS hub-10 [hub-5] the seat's account writes a file in its home
PASS hub-10 [hub-5] the stubborn agent starts with its child
PASS hub-10 [hub-5] the stubborn agent 7980 and its child 7987 run as spex-4100001 in spex-seat@4100001.service's control group
PASS hub-10 [hub-5] the agent and its child outlive a SIGTERM: they are stubborn
PASS hub-10 [hub-2] ada-lane is admitted again on a lease of 20 s
PASS hub-10 [hub-3] a relay opens on the new bearer
PASS hub-10 [hub-5] spex-seat@4100001.service stops after the lease's end
PASS hub-10 [hub-5] the hub stopped the seat at the lease's end (0.05 s after it)
PASS hub-10 [hub-4] [hub-5] the unit stopped within its TimeoutStopSec (0.01 s of 30 s)
PASS hub-10 [hub-4] [hub-5] the stop killed the stubborn agent and its child; no process is left in the seat's control group
PASS hub-10 [hub-3] [hub-5] the lease's end closed the member's relay with 4401
PASS hub-10 [hub-4] the core's graceful stop ran first: the main process 7758 exited on SIGTERM unkilled and released its home's lease
PASS hub-10 [hub-5] the seat's files stand: every path of /home/spex-4100001 before the stop but the core's own lease and scratch is there after it, the seat's work intact
PASS hub-10 [hub-5] the other seat, spex-seat@4100002.service, runs on
PASS hub-10 [hub-6] spex-hub status lists the stopped seat's lease ended and the other seat running
PASS hub-10 [hub-6] spex-4100001 holds an app token file and a code-credentials file under ~/.spex/local
PASS hub-10 [hub-6] spex-4100002 holds an app token file and a code-credentials file under ~/.spex/local
PASS hub-10 [hub-6] spex-hub retire stops and wipes both seats and says a group Owner retires the server at the instance
PASS hub-10 [hub-6] spex-seat@4100001.service is stopped
PASS hub-10 [hub-6] /home/spex-4100001 stands with its files, ~/.spex/local's other files among them
PASS hub-10 [hub-4] [hub-6] retire removed spex-4100001's credentials.yaml and code-credentials.yaml
PASS hub-10 [hub-6] spex-seat@4100002.service is stopped
PASS hub-10 [hub-6] /home/spex-4100002 stands with its files, ~/.spex/local's other files among them
PASS hub-10 [hub-4] [hub-6] retire removed spex-4100002's credentials.yaml and code-credentials.yaml
PASS hub-10 [hub-6] [hub-8] the hub's state forgets the server token
PASS hub-10 [hub-6] spex-hub status says the server is retired
PASS hub-10 [hub-8] the journal of the hub and the seats (216 lines) holds no server token, bearer, seat token or agent sign-in
PASS hub-10 [hub-8] the lease table holds no bearer, its hash alone
```
