# OpenCode Autonomous Orchestration Loop · Complete Design & Implementation Document

> This document describes in detail the complete architecture, technical details, and implementation plan for implementing a fully automated development loop of "requirement clarification → autonomous orchestration → review & rectification → process recording" in OpenCode.
>
> **Target audience**: Developers who need to replicate this mechanism in another project.
> **Prerequisites**: The target project is based on OpenCode (or a compatible agent framework) and supports slash commands, Task tool, and custom Agents.

---

## Table of Contents

1. [Overall Architecture](#1-总体架构)
2. [Files to Create](#2-需要创建的文件)
3. [Slash Command: Routing to the Orchestration Agent](#3-斜杠命令路由到编排智能体)
4. [Orchestrator Agent Design](#4-编排智能体设计)
5. [Worker Subagent Design](#5-执行子智能体设计)
6. [Permission System Design](#6-权限体系设计)
7. [Task Tool: Multi-turn Session Mechanism](#7-task-工具多轮会话机制)
8. [Review-Rectification Loop Protocol](#8-审查整改循环协议)
9. [Process Record File Design](#9-过程记录文件设计)
10. [Edge Cases and Fault Handling](#10-边界条件与故障处理)
11. [Implementation Checklist](#11-实现检查清单)
12. [Appendix: Key Source Code References](#12-附录关键源码引用)

---

## 1. Overall Architecture

### 1.1 Role Definitions

```
┌─────────────────────────────────────────────────────────┐
│  User                                                    │
│  /orchestrate "Build a user login system"                │
└────────────────────┬────────────────────────────────────┘
                     │ Slash command routing
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Orchestrator Agent                                     │
│  mode: primary                                           │
│                                                          │
│  Phase 1: Requirement Clarification (user ↔ orchestrator)│
│    Understand user intent → Ask clarifying questions →   │
│    Lock requirements list → User confirmation            │
│                                                          │
│  Phase 2: Autonomous Execution (orchestrator ↔ worker)   │
│    Dispatch worker → Answer worker questions → Review →  │
│    Request rectification → Loop until satisfied →        │
│    Write record file → Notify user                       │
└────────────────────┬────────────────────────────────────┘
                     │ task tool (multi-turn + task_id)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Worker Subagent                                         │
│  mode: subagent                                          │
│                                                          │
│  Receive task → Analyze → Ask clarifying questions →     │
│  Receive answers → Generate plan → Code → Receive review │
│  feedback → Rectify → Report again                       │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Two-Phase Flow

```
Phase 1                          Phase 2
(User Interaction)                (No Interaction)
───────◄─────── Requirements Locked ───────▶───────◄──── Task Complete ────
│                                  │
User clarifies requirements        Orchestrator autonomously schedules worker
Orchestrator asks questions        Review-rectification loop
User confirms OK                   Write record file
                                   Notify user of completion
```

Phase 1 and Phase 2 are completed in **the same session**. The orchestrator internally switches behavior mode based on whether requirements have been locked.

### 1.3 Key Architecture Decisions

| Decision | Choice | Reason |
|------|------|------|
| Orchestrator mode | `primary` | Must use task tool to spawn subagents |
| Worker mode | `subagent` | Cannot recursively spawn subagents by nature |
| Phase switching | State switch within same session | User only needs one `/orchestrate` |
| Review method | Run actual validation tools + structural comparison | Does not rely on LLM bare-eye code review |
| Recording strategy | Final write (one-time write after completion) | Data source is in SQLite, file is just a snapshot |

---

## 2. Files to Create

```
Project root/
├── .opencode/
│   ├── commands/
│   │   └── orchestrate.md          # Slash command definition
│   ├── agents/
│   │   ├── orchestrator.md         # Orchestrator agent (primary)
│   │   └── worker.md               # Worker subagent (subagent)
│   └── logs/                       # Process record output directory (auto-created)
│       └── {date}-{slug}.md
```

Three files constitute the complete system. No source code modification needed.

---

## 3. Slash Command: Routing to the Orchestration Agent

### 3.1 Command Definition File

**File**: `.opencode/commands/orchestrate.md`

```markdown
---
agent: orchestrator
description: Orchestrated development — understand requirements, dispatch agents, review, rectify, record
---

User requirements: $ARGUMENTS

Please follow the orchestration workflow you are configured with to process the above requirements.

Workflow summary:
1. First clarify all requirement details with the user (Phase 1)
2. After user confirmation, autonomously dispatch the worker agent to complete the task (Phase 2)
3. Review execution results, request rectification if necessary
4. After task completion, record the full process in .opencode/logs/
```

### 3.2 Routing Mechanism

The complete routing chain after the user enters `/orchestrate "Build a user login system"`:

```
TUI slash detection
  │
  slashHead() parses → { name: "orchestrate", arguments: "Build a user login system" }
  │
parseSlashCommand() matches "orchestrate" in commands list
  │
submitPrompt() → runtime.queue → stream.transport
  │
POST /session/{sessionID}/command
  │
SessionPrompt.command():
  │
  ├── commands.get("orchestrate")   → Gets command configuration
  │
  ├── agent = cmd.agent             → "orchestrator"
  │     (cmd.agent takes priority over input.agent, this is the routing)
  │
  ├── Template interpolation:
  │     $ARGUMENTS                  → "Build a user login system"
  │     !`shell_cmd`               → Execute shell and inject output
  │     @file                       → File attachment reference
  │
  ├── cmd.subtask not set
  │     → isSubtask = false
  │     → Template is sent directly as user message to orchestrator agent
  │
  └── prompt({ agent: "orchestrator", parts: [template text] })
```

**Key point**: `agent: orchestrator` routes the command directly to the orchestration agent as a user message, rather than going through a subtask intermediary. This ensures the orchestrator runs as a primary agent with full task tool permissions.

### 3.3 Template Interpolation Rules

| Placeholder | Meaning | Example |
|--------|------|------|
| `$ARGUMENTS` | All raw text after the command | "Build a user login system using React" |
| `$1`, `$2` | Positional parameters (split by space) | `$1` = "Build a user login system" |
| `$N` (highest number) | Matches all remaining parameters | `$2` when there are only two params = second parameter |
| `` !`cmd` `` | Shell command execution result | `` !`git branch --show-current` `` |
| `@path` | File reference | `@src/config.ts` |

### 3.4 Why Not Use `subtask`

If `subtask: true` is set, the flow becomes:

```
/orchestrate → build agent receives template → build uses task tool to start orchestrator
→ orchestrator becomes subagent → subagent cannot use task tool (denied by childToolDenies)
→ ❌ orchestrator cannot dispatch worker
```

Therefore, **`subtask: true` must never be set**. Routing must be done directly via `agent: orchestrator`.

---

## 4. Orchestrator Agent Design

### 4.1 Agent Definition File

**File**: `.opencode/agents/orchestrator.md`

```markdown
---
mode: primary
description: Task orchestrator. Requirement clarification → dispatch worker agent → review results → request rectification → record process.
permission:
  question: allow
---

You are a **task orchestrator** responsible for transforming a vague user requirement into high-quality implementation code.

## Core Principles

- You **do not write code directly**. You only do three things: understand requirements, review results, and manage system workflow.
- All coding work is done by the worker subagent.
- You are accountable to the user — ensure the deliverable is fully consistent with the requirements confirmed by the user.

## Two-Phase Workflow

### Phase 1: Requirement Clarification (User Interaction Mode)

When receiving a user task and requirements are not yet locked:

1. Analyze user input, extract implicit requirement points
2. Proactively ask the user clarifying questions. Prioritize by:
   - **Functional scope**: What functionality is specifically needed? What is explicitly not needed?
   - **Technical preferences**: Is there a designated tech stack? Are there constraints?
   - **Boundary conditions**: What counts as "done"?
3. Organize the clarified requirements into a checklist and ask the user to confirm
4. After user confirmation (reply OK / confirmed / no problem), lock requirements, **stop asking the user questions**, and enter Phase 2

**Questioning principles**:
- Do not ask users questions they cannot answer (e.g., "JWT or session") — leave such questions for Phase 2 where you decide yourself
- Only ask decisions related to business requirements
- No more than 5 questions per round
- Provide reasonable default options for quick user responses

### Phase 2: Autonomous Execution (No Interaction Mode)

After requirements are locked, execute according to the following loop:

```
┌─ 1. Dispatch worker ───────────────────────────────────────┐
│  Use the task tool to call the worker subagent              │
│  First call provides the complete requirements checklist    │
│  Subsequent calls use task_id to resume the same worker     │
│  session                                                    │
├─ 2. Answer worker's clarifying questions ───────────────────┤
│  Worker may ask technical clarification questions           │
│  (e.g., database selection, directory structure, etc.)      │
│  Answer directly based on your own judgment, do not ask     │
│  the user again                                             │
│  After each answer, ask the worker to proceed to next step  │
├─ 3. Review worker output ───────────────────────────────────┤
│  Check each item according to the "Review Protocol" (see    │
│  below)                                                     │
├─ 4. Request rectification (if issues found) ────────────────┤
│  Construct structured feedback message, send via            │
│  task({ task_id })                                          │
│  Go back to step 3 for re-review                            │
├─ 5. Task complete ──────────────────────────────────────────┤
│  Write record file to .opencode/logs/{date}-{slug}.md       │
│  Notify user the task is complete, include record file path │
└─────────────────────────────────────────────────────────────┘
```

**Scope of autonomous decision-making in Phase 2**:
- Tech stack selection (when not specified)
- Code architecture and directory structure
- Third-party library selection
- Error handling strategy
- Code style and best practices

## Review Protocol

### Step 1: Check Diff

```
bash: git diff --stat     → Confirm which files were changed
bash: git diff             → Check specific changes (on first review)
```

### Step 2: Automated Validation

```
bash: bun run typecheck     → Type errors = immediate rejection
(Adjust according to actual project commands, e.g., npm run lint, cargo check, etc.)
```

If the worker did not report running validation, the orchestrator must actively run it once.

### Step 3: Check Against Requirements

- Check each item against the requirements checklist confirmed in Phase 1
- Use `read` to read the complete content of key files
- Use `grep` to search for key functions/classes

### Step 4: Feedback Format

If issues are found, send feedback to the worker in the following format:

```
Review Results: The following N issues need to be fixed, the rest pass.

Issue 1 | src/login.ts:42 | Type Error
Current: Function return type is `any`
Expected: Return type should be `Promise<LoginResult>`
Fix: Add explicit return type annotation to the function signature

Issue 2 | src/auth.ts:15-20 | Missing Input Validation
Current: email and password parameters have no validation
Expected: email needs format validation, password length ≥ 8
Fix: Add validation logic at the beginning of the function

Please fix all the above issues and report completion. Do not modify any other code.
```

### Step 5: Rectification Verification

After the worker reports fixes, independent verification is required:

1. `git diff` → Only the intended files were changed? No other files touched?
2. `read` → Read the fixed code, confirm changes match reality
3. `bun run typecheck` → Types still pass
4. Re-check against requirements → Tick off each item

### Loop Termination Conditions

1. ✅ **Normal completion**: All requirements pass + typecheck/lint all green
2. ⚠️ **Stalemate protection**: Same issue appears for 2 consecutive rounds → Inform the user of the issue and request guidance
3. ⚠️ **Round limit**: Total review rounds reach 5 → Report unresolved issues and end

## Process Recording

After task completion, use the `write` tool to write the full process to a file.

**File path**: `.opencode/logs/{YYYY-MM-DD}-{task-slug}.md`

Where `task-slug` is the lowercase-hyphenated form of the requirement keywords (e.g., `user-login-system`).

**Record format**: See the "Process Record File Design" section. Minimum requirements include:
- Original requirements and confirmed requirements checklist
- Review rounds and issues found
- Final list of changed files
- Evidence of validation passing

## Task Tool Usage Guidelines

1. **First call**: Do not pass `task_id`, let the system auto-create a new session
2. Extract `task_id` from the returned XML: `<task id="ses_xxx..." state="completed">`
3. **All subsequent calls**: Pass `task_id: "ses_xxx"` to resume the same session
4. Always use `subagent_type: "worker"`
5. Use **foreground mode** (default, do not set `background: true`), wait for worker completion before reviewing
```

### 4.2 Orchestrator Permission Notes

The orchestrator is based on the `defaults` permission set (`*: allow`), with additional requirement:

```yaml
permission:
  question: allow    # Ask the user questions in Phase 1
```

All other tools (bash, read, grep, write, task) are already allowed by defaults, no additional configuration needed.

---

## 5. Worker Subagent Design

### 5.1 Agent Definition File

**File**: `.opencode/agents/worker.md`

```markdown
---
mode: subagent
description: Executor. Receive task → analyze & ask → receive answers → generate plan → code → receive review feedback → rectify.
---

You are an **executor**. Your work is assigned by the orchestration agent, and you report to the orchestration agent.

## Core Principles

- You are only responsible for executing the tasks assigned to you
- You **do not interact directly with the user** — all questions go through the orchestration agent
- Your code must be complete, runnable, and self-checked

## Workflow

### Step 1: Analyze Task, Ask Clarifying Questions

Upon receiving a task, do not write any code yet. Analyze ambiguities in the task and raise **technical questions** that need clarification. For example:
- Tech stack selection: database type, framework, ORM
- Architecture decisions: directory structure, module division
- Implementation details: authentication scheme, error handling patterns

**Do not ask business requirement questions** — those should have been confirmed by the orchestration agent before assigning the task.

List all questions at once and wait for the orchestration agent to reply.

### Step 2: Generate Execution Plan

After receiving answers to clarifying questions, generate a detailed execution plan:

```
## Execution Plan

### Files Involved
- src/auth/login.ts (new) — Login handling logic
- src/auth/register.ts (new) — Registration handling logic
- src/middleware/auth.ts (modified) — Add session middleware

### Implementation Steps
1. Create database model (src/db/models/user.ts)
2. Implement registration logic (src/auth/register.ts)
3. Implement login logic (src/auth/login.ts)
...
```

Report the execution plan and wait for the orchestration agent to confirm.

### Step 3: Code According to Plan

After receiving confirmation, start writing code.
- After completing each file, self-check syntax and types
- After all files are complete, run `bun run typecheck` (or equivalent command)
- Clean up debug output (console.log, etc.)

### Step 4: Report Completion and Accept Review

After coding is complete, report in your last message:

```
Code completed.

Files involved:
- src/auth/login.ts (new, 45 lines)
- src/auth/register.ts (new, 38 lines)
- src/middleware/auth.ts (modified, +15 -3)

Self-check results:
- typecheck: Passed
- Functional check: All requirements implemented

Waiting for review feedback.
```

**Important**: Place summary information in the last message. The orchestration agent can only see your last text message (content inside `<task_result>`).

### Step 5: Receive Rectification Feedback

If the orchestration agent finds issues, you will receive structured feedback:

```
Review Results: The following N issues need to be fixed...

Issue 1 | src/login.ts:42 | Type Error
Current: ...
Expected: ...
Fix: ...
```

Fix each issue according to the feedback and then report:

```
Rectification complete.

Issue 1: Fixed — src/login.ts:42 added return type annotation
Issue 2: Fixed — Removed 2 console.log statements
Issue 3: Fixed — Added password length ≥ 8 validation

typecheck: Passed
Waiting for re-review.
```

### Rectification Principles

- Only fix issues pointed out in the feedback, do not modify any other code
- Do not claim "fixed" without actually making changes
- After fixing, re-run typecheck to confirm no new errors were introduced
- If feedback is unclear, ask the orchestration agent for more details

## Technical Constraints

- You **cannot** use the task tool (system-enforced)
- You **cannot** use the todowrite tool (system-enforced)
- You can use bash, read, write, edit, grep, glob, and all other standard tools
- Code must pass type checking or syntax validation after generation
```

### 5.2 Worker Permission Notes

The worker is based on the `defaults` permission set (`*: allow`), with the following restrictions automatically injected by the system:

| Tool | Status | Source |
|------|------|------|
| `task` | ❌ deny | `childToolDenies` injection |
| `todowrite` | ❌ deny | `childToolDenies` injection |
| `bash` | ✅ allow | defaults |
| `edit` | ✅ allow | defaults |
| `write` | ✅ allow | defaults |
| `read` | ✅ allow | defaults |
| `grep` | ✅ allow | defaults |
| `glob` | ✅ allow | defaults |

**The worker does not need any manual permission configuration.** The above combination is achieved automatically.

---

## 6. Permission System Design

### 6.1 Permission Evaluation Algorithm

```typescript
// Simplified representation — actually uses findLast() to find the last matching rule
function evaluate(permission, pattern, ruleset) {
  return ruleset.findLast(rule =>
    wildcard_match(permission, rule.permission) &&
    wildcard_match(pattern, rule.pattern)
  ) ?? { action: "ask" }  // No match → ask the user
}
```

**Later-defined rules override earlier ones.** Merge order:

```
defaults → user global config → agent own config
    first                       last (wins)
```

### 6.2 Permission Chain

```
┌────────────────────────────────────────────────────────────┐
│  orchestrator (primary)                                    │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ defaults: * = allow                                  │ │
│  │ + question: allow                                    │ │
│  │ → All tools available, including task to spawn        │ │
│  │   subagents                                           │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│          task({ subagent_type: "worker" })                 │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ worker session                                       │ │
│  │ ┌────────────────────────────────────────────────┐   │ │
│  │ │ Inherits: parent session's deny rules           │   │ │
│  │ │ Inherits: external_directory rules              │   │ │
│  │ │ Own: defaults (* = allow)                       │   │ │
│  │ │ Injected: task = deny ⛔  (childToolDenies)       │   │ │
│  │ │ Injected: todowrite = deny ⛔ (childToolDenies)   │   │ │
│  │ │                                                 │   │ │
│  │ │ Result: bash ✓ edit ✓ read ✓ grep ✓             │   │ │
│  │ │        task ✗ todowrite ✗                       │   │ │
│  │ └────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 6.3 Subagent Permission Inheritance Rules

`deriveSubagentSessionPermission()` only inherits from the parent session:

1. **`deny` rules** — Parent can restrict child via deny (but orchestrator has no deny rules)
2. **`external_directory` rules** — External directory access permissions

The parent's **`allow` rules are not inherited**. The subagent's permissions are determined by its own config.

### 6.4 Why No Additional Configuration Is Needed

- The default baseline `"*": "allow"` is broad enough
- `childToolDenies` automatically prevents subagent recursion (task and todowrite injected as deny)
- The natural permission combinations of orchestrator and worker perfectly meet requirements: the orchestrator can do everything, the worker can do coding-related tasks but cannot spawn further subagents

---

## 7. Task Tool: Multi-turn Session Mechanism

### 7.1 Return Value Structure

Each `task()` call returns an XML string with the following structure:

```xml
<task id="ses_a1b2c3d4..." state="completed">
  <task_result>
    [Worker's last text message]
  </task_result>
</task>
```

**Key facts**:

| Feature | Description |
|------|------|
| `task_id` | Same as `SessionID`, extracted from the `id` attribute of the `<task>` tag |
| Output content | **Only** contains the worker's last text message |
| State | `completed` (success) or `error` (failure) |
| Long output | Truncated when exceeding 2000 lines or 50KB, full content written to temp file |

### 7.2 Session Resume Mechanism

Each call with `task_id`:

```
sessions.get(SessionID.make(params.task_id))
  │
  ├── Found → Reuse existing session (no parent validation)
  └── Not found → Create new session (task_id is ignored, behaves same as first call)
```

Processing after resume:

```
MessageID.ascending()          → Generate new unique message ID
MessageV2.filterCompacted()    → Load all historical messages from SQLite
toModelMessages()              → Convert to LLM-readable format
LLM call                       → Worker sees full history + new prompt
```

### 7.3 Lifecycle Features

| Feature | Description |
|------|------|
| Persistence | Sessions and all messages are permanently stored in SQLite |
| No expiration | Sessions are not automatically deleted or expired |
| No deduplication | Each call generates a new MessageID, repeated calls append rather than deduplicate |
| Process-safe | Everything can be recovered from SQLite after process restart |
| Context management | Compaction automatically summarizes old turns, keeping approximately the last 2 turns complete |

### 7.4 How the Orchestrator Uses It

**First call** (create new worker session):

```
Orchestrator: task({
  subagent_type: "worker",
  description: "Implement user login system",
  prompt: "Requirements:\n1. Email+password registration\n2. ...\n\nPlease analyze the task and ask questions first"
})

Returns:
<task id="ses_w1x2y3z4..." state="completed">
  <task_result>
    I have analyzed the requirements. I have the following questions:
    1. Which database to use?
    2. Frontend framework?
    3. ...
  </task_result>
</task>
```

The orchestrator extracts `task_id = "ses_w1x2y3z4..."` from the XML.

**Subsequent calls** (resume same worker session):

```
Orchestrator: task({
  task_id: "ses_w1x2y3z4...",
  subagent_type: "worker",
  description: "Answer worker questions",
  prompt: "Answers to your questions:\n1. Use SQLite + Drizzle ORM\n2. No frontend needed\n...\n\nNow generate an execution plan."
})
```

The worker's LLM will see round 1's question messages + round 2's answer messages, with complete context continuity.

### 7.5 Context Growth and Compaction

As rounds increase, the worker context will continue to grow:

```
Round  Worker Context Content
─────────────────────────────
1      [Requirements + Questions]
2      [All of 1] + [Answers]
3      [All of 2] + [Plan + Coding]
4      [All of 3] + [Review Feedback + Fixes]
5      [All of 4] + [Second Fix]
...
N      [Compaction triggered] → Old rounds replaced by summary, last ~2 rounds kept complete
```

Compaction parameters:
- `DEFAULT_TAIL_TURNS = 2` (keep last 2 rounds complete)
- `MIN_PRESERVE_RECENT = 2000` tokens
- `MAX_PRESERVE_RECENT = 8000` tokens

No manual management needed from the orchestrator.

### 7.6 Foreground Mode vs Background Mode

| Mode | Orchestrator Behavior | Use Case |
|------|-----------|---------|
| **Foreground** (default) | Blocking wait for worker completion | Orchestrator needs to review results before proceeding |
| **Background** (`background: true`) | Immediately returns "running", async notification on completion | Orchestrator needs to do other things simultaneously |

**This solution uses foreground mode throughout**. Because the orchestrator must review after each worker round.

---

## 8. Review-Rectification Loop Protocol

### 8.1 Review Pipeline

After each worker round, the orchestrator **must** execute in sequence:

```
 Step 1: Check Diff
   bash: git diff --stat    → Confirm which files were changed
   bash: git diff            → Check specific changes (first time or when in doubt)

 Step 2: Automated Validation
   bash: bun run typecheck   → Type errors = immediate rejection
   (Specific command adjusted according to project's `package.json` scripts)

 Step 3: Check Against Requirements
   read → Read key files
   grep → Search for key functions/patterns
   Check each item against the requirements checklist confirmed in Phase 1

 Step 4: Issues Found → Generate Structured Feedback
 Step 5: No Issues Found → Review Passed, End Loop
```

### 8.2 Feedback Format Specification

When sending review feedback to the worker, use the following format:

```
Review Results: The following N issues need to be fixed, the rest pass.

Issue 1 | src/login.ts:42 | Type Error
Current: Function return type is `any`
Expected: Return type should be `Promise<LoginResult>`
Fix: Add explicit return type annotation to the function signature

Issue 2 | src/auth.ts:15-20 | Missing Input Validation
Current: email and password parameters have no validation
Expected: email needs format validation, password length ≥ 8
Fix: Add Zod schema validation at the beginning of the function

Issue 3 | Global | Debug Code Leftovers
Current: src/login.ts:15, src/auth.ts:8 have console.log
Fix: Remove all debug output

Please fix all the above issues and report completion. Do not modify any other code.
```

**Format requirements**:
- `Issue N | file:line | Issue type` — Triple structure for easy worker targeting
- Three-part description: `Current` → `Expected` → `Fix` — Eliminate ambiguity
- `Do not modify any other code` — Prevent over-fixing

### 8.3 Rectification Verification

After the worker reports fixes, the orchestrator **must not** simply trust the worker's claims. Independent verification is required:

```
Verification steps:
1. bash: git diff --stat    → Confirm only expected files were changed
2. bash: git diff            → Check actual changes, confirm alignment with feedback
3. read                      → Read fixed code to confirm
4. bash: bun run typecheck    → Confirm types still pass
5. Check against requirements → Tick off verified items
```

### 8.4 Three Key Risk Scenarios and Handling

| Scenario | How the Orchestrator Discovers It | Handling |
|------|--------------|---------|
| Worker says it fixed something but didn't | `git diff --stat` shows no changes in that file | Reject, clearly state: "You claimed to fix issue X, but git diff shows src/login.ts has no changes. Please actually apply the fix." |
| Worker fixed A but accidentally changed B | `git diff --stat` shows additional files modified | Add issue: "You modified src/config.ts, but the review did not require changes to this file. Please revert that change." |
| Worker doesn't understand the feedback direction | Fixed code doesn't match feedback description | Explain differently, provide more specific code examples: "At src/login.ts line 42, change `function login` to `async function login(...): Promise<LoginResult>`" |

### 8.5 Loop Termination Conditions

```
Line 1 (Normal completion):
  ✅ All requirement items pass check
  ✅ typecheck / lint all green
  ✅ git diff confirms reasonable changes
  → Enter final recording phase

Line 2 (Stalemate protection):
  ⚠️ Same issue appears 2 rounds consecutively
  → Stop sending to worker, orchestrator informs user of the specific issue and requests guidance

Line 3 (Round limit):
  ⚠️ Total review rounds reach 5
  → Report unresolved issues, task marked as partially complete
```

---

## 9. Process Record File Design

### 9.1 File Location and Naming

```
.opencode/logs/{YYYY-MM-DD}-{task-slug}.md
```

Example: `.opencode/logs/2026-07-06-user-login-system.md`

### 9.2 Write Timing

**Final write strategy**: After Phase 2 is fully completed and review is passed, write the complete file at once using the `write` tool.

Rationale:
- The session's full messages are already persisted in SQLite (recoverable via `opencode export`)
- The file is just a human-readable snapshot
- Avoids fragmentation issues of incremental writing

### 9.3 Record Content Levels

| Level | Content | Required |
|------|------|---------|
| **Level 1** | Original requirements, confirmed requirements checklist, final change list, validation results | ✅ Required |
| **Level 2** | Phase 1 Q&A records, issues found per review round and feedback, rectification results | ✅ Included by default |
| **Level 3** | Worker's complete plan, technical decision rationale, Token usage | Optional |

### 9.4 File Template

After task completion, the orchestrator uses the `write` tool to write a file in the following format:

```markdown
# Task: {Brief requirement description}

| Item | Value |
|------|------|
| Date | {YYYY-MM-DD HH:MM} |
| Orchestration session | {orchestrator_session_id} |
| Execution session | {worker_session_id} |
| Status | Complete |
| Review rounds | {N} |
| Token usage | ~{total_tokens} |

---

## Requirements Confirmation

> User original input: "{User input}"

### Clarification Process

**Q**: {Orchestrator's question 1}
**A**: {User's answer 1}

**Q**: {Orchestrator's question 2}
**A**: {User's answer 2}

### Confirmed Requirements Checklist

1. [x] {Requirement 1}
2. [x] {Requirement 2}
3. [ ] ~~{Excluded requirement}~~ (Not needed)

---

## Execution Plan

{Worker's generated execution plan content}

---

## Technical Decisions

| Decision | Choice | Reason |
|------|------|------|
| {Decision item 1} | {Choice} | {Reason} |
| {Decision item 2} | {Choice} | {Reason} |

---

## Review History

### Review #1 — {N} Issues Found

| # | File | Issue | Status |
|---|------|------|------|
| 1 | src/login.ts:42 | Return type is any | ✅ Fixed |
| 2 | src/login.ts:15, src/auth.ts:8 | Leftover console.log | ✅ Fixed |
| 3 | src/auth.ts:15-20 | Missing password length validation | ✅ Fixed |

→ Feedback sent, worker enters rectification

### Review #2 — All Passed

- [x] typecheck passed
- [x] All requirements implemented
- [x] Code quality meets expectations

---

## Final Changes

```
{git diff --stat output}
```

Example:
```
 src/auth.ts    |  28 +++++++++
 src/db.ts      |  67 +++++++++++++++++++++ (new)
 src/login.ts   |  45 ++++++++++----
 3 files changed, 120 insertions(+), 20 deletions(-)
```

---

## Validation Results

- [x] `bun run typecheck` → 0 errors
- [x] All requirements checked and passed
- [x] No remaining issues
- [x] No extraneous file modifications
```

---

## 10. Edge Cases and Fault Handling

### 10.1 User Interaction Anomalies

| Scenario | Orchestrator Behavior |
|------|-----------|
| User disappears mid-Phase 1 | Session persisted in SQLite, can resume from breakpoint after recovery |
| User says "no" to the requirements checklist | Return to Phase 1 and continue clarifying until user is satisfied |
| User inserts a message during Phase 2 | Orchestrator should ignore or pause, but under current architecture Phase 2 does not expect user intervention. If the user interjects, the orchestrator should determine whether it affects requirements and decide whether to return to Phase 1 |

### 10.2 Worker Anomalies

| Scenario | Orchestrator Behavior |
|------|-----------|
| Worker returns `<task ... state="error">` | Read error message, determine if retry is needed with a different approach. If it's a transient error (e.g., network timeout), retry. If it's a logic error (e.g., worker misunderstood requirements), retry with modified prompt |
| Worker returns the same error consecutively | Reaches stalemate protection threshold (same issue for 2 consecutive rounds), inform user and request guidance |
| Session corresponding to worker's task_id is lost | `sessions.get()` returns `undefined`, system auto-creates new session. Orchestrator should include full requirements and context in the new session |
| Worker output is truncated | Truncation marker indicates output file path. Orchestrator uses `read` to query full output and continues processing |

### 10.3 Orchestrator Self-Anomalies

| Scenario | Behavior |
|------|------|
| Orchestrator process crashes | All messages are in SQLite. All conversations can be recovered via session ID after restart. Worker session's task_id can be extracted from historical messages |
| API rate limiting | Retry mechanism handled by underlying SDK. Orchestrator itself does not need to handle |
| Context too long | Compaction triggers automatically |

### 10.4 Tool Limitations

| Limitation | Impact | Mitigation |
|------|------|------|
| Worker can only see the last text message | Worker's earlier output may be lost | Worker must summarize all key information in the last message |
| `write` tool does not append | Cannot incrementally write record file | Use final write strategy |
| `git diff` depends on git repository | Non-git projects cannot use git diff | Use `bash: dir /s /b` + `read` for manual comparison |

### 10.5 Token Cost and Performance

| Phase | Cost Characteristics | Optimization Suggestions |
|------|---------|---------|
| Phase 1 | Low (simple conversation) | None |
| Phase 2 Round 1 | Medium (worker understands task + asks questions) | Provide complete requirements all at once |
| Phase 2 Review rounds | Depends on code volume | Each time only have worker focus on fixes rather than complete redo |
| Record writing | Low | None |

---

## 11. Implementation Checklist

### File Creation

- [ ] `.opencode/commands/orchestrate.md` — Slash command, routes to orchestrator
- [ ] `.opencode/agents/orchestrator.md` — Orchestrator agent definition (primary)
- [ ] `.opencode/agents/worker.md` — Worker subagent definition (subagent)

### Orchestrator Prompt Key Elements

- [ ] Two-phase mode switching logic (Phase 1 requirement clarification → Phase 2 autonomous execution)
- [ ] Phase 1 questioning strategy (no more than 5 questions, only ask business decisions)
- [ ] Phase 2 autonomous decision scope (technical selection, architecture, library choices)
- [ ] Review protocol (git diff → typecheck → check against requirements → structured feedback → verify fixes)
- [ ] Feedback message format specification (Issue N | file:line | type | Current → Expected → Fix)
- [ ] Loop termination conditions (all passed / stalemate 2 rounds / limit 5 rounds)
- [ ] Process record template
- [ ] Task tool usage instructions (first call without task_id, subsequent calls with task_id)

### Worker Prompt Key Elements

- [ ] Five-step workflow (analyze & ask → generate plan → code → report → accept rectification)
- [ ] Only ask technical questions, not business questions
- [ ] Last message must contain summary (because orchestrator can only see the last text message)
- [ ] During rectification, only fix issues pointed out in feedback
- [ ] Must self-check after coding (typecheck / lint)

### Permission Verification

- [ ] Orchestrator can use task tool normally (primary mode + defaults *: allow)
- [ ] Orchestrator can use question tool normally (explicit allow)
- [ ] Worker cannot use task tool (childToolDenies auto-prohibited)
- [ ] Worker cannot use todowrite tool (childToolDenies auto-prohibited)
- [ ] Worker can use bash, edit, write, read, grep, glob normally

### Integration Testing

- [ ] `/orchestrate` command is recognized by TUI
- [ ] Command correctly routes to orchestrator agent
- [ ] Phase 1 conversation proceeds normally, enters Phase 2 after user confirmation
- [ ] Orchestrator creates a new session on first worker call
- [ ] Orchestrator correctly extracts task_id from XML
- [ ] Orchestrator uses task_id to resume the same worker session
- [ ] Orchestrator correctly runs git diff + typecheck
- [ ] Orchestrator correctly constructs structured feedback
- [ ] Worker correctly receives feedback and rectifies
- [ ] Orchestrator correctly verifies rectification
- [ ] Orchestrator correctly writes record file under .opencode/logs/
- [ ] Orchestrator reports to user after task completion

---

## 12. Appendix: Key Source Code References

### 12.1 Slash Command Routing

| File | Line | Content |
|------|------|------|
| `packages/core/src/v1/config/command.ts` | 5-12 | `ConfigCommandV1.Info` schema (template, agent, model, subtask, etc.) |
| `packages/opencode/src/command/index.ts` | 66-153 | `Command.Service` implementation, aggregates four command sources (built-in, JSON, MCP, Skill) |
| `packages/opencode/src/session/prompt.ts` | 1417-1542 | `SessionPrompt.command()` — Command execution core logic |
| `packages/opencode/src/session/prompt.ts` | 1437-1456 | Template interpolation implementation (`$ARGUMENTS`, `$1`, `$2`) |
| `packages/opencode/src/session/prompt.ts` | 1500-1512 | `isSubtask` determination logic |
| `packages/opencode/src/cli/cmd/run/footer.prompt.tsx` | 142-157 | `slashHead()` — TUI slash command parsing |

### 12.2 Task Tool

| File | Line | Content |
|------|------|------|
| `packages/opencode/src/tool/task.ts` | 64-79 | `renderOutput()` — Task return value XML format |
| `packages/opencode/src/tool/task.ts` | 121-123 | Session reuse lookup logic |
| `packages/opencode/src/tool/task.ts` | 129-141 | `childToolDenies` injection (task + todowrite deny) |
| `packages/opencode/src/tool/task.ts` | 186-200 | `runTask()` — Each call generates a new MessageID |
| `packages/opencode/src/tool/task.ts` | 303-333 | Return value construction after foreground task completion |
| `packages/opencode/src/tool/task.ts` | 274-294 | Background task return value |
| `packages/opencode/src/tool/task.txt` | Full text | Task tool LLM description |

### 12.3 Permission System

| File | Line | Content |
|------|------|------|
| `packages/opencode/src/agent/subagent-permissions.ts` | 1-27 | `deriveSubagentSessionPermission()` |
| `packages/opencode/src/permission/index.ts` | 39-49 | `evaluate()` — findLast evaluation algorithm |
| `packages/opencode/src/permission/index.ts` | 197-209 | `fromConfig()` — Config to rule set conversion |
| `packages/opencode/src/permission/index.ts` | 211-213 | `merge()` — Flat merge |
| `packages/opencode/src/agent/agent.ts` | 117-134 | `defaults` baseline permission set |
| `packages/opencode/src/agent/agent.ts` | 139-153 | `build` agent permission configuration |
| `packages/opencode/src/agent/agent.ts` | 180-193 | `general` subagent permission configuration |
| `packages/opencode/src/agent/agent.ts` | 265-292 | Agent config merge logic |

### 12.4 Session Lifecycle

| File | Line | Content |
|------|------|------|
| `packages/opencode/src/session/session.ts` | 542-546 | `Session.get()` — SQLite query |
| `packages/opencode/src/session/session.ts` | 669-691 | `Session.create()` — Create new session |
| `packages/opencode/src/session/message-v2.ts` | 469-490 | `stream()` — Paginate to load all messages |
| `packages/opencode/src/session/message-v2.ts` | 521-572 | `filterCompacted()` — Compaction reordering |
| `packages/opencode/src/session/compaction.ts` | 32 | `DEFAULT_TAIL_TURNS = 2` |
| `packages/opencode/src/session/compaction.ts` | 33-34 | Token retention budget constants |
| `packages/opencode/src/session/message-v2.ts` | 131-415 | `toModelMessagesEffect()` — Convert to LLM input |

### 12.5 Tool Registration and Review Related

| File | Line | Content |
|------|------|------|
| `packages/opencode/src/tool/registry.ts` | 252-265 | Task tool description generation (filter subagent list by agent) |
| `packages/opencode/src/tool/write.ts` | Full text | Write tool implementation |
| `packages/opencode/src/tool/shell.ts` | Full text | Bash tool implementation |
| `packages/opencode/src/tool/tool.ts` | 48-53 | `ExecuteResult` interface definition |
| `packages/opencode/src/tool/tool.ts` | 113-145 | Tool output truncation mechanism |
| `packages/opencode/src/command/template/review.txt` | Full text | `/review` command template (review mode reference) |

### 12.6 Key Constants

| Constant | Value | Location |
|------|------|------|
| `defaultID` | `"build"` | `packages/core/src/agent.ts:13` |
| Output line limit | 2000 lines | `packages/opencode/src/tool/tool.ts` truncate config |
| Output size limit | 50 KB | `packages/opencode/src/tool/tool.ts` truncate config |
| Compaction retention turns | 2 turns | `packages/opencode/src/session/compaction.ts:32` |
| Review round limit | 5 rounds | Custom for this solution |
| Stalemate protection threshold | 2 consecutive same issue | Custom for this solution |

---

> **Document version**: 1.0
> **Last updated**: 2026-07-06
> **Applicable framework**: OpenCode (based on Effect-TS)
> **Implementation**: Follow the implementation checklist in this document item by item
