# 9. Lessons that transfer

These are the lessons we would pass on to anyone climbing a target in a simulator, each with the
evidence that taught it (full tables in sections 6 to 8). Keys and markers are as in section 0.

**1. Enforce the actuation envelope where the counted action is produced, from the first stroke.** The
rule that the agent's edge must come from decisions, never from actuation outside the registered envelope,
was written on 27 July (internal research log, row 39), in a module the counted 14.1 path never called (row
546). Three months later the certified agent was found above 12 m/s on 1.93 %† of strokes and below the
cue-clearance floor on 91.7 %† (rows 546, 556); held to the envelope it read 128.73 [v1] where its
certificate had read 263.8† (rows 563, 543). *Do:* guard the one function that sends a stroke to the
simulator, refuse rather than clip, and census commanded actions in every run.

**2. Screens over-predict whole-game transfer.** F3-PRUNED read +69.45† [+11.43, +129.75] in its
40-pair screen and +39.70† [+22.79, +57.75] in its 300-pair block (rows 416, 450); a learned pre-ranker
read +2.78† in a screen and −1.35† in its registered test (row 224); a break-ball lever whose screen
pointed to runs about 1.4 times longer read −7.83 [v2] in whole games (rows 568, 574); and the give-up
fix realised a ratio of 1.20 [v2] against the 1.67 its screen implied (row 585). *Do:* size
confirmations for a fraction of the predicted effect (we planned on 0.4 of the predicted one-step gain;
internal decision log, line 46), and write the transfer prediction down before the whole-game read
(row 574).

**3. Score a position where the noisy stroke leaves the ball, not where a perfect stroke would.**
Re-planned at the leaves the arm's noisy strokes actually reached, the break-ball screen's hazard cut
fell from 59.3 % to 7.8 % [v2], consistent with the whole games, while the same screen on positions from
compliant games still read 54.8 % [v2], so the positions were not the cause (row 577). *Do:* value
positional terms as an expectation over the leaves your execution noise produces.

**4. Pair everything by common random numbers; never compare across blocks.** When arms share racks and
per-decision noise, luck cancels: in the give-up fix's 60-game read the arms played identical games in
the 49 where the fix never fired (row 585). Unpaired levels move with the block: one substrate read
19.9† on one block and 16.5† on another, a gap the record puts down to block difficulty (rows 186, 205).
*Do:* derive every draw from (game seed, decision index), compare only within a paired block, and use
fresh seeds for each confirmation.

**5. Price each lever on its own block; never add deltas or pool compositions.** The links of the 0.1x
chain, +20.79†, +22.05†, +21.53† and +39.70†, were measured against different bases, each on its own
block (rows 317, 344, 408, 450). They do not sum; the level of record is the adopting block's own reading
(row 451), and different compositions or envelope versions stand side by side, never pooled (row 571).

**6. Match compute, or the gain may be the compute.** Widening the shortlist looked like a gain, +0.63†,
until a screen with the planner's compute held fixed showed that breadth alone hurt, −1.85† [−3.44,
−0.26] (an unregistered fast-track screen; row 175). A forced-shot search's +15.1† at 2.085 times the
compute became +2.86† at matched
compute (an unregistered fast-track screen; rows 205, 208), and a deeper trigger search's +3.63† at
1.198 times the compute reversed to −0.11† (an unregistered fast-track screen; rows 212, 215). *Do:*
count compute on one counter, match it, or declare a reversal control at matched compute before
adopting.

**7. Re-score the winner on fresh draws.** Re-measured on held-out draws, only 54.1 %† of the gain the
refinement executor had quoted on its own selection draws survived (row 90); F3-PRUNED therefore
re-counts its eight best candidates on seven further blocks of draws before it chooses (row 416). *Do:*
separate the draws that select from the draws that value.

**8. Register before you measure, read once, recount independently.** A read that runs once and refuses
a second call removes the temptation to look again (rows 563, 585), and a recount from the registered
text catches what the author misses (row 450); the same checks once found a sealed held-out drill cell
that played bit for bit like a bench cell (row 578). *Do:* commit the page with an empty results field,
allow only registered looks, and check that held-out sets really are held out.

**9. Measure the goal on a continuous scale.** In 9-ball the training target correlated +0.028† with
winning (row 14), and a gate on balls potted rewarded grinding (registration order not on record;
row 11). Binary rack-clearing exams at
80 to 100 racks could not resolve small edges; run length in 14.1 resolved them at once (rows 79, 81-84).
*Do:* use a metric that is the goal itself and amplifies small per-shot differences; report binary
outcomes beside it, never as the gate.

**10. Learn inside search, on data you generate; let the simulator decide.** One expert-iteration
generation gave the only training-driven promotion (row 25). C2, a learned pre-filter whose chosen
stroke is always simulated, showed a resolved gain at 0.1x only together with BREAK-F, +12.52† (rows
242, 252); V, a learned leaf value
used in the 2-ply, kept about 70 %† of the exact 2-ply's gain at no leaf-simulation cost (row 500), and
the 2-ply built on it read ADOPT at +58.47† (row 524). A learned value used directly to choose strokes
lost in play, −31.0† (exploratory; row 302). Both shipped files were fitted only on data our agents
generated in the simulator (internal screening log,
line 143; row 488); those data stay private, so the files cannot be reproduced from the release
(appendix F). *Do:* use learning to order and to value, and judge a learned part only by paired play.

**11. Validate a variance-reduced estimator before you depend on it, and keep a margin for its bias.**
The CMC estimator agreed with the plain one on 640 frozen games before any certificate used it; because
that check could not exclude a 10 % hazard bias, certificates carried a 10 % margin, with bars of 222.2
and 0.818 in place of 200 and 0.80 (row 510).

**12. Verify the teacher at play before training a student.** Phase 3 checked that its expert beat the
deployed agent in play at all four test points (row 24), and the generation trained on it was promoted
(row 25). The next generation, on a teacher of equal strength, did not improve (row 27), and a deeper
teacher failed its play check before any training was spent on it (row 29).

**13. Removing a cause of death moves the deaths.** The coverage stack closed the no-declarable-pot
class, 26† deaths to 0, while deaths at the break's chosen stroke rose from 0 to 26† and in-rack deaths
from 31 to 47† (row 317). *Do:* re-run the death census after every adoption and take the next lever
from it.

**14. Make frames, versions and states explicit; refuse, never clamp.** A leave-surface term read
positions in the kernel's frame against grids drawn in the scene's frame, and a clamp onto edge cells
hid the error until a blind audit found it (row 87). After a stray environment answered with an
off-version kernel, every measuring entry asserted the version (row 78). Positions logged to 1e-6 m
failed to reproduce 32 of 488 recorded makes† (decision log, line 483). *Do:* tag frames, assert
versions at every measuring entry, and log exact states.

**15. Keep the process proportionate.** Checks that breed checks, and exams sunk by their own
record-keeping, cost weeks of measurement (section 4.6); the remedy was to cap review rounds, fix only
findings that could corrupt an honest run, and withdraw a claim rather than build another checker (row
129; internal research log, Phase 4 narrative of 2026-07-29). Kill rules written in advance closed
dead lines at a known price (rows 21, 30; for row 21, registration order not on record), and one cheap
external review changed four headlines (row 86).
