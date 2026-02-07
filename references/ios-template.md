# iOS 模板参考 (SwiftUI)

## 技术栈

- Swift 5.9 + SwiftUI
- iOS 17+ (`@Observable` 宏)
- Swift Package Manager (SPM)
- URLSession (原生网络层)
- Swift Concurrency (async/await)

## 目录结构

```
ios/
├── Package.swift              # SPM 包定义
└── Sources/
    ├── App/
    │   └── App.swift          # @main 入口
    ├── Views/
    │   ├── ContentView.swift  # 根视图（TabView）
    │   ├── HomeView.swift     # 首页
    │   └── ProfileView.swift  # 个人页
    ├── ViewModels/
    │   └── HomeViewModel.swift # 首页 ViewModel
    ├── Models/
    │   ├── User.swift         # 用户模型
    │   └── APIResponse.swift  # 泛型 API 响应信封
    ├── Services/
    │   └── APIClient.swift    # 网络客户端 (actor)
    └── Utils/
        └── Constants.swift    # 常量定义
```

## 核心文件说明

### Package.swift

使用 SPM 管理依赖（非 .xcodeproj），便于文本模板化。
目标平台 iOS 17+，无第三方依赖。

### APIClient.swift

使用 `actor` 实现线程安全的网络客户端：

- 单例模式 (`APIClient.shared`)
- 基于 URLSession 的 HTTP 方法：`get`, `post`, `put`, `delete`
- 自动附加 Bearer Token
- 401 响应自动清除 Token
- 自动解包 `APIResponse<T>` 信封
- `APIError` 枚举定义所有错误类型

### HomeViewModel.swift

使用 iOS 17 `@Observable` 宏（替代旧版 `ObservableObject`）：

- 自动属性观察，无需 `@Published`
- View 中用 `@State` 而非 `@StateObject` 引用

### ContentView.swift

根视图使用 `TabView` 实现底部标签导航，与 Android 的 `NavigationBar` 对应。

## MVVM 架构

```
View (SwiftUI)        → 展示层，声明式 UI
  ↓ @State / @Observable
ViewModel             → 业务逻辑，调用 Service
  ↓ async/await
Service (APIClient)   → 网络请求，数据获取
  ↓
Model (Codable)       → 数据模型，JSON 映射
```

## 定制指南

### 新增视图

1. 在 `Views/` 创建新的 SwiftUI 视图
2. 如需导航，在 `ContentView.swift` 的 `TabView` 中添加 tab
3. 如需数据，创建对应 ViewModel

### 新增 ViewModel

```swift
// ViewModels/UserViewModel.swift
import Foundation

@Observable
class UserViewModel {
    var users: [User] = []
    var isLoading = false

    func loadUsers() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let result: [User] = try await APIClient.shared.get("/api/v1/users")
            users = result
        } catch {
            print("Error: \(error)")
        }
    }
}
```

### 新增 API 调用

直接使用 `APIClient` 的泛型方法：

```swift
// GET
let users: [User] = try await APIClient.shared.get("/api/v1/users")

// POST
let newUser: User = try await APIClient.shared.post("/api/v1/users", body: CreateUserRequest(name: "test"))
```

### 新增数据模型

```swift
// Models/Post.swift
struct Post: Codable, Identifiable {
    let id: String
    let title: String
    let content: String
    let createdAt: String
}
```

## 开发说明

- 使用 SPM，可在 Xcode 中打开 `Package.swift` 或 `ios/` 目录
- `{{ProjectName}}` 变量出现在：`Package.swift`、`App.swift`、`HomeView.swift`、`Constants.swift`
- APIClient 默认连接 `http://localhost:8080`，模拟器可直接访问宿主机
- 真机调试需在 Info.plist 中配置 App Transport Security (ATS) 例外

## 构建方式

在 Xcode 中打开项目目录，选择模拟器或真机，点击 Run。
