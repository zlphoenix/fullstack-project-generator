---
name: project-scaffold
description: |
  基于模板自动生成各平台项目骨架代码，一键初始化可运行的项目结构。
  当用户已完成架构设计、需要生成代码框架、初始化项目目录时使用。
  触发场景：「初始化项目」「生成代码骨架」「scaffold」「搭建项目」「create project」
  「生成模板」「项目初始化」「代码框架」「setup project」「bootstrap」。
  前置条件：docs/architecture.md 必须存在。
  输出：各平台可编译/可启动的项目骨架目录。
---

# project-scaffold — 项目骨架自动生成

**目标：** 生成各平台可运行的项目骨架，并按架构文档定制代码。

> 通用约定与遥测见项目根 `AGENTS.md`；平台指南见 `.fpg/references/`。

---

## 1. 前置检查

1. 检查 `docs/architecture.md` 是否存在；不存在则提示先运行 **project-architecture**。
2. 从 `docs/PRD.md` / `docs/architecture.md` 读取项目名与平台列表。
3. 遥测（best-effort）：`phase_enter`（phase=scaffold，skill=project-scaffold）。

---

## 2. 确认参数并生成骨架

向用户确认：项目名（CamelCase）、输出目录、平台列表。

> 工具脚本仍为 Python（M2 移植 + 修复 docs/docker 复制缺陷，见 ADR-014 / G6）。运行：

```bash
python3 ./scripts/init_project.py --name <ProjectName> \
  --platforms <ios|android|web|backend 空格分隔> --output-dir <输出路径> [--merge]
```

脚本从 `./templates/` 复制平台模板并替换占位符（`{{ProjectName}}`/`{{project-name}}`/`{{PROJECT_NAME}}`）。执行后展示目录树。

---

## 3. 平台定制（按需加载指南）

仅加载涉及平台：
- Backend → `.fpg/references/backend-guide.md`：确认包结构、`pom.xml` 依赖。
- iOS → `.fpg/references/ios-guide.md`：MVVM 目录、APIClient。
- Android → `.fpg/references/android-guide.md`：Hilt、Navigation。
- Web → `.fpg/references/web-guide.md`：App Router、TS 配置。

---

## 4. 验证与收尾

各平台冒烟：Backend `cd backend && mvn compile -q`；Web `cd web && npm install && npm run build`；iOS/Android 提示在 IDE 打开编译。
然后：
1. 创建/更新项目根 `ARCHITECTURE.md`"地图"（标出模块边界与"这里不存在什么"），便于后续 Agent 快速定位。
2. 更新 `PROGRESS.md`（下一步=Sprint 计划）。
3. 遥测：`phase_complete`（phase=scaffold，`--outcome ok`）。
4. 提示：
   > "骨架已生成。下一步请使用 **sprint-plan** 规划第一个 Sprint。"
