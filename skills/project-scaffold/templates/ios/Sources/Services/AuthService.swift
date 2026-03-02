import Foundation

struct Token: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
}

final class AuthService: Sendable {
    static let shared = AuthService()

    var currentToken: Token? {
        guard let data = UserDefaults.standard.data(forKey: Constants.Storage.authToken) else {
            return nil
        }
        return try? JSONDecoder().decode(Token.self, from: data)
    }

    var isAuthenticated: Bool {
        currentToken != nil
    }

    func login(email: String, password: String) async throws -> Token {
        let body = ["email": email, "password": password]
        let token: Token = try await APIClient.shared.request(
            endpoint: "/auth/login",
            method: .post,
            body: body
        )
        persistToken(token)
        return token
    }

    func logout() {
        UserDefaults.standard.removeObject(forKey: Constants.Storage.authToken)
    }

    private func persistToken(_ token: Token) {
        if let data = try? JSONEncoder().encode(token) {
            UserDefaults.standard.set(data, forKey: Constants.Storage.authToken)
        }
    }
}
