# 0. Abstract and reading guide

## Abstract

From July to October 2026 we worked to make a billiards agent as strong as possible inside the
openbilliards physics kernel, an event-driven analytic simulator. Most of the work used straight pool
(14.1) as solo runs: the agent calls a ball and a pocket before every shot, the kernel plays the
commanded stroke with seeded execution noise, and the run ends at the first miss, foul or give-up. The
measure is the expected run length E[L] in balls at one tenth of a published computer-pool noise
convention, written 0.1x. The project's hard target is E[L] about 200 with
at least 80 % of runs reaching 45 balls, P(L ≥ 45) ≥ 0.80, at 0.1x (internal research plan, line 4).

Learning without search failed first, in 9-ball, where widening the set of candidates that the
simulator checked beat retraining the network that proposed them (internal research log, rows 3-7,
17). The agent that climbed in 14.1 is a search agent: it lists candidate strokes from the table
geometry, refines each against a hand-built map of good cue-ball positions (the leave surface, also
called the height map), simulates candidates many times under the noise that will execute
them, and adds a rule layer for each way it was seen to lose runs. Two learned parts work inside the
search: C2, a learned pre-filter whose chosen stroke is always simulated, and V, a learned leaf value
used in the 2-ply at the last ball of each rack. Experiments were registered before they ran,
exploratory readings excepted and marked as such; every experiment was read once and logged, negative
results included, and the later reads were filed only after an equal independent recount, while some
September reads were filed with the verifier pending.

At 0.1x the agent of record rose from 30.3† balls (an unregistered fast-track screen; row 217) to
142.5† (row 451) across five adopted compositions, each priced on its own paired block of games.
Sequential certificates raised the
largest noise level at which the agent holds the target from 0.005x† (row 337) to 0.10x† (row 543), and
the project lead declared the target achieved (row 545). A census of the commanded strokes then showed
that these numbers rested on strokes outside the actuation envelope, its bounds on the commanded cue
speed (the game's own power range) and the cue elevation, which the counted 14.1 path had never
enforced (rows 546, 556, 559). The project lead re-opened the target as not met in-envelope
(internal decision log, line 624), and the climb restarted inside the envelope.

**Status.** The hard target is not met in-envelope. The presented result is 193.00 balls [v3] for the
in-envelope agent R1 with a give-up fix (ML), against 138.50 [v3] for R1 on the same games, labelled
nominal-leave and not adopted (row 598): about 87 % of the target's bar of 222.2, still under it.
Envelope v3 caps the cue ball's launch speed at a break at 30 mph (section 7.4). Under the v2 caps, on
other games, the figure stays 178.36 [v2] against 148.59 [v2] (row 585). Every number measured before
the envelope was enforced carries the marker †, the certified 263.8† at 0.10x (row 543) included.

## Key results

Labels (appendix E): **v4** is the fourth coverage-stack composition; its last layer, F3-PRUNED,
re-scores a full grid of candidate strokes by simulation. **B + NGO** adds BREAK-GATE (a gated break
menu), NGO-F3P (the same re-scoring where v4 has no good option: a give-up or a single option), an
exact early exit from the re-scoring, and VS-2, the V-scored 2-ply at the 14th ball of each rack.
**R1** is B + NGO made to obey the envelope. **ML** is a fix for decisions where R1 would give up.
**MM** and **M** are hand-ladder arms: MM plans and plays at the hand, M plans at 0.1x and plays at the
hand (section 2.4).

**Table 0.1. Key results, in-envelope first.** E[L] is in the CMC form of section 3.3, except for the
VS-2 and v4 rows, which use the plain form.

| Agent or comparison | Env. | Noise | n | E[L] [95 % interval] or paired Δ | Word as filed | Key |
|---|---|---|---|---|---|---|
| R1 + ML against R1, same games | v3 | 0.1x | 60 pairs | 193.00 against 138.50; Δ +54.50 [+31.65, +80.12] | IN-ENVELOPE-GAIN; nominal-leave; not adopted | row 598 |
| R1 + ML against R1, same games | v2 | 0.1x | 60 pairs | 178.36 against 148.59; Δ +29.77 [+13.07, +50.92] | IN-ENVELOPE-GAIN; nominal-leave; not adopted | row 585 |
| R1 | v2 | 0.1x | 12 games | 150.01; upper bound 210.46, under 222.2 | FALSIFIED at the first look | row 571 |
| R1 | v1 | 0.1x | 12 games | 128.73; upper bound 181.78, under 222.2 | FALSIFIED at the first look | row 563 |
| Planning at the hand: MM against M | v1 | hand ladder | 115 pairs at the public 0.40x check | Δ +10.02 [+8.28, +11.89]; fancy share Δ −5.53 points [−7.58, −3.66] | IMPROVED + REGULATED; MM longer runs and fewer fancy shots | row 562 |
| B + NGO, certificate | † | 0.10x | 240 full + 220 tail games | 263.80 [251.36, 276.30]; P(L ≥ 45) 0.859 [0.846, 0.872] | CERTIFIED (CMC form, 10 % margin); declared achieved, then re-opened | rows 543, 545; decision log, line 624 |
| VS-2 arm against its base | † | 0.1x | 321 pairs | 241.26 against 182.79; Δ +58.47 [+32.69, +84.77] | ADOPT; no record moved | row 524 |
| v4 | † | 0.1x | 300 pairs | 142.52 [127.68, 158.79]; P(L ≥ 45) 0.727 | ADOPTED as the agent of record | rows 450, 451 |
| Noise ladder | † | 0.005x to 0.10x | nine certificates | Table 6.2 | CERTIFIED at each rung ‡ | rows 337-543 |

‡ Two rungs, 0.01x and 0.02x, are filed as exploratory (Table 6.2; appendix E).

Upper bounds are one-sided at level 0.995 (rows 563, 571). *Nominal-leave:* ML's leave term scores the
position a perfectly executed stroke would leave, which can overstate a gain (row 577). Envelope v1 caps
the commanded cue speed v0 at 12 m/s; v2 raises the cap to 13.4 m/s at a break shot (section 2.5); v3
keeps v2 and caps the cue ball's launch speed at a break shot at 13.4112 m/s, 30 mph (section 7.4). The
hand-ladder row prices what planning for the hand buys this agent, not human play. Its numbers are
printed only at the public tiers 0.25x and 0.40x (appendix D.1); the three upper tiers are neither named
nor printed, because they were fitted on data we cannot redistribute. The research hand's speed term,
which acts at every tier, is a private research fit; it
does not ship (section 2.4).

## Reading guide

- **Structure.** Sections 1-4 set out the goal, testbed, measurement and method; 5 describes the agent;
  6 and 7 tell the climb and the in-envelope restart; 8 to 10 give what worked, the lessons and the
  limits; 11 shows how to climb your own target. Appendices: C certificates and the CMC estimator, D the
  noise and hand ladders, E research labels, F what does not ship.
- **Keys.** Every number carries a key: "(internal research log, row N)", shortened to "(row N)" after
  its first use in a section, or "(internal decision log, line N)", shortened to "(decision log, line
  N)". The records stay private; the map from keys to records is kept for audit (README).
- **Markers.** [v1], [v2] or [v3] names the envelope version of an in-envelope number. † marks a number not
  verified inside the envelope: every 14.1 number before the in-envelope restart (row 563) other than
  the hand-ladder read (row 562), and every 9-ball number. Such numbers stand beside the in-envelope
  ones and never argue for adoption (row 39).
- **Words and notation.** Decision words (CERTIFIED, FALSIFIED, ADOPT and so on) were registered before
  each experiment ran, exploratory readings excepted and marked as such, and are printed as filed; a
  word holds for one composition at one noise level.
  Compositions are never pooled and the gains of successive steps are never summed. Brackets give a 95 %
  interval unless named otherwise; Δ is a paired difference on common random numbers.
- **Build and cut-off.** Kernel build 0.1.0+64e9e7a3 under CPython 3.12 (section 10.3); the public
  kernel differs, so the numbers are not expected to reproduce bit for bit (section 10). The report
  covers the records to 31 October 2026 (research log row 586, decision log line 877, plus the height-map census at line 882, the cue-speed disclosure at line 902, the cap replay with the decision on it at lines 927, 934-935 and the re-measure under envelope v3 at row 598 with lines 1032, 1034).
