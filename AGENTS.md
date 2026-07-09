# AGENTS.md

## This is not a Python project

Despite the Python-flavored `.gitignore`, there is **no Python source code** here. No `pyproject.toml`, no `.py` files. This repo is an OpenCode agent configuration.

## Entry point

The `/goal` slash command routes to `goal-orch` (primary) which orchestrates:

1. Requirement decomposition → `docs/{task-slug}/reqs-manifest.md`
2. Architecture planning via `goal-worker` → `docs/{task-slug}/architecture.md`
3. Per-requirement implementation (one new `goal-worker` session per requirement)
4. Integration verification
5. Final report → `docs/{task-slug}/report.md`

## Agent boundaries

- **goal-orch** (primary): NEVER writes code. Only writes to `docs/`. Delegates all coding to `goal-worker`. Must check for "Plan Mode ACTIVE" before any writes.
- **goal-worker** (subagent): Does all coding + testing. Must include edge case tests. Must summarize all key info in final message (orch only sees last message). Cannot use `task` or `todowrite` (system-enforced).

## Task artifact convention

All outputs go under `docs/{task-slug}/` with lowercase-hyphenated slug.

## Language rule

All interactions use the same language as the user's original task.

## Plan Mode

When "Plan Mode ACTIVE" / "READ-ONLY" is in system prompt: STEP 1 only (analysis, clarification, writing reqs-manifest.md). No worker dispatch or bash.

## No runnable code

No build/lint/test commands exist. Test the goal workflow by invoking `/goal` in OpenCode.
