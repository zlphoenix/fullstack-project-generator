# 执行卡（sprint-develop 每切片必读，全文 ≈40 行）

> 治理规范全文（`iteration-governance.md`）只在规划期加载；执行期读本卡即可。
> 硬规则由 `fpg-check` 判定——跑命令看结果，不靠记忆条文。**同一会话内本卡与平台指南只读一次。**

## 起步（动手前，顺序执行）

1. 读 `PROGRESS.md` + `git log --oneline -10` + 本 Sprint `plan.md`（含 Task 清单与依赖图）+ `api/openapi.yaml`。
2. 跑 `bash .fpg/bin/fpg-check.sh gate <epic-dir>` → **STOP 则停止并升级人类，不得绕过**。
3. 一句话回答：**本切片让 Epic 哪条退出场景更接近全绿？** 答不出 = 非关键路径，停。
4. 跑一次端到端冒烟（编译/启动）；失败先修或记入 `PROGRESS.md`，不在坏基线上叠代码。
5. 与用户确认本次切片（平台/上下文边界，可含同边界多个 Task）；把 Task 行状态改 `执行中`。
6. 写归因标记（hook 自动采集 token/耗时，模型不记账）：
   ```bash
   mkdir -p .fpg && printf 'epic=E001\nsprint=S001\ntask=T001\nplatform=backend\nskill=sprint-develop\nphase=sprint_develop\n' > .fpg/current-task
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

1. 更新 Sprint `plan.md` 该 Task 行：状态（`已实现`，独立验证后才是 `已验证`）+ 证据链接。
2. `worklog.md`/`smoke-report.md` 对应分节记录过程与验证证据（一次性产物入 `evidence/`，可复用脚本入项目测试/脚本目录）。
3. 更新 `PROGRESS.md`；描述性 commit（`feat(...): 实现 T001 ...`）。
4. 删除归因标记：`rm -f .fpg/current-task`。

> 不回填 token/耗时——看遥测看板（`GET /report`）。
