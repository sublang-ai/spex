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
| Boss, Captain, Coder, Reviewer, Player | as authored | Playbook's role names, as in the config and the transcripts |
| playbook | 规程 | the artifact the roles play |
| session | 会话 | |
| turn | 轮次 | one Boss turn; "Turn finished" → 本轮已完成 |
| conversation | 对话 | |
| project | 项目 | |
| Space | 空间 | the shared home |
| Dashboard | 仪表盘 | |
| Projects (surface) | 项目 | |
| Playbooks (surface) | 规程 | |
| Settings | 设置 | |
| Workspace | 工作区 | |
| intent | 意图 | the ledger's unit of work |
| queue / Queued / Up next / Next | 队列 / 已排队 / 接下来 / 下一个 | |
| History / Now / Sources | 历史 / 当前 / 来源 | Dashboard groups |
| Overview / Specs / Repo | 概览 / 规约 / 仓库 | project tabs |
| spec, specs | 规约 | as the Chinese scaffold writes it |
| spec package / spec item | 规约包 / 规约条目 | |
| decision record (DR) / intent record (IR) | 决策记录 / 意图记录 | |
| draft | 草稿 | an authoring draft |
| library | 库 | the compiled-artifact store; the surface itself says 规程 |
| compile / register / publish | 编译 / 注册 / 发布 | |
| Normalize / Spec items / Optimize / Machine / Link / Package | 规范化 / 规约条目 / 优化 / 状态机 / 链接 / 打包 | the compile pipeline's stages, as the band and the chips name them |
| adapter | 适配器 | |
| readiness / ready / not ready / unverified | 就绪状态 / 就绪 / 未就绪 / 未验证 | |
| model / effort / fast mode | 模型 / 推理强度 / 快速模式 | |
| GitHub, issue, PR | GitHub, Issue, PR | the interface never says "forge" |
| repo, repository | 仓库 | |
| remote | 远程仓库 | a Git remote |
| sync / synced / changes | 同步 / 已同步 / 更改 | |
| verdict | 裁定 | done or dropped |
| parked, waiting | 搁置, 等待 | a run holding for the Boss |
| failed / stopped / done / dropped | 失败 / 已停止 / 完成 / 已放弃 | verdict and life words |
| working / deciding | 工作中 / 决策中 | session state chips |
| unread | 未读 | |
| Send / Send next | 发送 / 下轮发送 | composer |
| Retry / Cancel / Save / Keep / Drop | 重试 / 取消 / 保存 / 保留 / 放弃 | |
| Remove / Delete / Undo / Dismiss | 移除 / 删除 / 撤销 / 忽略 | |
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
| unit (Space) | 单元 | one unit of the shared home |
| tree (specs) | 规约树 | |
| record (open/closed) | 记录 / 未完成记录 | a decision or intent record |
| bug / bug fixed | 缺陷 / 已修复缺陷 | history row tags |
| All clear | 没有待办 | the Dashboard's empty attention state |
| Source (tab, workflow source) | 源文 | not 来源, which is the Sources group |
| Prompt | 提示词 | the text a playbook sent a player |
| Gears | Gears | slc's stage name, a proper noun |
| Finder | 访达 | macOS's own Chinese name |
| token (a provider token) | 令牌 | `tok` as a usage unit stays Latin |
| Working… (a control's busy form) / working (a state) | 执行中… / 工作中 | |
| Keep mine / Take remote / All mine / All remote | 保留本机 / 取远程版 / 全用本地 / 全用远程 | Space conflict choices |
| Queue (the capture control) / queue (a unit kind) | 加入队列 / 队列 | two ids: the verb and the noun |
