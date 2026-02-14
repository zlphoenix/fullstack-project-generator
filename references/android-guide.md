# Kotlin / Jetpack Compose Android 开发指南

## 一、MVVM + Hilt 架构

### 1.1 分层职责

```
Screen (@Composable)
  - Jetpack Compose 声明式 UI
  - 观察 ViewModel 状态, 展示数据
  - 将用户操作委托给 ViewModel

ViewModel (@HiltViewModel)
  - 持有 UI 状态 (StateFlow)
  - 处理业务逻辑
  - 调用 Repository 获取数据

Repository
  - 数据访问的统一入口
  - 协调 Remote DataSource 和 Local DataSource
  - 决定数据来源策略 (网络优先 / 缓存优先)

DataSource
  - Remote: Retrofit API 调用
  - Local: Room 数据库操作
```

### 1.2 数据流向

```
Screen -- 用户事件 --> ViewModel -- 调用 --> Repository -- 调用 --> DataSource
Screen <-- StateFlow -- ViewModel <-- Result -- Repository <-- Response -- DataSource
```

## 二、Hilt 依赖注入

### 2.1 基础配置

```kotlin
// Application 类
@HiltAndroidApp
class MyApplication : Application()

// Activity
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MyAppTheme {
                AppNavigation()
            }
        }
    }
}
```

### 2.2 Module 定义

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor())
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            })
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit {
        return Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    @Provides
    @Singleton
    fun provideUserApi(retrofit: Retrofit): UserApi {
        return retrofit.create(UserApi::class.java)
    }
}

@Module
@InstallIn(SingletonComponent::class)
object RepositoryModule {

    @Provides
    @Singleton
    fun provideUserRepository(userApi: UserApi): UserRepository {
        return UserRepositoryImpl(userApi)
    }
}
```

### 2.3 ViewModel 注入

```kotlin
@HiltViewModel
class UserViewModel @Inject constructor(
    private val userRepository: UserRepository
) : ViewModel() {
    // ...
}
```

## 三、Retrofit 网络层

### 3.1 API 接口定义

```kotlin
interface UserApi {

    @GET("api/v1/users")
    suspend fun getUsers(
        @Query("page") page: Int = 0,
        @Query("size") size: Int = 20
    ): ApiResponse<PageData<UserResponse>>

    @GET("api/v1/users/{id}")
    suspend fun getUserById(@Path("id") id: Long): ApiResponse<UserResponse>

    @POST("api/v1/users")
    suspend fun createUser(@Body request: CreateUserRequest): ApiResponse<UserResponse>

    @PUT("api/v1/users/{id}")
    suspend fun updateUser(
        @Path("id") id: Long,
        @Body request: UpdateUserRequest
    ): ApiResponse<UserResponse>

    @DELETE("api/v1/users/{id}")
    suspend fun deleteUser(@Path("id") id: Long): ApiResponse<Unit>
}
```

### 3.2 数据模型

```kotlin
data class ApiResponse<T>(
    val code: Int,
    val message: String,
    val data: T?
)

data class PageData<T>(
    val content: List<T>,
    val page: Int,
    val size: Int,
    val totalElements: Long,
    val totalPages: Int
)

data class UserResponse(
    val id: Long,
    val name: String,
    val email: String,
    val createdAt: String
)

data class CreateUserRequest(
    val name: String,
    val email: String,
    val password: String
)
```

### 3.3 AuthInterceptor

```kotlin
class AuthInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = TokenManager.getToken()
        val request = if (token != null) {
            chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } else {
            chain.request()
        }
        return chain.proceed(request)
    }
}
```

## 四、Compose Navigation

### 4.1 路由定义

```kotlin
sealed class Screen(val route: String) {
    data object Home : Screen("home")
    data object UserList : Screen("users")
    data object UserDetail : Screen("users/{userId}") {
        fun createRoute(userId: Long) = "users/$userId"
    }
    data object Settings : Screen("settings")
}
```

### 4.2 NavHost 配置

```kotlin
@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Screen.Home.route) {
        composable(Screen.Home.route) {
            HomeScreen(navController = navController)
        }
        composable(Screen.UserList.route) {
            UserListScreen(navController = navController)
        }
        composable(
            route = Screen.UserDetail.route,
            arguments = listOf(navArgument("userId") { type = NavType.LongType })
        ) { backStackEntry ->
            val userId = backStackEntry.arguments?.getLong("userId") ?: return@composable
            UserDetailScreen(userId = userId, navController = navController)
        }
        composable(Screen.Settings.route) {
            SettingsScreen(navController = navController)
        }
    }
}
```

## 五、状态管理

### 5.1 ViewModel 中的 StateFlow

```kotlin
@HiltViewModel
class UserViewModel @Inject constructor(
    private val userRepository: UserRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(UserUiState())
    val uiState: StateFlow<UserUiState> = _uiState.asStateFlow()

    fun loadUsers() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val response = userRepository.getUsers()
                _uiState.update { it.copy(users = response.data?.content.orEmpty(), isLoading = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message, isLoading = false) }
            }
        }
    }
}

data class UserUiState(
    val users: List<UserResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)
```

### 5.2 Screen 中收集状态

```kotlin
@Composable
fun UserListScreen(
    navController: NavController,
    viewModel: UserViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadUsers()
    }

    when {
        uiState.isLoading -> LoadingIndicator()
        uiState.error != null -> ErrorMessage(uiState.error!!)
        else -> UserList(
            users = uiState.users,
            onUserClick = { userId ->
                navController.navigate(Screen.UserDetail.createRoute(userId))
            }
        )
    }
}
```

## 六、Material 3 常用组件

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScaffold(navController: NavController, content: @Composable (PaddingValues) -> Unit) {
    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My App") },
                actions = {
                    IconButton(onClick = { navController.navigate(Screen.Settings.route) }) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0; navController.navigate(Screen.Home.route) },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Home") }
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1; navController.navigate(Screen.UserList.route) },
                    icon = { Icon(Icons.Default.Person, contentDescription = "Users") },
                    label = { Text("Users") }
                )
            }
        }
    ) { paddingValues ->
        content(paddingValues)
    }
}
```

## 七、代码组织: Feature-based Packages

```
com.example.myapp/
  di/                         -- Hilt Modules
    NetworkModule.kt
    RepositoryModule.kt
  data/                       -- 数据层
    remote/
      api/
        UserApi.kt
      model/
        ApiResponse.kt
        UserResponse.kt
    repository/
      UserRepository.kt
      UserRepositoryImpl.kt
  ui/                         -- 表现层 (按功能模块)
    home/
      HomeScreen.kt
      HomeViewModel.kt
    user/
      list/
        UserListScreen.kt
      detail/
        UserDetailScreen.kt
      UserViewModel.kt
    common/                   -- 共享 UI 组件
      LoadingIndicator.kt
      ErrorMessage.kt
  navigation/
    AppNavigation.kt
    Screen.kt
  util/
    TokenManager.kt
    Extensions.kt
  MyApplication.kt
  MainActivity.kt
```
