# Appendix E. Glossary of research labels

Each research label used in the report, its plain meaning, and where it is defined or first measured
("row N" is a row of the internal research log, "line N" a line of the internal decision log,
"screening log, line N" a line of the internal screening log, a section number a place in this report).

## E.1 Measurement, keys and markers

| Label | Plain meaning | Key |
|---|---|---|
| 14.1 | Straight pool as solo runs; a run ends at the first miss, foul or give-up | row 81; section 2.2 |
| E[L], L | Expected run length in balls; L, the called balls legally pocketed in one run | row 81 |
| Plain (indicator) form | E[L] as exposure over deaths (capped constant-hazard MLE); P(L ≥ 45) as the share of games reaching 45 | rows 321, 323 |
| CMC, E[L]_CMC, P45_CMC | Conditional Monte Carlo: each logged stroke re-struck 128 times and its miss share used for the death; E[L]_CMC = 128 × balls / re-struck misses | row 510; section 3.3 |
| P(L ≥ 45) | Probability that a run reaches 45 balls | section 3.4 |
| Hard target | E[L] about 200 and P(L ≥ 45) ≥ 0.80 at 0.1x; CMC bars 2,000/9 ≈ 222.2 and 0.8^0.9 ≈ 0.818 | rows 510, 543 |
| σ\*200 | Largest noise level at which an agent is certified to hold the hard target with plausible play | row 388 |
| Certificate | Pre-registered group-sequential test at one noise level | row 388; appendix C |
| CRN, block | Common random numbers: paired arms share racks and noise draws; a block is the set of fresh pairs on which one comparison is read once | row 450 |
| Screen | Cheap exploratory paired test, information only, never a claim | row 175 |
| Power line | Probability of each decision word at the planned size, computed before registration | line 32 |
| SPRT | Sequential probability ratio test, the stopping rule of the 9-ball gates | row 24 |
| E[L] of record | The treatment arm's level on the block that adopted a step | row 451 |
| H, W | Summed miss hazard of the certified 0.10x games (H) and of row 580's boundary states (W); hazard shifts are stated in % of these | rows 556, 559, 580 |
| Decision words | Outcomes registered before each experiment ran, exploratory readings excepted and marked as such, and printed as filed, for example CERTIFIED, FALSIFIED, ADOPT, IN-ENVELOPE-GAIN, OPEN, AGREE, SKILLED, FUTILE, UNRESOLVED, HELD, KILL | section 0 |
| † | A number not verified inside the actuation envelope: every 14.1 number before row 563 other than the hand-ladder read (row 562), and every 9-ball number | rows 39, 546, 556, 559 |
| ‡, (exploratory) | Marks a reading excepted from the registration statements of sections 0 and 4.1: filed as exploratory; from a fast-track screen, which the records file as unregistered even where a one-page pre-registration came first; with its registration order not on record; or with a word its registration does not contain. In tables ‡ follows the word, reading or key concerned; in prose a parenthesis follows the reading, such as (exploratory) or (an unregistered fast-track screen) | sections 0, 4.1, 6.4 |
| [v1], [v2], [v3] | An in-envelope number and the envelope version it was measured under | section 0 |
| Nominal-leave | Label on a read whose leave term scores the position a perfectly executed stroke would leave | rows 577, 585 |
| UNVERIFIED | A fact the records do not settle | section 0 |

## E.2 Noise, envelope and hands

| Label | Plain meaning | Key |
|---|---|---|
| icga-v1, r, 0.1x | Gaussian stroke errors of the ICGA computer-pool convention scaled by r; 0.1x (r = 0.1) is the unit of record | section 2.3 |
| Hand ladder, hand v1 | A human-shaped hand at five tiers, no tier named human; results printed only at the public tiers 0.25x and 0.40x, since the upper tiers were fitted on data we cannot redistribute; the research hand's speed term, a private research fit, does not ship | line 551; row 562 |
| MM, M | Hand-ladder arms: MM plans and plays at the hand; M plans at 0.1x and plays at the hand | row 562 |
| Fancy shot | A stroke whose make chance under the arm's own hand is below one half | row 562 |
| Actuation envelope v1 | Commanded cue speed v0 from 0.5 to 12.0 m/s; elevation from the cue-clearance floor + 0.5° to 89°; tip offset within half a ball radius; refuse, never clip | row 39 |
| Envelope v2 | As v1, but at a break shot v0 may reach 13.4 m/s | line 629 |
| Envelope v3 | As v2, but at a break shot the cue ball's launch speed by the kernel's strike law may not exceed 13.4112 m/s (30 mph) | lines 934-935; row 598 |
| Cue-clearance floor | Least elevation at which a straight cue clears the cushion, the rail and every ball by 2 mm | row 556 |
| Validate-then-reseed | A stroke below the floor is raised to the floor + 0.5°, not removed | rows 26, 556 |
| E12 | The speed rule named for its 12 m/s cap on v0: re-cut break grid, clamped lattices, refusal before the kernel | row 563 |

## E.3 9-ball and the first 14.1 work

| Label | Plain meaning | Key |
|---|---|---|
| Phases 0-3 | 9-ball: planner floor; distilled networks; learned candidate ranker; expert iteration | rows 1-30 |
| Phase 4 | 9-ball per-noise frontier, the envelope law and the compliant break | rows 31-68 |
| p2rank-v6, p2rank-v3a | The 9-ball ranking network promoted by expert iteration, the one training-driven promotion; p2rank-v3a, the incumbent it replaced | row 25 |
| Step 2, rung 1 | A 0.25x specialist ranker (step 2) and three larger or different students (rung 1); none beat p2rank-v6 | rows 48, 50, 57 |
| Frontier batch | 9-ball tests of learning and scoring levers; no acceptance | rows 64-68 |
| The rebuild | The split into an executor that prices strokes by simulation and a strategist that picks among them | row 69 |
| EO1, EO2; EO3-EO11 | Executor exams: refinement beat re-drawing at equal compute; later adoption exams annulled, closed EXAM-INVALID or never started, with no usable verdict | rows 71, 76; 96-123 |
| Language-model ladder | Language-model strategist screens; no edge | rows 72-79 |
| Quoter networks | Networks trained to predict the executor's simulated prices (quotes) for candidate strokes | row 97 |
| 14.1 instrument, arm A | The run-length test bed that replaced binary rack exams; arm A, its rows of record | rows 81-88 |
| Leave surface (height map) | 2 cm grid valuing each cue-ball stop for the next shot; candidates refined to maximise expected pot × height, less a foul term | rows 87, 89; section 5.2 |
| Painter, brush | The closed-form code that paints a leave surface; the makeability field it paints with | section 5.2 |
| Height-map census | Count over stored decision logs, made for this report, of how often the leave surface sets the played stroke | section 5.2 |
| Deep-evaluation re-ranker | Re-ranks the top three options on 32 shared rollouts each | row 127 |

## E.4 The 14.1 agents

| Label | Plain meaning | Key |
|---|---|---|
| Window | The three most makeable live pots, plus bank and kick fills when few are live | section 5.1 |
| S1 | Make-first re-ranker, the first substrate | row 178 |
| S2 | Score = make share + live direct pots left (the liveness term) | row 178 |
| S3 | Adds one-cushion banks and kicks to thin windows | row 182 |
| S4, S4.1 | Sampled break search; S4.1 adds a crash fix | rows 186, 205 |
| S5 | Forced-shot (trigger) search when nothing in the window passes | row 205 |
| S6 | Deeper trigger search; reversed by its control | rows 212, 215 |
| S6-PRIME | S6's deepening paid for from the break search; first link of the 0.1x chain | row 217 |
| Declared-compute rule, reversal control | A step that adds compute must clear a compute-elasticity bound and pass a matched-compute control declared in advance | rows 186, 187 |
| C1, C1b | Learned make heads tried before C2 for ordering the search; failed or unresolved, not in play | row 227; screening log, lines 131, 132, 138 |
| C2 | A learned pre-filter whose chosen stroke is always simulated: five small networks ordering a 512-stroke search pool | row 252; section 5.6 |
| BREAK-F | Fold-selected break: 2,048 noise-free previews, the best eight struck 32 times | row 241 |
| S7 | S6-PRIME + C2-ordered search + BREAK-F | row 252 |
| Passer, make floor | A stroke that clears the make floor, 16 pots in 32 draws | rows 185-186, 297-319 |
| Make-rank, activate-at-one | Ties among passers broken by the lowest failure bound; a lone option priced on 32 draws, with search if it fails | rows 313, 316 |
| Coverage stack | S7 + ball-in-hand break + give-up coverage + make-rank + activate-at-one | row 318 |
| v2 | Coverage stack + wider break menu + in-rack search trigger + break-decision fix | row 345 |
| F1 UNION-32, v3 | A make-count pick over the union of candidate sets; v3 = v2 + F1 UNION-32 | row 409 |
| BREAK-SWEEP | A 189-point lattice of break strokes around the break winner | row 388 |
| F3-PRUNED | Full candidate grid struck 32 times per row; best 8 re-counted on 7 more blocks; most pots wins | rows 416, 450 |
| v4 | v2 + F3-PRUNED, the last 0.1x agent of record | row 451 |
| BREAK-GATE (BG) | A wider union of break candidates scored on the same draws | row 466 |
| NGO, NGO-F3P | No good option: give-up and one-option decisions; NGO-F3P runs F3-PRUNED there | rows 479, 486 |
| Exact exit | Skips F3-PRUNED's grid when the chosen stroke pots 256 of 256; decisions identical | row 511; line 251 |
| V | A learned leaf value used in the 2-ply: 300 gradient-boosted trees predicting a failed break shot | row 500 |
| VS-1, VS-2 | V's licence read; the V-scored 14th-ball 2-ply over up to 4 candidates | rows 500, 524 |
| B + NGO | v4 + BG + NGO-F3P + exact exit + VS-2, the certified arm | row 526 |
| A, B | Arm labels in a paired test (base and treatment); unrelated to B + NGO | section 3.5 |

## E.5 The in-envelope period

| Label | Plain meaning | Key |
|---|---|---|
| R1 | B + NGO with E12 and validate-then-reseed: the in-envelope agent | row 563 |
| ML | The give-up fix (MENU and LEAVE): at a give-up, search wider and pick by make chance × next-shot make at the nominal leave; not machine learning | row 585 |
| Nominal leave, realised leave | Where an exactly executed stroke leaves the cue ball; where noisy strokes do | row 577 |
| Break-ball leave lever | Picks the 14th-ball stroke by the next break's prospects | rows 568, 574 |
| Hazard model, hazard leaf | Learned boundary-hazard models, and a one-ply search using one of them | rows 569, 573, 580 |
| Drill benchmark | Nine drills judged by their own rules, report only | rows 528, 535 |
| Law at the hole, hole search | The drill's rules inside the give-up search; the hole search plays it first; adopted for drills only | rows 561, 578 |
