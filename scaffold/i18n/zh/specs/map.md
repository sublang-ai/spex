<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# 规约地图

用于快速定位规约文件的索引。
规约条目是事实来源。
开发过程中，代码可能与规约暂时不一致。

## 编写和审阅规约

在编写、修改或审阅 DR、IR 或条目前，先了解 [`meta.md`](meta.md) 中的规则。

- DR 和 IR：见 [Organization](meta.md#organization)、[Records](meta.md#records) 和 [Citations and dependencies](meta.md#citations-and-dependencies)。
- 条目：见 [Item syntax](meta.md#item-syntax)、[Packages](meta.md#packages)、[Compositions](meta.md#compositions) 和 [Verification](meta.md#verification)。

## 目录结构

```text
decisions/    决策记录（DRs）
iterations/   迭代记录（IRs）
packages/     独立完整的包契约
compositions/ 已安装绑定、集成场景与验证
map.md        本索引
meta.md       规约的规约
```

## 决策

| ID | 文件 | 摘要 |
| --- | --- | --- |
| DR-000 | [000-spec-structure-format.md](decisions/000-spec-structure-format.md) | 规约结构、格式和命名约定 |

## 迭代

| ID | 文件 | 目标 |
| --- | --- | --- |
| IR-000 | [000-spdx-headers.md](iterations/000-spdx-headers.md) | 为适用文件添加 SPDX 头 |

## 包

### GIT

| 文件 | 摘要 |
| --- | --- |
| [git.md](packages/git.md) | 提交信息格式和 AI 共同作者 trailers |

### LIC

| 文件 | 摘要 |
| --- | --- |
| [licensing.md](packages/licensing.md) | SPDX 头要求与验证检查 |

## 组合

暂无。当包需要已安装绑定或集成场景时，在 `compositions/` 下添加文件。
