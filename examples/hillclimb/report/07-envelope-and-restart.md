# 7. The envelope finding and the in-envelope restart

On 24 October 2026 the noise ladder reached 0.10x and the project lead declared the hard target
achieved (internal research log, row 545). This section reports what a census of the certified games
then found, how the target was re-opened, and what the agent reads when the actuation envelope is
enforced on every counted stroke.

**Reading notes.** Markers are as in section 0. Several screens state hazard shifts in units of a
population's summed miss hazard (the sum over its logged strokes of each stroke's miss share): H for the
certified 0.10x games, W for the boundary states of row 580. The decision to re-open the target, the
envelope v2 registration and one adoption are dated lines of the internal decision log.

## 7.1 What the census found (24-26 October)

The project lead asked how often showpiece strokes occur in a long 0.1x run. A census of the closed
0.10x store (240 games, about 69 thousand strokes) answered that: kicks, banks, combinations, thin
cuts, break-pace strokes and strokes the agent's own noise misses at least one time in ten made up
10.3-12.5 %† of a typical run of about 300 balls. It also found something larger (row 546). The speed
law of row 39 had never been enforced in the counted 14.1 path: that path clipped speed only at the
simulator's validity limit of 15.0 m/s, the break search's speed grid ran to 15.0, and the certified
agent had commanded more than 12 m/s on 1,329 strokes (1.93 %†), including 20.9 %† of its break shots
(row 546).

The second channel was worse. The certified agent sat below the cue-clearance floor on 91.7 %† of its
strokes; its elevation was zero on about 54 %† of strokes and never above 5° (row 556). Raising only the
elevation to the floor plus 0.5°, with nothing re-planned, would have multiplied the summed miss hazard
about 41-fold, +4,033 %† [3,708, 4,364] of H (row 556). Re-planned with validate-then-reseed in force at
1,200 sampled sub-floor positions, the agent recovered most of that cost, yet its summed miss hazard
still rose by +108.8 %† [67.1, 159.8] of H, against the 18.71 % rise at which the certificate's E[L]
would fall below the 222.2 bar: the hard target fails under the envelope at this screen (row 559). The
certificate stands as filed for its object, but its agent broke both envelope channels, so every 14.1
number before row 563 other than the hand-ladder read (row 562) carries †, including B + NGO's 263.8
at 0.10x (row 543) and VS-2's 241.26 (row 524).

## 7.2 The compliant agent misses the target (26-28 October)

R1 is the certified arm made compliant: B + NGO with the E12 speed rule and validate-then-reseed in
force (section 5.5). Played in whole games at 0.1x and scored in the certificate's CMC form, R1 ran
E[L]_CMC 128.73 [v1] over its first 12 complete games, about half of 263.8†; its upper bound at level
0.995, 181.78 [v1], was under the 222.2 bar, so the claim that the compliant agent reaches the hard
target was falsified at the first look. No counted stroke sat below the floor and no commanded speed
left the box (row 563).

Of the two options, keeping the declaration with a label beside it or re-opening the target (row 563),
the project lead chose to re-open it: the hard target is not met in-envelope, and the goal is again an
in-envelope σ\*200 of at least 0.1x; the declaration of row 545 stays on file as filed (internal
decision log, line 624). The project lead also allowed a faster break, and
envelope v2 was registered the same night: at a break the commanded cue speed v0 may reach 13.4 m/s,
while everything else stays as in v1 (decision log, line 629). The cap was taken from the top of the
25-30 mph range of cue-ball break speeds in D. G. Alciatore's break-speed FAQ, but it bounds the cue
speed v0, not the cue ball's speed: on the public kernel a centre-hit break at the cap sends the cue
ball off at about 46 mph (section 2.5; decision log, line 902).
The next morning the interpreter build was replaced; 85 of 85 recorded units replayed or re-planned
identically on the new build (row 566).

Re-measured under v2, R1 ran E[L]_CMC 150.01 [v2] over 12 complete games, its upper bound 210.46 [v2]
still under 222.2: falsified again, and this is the in-envelope baseline (row 571). R1 used the faster
break at only 3 of its 110 break decisions, and because the two runs played different games, the gap
between 128.73 and 150.01 is not a paired estimate (row 571).

## 7.3 Climbing inside the envelope (27-30 October)

Under the plan of record, climb steps are now paired on the compliant agent at a human-level hand, and
a lever that gains only at the 0.1x unit is an execution route (rows 556, 568, 585); the project lead
set the order as fewer showpiece strokes and a more practical, human strategy first, then match play
(row 550). The 0.1x routes read before the cut-off follow.

**The break-ball leave lever.** At 162 recorded 14th-ball positions from the 0.10x store, re-planned by
R1 under v2, re-scoring the candidates by the miss share of the break each leave sets up cut the
boundary hazard by 59.3 % of H [v2] (row 568). In whole games it did not carry: −7.83 [−38.08, +23.38]
[v2] over 30 pairs, OPEN, stopped by its futility look (row 574). A diagnosis found why: the screen had
planned the break at the nominal leave, the position a perfectly executed stroke would leave. At the
leaves the agent's own noise really produces, the cut fell to 7.77 % [−11.16, +30.83] of H [v2], while
the nominal screen on in-envelope game positions still showed 54.76 % [40.50, 71.48] [v2]. The
nominal-leave assumption was named, not the positions, and scoring by expectation over the agent's own
execution noise became the form for later levers (row 577).

**Learned hazard models.** Two boundary hazard models fitted offline on recorded positions read SKILLED
on their held-out thirds, the second mostly by predicting give-ups (rows 569, 573); their skill numbers
are not printed, because their labels were drawn partly at hand levels fitted on data we cannot
redistribute. A one-ply hazard leaf built on the second model was futile at both the 14th-ball and the
break states, cutting 1.00 % [−3.98, +6.77] and 6.85 % [2.96, 11.06] of W [v2]; their one-sided 90 %
upper bounds, 4.84 % and 9.47 %, both fell under the bar of 13.04 % of W, so the hazard leaf at the
boundary closed (row 580).

**Drills.** A nine-cell drill benchmark, report only, first measured its own adapter rather than play;
after one repair build for its two adapter defects, the planner cleared 403† of 900 attempts against
275† before, and 488 of its 497 deaths came at a forced option below the make floor of 16 makes in 32
noisy tries (rows 528, 535). The
law-at-the-hole experiment then showed that at 286 of those 488 forced holes (58.6 %) a give-up search
restricted to the drill's legal targets, with no stroke above 12 m/s, found a passing stroke the menu
lacked (row 561; whether it also enforced the clearance floor is not stated, UNVERIFIED). Played first
at a forced give-up under v2, this hole search cleared
261 of 398 held-out pairs where the agent alone cleared 151 (discordant pairs 124 against 14; exact
one-sided McNemar p ≈ 1.7 × 10⁻²³), with no harm on the control cells: ADOPT, and it was adopted for
drills only the same day (row 578; decision log, line 830).

**The give-up fix in whole games.** A screen of the fix at stored states was too thin to read, 22 states
against the 25 needed (row 572), so the fix went straight to a whole-game arm. On 60 whole-game pairs at
0.1x, on fresh pre-reserved games with the same noise streams in both arms, R1 read E[L]_CMC 148.59 [v2]
and R1 + ML 178.36 [v2], a paired gain of +29.77 [+13.07, +50.92] whose pre-set lower bound, +13.00,
cleared zero: IN-ENVELOPE-GAIN (row 585). The gain sits in the 11 games where R1 died at a give-up; there
the fix found and played a passing stroke all 13 times it was called, and the other 49 games were
identical in both arms. Games reaching 45 balls rose from 39 to 43 of 60 [v2]. The read is labelled
nominal-leave, nothing was adopted, and R1 + ML sits at about 80 % of the 222.2 bar (row 585).

**Two reads at the boundary.** A hard break search inside v2 removed most of the break stroke's own
misses at recorded positions, but at the cost of the position after the break, so it named no usable
break (row 582). A wider boundary search that varies spin and speed and judges candidates at realised
leaves cut the recorded boundary risk by 56.0 % [39.3, 76.6] [v2] against a need of 37.5 % (row 583).
The whole-game stage this route fed had started, and had not yet read, at the cut-off (row 585); its
results are outside this report.

## 7.4 Where the record stands

The hard target is **not met in-envelope** (decision log, line 624). The presented result is R1 + ML,
E[L]_CMC 193.00 [v3] against 138.50 [v3] for R1 on the same games, labelled nominal-leave and not
adopted (row 598): about 87 % of the 222.2 bar, still under it. Under the v2 caps the figure stays
178.36 [v2] (row 585); the in-envelope baseline is R1 at 150.01 [v2] (row 571), and 128.73 [v1] under
v1 (row 563). The certified 263.8† (row 543), VS-2's 241.26† (row 524) and v4's 142.52† (row 451)
stand beside these, never as the hard target.

**The cap replay, after the cut-off.** In the read behind 178.36 [v2] (row 585, 60 whole games
in each arm), the agent struck 172 strokes whose cue-ball launch speed by the kernel's strike law
exceeded 13.4112 m/s, the 30 mph top of the break-speed FAQ's range (section 2.5): 137 breaks and 35
others. At their recorded speed all 172 reproduced exactly as recorded; each was then replayed with its
cue speed alone lowered to give a 30 mph launch, and the figures that follow describe these capped
replays. Of the 172, 130 change their scored miss share (section 3.3), 97 missing more often and 33
less often, and 42 are unchanged; on the realised draws, 30 go from keeping the table to losing it and
6 the other way. Holding every other stroke as recorded, a first-order rescore of E[L]_CMC gives about
128.53 for R1 + ML and about 114.62 for R1, a gap of about +13.91, against 178.36 [v2], 148.59 [v2] and
+29.77 as measured. This is an estimate, not a re-measure, since an agent playing under a 30 mph cap
would choose other strokes (decision log, line 927). The project lead asked for a re-measure of both
arms under a 30 mph break cap, whose figure would then be the presented result (decision log, lines
934-935). The replay lowered breaks and other strokes alike, while the re-measure's cap applies to
breaks.

**The re-measure under envelope v3, after the cut-off.** Envelope v3 differs from v2 in one place: at a
break, the cue ball's launch speed by the kernel's strike law may not exceed 13.4112 m/s; every other
stroke is as under v2. Under v3 the arms of row 585, R1 and R1 + ML, played 60 whole-game
pairs at 0.1x on fresh games, with the same noise streams in both arms. R1 + ML read E[L]_CMC
193.00 [v3] and R1 138.50 [v3], a paired gain of +54.50 [+31.65, +80.12] [v3] whose lower end is above
zero: IN-ENVELOPE-GAIN (row 598; decision log, lines 1032, 1034). All 60 pairs were read and none was
void. The gain sits in the 16 games where R1 died at a give-up; there the fix played a passing stroke
all 16 times it was called, and the other 44 games were identical in both arms [v3]. Games reaching 45
balls rose from 41 to 44 of 60 [v3]. No game is shared with row 585, so neither row 585 nor the replay
is paired with these figures; results under different versions are compared only side by side. The
read is labelled nominal-leave, and nothing was adopted (row 598).

**Table 7.1. The envelope finding and the chain after it.** Kinds as in Table 6.1. % of H and % of W are
hazard shifts (reading notes); McNemar b and c are the discordant drill pairs.

| Key | Date | Kind | Composition or change | σ | Paired Δ [95 % interval] | Level or word | n | Env. |
|---|---|---|---|---|---|---|---|---|
| row 545 | 2026-10-24 | declaration | the project lead declares the hard target achieved on row 543 | 0.1x | — | declared; stays on file as filed | — | † (its object) |
| row 546 | 2026-10-24 | census | the closed 0.10x store: commanded speeds | 0.1x | — | above 12 m/s on 1.93 % of strokes and 20.9 % of break shots | 240 games | † |
| row 556 | 2026-10-25 | census | the same store: elevation against the cue-clearance floor; elevation-only re-strike | 0.1x | +4,033 % of H [3,708, 4,364] | 91.7 % of strokes below the floor | 5,574 pairs | † |
| row 559 | 2026-10-26 | screen | re-planned with validate-then-reseed at sub-floor positions | 0.1x | +108.8 % of H [67.1, 159.8] against a bar of 18.71 % | the hard target fails under the envelope | 1,200 positions | † (positions) |
| row 563 | 2026-10-26 | reading | R1 = B + NGO + E12 + validate-then-reseed, whole games | 0.1x | — | E[L]_CMC 128.73; upper bound 181.78 < 222.2: FALSIFIED | 12 games | v1 |
| decision log, line 624 | 2026-10-26 | decision | the project lead re-opens the hard target as not met in-envelope | — | — | open | — | — |
| decision log, line 629 | 2026-10-26 | law | actuation envelope v2: the commanded cue speed v0 up to 13.4 m/s at a break | — | — | registered | — | — |
| row 571 | 2026-10-28 | reading | R1 under v2 | 0.1x | — | E[L]_CMC 150.01; upper bound 210.46 < 222.2: FALSIFIED; the in-envelope baseline | 12 games | v2 |
| rows 568, 574 | 2026-10-27 to 10-28 | KILL | break-ball leave lever: screen, then whole games | 0.1x | screen cut 59.3 % of H; games −7.83 [−38.08, +23.38] | OPEN; stopped by its futility look | 162 positions; 30 pairs | v2 (screen positions from the 0.10x store) |
| row 577 | 2026-10-29 | diagnosis | nominal leave against realised leaves | 0.1x | realised 7.77 % of H [−11.16, +30.83]; nominal 54.76 % [40.50, 71.48] | the nominal leave named | 162; 440 positions | v2 (the 162 screen positions from the 0.10x store) |
| rows 569, 573 | 2026-10-27 to 10-28 | step | boundary hazard models fitted offline | — | withheld (labels partly at hand levels fitted on data we cannot redistribute) | SKILLED; mostly give-ups | held-out thirds | v1 labels |
| row 580 | 2026-10-29 | KILL | one-ply hazard leaf at 14th-ball and break states | 0.1x | 1.00 % of W [−3.98, +6.77]; 6.85 % [2.96, 11.06]; 90 % bounds 4.84 % and 9.47 % against 13.04 % | FUTILE on both legs; closed | 440; 437 positions | v2 |
| rows 528, 535 | 2026-10-21 to 10-22 | instrument | nine-cell drill benchmark, then one repair build for its two adapter defects | 0x and 0.1x | — | planner clears 275 → 403 of 900; 488 of 497 deaths at a forced option | 1,800 attempts | † |
| row 561 | 2026-10-26 | step | law at the hole: drill-legal give-up search at the forced holes | 0x and 0.1x | — | 286 of 488 holes (58.6 %) with a new passer | 488 positions | speed cap only; clearance UNVERIFIED |
| row 578 | 2026-10-29 | ADOPT (drills) | the hole search played first at a forced give-up | 0x and 0.1x | McNemar b 124, c 14; p ≈ 1.7 × 10⁻²³ | clears 151 → 261 of 398; no harm; adopted for drills (decision log, line 830) | 398 pairs | v2 |
| row 572 | 2026-10-28 | screen | the give-up fix at stored states | 0.1x | — | too thin: 22 states against 25 | 22 states | v2 |
| row 585 | 2026-10-30 | in-envelope gain | R1 + ML: give-up fix, menu and leave | 0.1x | +29.77 [+13.07, +50.92] | 148.59 → 178.36; nominal-leave; not adopted | 60 pairs | v2 |
| row 598 | 2026-11-03 | in-envelope gain | row 585's arms re-measured under v3, on fresh games | 0.1x | +54.50 [+31.65, +80.12] | 138.50 → 193.00; nominal-leave; not adopted | 60 pairs | v3 |
