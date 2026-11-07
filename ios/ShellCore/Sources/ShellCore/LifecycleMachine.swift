// Copyright (c) Meta Platforms, Inc. and affiliates.

// LifecycleMachine — FROZEN public API (contracts/shell-app.md 2; states,
// events, and invariants per data-model 5).
// T013 (lane S) body: pure transition function over typed events.
//
// Behavioral laws (unit-gated, FR-011):
// - launching -> interactive; interactive <-> backgrounded;
//   launching|interactive|backgrounded -> recovering -> interactive;
//   terminal failed after <= 2 automatic reload attempts; userRetry ->
//   recovering.
// - A content-process death BEFORE the first page load finishes opens
//   the same recovery episode as a death after it (GH-1045: in launching
//   it used to be an illegal pair, so the window stayed blank for good).
// - .snapshotSettings effect on EVERY interactive -> backgrounded edge.
// - Illegal transitions are typed errors (TransitionError), exercised by
//   the unit suite through the internal transition(_:) core. The frozen
//   public handle(_:) cannot throw, so it is TOTAL: an illegal event is
//   recorded on lastError and produces no effects — the shell never traps
//   on a stray scene callback in release.
import Foundation

/// Shell lifecycle states (data-model 5).
public enum ShellState: Equatable {
    case launching
    case interactive
    case backgrounded
    case recovering
    case failed
}

/// Typed lifecycle events (data-model 5).
public enum ShellEvent: Equatable {
    case didFinishLaunch
    case webContentReady
    case didEnterBackground
    case willEnterForeground
    case contentProcessTerminated
    case reloadSucceeded
    case reloadFailed
    case userRetry
}

/// Effects the adapter layer dispatches (LifecycleController et al.).
public enum ShellEffect: Equatable {
    case none
    case snapshotSettings
    case reloadWebView
    case showRecovery
}

/// Typed illegal-transition error (internal so the frozen public surface
/// stays shell-app.md 2 verbatim; the @testable unit suite exercises it).
enum TransitionError: Error, Equatable {
    case illegal(event: ShellEvent, in: ShellState)
}

/// Pure transition function over typed events.
public struct LifecycleMachine {
    /// Internal so the app adapters go through handle(_:) effects; the
    /// @testable unit suite reads it directly.
    var state: ShellState = .launching

    /// Reload attempts issued in the CURRENT recovery episode. The
    /// automatic cap is 2 (shell-app.md 5); a user retry opens a fresh
    /// episode with the same discipline.
    var reloadAttempts = 0

    /// Automatic-reload cap before terminal failed (shell-app.md 5).
    static let maxReloadAttempts = 2

    /// Last illegal transition (diagnostics + typed unit suite).
    var lastError: TransitionError?

    public init() {}

    public mutating func handle(_ event: ShellEvent) -> [ShellEffect] {
        switch transition(event) {
        case .success(let effects):
            return effects
        case .failure(let error):
            lastError = error
            return []
        }
    }

    /// The typed transition core (data-model 5 edge list). Anything not
    /// in the list is a typed error.
    mutating func transition(_ event: ShellEvent) -> Result<[ShellEffect], TransitionError> {
        switch (state, event) {

        // -- launch ----------------------------------------------------
        case (.launching, .didFinishLaunch):
            // Named boot event; the machine is born in .launching.
            return .success([])
        case (.launching, .webContentReady):
            state = .interactive
            return .success([])

        // -- interactive <-> backgrounded ------------------------------
        case (.interactive, .didEnterBackground):
            state = .backgrounded
            // INVARIANT: snapshot on EVERY interactive -> backgrounded
            // edge (research R7).
            return .success([.snapshotSettings])
        case (.backgrounded, .willEnterForeground):
            state = .interactive
            return .success([])

        // -- recovery entry (process death: during boot, foreground or
        //    background) ----------------------------------------------
        case (.launching, .contentProcessTerminated),
             (.interactive, .contentProcessTerminated),
             (.backgrounded, .contentProcessTerminated):
            state = .recovering
            reloadAttempts = 1
            return .success([.reloadWebView])

        // -- recovery outcomes -----------------------------------------
        case (.recovering, .reloadSucceeded),
             (.recovering, .webContentReady):
            // The reload's ready signal closes the episode (adapters may
            // report either — both are acceptance of recovery).
            state = .interactive
            reloadAttempts = 0
            return .success([])
        case (.recovering, .reloadFailed),
             (.recovering, .contentProcessTerminated):
            // A reload that failed, or a process that died again while
            // recovering, consumes an automatic attempt.
            if reloadAttempts < Self.maxReloadAttempts {
                reloadAttempts += 1
                return .success([.reloadWebView])
            }
            state = .failed
            return .success([.showRecovery])

        // -- terminal failed + user retry -------------------------------
        case (.failed, .userRetry):
            state = .recovering
            reloadAttempts = 1
            return .success([.reloadWebView])

        default:
            return .failure(.illegal(event: event, in: state))
        }
    }
}
