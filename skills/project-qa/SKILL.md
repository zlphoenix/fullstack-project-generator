---
name: project-qa
description: |
  制定测试策略并生成各平台测试文件，遵循测试金字塔（70% 单元 / 20% 集成 / 10% E2E）。
  当用户需要补充测试、制定 QA 策略、提升测试覆盖率时使用。
  触发场景：「写测试」「测试覆盖」「QA策略」「test strategy」「add tests」「测试用例」
  「unit test」「integration test」「e2e test」「测试金字塔」「test coverage」「quality assurance」。
  前置条件：api/openapi.yaml 建议存在；项目代码已通过 project-scaffold 初始化。
  输出：各平台测试文件 + 可执行的测试命令。
---

# project-qa — 质量保障与测试策略

**目标：** 按测试金字塔生成各平台测试文件，确保关键路径有覆盖。
**测试策略参考：** `./references/testing-strategy.md` 与 `.fpg/references/iteration-governance.md`（始终加载）。

> 通用约定与遥测见项目根 `AGENTS.md`。**验收应独立于实现**（生成者≠评估者）。

---

## 1. 前置准备（从产物定位范围）

1. 读 `./references/testing-strategy.md`、`.fpg/references/iteration-governance.md`、最新 `docs/iteration/epics/E###-*/sprints/S###-*/plan.md`（从 Task、Given/When/Then 和并行边界推导测试场景）、`api/openapi.yaml`（契约测试 endpoint）。旧项目兼容读取 `docs/sprint-N.md`。
2. 从 `docs/architecture.md` 的平台列表确认测哪些平台；询问用户聚焦单平台还是全平台。
3. 遥测（best-effort）：`phase_enter`（phase=qa，skill=project-qa）。

---

## 2. 测试金字塔

| 层级 | 比例 | 覆盖 |
|---|---|---|
| 单元 | 70% | Service / ViewModel / Repository 业务逻辑 |
| 集成 | 20% | API 端到端、DB 集成、组件交互 |
| E2E | 10% | 关键用户流程（登录、核心业务） |

---

## 3. 各平台测试生成（按需）

- **Backend**：JUnit5 + Mockito + MockMvc + Testcontainers。`{Entity}ServiceImplTest`（正常+异常）、`{Entity}ControllerTest`(`@WebMvcTest`，200/400/401)、`{Entity}RepositoryTest`(`@DataJpaTest`)、`IntegrationTest`（注册→登录→业务链路）。验证 `mvn test`。
- **iOS**：XCTest，MockService，async；成功/空/错误。
- **Android**：JUnit+Mockk+Coroutines Test（`MainDispatcherRule`）、Compose `createComposeRule()`。`./gradlew test`。
- **Web**：Jest+RTL（mock API）、Playwright（仅关键流程）。`npm test` / `npx playwright test`。

---

## 4. 契约测试 + 验证回路

对 `api/openapi.yaml` 每个 endpoint 核对：对应 Controller 测试存在、请求/响应格式一致、401/403 已覆盖。
按 `.fpg/references/iteration-governance.md` 执行独立验收：
- 自动验证：unit、integration、typecheck、lint、契约校验。
- 功能验收：真实或准真实场景 smoke。
- 金标准验收：prompt/agent 行为类任务必须保存脱敏 evidence，或链接到项目级可复用 golden case，并记录预期与实际差异。

**验证回路**：跑测试 → 修失败 → 重跑，直到全绿；若 golden case 发现 unit test 未覆盖的问题，补测试或记录测试缺口。每轮发遥测：
```bash
[ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" --event-type verification \
  --project <project_id> --phase qa --skill project-qa --outcome <ok|fail> \
  --attrs '{"kind":"test","epic":"E001","sprint":"S001","task":"T001"}'
```

---

## 5. 收尾

1. 更新相关 Task 的 `smoke-report.md`：pass/fail/blocked、验证命令、关键证据、golden case 链接、测试缺口、实际 token 和偏差原因；一次性证据放 `evidence/`，可复用 golden case 放项目测试目录。
2. 更新对应 Sprint `plan.md` 的 Task 证据链接和状态：通过独立验收为 `已验证`；报告、指标、父级汇总都完成后，由协调线程标为 `已完成`。若验收失败，保持或退回 `已实现`/`阻塞`，并记录测试缺口和下一步。
3. 更新 `PROGRESS.md`；遥测 `phase_complete`（phase=qa，`--outcome ok`）。提示：
> "测试已生成并通过。下一步请使用 **project-deploy** 配置部署环境。"
