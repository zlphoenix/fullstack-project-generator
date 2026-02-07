import Foundation

struct APIResponse<T: Codable>: Codable {
    let code: Int
    let message: String
    let data: T?
}
