---
name: sprint-develop
description: |
  按照 Sprint 计划实现具体 User Story 的代码，遵循各平台最佳架构模式。
  当用户需要实现某个功能、编写特定平台的代码、推进当前 Sprint 任务时使用。
  触发场景：「实现XX功能」「开发用户管理」「implement US-001」「写代码」「开始开发」
  「帮我写后台代码」「generate code」「实现登录」「开发这个功能」「coding」「写接口」。
  每次调用实现：一个 User Story × 一个平台（避免上下文过载）。
  前置条件：当前 Sprint 计划文档（docs/sprint-N.md）+ api/openapi.yaml 必须存在。
---

# sprint-develop — Sprint 功能代码实现

**目标：** 严格按照 Sprint 计划和 OpenAPI 契约实现代码，遵循各平台架构规范。

**范围限定：每次调用只实现 1 个 Story × 1 个平台。**

> **遥测（可选）**：选定 Story 后 `story_start`、完成后 `story_complete`、重开已完成 Story 时 `story_reopen`、验收时 `verification`，按 `../shared/references/telemetry-points.md` 发送（best-effort；未配置 `FPG_HOME` 则跳过）。

---

## 前置准备

1. **状态读取（project-state MCP）：** 调用 `get_current_phase(project_dir)` 获取 `current_sprint`，然后调用 `list_open_stories(project_dir, current_sprint)` 获取未完成 Stories 列表，直接展示给用户选择（替代手动扫描文档）。
2. 读取最新的 `docs/sprint-N.md`（获取 Story 详情和验收标准）
3. 读取 `api/openapi.yaml`（获取 API 定义）
4. 询问用户：**实现哪条 Story？在哪个平台？**

---

## 实现规范（按平台条件加载）

### Backend（Spring Boot）— 若选择后台平台
读取 `../shared/references/backend-guide.md`，然后按以下顺序生成代码：

1. **Entity**（`model/entity/`）：继承 BaseEntity，字段类型精确
2. **Repository**（`repository/`）：JpaRepository + 必要的自定义查询
3. **Service 接口**（`service/`）：定义业务方法签名
4. **ServiceImpl**（`service/impl/`）：业务逻辑 + `@Transactional`
5. **Controller**（`controller/`）：`@Valid` 入参 + 统一 `ApiResponse<T>` 响应
6. **DTO**（`model/dto/`）：Request/Response 数据结构（与 openapi.yaml 对齐）
7. **单元测试**：
   - `ServiceImplTest`：JUnit 5 + Mockito（覆盖正常/异常路径）
   - `ControllerTest`：`@WebMvcTest` + MockMvc

**命名规范：**
- 类：`{Entity}Controller` / `{Entity}Service` / `{Entity}Repository`
- 方法：camelCase，动词开头（`createUser`, `findById`）

---

### iOS（Swift/SwiftUI）— 若选择 iOS 平台
读取 `../shared/references/ios-guide.md`，按以下顺序生成：

1. **Model**（`Models/`）：`Codable` struct，字段与 API 响应对齐
2. **Service**（`Services/`）：protocol 定义 + 基于 `actor APIClient` 的实现
3. **ViewModel**（`ViewModels/`）：`@Observable` class，`async/await` 调用 Service
4. **View**（`Views/`）：SwiftUI View，使用 `.task {}` 触发数据加载
5. **测试**：`XCTest`，MockService 注入，测试 ViewModel 状态变化

---

### Android（Kotlin/Compose）— 若选择 Android 平台
读取 `../shared/references/android-guide.md`，按以下顺序生成：

1. **Model**（`data/model/`）：data class + `@SerializedName`
2. **API 接口**（`data/network/`）：Retrofit interface，对齐 openapi.yaml
3. **Repository**（`data/repository/`）：interface + impl，封装 Retrofit 调用
4. **ViewModel**（`ui/viewmodel/`）：`@HiltViewModel`，`StateFlow<UiState>`
5. **Screen**（`ui/screens/`）：Composable 函数 + NavGraph 注册
6. **测试**：JUnit + Mockk，`MainDispatcherRule`

---

### Web（Next.js）— 若选择 Web 平台
读取 `../shared/references/web-guide.md`，按以下顺序生成：

1. **类型定义**（`src/types/`）：TypeScript interface，与 API 响应对齐
2. **API 模块**（`src/lib/api/`）：基于 `api-client.ts` 封装具体调用函数
3. **页面组件**（`src/app/`）：Server Component（数据获取）或 Client Component（交互）
4. **测试**：Jest + React Testing Library，测试用户交互和数据展示

---

## Sprint 评审 Checklist

每个 Story 完成后核对：
- [ ] 所有 Given/When/Then 验收标准已实现
- [ ] API 契约未被破坏（实现与 openapi.yaml 一致）
- [ ] 单元测试通过（覆盖正常路径 + 至少 1 个异常路径）
- [ ] 无编译错误
- [ ] 代码分层清晰（无跨层直接调用）

**持久化状态（project-state MCP）：** Story 完成后调用：
```json
{ "phase": "sprint_develop", "story_status": { "US-N-001": "completed" } }
```
若 `list_open_stories` 返回的所有 Stories 均已完成，提示用户可进入 QA 阶段。

完成后提示：
> "Story 已实现完毕。若本 Sprint 还有其他 Story，继续调用 sprint-develop；
> 全部完成后，使用 **project-qa** SKILL 制定测试策略。"
