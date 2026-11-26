<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- skill-atlas:source sha256=e596f87b7211134322edf943effda34d8cd00d65f3515d8e0715b249272eea1c own=458714a08e3a19fe4f66dc8ccefaac5cfaaae26a48d773ad9b4070efe39baf42 -->
> 本文件是 `formats.md` 的简体中文译本，供人阅读；代理使用的是原文件。

# 守卫的文件

构成一个守卫的每个条目和文件的形式，即 `spex verify` 和 `spex approve` 读取它们的方式。
本文件从头到尾使用同一个小例子：一项权益，用户被授予它、失去它并使用它。

## 目录

- [文件的位置](#文件的位置)
- [条目](#条目)
- [类型和值](#类型和值)
- [声明：binding.yaml](#声明bindingyaml)
- [模块：binding.mjs](#模块bindingmjs)
- [解读](#解读)
- [表达式语言](#表达式语言)
- [守卫文件：guard.yaml](#守卫文件guardyaml)
- [留存缺陷](#留存缺陷)
- [批准记录](#批准记录)
- [阅读代码之前](#阅读代码之前)
- [例子的代码](#例子的代码)

## 文件的位置

根目录是 Git 仓库的顶层文件夹；没有仓库时是当前文件夹。

| 保存的内容 | 位置 |
| --- | --- |
| 行为条目、断言和示例 | 同一个规格包 `specs/packages/<package>.md` |
| 守卫文件：它的绑定、边界和每个示例的序列 | `guards/<guard>/guard.yaml` |
| 每个解读 | `guards/<guard>/readings/<name>.yaml` |
| 每个留存缺陷 | `guards/<guard>/faults/<name>.patch` |
| 批准记录，只由 `spex approve` 写入 | `guards/<guard>/approval.json` |
| 绑定的声明和模块 | `guards/bindings/<binding>/binding.yaml` 和 `binding.mjs` |

- `<guard>` 是断言条目的 ID，例如 `entitlement-2`。
- 直接位于 `guards/` 下、除 `bindings` 之外的每个文件夹都是一个守卫。没有 `guard.yaml` 的文件夹会被报告为 `Cannot be checked — guards/<name>/guard.yaml: not found`，所以不要在那里放别的文件夹。
- 守卫的文件夹只放 `guard.yaml`、`readings/`、`faults/` 和 `approval.json`，不放别的东西。`readings/` 只放 `<name>.yaml` 文件，`faults/` 只放 `<name>.patch` 文件。除 `.DS_Store` 文件之外，任何其他条目都是错误。
- 绑定的文件夹里没有 `binding.yaml` 或没有 `binding.mjs` 是错误。
- 绑定的文件夹可以放模块需要的其他文件；每一个都随守卫一起被批准。
- 守卫、绑定、解读或缺陷的名字由字母、数字、`.`、`_` 和 `-` 组成，以字母或数字开头。
- 三个 YAML 文件都写有 `format: 1`。本文件没有提到的键是错误。

## 条目

一个规格包是一个 Markdown 文件，依次包含 `Intent`、`External Behavior`、可选的 `Internal Behavior` 和 `Verification` 各节。
一个条目是一个以其 ID `<package>-<N>` 为文字的标题，后面跟一条 GEARS 语句：

```text
[Where <fixed conditions>] [While <state>] [When <trigger>] <subject> shall <behavior>.
```

| 条目 | 位置 | 规则 |
| --- | --- | --- |
| 行为条目 | `External Behavior` 或 `Internal Behavior` | 说明行为本身 |
| 断言 | `Verification`，同一文件 | 说明一件必须满足的事，并引用行为条目；不引用该文件的其他行为条目 |
| 每个示例 | `Verification`，同一文件 | 描述一个序列以及看到了什么，并引用行为条目 |

引用是指向条目标题的链接，以 ID 作为链接文字：`[[entitlement-1](#entitlement-1)]`。
一次批准涵盖这些条目，以及它们直接引用的每一个条目。
如果项目使用 `spex lint`，写完条目后运行它。

例子的规格包 `specs/packages/entitlement.md`：

```markdown
# entitlement: Use of a Paid Feature

## Intent

This package defines who may use the paid feature.

## External Behavior

### entitlement-1

When a user uses the feature, the service shall allow the use only while that user holds a grant that has not been revoked.

## Verification

### entitlement-2

When a user who holds no grant uses the feature, the check shall find the use refused [[entitlement-1](#entitlement-1)].

### entitlement-3

When Ann is granted the feature, her grant is revoked and she then uses the feature, the check shall find the use refused [[entitlement-1](#entitlement-1)].

### entitlement-4

When Bob, who was never granted the feature, uses it, the check shall find that an allowed use is forbidden [[entitlement-1](#entitlement-1)].
```

`entitlement-2` 是断言，所以守卫就是 `entitlement-2`。
`entitlement-3` 是一个展示该行为发生的允许的示例；`entitlement-4` 是一个禁止的示例。

## 类型和值

类型在声明中和解读的 `state` 中以文字写出。

| 类型 | 它的值 | 在 YAML 或 JSON 中写作 |
| --- | --- | --- |
| `bool` | 真和假 | 布尔值 |
| `int <a>..<b>` | 从 `a` 到 `b` 的整数，两端都包含 | 该范围内的整数 |
| 某个 `values` 集合的名字，例如 `user` | 该集合中的字符串 | 其中一个字符串 |
| `set of <values name>`、`set of int <a>..<b>` | 由它们组成的每一个集合 | 不含重复项的列表，顺序任意 |
| `map <values name> to <type>` | 为集合中的每个字符串给出该类型的一个值 | 包含每一个键的映射 |
| `<type>?` | 该类型的值，以及缺失值 | 该值，或 `null` |

- `?` 只写一次，写在末尾：`set of user?` 是一个可以缺失的集合。
- 在 `map <values name> to <type>` 之后，`?` 属于那个类型，而 `(<type>)?` 用于分组：`map user to bool?` 是一个其值可以缺失的映射，`(map user to bool)?` 是一个可以缺失的映射。
- 给效果字段留出余地，容纳出错的代码可能返回的值。超出其声明类型的返回值算作绑定失败，永远不算违反，所以一个把声明为 `int 0..100` 的余额变成 -1 的缺陷无法被抓住。
- 示例的参数和效果、状态变量的 `start`，以及交给模块和模块返回的内容，都按这种方式书写值。
- `values` 集合、事件、参数、效果字段或状态变量的名字由字母、数字和 `_` 组成，不以数字开头，并且不是表达式语言的词。
- `values` 集合不能叫 `bool`、`int`、`set`、`of`、`map` 或 `to`。

## 声明：binding.yaml

```yaml
format: 1
values:                # 具名的有限字符串集合；顺序有意义，靠前的较小
  user: [ann, bob]
events:                # 绑定能引发什么，以及能从每个事件观察到什么
  grant:
    params: { who: user }      # 被授予授权的人
  revoke:
    params: { who: user }      # 被撤销授权的人
  use:
    params: { who: user }      # 使用该功能的人
    effect: { allowed: bool }  # 这次使用是否被允许
files:                 # 一次运行会复制的项目文件
  - src
commands: []           # 在副本中依次运行，用来构建它
```

| 键 | 内容 |
| --- | --- |
| `values` | 每个集合至少有一个字符串。一个字符串只属于一个集合，只出现一次，不为空，不能是 `none`、`true` 或 `false`，并且不含单引号，不含换行之类的控制字符，两端也没有空格。可以省略 |
| `events` | 至少一个事件。`params` 是它的具名输入，`effect` 是从它观察到的具名字段，各带一个类型。两者都可以省略。参数不能与某个 `values` 集合同名 |
| `files` | 项目中存在的一个或多个路径，从根目录算起，用 `/` 书写，每个只列一次，且不含 `node_modules` 或 `.git` 这一段。任何一项都不能是 `guards` 或位于其下，无论是按名字还是经由链接：绑定的文件夹会单独复制，不是被测代码。文件夹会整个复制，但不含 `node_modules` 和 `.git` 文件夹 |
| `commands` | 每条命令是一个词的列表，程序在前，不经 shell 运行，以副本为工作文件夹。第一个词为 `node` 时，运行的是运行 `spex` 的那个 Node。非零退出状态算作绑定失败。每条命令在 `sample.seconds` 秒后被停止，这算作超时。可以省略 |

值要少：检查会从类型中抽取每个参数，所以两三个用户比二十个用户能到达更多状态。
在每个参数和效果字段旁加一条注释，用条目的说法、按使用该行为的人的理解说明它的含义。
Drafter 拿到的是带有这些注释的 `values` 和 `events`，而单凭一个名字可以有不止一种理解。

**副本。**
每次运行检查的都是项目之外的一个副本：`files` 和绑定的文件夹，放在它们在项目中的路径上。
副本使用项目已安装的依赖：凡是项目中有 `node_modules` 文件夹的地方，无论在根目录、在被复制路径的上层文件夹还是在被复制的文件夹里，副本都在同一位置放一个指向它的链接。
因此 `files` 必须列出模块直接或通过其他文件加载的一切背后的项目文件。
如果代码需要构建，`files` 列出源文件和构建所读取的文件，`commands` 在副本中构建它们，模块则导入这次构建在副本中写出的内容。
绝不要在 `files` 中列出构建产物：那样运行检查的是上一次的构建而不是代码，并且源文件中的留存缺陷不会改变模块加载的任何东西。
也绝不要列出 `guards` 或其下的路径：这在守卫加载时是错误，`Cannot be checked — guards/bindings/<name>/binding.yaml: files: '<entry>' is under guards/; a binding's folder is copied by itself and is no code under test`。

从副本之外加载项目文件的运行结果是 `Inconclusive`，并指出该文件。
能看到的只是在副本进程的主线程中通过 `import`、`require` 或 `import.meta.resolve` 解析的模块。
工作线程或代码启动的进程加载了什么，在这一阶段看不到：如果代码使用其中任何一种，你要自己检查它只读取副本。

## 模块：binding.mjs

```js
import { createEntitlements } from '../../../src/entitlement.mjs';

// 一个序列用的全新状态。
export function start() {
  return createEntitlements();
}

// 每个已声明的事件一个函数：引发它，返回观察到的内容。
export const events = {
  grant(state, { who }) {
    state.grant(who);
    return {};
  },
  revoke(state, { who }) {
    state.revoke(who);
    return {};
  },
  use(state, { who }) {
    return { allowed: state.use(who) };
  },
};

// 可选；每个序列之后总会被调用。
export function stop(state) {}
```

- 每个函数可以立即返回，也可以返回一个 promise。
- 事件函数返回的对象恰好包含已声明的效果字段，每个字段都是其类型的一个值。没有声明任何效果字段的事件可以返回 `{}`，也可以什么都不返回。
- 模块在副本中运行，所以它只能通过相对路径访问项目的代码。
- 每个序列都从全新的状态开始。除了 `start` 返回的内容之外，不要在序列之间保留任何东西。
- 如果行为依赖时钟或重启，就把它做成模块引发的一个事件。
- 各条命令和副本的进程得到的操作系统临时文件夹变量指向副本自己那个全新文件夹的内部，所以模块留在操作系统临时文件夹下的东西会随副本一起消失。
- 模块报告代码做了什么。它从不保存本应发生什么。
- **绑定失败**是指：副本无法建立、某条命令无法启动或以非零状态结束、模块无法加载、缺少 `start` 或某个事件函数、`stop` 不是函数、函数抛出异常、返回值不是已声明的效果、进程在给出结果之前结束，或者某个曾破坏断言的序列在重新运行时不再破坏。它使检查成为 `Inconclusive`，并且永远不算抓住了缺陷。

## 解读

一个解读是对断言的一种说明，以数据形式放在一个 YAML 文件中。
下面这个解读属于本例，其声明有值 `user: [ann, bob]` 和事件 `grant`、`revoke`、`use`，每个事件都有参数 `who: user`，`use` 还有效果 `allowed: bool`。

```yaml
format: 1
state:                       # 解读自己的记忆；可以省略
  holders: { type: set of user, start: [] }
events:                      # 省略的事件总是合法的，并且什么也不改变
  grant:
    legal: "true"            # 事件何时合法；省略时为 "true"
    then:                    # 事件之后的新状态
      holders: "holders union {who}"
  revoke:
    then:
      holders: "holders minus {who}"
assertion:                   # 一条或多条规则
  - on: use                  # 一个事件，或事件的列表
    when: "not (who in holders)"       # 规则何时适用；省略时为 "true"
    shall: "effect.allowed == false"   # 那时必须满足什么
```

每个条件和新值都是下文语言的一个表达式，写成带引号的字符串。
在本应写表达式的地方写 YAML 布尔值或整数，例如 `legal: true`，它就代表它自己。

| 键 | 内容 | 可以读取 |
| --- | --- | --- |
| `state.<variable>` | `type`，以及 `start`，即序列开始时它的值 | 无 |
| `events.<event>.legal` | 事件何时合法 | 状态和事件的参数 |
| `events.<event>.then.<variable>` | 该变量的新值 | 事件之前的状态、事件的参数和 `effect.<field>` |
| 规则的 `on` | 一个已声明的事件，或它们的列表 | 无 |
| 规则的 `when` | 规则何时适用 | 事件之前的状态和事件的参数 |
| 规则的 `shall` | 那时必须满足什么 | 事件之前的状态、事件的参数和 `effect.<field>` |

- 没有任何 `then` 提到的变量保持原值。
- 状态变量不能与某个 `values` 集合或任何事件的参数同名。
- 提到多个事件的规则只能读取其中每个事件都有的东西。

对于一步，即一个事件连同其参数和一个观察到的效果，解读得出：

| 得出 | 何时 |
| --- | --- |
| **合法** | 事件的 `legal` 为真 |
| **适用** | 某条提到该事件的规则的 `when` 为真 |
| **禁止** | 某条适用的规则的 `shall` 为假 |
| 下一个状态 | 每个变量的 `then`，按这一步之前的状态读取 |

一步是否被禁止，要先对每个解读得出，然后才计算任何解读的下一个状态。
每个解读都禁止的一步是一次违反，它的序列到此结束：在它之后不再读取下一个状态，示例的最后一步之后也不读取。
超出变量类型的新值，或表达式给出的绝对值超过 9007199254740991 的整数，是**解读错误**。

## 表达式语言

这门语言是封闭的：没有循环，没有定义，没有输入或输出。
文件加载时会检查每个表达式的类型，类型错误会指出文件和表达式。
各种形式，从结合最松的到结合最紧的：

| 形式 | 读作 |
| --- | --- |
| `if c then a else b` | `c` 成立时为 `a`，否则为 `b` |
| `all x in S: e`、`any x in S: e` | `e` 对 `S` 的每个成员 `x` 成立；对某个成员成立 |
| `map x in V: e` | 为 `values` 集合 `V` 的每个字符串 `x` 给出 `e` 的映射 |
| `a implies b` | 只要 `a` 就有 `b`；向右结合 |
| `a or b` | 任一成立 |
| `a and b` | 两者都成立 |
| `not a` | 相反 |
| `a == b`、`a != b`、`a < b`、`a <= b`、`a > b`、`a >= b` | 比较；不能连写 |
| `x in S` | `x` 是 `S` 的成员 |
| `S union T`、`S minus T` | 任一集合的成员；在 `S` 中而不在 `T` 中的成员 |
| `S intersect T` | 两个集合共有的成员 |
| `a + b`、`a - b` | 和与差 |
| `a * b` | 积 |
| `-a` | 相反数 |
| `m[k]` | 映射在键 `k` 处的值 |

前三种形式会吞掉其右边的一切，并且可以出现在任何可以放操作数的地方，例如 `b or all x in S: e` 和 `1 + if c then 1 else 2`。
同一行中的形式从左向右结合。
括号用于分组。

| 简单形式 | 读作 |
| --- | --- |
| `true`、`false` | 两个真值 |
| `none` | 缺失值 |
| 数字，例如 `12` | 一个整数 |
| 单引号中的字符串，例如 `'ann'` | 某个 `values` 集合中的那个字符串 |
| `{a, b}`、`{}` | 由所列值组成的集合；空集 |
| `{x in S: e}` | `S` 中使 `e` 成立的成员 `x` |
| 一个名字 | 状态变量、参数、作为其全部字符串之集合的 `values` 集合，或外层形式的 `x` |
| `effect.<field>` | 观察到的效果的一个字段 |
| `size(S)` | `S` 有多少个成员 |
| `min(S)`、`max(S)` | `S` 的最小和最大成员；空集时为缺失值 |
| `default(e, d)` | `e` 存在时为 `e`，否则为 `d` |

每种形式接受什么、给出什么：

| 形式 | 接受 | 给出 |
| --- | --- | --- |
| `not`、`and`、`or`、`implies` | `bool` | `bool` |
| `==`、`!=` | 同一类型的两个值，或一个类型与带 `?` 的同一类型的值 | `bool` |
| `<`、`<=`、`>`、`>=` | 两个整数，或同一 `values` 集合的两个值，按声明顺序比较 | `bool` |
| `x in S` | 一个集合和一个属于其成员类型的值，带不带 `?` 均可；`none in S` 为假 | `bool` |
| `union`、`minus`、`intersect` | 成员类型相同的两个集合 | 该类型的集合 |
| `+`、`-`、`*`、`-a` | 整数 | 整数 |
| `m[k]` | 一个映射和一个属于其键集合的值 | 映射的值类型 |
| `size(S)` | 一个集合 | 整数 |
| `min(S)`、`max(S)` | 整数的集合，或某个 `values` 集合的集合 | 带 `?` 的成员类型 |
| `default(e, d)` | 一个带 `?` 的类型的值，以及一个不带 `?` 的该类型的值 | 不带 `?` 的类型 |
| `if c then a else b` | `bool`，然后是 `==` 可以比较的两个值 | 它们的类型，任一带 `?` 时也带 `?` |
| `all x in S: e`、`any x in S: e` | 一个集合，且 `e` 为 `bool` | `bool` |
| `{x in S: e}` | 一个集合，且 `e` 为 `bool` | `S` 的类型 |
| `map x in V: e` | 某个 `values` 集合的名字，且 `e` 为任意类型 | 从 `V` 到 `e` 的类型的映射 |

- `legal`、`when` 和 `shall` 是 `bool`；`then` 具有其变量的类型；变量带 `?` 时，`then` 可带可不带。
- 对单独的 `{}` 使用 `all`、`any` 或 `{x in S: e}` 是类型错误：没有任何东西说明这个集合装的是什么。
- 名字由字母、数字和 `_` 组成，不以数字开头，并且不是下列任何一个词：`true`、`false`、`none`、`not`、`and`、`or`、`implies`、`in`、`union`、`minus`、`intersect`、`size`、`min`、`max`、`default`、`if`、`then`、`else`、`all`、`any`、`map`、`effect`。
- 某个形式的 `x` 不能是状态变量、参数、`values` 集合或外层 `x` 的名字。
- 没有除法。写出的数字超过 9007199254740991，在文件加载时是错误；表达式给出的整数绝对值超过它，是解读错误。

## 守卫文件：guard.yaml

```yaml
format: 1
binding: entitlements
sample: { sequences: 200, events: 12, seed: 1, seconds: 300 }
examples:
  - item: entitlement-3
    kind: permitted
    steps:
      - { event: grant, params: { who: ann } }
      - { event: revoke, params: { who: ann } }
      - { event: use, params: { who: ann }, effect: { allowed: false } }
  - item: entitlement-4
    kind: forbidden          # 最后一步就是绝不能发生的那一步
    steps:
      - { event: use, params: { who: bob }, effect: { allowed: true } }
```

| 键 | 内容 |
| --- | --- |
| `binding` | `guards/bindings/` 下某个文件夹的名字 |
| `sample.sequences` | 一次检查生成多少个序列；1 或更多 |
| `sample.events` | 一个序列中最多有多少个事件；1 或更多 |
| `sample.seed` | 种子；0 到 2147483647 |
| `sample.seconds` | 以秒计的时间限制，适用于绑定的每条命令和副本的检查进程；1 或更多 |
| `examples` | 至少一个允许的和一个禁止的，每个都有 `item`（一个只被指名一次的示例条目）、`kind` 和 `steps` |
| 一步 | `event`；`params`，为事件的每个参数给出一个值；`effect`，为其条目谈到的每个效果字段给出一个值 |

- 四个边界都是必需的。例子中的四个值是不错的起点。
- 请求批准之前，再用两三个别的种子运行，并记下每个留存缺陷在第几个序列被抓住。如果某个种子漏掉了它，或者只在接近最后一个序列时才抓住它，就与用户一起添加一个通向该情形的允许的示例，或者调高 `sequences`。然后把种子改回去：绝不要因为某个种子能通过就选它。
- 到达时间限制时，该命令或副本的进程会被停止，它启动的每个进程也随之停止。这算作超时。
- 某条命令启动的进程在该命令结束时被停止：一个序列需要的东西要在模块的 `start` 中启动，绝不要在 `commands` 中启动。
- 在 macOS 和 Linux 上，通过开启自己的会话而离开了启动者所在进程组的进程不会被停止，无论是在时间限制时还是在其他任何时候。如果代码会启动这样的进程，就在模块的 `stop` 中结束它，并在超时之后检查没有留下这样的进程。
- 没有解读、没有允许的示例或没有禁止的示例的守卫是 `Cannot be checked`。
- 一个示例至少有一步，最多有 `sample.events` 步。
- 某一步省略的效果字段不会与代码比较。如果某个解读在这一步需要该字段，则是错误：在那里适用的某条规则的 `shall` 读取它，或者该事件的 `then` 读取它而后面还有一步。这时报告显示 `Cannot be checked — guards/<guard>/guard.yaml: example <item>, step <n>: reading <name> reads effect.<field>, which the step does not state`。同一步的多个字段写作 `effect.<a> and effect.<b>`，多个步骤之间用 `; ` 相连。
- 如果该错误指出的字段是条目没有谈到的，说明条目有话没说：询问用户在那一步看到了什么，把它写进条目，并在那一步写明它。绝不要依据代码来填。
- 一个生成的序列由某个允许的示例的前若干步（从零步到全部）开始，后面跟着从声明中抽取的事件，并截断到 `sample.events` 个事件。种子确定了这些序列，所以在运行所用的东西发生变化之前，每次运行给出相同的报告。

## 留存缺陷

留存缺陷是一份 `git diff` 所写形式的统一 diff，放在 `guards/<guard>/faults/<name>.patch` 中。

- 它的路径从根目录算起。它指名的每个路径都是绑定的 `files` 之一或位于其中某一项之下，且不含 `node_modules` 或 `.git` 这一段：缺陷是一次运行所复制的代码中的毛病，绝不在绑定里，也不在已安装的依赖里。
- 任何其他路径在守卫加载时都是错误：`Cannot be checked — guards/<guard>/faults/<name>.patch: <path> is not among the binding's files`。
- 它改动已存在的文本文件。不是统一 diff 的补丁，新增、删除或重命名文件的补丁，或者某个改动块的行数多于其头部所记数目的补丁，在守卫加载时是错误，并指出文件，除非其中根本没有改动，还指出行号。
- 第一个 `diff --git` 或 `--- ` 行之前的文字是它的说明，供人阅读；报告以文件名称呼缺陷。
- `spex` 自己把它应用到副本上，不用 Git：每个改动块放在它写明的行上，否则放在其上下文行和被删除的行能匹配的最近位置，两处同样近时取靠前的一处。应用补丁绝不会写入副本之外的文件。

例子的缺陷 `guards/entitlement-2/faults/revoke-keeps-grant.patch`：

```diff
Revoke leaves the grant in place.

diff --git a/src/entitlement.mjs b/src/entitlement.mjs
--- a/src/entitlement.mjs
+++ b/src/entitlement.mjs
@@ -7,3 +7,3 @@
     revoke(user) {
-      holders.delete(user);
+      // the grant stays
     },
```

要植入一个缺陷，先确保它涉及的文件没有未提交的改动，然后：

1. 编辑代码，造出缺陷。
2. 写出补丁：`git diff --src-prefix=a/ --dst-prefix=b/ -- <paths> > guards/<guard>/faults/<name>.patch`。
3. 把代码改回去：`git apply -R guards/<guard>/faults/<name>.patch`。
4. 在第一个 `diff --git` 行之上加上说明。

要恢复提交 `<fix>` 修正过的一个过去的缺陷：`git diff --src-prefix=a/ --dst-prefix=b/ <fix> <fix>~1 -- <paths> > guards/<guard>/faults/<name>.patch`，然后加上说明。
这两个前缀选项使补丁在任何 Git 设置下读起来都一样。
如果克隆中没有那个提交（浅克隆就可能没有），或者该补丁已无法应用到现在的代码上，就手工植入同样的缺陷。
能应用、只是所在行与它写明的不同的补丁无需改动。
没有 Git 时，按上面的形式手写 diff。

缺陷必须让代码仍能构建、绑定仍能工作：它改变的是代码做什么，而不是代码能否运行。

## 批准记录

`spex approve <guard>` 写入 `guards/<guard>/approval.json`：为构成守卫的每个条目和文件各记一个摘要。
绝不要手工编写或编辑它。
此后 `spex verify` 会指出其中每一个已改变、新增或消失的项，在重新获得批准之前守卫不会通过。
无法按其写法读取的记录（例如合并冲突之后）使守卫成为 `not approved — <path>: <cause>`；`spex approve` 会说明这一点并替换它。
绑定的 `files` 所指的代码不属于该记录：代码可以自由改变，而守卫会检查它。

## 阅读代码之前

`spex verify` 会加载整个守卫，所以在可以阅读代码之前，声明就需要 `files` 和一个模块。
在工作流程的步骤 4 之前，使用以下占位内容：

- `files` 只列出规格包的文件，例如 `specs/packages/entitlement.md`；
- `binding.mjs` 如下：

```js
// 绑定写好之前的占位内容。
export function start() {
  throw new Error('the binding is not written yet');
}
export const events = {};
```

有了它们，报告的 `Examples against the readings` 一行是完整的，而 `On the code` 一行因绑定失败显示 `Inconclusive`。
在步骤 4 中把两者都替换掉。

## 例子的代码

项目的代码 `src/entitlement.mjs`：

```js
export function createEntitlements() {
  const holders = new Set();
  return {
    grant(user) {
      holders.add(user);
    },
    revoke(user) {
      holders.delete(user);
    },
    use(user) {
      return holders.has(user);
    },
  };
}
```

有了上面这些文件，并把该解读保存为 `readings/a.yaml`，这个守卫就完整了。
它的示例与解读所述一致，并且 `entitlement-3` 展示了该行为的发生：在它的第三步，Ann 没有持有授权，所以断言适用。
在带有留存缺陷的副本上，授予 Ann、撤销 Ann、Ann 使用这一序列以 `allowed=true` 结束，而解读禁止它，所以缺陷被抓住。
[results.md](results.zh-CN.md) 解释 `spex verify entitlement-2` 打印的报告。
