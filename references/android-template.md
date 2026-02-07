# Android 模板参考 (Kotlin/Compose)

## 技术栈

- Kotlin + Jetpack Compose (BOM 2024.02.00)
- Material Design 3
- Hilt (依赖注入, v2.50)
- Retrofit + OkHttp + Gson (网络请求)
- Navigation Compose (页面导航)
- Coroutines (异步操作)

## 目录结构

```
android/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/com/example/app/
│           ├── MainActivity.kt       # Activity 入口，Hilt 注入
│           ├── MainApp.kt            # Application 类（@HiltAndroidApp）
│           ├── data/
│           │   ├── network/
│           │   │   └── ApiClient.kt  # Retrofit + OkHttp DI 模块
│           │   └── model/
│           │       └── User.kt       # 数据模型
│           └── ui/
│               ├── screens/
│               │   └── HomeScreen.kt # 首页 + 个人页 Composable
│               └── navigation/
│                   └── AppNavigation.kt  # 底部导航 + NavHost
├── build.gradle.kts                  # 项目级 Gradle
├── gradle.properties
└── settings.gradle.kts
```

## 核心文件说明

### MainApp.kt

使用 `@HiltAndroidApp` 注解，启用 Hilt 依赖注入。

### MainActivity.kt

使用 `@AndroidEntryPoint` 注解，在 `setContent` 中加载 `AppNavigation` Composable。

### ApiClient.kt

Hilt 模块，提供全局单例的网络层：

- `OkHttpClient`: 30s 超时、日志拦截器、Auth Token 拦截器
- `Retrofit`: 配置 baseURL (`http://10.0.2.2:8080/` 模拟器访问本地后端)、Gson 解析

### AppNavigation.kt

底部导航架构：

- `Screen` sealed class 定义路由（Home、Profile）
- `Scaffold` + `NavigationBar` 实现底部标签
- `NavHost` 管理页面切换，支持状态保存和恢复

## 定制指南

### 新增页面

1. 在 `ui/screens/` 创建 Composable 函数
2. 在 `AppNavigation.kt` 的 `Screen` sealed class 添加路由定义
3. 在 `NavHost` 中注册 `composable` 路由

### 新增 API 接口

1. 创建 Retrofit Service 接口：

```kotlin
// data/network/UserService.kt
interface UserService {
    @GET("api/v1/users")
    suspend fun getUsers(): ApiResponse<List<User>>
}
```

2. 在 `ApiClient.kt` 添加 Provides：

```kotlin
@Provides
@Singleton
fun provideUserService(retrofit: Retrofit): UserService {
    return retrofit.create(UserService::class.java)
}
```

### 新增 ViewModel

```kotlin
@HiltViewModel
class UserViewModel @Inject constructor(
    private val userService: UserService
) : ViewModel() {
    var users by mutableStateOf<List<User>>(emptyList())
        private set

    fun loadUsers() {
        viewModelScope.launch {
            users = userService.getUsers().data
        }
    }
}
```

## 开发说明

- 模拟器中 `10.0.2.2` 映射到宿主机 `localhost`
- 真机调试需修改 `ApiClient.kt` 中的 `BASE_URL` 为实际 IP
- 使用 `{{ProjectName}}` 变量的文件：`settings.gradle.kts`、`AndroidManifest.xml`、`HomeScreen.kt`

## 构建命令

```bash
./gradlew assembleDebug    # Debug 构建
./gradlew assembleRelease  # Release 构建
./gradlew test             # 运行测试
```
