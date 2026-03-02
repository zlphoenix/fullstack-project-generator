import Foundation
import Observation

@Observable
final class HomeViewModel {
    var users: [User] = []
    var isLoading = false
    var errorMessage: String?

    func fetchUsers() async {
        isLoading = true
        errorMessage = nil

        do {
            users = try await APIClient.shared.request(endpoint: "/users")
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
