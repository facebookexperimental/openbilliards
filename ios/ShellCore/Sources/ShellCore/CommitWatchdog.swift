// Copyright (c) Meta Platforms, Inc. and affiliates.

// CommitWatchdog — GH-1073: the first-commit watchdog's pure decision core
// (both shells' LifecycleControllers own the timers and the page ping;
// every decision lives here, unit-gated with an injected clock).
//
// Why: the shells learn of a web-content process death only through
// webViewWebContentProcessDidTerminate. A death BEFORE the boot (or a
// recovery) navigation commits can reach the shell as nothing at all —
// measured on macOS 26 WebKit: no termination, no provisional failure, no
// commit; isLoading stays true, progress freezes, and evaluateJavaScript
// completions never run. Without a watchdog the window stays blank for
// good and the lifecycle machine never leaves .launching.
//
// Laws (unit-gated). HARD REQUIREMENT: a slow but healthy navigation is
// never declared dead (a heavily loaded host has been measured taking
// ~50 s to its first commit).
// - Every navigation the shell issues (boot, recovery reload) arms a
//   commit deadline; a main-frame commit disarms it.
// - At a deadline, a navigation that is no longer loading and never
//   committed is dead (it failed or was dropped without a commit).
// - A navigation still loading whose provisional start has not been seen
//   yet is waiting on its content process to launch: the deadline simply
//   re-arms (no ping — a ping would queue behind the same launch) until
//   the start budget is spent; then it is pinged like any other.
// - A navigation still loading after its provisional start is pinged (a
//   trivial script evaluation): any answer means the content process is
//   alive and the deadline re-arms; no answer within the ping bound means
//   dead or wedged.
// - While the host app is suspended (iOS background) the watch pauses —
//   its timers keep counting while nothing in the page can run — and
//   restarts with a full deadline on resume. Suspension is tracked on its
//   own: a navigation issued while suspended (a recovery reload after a
//   background termination) is armed paused, and an idle watch remembers
//   the suspension for the next navigation.
// - A dead verdict is reported once per navigation; the adapter then stops
//   loading and reports .contentProcessTerminated, so the shared
//   LifecycleMachine's existing recovery edges reload (<= 2 automatic
//   attempts) and then show the recovery surface.
// - Every timer and ping carries the epoch it was issued under; anything
//   from an older epoch is ignored (a commit, a new navigation, a pause or
//   a verdict all start a new epoch).
import Foundation

public struct CommitWatchdog: Equatable {

    /// Why a navigation was declared dead (logged by the adapters).
    public enum Reason: Equatable {
        /// Stopped loading without ever committing.
        case notLoading
        /// Still loading, but the page did not answer the ping.
        case pingUnanswered
    }

    /// What the adapter must do next.
    public enum Effect: Equatable {
        /// Call deadlineElapsed(epoch:isLoading:) after `after` seconds.
        case scheduleDeadline(epoch: Int, after: TimeInterval)
        /// Evaluate a trivial script in the page; on ANY completion call
        /// pingAnswered(epoch:); also call pingBoundElapsed(epoch:) after
        /// `bound` seconds.
        case ping(epoch: Int, bound: TimeInterval)
        /// The navigation is dead: stop loading and report a content-
        /// process termination to the lifecycle machine.
        case declareDead(Reason)
    }

    enum Phase: Equatable {
        case idle
        case awaitingCommit
        case awaitingPing
        case paused
    }

    /// Commit deadline per check. The boot document comes from the app
    /// bundle, never the network.
    public static let defaultDeadline: TimeInterval = 30
    /// How long a started, still-loading page may take to answer the ping:
    /// a started content process answers a trivial evaluation even under
    /// heavy load; one that cannot is dead or wedged.
    public static let defaultPingBound: TimeInterval = 30
    /// How long a navigation may wait for its content process to launch
    /// (no provisional start seen) before it is pinged.
    public static let defaultStartBudget: TimeInterval = 180

    public let deadline: TimeInterval
    public let pingBound: TimeInterval
    public let startBudget: TimeInterval
    private(set) var phase: Phase = .idle
    private(set) var epoch = 0
    /// The current navigation's provisional start was seen.
    private(set) var started = false
    /// Seconds the current navigation has waited without a start.
    private(set) var waitedForStart: TimeInterval = 0
    /// The host app is suspended (between suspended() and resumed()).
    private(set) var isSuspended = false

    public init(deadline: TimeInterval = CommitWatchdog.defaultDeadline,
                pingBound: TimeInterval = CommitWatchdog.defaultPingBound,
                startBudget: TimeInterval = CommitWatchdog.defaultStartBudget) {
        self.deadline = deadline
        self.pingBound = pingBound
        self.startBudget = startBudget
    }

    /// The shell issued a navigation (boot or recovery reload). Issued
    /// while suspended, it is armed paused: its deadline starts on resume.
    public mutating func navigationIssued() -> [Effect] {
        epoch += 1
        started = false
        waitedForStart = 0
        guard !isSuspended else {
            phase = .paused
            return []
        }
        phase = .awaitingCommit
        return [.scheduleDeadline(epoch: epoch, after: deadline)]
    }

    /// A main-frame navigation reached its provisional start: its content
    /// process is up and running it.
    public mutating func provisionalStarted() {
        if phase != .idle { started = true }
    }

    /// A main-frame navigation committed: the watch ends.
    public mutating func committed() {
        epoch += 1
        phase = .idle
    }

    /// The host app was suspended: outstanding timers and pings go stale,
    /// and nothing is judged until resumed().
    public mutating func suspended() {
        isSuspended = true
        epoch += 1
        if phase == .awaitingCommit || phase == .awaitingPing { phase = .paused }
    }

    /// The host app resumed: a paused watch restarts with a full deadline.
    public mutating func resumed() -> [Effect] {
        isSuspended = false
        guard phase == .paused else { return [] }
        epoch += 1
        phase = .awaitingCommit
        return [.scheduleDeadline(epoch: epoch, after: deadline)]
    }

    public mutating func deadlineElapsed(epoch: Int, isLoading: Bool) -> [Effect] {
        guard epoch == self.epoch, phase == .awaitingCommit else { return [] }
        self.epoch += 1
        guard isLoading else {
            phase = .idle
            return [.declareDead(.notLoading)]
        }
        if !started && waitedForStart + deadline < startBudget {
            waitedForStart += deadline
            return [.scheduleDeadline(epoch: self.epoch, after: deadline)]
        }
        phase = .awaitingPing
        return [.ping(epoch: self.epoch, bound: pingBound)]
    }

    public mutating func pingAnswered(epoch: Int) -> [Effect] {
        guard epoch == self.epoch, phase == .awaitingPing else { return [] }
        self.epoch += 1
        phase = .awaitingCommit
        return [.scheduleDeadline(epoch: self.epoch, after: deadline)]
    }

    public mutating func pingBoundElapsed(epoch: Int) -> [Effect] {
        guard epoch == self.epoch, phase == .awaitingPing else { return [] }
        self.epoch += 1
        phase = .idle
        return [.declareDead(.pingUnanswered)]
    }
}
