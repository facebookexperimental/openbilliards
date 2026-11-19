# 8. What worked and what did not

This section gathers the levers that worked (Table 8.1), the objects that were falsified, closed,
reversed or killed, in their records' own words (Table 8.2), and every attempt to learn a part of the
agent (Table 8.3), each with short notes on the patterns; section 9 draws the lessons.
Keys are rows of the internal research log; markers are as in section 0. A delta is B − A on that
link's own block of paired games, with its 95 % interval and the number of pairs; deltas are never
summed and compositions never pooled. C2 is a learned pre-filter whose chosen stroke is always
simulated; V is a learned leaf value used in the 2-ply.

## 8.1 Levers that worked

Every adopted 14.1 step before the envelope finding, from the re-ranker (row 127) to VS-2 (row 524), is
in Table 6.1, as are the compliant 9-ball break (rows 40-43), the refinement executor (rows 71, 76) and
the leave surface (row 89). Table 8.1 adds the in-envelope levers and the early 9-ball levers.

**Table 8.1. Levers that worked, outside Table 6.1.**

| Lever | A → B | σ | Delta [95 % interval] (n) | Env. | Word and status | Key |
|---|---|---|---|---|---|---|
| Give-up fix ML: where R1 gives up, search wider; play the best make chance × next-shot make | R1 → R1 + ML, whole games | 0.1x | E[L]_CMC +29.77 [+13.07, +50.92] (60); 148.59 → 178.36 | v2 | IN-ENVELOPE-GAIN, labelled nominal-leave; not adopted | row 585 |
| Law at the hole: at a forced give-up, first search drill-legal targets | drill agent → + hole search, 4 held-out drill cells | 0x and 0.1x | clears 151 → 261 of 398; discordant 124 against 14 (exact McNemar p ≈ 1.7 × 10⁻²³); no harm on 200 control pairs | v2 | ADOPT; adopted for drills only (internal decision log, line 830) | row 578 |
| Planning at the hand: plan with the executing noise (MM), not at 0.1x (M) | M → MM, both executed at the hand | hand ladder | longer runs and fewer fancy shots; at the public 0.40x tier E[L]_CMC +10.02 [+8.28, +11.89] and fancy share −5.53 points [−7.58, −3.66] (115); the primary tier's numbers stay withheld, as it is one of the upper tiers, fitted on data we cannot redistribute | v1 | IMPROVED + REGULATED; prices what planning for the hand buys this agent, not human play | row 562 |
| Verification breadth: a frozen ranker verifies more candidates (24 → 12 → 6) instead of retraining | retrained ranker; frozen ranker + breadth | four points, 0.5x to 1.0x (9-ball) | rack-win margin for breadth +0.346, +0.226, +0.292, +0.200 (500 racks a point); retraining flat at all four (1,000 racks a point) | † | breadth DOMINATES ‡ | row 17; Phase 2 narrative of 2026-07-18 |
| Expert iteration, generation 1: depth-2 expert, soft targets, Gumbel exploration | p2rank-v3a → p2rank-v6 (9-ball) | 0.5x to 1.0x (9-ball) | SPRT accepted at all four points; at 0.5x win rate 0.616, delta [+0.093, +0.325] (269); fouls about halved | † | PASS; p2rank-v6 PROMOTES, the one training-driven promotion | row 25; Phase 3 narrative of 2026-07-22 |
| Validate-then-reseed: replace a candidate that fails cue clearance by a legal one instead of masking it | masking → reseed | 9-ball | masking would starve 52.3 % of decisions; reseeding engaged at 99.2 %, none masked | † | adopted by measurement; part of R1 today | row 26; Phase 3 narrative of 2026-07-22 |

‡ DOMINATES is not a word of its registration (appendix E).

**Notes on Table 8.1.**

1. *The 14.1 climb was built from search and coverage, not from trained policies.* Of the fifteen 14.1
   levers that worked before the envelope (Table 6.1, from the leave surface to VS-2), thirteen add no
   learned part; the other two add today's only learned files, both inside simulation-based selection:
   C2 decides which strokes get simulated, V scores the leaves of a simulated 2-ply (rows 252, 524).
2. *The large steps each removed a way games actually ended*: the forced-shot search answered give-ups
   (row 205); F3-PRUNED cut the in-rack death hazard to 0.384† of v3's (row 450); V's 2-ply works at the
   rack boundary, where break shots were 7.0 %† of strokes but 54.4 %† of the summed miss hazard (rows
   524, 546).
3. *Compute was not held equal in the stack adoptions*: the coverage stack, v2 and v3 cost 1.92, 1.37 and
   3.47 times their bases' CPU per game (rows 318, 345, 408) and v4 2.14 times per decision (row 450).
   The fast-track links were compute-matched or carried a declared price and a matched control (rows
   187, 208, 215, 222).
4. *In-envelope, the gains are smaller and narrower*: only R1 + ML moved whole-game E[L]_CMC under v2,
   with the nominal-leave label (rows 577, 585); the hole search is adopted for drills only (row 578).

## 8.2 What did not work

Kills already in Tables 6.1 and 7.1 (rows 113, 124, 125, 156, 175, 215 and 559-580) are not repeated.

**Table 8.2. Falsified, closed, reversed and killed objects, in the records' own words.**

| Object | Decision word | Number | σ | Env. | Key |
|---|---|---|---|---|---|
| Proxy targets in 9-ball: judged return (+1 pot, −1 foul); balls potted | killed at the basis change; gate FAIL (grind artifact) ‡ | judged return correlates +0.028 with winning; wrong-noise arms potted +0.196 and +0.271 more balls in longer racks, with zero run-outs | 0.5x to 1.0x (9-ball) | † | rows 11, 12, 14; Phase 2 narrative of 2026-07-16 |
| A deeper, wider teacher (depth 3, 2.8 × teacher compute) | strength check FAIL; the kill row executes | accepted at one of three noise points; at 0.5x delta [−0.0013, +0.0997] at the 1,500-pair cap | 0.5x to 0.6x (9-ball) | † | rows 29, 30; Phase 3 narrative of 2026-07-24 |
| Break power beyond the cap (13.0 m/s) | ASTERISKED, authorizes nothing | the extra 1 m/s moved the break objective by −0.018 at both conditions; its edge was a noise-free artifact | 0x (9-ball) | † | rows 38, 40 |
| Zero-training scorer variants: pooled-sample scorer; adaptive allocation; annealed verification | KILL; NEGATIVE; accept_H0 | rank quality −6.45 points [−8.94, −3.96]; correct selection −5.65 points [−8.08, −3.22]; rack-win delta [−0.240, −0.021] (310) | 0.25x (9-ball) | † | rows 65, 66, 67 |
| Pick policy over noisy self-quotes | BELOW | E[L] 1.17 against the 2.66 record, −1.49 [−1.88, −1.03] | 1.0x | † | row 93 |
| Make-first position brain | UNRESOLVED | +0.05 [−0.2825, +0.4125] (400) | 0.1x | † | row 126 |
| Hand-crafted terminal terms: give-up rescue bundle; boundary-liveness term | NOT ESTABLISHED; HONEST NEAR-NULL | +0.35 [0.00, +1.00] (40); +0.025 [0, +0.075] (40) | 0.1x | † | rows 131, 147 |
| Break-stroke variants; crossing lookahead; survival-product break objective | REFUTED ‡; REFUTED ‡; REFUTED-AT-THIS-n ‡ | −0.30; 0.000; +0.1625, interval spanning zero | 0.1x | † | rows 179, 188 |
| Kernel search at every decision, not only at forced shots | REFUTED ‡ | −3.775 [−6.680, −0.870] (80 triples) | 0.1x | † | row 208; internal screening log, line 94 |
| Lookahead variants: key-ball 2-ply; multi-shot planner; run-count-aware leaf | UNRESOLVED ‡; CLOSED; CLOSED | −0.475 [−2.411, +1.461]; survival −0.0074 [−0.0515, +0.0368]; −0.0163 [−0.0598, +0.0272] | 0.1x | † | rows 246, 381, 384 |
| Stroke sweeps: 189 break strokes × 32 draws; in-rack sweep at recorded death sites | UNRESOLVED(+), NOT-HELD; BENCH-NULL | +18.17 [−35.29, +70.07]; survival +0.0053 [−0.0160, +0.0266] (47 sites) | 0.02x; sites from stored games | † | rows 369, 379 |
| Planner checks on recorded games: risk-priced selection; fewer draws; keep-the-table-open signal | NO-OVERRIDE-MASS; NO-SLACK; NO-SIGNAL | attributable deaths 0.096 of in-rack deaths; pick agreement 0.923-0.982 at 8-24 of 32 draws; best AUROC 0.505 | stored games | † | rows 266, 267, 268 |
| Extra pick terms: a miss-cost term; the NGO risk gate | NOT-WORTHY at every weight ‡; CLOSED | 0 pick flips at any weight; the gate said no at 0 of 170 states | stored states | † | rows 449, 519 |
| Searched break at the break ceiling | CEILING-CLEARS on its own metric; names no usable break | cut 93.4 % [86.1, 99.9] of break-stroke misses (bar 41.8 %); a live next shot after 341 of 1,088 made draws against R1's 760 of 1,053 | 0.1x | v2 | row 582 |

‡ From an unregistered fast-track screen or an exploratory read, or, for the 9-ball gate, with its
registration order not on record (appendix E).

**Notes on Table 8.2.**

1. *Heuristics and pretrained priors did not beat simulation*: strategist layers lost or stayed flat
   (rows 93, 113, 125, 126), terminal terms moved nothing (rows 131, 147), and no language-model
   strategist beat the closed-form painter (Table 8.3, attempt 7).
2. *Compute in the wrong place hurt*: a wider window at matched compute read −1.85† and search at every
   decision −3.775† (both unregistered fast-track screens; rows 175, 208). What won was compute spent
   only where a decision was empty or a break was open (S4 to S6-PRIME, Table 6.1).
3. *Some objects won their own metric and lost the game*: the refined executor won racks while its
   straight-in make rate fell to 0.486† against 0.585† (row 71); the searched break cut its own misses
   by 93 % [v2] yet left far fewer live next shots (row 582).
4. *The largest negative was a rule, not a lever*: the envelope was not enforced in the counted 14.1
   path (rows 546, 556, 559), and the compliant agent misses the hard target (rows 563, 571). Every †
   number is history, not a claim about the shipped agent.

## 8.3 Learning attempts

Attempts 1-22 follow the record's own catalogue of 12 October 2026 (internal learning-route plan of
2026-10-12); attempts 23-32 came after it.

**Table 8.3. Every learning attempt.**

| # | Object (dates) | Data | Outcome | Env. | Key |
|---|---|---|---|---|---|
| 1 | Flat reinforcement learning (TD3) on raw strokes, 9-ball (07-13) | up to a million self-play decisions | pot rate 0.014 → 0.032; head-to-head against the planner −6.356: honest negative | † | row 7 |
| 2 | Planner distillation into an action-generating network, three iterations (07-12 to 07-15) | about 230 thousand planner decisions | pot ratio against the planner 0.6567 → 0.1791 → 0.1552 (bar 0.90), mode collapse: FAIL ‡ | † | rows 3-5 |
| 3 | Ranking actor, learned leaf, retrains (07-15 to 07-21) | about 60 thousand self-play decisions a generation | retrains flat: 0 of 3, then flat at all four points twice; leaf MSE 0.03238 against the heuristic's 0.03223 | † | rows 10-21 |
| 4 | Expert iteration, generation 1 (07-21 to 07-22) | about 250 thousand reanalysed decisions | SPRT PASS at all four noise points: the one training-driven promotion | † | rows 23-25 |
| 5 | Generation 2, deeper-teacher check, learned leaf v1 and v2 (07-23 to 07-24) | same-strength expert data | NON_IMPROVING; FAIL; leaf Brier 0.0376 and 0.0379 against 0.032: saturation at the teacher's level | † | rows 25, 27, 29, 30 |
| 6 | 0.25x specialist; capacity ladder; HL-Gauss retrain (07-28 to 08-02) | about 71 thousand expert decisions (the ladder also about 230 thousand teacher rows); 0.3 to 1.1 million parameters | specialist win rate 0.476; ladder NEITHER; retrain KILL; verification alone worth +0.8947 | † | rows 46-48, 57, 63, 64; Phase 4 narrative of 2026-08-01 |
| 7 | Language-model strategists and language-model-drawn leave surfaces (08-02 to 08-03) | 80-rack exams; 16 drawn surfaces | NO-EDGE; UNDERPOWERED-AGAIN; MIXED (6 of 80); BELOW (4 of 80), against the closed-form painter's 12 of 80; surfaces usable 1 of 16, then 10 of 16 once the contract named the shot served | † | rows 72-79 |
| 8 | Quoter networks; policy distillation (08-04 to 08-08) | quoter corpora; distillation rows | GATE-SHY ‡, then STILL-SHY ‡ (0 of 45 settings qualify); the distillation closed unmeasured | † | rows 97, 116, 117 |
| 9 | Boundary value from sparse labels (08-27) | one draw per boundary state | held-out AUROC 0.3846; skill 0.83 % against 5 %: NOT-VIABLE | † | row 147 |
| 10 | Distilled value and return-to-go heads (08-31 to 09-02) | distillation sets from the search agent | return-to-go AUROC 0.845, but as a 3-to-2 pruner it kept 0.481 against a random pruner's 0.614: offline-falsified ‡ | † | rows 152, 157, 158 |
| 11 | Make, survival and leave-quality heads in the loop (09-05 to 09-07) | stored rows under a leakage rule | make head +0.65 [−1.01, +2.31] (on-policy R² −1.57) ‡; survival head NOT-EXERCISED in play ‡; leave-quality arm +1.325 [−1.744, +4.394]: leave axis closed | † | rows 188, 189, 191, 192, 200, 202, 204 |
| 12 | Make head as the search pre-ranker (09-08 to 09-09) | the frozen make head | +2.775 [+0.215, +5.335] at 80 pairs, then −1.35 [−2.815, +0.115]: REFUTED-AT-160 | † | rows 223, 224 |
| 13 | Search ordering scorers C1, C1b, C2 (09-09 to 09-13) | trigger-search rows of a 0.1x data-generation run | C1 AUROC 0.4617 ‡; C1b UNRESOLVED-AT-80 ‡; C2 AUROC 0.794 ‡, +20.663 at 0.02x ‡, alone at 0.1x +4.037 [−1.703, +9.778] ‡, with BREAK-F +12.519; on-policy re-fit FAIL (0.7560 against 0.8040), frozen C2 kept | † | rows 227, 229, 231, 234, 242, 252, 264 |
| 14 | Learned break-leaf values: post-break scorer, survive-the-next-re-rack value, raw-state and pooled versions (09-11 to 09-14) | up to about 113 thousand executed rows | AUROC 0.699 (NOT-SUPPORTED) ‡ and 0.6988 against 0.70; raw state DATA-LIMITED; one-draw label reliability (ICC) 0.038 at 0.1x | † | rows 234, 260, 264, 271, 277, 300 |
| 15 | Rollout check of the boundary pick (09-15) | 608 decisions | KEY-IS-NEAR-OPTIMAL ‡: regret −0.0164 [−0.0423, +0.0094] | † | row 284 |
| 16 | Denoised value in the loop (09-16 to 09-17) | 399 states × 20 draws at 0.02x | offline AUROC +0.174 over one-draw labels; in play −31.0 [−48.2, −14.7] ‡: it ranks states, not strokes | † | rows 296, 302 |
| 17 | Leave-value models, among them a value of post-stroke leaves (09-21 to 09-24) | about 31 thousand in-rack decisions; 16 thousand leaf rows | AUROC 0.664, equalled by state-hazard features alone (0.666); pairwise 0.535; post-stroke value 0.569; +0.0097 per doubling: CLOSED | † | rows 364, 365, 383, 386, 389 |
| 18 | Rollout value at widened in-rack windows (09-22) | 40 pairs at 0.02x; 47 death sites | +34.55 [−88.2, +151.9] UNRESOLVED(+), NOT-HELD; BENCH-NULL | † | rows 362, 363 |
| 19 | A set network valuing leaves, trained on self-play (09-24 to 10-02) | 2,000 games, 380 CPU-hours | pairwise 0.497 against the free baseline's 0.503 (label ceiling 0.928); 0.693 with one simulated continuation per leaf: CLOSED-BY-REPRESENTATION-READ | † | rows 414, 418, 426, 445 |
| 20 | Depth-1 leaf-fold value (09-27) | bench states; 40 pairs at 0.1x | bench +0.106 [+0.063, +0.153]; in play −27.7 [−55.9, +1.075]: NON_IMPROVING | † | rows 410, 415 |
| 21 | Break-arrival, coordinate-store and 14th-ball fits (10-07 to 10-09) | 5,246 break records; stored states | AUROC 0.5264; geometry adds −0.0078 [−0.0208, +0.0046]; 0.5527 against 0.60 ‡: NOT-CONTROLLABLE | † | rows 457, 465, 470 |
| 22 | Learned scorer for the break fold, with its learning curve (10-11) | 36 bench states | Spearman 0.517, 0.582, 0.650 at 8, 15, 30 games against 0.90, +0.069 per doubling: FLAT; the free prior won at every fraction | † | row 483 |
| 23 | Break-arrival value at scale: registration gate (10-12) | sealed bench numbers | chance of a LEARNING word 0.018 against 0.5: GATE FAILS; no labels bought | † | row 488 |
| 24 | Learned grid pruner (10-12 to 10-14) | 48 games, 4,576 decisions | identity with the F3-PRUNED pick 0.4685 at 40 % kept against 0.99: NOT-PRUNABLE | † | row 497 |
| 25 | Learned leaf value V: licence, then play (10-13 to 10-21) | gradient-boosted trees on free labels, sealed before the read | LICENSED: 0.0134 [0.0042, 0.0214] per break, 0.70 of the exact 2-ply's gain; in play ADOPT +58.47 [+32.69, +84.77] | † | rows 500, 524 |
| 26 | In-rack lookahead scored by a learned leaf (10-20) | 395 in-rack states | FAIL: harm 2.3 % against 2 %; first-stroke deaths 611 against 109 | † | row 525 |
| 27 | Step-1 guard on V's 14th-ball switches (10-22) | 1,881 states | FAIL: net risk change −40.3 (z −22.5) | † | row 532 |
| 28 | Learned-leaf in-rack 2-ply, then the stage-3 leaf (10-22 to 10-24) | 390, then 1,704 states | MEET (risk cut 0.127), then FAIL on the interval [−0.029, +0.302] | † | rows 538, 548 |
| 29 | Break-leaf value swapped into the 2-ply (10-24) | 597 changed states | FAIL: risk cut −0.0074 [−0.0254, +0.0100]; harm 181 against rescue 154 | † | row 551 |
| 30 | Noise-conditioned position value (10-25 to 10-26) | MM hand-ladder games at all five tiers | NOT-SKILLED; numbers withheld, as the model was trained on games at every tier and its registered skill pools the 0.40x tier with an upper tier, which was fitted on data we cannot redistribute | v1 | row 564 |
| 31 | Boundary hazard models 1 and 2 (10-27 to 10-28) | labels from the hand-ladder games | SKILLED on held-out thirds against a bar of 1/50; numbers withheld (section 7.3) | v1 labels | rows 569, 573 |
| 32 | One-ply hazard leaf at the boundary (10-29) | 440 and 437 boundary states | FUTILE on both legs (90 % bounds 4.84 % and 9.47 % against 13.04 %): closed | v2 | row 580 |

‡ From an unregistered fast-track screen or an exploratory read, or, in attempts 2 and 8, with its
registration order not on record (appendix E).

**Notes on Table 8.3.**

1. *Learning paid only inside search.* The record's own summary of attempts 1-22 has five findings:
   learning paid only inside search (attempts 4, 13); single-draw off-policy labels fail while denoised
   labels carry signal (19, 22); a state value must not rank strokes (16); only play decides (12, 20);
   free baselines bind (17, 21, 22). Attempts 23-32 agree with all five.
2. *Three learned objects reached play with a positive word*: p2rank-v6 (attempt 4), C2 (13) and V (25).
   Each improves what simulation chooses from or how far it looks; none replaces simulation as the judge
   of the played stroke.
3. *Labels were the binding cost*: a one-draw label at 0.1x has a reliability of about 0.04† (row 300);
   signal appeared with denoised or simulated labels (rows 296, 426).
4. *Prediction is not play*: both hazard models were SKILLED predictors, yet the leaf built on the
   second was FUTILE (rows 569, 573, 580).
