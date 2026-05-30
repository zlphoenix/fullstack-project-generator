# RESTful API 设计指南

## 一、URL 命名规范

### 1.1 基本规则

- 使用名词复数表示资源集合: /users, /orders
- 使用 kebab-case (连字符分隔): /order-items, /user-profiles
- 永远小写, 不使用 camelCase 或 snake_case
- 使用路径嵌套表示从属关系: /users/{id}/orders

### 1.2 URL 示例

```
GET    /api/v1/users                    -- 获取用户列表
GET    /api/v1/users/{id}               -- 获取单个用户
POST   /api/v1/users                    -- 创建用户
PUT    /api/v1/users/{id}               -- 全量更新用户
PATCH  /api/v1/users/{id}               -- 部分更新用户
DELETE /api/v1/users/{id}               -- 删除用户
GET    /api/v1/users/{id}/orders        -- 获取用户的订单列表
POST   /api/v1/users/{id}/orders        -- 为用户创建订单
GET    /api/v1/order-items/{id}         -- 获取单个订单项
```

### 1.3 避免的写法

```
错误: /api/v1/getUsers          -- 不要在 URL 中使用动词
错误: /api/v1/user              -- 不要使用单数
错误: /api/v1/user_profiles     -- 不要使用 snake_case
错误: /api/v1/userProfiles      -- 不要使用 camelCase
```

## 二、HTTP 方法语义

| 方法 | 语义 | 幂等性 | 请求体 | 典型响应码 |
|------|------|--------|--------|-----------|
| GET | 获取资源 | 幂等 | 无 | 200 |
| POST | 创建资源 | 非幂等 | 有 | 201 |
| PUT | 全量替换资源 | 幂等 | 有 | 200 |
| PATCH | 部分更新资源 | 幂等 | 有 | 200 |
| DELETE | 删除资源 | 幂等 | 无 | 204 |

关键区分:
- PUT vs PATCH: PUT 需要提交资源的全部字段, PATCH 只提交需要修改的字段
- POST vs PUT: POST 创建新资源 (服务端生成 ID), PUT 替换指定 ID 的资源

## 三、HTTP 状态码

### 3.1 成功 (2xx)

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 200 OK | 请求成功 | GET/PUT/PATCH 成功 |
| 201 Created | 资源已创建 | POST 创建成功 |
| 204 No Content | 无返回内容 | DELETE 成功 |

### 3.2 客户端错误 (4xx)

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 400 Bad Request | 请求参数错误 | 参数格式不正确, 缺少必填字段 |
| 401 Unauthorized | 未认证 | 未提供 Token 或 Token 已过期 |
| 403 Forbidden | 无权限 | Token 有效但权限不足 |
| 404 Not Found | 资源不存在 | 请求的 ID 对应的资源不存在 |
| 409 Conflict | 资源冲突 | 邮箱已注册, 用户名已存在 |
| 422 Unprocessable Entity | 语义错误 | 参数格式正确但业务逻辑不允许 |

### 3.3 服务端错误 (5xx)

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 500 Internal Server Error | 服务器内部错误 | 未捕获的异常 |

## 四、分页设计

### 4.1 请求参数

```
GET /api/v1/users?page=0&size=20
```

- page: 页码, 从 0 开始 (与 Spring Data 保持一致)
- size: 每页条数, 默认 20, 最大 100

### 4.2 响应格式

```json
{
    "code": 200,
    "message": "success",
    "data": {
        "content": [
            { "id": 1, "name": "Alice", "email": "alice@example.com" },
            { "id": 2, "name": "Bob", "email": "bob@example.com" }
        ],
        "page": 0,
        "size": 20,
        "totalElements": 58,
        "totalPages": 3
    }
}
```

## 五、过滤与排序

### 5.1 过滤

使用查询参数进行字段过滤:

```
GET /api/v1/users?status=active
GET /api/v1/orders?status=pending&minAmount=100
GET /api/v1/products?category=electronics&minPrice=50&maxPrice=200
```

### 5.2 排序

使用 sort 参数, 格式为 field,direction:

```
GET /api/v1/users?sort=createdAt,desc
GET /api/v1/products?sort=price,asc&sort=name,asc
```

### 5.3 组合使用

```
GET /api/v1/orders?status=completed&sort=createdAt,desc&page=0&size=20
```

## 六、统一响应格式

### 6.1 基本结构

```json
{
    "code": 200,
    "message": "success",
    "data": { ... }
}
```

### 6.2 成功响应示例

单个资源:

```json
{
    "code": 200,
    "message": "success",
    "data": {
        "id": 1,
        "name": "Alice",
        "email": "alice@example.com",
        "createdAt": "2024-01-15T10:30:00"
    }
}
```

创建成功:

```json
{
    "code": 201,
    "message": "User created successfully",
    "data": {
        "id": 42,
        "name": "Charlie",
        "email": "charlie@example.com"
    }
}
```

### 6.3 错误响应示例

```json
{
    "code": 400,
    "message": "email: must not be blank, name: size must be between 2 and 50",
    "data": null
}
```

```json
{
    "code": 404,
    "message": "User not found with id: 99",
    "data": null
}
```

## 七、OpenAPI 3.0 示例片段

```yaml
openapi: 3.0.3
info:
  title: Project API
  version: 1.0.0

paths:
  /api/v1/users:
    get:
      summary: Get user list
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 0
        - name: size
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserPageResponse'
    post:
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiResponseUser'

components:
  schemas:
    CreateUserRequest:
      type: object
      required: [name, email, password]
      properties:
        name:
          type: string
          minLength: 2
          maxLength: 50
        email:
          type: string
          format: email
        password:
          type: string
          minLength: 8
    UserResponse:
      type: object
      properties:
        id:
          type: integer
          format: int64
        name:
          type: string
        email:
          type: string
        createdAt:
          type: string
          format: date-time
```

## 八、版本控制

- 使用 URL 路径方式: /api/v1/, /api/v2/
- 版本号只在发生不兼容变更时递增
- 旧版本至少维护一个发布周期, 给客户端迁移时间
- 在响应头中标注当前版本: X-API-Version: v1
- 在 OpenAPI 文档中清晰标注不同版本的变更内容
