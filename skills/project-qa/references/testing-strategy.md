# 多平台测试策略指南

## 一、测试金字塔

### 1.1 分层比例

```
        /  E2E  \           10% -- 端到端测试, 验证完整用户流程
       /  Tests  \
      /----------\
     / Integration\         20% -- 集成测试, 验证模块间交互
    /    Tests     \
   /----------------\
  /   Unit Tests     \      70% -- 单元测试, 验证单个函数/方法
 /____________________\
```

### 1.2 各层特点

| 层级 | 速度 | 成本 | 稳定性 | 覆盖粒度 |
|------|------|------|--------|---------|
| 单元测试 | 极快 (毫秒级) | 低 | 高 | 单个函数/方法 |
| 集成测试 | 中等 (秒级) | 中 | 中 | 模块间交互 |
| E2E 测试 | 慢 (分钟级) | 高 | 较低 | 完整用户流程 |

### 1.3 测试命名规范

所有平台统一命名格式: `methodName_condition_expectedResult`

```
createUser_withValidData_returnsCreatedUser
createUser_withDuplicateEmail_throwsConflictException
login_withInvalidPassword_returnsUnauthorized
```

## 二、后端测试: Spring Boot

### 2.1 单元测试: JUnit 5 + Mockito

```java
@ExtendWith(MockitoExtension.class)
class UserServiceImplTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserServiceImpl userService;

    @Test
    void findById_withExistingId_returnsUser() {
        // Arrange
        User user = new User(1L, "Alice", "alice@example.com");
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));

        // Act
        UserResponse result = userService.findById(1L);

        // Assert
        assertThat(result.getName()).isEqualTo("Alice");
        assertThat(result.getEmail()).isEqualTo("alice@example.com");
        verify(userRepository).findById(1L);
    }

    @Test
    void findById_withNonExistingId_throwsNotFoundException() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
            () -> userService.findById(99L));
    }

    @Test
    void create_withDuplicateEmail_throwsConflictException() {
        CreateUserRequest request = new CreateUserRequest("Bob", "alice@example.com", "password");
        when(userRepository.existsByEmail("alice@example.com")).thenReturn(true);

        assertThrows(BusinessException.class,
            () -> userService.create(request));
    }
}
```

### 2.2 Controller 测试: @WebMvcTest + MockMvc

```java
@WebMvcTest(UserController.class)
class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void getUsers_returnsUserList() throws Exception {
        List<UserResponse> users = List.of(
            new UserResponse(1L, "Alice", "alice@example.com", LocalDateTime.now())
        );
        when(userService.findAll(any())).thenReturn(new PageImpl<>(users));

        mockMvc.perform(get("/api/v1/users")
                .param("page", "0")
                .param("size", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.data.content[0].name").value("Alice"));
    }

    @Test
    void createUser_withInvalidData_returnsBadRequest() throws Exception {
        String invalidJson = """
            { "name": "", "email": "not-an-email", "password": "123" }
            """;

        mockMvc.perform(post("/api/v1/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalidJson))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(400));
    }
}
```

### 2.3 Repository 测试: @DataJpaTest

```java
@DataJpaTest
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Test
    void findByEmail_withExistingEmail_returnsUser() {
        User user = new User(null, "Alice", "alice@example.com");
        userRepository.save(user);

        Optional<User> result = userRepository.findByEmail("alice@example.com");

        assertThat(result).isPresent();
        assertThat(result.get().getName()).isEqualTo("Alice");
    }

    @Test
    void existsByEmail_withNonExistingEmail_returnsFalse() {
        boolean exists = userRepository.existsByEmail("nobody@example.com");
        assertThat(exists).isFalse();
    }
}
```

### 2.4 集成测试: Testcontainers

```java
@SpringBootTest
@Testcontainers
class UserIntegrationTest {

    @Container
    static MySQLContainer<?> mysql = new MySQLContainer<>("mysql:8.0")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mysql::getJdbcUrl);
        registry.add("spring.datasource.username", mysql::getUsername);
        registry.add("spring.datasource.password", mysql::getPassword);
    }

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    void fullUserLifecycle() {
        // Create
        CreateUserRequest request = new CreateUserRequest("Alice", "alice@example.com", "password");
        ResponseEntity<ApiResponse> createResp = restTemplate.postForEntity(
            "/api/v1/users", request, ApiResponse.class);
        assertThat(createResp.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        // Read
        ResponseEntity<ApiResponse> getResp = restTemplate.getForEntity(
            "/api/v1/users/1", ApiResponse.class);
        assertThat(getResp.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
```

## 三、iOS 测试: XCTest

### 3.1 ViewModel 单元测试

```swift
final class UserViewModelTests: XCTestCase {

    func test_fetchUsers_success_updatesUsersList() async {
        let mockService = MockUserService()
        mockService.mockUsers = [User(id: 1, name: "Alice", email: "alice@example.com")]

        let viewModel = UserViewModel(userService: mockService)
        await viewModel.fetchUsers()

        XCTAssertEqual(viewModel.users.count, 1)
        XCTAssertEqual(viewModel.users.first?.name, "Alice")
        XCTAssertFalse(viewModel.isLoading)
        XCTAssertNil(viewModel.errorMessage)
    }

    func test_fetchUsers_failure_setsErrorMessage() async {
        let mockService = MockUserService()
        mockService.shouldFail = true

        let viewModel = UserViewModel(userService: mockService)
        await viewModel.fetchUsers()

        XCTAssertTrue(viewModel.users.isEmpty)
        XCTAssertNotNil(viewModel.errorMessage)
    }
}
```

### 3.2 Mock Service 编写

```swift
class MockUserService: UserServiceProtocol {
    var mockUsers: [User] = []
    var shouldFail = false

    func getUsers() async throws -> [User] {
        if shouldFail { throw APIError.httpError(statusCode: 500) }
        return mockUsers
    }
}
```

## 四、Android 测试: JUnit + Mockk

### 4.1 ViewModel 测试

```kotlin
@OptIn(ExperimentalCoroutinesApi::class)
class UserViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val userRepository = mockk<UserRepository>()
    private lateinit var viewModel: UserViewModel

    @Test
    fun `loadUsers success updates state with users`() = runTest {
        val users = listOf(UserResponse(1, "Alice", "alice@example.com", "2024-01-01"))
        coEvery { userRepository.getUsers() } returns ApiResponse(200, "success", PageData(users, 0, 20, 1, 1))

        viewModel = UserViewModel(userRepository)
        viewModel.loadUsers()

        val state = viewModel.uiState.value
        assertEquals(1, state.users.size)
        assertEquals("Alice", state.users.first().name)
        assertFalse(state.isLoading)
    }

    @Test
    fun `loadUsers failure updates state with error`() = runTest {
        coEvery { userRepository.getUsers() } throws RuntimeException("Network error")

        viewModel = UserViewModel(userRepository)
        viewModel.loadUsers()

        val state = viewModel.uiState.value
        assertTrue(state.users.isEmpty())
        assertEquals("Network error", state.error)
    }
}
```

### 4.2 Compose UI 测试

```kotlin
class UserListScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun userList_displaysUsers() {
        val users = listOf(
            UserResponse(1, "Alice", "alice@example.com", "2024-01-01"),
            UserResponse(2, "Bob", "bob@example.com", "2024-01-02")
        )

        composeRule.setContent {
            UserList(users = users, onUserClick = {})
        }

        composeRule.onNodeWithText("Alice").assertIsDisplayed()
        composeRule.onNodeWithText("Bob").assertIsDisplayed()
    }
}
```

## 五、Web 前端测试: Jest + React Testing Library

### 5.1 组件测试

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserList } from '@/components/features/UserList';

describe('UserList', () => {
    it('renders user names', () => {
        const users = [
            { id: 1, name: 'Alice', email: 'alice@example.com' },
            { id: 2, name: 'Bob', email: 'bob@example.com' }
        ];

        render(<UserList users={users} />);

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('calls onDelete when delete button clicked', async () => {
        const onDelete = jest.fn();
        const users = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];

        render(<UserList users={users} onDelete={onDelete} />);
        await userEvent.click(screen.getByRole('button', { name: /delete/i }));

        expect(onDelete).toHaveBeenCalledWith(1);
    });
});
```

### 5.2 E2E 测试: Playwright

```typescript
import { test, expect } from '@playwright/test';

test('user can login and view dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
});
```

## 六、API 契约测试

### 6.1 契约测试的目的

确保前后端对 API 接口的理解一致:
- 后端实现与 OpenAPI 规范一致
- 前端请求格式符合 OpenAPI 规范
- 响应数据结构符合约定

### 6.2 后端契约验证: Spring REST Docs 或 Swagger Validator

```java
@Test
void createUser_response_matchesOpenApiSchema() throws Exception {
    String validRequest = """
        { "name": "Alice", "email": "alice@example.com", "password": "password123" }
        """;

    MvcResult result = mockMvc.perform(post("/api/v1/users")
            .contentType(MediaType.APPLICATION_JSON)
            .content(validRequest))
        .andExpect(status().isCreated())
        .andReturn();

    // 验证响应 JSON 结构包含必要字段
    String json = result.getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(json);
    assertThat(ctx.read("$.code", Integer.class)).isEqualTo(201);
    assertThat(ctx.read("$.data.id", Long.class)).isNotNull();
    assertThat(ctx.read("$.data.name", String.class)).isEqualTo("Alice");
    assertThat(ctx.read("$.data.email", String.class)).isEqualTo("alice@example.com");
}
```
