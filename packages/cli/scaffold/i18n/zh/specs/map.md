<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# 规约地图

用于快速定位规约文件的索引。
规约条目是事实来源。
开发过程中，代码可能与规约暂时不一致。

## 编写和审阅规约

在编写、修改或审阅 DR、IR 或条目前，先了解 [`meta.md`](meta.md) 中的规则。

- DR 和 IR：见 [Organization](meta.md#organization)、[Record format](meta.md#record-format) 和 [Citation](meta.md#citation)。
- 条目：见 [Organization](meta.md#organization)、[Item syntax](meta.md#item-syntax)、[Spec packages](meta.md#spec-packages) 和 [Citation](meta.md#citation)。

## 目录结构

```text
decisions/  决策记录（DRs）
iterations/ 迭代记录（IRs）
user/       用户可见行为
dev/        实现要求
test/       验收测试
map.md      本索引
meta.md     规约的规约
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

| 分组 | 文件 | 摘要 |
| --- | --- | --- |
| dev | [git.md](dev/git.md) | 提交信息格式和 AI 共同作者 trailers |

### LIC

| 分组 | 文件 | 摘要 |
| --- | --- | --- |
| dev | [licensing.md](dev/licensing.md) | SPDX 头要求和文件范围规则 |
| test | [licensing.md](test/licensing.md) | 版权和许可证头存在性检查 |
