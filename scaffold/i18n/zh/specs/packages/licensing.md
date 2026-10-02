<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- spex-i18n-source: specs/packages/licensing.md sha256-0fdea7c594fe52e33c78f30afd2edc3e53414a8ee666a1a4acdaf64ee05487b0 -->

# licensing: 许可证头

## 意图

本规约包使贡献者和审阅者能够通过一致的 SPDX 头识别项目中纳入文件的版权和许可证。
它负责头部的适用范围和内容，不负责项目许可证的选择。
它仅适用于当前项目。

## 外部行为

### licensing-6

当对项目文件进行许可证头分类，许可证头适用范围应恰好排除以下类别：

- 不支持注释语法的文件，例如 JSON 和二进制文件；
- 配置文件，例如 `.gitignore`、`.editorconfig`、`**/settings.json`、`AGENTS.md`、`.github/workflows/ci.yml`，以及锁文件；
- 生成内容或第三方供应内容，例如 `dist/`、`node_modules/` 和第三方供应目录；以及
- 许可证和法律文档。

### licensing-7

当检查项目根目录以确定其许可证，许可证文件检测器应识别以下模式：

- `LICENSE`、`LICENSE.txt`、`LICENSE.md`、`COPYING`
- `LICENSE-CONTENT`、`LICENSE-APACHE` 等（带名称的变体）
- `LICENCE`、`LICENCE.txt`（英式拼写）
- `LICENSES/` 文件夹（REUSE 约定）

### licensing-1

给定文件支持注释语法且未被许可证头适用范围排除 [[licensing-6](#licensing-6)]，如果文件已由 Git 跟踪或可通过 `git add` 添加，当准备将文件纳入仓库，文件应在任何 shebang 之后的第一个注释块中包含 `SPDX-FileCopyrightText`。

### licensing-2

给定文件支持注释语法、未被许可证头适用范围排除 [[licensing-6](#licensing-6)]，且一个或多个项目根目录许可证文件匹配许可证文件检测器的模式 [[licensing-7](#licensing-7)]，如果文件已由 Git 跟踪或可通过 `git add` 添加，当准备将文件纳入仓库，文件应在任何 shebang 之后的第一个注释块中包含 `SPDX-License-Identifier`。

### licensing-5

给定文件的第一个注释块已包含来自上游的 `SPDX-FileCopyrightText` 或 `SPDX-License-Identifier`（例如从其他项目复制的模板或第三方供应文件），当准备将文件纳入仓库，这些已有 SPDX 行应原样保留，即使项目根目录采用不同的许可证——每条保留的上游行分别满足相应的版权头要求 [[licensing-1](#licensing-1)] 或许可证头要求 [[licensing-2](#licensing-2)]，任何缺失的必需行均由上游来源补齐，而非采用项目许可证。

### licensing-9

给定文件不含上游 SPDX 行 [[licensing-5](#licensing-5)]，当为版权头要求 [[licensing-1](#licensing-1)] 和许可证头要求 [[licensing-2](#licensing-2)] 编写其 SPDX 行，这些行应使用文件原生的注释语法注明项目自己的许可证和版权持有人：

```markdown
<!-- SPDX-License-Identifier: <license> -->
<!-- SPDX-FileCopyrightText: <year> <holder> -->
```

```typescript
// SPDX-License-Identifier: <license>
// SPDX-FileCopyrightText: <year> <holder>
```

- 版权持有人为 `<holder>`，许可证为 `<license>`；年份为文件首次纳入项目的年份。
- 仍以 `<...>` 占位符形式呈现的值尚未解析：应将其替换为项目自己的值，绝不使用从模板文件复制的持有人。

## 验证

### licensing-3

给定文件支持注释语法且属于许可证头适用范围 [[licensing-6](#licensing-6)]，如果文件已由 Git 跟踪或可通过 `git add` 添加，当检查任何 shebang 之后的第一个注释块，验证应通过找到 `SPDX-FileCopyrightText` 来断言版权头要求 [[licensing-1](#licensing-1)]。

### licensing-4

给定文件支持注释语法、属于许可证头适用范围 [[licensing-6](#licensing-6)]，且许可证文件检测器 [[licensing-7](#licensing-7)] 识别出项目根目录的许可证，如果文件已由 Git 跟踪或可通过 `git add` 添加，当检查任何 shebang 之后的第一个注释块，验证应通过找到 `SPDX-License-Identifier` 来断言许可证头要求 [[licensing-2](#licensing-2)]。

### licensing-8

给定文件已包含上游 SPDX 行且项目许可证不同，当运行纳入准备流程，验证应断言每条上游行均逐字节保留，且任何缺失的必需行均采用上游数据而非项目许可证数据 [[licensing-5](#licensing-5)]。
