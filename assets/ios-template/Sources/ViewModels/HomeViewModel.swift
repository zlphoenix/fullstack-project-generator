import Foundation

@Observable
class HomeViewModel {
    var isLoading = false
    var errorMessage: String?

    private let apiClient = APIClient.shared

    func loadData() async {
        isLoading = true
        defer { isLoading = false }
        // TODO: Implement data loading from API
    }
}
