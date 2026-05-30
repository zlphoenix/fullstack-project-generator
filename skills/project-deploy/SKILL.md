---
name: project-deploy
description: |
  生成 Docker 容器化配置和 GitHub Actions CI/CD 流水线，准备生产部署环境。
  当用户需要部署项目、配置 Docker、设置 CI/CD 流水线时使用。
  触发场景：「部署」「Docker配置」「CI/CD」「上线」「GitHub Actions」「容器化」
  「containerize」「deploy」「docker-compose」「生产环境」「流水线」「dockerize」「pipeline」。
  前置条件：项目骨架已通过 project-scaffold 初始化。
  输出：docker/Dockerfile.backend、docker/Dockerfile.web、docker/docker-compose.yml、.github/workflows/ci.yml。
---

# project-deploy — Docker 容器化与 CI/CD

**目标：** 从模板复制并定制多阶段 Dockerfile、docker-compose 编排文件和 GitHub Actions CI 流水线。

**部署指南参考：** `./references/deployment-guide.md`（始终加载）

> **遥测（可选）**：在开始/完成时按 `../shared/references/telemetry-points.md` 发送事件（best-effort；未配置 `FPG_HOME` 则跳过）。

---

## 前置准备

**状态读取（project-state MCP）：** 调用 `get_current_phase(project_dir)` — 从 `project_name` 和 `platforms` 字段确认需要生成哪些 Dockerfile；`output_dir` 字段即为项目根目录。

读取 `./references/deployment-guide.md`，然后：
1. 从 `docs/PRD.md` 或 `docs/architecture.md` 获取项目名称和平台列表（若 MCP 状态未记录）
2. 确认项目骨架已存在（backend/ 和/或 web/ 目录）

---

## Step 1：生成 Dockerfiles

从模板复制到项目的 `docker/` 目录（按项目实际包含的平台选择）：

```bash
mkdir -p docker

# Backend（Spring Boot）— 两阶段构建，非 root 用户，健康检查
cp <skill-dir>/templates/docker/Dockerfile.backend docker/Dockerfile.backend

# Web（Next.js）— 三阶段 standalone 构建，非 root 用户，健康检查
cp <skill-dir>/templates/docker/Dockerfile.web docker/Dockerfile.web
```

> 模板位于 `./templates/docker/`，已包含：多阶段构建 + 非 root 用户（安全最佳实践）+ 健康检查端点。
> `<skill-dir>` 为本 SKILL 所在目录（即含此 SKILL.md 的目录）。

如需定制：
- 修改端口号（默认 8080 / 3000）
- 修改健康检查路径（backend 默认 `/actuator/health`）

---

## Step 2：生成 docker-compose.yml

```bash
cp <skill-dir>/templates/docker/docker-compose.yml docker/docker-compose.yml
cp <skill-dir>/templates/docker/.env.example docker/.env.example
```

将 `docker-compose.yml` 中的 `{{project-name}}` 占位符替换为实际项目名（使用 Edit 工具）。

确保 `.env` 已加入 `.gitignore`：
```bash
grep -q "^docker/.env$" .gitignore || echo "docker/.env" >> .gitignore
```

---

## Step 3：生成 GitHub Actions CI 流水线

```bash
mkdir -p .github/workflows
cp <skill-dir>/templates/github/ci.yml .github/workflows/ci.yml
```

> 模板包含三个 job：`backend-test`（含 MySQL 服务容器）、`web-test`、`build-images`（仅 main 分支）。
> 根据项目实际平台，删除不需要的 job。

---

## Step 4：生产环境 Checklist

验证并与用户逐项确认：
- [ ] 所有密码通过环境变量传入（无硬编码）
- [ ] `docker/.env` 文件已加入 `.gitignore`
- [ ] 容器使用非 root 用户运行（模板已内置）
- [ ] 所有服务有健康检查端点（模板已内置）
- [ ] `docker-compose config` 验证通过（执行此命令确认）

执行验证：
```bash
docker compose -f docker/docker-compose.yml config
```

**持久化状态（project-state MCP）：** 配置验证通过后调用：
```json
{ "phase": "deploy" }
```

收尾提示：
> "Docker 和 CI/CD 配置已生成。将 `.github/workflows/ci.yml` push 到 GitHub 后，每次 PR 将自动运行测试。
> 生产部署时，请配置 `docker/.env` 文件中的真实密钥。"
