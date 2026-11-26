<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- skill-atlas:source sha256=da526a34256a011cb308ddd448a0a156382d83aac88cc0b12d436785bc4c2b3d own=f2091a6f59c418fc12aa75847315544e19925dea504ecb2abb9d4d73417d3af9 -->
> 本文件是 `results.md` 的简体中文译本，供人阅读；代理使用的是原文件。

# 阅读报告

`spex verify` 报告的每一行是什么意思，以及接下来该做什么。
贯穿始终的规则：绝不要为了通过而削弱示例、解读或边界。

## 目录

- [一次运行做什么](#一次运行做什么)
- [守卫区块中的各行](#守卫区块中的各行)
- [示例为何与所述不符](#示例为何与所述不符)
- [四种结果](#四种结果)
- [结果为何是 Inconclusive](#结果为何是-inconclusive)
- [留存缺陷为何没有被抓住](#留存缺陷为何没有被抓住)
- [守卫为何没有通过](#守卫为何没有通过)
- [命令如何结束](#命令如何结束)

## 一次运行做什么

`spex verify` 按名字顺序检查每个守卫；`spex verify <guard>…` 按给出的顺序检查指名的那些。
名字顺序按码元比较，所以 `entitlement-10` 排在 `entitlement-2` 之前。
它不调用任何模型，也不在项目中写入任何东西。
对每个守卫，它：

1. 加载守卫的文件和条目；
2. 把它们与批准记录比较；
3. 不用代码，对照每个解读检查每个示例；
4. 在项目代码的一个副本上运行每个允许的示例；
5. 在该副本上运行抽样检查：生成由已声明事件组成的序列，每个序列由每个解读逐步评判；
6. 在带有每个留存缺陷的副本上，以相同的边界运行同样的抽样检查。

在抽样检查中，只有当每个解读都认为某个事件合法时才引发它；当每个解读都认为它不合法时则跳过它。
每个解读都禁止的一步是一次违反，它的序列到此结束。
在允许的示例中发现违反，会结束该副本上的检查，所以抽样检查不会运行。
无法检查的守卫不会进行第 2 到第 6 步。

## 守卫区块中的各行

| 行 | 含义 | 接下来做什么 |
| --- | --- | --- |
| `<guard> — protects <item>` | 守卫，以及其断言所引用的行为条目 | 无 |
| 它下面的一行 | 断言条目的语句，每个链接打印为它的文字，所以一处引用显示为 `[entitlement-1]` | 无 |
| `Cannot be checked — <file or item>: <cause>` | 某个文件、条目或表达式有错误，这个守卫的其余检查都没有运行。区块只有守卫的名字和这一行 | 改正被指出的东西。如果是解读，把原因转给它的 Drafter；绝不要自己改正解读。如果是 `guard.yaml` 没有写明的效果字段，见步骤 2 |
| `Approval: approved` | 每个条目和文件都与批准记录所记一致 | 无 |
| `Approval: not approved — changed: …; added: …; gone: …` | 被指出的条目或文件与记录不同 | 首次批准之前，无需处理。之后，审视每一处被指出的改动。如果有条目变了，重新起草解读。然后询问用户；只凭他们的话运行 `spex approve <guard>` |
| `Approval: not approved — no approval record` | 这个守卫从未被批准 | 完成起草，然后询问用户 |
| `Approval: not approved — <path>: <cause>` | 批准记录无法按 `spex approve` 的写法读取，例如合并冲突之后 | 像首次批准那样审视守卫，然后询问用户；`spex approve <guard>` 会替换该记录 |
| `run spex approve <guard> after reviewing` | 打印在每个 `not approved` 之下，是写给用户的 | 它不是用户的话；绝不要凭这一行运行 `spex approve` |
| `Examples against the readings: <n> examples, <m> readings, all as stated` | 每个解读都把每个允许的示例看作允许、把每个禁止的示例看作禁止，并且有一个允许的示例展示了该行为的发生 | 无 |
| `Examples against the readings: <n> examples, <m> readings, <k> not as stated` | 后面每个失败项占一行：`<example item>, reading <name>: <failure>` | 见[示例为何与所述不符](#示例为何与所述不符) |
| `On the code: <result>` | 项目代码的唯一结果 | 见[四种结果](#四种结果) |
| `<n> sequences, <k> in which the assertion applied` | 运行了多少个序列，以及其中多少个序列里断言在每个解读之下于某一步适用 | `<k>` 很小说明样本单薄：见下文的 `no sequence in which the assertion applied` |
| `<event>: caused <n>, skipped <m>` | 该事件被引发了多少次，以及因不合法被跳过了多少次 | 从未被引发的事件没有得到检查：与用户一起查看各解读的 `legal` 条件 |
| `fast-check …, Spex …, Node …` | 本次运行使用的版本 | 无 |
| `revision <commit> [with changes], copied files sha256 <digest>` | 被检查的代码：Git 提交，被复制的文件与它不同时带 `with changes`，以及被复制文件摘要的前 12 位十六进制数字。没有 Git 时这一行以 `no Git revision` 开头 | 无 |
| `bounds: …` | 守卫文件的四个边界 | 无 |
| `legal when — <reading>: …` | 每个解读对每个事件何时可以发生所作的假定 | 把任何不是 `true` 的条件告诉用户：它是该结果的一个假定 |
| `Kept fault <name>: caught at sequence <n>` | 在带有该缺陷的副本上，检查发现了每个解读都禁止的效果；后面跟着收缩后的序列，其最后一步标有 `forbidden by every reading` | 无 |
| `Kept fault <name>: not caught — <reason>` | 守卫没有抓住该缺陷 | 见[留存缺陷为何没有被抓住](#留存缺陷为何没有被抓住) |
| `Passes` | 守卫通过 | 无 |
| `Does not pass — <reasons>` | 每一个成立的原因 | 见[守卫为何没有通过](#守卫为何没有通过) |

打印出的序列中，一步读作 `<n>. <event> <param>=<value> … -> <field>=<value> …`：事件、它的参数，然后是观察到的效果。
没有效果字段可显示的一步（例如 `1. grant who=ann`）不带 `->`。
集合打印为 `{a, b}`，映射打印为 `{ann: 1, bob: 0}`，缺失值打印为 `none`。
数目为一时，报告写 `example`、`reading`、`time` 和 `second`。

## 示例为何与所述不符

每个失败项指出一个示例和一个解读。

| 失败项 | 含义 | 接下来做什么 |
| --- | --- | --- |
| `step <n> is not legal` | 该解读认为那个事件在那里不能发生 | 步骤 3：与用户裁定这个示例是否可以发生，然后丢弃与它相矛盾的每个解读 |
| `step <n> is forbidden` | 该解读禁止某个允许的示例的一步 | 步骤 3 |
| `step <n> is forbidden before the last step` | 该解读在某个禁止的示例的最后一步之前就禁止了它 | 步骤 3 |
| `the last step is not forbidden` | 该解读允许了某个禁止的示例所说绝不能发生的事 | 步骤 3 |
| `step <n>: <cause>` | 那一步出现解读错误：超出变量类型的新值，或过大的数 | 把它转给该解读的 Drafter。如果它不只是形式上的笔误，就丢弃该解读 |
| `no permitted example has a step at which the assertion applies under every reading` | 没有任何允许的示例展示该行为的发生。这一行不指出示例或解读 | 与用户一起添加一个断言在其中适用的允许的示例 |

## 四种结果

一次运行最先发现的下列情况之一就是结果。

| 结果 | 运行发现了 | 接下来做什么 |
| --- | --- | --- |
| `Violated on the implementation` | 项目代码上出现了每个解读都禁止的效果。报告会打印 `found in example <item>`，或 `found at sequence <n> with seed <seed>, shrunk <k> times`，然后打印该序列，并用 `forbidden by every reading` 标出那一步 | 这是一项发现。用平实的话把序列展示给用户。如果代码错了，守卫已经尽到职责：修复是对代码的改动，在改好之前同一条命令会打印同一个序列。如果用户说这个序列没有问题，说明条目说了他们并不想说的东西：与他们一起改正条目，并重新起草解读。不要为了让它消失而改动任何解读、示例或边界 |
| `Disagreement with the model` | 某个允许的示例所述的效果代码没有产生，或者某个示例对照解读展示了该行为、在代码上却没有。报告会打印 `example <item>, step <n>, field <field>: stated <value>, observed <value>`，或 `example <item> shows the protected behavior against the readings and not on the code` | 先检查模块：它是否引发了那个事件，并返回了代码实际做的事？那里的错误由你改正。否则展示给用户：要么示例说了代码没有做的事，要么代码错了。未经他们同意，绝不要把示例的效果改成与代码一致 |
| `Inconclusive` | 检查无法对问题得出结论 | 见下一节 |
| `Sampled on the implementation` | 以上都没有，并且每个序列都已运行 | 如实说明：在这些边界之内的这么多个序列样本没有发现被禁止的效果，除这批样本之外它什么也没有表明 |

## 结果为何是 Inconclusive

| 打印出的原因 | 含义 | 接下来做什么 |
| --- | --- | --- |
| `the examples do not agree with the readings` | `Examples against the readings` 一行之下列出了失败项 | 见[示例为何与所述不符](#示例为何与所述不符) |
| `an undecided event at sequence <n>: the readings differ on whether it is legal` | 有的解读认为某个事件在那里合法，有的不认为。它没有被引发。报告会打印到它为止的序列，该事件标有 `(not caused)`，以及每个解读的判断，如 `legal — a: no, b: yes` | 步骤 3：把那个以该事件结尾的序列展示给用户 |
| `an undecided step in example <item>: the readings differ on whether …`、`an undecided step at sequence <n>: the readings differ on whether …` | 这一行的结尾是各解读判断不同之处：`the event is legal`（事件是否合法）、`the assertion applies`（断言是否适用）或 `the effect is forbidden`（效果是否被禁止），各解读在两项上判断都不同时，这两项以 ` and whether ` 相连。报告会打印到这一步为止的序列以及每个解读的判断 | 步骤 3：把那个序列连同看到的效果展示给用户 |
| `a failing binding: <cause>` | 副本无法建立、某条命令无法启动或失败、模块没有加载、缺少函数或函数抛出异常、返回值不是已声明的效果、副本的进程在给出结果之前结束，或者某个曾破坏断言的序列在重新运行时不再破坏。对于提前结束的命令或进程，原因是它写到标准错误的最后一行，堆栈行除外 | 改正模块、`files` 或 `commands`。如果原因指出某个值超出其声明的类型，可能说明声明太窄：改变它的值或事件就意味着重新起草解读 |
| `a reading error: <cause>` | 某个解读给出了超出变量类型的新值，或过大的数。原因会指出该解读 | 把它转给该解读的 Drafter。如果它不只是形式上的笔误，就丢弃该解读 |
| `a project file loaded from outside the copy: <file>` | 模块或它加载的代码访问了 `files` 没有列出的项目文件。只有副本进程的主线程中的加载能被看到，工作线程或代码启动的进程中的加载看不到 | 把它加入 `files` |
| `a timeout: not done after <n> seconds` | 某条命令或副本的进程在 `sample.seconds` 时被停止，它启动的每个进程也随之停止，但在 macOS 和 Linux 上不包括通过开启自己的会话而离开了其进程组的进程 | 找出命令、模块或代码中哪里慢或永不返回。只有当检查确有理由慢时才调高 `seconds` |
| `no sequence in which the assertion applied` | 样本从未到达断言所谈的情形 | 与用户一起添加一个能到达这种情形的允许的示例，因为每个序列都从某个允许的示例开始。让声明的值保持少量。如果还不够，调高 `sequences` 或 `events` |

## 留存缺陷为何没有被抓住

只有当抽样检查在缺陷的副本上发现每个解读都禁止的效果时，缺陷才算被抓住。

| 打印出的原因 | 含义 | 接下来做什么 |
| --- | --- | --- |
| `the patch does not apply: <cause>` | 它指名的某个文件没有被复制或不是文本，或某个改动块在哪里都匹配不上：代码已经变动 | 针对现在的代码为同一个缺陷写一个替代品。它需要用户的批准 |
| `the patch changes nothing` | 应用补丁之后，每个被复制的文件都与原来一样 | 写一个确实改变代码行为的补丁 |
| `the binding failed: <cause>` | 带上缺陷后，某条命令或模块失败 | 如果原因指出某个值超出其声明的类型，说明声明对出错的代码返回的值来说太窄：放宽它并重新起草解读。否则选择一个让代码仍能构建和运行、只改变其行为的缺陷 |
| `a timeout: not done after <n> seconds` | 带上缺陷后，某条命令或副本的进程在时间限制时被停止 | 选择一个不会让代码挂起的缺陷 |
| `a reading error: <cause>` | 带上缺陷后，某个解读给出了超出变量类型的值或过大的数 | 同上文的 `a reading error: <cause>` |
| `a project file was loaded from outside the copy: <file>` | 带上缺陷后，模块访问了 `files` 没有列出的项目文件 | 把它加入 `files` |
| `the readings disagreed` | 带缺陷的副本上出现了未决的事件或步骤，并且没有违反。报告在这里不打印序列 | 就该缺陷所破坏的情形并排阅读各解读，找出一个它们会给出不同回答的序列，带着它进入步骤 3 |
| `no violation in <n> sequences` | 每个序列都已运行，没有一个出现被禁止的效果 | 守卫抓不住这个缺陷。手工推出本应暴露它的序列。如果没有这样的序列，说明该缺陷并不破坏断言：植入一个会破坏断言的缺陷。如果有，就与用户一起添加一个通向它的允许的示例，或者调高 `sequences` 或 `events` |

指名了绑定的 `files` 之外的路径的补丁，或者不是所允许的那种统一 diff 的补丁，不属于以上任何一种：该守卫是 `Cannot be checked`（见 [formats.md](formats.zh-CN.md)）。

## 守卫为何没有通过

| 原因 | 接下来做什么 |
| --- | --- |
| `not approved` | 在起草结束时，如果只有它一个原因，这正是你询问用户之前想要的。否则见 `Approval` 一行 |
| `examples do not agree with the readings` | 步骤 3 |
| `the check on the code is <result>` | 见[四种结果](#四种结果) |
| `no kept fault` | 步骤 4：守卫至少需要一个 |
| `kept fault <name> not caught` | 见[留存缺陷为何没有被抓住](#留存缺陷为何没有被抓住) |

## 命令如何结束

| 情形 | 退出状态 |
| --- | --- |
| 它检查的每个守卫都通过，或 `No guards under guards/.` | `0` |
| 某个守卫没有通过或无法检查；某个名字不是守卫；带了选项；Node 早于 22.15 | `1` |
| 被中断（SIGINT） | `130` |
| 被要求退出（SIGQUIT） | `131` |
| 被要求结束（SIGTERM）；挂断（SIGHUP） | `143`；`129` |

收到这四种信号中的任何一种时，`spex verify` 先停止其各副本的每个进程，并删除每个副本。
一次运行的最后一行是 `<n> of <m> guards pass.`

`spex approve <guard>` 不运行任何检查，也不提任何问题，所以在它之前和之后都要运行 `spex verify`。
它依次打印：

1. `<guard> — protects <behavior item>`，其下是断言条目的语句；
2. 每个示例：`<example item> — <kind>`、其条目的语句和它保存的序列；
3. 守卫相对于上次记录的状况：`First approval.`、`Nothing changed since the last approval.`、`Since the last approval:`（其下是 `changed: …`、`added: …` 和 `gone: …` 各行），或 `The last record cannot be read — <path>: <cause>.`；
4. 记录写入之后，`Approved <guard> — commit guards/<guard>/approval.json.`。

它以 `0` 退出。对于无法检查的守卫，它以 `1` 退出并给出原因，什么也不写入。
