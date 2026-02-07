---
name: fullstack-project-generator
description: 全栈项目脚手架生成器，快速创建包含前端（Next.js）、后端（Spring Boot）、移动端（Android Kotlin/iOS SwiftUI）和 Docker 部署配置的完整项目结构。当用户需要创建新的全栈项目、初始化多端应用、搭建项目脚手架、需要标准化的项目模板、或想从零开始构建一个包含多平台客户端和后端服务的应用时使用此技能。
---

# 全栈项目生成器

根据用户需求，从预置模板快速生成包含多个平台的全栈项目脚手架。

## 支持的平台

| 平台 | 技术栈 | 说明 |
|------|--------|------|
| Web | Next.js 14 + TypeScript + Tailwind CSS | 前端应用 |
| Backend | Spring Boot 3 + Java 21 + JPA + Security | 后端 REST API |
| Android | Kotlin + Jetpack Compose + Hilt + Retrofit | 安卓客户端 |
| iOS | SwiftUI + Swift 5.9 + SPM + URLSession | 苹果客户端 |
| Docker | Nginx + MySQL + Redis + docker-compose | 容器化部署 |

所有平台共享统一的 API 约定：`ApiResponse<T>` 信封格式、Bearer Token 认证、RESTful 风格。

## 工作流程

### 第一步：确认需求

向用户收集以下信息：

| 参数 | 格式 | 示例 | 必须 |
|------|------|------|------|
| 项目名 | kebab-case | `my-awesome-app` | 是 |
| 平台选择 | 逗号分隔 | `web,backend,docker` | 否（默认全部） |
| 作者 | 任意文本 | `Allen Zhou` | 否（默认 Developer） |

### 第二步：运行初始化脚本

```bash
bash scripts/init-project.sh <project-name> [--platforms <list>] [--author "<name>"]
```

示例：

```bash
# 生成全部平台
bash scripts/init-project.sh my-app --author "Allen Zhou"

# 只生成前后端 + Docker
bash scripts/init-project.sh my-app --platforms web,backend,docker

# 只生成移动端
bash scripts/init-project.sh my-app --platforms android,ios
```

脚本会自动：
1. 复制选定平台的模板到 `<project-name>/` 目录
2. 执行变量替换（见下方变量规则）
3. 复制文档模板到 `<project-name>/docs/`
4. 生成 `.project-meta.json` 元数据文件

### 第三步：根据业务需求定制代码

初始化完成后，根据用户的具体业务需求修改生成的代码：

- **后端**：添加业务实体、Repository、Service、Controller
- **前端**：添加页面、组件、API 调用
- **移动端**：添加页面、ViewModel、API 接口
- **Docker**：按需调整服务配置

各平台的具体定制方法详见参考文档。

### 第四步：定制项目文档

`docs/` 目录包含三个文档模板：

- `PRD-template.md` — 产品需求文档
- `architecture-template.md` — 系统架构设计文档
- `sprint-plan-template.md` — 迭代计划

根据项目实际情况填写文档中的 `<!-- 注释 -->` 占位部分。

## 变量替换规则

脚本会自动替换以下模板变量：

| 变量 | 格式 | 示例（输入: my-awesome-app） |
|------|------|------------------------------|
| `{{project-name}}` | kebab-case | `my-awesome-app` |
| `{{ProjectName}}` | PascalCase | `MyAwesomeApp` |
| `{{PROJECT_NAME}}` | Title Case | `My Awesome App` |
| `{{AUTHOR}}` | 原文 | `Allen Zhou` |
| `{{DATE}}` | YYYY-MM-DD | `2026-02-07` |

在代码文件中使用 `{{ProjectName}}`，在配置/构建文件中使用 `{{project-name}}`，在文档/显示名中使用 `{{PROJECT_NAME}}`。

## 生成的项目结构

```
my-app/
├── web/          # Next.js 前端
├── backend/      # Spring Boot 后端
├── android/      # Android 客户端
├── ios/          # iOS 客户端
├── docker/       # Docker 部署配置
├── docs/         # 项目文档
└── .project-meta.json
```

## 各平台概要

### Web (Next.js)

React 18 单页应用，Tailwind CSS 样式，Axios HTTP 客户端自动管理 Token。
详情：[references/web-template.md](references/web-template.md)

### Backend (Spring Boot)

分层架构（Controller → Service → Repository），统一异常处理，OpenAPI 文档，开发环境 H2 内存库。
详情：[references/backend-template.md](references/backend-template.md)

### Android (Kotlin/Compose)

MVVM 架构，Hilt 依赖注入，Compose 声明式 UI，底部导航栏。
详情：[references/android-template.md](references/android-template.md)

### iOS (SwiftUI)

MVVM 架构，`@Observable` 宏，`actor` 网络客户端，TabView 标签导航。
详情：[references/ios-template.md](references/ios-template.md)

### Docker

Nginx 反向代理，多阶段构建 Dockerfile，MySQL + Redis 基础设施，一键 `docker compose up`。
详情：[references/docker-template.md](references/docker-template.md)

## 参考文档索引

| 文档 | 使用时机 |
|------|----------|
| [references/web-template.md](references/web-template.md) | 需要了解或定制 Next.js 前端时 |
| [references/backend-template.md](references/backend-template.md) | 需要添加后端业务模块或修改数据库配置时 |
| [references/android-template.md](references/android-template.md) | 需要添加 Android 页面或 API 接口时 |
| [references/ios-template.md](references/ios-template.md) | 需要添加 iOS 视图或网络请求时 |
| [references/docker-template.md](references/docker-template.md) | 需要调整部署架构或添加基础设施服务时 |
