# 迭代治理规范

> 本文件用于 Sprint 规划、开发执行和 QA 验收。目标是让长期迭代可恢复、可并行、可度量，并避免多份清单冲突。

## 1. 层级与编号

用户项目迭代层级统一为：

```text
Epic(E) -> Sprint(S) -> Task(T)
```

- Epic 按创建顺序编号：`E001`、`E002`。
- Sprint 在所属 Epic 内编号：`S001`、`S002`。
- Task 在所属 Sprint 内编号：`T001`、`T002`。
- 目录名必须以编号开头，例如 `E001-user-auth/`、`S001-login-flow/`、`T001-backend-login-api/`。
- 交互输入支持短编号别名：`e1` -> `E001`，`s2` -> `S002`，`t5` -> `T005`，组合输入 `e1-s2-t5` 定位到 `E001/S002/T005`。
- Skill 在执行前必须把短编号归一化为规范编号，并用规范编号扫描目录；如果匹配到多个目录，先列出候选项并让用户确认。
- 用户项目不单独引入 Milestone 层级；Epic 承担阶段目标、范围、验收、跨 Sprint 汇总和 backlog 归集。

## 2. 推荐目录结构

```text
docs/iteration/
  plan.md
  epics/
    E001-epic-name/
      plan.md
      sprints/
        S001-sprint-name/
          plan.md
          tasks/
            T001-task-name/
              plan.md
              worklog.md
              smoke-report.md
              evidence/
```

兼容旧项目：若项目已有 `docs/sprint-N.md`，不要强行迁移历史文件；新 Sprint 优先使用本结构，并在旧文件中留下指向新 `plan.md` 的链接。

## 3. 单一真源规则

每一级只维护一份 `plan.md`，它同时是该级的计划、直接子项清单、状态和指标真源。

| 层级 | `plan.md` 记录内容 |
|---|---|
| `docs/iteration/plan.md` | Epic 清单与 Epic 级汇总指标 |
| `E###/plan.md` | Epic 目标、范围、Sprint 清单与汇总指标 |
| `S###/plan.md` | Sprint 目标、Task 清单、依赖、并行边界、验收标准与汇总指标 |
| `T###/plan.md` | Task 目标、输入、允许/禁止修改范围、验收标准、估计 token |

规则：
- 不新增同级 `INDEX.md`。
- 父级 `plan.md` 只记录直接子级汇总，不复制孙级明细。
- `worklog.md` 只记录过程，`smoke-report.md` 只记录验证证据，状态/token/耗时汇总只回填到对应 `plan.md`。
- 总账文件只能由协调线程更新；子线程只写自己的 Task 目录，除非被明确授权。

## 4. plan.md 必备区块

每一级 `plan.md` 必须包含下级分解清单、关键路径和前序依赖图，便于启动任务时判断并行边界。

| 层级 | 必须包含的下级清单 | 依赖图 |
|---|---|---|
| `docs/iteration/plan.md` | Epic 清单：目标、状态、时间、主动/等待耗时、估计/实际 token、证据 | 可选；多个 Epic 有依赖时必须有 Epic 依赖图 |
| `E###/plan.md` | Sprint 清单：目标、关键路径分类、前置 Sprint、可并行 Sprint、估计/实际 token、证据 | 必须有 Sprint 依赖图 |
| `S###/plan.md` | Task 清单：分类、前置 Task、可并行 Task、估计/实际 token、验收产物/证据 | 必须有 Task 依赖图 |
| `T###/plan.md` | 子步骤清单：实现步骤、验证步骤、quick check、允许/禁止修改范围 | 复杂 Task 可选；有内部并行时必须有子步骤依赖图 |

下级清单必须包含状态字段，用于表示直接下级当前是否未开始、执行中、已实现、已验证、完成、阻塞或搁置：

```markdown
| ID | 名称 | 分类 | 前置 | 可并行 | 状态 | 估计Token | 实际Token | 验收/证据 |
|---|---|---|---|---|---|---|---|---|
```

依赖图使用 Mermaid：

```mermaid
flowchart LR
  T001["T001 主交付"] --> T002["T002 最小验证"]
  T001 --> T003["T003 Supporting"]
  T002 --> T004["T004 收尾回填"]
```

规则：
- E 级 plan 的依赖图只画 Sprint 关系；S 级 plan 的依赖图只画 Task 关系；T 级 plan 只画内部子步骤关系。
- 图和清单必须表达同一组直接子级；新增、完成、延期下级项时，必须同步更新对应清单和依赖图。
- 依赖图用于判断并行启动：无依赖或依赖已满足的节点才可并行；存在共享文件或共享总账时，即使图上可并行，也必须在清单中标出冲突文件和总账负责人。
- 阶段结束时必须向上回填：Task 结束更新 Sprint `plan.md`；Sprint 结束更新 Epic `plan.md`；Epic 结束更新 `docs/iteration/plan.md`。

## 5. 指标表字段

每个包含子项清单的 `plan.md` 必须包含：

```markdown
| ID | 名称 | 目标 | 状态 | 创建时间 | 开始时间 | 结束时间 | 主动耗时 | 等待耗时 | 估计Token | 实际Token | 偏差原因 | 证据 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
```

状态使用：

```text
未开始
执行中
阻塞
已实现
已验证
已完成
搁置
```

兼容旧文档时可识别英文别名：`Planned`=`未开始`，`In Progress`=`执行中`，`Blocked`=`阻塞`，`Implemented`=`已实现`，`Verified`=`已验证`，`Done`=`已完成`，`Deferred`=`搁置`。新建和回填必须使用中文状态。

启动规则：
- 创建时写入 `创建时间`、`估计Token` 和初始状态。
- 真正开始执行时写入 `开始时间`，状态改为 `执行中`。

结束规则：
- 结束时写入 `结束时间`、`主动耗时`、`等待耗时`、`实际Token`、`偏差原因`、`证据`。
- `已完成` 只表示实现、验证、报告和父级总账都已更新。
- `搁置` 必须说明为什么不进入当前 Sprint。

状态更新时机：

| 状态 | 何时设置 | 谁更新 | 必须同步的位置 |
|---|---|---|---|
| `未开始` | 规划时创建下级条目 | 规划/协调线程 | 当前层级 `plan.md` 的下级清单 |
| `执行中` | 下级条目被选中并开始执行 | 执行线程或协调线程 | 父级下级清单；写入开始时间 |
| `阻塞` | 遇到无法继续的阻塞 | 执行线程先记录，协调线程确认 | 父级下级清单、Task `worklog.md`、`PROGRESS.md` |
| `已实现` | 代码/文档已完成但未独立验证 | 执行线程 | 父级下级清单、Task `smoke-report.md` |
| `已验证` | 验收命令/smoke/golden case 通过 | QA/独立验收线程 | 父级下级清单、证据链接 |
| `已完成` | 实现、验证、报告、指标、父级汇总都完成 | 协调线程 | 当前层级和上一级 `plan.md` 汇总 |
| `搁置` | 明确移出当前 Sprint/Epic | 协调线程 | 父级下级清单、Backlog 区域、偏差原因 |

任何状态变化都必须只写该层级唯一 `plan.md` 中对应的直接下级行；不得在多个文件维护同一状态副本。下级结束时，必须同时更新自身 `plan.md` 和父级 `plan.md` 的对应行；父级汇总只聚合直接子级状态，不复制孙级明细。

Token 估算必须包含读取上下文、设计、实现、验证、失败排查和文档回填。实际 token 可先人工粗估；偏差原因用任务边界不清、验证失败、环境问题、上下文不足、需求扩大或方案变化等可分析原因描述。

## 6. 关键路径与任务粒度

Sprint 计划必须先识别交付闸门，防止验证框架、文档和过程治理抢占核心编码交付。

| 分类 | 含义 | 处理 |
|---|---|---|
| Must Deliver | 不完成即 Sprint 失败的核心编码或可运行交付 | 优先执行；独立 Task；通常 1-2 个 |
| Must Verify | 证明 Must Deliver 生效的最小验证 | 合并到主 Task 或紧随主 Task；只做关键路径验证 |
| Supporting | 有帮助但不直接改变交付状态 | 限时处理；超预算转 Backlog |
| Backlog | 不明确、低优先级或条件不成熟 | 不进入当前 Sprint 主路径 |

规则：
- Must Deliver 必须排在 Sprint 关键路径最前面，且必须包含能改变交付状态的代码或可运行产物。
- 预计 < 1 小时或 < 10k token 的 smoke、schema、report、check，不建完整 Task 目录；作为 Must Deliver/Must Verify 的验收步骤记录在 `smoke-report.md`。
- schema、runner、scenario、diff、redaction 如果共同服务同一个验证目标，优先合并为一个“金标准验证最小闭环”Task；完成最小闭环后再拆增强项。
- Sprint 计划、上下文整理和任务目录准备总 token 不应超过 Sprint 预算的 10%-15%；超限后停止规划，进入 Must Deliver。
- 执行任何 Task 前先问：它是否直接推进 Must Deliver 或 Must Verify？如果不是，只能消耗固定小预算，超出立即停止并转回关键路径。
- token 或时间不足时，按顺序保留：可运行代码、最小验证、必要记录；完整文档、扩展场景、性能和治理项进入 Backlog。
- 验证框架服务于产品交付，不能用“验证框架完成”替代“产品能力可用”。

## 7. Task 文档

每个 Task 至少包含：

```text
plan.md
worklog.md
smoke-report.md
evidence/
```

`T###/plan.md` 至少包含：
- 任务目标。
- 前置条件。
- 输入产物。
- 允许修改范围。
- 禁止修改范围。
- 验收标准。
- 关联文档链接。
- 估计 token。

`worklog.md` 记录时间顺序、命令和关键输出摘要、遇到的问题、临时判断、未解决风险。

`smoke-report.md` 记录 pass/fail/blocked、实际验证命令、关键证据、是否需要升级为代码修复、实际 token、偏差原因。

`evidence/` 只保存本 Task 的一次性验收证据，例如日志、截图、命令输出摘要、脱敏请求/响应样例和临时报告。可复用测试 fixture、golden case、验证脚本、自动化资产不放在 `docs/iteration/` 下，应放到项目的 `tests/fixtures/`、`tests/golden/`、`scripts/` 或约定的测试目录，并在 `smoke-report.md` 中链接。

## 8. 并行任务规则

并行拆分按上下文边界，不按角色机械拆分。

适合并行：
- Desktop smoke 与 Cloud smoke。
- 后端契约实现与前端 mock 实现。
- 独立平台验证。
- 独立 schema 设计与场景用例整理。

不适合并行：
- 同一 Story 的实现和依赖实现细节的紧耦合测试。
- 多个线程同时修改 `PROGRESS.md`、`docs/iteration/plan.md` 或同一个父级 `plan.md`。
- 多个线程同时改同一个 shared runtime 文件。
- 一个任务依赖另一个任务尚未稳定的接口。

Sprint 的 `plan.md` 必须写清前置任务、可并行任务、合并点、共享产物、冲突文件和总账负责人。

## 9. 验证规则

验证分三层：

1. 自动验证：unit、integration、typecheck、lint、OpenAPI/契约校验。
2. 功能验收：真实或准真实场景 smoke。
3. 金标准验收：真实 prompt/payload/response 证据或 golden case 与预期行为比对。

规则：
- 单元测试通过不等于真实可用。
- prompt 或 agent 行为类任务必须有真实场景证据或指向可复用 golden case 的链接。
- evidence 必须脱敏。
- 若 golden case 发现 unit test 未覆盖的问题，必须补测试或记录测试缺口。
- 独立验收线程只做验证和质疑，不复用生成者结论。
- **mock / 结构同构 / 单测通过是必要条件，显式声明不足以单独构成 Epic 的 Definition-of-Done**（见 §10）。

## 10. Epic 终止契约与执行止损闸门

> 规划解决「如何开始」，本节解决「何时停」。详见 `epic-termination-contract.md`（始终随本规范加载）。
> 动机：自治/长程执行没有内建的「停」；缺少硬性终止条件时，agent 会用「产出相邻增量」替代「完成目标」，导致 Epic 永不收口的反刍循环。

强制规则（违反即停，升级人类）：

1. **终止契约前置**：每个 Epic 在 `sprint-plan` 创建时必须在 `E###/plan.md` 写入「终止契约」区块——不可变 DoD（绑定真实用户可观测结果）、Sprint/Token 预算上限、退出场景、明确不做（out-of-scope）、最硬外部依赖与责任人。
2. **预算熔断**：实际 Sprint 数或累计 Token 触及硬上限（计划 × 1.2）自动 STOP，进人类 re-baseline，不得自行开新 Sprint。
3. **外部阻塞升级**：阻塞于执行者当前无法获得的依赖（账号/环境/数据/审批）= 终态 `blocked-external` → 停 + 升级，**禁止派生相邻工作**（不准为跑不了的测试造 preflight/evidence/safety gate/dry-run/分类器）。
4. **范围守卫**：每个新 Sprint 必须追溯到 Epic 某条成功标准；追溯不到、或属于 out-of-scope、或只是「补一个非 DoD 的未覆盖点」→ 不立项，转 Backlog。
5. **自治 stop-gate**：agent 不得自我授权 Sprint N+1；连续 N 个 Sprint（默认 2）未让任一退出场景从红转绿（只产出文档/测试/脚手架）→ 强制停。
6. **闸门 no-go 归因**：区分「内部可修 / 外部不可得 / 范围外」；外部不可得不得用「再来一个 Sprint」消化；严禁为刷绿闸门放宽契约或跳过负向场景。
