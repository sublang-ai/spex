<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- skill-atlas:source sha256=fb9dfa1d2170578b4d12ec135e681f252523edc319684a142b9ba74db92290b5 own=3cfb409b77a99a0e1185084eb9061692be4b660e5a1bf53b5b88d51108136ec5 -->
> 本文件是 `prompts.md` 的简体中文译本，供人阅读；代理使用的是原文件。

# Decide 提示词

尖括号中的文本由 Captain 填写。

## 提案

同时发送给 Coder 和 Reviewer。
先引用：

> 原始议题：<caller-topic>

然后是指令：

```markdown
评估该议题更适合表达为 specs/packages/ 下的几个规格条目，还是需要 specs/decisions/ 下的一份或多份 DR。
提出你的设计。
让你的提案连贯、聚焦、简洁。
如有需要，参考 specs/map.md 获取相关上下文，参考 specs/meta.md 了解规格要求。
不要修改任何文件。
```

## 综合

两份提案都完成后发送给 Coder。

```markdown
把你的独立提案与下面 Reviewer 的提案进行综合。
紧扣下面的原始议题，遵循它的要求。
保留任一提案中最好、最核心的部分，舍弃任何不合理、不必要或超出议题的观点。
把得到的设计转化为必要的 DR 和/或规格条目。
遵循 specs/meta.md，并在需要时更新 specs/map.md。
不要修改代码，也不要实现该设计。

将结果作为一个新提交提交，遵循 specs/packages/git.md。
让提交信息简明地说明改了什么、为什么改。
指明你做出的每一个新提交。
为每个参与本次提交的 AI 署名：Coder <coder-model> 和 Reviewer <reviewer-model>，本提交承载的是后者的提案。
```

其后引用：

> 原始议题：<caller-topic>
> Reviewer 的独立提案：<reviewer-proposal>
