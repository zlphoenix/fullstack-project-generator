# Next.js Web 前端开发指南

## 一、App Router 目录结构

### 1.1 核心目录布局

```
app/
  layout.tsx              -- 根布局 (全局 Provider, 导航栏, 页脚)
  page.tsx                -- 首页 /
  loading.tsx             -- 全局 loading 状态
  error.tsx               -- 全局错误边界
  not-found.tsx           -- 404 页面
  globals.css             -- 全局样式

  (auth)/                 -- Route Group (不影响 URL)
    login/
      page.tsx            -- /login
    register/
      page.tsx            -- /register

  dashboard/
    layout.tsx            -- Dashboard 专用布局
    page.tsx              -- /dashboard
    users/
      page.tsx            -- /dashboard/users
      [id]/
        page.tsx          -- /dashboard/users/:id

  api/                    -- Route Handlers (BFF 层, 可选)
    auth/
      route.ts            -- /api/auth

components/               -- 共享组件
  ui/                     -- 基础 UI 组件 (Button, Input, Card)
  layout/                 -- 布局组件 (Header, Sidebar, Footer)
  features/               -- 业务组件 (UserTable, OrderCard)

lib/                      -- 工具库
  api.ts                  -- Axios 实例和 API 封装
  auth.ts                 -- 认证相关工具
  utils.ts                -- 通用工具函数

types/                    -- TypeScript 类型定义
  user.ts
  order.ts
  api.ts
```

### 1.2 关键文件说明

- layout.tsx: 每个目录可有自己的 layout, 嵌套生效
- page.tsx: 该路由的页面组件, 必须使用 default export
- loading.tsx: 自动包裹 page.tsx, 在数据加载时显示
- error.tsx: 捕获该目录及子目录的运行时错误

## 二、Server Components vs Client Components

### 2.1 默认行为

App Router 中所有组件默认是 Server Component。需要客户端交互时, 在文件顶部添加 "use client" 指令。

### 2.2 选择原则

| 场景 | 使用 Server Component | 使用 Client Component |
|------|----------------------|----------------------|
| 数据获取 | 直接 await fetch | 需要 SWR/React Query |
| 用户交互 | 不支持 | onClick, onChange 等 |
| 状态管理 | 不支持 | useState, useReducer |
| 浏览器 API | 不支持 | localStorage, window |
| 体积优化 | JS 不发送到浏览器 | JS 发送到浏览器 |

### 2.3 最佳实践

- 尽量让页面顶层为 Server Component
- 将交互部分抽取为独立的 Client Component
- 避免整个页面标记为 "use client"

## 三、数据获取

### 3.1 Server-side 数据获取

```typescript
// app/dashboard/users/page.tsx (Server Component, 无需 "use client")
async function UsersPage() {
    const response = await fetch('https://api.example.com/api/v1/users', {
        headers: { Authorization: `Bearer ${getToken()}` },
        next: { revalidate: 60 }  // ISR: 60 秒后重新验证
    });
    const result = await response.json();

    return <UserTable users={result.data.content} />;
}
export default UsersPage;
```

### 3.2 Client-side 数据获取 (SWR)

```typescript
"use client";
import useSWR from 'swr';
import { apiClient } from '@/lib/api';

function UserList() {
    const { data, error, isLoading } = useSWR(
        '/api/v1/users',
        (url) => apiClient.get(url).then(res => res.data)
    );

    if (isLoading) return <Loading />;
    if (error) return <ErrorDisplay message={error.message} />;

    return <UserTable users={data.data.content} />;
}
```

## 四、状态管理

### 4.1 局部状态: useState / useReducer

```typescript
"use client";
import { useState } from 'react';

function SearchForm() {
    const [keyword, setKeyword] = useState('');
    const [filters, setFilters] = useState({ status: 'all', sort: 'createdAt' });
    // ...
}
```

### 4.2 全局状态: Zustand (推荐)

```typescript
// lib/stores/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
    token: string | null;
    user: User | null;
    setAuth: (token: string, user: User) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            user: null,
            setAuth: (token, user) => set({ token, user }),
            logout: () => set({ token: null, user: null }),
        }),
        { name: 'auth-storage' }
    )
);
```

## 五、API 调用: Axios 封装

### 5.1 创建 Axios 实例

```typescript
// lib/api.ts
import axios from 'axios';
import { useAuthStore } from './stores/auth-store';

const apiClient = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: 自动携带 Token
apiClient.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor: 统一错误处理
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            useAuthStore.getState().logout();
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export { apiClient };
```

### 5.2 API 函数封装

```typescript
// lib/api/user-api.ts
import { apiClient } from '../api';
import { CreateUserRequest, UserResponse, PageResponse } from '@/types';

export const userApi = {
    getUsers: (page = 0, size = 20) =>
        apiClient.get<PageResponse<UserResponse>>(`/api/v1/users?page=${page}&size=${size}`),
    getUserById: (id: number) =>
        apiClient.get<UserResponse>(`/api/v1/users/${id}`),
    createUser: (data: CreateUserRequest) =>
        apiClient.post<UserResponse>('/api/v1/users', data),
    updateUser: (id: number, data: Partial<CreateUserRequest>) =>
        apiClient.patch<UserResponse>(`/api/v1/users/${id}`, data),
    deleteUser: (id: number) =>
        apiClient.delete(`/api/v1/users/${id}`),
};
```

## 六、Tailwind CSS 响应式布局

### 6.1 常用断点

| 断点 | 最小宽度 | 典型设备 |
|------|---------|---------|
| sm | 640px | 手机横屏 |
| md | 768px | 平板 |
| lg | 1024px | 笔记本 |
| xl | 1280px | 桌面 |

### 6.2 响应式布局模式

```tsx
// 移动端单列, 平板双列, 桌面三列的网格布局
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {items.map(item => <Card key={item.id} item={item} />)}
</div>

// 侧边栏布局: 移动端隐藏侧边栏
<div className="flex">
    <aside className="hidden md:block w-64 border-r">
        <Sidebar />
    </aside>
    <main className="flex-1 p-4">
        {children}
    </main>
</div>
```

## 七、TypeScript 类型定义

### 7.1 interface vs type

- interface: 用于定义对象结构, 支持声明合并, 推荐用于 API 数据模型
- type: 用于联合类型、交叉类型、工具类型, 推荐用于复杂类型组合

```typescript
// types/user.ts
interface User {
    id: number;
    name: string;
    email: string;
    createdAt: string;
}

interface CreateUserRequest {
    name: string;
    email: string;
    password: string;
}

// types/api.ts
interface ApiResponse<T> {
    code: number;
    message: string;
    data: T;
}

interface PageResponse<T> {
    content: T[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
}

type ApiResult<T> = ApiResponse<T> | ApiResponse<null>;
```

## 八、环境变量

### 8.1 配置文件

```
.env.local              -- 本地开发 (不提交到 Git)
.env.development        -- 开发环境
.env.production         -- 生产环境
```

### 8.2 命名规则

- 浏览器端可访问: 必须以 NEXT_PUBLIC_ 开头
- 仅服务端可访问: 不加 NEXT_PUBLIC_ 前缀

```
# 仅服务端
DATABASE_URL=postgresql://localhost:5432/mydb
JWT_SECRET=your-secret-key

# 浏览器端 + 服务端
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_APP_NAME=My App
```

### 8.3 使用方式

```typescript
// 服务端 (Server Component, API Route)
const dbUrl = process.env.DATABASE_URL;

// 客户端 (Client Component)
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```
