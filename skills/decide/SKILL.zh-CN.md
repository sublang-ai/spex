---
name: decide
description: 把一个设计议题落实为成文的规格。两个角色同时独立地提出设计，其中一个把两份提案综合为决策记录或规格条目并放在一次提交中，然后对结果进行审查。当用户要求在编写任何代码之前对某事作出决定、进行设计或制定规格，或者要求就某个议题撰写决策记录或规格条目时使用。不适用于实现该设计（请用 code）。
license: Apache-2.0
compatibility: 需要 git，并需在本技能旁安装 review 技能。独立提案需要能并行运行子代理的代理。内置提示词假定仓库由 Spex 搭建（specs/map.md、specs/meta.md、specs/decisions/、specs/packages/）。不适用于 Spex 已放置了自己名为 decide 和 review 的技能的文件夹，那些技能会改为启动 playbook。
metadata:
  author: sublang-ai
  version: "1.0.0"
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- skill-atlas:source sha256=757112f63490112cbe2a61d7fd8f7b2c666acb52f71e2a7b58c03c07484bf2fa own=9b9bf9401a35f3ef8ed08180d24753869b3140ca468c4284f446a75af363ae7a -->
> 本文件是 `SKILL.md` 的简体中文译本，供人阅读；代理加载的是 `SKILL.md`。

# Decide

从两份独立提案出发，把一个议题变成经过审查的决策记录或规格条目。

## 角色

你是 **Captain**：你转发提示词、阅读回复并决定接下来做什么。
你自己从不提出提案、编辑文件或提交。

| 角色 | 职责 | 运行方式 |
| --- | --- | --- |
| Coder | 提出提案，然后综合两份提案并提交 | 一个子代理，从其提案延续到其综合 |
| Reviewer | 独立提出提案 | 第二个子代理，与 Coder 在同一轮次中启动 |

没有并行子代理时，分两遍写出两份提案，写第二份时不重读第一份，并在最终报告中说明它们并不独立。

## 输入

调用方提供议题及任何具体的上下文。
原样保留它。

## 工作流程

### 步骤 1：收集两份独立提案

把 [references/prompts.zh-CN.md](references/prompts.zh-CN.md) 中的*提案*提示词同时发给 Coder 和 Reviewer，并引用完整的议题。
不要等一份提案出来再请求另一份；在两份都完成之前，不要向任一角色展示另一方的提案。

只有当作者明确给出完整的设计时，提案才算完成；进度报告、状态更新或稍后提交提案的承诺都不算。
依据每个回复所确立的内容评判它，绝不依据其格式。
如果用户在两者运行期间插话，就用由此得到的议题重新启动两者，使它们回答同一个议题并保持独立。

### 步骤 2：综合并提交

记录当前修订（`git rev-parse HEAD`）。
向 Coder 发送同一文件中的*综合*提示词，并在各自的标签下引用完整的议题和 Reviewer 的完整提案。

从仓库而非回复中得知结果：自所记录的修订以来恰好一个新提交，即 *decide 自有提交*。
如果没有提交、有多个提交或有被改写的提交，就停止并报告失败。

### 步骤 3：让决策接受审查

以如下输入调用 `review` 技能：

> 原始意图：<caller-topic>
> 审查范围：decide 自有提交 <decide-commit> 及其产生的仓库状态。
> Coder 的独立提案：<coder-proposal>
> Coder 输出：<coder-output>

让本次运行的 Coder 和 Reviewer 担任它的 Coder 和 Reviewer。

### 步骤 4：返回结果

| 审查 | 返回给调用方 |
| --- | --- |
| 适用于你给出的范围，指明所评估的修订，并确认没有未解决的发现 | decide 自有提交和所评估的修订 |
| 以未解决的发现、中止，或一个不能确立上述内容的结果告终 | 失败情况及 decide 自有提交 |
| 无法运行，或在其自身结果约定之外出错 | 以失败停止，并如实报告错误，不把它当作审查结果 |

## 自定义

两个提示词都在 `references/prompts.md` 中。
编辑它们，可以改变提案必须涵盖什么，或综合可以撰写哪些记录。
