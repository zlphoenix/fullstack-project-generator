// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "{{ProjectName}}",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        .library(
            name: "{{ProjectName}}",
            targets: ["{{ProjectName}}"]
        )
    ],
    targets: [
        .target(
            name: "{{ProjectName}}",
            path: "Sources"
        )
    ]
)
