# Scrum/Sprint 敏捷开发方法论 -- AI 辅助全栈开发

## 一、Sprint 规划流程

### 1.1 需求分解层次

需求从粗到细分为三个层次:

- Epic: 大型业务目标, 通常跨越多个 Sprint (例: "用户管理系统")
- Feature: Epic 下的功能模块, 可在 1-2 个 Sprint 内完成 (例: "用户注册与登录")
- User Story: Feature 下的最小可交付单元, 可在 1-3 天内完成

分解示例:

```
Epic: 电商平台订单系统
  Feature: 购物车管理
    Story: 用户可以将商品添加到购物车
    Story: 用户可以修改购物车中商品的数量
    Story: 用户可以从购物车中移除商品
  Feature: 订单创建
    Story: 用户可以从购物车生成订单
    Story: 用户可以选择收货地址
    Story: 用户可以查看订单确认页
```

### 1.2 Sprint 节奏

- Sprint 周期: 建议 1-2 周
- Sprint Planning: Sprint 第一天, 从 Backlog 中选取本轮 Story
- Daily Standup: 每天 15 分钟, 同步进度与阻塞
- Sprint Review: Sprint 最后一天, 演示可工作的功能
- Sprint Retrospective: 回顾改进点

## 二、User Story 编写规范

### 2.1 标准格式

```
As a [角色],
I want [功能/行为],
So that [业务价值/目的].
```

### 2.2 编写示例

```
As a 注册用户,
I want 通过邮箱和密码登录系统,
So that 我可以访问我的个人数据和订单信息.
```

### 2.3 INVEST 原则

每个 User Story 应满足:

- Independent: 尽量独立, 减少 Story 之间的依赖
- Negotiable: 细节可协商, 不是固定合同
- Valuable: 对用户或业务有明确价值
- Estimable: 团队能够估算工作量
- Small: 足够小, 可在一个 Sprint 内完成
- Testable: 有明确的验收标准

## 三、验收标准 (Acceptance Criteria)

### 3.1 Given/When/Then 模板

```
Given [前置条件/初始状态],
When [用户执行的操作],
Then [期望的结果].
```

### 3.2 验收标准示例

Story: 用户通过邮箱和密码登录系统

```
Scenario 1: 登录成功
  Given 用户已注册, 邮箱为 "user@example.com", 密码为 "Password123"
  When 用户输入正确的邮箱和密码并点击登录
  Then 系统返回 200 状态码和 JWT token
  And 用户跳转到首页

Scenario 2: 密码错误
  Given 用户已注册, 邮箱为 "user@example.com"
  When 用户输入正确的邮箱但错误的密码并点击登录
  Then 系统返回 401 状态码
  And 页面显示 "邮箱或密码错误" 的提示信息

Scenario 3: 邮箱未注册
  Given 邮箱 "unknown@example.com" 未在系统中注册
  When 用户输入该邮箱和任意密码并点击登录
  Then 系统返回 401 状态码
  And 页面显示 "邮箱或密码错误" 的提示信息
```

## 四、MVP 优先策略

### 4.1 MoSCoW 优先级矩阵

| 优先级 | 含义 | 说明 | 占比建议 |
|--------|------|------|----------|
| Must Have | 必须有 | 没有这些功能产品无法上线 | 约 60% |
| Should Have | 应该有 | 重要但不影响核心流程 | 约 20% |
| Could Have | 可以有 | 锦上添花, 时间允许再做 | 约 15% |
| Won't Have | 暂不做 | 明确排除在本阶段之外 | 约 5% |

### 4.2 MVP 功能筛选流程

1. 列出所有 Feature 和 User Story
2. 用 MoSCoW 标记每个 Story 的优先级
3. 第一个 Sprint 只做 Must Have 中的核心 Story
4. 后续 Sprint 逐步纳入 Should Have 和 Could Have

### 4.3 AI 辅助开发的 MVP 建议

在 AI 辅助生成项目时:

- 第一轮生成: 只生成 Must Have 的完整代码 (含前后端和数据库)
- 第二轮迭代: 根据反馈补充 Should Have 功能
- 保持每轮输出可运行、可测试的完整代码

## 五、API 契约驱动开发

### 5.1 契约先行原则

在编码之前先定义 API 契约 (OpenAPI 3.0 规范):

1. 产品经理和开发团队一起确定 API 端点和数据结构
2. 编写 OpenAPI YAML/JSON 规范文件
3. 前端根据契约使用 Mock 数据开发
4. 后端根据契约实现 API 逻辑
5. 前后端并行开发, 最终通过契约集成

### 5.2 并行开发流程

```
Sprint 开始
  |-- 前端: 根据 OpenAPI 契约生成 TypeScript 类型 -> 使用 Mock 数据开发页面
  |-- 后端: 根据 OpenAPI 契约实现 Controller/Service/Repository
  |-- 测试: 根据 OpenAPI 契约编写 API 集成测试
Sprint 中期
  |-- 前后端联调: 替换 Mock 为真实 API
Sprint 结束
  |-- 交付可演示的功能
```

### 5.3 契约变更管理

- 契约变更需前后端共同评审
- 使用版本号管理契约 (/api/v1/, /api/v2/)
- 变更记录在 CHANGELOG 中

## 六、Sprint 评审清单

每个 Sprint 结束前, 逐项检查:

### 6.1 功能完整性

- [ ] 所有 Must Have 的 Story 已完成
- [ ] 验收标准全部通过
- [ ] 前后端联调通过
- [ ] 无已知的阻塞性 Bug

### 6.2 代码质量

- [ ] 代码已通过 Code Review
- [ ] 单元测试覆盖率达标 (建议 >= 70%)
- [ ] 无编译警告或 Lint 错误
- [ ] API 契约与实现一致

### 6.3 部署与运维

- [ ] Docker 镜像构建成功
- [ ] docker-compose 可一键启动完整环境
- [ ] 健康检查端点可用
- [ ] 环境变量配置文档已更新

### 6.4 文档与沟通

- [ ] API 文档 (Swagger UI) 可访问
- [ ] 新功能的使用说明已编写
- [ ] Sprint Review 演示材料已准备
- [ ] 下个 Sprint 的 Backlog 已初步梳理
