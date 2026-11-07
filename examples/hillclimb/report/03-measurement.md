# 3. Measurement

## 3.1 The estimand

L is the number of called balls a run pockets before it ends (section 2.2). E[L] is its expectation for
one agent, at one noise level, from the opening of section 2.2. A give-up counts as a death, like a
miss or a foul; a game stopped by the cap is right-censored. P(L ≥ 45) is the probability that a run
reaches 45 balls. Both belong to an agent and a noise level together, and a number never transfers to
another composition, noise level or envelope version.

## 3.2 Capped estimators

- **Censored mean**, E[min(L, cap)], the first form, at a cap of 400 balls. It understates the level
  once games reach the cap: at 0.005x, 16† of 40 games of one block would have been censored at 400
  (internal research log, row 324), and one block's censored mean of 264.4† sat beside a capped MLE of
  406.8† on the same games (rows 319, 323).
- **Capped constant-hazard MLE.** From 2026-09-18 the level was exposure over deaths: the total of L
  over all games divided by the number of games that ended in a death, a capped game adding its balls
  but no death (rows 321, 323). Under a constant per-shot failure probability this is the
  maximum-likelihood estimate of the mean run length, and it handles the cap without bias. The cap rose
  to 1,000 balls, censored means were printed beside (rows 324, 337), and intervals came from a
  per-game percentile bootstrap (row 388).

The constant hazard is a working model, not a description of 14.1: in the certified 0.10x games break
shots were 7.0 %† of strokes but carried 54.4 %† of the summed miss hazard (row 546). The estimate
stays a ratio of totals, and the bootstrap over whole games carries the extra spread. We call this
estimate the plain (indicator) form, as against the CMC form below.

## 3.3 The CMC form and its validation

**The form.** Conditional Monte Carlo (CMC) replaces each 0/1 death by its expectation given the state
and the stroke played. Every logged stroke is struck 128 more times under fresh noise at the game's
level, on seeds of its own, and its miss share h stands in for the death; a give-up counts as h = 1.
Then E[L]_CMC = sum of L / sum of h = 128 × sum of L / sum of misses (rows 563, 585). The probability
form, P45_CMC, is the mean over games of the product of (1 − h) over the first 45 decisions, with games
that died early carried on to 45 (appendix C.5). The games themselves are unchanged, and their plain
estimates are printed beside. The repository's run-length-estimator example implements the estimator
in exact arithmetic.

**Gain.** The design note estimated 4.4 to 5.4 times less variance per game for about 10 % more
compute (internal method note on the CMC design, section 4). On the same games at 0.10x the CMC
interval was [251.362, 276.296]† against [257.315, 319.466]† for the plain form (row 543).

**Validation.** Before any certificate used it, the form was validated in a read registered before any
miss share existed (row 510). It took 640 logged games from eight closed experiments, all already
counted by previous reads (590 independent openings). The word was AGREE if the 95 % interval of the
mean of 1[L ≥ 45] minus the CMC product contained zero. The mean indicator was 0.854688† and the mean
product 0.845185†; the difference, 0.009502†, had interval [−0.015193, 0.033414]†: AGREE. All 640
games replayed exactly, and the 93† deaths before 45 balls matched the 100.02† the shares predicted
(z = −0.79†); an independent verifier recounted every field equal (row 510).

**The margin.** AGREE at 640 games cannot exclude a 10 % hazard bias either way, about 0.013 in
P(L ≥ 45) (row 510). The form was adopted with that bias taken against the agent: a CMC-form
certificate needs E[L]_CMC ≥ 2,000/9, about 222.2, P45_CMC ≥ 0.8^0.9, about 0.818, and the plain point
≥ 200 as well (rows 510, 526; appendix C.6). The read validated the probability form over decisions 0
to 44 only; on its games the E[L] forms read 291.36† (plain) and 265.54† (CMC) beside the word (row
510). A CMC-form word is labelled so, with the plain form printed beside it; at 0.09x the plain form
alone would not have certified (row 539).

## 3.4 P(L ≥ 45)

In the plain form, P(L ≥ 45) is the share of games reaching 45 balls with a Wilson 95 % interval, and
a certificate needs the Wilson lower end at 0.80 or above, for example 72 of 80 games (exploratory;
rows 370, 388).
From the 0.07x rung, certificates added tail games stopped at 45 balls, which serve only this clause
and cost a fraction of a full game: 220 tail games beside 80 full games at 0.07x (row 511), beside 240
at 0.10x (row 543). In the CMC form the clause is the lower end of the 95 % interval of P45_CMC at
0.818 or above (row 543).

## 3.5 Paired comparisons with common random numbers

Inside one decision, every candidate is simulated on the same block of noise draws, so candidates are
ranked on quality rather than lucky draws (section 5). Between arms, both play the same games: the
same racks and, at each decision, the same noise for the executed stroke. The games stay identical
until the arms first choose differently; a receipt checks that, and a breach voids the pair (row 585).
The difference is read per pair with a whole-pair bootstrap (row 450), and every comparison reports
its compute in strokes, kernel calls and CPU seconds (internal research plan, line 11).

A step's gain is priced on its own block and never summed with other steps' gains (internal research
plan, line 6). Compositions are never pooled, paired or relabelled (internal noise-ladder record,
2026-09-29). Readings of one agent on different games are reported side by side, never as a
difference: the 128.73 [v1] and the 150.01 [v2] of R1 share no game (row 571).

## 3.6 Group-sequential certificates and σ\*200

σ\*200 is the largest noise level at which the agent holds E[L] ≥ 200 with P(L ≥ 45) ≥ 0.80 and
plausible play, the 0.1x unit being one rung (internal research plan, line 75). Each rung needs a
certificate on games never used before: a group-sequential test with one-sided O'Brien-Fleming bounds
of z = 4.333, 2.963 and 1.968 at 40, 80 and 160 games (row 388). Every certificate on file ended at its
second look. At the deciding look it needs four clauses (appendix C.3): the point minus z times the
bootstrap standard deviation, and the lower end of the bootstrap 95 % interval, both at 200 or more
(222.2 in the CMC form, with the plain point still at 200 or more; rows 510, 543); the tail clause of
section 3.4; and plausible play, an audit of the chosen shots (the shares of implausible shots, of jump
shots, and of banks or kicks chosen when no direct pot was live, each against a fixed bar). The audit's
reference was fitted on data we cannot redistribute, so its bars and measured shares are not printed;
every certificate on file passed it.

Early designs could certify at the first look on the stricter bound; none did (row 324). From the
0.03x rung, the first look could only continue or stop for futility, its numbers sealed until the
pooled read (rows 474, 477). Before registering, a design had to show a simulated pass probability of
at least 0.5 and a confirmation power of at least 0.25; a 0.02x design that read 0.33 was refused
before any game (row 380). Appendix C gives the details and a worked example.

## 3.7 Read once, recount, void rules

- **Registration first.** Hypothesis, arms, sample size, estimator, decision words and stopping rules
  were filed before the first game, with an empty results field filled exactly once; a change is a new
  registration (internal research plan, line 11; internal registration of the 14.1 instrument).
- **Read once.** Each read runs once, in its own process, writes its results once and refuses a second
  call; no statistic of a running experiment is printed before its read, and every read prints its
  power at the realised sample size before its word (rows 563, 585).
- **Recount.** An independent verifier recounts every read with its own code, importing nothing from
  the experiment, and the later reads were filed only when the recount was equal: 336 of 336 fields at
  row 543, 128 of 128 checks at row 585. Some September reads were filed with the verifier pending;
  the verifier of the 0.02x certificate (exploratory) matched 92 of 92 fields the same day
  (rows 387, 388).
- **Void rules.** Rules that void a game (a wrong build, a broken pairing receipt) are registered with
  the experiment; voided games are replaced from registered spares and counted in the open, and a read
  says so when such a rule decided whether a word existed at all (row 511).
- **Looks in the envelope.** The in-envelope whole-game reads looked at 12, 30 and 60 complete games,
  with the error rate split by the union bound, and stopped as soon as the upper bound fell under the
  bar (rows 563, 571; appendix C.7).
