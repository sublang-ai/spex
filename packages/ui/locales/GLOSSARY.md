<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Translation glossary

The catalogs in this directory — `<language>/messages.po`, one per offered language — hold every text the interface composes, keyed by the English text.
The desktop shell keeps its own, smaller catalog at `apps/desktop/src/locales/`, following this same glossary.

## Editing a translation

- The English text is the entry's `msgid`; the translation is its `msgstr`. Edit the `msgstr` in place and keep every `{placeholder}` and every `<0>…</0>` tag exactly as the English has them.
- Plurals are ICU MessageFormat. `{count, plural, one {# playbook} other {# playbooks}}` becomes `{count, plural, other {# 个规程}}`: Chinese has one form.
- `npm run i18n:check -w packages/ui` confirms that every entry is present and compiles; the build runs the same check and fails on a missing translation.
- New English text in the source: `npm run i18n:extract -w packages/ui` adds its entry; fill the `zh` `msgstr` before building.
- A `#.` comment on an entry is the author's note for the translator; `#:` lines name the source files that use the text.

## Style

- Key phrases, not sentences; a label carries no trailing period.
- Full-width punctuation inside Chinese text (，。：；？), a space between Chinese and Latin letters or digits ("3 个会话", "Playbook 14.1"), no space before a full-width mark.
- A control in tight chrome — a button, a tab, a chip — reads as short as its English or shorter, two to four characters where the English has two words; the full phrase belongs in the title.
- Playbook ids (`code`, `review`, `dev`), state ids, file paths, keyboard keys and product versions stay as they are.

## Fixed terms

Product names and the role names Playbook defines stay as authored; everything else translates as this table says.

| English | 简体中文 | Note |
| --- | --- | --- |
| Spex | Spex | product name |
| Space | Space | the thing a person signs in to, named by its display name, and the surface that shows it; a product name like Spex; never instance, host, site or origin, nor 实例 or 托管平台 |
| Boss, Captain, Coder, Reviewer, Player | as authored | Playbook's role names, as in the config and the transcripts |
| playbook | 规程 | the artifact the roles play |
| session | 会话 | |
| turn | 轮次 | one Boss turn; "Turn finished" → 本轮已完成 |
| conversation | 对话 | |
| project | 项目 | a Git folder Spex works in; "project folder" for its path |
| group | 群组 | a team at a Space; a group inside a group shows by nesting, never as "subgroup" |
| Personal | 个人 | your own records and packages; never your own group, your namespace or Only you |
| records | 记录 | what Spex keeps for a project or a group; never spex repository, clone or unit |
| this computer | 本机 | the local place; "Here" only as a row mark; never device or machine, nor 此设备 |
| server | 服务器 | a team's machine, by its name; never seat or ticket |
| Dashboard | 仪表盘 | |
| Projects (surface) | 项目 | |
| Settings | 设置 | |
| Workspace | 工作区 | |
| intent | 意图 | the ledger's unit of work |
| queue / Queued / Up next / Next | 队列 / 已排队 / 接下来 / 下一个 | |
| History / Now / Sources | 历史 / 当前 / 来源 | Dashboard groups |
| Specs / Playbooks / Packages / Overview | 规约 / 规程 / 规约包 / 概览 | the project's pinned tabs |
| spec, specs | 规约 | as the Chinese scaffold writes it |
| package / spec package | 规约包 | an installable bundle; "spec package" where its nature is explained; never 软件包 |
| spec item | 规约条目 | |
| decision record (DR) / intent record (IR) | 决策记录 / 意图记录 | always in full; 记录 alone is a project's records |
| registry | 注册中心 | where packages come from and go, named by its display name; never 注册表 |
| Add / Install / Update / Publish | 添加 / 安装 / 更新 / 发布 | a package's acts: Update picks the newest versions spex.yaml allows and installs them, Install puts what spex.lock records on disk; never request, resolve or upload |
| draft | 草稿 | an authoring draft |
| library | 规程库 | the compiled-artifact store; the surface itself says 规程 |
| provider / provider default | 服务商 / 服务商默认 | a model's provider; never 提供方 |
| Set up (a space) / Setting up… | 初始化 / 初始化中… | the act that initializes the home and names its remote; not 设置, which is the Settings surface; the core's refusals use the same word |
| project palette | 项目选择器 | the project picker |
| compile / register / publish | 编译 / 注册 / 发布 | |
| Normalize / Spec items / Optimize / Prefix / Machine / Link / Package | 规范化 / 规约条目 / 优化 / 前缀 / 状态机 / 链接 / 打包 | the compile pipeline's stages, as the band and the chips name them |
| adapter | 适配器 | |
| readiness / ready / not ready / unverified | 就绪状态 / 就绪 / 未就绪 / 未验证 | |
| model / effort / fast mode | 模型 / 推理强度 / 快速模式 | |
| subagent model | 子代理模型 | the model an agent's subagents run on |
| subagent effort | 子代理推理强度 | the reasoning effort an agent's subagents run at |
| Same as agent / Agent chooses | 与代理相同 / 由代理选择 | the subagent fields' empty choices; beside 子代理 the agent reads 代理, as DR-095 words it |
| GitHub, issue, PR | GitHub, Issue, PR | the interface never says "forge" |
| repo, repository | 仓库 | |
| remote | 远程仓库 | a Git remote |
| Code: <where> | 代码：<where> | where a project's code is: a Space by its display name, a host such as github.com, or "no remote" |
| Sync / synced / changes | 同步 / 已同步 / 更改 | a project's records: "2 to send", "Synced 3 min ago"; never push or units |
| Resolve / Combine | 解决 / 合并 | Resolve: changed here and at a Space; Combine: records started separately at a Space; never 解析 |
| To fix | 待处理 | what needs an answer: "To fix (2)" |
| verdict | 裁定 | done or dropped |
| parked, waiting | 搁置, 等待 | a run holding for the Boss |
| failed / stopped / done / dropped | 失败 / 已停止 / 完成 / 已放弃 | verdict and life words |
| working / deciding | 工作中 / 决策中 | session state chips |
| unread | 未读 | |
| Send / Send next | 发送 / 下轮发送 | composer |
| Retry / Cancel / Save / Keep / Drop | 重试 / 取消 / 保存 / 保留 / 放弃 | |
| Remove / Delete / Undo / Dismiss | 移除 / 删除 / 撤销 / 忽略 | Remove is also a package's act |
| Start / Stop / Refresh / Apply / Join | 开始 / 停止 / 刷新 / 应用 / 加入 | |
| Edit / Copy / Open / Close / Confirm | 编辑 / 复制 / 打开 / 关闭 / 确认 | |
| Reviewed / Mark reviewed | 已审阅 / 标记为已审阅 | |
| just now / now | 刚刚 / 刚刚 | ages |
| {n}m ago, {n}h ago, {n}d ago, {n}w ago | {n} 分钟前, {n} 小时前, {n} 天前, {n} 周前 | compact forms drop 前 |
| <1s, {n}s, {n}m {n}s, {n}h {n}m | <1 秒, {n} 秒, {n} 分 {n} 秒, {n} 小时 {n} 分 | durations |
| System (language choice) | 跟随系统 | the Settings option |
| agent | 智能体 | a configured AI agent (the Captain's, a player's) |
| adapter-wide | 适配器级 | a setting applying to the whole adapter |
| core | 核心 | the Spex core the page connects to |
| ledger | 意图台账 | the intent ledger |
| tree (specs) | 规约树 | |
| bug / bug fixed | 缺陷 / 已修复缺陷 | history row tags |
| All clear | 没有待办 | the Dashboard's empty attention state |
| Source (tab, workflow source) | 源文 | not 来源, which is the Sources group |
| Prompt | 提示词 | the text a playbook sent a player |
| Gears | Gears | slc's stage name, a proper noun |
| Finder | 访达 | macOS's own Chinese name |
| token (a provider token) | 令牌 | `tok` as a usage unit stays Latin |
| Working… (a control's busy form) / working (a state) | 执行中… / 工作中 | |
| Sign in / Signing in… / Sign in again / Sign out | 登录 / 登录中… / 重新登录 / 退出登录 | signing in to a Space or a registry |
| Members | 成员 | a project's or a group's overflow entry |
| Waiting for you to continue | 等待你继续 | the first send of a project's records waiting on the sharing confirm |
| authoring (session) | 编写（会话） | a playbook being written in a draft |
| Queue (the capture control) | 加入队列 | |
| Connect / Connected / Disconnect | 连接 / 已连接 / 断开连接 | a server's line |
