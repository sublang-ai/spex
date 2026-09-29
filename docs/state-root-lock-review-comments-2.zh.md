<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# 状态根目录锁：对双仓库修订版的审查

**状态：**针对 [state-root-lock-review.md](state-root-lock-review.md) 在 rebase 到 `main` 并刷新本地 Playbook 检出后所做修订的讨论记录（2026-09-29）。与 [state-root-lock-review-comments.md](state-root-lock-review-comments.md) 中的前几轮一样，属于临时文档。

## 摘要

修订版对 Spex 根目录租约的新发现是真实的，且已对照 rebase 后的代码核实：存储命令的预留会拒绝任何已有的锁；回收路径存在迟到回收者竞态；进程探测把任何非 `EPERM` 错误都当作已死亡。
它对 Playbook 17.0.0 的说法与已安装的包和本地检出都一致。
剩下五点，其中两点会改变计划的形态：新旧版本混用的范围与 Playbook 自身的升级策略相矛盾；同步身份接口会把第二套文件安全实现推给 Playbook。

## 已对照两个仓库核实的内容

| 修订版中的说法 | 证据 |
| --- | --- |
| 存储预留会拒绝任何已有的 `.lock/`，无论所有者是否已死亡 | [storage-git.ts](../packages/core/src/storage-git.ts) 的 `reserveStorageHome`：rename 失败直接抛错，不读取所有者 |
| 迟到的回收者可以移走并删除新所有者 | [store.ts](../packages/core/src/store.ts) 的 `acquireRootLease`：退役路径被立即删除，第二次 `rename(lock, retired.<O>)` 会作用于新所有者的目录 |
| 只有 `EPERM` 被读作存活 | [store.ts](../packages/core/src/store.ts) 的 `processAlive`：其他任何错误都返回已死亡 |
| Playbook 17.0.0 已声明、锁定、安装；本地检出为 17.0.0，Unreleased 为空，三个租约文件自该标签起无改动 | `packages/core/package.json`、`package-lock.json`、Playbook 的 `CHANGELOG.md` 以及对三个租约文件的 `git log 82bb138..HEAD` |
| Playbook 保留令牌专属退役路径并复核移走的所有者令牌 | `session-store.js` 的 `retiredPathFor`/`readRetiredLease`；`repository-effects.js` 的 `retired-<token>` 及移动后的令牌比对 |
| 预期工作树的 claim 只在进程内生效 | Playbook 的 [playbook-cli-57](../../playbook/specs/packages/playbook-cli.md#playbook-cli-57) |
| 点名的 Playbook 规范文件存在 | `specs/packages/session-storage.md`、`specs/packages/playbook-cli.md` |

中文版与英文版一致。

## 意见

### 1. 新旧版本混用的范围与 Playbook 的升级策略矛盾

Playbook 17.0.0 已声明 16.0.x 及更早的宿主无法打开它保存的会话，共享存储的所有应用必须一起升级。
其 [release-35](../../playbook/specs/packages/release.md#release-35) 规定混合版本的存储不是受支持的配置，并要求新写入者保存之前先停止所有旧写入者。
修订版却要求测试"受支持的新旧版本组合"，并把旧 CLI 拒绝带标记所有者记为需要接受的可用性限制。

二选一：

- **协同升级，即现行策略。** 身份变更沿用同一道门：先停止所有旧写入者，再同时升级两个宿主。停止的旧写入者留下的旧*记录*仍需同主机名且 PID 已死亡的旧规则；旧*写入者*不需要支持。测试矩阵缩小为"新读取器读旧记录"。
- **真正支持混用。** 那么方案必须写明支持哪些组合、支持多久，而这正是 release-35 目前禁止的。

前者符合 Playbook 自己的规范，也不需要新规则；修订版应明说，并删掉不再需要的混合写入者测试。

### 2. 同步身份接口意味着第二套文件安全实现

`Store` 是同步构造的，`reserveStorageHome` 也是同步的，所以修订版要求 Playbook 提供同步身份接口，"配以使用同样句柄复核规则的同步文件操作适配"。
Playbook 的 `prepareSessionPermissions` 基于 `fs.promises` 并做句柄身份比对；再写一个同步孪生版本，就是方案自己说只能存在一份的规则的第二套实现。

替代做法是 Playbook 只提供一个异步接口，Spex 做一处小改动：在服务启动时、`new Store` 之前解析一次身份，再作为选项传给 `Store`，作为新参数传给 `reserveStorageHome`。
`Store` 在私有构造函数里构建，只有服务的异步工厂会到达那里；预留的两个调用方，`storage-git.ts` 中的合并选择和 `storage-git.mjs` 脚本，本来就是异步的。
这样上游只保留一份实现，下游只多一个参数，整体改动更小。

### 3. "占用"不够，退役路径必须保持非空

POSIX `rename(2)` 会替换已存在的*空*目录。
Playbook 的退役目录之所以安全，是因为其中保留了所有者文件。
Spex 的规则"保留该路径，使迟到的回收者无法将新所有者移进去"应改为保持非空，并保留所有者文件。

同一事实也影响释放：递归删除中途崩溃可能留下一个空的 `.lock/`，之后的发布 rename 会静默替换它，而同时的读取者会报告锁不可读。
两种结果都安全，因为释放中的所有者已经放弃，但方案应把空目录列为一种状态，并写明它得到哪种解读。

### 4. 在 Spex 清单中加入移动后的令牌复核

Playbook 在 rename 之后重新读取移走的所有者，令牌变化则失败。
Spex 那一行要求"将准确所有者移至永久保留的令牌专属退役路径"，却没有要求这次复核。
在仅 `ESRCH` 探测加永久路径的前提下，我能构造的每种交错里这次复核都是冗余的；但它只是一次读取，是 Playbook 所说"准确所有者"的本义，并且把一段论证变成了一条断言。

### 5. 没有令牌的所有者不需要旧格式协议

Spex 写过的每一个所有者记录都带令牌，核心和存储预留都是如此。
"对于格式错误或没有令牌的所有者，除非另行证明旧格式回收协议安全，否则不得自动回收"可以缩短为：没有令牌的所有者即格式错误，直接拒绝。
这样少一个开放项。

## 次要说明

- Spex PR 那一行只泛泛提到约束。具体要改的规范是存储 Git 工具的拒绝措辞和根目录租约的测试条目（[core-service-61](../specs/packages/core-service.md#core-service-61) 及其验证测试）；存储命令恢复已死亡本机所有者是新行为，需要自己的条目。
- 若第 1 条选择协同升级，Playbook PR 除修订版点名的两个文件外还要改 `release.md`。
- Spex PR 的开发需要本地 link 或 pack 的未发布 Playbook。修订版禁止用它做验证，作为合并门槛是对的；但应写明开发可以使用它，以免被读成不许提前开工。
