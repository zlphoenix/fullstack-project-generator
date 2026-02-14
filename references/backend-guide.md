# Spring Boot 后端开发指南

## 一、分层架构

### 1.1 三层职责划分

```
Controller (表现层)
  - 接收 HTTP 请求, 参数校验 (@Valid)
  - 调用 Service 层, 返回统一响应格式
  - 不包含业务逻辑

Service (业务层)
  - 实现核心业务逻辑
  - 事务管理 (@Transactional)
  - 调用 Repository 层进行数据操作
  - DTO <-> Entity 转换

Repository (数据层)
  - 数据库 CRUD 操作
  - 继承 JpaRepository
  - 自定义查询方法 (@Query)
```

### 1.2 数据流向

```
Request -> Controller -> Service -> Repository -> Database
                |             |
              DTO/VO      Entity <-> DTO
```

## 二、包结构规范

```
com.example.projectname/
  config/             -- 配置类: SecurityConfig, WebConfig, SwaggerConfig
  controller/         -- REST 控制器
  service/            -- 业务逻辑接口和实现
    impl/             -- Service 实现类
  repository/         -- JPA Repository 接口
  model/              -- 数据模型
    entity/           -- JPA Entity 类
    dto/              -- 数据传输对象 (Request/Response)
    enums/            -- 枚举类型
  exception/          -- 自定义异常和全局异常处理
  security/           -- JWT, Filter, UserDetails 相关
  util/               -- 工具类
```

## 三、命名规范

### 3.1 类命名

| 类型 | 命名规则 | 示例 |
|------|----------|------|
| Entity | 单数名词 | User, Order, OrderItem |
| Repository | Entity名 + Repository | UserRepository |
| Service 接口 | Entity名 + Service | UserService |
| Service 实现 | Entity名 + ServiceImpl | UserServiceImpl |
| Controller | Entity名 + Controller | UserController |
| DTO (请求) | 动作 + Entity名 + Request | CreateUserRequest |
| DTO (响应) | Entity名 + Response | UserResponse |
| 异常 | 描述 + Exception | ResourceNotFoundException |

### 3.2 方法命名

| 操作 | Controller 方法 | Service 方法 |
|------|----------------|--------------|
| 查询列表 | getUsers() | findAll() / findByStatus() |
| 查询单个 | getUserById() | findById() |
| 创建 | createUser() | create() |
| 更新 | updateUser() | update() |
| 删除 | deleteUser() | delete() |

### 3.3 URL 路径

- 基础前缀: /api/v1/
- 资源名: 名词复数, kebab-case
- 示例: /api/v1/users, /api/v1/order-items, /api/v1/users/{id}/orders

## 四、异常处理

### 4.1 统一响应格式

```java
public class ApiResponse<T> {
    private int code;
    private String message;
    private T data;

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(200, "success", data);
    }

    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, message, null);
    }
}
```

### 4.2 自定义异常

```java
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String resource, Long id) {
        super(resource + " not found with id: " + id);
    }
}

public class BusinessException extends RuntimeException {
    private final int code;
    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }
}
```

### 4.3 全局异常处理

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiResponse<Void> handleNotFound(ResourceNotFoundException ex) {
        return ApiResponse.error(404, ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .collect(Collectors.joining(", "));
        return ApiResponse.error(400, message);
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleGeneral(Exception ex) {
        log.error("Unexpected error", ex);
        return ApiResponse.error(500, "Internal server error");
    }
}
```

## 五、数据库设计

### 5.1 表命名规范

- 使用 snake_case: user_order, order_item
- 表名使用单数: user (不用 users)
- 关联表: user_role (两个实体名连接)

### 5.2 BaseEntity

```java
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
```

### 5.3 索引策略

- 外键字段必须加索引
- 频繁用于 WHERE 查询的字段加索引
- 组合查询考虑联合索引, 遵循最左匹配原则
- 使用 @Table(indexes = @Index(...)) 声明索引

## 六、安全配置

### 6.1 Spring Security + JWT 基本配置

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(sm -> sm.sessionPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
```

### 6.2 JWT Token 生成要点

- 使用 io.jsonwebtoken (jjwt) 库
- Token 包含: userId, username, roles
- Access Token 有效期: 15-60 分钟
- Refresh Token 有效期: 7-30 天
- Secret Key 从环境变量读取, 不硬编码

## 七、日志规范

### 7.1 使用 SLF4J + Logback

```java
@Slf4j  // Lombok annotation
public class UserServiceImpl implements UserService {

    public UserResponse findById(Long id) {
        log.debug("Finding user by id: {}", id);
        // ...
        log.info("User found: {}", user.getUsername());
    }
}
```

### 7.2 日志级别使用原则

| 级别 | 用途 | 示例 |
|------|------|------|
| ERROR | 系统错误, 需要立即关注 | 数据库连接失败, 外部服务不可用 |
| WARN | 潜在问题, 不影响主流程 | 重试操作, 配置缺失使用默认值 |
| INFO | 业务关键节点 | 用户注册成功, 订单创建完成 |
| DEBUG | 开发调试信息 | 方法参数, SQL 查询, 中间计算结果 |

## 八、API 版本管理

- 使用 URL 路径前缀: /api/v1/, /api/v2/
- 不同版本的 Controller 放在不同包中: controller.v1, controller.v2
- 版本升级时保持旧版本可用, 标记 @Deprecated
- 在 Swagger 文档中标注版本信息
