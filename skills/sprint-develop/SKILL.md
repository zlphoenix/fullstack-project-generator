---
name: sprint-develop
description: |
  按照 Sprint 计划实现具体 User Story 的代码，遵循各平台最佳架构模式与项目契约。
  当用户需要实现某个功能、编写特定平台的代码、推进当前 Sprint 任务时使用。
  触发场景：「实现XX功能」「开发用户管理」「implement US-001」「写代码」「开始开发」
  「帮我写后台代码」「generate code」「实现登录」「开发这个功能」「coding」「写接口」。
  每次调用实现：一个上下文切片（一个平台/上下文边界，可含同边界多个清单 Task），避免上下文过载。
  前置条件：当前 Sprint 计划文档（docs/iteration/.../S###/plan.md 或 docs/sprint-N.md）+ api/openapi.yaml 必须存在。
---

# sprint-develop — Sprint 功能代码实现

**目标：** 严格按 Sprint 计划与 OpenAPI 契约实现代码，遵循各平台架构规范。
**范围：每次调用 1 个上下文切片＝1 个平台/上下文边界（可含同边界多个清单 Task），摊薄重复上下文加载。**

> 通用约定见项目根 `AGENTS.md`。执行期治理只读 `.fpg/references/execution-card.md`（执行卡）——
> 起步检查、止损红线（fpg-check gate）、验收与收尾清单全在卡上，**本文不重复**。
> 治理规范全文（`iteration-governance.md`）仅规划期使用，执行期不加载。
> **同一会话内已读过的执行卡/平台指南/契约不重读**；连续切片只重读 Sprint `plan.md` 的当前 Task 行。

---

## 1. 起步

按执行卡「起步」一节执行（恢复上下文 → `fpg-check gate` → 退出场景自检 → 冒烟 → 确认切片 → 写 `.fpg/current-task` 归因标记）。

- 用户输入 `e1-s2-t5`、`t5` 等短编号时，归一化为 `E001/S002/T005` 后扫描目录；多个候选先确认。
- 旧项目兼容读取 `docs/sprint-N.md`。
- token/耗时由 hook 自动采集，**不手工估算或回填**。

## 2. 先规划，后实现

写代码前用 3–6 行列出实现计划并自检：涉及哪些文件/分层？对应 `api/openapi.yaml` 哪些 endpoint/DTO？验收标准（Given/When/Then）如何逐条满足、如何验证？计划与契约不一致时先停（改契约记 CHANGELOG，或改计划）。

## 3. 实现规范（仅加载本次平台的指南）

| 平台 | 指南 | 生成顺序与要点 |
|---|---|---|
| Backend (Spring Boot) | `.fpg/references/backend-guide.md` | Entity → Repository → Service 接口 → ServiceImpl(`@Transactional`) → Controller(`@Valid` + 统一 `ApiResponse<T>`) → DTO（与 openapi.yaml 对齐）→ 单元测试（正常 + ≥1 异常路径） |
| iOS (Swift/SwiftUI) | `.fpg/references/ios-guide.md` | Model(`Codable`) → Service(protocol + `actor APIClient`) → ViewModel(`@Observable`) → View(`.task{}`) → XCTest（MockService 注入） |
| Android (Kotlin/Compose) | `.fpg/references/android-guide.md` | data class → Retrofit interface → Repository → `@HiltViewModel`(`StateFlow<UiState>`) → Composable+NavGraph → JUnit+Mockk |
| Web (Next.js) | `.fpg/references/web-guide.md` | types → `src/lib/api/` 调用层 → 页面组件（Server/Client）→ Jest+RTL |

## 4. 验收与收尾

按执行卡「验收」「收尾」两节执行（生成者≠评估者、契约一致性核对、更新 plan 行状态+证据、worklog/smoke-report 分节、PROGRESS.md、描述性 commit、删除 `.fpg/current-task`）。

完成后提示：
> "本切片已实现并通过验收。若本 Sprint 还有未完成上下文切片，继续调用 sprint-develop；全部完成后使用 **project-qa**。"
