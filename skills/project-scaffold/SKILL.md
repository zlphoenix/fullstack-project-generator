---
name: project-scaffold
description: |
  基于模板自动生成各平台项目骨架代码，一键初始化可运行的项目结构。
  当用户已完成架构设计、需要生成代码框架、初始化项目目录时使用。
  触发场景：「初始化项目」「生成代码骨架」「scaffold」「搭建项目」「create project」
  「生成模板」「项目初始化」「代码框架」「setup project」「bootstrap」。
  前置条件：docs/architecture.md 必须存在。
  自动执行 init_project.py 脚本，支持 iOS、Android、Web、Backend 任意组合。
  输出：各平台可编译/可启动的项目骨架目录。
---

# project-scaffold — 项目骨架自动生成

**目标：** 自动运行脚手架脚本，生成各平台可运行的项目骨架，并按架构文档定制代码。

---

## 前置检查

检查 `docs/architecture.md` 是否存在。若不存在，停止并提示：
> "请先使用 **project-architecture** SKILL 完成架构设计。"

**状态读取（project-state MCP）：** 调用 `get_current_phase(project_dir)` — 从返回结果优先读取 `project_name` 和 `platforms`（作为脚手架参数的默认值，无需用户重复输入）。

从以下位置提取必要信息：
- `docs/PRD.md` → 项目名称（ProjectName）、选定平台列表（若 MCP 状态未记录）
- `docs/architecture.md` → 确认平台和技术栈

---

## Step 1：确认脚手架参数

向用户确认：
1. **项目名称**（CamelCase，如 `MyBookStore`）
2. **输出目录**（默认：`../项目名称`，即与当前目录同级）
3. **平台列表**（从 PRD 中读取，询问是否调整）

---

## Step 2：自动执行脚手架脚本

```bash
python3 ../../scripts/init_project.py \
  --name <ProjectName> \
  --platforms <ios|android|web|backend 空格分隔> \
  --output-dir <输出路径> \
  [--merge]    # 若 docs/ 已由 project-requirements 创建，加此参数保留已有文档
```

脚本将：
- 从 `../../assets/` 复制选定平台模板
- 替换占位符：`{{ProjectName}}`→CamelCase、`{{project-name}}`→kebab-case、`{{PROJECT_NAME}}`→大写
- 创建 `docs/`、`api/`、`docker/` 目录并复制模板

执行后展示生成的目录树给用户。

---

## Step 3：平台定制（按需加载指南）

**仅加载项目涉及的平台指南：**

若包含 **Backend**：
- 读取 `../../references/backend-guide.md`
- 在 `backend/src/main/java/` 中确认包结构正确
- 确认 `pom.xml` 依赖（Spring Data JPA、Spring Security、Springdoc OpenAPI）

若包含 **iOS**：
- 读取 `../../references/ios-guide.md`
- 确认 MVVM 目录结构（Models/ViewModels/Views/Services）
- 确认 APIClient 文件存在

若包含 **Android**：
- 读取 `../../references/android-guide.md`
- 确认 Hilt 配置、Navigation 结构

若包含 **Web**：
- 读取 `../../references/web-guide.md`
- 确认 Next.js App Router 结构、TypeScript 配置

---

## Step 4：验证与收尾

各平台验证命令：
- Backend：`cd backend && mvn compile -q`（确认无编译错误）
- Web：`cd web && npm install && npm run build`（确认构建成功）
- iOS/Android：提示用户在 Xcode/Android Studio 中打开并编译

**持久化状态（project-state MCP）：** 生成成功后调用：
```json
{ "phase": "scaffold", "output_dir": "<实际输出路径的绝对路径>" }
```

收尾提示：
> "项目骨架已生成至 <输出路径>。
> 下一步请使用 **sprint-plan** SKILL 规划第一个 Sprint。"
