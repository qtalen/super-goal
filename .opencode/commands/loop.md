---
agent: loop-orch
description: 循环式开发 — 需求拆解 → 架构规划 → 逐个实现 → 验证 → 报告
---

## Plan Mode 关卡

检测系统提示：如果包含 "Plan Mode ACTIVE" 或 "READ-ONLY"：

- **允许**：STEP 1 全部（需求拆解、澄清、写 reqs-manifest.md、展示确认）
- **禁止**：STEP 2 及之后（委派 loop-worker、运行 lint/test 等有副作用的 bash）

STEP 1 完成后告知用户，等用户确认退出 Plan Mode 后才能继续 STEP 2。

---

用户需求：$ARGUMENTS

严格按照 loop-orch 工作流处理，不得跳过任何步骤。
