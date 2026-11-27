<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- skill-atlas:source sha256=ec3ecc58196c5655bc3c35aa72b0e628398431c9763dcf7fdfb2a9c8f1a4f11c own=5349db9aed3763986751dedc377bfafc3a7d57860520230a1d484fae9bc84b28 -->
> 本文件是 `formats.md` 的简体中文译本，供人阅读；代理使用的是原文件。

# 守卫的文件

构成一个守卫的每个条目和文件的形式，即 `spex verify` 和 `spex approve` 读取它们的方式。
守卫是 `spex verify` 执行的一个测试条目，连同 `guards/<its ID>/` 下说明如何执行的文件。
这个条目是**守卫条目**，`guard.yaml` 是**守卫文件**，**规则**是守卫检查的那一个行为条目。
本文件从头到尾以一个守卫为例：Spex 自己的第一个守卫 `environments-56`，它检查一次安装放进项目的规格，在之后的安装带来另一个包的同名规格时，仍保有它的路径。
它的转译没有在这里给出：[转译](#转译)一节用一条虚构的规则代替，这样这个守卫的任何 Drafter 都不会读到它的转译。

## 目录

- [文件的位置](#文件的位置)
- [条目](#条目)
- [类型和值](#类型和值)
- [声明：binding.yaml](#声明bindingyaml)
- [TLA+ 形式的声明](#tla-形式的声明)
- [守卫文件：guard.yaml](#守卫文件guardyaml)
- [转译](#转译)
- [模块：binding.mjs](#模块bindingmjs)
- [留存缺陷](#留存缺陷)
- [批准记录](#批准记录)
- [阅读代码之前](#阅读代码之前)

## 文件的位置

根目录是 Git 仓库的顶层文件夹；没有仓库时是当前文件夹。

| 保存的内容 | 位置 |
| --- | --- |
| 规则，以及带着用例的守卫条目 | 同一个规格包 `specs/packages/<package>.md` |
| 守卫文件：它的绑定、时间限度和每个用例的各步 | `guards/<guard>/guard.yaml` |
| 每份转译，一个 TLA+ 文件 | `guards/<guard>/translations/<name>.tla` |
| 每个留存缺陷 | `guards/<guard>/faults/<name>.patch` |
| 批准记录，只由 `spex approve` 写入 | `guards/<guard>/approval.json` |
| 绑定的声明和模块 | `guards/bindings/<binding>/binding.yaml` 和 `binding.mjs` |

- `<guard>` 是守卫条目的 ID，例如 `environments-56`。
- 直接位于 `guards/` 下、除 `bindings` 之外的每个文件夹都是一个守卫。没有 `guard.yaml` 的文件夹会被报告为 `Cannot be checked — guards/<name>/guard.yaml: not found`，所以不要在那里放别的文件夹。
- 守卫的文件夹只放 `guard.yaml`、`translations/`、`faults/` 和 `approval.json`，不放别的东西。`translations/` 只放 `<name>.tla` 文件，`faults/` 只放 `<name>.patch` 文件。除 `.DS_Store` 文件之外，任何其他条目都是错误。
- 绑定的文件夹里有 `binding.yaml`。它可以暂时没有 `binding.mjs`（见[阅读代码之前](#阅读代码之前)），也可以放模块需要的其他文件；每一个都随守卫一起被批准。
- 守卫、绑定或留存缺陷的名字由字母、数字、`.`、`_` 和 `-` 组成，以字母或数字开头。转译的名字限制更严（见[转译](#转译)）。
- 两个 YAML 文件都写有 `format: 1`。本文件没有提到的键是错误。
- 转译和留存缺陷按名字顺序读取。名字顺序中的第一份转译，就是其模型被检查并用来测试代码的那一份。

## 条目

一个规格包是一个 Markdown 文件，依次包含 `Intent`、`External Behavior`、可选的 `Internal Behavior` 和 `Verification` 各节。
一个条目是一个以其 ID `<package>-<N>` 为文字的标题，后面跟一条 GEARS 语句：

```text
[Where <fixed conditions>] [While <state>] [When <trigger>] <subject> shall <behavior>.
```

| 条目 | 位置 | 内容 |
| --- | --- | --- |
| 规则，一个行为条目 | `External Behavior` 或 `Internal Behavior` | 一项要求，以系统为主语 |
| 守卫条目 | `Verification`，同一文件 | 一个测试条目，说明 `spex verify` 应当发现什么，引用规则而不引用该文件的其他行为条目，并列出用例 |

引用是指向条目标题的链接，以 ID 作为链接文字：`[[environments-55](#environments-55)]`。
一次批准涵盖守卫条目、规则，以及两者直接引用的每一个条目。
如果项目使用 `spex lint`，写完条目后运行它。

**规则是一项要求。**
如果要守卫的行为只是某个较长条目中的一个分句，先把那个条目拆开：把这个分句移到它自己的条目中，并让旧条目引用它。
在本例中，规则原本是说明安装如何放置规格的那个条目中的一个分句；它成了 `environments-55`。

**条目说明每个事件给出什么。**
一份转译除了规则之外还包含一个模型：条目所说的每个事件给出什么。
它只能说守卫条目、规则以及这两者引用的条目所说的内容，所以在规则没有说到的地方，要让规则引用说明该行为做什么的条目。
本例的规则引用了 `environments-41`，即说明安装如何放置规格的那个条目。

**一个用例**是守卫条目列表中的一项：

```text
- permitted — <label>: <the case in plain words>;
- forbidden — <label>: <the case in plain words>.
```

- 这一项是一个不缩进的列表项，以 `-`、`*` 或 `+` 标记，以 `permitted — ` 或 `forbidden — ` 开头：其中的横线是长破折号 U+2014，两侧各有一个空格。
- 其他任何列表项都不是用例，会被略过，只有一种例外。一个列表项（包括缩进的和带编号的）如果以 `permitted` 或 `forbidden` 这个词开头（不论大小写），却没有按上面的方式写，就是一个错误，这样读者当作用例的东西不会有哪一个未被检查。`- Forbidden - a second taker gets the lock: …`（首字母大写，用的是连字符）就是这样的一项。
- 标签从破折号到第一个冒号为止。在其他任何地方它都是这个用例的名字，所以要短，并且同一条目的两个用例不能用同一个标签。
- 其余部分直到这一项结束，是用平实的话写成的用例：依次发生了什么，看到了什么。末尾的一个 `;` 或 `.` 会被去掉。
- 一个条目至少有一个允许的用例和一个禁止的用例。
- 用例中不使用任何事件名、参数或值的记号，任何条目也不使用 model、TLC、TLA+ 和 translation 这些词：只读规格的人也必须能看懂它。使用该行为的人知道的名字，例如某个包的名字，属于平实的话。
- 改动用例的文字就改动了守卫条目，所以需要重新批准。

本例的两个条目，位于 `specs/packages/environments.md`：

```markdown
## External Behavior

#### environments-55

While a package's copy stands at `specs/packages/<pkg>.md` [[environments-41](#environments-41)], with that package still selected and its release still providing the spec, when an install runs in a project's environment, the core shall leave that copy in place as that package's and report exactly the other selected packages whose releases provide a `<pkg>` spec as blocked at that path ([DR-174](../decisions/174-what-a-package-provides-is-placed.md)).

## Verification

#### environments-56

When `spex verify` checks installs into a project in which several packages provide a spec of one name, it shall find that the code keeps the rule that a standing copy keeps its path [[environments-55](#environments-55)] at every step it tries, reading the rule by these cases:

- permitted — a later arrival is blocked: an install selects `zeta/kit` alone and its copy stands, and a second selects `acme/kit` too, both releases providing a `kit` spec; `zeta/kit`'s copy still stands and `acme/kit` alone is reported blocked;
- forbidden — a later arrival takes the path: the same two installs, ending with `acme/kit`'s copy standing and `zeta/kit` reported blocked;
- forbidden — the standing package is reported blocked: the same two installs, ending with `zeta/kit`'s copy still standing and both packages reported blocked;
- forbidden — a package not selected is reported blocked: the same two installs, ending with `zeta/kit`'s copy still standing and `acme/kit` and `mid/kit` reported blocked;
- permitted — a copy no longer selected leaves: an install selects `zeta/kit` alone and its copy stands, and a second selects `acme/kit` alone, each release providing a `kit` spec; `acme/kit`'s copy stands and no package is reported blocked;
- permitted — a copy no longer provided leaves: an install selects `zeta/kit` alone and its copy stands, and a second selects `acme/kit` too, when only `acme/kit`'s release still provides a `kit` spec; `acme/kit`'s copy stands and no package is reported blocked.
```

`environments-55` 是规则，`environments-56` 是守卫条目，所以守卫就是 `environments-56`。
它的第一个用例展示规则在起作用；第二、第三和第四个是绝不能发生的事；最后两个标出规则不再适用的地方。

## 类型和值

类型在声明中以文字写出。

| 类型 | 它的值 | 在 YAML 或 JSON 中写作 |
| --- | --- | --- |
| `bool` | 真和假 | 布尔值 |
| `<a>..<b>` | 从 `a` 到 `b` 的整数，两端都包含；两者都可以为负 | 该范围内的整数 |
| 某个 `values` 集合的名字，例如 `package` | 该集合中的字符串 | 其中一个字符串 |
| `set of <values name>`、`set of <a>..<b>` | 由它们组成的每一个集合 | 不含重复项的列表，顺序任意 |
| `<type>?` | 该类型的值，以及缺失值 | 该值，或 `null` |

- `?` 只写一次，写在末尾：`set of package?` 是一个可以缺失的集合。
- 没有 `int` 这个词，没有映射，没有集合的集合，也没有 `bool` 的集合。
- 给效果字段留出余地，容纳出错的代码可能返回的东西。返回值超出其声明的类型算作绑定失败，绝不算违反，所以把声明为 `0..100` 的余额弄成 -1 的留存缺陷无法被抓住。
- 一步的参数和效果中的值，以及模块接收和返回的值，都这样书写。
- `values` 集合、参数或效果字段的名字是一个小写字母，后跟字母和数字。参数不能叫 `event`。
- 事件的名字是一个字母，后跟字母、数字和 `_`。
- `values` 集合的值是由可打印 ASCII 字符组成的字符串，不为空，两端没有空格，也不是 `none`、`true` 或 `false`。一个值只属于一个集合，只列出一次。
- `values` 集合不能叫 `bool`、`set` 或 `of`。在 TLA+ 中，集合 `xyz` 被命名为 `Xyz`、`XyzRank` 和 `XyzFirst`（见 [TLA+ 形式的声明](#tla-形式的声明)），这三个名字都不能是 TLA+、它的标准模块或 Spex 生成的文件已经使用的名字，例如 `Events`、`Start`、`Nat` 或 `Init`：错误会指出这个集合。

## 声明：binding.yaml

本例的声明 `guards/bindings/installs/binding.yaml`，略去了文件头注释：

```yaml
format: 1
values:
  # Listed in order of <org>, the order in which packages claim a path:
  # the declaration in TLA+ gives it as PackageRank and PackageFirst.
  package: [acme/kit, mid/kit, zeta/kit]
events:
  # One install. `selected`: the packages the lock holds. `providing`:
  # the packages whose release provides a `kit` spec. Listing a package
  # that is not selected changes nothing.
  install:
    params: { selected: set of package, providing: set of package }
    # `standing`: whose copy stands at specs/packages/kit.md afterwards.
    # `blocked`: the packages the install reported blocked.
    effect: { standing: package?, blocked: set of package }
files:
  - packages/cli/src
  - packages/cli/tsconfig.json
  - packages/cli/package.json
commands:
  # The library's TypeScript build, into packages/cli/dist of the copy.
  - [node, node_modules/typescript/bin/tsc, -p, packages/cli]
```

| 键 | 内容 |
| --- | --- |
| `values` | 具名的有限字符串集合，其顺序有意义：`XyzRank` 和 `XyzFirst` 把它交给转译。可以省略 |
| `events` | 绑定能引发什么，以及能从每个事件观察到什么。至少一个事件。`params` 是它的具名输入，`effect` 是从它观察到的具名字段，各带一个类型。两者都可以省略 |
| `files` | 一次运行会复制的项目文件。项目中存在的路径，从根目录算起，用 `/` 书写，每个只列一次，且不含 `node_modules` 或 `.git` 这一段。任何一项都不能是 `guards` 或位于其下，无论是按名字还是经由链接：绑定的文件夹会单独复制，不是被测代码。文件夹会整个复制，但不含 `node_modules` 和 `.git` 文件夹。在阅读代码之前省略 |
| `commands` | 在副本中依次运行，用来构建它。每条命令是一个词的列表，程序在前，不经 shell 运行，以副本为工作文件夹。第一个词为 `node` 时，运行的是运行 `spex` 的那个 Node。非零退出状态算作绑定失败。每条命令在 `limits.seconds` 秒后被停止，这算作超时。可以省略 |

在每个参数和效果字段旁加一条注释，用条目的说法、按使用该行为的人的理解说明它的含义。
如果条目依赖某个 `values` 集合的顺序，就在注释中说明这个顺序的含义。
Drafter 拿到的是带有这些注释的 `values` 和 `events`，而单凭一个名字可以有不止一种理解。

**值要少。**
TLC 会在模型到达的每个状态下，用每个事件的参数值的每一种组合去尝试该事件，并在每一个事件的每一种已声明的效果上比较各份转译。
随后代码在其中的每一步上接受测试。
本例的三个包给 `selected` 8 个集合，给 `providing` 8 个集合，所以每个状态下要尝试 64 次安装，每次有 32 种已声明的效果；第四个包会把它变成 256 次安装和 80 种效果。
每类值取两三个就能到达要紧的情形，报告会把它们列为结果所依赖的假定。

**副本。**
每次运行测试的都是项目之外的一个副本：`files` 和绑定的文件夹，放在它们在项目中的路径上。
副本使用项目已安装的依赖：凡是项目中有 `node_modules` 文件夹的地方，无论在根目录、在被复制路径的上层文件夹还是在被复制的文件夹里，副本都在同一位置放一个指向它的链接。
因此 `files` 必须列出模块直接或通过其他文件加载的一切背后的项目文件。
如果代码需要构建，`files` 列出源文件和构建所读取的文件，`commands` 在副本中构建它们，模块则导入这次构建在副本中写出的内容。
绝不要在 `files` 中列出构建产物：那样运行测试的是上一次的构建而不是代码，并且源文件中的留存缺陷不会改变模块加载的任何东西。
也绝不要列出 `guards` 或其下的路径：这在守卫加载时是错误。

从副本之外加载项目文件的运行结果是 `Inconclusive`，并指出该文件。
能看到的只是在副本进程的主线程中通过 `import`、`require` 或 `import.meta.resolve` 解析的文件。
工作线程或代码启动的进程加载了什么是看不到的：如果代码使用其中任何一种，你要自己检查它只读取副本。

## TLA+ 形式的声明

**TLA+ 形式的声明**是 Spex 从 `binding.yaml` 生成的文件 `Declaration.tla`。
每份转译都写在它之上。
Spex 每次运行都生成它，不把它保存在项目中的任何地方，而同一份声明总是给出同样的文本。

要把它交给各个 Drafter，就在保存任何转译之前运行 `spex verify --keep <folder> <guard>`，用一个项目之外的文件夹。
这次运行不需要 Java。
它以 `Cannot be checked — guards/<guard>/translations: no translation; a guard needs two or more` 结束，并把该文件留在 `<folder>/<guard>/Declaration.tla`。
绝不要手写这个文件。
本例的声明对应的是：

```tla
---- MODULE Declaration ----
\* Generated by Spex from guards/bindings/installs/binding.yaml. Do not edit.
EXTENDS Integers, FiniteSets, Sequences

\* The value of a field of a type `T?` that holds nothing.
\* Each .cfg file Spex writes makes it a value equal to nothing else.
CONSTANT Missing

\* values.package; each value's place in the declared order, from 1;
\* and the member of a nonempty set of them that comes first in that order.
Package == {"acme/kit", "mid/kit", "zeta/kit"}
PackageRank(v) == CASE v = "acme/kit" -> 1 [] v = "mid/kit" -> 2 [] v = "zeta/kit" -> 3
PackageFirst(S) == CHOOSE x \in S : \A y \in S : PackageRank(x) <= PackageRank(y)

\* Every event with its params: a record whose field `event` names it.
Events ==
  [event : {"install"}, selected : (SUBSET Package), providing : (SUBSET Package)]

\* Every effect the event `e` is declared to give.
Effects(e) ==
  CASE e.event = "install" -> [standing : (Package \cup {Missing}), blocked : (SUBSET Package)]
====
```

[TLA+ 形式的声明定义了什么](#tla-形式的声明定义了什么)说明了其中每个名字是什么。

## 守卫文件：guard.yaml

本例的守卫文件 `guards/environments-56/guard.yaml`，略去了文件头注释：

```yaml
format: 1
binding: installs
limits: { seconds: 300 }
cases:
  - case: a later arrival is blocked
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit, zeta/kit], providing: [acme/kit, zeta/kit] }
        effect: { standing: zeta/kit, blocked: [acme/kit] }
  - case: a later arrival takes the path
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit, zeta/kit], providing: [acme/kit, zeta/kit] }
        effect: { standing: acme/kit, blocked: [zeta/kit] }
  - case: the standing package is reported blocked
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit, zeta/kit], providing: [acme/kit, zeta/kit] }
        effect: { standing: zeta/kit, blocked: [acme/kit, zeta/kit] }
  - case: a package not selected is reported blocked
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit, zeta/kit], providing: [acme/kit, zeta/kit] }
        effect: { standing: zeta/kit, blocked: [acme/kit, mid/kit] }
  - case: a copy no longer selected leaves
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit], providing: [acme/kit, zeta/kit] }
        effect: { standing: acme/kit, blocked: [] }
  - case: a copy no longer provided leaves
    steps:
      - event: install
        params: { selected: [zeta/kit], providing: [zeta/kit] }
        effect: { standing: zeta/kit }
      - event: install
        params: { selected: [acme/kit, zeta/kit], providing: [acme/kit] }
        effect: { standing: acme/kit, blocked: [] }
```

| 键 | 内容 |
| --- | --- |
| `binding` | `guards/bindings/` 下某个文件夹的名字 |
| `limits` | 只有 `seconds`：以秒计的时间限度，一个从 1 到 2147483 的整数，分别适用于 TLC 的每次运行、绑定的每条命令以及在副本上引发事件的进程 |
| `cases` | 守卫条目的每个用例一项，带有 `case`（它的标签）和 `steps` |
| 一步 | `event`；`params`，为事件的每个参数给出一个值；`effect`，为该用例谈到的每个效果字段给出一个值；`effect` 可以省略 |

**一步**是一个事件及其参数和一个效果。
用例写明一个效果，模型给出一个效果，规则评判一个效果，一次运行则在代码上观察到一个效果。

- `case` 是条目所写的标签，一字不差。用例的类别从条目读取，绝不写在这里。
- 条目的每个用例都有一项，每一项都指名条目的一个用例。没有对应项的用例、不对应任何用例的项，以及写了两次的标签，各是一个指出该标签的错误，守卫是 `Cannot be checked`。
- 各项的顺序任意；报告和 `spex approve` 按条目中的顺序打印用例。
- `limits.seconds` 是必需的，此外没有别的可设：一次运行不随机抽取任何东西，相同的文件和代码给出相同的运行。
- 一个用例至少有一步。禁止用例的最后一步就是绝不能发生的那一步，规则必须在那一步适用。
- 一步只写明用例的文字谈到的东西：本例的 `providing` 只列出它的用例提到的包。
- 某一步省略的效果字段不参与比较：允许用例的这一步可以给出它的任何值，而禁止用例的最后一步禁止的是与它确实写明的字段一致的每一种已声明的效果。
- 到达时间限度时，TLC 的那次运行、那条命令或副本的进程会被停止，它启动的每个进程也随之停止。这算作超时。
- 某条命令启动的进程在该命令结束时被停止：一个序列需要的东西要在模块的 `start` 中启动，绝不要在 `commands` 中启动。
- 在 macOS 和 Linux 上，通过开启自己的会话而离开了启动者所在进程组的进程不会被停止，无论是在时间限度时还是在其他任何时候。如果代码会启动这样的进程，就在模块的 `stop` 中结束它，并在超时之后检查没有留下这样的进程。

**选择限度。**
给 `limits.seconds` 留出余地，容纳其中最慢的那一项：构建、TLC 的一次运行，或者在副本上引发模型每一步的进程。
到达的状态没有尽头的模型，在任何限度下都做不完：要改正的是转译，而不是限度。

## 转译

转译是把守卫的条目写成 TLA+ 的一个文件 `guards/<guard>/translations/<name>.tla`。
它包含两样东西：

- **规则**，按其条目的读法逐个分句写出；
- **模型**：条目所说的每个事件给出什么，写成一个起点，以及对每个合法的事件给出一个效果和它之后的状态。模型只能说守卫条目、规则以及这两者引用的条目所说的内容。

它写在 **TLA+ 形式的声明**之上，即 Spex 从绑定的声明生成的文件 `Declaration.tla`。
TLC（TLA+ 工具中的模型检查器）按文件的原样读取它，并在它之上作出每一个评判。

本节的例子不是那个从头走到尾的守卫的。
本节就是交给 Drafter 的内容，而 Drafter 绝不能读到它据以起草的那些条目的转译，所以本文件不给出它那个示例守卫的任何转译。
这里的例子是一个虚构绑定上的一条虚构规则：一把锁，由一个用户持有，其他用户等待。

### TLA+ 形式的声明定义了什么

虚构绑定的声明：

```yaml
values:
  # Listed in the order in which waiting users are served.
  user: [ann, bob, cy]
events:
  # `who` asks for the lock.
  take:
    params: { who: user }
    # `granted`: whether `who` got the lock.
    # `holder`: who holds the lock afterwards, if anyone.
    # `waiting`: the users who wait for it afterwards.
    effect: { granted: bool, holder: user?, waiting: set of user }
  # `who` gives the lock up.
  leave:
    params: { who: user }
    # `holder`: who holds the lock afterwards, if anyone.
    # `queue`: how many users still wait.
    effect: { holder: user?, queue: 0..2 }
  # The lock is made new: nobody holds it and nobody waits.
  reset: {}
```

它的 TLA+ 形式的声明：

```tla
---- MODULE Declaration ----
\* Generated by Spex from guards/bindings/lock/binding.yaml. Do not edit.
EXTENDS Integers, FiniteSets, Sequences

\* The value of a field of a type `T?` that holds nothing.
\* Each .cfg file Spex writes makes it a value equal to nothing else.
CONSTANT Missing

\* values.user; each value's place in the declared order, from 1;
\* and the member of a nonempty set of them that comes first in that order.
User == {"ann", "bob", "cy"}
UserRank(v) == CASE v = "ann" -> 1 [] v = "bob" -> 2 [] v = "cy" -> 3
UserFirst(S) == CHOOSE x \in S : \A y \in S : UserRank(x) <= UserRank(y)

\* Every event with its params: a record whose field `event` names it.
Events ==
  [event : {"take"}, who : User]
  \cup
  [event : {"leave"}, who : User]
  \cup
  [event : {"reset"}]

\* Every effect the event `e` is declared to give.
Effects(e) ==
  CASE e.event = "take" -> [granted : BOOLEAN, holder : (User \cup {Missing}), waiting : (SUBSET User)]
    [] e.event = "leave" -> [holder : (User \cup {Missing}), queue : (0..2)]
    [] e.event = "reset" -> {<<>>}
====
```

| 名字 | 是什么 |
| --- | --- |
| `Missing` | 类型为 `T?` 而什么都没有的字段的值。对其他任何值 `x`，`Missing = x` 是 FALSE；对字符串的集合或整数的集合 `S`，`Missing \in S` 是 FALSE；两者都不会出错。拿 `Missing` 对 `SUBSET Xyz` 做判断则是一个错误 |
| `Xyz`，对应 `values` 集合 `xyz` | 它的值的集合，作为 TLA+ 字符串 |
| `XyzRank(v)` | 值 `v` 在声明顺序中的位置，从 1 算起 |
| `XyzFirst(S)` | 这些值的非空集合 `S` 中，在声明顺序里排在最前的那个成员 |
| `Events` | 每个事件及其参数。一个事件是一个记录：`e.event` 是它的名字（一个字符串），`e.<param>` 是一个参数 |
| `Effects(e)` | 事件 `e` 被声明可以给出的每一种效果，各是一个带有每个效果字段的记录。没有效果字段的事件只有一种效果 `<<>>` |

声明的类型就是一个 TLA+ 集合：`bool` 是 `BOOLEAN`，`a..b` 是 `a..b`，`values` 集合 `xyz` 是 `Xyz`，`set of T` 是 `SUBSET T`，`T?` 是 `T \cup {Missing}`。

### 七个算子

一份转译定义七个算子，用这些名字，每个都从行首写起。
参数的名字随意；参数的个数则不能变。

| 算子 | 给出 | 说的是 | TLC 何时求它的值 |
| --- | --- | --- | --- |
| `Start` | 一个值 | 模型的起始状态 | 一次 |
| `Legal(s, e)` | TRUE 或 FALSE | 事件 `e` 在状态 `s` 下根本可能发生 | 对模型到达的每个状态和每个 `e \in Events` |
| `Effect(s, e)` | `Effects(e)` 的一个成员 | 条目要求 `e` 在 `s` 下给出的那一个效果 | 仅当 `Legal(s, e)` |
| `After(s, e)` | 一个状态 | 它之后的状态 | 仅当 `Legal(s, e)` |
| `When(e)` | TRUE 或 FALSE | 规则的 When 分句 | 仅当 `Legal(s, e)` |
| `While(s, e)` | TRUE 或 FALSE | 规则的 Where 和 While 分句，在事件之前的状态下 | 仅当 `Legal(s, e)` 且 `When(e)` |
| `Shall(s, e, f)` | TRUE 或 FALSE | 效果 `f` 是规则所要求的 | 仅当 `Legal`、`When` 和 `While` 都成立时，对任何 `f \in Effects(e)` |

`Start`、`Legal`、`Effect` 和 `After` 是模型；`When`、`While` 和 `Shall` 是规则。

- **一步**是一个事件及其参数和一个效果。模型为一步给出一个效果，规则则评判一步可能有的任何效果。
- 事件**合法**，是指这个事件在这个状态下根本可能发生，正如没有扣费就不可能退款。不合法的事件不在代码上尝试；它绝不算违反。所以 `Legal` 说的是事件何时可能发生，绝不是规则禁止什么：后者属于 `Shall`。
- 规则在 `When(e) /\ While(s, e)` 的那一步**适用**。在规则适用而 `Shall(s, e, f)` 为 FALSE 的地方，这一步的效果 `f` 是**被禁止的**。
- `Shall` 会被用来问每一种已声明的效果，而不只是模型的效果：问用例写明的效果，也问代码给出的效果。要把它写成能评判任何 `f \in Effects(e)`。
- 状态是 `Start` 或 `After` 给出的值；它的形状由转译自己决定。两份转译的状态从不相互比较，比较的只是它们的回答。
- 状态中只保留条目让之后的事件所依赖的东西。模型到达的状态必须是有限个，否则 TLC 不会结束，并在时间限度时被停止。

### 一份转译包含什么

1. 一个起始行 `---- MODULE <name> ----` 和一个结束行 `====`，其中 `<name>` 是去掉 `.tla` 的文件名。这个名字是一个小写字母，后跟小写字母、数字和 `_`。它不能是 `declaration`、`naturals`、`integers`、`reals`、`finitesets`、`sequences`、`bags`、`tlc`、`tlcext`、`randomization`、`realtime` 或 `toolbox`，也不能以 `spex` 开头。
2. `EXTENDS Declaration`，以及在需要时的 `Naturals`、`Integers`、`FiniteSets` 和 `Sequences`。`Declaration` 已经扩展了后三个。转译不加载其他任何东西。
3. 那七个算子。
4. 需要时它自己的算子，愿意的话可以用 `LET` 和 `RECURSIVE`，其名字不能是 TLA+ 形式的声明和它加载的文件已经定义的。
5. 在每个分支之上，用一条 TLA+ 注释写出它所转译的条目的 ID。注释（到行尾的 `\* …` 和 `(* … *)`）可以随意写，不会被读取。

在注释和字符串之外，它不含以下任何一项：

| 词或记号 | 为什么不行 |
| --- | --- |
| `INSTANCE` | 转译只加载它扩展的东西 |
| `CONSTANT`、`CONSTANTS` | 转译不声明常量 |
| `VARIABLE`、`VARIABLES` | 转译不声明变量 |
| `ASSUME`、`ASSUMPTION`、`AXIOM` | 转译不作任何假设 |
| `CHOOSE` | 在已声明的值中选择时用 `XyzFirst` 或 `XyzRank`，这样没有哪个回答取决于 TLC 自己的顺序 |
| 撇号 `'`、`ENABLED`、`UNCHANGED` | 转译只谈给它的那个状态，绝不谈下一个状态 |

遇到以下任何一种情况，TLC 会停下，守卫无法被检查：

- 对空集或含有 `Missing` 的集合求 `XyzFirst`，以及对不在集合中的值求 `XyzRank`；
- 没有任何分支为真的 `CASE`；
- 不同种类的值之间的比较，例如字符串与数字；
- 记录没有的字段；
- 既不是 TRUE 也不是 FALSE 的 `Legal`、`When`、`While` 或 `Shall`；
- 不是 `Effects(e)` 成员的 `Effect`；
- 拿 `Missing` 对 `SUBSET Xyz` 做判断，例如在类型为 `set of …` 而不带 `?` 的字段里放了 `Missing` 的 `Effect`；
- 文件用到而没有任何定义的名字。

### 一个例子

虚构的条目：

```markdown
#### lock-3

While a user holds the lock, when another user takes it, the lock shall stay with its holder, refuse the taker and report the taker among those waiting, as [[lock-4](#lock-4)] orders them.

#### lock-4

When the holder leaves, the lock shall pass to the waiting user who comes first among ann, bob and cy.

#### lock-9

When `spex verify` checks the lock, it shall find that a held lock stays with its holder [[lock-3](#lock-3)], reading the rule by these cases:

- permitted — a second taker waits: ann takes the free lock and gets it, and bob takes it; the lock is refused, stays with ann, and bob waits;
- forbidden — a second taker gets the lock: the same two takes, ending with the lock granted;
- permitted — the first waiting user is next: ann takes, cy takes, bob takes, and ann leaves; the lock passes to bob and one user still waits.
```

`lock-3` 是规则，`lock-9` 是守卫条目，`lock-4` 是规则引用的一个条目。
它们的一份转译，放在文件 `a.tla` 中：

```tla
---- MODULE a ----
EXTENDS Declaration, Naturals, FiniteSets

\* The model's state: who holds the lock, and who waits for it.
Start == [holder |-> Missing, waiting |-> {}]

\* A user takes the lock only while neither holding it nor waiting; only the holder leaves.
Legal(s, e) ==
  CASE e.event = "take"  -> e.who # s.holder /\ e.who \notin s.waiting
    [] e.event = "leave" -> e.who = s.holder
    [] e.event = "reset" -> TRUE

After(s, e) ==
  CASE e.event = "take" ->
         IF s.holder = Missing
         THEN [holder |-> e.who, waiting |-> {}]
         ELSE [holder |-> s.holder, waiting |-> s.waiting \cup {e.who}]
    \* lock-4
    [] e.event = "leave" ->
         IF s.waiting = {}
         THEN [holder |-> Missing, waiting |-> {}]
         ELSE [holder |-> UserFirst(s.waiting), waiting |-> s.waiting \ {UserFirst(s.waiting)}]
    [] e.event = "reset" -> Start

Effect(s, e) ==
  CASE e.event = "take" ->
         [granted |-> s.holder = Missing, holder |-> After(s, e).holder, waiting |-> After(s, e).waiting]
    [] e.event = "leave" ->
         [holder |-> After(s, e).holder, queue |-> Cardinality(After(s, e).waiting)]
    [] e.event = "reset" -> <<>>

\* lock-3, clause by clause.
When(e) == e.event = "take"
While(s, e) == s.holder # Missing /\ s.holder # e.who
Shall(s, e, f) == ~f.granted /\ f.holder = s.holder /\ e.who \in f.waiting
====
```

- `When`、`While` 和 `Shall` 的读法与 `lock-3` 相同：当另一个用户取锁时，在有用户持有它期间，锁应当拒绝取锁者、留在持有者手中，并把取锁者报告在等待者之中。
- `Legal` 说的是根本不可能发生的事：持有锁或正在等待它的用户不会再次取锁，只有持有者才会离开。条目并没有逐字这样说；这是这份转译的选择，它的 Drafter 列出了这个选择。
- `After` 用 `UserFirst` 表达“排在最前的等待用户”，放在一条指名 `lock-4` 的注释之下。
- `Effect` 给出已声明效果的每一个字段，从事件之后的状态读出。
- 状态是转译自己的一个记录；同样条目的另一份转译可以保存一个二元组，只要两者的回答一致，它们就一致。

一个守卫需要两份或更多转译。
`spex verify` 让 TLC 在它们之中任何一份到达的每一步上比较它们，只有它们一致时守卫才通过（见 [results.md](results.zh-CN.md)）。
只有一份转译的守卫仍会被完整地检查和测试，但不通过：这份转译没有可比较的对象。

## 模块：binding.mjs

本例的模块 `guards/bindings/installs/binding.mjs` 的概要，略去了写出某个包的发行版和读出谁的副本立在那里的两个辅助函数：

```js
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// The code under test, as the binding's command built it in the copy.
import { exportEnvironment } from '../../../packages/cli/dist/lib/environment/exports.js';

const PACKAGES = ['acme/kit', 'mid/kit', 'zeta/kit'];

// A fresh state for one sequence: an empty project under the OS temp folder.
export function start() {
  const root = mkdtempSync(join(tmpdir(), 'spex-guard-installs-'));
  mkdirSync(join(root, 'specs', 'packages'), { recursive: true });
  mkdirSync(join(root, '.git'));
  return { root };
}

// One function for each declared event: cause it, return what was observed.
export const events = {
  async install({ root }, { selected, providing }) {
    const packages = {};
    for (const name of PACKAGES) {
      rmSync(join(root, '.spex', 'packages', ...name.split('/')), { recursive: true, force: true });
      // `release` is a helper, not shown: it writes one package's release.
      if (selected.includes(name)) packages[name] = release(root, name, providing.includes(name));
    }
    const report = await exportEnvironment({
      root,
      lock: { format: 1, requests: '0'.repeat(64), packages },
      workingFolder: root,
      userHome: null,
      agents: [],
    });
    return {
      // `standing` is a helper, not shown: whose copy stands at the path.
      standing: standing(root),
      blocked: report.specs.filter((spec) => spec.state === 'blocked').map((spec) => spec.name),
    };
  },
};

// Optional; always called after a sequence.
export function stop(state) {
  if (state) rmSync(state.root, { recursive: true, force: true });
}
```

| 导出 | 何时调用 |
| --- | --- |
| `start()` | 每个序列之前，返回模块自己为该序列准备的全新状态 |
| `events.<event>(state, params)` | 以其参数引发一个已声明的事件，并返回观察到的效果 |
| `stop(state)` | 有导出时，每个序列之后，无论它怎样结束 |

- 每个函数可以立即返回，也可以返回一个 promise。
- 事件函数返回的对象包含每一个已声明的效果字段，每个字段都是其类型的一个值。没有声明任何效果字段的事件可以什么都不返回。
- 模块在副本中运行，所以它只能通过相对路径访问项目的代码。
- 每个序列都从全新的状态开始。一次运行会引发每个允许的用例，然后在通向其状态的一个最短序列之后引发模型的每一步，并且有些序列会被引发不止一次：除了 `start` 返回的内容之外，不要在序列之间保留任何东西，也不要让任何东西依赖时钟、随机数或文件夹列出条目的顺序。
- 代码接下来做什么，必须只取决于 `start` 之后引发的事件。模型的每一步只从一个序列出发尝试，而结果假定通向模型同一状态的另一个序列会给出同样的效果。
- 如果行为依赖时钟或重启，就把它做成模块引发的一个事件。
- 各条命令和副本的进程得到的操作系统临时文件夹变量指向副本自己那个全新文件夹的内部，所以模块留在操作系统临时文件夹下的东西会随副本一起消失。
- 模块报告代码做了什么。它从不保存本应发生什么。
- **绑定失败**是指：绑定的文件夹里没有 `binding.mjs`、声明没有列出任何 `files`、副本无法建立、某条命令无法启动或以非零状态结束、模块无法加载、缺少 `start` 或某个事件函数、`stop` 不是函数、函数抛出异常、返回值不是已声明的效果，或者进程在引发完每个序列之前结束。它使结果成为 `Inconclusive`，并且永远不算抓住了留存缺陷。它的原因所指名的副本内的路径，按相对于副本的路径打印，例如 `src/lock.mjs`，绝不带上副本自己的临时文件夹。

## 留存缺陷

留存缺陷是一份 `git diff` 所写形式的统一 diff，放在 `guards/<guard>/faults/<name>.patch` 中。

- 它的路径从根目录算起。它指名的每个路径都是绑定的 `files` 之一或位于其中某一项之下，且不含 `node_modules` 或 `.git` 这一段：留存缺陷在一次运行所复制的代码中植入毛病，绝不在绑定里，也不在已安装的依赖里。
- 任何其他路径在守卫加载时都是错误：`Cannot be checked — guards/<guard>/faults/<name>.patch: <path> is not among the binding's files`。
- 它改动已存在的文本文件。不是统一 diff 的补丁，新增、删除或重命名文件的补丁，或者某个改动块的行数多于其头部所记数目的补丁，在守卫加载时是错误，并指出文件，除非其中根本没有改动，还指出行号。
- 第一个 `diff --git` 或 `--- ` 行之前的文字是它的说明，供人阅读；报告以文件名称呼留存缺陷。
- `spex` 自己把它应用到副本上，不用 Git：每个改动块放在它写明的行上，否则放在其上下文行和被删除的行能匹配的最近位置，两处同样近时取靠前的一处。应用补丁绝不会写入副本之外的文件。

本例的留存缺陷 `guards/environments-56/faults/first-by-org.patch` 恢复了项目曾经有过的一个缺陷：

```diff
Restores the behavior before 6000e8c: the path goes to the first package by <org>, even over a standing copy.

diff --git a/packages/cli/src/lib/environment/exports.ts b/packages/cli/src/lib/environment/exports.ts
--- a/packages/cli/src/lib/environment/exports.ts
+++ b/packages/cli/src/lib/environment/exports.ts
@@ -663,18 +663,10 @@
     if (!held.has(path) && standingMarker(root, path)?.name === name) held.set(path, name);
   }
 
-  // 1. The basename's claim: the package whose copy stands at the path,
-  //    else the first in name order.
-  const standsFor = (source: SpecSource): boolean => {
-    const path = placedSpecPath(source.id);
-    const digest = digestOf(path);
-    if (digest === null || digest === NOT_A_FILE) return false;
-    return previous[source.name]?.path === path || standingMarker(root, path)?.name === source.name;
-  };
-  const claimants = [...ordered].sort((a, b) => Number(standsFor(b)) - Number(standsFor(a)) || byName(a, b));
+  // 1. The basename's claim: the first in name order.
   const claims = new Map<string, SpecSource>();
   const blocked = new Set<string>();
-  for (const source of claimants) {
+  for (const source of ordered) {
     const path = placedSpecPath(source.id);
     if (claims.has(path) || held.has(path)) blocked.add(source.name);
     else claims.set(path, source);
```

要植入一个毛病并把它保留为留存缺陷，先确保它涉及的文件没有未提交的改动，然后：

1. 编辑代码，造出缺陷。
2. 写出补丁：`git diff --src-prefix=a/ --dst-prefix=b/ -- <paths> > guards/<guard>/faults/<name>.patch`。
3. 把代码改回去：`git apply -R guards/<guard>/faults/<name>.patch`。
4. 在第一个 `diff --git` 行之上加上说明。

要恢复提交 `<fix>` 修正过的一个过去的缺陷：`git diff --src-prefix=a/ --dst-prefix=b/ <fix> <fix>~1 -- <paths> > guards/<guard>/faults/<name>.patch`，然后加上说明。
这两个前缀选项使补丁在任何 Git 设置下读起来都一样。
如果克隆中没有那个提交（浅克隆就可能没有），或者该补丁已无法应用到现在的代码上，就手工植入同样的缺陷。
能应用、只是所在行与它写明的不同的补丁无需改动。
没有 Git 时，按上面的形式手写 diff。

留存缺陷必须让代码仍能构建、绑定仍能工作：它改变的是代码做什么，而不是代码能否运行。
它必须让代码用已声明的值，在模型的某一步或某个允许用例的某一步上，给出一个规则禁止的效果。
只是让代码以规则并不禁止的方式不同于模型的留存缺陷，不会被抓住。

## 批准记录

`spex approve <guard>` 写入 `guards/<guard>/approval.json`：为构成守卫的每个条目和文件各记一个摘要。

| 被批准的 | 具体是 |
| --- | --- |
| 条目 | 带着用例的守卫条目、规则，以及两者直接引用的每一个条目 |
| 文件 | `guard.yaml`、每份转译、每个留存缺陷的补丁，以及绑定文件夹下的每个文件 |

写入之前，它会打印用户正在批准的内容：守卫条目的语句、规则的语句，然后是每个用例及其类别、它的平实文字，以及文字之下它的各步。
然后在 `Also recorded, not printed here:` 之下，它列出该记录中其他每个文件和条目的名字，每行一个。
它先在文本上检查每份转译的形式，既不需要 Java 也不需要 TLC。
如果自上次批准以来没有任何变化，它让记录保持原样，并说明这一点。
绝不要手工编写或编辑这份记录。
此后 `spex verify` 会指出每一个已改变、新增或消失的条目或文件，在重新获得批准之前守卫不会通过。
无法按其写法读取的记录（例如合并冲突之后）使守卫成为 `not approved — <path>: <cause>`；`spex approve` 会说明这一点并替换它。
绑定的 `files` 所指的代码不属于该记录：代码可以自由改变，而守卫会测试它。

## 阅读代码之前

绑定还没有模块时，`spex verify` 也能加载守卫，所以可以在任何代理阅读代码之前起草、比较转译，并让 TLC 检查它们。
在工作流程的步骤 4 之前：

- 绑定的文件夹里只有 `binding.yaml`，其中有 `values` 和 `events`，没有 `files` 或 `commands`；
- 守卫的文件夹里有 `guard.yaml` 和 `translations/`，没有留存缺陷。

在保存第一份转译之前，守卫因为没有转译而 `Cannot be checked`，而 `spex verify --keep` 会留下 TLA+ 形式的声明，供各个 Drafter 使用（见 [TLA+ 形式的声明](#tla-形式的声明)）。

有了这些，报告的 `Cases, without the code`、`Translations against each other` 和 `On the model` 三行是完整的，并且项目中的任何东西都不会运行。
它的 `On the code` 一行显示 `not tested`，在它之前的检查有缺口时还带有原因，它的结果是 `Inconclusive`：转译不一致时带有 `the translations differ`，转译一致且模型已检查之后带有 `a failing binding: no binding.mjs`。
区块以 `Does not pass` 结束。
步骤 4 加上模块、`files`、`commands` 和留存缺陷。
[results.md](results.zh-CN.md) 解释这份报告。
