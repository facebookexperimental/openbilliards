// swift-tools-version:5.10
// Copyright (c) Meta Platforms, Inc. and affiliates.
// ShellCore — Foundation-only logic package for the iOS shell (feature 016,
// research R12). Every decidable shell behavior lives here so the L1 unit
// layer is host-runnable: cd ios/ShellCore && swift test
// The macOS platform entry exists ONLY so a host toolchain can run the
// test suite; the app target consumes the package on iOS 16+.
//
// RECORDED DEVIATION (environment, 2026-07-10): the plan assumed `swift
// test` runs on Command Line Tools alone, but this machine's CLT (Swift
// 6.3.2, macOS 26) ships NEITHER the XCTest nor the Testing module for
// host builds — `swift test` requires Xcode's toolchain. Local [TODAY]
// arms are therefore:
//     swift build                  (package + stubs compile on CLT)
//     swift run shellcore-smoke    (public-shape assertions, exit 0)
// `swift test` (the full XCTest suite below) executes on GitHub macOS
// runners (.github/workflows/ios.yml `shellcore` job, T027/T038) and
// locally the day the owner installs Xcode. Routed to the integrator via
// the lane completion report; feature 016 (internal spec) carries the
// ledger entry.
import PackageDescription

let package = Package(
    name: "ShellCore",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(name: "ShellCore", targets: ["ShellCore"]),
        .executable(name: "shellcore-smoke", targets: ["shellcore-smoke"]),
    ],
    targets: [
        .target(
            name: "ShellCore",
            path: "Sources/ShellCore"
        ),
        .executableTarget(
            name: "shellcore-smoke",
            dependencies: ["ShellCore"],
            path: "Sources/shellcore-smoke"
        ),
        .testTarget(
            name: "ShellCoreTests",
            dependencies: ["ShellCore"],
            path: "Tests/ShellCoreTests"
        ),
    ]
)
