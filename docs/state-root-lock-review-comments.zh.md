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

---

# 第二轮（2026-09-29）：对修订版方案的意见

修订版回应了第一轮意见：三个候选方案并列对比，选定 A，Playbook 会话租约和仓库 claim 纳入范围，DR-036 问题和桌面信号处理器都已列出。
新增的说法已对照本机安装的 `@sublang/playbook` 15.0.0 核实：会话存储先比较主机名再探测 PID，并接受 `hostname`/`probeProcess`；Spex 只传入 `sessionsDir`（[store.ts](../packages/core/src/store.ts) 的 `sessionStore`）；仓库协调器校验 `hostname,ownerToken,pid,schema` 形状的所有者并探测 PID。
对候选 B 的反对理由（暂停中的存活所有者超过期限）成立。
以下是 A 的设计中仍然存在的缺口。

### 1. 机器身份存放在哪里是 A 的核心决定，且属于上游决定

"同步主目录之外"是对的，但没有指明位置。
如果 Playbook 的会话租约和仓库 claim 采用同一身份，独立运行的 CLI 必须在没有 Spex 的情况下于同一位置找到该文件。
因此位置是 Spex 读取的 Playbook 约定，而不是 Playbook 接收的 Spex 选择。
目前两个外壳没有共享的应用数据目录（服务端没有 `userData`），按用户划分的平台状态目录（`$XDG_STATE_HOME`、`~/Library/Application Support`）是自然候选；方案应明确写出。

### 2. 仅由 Spex 注入身份会破坏同主机接管

`@sublang/playbook/session-store` 将 `createCaptainSessionStore` 重新导出为 `createSessionStore`，所以 Spex 今天就能传入 `hostname`，不需要上游改动。
但 Spex 在主机名字段写入机器 id 的租约，对比较 `os.hostname()` 的 CLI 来说是"外部主机"，反之亦然。
在同一台机器上，CLI 将无法接管崩溃的 Spex 会话，Spex 也无法接管 CLI 的会话。
方案说仅在 Spex 注入"无法修复"CLI 租约，应改为"会使其退化"。
这一顺序约束应进入决策清单：先改上游，或者制定过渡规则，把当前主机名和机器 id 都视为"同一主机"。

### 3. 进程启动身份意味着所有者记录的格式变更

Node 不提供进程启动时间。
Linux 需要读 `/proc/<pid>/stat`；macOS 需要拉起 `ps -o lstart=` 或用原生 `sysctl`，探测就变成锁路径上的一个子进程。
更重要的是，Playbook 的两种所有者记录都按精确键集合校验（session-store 的 `assertOwnerShape`，repository-effects 的 `keys.join(',') !== 'hostname,ownerToken,pid,schema'`），Spex 的 `owner.json` 读取器也是同样形状。
增加启动时间字段就是一次格式升级，旧读取器会保守拒绝；这正是"旧所有者文件"一项的具体形态。

释放路径已经核对所有者令牌，所以 PID 复用只影响同一台机器上回收已死亡所有者的锁。
方案应决定这一残余风险是否值得格式变更，而不是把启动身份列为已定项。

### 4. DR-036 同样是根目录拒绝外部主机的依据

修订版把 DR-036 的"外部主机租约永不被打破"读作会话租约规则，把根目录的拒绝视为实现选择。
DR-036 在"同步与备份"一节还写明租约按设计只限同一主机、同一时间只有一台机器写入。
因此除非修订 DR-036，候选 A "必须保留"根目录的拒绝规则，而不是"可以保留"；决策点应如此表述。

### 5. 候选 C 的措辞残留

"诊断信息"一条仍写着元数据不能证明操作系统锁被持有。
选定 A 后不存在操作系统锁；该条应改为 A 在所有者为外部主机、已死亡、无法核实或旧格式时各报告什么。

### 6. 身份丢失：建议给出规则

重装后身份文件缺失，会使所有已有锁都成为外部主机而被拒绝。
建议规则：生成新身份；拒绝时报出锁路径和原因；身份无法匹配的锁永不回收。
这样既保持保守拒绝，又给操作者唯一需要做的动作。

---

# 第三轮（2026-09-29）：对共享身份修订版的意见

修订版落实了第二轮的要点：三处机制共用一个机器身份；先改上游，并明确警示新旧混用；进程启动身份留待后续并写明格式代价；DR-036 被读作同样约束根目录；诊断信息一条按 A 改写；给出了身份丢失规则。
新增的事实说法成立：PID 复用目前导致的是拒绝而不是第二个写入者；Spex 根目录读取器不校验精确键集合；Spex 没有可复用的设备身份（[DR-063](../specs/decisions/063-space-setup-and-repair.md) 的按设备确认存放在主目录内的 `prefs.json`）。
仍有三个决定停留在隐含状态，应当写明。

### 1. 身份放在哪个字段

正文说 Spex 的租约会把身份"写入 Playbook 的 `hostname` 字段"，但从未正式做出这个决定。
两种选择的代价不同：

- **复用 `hostname` 字段。** 不改格式，上游改动小。但字段含义改变，所有"被主机 H 上的进程 N 持有"的提示都会显示一串不透明 id，过渡规则只能靠格式区分旧主机名和机器 id。
- **新增字段。** Playbook 的两种读取器都拒绝多余键，所以这就是方案用来推迟进程启动身份的那次带版本的格式变更。既然格式反正要升级，推迟的理由就不再成立，两个字段可以一起上。

请写明选择；过渡方案和推迟决定都取决于它。

### 2. 身份位置应沿用 Playbook 的既有约定

Playbook 在所有平台上都按 XDG 风格解析目录，没有平台分支：用户配置在 `XDG_CONFIG_HOME` 或 `~/.config`，会话曾在 `$XDG_STATE_HOME/playbook/sessions`（[launch-config.js](../node_modules/@sublang/playbook/reference/sdlc/code.playbook/bin/launch-config.js)、[storage-18](../specs/packages/storage.md#storage-18)）。
在 macOS 上提出 `~/Library/Application Support` 会引入 Playbook 并不存在的平台分支。
建议两种主机都用 `$XDG_STATE_HOME/playbook/`（或 `~/.local/state/playbook/`），让身份文件落在 Playbook 已经存放本机状态的位置。

### 3. 旧记录保守拒绝比现状更严格，且正好命中本次故障场景

方案规定旧的仅含主机名的记录在"无法证实来源"时保守拒绝。
现状是：旧记录的主机名等于当前主机名且 PID 已死时，会被自动回收。
按新规则，本次故障的场景，即崩溃后残留的 `.lock/`，在升级后的第一次运行时一定需要人工清理。
过渡期内对旧格式记录沿用现行规则，安全性不低于当前版本；沿用还是接受一次性人工操作，应作为决定写明，而不是留给实现。
