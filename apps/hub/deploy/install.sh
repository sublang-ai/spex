#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

# The team server's install script over a source release (hub-7). Run as
# root from a release checkout on a Linux host with systemd and sudo:
#
#   sudo apps/hub/deploy/install.sh [--prefix <dir>]
#
# The checkout is the one this script lies in, whatever the current
# directory; it lies outside the prefix and the prefix outside it. The
# script:
#
#  1. refuses, naming the mistake, before it changes anything, when it
#     lies in no release checkout, the prefix and the checkout overlap,
#     it runs as another user than root, or the host lacks Linux,
#     systemd as its init, sudo, visudo, /etc/systemd/system,
#     /etc/sudoers.d, an /etc/sudoers that reads /etc/sudoers.d
#     (@includedir or #includedir), /etc/tmpfiles.d, npm, or a node of
#     22.19 or later every account may run and root alone may replace;
#     it warns, and goes on, when a seat runs;
#  2. builds the server shell and the hub from the checkout (`npm ci`,
#     then `npm run build`, with no Electron download, as root with
#     HOME=/root and npm's cache in /var/cache/spex-hub-npm, so nothing
#     lands in the invoking user's home), installing no binary the
#     release does not build from source;
#  3. creates the seats' group spex-seats, the hub's group spex-hub and
#     its system account spex-hub with no login shell, its home the
#     hub's state directory /var/lib/spex-hub, spex-hub 0700, with the
#     seats' locks' directory under it (hub-8), and /etc/spex, root 0755;
#  4. installs the built checkout as <prefix>/app, less .git and the
#     checkout's local folders and files (.claude, .workshop-*,
#     test-results, playwright-report, .env, .env.*); the helper
#     bin/spex-seatctl as <prefix>/libexec/spex-seatctl root:root 0755;
#     the administrator's command deploy/spex-hub as <prefix>/bin/spex-hub
#     root:root 0755; deploy/spex-hub.tmpfiles as
#     /etc/tmpfiles.d/spex-hub.conf (applied at once); the units
#     deploy/spex-hub.service and deploy/spex-seat@.service, and the
#     sweep's deploy/spex-seat-reaper.service and
#     deploy/spex-seat-reaper.timer, under /etc/systemd/system; and
#     deploy/spex-hub.sudoers as /etc/sudoers.d/spex-hub root:root 0440,
#     checked with `visudo -cf` before it is put in place; then runs
#     `systemctl daemon-reload`, enables and starts the sweep's timer
#     (`systemctl enable --now spex-seat-reaper.timer`), starts the sweep
#     once and refuses where it does not run on this host, and checks
#     that sudo lets spex-hub run the helper;
#  5. makes /etc/spex/agents.env empty, root:spex-seats 0640, where it is
#     absent, since every seat's unit names it, and prints the four
#     files the administrator writes before `spex-hub attach` —
#     /etc/spex/server.env, /etc/spex/agents.env, the TLS material and
#     /etc/spex/server.token, which attach reads with --token-file — and
#     the attach and enable commands.
#
# Run again, it updates the installed files and leaves the accounts, the
# groups and the administrator's four files as they are. A running seat
# loads Spex's modules from <prefix>/app as it needs them, so a seat
# running while <prefix>/app is replaced may load modules of the new
# version from then on, beside the old ones already loaded: run the
# install while no seat runs, or evict the running seats first. The hub
# keeps the version it started with until it restarts. It reads no
# secret and prints none.
#
# The prefix is /opt/spex unless --prefix or SPEX_PREFIX names another:
# an absolute path under directories root alone may write. The units,
# the sudoers fragment and the command name /opt/spex and /usr/bin/node;
# this script writes them with the prefix and the node it found.
#
# Paths and modes, one table shared with bin/spex-seatctl, the units,
# the command, the tmpfiles and sudoers fragments, and the hub's defaults
# (DEFAULT_HELPER, DEFAULT_RUN_DIR and DEFAULT_STATE_DIR in apps/hub/src):
#
#   <prefix>/app                    root, readable by every account
#   <prefix>/libexec/spex-seatctl   root:root 0755, run through sudo
#   <prefix>/bin/spex-hub           root:root 0755, the administrator's command
#   /var/lib/spex-hub               spex-hub:spex-hub 0700, the hub's state
#   /run/spex, /run/spex/seats      root:root 0711, the seats' runtime base
#   /run/spex/seats/<id>            spex-<id>:spex-hub 2750, by the helper
#   /home/spex-<id>                 spex-<id> 0700, by the helper
#   /etc/spex                       root:root 0755
#   /etc/spex/server.env            root:root 0644, the administrator's
#   /etc/spex/agents.env            root:spex-seats 0640, the administrator's
#   /etc/spex/server.token          root:spex-hub 0640, the administrator's,
#                                   read by attach
#   /var/cache/spex-hub-npm         root:root 0700, the build's npm cache
#
# Exit status: 0 installed; 64 a usage mistake; 66 no release checkout;
# 77 not root; 69 a requirement missing; 78 an unsafe prefix or node;
# 70 a failed build or step, named.

set -euo pipefail
umask 022
LC_ALL=C
PATH="${PATH:+$PATH:}/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export LC_ALL PATH

readonly DEFAULT_PREFIX=/opt/spex
readonly UNIT_NODE=/usr/bin/node
readonly HUB_USER=spex-hub
readonly HUB_GROUP=spex-hub
readonly SEATS_GROUP=spex-seats
readonly STATE_DIR=/var/lib/spex-hub
readonly ETC_DIR=/etc/spex
readonly UNIT_DIR=/etc/systemd/system
readonly SUDOERS_DIR=/etc/sudoers.d
readonly SUDOERS=/etc/sudoers
readonly SUDOERS_READS_DIR='^[@#]includedir[[:space:]]+/etc/sudoers\.d'
readonly TMPFILES_FILE=/etc/tmpfiles.d/spex-hub.conf
readonly TOKEN_FILE=/etc/spex/server.token
readonly NPM_CACHE=/var/cache/spex-hub-npm
readonly NODE_MAJOR=22
readonly NODE_MINOR=19

usage() {
  echo "usage: sudo apps/hub/deploy/install.sh [--prefix <dir>]"
  echo "  --prefix <dir>  where Spex is installed (default $DEFAULT_PREFIX, or SPEX_PREFIX)"
}

refuse() { # <exit status> <mistake>
  echo "install.sh: $2" >&2
  exit "$1"
}

usage_refuse() {
  echo "install.sh: $1" >&2
  usage >&2
  exit 64
}

# The first directory from <path> up to / that an account other than
# root may write, printed; false when there is none.
writable_ancestor() {
  local dir=$1 owner mode
  while :; do
    if [ -e "$dir" ]; then
      read -r owner mode < <(stat -L -c '%u %a' -- "$dir")
      if [ "$owner" -ne 0 ] || (( (8#$mode & 8#022) != 0 )); then
        echo "$dir"
        return 0
      fi
    fi
    [ "$dir" = / ] && return 1
    dir=$(dirname -- "$dir")
  done
}

# Whether every account may run the program at <path>.
others_can_run() {
  local path=$1 mode
  while :; do
    mode=$(stat -L -c '%a' -- "$path") || return 1
    (( (8#$mode & 8#001) != 0 )) || return 1
    [ "$path" = / ] && return 0
    path=$(dirname -- "$path")
  done
}

# <path>, absolute and of plain names, with every link on it resolved,
# as `readlink -m` prints it (which macOS lacks); false when a link on it
# leads nowhere.
real_path() {
  local dir=$1 rest=""
  while [ ! -d "$dir" ]; do
    [ ! -L "$dir" ] || return 1
    rest="/${dir##*/}$rest"
    dir=$(dirname -- "$dir")
  done
  dir=$(cd -P -- "$dir" && pwd) || return 1
  echo "${dir%/}$rest"
}

# The seats' units active now, by name, on one line; empty when none is.
active_seats() {
  local units unit names=""
  units=$(systemctl list-units --plain --no-legend --state=active 'spex-seat@*' 2>/dev/null) || return 0
  while read -r unit _; do
    if [ -n "$unit" ]; then names="${names:+$names }$unit"; fi
  done <<<"$units"
  echo "$names"
}

# --- Refusals: nothing is changed before each of them has passed.

prefix=${SPEX_PREFIX:-$DEFAULT_PREFIX}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix=*) prefix=${1#--prefix=} ;;
    --prefix)
      [ "$#" -ge 2 ] || usage_refuse "--prefix needs a directory"
      prefix=$2
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) usage_refuse "unknown argument: $1" ;;
  esac
  shift
done
prefix=${prefix%/}
[[ "$prefix" =~ ^(/[A-Za-z0-9_][A-Za-z0-9._-]*)+$ ]] ||
  usage_refuse "the prefix must be an absolute path other than / of plain names (letters, digits, '.', '_' and '-'), not ${prefix:-/}"

script_dir=$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
checkout=$(cd -P -- "$script_dir/../../.." && pwd)
not_checkout() {
  refuse 66 "$checkout is no release checkout of Spex: $1; run the install.sh of a checkout of a release"
}
[ -f "$checkout/package.json" ] || not_checkout "it has no package.json"
grep -Eq '^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"spex-monorepo"' "$checkout/package.json" ||
  not_checkout "its package.json does not name spex-monorepo"
for file in package-lock.json apps/server/package.json apps/hub/package.json \
  apps/hub/bin/spex-seatctl apps/hub/deploy/spex-hub.service \
  apps/hub/deploy/spex-seat@.service apps/hub/deploy/spex-seat-reaper.service \
  apps/hub/deploy/spex-seat-reaper.timer apps/hub/deploy/spex-hub.sudoers \
  apps/hub/deploy/spex-hub.tmpfiles apps/hub/deploy/spex-hub \
  apps/hub/deploy/validate-sudoers.sh; do
  [ -f "$checkout/$file" ] || not_checkout "$file is missing"
done

# The checkout is copied into the prefix and <prefix>/app replaced, so
# neither may hold the other.
real_prefix=$(real_path "$prefix") ||
  refuse 78 "the prefix $prefix passes a link that leads nowhere; choose a prefix of real directories"
shown_prefix=$prefix
[ "$real_prefix" = "$prefix" ] || shown_prefix="$prefix ($real_prefix)"
overlap=""
if [ "$real_prefix" = "$checkout" ]; then
  overlap="is the checkout"
else
  case "$real_prefix/" in "$checkout/"*) overlap="lies inside the checkout $checkout" ;; esac
  case "$checkout/" in "$real_prefix/"*) overlap="holds the checkout $checkout" ;; esac
fi
[ -z "$overlap" ] ||
  refuse 78 "the prefix $shown_prefix $overlap, and the install copies the checkout into the prefix and replaces $prefix/app: keep the release checkout outside the prefix, e.g. under /usr/local/src, or choose a prefix outside the checkout"

[ "$(id -u)" -eq 0 ] ||
  refuse 77 "run as root (sudo $0): it creates accounts, installs units and a sudoers fragment"

[ "$(uname -s)" = Linux ] ||
  refuse 69 "this host runs $(uname -s), not Linux: a team server is a Linux host with systemd"
command -v systemctl >/dev/null 2>&1 ||
  refuse 69 "systemctl is missing: the hub and the seats are systemd units"
[ -d /run/systemd/system ] ||
  refuse 69 "systemd is not this host's init: the hub and the seats are systemd units"
command -v systemd-tmpfiles >/dev/null 2>&1 ||
  refuse 69 "systemd-tmpfiles is missing: the seats' runtime base is a tmpfiles fragment"
command -v sudo >/dev/null 2>&1 ||
  refuse 69 "sudo is missing: the hub runs the seat helper through sudo; install sudo"
command -v visudo >/dev/null 2>&1 ||
  refuse 69 "visudo is missing: the sudoers fragment is checked with it before it is put in place; install sudo"
for tool in useradd groupadd getent runuser install tar sed stat readlink mktemp; do
  command -v "$tool" >/dev/null 2>&1 || refuse 69 "$tool is missing: the install needs it"
done
for dir in "$UNIT_DIR" "$SUDOERS_DIR" "${TMPFILES_FILE%/*}"; do
  [ -d "$dir" ] ||
    refuse 69 "$dir is missing: the units, the sudoers fragment and the tmpfiles fragment go under $UNIT_DIR, $SUDOERS_DIR and ${TMPFILES_FILE%/*}"
done
# sudo reads the fragment only where its policy includes the directory.
[ -f "$SUDOERS" ] ||
  refuse 69 "$SUDOERS is missing: sudo reads its policy there, and the hub runs the seat helper through sudo; reinstall sudo"
grep -Eq -- "$SUDOERS_READS_DIR" "$SUDOERS" ||
  refuse 69 "$SUDOERS does not read $SUDOERS_DIR, so sudo would never let $HUB_USER run the seat helper: add the line '@includedir $SUDOERS_DIR' to $SUDOERS with visudo, then run install.sh again"

node=$(command -v node 2>/dev/null) && [[ "$node" == /* ]] ||
  refuse 69 "node is missing: install Node.js $NODE_MAJOR.$NODE_MINOR or later where every account may run it, e.g. under /usr"
npm=$(command -v npm 2>/dev/null) && [[ "$npm" == /* ]] ||
  refuse 69 "npm is missing: install it with Node.js"
node_version=$("$node" -p 'process.versions.node' 2>/dev/null) ||
  refuse 69 "node at $node does not run"
IFS=. read -r node_major node_minor _ <<<"$node_version"
if ! [[ "$node_major" =~ ^[0-9]+$ && "$node_minor" =~ ^[0-9]+$ ]] ||
  ((node_major < NODE_MAJOR || (node_major == NODE_MAJOR && node_minor < NODE_MINOR))); then
  refuse 69 "node at $node is $node_version: Spex needs $NODE_MAJOR.$NODE_MINOR or later"
fi
[[ "$node" =~ ^/[A-Za-z0-9._/+-]+$ ]] ||
  refuse 78 "node's path $node has characters a unit cannot carry; install Node.js under a plain path, e.g. /usr"
node_real=$(readlink -f -- "$node")
others_can_run "$node_real" ||
  refuse 78 "node at $node is not runnable by every account; the hub and the seats run it as their own accounts: install Node.js outside any home, e.g. under /usr"
if unsafe=$(writable_ancestor "$node_real"); then
  refuse 78 "node at $node is $node_real, and $unsafe on its path may be written by an account other than root, while the hub and every seat run that node: install Node.js under root's own directories, e.g. /usr"
fi

if unsafe=$(writable_ancestor "$real_prefix"); then
  refuse 78 "the prefix $prefix lies under $unsafe, which an account other than root may write, and sudo would run the helper from there as root; choose a prefix under root's own directories"
fi

hub="sudo -u $HUB_USER $prefix/bin/spex-hub"

# A warning, not a refusal: a seat running while <prefix>/app is
# replaced may load modules of the new version beside the old ones.
seats=""
[ ! -e "$prefix/app" ] || seats=$(active_seats)
if [ -n "$seats" ]; then
  echo "install.sh: warning: seats run ($seats) and may load modules of the new version once $prefix/app is replaced; to keep them whole, interrupt the build now (Ctrl-C), evict them ($hub evict <person id>) and run install.sh again" >&2
fi

# --- Build, from this checkout alone, as root in root's own home and
# cache, so nothing lands in the invoking user's home.

install -d -m 0700 -o root -g root "$NPM_CACHE" ||
  refuse 70 "could not make the build's npm cache $NPM_CACHE; nothing is installed"
echo "install.sh: building Spex in $checkout (npm ci, npm run build; npm's cache $NPM_CACHE)"
if ! (cd -- "$checkout" &&
  unset XDG_CACHE_HOME XDG_CONFIG_HOME &&
  export HOME=/root npm_config_cache="$NPM_CACHE" &&
  ELECTRON_SKIP_BINARY_DOWNLOAD=1 "$npm" ci --no-audit --no-fund &&
  "$npm" run build); then
  refuse 70 "the build in $checkout failed (above); nothing is installed"
fi
for built in apps/server/dist/main.js apps/hub/dist/main.js apps/hub/dist/reaper.js; do
  [ -f "$checkout/$built" ] || refuse 70 "the build made no $built; nothing is installed"
done

# --- Accounts, groups and directories; existing ones are kept.

# From here a failed command names its step and exits 70; a command
# substitution or subshell hands its status to the command around it.
step=""
on_error() { # <status>
  [ "$BASH_SUBSHELL" -eq 0 ] || exit "$1"
  trap - ERR
  echo "install.sh: $step failed (status $1, above); run install.sh again once that is fixed" >&2
  exit 70
}
staged=""
previous=""
replaced=""
rendered=""
cleanup() {
  trap - ERR
  # A swap cut short puts the earlier app back.
  if [ -n "$previous" ] && [ ! -e "$prefix/app" ]; then
    mv -- "$previous" "$prefix/app" && previous=""
  fi
  [ -z "$staged" ] || rm -rf -- "$staged"
  [ -z "$previous" ] || rm -rf -- "$previous"
  [ -z "$rendered" ] || rm -f -- "$rendered"
}
trap cleanup EXIT
set -E
trap 'on_error $?' ERR

step="creating the groups, the hub's account and its directories"
for group in "$SEATS_GROUP" "$HUB_GROUP"; do
  if ! getent group "$group" >/dev/null; then
    groupadd --system "$group"
    echo "install.sh: created the group $group"
  fi
done
if ! getent passwd "$HUB_USER" >/dev/null; then
  nologin=/usr/sbin/nologin
  [ -x "$nologin" ] || nologin=/sbin/nologin
  [ -x "$nologin" ] || nologin=/bin/false
  useradd --system --gid "$HUB_GROUP" --home-dir "$STATE_DIR" --no-create-home \
    --shell "$nologin" --comment "Spex hub" "$HUB_USER"
  echo "install.sh: created the account $HUB_USER"
fi
install -d -m 0700 -o "$HUB_USER" -g "$HUB_GROUP" "$STATE_DIR"
# The seats' locks' directory is the hub's (hub-8): made here as the
# hub's own, so the sweep finds it before the hub's first start.
install -d -m 0700 -o "$HUB_USER" -g "$HUB_GROUP" "$STATE_DIR/locks"
install -d -m 0755 -o root -g root "$ETC_DIR"

# --- The built checkout, the helper and the fragments.

step="installing the built checkout as $prefix/app"
install -d -m 0755 -o root -g root "$prefix" "$prefix/libexec" "$prefix/bin"
staged=$(mktemp -d "$prefix/.app.XXXXXX")
tar -C "$checkout" --exclude=./.git --exclude=./.claude --exclude='./.workshop-*' \
  --exclude=./test-results --exclude=./playwright-report \
  --exclude=./.env --exclude='./.env.*' -cf - . |
  tar -C "$staged" --no-same-owner -xf -
chown -R root:root "$staged"
chmod -R u+rwX,go+rX,go-w "$staged"
if [ -e "$prefix/app" ]; then
  previous="$prefix/.app.previous.$$"
  mv -- "$prefix/app" "$previous"
  replaced=yes
fi
mv -- "$staged" "$prefix/app"
staged=""
echo "install.sh: installed the built checkout as $prefix/app"

# The units, the command and the sudoers fragment, written for this
# prefix and node.
render() { # <source> <target>
  sed -e "s#$DEFAULT_PREFIX/#$prefix/#g" -e "s#$UNIT_NODE #$node #g" -- "$1" >"$2"
}

step="installing the helper and the command under $prefix"
install -m 0755 -o root -g root "$checkout/apps/hub/bin/spex-seatctl" "$prefix/libexec/spex-seatctl"
rendered=$(mktemp "$prefix/bin/.spex-hub.XXXXXX")
render "$checkout/apps/hub/deploy/spex-hub" "$rendered"
chmod 0755 "$rendered"
mv -f -- "$rendered" "$prefix/bin/spex-hub"
rendered=""

step="installing and applying $TMPFILES_FILE"
install -m 0644 -o root -g root "$checkout/apps/hub/deploy/spex-hub.tmpfiles" "$TMPFILES_FILE"
systemd-tmpfiles --create "$TMPFILES_FILE"

step="installing the units under $UNIT_DIR"
for unit in spex-hub.service spex-seat@.service spex-seat-reaper.service spex-seat-reaper.timer; do
  rendered=$(mktemp "$UNIT_DIR/.$unit.XXXXXX")
  render "$checkout/apps/hub/deploy/$unit" "$rendered"
  chmod 0644 "$rendered"
  mv -f -- "$rendered" "$UNIT_DIR/$unit"
  rendered=""
done

# sudo reads no name with a dot in it, so the fragment is checked under
# one and renamed into place.
step="installing $SUDOERS_DIR/spex-hub"
rendered=$(mktemp "$SUDOERS_DIR/.spex-hub.XXXXXX")
render "$checkout/apps/hub/deploy/spex-hub.sudoers" "$rendered"
chmod 0440 "$rendered"
bash "$checkout/apps/hub/deploy/validate-sudoers.sh" "$rendered" ||
  refuse 70 "the sudoers fragment does not pass visudo -cf; $SUDOERS_DIR/spex-hub is left as it was"
mv -f -- "$rendered" "$SUDOERS_DIR/spex-hub"
rendered=""

step="reloading systemd"
systemctl daemon-reload
step="enabling the sweep's timer"
systemctl enable --now spex-seat-reaper.timer
# The sweep run once, on the host it will run on: a unit that cannot
# start under its sandbox, or a sweep that fails, refuses the install,
# the installed files standing for the next run (hub-7, DR-148).
step="checking the sweep runs on this host"
if ! systemctl start spex-seat-reaper.service; then
  journalctl --no-pager -u spex-seat-reaper.service -n 20 >&2 || true
  refuse 70 "the sweep did not run on this host (its journal above): journalctl -u spex-seat-reaper.service"
fi
helper="$prefix/libexec/spex-seatctl"
sudo -n -l -U "$HUB_USER" "$helper" stop 1 >/dev/null 2>&1 ||
  refuse 70 "sudo does not let $HUB_USER run $helper: check that /etc/sudoers reads $SUDOERS_DIR (@includedir $SUDOERS_DIR)"
echo "install.sh: installed the helper, the units, the sweep's timer (enabled, the sweep run once) and the sudoers fragment"

# --- What the administrator does next.

# Every seat's unit names the shared credential file, so it exists, empty
# until the administrator writes it; one already there is kept.
step="making $ETC_DIR/agents.env"
agents="present"
if [ ! -e "$ETC_DIR/agents.env" ] && [ ! -L "$ETC_DIR/agents.env" ]; then
  install -m 0640 -o root -g "$SEATS_GROUP" /dev/null "$ETC_DIR/agents.env"
  agents="made empty by this run"
fi
trap - ERR

written() {
  if [ -e "$1" ]; then echo "present"; else echo "not written yet"; fi
}
cat <<NEXT

Spex is installed under $prefix. Before attaching, write these four as root:

  $ETC_DIR/server.env ($(written "$ETC_DIR/server.env")), root:root 0644, the server as the
  instance registered it, as NAME=value lines:
      SPEX_HOST_URL=<the instance's URL, as attach's --instance, e.g. https://spex.sublang.ai>
      SPEX_SERVER_ID=<the server's id, as the servers page showed it>
      SPEX_SERVER_NAME=<the server's name>

  $ETC_DIR/agents.env ($agents), root:$SEATS_GROUP 0640, the agents' shared
  sign-ins as NAME=value lines (CLAUDE_CODE_OAUTH_TOKEN, CODEX_ACCESS_TOKEN,
  OPENCODE_AUTH_CONTENT), or empty; keep its owner and mode as they are

  the TLS certificate and key of the server's address, readable by $HUB_USER, e.g.
      chgrp $HUB_GROUP <key file> && chmod 0640 <key file>

  $TOKEN_FILE ($(written "$TOKEN_FILE")), root:$HUB_GROUP 0640, the server's token
  as the servers page showed it, on one line; e.g. made empty with
      install -m 0640 -o root -g $HUB_GROUP /dev/null $TOKEN_FILE
  and the token pasted into it with an editor, so that it stays out of the
  shell's history and the terminal's scrollback

Then attach the server, which reads its token from $TOKEN_FILE, and start
the hub:

  $hub attach \\
      --state-dir=$STATE_DIR --instance=<the instance's URL> \\
      --server-id=<the server's id> --address=<the server's https origin> \\
      --tls-cert=<the certificate's absolute path> --tls-key=<the key's absolute path> \\
      --token-file=$TOKEN_FILE
  systemctl enable --now spex-hub

The seats are then administered as $HUB_USER:

  $hub status
  $hub evict <person id>
  $hub retire

Admission signs a seat in to its Space only. Public packages need no registry
sign-in. For private packages or publishing, each member signs in to the package
registry on their own seat: select that seat in the IDE, then Playbooks > Package
registry > Sign in to registry. The shared agent credential file supplies no
registry sign-in.

A seat loads Spex's modules from $prefix/app as it needs them, so a seat that
runs while install.sh replaces $prefix/app may load modules of the new version
from then on: run install.sh while no seat runs, or evict the running seats first.

A seat reads $ETC_DIR/agents.env before each agent run, but a member's
untouched starter config picks its agents from those sign-ins only as the seat
starts. After changing which agents it signs in, evict the running seats, so
each picks again at its member's next admission.
NEXT
if systemctl is-active --quiet spex-hub; then
  echo
  echo "The hub runs the version before this one: systemctl restart spex-hub"
fi
seats=""
[ -z "$replaced" ] || seats=$(active_seats)
if [ -n "$seats" ]; then
  echo
  echo "warning: seats run ($seats) and may load modules of the new version from now on:"
  echo "evict each ($hub evict <person id>); it starts afresh at its member's next admission"
fi
if read -r checkout_uid checkout_user < <(stat -c '%u %U' -- "$checkout") && [ "$checkout_uid" -ne 0 ]; then
  echo
  echo "The build ran as root in $checkout, so node_modules/ and dist/ there may now belong to root;"
  echo "before building there as $checkout_user again: chown -R $checkout_user: $checkout"
fi
