# Model card: V, the learned leaf value

## What it is

V is a learned leaf value used in the 2-ply. In 14.1, when one object ball is left the other
fourteen are re-racked, and the run goes on only if the next shot, the break shot, pockets the
last ball and opens the rack. The stroke before a re-rack therefore matters twice: it must pocket
its ball, and it must leave the cue ball where the break shot is easy. At that stroke our agent's
2-ply search looks one stroke further. For each candidate it takes the positions the candidate's
simulations leave, re-racks, and asks how likely the break shot is to fail from there. V answers
that question from the position alone, at almost no cost, instead of searching the break shot
itself. The kernel still simulates every candidate stroke and the stroke that is played.

## Files

| File | What it holds |
|---|---|
| `v-leaf-value.json.gz` | 300 regression trees as gzip-compressed JSON, byte for byte the file the research agent loaded (digest `8563d9166b7df342`) |
| `v.py` | loads the file and checks its digest, finds the break ball (`break_ball`), computes the 30 inputs (`features`) and evaluates the trees in pure Python (`predict`, `leaf_value`); no numpy or scikit-learn needed |

## Use

```python
from hillclimb_examples.models import v

model = v.load()                        # refuses a file whose digest does not match
found = v.break_ball(positions)         # (ball id, (x, y)) after a re-rack, or None
if found is not None and 0 in positions:
    value = v.leaf_value(model, positions[0], found[1])
```

`positions` is {ball id: (x, y)} in the kernel frame with the cue ball as id 0.

## Inputs

30 numbers from two points, the cue ball and the break ball after the re-rack, mirrored so that
the break ball is on the positive-x side (the table and the rack are symmetric): the four
coordinates; the distance between the two balls; for each of the six pockets, the cut angle at the
break ball, the distance from the break ball to the pocket, and whether the racked balls block
that path; whether the rack blocks the cue ball's path to the break ball; the smallest cut to an
open pocket and its distance; the distances of both balls to the foot spot; and each ball's
distance to the nearest cushion line. `v.FEATURE_NAMES` lists them in order. `v.break_ball` finds
the break ball: the one object ball that is not on a site of the re-rack.

## Output

The predicted chance that the break shot fails from that position, clipped to [0, 1]
(`v.leaf_value`; `v.predict` gives the unclipped value, which can fall slightly outside).

## The model

Gradient-boosted regression trees on squared error: 300 trees of at most 15 leaves, learning rate
0.05, at least 40 positions per leaf, L2 regularisation 1.0, 255 bins, no early stopping. The
evaluator adds the baseline and the tree values in the fitting library's own order in float64, so
it equals scikit-learn's prediction exactly; `tests/models/test_v.py` checks that on a fresh fit
and checks the shipped trees against the reference evaluator on fresh positions.

## Training

V was fitted on the project's own simulations, which do not ship: 3,254 break positions (internal
research log, row 488) from 14.1 games that the agent of the time (the layered coverage-stack
agent our later agents build on) played on the kernel at noise 0.1x (the ICGA execution-noise
convention at r = 0.1: the hand noise law with shape off), re-simulated to recover the positions.
Each position's label is the share of 32 noisy simulations in which that agent's best break stroke
from the position failed.

The trainer and the re-simulation step that prepares its positions are in
`hillclimb_examples/training/`. Their small fixtures run the code end to end; they cannot
reproduce the shipped trees, whose data stay private.

## Where it sits in the agent

At the stroke before each re-rack, the 2-ply search scores every candidate by the chance that the
run ends within two strokes, f + (1 - f) m: f is the share of the candidate's noisy simulations
that fail, and m is the mean chance that the break shot fails over the positions its successful
simulations leave. V gives that chance at the leaves where the agent's break-shot search applies;
the other kinds of leaf keep fixed values measured once on recorded games (part of the agent, not
of this model). The candidate with the smallest chance is played. The 2-ply cost about 2.4 CPU
seconds per decision where it ran (internal research log, row 524). V is part of B + NGO and of
the in-envelope agents below.

## Measured effect

In-envelope results come first. The hard target, E[L] (the expected run length, in balls per
game) about 200 with P(L >= 45) >= 0.80 at noise 0.1x, is not met in-envelope.

| Agent that carries V's 2-ply | E[L] at noise 0.1x | Status |
|---|---|---|
| R1 + ML (R1 with the give-up fix) | 178.36 | in-envelope; a gain over R1, labelled nominal-leave, not adopted (internal research log, row 585) |
| R1, our in-envelope agent | 150.01 | in-envelope (internal research log, row 571) |
| B + NGO | 263.8 at 0.10x | certified, but breaks the actuation envelope (internal research log, rows 543, 546, 556, 559) |

V's own share of these numbers was not measured in-envelope. Its own effect was measured earlier,
before the actuation envelope was enforced, so these numbers carry that mark:

- Decision by decision, without new games: on 120 fresh decision states before a re-rack,
  choosing by V cut the chance that the run ends within two strokes by 0.0134 per decision (95 %
  interval 0.0042 to 0.0214), above the bar of 0.0066 fixed before the read, with one harmful
  switch in 120: it passed that bar (internal research log, row 500). The exact 2-ply, which
  searches the break shot at every leaf, cut it by 0.0193 on the same draws: V kept 0.70 of that
  gain (interval 0.24 to 0.96) without simulating any leaf, where the exact 2-ply spent about 1,563
  CPU seconds per decision on its leaves.
- Whole games: adding the V-scored 2-ply to the coverage-stack agent of the time raised
  E[L] from 182.79 to 241.26 balls per game, +58.47 (95 % interval +32.69 to +84.77), over 321
  paired games at noise 0.1x, and P(L >= 45) from 0.791 to 0.875; adopted (internal research log,
  row 524).

Every number on this card was measured on kernel 0.1.0+64e9e7a3. Kernel changes are not
bit-exact, and the public kernel is newer than that build, so games played now are not the
recorded games and these numbers are not expected to reproduce bit for bit.

## Limits

- One agent's view: the label is how the agent of the time broke from a position. A different
  break-shot search would value positions differently.
- One table and one re-rack: the inputs assume the kernel's standard table and the fourteen
  racked balls on the template sites (within 5 mm) with the apex empty. When more than one object
  ball is off the sites there is no break ball, and V does not apply.
- Two points only: the inputs are the cue ball and the break ball; the rest of the leaf, such as
  the small gaps in a real rack, is ignored.
- A coarse fit: 3,254 positions for 300 trees of 15 leaves. The value is an estimate, not a
  simulation, and every stroke is still simulated.
- The decision-level gain is not an E[L] result, the E[L] gain was measured before the envelope
  was enforced, and V's share of the in-envelope numbers is unmeasured.

## Licence

First-party: fitted on the project's own simulations. It ships under the MIT licence with the rest
of this directory.
