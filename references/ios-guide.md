# SwiftUI / iOS 开发指南

## 一、MVVM 架构

### 1.1 分层职责

```
View (SwiftUI View)
  - 声明式 UI, 只负责展示和用户交互
  - 通过 ViewModel 获取数据和触发操作
  - 不包含业务逻辑

ViewModel (@Observable class)
  - 持有 UI 状态, 处理用户操作
  - 调用 Service 层获取数据
  - 将 Model 数据转换为 View 可用的格式

Model / Service
  - 数据模型 (Codable struct)
  - 网络请求, 数据持久化等底层服务
```

### 1.2 数据流向

```
View -- 用户操作 --> ViewModel -- 调用 --> Service -- 网络/存储 --> 数据源
View <-- 状态更新 -- ViewModel <-- 返回 -- Service <-- 响应 ---- 数据源
```

## 二、@Observable vs ObservableObject

### 2.1 推荐方案: @Observable (Swift 5.9+ / iOS 17+)

```swift
@Observable
class UserViewModel {
    var users: [User] = []
    var isLoading = false
    var errorMessage: String?

    private let userService: UserService

    init(userService: UserService = UserService()) {
        self.userService = userService
    }

    func fetchUsers() async {
        isLoading = true
        defer { isLoading = false }
        do {
            users = try await userService.getUsers()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
```

### 2.2 在 View 中使用

```swift
struct UserListView: View {
    @State private var viewModel = UserViewModel()

    var body: some View {
        List(viewModel.users) { user in
            UserRowView(user: user)
        }
        .overlay {
            if viewModel.isLoading {
                ProgressView()
            }
        }
        .task {
            await viewModel.fetchUsers()
        }
    }
}
```

### 2.3 对比说明

| 特性 | @Observable | ObservableObject |
|------|-------------|-----------------|
| 最低版本 | iOS 17 | iOS 13 |
| 属性标记 | 无需标记 (自动追踪) | 每个属性需 @Published |
| View 中使用 | @State / 直接传入 | @StateObject / @ObservedObject |
| 性能 | 更优 (精确追踪属性) | 任一 @Published 变化全部刷新 |

如需支持 iOS 17 以下版本, 使用 ObservableObject + @Published 方案。

## 三、网络层

### 3.1 APIClient 封装

```swift
actor APIClient {
    static let shared = APIClient()
    private let baseURL = "https://api.example.com/api/v1"
    private let session = URLSession.shared
    private var token: String?

    func setToken(_ token: String) {
        self.token = token
    }

    func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Encodable? = nil
    ) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }
}
```

### 3.2 APIError 定义

```swift
enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int)
    case decodingError

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid response"
        case .httpError(let code): return "HTTP error: \(code)"
        case .decodingError: return "Decoding error"
        }
    }
}
```

## 四、导航

### 4.1 NavigationStack + NavigationPath

```swift
@Observable
class Router {
    var path = NavigationPath()

    func navigate(to destination: AppDestination) {
        path.append(destination)
    }

    func goBack() {
        path.removeLast()
    }

    func goToRoot() {
        path.removeLast(path.count)
    }
}

enum AppDestination: Hashable {
    case userDetail(userId: Int)
    case orderDetail(orderId: Int)
    case settings
}
```

### 4.2 在 App 入口配置

```swift
struct ContentView: View {
    @State private var router = Router()

    var body: some View {
        NavigationStack(path: $router.path) {
            HomeView()
                .navigationDestination(for: AppDestination.self) { dest in
                    switch dest {
                    case .userDetail(let id): UserDetailView(userId: id)
                    case .orderDetail(let id): OrderDetailView(orderId: id)
                    case .settings: SettingsView()
                    }
                }
        }
        .environment(router)
    }
}
```

## 五、数据持久化

### 5.1 UserDefaults (简单 key-value)

```swift
@propertyWrapper
struct AppStorage<T> {
    // 使用 SwiftUI 内置的 @AppStorage 即可
}

// 常见用法
@AppStorage("isOnboardingComplete") var isOnboardingComplete = false
@AppStorage("userToken") var userToken: String = ""
```

### 5.2 SwiftData (结构化数据, iOS 17+)

```swift
@Model
class UserProfile {
    var name: String
    var email: String
    var createdAt: Date

    init(name: String, email: String) {
        self.name = name
        self.email = email
        self.createdAt = .now
    }
}
```

## 六、SPM 依赖管理

常用依赖添加方式: Xcode -> File -> Add Package Dependencies

常用库推荐:

| 用途 | 库名 | 说明 |
|------|------|------|
| 图片加载 | Kingfisher | 异步图片加载和缓存 |
| 键值存储 | KeychainAccess | 安全存储 token 等敏感信息 |
| 日志 | OSLog | 系统内置, 推荐优先使用 |

## 七、目录结构

```
ProjectName/
  App/
    ProjectNameApp.swift        -- @main 入口
    ContentView.swift           -- 根视图
  Views/
    Home/
      HomeView.swift
    User/
      UserListView.swift
      UserDetailView.swift
      Components/
        UserRowView.swift
  ViewModels/
    UserViewModel.swift
    OrderViewModel.swift
  Models/
    User.swift
    Order.swift
    ApiResponse.swift
  Services/
    APIClient.swift
    UserService.swift
    AuthService.swift
  Utils/
    Router.swift
    Extensions/
      Date+Extensions.swift
      View+Extensions.swift
  Resources/
    Assets.xcassets
```

## 八、SwiftUI 常用模式

### 8.1 ViewModifier

```swift
struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(12)
            .shadow(radius: 2)
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardModifier())
    }
}
```

### 8.2 Environment 传值

```swift
// 在父视图设置
.environment(router)
.environment(authViewModel)

// 在子视图获取
@Environment(Router.self) private var router
@Environment(AuthViewModel.self) private var authVM
```

### 8.3 @State 与 @Binding

- @State: View 自身拥有的局部状态, 用于简单值类型
- @Binding: 从父 View 传入的双向绑定, 子 View 可读可写
- 规则: 状态定义在最近的共同父 View, 子 View 通过 @Binding 访问
