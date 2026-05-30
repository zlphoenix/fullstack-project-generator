---
name: sprint-develop
description: |
  按照 Sprint 计划实现具体 User Story 的代码，遵循各平台最佳架构模式与项目契约。
  当用户需要实现某个功能、编写特定平台的代码、推进当前 Sprint 任务时使用。
  触发场景：「实现XX功能」「开发用户管理」「implement US-001」「写代码」「开始开发」
  「帮我写后台代码」「generate code」「实现登录」「开发这个功能」「coding」「写接口」。
  每次调用实现：一个 User Story × 一个平台（避免上下文过载）。
  前置条件：当前 Sprint 计划文档（docs/sprint-N.md）+ api/openapi.yaml 必须存在。
---

# sprint-develop — Sprint 功能代码实现

**目标：** 严格按 Sprint 计划与 OpenAPI 契约实现代码，遵循各平台架构规范。
**范围限定：每次调用只实现 1 个 Story × 1 个平台。**

> 通用约定（行为准则、契约先行、多 Agent 拆分、遥测）见项目根 `AGENTS.md`；方法论见 `.fpg/references/methodology.md`。

---

## 1. 会话起步检查（先理解，后动手）

长程开发每次会话先恢复上下文、确认现状没坏，再写新代码（对抗"上下文焦虑/过早完成"）：

1. 读 `PROGRESS.md`（已完成/进行中/未决/下一步）+ `git log --oneline -10`。
2. 读最新 `docs/sprint-N.md`（Story 详情与 Given/When/Then 验收标准）与 `api/openapi.yaml`（契约）。
3. **跑一次端到端冒烟**确认现有功能可编译/可运行（后端 `mvn -q compile` 或 `bun run`；前端 `build`）。失败先修复或记入 `PROGRESS.md`，再开始新功能。
4. **确定本次范围**：从 `docs/sprint-N.md` 未完成（未勾选）的 Story 中，与用户确认**实现哪条 Story、在哪个平台**。
5. **遥测**（best-effort，未配置 `FPG_HOME` 则跳过）：
   ```bash
   [ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" --event-type story_start \
     --project <project_id> --phase sprint_develop --skill sprint-develop \
     --attrs '{"story":"US-N-001","platform":"backend"}'
   ```
   若本次是重开一个已完成的 Story，改用 `--event-type story_reopen`（返工信号）。

---

## 2. 先规划，后实现（plan → validate → execute）

写代码前，先用 3–6 行列出本 Story 的实现计划并自检，再动手：
- 涉及哪些文件/分层？与 `api/openapi.yaml` 的哪些 endpoint/DTO 对应？
- 验收标准（Given/When/Then）如何逐条满足、如何验证？
- 计划与契约不一致时**先停下**：是改契约（记 CHANGELOG）还是改计划。

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
  --outcome <ok|fail> --attrs '{"kind":"ac","story":"US-N-001"}'   # kind: ac|compile|test
```

---

## 5. 收尾（更新产物 = 持久化进展）

> 没有状态文件/MCP；进展靠**真实产物**承载，供下次会话/他人接续。

1. 在 `docs/sprint-N.md` 勾选该 Story 为完成；如有契约/设计变更，回写 `docs/architecture.md` 与 CHANGELOG。
2. 更新 `PROGRESS.md`：移到"已完成"、更新"进行中/下一步"。
3. 用描述性信息提交：`git commit -m "feat(...): 实现 US-N-001 ..."`。
4. 遥测：
   ```bash
   [ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" --event-type story_complete \
     --project <project_id> --phase sprint_develop --skill sprint-develop --outcome ok \
     --attrs '{"story":"US-N-001","platform":"backend"}'
   ```

完成后提示：
> "Story 已实现并通过验收。若本 Sprint 还有未完成 Story，继续调用 sprint-develop（一次 1 Story × 1 平台）；全部完成后使用 **project-qa**。"
