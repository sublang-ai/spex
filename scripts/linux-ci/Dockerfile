# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
# The CI runners' platform for a local run (release-32, DR-145): Ubuntu
# 24.04 with the git-core PPA's current Git — the runners' 2.55 line,
# which lists config keys sorted — and Node 22, the runners' first
# matrix version.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg software-properties-common tmux python3 make g++ rsync \
  && add-apt-repository -y ppa:git-core/ppa \
  && apt-get update \
  && apt-get install -y --no-install-recommends git git-lfs \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*
RUN git config --global user.name "CI parity" && git config --global user.email "ci@example.invalid"
WORKDIR /work
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
