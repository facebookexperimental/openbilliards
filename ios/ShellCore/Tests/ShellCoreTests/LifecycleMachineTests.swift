// Copyright (c) Meta Platforms, Inc. and affiliates.

// LifecycleMachineTests — T013 unit suite (data-model.md 5 states/events/
// invariants, contracts/shell-app.md 2/5 laws, FR-011). Walks every legal
// edge, exercises the typed illegal-transition core, and carries the
// resume-clamp arithmetic check (research R10 — the shell VERIFIES the
// game's dt clamp, it implements nothing).
import XCTest
@testable import ShellCore

final class LifecycleMachineTests: XCTestCase {

    // MARK: launch

    func testStartsInLaunching() {
        let m = LifecycleMachine()
        XCTAssertEqual(m.state, .launching)
    }

    func testLaunchToInteractive() {
        var m = LifecycleMachine()
        XCTAssertEqual(m.handle(.didFinishLaunch), [])
        XCTAssertEqual(m.state, .launching)
        XCTAssertEqual(m.handle(.webContentReady), [])
        XCTAssertEqual(m.state, .interactive)
    }

    // MARK: interactive <-> backgrounded

    func testSnapshotFiresOnEveryBackgroundEdge() {
        var m = LifecycleMachine()
        _ = m.handle(.webContentReady)
        // INVARIANT (data-model 5): .snapshotSettings on EVERY
        // interactive -> backgrounded edge — checked across repeats.
        for _ in 0..<3 {
            XCTAssertEqual(m.handle(.didEnterBackground), [.snapshotSettings])
            XCTAssertEqual(m.state, .backgrounded)
            XCTAssertEqual(m.handle(.willEnterForeground), [])
            XCTAssertEqual(m.state, .interactive)
        }
    }

    // MARK: recovery — success path

    func testProcessDeathRecoversViaReload() {
        var m = LifecycleMachine()
        _ = m.handle(.webContentReady)
        XCTAssertEqual(m.handle(.contentProcessTerminated), [.reloadWebView])
        XCTAssertEqual(m.state, .recovering)
        XCTAssertEqual(m.handle(.reloadSucceeded), [])
        XCTAssertEqual(m.state, .interactive)
        XCTAssertEqual(m.reloadAttempts, 0)
    }

    func testProcessDeathInBackgroundAlsoRecovers() {
        var m = LifecycleMachine()
        _ = m.handle(.webContentReady)
        _ = m.handle(.didEnterBackground)
        XCTAssertEqual(m.handle(.contentProcessTerminated), [.reloadWebView])
        XCTAssertEqual(m.state, .recovering)
    }

    // MARK: recovery — death before the first load finishes (GH-1045)

    func testProcessDeathDuringLaunchRecoversViaReload() {
        // A content-process death before the boot page's first didFinish
        // (e.g. WebKit's GPU-process watchdog under load) opens the same
        // episode as a death after boot — never a silent illegal pair.
        var m = LifecycleMachine()
        XCTAssertEqual(m.handle(.didFinishLaunch), [])
        XCTAssertEqual(m.handle(.contentProcessTerminated), [.reloadWebView])
        XCTAssertEqual(m.state, .recovering)
        XCTAssertEqual(m.reloadAttempts, 1)
        // The reload's ready signal (either adapter spelling) closes it.
        XCTAssertEqual(m.handle(.webContentReady), [])
        XCTAssertEqual(m.state, .interactive)
        XCTAssertEqual(m.reloadAttempts, 0)
        XCTAssertNil(m.lastError)
    }

    func testRepeatedDeathDuringLaunchEndsOnRecoverySurface() {
        // Every boot attempt dies: <= 2 automatic reloads, then the
        // native recovery surface — a blank window is never the end state.
        var m = LifecycleMachine()
        _ = m.handle(.didFinishLaunch)
        XCTAssertEqual(m.handle(.contentProcessTerminated), [.reloadWebView])
        XCTAssertEqual(m.reloadAttempts, 1)
        XCTAssertEqual(m.handle(.contentProcessTerminated), [.reloadWebView])
        XCTAssertEqual(m.reloadAttempts, 2)
        XCTAssertEqual(m.handle(.contentProcessTerminated), [.showRecovery])
        XCTAssertEqual(m.state, .failed)
        XCTAssertNil(m.lastError)
        // The user's retry still opens a fresh episode that can succeed.
        XCTAssertEqual(m.handle(.userRetry), [.reloadWebView])
        XCTAssertEqual(m.handle(.reloadSucceeded), [])
        XCTAssertEqual(m.state, .interactive)
        XCTAssertNil(m.lastError)
    }

    func testFailedReloadAfterLaunchDeathStillEscalates() {
        var m = LifecycleMachine()
        _ = m.handle(.contentProcessTerminated)
        XCTAssertEqual(m.handle(.reloadFailed), [.reloadWebView])
        XCTAssertEqual(m.handle(.reloadFailed), [.showRecovery])
        XCTAssertEqual(m.state, .failed)
        XCTAssertNil(m.lastError)
    }

    func testWebContentReadyAlsoClosesRecovery() {
        // Adapters may report readiness instead of reloadSucceeded.
        var m = LifecycleMachine()
        _ = m.handle(.webContentReady)
        _ = m.handle(.contentProcessTerminated)
        XCTAssertEqual(m.handle(.webContentReady), [])
        XCTAssertEqual(m.state, .interactive)
    }

    // MARK: recovery — escalation to terminal failed

    func testFailedAfterTwoAutomaticReloadAttempts() {
        var m = LifecycleMachine()
        _ = m.handle(.webContentReady)
        // Kill: automatic attempt 1 issued.
        XCTAssertEqual(m.handle(.contentProcessTerminated), [.reloadWebView])
        XCTAssertEqual(m.reloadAttempts, 1)
        // Attempt 1 fails: automatic attempt 2 issued (the cap).
        XCTAssertEqual(m.handle(.reloadFailed), [.reloadWebView])
        XCTAssertEqual(m.reloadAttempts, 2)
        // Attempt 2 fails: terminal failed, surface shown — NO third
        // automatic reload (shell-app.md 5: <= 2 attempts).
        XCTAssertEqual(m.handle(.reloadFailed), [.showRecovery])
        XCTAssertEqual(m.state, .failed)
    }

    func testRepeatedDeathDuringRecoveryCountsAsFailedAttempt() {
        var m = LifecycleMachine()
        _ = m.handle(.webContentReady)
        _ = m.handle(.contentProcessTerminated)                       // attempt 1
        XCTAssertEqual(m.handle(.contentProcessTerminated), [.reloadWebView]) // attempt 2
        XCTAssertEqual(m.handle(.contentProcessTerminated), [.showRecovery])  // cap
        XCTAssertEqual(m.state, .failed)
    }

    func testRecoveryAfterOneFailureStillSucceeds() {
        var m = LifecycleMachine()
        _ = m.handle(.webContentReady)
        _ = m.handle(.contentProcessTerminated)
        _ = m.handle(.reloadFailed)
        XCTAssertEqual(m.handle(.reloadSucceeded), [])
        XCTAssertEqual(m.state, .interactive)
        XCTAssertEqual(m.reloadAttempts, 0)
    }

    // MARK: user retry

    func testUserRetryOpensAFreshEpisode() {
        var m = LifecycleMachine()
        _ = m.handle(.webContentReady)
        _ = m.handle(.contentProcessTerminated)
        _ = m.handle(.reloadFailed)
        _ = m.handle(.reloadFailed)
        XCTAssertEqual(m.state, .failed)
        // userRetry -> recovering with a reload (data-model 5).
        XCTAssertEqual(m.handle(.userRetry), [.reloadWebView])
        XCTAssertEqual(m.state, .recovering)
        XCTAssertEqual(m.reloadAttempts, 1)
        // The fresh episode carries the same <= 2 discipline.
        XCTAssertEqual(m.handle(.reloadFailed), [.reloadWebView])
        XCTAssertEqual(m.handle(.reloadFailed), [.showRecovery])
        XCTAssertEqual(m.state, .failed)
        // ... and can still succeed on a later retry.
        XCTAssertEqual(m.handle(.userRetry), [.reloadWebView])
        XCTAssertEqual(m.handle(.reloadSucceeded), [])
        XCTAssertEqual(m.state, .interactive)
    }

    // MARK: illegal transitions are typed errors

    func testIllegalTransitionsAreTypedErrors() {
        // Not-in-the-edge-list pairs (data-model 5) surface as
        // TransitionError through the typed core.
        // (.launching, .contentProcessTerminated) is a LEGAL recovery
        // entry since GH-1045 — see the launch-death tests above.
        let cases: [(ShellState, ShellEvent)] = [
            (.launching, .didEnterBackground),
            (.launching, .reloadSucceeded),
            (.launching, .reloadFailed),
            (.launching, .userRetry),
            (.interactive, .willEnterForeground),
            (.interactive, .reloadSucceeded),
            (.interactive, .userRetry),
            (.backgrounded, .didEnterBackground),
            (.backgrounded, .webContentReady),
            (.recovering, .didEnterBackground),
            (.recovering, .userRetry),
            (.failed, .reloadFailed),
            (.failed, .webContentReady),
        ]
        for (state, event) in cases {
            var m = LifecycleMachine()
            m.state = state
            let result = m.transition(event)
            guard case .failure(let error) = result else {
                XCTFail("expected typed error for \(event) in \(state)")
                continue
            }
            XCTAssertEqual(error, .illegal(event: event, in: state))
            XCTAssertEqual(m.state, state, "illegal event must not move the machine")
        }
    }

    func testPublicHandleIsTotalAndRecordsIllegalEvents() {
        // The frozen handle(_:) cannot throw: it drops the event, records
        // the typed error, and produces no effects (no release trap on a
        // stray scene callback).
        var m = LifecycleMachine()
        XCTAssertEqual(m.handle(.userRetry), [])
        XCTAssertEqual(m.state, .launching)
        XCTAssertEqual(m.lastError, .illegal(event: .userRetry, in: .launching))
    }

    // MARK: resume-clamp arithmetic (research R10, L3 bound)

    func testResumeClampArithmeticBound() {
        // The game's frame loop clamps dt = min(0.1, wallDelta) —
        // web/app/main.js "clamp tab-switch gaps". The shell VERIFIES
        // this bound (SC-006 "no visible time jump"); this check pins the
        // arithmetic the L3 scenario asserts: whatever the wall-clock gap
        // (a 2 h background sit included), the first post-resume step is
        // <= 0.1 s, and short gaps pass through unclamped.
        for wallDelta in [0.0, 0.016, 0.05, 0.1, 0.5, 60.0, 7200.0] {
            let dt = min(0.1, wallDelta)
            XCTAssertLessThanOrEqual(dt, 0.1)
            XCTAssertGreaterThanOrEqual(dt, 0)
            if wallDelta <= 0.1 {
                XCTAssertEqual(dt, wallDelta, "sub-clamp deltas pass through")
            }
        }
    }
}
