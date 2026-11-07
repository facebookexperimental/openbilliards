// Copyright (c) Meta Platforms, Inc. and affiliates.

// SceneDelegate — window + root VC boot (feature 016 T008) and the scene
// lifecycle wiring + audio session (T016; contracts/shell-app.md 4/5/6,
// research R11).
//
// Lifecycle: scene phase transitions -> LifecycleMachine events through
// LifecycleController (the settings snapshot rides the interactive ->
// backgrounded edge — research R7).
//
// Audio (shell-app.md 6, research R11 — AMENDED 2026-07-20, owner ruling):
// AVAudioSession category .playback + .mixWithOthers, activated on launch
// and RE-activated when an interruption ends. This DEVIATES from the
// original FR-009 (.ambient, respect the silent switch): on real devices
// the switch read as "the game has no sound", and games conventionally
// ignore it; .mixWithOthers keeps the user's own audio running. The
// looped-silent-audio keepalive hack remains forbidden. Audio unlock rides
// sound.js's gesture-resume (retry-until-running, same amendment).
import UIKit
import AVFAudio
import ShellCore

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    private var interruptionObserver: NSObjectProtocol?

    private var gameViewController: GameViewController? {
        window?.rootViewController as? GameViewController
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        let game = GameViewController()
        // GH-1023: a cold launch from a replay link boots that replay.
        game.initialReplay = Self.replayTarget(connectionOptions.urlContexts.map(\.url))
        window.rootViewController = game
        window.makeKeyAndVisible()
        self.window = window

        activatePlaybackAudioSession()
        observeAudioInterruptions()
    }

    /// GH-1023: a replay link opened while the app runs (warm).
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let target = Self.replayTarget(URLContexts.map(\.url)) else { return }
        gameViewController?.openReplay(target)
    }

    /// openbilliards://replay#r=… (CFBundleURLTypes). INPUT BOUNDARY:
    /// only the exact replay shape maps, onto the fixed boot document
    /// (ShellCore ReplayLink); anything else is dropped — the web view
    /// never navigates to a URL taken from the link.
    static func replayTarget<S: Sequence>(_ urls: S) -> URL? where S.Element == URL {
        urls.lazy.compactMap(ReplayLink.bootURL(for:)).first
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Orientation law (shell-app.md 4): re-assert the landscape mask
        // on scene activation (iOS 16 API; deployment target is 16.0).
        window?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    }

    // MARK: - lifecycle wiring (T016 -> LifecycleController -> machine)

    func sceneDidEnterBackground(_ scene: UIScene) {
        // interactive -> backgrounded: the machine emits
        // .snapshotSettings on EVERY such edge (data-model 5 invariant).
        gameViewController?.lifecycle.sceneDidEnterBackground()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        // WebKit resumes rAF; the game's own dt clamp bounds the first
        // frame step (research R10 — nothing to inject here).
        gameViewController?.lifecycle.sceneWillEnterForeground()
    }

    // MARK: - audio session (shell-app.md 6, amended 2026-07-20)
    // DEVIATION from the original .ambient contract: .ambient is muted by
    // the ring/silent switch, which read as "game has no sound" on real
    // devices (owner report). Games conventionally ignore the switch;
    // .playback does that, and .mixWithOthers keeps the user's own
    // music/podcast running under our short impact cues.

    private func activatePlaybackAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            // Non-fatal: WebAudio still plays under the default session.
            NSLog("shell: playback audio session activation failed (non-fatal): %@",
                  String(describing: error))
        }
    }

    private func observeAudioInterruptions() {
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .ended else {
                return
            }
            // Interruption (call/alarm) ended: re-activate .playback
            // (shell-app.md 6).
            self?.activatePlaybackAudioSession()
        }
    }

    deinit {
        if let interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }
    }
}
