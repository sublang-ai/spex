<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- skill-atlas:source sha256=cc9b9397278f192119d7bbaf39202392431b84ddf883e7f3f20360d3da233ae6 own=246281cc3c9025501a40cec53d9590b27d0ba74e98de8287e3f4add10bd4e499 -->
> 本文件是 `results.md` 的简体中文译本，供人阅读；代理使用的是原文件。

# 阅读报告

`spex verify` 报告中每一行的含义，以及接下来该做什么。
贯穿始终的规矩：绝不要为了通过而削弱用例、转译或已声明的值，也绝不要为了迁就代码而改动转译。

本文件中的每一份报告都是真实输出，来自同一个虚构的守卫：`lock-9`，它守卫的是一把由一个用户持有、其他用户等待的锁，有 `a` 和 `b` 两份转译。
[formats.md](formats.zh-CN.md) 给出了它的条目、它的声明和转译 `a`。

## 目录

- [一次运行做什么](#一次运行做什么)
- [守卫区块中的各行](#守卫区块中的各行)
- [无法被检查的守卫](#无法被检查的守卫)
- [用例检查为什么失败](#用例检查为什么失败)
- [区分序列](#区分序列)
- [各种结果](#各种结果)
- [Conflict in the items](#conflict-in-the-items)
- [Violated on the code](#violated-on-the-code)
- [Code differs from the model](#code-differs-from-the-model)
- [Case failed](#case-failed)
- [结果为什么是 Inconclusive](#结果为什么是-inconclusive)
- [通过的结果依赖什么](#通过的结果依赖什么)
- [留存缺陷为什么没有被尝试或没有被抓住](#留存缺陷为什么没有被尝试或没有被抓住)
- [守卫为什么不通过](#守卫为什么不通过)
- [保留 TLC 运行过的东西](#保留-tlc-运行过的东西)
- [命令如何结束](#命令如何结束)

## 一次运行做什么

`spex verify` 按名字顺序检查每一个守卫；`spex verify <guard>…` 检查被指名的那些。
名字顺序按码元比较，所以 `environments-100` 排在 `environments-56` 之前。
它不调用任何代理和语言模型，不随机抽取任何东西，也不在项目中写入任何东西：相同的文件和代码给出相同的运行。
它需要 Java 11 或更高版本，取自 `JAVA_HOME`，否则取路径上的 `java`，还需要它锁定的那一个 TLC，即 TLC 2.19；第一次运行会把它下载到 Spex 主目录，并检查其摘要。
如果 `SPEX_TLC_JAR` 指名了一个 `tla2tools.jar`，就使用那一个。

不用代码，由 TLC 对每个守卫进行：

1. **形式。** 每份转译被单独读取。每份转译的每个错误都会打印出来，在没有错误之前不检查别的。
2. **用例。** 每份转译都必须允许每个允许的用例并禁止每个禁止的用例，并且在每份转译之下，规则都必须在某个允许用例的某一步适用。
3. **转译之间。** TLC 把所有转译并排检查：在它们之中任何一份到达的每一步上，它们必须给出同样的四个回答，按这个顺序比较：事件是否合法、模型的效果是什么、规则是否适用、某个效果是否被禁止，最后一项针对每一种已声明的效果。守卫需要两份或更多转译：单独一份没有可比较的对象，这时守卫不通过。
4. **在模型上。** TLC 检查名字顺序中第一份转译的模型：在模型到达的每个状态下，对每个合法的事件，模型的效果都是一种已声明的效果，并且规则不禁止它。只有在没有状态剩下时 TLC 才结束，所以对这个模型和已声明的值而言，这项检查是完整的。

在代码的一个副本上，这是测试，并且只在用例与标注相符、转译一致或只有一份、且模型已检查到底时进行：

5. 引发每个允许用例的各步，并比较每个写明的效果字段。
6. 模型的每一步被引发一次：一个全新的起点，一个通向其状态的最短序列，然后是它的事件。观察到的效果必须等于模型的效果。不同的观察效果会交给 TLC，由它说明规则是否禁止它。如果 TLC 在说明之前就在时间限度时被停止，这一步就计为 `not judged`。
7. 第 5 步和第 6 步在带有每个留存缺陷的副本上再运行一遍。只有当规则禁止某个观察到的效果时，缺陷才算被抓住。

**一步**是一个事件及其参数和一个效果：在用例中写明，由模型给出，由规则评判，在代码上被观察到。
**模型的一步**是模型的一个状态下的一个合法事件。
一份转译**允许**一个允许的用例，是指每一步都合法，它的模型给出这一步写明的每个效果字段，并且没有哪一步被禁止。
它**禁止**一个禁止的用例，是指最后一步之前的各步都是如此，而在最后一步规则适用，有某种已声明的效果与写明的字段一致，并且每一种这样的效果都被禁止。
事件**合法**，是指这个事件在这个状态下根本可能发生，正如没有扣费就不可能退款。
不合法的事件不在代码上尝试；它绝不算违反。

这是那个虚构守卫一次通过的运行的报告：

```text
Protect critical behavior on every change

lock-9 — checks the rule lock-3:
  While a user holds the lock, when another user takes it, the lock shall stay with its holder,
  refuse the taker and report the taker among those waiting, as [lock-4] orders them.
  Approval: approved
  Cases, without the code: each of 2 translations allows the 2 permitted cases and forbids the 1 forbidden case
  Translations against each other: 2 translations, in agreement at every step TLC reached
  On the model: TLC 2.19 checked every state the model of translation a reaches: 13 states, 40 steps; the rule applied at 12 steps
    TLC's own estimate of the chance it missed a state: 8.0E-17
  On the code: 40 steps tested, each after a shortest sequence from a fresh start: each gave the model's effect
    the 2 permitted cases went as their steps state
  Result: Model checked, code tested
    assumes: the declared values are the ones that matter (user = ann, bob, cy)
             what the code does next depends only on the model's state, each step being tried from one sequence
             the binding causes and observes truly
    Spex 5.0.0, Node 22.23.5, TLC 2.19 (the pinned copy), Java 21.0.13.1
    no Git revision, copied files sha256 10a99333b2f6
    limits: 60 seconds for each run of TLC and each command
  Kept fault grants-twice: caught at step 2 of the permitted case "a second taker waits"
    1. take who=ann -> granted=true holder=ann waiting={}
    2. take who=bob
       the model gives granted=false holder=ann waiting={bob}
       the code gave   granted=true holder=ann waiting={bob}
       forbidden by the rule
  Passes

1 of 1 guards pass.
```

它的修订行显示 `no Git revision`，因为这个虚构的项目不是 Git 仓库。

## 守卫区块中的各行

| 行 | 含义 | 接下来做什么 |
| --- | --- | --- |
| `<guard> — checks the rule <item>:` | 守卫和规则，即它的守卫条目引用的那个行为条目 | 无 |
| 它下面的各行 | 规则的语句，每个链接都打印成它的文字，所以引用显示为 `[lock-4]` | 无 |
| `Cannot be checked — <cause>` | 有东西无法加载或无法读取，这个守卫的其他检查都没有运行。区块只有守卫的名字和这些行 | 见[无法被检查的守卫](#无法被检查的守卫) |
| `Approval: approved` | 每个条目和文件都与批准记录所记的一致 | 无 |
| `Approval: not approved — changed: …; added: …; gone: …` | 被指出的条目或文件与记录不同 | 第一次批准之前，无。之后，逐一审阅被指出的改动。如果条目变了，重新起草转译。然后询问用户；只凭他们的话运行 `spex approve <guard>` |
| `Approval: not approved — no approval record` | 这个守卫从未被批准 | 完成起草，然后询问用户 |
| `Approval: not approved — <path>: <cause>` | 批准记录无法按 `spex approve` 的写法读取，例如合并冲突之后 | 像第一次批准那样审阅守卫，然后询问用户；`spex approve <guard>` 会替换这份记录 |
| `review the guard's items and files, then run spex approve <guard>` | 打印在每一个 `not approved` 之下，是给用户看的 | 它不是用户的话；绝不要凭这一行运行 `spex approve` |
| `Cases, without the code: each of <m> translations allows the <p> permitted cases and forbids the <f> forbidden cases` | 每份转译都允许每个允许的用例并禁止每个禁止的用例。只有一份转译时，这一行以 `the translation allows` 开头 | 无 |
| `Cases, without the code: <n> cases, <m> translations, <k> failures` | 每个失败之后跟着一行 | 见[用例检查为什么失败](#用例检查为什么失败) |
| `Cases, without the code: not checked — TLC was stopped after <n> seconds while it evaluated the cases` | 超时 | 见[结果为什么是 Inconclusive](#结果为什么是-inconclusive) |
| `Translations against each other: <m> translations, in agreement at every step TLC reached` | 有两份或更多转译时打印：在它们之中任何一份到达的任何状态下，TLC 都没有找到它们的回答不同的一步 | 无。一致说明各个 Drafter 对条目的理解相同，并不说明这种理解正确：后者靠用例和用户的批准来保证 |
| `Translations against each other: 1 translation, nothing to compare it with` | 守卫只有一份转译。它仍会被完整地检查和测试，但不通过 | 步骤 2：由全新的 Drafter 重新起草转译，使得有两份或更多转译相互比较 |
| `Translations against each other: <m> translations, they differ at step <k> of this sequence` | 后面跟着 TLC 找到的通向不同之处的最短序列，以及它最后一步提出的问题和每份转译的回答 | 见[区分序列](#区分序列) |
| `Translations against each other: <m> translations, not compared — TLC was stopped after <n> seconds` | 超时 | 见[结果为什么是 Inconclusive](#结果为什么是-inconclusive) |
| `On the model: TLC <v> checked every state the model of translation <name> reaches: <n> states, <n> steps; the rule applied at <n> steps` | TLC 结束时没有状态剩下：在每个状态下，对每个合法的事件，模型的效果都是已声明的效果，并且规则不禁止它 | 规则只在很少几步适用，说明检查得很单薄：与用户一起看看已声明的值 |
| `TLC's own estimate of the chance it missed a state: <x>` | TLC 自己给出的数字，随每一次完整的检查打印：它把两个不同的状态当成同一个的可能性 | 无 |
| `On the model: Conflict in the items — …` | 按转译的理解，条目要求一个规则禁止的效果 | 见 [Conflict in the items](#conflict-in-the-items) |
| `On the model: not checked — TLC was stopped after <n> seconds` | 超时 | 见[结果为什么是 Inconclusive](#结果为什么是-inconclusive) |
| `On the code: <n> steps tested, each after a shortest sequence from a fresh start: each gave the model's effect` | 模型的每一步都在副本上引发了一次，观察到的效果每次都等于模型的效果。模型只有一步时，这一行是 `1 step tested, after a shortest sequence from a fresh start: it gave the model's effect` | 无 |
| `On the code: <n> steps tested, …: <a> gave the model's effect, <b> an effect the rule forbids, <c> another effect, <d> not reached` | 有些不是这样。如果某一步所在序列的更早一步已经给出了另一个效果，这一步就没有被到达，只被计数而不被评判。如果评判代码效果的那次 TLC 运行在时间限度时被停止，这一行以 `, <e> not judged` 结尾：那些步给出了不是模型效果的效果，而对它什么也没有说。五个计数加起来等于被测试的步数 | 看结果 |
| `On the code: <m> of <n> steps tested` | 副本的进程没有走完每一步 | 看 `Result:` 之下的原因 |
| `the <p> permitted cases went as their steps state`、`<m> of <p> permitted cases went as their steps state` | 代码做出了多少个允许的用例。只有在引发了某个用例时才打印这一行，所以绑定在任何事件之前就失败时不打印 | 少于全部时，见 [Case failed](#case-failed) |
| `On the code: not tested — <why>` | 不用代码的检查没有全部成立，所以没有建立副本 | 看这个原因所指的那一行 |
| `On the code: not tested` | 在副本的进程启动之前绑定失败或超时：没有模块或没有 `files`、副本无法建立，或者某条命令失败或被停止 | 看 `Result:` 之下的原因 |
| `Result: <result>` | 守卫的那一个结果，即找到的最靠上的一行 | 见[各种结果](#各种结果) |
| `assumes: …` 以及它下面的两行 | `Model checked, code tested` 依赖的三件事，每行一件 | 把三件都告诉用户：[通过的结果依赖什么](#通过的结果依赖什么) |
| `Spex …, Node …, TLC … (the pinned copy), Java …` | 这次运行使用的版本。如果 `SPEX_TLC_JAR` 指名的 jar 摘要不同，则是 `not the pinned copy` | 对于另一个 jar，告诉用户：这个结果出自一个 Spex 没有锁定的 TLC |
| `revision <commit> [with changes], copied files sha256 <digest>` | 被测试的代码：Git 提交；如果某个被复制的文件与该提交不同，带有 `with changes`；以及被复制文件摘要的前 12 位十六进制数字。没有 Git 时这一行以 `no Git revision` 开头；没有建立副本时以 `no files copied` 结尾 | 无 |
| `limits: <n> seconds for each run of TLC and each command` | 守卫文件的时间限度 | 无 |
| `Kept fault <name>: caught at step <k> of …` | 在带有该缺陷的副本上，代码给出了一个规则禁止的效果；后面跟着那个序列，在它的最后一步有模型的效果和观察到的效果 | 无 |
| `Kept fault <name>: not tried — <reason>`、`not caught — <reason>` | 守卫没有抓住那个缺陷 | 见[留存缺陷为什么没有被尝试或没有被抓住](#留存缺陷为什么没有被尝试或没有被抓住) |
| `Passes` | 守卫通过 | 无 |
| `Does not pass — <reasons>` | 每一个成立的原因 | 见[守卫为什么不通过](#守卫为什么不通过) |

打印出的序列中的一步写作 `<n>. <event> <param>=<value> … -> <field>=<value> …`：事件，它的参数，然后是一个效果。
它是哪一个效果取决于所在的位置：区分序列和冲突中是模型的效果，代码上的序列中是观察到的效果，`spex approve` 打印的内容中是写明的效果。
没有效果可显示的一步没有 `->`。
集合打印为 `{a, b}`，缺失值打印为 `none`。
计数为一时，报告写 `case`、`translation`、`failure`、`state`、`step` 和 `second`。

## 无法被检查的守卫

区块只有守卫的名字，以及每个原因一行 `Cannot be checked`。
如果 TLC 是在某个位置遇到这个原因的，原因之下会有一条说明和若干步。
无法被检查的守卫不通过，它也不是一个结果：关于条目或代码什么都没有发现。

两份转译各有形式错误，在一次运行中都打印出来：

```text
lock-9
  Cannot be checked — guards/lock-9/translations/a.tla:22:28: CHOOSE is not for a translation: choose among declared values with <Values>First or <Values>Rank, so no answer rests on TLC's own order
  Cannot be checked — guards/lock-9/translations/b.tla:7:1: Was expecting "==== or more Module body" Encountered "Holder" at line 7, column 1 and token ">>"
```

一个 TLC 无法求值的表达式，连同到达它的序列：

```text
lock-9
  Cannot be checked — guards/lock-9/translations/a.tla:20:22: Attempted to compute the value of an expression of form CHOOSE x \in S: P, but no element of S satisfied P.
    TLC met it on the model, after this sequence
      1. take who=ann -> granted=true holder=ann waiting={}
```

一个不属于已声明效果的效果：

```text
lock-9
  Cannot be checked — guards/lock-9/translations/a.tla: the model gives leave an effect the declaration does not hold: {holder: none, queue: 5}
    TLC met it on the model, at step 2 of this sequence
      1. take who=ann -> granted=true holder=ann waiting={}
      2. leave who=ann
```

| 原因 | 含义 | 接下来做什么 |
| --- | --- | --- |
| `guards/<guard>/translations/<name>.tla:<line>:<col>: <message>`，或没有行号的同样内容 | 转译的形式：它不能含有的一个词或撇号、缺少的或参数个数不对的算子、TLC 的解析器拒绝的文本、它不能加载的文件、TLC 无法求值的表达式、没有尽头地调用自己的定义，或者声明中没有的效果 | 把整行连同它下面的说明和各步转给该转译的 Drafter，让它仅凭这个原因改正形式。绝不要自己改正转译 |
| `guards/<guard>/translations/<name>.tla: a translation's name is …`、`'<name>' is the name of a file TLC or Spex loads; pick another` | 文件的名字 | 给文件改名，并让它的 Drafter 把它的 `---- MODULE <name> ----` 行改成同样的名字 |
| `guards/<guard>/translations: no translation; a guard needs two or more` | 还没有保存任何转译，或者每一份都被丢弃了 | 步骤 2 |
| `guards/<guard>/translations/<name>.tla: TLC was stopped after <n> seconds while it read the file` | 解析这个文件时超时 | 再运行一次；如果重复出现，把它转给 Drafter |
| `guards/<guard>/guard.yaml: <cause>`、`guards/bindings/<binding>/binding.yaml: <cause>`、某个条目或某个补丁 | 某个文件或条目无法加载 | 改正被指出的东西。对于没有对应项的用例、不对应任何用例的项或写了两次的用例，让守卫文件和条目中的标签一致。改动声明的值或事件就意味着重新起草转译 |
| `<guard item>: the list entry '<line>' starts with <word> and is not written as a case: …` | 守卫条目的某个列表项以 `permitted` 或 `forbidden` 开头（不论大小写），却不是用例的形式，读者会把它当作一个 `spex verify` 并不检查的用例 | 按这一行给出的形式把它写成用例，或者改写它，让它以别的方式开头 |
| `guards/bindings/<binding>/binding.yaml: the declaration in TLA+ does not parse: <message>` | Spex 自己生成的文件被拒绝了 | 把它连同消息报告给用户：这是 Spex 的错误，不是守卫的错误 |
| `Java was not found: …`、`Java <version> is too old: …` | `spex verify` 运行 TLC，而 TLC 需要 Java 11 或更高版本 | 请用户安装一个，或把 `JAVA_HOME` 设为一个 |
| `SPEX_TLC_JAR names <value>, which is no file — …` | 这个变量指名的不是文件 | 把它设为一个 `tla2tools.jar`，或取消它 |
| `TLC 2.19 could not be downloaded from <url>: <cause> — …`、`what <url> gave is not TLC 2.19: …`、`TLC 2.19 could not be kept at <path>: …` | 无法取得锁定的 TLC | 请用户下载这一行指名的文件，按这一行给出的值核对它的 sha256，并把 `SPEX_TLC_JAR` 设为它 |
| `Java ended with status <n> before TLC started: <Java's words>`、`Java was ended before TLC started` | Java 运行了，TLC 却没有。如果这一行接着写 `— SPEX_TLC_JAR names <jar>, which is not the pinned tla2tools.jar`，原因很可能就是那个文件 | 把 `SPEX_TLC_JAR` 设为一个 `tla2tools.jar`，或取消它，让 Spex 下载 TLC。否则把 Java 的话展示给用户 |
| `TLC ended with status <n> <doing>`、`TLC was ended <doing>`、`TLC could not start: <cause>` | TLC 的某次运行以 Spex 读不懂的方式结束。如果有 TLC 的话，否则有 Java 的话，它们跟在冒号之后 | 带上 `--keep` 再运行一次（见[保留 TLC 运行过的东西](#保留-tlc-运行过的东西)），并把 TLC 自己的输出展示给用户 |
| `TLC's table of the model's steps cannot be read: <cause>` | TLC 检查了模型，而 Spex 读不了它写下的各步的表；对于 `it is too large, <n> bytes`，是模型的步数太多 | 表太大时，与用户一起声明更少的值，这意味着重新起草转译。否则带上 `--keep` 再运行一次，并展示给用户 |

原因之下的说明讲的是 TLC 在哪里遇到它：`on the model`、`comparing the translations`、在某个指名的用例中，或 `judging the effect the code gave`，并带有在它之前的序列。
下面没有任何步的说明，例如 `TLC met it on the model`，表示 TLC 没有打印序列。
把说明和序列连同原因一起交给 Drafter：它们说明是哪个状态到达了那个表达式。

## 用例检查为什么失败

每个失败指出一个用例（用它的类别和带引号的标签）和一份转译：

```text
  Cases, without the code: 3 cases, 2 translations, 1 failure
    forbidden case "a second taker gets the lock", translation b: step 2 is not forbidden: the rule allows granted=true holder=none waiting={} and 31 more
```

| 失败 | 含义 | 接下来做什么 |
| --- | --- | --- |
| `step <n> is not legal` | 这份转译认为那个事件在那里不可能发生 | 用例是用户的话，所以错的是转译：删除它的文件，以丢弃它。如果你怀疑用例的各步没有说出它的文字所说的意思，先核对它们 |
| `at step <n> the model gives <effect>` | 这份转译的模型给出的效果与某一步写明的不同 | 同上 |
| `step <n> is forbidden: the model gives <effect>` | 在必须被允许的一步上，这份转译的规则禁止了它自己模型的效果 | 同上 |
| `the rule does not apply at step <n>` | 在禁止用例的最后一步，这份转译的规则不适用 | 同上 |
| `step <n> is not forbidden: the rule allows <effect> and <k> more` | 这份转译允许了禁止用例说绝不能发生的事：某种与最后一步写明的字段一致的已声明效果 | 先检查这一步是否写明了用例的文字谈到的每个字段：省略的字段代表它的所有值。然后同上 |
| `translation <name>: the rule applies at no step of a permitted case` | 在那份转译之下，没有哪个允许的用例展示规则在起作用 | 如果只有一份转译这样说，丢弃它。如果每份转译都这样说，就与用户一起添加一个规则在其中适用的允许用例 |

绝不要为了让某个用例成立而编辑转译。
列出失败的报告可能还打印着一个区分序列：先删除每个失败指出的文件并再次运行，然后才就它询问用户（见[区分序列](#区分序列)）。
如果没有转译留下，说明条目还没有说出用户的意思：与他们一起改正条目，然后用全新的 Drafter 回到步骤 2。

## 区分序列

一个守卫有两份或更多转译时，TLC 把它们并排检查，遍及它们之中任何一份允许的每一个事件序列。
这项检查结束时就是完整的：`in agreement at every step TLC reached` 表示在它们之中任何一份到达的任何状态下，都没有它们回答不同的一步。
如果它们不同，TLC 找到的通向不同之处的最短序列就是**区分序列**。
它最后一步之前的每一步都是所有转译一致的一步，显示的是模型的效果。
在最后一步之下，是那一步提出的那一个问题和每份转译的回答：

```text
  Translations against each other: 2 translations, they differ at step 3 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. take who=bob -> granted=false holder=ann waiting={bob}
    3. take who=bob
       is step 3 legal? a: no, b: yes
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
  On the model: TLC 2.19 checked every state the model of translation a reaches: 13 states, 40 steps; the rule applied at 12 steps
    TLC's own estimate of the chance it missed a state: 8.0E-17
  On the code: not tested — the translations differ
  Result: Inconclusive
    the translations differ
    Spex 5.0.0, Node 22.23.5, TLC 2.19 (the pinned copy), Java 21.0.13.1
    no Git revision, no files copied
    limits: 60 seconds for each run of TLC and each command
  Kept fault grants-twice: not tried — the translations differ
  Does not pass — the translations differ; the result is Inconclusive; kept fault grants-twice not tried
```

这个序列不在代码上运行。
问题之下的最后一行说的就是这一点，并说明前面各步显示的效果是模型的效果，各份转译在这些效果上一致；对问题的每个回答则是一份转译自己的。
如果各份转译在第一步就不同，那一行只写 `not run on the code`。
转译不一致时，没有哪份转译来评判代码：结果是 `Inconclusive`，不建立副本，每个留存缺陷都是 `not tried`。
`On the model` 一行仍然会打印，针对的是名字顺序中的第一份转译。

回答这个问题的是用户，他们的回答以两种方式之一裁定这个差异：

- **一个用例，如果用例能展示这个回答。** 把这个用例加进守卫条目，放在一个新标签之下，用平实的文字，并在守卫文件的同一标签之下写上它的各步。
- **一个改写过的条目，如果没有用例能展示。** 与用户一起改写条目，使它说出他们的回答。

无论哪种方式，都有一个条目变了，所以由全新的 Drafter 根据改动后的条目重新起草全部转译：删除这些转译并回到步骤 2。
绝不要为了让转译一致而编辑它。

对每一个问题：

1. 用平实的话把它说给用户听，就像用例那样：依次发生了什么，最后一步问的是什么。不要使用任何记号，也不要说哪份转译回答了什么。
2. 问他们，并等待他们的回答。绝不要替他们选。
3. 按下表添加用例或改写条目。
4. 让全新的 Drafter 重新起草全部转译（步骤 2），然后再运行一次：一次运行打印一个序列，下一次运行打印下一个。

| 问题 | 用户的回答变成什么 |
| --- | --- |
| `is step <k> legal?` | 合法：一个包含这一步的允许的用例。不合法：没有用例能展示它，所以改写条目 |
| `what must step <k> give?` | 用户说出那个效果，由一个允许的用例写明它。如果没有条目说到它，也要改写条目 |
| `does the rule apply at step <k>?` | 适用：一个以这一步结束的禁止的用例。不适用：没有用例能展示它，所以改写规则的条目 |
| `is this effect forbidden at step <k>?` | 禁止：一个禁止的用例。允许，而且是模型的效果：一个允许的用例。允许，而不是模型的效果：没有用例能展示它，所以改写规则的条目 |

用例不必重复打印出的序列：它可以写任何提出同一个问题的各步。
添加了用例之后，它本身也能把转译区分开：与回答相矛盾的转译会在用例检查上失败，失败的写法见下文。

**`is step <k> legal?`**

```text
  Translations against each other: 2 translations, they differ at step 3 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. take who=bob -> granted=false holder=ann waiting={bob}
    3. take who=bob
       is step 3 legal? a: no, b: yes
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
```

问那个事件在那里是否根本可能发生：“bob 已经在等待 ann 持有的锁了。bob 还能再要一次吗？”

- 能：问发生时会看到什么，并添加一个以那一步和那个效果结尾的允许用例。回答 `no` 的转译会以 `step <k> is not legal` 在它上面失败。
- 不能：没有哪个用例能包含一个不可能发生的步。改写条目，让它说明这一点。

**`what must step <k> give?`**

```text
  Translations against each other: 2 translations, they differ at step 2 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. leave who=ann
       what must step 2 give?
         a: holder=none queue=0
         b: holder=ann queue=0
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
```

每份转译的模型给出了不同的效果。
问会看到什么：“ann 持有着锁，没有人等待。ann 离开了。这时谁持有锁？”
用户说出那个效果。
添加一个以那一步结尾并写明那个效果的允许用例：模型给出别的效果的转译会以 `at step <k> the model gives …` 在它上面失败。
如果没有条目说到这个效果，也要改写这个条目，或者它应当引用的那个条目，让它说到。

**`does the rule apply at step <k>?`**

```text
  Translations against each other: 2 translations, they differ at step 2 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. reset
       does the rule apply at step 2? a: no, b: yes
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
```

问规则对那一步是否有话要说：“ann 持有着锁，这时锁被重置为全新的。关于被持有的锁的那条规则，有没有说这时必须看到什么？”

- 有：问在那里绝不能看到什么，并添加一个以那一步和那个效果结尾的禁止用例。回答 `no` 的转译会以 `the rule does not apply at step <k>` 在它上面失败。
- 没有：没有用例能展示它，因为规则在那里适用的转译仍可能允许这一步给出的效果。改写规则的条目，让它说明它在哪里不再适用。一个以那一步结尾的允许用例仍能向读者展示规则在哪里止步，就像 formats.md 中那个示例守卫的最后两个用例那样。

**`is this effect forbidden at step <k>?`**

```text
  Translations against each other: 2 translations, they differ at step 2 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. take who=bob
       is this effect forbidden at step 2? granted=false holder=ann waiting={ann, bob}
         a: no, b: yes
       the model gives granted=false holder=ann waiting={bob}
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
```

各份转译在这一步给出什么以及规则是否适用上是一致的，不同之处在于规则可能禁止的某一种已声明的效果。
各个回答之下的那一行说的是模型在那一步给出什么。
这里被问到的效果是模型从不给出的：ann 既持有着锁又在等待它。
如果被问到的效果就是模型自己的效果，那一行写作 `the model gives this effect`。
问它是否可以被看到：“ann 持有着锁，bob 来要它。bob 被拒绝，锁留在 ann 手中，而 ann 和 bob 都被报告为在等待。这是不是绝不能看到的？”

| 回答 | 做什么 |
| --- | --- |
| 禁止 | 添加一个以那一步和那个效果结尾的禁止用例。回答 `no` 的转译会以 `step <k> is not forbidden` 在它上面失败 |
| 允许，而且报告写的是 `the model gives this effect` | 添加一个以那一步和那个效果结尾的允许用例。回答 `yes` 的转译会以 `step <k> is forbidden` 在它上面失败 |
| 允许，而报告指出模型的效果是另一个 | 没有用例能展示它：允许的用例写明的是条目要求的东西，而条目在这里要求的是另一个效果。与用户一起改写规则的条目，说明它放开了什么 |

**失败旁边的序列**

在用例检查上失败的转译仍会与其他转译比较，所以一份报告里可能既有失败又有区分序列。
这里 `b` 的规则允许任何效果：

```text
  Cases, without the code: 3 cases, 2 translations, 1 failure
    forbidden case "a second taker gets the lock", translation b: step 2 is not forbidden: the rule allows granted=true holder=none waiting={} and 31 more
  Translations against each other: 2 translations, they differ at step 2 of this sequence
    1. take who=ann -> granted=true holder=ann waiting={}
    2. take who=bob
       is this effect forbidden at step 2? granted=false holder=none waiting={}
         a: yes, b: no
       the model gives granted=false holder=ann waiting={bob}
       not run on the code: the effects of the earlier steps are the model's, on which the translations agree
```

先处理失败：删除每个失败指出的文件并再次运行；对于打印在失败旁边的序列，什么都不要问用户。
绝不要为了让转译一致而编辑它，也绝不要在没有失败指出它的情况下单独删除某一份。
如果没有转译留下，说明条目还没有说出用户的意思：与他们一起改正条目，然后用全新的 Drafter 回到步骤 2。

## 各种结果

一个守卫得到一个结果：一次运行在这张表中找到的最靠上的一行。

| 结果 | 它确立了什么 |
| --- | --- |
| `Conflict in the items` | TLC 找到了一个序列，在它之后，按转译的理解，条目要求一个规则禁止的效果 |
| `Violated on the code` | 代码做了规则禁止的事 |
| `Code differs from the model` | 代码给出了一个模型不给出、规则也不禁止的效果 |
| `Case failed` | 某个允许的用例在代码上没有按它的各步所述进行 |
| `Inconclusive` | 检查无法得出结论，例如超时、某个用例在不涉及代码时不成立、转译之间不一致、规则在任何一步都不适用、某个序列没有重现，或绑定失败 |
| `Model checked, code tested` | TLC 检查了模型到达的每个状态，对已声明的值而言是完整的，模型从不给出规则禁止的效果。随后模型的每一步都在代码上引发了一次，代码每次都给出了模型的效果 |

用这些措辞报告结果，并带上它所依赖的假定。
Spex 不给出一个词的裁决：绝不要把一个守卫称作 verified、valid 或 proved。

## Conflict in the items

```text
  On the model: Conflict in the items — TLC 2.19 found it at step 2 of this sequence, as translation a reads the items
    1. take who=bob -> granted=true holder=bob waiting={}
    2. take who=cy
       the model gives granted=true holder=bob waiting={cy}
       forbidden by the rule
  On the code: not tested — the model conflicts with the rule
  Result: Conflict in the items
    Spex 5.0.0, Node 22.23.5, TLC 2.19 (the pinned copy), Java 21.0.13.1
    no Git revision, no files copied
    limits: 60 seconds for each run of TLC and each command
  Kept fault grants-twice: not tried — the model conflicts with the rule
  Does not pass — the result is Conflict in the items; kept fault grants-twice not tried
```

在名字顺序中第一份转译的模型里，TLC 到达了这样一步：模型的效果是规则禁止的。
模型只说条目所说的内容，所以按那份转译的理解，有一个条目要求了规则禁止的东西。
不测试任何代码，这件事在任何代理阅读代码之前裁定。

1. 用平实的话把这个序列说给用户听：发生了什么，条目说这时会看到什么，以及规则禁止它。
2. 问他们哪一个才是本意。
3. 与他们一起改写说了他们并非本意之事的那个条目：规则，或者说明该事件给出什么的那个条目。
4. 用全新的 Drafter 从步骤 2 起重新起草转译：条目的含义变了。

如果用户说条目是对的，并不冲突，那就是转译理解错了；各份转译一致时这不大可能。
这时由全新的 Drafter 重新起草转译。
绝不要为了让冲突消失而编辑转译。

## Violated on the code

```text
  On the code: 40 steps tested, each after a shortest sequence from a fresh start: 10 gave the model's effect, 6 an effect the rule forbids, 0 another effect, 24 not reached
    1 of 2 permitted cases went as their steps state
    Violated on the code — found at step 2 of the permitted case "a second taker waits"
      1. take who=ann -> granted=true holder=ann waiting={}
      2. take who=bob
         the model gives granted=false holder=ann waiting={bob}
         the code gave   granted=true holder=ann waiting={bob}
         forbidden by the rule
    Case failed — case "a second taker waits", step 2, field granted: stated false, observed true
  Result: Violated on the code
```

在副本上，有一步给出了规则禁止的效果。
报告打印出这个序列及观察到的各个效果，在它的最后一步打印模型的效果和代码的效果，以及 `forbidden by the rule`。
它是在模型的某一步（`of this sequence`）或某个允许用例的某一步上发现的。
只打印第一个违反；计数说明有多少步给出了被禁止的效果，以及有多少步因为所在序列的更早一步已经走了别的路而没有被到达。

代码在那个序列上破坏了规则。
用平实的话把这个序列展示给用户。
如果是代码错了，守卫就完成了它的工作：修正办法是改代码，在改好之前同一条命令会打印同一个序列。
如果用户说这个序列没有问题，那就是条目说了他们并非本意的话：与他们一起改正条目，并重新起草转译。
不要为了让它消失而改动任何转译、用例或已声明的值。

## Code differs from the model

```text
  On the code: 40 steps tested, each after a shortest sequence from a fresh start: 37 gave the model's effect, 0 an effect the rule forbids, 3 another effect, 0 not reached
    1 of 2 permitted cases went as their steps state
    Code differs from the model — found at step 4 of this sequence
      1. take who=ann -> granted=true holder=ann waiting={}
      2. take who=bob -> granted=false holder=ann waiting={bob}
      3. take who=cy -> granted=false holder=ann waiting={bob, cy}
      4. leave who=ann
         the model gives holder=bob queue=1
         the code gave   holder=cy queue=1
         not forbidden by the rule
    Case failed — case "the first waiting user is next", step 4, field holder: stated bob, observed cy
  Result: Code differs from the model
```

代码给出了一个模型不给出、规则也不禁止的效果。
没有看到规则被破坏，而检查无法从那里继续：那个序列之后的每一步都会从一个模型没有描述的状态出发。
所以守卫不通过。

用平实的话问用户哪一个是对的：“ann、bob 和 cy 依次来要锁，然后 ann 离开，条目说锁交给 bob。代码把它交给了 cy。哪一个才是本意？”

| 用户说 | 做什么 |
| --- | --- |
| 条目是对的 | 代码错了，尽管没有违反这条规则。修正办法是改代码 |
| 代码是对的 | 某个条目说了他们并非本意的话，或者没有说明那个效果，而由 Drafter 补上了。与他们一起改写条目，并从步骤 2 起重新起草转译 |

先检查模块：报告效果有误的绑定会给出同样的一行。
绝不要为了迁就代码而改动转译：必须满足什么，来自条目和用户。

## Case failed

```text
  On the code: 40 steps tested, each after a shortest sequence from a fresh start: each gave the model's effect
    1 of 2 permitted cases went as their steps state
    Case failed — case "the first waiting user is next", step 4, field holder: stated bob, observed cy
  Result: Case failed
```

某个允许的用例在代码上没有按它的各步所述进行：某个写明的效果字段不是代码给出的。
它就是一处与模型的不同，只是在用例的某一步上发现；如果观察到的效果同时也是规则禁止的，结果就是 `Violated on the code`。

先检查模块：它是否引发了那个事件，并返回了代码实际做的事？
那里的错误由你来改正。
否则展示给用户：要么用例写了代码不会做的事，要么代码错了。
没有他们的同意，绝不要为了与代码一致而改动用例的文字或它写明的效果。

## 结果为什么是 Inconclusive

原因打印在 `Result: Inconclusive` 之下。

| 打印出的原因 | 含义 | 接下来做什么 |
| --- | --- | --- |
| `the check of cases without the code failed` | `Cases, without the code` 一行之下列出了失败 | 见[用例检查为什么失败](#用例检查为什么失败) |
| `the translations differ` | 打印出了一个区分序列，没有哪份转译来评判代码 | 见[区分序列](#区分序列) |
| `the translations were not compared: TLC was stopped after <n> seconds` | 比较它们花的时间超过了限度 | 声明更少的值；如果这次比较确实有理由很大，就调高 `limits.seconds`。如果某份转译的模型到达的状态没有尽头，把这一点转给它的 Drafter |
| `a timeout: TLC was stopped after <n> seconds while it evaluated the cases`、`… while it checked the model`、`… while it judged the effects the code gave` | TLC 的某次运行花的时间超过了限度。如果是评判的那次运行，`On the code` 一行把它没有评判的各步计为 `not judged` | 对于模型：随每个事件增长的状态（比如计数或日志）会让模型没有尽头。把它转给第一份转译的 Drafter；不要为此调高限度。否则声明更少的值，或调高 `limits.seconds` |
| `a timeout: not done after <n> seconds` | 某条命令或副本的进程在 `limits.seconds` 时被停止，它启动的每个进程也随之停止；但在 macOS 和 Linux 上，通过开启自己的会话而离开了它的进程组的进程除外 | 在命令、模块或代码中找出什么很慢或永不返回。只有在代码确实有理由很慢时才调高 `seconds` |
| `the rule applied at no step of the model` | TLC 把模型检查到底了，而规则在任何状态下都不适用 | 已声明的值或事件到不了规则所说的情形。与用户一起看看声明；改动它就意味着重新起草转译 |
| `a failing binding: <cause>` | 绑定缺少模块（`no binding.mjs`）或缺少 `files`（`the declaration names no files`）、副本无法建立、某条命令无法启动或以非零状态结束、模块无法加载或缺少某个导出、某个函数抛出了异常、返回值不是已声明的效果，或者副本的进程在引发完每个序列之前结束。原因所指名的副本内的路径是相对于副本的 | 在步骤 4 之前，`no binding.mjs` 在预料之中。否则改正模块、`files` 或 `commands`。如果原因指出某个值超出了它声明的类型，声明可能太窄了：改动它的值或事件就意味着重新起草转译 |
| `a project file loaded from outside the copy: <path>` | 模块或它加载的代码访问了 `files` 没有列出的项目文件。这只在副本进程的主线程中看得到 | 把它加进 `files` |
| `a sequence did not repeat: caused again, its last step gave another effect` | 从全新的起点引发同样的事件，给出了两个效果；两个都会打印出来，标为 `first` 和 `again` | 找出模块或代码把什么从一个序列留到了下一个序列，或者什么依赖时钟、随机数或列出条目的顺序。改正模块；如果这是代码自身的行为，就把它的起因做成一个事件，或者告诉用户这个行为无法用这种方式测试 |

一个失败的绑定：

```text
  On the code: 0 of 40 steps tested
    1 of 2 permitted cases went as their steps state
  Result: Inconclusive
    a failing binding: leave threw: the queue is full
```

一个没有重现的序列：

```text
  On the code: 40 steps tested, each after a shortest sequence from a fresh start: 27 gave the model's effect, 0 an effect the rule forbids, 0 another effect, 13 not reached
    the 2 permitted cases went as their steps state
  Result: Inconclusive
    a sequence did not repeat: caused again, its last step gave another effect
      1. take who=bob
         first  granted=true holder=bob waiting={}
         again  granted=true holder=bob waiting={bob}
```

## 通过的结果依赖什么

`Model checked, code tested` 是两件事，要说清哪件是哪件：

- **模型是被检查的。** TLC，一个别人信任的模型检查器，检查了模型到达的每个状态，对这个模型和已声明的值而言是完整的：模型从不给出规则禁止的效果。这是形式化的那一半。
- **代码是被测试的。** 模型的每一步都在副本上引发了一次，从一个全新的起点、经一个最短序列之后，而代码给出了模型的效果。这是测试：没有随机抽取任何东西，模型的各步也没有遗漏，但 Spex 并不探索代码自己的状态。

报告的三行 `assumes:` 说明这个结果把什么当作理所当然，三项都必须让用户听到：

| 假定 | 含义 |
| --- | --- |
| `the declared values are the ones that matter (<set> = <values> …)` | 只尝试了已声明的事件，而且只用了已声明的值。进入代码的其他途径，或集合之外的值，都没有尝试 |
| `what the code does next depends only on the model's state, each step being tried from one sequence` | 如果代码保存了模型的状态中没有的东西，通向模型同一状态的两个序列就可能表现不同，而只尝试了其中一个 |
| `the binding causes and observes truly` | 模块按声明引发每个事件，并报告代码实际做的事 |

除此之外：转译说的是条目的意思，而用户批准的用例把它与条目的文字联系在一起。
留存缺陷则表明，同样的检查在带有已知缺陷的代码上能看到规则被破坏。

## 留存缺陷为什么没有被尝试或没有被抓住

只有当代码在留存缺陷的副本上给出一个规则禁止的效果时，留存缺陷才算被抓住。
仅仅不同于模型并不能抓住它。
没有为它建立副本时，它是 `not tried`，否则是 `not caught`。
无论哪一种，守卫都不会通过。

```text
  Kept fault last-waiting: not caught — the code gave no effect the rule forbids in 40 steps tested; 3 did not give the model's effect
  Does not pass — not approved; kept fault last-waiting not caught
```

| `Kept fault <name>:` 之后打印的内容 | 含义 | 接下来做什么 |
| --- | --- | --- |
| `not tried — the check of cases without the code failed`、`the translations differ`、`the translations were not compared`、`the model conflicts with the rule`、`the model was not checked`、`the rule applies at no step of the model` | 不用代码的检查没有全部成立，所以没有建立副本 | 看这个原因所指的那一行 |
| `not tried — the binding failed: <cause>` | 绑定在副本建立之前就失败了：它没有模块（如步骤 4 之前）、它的声明没有列出任何 `files`，或者副本无法建立 | 在步骤 4 之前，无。否则改正原因指出的东西 |
| `not caught — the code gave no effect the rule forbids in <n> steps tested`，有些步不同时还带有 `; <k> did not give the model's effect` | 带着这个留存缺陷，模型的各步和允许用例的各步都没有给出规则禁止的效果 | 如果有些步不同于模型，这个留存缺陷植入的就是规则并不禁止的毛病：植入一个破坏这条规则的毛病。如果没有任何一步不同，这个留存缺陷没有改变已声明的事件和值所能到达的任何东西：植入一个它们到得了的毛病，或者放宽声明，而这意味着重新起草转译 |
| `not caught — the patch does not apply: <cause>` | 它指名的某个文件没有被复制或不是文本，或者某个改动块在任何地方都匹配不上：代码已经变动 | 针对现在的代码，为同一个缺陷写一个替代品。它需要用户的批准 |
| `not caught — the patch changes nothing` | 打上补丁之后，每个被复制的文件都与原来一样 | 写一个能改变代码所做之事的补丁 |
| `not caught — the binding failed: <cause>` | 带着这个留存缺陷，某条命令或模块失败了 | 如果原因指出某个值超出了它声明的类型，说明声明对出错的代码返回的东西来说太窄了：放宽它，并重新起草转译。否则选一个让代码仍能构建和运行、只改变它做什么的留存缺陷 |
| `not caught — a timeout: not done after <n> seconds`、`TLC was stopped after <n> seconds while it judged the effects the code gave` | 带着这个留存缺陷，某条命令、副本的进程或 TLC 在时间限度时被停止 | 选一个不会让代码挂起的留存缺陷 |
| `not caught — a project file was loaded from outside the copy: <path>` | 带着这个留存缺陷，模块访问了 `files` 没有列出的项目文件 | 把它加进 `files` |

指名了绑定的 `files` 之外的路径的补丁，或者不是所允许的那种统一 diff 的补丁，不属于以上情况：守卫是 `Cannot be checked`（见 [formats.md](formats.zh-CN.md)）。

## 守卫为什么不通过

| 原因 | 接下来做什么 |
| --- | --- |
| `not approved` | 在起草结束时单独出现，正是你在询问用户之前想要的。否则看 `Approval` 一行 |
| `the check of cases without the code failed` | 见[用例检查为什么失败](#用例检查为什么失败) |
| `only one translation` | 守卫要有两份或更多一致的转译才能通过。步骤 2：由全新的 Drafter 重新起草转译 |
| `the translations differ`、`the translations were not compared` | 见[区分序列](#区分序列)和[结果为什么是 Inconclusive](#结果为什么是-inconclusive) |
| `the result is <result>` | 见[各种结果](#各种结果) |
| `no kept fault` | 步骤 4：一个守卫至少需要一个 |
| `kept fault <name> not tried`、`kept fault <name> not caught` | 见[留存缺陷为什么没有被尝试或没有被抓住](#留存缺陷为什么没有被尝试或没有被抓住) |

只有以下各项都成立时，守卫才通过：

- 批准是当前的；
- 每份转译都允许每个允许的用例并禁止每个禁止的用例；
- 它有两份或更多转译，并且它们一致；
- 结果是 `Model checked, code tested`；
- 它至少有一个留存缺陷，并且每一个都被抓住。

## 保留 TLC 运行过的东西

`spex verify --keep <folder> [<guard>…]` 会为每个到达 TLC 的守卫留下 `<folder>/<guard>/`，其中有文件 `spex-verify.txt`（它标明这个文件夹是 `spex verify` 留下的），并且 TLC 的每次运行各有一个文件夹：

| 文件夹 | 那次运行 |
| --- | --- |
| `form-<translation>` | 单独读取一份转译 |
| `cases` | 每份转译之下的用例 |
| `compare` | 并排的各份转译 |
| `model` | 第一份转译的模型，TLC 列出其各步的表在 `SpexModel.dump` 中 |
| `judge`、`judge-<fault>` | 代码给出的效果，由规则评判；只有在有效果需要评判时才有 |

每个文件夹里有 `Declaration.tla`、用到的转译、Spex 生成的 TLA+ 文件和 `.cfg`、TLC 的输出，以及 `command.txt`，即确切的命令行：

```text
# Run in this folder, with java-tmp empty and no states folder,
# and without JAVA_TOOL_OPTIONS, _JAVA_OPTIONS and JDK_JAVA_OPTIONS.
<java> -XX:+UseParallelGC -Djava.io.tmpdir=java-tmp -cp <jar> tlc2.TLC -tool -workers 1 -fp 0 -metadir states -userFile SpexModel.user -dump SpexModel.dump -config SpexModel.cfg SpexModel
```

这样任何人都可以不用 Spex 重新运行 TLC 的每一步，并阅读 TLC 评判的那些文件。
这个文件夹必须在项目之外，或者是 Git 忽略的文件夹：`spex verify` 不在项目的文件之中写入任何东西。
第二次运行会替换 `<folder>/<guard>`；同名而不是 `spex verify` 建立的文件夹会被拒绝。
用户想看检查了什么时，把它提供给他们。

对于还没有转译的守卫，这次运行到不了 TLC，也不需要 Java。
它以 `Cannot be checked — guards/<guard>/translations: no translation; a guard needs two or more` 结束，并留下 `<folder>/<guard>/`，其中有 `spex-verify.txt` 和 `Declaration.tla`，即 TLA+ 形式的声明。
步骤 2 交给各个 Drafter 的文件就是从这里取的（见 [formats.md](formats.zh-CN.md)）。

## 命令如何结束

| 情形 | 退出状态 |
| --- | --- |
| 它检查的每个守卫都通过，或者 `No guards under guards/.` | `0` |
| 某个守卫不通过或无法被检查；不是守卫的名字；未知的选项；它无法使用的 `--keep` 文件夹；早于 22.15 的 Node | `1` |
| 中断（SIGINT） | `130` |
| 退出（SIGQUIT） | `131` |
| 结束请求（SIGTERM）；挂断（SIGHUP） | `143`；`129` |

收到这四个信号中的任何一个时，`spex verify` 先停止它启动的每个进程，并删除每个临时文件夹。
报告的第一行是标题 `Protect critical behavior on every change`，最后一行是 `<p> of <n> guards pass.`

`spex approve <guard>` 不提任何问题，既不运行 TLC 也不运行代码，所以在它之前和之后都要运行 `spex verify`。
它依次打印：

1. `<guard> — the guard item:`，其下是守卫条目的语句；
2. `<behavior item> — the rule:`，其下是规则的语句；
3. 按条目中的顺序打印每个用例，写作 `<kind> — <label>`，其下是它的平实文字，再下面是守卫文件中它的各步，每一步带着它写明的效果；
4. `Also recorded, not printed here:`，其下是记录中其他每个文件和条目，每行一个：每份转译、每个留存缺陷、绑定的文件，以及守卫条目或规则引用的每个条目；
5. 守卫相对于上一份记录的状况：`First approval.`、`Since the last approval:`（其下是 `changed: …`、`added: …` 和 `gone: …` 各行），或 `The last record cannot be read — <path>: <cause>.`；
6. 记录写入之后，打印 `Approved <guard> — commit guards/<guard>/approval.json.`。

如果自上次批准以来没有任何变化，它什么都不写，并以这一行代替第 5 和第 6 项结束：`Nothing changed since the last approval: guards/<guard>/approval.json stands as it was.`
如果记录里的摘要相同而文件的排版不同，它在第 5 项打印 `Nothing changed since the last approval.`，并重新写入记录。
它以 `0` 退出。对于无法被检查的守卫，它以 `1` 退出并给出原因，什么都不写。
用户批准的还有转译、留存缺陷和绑定，所以他们要看时，把这些文件展示给他们：这个列表列出了它们的名字。

它为那个虚构守卫打印的内容：

```text
lock-9 — the guard item:
  When `spex verify` checks the lock, it shall find that a held lock stays with its holder [lock-3],
  reading the rule by these cases:

lock-3 — the rule:
  While a user holds the lock, when another user takes it, the lock shall stay with its holder,
  refuse the taker and report the taker among those waiting, as [lock-4] orders them.

permitted — a second taker waits
  ann takes the free lock and gets it, and bob takes it; the lock is refused, stays with ann, and
  bob waits
    1. take who=ann -> granted=true
    2. take who=bob -> granted=false holder=ann waiting={bob}

forbidden — a second taker gets the lock
  the same two takes, ending with the lock granted
    1. take who=ann
    2. take who=bob -> granted=true

permitted — the first waiting user is next
  ann takes, cy takes, bob takes, and ann leaves; the lock passes to bob and one user still waits
    1. take who=ann
    2. take who=cy
    3. take who=bob
    4. leave who=ann -> holder=bob queue=1

Also recorded, not printed here:
  file guards/bindings/lock/binding.mjs
  file guards/bindings/lock/binding.yaml
  file guards/lock-9/faults/grants-twice.patch
  file guards/lock-9/translations/a.tla
  file guards/lock-9/translations/b.tla
  item lock-4

First approval.
Approved lock-9 — commit guards/lock-9/approval.json.
```
