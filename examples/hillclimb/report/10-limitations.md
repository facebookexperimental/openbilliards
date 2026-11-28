# 10. Limitations

Keys and markers are as in section 0.

## 10.1 The target is not met in-envelope

The hard target is open: it was reopened as not met in-envelope (internal decision log, line 624), and
the presented result, R1 + ML at 193.00 [v3] against R1's 138.50 [v3], is labelled
nominal-leave, was not adopted and sits under the 222.2 bar (internal research log, row 598). Envelope
v3 caps the cue ball's launch speed at the break-speed FAQ's 30 mph at a break only; every other stroke
keeps the v2 caps, under which the cue ball can leave faster (sections 2.5, 7.4). Under the v2 caps,
on other games, R1 + ML read 178.36 [v2] (row 585). The two baselines, 150.01 [v2] and 128.73
[v1], come from 12-game falsifier looks: they bound the agent from above and are not certified
estimates, and P(L ≥ 45) was not read at their stops (rows 563, 571). The certified 263.8† at 0.10x
(row 543) and every other † number stand beside these, never in their place.

## 10.2 One build per number

Every number from 23 July 2026 on comes from one kernel build, 0.1.0+64e9e7a3 of 22 July 2026. The
14.1 runs selected its cluster and rail models explicitly (internal research code, kernel pin module);
from 3 August every measuring entry asserted that build and refused on drift (rows 78, 463; decision
log, line 483), and the late reads that print no version (rows 543, 563, 571, 585, 598) are UNVERIFIED as a
per-run stamp. The
earlier 9-ball numbers came from older builds. The public kernel has moved on since that
build, with unmeasured effect on these
numbers. The release also ships fresh public constants, so public games are not the
recorded games, and no number is expected to reproduce bit for bit.

## 10.3 The interpreter

The records ran on CPython 3.12: 3.12.15 (row 563), then 3.12.16 from 29 October (row 585). Identity
checks compared only the builds the records ran on; after each of the two binary swaps, 85 of 85
recorded units re-ran bit for bit (row 566; decision log, line 790). Identity on any other CPython
3.12 build is not verified. Decisions depend
on floating-point details: a recount under an older interpreter had to emulate Python 3.12's
compensated float sum to match bit for bit (row 524), and near-tied candidates can swap under a
different evaluation order.

## 10.4 Kernel changes are not bit-exact

Any change to the kernel's numerics, such as its polynomial root solver, can return slightly different
approximations of the same event times; long multi-ball shots and breaks amplify such differences. No
recorded game is expected to replay across such a change, and no E[L] carries over by identity.
Breaks are the most exposed part of play: for the certified agent they were 7.0 %† of strokes but
54.4 %† of the summed miss hazard (row 546). The learned files take geometric inputs and evaluate
unchanged, but were fitted on outcomes of the build of record; a kernel change would call for
re-measuring them.

## 10.5 One table, one ball set, one game

Every 14.1 result uses one table geometry (one playing-surface size and one set of pocket positions),
one ball set and cloth model, and a subset of the 14.1 rules. The leave surface was drawn for that
table; the public version takes table geometry as a parameter. Other games, tables and equipment are
unmeasured for these agents.

## 10.6 How far 0.1x is from human execution, and the open human level

The noise level 0.1x is a machine-precision setting kept as the unit of record, and no tier is named
human (decision log, line 551). An early audit suggested that top players' errors are several times
larger, and the external review relabelled that suggestion a hypothesis range, a direction rather than
a calibration (rows 83, 86); its inputs are data we cannot redistribute. The unit's noise law is
independent and Gaussian per stroke, and the agent plans with the same law that executes its strokes,
which no player can. The hand ladder's results are printed only at its public tiers, 0.25x and 0.40x
(appendix D.1): its three upper tiers were fitted on data we cannot redistribute and are neither named
nor printed. The research hand's speed term, which acts at every tier, is a private research fit, and
it does not ship. Attempts to anchor
a human level on outside data either fell short of the needed quality or rested on data we cannot
redistribute (rows 503, 554). Nothing in this report is a claim about human play.

## 10.7 Other limits

- **Screens** on recorded positions or short blocks over-predict whole-game effects (section 9,
  lesson 2).
- **The leave surface's** value in balls has not been re-measured since row 89; the census of section
  5.2 shows it still sets most played strokes, but not what that is worth.
- **Compute** is heavy: about 22 to 24 CPU-seconds per decision for the compliant agent under v1 and v2
  (rows 563, 571, 585), and about 51† for coverage stack v4 (row 450).
- **The records stay private** (appendix F); the numbers are checked against them by an independent
  recount before release, but readers cannot inspect them.
