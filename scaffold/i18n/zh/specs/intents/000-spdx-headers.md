<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- spex-i18n-source: specs/intents/000-spdx-headers.md sha256-d2246bb72b8a1be75cf8dd293e80c51e5f5de6f810a8d1fbc71982a52d3fecc3 -->

# IR-000: SPDX 头

## 状态

待处理

## 意图

将 [[licensing-1](../packages/licensing.md#licensing-1)]、[[licensing-2](../packages/licensing.md#licensing-2)]、[[licensing-5](../packages/licensing.md#licensing-5)] 应用于适用范围内的文件，使用项目自己的头部格式 [[licensing-9](../packages/licensing.md#licensing-9)]。

## 交付项

- [ ] [`packages/licensing.md`](../packages/licensing.md) 的 `licensing-9` 注明项目的许可证和版权持有人，不留任何 `<...>` 占位符
- [ ] 为适用范围内缺少 SPDX 头的文件添加这些头

## 任务

1. 确认头部格式：脚手架已根据项目的 `LICENSE` 和 `git config user.name` 固定 `licensing-9`；将其遗留的任何 `<license>` 或 `<holder>` 占位符替换为项目的 SPDX 许可证标识符和版权持有人。

2. 确定适用范围：依据 [[licensing-7](../packages/licensing.md#licensing-7)] 检测项目根目录的许可证文件；依据 [[licensing-6](../packages/licensing.md#licensing-6)] 枚举适用范围内的文件。

3. 按照 `licensing-9` 所示，使用文件原生的注释语法，在每个文件的第一个注释块（任何 shebang 之后）中插入 SPDX 行。

## 验证

- `licensing-9` 不含任何 `<...>` 占位符。
- [[licensing-3](../packages/licensing.md#licensing-3)]、[[licensing-4](../packages/licensing.md#licensing-4)] 在所有适用范围内的文件上通过验证。
