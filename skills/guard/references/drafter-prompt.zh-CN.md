<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- skill-atlas:source sha256=62679386dcc9434b86d56b06c5b67f6d68321daf268d54d14a88a39c19977ef3 own=8d4ec5916f631c1b9a1ce4a498cbcecf7e2882e2568f8693d252db49c4cac598 -->
> 本文件是 `drafter-prompt.md` 的简体中文译本，供人阅读；代理使用的是原文件。

# Drafter 提示词

主导者在同一轮次中向每个 Drafter 发送相同的第一个提示词，其中带有它自己的一个名字。
尖括号中的文本由主导者填写。

## 目录

- [主导者填写什么](#主导者填写什么)
- [起草一份转译](#起草一份转译)
- [改正转译的形式](#改正转译的形式)

## 主导者填写什么

| 占位符 | 内容 |
| --- | --- |
| `<name>` | 这份转译的名字，也是它的文件的名字和它的起始行 `---- MODULE <name> ----` 给出的名字：`a`、`b`、`c` 等，每个 Drafter 各不相同 |
| `<rule-item>` | 规则的全文，从其标题开始 |
| `<guard-item>` | 守卫条目的全文，从其标题开始，连同每个用例 |
| `<cited-items>` | 这两个条目引用的其他每个条目的全文，或 `none` |
| `<declaration>` | `binding.yaml` 的 `values` 和 `events`，连同其中的注释，不含该文件的其他内容 |
| `<declaration-in-tla>` | TLA+ 形式的声明：`spex verify --keep` 留下的整个 `Declaration.tla` 文件，见 [formats.md](formats.zh-CN.md) |
| `<format>` | [formats.md](formats.zh-CN.md) 的*转译*一节，一字不差 |
| `<translation>` | 该 Drafter 的转译，与保存时一致 |
| `<cause>` | `spex verify` 打印的、指名这份转译的每一行 `Cannot be checked`，各自连同打印在它下面的行 |

不要给 Drafter 别的任何东西：不给代码，不给通向代码的路径，不给守卫文件，不给其他转译，也不透露你预期什么。
Drafter 是一个独立的代理：它仅依据条目、声明和 TLA+ 形式的声明起草。

## 起草一份转译

先引用：

> Rule: <rule-item>
> Guard item, with its cases: <guard-item>
> Items they cite: <cited-items>
> Declaration: <declaration>
> Declaration in TLA+: <declaration-in-tla>
> Format: <format>

然后是指示：

```markdown
Draft one translation of the items quoted above: one TLA+ file in the format quoted, opened by the line `---- MODULE <name> ----`.
A translation is the items written in TLA+: the rule, clause by clause, and the model, which is what the items say each event gives.

Work from the quoted items, the declaration and the declaration in TLA+ alone.
Do not read the project's code, its tests, its history or any file under guards/, and do not look for another translation.
Take what must hold, and what each event gives, from the items' words, not from how you expect software to behave.
The cases show what the items' author means: your translation must allow each permitted case and forbid each forbidden case.
Where the items leave something open, choose what you find most faithful to their words and go on; do not ask.

Define the seven operators, under these names and with these parameters:
- `Start`, `Legal(s, e)`, `Effect(s, e)` and `After(s, e)`, the model: its starting state, when the event `e` can happen in the state `s` at all, the one effect the items require it to give there, and the state after it;
- `When(e)`, `While(s, e)` and `Shall(s, e, f)`, the rule, clause by clause as its item reads: its trigger, its conditions in the state before the event, and whether the effect `f` is what it requires.

Let the model say only what the quoted items say.
Say that an event is not legal only where it cannot happen in that state at all; what the rule forbids belongs in `Shall`, never in `Legal`.
Write `Shall` to judge every declared effect of the event, not only the one your model gives.
Keep in the state only what the items make a later event depend on, so that the model reaches finitely many states.
Put the ID of the item a branch translates in a TLA+ comment above it.
Use only the declared values, events, params and effect fields, under the names the declaration in TLA+ gives them.
Never write `CHOOSE`: choose among declared values with the declaration's `First` and `Rank` operators.
Never write a prime, `ENABLED` or `UNCHANGED`: a translation speaks of the state it is given, never of the next.
Extend `Declaration` and, where you need them, `Naturals`, `Integers`, `FiniteSets` and `Sequences`, and nothing else.

Reply with the whole TLA+ file in one fenced block.
After it, list in plain words each point the items left open and what you chose.
```

主导者把围栏中的文件原样保存为 `<name>.tla`，项目要求的文件头注释行加在它的第一行之下。
Drafter 列出的各点是给主导者看的：如果两个 Drafter 的选择不同，`spex verify` 会打印出一个把它们的转译区分开的序列。

## 改正转译的形式

发给其转译无法被 `spex verify` 检查的那个 Drafter。
如果宿主允许，就让同一个 Drafter 继续；否则给一个全新的 Drafter 发送第一个提示词，并加上这两段引用。

> Your translation, saved as <name>.tla: <translation>
> Cause: <cause>

```markdown
The translation quoted above cannot be checked, for the cause quoted.
A place in the cause is a line and a column of the file as it was saved; a sequence under it is the events after which the cause was met.
Correct the file's form so that it says what you meant, and change nothing else.
Work from the cause alone: do not read the project's code or another translation.
Reply with the whole TLA+ file in one fenced block.
```

主导者不向 Drafter 提供对这个原因的任何解读，也不提出自己的任何建议。
