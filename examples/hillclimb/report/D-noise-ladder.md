# Appendix D. The noise and hand ladders

The noise ladder measures one agent across noise levels; σ\*200 is the largest level at which it holds
the hard target with plausible play (section 3.6). Keys and markers are as in section 0.

- **In-envelope first.** No in-envelope certificate exists at any noise level (internal research log,
  rows 562, 585). The in-envelope readings at 0.1x are in Table 0.1; the hand ladder is described in
  D.1.
- **The certified rungs** are listed once, in Table 6.2. Every one was read before the actuation
  envelope was enforced in the counted path (rows 546, 556, 559); they stand as filed, with †.
- **One composition per rung.** The certified composition changed at 0.01x, 0.02x, 0.03x, 0.07x and
  0.08x, and rungs are never pooled, paired or relabelled. The 0.02x composition is v2 + BREAK-SWEEP,
  not v3 (internal noise-ladder record, 2026-09-29).
- **Estimators.** Up to 0.07x the certified E[L] is the plain form (capped MLE, cap 1,000 balls); from
  0.08x it is the CMC form, whose bars are 222.2 and 0.818 with the plain point also at 200 or more
  (section 3.3). Two readings in D.3 taken before the estimator changed on 2026-09-18 are censored means
  at a cap of 400, as marked (rows 321, 323).

## D.1 The human-hand ladder (hand v1)

In the hand-ladder read, MM plans and plays at the hand, M plans at 0.1x and plays at the hand, and a
fancy shot is a stroke whose make chance under the arm's own hand is below one half (row 562). Planning
at the hand gave longer runs and fewer fancy shots, at the registered primary tier and at the public
0.40x check, so the registered word was IMPROVED + REGULATED; run lengths at every hand tier were a
small fraction of those at 0.1x. Every commanded stroke in these games was inside envelope v1 and at or
above the cue-clearance floor (row 562). Table D.1 prints the numbers at the public tiers, 0.25x and
0.40x. The three upper tiers, the registered primary tier among them, are neither named nor printed,
because they were fitted on data we cannot redistribute. The research hand's speed term, which acts at
every tier, is a private research fit; it does not ship,
so public runs do not reproduce the recorded hand (section 2.4). The result prices what planning for
the hand buys this agent; it does not measure human play.

**Table D.1. The hand ladder at the public tiers [v1].** Both arms play every stroke at the hand of the
tier named; MM also plans there, M plans at 0.1x. E[L] is in the CMC form (section 3.3); P(L ≥ 45)
gives the games reaching 45 balls and their share; the fancy share is the share of in-rack strokes that
were fancy shots, with a game-clustered interval. The last row is the paired difference MM − M on
common random numbers; its fancy-share difference is in percentage points.

| Arm | Tier | Plans at | Games | E[L]_CMC [95 % interval] | P(L ≥ 45) | Fancy share [95 % interval] | Key |
|---|---|---|---|---|---|---|---|
| MM | 0.25x | the hand | 117 | 17.81 [16.27, 19.45] | 7 of 117 (5.98 %) | 1.05 % [0.66, 1.47] | row 562 |
| MM | 0.40x | the hand | 115 | 15.67 [14.14, 17.37] | 2 of 115 (1.74 %) | 0.99 % [0.52, 1.53] | row 562 |
| M | 0.40x | 0.1x | 115 | 5.64 [5.11, 6.17] | 0 of 115 (0.00 %) | 6.52 % [4.68, 8.47] | row 562 |
| MM − M | 0.40x | — | 115 pairs | Δ +10.02 [+8.28, +11.89] | — | Δ −5.53 points [−7.58, −3.66] | row 562 |

## D.2 Plain-form readings beside the CMC rungs

Beside the CMC words of Table 6.2, the plain form read 319.883† [259.95, 390.095] with bound 221.216 at
0.08x (row 526); 260.35† [214.425, 309.387] with bound 188.377 at 0.09x, which alone would not have
certified (row 539); and 288.126† [257.315, 319.466] with bound 241.001 at 0.10x (row 543). The
project lead declared the hard target achieved on the 0.10x certificate (row 545) and re-opened it two
days later as not met in-envelope (internal decision log, line 624).

## D.3 Readings that did not certify, and refusals

Every number in this table is †.

| Noise | Composition | Games | E[L] [95 % interval] | P(L ≥ 45) | Word as filed | Key |
|---|---|---|---|---|---|---|
| 0 | the S7 arm, noise removed | 22 | 202.14 [150.0, 255.5], censored mean at cap 400 | not on the row | PASS; LEVEL BAND ABOVE-100 (unregistered, exploratory) | row 287 |
| 0.005x | a partial coverage stack | 40 | 166.35 [130.6, 203.0], censored mean at cap 400 | 33 of 40 | NOT CERTIFIED (first attempt) | row 308 |
| 0.02x | v2 + BREAK-SWEEP | none | design refused: pass probability 0.33, rule 0.5 | none | REFUSED before any game | row 380 |
| 0.03x | v2 | 40 | 186.0 [132.1, 261.9] | 31 of 40 | NEAR-UNDER (one cell, not a certificate) ‡ | row 352 |
| 0.03x | v3 | 80 | 230.713 [190.85, 272.8]; bound 168.779, under 200 | 74 of 80 | NOT CERTIFIED | row 424 |
| 0.03x | v2 + F3-PRUNED | 46 | 255.457 (interval sealed at stage 1) | 42 of 46 | stage 2 not run: confirmation power 0.21 | row 438 |
| 0.05x | v2 | 40 | 144.08 [109.5, 182.05] | 33 of 40 | BELOW (screen) | row 347 |

‡ Filed as exploratory (appendix E).
