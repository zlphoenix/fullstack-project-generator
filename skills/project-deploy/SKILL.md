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

**目标：** 从模板复制并定制多阶段 Dockerfile、docker-compose 与 GitHub Actions CI。
**部署指南参考：** `./references/deployment-guide.md`（始终加载）。

> 通用约定与遥测见项目根 `AGENTS.md`。

---

## 1. 前置准备

1. 读 `./references/deployment-guide.md`；从 `docs/architecture.md` 取项目名与平台，确认 `backend/`、`web/` 是否存在。
2. 遥测（best-effort）：`phase_enter`（phase=deploy，skill=project-deploy）。

---

## 2. 生成 Dockerfiles / compose / CI

`<skill-dir>` = 含本 SKILL.md 的目录。按项目平台从模板复制到项目 `docker/`：
```bash
mkdir -p docker
cp <skill-dir>/templates/docker/Dockerfile.backend docker/Dockerfile.backend   # 多阶段、非 root、健康检查
cp <skill-dir>/templates/docker/Dockerfile.web      docker/Dockerfile.web       # standalone、非 root、健康检查
cp <skill-dir>/templates/docker/docker-compose.yml  docker/docker-compose.yml
cp <skill-dir>/templates/docker/.env.example        docker/.env.example
mkdir -p .github/workflows && cp <skill-dir>/templates/github/ci.yml .github/workflows/ci.yml
```
将 `docker-compose.yml` 的 `{{project-name}}` 占位符替换为实际项目名；确保 `docker/.env` 已入 `.gitignore`。CI 模板含 `backend-test`(MySQL service)、`web-test`、`build-images`(main)，按实际平台删多余 job。

---

## 3. 生产 Checklist 与收尾

逐项与用户确认：密码全部走环境变量（无硬编码）、`docker/.env` 已 gitignore、容器非 root、各服务有健康检查、`docker compose -f docker/docker-compose.yml config` 通过。
然后：
1. 更新 `PROGRESS.md`（标记部署配置完成）。
2. 遥测：`phase_complete`（phase=deploy，`--outcome ok`）。
3. 提示：
   > "Docker 与 CI/CD 配置已生成。push `.github/workflows/ci.yml` 后每次 PR 自动测试；生产部署前配置 `docker/.env` 真实密钥。"
