---
name: fullstack-project-generator
description: |
  全栈项目生成与迭代开发指南。当用户想要创建包含 iOS、Android、Web 前端或 Spring Boot 后台的全栈应用项目时使用此 Skill。
  支持从需求分析到部署的完整开发生命周期，包括：需求访谈与 PRD 生成、系统架构设计、API 契约定义、
  多平台项目脚手架、Sprint 迭代开发、测试策略、Docker 容器化部署。
  适用场景：创建新的全栈项目、为已有项目添加新平台支持、进行 Sprint 迭代开发。
---

# Fullstack Project Generator

全栈项目全生命周期开发指南，覆盖从需求分析到容器化部署的完整流程。

**支持平台：**
- iOS (Swift/SwiftUI) -- 深度支持
- Backend (Spring Boot/Java) -- 深度支持
- Android (Kotlin/Compose) -- 标准支持
- Web (Next.js/TypeScript) -- 标准支持

**开发方法论：** 规划阶段使用瀑布式顺序执行，开发阶段使用 Scrum 迭代模式。

---

## 入口决策树

根据用户当前的项目状态，选择合适的起始阶段：

1. **全新项目，无任何文档** -- 从 Phase 1 需求分析开始
2. **已有需求文档/PRD，需要技术方案** -- 从 Phase 2 架构设计开始
3. **已有架构设计和 API 契约，需要代码** -- 从 Phase 3 项目脚手架开始
4. **已有项目骨架，需要增加功能** -- 从 Phase 4 迭代开发开始
5. **功能开发完成，需要测试方案** -- 从 Phase 5 质量保障开始
6. **需要部署上线** -- 从 Phase 6 部署规划开始

询问用户当前状态，确认起始阶段后开始执行。

---

## 开发流程总览

```
Phase 1: 需求分析 --> PRD.md
Phase 2: 架构设计 --> architecture.md + openapi.yaml
Phase 3: 项目脚手架 --> 各平台可运行项目骨架
Phase 4: 迭代开发 --> Sprint 循环 (计划->开发->测试->评审)
Phase 5: 质量保障 --> 测试用例 + CI 配置
Phase 6: 部署规划 --> Docker 配置 + CI/CD
```

---

### Phase 1: 需求分析

**目标：** 通过引导式访谈，将用户需求转化为结构化的产品需求文档。

**执行步骤：**

1. **需求访谈** -- 向用户提问以下关键问题：
   - 产品定位：解决什么问题？目标用户是谁？
   - 核心功能：列出 3-5 个最重要的功能
   - 平台选择：需要哪些客户端？(iOS/Android/Web/Backend)
   - 非功能需求：性能、安全、可用性要求

2. **PRD 文档生成** -- 使用文档模板生成 `docs/PRD.md`：
   - 读取模板：`assets/docs-templates/PRD-template.md`
   - 填充用户需求信息
   - 使用 MoSCoW 方法划分功能优先级 (Must/Should/Could/Won't)
   - 编写 User Stories，参考 [methodology.md](./references/methodology.md)

3. **需求确认** -- 将 PRD 呈现给用户审核，确认后进入 Phase 2。

---

### Phase 2: 架构设计

**目标：** 设计系统架构、选择技术栈、定义 API 契约。

**执行步骤：**

1. **系统架构设计** -- 生成 `docs/architecture.md`：
   - 读取模板：`assets/docs-templates/architecture-template.md`
   - 确定系统分层：客户端 -> API Gateway -> 后台服务 -> 数据库
   - 技术选型：根据平台选择对应技术栈
   - 数据库设计：ER 图、表结构规划

2. **API 契约定义** -- 生成 `api/openapi.yaml`：
   - 运行脚本生成骨架：`python3 scripts/generate_api_contract.py --prd docs/PRD.md --output api/openapi.yaml --name <ProjectName>`
   - 根据 PRD 中的 User Stories 补充具体的 API endpoints
   - 定义 Request/Response 数据结构
   - 遵循 API 设计规范：[api-design.md](./references/api-design.md)

3. **架构评审** -- 确认架构方案和 API 契约后，锁定契约进入 Phase 3。

---

### Phase 3: 项目脚手架

**目标：** 基于模板生成各平台的可运行项目骨架。

**执行步骤：**

1. **初始化项目** -- 运行脚手架脚本：

   ```bash
   python3 scripts/init_project.py \
     --name <ProjectName> \
     --platforms ios android web backend \
     --output-dir <output-path>
   ```

   脚本会从 `assets/` 复制选定平台模板，替换 `{{ProjectName}}` 占位符，创建 `docs/` 目录并复制文档模板和 Docker 配置。

2. **平台定制** -- 根据 API 契约定制各平台代码：
   - **Backend (Spring Boot):** 参考 [backend-guide.md](./references/backend-guide.md)
   - **iOS (SwiftUI):** 参考 [ios-guide.md](./references/ios-guide.md)
   - **Android (Kotlin/Compose):** 参考 [android-guide.md](./references/android-guide.md)
   - **Web (Next.js):** 参考 [web-guide.md](./references/web-guide.md)

3. **验证** -- 确保各平台项目可编译/启动。

---

### Phase 4: 迭代开发

**目标：** 按 Scrum 方式进行 Sprint 迭代，逐步实现功能。

**方法论参考：** [methodology.md](./references/methodology.md)

**Sprint 流程：**

1. **Sprint 计划：**
   - 从 PRD 中选取当前 Sprint 的 User Stories
   - 第一个 Sprint 聚焦 MVP (最小可用产品)
   - 分解 Stories 为开发任务
   - 读取模板：`assets/docs-templates/sprint-plan-template.md`

2. **并行开发：** 基于 API 契约，前后端可并行开发：
   ```
                     API Contract (OpenAPI)
                            |
              +-------------+-------------+
              |             |             |
          Backend       iOS/Android      Web
          Sprint N      Sprint N       Sprint N
   ```

3. **代码实现：** 对每个 User Story：
   - 后端：Controller -> Service -> Repository -> 单元测试
   - 客户端：Model -> ViewModel/Service -> View -> UI 验证
   - 遵循各平台开发指南中的编码规范和架构模式

4. **Sprint 评审：**
   - 功能完整性：所有 Stories 的验收标准 (AC) 是否满足
   - 代码质量：分层是否清晰、命名是否规范
   - API 一致性：实现是否与 OpenAPI 契约匹配
   - 测试覆盖：关键路径是否有测试

5. **下一个 Sprint：** 评审通过后，重复步骤 1-4。

---

### Phase 5: 质量保障

**目标：** 制定测试策略，确保产品质量。

**测试策略参考：** [testing-strategy.md](./references/testing-strategy.md)

**执行步骤：**

1. **测试金字塔规划：**
   - 单元测试 (70%)：各平台核心业务逻辑
   - 集成测试 (20%)：API 端到端、数据库集成
   - E2E 测试 (10%)：关键用户流程

2. **各平台测试实现：**
   - Backend: JUnit 5 + MockMvc + Testcontainers
   - iOS: XCTest + async 测试
   - Android: JUnit + Mockk + Compose UI Testing
   - Web: Jest + React Testing Library + Playwright

3. **API 契约测试：** 验证实现与 OpenAPI 规范一致性。

---

### Phase 6: 部署规划

**目标：** 容器化部署，配置 CI/CD 流水线。

**部署指南参考：** [deployment-guide.md](./references/deployment-guide.md)

**执行步骤：**

1. **Docker 配置：**
   - `docker/Dockerfile.backend`: Spring Boot 多阶段构建
   - `docker/Dockerfile.web`: Next.js standalone 构建
   - `docker/docker-compose.yml`: MySQL + Backend + Web 编排

2. **CI/CD 配置：**
   - GitHub Actions workflow: 自动构建、测试、部署
   - 环境变量管理: `.env` 文件 + secrets

3. **生产环境准备：**
   - HTTPS/SSL 配置 (Nginx reverse proxy)
   - 健康检查端点
   - 日志和监控策略
   - 数据备份方案

---

## 参考文档索引

| 文档 | 用途 |
|------|------|
| [methodology.md](./references/methodology.md) | Scrum 迭代方法论、Sprint 规划、User Story 规范 |
| [backend-guide.md](./references/backend-guide.md) | Spring Boot 分层架构、异常处理、安全配置 |
| [ios-guide.md](./references/ios-guide.md) | SwiftUI MVVM、@Observable、async/await 网络层 |
| [android-guide.md](./references/android-guide.md) | Kotlin/Compose、Hilt DI、Retrofit、Navigation |
| [web-guide.md](./references/web-guide.md) | Next.js App Router、状态管理、Tailwind CSS |
| [api-design.md](./references/api-design.md) | RESTful API 设计规范、OpenAPI 3.0 模板 |
| [testing-strategy.md](./references/testing-strategy.md) | 多平台测试策略、测试金字塔 |
| [deployment-guide.md](./references/deployment-guide.md) | Docker 部署、CI/CD、生产环境配置 |

## 脚本工具

| 脚本 | 用途 | 用法 |
|------|------|------|
| `scripts/init_project.py` | 项目脚手架初始化 | `python3 scripts/init_project.py --help` |
| `scripts/generate_api_contract.py` | OpenAPI 契约骨架生成 | `python3 scripts/generate_api_contract.py --help` |
