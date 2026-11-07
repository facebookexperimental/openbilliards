// Copyright (c) Meta Platforms, Inc. and affiliates.

// AppDelegate — minimal boot (feature 016 T008; the shell-app contract 4,
// data-model 1). The shell has no launch-time work beyond scene
// configuration: the window + web view live in SceneDelegate /
// GameViewController, and there is no network, analytics, or push
// surface anywhere (FR-001).
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        // Single scene (Info.plist: UIApplicationSupportsMultipleScenes
        // is false); the delegate class is named there too.
        UISceneConfiguration(name: "Default Configuration",
                             sessionRole: connectingSceneSession.role)
    }
}
