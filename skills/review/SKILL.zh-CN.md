---
name: review
description: 分最多三轮审查已提交的工作。由一位独立的 Reviewer 报告发现，Coder 逐条接受或反驳，并在每一轮用一个新提交修复所接受的发现，直到没有未解决的发现。当用户要求审查提交、分支或已完成的变更，或者 code、decide 等其他技能移交其提交以供审查时使用。不适用于未提交的工作，也不适用于审查 Git 托管平台上的拉取请求。
license: Apache-2.0
compatibility: 需要 git 和一个含有已提交工作的仓库。审查的独立性需要能运行子代理的代理。内置提示词假定仓库由 Spex 搭建（specs/map.md、specs/meta.md、specs/packages/git.md）。不适用于 Spex 已放置了自己名为 review 的技能的文件夹，那个技能会改为启动 playbook。
metadata:
  author: sublang-ai
  version: "1.0.0"
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- skill-atlas:source sha256=a7baf6b3db9cd7e0f755f2361e272175c50619bcc0a8596f5811a4223c5b331f own=f7bcbd9430ada9959222d5c385b09f065a1c39a8799dcd4764967d765fff6a59 -->
本文件是 `SKILL.md` 的简体中文译本，供人阅读；代理加载的是 `SKILL.md`。

# Review

对已提交的工作进行有轮数上限的审查，并返回是否还有未解决的发现。

## 角色

你是 **Captain**：你转发提示词、阅读回复并决定接下来做什么。
你自己从不审查、编辑文件或提交。

| 角色 | 职责 | 运行方式 |
| --- | --- | --- |
| Reviewer | 阅读范围，报告发现，不编辑任何内容 | 一个没有看过 Coder 推理过程的子代理 |
| Coder | 接受或拒绝每个发现，修复所接受的发现 | 一个子代理，或编写了被审查工作的那个代理 |

宿主允许时，同一角色跨轮延续同一个子代理，使其保留上下文；否则启动一个新的子代理，并完整转达上一轮。
没有子代理时，由你亲自轮流扮演每个角色，并在最终报告中说明 Reviewer 并不独立。

## 输入

调用方提供：

- 原始意图；
- 审查范围，用调用方自己的话表述；
- 可选的上下文和运行结果。

如果缺少范围，或范围没有指明任何已提交的内容，在开始前询问用户要审查什么。

## 工作流程

### 步骤 1：确定范围

原样记录调用方的输入和当前修订（`git rev-parse HEAD`）。
调用方的范围是每一轮的基线。
每个审查修复提交一落地就并入范围，因此后面的轮次审查的是累积的已提交状态。

### 步骤 2：运行一轮 Reviewer 审查

根据 [references/reviewer-round.zh-CN.md](references/reviewer-round.zh-CN.md) 构建 Reviewer 的提示词：与本轮相符的开场，该文件列出的引用上下文，然后是每一轮指令。
把它发给 Reviewer 并等待回复。

### 步骤 3：评判 Reviewer 的回复

依据回复所确立的内容作出判断，绝不依据其格式或编号。

| 回复 | 下一步 |
| --- | --- |
| 确认审查已完成且没有未解决的发现 | 步骤 5，通过 |
| 在第 1 或第 2 轮提出或保留某个发现 | 步骤 4 |
| 在第 3 轮提出或保留某个发现 | 步骤 5，未解决 |
| 是进度报告、状态更新或稍后给出结果的承诺 | 没有结果；请 Reviewer 完成本轮 |

### 步骤 4：获取 Coder 的处置

向 Coder 发送 [references/coder-disposition.zh-CN.md](references/coder-disposition.zh-CN.md) 中的提示词，并附上该文件列出的引用上下文。
Coder 返回后，通过读取仓库而非回复来了解发生了什么：将 `git rev-parse HEAD` 和 `git log` 与你上次记录的修订进行比较。

- 一个新提交：将其记为本轮的审查修复提交，并以*审查修复提交之后*的开场回到步骤 2。
- 没有新提交且每个发现都被拒绝：以*所有发现均被拒绝*的开场回到步骤 2。
- 其他任何情况（多个提交，或被改写的提交）：停止，并作为一次失败的审查报告给调用方。

Reviewer 审查最多三轮：第一轮，以及最多两次 Coder 处置之后各一轮。

### 步骤 5：返回结果

从 `git rev-parse HEAD` 获取所评估的修订，而不是从任一角色的文字中获取。

- **通过**：返回该确切修订，以及范围内没有未解决发现这一事实。
- **未解决**：返回 Reviewer 剩余的发现，以及范围内仍有未解决发现这一事实。Coder 不再做进一步处置。

## 自定义

每个角色收到的提示词都是 `references/` 中的普通文件。
编辑它们，可以改变 Reviewer 关注什么、Coder 可以拒绝什么，或它们参考哪些项目约定。
