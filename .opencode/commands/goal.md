---
agent: goal-orch
description: Cyclic development — requirement decomposition → architecture planning → per-item implementation → verification → report
---

## Plan Mode Gate

Detect system prompt: if it contains "Plan Mode ACTIVE" or "READ-ONLY":

- **Allowed**: ALL of STEP 1 (requirement decomposition, clarification, writing reqs-manifest.md, presenting for confirmation)
- **Forbidden**: STEP 2 and beyond (delegating goal-worker, running lint/test and other bash with side effects)

After STEP 1 is complete, inform the user. Wait for the user to confirm exiting Plan Mode before proceeding to STEP 2.

---

User requirements: $ARGUMENTS

Strictly follow the goal-orch workflow, do not skip any steps.
