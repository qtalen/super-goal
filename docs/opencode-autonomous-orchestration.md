# OpenCode 自主编排循环 · 完整设计与实现文档

> 本文档详细描述了在 OpenCode 中实现"需求澄清 → 自主编排 → 审查整改 → 过程记录"全自动开发循环的完整架构、技术细节和实现方案。
>
> **目标读者**：需要在另一个项目中复刻此机制的开发者。
> **前提条件**：目标项目基于 OpenCode（或兼容的智能体框架），支持斜杠命令、Task 工具、自定义 Agent。

---

## 目录

1. [总体架构](#1-总体架构)
2. [需要创建的文件](#2-需要创建的文件)
3. [斜杠命令：路由到编排智能体](#3-斜杠命令路由到编排智能体)
4. [编排智能体设计](#4-编排智能体设计)
5. [执行子智能体设计](#5-执行子智能体设计)
6. [权限体系设计](#6-权限体系设计)
7. [Task 工具：多轮会话机制](#7-task-工具多轮会话机制)
8. [审查—整改循环协议](#8-审查整改循环协议)
9. [过程记录文件设计](#9-过程记录文件设计)
10. [边界条件与故障处理](#10-边界条件与故障处理)
11. [实现检查清单](#11-实现检查清单)
12. [附录：关键源码引用](#12-附录关键源码引用)

---

## 1. 总体架构

### 1.1 角色定义

```
┌─────────────────────────────────────────────────────────┐
│  用户                                                    │
│  /orchestrate "做一个用户登录系统"                        │
└────────────────────┬────────────────────────────────────┘
                     │ 斜杠命令路由
                     ▼
┌─────────────────────────────────────────────────────────┐
│  编排智能体 (orchestrator)                                │
│  mode: primary                                           │
│                                                          │
│  Phase 1: 需求澄清 (user ↔ orchestrator)                  │
│    理解用户意图 → 提问澄清 → 锁定需求清单 → 用户确认       │
│                                                          │
│  Phase 2: 自主执行 (orchestrator ↔ worker)                │
│    派 worker → 回答 worker 提问 → 审查 → 要求整改         │
│    → 循环直到满意 → 写记录文件 → 告知用户                  │
└────────────────────┬────────────────────────────────────┘
                     │ task 工具 (多轮 + task_id)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  执行子智能体 (worker)                                    │
│  mode: subagent                                          │
│                                                          │
│  收到任务 → 分析 → 提出澄清问题 → 收到回答 → 生成计划     │
│  → 编码 → 接收审查反馈 → 整改 → 再次报告                  │
└─────────────────────────────────────────────────────────┘
```

### 1.2 两阶段流程

```
Phase 1                          Phase 2
(用户交互)                        (无交互)
───────◄─────── 需求已锁定 ───────▶───────◄──── 任务完成 ────
│                                  │
用户澄清需求                       编排器自主调度 worker
编排器提问                        审查—整改循环
用户确认 OK                        写记录文件
                                  告知用户完成
```

Phase 1 和 Phase 2 在**同一个会话**中完成。编排器内部根据是否已锁定需求来切换行为模式。

### 1.3 关键架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 编排器模式 | `primary` | 必须使用 task 工具派生子智能体 |
| 执行器模式 | `subagent` | 天然不能递归派生子智能体 |
| Phase 切换 | 同一会话内状态切换 | 用户只需一次 `/orchestrate` |
| 审查方式 | 跑实际校验工具 + 结构性对照 | 不依赖 LLM 裸眼审查代码 |
| 记录策略 | 终写（完成后一次性写入） | 数据源在 SQLite，文件只是快照 |

---

## 2. 需要创建的文件

```
项目根目录/
├── .opencode/
│   ├── commands/
│   │   └── orchestrate.md          # 斜杠命令定义
│   ├── agents/
│   │   ├── orchestrator.md         # 编排智能体 (primary)
│   │   └── worker.md               # 执行子智能体 (subagent)
│   └── logs/                       # 过程记录输出目录（自动创建）
│       └── {date}-{slug}.md
```

三个文件即构成完整系统。无需修改任何源码。

---

## 3. 斜杠命令：路由到编排智能体

### 3.1 命令定义文件

**文件**：`.opencode/commands/orchestrate.md`

```markdown
---
agent: orchestrator
description: 编排式开发 — 理解需求、派出智能体、审查、整改、记录
---

用户需求：$ARGUMENTS

请按照你被设定的编排流程处理以上需求。

流程概要：
1. 先与用户澄清所有需求细节（Phase 1）
2. 用户确认后，自主派出执行智能体完成任务（Phase 2）
3. 审查执行结果，必要时要求整改
4. 任务完成后将完整过程记录到 .opencode/logs/ 目录
```

### 3.2 路由机制

用户输入 `/orchestrate "做一个用户登录系统"` 后的完整路由链路：

```
TUI 斜杠检测
  │
  slashHead() 解析 → { name: "orchestrate", arguments: "做一个用户登录系统" }
  │
parseSlashCommand() 在 commands 列表中匹配 "orchestrate"
  │
submitPrompt() → runtime.queue → stream.transport
  │
POST /session/{sessionID}/command
  │
SessionPrompt.command():
  │
  ├── commands.get("orchestrate")   → 拿到命令配置
  │
  ├── agent = cmd.agent             → "orchestrator"
  │     (cmd.agent 优先于 input.agent，这就是路由)
  │
  ├── 模板插值:
  │     $ARGUMENTS                  → "做一个用户登录系统"
  │     !`shell_cmd`               → 执行 shell 并注入输出
  │     @file                       → 附件引用
  │
  ├── cmd.subtask 未设置
  │     → isSubtask = false
  │     → 模板作为 user message 直接发给 orchestrator agent
  │
  └── prompt({ agent: "orchestrator", parts: [模板文本] })
```

**关键点**：`agent: orchestrator` 使命令直接路由到编排智能体作为 user message，而非通过 subtask 中转。这确保编排器以 primary agent 身份运行，拥有完整的 task 工具权限。

### 3.3 模板插值规则

| 占位符 | 含义 | 示例 |
|--------|------|------|
| `$ARGUMENTS` | 命令后的全部原始文本 | "做一个用户登录系统，要用React" |
| `$1`, `$2` | 位置参数（按空格分割） | `$1` = "做一个用户登录系统" |
| `$N`（最大编号） | 匹配剩余所有参数 | `$2` 在只有两个参数时 = 第二个参数 |
| `` !`cmd` `` | Shell 命令执行结果 | `` !`git branch --show-current` `` |
| `@path` | 文件引用 | `@src/config.ts` |

### 3.4 不使用 `subtask` 的原因

如果设置 `subtask: true`，流程变为：

```
/orchestrate → build agent 收到模板 → build 用 task 工具启动 orchestrator
→ orchestrator 变成 subagent → subagent 不能使用 task 工具（被 childToolDenies 注入 deny）
→ ❌ orchestrator 无法派 worker
```

因此**绝不能**设置 `subtask: true`。必须通过 `agent: orchestrator` 直接路由。

---

## 4. 编排智能体设计

### 4.1 Agent 定义文件

**文件**：`.opencode/agents/orchestrator.md`

```markdown
---
mode: primary
description: 任务编排者。需求澄清 → 派出执行智能体 → 审查结果 → 要求整改 → 记录过程。
permission:
  question: allow
---

你是一名**任务编排者**，负责将一个模糊的用户需求转化为高质量的实现代码。

## 核心原则

- 你**不直接编写代码**。你只做三件事：理解需求、审查结果、管理系统流转。
- 所有编码工作由 worker 子智能体完成。
- 你对用户负责——确保交付物与用户确认的需求完全一致。

## 两阶段工作流

### Phase 1：需求澄清（用户交互模式）

当收到用户任务且尚未锁定需求时：

1. 分析用户输入，提取隐含的需求点
2. 主动向用户提出澄清问题。按优先级排序：
   - **功能范围**：具体要什么功能？明确不要什么？
   - **技术偏好**：有指定的技术栈吗？有约束吗？
   - **边界条件**：什么情况下算"完成"？
3. 将澄清后的需求整理为清单，请用户确认
4. 用户确认（回复 OK / 确认 / 没问题）后，锁定需求，**不再反问用户**，进入 Phase 2

**提问原则**：
- 不要问用户无法回答的技术问题（如"JWT 还是 session"）——这类问题留到 Phase 2 由你自己决策
- 只问与业务需求相关的决策
- 每次提问不超过 5 个问题
- 提供合理的默认选项，方便用户快速回复

### Phase 2：自主执行（无交互模式）

需求锁定后，按以下循环执行：

```
┌─ 1. 派出 worker ────────────────────────────────────────┐
│  使用 task 工具调用 worker 子智能体                         │
│  首次调用提供完整的需求清单                                  │
│  后续调用通过 task_id 恢复同一 worker 会话                   │
├─ 2. 回答 worker 的澄清问题 ───────────────────────────────┤
│  worker 可能提出技术澄清问题（如数据库选型、目录结构等）       │
│  你需要根据自己的判断直接回答，不要反问用户                   │
│  每次回答后要求 worker 继续下一步                            │
├─ 3. 审查 worker 的产出 ──────────────────────────────────┤
│  按照"审查协议"（见下文）逐项检查                             │
├─ 4. 要求整改（如有问题）──────────────────────────────────┤
│  构造结构化反馈消息，通过 task({ task_id }) 发送             │
│  回到步骤 3 重新审查                                        │
├─ 5. 任务完成 ────────────────────────────────────────────┤
│  写记录文件到 .opencode/logs/{date}-{slug}.md              │
│  告知用户任务已完成，附上记录文件路径                         │
└──────────────────────────────────────────────────────────┘
```

**Phase 2 中的自主决策范围**：
- 技术栈选择（未指定时）
- 代码架构和目录结构
- 第三方库的选择
- 错误处理策略
- 代码风格和最佳实践

## 审查协议

### 第 1 步：看差异

```
bash: git diff --stat     → 确认改了什么文件
bash: git diff             → 看具体改动（首次审查时）
```

### 第 2 步：自动校验

```
bash: bun run typecheck     → 类型错误 = 直接打回
（根据项目实际命令调整，如 npm run lint、cargo check 等）
```

如果 worker 未报告跑过校验，编排器必须主动跑一次。

### 第 3 步：对照需求检查

- 逐条对照 Phase 1 确认的需求清单
- 使用 `read` 读取关键文件的完整内容
- 使用 `grep` 搜索关键函数/类是否存在

### 第 4 步：反馈格式

如果发现问题，用以下格式向 worker 发送反馈：

```
审查结果：以下 N 个问题需要修复，其余部分通过。

问题 1 | src/login.ts:42 | 类型错误
当前: 函数返回类型是 `any`
期望: 返回类型应为 `Promise<LoginResult>`
修复方法: 给函数签名添加显式返回类型注解

问题 2 | src/auth.ts:15-20 | 缺少输入校验
当前: email 和 password 参数没有校验
期望: email 需校验格式，password 长度 ≥ 8
修复方法: 在函数开头添加验证逻辑

请修复以上所有问题后报告完成。不要修改其他任何代码。
```

### 第 5 步：整改验证

Worker 报告修复后，必须独立验证：

1. `git diff` → 只改了应该改的地方？没动其他文件？
2. `read` → 读修复后的代码，确认改动与实际一致
3. `bun run typecheck` → 类型仍然通过
4. 重新对照需求 → 逐条划掉

### 循环终止条件

1. ✅ **正常结束**：所有需求通过 + typecheck/lint 全绿
2. ⚠️ **僵持保护**：连续 2 轮出现相同问题 → 告知用户问题并请求指导
3. ⚠️ **轮次上限**：总审查轮次达到 5 轮 → 报告未解决的问题并结束

## 过程记录

任务完成后，使用 `write` 工具将完整过程写入文件。

**文件路径**：`.opencode/logs/{YYYY-MM-DD}-{task-slug}.md`

其中 `task-slug` 是需求关键词的小写连字符形式（如 `user-login-system`）。

**记录格式**：参见"过程记录文件设计"章节。最低要求包含：
- 原始需求和确认后的需求清单
- 审查轮次和发现的问题
- 最终改动文件列表
- 验证通过的证据

## Task 工具使用要点

1. **首次调用**不传 `task_id`，让系统自动创建新 session
2. 从返回的 XML 中提取 `task_id`：`<task id="ses_xxx..." state="completed">`
3. **后续所有调用**都传入 `task_id: "ses_xxx"` 以恢复同一会话
4. 始终使用 `subagent_type: "worker"`
5. 使用**前台模式**（默认，不设 `background: true`），等待 worker 完成后审查
```

### 4.2 编排器的权限说明

编排器基于 `defaults` 权限集（`*: allow`），额外需要：

```yaml
permission:
  question: allow    # Phase 1 中向用户提问
```

其他所有工具（bash、read、grep、write、task）已在 defaults 中自动允许，无需额外配置。

---

## 5. 执行子智能体设计

### 5.1 Agent 定义文件

**文件**：`.opencode/agents/worker.md`

```markdown
---
mode: subagent
description: 执行者。接收任务 → 分析提问 → 接收回答 → 生成计划 → 编码 → 接收审查反馈 → 整改。
---

你是一名**执行者**。你的工作由编排智能体分配，你向编排智能体汇报。

## 核心原则

- 你只负责执行分配给你的任务
- 你**不与用户直接交互**——所有问题通过编排智能体中转
- 你的代码必须完整、可运行、经过自检

## 工作流

### 第 1 步：分析任务，提出澄清问题

收到任务后，先不编写任何代码。分析任务中的模糊点，提出需要澄清的**技术问题**。例如：
- 技术栈选择：数据库类型、框架、ORM
- 架构决策：目录结构、模块划分
- 实现细节：认证方案、错误处理模式

**不要问业务需求类问题**——那些应该由编排智能体在分配任务前确认。

将所有问题一次性列出，等待编排智能体回复。

### 第 2 步：生成执行计划

收到澄清问题的回答后，生成详细的执行计划：

```
## 执行计划

### 涉及文件
- src/auth/login.ts (新建) — 登录处理逻辑
- src/auth/register.ts (新建) — 注册处理逻辑
- src/middleware/auth.ts (修改) — 添加 session 中间件

### 实施步骤
1. 创建数据库模型 (src/db/models/user.ts)
2. 实现注册逻辑 (src/auth/register.ts)
3. 实现登录逻辑 (src/auth/login.ts)
...
```

报告执行计划，等待编排智能体确认。

### 第 3 步：按计划编码

收到确认后，开始编写代码。
- 每完成一个文件，自检语法和类型
- 全部完成后，运行 `bun run typecheck`（或等价命令）
- 清理调试输出（console.log 等）

### 第 4 步：报告完成并接受审查

编码完成后，在你的最后一条消息中报告：

```
代码已完成。

涉及文件：
- src/auth/login.ts (新建，45 行)
- src/auth/register.ts (新建，38 行)
- src/middleware/auth.ts (修改，+15 -3)

自检结果：
- typecheck: 通过
- 功能对照: 全部需求已实现

等待审查反馈。
```

**重要**：将总结信息放在最后一条消息中。编排智能体只能看到你的最后一条文本消息（`<task_result>` 中的内容）。

### 第 5 步：接收整改反馈

如果编排智能体发现问题，你会收到结构化反馈：

```
审查结果：以下 N 个问题需要修复...

问题 1 | src/login.ts:42 | 类型错误
当前: ...
期望: ...
修复方法: ...
```

按反馈逐项修复后报告：

```
整改完成。

问题 1: 已修复 — src/login.ts:42 添加了返回类型注解
问题 2: 已修复 — 移除了 2 处 console.log
问题 3: 已修复 — 添加了密码长度 ≥ 8 的校验

typecheck: 通过
等待再次审查。
```

### 整改原则

- 只修复反馈中指出的问题，不要修改其他任何代码
- 不要说"已修复"但实际没有修改
- 修复完后重新跑 typecheck 确认没有引入新错误
- 如果反馈不清晰，要求编排智能体提供更多细节

## 技术约束

- 你**不能**使用 task 工具（系统自动禁止）
- 你**不能**使用 todowrite 工具（系统自动禁止）
- 你可以使用 bash、read、write、edit、grep、glob 等所有常规工具
- 代码生成后必须经过类型检查或语法校验
```

### 5.2 Worker 的权限说明

Worker 基于 `defaults` 权限集（`*: allow`），系统自动注入以下限制：

| 工具 | 状态 | 来源 |
|------|------|------|
| `task` | ❌ deny | `childToolDenies` 注入 |
| `todowrite` | ❌ deny | `childToolDenies` 注入 |
| `bash` | ✅ allow | defaults |
| `edit` | ✅ allow | defaults |
| `write` | ✅ allow | defaults |
| `read` | ✅ allow | defaults |
| `grep` | ✅ allow | defaults |
| `glob` | ✅ allow | defaults |

**Worker 不需要手动配置任何权限**。上述组合自动达成。

---

## 6. 权限体系设计

### 6.1 权限求值算法

```typescript
// 简化表示——实际使用 findLast() 查找最后匹配的规则
function evaluate(permission, pattern, ruleset) {
  return ruleset.findLast(rule =>
    wildcard_match(permission, rule.permission) &&
    wildcard_match(pattern, rule.pattern)
  ) ?? { action: "ask" }  // 无匹配 → 询问用户
}
```

**后定义的规则覆盖先定义的规则**。合并顺序：

```
defaults → user 全局 config → agent 自身 config
   先                           后（胜出）
```

### 6.2 权限锁链

```
┌────────────────────────────────────────────────────────────┐
│  orchestrator (primary)                                    │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ defaults: * = allow                                  │ │
│  │ + question: allow                                    │ │
│  │ → 全部工具可用，包括 task 派生子智能体                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│          task({ subagent_type: "worker" })                 │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ worker session                                       │ │
│  │ ┌────────────────────────────────────────────────┐   │ │
│  │ │ 继承: 父 session 的 deny 规则                    │   │ │
│  │ │ 继承: external_directory 规则                   │   │ │
│  │ │ 自身: defaults (* = allow)                      │   │ │
│  │ │ 注入: task = deny ⛔  (childToolDenies)           │   │ │
│  │ │ 注入: todowrite = deny ⛔ (childToolDenies)       │   │ │
│  │ │                                                 │   │ │
│  │ │ 结果: bash ✓ edit ✓ read ✓ grep ✓               │   │ │
│  │ │       task ✗ todowrite ✗                        │   │ │
│  │ └────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 6.3 子智能体权限继承规则

`deriveSubagentSessionPermission()` 只从父 session 继承：

1. **`deny` 规则** — 父可以通过 deny 限制子（但编排器没有 deny 规则）
2. **`external_directory` 规则** — 外部目录访问权限

父的 **`allow` 规则不继承**。子智能体的权限由其自身 config 决定。

### 6.4 无需额外配置的原因

- Defaults 基准 `"*": "allow"` 足够宽松
- `childToolDenies` 自动阻止子智能体递归（task 和 todowrite 注入为 deny）
- 编排器和 worker 的天然权限组合正好满足需求：编排器什么都能做，worker 能做编码相关但不能再派孙智能体

---

## 7. Task 工具：多轮会话机制

### 7.1 返回值结构

每次 `task()` 调用返回以下结构的 XML 字符串：

```xml
<task id="ses_a1b2c3d4..." state="completed">
  <task_result>
    [worker 的最后一条文本消息]
  </task_result>
</task>
```

**关键事实**：

| 特性 | 说明 |
|------|------|
| `task_id` | 即 `SessionID`，从 `<task>` 标签的 `id` 属性提取 |
| 输出内容 | **仅**包含 worker 的最后一条文本消息 |
| 状态 | `completed`（成功）或 `error`（失败） |
| 长输出 | 超过 2000 行或 50KB 时截断，完整内容写入临时文件 |

### 7.2 会话恢复机制

每次带 `task_id` 的调用：

```
sessions.get(SessionID.make(params.task_id))
  │
  ├── 找到了 → 复用现有 session（无 parent 校验）
  └── 未找到 → 创建新 session（task_id 被忽略，行为等同于首次调用）
```

恢复后的处理：

```
MessageID.ascending()          → 生成新的唯一消息 ID
MessageV2.filterCompacted()    → 从 SQLite 加载全部历史消息
toModelMessages()              → 转换为 LLM 可读格式
LLM 调用                       → worker 看到完整历史 + 新提示
```

### 7.3 生命周期特性

| 特性 | 说明 |
|------|------|
| 持久化 | Session 和全部消息永久存储在 SQLite 中 |
| 无过期 | Session 不会自动删除或过期 |
| 无去重 | 每次调用生成新的 MessageID，重复调用会追加而非去重 |
| 进程安全 | 进程重启后一切可从 SQLite 恢复 |
| 上下文管理 | Compaction 自动摘要旧轮次，保留最近 ~2 轮完整内容 |

### 7.4 编排器如何使用

**首次调用**（创建新 worker session）：

```
编排器: task({
  subagent_type: "worker",
  description: "实现用户登录系统",
  prompt: "需求如下：\n1. 邮箱+密码注册\n2. ...\n\n请先分析任务并提出问题"
})

返回:
<task id="ses_w1x2y3z4..." state="completed">
  <task_result>
    我分析了需求，有以下问题：
    1. 数据库用什么？
    2. 前端框架？
    3. ...
  </task_result>
</task>
```

编排器从 XML 中提取 `task_id = "ses_w1x2y3z4..."`。

**后续调用**（恢复同一 worker 会话）：

```
编排器: task({
  task_id: "ses_w1x2y3z4...",
  subagent_type: "worker",
  description: "回答worker问题",
  prompt: "回答你的问题：\n1. 使用 SQLite + Drizzle ORM\n2. 不需要前端\n...\n\n现在生成执行计划。"
})
```

Worker 的 LLM 会看到第 1 轮的提问消息 + 第 2 轮的回答消息，上下文完整续接。

### 7.5 上下文增长与 Compaction

随着轮次增加，worker 上下文会持续增长：

```
轮次  worker 上下文内容
─────────────────────────────
1     [需求 + 提问]
2     [1的全部] + [回答]
3     [2的全部] + [计划 + 编码]
4     [3的全部] + [审查反馈 + 修复]
5     [4的全部] + [第二次修复]
...
N     [Compaction 触发] → 旧轮次被摘要替换，保留最近 ~2 轮完整内容
```

Compaction 参数：
- `DEFAULT_TAIL_TURNS = 2`（保留最后 2 轮完整内容）
- `MIN_PRESERVE_RECENT = 2000` tokens
- `MAX_PRESERVE_RECENT = 8000` tokens

无需编排器手动管理。

### 7.6 前台模式 vs 后台模式

| 模式 | 编排器行为 | 适用场景 |
|------|-----------|---------|
| **前台**（默认） | 阻塞等待 worker 完成 | 编排器需要审查结果后才能继续 |
| **后台** (`background: true`) | 立即返回 "running"，完成后异步通知 | 编排器需要同时做其他事 |

**本方案全程使用前台模式**。因为编排器必须在每轮 worker 完成后进行审查。

---

## 8. 审查—整改循环协议

### 8.1 审查流水线

编排器在每轮 worker 返回后，**必须**按顺序执行：

```
 Step 1: 看差异
   bash: git diff --stat    → 确认改了什么文件
   bash: git diff            → 看具体改动（首次或有疑问时）

 Step 2: 自动校验
   bash: bun run typecheck   → 类型错误 = 直接打回
   (具体命令根据项目 `package.json` 的 scripts 调整)

 Step 3: 对照需求检查
   read → 读关键文件
   grep → 搜索关键函数/模式是否存在
   逐条对照 Phase 1 确认的需求清单

 Step 4: 发现问题 → 生成结构化反馈
 Step 5: 未发现问题 → 审查通过，结束循环
```

### 8.2 反馈格式规范

向 worker 发送审查反馈时，使用以下格式：

```
审查结果：以下 N 个问题需要修复，其余部分通过。

问题 1 | src/login.ts:42 | 类型错误
当前: 函数返回类型是 `any`
期望: 返回类型应为 `Promise<LoginResult>`
修复方法: 给函数签名添加显式返回类型注解

问题 2 | src/auth.ts:15-20 | 缺少输入校验
当前: email 和 password 参数没有校验
期望: email 需校验格式，password 长度 ≥ 8
修复方法: 在函数开头添加 Zod schema 校验

问题 3 | 全局 | 调试代码残留
当前: src/login.ts:15, src/auth.ts:8 有 console.log
修复方法: 移除所有调试输出

请修复以上所有问题后报告完成。不要修改其他任何代码。
```

**格式要求**：
- `问题 N | 文件:行号 | 问题类型` — 三元组便于 worker 定位
- 三段式描述：`当前` → `期望` → `修复方法` — 消除歧义
- `不要修改其他任何代码` — 防止过度修复

### 8.3 整改验证

Worker 报告修复后，编排器**不得**仅信任 worker 的声称。必须独立验证：

```
验证步骤:
1. bash: git diff --stat    → 确认只改了期望的文件
2. bash: git diff            → 看实际改动，确认与反馈一致
3. read                      → 读修复后的代码确认
4. bash: bun run typecheck    → 确认类型仍然通过
5. 逐条对照需求              → 划掉已验证的项
```

### 8.4 三个关键风险场景及处理

| 场景 | 编排器怎么发现 | 处理方式 |
|------|--------------|---------|
| Worker 说修了但实际没修 | `git diff --stat` 显示该文件无变化 | 打回，明确指出："你声称修复了问题 X，但 git diff 显示 src/login.ts 没有变化。请实际应用修改。" |
| Worker 修了 A 但意外改了 B | `git diff --stat` 显示额外文件被修改 | 新增问题："你修改了 src/config.ts，但审查未要求修改此文件。请回退该修改。" |
| Worker 不理解反馈方向 | 修复后的代码与反馈描述不一致 | 换一种方式解释，提供更具体的代码示例："请在 src/login.ts 第 42 行，将 `function login` 改为 `async function login(...): Promise<LoginResult>`" |

### 8.5 循环终止条件

```
防线 1 (正常结束):
  ✅ 所有需求项通过对照检查
  ✅ typecheck / lint 全绿
  ✅ git diff 确认改动合理
  → 进入最终记录阶段

防线 2 (僵持保护):
  ⚠️ 同一问题连续出现 2 轮
  → 不再发送给 worker，编排器告知用户具体问题并请求指导

防线 3 (轮次上限):
  ⚠️ 总审查轮次达到 5 轮
  → 报告未解决的问题，任务标记为部分完成
```

---

## 9. 过程记录文件设计

### 9.1 文件位置和命名

```
.opencode/logs/{YYYY-MM-DD}-{task-slug}.md
```

示例：`.opencode/logs/2026-07-06-user-login-system.md`

### 9.2 写入时机

**终写策略**：在 Phase 2 全部完成、审查通过后，一次性用 `write` 工具写入完整文件。

理由：
- Session 的完整消息已在 SQLite 中持久化（可通过 `opencode export` 恢复）
- 文件只是人类阅读的快照
- 避免增量写入的碎片化问题

### 9.3 记录内容分级

| 层次 | 内容 | 是否必须 |
|------|------|---------|
| **第一层** | 原始需求、确认后的需求清单、最终改动列表、验证结果 | ✅ 必须 |
| **第二层** | Phase 1 的 Q&A 记录、每轮审查发现的问题和反馈、整改结果 | ✅ 默认包含 |
| **第三层** | Worker 完整计划、技术决策理由、Token 用量 | 可选 |

### 9.4 文件模板

编排器在任务完成后，使用 `write` 工具写入以下格式的文件：

```markdown
# Task: {需求简短描述}

| 项目 | 值 |
|------|------|
| 日期 | {YYYY-MM-DD HH:MM} |
| 编排 session | {orchestrator_session_id} |
| 执行 session | {worker_session_id} |
| 状态 | 完成 |
| 审查轮次 | {N} |
| Token 用量 | ~{total_tokens} |

---

## 需求确认

> 用户原始输入: "{用户输入}"

### 澄清过程

**Q**: {编排器的问题1}
**A**: {用户的回答1}

**Q**: {编排器的问题2}
**A**: {用户的回答2}

### 确认的需求清单

1. [x] {需求1}
2. [x] {需求2}
3. [ ] ~~{被排除的需求}~~ （不需要）

---

## 执行计划

{worker 生成的执行计划内容}

---

## 技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| {决策项1} | {选择} | {理由} |
| {决策项2} | {选择} | {理由} |

---

## 审查历史

### 审查 #1 — 发现问题 {N} 项

| # | 文件 | 问题 | 状态 |
|---|------|------|------|
| 1 | src/login.ts:42 | 返回类型为 any | ✅ 已修复 |
| 2 | src/login.ts:15, src/auth.ts:8 | 残留 console.log | ✅ 已修复 |
| 3 | src/auth.ts:15-20 | 缺少密码长度校验 | ✅ 已修复 |

→ 反馈已发送，worker 进入整改

### 审查 #2 — 全部通过

- [x] typecheck 通过
- [x] 所有需求已实现
- [x] 代码质量符合预期

---

## 最终改动

```
{git diff --stat 的输出}
```

示例：
```
 src/auth.ts    |  28 +++++++++
 src/db.ts      |  67 +++++++++++++++++++++ (new)
 src/login.ts   |  45 ++++++++++----
 3 files changed, 120 insertions(+), 20 deletions(-)
```

---

## 验证结果

- [x] `bun run typecheck` → 0 errors
- [x] 所有需求逐项对照通过
- [x] 无遗留问题
- [x] 无多余文件修改
```

---

## 10. 边界条件与故障处理

### 10.1 用户交互异常

| 场景 | 编排器行为 |
|------|-----------|
| 用户在 Phase 1 中途消失 | Session 持久化在 SQLite 中，恢复后可从断点继续 |
| 用户对需求清单说"不对" | 回到 Phase 1 继续澄清，直到用户满意 |
| 用户在 Phase 2 中插入消息 | 编排器应忽略或暂停，但当前架构下 Phase 2 不期望用户介入。如果用户插话，编排器应判断是否影响需求并决定是否回到 Phase 1 |

### 10.2 Worker 异常

| 场景 | 编排器行为 |
|------|-----------|
| Worker 返回 `<task ... state="error">` | 读取错误信息，判断是否需要换一种方式重试。如果是临时错误（如网络超时），重试。如果是逻辑错误（如 worker 理解不了需求），修改提示后重试 |
| Worker 连续返回相同错误 | 达到僵持保护门槛（连续 2 轮相同问题），告知用户并请求指导 |
| Worker 的 task_id 对应的 session 丢失 | `sessions.get()` 返回 `undefined`，系统自动创建新 session。编排器应在新 session 中包含完整的需求和上下文 |
| Worker 输出被截断 | 截断标记会指明输出文件路径。编排器用 `read` 查询完整输出后继续处理 |

### 10.3 编排器自身异常

| 场景 | 行为 |
|------|------|
| 编排器进程崩溃 | 所有消息在 SQLite 中。重启后可通过 session ID 恢复所有对话。Worker session 的 task_id 可从历史消息中提取 |
| API 限流 | 重试机制由底层 SDK 处理。编排器自身无需处理 |
| 上下文超长 | Compaction 自动触发 |

### 10.4 工具限制

| 限制 | 影响 | 应对 |
|------|------|------|
| Worker 只能看到最后一条文本消息 | Worker 前期输出可能丢失 | Worker 必须在最后一条消息中汇总所有关键信息 |
| `write` 工具不追加 | 不能增量写记录文件 | 使用终写策略 |
| `git diff` 依赖 git 仓库 | 非 git 项目无法用 git diff | 使用 `bash: dir /s /b` + `read` 手动比对 |

### 10.5 Token 成本与性能

| 阶段 | 成本特征 | 优化建议 |
|------|---------|---------|
| Phase 1 | 低（简单对话） | 无 |
| Phase 2 第 1 轮 | 中（worker 理解任务 + 提问） | 一次性给出完整需求 |
| Phase 2 审查轮 | 取决于代码量 | 每次只让 worker 聚焦于修复而非完整重做 |
| 记录写入 | 低 | 无 |

---

## 11. 实现检查清单

### 文件创建

- [ ] `.opencode/commands/orchestrate.md` — 斜杠命令，路由到编排器
- [ ] `.opencode/agents/orchestrator.md` — 编排智能体定义（primary）
- [ ] `.opencode/agents/worker.md` — 执行子智能体定义（subagent）

### 编排器提示词关键要素

- [ ] 两阶段模式切换逻辑（Phase 1 需求澄清 → Phase 2 自主执行）
- [ ] Phase 1 提问策略（不超过 5 个问题、仅问业务决策）
- [ ] Phase 2 自主决策范围（技术选型、架构、库选择）
- [ ] 审查协议（git diff → typecheck → 对照需求 → 结构化反馈 → 验证修复）
- [ ] 反馈消息格式规范（问题 N | 文件:行号 | 类型 | 当前 → 期望 → 修复）
- [ ] 循环终止条件（全通过 / 僵持 2 轮 / 上限 5 轮）
- [ ] 过程记录模板
- [ ] Task 工具使用说明（首次无 task_id，后续传 task_id）

### Worker 提示词关键要素

- [ ] 五步工作流（分析提问 → 生成计划 → 编码 → 报告 → 接受整改）
- [ ] 只问技术问题，不问业务问题
- [ ] 最后一条消息必须汇总（因为编排器只能看到最后一条文本）
- [ ] 整改时只修反馈中指出的问题
- [ ] 编码后必须自检（typecheck / lint）

### 权限验证

- [ ] 编排器可以正常使用 task 工具（primary mode + defaults *: allow）
- [ ] 编排器可以正常使用 question 工具（显式 allow）
- [ ] Worker 不能使用 task 工具（childToolDenies 自动禁止）
- [ ] Worker 不能使用 todowrite 工具（childToolDenies 自动禁止）
- [ ] Worker 可以正常使用 bash、edit、write、read、grep、glob

### 集成测试

- [ ] `/orchestrate` 命令可以被 TUI 识别
- [ ] 命令正确路由到 orchestrator agent
- [ ] Phase 1 对话正常进行，用户确认后进入 Phase 2
- [ ] 编排器首次调用 worker 时创建新 session
- [ ] 编排器正确从 XML 中提取 task_id
- [ ] 编排器使用 task_id 恢复同一 worker session
- [ ] 编排器正确运行 git diff + typecheck
- [ ] 编排器正确构造结构化反馈
- [ ] Worker 正确接收反馈并整改
- [ ] 编排器正确验证整改
- [ ] 编排器正确写入 .opencode/logs/ 下的记录文件
- [ ] 任务完成后编排器向用户报告

---

## 12. 附录：关键源码引用

### 12.1 斜杠命令路由

| 文件 | 行号 | 内容 |
|------|------|------|
| `packages/core/src/v1/config/command.ts` | 5-12 | `ConfigCommandV1.Info` schema（template, agent, model, subtask 等字段） |
| `packages/opencode/src/command/index.ts` | 66-153 | `Command.Service` 实现，聚合四种命令源（内置、JSON、MCP、Skill） |
| `packages/opencode/src/session/prompt.ts` | 1417-1542 | `SessionPrompt.command()` — 命令执行核心逻辑 |
| `packages/opencode/src/session/prompt.ts` | 1437-1456 | 模板插值实现（`$ARGUMENTS`, `$1`, `$2`） |
| `packages/opencode/src/session/prompt.ts` | 1500-1512 | `isSubtask` 判断逻辑 |
| `packages/opencode/src/cli/cmd/run/footer.prompt.tsx` | 142-157 | `slashHead()` — TUI 斜杠命令解析 |

### 12.2 Task 工具

| 文件 | 行号 | 内容 |
|------|------|------|
| `packages/opencode/src/tool/task.ts` | 64-79 | `renderOutput()` — Task 返回值 XML 格式 |
| `packages/opencode/src/tool/task.ts` | 121-123 | Session 复用查找逻辑 |
| `packages/opencode/src/tool/task.ts` | 129-141 | `childToolDenies` 注入（task + todowrite deny） |
| `packages/opencode/src/tool/task.ts` | 186-200 | `runTask()` — 每次调用生成新 MessageID |
| `packages/opencode/src/tool/task.ts` | 303-333 | 前台任务完成后的返回值构建 |
| `packages/opencode/src/tool/task.ts` | 274-294 | 后台任务返回值 |
| `packages/opencode/src/tool/task.txt` | 全文 | Task 工具的 LLM 描述 |

### 12.3 权限系统

| 文件 | 行号 | 内容 |
|------|------|------|
| `packages/opencode/src/agent/subagent-permissions.ts` | 1-27 | `deriveSubagentSessionPermission()` |
| `packages/opencode/src/permission/index.ts` | 39-49 | `evaluate()` — findLast 求值算法 |
| `packages/opencode/src/permission/index.ts` | 197-209 | `fromConfig()` — 配置转规则集 |
| `packages/opencode/src/permission/index.ts` | 211-213 | `merge()` — 扁平化合并 |
| `packages/opencode/src/agent/agent.ts` | 117-134 | `defaults` 基准权限集 |
| `packages/opencode/src/agent/agent.ts` | 139-153 | `build` agent 权限配置 |
| `packages/opencode/src/agent/agent.ts` | 180-193 | `general` subagent 权限配置 |
| `packages/opencode/src/agent/agent.ts` | 265-292 | Agent config 合并逻辑 |

### 12.4 会话生命周期

| 文件 | 行号 | 内容 |
|------|------|------|
| `packages/opencode/src/session/session.ts` | 542-546 | `Session.get()` — SQLite 查询 |
| `packages/opencode/src/session/session.ts` | 669-691 | `Session.create()` — 创建新 session |
| `packages/opencode/src/session/message-v2.ts` | 469-490 | `stream()` — 分页加载全部消息 |
| `packages/opencode/src/session/message-v2.ts` | 521-572 | `filterCompacted()` — Compaction 重排序 |
| `packages/opencode/src/session/compaction.ts` | 32 | `DEFAULT_TAIL_TURNS = 2` |
| `packages/opencode/src/session/compaction.ts` | 33-34 | Token 保留预算常量 |
| `packages/opencode/src/session/message-v2.ts` | 131-415 | `toModelMessagesEffect()` — 转换为 LLM 输入 |

### 12.5 工具注册与审查相关

| 文件 | 行号 | 内容 |
|------|------|------|
| `packages/opencode/src/tool/registry.ts` | 252-265 | Task 工具描述生成（按 agent 过滤 subagent 列表） |
| `packages/opencode/src/tool/write.ts` | 全文 | Write 工具实现 |
| `packages/opencode/src/tool/shell.ts` | 全文 | Bash 工具实现 |
| `packages/opencode/src/tool/tool.ts` | 48-53 | `ExecuteResult` 接口定义 |
| `packages/opencode/src/tool/tool.ts` | 113-145 | 工具输出截断机制 |
| `packages/opencode/src/command/template/review.txt` | 全文 | `/review` 命令模板（审查模式参考） |

### 12.6 关键常量

| 常量 | 值 | 位置 |
|------|------|------|
| `defaultID` | `"build"` | `packages/core/src/agent.ts:13` |
| 输出行数上限 | 2000 lines | `packages/opencode/src/tool/tool.ts` truncate config |
| 输出大小上限 | 50 KB | `packages/opencode/src/tool/tool.ts` truncate config |
| Compaction 保留轮数 | 2 turns | `packages/opencode/src/session/compaction.ts:32` |
| 审查轮次上限 | 5 rounds | 本方案自定义 |
| 僵持保护阈值 | 2 连续同问题 | 本方案自定义 |

---

> **文档版本**：1.0
> **最后更新**：2026-07-06
> **适用框架**：OpenCode（基于 Effect-TS）
> **实现方**：按本文档的检查清单逐项实施即可
