# Appendix C. The certificate and CMC method

This appendix gives the method behind the certificates of section 3.6 and the CMC estimator of section
3.3 in enough detail to rebuild them. Keys and markers are as in section 0.

## C.1 What a certificate claims

A certificate is a registered claim, with error control, that one composition at one noise level holds
the hard target, E[L] ≥ 200 and P(L ≥ 45) ≥ 0.80 with plausible play, on games never used before. It
certifies the rung, not a difference between compositions: at 0.02x the design would have certified
14.4 % of the time by 80 games even if the added layer had brought no tail gain over its base, so the
certificate (exploratory) says nothing about that layer's edge (internal research log, row 388).

## C.2 Estimators and intervals

The estimators are those of sections 3.2 to 3.4, with a cap of 1,000 balls or 1,100 decisions. The E[L]
interval is a per-game percentile bootstrap with twenty thousand resamples; the bootstrap standard
deviation is the relative standard error (four places) times the point (three places), and a log-scale
bound is printed beside (row 388). P45_CMC takes a by-game bootstrap of ten thousand resamples
(internal method note, CMC margin page); the plain tail takes a Wilson 95 % interval.

## C.3 The group-sequential design

Stages of 40, 80 and 160 games carry one-sided O'Brien-Fleming bounds z = 4.333, 2.963 and 1.968
(cumulative alpha 7e-06, 0.001525 and 0.025) (row 388); every certificate on file ended at stage 2
(Table 6.2). All four clauses must hold at the deciding look:

| Clause | Plain form | CMC form, 10 % margin |
|---|---|---|
| Bound | point − z × bootstrap SD ≥ 200 | E[L]_CMC − z × its bootstrap SD ≥ 222.2, and the plain point ≥ 200 |
| Interval | lower end of the bootstrap 95 % interval ≥ 200 | lower end of the bootstrap 95 % interval of E[L]_CMC ≥ 222.2 |
| Tail | Wilson 95 % lower end of P(L ≥ 45) ≥ 0.80 | lower end of the 95 % interval of P45_CMC ≥ 0.818 |
| Plausible play | the shot audit of section 3.6 | the same |

The CMC column was fixed when the validation read AGREE (row 510).

**Stratified form.** From the 0.07x rung the tail clause used extra games stopped at 45 balls (50
decisions). Stage 1 held 40 full and 220 tail games, stage 2 another 40 full games; the E[L] clauses
used the pooled full games, the tail clause all games. At 0.07x it needed 254 of 300 games at 45, the
smallest count whose Wilson lower end clears 0.80 (row 511). At 0.10x the full stages held 120 games
each, and the clause needed 385 of 460 (row 543).

**Stage 1.** Early designs could certify at stage 1 on the stricter bound (row 324). From the 0.03x
rung, stage 1 only continued or stopped: it stopped for futility if the tail could no longer reach its
bar, the point was under 200 (CMC form: 222.2, row 510), the confirmation power fell under 0.25, or the
shot audit failed. Otherwise stage 2 ran, and stage 1's interval and bound stayed sealed until the
pooled read (rows 474, 477, 521).

## C.4 The power oracle

Each design was priced before registration by an oracle that simulates the certificate under a
constant-hazard model of the agent. In its later form it simulated ten thousand certificates per
candidate rung under a rack law: a per-decision failure hazard q on ordinary shots and h at the break
shot give E[L] = 14 / (1 − (1 − q)^14 (1 − h)), with the chance of an early death tied to E[L] by a
fixed rule. A design registers only if its pass probability is at least 0.5 and its confirmation power
at least 0.25 (internal method note, the rung rule, section 1). The gate refused a 0.02x design at 0.33
(row 380) and stopped a 0.03x certificate after its first look at a confirmation power of 0.21 (row
438). Forecasts were checked against outcomes: at 0.02x the oracle forecast 300.2 and the certificate
read 325.7† (exploratory; row 388).

## C.5 The CMC share and the forced continuation

- **Share.** At each logged decision the stroke actually played is struck 128 more times at the game's
  noise level, from a seed family reserved for shares and never from the game's own stream; h is the
  share of strikes that are not a legal pot of the call. A kernel fault counts as a miss and a give-up
  is h = 1 (internal method note, CMC validation design, section 3).
- **Forced continuation.** For P45_CMC only, a game that died before decision 45 is carried on: the
  first legal pot among 64 further strikes of the fatal stroke carries the path, then the agent's own
  play decides each later decision up to 44, each with its own share. A game with no legal pot among
  the 64 contributes zero and is counted (same note).
- **Instrument checks.** Before any share, each game is replayed physics-only from its record and must
  reproduce every logged outcome. A read gives no word if too few games are exact, too many
  continuations fail, or kernel faults exceed 0.5 % of share draws (row 510). Every CMC certificate
  passed; at 0.10x, 460 of 460 games were exact with no fault in more than ten million share draws (row
  543).

## C.6 The margin

The validation's registered power was 0.95 with no bias but only 0.80 to 0.81 at a 10 % hazard bias
either way, and a hazard bias b moves the expected product to P45^(1 + b) (internal method note, CMC
validation design, section 6). Taking a 10 % bias against the agent gives the bars of C.3: shares 10 %
low lift E[L]_CMC by 1/0.9 and P45_CMC to its power 0.9 (rows 510, 543). A dated decision could raise
the margin before a certificate registered, never lower it (internal method note, CMC margin page).

## C.7 Whole-game reads in the envelope

These reads asked whether a falsifier could stop the claim that the agent meets the target.

- **Falsification looks** (rows 563, 571). Planned for 120 games, with looks at 12, 30 and 60 complete
  games and the overall error of 0.025 split by the union bound into a = 0.005 per test. FALSIFIED if
  the upper bound of E[L]_CMC at level 1 − a, from a whole-game bootstrap of ten thousand resamples read
  at an exact position, is under 2,000/9, compared in exact rational arithmetic. Both reads stopped at
  the first look.
- **Paired gain** (row 585). Sixty pairs, one look at 30. FALSIFIED if the upper end of the 95 %
  interval of the paired difference is under zero, IN-ENVELOPE-GAIN if its lower bound at the one-sided
  level a_2 = 0.0245 is above zero, OPEN otherwise. The read gave IN-ENVELOPE-GAIN.

## C.8 Worked example: the 0.10x certificate (row 543), out of envelope

Every measured number in this example is †.

- **Object.** B + NGO at 0.10x in the CMC form with a 10 % margin; 120 + 120 full games and 220 tail
  games, all fresh.
- **E[L].** The exposure of the 240 full games over their summed share, 259.945, gives E[L]_CMC =
  263.802, with bootstrap interval [251.362, 276.296]. The relative standard error 0.024 gives an SD of
  6.331, so the bound is 263.802 − 2.963 × 6.331 = 245.043, clearing 222.222 by 22.821; the interval
  clears it too.
- **Floor and tail.** The plain point is 288.126 (238 deaths, 2 games at the cap), above 200. P45_CMC =
  0.859102 over 460 games, interval [0.845779, 0.871796], the lower end above 0.818052.
- **Plausible play.** Passed.
- **Beside.** The plain form also certified: 288.126 [257.315, 319.466], bound 241.001, tail 387 of 460.
  Stage 1's sealed CMC bound at z = 4.333 had been 222.077, just under the bar, so the stage-1 word was
  STAGE-2 (row 541); stage 2 would have run either way.
- **Cost and check.** 432.33 CPU-hours (367.34 for the full games at 19.22 CPU-seconds per decision,
  64.99 for the tail games); an independent verifier matched all 336 result fields.
- **Word.** CERTIFIED (CMC form, 10 % margin). The census of rows 546, 556 and 559 later placed the
  result outside the actuation envelope; it stays on the record as filed, with that marker.
