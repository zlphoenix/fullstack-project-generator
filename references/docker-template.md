# Docker 部署模板参考

## 服务架构

```
                    ┌──────────┐
          :80       │  Nginx   │
  用户 ──────────→  │ (反向代理) │
                    └────┬─────┘
                    ┌────┴─────┐
              /api/ │          │ /
                    ▼          ▼
             ┌──────────┐  ┌─────────┐
             │ Backend  │  │   Web   │
             │ :8080    │  │  :3000  │
             └────┬─────┘  └─────────┘
            ┌─────┴─────┐
            ▼           ▼
      ┌──────────┐ ┌─────────┐
      │  MySQL   │ │  Redis  │
      │  :3306   │ │  :6379  │
      └──────────┘ └─────────┘
```

## 文件说明

### docker-compose.yml

编排 5 个服务：

| 服务 | 镜像/构建 | 端口 | 说明 |
|------|-----------|------|------|
| nginx | nginx:alpine | 80 | 反向代理，统一入口 |
| web | 构建自 web.Dockerfile | 3000(内部) | Next.js 前端 |
| backend | 构建自 backend.Dockerfile | 8080(内部) | Spring Boot 后端 |
| mysql | mysql:8.0 | 3306 | 数据库，带 healthcheck |
| redis | redis:7-alpine | 6379 | 缓存 |

依赖关系：
- nginx 依赖 backend + web
- backend 依赖 mysql（healthy 条件）+ redis

### backend.Dockerfile

多阶段构建：

1. **Build 阶段**: `maven:3.9-eclipse-temurin-21`
   - 先复制 pom.xml 并下载依赖（利用 Docker 缓存）
   - 再复制源码编译打包
2. **Runtime 阶段**: `eclipse-temurin:21-jre-alpine`
   - 仅包含 JRE 和 JAR 文件，镜像更小

### web.Dockerfile

多阶段构建：

1. **Build 阶段**: `node:20-alpine`
   - 先安装依赖（利用 Docker 缓存）
   - 再执行 `npm run build`
2. **Runtime 阶段**: `node:20-alpine`
   - 仅包含构建产物和运行时依赖

### nginx/nginx.conf

路由规则：

| 路径 | 转发目标 | 说明 |
|------|----------|------|
| `/api/` | backend:8080 | REST API |
| `/swagger-ui/` | backend:8080 | API 文档 |
| `/v3/api-docs` | backend:8080 | OpenAPI spec |
| `/` | web:3000 | 前端页面 |

所有代理请求都会转发 `Host`、`X-Real-IP`、`X-Forwarded-For` 等头信息。

### .env.example

环境变量配置：

```
MYSQL_ROOT_PASSWORD=root         # MySQL 密码
SPRING_PROFILES_ACTIVE=dev       # Spring 激活 profile
NEXT_PUBLIC_API_BASE_URL=...     # 前端 API 地址
```

## 使用指南

### 本地开发启动

```bash
cd docker
cp .env.example .env    # 创建环境变量文件
docker compose up -d    # 后台启动所有服务
docker compose logs -f  # 查看日志
```

### 仅启动基础设施（MySQL + Redis）

```bash
docker compose up -d mysql redis
```

然后本地运行 backend 和 web，适合开发调试。

### 重新构建

```bash
docker compose build backend   # 重新构建后端镜像
docker compose up -d backend   # 重启后端服务
```

### 停止并清理

```bash
docker compose down            # 停止并移除容器
docker compose down -v         # 同时删除数据卷
```

## 定制指南

### 修改数据库名

`docker-compose.yml` 中 `MYSQL_DATABASE` 使用 `{{project-name}}` 变量，初始化脚本会自动替换。

### 添加新服务

在 `docker-compose.yml` 中添加新的 service 定义，如 Elasticsearch、RabbitMQ 等。

### 生产环境调整

- 修改 `.env` 中的密码为强密码
- Nginx 添加 SSL 证书配置
- 配置 `SPRING_PROFILES_ACTIVE=prod`
- 为每个服务设置资源限制 (`deploy.resources`)
