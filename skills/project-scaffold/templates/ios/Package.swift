// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "{{ProjectName}}",
    platforms: [
        .iOS(.v17)
    ],
    targets: [
        .executableTarget(
            name: "{{ProjectName}}",
            path: "Sources"
        )
    ]
)
