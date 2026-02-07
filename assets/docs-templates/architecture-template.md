# 系统架构设计文档

## 基本信息

| 项目 | 内容 |
|------|------|
| 项目名称 | {{PROJECT_NAME}} |
| 版本 | v1.0 |
| 作者 | {{AUTHOR}} |
| 日期 | {{DATE}} |

---

## 1. 架构概览

### 1.1 系统上下文图

```
┌──────────┐     HTTPS      ┌──────────────┐     SQL       ┌──────────┐
│  Client  │ ──────────────→ │   Backend    │ ────────────→ │ Database │
│(iOS/Web) │ ←────────────── │ (Spring Boot)│ ←──────────── │ (MySQL)  │
└──────────┘     JSON        └──────────────┘               └──────────┘
```

### 1.2 技术选型

| 层次 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| Backend | Spring Boot | 3.x | |
| Database | MySQL | 8.x | |
| Cache | Redis | 7.x | |
| iOS | Swift/SwiftUI | 5.9+ | |
| Android | Kotlin/Compose | 1.9+ | |
| Web | Next.js/TypeScript | 14+ | |
| API 规范 | OpenAPI | 3.1 | |

---

## 2. 后端架构

### 2.1 分层架构

```
┌─────────────────────────────────────┐
│           Controller Layer          │  ← REST API 入口
├─────────────────────────────────────┤
│            Service Layer            │  ← 业务逻辑
├─────────────────────────────────────┤
│          Repository Layer           │  ← 数据访问
├─────────────────────────────────────┤
│           Model / Entity            │  ← 数据模型
└─────────────────────────────────────┘
```

### 2.2 模块划分

| 模块 | 职责 | 核心类 |
|------|------|--------|
| auth | 认证授权 | AuthController, JwtService |
| user | 用户管理 | UserController, UserService |
| {{MODULE}} | {{描述}} | |

### 2.3 数据库设计

#### ER 图
<!-- 核心实体关系 -->

#### 核心表结构
<!-- 列出主要表的字段设计 -->

---

## 3. API 设计

### 3.1 API 规范
- Base URL: `/api/v1`
- 认证: Bearer Token (JWT)
- 分页: `?page=0&size=20`
- 错误格式: `{"code": 400, "message": "...", "details": [...]}`

### 3.2 核心 API 列表

| Method | Path | 描述 | 认证 |
|--------|------|------|------|
| POST | /api/v1/auth/login | 登录 | No |
| GET | /api/v1/users/me | 当前用户信息 | Yes |

---

## 4. 客户端架构

### 4.1 iOS 架构 (MVVM)

```
View (SwiftUI)
  ↓ 绑定
ViewModel (ObservableObject)
  ↓ 调用
Service (网络请求/本地存储)
  ↓
Repository (数据源抽象)
```

### 4.2 Android 架构 (MVVM)

```
Composable (UI)
  ↓ 观察
ViewModel (Hilt 注入)
  ↓ 调用
Repository (Retrofit + Room)
```

### 4.3 Web 架构

```
Pages / Components (React)
  ↓
Hooks (状态管理)
  ↓
API Client (fetch / axios)
```

---

## 5. 基础设施

### 5.1 部署架构

```
┌─────────────┐
│   Nginx     │ ← 反向代理 + 静态资源
├─────────────┤
│  Backend    │ ← Spring Boot (Docker)
├─────────────┤
│  Database   │ ← MySQL (Docker)
├─────────────┤
│  Cache      │ ← Redis (Docker)
└─────────────┘
```

### 5.2 环境配置

| 环境 | 用途 | 配置 |
|------|------|------|
| dev | 本地开发 | application-dev.yml |
| staging | 测试环境 | application-staging.yml |
| prod | 生产环境 | application-prod.yml |

---

## 6. 安全设计

- JWT Token (access + refresh)
- HTTPS 强制
- 输入验证 (@Valid)
- SQL 注入防护 (JPA 参数化查询)
- CORS 配置
- Rate Limiting

---

## 7. 监控与日志

- 日志框架: SLF4J + Logback
- 日志格式: JSON structured logging
- 健康检查: Spring Boot Actuator `/actuator/health`

---

## 变更记录

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|----------|------|
| {{DATE}} | v1.0 | 初始版本 | {{AUTHOR}} |
