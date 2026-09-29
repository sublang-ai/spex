<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# 状态根目录锁：故障背景与方案建议

**状态：**待审查提案（2026-09-29）。本文档不代表行为变更或规范变更已经获批。

## 目的与范围

Spex 需要两种不同范围的单实例保护：

- 桌面外壳使用 Electron 的 `requestSingleInstanceLock()`：再次启动同一个桌面应用时，聚焦已有窗口（[app-shell-2](../specs/packages/app-shell.md#app-shell-2)、[实现](../apps/desktop/src/main.ts)）。
- 核心的状态根目录租约：同一个 Spex 主目录同时只允许一个写入者，包括桌面核心、服务端核心以及会修改该目录的存储命令（[DR-036](../specs/decisions/036-file-state-store.md)、[core-service-61](../specs/packages/core-service.md#core-service-61)、[storage-14](../specs/packages/storage.md#storage-14)）。Electron 的应用锁无法覆盖其他写入者。

本提案讨论的是**状态根目录租约**，不涉及 Playbook 单独使用的逐会话租约。
已接受的约束是每个状态根目录同时只能由一个核心服务；具体采用 `.lock/owner.json` 是当前实现选择。

## 故障与观察到的行为

2026-09-28，`npm start` 完成构建并启动桌面应用，但核心启动时报错：`/Users/kgm/.spex` 被 `Minion.local` 上的进程 `25313` 占用。
已有的 `.lock/owner.json` 记录了该 PID 和主机名，但进程 `25313` 已不存在。
当时 `hostname()` 返回 `Mac.lan`，而这台机器的本地主机名为 `Minion`。
用户通过将 `.lock/` 重命名为带时间戳的备份，再运行 `npm start`，使应用成功启动：

```bash
mv ~/.spex/.lock ~/.spex/.lock.stale-$(date +%Y%m%d%H%M%S)
npm start
```

这一步保留了旧的所有者记录，同时让原 `.lock/` 路径不再存在；这次成功重试属于人工恢复，并非程序自动回收残留锁。

2026-09-29，用户还观察到：

| 退出或重启方式 | 观察结果 | 现有代码中的原因 |
| --- | --- | --- |
| 关闭应用窗口 | `.lock/` 消失 | `window-all-closed` 调用 `app.quit()`；`before-quit` 等待 `shutdown()`，后者停止核心并释放存储租约（[桌面主进程](../apps/desktop/src/main.ts)、[核心停止流程](../packages/core/src/service.ts)、[存储关闭流程](../packages/core/src/store.ts)）。 |
| 在运行 `npm start` 的终端按 Ctrl+C | `.lock/` 可能残留 | 源码启动脚本向独立的 Electron 进程组发送 `SIGINT`。Electron 主进程没有将该信号转为 `app.quit()` 的处理器，因此进程可能在异步关闭流程完成前结束（[启动脚本](../scripts/desktop-runner.mjs)、[桌面主进程](../apps/desktop/src/main.ts)）。 |
| 带着残留的 `.lock/` 重启 | 有时仍能成功 | 如果记录的主机名等于当前 `hostname()`，且 PID 已不存在，核心会移走旧目录并重试获取锁；如果主机名不同，则在检查 PID 前直接拒绝（[存储租约](../packages/core/src/store.ts)）。另外，若桌面应用仍在运行，Electron 可能先接管第二次启动，使核心根本不会检查此锁。 |

源码能够解释这些现象，但最初那个进程究竟为何退出，目前无法确定。
现有租约只检查 PID 是否存在，不校验进程身份；如果 PID 被系统复用，已退出进程留下的目录也可能被误判为仍在占用。
如果所有者文件无法读取，启动会按保守策略拒绝，并需要人工处理。

## 现有机制及其局限

核心以原子方式发布 `.lock/` 目录，其中 `owner.json` 记录 PID、主机名、获取时间和令牌。
只有令牌仍与自身一致时，核心才会删除该锁。
启动时，它可以回收同主机且 PID 已死亡的锁；遇到不同主机名，则认为无法检查对方进程是否存活。
[存储 Git 命令](../packages/core/src/storage-git.ts)也会占用同一个 `.lock/` 路径，因此更换机制时必须一并处理。

这个目录可以协调同一文件系统上遵守规则的 Spex 写入者，但进程突然终止后，目录仍会存在。
主机名可能变化；PID 存在也不足以证明原持有者仍持有租约。
此外，如果两台机器各自持有经异步文件同步服务复制的目录，当前机制也无法保证两者互斥；[DR-036](../specs/decisions/036-file-state-store.md)已明确将多机器并发写入排除在范围外。

## 建议方向

1. 保留 Electron 单实例锁，继续处理桌面窗口行为。
2. 在 macOS 和 Linux 上，用**非阻塞的操作系统建议性独占文件锁**作为 Spex 主目录准入的依据。所有主目录写入者，包括核心和存储 Git 命令，都在修改状态前获取同一把锁，并在工作结束前持续持有。获取失败的一方拒绝操作；有可用的所有者信息时，在错误中报告。
3. 将锁文件放在稳定路径，并在持锁期间保持文件描述符打开。正常释放时只关闭描述符，不删除或替换锁文件。退出后即使文件仍在，只要操作系统锁已释放，就不会阻止启动。PID 和主机名仅作为诊断信息，在获取锁后写入，不能作为判断能否进入的依据。
4. 尽可能让 `npm start` 收到 Ctrl+C 时先走 Electron／核心的正常关闭流程，并设置有界等待及强制退出的后备措施。这样有助于清理会话，但互斥正确性不能依赖关闭回调一定执行：崩溃或强制终止时，操作系统也必须自动释放锁。

对目前支持的 macOS／Linux 主机，`flock(LOCK_EX | LOCK_NB)` 是一个候选方案。锁关联到打开的文件；相关的打开描述全部关闭后，锁即被释放。它属于建议性锁，因此 Spex 的每个主目录写入者都必须遵守同一规则（[Apple `flock(2)`](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flock.2.html)、[Linux `flock(2)`](https://man7.org/linux/man-pages/man2/flock.2.html)）。Electron 提供 `requestSingleInstanceLock()` 和 `before-quit`，但立即退出不会触发后者（[Electron 应用 API](https://www.electronjs.org/docs/latest/api/app)）。

这一方案改变了故障模式：即使诊断信息文件残留，已退出的进程也无法留下仍然有效的本机操作系统锁。
它不能保证未经协调的跨机器并发写入安全。
若将来需要支持跨机器并发访问，应引入权威的单一写入服务或真正的分布式协调机制；同步一个锁文件并不够。

## 更新规范或实现前需要审查的事项

- **锁的身份与位置：**选择权限私有、稳定且位于本机的锁目标，并以状态根目录的规范化路径确定其身份。持锁期间，Git 或文件同步客户端不得替换该目标。需要确认符号链接、同一目录的不同路径写法、运行时目录缺失和用户范围如何处理。
- **与旧版本共存：**旧程序只检查 `.lock/`，不会看到新的操作系统锁文件。需要决定升级时是否要求所有旧写入者停止，还是采用临时兼容保护；并定义如何一次性处理已有的旧版残留 `.lock/`，避免新旧写入者同时运行。
- **写入者清单：**确认桌面、服务端、存储 Git 命令、迁移流程以及其他状态根目录修改操作都使用同一保护。Playbook 的逐会话租约仍是独立机制。
- **运行时接入方式：**决定 Node／Electron 如何在 macOS 和 Linux 上获取操作系统锁，包括打包方式及原生模块 ABI 的影响。还需确保核心退出后，子进程不会意外继续持有锁的文件描述符。
- **诊断信息：**定义操作系统报告锁繁忙、但元数据缺失或过期时如何报错。不能仅凭元数据推断锁的所有权。
- **关闭流程：**定义源码启动脚本在收到 SIGINT／SIGTERM 后如何请求 Electron 退出、等待多久以及何时升级为强制终止，同时保留必需的 Node ABI 恢复步骤（[app-shell-26](../specs/packages/app-shell.md#app-shell-26)）。

## 审查通过后的建议验证

用真实的竞争进程做集成／系统验证：桌面与桌面、桌面与服务端、核心与存储 Git；正常关闭与 Ctrl+C；强制终止后立即重启；元数据文件残留但操作系统锁已释放；操作系统锁繁忙但元数据缺失；以及旧版本过渡。
确认未获锁的一方不会修改受保护状态、持锁方在整个关闭期间持续持锁，且源码启动脚本在中断后仍会恢复 Node ABI。

审查通过后，应先将被接受的决定写入规范，再更新核心、外壳和存储相关约束及其集成验证。
修改规范后，按 [AGENTS.md](../AGENTS.md) 的要求运行 `spex lint`。
