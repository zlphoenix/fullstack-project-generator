import Foundation

struct User: Codable, Identifiable, Sendable {
    let id: UUID
    let name: String
    let email: String
}
