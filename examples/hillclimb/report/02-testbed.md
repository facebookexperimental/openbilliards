# 2. Testbed

## 2.1 The kernel and its build

Every stroke in this report, played or imagined, was simulated by the openbilliards physics kernel
through its Python binding. The kernel is event-driven and analytic: ball motion is closed-form between
events, event times are polynomial roots of degree at most four, and it models three cloth friction
regimes, velocity-dependent throw, squirt and a parameterised cushion impulse (public kernel
documentation). No learned model stands in for the kernel, and for 14.1 the research harness judged
legality from the kernel's own event record and added no physics (internal registration of the 14.1
instrument).

- **Build of record.** One kernel build, version 0.1.0+64e9e7a3 (July 2026), installed on 2026-07-23
  and never replaced. Each measuring entry of the 14.1 game asserted the version and the wheel checksum
  before any stroke and refused on a mismatch (internal registration of the 14.1 instrument; internal
  research log, rows 27, 376, 463; internal decision log, line 483). The late reads (rows 543, 563, 571, 585
  and 598) print no version; their build follows from that check and is UNVERIFIED as a per-run stamp.
- **Pinned physics.** Frozen clusters at a break use the compliant chain model (time step 1e-6 s, at
  most 3,000 steps, Hertz stiffness 3.524e8) and the rail contact the legacy planar convention, set
  explicitly rather than left to defaults (internal research code, kernel pin module).
- **Interpreter and determinism.** CPython 3.12; when the interpreter binary was replaced on
  2026-10-27, 85 recorded units re-run on the new binary read IDENTICAL before any run moved
  (row 566), and 3.12.16 followed on 2026-10-29 (row 585). Stored games re-run through the whole
  planner match their records (row 376), and the parallel runner is byte-identical at any worker count
  (row 9).
- **The public kernel differs.** The physics core has changed since, including how balls come to
  rest, and kernel numerics may change again, so recorded numbers are not
  expected to reproduce bit for bit on the public kernel (section 10).

## 2.2 The 14.1 rules subset

The game is a solo high-run attempt under a machine-checkable subset of the WPA (World Pool-Billiard
Association) rules (internal registration of the 14.1 instrument; rows 81, 82):

- **Start.** A seeded 15-ball rack is spread by a fixed opening break that counts nothing; balls it
  pockets are spotted back, and the agent takes the cue ball in hand anywhere. Counting starts at zero.
- **Calls and scoring.** Before every shot the agent names a ball and a pocket. A foul-free shot that
  drops the called ball in the called pocket scores one. Other balls pocketed on it are spotted back and
  score nothing, a stated deviation so that the count measures called shots, not pocket luck.
- **Fouls.** Cue ball pocketed or off the table, no ball struck, no ball pocketed and none driven to a
  rail after contact, an object ball off the table. Any object ball may be struck first. A foul ends
  the run; fouls that need a referee's judgement are out of scope.
- **End of run.** The first of: no auditable call (a generator fault), no declarable pot (a give-up),
  a foul, a wrong ball (balls dropped, but not the called ball in the called pocket), a miss. L counts
  the called balls legally pocketed.
- **Re-rack.** With 14 balls of a rack down and one left, the 14 are re-racked with the apex spot
  empty; the remaining ball and the cue ball stay unless they interfere with the rack, in which case
  WPA rule 7.8 relocates them. The first shot after a re-rack is the 14.1 break shot (row 546); the
  shot on the 14th ball of a rack sets the cue ball up for it (decision log, line 475).
- **Caps.** A game reaching the cap stops outside the death count: 1,000 balls or 1,100 decisions in
  certificates and whole-game reads (rows 337, 585), 45 balls in tail-only games (row 511).

All games used the kernel's standard 9-foot table (2.54 m by 1.27 m playing surface; kernel source
and internal research code) and one reference ball and cushion parameter set (internal decision
record of 2026-09-24); the hand-ladder games drew hidden per-game physics around it (section 2.4).

## 2.3 Execution noise: icga-v1 and the 0.1x unit

The noise model, icga-v1, is the convention of the computer-pool tournaments of the ICGA Computer
Olympiad (Archibald et al., 2010; its values are printed in Landry and Dussault, 2007). Each commanded
stroke (speed v0, aim phi, elevation theta, tip offsets a and b) receives independent zero-mean
Gaussian errors with standard deviations, at level r, of 0.075 r m/s, 0.125 r degrees, 0.1 r degrees
and 0.0005 r on each tip offset. The kernel reads tip offsets in ball radii, so the tip term in effect
is about one thirty-fifth of the 0.5 mm the convention prints; we report it as it acted (internal
research code, noise module; the repository's hand-noise-law example documents the same point). The
draws come from a counter-based SplitMix64 stream keyed by the episode seed and the decision index, so
any game replays exactly. Noise after the command is legal human error, even when it carries the
executed stroke outside the actuation envelope (internal registration of envelope v1).

The unit of record is 0.1x, kept on 2026-09-13; exploratory work could run at 0.02x if every result
was also reported at 0.1x (internal research plan, lines 5, 28). The 0.1x unit is a
machine-precision setting; how far it sits from a professional's hand is open (section 10.6). Section
3.6 and appendix D cover the noise ladder.

## 2.4 The human-hand ladder

After the envelope finding the project lead chose a solo run at a human-level hand as the successor
headline, with the level open (row 550), and kept a five-tier ladder with no tier named human (decision log,
line 551). The hand (hand v1, all channels on) keeps the convention's aim and elevation terms at level r and
adds a 0.6 mm tip spread at every level (a prior from published variability of professional players), a
speed spread that grows with the commanded speed, and one hidden draw of table physics per game that
the executed strokes see and the planner does not (internal research code, hand law). The research
hand's speed coefficient is a private research fit that does not ship, while
the public hand-noise-law example defaults to 4.5 %, a prior compiled from published figures, so public
runs do not reproduce the recorded hand.

The tiers at 0.25x and 0.40x were set from published snooker statistics; the three upper tiers were
fitted on data we cannot redistribute and are neither named nor printed. Hand-ladder results are
printed only at the two public tiers, 0.25x and 0.40x (appendix D.1). A climb step must raise E[L] at
the registered primary tier (one of the upper three), keep the 0.40x check positive, and not raise the
share of fancy shots, strokes whose make chance under the arm's own hand is below one half (row 562).
The arms MM and M are defined in section 0; the result is in Table 0.1 and appendix D.1.

## 2.5 The actuation envelope, v1 and v2

In July 2026 a break optimisation found its best stroke at 13.0 m/s, above the game's own 12 m/s power
cap on v0. The project lead set the rule that the agent's edge must come from its decisions, never from
strokes a human cannot produce (row 39). That is the rule's aim; the registered speed caps bound the cue
speed v0 and allow cue-ball speeds above the break-speed FAQ's range (end of this section).
**Envelope v1** (registered 2026-07-27) bounds each
commanded stroke (internal registration of envelope v1; row 39):

- commanded cue speed v0 from 0.5 to 12.0 m/s, the game's own cap, set from published professional
  break speeds (cue-ball speeds, see below); the one channel that bound when v1 was registered;
- elevation from the cue-clearance floor plus 0.5 degree up to 89 degrees; aim free;
- tip offset within half a ball radius; ball-in-hand placement inside the granted zone.

The cue-clearance floor is the least elevation at which a straight 1.477 m cue clears the cushion top,
the rail top and every other ball by 2 mm (row 556). A stroke under it is raised to the floor plus the
margin (validate-then-reseed) rather than discarded, because discarding left 52.3 %† of decisions
without a candidate (row 26). Enforcement belongs on the agent's side, where candidates are generated,
with a guard that refuses an out-of-box command before the kernel rather than clipping it; the kernel
stays permissive so old games replay. Numbers measured before enforcement are marked, published beside
the compliant ones and never used to argue for adoption (row 39).

**The gap.** In the 14.1 counted path neither channel was enforced: speeds were clipped only at the
kernel's 15 m/s (row 546), and the floor was never checked (row 556). Every 14.1 number before the
in-envelope restart other than the hand-ladder read (row 562) therefore carries † (section 7). The
in-envelope agent R1 enforces both, with the E12 speed rule and validate-then-reseed (section 5.5).

**Envelope v2** (registered 2026-10-26) raises the cap on the commanded cue speed v0 to 13.4 m/s at a
break shot, a figure v1 had recorded as an open question; everything else is as in v1 (decision log,
lines 624, 629). v1 results keep their words, and comparisons across versions are report-only
(line 629).

The 13.4 m/s figure is about 30 mph (13.41 m/s) rounded down, the top of the 25-30 mph range of
cue-ball speeds that D. G. Alciatore's break-speed FAQ gives for typical top professional breaks
(https://drdavepoolinfo.com/faq/break/speed/). Both caps bound the cue speed v0, not the cue ball's
speed: on the public kernel, with its default strike options and a centre hit, the cue ball leaves the
tip at about 1.54 times v0, so a break at v2's cap sends it off at about 46 mph and a stroke at v1's
12 m/s cap at about 41 mph, above the FAQ's range (decision log, line 902).
