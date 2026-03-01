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

**目标：** 按测试金字塔生成各平台测试文件，确保关键路径有测试覆盖。

**测试策略参考：** `../../references/testing-strategy.md`（始终加载）

---

## 前置准备

读取 `../../references/testing-strategy.md`，然后：
1. 读取 `api/openapi.yaml`（若存在），提取需要契约测试的 endpoint
2. 读取最新 `docs/sprint-N.md`，从 Given/When/Then AC 推导测试场景
3. 询问用户：聚焦哪个平台？还是全平台？

---

## 测试金字塔规划

| 层级 | 比例 | 覆盖范围 |
|------|------|----------|
| 单元测试 | 70% | 业务逻辑（Service、ViewModel、Repository） |
| 集成测试 | 20% | API 端到端、数据库集成、组件交互 |
| E2E 测试 | 10% | 关键用户流程（登录、核心业务场景） |

---

## 各平台测试生成

### Backend（Spring Boot）
测试框架：JUnit 5 + Mockito + MockMvc + Testcontainers

生成文件：
1. `{Entity}ServiceImplTest.java`：
   - 每个 Service 方法至少 2 个测试（正常路径 + 异常路径）
   - 使用 `@ExtendWith(MockitoExtension.class)` + `@Mock`
   - 命名规范：`methodName_condition_expectedResult`

2. `{Entity}ControllerTest.java`：
   - `@WebMvcTest` + MockMvc
   - 测试：200 正常响应、400 参数校验失败、401/403 权限

3. `{Entity}RepositoryTest.java`：
   - `@DataJpaTest`，H2 内存数据库
   - 测试自定义查询方法

4. `IntegrationTest.java`（关键流程）：
   - Testcontainers + MySQL
   - 测试：用户注册→登录→业务操作完整链路

验证命令：`mvn test`

### iOS（Swift）
测试框架：XCTest

生成文件：
1. `{Feature}ViewModelTests.swift`：
   - MockService 注入
   - 使用 `async/await` 测试异步方法
   - 测试：成功加载、空数据、网络错误

验证命令：Xcode → Product → Test

### Android（Kotlin）
测试框架：JUnit + Mockk + Coroutines Test

生成文件：
1. `{Feature}ViewModelTest.kt`：
   - `@get:Rule val mainDispatcherRule = MainDispatcherRule()`
   - `coEvery` + `coVerify` 测试协程

2. `{Feature}ScreenTest.kt`（Compose UI）：
   - `createComposeRule()`
   - 测试关键 UI 元素和用户交互

验证命令：`./gradlew test`

### Web（Next.js）
测试框架：Jest + React Testing Library + Playwright

生成文件：
1. `__tests__/{Component}.test.tsx`：
   - RTL render + user interactions
   - Mock API 调用

2. `e2e/{flow}.spec.ts`（Playwright，仅关键流程）：
   - 登录、核心业务流程

验证命令：`npm test` / `npx playwright test`

---

## API 契约测试

对 `api/openapi.yaml` 中每个 endpoint 验证：
- [ ] 对应的 Controller 测试存在
- [ ] 请求/响应格式与规范一致
- [ ] 401/403 场景已覆盖

---

## 收尾

运行测试并展示结果。提示：
> "测试已生成。若测试全部通过，使用 **project-deploy** SKILL 配置部署环境。"
