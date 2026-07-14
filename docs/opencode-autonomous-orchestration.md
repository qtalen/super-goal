# OpenCode Autonomous Orchestration Loop · Complete Design & Implementation Document

> This document describes in detail the complete architecture, technical details, and implementation plan for the "requirement clarification → autonomous orchestration → review & remediation → process recording" fully automated development loop in OpenCode.
>
> **Target Audience**: Developers who need to replicate this mechanism in another project.
> **Prerequisites**: The target project is based on OpenCode (or a compatible agent framework) and supports slash commands, the Task tool, and custom Agents.

---

## Table of Contents

1. [Overall Architecture](#1-overall-architecture)
2. [Files to Create](#2-files-to-create)
3. [Slash Command: Routing to the Orchestrator Agent](#3-slash-command-routing-to-the-orchestrator-agent)
4. [Orchestrator Agent Design](#4-orchestrator-agent-design)
5. [Executor Subagent Design](#5-executor-subagent-design)
6. [Permission System Design](#6-permission-system-design)
7. [Task Tool: Multi-Turn Session Mechanism](#7-task-tool-multi-turn-session-mechanism)
8. [Review–Remediation Loop Protocol](#8-reviewremediation-loop-protocol)
9. [Process Recording File Design](#9-process-recording-file-design)
10. [Edge Cases & Fault Handling](#10-edge-cases--fault-handling)
11. [Implementation Checklist](#11-implementation-checklist)
12. [Appendix: Key Source Code References](#12-appendix-key-source-code-references)

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
│  Orchestrator Agent (orchestrator)                       │
│  mode: primary                                           │
│                                                          │
│  Phase 1: Requirement Clarification (user ↔ orchestrator)│
│    Understand user intent → Ask clarifying questions     │
│    → Lock down requirement checklist → User confirmation │
│                                                          │
│  Phase 2: Autonomous Execution (orchestrator ↔ worker)   │
│    Dispatch worker → Answer worker's questions           │
│    → Review → Request remediation → Loop until satisfied │
│    → Write record file → Notify user                     │
└────────────────────┬────────────────────────────────────┘
                     │ task tool (multi-turn + task_id)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Executor Subagent (worker)                              │
│  mode: subagent                                          │
│                                                          │
│  Receive task → Analyze → Raise clarifying questions     │
│  → Receive answers → Generate plan → Code               │
│  → Receive review feedback → Remediate → Report again    │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Two-Phase Workflow

```
Phase 1                          Phase 2
(User interaction)               (No interaction)
───────◄──── Requirements locked ───────▶───────◄── Task complete ────
│                                  │
User clarifies requirements       Orchestrator autonomously schedules worker
Orchestrator asks questions       Review–remediation loop
User confirms OK                  Write record file
                                  Notify user of completion
```

Phase 1 and Phase 2 are completed in the **same session**. The orchestrator internally switches behavior mode based on whether requirements have been locked.

### 1.3 Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Orchestrator mode | `primary` | Must use the task tool to spawn subagents |
| Executor mode | `subagent` | Naturally cannot recursively spawn subagents |
| Phase switching | State switch within the same session | User only needs one `/orchestrate` |
| Review method | Run actual validation tools + structural comparison | Do not rely on LLM naked-eye code review |
| Recording strategy | Final write (write once after completion) | Data source is in SQLite; the file is just a snapshot |

---

## 2. Files to Create

```
Project root/
├── .opencode/
│   ├── commands/
│   │   └── orchestrate.md          # Slash command definition
│   ├── agents/
│   │   ├── orchestrator.md         # Orchestrator agent (primary)
│   │   └── worker.md               # Executor subagent (subagent)
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
description: Orchestrated development — understand requirements, dispatch agents, review, remediate, record
---

User requirement: $ARGUMENTS

Please handle the above requirement according to your configured orchestration process.

Process summary:
1. First clarify all requirement details with the user (Phase 1)
2. After user confirmation, autonomously dispatch executor agents to complete tasks (Phase 2)
3. Review execution results and request remediation if necessary
4. After task completion, record the full process to the .opencode/logs/ directory
```

### 3.2 Routing Mechanism

The complete routing chain after user input `/orchestrate "Build a user login system"`:

```
TUI slash detection
  │
  slashHead() parse → { name: "orchestrate", arguments: "Build a user login system" }
  │
parseSlashCommand() matches "orchestrate" in the commands list
  │
submitPrompt() → runtime.queue → stream.transport
  │
POST /session/{sessionID}/command
  │
SessionPrompt.command():
  │
  ├── commands.get("orchestrate")   → Get command config
  │
  ├── agent = cmd.agent             → "orchestrator"
  │     (cmd.agent takes priority over input.agent — this is the routing)
  │
  ├── Template interpolation:
  │     $ARGUMENTS                  → "Build a user login system"
  │     !`shell_cmd`               → Execute shell and inject output
  │     @file                       → Attachment reference
  │
  ├── cmd.subtask not set
  │     → isSubtask = false
  │     → Template sent as user message directly to orchestrator agent
  │
  └── prompt({ agent: "orchestrator", parts: [template text] })
```

**Key Point**: `agent: orchestrator` causes the command to route directly to the orchestrator agent as a user message, rather than going through a subtask intermediary. This ensures the orchestrator runs as a primary agent with full task tool permissions.

### 3.3 Template Interpolation Rules

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `$ARGUMENTS` | All raw text after the command | "Build a user login system, use React" |
| `$1`, `$2` | Positional parameters (split by spaces) | `$1` = "Build a user login system" |
| `$N` (max index) | Matches all remaining parameters | `$2` when there are only two parameters = the second parameter |
| `` !`cmd` `` | Shell command execution result | `` !`git branch --show-current` `` |
| `@path` | File reference | `@src/config.ts` |

### 3.4 Why Not Use `subtask`

If `subtask: true` is set, the flow becomes:

```
/orchestrate → build agent receives template → build uses task tool to start orchestrator
→ orchestrator becomes subagent → subagent cannot use task tool (childToolDenies injects deny)
→ ❌ orchestrator cannot dispatch worker
```

Therefore, **never** set `subtask: true`. Must route directly via `agent: orchestrator`.

---

## 4. Orchestrator Agent Design

### 4.1 Agent Definition File

**File**: `.opencode/agents/orchestrator.md`

```markdown
---
mode: primary
description: Task orchestrator. Requirement clarification → dispatch executor agents → review results → request remediation → record process.
permission:
  question: allow
---

You are a **Task Orchestrator** responsible for turning a vague user requirement into high-quality implementation code.

## Core Principles

- You **do not write code directly**. You do only three things: understand requirements, review results, and manage system flow.
- All coding work is done by the worker subagent.
- You are accountable to the user — ensure the deliverables exactly match the user-confirmed requirements.

## Two-Phase Workflow

### Phase 1: Requirement Clarification (User Interaction Mode)

When receiving a user task and requirements are not yet locked:

1. Analyze user input and extract implicit requirement points
2. Proactively ask the user clarifying questions. Prioritize:
   - **Feature Scope**: What specific functionality is needed? What is explicitly NOT needed?
   - **Technical Preferences**: Is there a specified tech stack? Are there constraints?
   - **Boundary Conditions**: What counts as "done"?
3. Organize the clarified requirements into a checklist and ask the user to confirm
4. After user confirmation (reply OK / confirmed / no problem), lock the requirements and **do not ask the user again**, proceed to Phase 2

**Questioning Principles**:
- Do not ask technical questions the user cannot answer (like "JWT or session") — defer those to Phase 2 for your own decision
- Only ask about business requirement decisions
- No more than 5 questions per round
- Provide reasonable default options for quick user responses

### Phase 2: Autonomous Execution (No Interaction Mode)

After requirements are locked, execute the following loop:

```
┌─ 1. Dispatch worker ────────────────────────────────────┐
│  Use task tool to invoke the worker subagent             │
│  First invocation provides the complete requirement list │
│  Subsequent invocations resume the same worker session   │
│  via task_id                                             │
├─ 2. Answer worker's clarifying questions ───────────────┤
│  Worker may raise technical clarification questions     │
│  (e.g., database selection, directory structure, etc.)   │
│  You must answer them based on your own judgment,        │
│  do not ask the user                                    │
│  After each answer, ask worker to proceed to next step   │
├─ 3. Review worker's output ─────────────────────────────┤
│  Check item by item according to the "Review Protocol"   │
│  (see below)                                             │
├─ 4. Request remediation (if issues found) ──────────────┤
│  Construct structured feedback message, send via         │
│  task({ task_id })                                       │
│  Return to step 3 for re-review                          │
├─ 5. Task complete ──────────────────────────────────────│
│  Write record file to .opencode/logs/{date}-{slug}.md   │
│  Notify user of completion, include record file path     │
└──────────────────────────────────────────────────────────┘
```

**Autonomous Decision Scope in Phase 2**:
- Tech stack selection (when not specified)
- Code architecture and directory structure
- Third-party library choices
- Error handling strategy
- Code style and best practices

## Review Protocol

### Step 1: Check Diff

```
bash: git diff --stat     → Confirm which files were changed
bash: git diff             → Review specific changes (on first review)
```

### Step 2: Automatic Validation

```
bash: bun run typecheck     → Type errors = immediate rejection
(Adjust based on actual project commands, e.g., npm run lint, cargo check, etc.)
```

If the worker did not report running validation, the orchestrator must proactively run it once.

### Step 3: Check Against Requirements

- Compare item by item against the Phase 1 confirmed requirement checklist
- Use `read` to read the full content of key files
- Use `grep` to search whether key functions/classes exist

### Step 4: Feedback Format

If issues are found, send feedback to the worker in the following format:

```
Review Result: The following N issues need fixing; the rest passes.

Issue 1 | src/login.ts:42 | Type Error
Current: Function return type is `any`
Expected: Return type should be `Promise<LoginResult>`
Fix: Add explicit return type annotation to the function signature

Issue 2 | src/auth.ts:15-20 | Missing Input Validation
Current: email and password parameters have no validation
Expected: email must validate format, password length ≥ 8
Fix: Add validation logic at the beginning of the function

Please fix all the above issues and report completion. Do not modify any other code.
```

### Step 5: Remediation Verification

After the worker reports fixes, the orchestrator **must not** simply trust the worker's claim. Independent verification is required:

1. `git diff` → Only the expected files were changed? No other files touched?
2. `read` → Read the fixed code to confirm changes match the feedback
3. `bun run typecheck` → Types still pass
4. Re-check against requirements → Check off verified items

### Loop Termination Conditions

1. ✅ **Normal Completion**: All requirements pass + typecheck/lint all green
2. ⚠️ **Stalemate Protection**: Same issue persists for 2 consecutive rounds → Inform user of the issue and request guidance
3. ⚠️ **Round Limit**: Total review rounds reach 5 → Report unresolved issues and end

## Process Recording

After task completion, use the `write` tool to write the complete process to a file.

**File Path**: `.opencode/logs/{YYYY-MM-DD}-{task-slug}.md`

Where `task-slug` is the lowercase hyphenated form of the requirement keywords (e.g., `user-login-system`).

**Recording Format**: See the "Process Recording File Design" section. Minimum requirements include:
- Original requirement and confirmed requirement checklist
- Review rounds and discovered issues
- Final changed file list
- Verification pass evidence

## Task Tool Usage Tips

1. **First invocation**: Do not pass `task_id`, let the system auto-create a new session
2. Extract `task_id` from the returned XML: `<task id="ses_xxx..." state="completed">`
3. **All subsequent invocations**: Pass `task_id: "ses_xxx"` to resume the same session
4. Always use `subagent_type: "worker"`
5. Use **foreground mode** (default, do not set `background: true`), wait for worker to complete before reviewing
```

### 4.2 Orchestrator Permission Notes

The orchestrator is based on the `defaults` permission set (`*: allow`), additionally requiring:

```yaml
permission:
  question: allow    # Ask questions to the user in Phase 1
```

All other tools (bash, read, grep, write, task) are already automatically allowed in defaults, requiring no extra configuration.

---

## 5. Executor Subagent Design

### 5.1 Agent Definition File

**File**: `.opencode/agents/worker.md`

```markdown
---
mode: subagent
description: Executor. Receive task → Analyze & ask → Receive answers → Generate plan → Code → Receive review feedback → Remediate.
---

You are an **Executor**. Your work is assigned by the orchestrator agent, and you report to the orchestrator agent.

## Core Principles

- You are only responsible for executing the task assigned to you
- You **do not interact directly with the user** — all questions go through the orchestrator agent
- Your code must be complete, runnable, and self-checked

## Workflow

### Step 1: Analyze Task, Raise Clarifying Questions

After receiving a task, do not write any code first. Analyze ambiguities in the task and raise **technical questions** that need clarification. For example:
- Tech stack choices: database type, framework, ORM
- Architecture decisions: directory structure, module division
- Implementation details: authentication scheme, error handling patterns

**Do not ask business requirement questions** — those should have been confirmed by the orchestrator before assigning the task.

List all questions at once and wait for the orchestrator's response.

### Step 2: Generate Execution Plan

After receiving answers to your clarifying questions, generate a detailed execution plan:

```
## Execution Plan

### Files Involved
- src/auth/login.ts (new) — Login processing logic
- src/auth/register.ts (new) — Registration processing logic
- src/middleware/auth.ts (modify) — Add session middleware

### Implementation Steps
1. Create database model (src/db/models/user.ts)
2. Implement registration logic (src/auth/register.ts)
3. Implement login logic (src/auth/login.ts)
...
```

Report the execution plan and wait for the orchestrator's confirmation.

### Step 3: Code According to Plan

After receiving confirmation, begin writing code.
- Self-check syntax and types after each file
- After all files are complete, run `bun run typecheck` (or equivalent command)
- Clean up debug output (console.log, etc.)

### Step 4: Report Completion and Accept Review

After coding is complete, report in your final message:

```
Code complete.

Files involved:
- src/auth/login.ts (new, 45 lines)
- src/auth/register.ts (new, 38 lines)
- src/middleware/auth.ts (modified, +15 -3)

Self-check results:
- typecheck: passed
- Feature comparison: all requirements implemented

Awaiting review feedback.
```

**Important**: Place the summary information in your final message. The orchestrator agent can only see your last text message (the content in `<task_result>`).

### Step 5: Receive Remediation Feedback

If the orchestrator finds issues, you will receive structured feedback:

```
Review Result: The following N issues need fixing...

Issue 1 | src/login.ts:42 | Type Error
Current: ...
Expected: ...
Fix: ...
```

Fix item by item according to the feedback and then report:

```
Remediation complete.

Issue 1: Fixed — src/login.ts:42 added return type annotation
Issue 2: Fixed — Removed 2 console.log statements
Issue 3: Fixed — Added password length ≥ 8 validation

typecheck: passed
Awaiting re-review.
```

### Remediation Principles

- Only fix issues pointed out in the feedback; do not modify any other code
- Do not say "fixed" without actually making the change
- Re-run typecheck after fixes to confirm no new errors introduced
- If feedback is unclear, ask the orchestrator for more details

## Technical Constraints

- You **cannot** use the task tool (automatically blocked by the system)
- You **cannot** use the todowrite tool (automatically blocked by the system)
- You can use all regular tools: bash, read, write, edit, grep, glob, etc.
- Generated code must pass type checking or syntax validation
```

### 5.2 Worker Permission Notes

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

**The worker does not need any manual permission configuration**. The above combination is automatically achieved.

---

## 6. Permission System Design

### 6.1 Permission Evaluation Algorithm

```typescript
// Simplified representation — actually uses findLast() to find the last matching rule
function evaluate(permission, pattern, ruleset) {
  return ruleset.findLast(rule =>
    wildcard_match(permission, rule.permission) &&
    wildcard_match(pattern, rule.pattern)
  ) ?? { action: "ask" }  // No match → ask user
}
```

**Later-defined rules override earlier-defined rules**. Merge order:

```
defaults → user global config → agent own config
   first                           last (wins)
```

### 6.2 Permission Chain

```
┌────────────────────────────────────────────────────────────┐
│  orchestrator (primary)                                    │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ defaults: * = allow                                  │ │
│  │ + question: allow                                    │ │
│  │ → All tools available, including task to spawn       │ │
│  │   subagents                                          │ │
│  └──────────────────────────────────────────────────────┘ │
│                          │                                 │
│          task({ subagent_type: "worker" })                 │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ worker session                                       │ │
│  │ ┌────────────────────────────────────────────────┐   │ │
│  │ │ Inherit: parent session deny rules              │   │ │
│  │ │ Inherit: external_directory rules              │   │ │
│  │ │ Own: defaults (* = allow)                      │   │ │
│  │ │ Inject: task = deny ⛔  (childToolDenies)       │   │ │
│  │ │ Inject: todowrite = deny ⛔ (childToolDenies)   │   │ │
│  │ │                                                 │   │ │
│  │ │ Result: bash ✓ edit ✓ read ✓ grep ✓            │   │ │
│  │ │         task ✗ todowrite ✗                     │   │ │
│  │ └────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 6.3 Subagent Permission Inheritance Rules

`deriveSubagentSessionPermission()` inherits only the following from the parent session:

1. **`deny` rules** — parent can restrict child via deny (but the orchestrator has no deny rules)
2. **`external_directory` rules** — external directory access permissions

The parent's **`allow` rules are NOT inherited**. The subagent's permissions are determined by its own config.

### 6.4 Why No Additional Configuration Is Needed

- The defaults baseline `"*": "allow"` is sufficiently permissive
- `childToolDenies` automatically prevents subagent recursion (task and todowrite injected as deny)
- The natural permission combination of orchestrator and worker exactly meets the requirements: the orchestrator can do everything; the worker can do coding-related work but cannot spawn grandchild agents

---

## 7. Task Tool: Multi-Turn Session Mechanism

### 7.1 Return Value Structure

Each `task()` call returns an XML string with the following structure:

```xml
<task id="ses_a1b2c3d4..." state="completed">
  <task_result>
    [Worker's last text message]
  </task_result>
</task>
```

**Key Facts**:

| Feature | Description |
|---------|-------------|
| `task_id` | i.e. `SessionID`, extracted from the `id` attribute of the `<task>` tag |
| Output content | **Only** contains the worker's last text message |
| Status | `completed` (success) or `error` (failure) |
| Long output | Truncated when exceeding 2000 lines or 50KB; full content written to a temp file |

### 7.2 Session Resume Mechanism

Each call with `task_id`:

```
sessions.get(SessionID.make(params.task_id))
  │
  ├── Found → Reuse existing session (no parent verification)
  └── Not found → Create new session (task_id ignored, behavior same as first call)
```

Post-resume processing:

```
MessageID.ascending()          → Generate new unique message ID
MessageV2.filterCompacted()    → Load full message history from SQLite
toModelMessages()              → Convert to LLM-readable format
LLM invocation                 → Worker sees complete history + new prompt
```

### 7.3 Lifecycle Characteristics

| Characteristic | Description |
|----------------|-------------|
| Persistence | Sessions and all messages are permanently stored in SQLite |
| No expiration | Sessions are not automatically deleted or expired |
| No dedup | Each call generates a new MessageID; repeated calls append rather than deduplicate |
| Process safety | Everything can be restored from SQLite after a process restart |
| Context management | Compaction automatically summarizes old turns, preserving recent ~2 turns in full |

### 7.4 How the Orchestrator Uses It

**First invocation** (create new worker session):

```
Orchestrator: task({
  subagent_type: "worker",
  description: "Implement user login system",
  prompt: "Requirements:\n1. Email + password registration\n2. ...\n\nPlease first analyze the task and ask questions"
})

Returns:
<task id="ses_w1x2y3z4..." state="completed">
  <task_result>
    I've analyzed the requirements and have the following questions:
    1. What database to use?
    2. Frontend framework?
    3. ...
  </task_result>
</task>
```

The orchestrator extracts `task_id = "ses_w1x2y3z4..."` from the XML.

**Subsequent invocation** (resume the same worker session):

```
Orchestrator: task({
  task_id: "ses_w1x2y3z4...",
  subagent_type: "worker",
  description: "Answer worker questions",
  prompt: "Answers to your questions:\n1. Use SQLite + Drizzle ORM\n2. No frontend needed\n...\n\nNow generate the execution plan."
})
```

The worker's LLM will see Round 1's question messages + Round 2's answer messages, with context fully continued.

### 7.5 Context Growth and Compaction

As rounds increase, the worker's context continuously grows:

```
Round  Worker Context Content
─────────────────────────────
1     [Requirements + Questions]
2     [All of round 1] + [Answers]
3     [All of round 2] + [Plan + Code]
4     [All of round 3] + [Review feedback + Fixes]
5     [All of round 4] + [Second round of fixes]
...
N     [Compaction triggered] → Old rounds replaced by summaries, preserving recent ~2 rounds in full
```

Compaction parameters:
- `DEFAULT_TAIL_TURNS = 2` (keep last 2 full rounds)
- `MIN_PRESERVE_RECENT = 2000` tokens
- `MAX_PRESERVE_RECENT = 8000` tokens

No manual management needed from the orchestrator.

### 7.6 Foreground Mode vs Background Mode

| Mode | Orchestrator Behavior | Use Case |
|------|----------------------|----------|
| **Foreground** (default) | Blocks and waits for worker completion | Orchestrator needs to review results before proceeding |
| **Background** (`background: true`) | Immediately returns "running", async notification upon completion | Orchestrator needs to do other things simultaneously |

**This solution uses foreground mode throughout**. Because the orchestrator must review after every worker round.

---

## 8. Review–Remediation Loop Protocol

### 8.1 Review Pipeline

After each worker round returns, the orchestrator **must** execute in order:

```
 Step 1: Check diff
   bash: git diff --stat    → Confirm which files were changed
   bash: git diff            → Review specific changes (on first review or when in doubt)

 Step 2: Automatic validation
   bash: bun run typecheck   → Type errors = immediate rejection
   (Adjust command based on project package.json scripts)

 Step 3: Check against requirements
   read → Read key files
   grep → Search whether key functions/patterns exist
   Compare item by item against Phase 1 confirmed requirement checklist

 Step 4: Issues found → Generate structured feedback
 Step 5: No issues found → Review passed, end loop
```

### 8.2 Feedback Format Specification

When sending review feedback to the worker, use the following format:

```
Review Result: The following N issues need fixing; the rest passes.

Issue 1 | src/login.ts:42 | Type Error
Current: Function return type is `any`
Expected: Return type should be `Promise<LoginResult>`
Fix: Add explicit return type annotation to the function signature

Issue 2 | src/auth.ts:15-20 | Missing Input Validation
Current: email and password parameters have no validation
Expected: email must validate format, password length ≥ 8
Fix: Add Zod schema validation at the beginning of the function

Issue 3 | Global | Debug Code Residuals
Current: src/login.ts:15, src/auth.ts:8 have console.log
Fix: Remove all debug output

Please fix all the above issues and report completion. Do not modify any other code.
```

**Format Requirements**:
- `Issue N | File:LineNumber | Issue Type` — triplet for easy worker location
- Three-part description: `Current` → `Expected` → `Fix` — eliminates ambiguity
- `Do not modify any other code` — prevents over-fixing

### 8.3 Remediation Verification

After the worker reports fixes, the orchestrator **must not** merely trust the worker's claim. Independent verification is required:

```
Verification steps:
1. bash: git diff --stat    → Confirm only expected files were changed
2. bash: git diff            → Review actual changes, confirm they match feedback
3. read                      → Read fixed code to confirm
4. bash: bun run typecheck    → Confirm types still pass
5. Check against requirements item by item → Check off verified items
```

### 8.4 Three Key Risk Scenarios and Handling

| Scenario | How the Orchestrator Detects It | Handling |
|----------|-------------------------------|----------|
| Worker says fixed but didn't actually fix | `git diff --stat` shows no change in that file | Reject, clearly state: "You claimed to fix Issue X, but git diff shows no changes in src/login.ts. Please actually apply the changes." |
| Worker fixed A but accidentally changed B | `git diff --stat` shows additional files modified | Add new issue: "You modified src/config.ts, but the review did not request modifications to this file. Please revert that change." |
| Worker doesn't understand the feedback direction | Fixed code doesn't match feedback description | Explain differently, provide more specific code example: "In src/login.ts line 42, change `function login` to `async function login(...): Promise<LoginResult>`" |

### 8.5 Loop Termination Conditions

```
Defense Line 1 (Normal Completion):
  ✅ All requirement items pass comparison check
  ✅ typecheck / lint all green
  ✅ git diff confirms changes are reasonable
  → Enter final recording stage

Defense Line 2 (Stalemate Protection):
  ⚠️ Same issue persists for 2 consecutive rounds
  → No longer send to worker; orchestrator informs user of the specific issue and requests guidance

Defense Line 3 (Round Limit):
  ⚠️ Total review rounds reach 5
  → Report unresolved issues; task marked as partially complete
```

---

## 9. Process Recording File Design

### 9.1 File Location and Naming

```
.opencode/logs/{YYYY-MM-DD}-{task-slug}.md
```

Example: `.opencode/logs/2026-07-06-user-login-system.md`

### 9.2 Write Timing

**Final Write Strategy**: After Phase 2 is fully complete and review has passed, write the complete file in one shot using the `write` tool.

Rationale:
- The session's complete messages are already persisted in SQLite (recoverable via `opencode export`)
- The file is just a human-readable snapshot
- Avoids fragmentation issues of incremental writing

### 9.3 Record Content Tiers

| Tier | Content | Required |
|------|---------|----------|
| **Tier 1** | Original requirement, confirmed requirement checklist, final change list, verification results | ✅ Required |
| **Tier 2** | Phase 1 Q&A record, issues found and feedback in each review round, remediation results | ✅ Default included |
| **Tier 3** | Worker complete plan, technical decision rationale, token usage | Optional |

### 9.4 File Template

After task completion, the orchestrator uses the `write` tool to write a file in the following format:

```markdown
# Task: {Short requirement description}

| Item | Value |
|------|-------|
| Date | {YYYY-MM-DD HH:MM} |
| Orchestration session | {orchestrator_session_id} |
| Execution session | {worker_session_id} |
| Status | Complete |
| Review rounds | {N} |
| Token usage | ~{total_tokens} |

---

## Requirement Confirmation

> Original user input: "{User input}"

### Clarification Process

**Q**: {Orchestrator's question 1}
**A**: {User's answer 1}

**Q**: {Orchestrator's question 2}
**A**: {User's answer 2}

### Confirmed Requirement Checklist

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
| 1 | src/login.ts:42 | Return type is any | ✅ Fixed |
| 2 | src/login.ts:15, src/auth.ts:8 | console.log residuals | ✅ Fixed |
| 3 | src/auth.ts:15-20 | Missing password length validation | ✅ Fixed |

→ Feedback sent, worker entered remediation

### Review #2 — All Passed

- [x] typecheck passed
- [x] All requirements implemented
- [x] Code quality meets expectations

---

## Final Changes

```
{Output of git diff --stat}
```

Example:
```
 src/auth.ts    |  28 +++++++++
 src/db.ts      |  67 +++++++++++++++++++++ (new)
 src/login.ts   |  45 ++++++++++----
 3 files changed, 120 insertions(+), 20 deletions(-)
```

---

## Verification Results

- [x] `bun run typecheck` → 0 errors
- [x] All requirements verified item by item
- [x] No unresolved issues
- [x] No extraneous file modifications
```

---

## 10. Edge Cases & Fault Handling

### 10.1 User Interaction Exceptions

| Scenario | Orchestrator Behavior |
|----------|----------------------|
| User disappears mid-Phase 1 | Session is persisted in SQLite; can resume from breakpoint after recovery |
| User says "not correct" to requirement checklist | Return to Phase 1 for further clarification until user is satisfied |
| User inserts a message during Phase 2 | Orchestrator should ignore or pause, but under current architecture Phase 2 does not expect user intervention. If user interrupts, orchestrator should determine whether it affects requirements and decide whether to return to Phase 1 |

### 10.2 Worker Exceptions

| Scenario | Orchestrator Behavior |
|----------|----------------------|
| Worker returns `<task ... state="error">` | Read error information, determine whether to retry in a different way. If temporary error (e.g., network timeout), retry. If logical error (e.g., worker cannot understand the requirement), modify prompt and retry |
| Worker returns the same error consecutively | Reach stalemate protection threshold (same issue for 2 consecutive rounds), inform user and request guidance |
| Worker's task_id session lost | `sessions.get()` returns `undefined`; system auto-creates a new session. Orchestrator should include complete requirements and context in the new session |
| Worker output truncated | Truncation marker indicates the output file path. Orchestrator uses `read` to query full output before continuing processing |

### 10.3 Orchestrator Self Exceptions

| Scenario | Behavior |
|----------|----------|
| Orchestrator process crash | All messages in SQLite. After restart, all conversations can be restored via session ID. Worker session's task_id can be extracted from historical messages |
| API rate limiting | Retry mechanism handled by underlying SDK. Orchestrator does not need to handle this itself |
| Context too long | Compaction auto-triggered |

### 10.4 Tool Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| Worker can only see the last text message | Worker's earlier output may be lost | Worker must summarize all key information in the final message |
| `write` tool does not append | Cannot incrementally write record file | Use final write strategy |
| `git diff` depends on git repo | Non-git projects cannot use git diff | Use `bash: dir /s /b` + `read` for manual comparison |

### 10.5 Token Cost & Performance

| Phase | Cost Profile | Optimization Suggestion |
|-------|-------------|------------------------|
| Phase 1 | Low (simple conversation) | None |
| Phase 2 Round 1 | Medium (worker understands task + asks questions) | Provide complete requirements in one shot |
| Phase 2 Review rounds | Depends on code volume | Each time only have worker focus on fixing, not a full redo |
| Recording write | Low | None |

---

## 11. Implementation Checklist

### File Creation

- [ ] `.opencode/commands/orchestrate.md` — Slash command, routes to orchestrator
- [ ] `.opencode/agents/orchestrator.md` — Orchestrator agent definition (primary)
- [ ] `.opencode/agents/worker.md` — Executor subagent definition (subagent)

### Orchestrator Prompt Key Elements

- [ ] Two-phase mode switching logic (Phase 1 requirement clarification → Phase 2 autonomous execution)
- [ ] Phase 1 questioning strategy (no more than 5 questions, only ask business decisions)
- [ ] Phase 2 autonomous decision scope (tech selection, architecture, library choices)
- [ ] Review protocol (git diff → typecheck → check against requirements → structured feedback → verify fixes)
- [ ] Feedback message format specification (Issue N | File:LineNumber | Type | Current → Expected → Fix)
- [ ] Loop termination conditions (all pass / stalemate 2 rounds / max 5 rounds)
- [ ] Process recording template
- [ ] Task tool usage instructions (no task_id on first call, pass task_id on subsequent calls)

### Worker Prompt Key Elements

- [ ] Five-step workflow (analyze & ask → generate plan → code → report → accept remediation)
- [ ] Only ask technical questions, not business questions
- [ ] Final message must summarize (because orchestrator can only see the last text message)
- [ ] During remediation, only fix issues pointed out in feedback
- [ ] Must self-check after coding (typecheck / lint)

### Permission Verification

- [ ] Orchestrator can normally use the task tool (primary mode + defaults *: allow)
- [ ] Orchestrator can normally use the question tool (explicit allow)
- [ ] Worker cannot use the task tool (childToolDenies auto-block)
- [ ] Worker cannot use the todowrite tool (childToolDenies auto-block)
- [ ] Worker can normally use bash, edit, write, read, grep, glob

### Integration Tests

- [ ] `/orchestrate` command is recognized by the TUI
- [ ] Command correctly routes to the orchestrator agent
- [ ] Phase 1 conversation proceeds normally; enters Phase 2 after user confirmation
- [ ] Orchestrator creates a new session on first worker call
- [ ] Orchestrator correctly extracts task_id from XML
- [ ] Orchestrator uses task_id to resume the same worker session
- [ ] Orchestrator correctly runs git diff + typecheck
- [ ] Orchestrator correctly constructs structured feedback
- [ ] Worker correctly receives feedback and remediates
- [ ] Orchestrator correctly verifies remediation
- [ ] Orchestrator correctly writes the record file under .opencode/logs/
- [ ] Orchestrator reports to the user after task completion

---

## 12. Appendix: Key Source Code References

### 12.1 Slash Command Routing

| File | Line(s) | Content |
|------|---------|---------|
| `packages/core/src/v1/config/command.ts` | 5-12 | `ConfigCommandV1.Info` schema (template, agent, model, subtask, etc. fields) |
| `packages/opencode/src/command/index.ts` | 66-153 | `Command.Service` implementation, aggregates four command sources (built-in, JSON, MCP, Skill) |
| `packages/opencode/src/session/prompt.ts` | 1417-1542 | `SessionPrompt.command()` — core command execution logic |
| `packages/opencode/src/session/prompt.ts` | 1437-1456 | Template interpolation implementation (`$ARGUMENTS`, `$1`, `$2`) |
| `packages/opencode/src/session/prompt.ts` | 1500-1512 | `isSubtask` decision logic |
| `packages/opencode/src/cli/cmd/run/footer.prompt.tsx` | 142-157 | `slashHead()` — TUI slash command parsing |

### 12.2 Task Tool

| File | Line(s) | Content |
|------|---------|---------|
| `packages/opencode/src/tool/task.ts` | 64-79 | `renderOutput()` — Task return value XML format |
| `packages/opencode/src/tool/task.ts` | 121-123 | Session reuse lookup logic |
| `packages/opencode/src/tool/task.ts` | 129-141 | `childToolDenies` injection (task + todowrite deny) |
| `packages/opencode/src/tool/task.ts` | 186-200 | `runTask()` — generates new MessageID per call |
| `packages/opencode/src/tool/task.ts` | 303-333 | Foreground task completion return value construction |
| `packages/opencode/src/tool/task.ts` | 274-294 | Background task return value |
| `packages/opencode/src/tool/task.txt` | Full text | Task tool LLM description |

### 12.3 Permission System

| File | Line(s) | Content |
|------|---------|---------|
| `packages/opencode/src/agent/subagent-permissions.ts` | 1-27 | `deriveSubagentSessionPermission()` |
| `packages/opencode/src/permission/index.ts` | 39-49 | `evaluate()` — findLast evaluation algorithm |
| `packages/opencode/src/permission/index.ts` | 197-209 | `fromConfig()` — config to ruleset conversion |
| `packages/opencode/src/permission/index.ts` | 211-213 | `merge()` — flattening merge |
| `packages/opencode/src/agent/agent.ts` | 117-134 | `defaults` baseline permission set |
| `packages/opencode/src/agent/agent.ts` | 139-153 | `build` agent permission config |
| `packages/opencode/src/agent/agent.ts` | 180-193 | `general` subagent permission config |
| `packages/opencode/src/agent/agent.ts` | 265-292 | Agent config merge logic |

### 12.4 Session Lifecycle

| File | Line(s) | Content |
|------|---------|---------|
| `packages/opencode/src/session/session.ts` | 542-546 | `Session.get()` — SQLite query |
| `packages/opencode/src/session/session.ts` | 669-691 | `Session.create()` — create new session |
| `packages/opencode/src/session/message-v2.ts` | 469-490 | `stream()` — paginated loading of all messages |
| `packages/opencode/src/session/message-v2.ts` | 521-572 | `filterCompacted()` — compaction reordering |
| `packages/opencode/src/session/compaction.ts` | 32 | `DEFAULT_TAIL_TURNS = 2` |
| `packages/opencode/src/session/compaction.ts` | 33-34 | Token retention budget constants |
| `packages/opencode/src/session/message-v2.ts` | 131-415 | `toModelMessagesEffect()` — convert to LLM input |

### 12.5 Tool Registration and Review Related

| File | Line(s) | Content |
|------|---------|---------|
| `packages/opencode/src/tool/registry.ts` | 252-265 | Task tool description generation (filter subagent list by agent) |
| `packages/opencode/src/tool/write.ts` | Full text | Write tool implementation |
| `packages/opencode/src/tool/shell.ts` | Full text | Bash tool implementation |
| `packages/opencode/src/tool/tool.ts` | 48-53 | `ExecuteResult` interface definition |
| `packages/opencode/src/tool/tool.ts` | 113-145 | Tool output truncation mechanism |
| `packages/opencode/src/command/template/review.txt` | Full text | `/review` command template (review mode reference) |

### 12.6 Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| `defaultID` | `"build"` | `packages/core/src/agent.ts:13` |
| Output line limit | 2000 lines | `packages/opencode/src/tool/tool.ts` truncate config |
| Output size limit | 50 KB | `packages/opencode/src/tool/tool.ts` truncate config |
| Compaction retained rounds | 2 turns | `packages/opencode/src/session/compaction.ts:32` |
| Review round limit | 5 rounds | Custom for this solution |
| Stalemate protection threshold | 2 consecutive same issues | Custom for this solution |

---

> **Document Version**: 1.0
> **Last Updated**: 2026-07-06
> **Applicable Framework**: OpenCode (based on Effect-TS)
> **For Implementors**: Follow the checklist in this document and implement item by item
