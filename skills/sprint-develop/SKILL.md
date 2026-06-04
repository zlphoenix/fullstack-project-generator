---
name: sprint-develop
description: |
  按照 Sprint 计划实现具体 User Story 的代码，遵循各平台最佳架构模式与项目契约。
  当用户需要实现某个功能、编写特定平台的代码、推进当前 Sprint 任务时使用。
  触发场景：「实现XX功能」「开发用户管理」「implement US-001」「写代码」「开始开发」
  「帮我写后台代码」「generate code」「实现登录」「开发这个功能」「coding」「写接口」。
  每次调用实现：一个 Task × 一个平台/上下文边界（避免上下文过载）。
  前置条件：当前 Sprint 计划文档（docs/iteration/.../S###/plan.md 或 docs/sprint-N.md）+ api/openapi.yaml 必须存在。
---

# sprint-develop — Sprint 功能代码实现

**目标：** 严格按 Sprint 计划与 OpenAPI 契约实现代码，遵循各平台架构规范。
**范围限定：每次调用只实现 1 个 Task × 1 个平台/上下文边界。**

> 通用约定（行为准则、契约先行、多 Agent 拆分、遥测）见项目根 `AGENTS.md`；方法论见 `.fpg/references/methodology.md`；迭代治理见 `.fpg/references/iteration-governance.md`。

---

## 1. 会话起步检查（先理解，后动手）

长程开发每次会话先恢复上下文、确认现状没坏，再写新代码（对抗"上下文焦虑/过早完成"）：

1. 读 `PROGRESS.md`（已完成/进行中/未决/下一步）+ `git log --oneline -10`。
2. 读 `.fpg/references/iteration-governance.md`、最新 `docs/iteration/epics/E###-*/sprints/S###-*/plan.md`（Task 清单、Story、Given/When/Then、并行边界）与 `api/openapi.yaml`（契约）。旧项目兼容读取 `docs/sprint-N.md`。
3. **跑一次端到端冒烟**确认现有功能可编译/可运行（后端 `mvn -q compile` 或 `bun run`；前端 `build`）。失败先修复或记入 `PROGRESS.md`，再开始新功能。
4. **确定本次范围**：从 Sprint `plan.md` 未完成 Task 中，与用户确认**实现哪个 Task、在哪个平台/上下文边界**。若用户输入 `e1-s1-t5`、`t5` 等短编号，先按 `.fpg/references/iteration-governance.md` 归一化并扫描匹配目录；匹配多个候选时先确认。启动前必须核对 Task 清单和 Mermaid 依赖图：前置已满足、冲突文件已标出、总账负责人唯一。确认后在 Sprint `plan.md` 的 Task 行把状态改为 `执行中`，回填开始时间。
5. **遥测**（best-effort，未配置 `FPG_HOME` 则跳过）：
   ```bash
   [ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" --event-type story_start \
     --project <project_id> --phase sprint_develop --skill sprint-develop \
     --attrs '{"epic":"E001","sprint":"S001","task":"T001","story":"US-N-001","platform":"backend"}'
   ```
   若本次是重开一个已完成 Task/Story，改用 `--event-type story_reopen`（返工信号）。

---

## 2. 先规划，后实现（plan → validate → execute）

写代码前，先用 3–6 行列出本 Task 的实现计划并自检，再动手：
- 涉及哪些文件/分层？与 `api/openapi.yaml` 的哪些 endpoint/DTO 对应？
- 验收标准（Given/When/Then）如何逐条满足、如何验证？
- 计划与契约不一致时**先停下**：是改契约（记 CHANGELOG）还是改计划。
- 只修改 Task `plan.md` 允许的文件范围；禁止修改范围需要先回到 Sprint `plan.md` 调整。

### 2.1 关键路径执行闸门

进入实现前按 Sprint `plan.md` 重新判断当前 Task 是否推进 Must Deliver 或 Must Verify：
- 若 Sprint 中还有未开始的 Must Deliver 编码任务，不得先扩写文档、完善报告、拆子目录或做非阻塞优化。
- 非 Must Deliver/Must Verify 的 Supporting 任务只能限时处理；发现会消耗大量 token 时，停止并回到关键路径。
- smoke、schema、report、check 这类小工作优先作为当前 Task 的验收步骤完成，不升级成独立交付。
- 验证任务只能服务于判断“主交付是否可用”；不能以验证框架完成替代产品能力交付。
- token 或时间吃紧时，按顺序保留：可运行代码、最小验证、必要记录；完整文档、扩展场景、性能和治理项转入 Backlog。

---

## 3. 实现规范（按平台条件加载对应指南）

> 仅加载本次平台的指南，避免无关上下文。

### Backend（Spring Boot）
读取 `.fpg/references/backend-guide.md`，按序生成：Entity → Repository → Service 接口 → ServiceImpl(`@Transactional`) → Controller(`@Valid` + 统一 `ApiResponse<T>`) → DTO（与 openapi.yaml 对齐）→ 单元测试（`ServiceImplTest` JUnit5+Mockito、`ControllerTest` `@WebMvcTest`+MockMvc，覆盖正常 + ≥1 异常路径）。
命名：`{Entity}Controller/Service/Repository`；方法 camelCase 动词开头。

### iOS（Swift/SwiftUI）
读取 `.fpg/references/ios-guide.md`：Model(`Codable`) → Service(protocol + `actor APIClient`) → ViewModel(`@Observable`, async/await) → View(`.task{}`) → XCTest（MockService 注入）。

### Android（Kotlin/Compose）
读取 `.fpg/references/android-guide.md`：data class(`@SerializedName`) → Retrofit interface → Repository → `@HiltViewModel`(`StateFlow<UiState>`) → Composable+NavGraph → JUnit+Mockk（`MainDispatcherRule`）。

### Web（Next.js）
读取 `.fpg/references/web-guide.md`：types → `src/lib/api/` 调用层 → 页面组件（Server/Client）→ Jest+RTL。

---

## 4. 验收（生成者 ≠ 评估者）

实现完成后逐条核对，并**尽量在独立上下文做验收**（独立会话/子 Agent 或用户），评估默认"怀疑"、用实际运行而非自我宣称：

- [ ] 所有 Given/When/Then 验收标准已实现
- [ ] 实现与 `api/openapi.yaml` 契约一致（路由/DTO/状态码）
- [ ] 单元测试通过（正常 + ≥1 异常路径）；无编译错误
- [ ] 代码分层清晰（无跨层直接调用）

每跑一类验证发一条遥测（best-effort）：
```bash
[ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" --event-type verification \
  --project <project_id> --phase sprint_develop --skill sprint-develop \
  --outcome <ok|fail> --attrs '{"kind":"ac","task":"T001","story":"US-N-001"}'   # kind: ac|compile|test
```

---

## 5. 收尾（更新产物 = 持久化进展）

> 没有状态文件/MCP；进展靠**真实产物**承载，供下次会话/他人接续。

1. 更新 Task 目录：`worklog.md` 记录过程，`smoke-report.md` 记录验证命令、pass/fail/blocked、证据、实际 token 与偏差原因；一次性日志/截图/脱敏样例放入 `evidence/`，可复用脚本、fixture、golden case 放到项目测试或脚本目录并在报告中链接。
2. 更新 Sprint `plan.md` 中该 Task 行：实现完成但未独立验证时状态为 `已实现`；同时回填结束时间、主动耗时、等待耗时、实际 token、偏差原因、证据链接。若阻塞则状态为 `阻塞` 并同步 `PROGRESS.md`。父级 Epic `plan.md` 只汇总 Sprint 指标，不复制 Task 明细。
3. 旧项目若仍使用 `docs/sprint-N.md`，同步勾选对应 Story/任务；如有契约/设计变更，回写 `docs/architecture.md` 与 CHANGELOG。
4. 更新 `PROGRESS.md`：移到"已完成"、更新"进行中/下一步"。
5. 用描述性信息提交：`git commit -m "feat(...): 实现 T001 ..."`。
6. 遥测：
   ```bash
   [ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" --event-type story_complete \
     --project <project_id> --phase sprint_develop --skill sprint-develop --outcome ok \
     --attrs '{"epic":"E001","sprint":"S001","task":"T001","story":"US-N-001","platform":"backend"}'
   ```

完成后提示：
> "Task 已实现并通过验收。若本 Sprint 还有未完成 Task，继续调用 sprint-develop（一次 1 Task × 1 平台/上下文边界）；全部完成后使用 **project-qa**。"
