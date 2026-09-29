<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# 状态根目录锁：对方案的审查意见

**状态：**针对 [state-root-lock-review.md](state-root-lock-review.md) 的讨论记录（2026-09-29）。临时文档，待方案确定并写入 DR 后，与方案文档一并删除。

## 摘要

故障分析准确，所有引用均能对应到真实条目。
建议方向存在三处缺口，应在决策前补齐：没有说明为何跳过最小修复；预设了一种 Node 和 Electron 在没有原生模块时无法获取的操作系统锁；Playbook 的逐会话租约仍留有本方案想消除的同一缺陷。
另有一个小修复（桌面主进程的信号处理器）与本方案无关，可以立即落地。

## 已对照代码核实的内容

| 方案中的说法 | 证据 |
| --- | --- |
| 先比较主机名再探测 PID；主机名不同直接拒绝 | [store.ts](../packages/core/src/store.ts) 的 `acquireRootLease`：`owner.hostname !== hostname()` 在 `processAlive` 之前判断 |
| 所有者文件不可读时按保守策略拒绝 | 同一函数：`owner.json` 缺失或无法解析时直接抛错，不回收锁 |
| 在 `npm start` 中按 Ctrl+C 可能残留 `.lock/` | [desktop-runner.mjs](../scripts/desktop-runner.mjs) 向独立进程组发信号；`apps/desktop/src` 未注册任何 `SIGINT`/`SIGTERM` 处理器，而 [服务端 main.ts](../apps/server/src/main.ts) 有 |
| 存储 Git 命令占用同一个 `.lock/` 路径 | [storage-git.ts](../packages/core/src/storage-git.ts) 的 `reserveStorageHome` |
| 引用的规范条目存在 | [app-shell-2](../specs/packages/app-shell.md#app-shell-2)、[app-shell-26](../specs/packages/app-shell.md#app-shell-26)、[core-service-61](../specs/packages/core-service.md#core-service-61)、[storage-14](../specs/packages/storage.md#storage-14)、[DR-036](../specs/decisions/036-file-state-store.md) |

## 对建议方向的意见

### 1. 没有权衡最小修复

根因是 macOS 上 `os.hostname()` 跟随网络分配的名字（`Mac.lan`），而不是机器自身的名字（`Minion.local`）。
在现有设计内做两处改动，即可解决观察到的故障和 PID 复用的弱点，无需引入新机制：

- 用稳定的机器标识替代主机名比较（持久化在主目录之外的逐机器 id，或平台的硬件 id）；
- 在 PID 旁记录持有者进程的启动时间，被复用的 PID 就不会再被当成原持有者。

方案点出了这两个弱点，却直接转向操作系统锁。
应将"加固现有租约"与"换成操作系统锁"并列呈现并给出取舍，让决定是做出来的，而不是默认的。

### 2. 操作系统锁需要原生模块

Node 和 Electron 都没有暴露 `flock`/`fcntl` 锁接口。
要获取方案描述的锁，就要新增一个原生插件。
本仓库已经在为一个原生模块付出代价：[app-shell-26](../specs/packages/app-shell.md#app-shell-26) 和 [rebuild-native.mjs](../apps/desktop/scripts/rebuild-native.mjs) 的存在就是为了每次源码启动时把 `better-sqlite3` 重建为 Electron 版本再还原为 Node 版本。
方案把"运行时接入方式"列为稍后处理的细节，但它是整个方向的成立前提，应当如此表述。

一种不需要原生代码、且能在崩溃后自愈的替代方案是心跳租约：持有者按固定间隔刷新锁文件的 mtime，竞争者把超过阈值未刷新的锁视为已放弃。
方案应列出各候选（加固现有租约、心跳租约、经原生插件的操作系统锁）及其代价。

### 3. Playbook 的会话租约存在同样的缺陷

Playbook 的会话存储采用同样的主机名加 PID 方式：[session-store.js](../node_modules/@sublang/playbook/reference/sdlc/code.playbook/bin/session-store.js) 在 `owner.hostname !== localHostname` 时返回 `unknown` 或外部主机错误。
同一台机器改名后，每个会话租约都会以根目录租约同样的方式失效。
把会话租约排除在范围外，会让方案读起来像是修好根目录锁就够了，实际并非如此。

会话存储接受注入的 `hostname`（以及 `probeProcess`）选项。
为根目录租约选定的稳定机器标识可以同样传给 Playbook，一个身份决定即可修好两处租约。
根目录上的操作系统锁对会话接管没有任何帮助。

### 4. 方案默默修订了 DR-036

[DR-036](../specs/decisions/036-file-state-store.md) 将"外部主机的租约永不被打破"保留为既定规则。
改用操作系统锁后，从另一台机器同步过来的主目录在本机不持有任何操作系统锁，会被直接准入。
这是对已接受决定的更改，必须作为明确的决策点列出，而不只是"不保证跨机器写入安全"。

### 5. 缺少两个具体的 `flock` 风险

- 在网络文件系统或同步服务支撑的文件系统上，`flock` 可能不可靠或无效。
  因此锁目标应放在主目录之外、以状态根目录的规范化路径作为键的本机路径；方案把位置列为待定，这就是应给出的答案。
- 核心通过 Cligent 拉起 agent 子进程。
  被继承的描述符会让锁在核心退出后继续存活。
  Node 默认以 close-on-exec 打开文件，但方案应明确写出这一假设，并在验证中覆盖。

### 6. Ctrl+C 的修复可以独立进行

在桌面主进程注册 `SIGINT`/`SIGTERM` 处理器并调用 `app.quit()`，与服务端外壳做法对齐，即可恢复经由 `before-quit` 和存储释放的正常关闭路径。
它不依赖上述任何决定，可以现在就做，并在源码启动脚本中加上有界的强制退出后备。

## 次要

- 人工恢复在主目录中留下了 `.lock.stale-*` 目录。
  存储 Git 规则会忽略它，因此无害，但方案应说明可以删除。

## 建议的下一步

将"建议方向"改写为三个候选方案的对比，把对 DR-036 的修订和 Playbook 会话租约列为明确的决策点，并把桌面信号处理器拆出为可立即进行的工作。
