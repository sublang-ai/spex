<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- spex-i18n-source: map.md sha256-5dbf6d5bf1f09c74f8bf71209986eca460723957c6861f0a73654b88d9e522d9 -->

# 规约地图

用于快速定位决策和规约包的索引。
规约条目是事实来源。
开发过程中，代码可能与规约暂时不一致。

## 编写和审阅规约

在编写、修改或审阅 DR、IR 或条目前，先了解 [`meta.md`](meta.md) 中的规则。

## 目录结构

```text
decisions/    决策记录（DRs）
intents/      意图记录（IRs）
packages/     规约包（每包一个文件）
map.md        本索引
meta.md       规约的规约
```

## 决策

| ID | 文件 | 摘要 |
| --- | --- | --- |
| [DR-000](decisions/000-spec-structure-format.md) | 000-spec-structure-format.md | 规约结构、格式和命名约定 |

## 规约包

| 文件 | 摘要 |
| --- | --- |
| [git.md](packages/git.md) | 提交信息格式和 AI 共同作者 trailers |
| [licensing.md](packages/licensing.md) | SPDX 头要求与验证检查 |
