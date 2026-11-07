// Copyright (c) Meta Platforms, Inc. and affiliates.

// CommitWatchdogTests — GH-1073: the first-commit watchdog policy. A
// navigation the shell issued that never commits must end in exactly one
// dead verdict (so the lifecycle machine's recovery edges run), while a
// slow-but-alive navigation — one still waiting for its content process to
// launch, or one that answers the ping — must never be declared dead.
// Driven by a hand clock: the adapter's timers are modelled as the Effect
// values the policy returns.
import XCTest
@testable import ShellCore

final class CommitWatchdogTests: XCTestCase {

    private func deadlineEpoch(_ effects: [CommitWatchdog.Effect]) -> Int? {
        for case let .scheduleDeadline(epoch, _) in effects { return epoch }
        return nil
    }

    private func pingEpoch(_ effects: [CommitWatchdog.Effect]) -> Int? {
        for case let .ping(epoch, _) in effects { return epoch }
        return nil
    }

    /// A started navigation (provisional start seen), armed.
    private func started(_ w: inout CommitWatchdog) throws -> Int {
        let e = try XCTUnwrap(deadlineEpoch(w.navigationIssued()))
        w.provisionalStarted()
        return e
    }

    func testIssuedNavigationArmsTheDeadline() {
        var w = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
        let effects = w.navigationIssued()
        XCTAssertEqual(effects, [.scheduleDeadline(epoch: w.epoch, after: 30)])
        XCTAssertEqual(w.phase, .awaitingCommit)
    }

    func testCommitDisarms() throws {
        var w = CommitWatchdog()
        let e = try started(&w)
        w.committed()
        XCTAssertEqual(w.phase, .idle)
        XCTAssertEqual(w.deadlineElapsed(epoch: e, isLoading: true), [],
                       "a deadline from before the commit is ignored")
        XCTAssertEqual(w.deadlineElapsed(epoch: e, isLoading: false), [])
    }

    func testNotLoadingAndNeverCommittedIsDead() throws {
        // The navigation failed or was dropped without a commit (a
        // provisional failure, a stopped load): dead at the deadline,
        // started or not.
        for start in [false, true] {
            var w = CommitWatchdog()
            let e = try XCTUnwrap(deadlineEpoch(w.navigationIssued()))
            if start { w.provisionalStarted() }
            XCTAssertEqual(w.deadlineElapsed(epoch: e, isLoading: false), [.declareDead(.notLoading)])
            XCTAssertEqual(w.phase, .idle)
        }
    }

    func testSilentDeathAfterStartIsDeadWhenThePingNeverAnswers() throws {
        // The measured silent death: started, still "loading", no script
        // ever answers.
        var w = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
        let e = try started(&w)
        let ping = w.deadlineElapsed(epoch: e, isLoading: true)
        XCTAssertEqual(ping, [.ping(epoch: w.epoch, bound: 30)])
        let p = try XCTUnwrap(pingEpoch(ping))
        XCTAssertEqual(w.pingBoundElapsed(epoch: p), [.declareDead(.pingUnanswered)])
        XCTAssertEqual(w.phase, .idle)
        XCTAssertEqual(w.pingAnswered(epoch: p), [], "a late answer after the verdict is ignored")
    }

    func testSlowButAliveStartedPageIsNeverDeclaredDead() throws {
        // A heavily loaded host: still loading at every deadline, but the
        // page answers each ping — the watchdog keeps re-arming.
        var w = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
        var e = try started(&w)
        var rounds = 0
        for _ in 0..<5 {
            guard let p = pingEpoch(w.deadlineElapsed(epoch: e, isLoading: true)) else { break }
            let rearm = w.pingAnswered(epoch: p)
            XCTAssertEqual(rearm, [.scheduleDeadline(epoch: w.epoch, after: 30)])
            XCTAssertEqual(w.pingBoundElapsed(epoch: p), [],
                           "the answered ping's bound must not fire a verdict")
            e = try XCTUnwrap(deadlineEpoch(rearm))
            rounds += 1
        }
        XCTAssertEqual(rounds, 5, "every round must ping and re-arm")
        w.committed()
        XCTAssertEqual(w.phase, .idle)
    }

    func testAContentProcessStillLaunchingIsNotPingedUntilTheStartBudget() throws {
        // Before the provisional start, a ping would queue behind the very
        // launch it is waiting on: deadlines re-arm silently until the
        // start budget is spent, and only then is the page pinged.
        var w = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
        var e = try XCTUnwrap(deadlineEpoch(w.navigationIssued()))
        var silentRearms = 0
        while true {
            let effects = w.deadlineElapsed(epoch: e, isLoading: true)
            if let next = deadlineEpoch(effects) {
                silentRearms += 1
                e = next
                continue
            }
            XCTAssertNotNil(pingEpoch(effects), "the budget's end pings, never declares dead outright")
            break
        }
        XCTAssertEqual(silentRearms, 5, "180 s of launch at a 30 s deadline: 5 silent re-arms, then the ping")
    }

    func testDefaultsKeepAHealthyBootAt50SecondsSafe() {
        // The measured worst healthy case: first commit ~50 s after load
        // start, nearly all of it content-process launch (before the
        // provisional start). A launching navigation is never pinged before
        // the start budget, so its earliest dead verdict lands at
        // startBudget + pingBound — pinned at 4x the measured case. A
        // started page is only judged by an unanswered ping, given a bound
        // a busy-but-alive process meets.
        let w = CommitWatchdog()
        XCTAssertGreaterThanOrEqual(w.startBudget + w.pingBound, 4 * 50)
        XCTAssertGreaterThanOrEqual(w.pingBound, 30)
        XCTAssertGreaterThanOrEqual(w.deadline, 30)
    }

    func testStaleTimersFromAnEarlierNavigationAreIgnored() throws {
        // A recovery reload re-arms; the first navigation's timers and
        // ping must not produce a second verdict.
        var w = CommitWatchdog()
        let e1 = try started(&w)
        let p1 = try XCTUnwrap(pingEpoch(w.deadlineElapsed(epoch: e1, isLoading: true)))
        let e2 = try XCTUnwrap(deadlineEpoch(w.navigationIssued()))
        XCTAssertEqual(w.pingBoundElapsed(epoch: p1), [])
        XCTAssertEqual(w.pingAnswered(epoch: p1), [])
        XCTAssertEqual(w.deadlineElapsed(epoch: e1, isLoading: false), [])
        XCTAssertEqual(w.deadlineElapsed(epoch: e2, isLoading: false), [.declareDead(.notLoading)])
    }

    func testStalePingIsIgnoredWhileANewerPingIsPending() throws {
        // Both pings pending in .awaitingPing: only the epoch tells them
        // apart — navigation A's late answer or bound must not judge B.
        var w = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
        let e1 = try started(&w)
        let p1 = try XCTUnwrap(pingEpoch(w.deadlineElapsed(epoch: e1, isLoading: true)))
        let e2 = try started(&w)
        let p2 = try XCTUnwrap(pingEpoch(w.deadlineElapsed(epoch: e2, isLoading: true)))
        XCTAssertEqual(w.phase, .awaitingPing)
        XCTAssertNotEqual(p1, p2)
        XCTAssertEqual(w.pingAnswered(epoch: p1), [], "A's late answer must not re-arm B")
        XCTAssertEqual(w.pingBoundElapsed(epoch: p1), [], "A's bound must not judge B")
        XCTAssertEqual(w.phase, .awaitingPing)
        XCTAssertEqual(w.pingBoundElapsed(epoch: p2), [.declareDead(.pingUnanswered)])
    }

    func testSuspensionPausesTheWatchAndResumeRearmsInFull() throws {
        // iOS background: the clock keeps running while nothing in the page
        // can — timers and a pending ping from before the pause are void.
        var w = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
        let e = try started(&w)
        let p = try XCTUnwrap(pingEpoch(w.deadlineElapsed(epoch: e, isLoading: true)))
        w.suspended()
        XCTAssertEqual(w.phase, .paused)
        XCTAssertEqual(w.pingBoundElapsed(epoch: p), [], "a bound that ran out while suspended is void")
        XCTAssertEqual(w.pingAnswered(epoch: p), [])
        let rearm = w.resumed()
        XCTAssertEqual(rearm, [.scheduleDeadline(epoch: w.epoch, after: 30)])
        XCTAssertEqual(w.phase, .awaitingCommit)
        XCTAssertEqual(w.resumed(), [], "resume without a pause does nothing")
        // idle stays idle across a background trip
        var idle = CommitWatchdog()
        idle.suspended()
        XCTAssertEqual(idle.phase, .idle)
        XCTAssertEqual(idle.resumed(), [])
    }

    func testANavigationIssuedWhileSuspendedStaysPausedUntilResume() throws {
        // iOS: the content process dies after sceneDidEnterBackground; the
        // recovery reload is issued while the app is suspended. It must not
        // start a clock that runs out in the background: it is armed paused,
        // every pre-suspension timer and ping is void, and resume grants a
        // fresh, full deadline.
        var w = CommitWatchdog(deadline: 30, pingBound: 30, startBudget: 180)
        let e = try started(&w)
        let p = try XCTUnwrap(pingEpoch(w.deadlineElapsed(epoch: e, isLoading: true)))
        w.suspended()
        XCTAssertEqual(w.navigationIssued(), [], "a navigation issued while suspended arms no deadline")
        XCTAssertEqual(w.phase, .paused)
        w.provisionalStarted()
        XCTAssertEqual(w.deadlineElapsed(epoch: e, isLoading: true), [])
        XCTAssertEqual(w.pingBoundElapsed(epoch: p), [])
        XCTAssertEqual(w.pingAnswered(epoch: p), [])
        XCTAssertEqual(w.deadlineElapsed(epoch: w.epoch, isLoading: false), [],
                       "nothing is judged while suspended")
        let rearm = w.resumed()
        XCTAssertEqual(rearm, [.scheduleDeadline(epoch: w.epoch, after: 30)])
        // the fresh deadline then judges normally
        let e2 = try XCTUnwrap(deadlineEpoch(rearm))
        XCTAssertNotNil(pingEpoch(w.deadlineElapsed(epoch: e2, isLoading: true)),
                        "after resume a started, loading page is pinged, not declared dead")
    }

    func testSuspensionWhileIdleIsRememberedForTheNextNavigation() {
        var w = CommitWatchdog()
        w.suspended()
        XCTAssertEqual(w.phase, .idle)
        XCTAssertEqual(w.navigationIssued(), [], "issued while suspended: paused")
        XCTAssertEqual(w.phase, .paused)
        XCTAssertEqual(w.resumed(), [.scheduleDeadline(epoch: w.epoch, after: w.deadline)])
        XCTAssertEqual(w.phase, .awaitingCommit)
        // and once resumed, the next navigation arms normally
        w.committed()
        XCTAssertEqual(w.navigationIssued(), [.scheduleDeadline(epoch: w.epoch, after: w.deadline)])
    }

    func testOneVerdictPerNavigation() throws {
        var w = CommitWatchdog()
        let e = try started(&w)
        XCTAssertEqual(w.deadlineElapsed(epoch: e, isLoading: false), [.declareDead(.notLoading)])
        XCTAssertEqual(w.deadlineElapsed(epoch: e, isLoading: false), [])
        XCTAssertEqual(w.deadlineElapsed(epoch: w.epoch, isLoading: false), [],
                       "idle after a verdict until the next navigation")
    }

    func testVerdictDrivesTheMachinesRecoveryEdges() throws {
        // The adapter maps .declareDead onto .contentProcessTerminated: in
        // .launching that is a recovery entry (GH-1045), and the escalation
        // ends on the recovery surface after <= 2 automatic reloads.
        var w = CommitWatchdog()
        var m = LifecycleMachine()
        _ = m.handle(.didFinishLaunch)
        var effects: [ShellEffect] = []
        for _ in 0..<3 {
            let e = try started(&w)
            let p = try XCTUnwrap(pingEpoch(w.deadlineElapsed(epoch: e, isLoading: true)))
            XCTAssertEqual(w.pingBoundElapsed(epoch: p), [.declareDead(.pingUnanswered)])
            effects += m.handle(.contentProcessTerminated)
        }
        XCTAssertEqual(effects, [.reloadWebView, .reloadWebView, .showRecovery])
        XCTAssertEqual(m.state, .failed)
        XCTAssertNil(m.lastError)
    }
}
