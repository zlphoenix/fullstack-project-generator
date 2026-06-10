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
**测试策略参考：** `./references/testing-strategy.md`。验证三层与状态规则见 `.fpg/references/execution-card.md`（执行卡，验收/收尾两节）。

> 通用约定见项目根 `AGENTS.md`。**验收应独立于实现**（生成者≠评估者）：本 Skill 尽量在独立上下文运行，默认"怀疑"，用实际运行而非生成者结论。

---

## 1. 前置准备（从产物定位范围）

1. 读 `./references/testing-strategy.md`、最新 `docs/iteration/epics/E###-*/sprints/S###-*/plan.md`（从 Task、Given/When/Then 和并行边界推导测试场景）、`api/openapi.yaml`（契约测试 endpoint）。旧项目兼容读取 `docs/sprint-N.md`。
2. 从 `docs/architecture.md` 的平台列表确认测哪些平台；询问用户聚焦单平台还是全平台。
3. 写归因标记（token/耗时由 hook 自动采集）：
   ```bash
   mkdir -p .fpg && printf 'epic=E###\nsprint=S###\nskill=project-qa\nphase=qa\n' > .fpg/current-task
   ```

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

三层独立验收（细则见执行卡）：
- 自动验证：unit、integration、typecheck、lint、契约校验。
- 功能验收：真实或准真实场景 smoke。
- 金标准验收：prompt/agent 行为类任务必须保存脱敏 evidence 或链接可复用 golden case，并记录预期与实际差异。

**验证回路**：跑测试 → 修失败 → 重跑，直到全绿；若 golden case 发现 unit test 未覆盖的问题，补测试或记录测试缺口。

---

## 5. 收尾

1. 更新 Sprint `smoke-report.md` 对应分节：pass/fail/blocked、验证命令、关键证据、golden case 链接、测试缺口；一次性证据放 `evidence/`，可复用 golden case 放项目测试目录。
2. 更新对应 Sprint `plan.md` 的 Task 行：通过独立验收为 `已验证`（附证据链接）；报告与父级汇总完成后由协调线程标 `已完成`；验收失败保持/退回 `已实现` 或 `阻塞`，记录缺口与下一步。
3. 更新 `PROGRESS.md`；删除归因标记 `rm -f .fpg/current-task`。提示：
> "测试已生成并通过。下一步请使用 **project-deploy** 配置部署环境。"
