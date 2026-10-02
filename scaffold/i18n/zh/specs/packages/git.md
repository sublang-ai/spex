<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- spex-i18n-source: specs/packages/git.md sha256-f4bdc7cf1ea7be17575fb189abb9fa3cfbc9eeb8a7bccefbbffdbea3d4210608 -->

# git: Git 工作流程

## 意图

本规约包使贡献者和维护者能够创建可审计的项目提交，并采用一致的提交信息和 AI 署名。
它负责提交准备和提交信息约定，不负责分支、审阅或发布策略。
它仅适用于当前项目。

## 外部行为

### git-1

当贡献者或维护者要求提交工作流程准备一次提交，提交准备过程应报告已配置的 `user.name` 和 `user.email`，或指出每个缺失的值，并在两者均配置前不创建任何提交。

### git-2

当编写提交信息的主题行，提交信息应采用 `<type>(<scope>)<!>: <subject>` 格式，其中 `<scope>` 可选，破坏性变更包含 `!`，`<type>` 为 `feat|fix|docs|style|refactor|test|ci|build|perf|chore` 中的一种，`<subject>` 使用祈使语气、长度 <=50 字符且不以句点结尾。

### git-3

给定提交信息包含正文，当编写正文，提交信息正文应解释改了什么以及为什么修改，而非如何修改，以 72 字符为换行上限，并在使用项目符号列表更清晰时采用该形式。

### git-4

当 AI 协助编码或编写内容，提交信息应在 Git 识别的末尾连续尾注块中包含一个或多个 `Co-authored-by` 尾注，尾注之间无空行，且每个尾注采用 `<model> (<role>) <email>` 格式，其中 `<role>` 为 `coder|reviewer|maintainer` 中的一种，`<email>` 为 `cligent@sublang.ai`：

```text
Co-authored-by: GPT-6 Sol (coder) <cligent@sublang.ai>
Co-authored-by: Claude Opus 5.5 (reviewer) <cligent@sublang.ai>
```

### git-5

给定提交实现了已记录的意图，提交信息应在主题行或正文中以 `IR-<N>` 形式的纯 ID 引用意图记录。

## 验证

### git-6

当审计已准备的提交，审计应断言该提交遵循本规约包的约定：

- 提交记录已配置的 `user.name` 和 `user.email` [[git-1](#git-1)]；
- 主题行遵循 `<type>(<scope>)<!>: <subject>` 格式 [[git-2](#git-2)]；
- 正文如存在，应解释改了什么以及为什么修改，并以 72 字符为换行上限 [[git-3](#git-3)]；
- AI 协助完成的提交所要求的一个或多个 `Co-authored-by` 尾注出现在 Git 解析出的尾注块中，并采用规定格式 [[git-4](#git-4)]；
- 实现已记录意图的提交引用该意图记录的 ID [[git-5](#git-5)]。
