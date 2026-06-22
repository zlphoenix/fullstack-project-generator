# 执行卡（sprint-develop 每切片必读，全文 ≈40 行）

> 治理规范全文（`iteration-governance.md`）只在规划期加载；执行期读本卡即可。
> 硬规则由 `fpg-check` 判定——跑命令看结果，不靠记忆条文。**同一会话内本卡与平台指南只读一次。**

## 起步（动手前，顺序执行）

1. 读 `PROGRESS.md` + `git log --oneline -10` + 本 Sprint `plan.md`（含 Task 清单与依赖图）+ `api/openapi.yaml`。
2. 跑 `bash .fpg/bin/fpg-check.sh gate <epic-dir>` → **退出码 2 / 末行判定 STOP 才停止并升级人类，不得绕过**；退出码 0（含仅 WARN）可继续——**WARN 是提示不是阻断**（如 blocked-external 项只要不是本切片，继续做其他切片即可）。
3. 一句话回答：**本切片让 Epic 哪条退出场景更接近全绿？** 答不出 = 非关键路径，停。
4. 跑一次端到端冒烟（编译/启动）；失败先修或记入 `PROGRESS.md`，不在坏基线上叠代码。
5. 与用户确认本次切片（平台/上下文边界）。若多个 Task 属于同一上下文边界，先回到 Sprint `plan.md` 合并为一个 Task 行；不得用 `T003-T004` 这类组合 ID。把唯一 Task 行状态改 `执行中`。
6. 写归因标记（hook 自动采集 token/耗时，模型不记账）：
   ```bash
   mkdir -p .fpg && printf 'epic=E001\nepic_name=用户登录\nepic_path=docs/iteration/epics/E001-user-login/plan.md\nsprint=S001\nsprint_name=登录闭环\nsprint_path=docs/iteration/epics/E001-user-login/sprints/S001-login-flow/plan.md\ntask=T001\ntask_name=实现登录接口\ntask_path=docs/iteration/epics/E001-user-login/sprints/S001-login-flow/plan.md\nplatform=backend\nskill=sprint-develop\nphase=sprint_develop\n' > .fpg/current-task
   ```
   `epic/sprint/task` 必须是计划树中已存在的精确 `E###/S###/T###`；hook 会静默拒绝非法归因，只保留回合事件和 `attribution_error`。
7. 状态既已置 `执行中`，best-effort 同步计划侧到遥测（失败不阻断、不影响切片）：
   ```bash
   [ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/plan-sync.sh" --epic-dir <epic-dir> --project <项目名kebab>
   ```

## 执行中（红线）

- 只改本 Task 允许的文件范围；与契约不一致时**先停**：改契约（记 CHANGELOG）或改计划，二选一。
- 还有未开始的 Must Deliver 时，不得先扩写文档/报告/非阻塞优化；Supporting 限时，超预算回关键路径。
- 阻塞于拿不到的外部依赖（账号/环境/数据/审批）→ 标 `blocked-external`，停 + 升级，**禁止派生相邻脚手架**（preflight/evidence/safety gate/dry-run/分类器都算）。
- token/时间吃紧时按序保留：可运行代码 > 最小验证 > 必要记录。

## 验收（生成者 ≠ 评估者）

- 逐条核对 Given/When/Then；与 `api/openapi.yaml` 一致（路由/DTO/状态码）；测试通过（正常 + ≥1 异常路径）。
- 尽量在独立上下文验收（独立会话/子 Agent/用户）；用实际运行，不用自我宣称。
- **mock / 结构同构 / 单测通过 ≠ Epic DoD**；Epic 收口看终止契约的退出场景是否全绿。

## 收尾

1. 更新 Sprint `plan.md` 该 Task 行：状态（`已实现`，独立验证后才是 `已验证`）+ 证据链接；状态变化同步父级 `plan.md` 对应直接下级行。
2. best-effort 同步计划侧到遥测（让看板及时反映新状态，失败不阻断）：
   ```bash
   [ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/plan-sync.sh" --epic-dir <epic-dir> --project <项目名kebab>
   ```
3. **竣工勾稽（横向一致性闸）**：对本次切片涉及的状态词/旧口径做全 Epic grep（至少：`待审批|推迟|未实现|未接生产|blocked|TODO|旧API名|旧字段名`，加本切片关键词），覆盖 `plan.md`/`smoke-report.md`/`checklist*.md`/`*review*.md`/`worklog.md`。任何被本次代码/测试/审批证伪的旧表述必须改正；勾稽是**覆盖矛盾旧口径，不是追加新行**。给出 grep 结果与逐条处置。可先跑：
   ```bash
   bash .fpg/bin/fpg-check.sh narrative-consistency <epic-dir> --term <本切片关键词> --slice <T###或关键词>
   ```
   仅 WARN 的非本切片项不阻断；命中本切片（STOP）必须处置后再收尾。
4. `worklog.md`/`smoke-report.md` 对应分节记录过程与验证证据（一次性产物入 `evidence/`，可复用脚本入项目测试/脚本目录）。叙述文档只写决策、范围、证据、冲突口径；Task/Sprint 状态看遥测/看板，不手抄状态副本。
5. 更新 `PROGRESS.md`；描述性 commit（`feat(...): 实现 T001 ...`）。
6. 删除归因标记：`rm -f .fpg/current-task`。

> 不回填 token/耗时——看遥测看板（`GET /report`）。
