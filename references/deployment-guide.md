# Docker 部署与 CI/CD 指南

## 一、Docker 多阶段构建

### 1.1 Backend Dockerfile (Spring Boot + Maven)

```dockerfile
# Stage 1: Build
FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn package -DskipTests -B

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/target/*.jar app.jar

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/api/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 1.2 Web Dockerfile (Next.js)

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Stage 2: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

# Stage 3: Runtime
FROM node:20-alpine
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -qO- http://localhost:3000 || exit 1

CMD ["node", "server.js"]
```

说明: Next.js standalone 模式需要在 next.config.js 中配置:

```javascript
// next.config.js
module.exports = {
    output: 'standalone',
};
```

## 二、docker-compose 编排

### 2.1 完整的 docker-compose.yml

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: app-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-rootpassword}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-appdb}
      MYSQL_USER: ${MYSQL_USER:-appuser}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-apppassword}
    ports:
      - "${MYSQL_PORT:-3306}:3306"
    volumes:
      - mysql-data:/var/lib/mysql
      - ./init-scripts:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD:-rootpassword}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - app-network

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: app-backend
    restart: unless-stopped
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/${MYSQL_DATABASE:-appdb}?useSSL=false&allowPublicKeyRetrieval=true
      SPRING_DATASOURCE_USERNAME: ${MYSQL_USER:-appuser}
      SPRING_DATASOURCE_PASSWORD: ${MYSQL_PASSWORD:-apppassword}
      JWT_SECRET: ${JWT_SECRET:-your-jwt-secret-key-change-in-production}
      SPRING_PROFILES_ACTIVE: ${SPRING_PROFILE:-prod}
    ports:
      - "${BACKEND_PORT:-8080}:8080"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - app-network

  web:
    build:
      context: ./web
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:8080}
    container_name: app-web
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "${WEB_PORT:-3000}:3000"
    networks:
      - app-network

volumes:
  mysql-data:

networks:
  app-network:
    driver: bridge
```

### 2.2 常用命令

```bash
# 构建并启动所有服务
docker-compose up -d --build

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f backend
docker-compose logs -f --tail 100 mysql

# 停止所有服务
docker-compose down

# 停止并清除数据卷 (警告: 会删除数据库数据)
docker-compose down -v

# 重新构建单个服务
docker-compose up -d --build backend

# 进入容器调试
docker-compose exec backend sh
docker-compose exec mysql mysql -u root -p
```

## 三、环境变量管理

### 3.1 .env 文件

```bash
# .env (不提交到 Git, 在 .gitignore 中排除)

# MySQL
MYSQL_ROOT_PASSWORD=rootpassword
MYSQL_DATABASE=appdb
MYSQL_USER=appuser
MYSQL_PASSWORD=apppassword
MYSQL_PORT=3306

# Backend
BACKEND_PORT=8080
JWT_SECRET=your-secret-key-at-least-32-characters-long
SPRING_PROFILE=prod

# Web
WEB_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### 3.2 .env.example 文件

提交到 Git 作为模板, 不包含真实密码:

```bash
# .env.example
MYSQL_ROOT_PASSWORD=changeme
MYSQL_DATABASE=appdb
MYSQL_USER=appuser
MYSQL_PASSWORD=changeme
JWT_SECRET=changeme-to-a-long-random-string
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### 3.3 默认值语法

在 docker-compose.yml 中使用 ${VAR:-default} 语法:

- ${MYSQL_PORT:-3306} 表示: 如果 MYSQL_PORT 未设置, 使用 3306
- 这确保即使没有 .env 文件, docker-compose 也能启动

## 四、健康检查

### 4.1 后端健康检查端点

```java
@RestController
@RequestMapping("/api")
public class HealthController {

    @Autowired
    private DataSource dataSource;

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        Map<String, String> status = new HashMap<>();
        status.put("status", "UP");
        status.put("timestamp", LocalDateTime.now().toString());

        try (Connection conn = dataSource.getConnection()) {
            status.put("database", "UP");
        } catch (Exception e) {
            status.put("database", "DOWN");
            return ResponseEntity.status(503).body(status);
        }

        return ResponseEntity.ok(status);
    }
}
```

### 4.2 健康检查的重要性

- docker-compose 的 depends_on + condition: service_healthy 确保启动顺序
- MySQL 完全就绪后 Backend 才启动
- Backend 健康后 Web 才启动
- 避免因服务未就绪导致的连接失败

## 五、CI/CD: GitHub Actions

### 5.1 CI Pipeline 示例

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

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
          MYSQL_ROOT_PASSWORD: testpassword
          MYSQL_DATABASE: testdb
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping -h localhost"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
      - name: Run tests
        working-directory: ./backend
        run: mvn test -B
        env:
          SPRING_DATASOURCE_URL: jdbc:mysql://localhost:3306/testdb
          SPRING_DATASOURCE_USERNAME: root
          SPRING_DATASOURCE_PASSWORD: testpassword

  web-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: ./web/package-lock.json
      - name: Install dependencies
        working-directory: ./web
        run: npm ci
      - name: Run lint
        working-directory: ./web
        run: npm run lint
      - name: Run tests
        working-directory: ./web
        run: npm test -- --coverage

  build-images:
    needs: [backend-test, web-test]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Build backend image
        run: docker build -t myapp-backend:${{ github.sha }} ./backend
      - name: Build web image
        run: docker build -t myapp-web:${{ github.sha }} ./web
```

## 六、生产环境注意事项

### 6.1 SSL / HTTPS

生产环境必须使用 HTTPS。推荐使用 Nginx 作为反向代理, 配合 Let's Encrypt 证书:

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 6.2 资源限制

在 docker-compose.yml 中为每个服务设置资源上限:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### 6.3 生产检查清单

- [ ] 所有密码和密钥使用环境变量, 不硬编码
- [ ] .env 文件已加入 .gitignore
- [ ] HTTPS 已配置
- [ ] 数据库连接使用连接池
- [ ] 日志级别设为 INFO (非 DEBUG)
- [ ] 健康检查端点已配置
- [ ] 数据卷已持久化 (防止容器重启丢数据)
- [ ] 容器以非 root 用户运行
- [ ] 资源限制已设置
- [ ] 备份策略已制定
