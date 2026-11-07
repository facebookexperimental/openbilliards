// swift-tools-version:5.10
// Copyright (c) Meta Platforms, Inc. and affiliates.
// MacShellCore — Foundation-only logic package for the macOS shell
// (feature 023, research R13). The two genuinely new decidable seams —
// window-state laws and the download route — live here so they are
// unit-gated natively BEFORE any adapter runs:
//     cd macos/MacShellCore && swift test
// Public API is FROZEN per the macos-shell contract (feature 023, internal) §3
// (001 placeholder-stub regime: lane tasks fill BODIES only).
import PackageDescription

let package = Package(
    name: "MacShellCore",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .library(name: "MacShellCore", targets: ["MacShellCore"]),
    ],
    targets: [
        .target(
            name: "MacShellCore",
            path: "Sources/MacShellCore"
        ),
        .testTarget(
            name: "MacShellCoreTests",
            dependencies: ["MacShellCore"],
            path: "Tests/MacShellCoreTests"
        ),
    ]
)
