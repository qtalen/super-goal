# OpenCode Autonomous Orchestration Loop · Complete Design & Implementation Document

> This document describes in detail the complete architecture, technical details, and implementation plan for a fully automated development loop encompassing "requirements clarification → autonomous orchestration → review & remediation → process recording" within OpenCode.
>
> **Target audience**: Developers who need to replicate this mechanism in another project.
> **Prerequisites**: The target project is based on OpenCode (or a compatible agent framework) and supports slash commands, Task tool, and custom Agent.

---

## Table of Contents

1. [Overall Architecture](#1-overall-architecture)
2. [Files to Create](#2-files-to-create)
3. [Slash Command: Routing to the Orchestrator Agent](#3-slash-command-routing-to-the-orchestrator-agent)
4. [Orchestrator Agent Design](#4-orchestrator-agent-design)
5. [Worker Subagent Design](#5-worker-subagent-design)
6. [Permission System Design](#6-permission-system-design)
7. [Task Tool: Multi-Round Session Mechanism](#7-task-tool-multi-round-session-mechanism)
8. [Review-Remediation Loop Protocol](#8-review-remediation-loop-protocol)
9. [Process Record File Design](#9-process-record-file-design)
10. [Edge Cases and Failure Handling](#10-edge-cases-and-failure-handling)
11. [Implementation Checklist](#11-implementation-checklist)
12. [Appendix: Key Source Code References](#12-appendix-key-source-code-references)

---

## 1. Overall Architecture

### 1.1 Role Definitions

```
┌─────────────────────────────────────────────────────────┐
│  User                                                   │
│  /orchestrate "Build a user login system"               │
└────────────────────┬────────────────────────────────────┘
                     │ Slash command routing
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Orchestrator Agent                                     │
│  mode: primary                                          │
│                                                         │
│  Phase 1: Requirements Clarification (user ↔ orchestrator)
│    Understand user intent → Ask clarifying questions → Lock requirements → User confirms │
│                                                         │
│  Phase 2: Autonomous Execution (orchestrator ↔ worker)  │
│    Dispatch worker → Answer worker questions → Review → Request fixes
│    → Loop until satisfied → Write record file → Notify user
└────────────────────┬────────────────────────────────────┘
                     │ task tool (multi-round + task_id)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Worker Subagent                                        │
│  mode: subagent                                         │
│                                                         │
│  Receive task → Analyze → Ask clarifying questions → Receive answers → Generate plan
│  → Code → Receive review feedback → Fix → Report again  │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Two-Phase Flow

```
Phase 1                          Phase 2
(User interaction)                (No interaction)
───────◄──────── Requirements locked ───────▶───────◄──── Task complete ────
│                                  │
User clarifies requirements       Orchestrator autonomously dispatches worker
Orchestrator asks questions       Review-remediation loop
User confirms OK                  Write record file
                                  Notify user of completion
```

Phase 1 and Phase 2 are completed in **the same session**. The orchestrator switches behavior mode internally based on whether requirements are locked.

### 1.3 Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|----------|
| Orchestrator mode | `primary` | Must use task tool to spawn subagents |
| Worker mode | `subagent` | Cannot recursively spawn subagents by design |
| Phase switch | State switch within same session | User only needs one `/orchestrate` |
| Review method | Run actual validation tools + structural comparison | Does not rely on LLM bare-eye code review |
| Recording strategy | Write-once (single write after completion) | Data source is in SQLite; file is just a snapshot |

---

## 2. Files to Create

```
Project Root/
├── .opencode/
│   ├── commands/
│   │   └── orchestrate.md          # Slash command definition
│   ├── agents/
│   │   ├── orchestrator.md         # Orchestrator agent (primary)
│   │   └── worker.md               # Worker subagent (subagent)
│   └── logs/                       # Process record output directory (auto-created)
│       └── {date}-{slug}.md
```

Three files constitute the complete system. No source code modifications are needed.

---

## 3. Slash Command: Routing to the Orchestrator Agent

### 3.1 Command Definition File

**File**: `.opencode/commands/orchestrate.md`

```markdown
---
agent: orchestrator
description: Orchestrated development — understand requirements, dispatch agent, review, fix, record
---

User requirements: $ARGUMENTS

Please follow the orchestrated workflow you have been configured with to process the above requirements.

Process summary:
1. First clarify all requirement details with the user (Phase 1)
2. After user confirmation, autonomously dispatch the execution agent to complete the task (Phase 2)
3. Review execution results, request fixes when necessary
4. After task completion, record the full process in .opencode/logs/
```

### 3.2 Routing Mechanism

The full routing chain after the user types `/orchestrate "Build a user login system"`:

```
TUI slash detection
  │
  slashHead() parses → { name: "orchestrate", arguments: "Build a user login system" }
  │
parseSlashCommand() matches "orchestrate" in the commands list
  │
submitPrompt() → runtime.queue → stream.transport
  │
POST /session/{sessionID}/command
  │
SessionPrompt.command():
  │
  ├── commands.get("orchestrate")   → gets command config
  │
  ├── agent = cmd.agent             → "orchestrator"
  │     (cmd.agent takes priority over input.agent; this is the routing)
  │
  ├── Template interpolation:
  │     $ARGUMENTS                  → "Build a user login system"
  │     !`shell_cmd`               → execute shell and inject output
  │     @file                       → file attachment reference
  │
  ├── cmd.subtask not set
  │     → isSubtask = false
  │     → Template is sent directly to the orchestrator agent as a user message
  │
  └── prompt({ agent: "orchestrator", parts: [template text] })
```

**Key point**: `agent: orchestrator` routes the command directly to the orchestrator agent as a user message, rather than going through a subtask intermediary. This ensures the orchestrator runs as a primary agent with full task tool permissions.

### 3.3 Template Interpolation Rules

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `$ARGUMENTS` | Full raw text after the command | "Build a user login system with React" |
| `$1`, `$2` | Positional parameters (split by spaces) | `$1` = "Build a user login system" |
| `$N` (highest number) | Matches all remaining parameters | `$2` when there are only two params = second param |
| `` !`cmd` `` | Shell command execution result | `` !`git branch --show-current` `` |
| `@path` | File reference | `@src/config.ts` |

### 3.4 Why Not Use `subtask`

If `subtask: true` is set, the flow becomes:

```
/orchestrate → build agent receives template → build uses task tool to launch orchestrator
→ orchestrator becomes a subagent → subagent cannot use task tool (denied by childToolDenies)
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
description: Task orchestrator. Requirements clarification → dispatch execution agent → review results → request fixes → record process.
permission:
  question: allow
---

You are a **task orchestrator**, responsible for transforming a vague user requirement into high-quality implementation code.

## Core Principles

- You **do not write code directly**. You only do three things: understand requirements, review results, and manage system workflow.
- All coding work is done by the worker subagent.
- You are accountable to the user — ensure the deliverable matches the user-confirmed requirements exactly.

## Two-Phase Workflow

### Phase 1: Requirements Clarification (User Interaction Mode)

When a user task is received and requirements are not yet locked:

1. Analyze the user input and extract implicit requirements
2. Proactively ask the user clarifying questions, prioritized by:
   - **Functional scope**: What specific features are needed? What is explicitly not needed?
   - **Technical preferences**: Any specified tech stack? Any constraints?
   - **Boundary conditions**: What counts as "done"?
3. Organize the clarified requirements into a checklist and request user confirmation
4. After user confirms (replies OK / confirmed / no problem), lock requirements, **stop asking the user questions**, and enter Phase 2

**Questioning principles**:
- Do not ask users technical questions they cannot answer (e.g., "JWT or session?") — leave these decisions for Phase 2 where you decide yourself
- Only ask questions related to business requirements
- No more than 5 questions per round
- Provide reasonable default options to facilitate quick user responses

### Phase 2: Autonomous Execution (No-Interaction Mode)

After requirements are locked, execute the following loop:

```
┌─ 1. Dispatch worker ─────────────────────────────────────┐
│  Use the task tool to invoke the worker subagent          │
│  Provide the full requirements checklist on first call    │
│  Resume the same worker session on subsequent calls using task_id
├─ 2. Answer worker's clarifying questions ────────────────┤
│  The worker may ask technical clarification questions     │
│  (e.g., database selection, directory structure, etc.)   │
│  Answer directly based on your own judgment — do not ask the user
│  After each answer, ask the worker to proceed to the next step
├─ 3. Review worker output ────────────────────────────────┤
│  Check item by item according to the "Review Protocol"    │
├─ 4. Request fixes (if issues found) ─────────────────────┤
│  Construct structured feedback and send via task({ task_id })
│  Go back to step 3 for re-review                          │
├─ 5. Task complete ───────────────────────────────────────┤
│  Write record file to .opencode/logs/{date}-{slug}.md    │
│  Notify the user of completion, including the record file path
└──────────────────────────────────────────────────────────┘
```

**Scope of autonomous decisions in Phase 2**:
- Technology stack selection (when not specified)
- Code architecture and directory structure
- Third-party library choices
- Error handling strategy
- Code style and best practices

## Review Protocol

### Step 1: Inspect Diff

```
bash: git diff --stat     → confirm which files were changed
bash: git diff             → inspect specific changes (on first review)
```

### Step 2: Automated Validation

```
bash: bun run typecheck     → type errors = immediate rejection
(adjust based on actual project commands, e.g., npm run lint, cargo check, etc.)
```

If the worker has not reported running validation, the orchestrator must actively run it once.

### Step 3: Requirements Checklist Review

- Check each item against the requirements checklist confirmed in Phase 1
- Use `read` to read the full content of key files
- Use `grep` to search for key functions/classes

### Step 4: Feedback Format

If issues are found, send feedback to the worker using the following format:

```
Review Results: The following N issues need to be fixed. The rest pass.

Issue 1 | src/login.ts:42 | Type error
Current: function return type is `any`
Expected: return type should be `Promise<LoginResult>`
Fix: add explicit return type annotation to the function signature

Issue 2 | src/auth.ts:15-20 | Missing input validation
Current: email and password parameters are not validated
Expected: email format validation required, password length ≥ 8
Fix: add validation logic at the beginning of the function

Please fix all the above issues and report completion. Do not modify any other code.
```

### Step 5: Fix Verification

After the worker reports fixes, verification must be performed independently:

1. `git diff` → only the expected files were changed? No other files touched?
2. `read` → read the fixed code, confirm the changes match expectations
3. `bun run typecheck` → types still pass
4. Re-check requirements checklist → cross off items one by one

### Loop Termination Conditions

1. ✅ **Normal end**: All requirements pass + typecheck/lint all green
2. ⚠️ **Stalemate protection**: Same issue appears for 2 consecutive rounds → inform the user of the issue and request guidance
3. ⚠️ **Round limit**: Total review rounds reach 5 → report unresolved issues and end

## Process Recording

After task completion, use the `write` tool to record the full process in a file.

**File path**: `.opencode/logs/{YYYY-MM-DD}-{task-slug}.md`

Where `task-slug` is the lowercase-hyphenated form of the requirement keywords (e.g., `user-login-system`).

**Record format**: See the "Process Record File Design" section. Minimum requirements:
- Original requirements and the confirmed requirements checklist
- Review rounds and issues found
- List of files ultimately changed
- Evidence of validation passing

## Task Tool Usage Guidelines

1. **First call** does not pass `task_id`, letting the system auto-create a new session
2. Extract `task_id` from the returned XML: `<task id="ses_xxx..." state="completed">`
3. **All subsequent calls** pass `task_id: "ses_xxx"` to resume the same session
4. Always use `subagent_type: "worker"`
5. Use **foreground mode** (default, do not set `background: true`), wait for worker to finish then review
```

### 4.2 Orchestrator Permission Details

The orchestrator is based on the `defaults` permission set (`*: allow`), with the additional requirement:

```yaml
permission:
  question: allow    # Ask the user in Phase 1
```

All other tools (bash, read, grep, write, task) are already allowed by default and require no extra configuration.

---

## 5. Worker Subagent Design

### 5.1 Agent Definition File

**File**: `.opencode/agents/worker.md`

```markdown
---
mode: subagent
description: Executor. Receive task → analyze and ask questions → receive answers → generate plan → code → receive review feedback → fix.
---

You are an **executor**. Your work is assigned by the orchestrator agent, and you report to the orchestrator agent.

## Core Principles

- You are only responsible for executing the tasks assigned to you
- You **do not interact directly with the user** — all questions are relayed through the orchestrator agent
- Your code must be complete, runnable, and self-verified

## Workflow

### Step 1: Analyze Task, Ask Clarifying Questions

Upon receiving a task, do not write any code yet. Analyze the ambiguities in the task and ask **technical questions** that need clarification. For example:
- Technology stack choices: database type, framework, ORM
- Architecture decisions: directory structure, module partitioning
- Implementation details: authentication scheme, error handling patterns

**Do not ask business requirement questions** — those should have been confirmed by the orchestrator agent before task assignment.

List all questions at once and wait for the orchestrator agent's reply.

### Step 2: Generate Execution Plan

After receiving answers to clarification questions, generate a detailed execution plan:

```
## Execution Plan

### Files Involved
- src/auth/login.py (new) — login handling logic
- src/auth/register.py (new) — registration handling logic
- src/middleware/auth.py (modify) — add session middleware

### Implementation Steps
1. Create database models (src/db/models/user.py)
2. Implement registration logic (src/auth/register.py)
3. Implement login logic (src/auth/login.py)
...
```

Report the execution plan and wait for orchestrator confirmation.

### Step 3: Code According to Plan

After receiving confirmation, begin writing code.
- After completing each file, self-check syntax and types
- After completing everything, run `bun run typecheck` (or equivalent command)
- Clean up debug output (console.log, etc.)

### Step 4: Report Completion and Accept Review

After coding is complete, report in your last message:

```
Code complete.

Files involved:
- src/auth/login.py (new, 45 lines)
- src/auth/register.py (new, 38 lines)
- src/middleware/auth.py (modified, +15 -3)

Self-check results:
- typecheck: passed
- Requirements checklist: all requirements implemented

Waiting for review feedback.
```

**Important**: Put the summary in the last message. The orchestrator agent can only see your last text message (content within `<task_result>`).

### Step 5: Receive Fix Feedback

If the orchestrator agent finds issues, you will receive structured feedback:

```
Review Results: The following N issues need to be fixed...

Issue 1 | src/login.py:42 | Type error
Current: ...
Expected: ...
Fix: ...
```

Fix each issue as indicated and report:

```
Fixes complete.

Issue 1: Fixed — src/login.py:42 added return type annotation
Issue 2: Fixed — removed 2 instances of console.log
Issue 3: Fixed — added password length ≥ 8 validation

typecheck: passed
Waiting for re-review.
```

### Fix Principles

- Only fix the issues pointed out in the feedback; do not modify any other code
- Do not claim "fixed" without actually making changes
- Re-run typecheck after fixing to confirm no new errors introduced
- If feedback is unclear, ask the orchestrator agent for more details

## Technical Constraints

- You **cannot** use the task tool (automatically prohibited by the system)
- You **cannot** use the todowrite tool (automatically prohibited by the system)
- You can use bash, read, write, edit, grep, glob, and all other standard tools
- Code must pass type checking or syntax validation after generation
```

### 5.2 Worker Permission Details

The worker is based on the `defaults` permission set (`*: allow`), with the following restrictions automatically injected by the system:

| Tool | Status | Source |
|------|--------|--------|
| `task` | ❌ deny | `childToolDenies` injection |
| `todowrite` | ❌ deny | `childToolDenies` injection |
| `bash` | ✅ allow | defaults |
| `edit` | ✅ allow | defaults |
| `write` | ✅ allow | defaults |
| `read` | ✅ allow | defaults |
| `grep` | ✅ allow | defaults |
| `glob` | ✅ allow | defaults |

**The worker does not need to manually configure any permissions.** The above combinations are automatically achieved.

---

## 6. Permission System Design

### 6.1 Permission Evaluation Algorithm

```typescript
// Simplified representation — actually uses findLast() to find the last matching rule
function evaluate(permission, pattern, ruleset) {
  return ruleset.findLast(rule =>
    wildcard_match(permission, rule.permission) &&
    wildcard_match(pattern, rule.pattern)
  ) ?? { action: "ask" }  // no match → ask the user
}
```

**Later-defined rules override earlier ones.** Merge order:

```
defaults → user global config → agent's own config
   first                          last (wins)
```

### 6.2 Permission Chain

```
┌────────────────────────────────────────────────────────────┐
│  orchestrator (primary)                                    │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ defaults: * = allow                                  │ │
│  │ + question: allow                                    │ │
│  │ → All tools available, including task to spawn subagent│
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│          task({ subagent_type: "worker" })                 │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ worker session                                       │ │
│  │ ┌────────────────────────────────────────────────┐   │ │
│  │ │ Inherits: deny rules from parent session        │   │ │
│  │ │ Inherits: external_directory rules              │   │ │
│  │ │ Own: defaults (* = allow)                       │   │ │
│  │ │ Injected: task = deny ⛔  (childToolDenies)      │   │ │
│  │ │ Injected: todowrite = deny ⛔ (childToolDenies)  │   │ │
│  │ │                                                  │   │ │
│  │ │ Result: bash ✓ edit ✓ read ✓ grep ✓             │   │ │
│  │ │        task ✗ todowrite ✗                       │   │ │
│  │ └────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 6.3 Subagent Permission Inheritance Rules

`deriveSubagentSessionPermission()` only inherits from the parent session:

1. **`deny` rules** — parent can restrict child via deny (but the orchestrator has no deny rules)
2. **`external_directory` rules** — external directory access permissions

The parent's **`allow` rules are not inherited**. The subagent's permissions are determined by its own config.

### 6.4 Why No Extra Configuration Is Needed

- The `defaults` baseline `"*": "allow"` is permissive enough
- `childToolDenies` automatically prevents subagent recursion (task and todowrite injected as deny)
- The natural permission combination of orchestrator and worker perfectly meets the requirements: the orchestrator can do everything, and the worker can do coding-related tasks but cannot spawn further subagents

---

## 7. Task Tool: Multi-Round Session Mechanism

### 7.1 Return Value Structure

Each `task()` call returns an XML string with the following structure:

```xml
<task id="ses_a1b2c3d4..." state="completed">
  <task_result>
    [worker's last text message]
  </task_result>
</task>
```

**Key facts**:

| Feature | Description |
|---------|-------------|
| `task_id` | This is the `SessionID`, extracted from the `id` attribute of the `<task>` tag |
| Output content | **Only** contains the worker's last text message |
| State | `completed` (success) or `error` (failure) |
| Long output | Truncated when exceeding 2000 lines or 50KB; full content written to a temp file |

### 7.2 Session Resume Mechanism

Each call with `task_id`:

```
sessions.get(SessionID.make(params.task_id))
  │
  ├── Found → reuse existing session (no parent validation)
  └── Not found → create new session (task_id is ignored, behaves like first call)
```

Processing after resume:

```
MessageID.ascending()          → generate new unique message ID
MessageV2.filterCompacted()    → load all historical messages from SQLite
toModelMessages()              → convert to LLM-readable format
LLM call                       → worker sees full history + new prompt
```

### 7.3 Lifecycle Characteristics

| Feature | Description |
|---------|-------------|
| Persistence | Session and all messages are permanently stored in SQLite |
| No expiration | Sessions are never automatically deleted or expired |
| No deduplication | Each call generates a new MessageID; repeated calls append rather than deduplicate |
| Process-safe | Everything can be restored from SQLite after a process restart |
| Context management | Compaction automatically summarizes older rounds, preserving the last ~2 rounds in full |

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
    I have analyzed the requirements and have the following questions:
    1. What database to use?
    2. Frontend framework?
    3. ...
  </task_result>
</task>
```

The orchestrator extracts `task_id = "ses_w1x2y3z4..."` from the XML.

**Subsequent calls** (resume the same worker session):

```
Orchestrator: task({
  task_id: "ses_w1x2y3z4...",
  subagent_type: "worker",
  description: "Answer worker questions",
  prompt: "Answers to your questions:\n1. Use SQLite + Drizzle ORM\n2. No frontend needed\n...\n\nNow generate the execution plan."
})
```

The worker's LLM will see the questions from round 1 plus the answers from round 2, with continuous context.

### 7.5 Context Growth and Compaction

As rounds increase, the worker's context continues to grow:

```
Round  Worker Context Content
─────────────────────────────
1      [Requirements + Questions]
2      [All of round 1] + [Answers]
3      [All of round 2] + [Plan + Coding]
4      [All of round 3] + [Review feedback + Fix]
5      [All of round 4] + [Second fix]
...
N      [Compaction triggered] → old rounds replaced by summaries, last ~2 rounds preserved in full
```

Compaction parameters:
- `DEFAULT_TAIL_TURNS = 2` (keep last 2 rounds in full)
- `MIN_PRESERVE_RECENT = 2000` tokens
- `MAX_PRESERVE_RECENT = 8000` tokens

No manual management by the orchestrator is needed.

### 7.6 Foreground Mode vs Background Mode

| Mode | Orchestrator Behavior | Use Case |
|------|----------------------|----------|
| **Foreground** (default) | Blocks and waits for worker to complete | Orchestrator needs to review results before proceeding |
| **Background** (`background: true`) | Immediately returns "running", async notification on completion | Orchestrator needs to do other things in parallel |

**This solution uses foreground mode throughout.** Because the orchestrator must review after each worker round.

---

## 8. Review-Remediation Loop Protocol

### 8.1 Review Pipeline

After each worker round, the orchestrator **must** execute the following in order:

```
 Step 1: Inspect Diff
   bash: git diff --stat    → confirm which files were changed
   bash: git diff            → inspect specific changes (first review or if in doubt)

 Step 2: Automated Validation
   bash: bun run typecheck   → type errors = immediate rejection
   (specific command based on project `package.json` scripts)

 Step 3: Requirements Checklist Review
   read → read key files
   grep → search for key functions/patterns
   Check each item against the requirements checklist confirmed in Phase 1

 Step 4: Issues Found → Generate Structured Feedback
 Step 5: No Issues Found → Review Passed, End Loop
```

### 8.2 Feedback Format Specification

When sending review feedback to the worker, use the following format:

```
Review Results: The following N issues need to be fixed. The rest pass.

Issue 1 | src/login.py:42 | Type error
Current: function return type is `any`
Expected: return type should be `Promise<LoginResult>`
Fix: add explicit return type annotation to the function signature

Issue 2 | src/auth.py:15-20 | Missing input validation
Current: email and password parameters are not validated
Expected: email format validation required, password length ≥ 8
Fix: add Zod schema validation at the beginning of the function

Issue 3 | Global | Debug code residue
Current: src/login.py:15, src/auth.py:8 have console.log
Fix: remove all debug output

Please fix all the above issues and report completion. Do not modify any other code.
```

**Format requirements**:
- `Issue N | File:Line | Issue Type` — triple identifier for easy worker localization
- Three-part description: `Current` → `Expected` → `Fix` — eliminates ambiguity
- `Do not modify any other code` — prevents over-fixing

### 8.3 Fix Verification

After the worker reports fixes, the orchestrator **must not** simply trust the worker's claims. It must independently verify:

```
Verification steps:
1. bash: git diff --stat    → confirm only expected files were changed
2. bash: git diff            → inspect actual changes, confirm consistency with feedback
3. read                      → read fixed code to confirm
4. bash: bun run typecheck    → confirm types still pass
5. Check requirements checklist item by item → cross off verified items
```

### 8.4 Three Key Risk Scenarios and Handling

| Scenario | How the Orchestrator Detects It | Handling |
|----------|-------------------------------|----------|
| Worker claims a fix but hasn't actually fixed it | `git diff --stat` shows no changes to that file | Reject, clearly state: "You claimed to have fixed issue X, but git diff shows no changes to src/login.py. Please actually apply the fix." |
| Worker fixed A but accidentally changed B | `git diff --stat` shows additional files modified | Add new issue: "You modified src/config.py, but the review did not require changes to this file. Please revert that change." |
| Worker doesn't understand the feedback direction | Fixed code is inconsistent with the feedback description | Explain differently, provide more specific code examples: "Please change `function login` to `async function login(...): Promise<LoginResult>` at src/login.py line 42" |

### 8.5 Loop Termination Conditions

```
Guard 1 (Normal end):
  ✅ All requirements items pass checklist review
  ✅ typecheck / lint all green
  ✅ git diff confirms changes are reasonable
  → Enter final recording stage

Guard 2 (Stalemate protection):
  ⚠️ Same issue appears for 2 consecutive rounds
  → Stop sending to worker; orchestrator informs the user of the specific issue and requests guidance

Guard 3 (Round limit):
  ⚠️ Total review rounds reach 5
  → Report unresolved issues; mark task as partially complete
```

---

## 9. Process Record File Design

### 9.1 File Location and Naming

```
.opencode/logs/{YYYY-MM-DD}-{task-slug}.md
```

Example: `.opencode/logs/2026-07-06-user-login-system.md`

### 9.2 Write Timing

**Write-once strategy**: After Phase 2 is fully complete and review passes, write the complete file in one go using the `write` tool.

Rationale:
- The session's full messages are already persisted in SQLite (recoverable via `opencode export`)
- The file is just a human-readable snapshot
- Avoids fragmentation issues from incremental writes

### 9.3 Record Content Levels

| Level | Content | Required |
|-------|---------|----------|
| **Level 1** | Original requirements, confirmed requirements checklist, final changes list, validation results | ✅ Required |
| **Level 2** | Phase 1 Q&A records, issues found and feedback per review round, fix results | ✅ Included by default |
| **Level 3** | Worker's full plan, technical decision rationale, token usage | Optional |

### 9.4 File Template

After task completion, the orchestrator uses the `write` tool to write a file in the following format:

```markdown
# Task: {Brief requirement description}

| Item | Value |
|------|-------|
| Date | {YYYY-MM-DD HH:MM} |
| Orchestrator session | {orchestrator_session_id} |
| Worker session | {worker_session_id} |
| Status | Complete |
| Review rounds | {N} |
| Token usage | ~{total_tokens} |

---

## Requirements Confirmation

> User original input: "{user input}"

### Clarification Process

**Q**: {Orchestrator question 1}
**A**: {User answer 1}

**Q**: {Orchestrator question 2}
**A**: {User answer 2}

### Confirmed Requirements Checklist

1. [x] {Requirement 1}
2. [x] {Requirement 2}
3. [ ] ~~{Excluded requirement}~~ (not needed)

---

## Execution Plan

{Worker-generated execution plan content}

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| {Decision item 1} | {Choice} | {Rationale} |
| {Decision item 2} | {Choice} | {Rationale} |

---

## Review History

### Review #1 — Found {N} Issues

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | src/login.py:42 | Return type is any | ✅ Fixed |
| 2 | src/login.py:15, src/auth.py:8 | Residual console.log | ✅ Fixed |
| 3 | src/auth.py:15-20 | Missing password length validation | ✅ Fixed |

→ Feedback sent, worker entered remediation

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
 src/auth.py    |  28 +++++++++
 src/db.py      |  67 +++++++++++++++++++++ (new)
 src/login.py   |  45 ++++++++++----
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

## 10. Edge Cases and Failure Handling

### 10.1 User Interaction Anomalies

| Scenario | Orchestrator Behavior |
|----------|----------------------|
| User disappears during Phase 1 | Session is persisted in SQLite; can resume from breakpoint after restoration |
| User says "no" to the requirements checklist | Return to Phase 1 and continue clarifying until user is satisfied |
| User interjects during Phase 2 | Orchestrator should ignore or pause, but under the current architecture Phase 2 does not expect user intervention. If the user interjects, the orchestrator should determine whether it affects the requirements and decide whether to return to Phase 1 |

### 10.2 Worker Anomalies

| Scenario | Orchestrator Behavior |
|----------|----------------------|
| Worker returns `<task ... state="error">` | Read the error message, determine whether to retry differently. If it's a transient error (e.g., network timeout), retry. If it's a logical error (e.g., worker misunderstood the requirements), retry with a modified prompt |
| Worker returns the same error consecutively | Reaches stalemate protection threshold (2 consecutive rounds with the same issue), inform the user and request guidance |
| Session corresponding to worker's task_id is lost | `sessions.get()` returns `undefined`, system auto-creates a new session. The orchestrator should include full requirements and context in the new session |
| Worker output is truncated | Truncation markers indicate the output file path. The orchestrator uses `read` to query the full output and continues processing |

### 10.3 Orchestrator Self-Anomalies

| Scenario | Behavior |
|----------|----------|
| Orchestrator process crashes | All messages are in SQLite. All conversations can be restored after restart via session ID. The worker session's task_id can be extracted from historical messages |
| API rate limiting | Retry mechanism is handled by the underlying SDK. The orchestrator itself does not need to handle this |
| Context too long | Compaction triggers automatically |

### 10.4 Tool Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Worker can only see the last text message | Early worker outputs may be lost | Worker must summarize all key information in the last message |
| `write` tool does not append | Cannot incrementally write the record file | Use write-once strategy |
| `git diff` depends on git repository | Non-git projects cannot use git diff | Use `bash: dir /s /b` + `read` for manual comparison |

### 10.5 Token Cost and Performance

| Phase | Cost Characteristics | Optimization Suggestions |
|-------|---------------------|------------------------|
| Phase 1 | Low (simple conversation) | None |
| Phase 2 Round 1 | Medium (worker understands task + asks questions) | Provide complete requirements at once |
| Phase 2 Review rounds | Depends on code volume | Each time, only ask the worker to focus on fixes, not a full redo |
| Record writing | Low | None |

---

## 11. Implementation Checklist

### File Creation

- [ ] `.opencode/commands/orchestrate.md` — Slash command, routes to orchestrator
- [ ] `.opencode/agents/orchestrator.md` — Orchestrator agent definition (primary)
- [ ] `.opencode/agents/worker.md` — Worker subagent definition (subagent)

### Orchestrator Prompt Key Elements

- [ ] Two-phase mode switching logic (Phase 1 requirements clarification → Phase 2 autonomous execution)
- [ ] Phase 1 questioning strategy (no more than 5 questions, only business decisions)
- [ ] Phase 2 autonomous decision scope (tech selection, architecture, library choices)
- [ ] Review protocol (git diff → typecheck → requirements checklist → structured feedback → fix verification)
- [ ] Feedback message format specification (Issue N | File:Line | Type | Current → Expected → Fix)
- [ ] Loop termination conditions (all passed / stalemate 2 rounds / limit 5 rounds)
- [ ] Process record template
- [ ] Task tool usage instructions (first call without task_id, subsequent calls with task_id)

### Worker Prompt Key Elements

- [ ] Five-step workflow (analyze and ask questions → generate plan → code → report → accept fixes)
- [ ] Only ask technical questions, not business questions
- [ ] Last message must be a summary (because orchestrator can only see the last text message)
- [ ] When fixing, only address issues pointed out in the feedback
- [ ] Must self-check after coding (typecheck / lint)

### Permission Verification

- [ ] Orchestrator can use the task tool normally (primary mode + defaults *: allow)
- [ ] Orchestrator can use the question tool normally (explicitly allowed)
- [ ] Worker cannot use the task tool (automatically prohibited by childToolDenies)
- [ ] Worker cannot use the todowrite tool (automatically prohibited by childToolDenies)
- [ ] Worker can use bash, edit, write, read, grep, glob normally

### Integration Tests

- [ ] `/orchestrate` command can be recognized by TUI
- [ ] Command correctly routes to orchestrator agent
- [ ] Phase 1 conversation proceeds normally, enters Phase 2 after user confirmation
- [ ] Orchestrator creates a new session on first worker call
- [ ] Orchestrator correctly extracts task_id from XML
- [ ] Orchestrator uses task_id to resume the same worker session
- [ ] Orchestrator correctly runs git diff + typecheck
- [ ] Orchestrator correctly constructs structured feedback
- [ ] Worker correctly receives feedback and makes fixes
- [ ] Orchestrator correctly verifies fixes
- [ ] Orchestrator correctly writes the record file under .opencode/logs/
- [ ] Orchestrator reports to the user after task completion

---

## 12. Appendix: Key Source Code References

### 12.1 Slash Command Routing

| File | Line | Content |
|------|------|---------|
| `packages/core/src/v1/config/command.ts` | 5-12 | `ConfigCommandV1.Info` schema (template, agent, model, subtask fields) |
| `packages/opencode/src/command/index.ts` | 66-153 | `Command.Service` implementation, aggregates four command sources (built-in, JSON, MCP, Skill) |
| `packages/opencode/src/session/prompt.ts` | 1417-1542 | `SessionPrompt.command()` — command execution core logic |
| `packages/opencode/src/session/prompt.ts` | 1437-1456 | Template interpolation implementation (`$ARGUMENTS`, `$1`, `$2`) |
| `packages/opencode/src/session/prompt.ts` | 1500-1512 | `isSubtask` judgment logic |
| `packages/opencode/src/cli/cmd/run/footer.prompt.tsx` | 142-157 | `slashHead()` — TUI slash command parsing |

### 12.2 Task Tool

| File | Line | Content |
|------|------|---------|
| `packages/opencode/src/tool/task.ts` | 64-79 | `renderOutput()` — Task return value XML format |
| `packages/opencode/src/tool/task.ts` | 121-123 | Session reuse lookup logic |
| `packages/opencode/src/tool/task.ts` | 129-141 | `childToolDenies` injection (task + todowrite deny) |
| `packages/opencode/src/tool/task.ts` | 186-200 | `runTask()` — generates new MessageID per call |
| `packages/opencode/src/tool/task.ts` | 303-333 | Foreground task return value construction |
| `packages/opencode/src/tool/task.ts` | 274-294 | Background task return value |
| `packages/opencode/src/tool/task.txt` | Full | Task tool LLM description |

### 12.3 Permission System

| File | Line | Content |
|------|------|---------|
| `packages/opencode/src/agent/subagent-permissions.ts` | 1-27 | `deriveSubagentSessionPermission()` |
| `packages/opencode/src/permission/index.ts` | 39-49 | `evaluate()` — findLast evaluation algorithm |
| `packages/opencode/src/permission/index.ts` | 197-209 | `fromConfig()` — config to rule set conversion |
| `packages/opencode/src/permission/index.ts` | 211-213 | `merge()` — flat merge |
| `packages/opencode/src/agent/agent.ts` | 117-134 | `defaults` baseline permission set |
| `packages/opencode/src/agent/agent.ts` | 139-153 | `build` agent permission configuration |
| `packages/opencode/src/agent/agent.ts` | 180-193 | `general` subagent permission configuration |
| `packages/opencode/src/agent/agent.ts` | 265-292 | Agent config merge logic |

### 12.4 Session Lifecycle

| File | Line | Content |
|------|------|---------|
| `packages/opencode/src/session/session.ts` | 542-546 | `Session.get()` — SQLite query |
| `packages/opencode/src/session/session.ts` | 669-691 | `Session.create()` — create new session |
| `packages/opencode/src/session/message-v2.ts` | 469-490 | `stream()` — paginated load of all messages |
| `packages/opencode/src/session/message-v2.ts` | 521-572 | `filterCompacted()` — Compaction reordering |
| `packages/opencode/src/session/compaction.ts` | 32 | `DEFAULT_TAIL_TURNS = 2` |
| `packages/opencode/src/session/compaction.ts` | 33-34 | Token budget constants |
| `packages/opencode/src/session/message-v2.ts` | 131-415 | `toModelMessagesEffect()` — conversion to LLM input |

### 12.5 Tool Registration and Review Related

| File | Line | Content |
|------|------|---------|
| `packages/opencode/src/tool/registry.ts` | 252-265 | Task tool description generation (filters subagent list by agent) |
| `packages/opencode/src/tool/write.ts` | Full | Write tool implementation |
| `packages/opencode/src/tool/shell.ts` | Full | Bash tool implementation |
| `packages/opencode/src/tool/tool.ts` | 48-53 | `ExecuteResult` interface definition |
| `packages/opencode/src/tool/tool.ts` | 113-145 | Tool output truncation mechanism |
| `packages/opencode/src/command/template/review.txt` | Full | `/review` command template (review mode reference) |

### 12.6 Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| `defaultID` | `"build"` | `packages/core/src/agent.ts:13` |
| Output line limit | 2000 lines | `packages/opencode/src/tool/tool.ts` truncate config |
| Output size limit | 50 KB | `packages/opencode/src/tool/tool.ts` truncate config |
| Compaction preserved rounds | 2 turns | `packages/opencode/src/session/compaction.ts:32` |
| Review round limit | 5 rounds | Custom in this solution |
| Stalemate protection threshold | 2 consecutive same issue | Custom in this solution |

---

> **Document version**: 1.0
> **Last updated**: 2026-07-06
> **Applicable framework**: OpenCode (based on Effect-TS)
> **Implementation**: Follow the checklist in this document item by item
