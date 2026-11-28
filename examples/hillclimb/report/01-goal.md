# 1. Goal and status

## 1.1 The north star: general play

The project's ultimate goal is a general billiards agent that plays at a superhuman level under
any rules, on any table, with any equipment and in any conditions, shown by a suite of evaluations in
the manner of language-model benchmarks: rules (14.1, 8-ball, 9-ball, 10-ball, snooker, drills), table
and equipment, conditions (the execution-noise ladder), robustness to a shift in physics, and compute
per decision (internal decision record of 2026-09-24). The same record makes generality a design
rule: no 14.1-only component enters the agent of record without a stated path to other games and
tables.

14.1 is the entry point, chosen because its score is easy to measure. This report measures one axis
in depth (14.1 run length across noise levels), a second only as a report-only drill benchmark, where
the planner cleared 403† of 900 drill attempts after one repair build for its two adapter defects
(internal research log, rows 528, 535), and none of the others (section 10).

## 1.2 Why 14.1 run length

The 9-ball phases scored win and clearance rates. At affordable sample sizes such binary exams could
not resolve a small edge: on 80 racks every clean count from 6 to 17 read as parity or mixed
(rows 79, 81-84), so exam after exam returned no answer, and the log's list of designs not to repeat
now requires an instrument to show it can tell agents apart before a difference is charged to them
(rows 77-79, 89, 93, 94).

A 14.1 run goes on until the first miss, foul or give-up, so every shot counts and a small change in
the per-shot failure rate becomes a large change in the measure. Under a constant per-shot failure
probability p the expected run length is (1 − p)/p: halving the failure rate roughly doubles E[L], and
E[L] = 200 needs a failure rate below about 0.005 per shot (row 287). The first 14.1 instrument
resolved at once differences that the binary exams had read as ties (rows 82, 84). The rules stay out
of the way: any object ball may be struck first, every shot names a ball and a pocket, and play
continues through re-racks, so the score measures shot making and position play (section 2.2).

## 1.3 The hard target

The project lead set the target in August 2026: **E[L] about 200 with P(L ≥ 45) ≥ 0.80 at noise
0.1x**; the 0.1x unit of record was kept on 2026-09-13 (internal research plan,
lines 4, 5, 28). The
second clause asks that four runs in five reach 45 balls, a little over three racks, which makes the
target a statement about typical runs as well as about a mean that a heavy tail of long runs could
carry alone.

A claim that an agent meets the target is tested by a certificate, a registered sequential test on
fresh games (section 3.6, appendix C). From the 0.08x rung on, certificates used the CMC form of the
estimators with a 10 % margin, so the deciding bars became 2,000/9, about 222.2 balls, and 0.8^0.9,
about 0.818, with the plain point estimate still required to reach 200 (rows 510, 526, 543). σ\*200, the
largest noise level at which the agent holds the target with plausible play, summarises strength
across noise levels; the 0.1x unit is one rung of that ladder (internal research plan, line 75).

## 1.4 Why the target is open

**In the envelope, the target is not met** (Table 0.1). R1, B + NGO made to obey the actuation
envelope, stopped at its first look under envelopes v1 and v2 with an upper bound under 222.2
(rows 563, 571). Under envelope v3, R1 + ML reached 193.00 [v3] against R1's 138.50 [v3] on the same
games, about 87 % of the bar, labelled nominal-leave and not adopted (row 598); under v2, on other
games, it read 178.36 [v2] against 148.59 [v2] (row 585). No in-envelope certificate exists at any
noise level (rows 562, 585).

**How it came to be open.** On 24 October B + NGO was certified at 0.10x in the CMC form, E[L]
263.80† and P(L ≥ 45) 0.859† (row 543), and the project lead declared the target achieved (row
545). A census of the certified games then found commanded speeds above 12 m/s on 1.93 %† of
strokes and cue elevations below the cue-clearance floor on 91.7 %† (rows 546, 556). Re-planned with
the floor enforced, the summed miss hazard rose by 108.8 %† of its certified total, where a rise of 18.71 %
would already have taken the certified level below 222.2 (row 559). On 26 October the project lead
re-opened the target as not met in-envelope; the certificate and the declaration stay on the record
as filed, and every report puts the in-envelope readings first (internal decision log, line 624).
Closing the target needs an agent that obeys the envelope on every commanded stroke and passes a
registered certificate at 0.1x (decision log, line 624). Section 7 tells the whole story.
