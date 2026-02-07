# 后端模板参考 (Spring Boot)

## 技术栈

- Spring Boot 3.3.6 + Java 21
- Spring Web / JPA / Validation / Security
- springdoc-openapi（Swagger UI）
- MySQL 8 + H2（开发环境）
- Lombok

## 目录结构

```
backend/
├── src/main/java/com/example/app/
│   ├── Application.java         # 启动入口
│   ├── config/
│   │   ├── SecurityConfig.java  # 安全配置（CORS、无状态Session）
│   │   └── OpenApiConfig.java   # Swagger 文档配置
│   ├── controller/
│   │   └── HealthController.java # 健康检查端点
│   ├── service/                  # 业务逻辑层（待填充）
│   ├── repository/               # 数据访问层（待填充）
│   ├── model/
│   │   └── BaseEntity.java      # 基础实体（id, createdAt, updatedAt）
│   ├── dto/
│   │   └── ApiResponse.java     # 统一响应信封
│   └── exception/
│       └── GlobalExceptionHandler.java  # 全局异常处理
├── src/main/resources/
│   ├── application.yml          # 默认配置
│   └── application-dev.yml      # 开发环境配置（H2内存库）
├── src/test/java/
│   └── ApplicationTests.java
└── pom.xml
```

## 核心文件说明

### SecurityConfig.java

- 禁用 CSRF（REST API 不需要）
- 无状态 Session（配合 JWT）
- CORS 允许所有来源（开发环境）
- 所有请求默认放行（需根据业务添加鉴权规则）

### ApiResponse.java

统一 API 响应格式：

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

提供 `success(data)` 和 `error(code, message)` 静态工厂方法。

### BaseEntity.java

所有实体的基类：

- `id`: Long, 自增主键
- `createdAt`: LocalDateTime, 自动填充
- `updatedAt`: LocalDateTime, 自动更新

### GlobalExceptionHandler.java

统一捕获异常，返回标准 `ApiResponse` 格式。

## 新增业务模块流程

以添加「用户管理」模块为例：

### 1. 创建实体

```java
// model/User.java
@Entity
@Table(name = "users")
public class User extends BaseEntity {
    private String name;
    private String email;
    // getter/setter...
}
```

### 2. 创建 Repository

```java
// repository/UserRepository.java
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
}
```

### 3. 创建 Service

```java
// service/UserService.java
@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;

    public List<User> findAll() {
        return userRepository.findAll();
    }
}
```

### 4. 创建 Controller

```java
// controller/UserController.java
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;

    @GetMapping
    public ApiResponse<List<User>> list() {
        return ApiResponse.success(userService.findAll());
    }
}
```

## 数据库配置

### 开发环境（H2 内存库）

`application-dev.yml` 已配置 H2：

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:devdb
  jpa:
    hibernate:
      ddl-auto: create-drop
  h2:
    console:
      enabled: true   # 访问 /h2-console
```

### 生产环境（MySQL）

修改 `application.yml`：

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/your-db
    username: root
    password: your-password
  jpa:
    hibernate:
      ddl-auto: validate
```

## 开发命令

```bash
mvn spring-boot:run                          # 启动（默认 profile）
mvn spring-boot:run -Dspring-boot.run.profiles=dev  # 开发环境启动
mvn package -DskipTests                      # 打包
mvn test                                     # 运行测试
```

启动后访问：
- API: http://localhost:8080
- Swagger UI: http://localhost:8080/swagger-ui.html
- H2 Console: http://localhost:8080/h2-console（dev profile）
