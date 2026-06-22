---
name: sprint-develop
description: |
  按照 Sprint 计划实现具体 User Story 的代码，遵循各平台最佳架构模式与项目契约。
  当用户需要实现某个功能、编写特定平台的代码、推进当前 Sprint 任务时使用。
  触发场景：「实现XX功能」「开始开发」「启动Sxxx」
---

# sprint-develop — Sprint 功能代码实现

**目标：** 严格按 Sprint 计划与 OpenAPI 契约实现代码，遵循各平台架构规范。
**范围：每次调用 1 个上下文切片＝1 个平台/上下文边界＝1 个精确 Task ID。若多个清单 Task 属于同一上下文边界，先合并计划行再执行，摊薄重复上下文加载。**
**前置条件**：当前 Sprint 计划文档（docs/iteration/.../S###/plan.md 或 docs/sprint-N.md）+ api/openapi.yaml 必须存在。
> 通用约定见项目根 `AGENTS.md`。执行期治理只读 `.fpg/references/execution-card.md`（执行卡）——
> 起步检查、止损红线（fpg-check gate）、验收与收尾清单全在卡上，**本文不重复**。
> 治理规范全文（`iteration-governance.md`）仅规划期使用，执行期不加载。
> **同一会话内已读过的执行卡/平台指南/契约不重读**；连续切片只重读 Sprint `plan.md` 的当前 Task 行。

---
## 0. 设计原则-铁律

在进行详细设计和开发过程中需要严格遵循以下设计原则，除非用户强烈要求不遵循。这些原则针对新生成代码，对历史代码只在重构时有效。现有系统能工作的情况下不要顺手修改。添加或者修改代码前先需要先按这个原则审查一下。
0. 奥卡姆剃刀原理:没有必要勿增实体。
1. 单一职责原则 (SRP)：一个类或模块应该有且仅有一个引起它变化的原因。它能有效降低代码耦合度，提升内聚性。
2. 开闭原则 (OCP)：软件实体应当对扩展开放，对修改关闭。通过扩展已有代码来实现新功能，而不是修改原有代码。
3. 接口隔离原则 (ISP)：客户端不应该依赖它不需要的接口。应建立单一、专用的接口，避免强迫客户端依赖庞大臃肿的接口。
4. 依赖倒置原则 (DIP)：高层模块不应该依赖底层模块，两者都应该依赖其抽象；抽象不应该依赖细节，细节应该依赖抽象（面向接口编程）。
5. 迪米特法则 (LoD)：又称“最少知识原则”，一个对象应当对其他对象有尽可能少的了解。不和陌生人说话，降低系统间依赖。
6. DRY (Don't Repeat Yourself)：不要重复自己，通过提取公共逻辑避免代码冗余。
7. KISS (Keep It Simple, Stupid)：保持简单，优先编写直观、简短易懂的代码。
8. YAGNI (You Aren't Gonna Need It)：你不会需要它，拒绝过度设计，只实现当前必须的核心功能。
9. 避免新生成或者修改的代码出现bad smelling，如果因为历史遗留代码存在这些问题，可以放在backlog里定期清理。

## 1. 起步

按执行卡「起步」一节执行（恢复上下文 → `fpg-check gate` → 退出场景自检 → 冒烟 → 确认切片 → 写 `.fpg/current-task` 归因标记）。

- 用户输入 `e1-s2-t5`、`t5` 等短编号时，归一化为 `E001/S002/T005` 后扫描目录；多个候选先确认。不得把 `T003-T004` 这类组合 ID 写入 `.fpg/current-task`；同上下文小任务先回计划合并为一个 `T###`。
- 旧项目兼容读取 `docs/sprint-N.md`。
- token/耗时由 hook 自动采集，**不手工估算或回填**。

## 2. 先规划，后实现

写代码前用 3–6 行列出实现计划并自检：涉及哪些文件/分层？对应 `api/openapi.yaml` 哪些 endpoint/DTO？验收标准（Given/When/Then）如何逐条满足、如何验证？计划与契约不一致时先停（改契约记 CHANGELOG，或改计划）。

开发过程 可以使用 superpowers skill 进行TDD 开发。如果有与当前需求/功能点相关的测试用例，先检查历史用例是否与当前设计目标一致，如果不一致需要先与用户确认影响的用例和assert清单，确认后先将用例修改到位在执行后续动作。

## 3. 实现规范（仅加载本次平台的指南）

| 平台 | 指南 | 生成顺序与要点 |
|---|---|---|
| Backend (Spring Boot) | `.fpg/references/backend-guide.md` | Entity → Repository → Service 接口 → ServiceImpl(`@Transactional`) → Controller(`@Valid` + 统一 `ApiResponse<T>`) → DTO（与 openapi.yaml 对齐）→ 单元测试（正常 + ≥1 异常路径） |
| iOS (Swift/SwiftUI) | `.fpg/references/ios-guide.md` | Model(`Codable`) → Service(protocol + `actor APIClient`) → ViewModel(`@Observable`) → View(`.task{}`) → XCTest（MockService 注入） |
| Android (Kotlin/Compose) | `.fpg/references/android-guide.md` | data class → Retrofit interface → Repository → `@HiltViewModel`(`StateFlow<UiState>`) → Composable+NavGraph → JUnit+Mockk |
| Web (Next.js) | `.fpg/references/web-guide.md` | types → `src/lib/api/` 调用层 → 页面组件（Server/Client）→ Jest+RTL |

## 4. 验收与收尾

按执行卡「验收」「收尾」两节执行（生成者≠评估者、契约一致性核对、更新 plan 行状态+证据、同步 telemetry、竣工勾稽、worklog/smoke-report 分节、PROGRESS.md、描述性 commit、删除 `.fpg/current-task`）。竣工勾稽必须覆盖本 Epic 的 plan/smoke/checklist/review/worklog：状态看 telemetry，叙述文档只保留决策、范围、证据、冲突口径；被本切片证伪的旧表述要覆盖改正，不追加矛盾新行。

完成后提示：
> "本切片已实现并通过验收。若本 Sprint 还有未完成上下文切片，继续调用 sprint-develop；全部完成后使用 **project-qa**。"
