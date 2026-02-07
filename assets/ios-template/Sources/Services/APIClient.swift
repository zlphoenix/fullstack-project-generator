import Foundation

actor APIClient {
    static let shared = APIClient()

    private let baseURL: URL
    private let session: URLSession
    private var accessToken: String?

    private init() {
        baseURL = URL(string: Constants.apiBaseURL)!
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        session = URLSession(configuration: config)
    }

    // MARK: - Token Management

    func setAccessToken(_ token: String) {
        accessToken = token
        UserDefaults.standard.set(token, forKey: Constants.accessTokenKey)
    }

    func clearTokens() {
        accessToken = nil
        UserDefaults.standard.removeObject(forKey: Constants.accessTokenKey)
        UserDefaults.standard.removeObject(forKey: Constants.refreshTokenKey)
    }

    func loadStoredToken() {
        accessToken = UserDefaults.standard.string(forKey: Constants.accessTokenKey)
    }

    // MARK: - HTTP Methods

    func get<T: Codable>(_ path: String) async throws -> T {
        try await request(path, method: "GET")
    }

    func post<T: Codable>(_ path: String, body: some Encodable) async throws -> T {
        try await request(path, method: "POST", body: body)
    }

    func put<T: Codable>(_ path: String, body: some Encodable) async throws -> T {
        try await request(path, method: "PUT", body: body)
    }

    func delete<T: Codable>(_ path: String) async throws -> T {
        try await request(path, method: "DELETE")
    }

    // MARK: - Internal

    private func request<T: Codable>(
        _ path: String,
        method: String,
        body: (some Encodable)? = nil as String?
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = accessToken {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            urlRequest.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await session.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            clearTokens()
            throw APIError.unauthorized
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError(statusCode: httpResponse.statusCode)
        }

        let apiResponse = try JSONDecoder().decode(APIResponse<T>.self, from: data)
        guard let result = apiResponse.data else {
            throw APIError.emptyData
        }
        return result
    }
}

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case httpError(statusCode: Int)
    case emptyData

    var errorDescription: String? {
        switch self {
        case .invalidURL: "Invalid URL"
        case .invalidResponse: "Invalid response"
        case .unauthorized: "Unauthorized"
        case .httpError(let code): "HTTP error \(code)"
        case .emptyData: "Empty data"
        }
    }
}
