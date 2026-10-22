#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

# The team server's install script over a source release (hub-7): a
# stub naming its steps, refusing to run until they are written.
#
# Run as root from a release checkout on a Linux host with systemd and
# sudo, it will:
#
#  1. build the server shell and the hub from this checkout
#     (`npm ci && npm run build`), installing no binary the release does
#     not build from source;
#  2. install the built checkout under /opt/spex/app, the helper
#     apps/hub/bin/spex-seatctl as /opt/spex/libexec/spex-seatctl
#     (root:root, 0755), the units deploy/spex-hub.service and
#     deploy/spex-seat@.service under /etc/systemd/system, and
#     deploy/spex-hub.sudoers as /etc/sudoers.d/spex-hub (0440, checked
#     with `visudo -cf`);
#  3. create the hub's account and group spex-hub and the seats' group
#     spex-seats, then `systemctl daemon-reload`;
#  4. print the three files the administrator writes before
#     `spex-hub attach`:
#       /etc/spex/server.env   SPEX_HOST_URL, SPEX_SERVER_ID and
#                              SPEX_SERVER_NAME, root:root 0644
#       /etc/spex/agents.env   the shared agent sign-ins as NAME=value
#                              lines, root:spex-seats 0640
#       the TLS certificate and key of the server's address, readable
#       by spex-hub;
#     and the commands that follow:
#       sudo -u spex-hub node /opt/spex/app/apps/hub/dist/main.js attach \
#         --state-dir=/var/lib/spex-hub --instance=<url> \
#         --server-id=<id> --address=<https origin> \
#         --tls-cert=<file> --tls-key=<file> --token-file=<file>
#       systemctl enable --now spex-hub

set -euo pipefail
echo "install.sh: not written yet; follow the steps in its header" >&2
exit 1
