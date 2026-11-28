# 5. The agent

The agent that plays 14.1 in this report is a search procedure around the simulator, not a trained
policy. At each decision it lists candidate strokes from geometry, simulates the promising ones in the
kernel under the execution noise that will perturb the real stroke, and plays the stroke whose
simulated outcomes are best. Two small learned files help: C2, a learned pre-filter whose chosen stroke
is always simulated, and V, a learned leaf value used in the 2-ply (section 5.6). Everything else is
closed-form rules and counting.

Four compositions recur (appendix E). **v4** (coverage stack v4) is the base pick of section 5.1, the
coverage stack's rule wrappers, among them the BREAK-F break policy and C2's ordering, and F3-PRUNED, a
full re-scoring of the candidates at in-rack decisions. **B + NGO** adds BREAK-GATE (a wider break
menu), NGO-F3P (the same re-scoring where there is no good option), the exact exit (a shortcut that
skips the re-scoring when it cannot change the stroke) and VS-2, the V-scored 2-ply at the 14th ball
of a rack. **R1** is B + NGO made to obey the actuation envelope, and **R1 + ML** adds a fix for
decisions where R1 would give up. Noise is icga-v1 at 0.1x unless stated; a draw is one noisy
simulation of a stroke, and under common random numbers (CRN) all candidates at a decision face the
same draws. Keys and markers are as in section 0; design constants are those of the shipped code.

## 5.1 Candidates and the in-rack pick

For every object ball (any ball may be called in 14.1) and every pocket within an 80-degree cut, the
enumerator writes a direct pot, two cheat-the-pocket offsets, stun, natural-roll and draw variants aimed
at zones that leave a next shot, and a few safeties, with closed-form speed seeds. The three most
makeable live pots, priced by the closed-form brush of section 5.2, form the window; when at most two
pots are live, one-cushion banks and kicks fill the empty slots (the S3 layer, internal research log,
row 182). An empty window is a give-up, which ends a solo run. The labels S1 to S6-PRIME name the base
layers in order; S1 was named only when S2 was adopted on it (row 178), and S2 to S6-PRIME were named
in the order they were adopted (section 6).

Each window candidate is refined against its own leave surface (section 5.2), then struck 32 times on
the decision's CRN block and scored by its share of legal called pots plus the average number of live
direct pots it leaves, capped (the S2 layer, row 178); the best score displaces the most makeable
candidate only if it wins by a margin and pots at least as often. When no window candidate pots at
least 16 of 32, a sampled search runs over every ball and pocket: C2 orders a pool of 512 strokes from a
scrambled Sobol (quasi-random) sequence, the top 32 are simulated once each, ranks 33 to 128 only if
none pots, and the best four successes are struck again on the 32 CRN draws; a survivor plays only if
it pots at least 16 of 32 and strictly beats the window's pick (the S5 and S6-PRIME layers, rows 205,
217; C2's ordering is the S7 layer, row 242 and internal screening log, line 145). The same search
with 128 tries is the break's fallback (the S4 layer, row 186).

## 5.2 The leave surface: the height map

**What it is.** In August 2026 the project lead decided how position play enters the agent (internal
architecture decision record of 2026-08-02, decisions 4 to 6, paraphrased): the strategy layer declares
where the cue ball should stop as a value surface over the cloth, and the execution layer maximises the
joint expectation of potting and stopping well, minus a foul penalty, never the leave conditional on a
pot. This surface is what we call the height map: a grid of 2 cm cells (127 × 63 over the
2.54 × 1.27 m bed) with heights in [0, 1], read by bilinear interpolation.

**The painter and the brush.** For each window candidate the painter takes the table after the declared
pot, picks the next ball and pocket with the largest summed makeability, and paints the makeability of
that next shot from every cell where the cue ball could stop, favouring a cut of about 30 degrees on the
side that opens the angle to a ball after next. The makeability field, the brush, is a closed form
ported line by line from hand-drawn drafts the project lead reviewed: it falls off as the 1.4th power
of the cosine of the cut angle, is zero beyond a 72-degree cut, on the wrong approach side and where another
ball blocks the cue ball's path (since version 0.2, also the object ball's path to the pocket, but only
when it prices calls; the painted field keeps version 0.1), and decays with distance and near a
cushion. Nothing in it is learned or random.

**The executor.** The enumerator's seed strokes for the declared ball and pocket are scored on a shared
10-draw block, and the best three are refined by an iterated Gaussian search, 3 rounds of 16 proposals
with a shrinking step, each proposal clamped inside the envelope and scored by E[pot × W(rest)] −
λ × P(foul), where W is the surface height at the cue ball's resting point and λ the game's own foul
penalty; at most 2,000 simulations per candidate.

**What it was worth.** The first surface-guided runs read cue-ball rests in the kernel's axes against
grids painted in table axes; the fix added a correctly framed reading (row 87). In the first true
measurement, in 14.1 at 0.1x, the correctly read surface raised the mean run length from 4.26† to 7.08†
balls, +2.82† [1.95, 3.69] against the closed runs that had read it in the wrong frame (unpaired); in
9-ball it showed no measurable effect (row 89). Surfaces drawn by a language model did no better than
the closed-form painter (rows 77-79).

**Is it still used?** Yes. Every current agent, v4 through R1 + ML, runs this refinement in its one base
act, and VS-2 builds its menu from the refined window. A count made for this report over the stored
per-decision logs of row 585's games, with no new games (the height-map census; internal decision log, line 882), gives its present use
in R1 [v2]: the refinement ran at 92 % of decisions, on about three candidate pots each at 1,470
simulated strokes per pot, always in the corrected frame. Its stroke was the one struck at 73.5 % of
decisions (78.5 % of ordinary in-rack shots, 76.7 % of 14th-ball shots, 8.5 % of break shots, which
BREAK-F mostly plays). At 60 % of decisions the struck stroke was a refined proposal that potted in all
ten draws with the cue ball stopping on positive height, so the surface set its speed, spin and fine
aim; at 10 % no tried stroke reached positive height and an enumerated stroke was struck unchanged. At
18.7 % a later layer replaced the refined stroke, mostly F3-PRUNED (14.6 %), usually with a plain
enumerated stroke, and 7.8 % of decisions never used the surface. R1 + ML's shares are within one point
of R1's, and quarter samples of the logs of v4, the VS-2 arm and B + NGO give the same picture† (census
over the games of rows 450, 524, 543). What the surface is worth in balls today is UNVERIFIED: the logs
keep only each refinement's winner, and row 89, on an early instrument with runs of 4 to 7 balls, is
its last direct test. A flat-surface test (every height 1, which reduces the objective to the pot
probability) in paired whole games of R1 under envelope v2 has not been run.

## 5.3 Coverage wrappers, F3-PRUNED, the exit and NGO

**Coverage wrappers.** Each covers one recorded way of dying: BREAK-F for breaks and C2's ordering for
every trigger search (the S7 layer), ball in hand at a break, a search over up to 8 target balls before giving
up, tie-breaking by widening draws from 32 to 1,024, a check of one-option decisions, a wider break menu
when few candidates pass, an in-rack search when the window's best pots at most 31 of 32, and a
corrected break predicate. Two registered blocks adopted them (rows 318, 345; Table 6.1).

**F3-PRUNED** (the pruned form of a full-grid re-pick). Once the path above has chosen at an in-rack
decision with an active window, F3-PRUNED builds a grid of the chosen stroke, every enumerated
candidate, the fills and a 63-point lattice of speed and spin around each of the eight best rows, about
640 rows on average and up to 2,031† (internal decision log, line 118). Every row is struck 32 times on
the decision's CRN block, the eight with most pots on seven more blocks (256 draws in all), and the most
pots wins, ties going to the stroke already chosen; no weight, no threshold. Its block of 300 pairs
raised E[L] by +39.70† and cut the in-rack death hazard to 0.38† [0.29, 0.50] of its old value (rows
450, 451).

**The exact exit.** The chosen stroke is first struck alone on the eight blocks, stopping at its first
miss; if it pots 256 of 256 it is returned without the grid, a decision identical by construction. On
replays of a closed block this cut the cost from 59.33† to 21.78† CPU-seconds per decision (decision
log, line 251).

**NGO-F3P.** In-rack decisions with an empty or one-option window (no good option, NGO) get the same
funnel, which switches only when its pick pots strictly more often than the incumbent on the same eight
blocks. On 167 stored states at 0.03x it switched at 61† and passed its pre-registered bar
(exploratory; row 479), and the switches cost no measurable leave quality (exploratory; row 486); no
paired whole-game block isolates its effect.

## 5.4 The break and the 14th ball

In the 0.10x certificate games break shots were 7.0 %† of strokes but 54.4 %† of the summed miss hazard
(row 546); inside the envelope breaks hold 59.6 % [v2] of R1's misses (decision log, line 762).

**BREAK-F and BREAK-GATE.** A fixed family of 2,048 break strokes, thinned from a 25-aim × 10-speed ×
21-tip grid, is simulated once without noise; the best eight are struck 32 times, a candidate passes if
it pots at least 16 of 32 and its noise-free leave offers a next shot that does too, and the winner is
the passer whose draws most often leave a live next shot. At 0.02x this screened at +35.6† [+19.2,
+52.1] balls (row 241). BREAK-GATE adds up to 64 more previews and a 189-point lattice around the
winner to the same evaluation; break deaths per re-rack fell by −0.0348† [−0.0572, −0.0134] (row 466).

**The 14th-ball 2-ply with V (VS-2).** The stroke on the 14th ball decides where the cue ball waits for
the break shot. The menu is the regenerated window plus the stroke the policy chose, at most four
candidates. Each gets 256 pot draws, giving its failure share f; those of the first eight draws that pot
are carried through the re-rack, and each resulting break position is scored by V, the predicted chance
that the break shot fails (rarer kinds take fixed bench values). The agent plays the lowest risk
f + (1 − f) m, with m the mean leaf score. Its block of 321 pairs raised E[L] by +58.47† [+32.69,
+84.77], switching at 1,881† of 5,478 14th-ball decisions (row 524).

## 5.5 The envelope layer and the give-up fix

Section 2.5 defines the envelope; section 7 shows why it binds. R1 adds three parts. **E12** (named for
its 12 m/s cap on v0) re-cuts the break family's speeds to ten levels from 0.50 to 11.39 m/s, clamps every
lattice and search box at 12.0, and refuses any commanded speed outside the box before the kernel runs,
voiding the game rather than clipping the stroke; noise after the command may exceed 12 m/s, as human
motor error may. **Envelope v2** lifts the cap to 13.4 m/s at break decisions only (decision log, line
629); R1 used the faster break at 3 of 110 break decisions [v2] (row 571). **Validate-then-reseed**
raises a candidate below the cue-clearance floor to the floor plus 0.5 degrees and drops it only if it
still fails or would exceed 80 degrees (row 556); in R1's first whole-game read 1,471 of 1,601 played
strokes were raised [v1] (row 563).

**ML, the give-up fix.** Where R1 would give up with no stroke, ML ("menu and leave") looks for passers,
strokes that pot at least 16 of 32 on the decision's CRN block: in the existing menu, then with the cap
of eight target balls lifted, then on a fixed lattice. Up to eight passers are ranked by p × m, with p
the pot share and m the best next-shot make from the noise-free (nominal) leave. On the same 60 games it
raised E[L]_CMC from 148.59 [v2] to 178.36 [v2], labelled nominal-leave and not adopted (row 585;
section 7.3). Even a perfect give-up fix could not lift the in-envelope baselines to the hard target,
because most of the remaining hazard sits at the break and the rack's end (decision log, line 762).

## 5.6 The two learned files

**C2, the search pre-filter.** Five small neural networks (47 inputs, two hidden layers of 128, one
output; 3.5 MB as stored), averaged, predict whether one noisy try of a candidate stroke in a trigger
search pots. They were trained on about 175 thousand such tries from 1,967 searches in the first 50
thousand decision rows of S6-PRIME's own play at 0.1x (a pot in about 1.5 % of tries), with whole games
held out per fold; held-out AUROC was 0.78† to 0.81† by fold (internal screening log, lines 143, 145).
C2 only orders the pool, and every stroke it promotes must still pass the 32-draw re-check and the
16-of-32 floor. At 0.1x it raised the share of searches finding a pot within their first 32 tries from
0.30† to 0.77† (exploratory; row 242); its run-length record is mixed (section 8.3, attempt 13). A
re-fit on the stacked agent's own play missed its bar, so the frozen file stayed (row 264); C2 has been
in every agent since the coverage stack (row 318).

**V, the leaf value.** 300 gradient-boosted regression trees, 130 KB, over 30 features of a break
position: the cue ball and the remaining ball after the re-rack, mirrored to one side, plus 26 derived
quantities such as cut angles, distances and blocked paths. The target is the failure share, over 32
draws, of the break stroke v4 actually chose. V was fitted on 3,254 logged break positions from v3 and
v4 games at 0.1x (rows 465, 488), evaluates in pure Python equal bit for bit to the training library, and was
frozen before its evaluation (row 500). On 120 fresh 14th-ball positions, choosing by V cut the chance
of losing the run at the 14th ball or the next break by 0.0134† [0.0042, 0.0214] per break, with one
harmful switch, keeping 0.696† [0.241, 0.958] of the gain of the exact 2-ply, which costs 1,563 leaf
CPU-seconds per decision (row 500); in play it carried VS-2's +58.47† (row 524).

Both files ship with their weights exactly as frozen. Neither has been re-trained or ablated inside the
envelope; every measured effect above is †.

## 5.7 Cost per decision

| Composition | CPU-s per decision (single-threaded, whole games) | Env. | Key |
|---|---|---|---|
| R1 + ML | 23.77 | v2 | row 585 |
| R1 | 23.53; 21.94 | v2 | rows 585, 571 |
| R1 | 23.95 | v1 | row 563 |
| B + NGO at 0.10x | 19.22 | † | row 543 |
| VS-2 arm; the same without VS-2 | 22.04; 22.16 | † | row 524 |
| v4; v3 | 51.49; 24.03 | † | row 450 |

F3-PRUNED alone cost 47.11† CPU-seconds wherever it ran (row 450), VS-2 adds 2.391† at each 14th-ball
decision (row 524), and C2 about 34 ms† per search (exploratory; row 242). A whole in-envelope game
of R1 + ML, about 155 balls on average, costs about one CPU-hour [v2] (row 585: 61.685 CPU-hours over
60 games).
