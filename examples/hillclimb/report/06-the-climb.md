# 6. The climb, step by step

This section follows the agent from the first 9-ball experiments in July 2026 to the 0.10x certificate
of 24 October 2026; section 7 explains why that certificate is not the presented result. Table 6.1, at
the end of the section, has one row per adopted step and per major kill, and Table 6.2 is the noise
ladder. The same rows, reduced to a fixed list of fields, are in `climb-table.csv` beside this report.

**Reading notes.**

- Keys are rows of the internal research log: "(internal research log, row N)" at first use, then
  "(row N)".
- σ is the execution-noise level, a multiple of the icga-v1 error vector (section 2.3); 0.1x is the
  unit of record and 0x is noise-free play. The 9-ball phases used the same convention at their own
  noise points.
- A paired Δ is the difference between two arms that played the same racks with the same noise draws
  (common random numbers, CRN), with the 95 % interval of that block's registered estimator. Deltas
  from different blocks are never added, and results of different compositions are never pooled. An
  "E[L] of record" is the treatment arm's level on the block that adopted the step; blocks differ in
  difficulty, so these levels are not a paired series.
- Every number in this section carries † (section 0): the 14.1 numbers were measured before the
  envelope was enforced (section 7); the 9-ball numbers were measured either before the envelope
  existed (before row 39) or with its speed cap asserted in the 9-ball code and cue clearance handled by
  validate-then-reseed (row 26), but the census of rows 546, 556 and 559 read only 14.1 games.

## 6.1 Learning first, then search (9-ball, 10 July to 3 August)

The work began with 9-ball and with learning, and learning without search failed first. A simulation
planner passed the first gate against a cross-entropy-method actor (internal research log,
row 1), while three registered networks that emitted actions directly collapsed, their pot ratio
against the planner falling from 0.6567† to 0.1552† (registration order not on record; rows 3-5).
With a candidate-ranking actor,
widening the verification of a frozen network beat retraining it at equal budget, at 3 of 3 noise
points against 0 of 3 (row 17). Expert iteration checked the teacher at play before training on it
(row 24) and promoted one ranker, p2rank-v6, the only training-driven promotion of the whole effort (row 25);
the next generation did not improve (rows 27, 29, 30).

Phase 4 asked where the headroom was. It treated execution noise as part of the model, a regulariser
against degenerate play rather than a cap on the ceiling (row 31); its calibration of the noise model
against human play is not reported as numbers, because those fits drew on data we cannot redistribute
(rows 32-36). A ceiling map found extra search headroom only at 0.25x (row 37). An unconstrained break
search then chose a 13.0 m/s break, above the game's 12 m/s power cap on v0 (row 38), which prompted the
actuation envelope of 27 July (row 39; section 2.5). The compliant break that replaced it (12.0
m/s, cue ball off centre on the head string, half a tip of draw, level cue) was adopted; with only the
break changed, noise-free break-and-run on the same 300 racks rose from 0.040† to 0.507† (rows 40-43).
Learning stayed flat: a specialist trained on about 71 thousand expert decisions, three students of up
to 1.09 million parameters and a frontier batch of four levers all failed to beat p2rank-v6 (rows
47-48, 50-51, 57, 64-68), while the same network with its simulation step beat itself without it by
+0.8947† (row 63).

The rebuild of 2 August split the agent into an executor that prices candidate strokes by simulation
and a strategist that picks among priced options, with the leave declared as a value surface over the
cloth (row 69). A refinement executor won its existence test (EO1) and its equal-compute control (EO2),
the first two executor exams (rows 71, 76). A ladder of language-model strategists found no edge at any
rung, and a closed-form painter with no prior did at least as well (rows 72, 74, 77-79).

## 6.2 The 14.1 instrument (3-4 August)

At about 80 racks, 9-ball clean rates could not resolve the edges being tested (rows 79, 89, 93). The
work therefore moved to the 14.1 run length, a long-tailed outcome that grows with every competence the
agent adds (rows 81-84). An external review downgraded four headlines (row 86), and the leave surface's
term was found to have been read in the wrong coordinate frame (row 87). The pocket-aware instrument
became the rows of record, arm A at E[L] 4.26† over 100 attempts at 0.1x, and the frame-true re-measure
showed the leave surface load-bearing in 14.1 (7.08†, +2.82†) and null in 9-ball (rows 85, 88-89). The
leave surface has stayed in every later agent; row 89 is its last direct measurement (section 5.2).

## 6.3 Reading points and the price of process (August to 2 September)

August taught two things. The first was about process: six of the executor's adoption exams (EO3 to
EO11) passed their statistical look, yet each of those records was annulled (EO3, EO4, EO6) or closed
EXAM-INVALID (EO7, EO8, EO11) under its own record rules, three more exams never started, and nothing
was adopted (rows 96-123); a periodic audit then
found the effort refining its instruments rather than its agent (row 129). The second was about levers.
At 0.1x the refinement executor that had won in 9-ball did nothing in 14.1 over 400 pairs (row 124), and
a position-first strategist and a rack-vocabulary planner both cost balls (rows 113, 125). The first
strategist-side lever that moved the ladder was a deep-evaluation re-ranker, which re-scores the top
three options on 32 shared CRN rollouts each: +5.925† over 40 pairs (row 127). A make-first version at a
quarter of its compute replicated it (row 146), a depth twin at matched strokes read unresolved (row
156), and the make-first re-ranker became S1, the first substrate (row 178).

## 6.4 Fast track: S2 to S6-PRIME (3-9 September)

On 4 September the work switched to fast-track screens: one change at matched compute, a one-page
pre-registration before the first stroke, one read at 40 CRN pairs. In about 14 hours two mechanisms
were falsified, rolling out through the re-rack and window breadth at matched compute, and one lever
replicated on fresh seeds: scoring each candidate by its make chance plus the number of live direct pots
it leaves (row 175). From then on each substrate S(n+1) was the treatment arm of a registered block (for
S6-PRIME, a screen) whose control arm was S(n):

- **S2** added that liveness term at every decision with two or more live options: 12.15† → 13.61†,
  Δ +1.4625† at matched compute (rows 177-178).
- **S3** filled empty window slots with one-cushion banks and kicks when two or fewer pots were live:
  13.15† → 15.275†, Δ +2.125†, stopped at its first look of 40 pairs (rows 181-182).
- **S4** added a two-stage sampled break search: 14.475† → 19.89†, Δ +5.4125† at 1.52 times the strokes
  (rows 185-186). A gain bought with compute could be adopted only under the declared-compute rule: its
  lower bound had to beat a compute-elasticity bound (+1.20 balls here), and a cheaper reversal control
  had to confirm it, which it did (an unregistered fast-track screen; rows 185-187).
- **S5** (on S4.1, S4 with a crash fix) added a forced-shot search when the menu was empty: 16.5† →
  31.6†, Δ +15.1† at 2.085 times the strokes, clearing its compute bound by 0.03 balls (rows 203, 205);
  its reversal control on a cheaper line held (an unregistered fast-track screen), and the substrate
  was re-pinned on that line (rows 208, 215).
- **S6** deepened the forced-shot search when the first 32 strokes found nothing: 22.69† → 26.31†,
  Δ +3.625† at 1.198 times the strokes (rows 210-212). Its matched-compute control (an unregistered
  fast-track screen) moved nothing while the full arm replicated: the gain lived in the extra strokes,
  and by its pre-declared rule S6 was reversed (row 215).
- **S6-PRIME** kept the deepening and paid for it from the break search, at a compute ratio of 1.016:
  Δ +7.5875† over S5, E[L] of record 30.275† (row 217; adopted from an unregistered fast-track
  screen, the registered default not met, as the record discloses); its owed control held (an
  unregistered fast-track screen; row 222). 30.275† is the first link of the record chain; 28.3† is the
  pooled headline over S6-PRIME's three blocks (an unregistered fast-track screen; row 226).

Along the way a learned leave-quality head read unresolved, and that line closed after five readings
(rows 200, 204).

## 6.5 Coverage stacks: 30.3 to 142.5 (12 September to 6 October)

The next arm brought the first learned part into play: C2, a learned pre-filter whose chosen stroke is
always simulated, ordering the trigger search's pool (section 5.6). With C2 and BREAK-F, the
fold-selected break, S6-PRIME gained +12.519† over 160 pairs, but the confirmation block missed its
anchored level clause by 0.70 balls and the pair was not adopted (rows 252, 255).

Removing the noise showed where the balls were: the same arm ran 202.1† [150.0, 255.5] at σ = 0 against
42.1† at 0.1x on the same 22 seeds (exploratory; row 287). Execution noise was the first-order wall, and
the next
levers were built from the death classes seen at the quiet rungs: a break search that also runs with
the cue ball in hand, give-up coverage by the break search, make-rank (among tied passers, strokes that
clear the make floor of 16 pots in 32 draws, play the one with the lowest failure bound) and
activate-at-one (a lone option is priced on 32 draws and, when it fails the make floor, the planner's own
search runs) (rows 185-186, 297-319). Four coverage stacks were then adopted at 0.1x, each on its own
fresh block:

- the **coverage stack**, S6-PRIME with C2, BREAK-F and the four coverage levers: E[L] of record 50.4†,
  Δ +20.79† over 80 pairs (rows 317-318);
- **v2**, adding a menu extension, an in-rack search trigger and a break-decision fault fix: 82.71†,
  Δ +22.05† [+2.275, +43.61] over 80 pairs, the lower bound clearing the adoption margin of 2.0 by only
  0.275, a hinge disclosed with the read (rows 344-345);
- **v3**, v2 plus F1 UNION-32, a make-argmax over the union of candidate sets on the decision's own CRN
  block: 98.53†, Δ +21.53† over 300 pairs (rows 408-409);
- **v4**, v2 plus F3-PRUNED (section 5.3): 142.52†, Δ +39.70† over 300 pairs, the first mechanism the
  stack ever held, at 2.14 times the CPU per decision; its 40-pair screen had realised 1.0065 of the
  predicted one-step gain, the block only 0.5754 (rows 450-451).

Written as levels of record, the chain is 30.3† (an unregistered fast-track screen) → 50.4† → 82.7† →
98.5† → 142.5† (rows 217, 318, 345, 409, 451). Each link was priced on its own block; the links are not
additive, and the levels come from blocks of different difficulty.

## 6.6 The noise ladder: 0.005x to 0.10x (20 September to 24 October)

The headline of this period was σ\*200, the largest σ at which an arm holds E[L] ≥ 200 with
P(L ≥ 45) ≥ 0.80 and plausible play, certified on fresh games by the group-sequential design of
section 3.6, decided at its second look (rows 337, 388). From 0.08x the certificates used the CMC
form with a 10 % margin, which sets the bars
at 2,000/9 ≈ 222.2 and 0.8^0.9 ≈ 0.818 (row 543), after the CMC estimator had read AGREE against the
plain form on 640 closed games (row 510).

The arm grew as levers arrived (section 5): BREAK-GATE (BG) halved break deaths per re-rack at 0.1x
(row 466); NGO-F3P ran F3-PRUNED's search at the give-up and one-option states it used to skip, and its
leave falsifier held (exploratory; rows 479, 486); the exact exit saved compute and left decisions
unchanged by receipt (row 511; internal decision log, line 251); and VS-2's V-scored 2-ply at the 14th
ball came last (section 6.7). **B + NGO**, the arm of the top three rungs, is v4 + BG + NGO-F3P + the
exact exit + VS-2 (row 526). The 0.10x certificate closed the ladder on 24 October at a cost of 432
CPU-hours (row 543).

**Table 6.2. The certified noise ladder (each rung its own arm's certificate; never pooled).** E[L] is
the plain constant-hazard form unless marked CMC; the bound is the lower bound at the deciding second
look; P(L ≥ 45) gives the count reaching 45 with its Wilson lower end, or the CMC form with its
interval. Every number is †.

| σ | Arm | Games | E[L] [95 % interval] | Bound (bar) | P(L ≥ 45) | Key |
|---|---|---|---|---|---|---|
| 0.005x | coverage stack | 74 | 407.1 [324.5, 503.9] | 270.9 (200) | 68 of 74; 0.834 | row 337 |
| 0.01x | v2 | 80 | 380.3 [300.8, 474.7] | 248.5 (200) | 72 of 80; 0.815 | row 370 ‡ |
| 0.02x | v2 + BREAK-SWEEP | 80 | 325.675 [260.141, 401.452] | 219.238 (200) | 73 of 80; 0.830 | row 388 ‡ |
| 0.03x | v4 + BG | 80 | 455.211 [381.333, 540.151] | 335.304 (200) | 76 of 80; 0.878 | row 477 |
| 0.05x | v4 + BG | 80 | 356.987 [285.675, 438.736] | 240.634 (200) | 75 of 80; 0.862 | row 484 |
| 0.07x | v4 + BG + NGO-F3P + exit | 80 + 220 tail | 303.613 [253.975, 356.012] | 226.517 (200) | 263 of 300; 0.835 | row 511 |
| 0.08x | B + NGO | 80 + 220 tail | CMC 316.035 [291.536, 342.001] | 277.829 (222.2) | CMC 0.876 [0.860, 0.890] | row 526 |
| 0.09x | B + NGO | 80 + 220 tail | CMC 289.781 [267.557, 313.954] | 254.835 (222.2) | CMC 0.873 [0.859, 0.887] | row 539 |
| 0.10x | B + NGO | 240 + 220 tail | CMC 263.802 [251.362, 276.296] | 245.043 (222.2) | CMC 0.859 [0.846, 0.872] | row 543 |

‡ Registered before any game, but filed in the record as exploratory route information (appendix E).

BREAK-SWEEP adds a 189-point lattice of break strokes; the 0.02x arm, filed under the label v3 before
that substrate existed, is not the v3 of section 6.5 (rows 388, 409). At 0.09x the
plain form alone would not have certified (bound 188.4† under 200); the registered form was CMC, so the
word stands (row 539). Appendix D lists the plain-form readings beside the CMC rungs and the readings
that did not certify.

## 6.7 The learning route: VS-1 and VS-2 (12 to 21 October)

On 12 October the project lead moved compute to the learning route (row 485). Its first candidate failed its
registration gate, and the fallback, a learned pruner of F3-PRUNED's grid, could not reach identity
with the exact pick (rows 488, 497). The second object worked: V, a learned leaf value used in the 2-ply,
fitted on leaves logged from the agent's own earlier games and sealed before any label of its test
(section 5.6). VS-1, the licence read for V, licensed it on 120 fresh states, where it kept about 0.70†
of the exact 2-ply's gain with 1 harm in 120 (row 500), and a falsifier showed the gain surviving to the
next 14th-ball decision (exploratory; row 498). VS-2, the whole-game cell, then played the V-scored
2-ply against the same agent without it at 0.1x: 182.79† → 241.26†, Δ +58.47† over 321 pairs,
P(L ≥ 45) 0.791† → 0.875†, mechanism held (row 524). The word was ADOPT, but no record moved. A
co-primary under a human-shaped hand law read not-regressed (row 531); its number is withheld, because
that hand law draws on data we cannot redistribute. Most later learned leaves, in the rack and at its
boundary, failed (rows 525, 532, 551, 564; section 8.3).

## 6.8 The declaration

On 24 October the project lead declared the hard target achieved on the strength of the 0.10x
certificate (row 545). Within two days a census showed that the certified agent had not obeyed the
envelope; section 7 tells that part.

**Table 6.1. The climb, rows 31-543: one row per adopted step and per major kill.** Kinds: ADOPT
(adopted into the agent or substrate of record), step (a measured gain or licence that fed the next
arm), KILL (a falsified, flat or reversed line), plus findings, laws, instruments and method checks
that set the direction. In 9-ball, Δ is the win margin (wins − losses) / pairs, derived from the
logged win-loss-tie counts where a row prints only the win rate; in 14.1 it is paired E[L] in balls
unless a unit is named. Every number is † (reading notes).

| Key | Date | Kind | Composition or change | σ | Paired Δ [95 % interval] | Level or word | n | Env. |
|---|---|---|---|---|---|---|---|---|
| row 37 | 2026-07-27 | finding | 9-ball expert teacher against p2rank-v6 (ceiling map) | 0.25x | +0.233 [+0.108, +0.352] | headroom at 0.25x only | 240 pairs | † |
| row 38 | 2026-07-27 | finding | unconstrained break search; winner at 13.0 m/s | 0x | break objective +0.686 [+0.641, +0.731] | outside the envelope; authorizes nothing | 500 a cell | † |
| row 39 | 2026-07-27 | law | actuation envelope v1; earlier numbers marked | — | — | registered | — | — |
| rows 40-41 | 2026-07-27 | ADOPT | compliant break, 12.0 m/s | 0x | break objective +0.704 [+0.661, +0.747] | break policy v1 | 500 a cell | † |
| row 43 | 2026-07-27 | step | the same racks with only the break changed | 0x | break-and-run +0.4667 [+0.4065, +0.5269] | 0.040 → 0.507 | 300 racks | † |
| rows 47-48, 50 | 2026-07-31 | KILL | 0.25x specialist on about 71 thousand expert decisions (step 2) | 0.25x | −0.0475 [−0.1445, +0.0504] | FAIL; step 2 closed | 400 pairs | † |
| rows 51, 54-57 | 2026-07-31 to 08-01 | KILL | three students of 0.30M, 1.0M and 1.09M parameters (rung 1) | 0.25x | 1.09M +0.005 [−0.093, +0.102]; 1.0M −0.035 [−0.132, +0.063]; 0.30M −0.0675 [−0.164, +0.030] | all flat (NEITHER) | 400 pairs each | † |
| row 63 | 2026-08-01 | finding | the same network with and without its simulation step | 0.25x | +0.8947 [+0.7126, +0.9639] | search carries the strength | 57 pairs | † |
| rows 64-68 | 2026-08-02 | KILL | frontier batch of learning and scoring levers | 0.25x | retrain −0.0275 [−0.1247, +0.0703] | no primary look accepted | 400 pairs | † |
| row 71 | 2026-08-02 | step | refinement executor EO1 | 1.0x | +0.3841 [+0.2214, +0.5260] | accepted | 138 pairs | † |
| rows 72, 74 | 2026-08-02 | KILL | language-model strategist decision screens | 1.0x | decision value +0.209 [−0.135, +0.552]; retest −0.0935 [−0.330, +0.143] | no edge | 106; 100 decisions | † |
| row 76 | 2026-08-02 | step | EO2, the equal-compute control | 1.0x | +0.3253 [+0.1755, +0.4603]; draws × 4 alone +0.0775 [−0.0205, +0.1740] | refinement is the mechanism | 166 pairs | † |
| rows 77-79 | 2026-08-02 to 08-03 | KILL | rack-level language-model strategist; closed-form painter beside | 1.0x | — (unpaired rates) | 6/80 and 4/80 against 0.143; painter 12/80 | 80 racks each | † |
| rows 85, 88 | 2026-08-03 | instrument | 14.1 run-length instrument, pocket-aware rows of record | 0.1x | — | arm A E[L] 4.26 | 100 attempts | † |
| row 89; internal registration of the frame-true re-measure | 2026-08-04 | step | leave surface read in the true coordinate frame | 0.1x | +2.82 [1.95, 3.69], unpaired, against the closed runs with the misread surface | 4.26 → 7.08; load-bearing | 100 attempts | † |
| rows 96-123 | 2026-08-05 to 08-09 | KILL (process) | executor adoption exams EO3 to EO11 | 1.0x | six looks from +0.1639 to +0.2835, every lower end above 0 | three records annulled, three closed EXAM-INVALID; nothing adopted | 194-360 pairs | † |
| row 113 | 2026-08-07 | KILL | rack-vocabulary planner | 0x | −2.26 [−3.53, −1.03] | VOCAB-NULL | 100 pairs | † |
| row 124 | 2026-08-10 | KILL | refinement executor in 14.1 | 0.1x | +0.04 [−0.4825, +0.555] | unresolved | 400 pairs | † |
| row 125 | 2026-08-12 | KILL | position-first strategist | 0.1x | −4.825 [−6.65, −2.90] | negative | 40 pairs | † |
| row 127 | 2026-08-19 | step | deep-evaluation re-ranker, top 3 options × 32 CRN rollouts | 0.1x | +5.925 [+4.60, +7.275] | 6.675 → 12.6 | 40 pairs | † |
| row 146 | 2026-08-30 | step (later S1) | make-first re-ranker at a quarter of the compute | 0.1x | +5.575 [+3.875, +7.15] | 5.925 → 11.5 | 40 pairs | † |
| row 156 | 2026-09-02 | KILL | depth twin at matched strokes | 0.1x | +0.225 [−1.075, +1.65] | unresolved | 40 pairs | † |
| row 175 | 2026-09-04 | screens ‡ | rollout through the re-rack; breadth at matched compute; liveness term | 0.1x | −0.35 [−1.06, +0.36]; −1.85 [−3.44, −0.26]; pooled +1.46 [+0.84, +2.09] | two falsified, one replicated | 40-80 pairs | † |
| rows 177-178 | 2026-09-04 | ADOPT (S2) | S1 + post-stroke menu liveness | 0.1x | +1.4625 [+0.400, +2.525] | 12.15 → 13.61 | 80 pairs | † |
| rows 181-182 | 2026-09-04 to 09-05 | ADOPT (S3) | S2 + one-cushion bank and kick fill | 0.1x | +2.125 [+0.270, +3.980] | 13.15 → 15.275 | 40 pairs | † |
| rows 185-187 | 2026-09-05 | ADOPT (S4) | S3 + sampled break search, 1.52 × strokes | 0.1x | +5.4125 [+2.829, +7.996]; reversal control +1.2625 [+0.27, +2.26] ‡ | 14.475 → 19.89 | 80 pairs | † |
| rows 200, 204 | 2026-09-07 | KILL | learned leave-quality head | 0.1x | +1.325 [−1.744, +4.394] | unresolved; line closed | 80 pairs | † |
| rows 203, 205, 208 | 2026-09-07 to 09-08 | ADOPT (S5) | S4.1 + forced-shot search at empty menus, 2.085 × strokes | 0.1x | +15.1 [+2.118, +28.082]; cheaper-line control +2.8625 [+1.359, +4.366] ‡ | 16.5 → 31.6 | 40; 80 pairs | † |
| rows 210-212 | 2026-09-08 | ADOPT (S6) | S5 + staged deepening, 1.198 × strokes | 0.1x | +3.625 [+1.527, +5.723] | 22.69 → 26.31 | 80 pairs | † |
| row 215 | 2026-09-08 | KILL (reversal) ‡ | S6's matched-compute control | 0.1x | −0.1125 [−0.335, +0.110]; full S6 beside +4.775 [+1.829, +7.721] | S6 reversed | 80 pairs | † |
| rows 217, 222, 226 | 2026-09-08 to 09-09 | ADOPT (S6-PRIME) ‡ | S5 + deepening paid by a smaller break search, 1.016 × strokes | 0.1x | +7.5875 [+2.770, +12.405]; owed control +3.5375 [+1.681, +5.394] ‡ | E[L] of record 30.275; pooled 28.3 ‡ | 80 pairs | † |
| rows 252, 255 | 2026-09-12 | not adopted | S6-PRIME + C2 + BREAK-F (S7) | 0.1x | +12.519 [+7.552, +17.486]; confirmation +7.25 [+2.129, +12.371] | level clause missed by 0.70 | 160; 80 pairs | † |
| rows 317-318 | 2026-09-18 | ADOPT | coverage stack | 0.1x | +20.79 [+10.11, +32.21] | 29.6 → 50.4 [41.6, 60.6]; P(L ≥ 45) 0.175 → 0.45 | 80 pairs | † |
| rows 344-345 | 2026-09-20 | ADOPT | coverage stack v2 | 0.1x | +22.05 [+2.275, +43.61] | 60.66 → 82.71 [65.54, 102.51] | 80 pairs | † |
| rows 408-409 | 2026-09-26 | ADOPT | v3 = v2 + F1 UNION-32 | 0.1x | +21.53 [+10.73, +32.75] | 77.00 → 98.53 [88.39, 109.11]; mechanism NOT-HELD | 300 pairs | † |
| rows 450-451 | 2026-10-06 | ADOPT | v4 = v2 + F3-PRUNED | 0.1x | +39.70 [+22.79, +57.75] | 102.82 → 142.52 [127.68, 158.79]; mechanism HELD | 300 pairs | † |
| row 466 | 2026-10-08 | step | v4 + BREAK-GATE (BG) | 0.1x | break deaths per re-rack −0.0348 [−0.0572, −0.0134] | 0.0714 → 0.0367 | 50 pairs | † |
| rows 479, 486 | 2026-10-10 to 10-12 | step | NGO-F3P: F3-PRUNED's search at give-up and one-option states | 0.03x | hazard cut 0.327 [0.203, 0.467] ‡ | leave falsifier held ‡ | 167 states | † |
| decision log, line 251; row 511 | 2026-10-12 to 10-16 | step | exact exit from F3-PRUNED | 0.1x | CPU-s per decision 59.33 → 21.78 on replays | decisions identical by receipt | replays of a closed block | † |
| rows 488, 497 | 2026-10-12 to 10-14 | KILL | learning route: first object; learned grid pruner | 0.1x | — | gate failed; identity 156/333 against 0.99 | 333 fallbacks | † |
| rows 498 ‡, 500 | 2026-10-14 | step (licence) | VS-1: learned leaf value V in the 14th-ball 2-ply | 0.1x | gain per break 0.0134 [0.0042, 0.0214] | licensed; about 0.70 of the exact gain | 120 states | † |
| row 510 | 2026-10-16 | method | CMC estimator against the plain form | 0.03x-0.10x | mean difference 0.0095 [−0.0152, 0.0334] | AGREE | 640 games | † |
| row 524 | 2026-10-20 | ADOPT word | VS-2: v4 + BG + exit + V-scored 2-ply | 0.1x | +58.47 [+32.69, +84.77] | 182.79 → 241.26; no record moved | 321 pairs | † |
| row 531 | 2026-10-21 | step | VS-2 co-primary at a human-shaped hand | — | withheld (data we cannot redistribute) | not regressed | 210 pairs | † |
| rows 337-543 | 2026-09-20 to 10-24 | certificates | the noise ladder, Table 6.2 | 0.005x-0.10x | — (levels) | σ\*200 ≥ 0.10x on B + NGO | Table 6.2 | † |

‡ From an unregistered fast-track screen or filed as exploratory, marked beside its word, reading or key
(appendix E).
