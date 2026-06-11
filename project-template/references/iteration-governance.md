# 迭代治理规范

> 目标：让长期迭代可恢复、可并行、可度量，并避免多份清单冲突。
> **分层披露**：本文全文只在**规划期**（`sprint-plan` 创建/重启/re-baseline Epic）加载；
> **执行期**（`sprint-develop` 各切片）只加载 [`execution-card.md`](execution-card.md)（执行卡），不重读本文。
> **机械强制**：本文的硬规则由 `.fpg/bin/fpg-check.sh` 校验（见 §11），不依赖执行线程逐条记忆。

## 0. 度量原则（instrumentation，不自报）

- **测量值（token 用量、耗时）一律由工具 hook 自动采集**，模型不估、不报、不回填；查看走遥测看板（`telemetry` 的 `GET /report`）。
- plan.md 只保留**计划与状态**：状态、证据链接、Epic/Sprint 级 Token 预算上限（熔断输入）。
- 归因：Skill 在切片开始时写项目根 `.fpg/current-task`（k=v 每行：epic/sprint/task/story/platform/skill/phase），切片结束删除；hook 自动附带到遥测事件。

## 1. 层级与编号

```text
Epic(E) -> Sprint(S) -> Task(T)
```

- Epic 按创建顺序编号 `E001`；Sprint 在所属 Epic 内编号 `S001`；Task 在所属 Sprint 内编号 `T001`。
- 目录名以编号开头：`E001-user-auth/`、`S001-login-flow/`、`T001-backend-login-api/`。
- 短编号别名：`e1`→`E001`，`e1-s2-t5`→`E001/S002/T005`。Skill 执行前先归一化再扫描目录；匹配多个候选时列出让用户确认。
- 不引入 Milestone 层级；Epic 承担阶段目标、范围、验收、跨 Sprint 汇总和 backlog 归集。

## 2. 目录结构

```text
docs/iteration/
  plan.md                  # Epic 清单
  epics/E001-epic-name/
    plan.md                # Epic 目标、终止契约、Sprint 清单
    sprints/S001-sprint-name/
      plan.md              # 计划 + Task 清单（每 Task 一行，默认不另建目录）
      worklog.md           # 本 Sprint 唯一过程日志（按 Task 分节）
      smoke-report.md      # 本 Sprint 唯一验证证据（按 Task/场景分节）
      evidence/            # 一次性证据
      tasks/T003-*/        # 例外：仅独立上下文边界且产独立证据的 Task 才建目录
```

兼容旧项目：已有 `docs/sprint-N.md` 不强行迁移；新 Sprint 用本结构，旧文件留链接。

## 3. 单一真源

每一级只维护一份 `plan.md` = 该级的计划、直接子项清单、状态真源。

- 不新增同级 `INDEX.md`；父级只记录直接子级汇总，不复制孙级明细。
- `worklog.md` 只记过程，`smoke-report.md` 只记验证证据，每 Sprint 各一份（按 Task 分节）。
- 总账文件只能由协调线程更新；子线程只写自己的 Task 目录，除非被明确授权。
- 任何状态变化只写该层级唯一 `plan.md` 的对应直接下级行；下级结束时同步更新父级对应行。

## 4. plan.md 必备区块

每级 `plan.md` 必须包含：下级清单、关键路径分类、Mermaid 前序依赖图（E 级画 Sprint 关系、S 级画 Task 关系）。

下级清单统一列：

```markdown
| ID | 名称 | 分类 | 前置 | 可并行 | 状态 | 证据 |
|---|---|---|---|---|---|---|
```

- Epic `plan.md` 另含「终止契约」区块（§9）与「结构决策」一行（§10）；Sprint 清单行须有「追溯成功标准」。
- 图与清单必须表达同一组直接子级；新增/完成/延期时同步更新两者。
- 依赖图用于判断并行：无依赖或依赖已满足的节点才可并行；共享文件或共享总账时必须在清单标出冲突文件和总账负责人。

## 5. 状态

```text
未开始 → 执行中 → 已实现 → 已验证 → 已完成        （阻塞 / 搁置 为旁路）
```

| 状态 | 何时设置 |
|---|---|
| 未开始 | 规划时创建条目 |
| 执行中 | 被选中开始执行 |
| 阻塞 | 无法继续；同步 `PROGRESS.md`；外部不可得依赖标 `blocked-external`（§9） |
| 已实现 | 代码/文档完成但未独立验证 |
| 已验证 | 独立验收（QA/独立线程）通过，附证据链接 |
| 已完成 | 实现、验证、报告与父级汇总均更新（协调线程设置） |
| 搁置 | 明确移出当前 Sprint/Epic，写明原因 |

旧文档英文别名（Planned/In Progress/Blocked/Implemented/Verified/Done/Deferred）可识别；新建和回填必须用中文。

## 6. 关键路径与任务粒度

| 分类 | 含义 | 处理 |
|---|---|---|
| Must Deliver | 不完成即 Sprint 失败的核心编码/可运行交付 | 排关键路径最前；通常 1–2 个 |
| Must Verify | 证明 Must Deliver 生效的最小验证 | 合并或紧随主 Task |
| Supporting | 有帮助但不改变交付状态 | 限时处理；超预算转 Backlog |
| Backlog | 不明确、低优先级 | 不进当前 Sprint |

- **每 Sprint Task 数 ≤ 4（含验证）**；超出 = Sprint 过大或拆得过细，合并同上下文边界的 Task 或拆成两个 Sprint。固定的"每 Task 脚手架 + 上下文重载"开销不随 Task 变小而缩小。
- Task 默认是清单行不建目录；仅"独立上下文边界 + 产出需留存的独立证据"同时满足才建 `tasks/T###/`。
- 预计 < 1 小时的 smoke/schema/report/check 不立 Task，作为 Must Deliver/Must Verify 的验收步骤记入 `smoke-report.md`。
- 共同服务同一验证目标的 schema/runner/scenario/diff 合并为一个"最小闭环"Task；闭环后再拆增强项。
- 规划/拆分/目录准备的开销不超过 Sprint 预算的 10–15%；超限停止规划，进入 Must Deliver。
- 验证集中而非每 Task 重复：完整 parity/回归每 Sprint 末一次、Epic 末一次。
- token/时间吃紧时按序保留：可运行代码 > 最小验证 > 必要记录；其余转 Backlog。

## 7. 并行规则

按**可隔离的上下文**拆分，绝不按角色拆分。

- ✅ 适合：后端契约实现 ∥ 前端 mock 实现；独立平台验证；独立 schema 设计 ∥ 场景用例整理。
- ❌ 不适合：同一 Story 的实现与紧耦合测试；多线程同改 `PROGRESS.md`/同一父级 `plan.md`/同一 shared 文件；依赖未稳定接口。
- Sprint `plan.md` 写清：前置、可并行、合并点、冲突文件、总账负责人。

## 8. 验证规则

三层：①自动验证（unit/integration/typecheck/lint/契约校验）②功能验收（真实或准真实 smoke）③金标准验收（真实 prompt/payload 证据或 golden case 比对）。

- 单元测试通过 ≠ 真实可用；**mock / 结构同构 / 单测通过不单独构成 Epic DoD**（§9）。
- prompt/agent 行为类任务必须有真实场景证据或可复用 golden case 链接；evidence 必须脱敏。
- golden case 发现 unit test 未覆盖的问题 → 补测试或记录缺口。
- 独立验收线程只做验证和质疑，不复用生成者结论（生成者 ≠ 评估者）。

## 9. Epic 终止契约与执行止损闸门

> 规划解决「如何开始」，本节解决「何时停」。LLM 自治执行没有内建的「停」：面对无法跨越的障碍，它会持续产出看似合理的相邻增量（更多测试/脚手架/文档），把「动作」误当「进展」。闸门只是度量与判定，不是 stop——缺少硬性终止条件时 agent 会去「刷绿闸门」。背景案例：某 Epic 从 5 个 Sprint 失控到 27 个。

### 9.1 终止契约（Epic 创建时写入 `E###/plan.md`，不可中途放宽）

```markdown
## 终止契约（不可中途放宽）

| 项 | 内容 |
|---|---|
| Definition-of-Done | <绑定真实用户可观测结果的一句话；mock/结构同构/单测通过不可单独构成 DoD> |
| DoD 验收证据 | <哪一次真实/准真实运行、哪个命令、产出什么证据算数> |
| Sprint 预算上限 | <计划 Sprint 数>；硬上限 = 计划 × 1.2 |
| Token 预算上限 | <估计区间>；硬上限 = 上界 × 1.2（实际消耗看遥测看板，不手工记账） |
| 退出场景（必须全绿） | <构成 DoD 的真实用户流程，3–5 个> |
| 明确不做（out-of-scope） | <本 Epic 依赖但不负责证明的外部假设> |
| 外部依赖与责任人 | <最硬外部依赖（账号/环境/数据）+ 谁负责 + 截止判断点> |
```

放宽 DoD / 扩预算 / 把 out-of-scope 拉回范围，须**人类显式批准并记录原因**，不能由执行线程自决。out-of-scope 即不证明：被划为外部假设的能力，本 Epic 不得为「证明它」开 Sprint。

### 9.2 止损闸门（违反即停，升级人类）

1. **预算熔断**：实际 Sprint 数或累计 Token（看遥测看板）触及硬上限 → 自动 STOP，进人类 re-baseline：(a) 收口现有成果、剩余转新 Epic/Backlog；(b) 砍范围达成原 DoD；(c) 经批准扩预算并记录依据。三选一。
2. **外部阻塞升级**：阻塞于执行者当前无法获得的依赖（账号/环境/数据/审批）= 终态 `blocked-external` → 停 + 升级人类（附：缺什么、谁能提供、不解决的影响）。**禁止派生相邻工作**逼近它（不准为跑不了的测试造 preflight/evidence/safety gate/dry-run/分类器）。Epic 可在「该项 blocked-external + 其余 DoD 达成」前提下收口，把该项转 Backlog。
3. **范围守卫**：每个新 Sprint 必须答「它推进 Epic 哪条成功标准？」追溯不到 / 属 out-of-scope / 只是补非 DoD 的未覆盖点 → 不立项，转 Backlog。
4. **自治 stop-gate**：agent 不得自我授权 Sprint N+1；连续 2 个 Sprint 未让任一退出场景从红转绿（只产出文档/测试/脚手架）→ 强制停。
5. **闸门 no-go 归因**：内部可修（正常修复重跑）/ 外部不可得（走第 2 条，不得用「再来一个 Sprint」消化）/ 范围外（修闸门范围不是修产品）。严禁为刷绿闸门放宽契约或跳过负向场景。

### 9.3 文档体现

- `PROGRESS.md`「进行中」标注「距 DoD 还差哪些退出场景」；`blocked-external` 在「未决问题」置顶。

## 10. 结构深度闸门（规划期一次定死）

> §9 防「蔓延」（失控加 Sprint）；本节防「碎片化」（大量薄 Sprint/Task 放大固定治理开销）。两者同根：都在优化流程产物而非交付物。

1. **深度由退出场景决定**：Epic 有 ≥2 个能独立通过/失败的退出场景才设 Sprint 层；否则**扁平**（Epic plan 直接挂执行切片）。1 个 Sprint == 1 个独立退出场景（或一组必须一起验证的场景）；薄到没有独立退出场景的 Sprint 不立项、并入相邻。
2. **数量锚定**：活跃 Sprint 数 ≤ Epic 退出场景数（直接数 Epic plan 已写的退出场景，不是自由心证）；不得通过少套一层逃过 Must Verify。
3. **一次定死 + 冻结**：`sprint-plan` 创建/重启/re-baseline 时判定结构深度，写入 Epic plan「结构决策」一行（扁平 / Epic+N Sprint 及 N 锚定哪些退出场景）。执行期不重新判断；改深度 = re-baseline，须人类批准。
4. **终止契约不可省**：扁平小 plan 也要写 DoD / 预算上限 / 杀死条件。
5. **跨 Epic 拆分优先于 Sprint 增殖**：可搁置的独立交付物拆独立 Epic（只花一份 plan）；不在活跃 Epic 内增殖薄 Sprint；合并按实现轴拆出的相邻 Sprint。

## 11. 机械校验（fpg-check）

硬规则由脚本判定，不靠执行线程自觉：

```bash
bash .fpg/bin/fpg-check.sh plan-lint <plan.md>   # 结构：必备区块、清单列、状态枚举、终止契约/结构决策存在性
bash .fpg/bin/fpg-check.sh gate <epic-dir>       # 止损：Sprint 数 vs 硬上限、blocked-external 待升级项
bash .fpg/bin/fpg-check.sh budget <epic-dir>     # 预算：已用 Sprint 数 / 上限（token 消耗看遥测看板）
```

- `sprint-plan` 收尾必须对新建/更新的每级 plan.md 跑 `plan-lint`。
- `sprint-develop` 会话起步必须跑 `gate`（末行判定 STOP = 停，升级人类，见执行卡）。
- 脚本输出 `OK` / `WARN` / `STOP` 三级 + 末行总判定。**退出码二元：0 = 无 STOP（含仅 WARN，可继续）；2 = 有 STOP（必须停止）**。`WARN` 是提示、不阻断、退出码仍为 0；`STOP` 不可被执行线程绕过。
