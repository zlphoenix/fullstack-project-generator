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

**目标：** 生成多阶段 Dockerfile、docker-compose 编排文件和 GitHub Actions CI 流水线。

**部署指南参考：** `../../references/deployment-guide.md`（始终加载）

---

## 前置准备

读取 `../../references/deployment-guide.md`，然后：
1. 从 `docs/PRD.md` 或 `docs/architecture.md` 获取项目名称和平台列表
2. 确认项目骨架已存在（backend/ 和/或 web/ 目录）

---

## Step 1：生成 Dockerfiles

### Backend（Spring Boot）— `docker/Dockerfile.backend`

多阶段构建：
```dockerfile
# Stage 1: Build
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY backend/pom.xml .
COPY backend/src ./src
RUN ./mvnw package -DskipTests

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s CMD wget -q -O- http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### Web（Next.js）— `docker/Dockerfile.web`

三阶段构建（含 standalone 输出）：
```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY web/package*.json ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Stage 3: Runtime
FROM node:20-alpine AS runner
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s CMD wget -q -O- http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
```

---

## Step 2：生成 docker-compose.yml

`docker/docker-compose.yml`：

```yaml
version: '3.8'
services:
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME}
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      retries: 5

  backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.backend
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://db:3306/${DB_NAME}
      SPRING_DATASOURCE_USERNAME: ${DB_USERNAME}
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "8080:8080"
    depends_on:
      db:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
    environment:
      NEXT_PUBLIC_API_URL: ${API_URL}
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  mysql-data:
```

复制 `.env.example`：`cp ../../assets/docker/.env.example docker/.env.example`，并按项目定制变量名。

---

## Step 3：生成 GitHub Actions CI 流水线

`.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: test
          MYSQL_DATABASE: testdb
        options: --health-cmd="mysqladmin ping" --health-interval=10s
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '21', distribution: 'temurin' }
      - run: cd backend && mvn test

  web-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd web && npm ci && npm test

  build-images:
    needs: [backend-test, web-test]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker-compose -f docker/docker-compose.yml build
```

---

## Step 4：生产环境 Checklist

验证并与用户逐项确认：
- [ ] 所有密码通过环境变量传入（无硬编码）
- [ ] `.env` 文件已加入 `.gitignore`
- [ ] 容器使用非 root 用户运行
- [ ] 所有服务有健康检查端点
- [ ] `docker-compose config` 验证通过（执行此命令确认）

执行验证：
```bash
docker-compose -f docker/docker-compose.yml config
```

收尾提示：
> "Docker 和 CI/CD 配置已生成。将 `.github/workflows/ci.yml` push 到 GitHub 后，每次 PR 将自动运行测试。
> 生产部署时，请配置 `.env` 文件中的真实密钥。"
