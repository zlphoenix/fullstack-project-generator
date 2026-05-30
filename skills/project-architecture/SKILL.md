---
name: project-architecture
description: |
  基于 PRD 设计系统架构并生成 OpenAPI 3.0 契约骨架。
  当用户已有 PRD、需要设计技术方案、选择技术栈、创建 API 接口文档时使用。
  触发场景：「设计架构」「生成API」「定义接口」「OpenAPI」「技术方案」「系统设计」
  「architecture design」「API contract」「tech stack」「数据库设计」。
  前置条件：docs/PRD.md 必须存在（否则先运行 project-requirements）。
  输出：docs/architecture.md + api/openapi.yaml。
---

# project-architecture — 系统架构设计与 API 契约

**目标：** 设计技术架构，生成 OpenAPI 骨架，**锁定前后端契约**（契约先行是并行开发与一致性的前提）。

> 通用约定与遥测见项目根 `AGENTS.md`；API 设计规范见 `.fpg/references/api-design.md`。

---

## 1. 前置检查

1. 检查 `docs/PRD.md` 是否存在；不存在则停止并提示先运行 **project-requirements**。
2. 读取 `docs/PRD.md`，提取：项目名、选定平台、核心实体（名词）。
3. 遥测（best-effort）：
   ```bash
   [ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" --event-type phase_enter \
     --project <项目名kebab> --phase architecture --skill project-architecture
   ```

---

## 2. 生成架构设计文档

读取模板 `./templates/architecture-template.md`，填充：
- **分层**：客户端 → API Gateway → Spring Boot 后端 → MySQL。
- **技术栈选型表**（按 PRD 选定平台；详见 `.fpg/references/` 各平台指南）。
- **数据库设计**：从 PRD 名词提取实体、ER 关系、snake_case 单数表名、BaseEntity(id/created_at/updated_at)。
- **架构图（文字）**：组件图 + 数据流图。

输出 `docs/architecture.md`。

---

## 3. 生成 OpenAPI 契约骨架

> 工具脚本仍为 Python（M2 移植，见 ADR-014）。运行（若环境无 python3，可由你直接按 `.fpg/references/api-design.md` 编写 openapi.yaml）：

```bash
python3 ./scripts/generate_api_contract.py --prd docs/PRD.md --output api/openapi.yaml --name <ProjectName>
```

然后按 PRD 的 Must-Have Story 补全：每个 endpoint、Request/Response（遵循 `.fpg/references/api-design.md`）、认证 Bearer JWT。
**API 规范（必守）**：base `/api/v1/`；URL 复数名词 kebab-case；分页 `page`(0起)/`size`(默认20,最大100)；统一响应 `{code,message,data}`。

发契约事件（best-effort）：
```bash
[ -n "$FPG_HOME" ] && bash "$FPG_HOME/telemetry/emit.sh" --event-type contract_change \
  --project <项目名kebab> --phase architecture --skill project-architecture --attrs '{"version":"v1"}'
```

---

## 4. 架构评审与收尾

呈请用户确认：技术栈、实体关系、endpoint 列表是否完整。**契约一经确认即锁定**——后续变更先改契约、记 CHANGELOG，再改代码。确认后：
1. 更新 `PROGRESS.md`（下一步=脚手架）。
2. 遥测：`phase_complete`（同上结构，`--outcome ok`）。
3. 提示：
   > "架构与 API 契约已就绪（docs/architecture.md + api/openapi.yaml）。下一步请使用 **project-scaffold** 生成项目骨架。"
