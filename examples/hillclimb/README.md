# hillclimb

Simulation-based hillclimbing for billiards agents on the OpenBilliards kernel, and the
configuration we climbed with: solo 14.1 straight pool. Point the framework at a target of your
own, change your agent one lever at a time, and keep a change only when a comparison on common
random numbers, decided by a rule you wrote down before the run, says it helps.

Every trajectory, collision and pocket event comes from the kernel (the `pool_py` module, built
from this repository's source). Nothing in this directory computes ball motion: candidate
generation and the leave surface are plane geometry of the position, and every stroke an agent
can choose is simulated in the kernel before it is played.

## Contents

| Path | What it is | Generic or ours |
|---|---|---|
| `hillclimb/` | the framework: the kernel adapter, stroke noise, common random numbers (CRN), a runner whose results do not depend on the worker count, simulation-based selection (rollout scoring, argmax, best-of-K), run-length estimators, the target and lever protocol, the climb driver with its registration, and a toy target that tries the loop without the kernel | generic |
| `straightpool/` | our configuration: the solo 14.1 game, our target specs, the actuation envelope, simulation-based candidate selection, the leave surface with its painter, and the labelled base agent | ours |
| `hillclimb_examples/models/` | our two learned files, C2 and V, with their evaluators and model cards | ours |
| `hillclimb_examples/training/` | the trainers of C2 and V and the data generators that make their inputs | ours |
| `hillclimb_examples/demos/` | the five steps below on the toy target (no kernel needed), a small kernel target on the 9-ball break, and the public smoke on 14.1 | both |
| `tests/` | standard-library test suites, one directory per part | both |
| `climb_table.csv` | the numbers of the climb tables below, one line per number | ours |
| `LICENSE` | the MIT License, under which this directory is published | |
| `NOTICE` | what this directory runs on, and under which licences | |

`hillclimb/` knows no billiards rule. It needs a target, an agent and levers; to climb your own
target, write a small package of your own (a game, an agent, levers) and reuse `hillclimb/`
unchanged. `straightpool/` is the worked example, and `hillclimb_examples/demos/nine_break.py` the
smallest kernel target to start from.

## Install

Python 3.12 or later. The estimators and the selection add floats with the built-in `sum`, whose
results changed in Python 3.12; the published numbers and the tests rely on its 3.12 form.

1. Build the kernel binding from this repository's source into your virtual environment (needs
   Rust and maturin):

       cd crates/pool-py
       maturin develop --release

2. From the repository root, install this directory in editable mode:

       pip install -e examples/hillclimb             # to play: numpy and scipy
       pip install -e "examples/hillclimb[train]"    # to train: adds torch and scikit-learn

The package loads two sibling examples by file path: `examples/hand-noise-law` (the stroke noise
law) and `examples/run-length-estimator` (the estimators). Run it from a checkout of the
repository; an editable install keeps the two beside it. Without an install, the code also runs
from this directory (`examples/hillclimb`) once its dependencies are installed.

## Climb your own target in five steps

`hillclimb_examples/demos/climb_toy.py` runs these five steps on the framework's toy target,
`hillclimb/toy.py`, without the kernel.

1. **Write a target.** A target plays one game per key and turns the games into a number:
   `play(agent, key)` returns a JSON-ready record and `value(records)` the point estimate. Draw
   every random number of a game from its key, never from a global random state or the clock:
   `hillclimb.noise.standard_normals(key, i)` is the execution noise of decision i, and
   `hillclimb.crn.stream` with `crn.draw` or `crn.block` gives draws for any other use, one
   namespace per use. A target must be picklable, since workers receive it, and a dataclass whose
   fields hold every setting that changes it, since a registration writes them down (a
   module-level dataclass is both). A target whose games never call the kernel says so with
   `uses_kernel = False`, as the toy does. The toy target re-simulates every played stroke m times
   on draws of its own stream, the input of the conditional Monte Carlo estimate of E[L]:

```python
@dataclass(frozen=True)
class ToyRun:
    """The toy run-length target: its name, the noise scale, the cap on strokes per game, and m,
    the re-simulations per played stroke. Its games never call the kernel."""

    name: str = "toy-run"
    noise: float = 1.0
    cap: int = 60
    m: int = 32
    estimator: str = "conditional-monte-carlo"
    uses_kernel: ClassVar[bool] = False

    def play(self, agent, key):
        """One game: {"key", "run", "misses"}, with the miss count among the m re-simulations of
        every stroke played, the last one included."""
        stream = crn.stream(CMC_NAMESPACE, key)
        run, misses = 0, []
        for i in range(self.cap):
            aim = float(agent.act(run, Decision(key, i, self.noise)))
            executed = aim + self.noise * standard_normals(key, i)[0]
            misses.append(sum(1 for eps in crn.block(stream, i, self.m)
                              if abs(aim + self.noise * eps[0]) > WINDOW))
            if abs(executed) > WINDOW:
                break
            run += 1
        return {"key": key, "run": run, "misses": misses}

    def value(self, records):
        """E[L] = m * sum run / sum misses over the records (measure.run_length), exact."""
        return measure.run_length([(r["run"], sum(r["misses"])) for r in records], self.m)
```

2. **Describe your agent by a spec.** An `AgentSpec` names a builder (`"package.module:function"`)
   and holds the agent's JSON-ready parameters, so every worker process can rebuild the agent;
   `toy.spec(aim=0.8)` is the toy agent's. The agent has `reset(key)`, called before every game,
   and `act(state, decision)`.
3. **Write levers.** A lever is a named change of a spec: `apply(spec)` returns a new spec.
   `protocol.SetParams(name, params)` sets parameters, the common case. Levers act on specs, never
   on live agents. A lever of your own is a dataclass whose fields hold every parameter of its
   change, as `SetParams` is, since a registration writes them down.
4. **Register before the first game.** `climb.register(path, target, base, levers, ...)` writes the
   climb down with an empty result: the target's class and settings, the base, every lever's class
   and parameters (its operation and what it sets), the key namespace, n, the decision rule, the
   bootstrap seed and the replicate count. Fill in the one-page template below for what the file
   does not hold, and keep the two together. Use a namespace that no earlier comparison has used,
   so that no two results share their luck.
5. **Run once, read once.** `climb.climb(..., registration=path)` refuses to run unless its
   arguments equal the registration and its result is still empty, then writes its result into
   the same file.

```python
from fractions import Fraction

from hillclimb import climb, protocol, toy

target, base = toy.ToyRun(), toy.spec(aim=0.8)
levers = [protocol.SetParams("aim 0.2", {"aim": 0.2})]
settings = dict(namespace="my-climb/toy", n=100, seed="my-climb/toy/bootstrap",
                rule=protocol.DecisionRule(alpha=Fraction(1, 20), min_effect=2))

if __name__ == "__main__":
    climb.register("my-climb.json", target, base, levers, **settings)    # step 4: before any game
    final, steps = climb.climb(target, base, levers, workers=2,          # step 5: runs once and
                               registration="my-climb.json", **settings)  # writes its result
    print(final.params, [(step.lever, step.decision) for step in steps])
```

It prints `{'aim': 0.2} [('aim 0.2', 'adopt')]`: the lever is adopted. Workers are started as
fresh processes that import your script, so a script that passes `workers` above 1 keeps its
top-level work under `if __name__ == "__main__":`, as here. A single step without a registration
file is `climb.climb_step(target, base, lever, ...)`, which returns one `StepResult`;
`climb.write_result` writes it once and refuses a path that exists.

What the framework guarantees:

- Both arms play the same keys, so they meet the same racks, the same execution noise and the same
  draws. The difference is taken key by key, and its interval comes from a bootstrap that
  resamples keys, both arms of a key together.
- `workers` changes speed only: records come back in key order, equal as canonical JSON for any
  worker count.
- The decision is the rule's: adopt when the interval's lower bound is above `min_effect`, kill
  when its upper bound is below it, inconclusive otherwise. An infinite bound decides nothing.
- Estimates are exact `Fraction`s where the estimator is exact, `math.inf` for a run-length
  estimate without a single miss, and `None` for no estimate.
- `climb.climb` chains steps, each on its own namespace `<namespace>/step-<i>`, and carries an
  adopted lever into the base of the steps after it. A step's difference is its own: differences
  of separate steps are never added up.
- A registered climb runs once: `climb.climb` refuses a registration that differs from its
  arguments, the target's settings and every lever's operation and parameters included, or that
  already holds a result.
- Every result records the kernel build its games ran on (`StepResult.kernel`; None for a target
  whose `uses_kernel` is False, or where the kernel binding is not installed).

### Pre-registration template

`climb.register` records the part of a registration that the code can check. Fill in this page for
the rest before the first game, keep it beside the registration file, and change nothing after the
first game: a climb that needs a change is a new climb, on a new namespace.

```text
PRE-REGISTRATION                        (kept beside the file that climb.register wrote)

Question     does <lever> change <the target's value> for <the base agent> by more than
             min_effect?
Target       <name>: the game, the noise level r, the cap, value(records) and its estimator
Base spec    <builder> with <params as canonical JSON>
Levers       for each lever, in order: <name>: <the one change>
Keys         namespace <a string no earlier comparison used>; n = <games per arm and step>
Rule         DecisionRule(alpha = <Fraction>, min_effect = <number>): adopt when the lower bound
             of the 1 - alpha interval is above min_effect, kill when the upper bound is below
             it, inconclusive otherwise
Bootstrap    seed <string>; replicates <B>
Looks        one read at n; or interim looks at <n1, n2, ...> with alpha split by <rule>
Budget       <simulations per decision>; <CPU-hours>; what happens when it runs out
Voids        what voids a game (a refused stroke, a crash) and how a voided key is replaced
Envelope     the actuation limits every played stroke must keep, and how a breach is counted
Kernel       recorded at run time (StepResult.kernel)
Registered   <date and time>, <who>, <the registration file>
Result       written once into the registration file by climb.climb, never edited
```

## From the toy to a kernel target

The toy target plays its game in a line of arithmetic; a kernel target plays it in the kernel,
through `hillclimb/adapter.py`, the one module of the package that imports `pool_py`. Frames and
units are the kernel's: the table centre is the origin, x runs across the table and y along it,
in metres, seconds and radians.

- `State.rack(kind, seed)`: the kernel's seeded rack, `"nine"` or `"fifteen"`, the cue ball (id 0)
  included. A `State` holds a position as the kernel's own JSON: `positions()` reads the balls,
  `with_positions(...)` places, adds or removes them, and `table()` gives the table's size, ball
  radius and pockets.
- `Stroke(v0, phi, theta, a, b)`: one cue strike, with the cue speed in m/s, the aim and the cue
  elevation in radians, and the tip offset in ball radii. `noise.execute(stroke, key, i, r)`
  returns the stroke as executed at decision i of game `key`, under the hand noise law at level
  r, with the cue ball's placement when one is given.
- `simulate(state, stroke, seed=...)`: the kernel's `Outcome` of one stroke: its events in time
  order, where the balls stop, which balls dropped and into which pocket, and the first ball the
  cue ball touched. The seed is always explicit (`noise.shot_seed(key, i)` is decision i's). A
  stroke the kernel refuses returns an `Outcome` whose `truncated` holds the kernel's message.
- `simulate_many(jobs, threads=...)`: a list of (state, stroke, seed) jobs in one batch; result i
  is job i, and `threads` changes speed only. `select.rollouts` scores candidate strokes with it,
  and `measure.stroke_misses` re-simulates a played stroke with it.
- `rules_judge(ruleset, rules_state, outcome, call=None)`: the judgment of the kernel's rules
  crate on an outcome simulated with `keep_record=True`: legal or not, its fouls, the balls
  pocketed, whether the shooter continues, and the next rules state; `call` is the called shot of
  a ruleset that takes one. `pool_py.rules_catalog_json()` lists the rulesets, such as
  `"nineball-v1"`, and `pool_py.rules_initial_state_json(ruleset, 1)` gives the rules state of a
  fresh rack with player 1 to shoot.
- `min_elevation_deg(state, stroke)`: the cue-clearance floor, the least cue elevation in degrees
  at which the cue clears the rails and the other balls for this aim and tip offset.

`hillclimb_examples/demos/nine_break.py` uses these calls in one short file: it writes a kernel
target, its agent and one lever (steps 1 to 3 above) and runs one climb step on them
(`climb.climb_step`, without a registration file). Its target plays one 9-ball break per key: the
key seeds the rack, the agent places the cue ball on the head string and aims at the apex ball
with its cue at the cue-clearance floor, and the kernel simulates the executed stroke and judges
it. `value()` is the share of breaks after which the breaker keeps the table, a legal break that
pockets a ball:

```python
@dataclass(frozen=True)
class NineBreak:
    """The 9-ball break at noise level `noise`: the share of breaks that keep the table."""

    name: str = "9-ball break: share that keeps the table"
    noise: float = 1.0
    estimator: str = "share"

    def play(self, agent, key):
        """One break: {"key", "kept" (1: legal, and a ball pocketed), "pocketed"}."""
        rack = adapter.State.rack("nine", key)
        place, stroke = agent.act(rack, protocol.Decision(key, 0, self.noise))
        executed, _ = noise.execute(stroke, key, 0, self.noise)
        outcome = adapter.simulate(rack.with_positions({**rack.positions(), 0: place}), executed,
                                   seed=noise.shot_seed(key, 0), keep_record=True)
        kept = outcome.truncated is None and adapter.rules_judge(
            "nineball-v1", OPENING, outcome)["turn"] == "continue"
        return {"key": key, "kept": int(kept), "pocketed": [ball for ball, _ in outcome.pocketed]}

    def value(self, records):
        """The share of kept breaks over the records, exact; None without a record."""
        return Fraction(sum(r["kept"] for r in records), len(records)) if records else None
```

`OPENING` is the rules state at the break: player 1 to shoot, balls 1 to 9 on the table. The
agent's spec holds the cue ball's place `x` on the head string and the cue `speed`, and the one
lever moves the cue ball from the head spot toward the side rail (x from 0 to 0.5 m). One climb
step on 200 keys takes seconds (the command is under "Run the demo and the tests" below); with the
kernel built from this repository it adopts the lever, as more breaks from near the side rail keep
the table. For a target of your own, keep the protocol and change the game in `play`, the number
in `value` and the agent's parameters.

## Our configuration: solo 14.1 straight pool

- **The game** (`straightpool/game.py`): one high-run attempt. It opens with a fixed break that
  counts nothing (the kernel's 15-ball rack seeded by the game key, one break stroke, every ball
  it pocketed spotted back, then the cue ball in hand). From then on every stroke calls a ball and
  a pocket and scores when it is foul-free and the called ball drops in the called pocket; when
  one object ball is left, the others are re-racked. The run ends at the first stroke that does
  not score, when no pot can be called, or at the cap. Fouls, calls, spot-back and the re-rack
  follow the machine-checkable subset of the World Pool-Billiard Association rules for 14.1
  continuous, read off the kernel's event record.
- **Our targets** (`straightpool/targets.py`): the run length L at a noise level r of the ICGA
  execution-noise convention (the hand noise law with shape off). E[L] is estimated by
  conditional Monte Carlo (CMC): every played stroke is re-simulated m = 128 times under
  independent noise, and E[L] = m x sum L / sum misses. Our unit of record is r = 0.1 (`UNIT`); r
  is a free setting, and our results are named and printed only at r = 0.1, 0.25 and 0.40
  (`LEVELS`). **The hard target** (`HARD_TARGET`) is E[L] of about 200 balls with P(L >= 45) of
  at least 0.80 at r = 0.1, tested in its CMC form with a 10 % margin: the lower bounds must reach
  2000/9 (about 222.2) and 0.8^0.9 (about 0.818).
- **Simulation-based candidate selection** (`straightpool/candidates.py` with
  `hillclimb/select.py`): plane geometry lists the candidate strokes of a position (ghost-ball
  pots, cheat-the-pocket offsets, stun, roll and draw position strokes, and safeties) and lays a
  scrambled Sobol pool of strokes round the aim centre of every ball and pocket, on the direct
  line and on the one-rail bank and kick lines. The kernel simulates the candidates on the
  decision's shared draw block and the best by the objective is played.
- **The leave surface** (`straightpool/leave/`), our height map: a 2 cm grid over the cloth whose
  value in [0, 1] scores where the cue ball stops after the called shot (the makeability of the
  next pot from there, or the cover a safety gives). The painter declares the call and paints the
  grid for each decision; refinement then maximises E[pot x W(cue rest)] - lambda x P(foul). Every
  agent in the tables below refines its window candidates against it, though later layers (the
  pruned pick, the 2-ply search) can choose the final stroke. Its value was last measured
  directly in internal research log, row 89, and has not been measured since.
- **C2** (`hillclimb_examples/models/c2.py`, card `hillclimb_examples/models/MODEL-CARD-c2.md`): a
  learned pre-filter whose chosen stroke is always simulated. Five small MLPs, one per training
  fold; their mean logit orders the Sobol stroke pool at a search decision so that the kernel
  simulates the most promising strokes first. Every agent of the tables from the coverage stack on
  uses it.
- **V** (`hillclimb_examples/models/v.py`, card `hillclimb_examples/models/MODEL-CARD-v.md`): a
  learned leaf value used in the 2-ply search. Gradient-boosted regression trees over 30 features
  of the position after a re-rack (the cue ball and the break ball), evaluated in pure Python; it
  scores the leaves of the 2-ply search at the last shot before each re-rack in B, B + NGO, R1 and
  R1 + ML.
- **Training** (`hillclimb_examples/training/`): the data generators
  (`hillclimb_examples/training/datagen.py` plays games and writes the search-decision rows C2
  learns from; `hillclimb_examples/training/relog.py` replays the recorded games in the kernel and
  writes the break rows V learns from, with the bench leaves of the 2-ply) and the two trainers
  (`hillclimb_examples/training/train_c2.py`, torch; `hillclimb_examples/training/train_v.py`,
  scikit-learn, which exports plain trees). The shipped files were fitted on the project's own
  simulations, which do not ship. The fixtures here are small and fresh: they run the code end to
  end but do not reproduce the shipped weights. `hillclimb_examples/training/README.md` describes
  the chain from games to fitted files.
- **The base agent** (`straightpool/base_agent.py`): the labelled baseline your first climb step
  starts from (the smoke below plays its composition with a smaller best-of-K schedule), and the
  bottom row of the climb below: a mean run length of 7.08 over 100 games at r = 0.1 (internal
  research log, row 89), measured before the actuation envelope was enforced and not adopted as a
  result. The shipped agent aims its ball-in-hand strokes from where the game's ball-in-hand rule
  seats the cue ball, and the recorded agent did not, so the 7.08 label is the recorded agent's.
  Its card, `straightpool/AGENT-CARD-base.md`, states its composition, its levers and its label in
  full.

The playable full agent (R1 + ML below) is not part of this release.

## The climb so far: 14.1 run length at r = 0.1

**Kernel build of record.** Every number in this section and in `climb_table.csv` was measured on
kernel build 0.1.0+64e9e7a3 (a pre-release build from before the public release). The kernel in
this repository is newer, and kernel changes are not bit-exact, so runs on the current kernel are
not expected to reproduce these numbers bit for bit. Each number is cited
to its record as "internal research log, row N"; the log itself is not published.

**The hard target is not met in-envelope.** In the actuation envelope, the presented result is
R1 + ML at E[L] 193.00 against 138.50 for R1 on the same 60 keys under envelope v3, which caps the
cue ball's launch speed at a break at 30 mph: a gain over R1, labelled nominal-leave, not adopted
(internal research log, row 598). Under envelope v2, on other keys, R1 + ML read 178.36 (internal
research log, row 585), the figure in the table below. R1 alone reads 150.01 (internal research
log, row 571). B + NGO reached 263.8 at r = 0.10 and was certified (internal research log, row
543), but it breaks the actuation envelope (internal research log, rows 546, 556 and 559).

### In the envelope

| Agent | E[L] | Step gain on the same keys | Games | Estimator | Envelope | Status | Record |
|---|---|---|---|---|---|---|---|
| R1 + ML | 178.36 | +29.77 over R1 (95 %: +13.07 to +50.92) | 60 | CMC | v2 | a gain over R1; labelled nominal-leave; not adopted | internal research log, row 585 |
| R1 | 150.01 (upper bound 210.46 at 99.5 %) | | 12 | CMC | v2 | misses the hard target | internal research log, row 571 |
| R1 | 128.73 (upper bound 181.78 at 99.5 %) | | 12 | CMC | v1 | misses the hard target | internal research log, row 563 |

### Out of the envelope

| Agent | E[L] | Step gain on the same keys | Games | Estimator | Envelope | Status | Record |
|---|---|---|---|---|---|---|---|
| B + NGO | 263.80 (95 %: 251.36 to 276.30) | | 240 | CMC | breaks it | certified in CMC form, out of the envelope | internal research log, row 543 |
| B | 241.26 | +58.47 over B without the 2-ply (95 %: +32.69 to +84.77) | 321 | mean | not enforced | decision: adopt | internal research log, row 524 |
| coverage stack v4 | 142.52 (95 %: 127.68 to 158.79) | +39.70 over v3 (95 %: +22.79 to +57.75) | 300 | mean | not enforced | adopted | internal research log, row 451 |
| coverage stack v3 | 98.53 (95 %: 88.39 to 109.11) | +21.53 over v2 (95 %: +10.73 to +32.75) | 300 | mean | not enforced | adopted | internal research log, row 409 |
| coverage stack v2 | 82.71 (95 %: 65.54 to 102.51) | +22.05 over the coverage stack (95 %: +2.28 to +43.61) | 80 | mean | not enforced | adopted | internal research log, row 345 |
| coverage stack | 50.41 (95 %: 41.63 to 60.63) | +20.79 over the staged search (95 %: +10.11 to +32.21) | 80 | mean | not enforced | adopted | internal research log, row 318 |
| staged search | 30.28 | +7.59 over the forced-shot search (95.2 %: +2.77 to +12.41) | 80 | mean | not enforced | adopted | internal research log, row 217 |
| base agent | 7.08 | | 100 | mean | floor not checked | the labelled baseline; not adopted as a result | internal research log, row 89 |

Reading the tables:

- **E[L].** CMC is the conditional Monte Carlo estimate above; mean is the mean run length over
  the games. Intervals are two-sided bootstrap intervals over games at the level shown. Both R1
  readings stopped at an interim look of a sequential design, which prints only the one-sided
  upper bound. B + NGO's certificate also holds the second part of the hard target: P(L >= 45) 0.859
  (95 %: 0.846 to 0.872) over 460 games. R1 + ML reached 45 balls in 43 of its 60 games under
  envelope v2 (internal research log, row 585).
- **Step gain.** The paired difference, the agent minus the base it was compared with, on the same
  keys, with a bootstrap interval over keys. From the coverage stack to B, each step was adopted
  when its interval's lower bound was above 2 balls; the staged search's rule asked for a lower
  bound above zero and above an allowance for its extra compute, and R1 + ML's only for a lower
  bound above zero. The staged search's interval is a normal interval at its sequential boundary
  (z = 1.9774), hence its level of 95.2 %. Every level comes from its own block of keys: compare an
  agent only with the base it was paired with, and never add step gains up across rows.
- **The actuation envelope** (`straightpool/envelope.py`) bounds what an agent may command on every
  played stroke: a cue speed v0 of at most 12 m/s (version 2 allows 13.4 m/s at a break
  decision, the first decision after a re-rack), a cue elevation at or above the cue-clearance
  floor (the lowest elevation at which the cue clears the rails and the other balls), and a tip
  offset within half a ball radius. 12 m/s is the game's own power cap. Envelope v2 adopts 13.4 m/s
  as its break cap on v0: about 30 mph (13.41 m/s) rounded down, the top of the 25-30 mph
  range of cue-ball speeds that D. G. Alciatore's break-speed FAQ gives for typical top
  professional breaks (https://drdavepoolinfo.com/faq/break/speed/). Both caps bound the
  cue speed v0, not the cue ball's speed: on the kernel in this repository, with its default
  strike options and a centre hit, the cue ball leaves the tip at about 1.54 times v0,
  so a break at v2's cap sends it off at about 46 mph and a stroke at the 12 m/s cap at
  about 41 mph, above the FAQ's range. The out-of-envelope rows were measured before the
  envelope was enforced. B + NGO commanded more than 12 m/s on 1.9 % of its strokes, a fifth of its
  breaks (internal research log, row 546), and an elevation below the cue-clearance floor on 92 %
  of its strokes (internal research log, row 556). Held to the floor and re-planned on sampled
  positions, its summed miss hazard rose by about 109 %, an immediate-hazard reading far past the
  18.7 % rise at which its E[L] falls under the bar (internal research log, row 559).
- **Nominal-leave.** R1 + ML's leave term scores each candidate at the cue ball's noise-free
  stopping point, the planning form that an earlier diagnosis named as the reason a screen's gain
  did not carry into whole games (internal research log, row 577). Its gain stands with that
  label; it is reported, not adopted.

The agents, from the bottom row up:

- **base agent**: the baseline that ships here (`straightpool/base_agent.py`): the painter's call
  refined by simulation against the leave surface, with no learned file and no Sobol or break
  search. The v1 box (speed, elevation, tip) held on every played stroke, but the cue-clearance
  floor was not checked, so its number is not in-envelope.
- **forced-shot search**: where no candidate of the window is likely enough to score, a two-stage
  search over a scrambled Sobol pool of strokes round every ball-and-pocket aim centre, the best
  few re-scored on common draws.
- **staged search**: the forced-shot search with a staged extension that draws a larger pool only
  when the first stage finds nothing.
- **coverage stack**: the staged search with C2 choosing the first 32 pool strokes to simulate,
  plus coverage layers for the break with ball in hand, give-up decisions, ordering by make
  probability, and decisions with a single option.
- **coverage stack v2**: adds a wider shot menu, a search trigger inside the rack and a fix to the
  break decision.
- **coverage stack v3**: v2 plus a pick by make count over the union of candidates, on the
  decision's own draws.
- **coverage stack v4**: v2 plus a pruned full-grid pick in place of v3's: every candidate screened
  on 32 draws, the best 8 recounted on 256, all on the decision's own common random numbers.
- **B**: coverage stack v4 plus a break gate (more break candidates, scored on the same draws), an
  exact exit (a leading stroke that scores on all 256 of its draws is played without scoring the
  rest of the grid) and the 2-ply search at the last shot before each re-rack, whose leaves V
  scores.
- **B + NGO**: B with the pruned full-grid pick also at give-up and single-option decisions.
- **R1**: B + NGO held to the actuation envelope: a speed rule keeps every commanded speed inside
  its box, and validate-then-reseed re-plans any stroke below the cue-clearance floor. It ran under
  envelope v1 in internal research log, row 563, and under envelope v2 in internal research log,
  rows 571 and 585.
- **R1 + ML**: R1 with the give-up fix: where R1 finds no stroke to play, a menu of passing
  strokes and a leave term choose one.

`climb_table.csv` holds every number of the two tables, one line per number: its record
(`key`), the date of the record, the point, the interval (`ci_low`, `ci_high` and `ci_level`; a
blank `ci_low` marks a one-sided upper bound), the games (`n`), the estimator class (`cmc`,
`mean`, the paired differences `paired-cmc` and `paired-mean`, and the P(L >= 45) estimates
`cmc-p45` and `indicator-p45`), the envelope status, and the noise level r of the ICGA convention
(`icga_v1_r`). Lines in the envelope come first.

## Run the demo and the tests

From this directory (`examples/hillclimb`):

    python -B -m hillclimb_examples.demos.climb_toy    # the five steps on the toy target; no kernel needed
    python -B -m straightpool.leave.demo               # one position's leave surface as text; no kernel needed
    python -B -m hillclimb_examples.demos.nine_break   # one climb step on the 9-ball break; needs pool_py
    python -B -m hillclimb_examples.demos.smoke        # one tiny climb step on the 14.1 base agent; needs pool_py
    python -B -m unittest discover -s tests -t .       # every suite

The smoke plays two keys with a cap of one ball and a small best-of-K schedule (every played
stroke is still re-simulated 128 times), so it takes seconds and says nothing about the agents.
Without options its lever changes nothing: both arms play the same agent on the same keys, so
their games and measurements are identical and the paired difference is zero, which checks the
whole path end to end. `--set NAME=VALUE` makes the lever set one parameter of the base agent
instead. Kernel tests skip without `pool_py`, and training tests skip without torch or
scikit-learn. Run the suites on Python 3.12 or later.

Values the tests compute with the C math library or BLAS are checked against their recorded values
within a tolerance by default (`tests/platforms.py`): another platform, or another macOS build, can
round them differently in the last bits. They were recorded on macOS on Apple silicon; where they
were recorded, `HILLCLIMB_EXACT_PINS=1 python -B -m unittest discover -s tests -t .` runs every
suite with those values pinned bit for bit. The variable does nothing on other platforms, and the
CI workflow leaves it unset.

## Licence

This directory is under the MIT License: `LICENSE`, beside `pyproject.toml`, holds its text, and a
wheel or source archive built from here carries it with `NOTICE`. It contains first-party code
only; the two learned files are first-party, fitted on the project's own simulations. `NOTICE`
lists what it runs on:

- **The kernel** (`pool_py`, built from `crates/pool-py`): MIT; Apache-2.0 for the pooltool-derived
  parts, attributed in the NOTICE at the root of the repository and listed in
  THIRD_PARTY_NOTICES.md; ACM's software terms may also apply to the quartic and cubic solver
  (`crates/pool-core/src/math/quartic.rs` and `crates/pool-core/src/math/cubic.rs`, which
  implement ACM Algorithm 1010). No kernel binary ships here: you build the module from the
  repository's source (Install, above). Its direct Rust dependencies besides the kernel's own
  crates, as `crates/pool-py/Cargo.toml` names them, are pyo3 (MIT OR Apache-2.0), numpy from the
  rust-numpy project (BSD-2-Clause) and serde_json (MIT OR Apache-2.0).
  `web/vendor/LICENSE-rust-crates.txt` holds the notices of the crates in the repository's
  WebAssembly binaries only.
- **Play-time dependencies** (pinned in `pyproject.toml`): numpy 2.5.1 (BSD-3-Clause AND 0BSD
  AND MIT AND Zlib AND CC0-1.0) and scipy 1.18.0 (BSD-3-Clause for SciPy's own code; the code it
  bundles, such as Qhull, Boost.Math and HiGHS, keeps its own licence, which SciPy lists in
  LICENSES_bundled.txt). scipy is needed to play: the scrambled Sobol stroke pool comes from
  `scipy.stats.qmc.Sobol`. Depending on the platform, scipy's wheels bundle runtime libraries:
  OpenBLAS (BSD-3-Clause), the GCC runtime libraries libgfortran and libgcc (GPL-3.0-or-later WITH
  GCC-exception-3.1) and libquadmath (LGPL-2.1-or-later); some numpy wheels bundle the same. The
  Sobol direction numbers of S. Joe and F. Y. Kuo ship inside scipy; this directory vendors no
  direction table.
- **Training extras**: torch 2.13.0 and scikit-learn 1.7.2. torch is needed only to train C2 (C2
  evaluates with numpy), and scikit-learn only to fit V. On Linux, torch 2.13.0 from the default
  package index also installs NVIDIA's CUDA libraries and triton, which come under their own
  licence terms; PyTorch also publishes CPU-only builds, whose dependency lists we have not
  checked for this pin.
