# Web 前端模板参考 (Next.js)

## 技术栈

- Next.js 14 + React 18
- TypeScript 5.4
- Tailwind CSS 3.4
- Axios (HTTP 客户端)

## 目录结构

```
web/
├── src/
│   ├── app/
│   │   ├── layout.tsx       # 根布局（HTML head、全局样式）
│   │   ├── page.tsx         # 首页
│   │   └── globals.css      # 全局样式（Tailwind 指令）
│   ├── lib/
│   │   └── api-client.ts    # API 客户端（Axios 封装）
│   └── types/
│       └── index.ts         # 全局类型定义
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
└── postcss.config.mjs
```

## 核心文件说明

### api-client.ts

封装了 Axios 实例，提供统一的 HTTP 方法：

- 自动附加 Bearer Token（从 localStorage 读取）
- 401 响应自动清除 Token 并跳转登录页
- 泛型便捷方法：`get<T>`, `post<T>`, `put<T>`, `del<T>`
- 自动解包 `ApiResponse<T>` 信封，直接返回 `data` 字段

### types/index.ts

定义统一响应类型：

```typescript
interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}
```

与后端 `ApiResponse.java` 保持一致。

## 定制指南

### 新增页面

在 `src/app/` 下创建目录，Next.js 采用文件系统路由：

```
src/app/login/page.tsx     -> /login
src/app/users/page.tsx     -> /users
src/app/users/[id]/page.tsx -> /users/:id
```

### 新增组件

在 `src/components/` 目录创建组件（需先创建该目录）。

### 新增 API 调用

```typescript
import { get, post } from "@/lib/api-client";
import { User } from "@/types";

// 获取用户列表
const users = await get<User[]>("/api/v1/users");

// 创建用户
const newUser = await post<User>("/api/v1/users", { name: "test" });
```

### 环境变量

在 `.env.local` 文件中配置：

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

`NEXT_PUBLIC_` 前缀的变量可在客户端代码中访问。

## 开发命令

```bash
npm install     # 安装依赖
npm run dev     # 启动开发服务器 (http://localhost:3000)
npm run build   # 生产构建
npm run lint    # 代码检查
```
