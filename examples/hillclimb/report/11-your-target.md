# 11. Using the framework on your own target

The release separates what is generic from what is ours. The generic framework knows only a simulator
interface, a seeded noise law and a target specification; the 14.1 configuration (rules, candidate
generator, leave surface, targets, agent and the two learned files) is the worked example. File names
below follow the release layout; the package README is authoritative.

## 11.1 What you need

- **A simulator** that maps a commanded action to an outcome, deterministically for given inputs,
  reached through one small adapter (simulate an action under noise, judge the outcome, read the
  state). For billiards the adapter wraps the public kernel module `pool_py`.
- **A noise law keyed by (game seed, decision index)**, so two arms can share every draw; the billiards
  law is public as the repository's hand-noise-law example (`examples/hand-noise-law`).
- **A target**: a metric that is the goal itself, a noise level, bars with a margin for estimator bias,
  and a versioned action envelope.
- **A baseline agent** and its compute per decision.

## 11.2 The protocol

1. **Write the target down** with its envelope version. Ours: E[L] about 200 and P(L ≥ 45) ≥ 0.80 at
   0.1x, certified against 222.2 and 0.818 (internal research log, row 543).
2. **Build the envelope guard before the agent**, on the function that sends actions to the simulator;
   refuse rather than clip, and count commanded actions against it in every run.
3. **Build and validate the instrument**: a paired runner with common random numbers whose output does
   not depend on the number of workers (ours was byte-identical at 16 workers; row 9), and a
   variance-reduced run-length estimator (`examples/run-length-estimator`) validated on frozen games
   before use (row 510).
4. **Census how the baseline fails** and propose one lever per class of failure.
5. **Screen** each lever: a short page, 40 to 80 paired games, one change, matched compute, words fixed
   in advance; keep every screen, negative ones included, in a log.
6. **Confirm on fresh seeds** with the full page below, plus a transfer prediction written before the
   read.
7. **Adopt by the registered word only**; if compute is not matched, declare a reversal control.
8. **Keep the chain**: each link on its own block, levels read on the adopting block, never summed or
   pooled.
9. **Certify a level** at your margin with a group-sequential certificate decided at its second look
   (appendix C).
10. **Stop by rule**: kill rows written in advance and a do-not-repeat list.

## 11.3 A one-page pre-registration

Commit this before the first game. The package README ships its own template, written for the
framework, to keep beside the registration file that `climb.register` writes.

| Field | What to write |
|---|---|
| Identity | ID, date, author; the commit that registers the page; results field empty |
| Claim and falsifier | the claim in one sentence, then the result that would falsify it |
| Object | base arm and test arm, differing by exactly one change |
| Conditions | noise law and level; envelope version; simulator and interpreter versions |
| Pairing | seed derivation per (game, decision); a fresh seed block; void and replacement rules |
| Estimand and estimator | e.g. paired ΔE[L] by conditional Monte Carlo; bootstrap unit and resamples |
| Size and looks | n; interim looks and their boundaries (e.g. two-look O'Brien-Fleming); futility rule |
| Power line | probability of each word at the planned n, with the expected effect shrunk for screen optimism; register only if a pass is at least as likely as not |
| Words | a complete, non-overlapping set (e.g. GAIN / OPEN / FALSIFIED) with thresholds and what follows each |
| Checks before any word | void classes: envelope breach, replay mismatch, too few complete games |
| Compute line | counter; ratio between arms; matched or declared; cost cap |
| Read rule | one read in its own process; output written once; independent recount from this page |
| Labels and non-claims | envelope version and markers; what the word does not say |

## 11.4 Pitfalls we hit

Section 9 gives the evidence; in short: proxy metrics; an envelope that is not on the counted path;
positions scored at the nominal leave; gains that are really compute; levels compared across blocks or
envelope versions; the best of many noisy estimates taken at face value; instruments that cannot tell
agents apart (show first that yours separates two choosers known to differ; internal research log,
do-not-repeat list); implicit frames, unpinned versions and rounded state logs; held-out sets that
overlap the bench; verification that outgrows measurement; and naming a noise level human without an
anchor you can publish (internal decision log, line 551).

## 11.5 Where the pieces are

| You need | In the release |
|---|---|
| Seeded noise per (game, decision) | `examples/hand-noise-law` |
| Run-length estimators (capped maximum likelihood, conditional Monte Carlo, whole-game bootstrap) | `examples/run-length-estimator`, wrapped by the framework's `measure.py` |
| Simulator adapter, common-random-number blocks, paired compare, worker-invariant runner, target and lever protocol, a small climb driver | the generic framework |
| Simulation-based selection: rollout scoring, argmax, best-of-K refinement | the framework's `select.py` |
| A worked configuration: rules, candidate generator, leave surface and painter, targets, a recorded base agent | the 14.1 configuration, e.g. `straightpool/candidates.py` |
| The learned parts and how to retrain them | C2 and V with model cards; trainers with their data generators |
| Envelope guard, register-and-read-once helper, sequential certificates | the actuation envelope is `straightpool/envelope.py`; `climb.register` and `climb.climb` (`hillclimb/climb.py`) register a climb and read it once; sequential certificates are described in section 3 and appendix C |
