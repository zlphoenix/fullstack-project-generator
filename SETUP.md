# Fullstack Project Generator — 安装与使用指南

> 本文档说明如何安装和使用这套全栈项目开发 SKILL 集合。

---

## 包含的 SKILL

| SKILL | 功能 | 触发场景示例 |
|-------|------|-------------|
| `project-requirements` | 需求访谈 → PRD.md | "我想做一个电商App" |
| `project-architecture` | 架构设计 → architecture.md + openapi.yaml | "帮我设计系统架构" |
| `project-scaffold` | 代码骨架生成 | "初始化项目" / "scaffold" |
| `sprint-plan` | Sprint 迭代计划 | "规划第一个Sprint" |
| `sprint-develop` | 功能代码实现 | "实现用户登录功能" |
| `project-qa` | 测试策略 + 测试文件 | "帮我写测试策略" |
| `project-deploy` | Docker + CI/CD 配置 | "配置Docker部署" |

---

## 安装步骤

### 1. 安装 MCP 状态服务依赖

```bash
pip install mcp
# 或
pip install 'anthropic[mcp]'
```

### 2. 在 Claude Code 中安装 SKILL

将 `skills/` 目录下每个子目录作为独立 SKILL 安装。Claude Code 会自动识别包含 `SKILL.md` 的目录。

### 3. 配置 MCP 服务（用于跨会话状态持久化）

编辑 `.claude/settings.local.json`，将路径替换为本仓库实际路径：

```json
{
  "mcpServers": {
    "project-state": {
      "command": "python3",
      "args": ["/your/path/to/fullstack-project-generator/scripts/project_state.py"],
      "type": "stdio"
    }
  }
}
```

---

## 推荐工作流

```
新项目开始
    │
    ▼
project-requirements ──→ docs/PRD.md
    │
    ▼
project-architecture ──→ docs/architecture.md + api/openapi.yaml
    │
    ▼
project-scaffold ──→ 各平台代码骨架
    │
    ▼
sprint-plan ──→ docs/sprint-1.md
    │
    ▼
sprint-develop ──→ 功能代码（每次 1 Story × 1 平台）
    │                    ↑（循环到下一 Story）
    ▼
project-qa ──→ 测试文件
    │
    ▼
project-deploy ──→ Docker + CI/CD
```

---

## 支持平台

| 平台 | 技术栈 | 支持程度 |
|------|--------|----------|
| iOS | Swift / SwiftUI / @Observable | 深度支持 |
| Backend | Spring Boot 3.3 / Java 21 | 深度支持 |
| Android | Kotlin / Jetpack Compose / Hilt | 标准支持 |
| Web | Next.js 14 / TypeScript / Tailwind | 标准支持 |

---

## 验证安装

运行 MCP 状态服务测试：

```bash
python3 scripts/project_state.py --test
```

期望输出：✅ 所有测试通过！
