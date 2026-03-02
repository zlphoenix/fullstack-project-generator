---
name: project-architecture
description: |
  基于 PRD 设计系统架构并自动生成 OpenAPI 3.0 契约骨架。
  当用户已有 PRD、需要设计技术方案、选择技术栈、创建 API 接口文档时使用。
  触发场景：「设计架构」「生成API」「定义接口」「OpenAPI」「技术方案」「系统设计」
  「architecture design」「API contract」「tech stack」「数据库设计」。
  前置条件：docs/PRD.md 必须存在（否则先运行 project-requirements）。
  输出：docs/architecture.md + api/openapi.yaml（通过脚本自动生成骨架）。
---

# project-architecture — 系统架构设计与 API 契约

**目标：** 设计技术架构，自动生成 OpenAPI 骨架，锁定前后端契约。

---

## 前置检查

**状态检查（project-state MCP）：** 调用 `get_current_phase(project_dir)` — 从返回结果中读取 `project_name`（若已存在则无需从 PRD 重复提取），并确认当前阶段符合预期（应为 `"requirements"` 或 `"architecture"`）。

1. 检查 `docs/PRD.md` 是否存在。若不存在，停止并提示：
   > "请先使用 **project-requirements** SKILL 生成 PRD 文档。"
2. 读取 `docs/PRD.md`，提取：项目名称、选定平台、核心实体（名词）。

---

## Step 1：生成架构设计文档

读取模板：`../../assets/docs-templates/architecture-template.md`，填充以下内容：

**系统分层架构：**
```
客户端 (iOS/Android/Web)
    ↓ HTTPS
API Gateway / Load Balancer
    ↓
Spring Boot Backend (REST API)
    ↓
MySQL Database
```

**技术栈选型表（根据 PRD 中选定平台）：**

| 层级 | 技术 | 版本 |
|------|------|------|
| iOS 客户端 | Swift / SwiftUI | iOS 17+ |
| Android 客户端 | Kotlin / Jetpack Compose | API 26+ |
| Web 前端 | Next.js / TypeScript | 14.x |
| 后台 API | Spring Boot / Java | 3.3 / 21 |
| 数据库 | MySQL | 8.0 |
| 容器化 | Docker + docker-compose | - |

**数据库设计（从 PRD 实体提取）：**
- 识别 PRD 中的核心名词作为实体
- 设计 ER 关系（1:N、N:M）
- 每张表使用 snake_case 命名（单数形式）
- 包含 BaseEntity 字段：id、created_at、updated_at

**架构图（文字描述）：**
- 组件图：模块间依赖关系
- 数据流图：请求从客户端到数据库的路径

输出文件：`docs/architecture.md`

---

## Step 2：自动生成 OpenAPI 骨架

从 `docs/PRD.md` 提取项目名称（ProjectName），然后执行：

```bash
python3 ../../scripts/generate_api_contract.py \
  --prd docs/PRD.md \
  --output api/openapi.yaml \
  --name <ProjectName>
```

脚本执行后，读取生成的 `api/openapi.yaml`，根据 PRD User Stories 补充：
- 每个 Must-Have Story 对应的具体 endpoint
- Request/Response 数据结构（参考 `../../references/api-design.md`）
- 认证方式：Bearer JWT（统一标准）

**API 规范（必须遵守）：**
- Base path：`/api/v1/`
- URL：复数名词 + kebab-case（如 `/api/v1/user-orders`）
- 分页：`page`（0 起）、`size`（默认 20，最大 100）
- 统一响应体：`{ "code": 200, "message": "OK", "data": {...} }`

---

## Step 3：架构评审

呈现以下内容请用户确认：
1. 技术栈选型是否合适
2. 数据库实体关系是否正确
3. API 端点列表是否完整

确认后：

**持久化状态（project-state MCP）：** 调用 `write_project_state(project_dir, {"phase": "architecture"})`

提示：
> "架构文档已保存至 docs/architecture.md，API 契约已保存至 api/openapi.yaml。
> 下一步请使用 **project-scaffold** SKILL 生成项目骨架代码。"

---

## 参考文档

- API 设计规范：`../../references/api-design.md`
