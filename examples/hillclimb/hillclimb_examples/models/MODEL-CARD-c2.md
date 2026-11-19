# Model card: C2, the learned pre-filter

## What it is

C2 is a learned pre-filter whose chosen stroke is always simulated. At a search decision our 14.1
agent lays a pool of candidate strokes round the aim centres of the position and can afford to
simulate only part of it. C2 puts the pool in order, so that the kernel simulates the most
promising strokes first. C2 never picks the stroke that is played: every stroke the search can
choose is simulated under noise and judged by the rules, and the search keeps the best by its own
objective. A poor order costs simulations, not legality.

## Files

| File | What it holds |
|---|---|
| `c2-ordering-scorer.json` | five small networks, one per training fold: their weights, their input means and scales, and the fold-weight digests (combined digest `bb5b225cbfcbc454`); nothing else |
| `c2.py` | loads the file and checks every digest, computes the 47 inputs (`features`), scores a pool in numpy (`Scorer.score`) and orders it (`order`) |

torch is needed only to retrain C2. The weights in the file are those of the research agent,
rebuilt from the fold weights alone; the fold-weight digests are unchanged.

## Use

```python
from hillclimb_examples.models import c2

scorer = c2.load()                      # refuses a file whose digests do not match
rows = c2.features(position, pool, run=run, break_decision=False, n_centres=n_centres)
ranked = c2.order(scorer.score(rows))   # pool indices, the most promising first
```

`position` is {ball id: (x, y)} in the kernel frame with the cue ball as id 0, and `pool` holds
the members of `straightpool.candidates.sobol_pool`.

## Inputs

47 numbers per pool member, all plane geometry of the position (none comes from a simulation):

- 20 about the position: the run so far, how many object balls are left, the cue ball, the
  centroid and spread of the object balls, the distances from the cue ball to them, how many sit
  near a pocket, the closest pair, whether this is the first decision after a re-rack, the number
  of aim centres, and the smallest cut angle among the first 32 pool members (the strokes known
  before any simulation);
- 24 about the stroke: the ball and the pocket it aims at, its cut angle, the distances from the
  cue ball to the ball and from the ball to the pocket, the angle at which the ball approaches the
  pocket, how close other balls come to those two paths, and the stroke itself (speed, aim
  direction, elevation, tip offset) with the cue-ball position;
- 3 for the kind of aim: direct, bank or kick.

`c2.FEATURE_NAMES` lists them in order. Positions are read at 6 decimals and stroke numbers at 5,
as in the training rows.

## Output

A score per pool member: the mean of the five networks' logits. A higher score means the stroke is
more likely to pocket its ball in its pocket without a foul when it is struck once under noise.
The pool is ordered by score, descending, an exact tie toward the lower pool index. The scores are
not calibrated probabilities; only the order is used.

## The network

Each fold standardises the inputs by the means and scales of its training rows, then applies
47 -> 128 -> 128 -> 1 with ReLU in float32. The numpy evaluator in `c2.py` follows the training
library's float32 arithmetic; its logits agree with the training library's to float32 rounding
(at most about 4e-7 on the test rows) and its orders are the same on every test pool, but they are
not bit-identical, so two strokes whose scores are within float32 rounding of each other can
order differently.

## Training

C2 was fitted on the project's own simulations, which do not ship. Each training row is one
candidate stroke that the search agent of the time simulated at one of its search decisions, in
14.1 games it played on the kernel at noise 0.1x (the ICGA execution-noise convention at r = 0.1:
the hand noise law with shape off); the label says whether that single noisy simulation pocketed
the stroke's ball in its pocket without a foul. The data held 1,967 search decisions with 175,456
simulated strokes, 2,695 of them successful.

The decisions were split into five folds by game. Each fold's network was trained on the other
four with Adam (learning rate 1e-3, weight decay 1e-3) for 60 epochs in batches of 256, on binary
cross-entropy of the logit, with the inputs standardised by the training rows (a scale under 1e-8
set to 1). Held out by game, the scorer's AUROC was 0.794 (internal research log, row 231).

The trainer and the data generator that makes its rows are in `hillclimb_examples/training/`.
Their small fixtures run the code end to end; they cannot reproduce the shipped weights, whose
data stay private.

## Where it sits in the agent

At a search decision the agent lays 512 strokes from a scrambled Sobol set round the aim centres
of every ball and pocket. C2 orders them; the first 32 in C2's order are simulated once each, and
when none of them succeeds the next 96 are. The strokes that succeed go on to the search's next
stage, where they are simulated again on shared noise draws, and the agent plays the best of
them. From the coverage stack on (the layered agent adopted in internal research log, row 318),
C2 orders this pool in every agent we measured, including the in-envelope agents below.

## Measured effect

In-envelope results come first. The hard target, E[L] (the expected run length, in balls per
game) about 200 with P(L >= 45) >= 0.80 at noise 0.1x, is not met in-envelope.

| Agent that carries C2 | E[L] at noise 0.1x | Status |
|---|---|---|
| R1 + ML (R1 with the give-up fix) | 178.36 | in-envelope; a gain over R1, labelled nominal-leave, not adopted (internal research log, row 585) |
| R1, our in-envelope agent | 150.01 | in-envelope (internal research log, row 571) |
| B + NGO | 263.8 at 0.10x | certified, but breaks the actuation envelope (internal research log, rows 543, 546, 556, 559) |

C2's own share of these numbers was not measured in-envelope. Its own effect was measured earlier,
before the actuation envelope was enforced, so these numbers carry that mark:

- C2 ordering the first search stage of the agent of the time, against the same agent with its
  fixed pool order: E[L] 26.46 -> 30.50, +4.04 balls per game (normal interval -1.70 to +9.78
  at z = 1.9774), 80 paired games at noise 0.1x; an exploratory screen without a registration,
  unresolved, not adopted on its own (internal research log, row 242). In the same games the share of search decisions that found a successful stroke
  among the first 32 simulated rose from 0.298 to 0.768 (+0.470, interval +0.338 to +0.598).
- C2's order together with a break-shot selection hook, against the same base: E[L] 25.98 ->
  38.49, +12.52 balls per game (pre-registered interval +7.55 to +17.49), 160 paired games at noise
  0.1x; it met the adoption condition (internal research log, row 252). This is the pair's
  effect, not C2's alone.

Every number on this card was measured on kernel 0.1.0+64e9e7a3. Kernel changes are not
bit-exact, and the public kernel is newer than that build, so games played now are not the
recorded games and these numbers are not expected to reproduce bit for bit.

## Limits

- One configuration: C2 learned from one agent's search decisions, on the kernel's standard table,
  at noise 0.1x, in 14.1 positions with the cue ball on the table. Elsewhere it is extrapolating.
- It ranks single noisy strokes by hand-made geometry. It knows nothing of the kernel beyond what
  its training rows saw, and most strokes it ranks high still fail (successes were 1.5 % of the
  simulated strokes).
- It orders; it does not decide. Its value is fewer wasted simulations at a fixed budget, and it
  was never measured in-envelope on its own.
- The numpy evaluator is not bit-identical to the training library (see The network), and the
  recorded decisions passed the object balls in the kernel state's own order, which can change
  the last bits of the summed position inputs; whether a whole game replays decision for decision
  is not claimed here.

## Licence

First-party: fitted on the project's own simulations. It ships under the MIT licence with the rest
of this directory.
