# Hand noise law

A seeded stroke-noise law for billiards agents. Each commanded stroke receives zero-mean Gaussian
errors on its five parameters (v0, phi, theta, a, b), drawn from a counter-based SplitMix64 stream
keyed by (episode seed, decision index), so anyone who knows the two keys redraws them exactly.
The errors are zero-mean only before `project_stroke`: clamping the noisy stroke into the
kernel's domain (v0 into [0.001, 15] m/s, theta into [0, pi/2), the tip offset radially inside
0.5 R, within the kernel's default miscue limit) leaves a point mass at the bound and a biased
mean near it. For example, a commanded theta of 0 with r > 0 executes theta = 0 exactly on about
half the draws (a point mass at zero), and its mean is positive. The scale is the execution-noise
convention of the ICGA computational pool tournaments times a level multiplier r. An optional hand
shape refines it: a fixed tip sigma, a speed sigma that grows with the commanded speed, and a
hidden per-game draw of table physics. Standard library only (Python 3.8 or later); no physics
kernel is imported, and the physics layer wraps a kernel module that the caller passes in, such as
the public `pool_py`.

| file | contents |
|---|---|
| `noise_stream.py` | the stream: `noise_seed`, `uniform_block`, `standard_normals`, the companion `shot_seed`, `collision_pairs` |
| `hand_noise_law.py` | the law: sigma maps, `noisy_action`, `noisy_stroke`, `project_stroke`, `make_executor`, `describe`, `physics_draw`, `PhysicsView` |
| `test_noise_stream.py`, `test_hand_noise_law.py` | unittest suites; a stub stands in for the kernel |

## Units, as applied

The stroke uses the units of the kernel's stroke API (`pool_py.Shot`). `a` and `b` are in ball
radii R and command the offset of the cue-tip centre; the kernel maps it to the contact point by
1 / (1 + tip_radius / R) (1 / 1.371 for the default 10.6 mm tip on the 28.575 mm ball), so a
sigma on (a, b) is a spread of the commanded tip-centre offset.

| entry | unit | convention at level r | hand channels |
|---|---|---|---|
| v0 | m/s | r x 0.075 | `speed`: max(r x 0.075, speed_cv x v_cmd), v_cmd = abs(v0) clipped to [0.001, 15] |
| phi | rad | r x 0.125 deg (r x 0.0021817 rad) | unchanged in every shape |
| theta | rad | r x 0.1 deg (r x 0.0017453 rad) | unchanged in every shape |
| a, b | R | r x 0.0005 R (r x 14.2875 um) | `tip`: 0.6 mm = 0.020997 R at every r; `tipspec`: r x 0.5 mm = r x 0.017498 R |

**The tip, plainly.** The convention prints 0.5 mm for a and b. The convention term here applies
the number 0.0005 in the kernel's unit for a and b, the ball radius: 0.0005 R is 14.2875 um on the
28.575 mm ball, about 1/35 of the printed 0.5 mm (the exact ratio is 0.028575, the ball radius in
metres). The `tipspec` channel applies the printed value (r x 0.5 mm, converted to R); the `tip`
channel applies a fixed 0.6 mm. Millimetres convert with the default ball radius (`BALL_RADIUS_M`).

## The stream

`noise_seed(s, i) = mix(s XOR (G2 x (i + 1)))` mod 2^64, with mix the SplitMix64 finalizer,
G = 0x9E3779B97F4A7C15 its increment and G2 = mix(G) | 1 = 0xE220A8397B1DCDAF. Decision i draws six
u64 values from the SplitMix64 generator started at its key (state += G, emit mix(state)), maps
each into (0, 1] by ((u >> 11) + 1) x 2^-53 and turns the three pairs into six standard normals by
Box-Muller: the first five are eps in stroke order, the sixth is discarded. Nothing is stored, so
control flow can never desynchronise a replay. The companion `shot_seed(s, j) = mix(s XOR
(G x (j + 1)))` can seed a simulated shot and never equals a noise key: G2 x (i + 1) = G x (j + 1)
mod 2^64 holds for one j per i, far beyond any episode (`collision_pairs()` finds none below 2^20).

## The law

`noisy_action(action, eps, r, shape)` perturbs a 7-entry action (the stroke and two ball-in-hand
placement entries, which are copied); `noisy_stroke(stroke, eps, r, shape)` perturbs a 5-entry
stroke and returns it unchanged when r == 0, so noise-free previews stay noise-free. With no
action channel both compute `x + r * SIGMA_1X[k] * eps[k]`, operand for operand.
`make_executor(r, shape)` fixes both once and returns `execute(episode_seed, decision_index,
action)`: the stream's eps, `noisy_action`, then `project_stroke`, a total projection into the
kernel's stroke validity (v0 into [0.001, 15] m/s, phi mod 2 pi, theta into [0, pi/2), (a, b)
radially inside 0.5 R, within the kernel's default miscue limit). The projection clamps, so the
executed stroke is not zero-mean near a bound: an entry beyond the bound lands on it, which leaves
a point mass at the bound and a biased mean near it. A commanded theta of 0 with r > 0 executes 0
on every draw at or below 0, about half of them, so its mean is positive; a commanded v0 of 15 m/s
with r > 0 executes 15 on about half the draws, with a mean below 15. Only phi is wrapped rather
than clamped (the same direction). `describe(r, shape)` returns the sigmas as a JSON-ready dict.

Shapes are `off` (the convention alone), `all` (`tip+speed+physics`), or channel names joined by
`+`, with one tip law per hand (`tip` or `tipspec`). The level r scales aim, elevation, the
convention's tip and the speed floor; the `tip` sigma, the speed term and the physics draw do not
depend on r, so in `noisy_action` and the executor a shape at r = 0 is not noise-free. Below the
crossover v* = r x 0.075 / speed_cv the `speed` channel equals the convention bit for bit.

## Hidden table physics (the `physics` channel)

One draw per game, keyed by `physics_key(text)` (sha256 of a tag and the caller's game text): the
cushion restitution e0, the cloth's sliding friction u_s and rolling resistance u_r, and a
multiplier on the ball-ball friction curve (throw). Each is uniform on the widest interval centred
on the kernel default inside its spread (exact Fraction arithmetic): uncertainty without a bias.

| parameter | kernel default | spread | draw |
|---|---|---|---|
| e0, cushion restitution | 0.85 | 0.75 - 0.92 | uniform on [0.78, 0.92] |
| u_s, sliding friction | 0.2 | 0.178 - 0.245 | uniform on [0.178, 0.222] |
| u_r, rolling resistance | 0.01 | 0.0090 - 0.0105 | uniform on [0.0095, 0.0105] |
| throw multiplier | 1.0 | 1.0 - 2.5 | held at 1.0 |

`PhysicsView(kernel, draw)` is the kernel module as the executed stroke sees it. Every state built
through its `SystemState` carries the drawn values: `from_json`, the class call, and any other
callable whose result has `to_json` (a constructor such as `nine_ball_rack`, its state rebuilt
through `from_json`). `simulate` applies the drawn options and refuses a state whose balls' u_s,
u_r and table's e0 are not this view's draw, or whose cushion response is not the default, such as
one built by the real module or by another game's view. `batch_simulate` refuses (the view serves
single executed strokes); every other name forwards, and the module object is never modified. Give
the view only to the code that simulates executed strokes and keep the planner on the real module,
so the planner plans on the nominal table and never sees the draw. Other equipment than the kernel
defaults refuses, the cushion response included (e0 0.85, k_v 0.0, v_ref 1.0, e_min 0.6, e_max
0.98): the kernel's restitution is clamp(e0 + k_v (v - v_ref), e_min, e_max), so another e_min or
e_max could lift or cap the drawn e0. The spreads are priors about unknown equipment (see
Provenance), not a model of variation between games on one table: treat the draw as a prior.

## The level r

r is a free parameter, and this package names no levels. r = 1 is the convention's own scale
(with the tip as applied above); r = 0 removes every r-scaled term.

## Example

```python
import hand_noise_law as law
import noise_stream

r, shape = 1.0, "all"                   # r is free; 1.0 is the convention's own scale
stroke = [3.0, 1.2, 0.1, 0.05, -0.1]    # v0 m/s, phi rad, theta rad, a R, b R
eps = noise_stream.standard_normals(42, 0)   # episode seed 42, decision 0
v0, phi, theta, a, b = law.project_stroke(law.noisy_stroke(stroke, eps, r, shape))
print(law.describe(r, shape)["sigma_v_mps_at"])

# With the public kernel module: one physics draw per game, the executed stroke only.
import pool_py
kernel = law.PhysicsView(pool_py, law.physics_draw(law.physics_key("game:42")))
state = kernel.SystemState.nine_ball_rack(42)   # built through the view: it carries the draw
shot = pool_py.Shot(v0, phi, theta=theta, a=a, b=b, seed=noise_stream.shot_seed(42, 0))
record = kernel.simulate(state, shot, pool_py.SimOptions())
```

## Exactness and tests

The stream's integer layers and its map into (0, 1] are exact; the normals pass through libm (log,
sqrt, cos, sin), so their last bits belong to the platform. The perturbation is float arithmetic by
design (the kernel takes IEEE doubles) using only +, -, *, /, abs, min and max, so the same normals
give the same bits in every interpreter; the centred physics intervals use `fractions.Fraction`.
`project_stroke` uses `math.hypot`, whose last bit may differ between Python versions. The tests
need no kernel and write nothing: run `python3 -B -m unittest -v` in this directory.

## Provenance

First-party work of the openbilliards project, written for this package; no third-party code was
copied. No dataset ships, and nothing here is a measurement of a player.

- The stream. SplitMix64: G. L. Steele Jr., D. Lea and C. H. Flood, "Fast splittable
  pseudorandom number generators", Proceedings of OOPSLA 2014, ACM SIGPLAN Notices 49(10),
  453-472, 2014. The normal transform: G. E. P. Box and M. E. Muller, "A note on the generation
  of random normal deviates", The Annals of Mathematical Statistics 29(2), 610-611, 1958.
- The convention: the execution noise of the computational pool tournaments at the ICGA
  Computer Olympiad, described in C. Archibald, A. Altman, M. Greenspan and Y. Shoham,
  "Computational pool: a new challenge for game theory pragmatics", AI Magazine 31(4), 33-41,
  2010. Its standard deviations, 0.125 deg (phi), 0.1 deg (theta), 0.075 m/s (v) and 0.5 mm
  (a, b), appear as bare numbers in J.-F. Landry and J.-P. Dussault, "AI optimization of a
  billiard player", Journal of Intelligent and Robotic Systems 50(4), 399-417, 2007.
- The tip sigma, 0.6 mm: a prior derived from P. Kornfeind, A. Baca, T. Boindl, A. Kettlgruber
  and G. Gollnhuber, "Movement variability of professional pool billiards players on selected
  tasks", Procedia Engineering 112, 540-545, 2015. Their coefficients of variation of the impact
  height, 3.9 % on the maximum follow shot (their lowest) and about 9 % on average, applied to an
  assumed follow offset of about 15 mm and their draw-shot height of about 17.4 mm, give
  0.6-1.6 mm; 0.6 mm is the low edge. Their coefficients describe variability between players,
  so the figure is a prior for a player's spread, not a measured repeatability of one player; no
  lateral figure is published, so a uses it too.
- The speed coefficient of variation, `SPEED_CV` = 0.045: a default prior, not a measured error of
  any player, and the project's own compilation of public figures. It is the mean of the five
  ratios of standard deviation to mean cue tip speed at impact (1.0 % to 8.9 %; mean 4.49 %,
  rounded to 4.5 %) in Table 2 of P. W. Kong, J. W. Pan, D. P. K. Chu, P. M. Cheung and
  P. W. C. Lau, "Acquiring expertise in precision sport - what can we learn from an elite snooker
  player?", Physical Activity and Health 5(1), 98-106, 2021 (one professional snooker player,
  three trials per shot type). Kornfeind et al. (cited above) report 8 % on average for 20 elite
  pool players over 18 predefined tasks, as variability between players rather than one player's
  own spread. The speed-proportional form follows the signal-dependent noise of C. M. Harris and
  D. M. Wolpert, "Signal-dependent noise determines motor planning", Nature 394, 780-784, 1998.
  Pass `speed_cv=` to set your own.
- The physics spreads. Every value in the physics table is a default or a prior, not a
  measurement by this project.
  - e0, the cushion restitution. The kernel default, 0.85, is the constant ball-cushion
    coefficient of restitution that J. van Balen adopted in place of a speed-dependent law,
    because it gave much better results than that law on a test set of 15 three-cushion (carom)
    paths from a real table: J. van Balen, "A Virtual Billiard Assistant", Master's thesis,
    University of Twente, 2009, section 2.4, pp. 24-25. The open-source pooltool package
    (version 0.6.0) has the same default for its cushion coefficient of restitution, and its
    cushion restitution code cites van Balen for it; the package is described in E. Kiefl,
    "Pooltool: A Python package for realistic billiards simulation", Journal of Open Source
    Software 9(101), 7301, 2024. The spread 0.75 - 0.92 is the project's own compilation of
    public figures, a prior for cushions deader or livelier than the default. The figures it
    compiles are the default above and two lower published values: e = 0.7, a typical value in a
    worked example of D. G. Alciatore, technical proof TP 7.3, "Ball-rail interaction and the
    effects on vertical plane spin", supporting "The Illustrated Principles of Pool and
    Billiards", 2003; and 0.55 for pool, which S. Mathavan, M. R. Jackson and R. M. Parkin quote
    from W. C. Marlow, "The Physics of Pocket Billiards", MAST, Palm Beach Gardens, Florida,
    1995, in "A theoretical analysis of billiard ball dynamics under cushion impacts",
    Proceedings of the Institution of Mechanical Engineers, Part C: Journal of Mechanical
    Engineering Science 224(9), 1863-1873, 2010, p. 1868. Both rest on other cushion models than
    the kernel's, and neither states an edge of the spread: 0.75 and 0.92 are the project's
    choice, not published or measured values. For comparison, the undated web page "Pool Physics
    Property Constants", Dr. Dave Pool Info (D. G. Alciatore),
    drdavepoolinfo.com/faq/physics/physical-properties/ (accessed October 2026), gives 0.6 - 0.9
    for ball-rail restitution; 0.92 is above that range. The draw, uniform on [0.78, 0.92], is
    the widest interval centred on 0.85 inside the spread and describes no particular table.
  - u_s, the sliding friction. The kernel default, 0.2, is the typical ball-cloth sliding
    friction coefficient on the "Pool Physics Property Constants" page (range 0.15 - 0.4,
    typical value 0.2); pooltool (version 0.6.0) has the same default and credits the same page,
    at its former billiards.colostate.edu address, for most of its defaults. The spread
    0.178 - 0.245 is the range that S. Mathavan, M. R. Jackson and R. M. Parkin, "Application of
    high-speed imaging to determine the dynamics of billiards", American Journal of Physics
    77(9), 788-794, 2009 (section III.A, p. 790), report for a snooker ball sliding on the cloth
    of one snooker table, over ball motion in random directions on that table (decelerations of
    1.75 - 2.40 m/s^2); the same page quotes W. C. Marlow's calculated value of 0.2 for pool.
    The spread therefore comes from one snooker table and its cloth, not from pool cloth or a
    survey of equipment, and serves here only as a prior. The draw, uniform on [0.178, 0.222],
    is the widest interval centred on 0.2 inside the spread.
  - u_r, the rolling resistance. The kernel default, 0.01, equals the average that
    D. G. Alciatore reports from a few experiments on a typical cloth in technical proof TP B.2,
    "Rolling resistance, spin resistance, and 'ball turn'", supporting "The Illustrated
    Principles of Pool and Billiards", 2008. It is also the default of pooltool (version 0.6.0)
    and the middle of the range 0.005 - 0.015 on the "Pool Physics Property Constants" page. The
    spread 0.0090 - 0.0105 is the project's own compilation of public figures for new worsted
    cloth, from these: J. Waldron, "Pool Table Stimpmeter", Pocket Billiards Review,
    January 2009, finds a table with new worsted tournament cloth slightly faster than
    "competition speed", which the article equates with a seven-second return in the stopwatch
    test of B. Jewett, "Friction: Friend and Foe", Billiards Digest, April 1995, pp. 24-26 (the
    time from the ball's contact with the foot rail until it stops just short of the head rail).
    TP B.2's mu_r = 2L / (g T^2), taking L as the 2.54 m playing length of a 9-ft table, gives
    0.0106 at T = 7.0 s, and on that reading the spread covers returns of about 7.0 - 7.6 s;
    Jewett's own rule (cloth speed = 2 T^2, the reciprocal of the equivalent slope) gives 1/98,
    about 0.0102, at 7 s. Both edges are the project's choice, and no public source states
    either. The draw, uniform on [0.0095, 0.0105], is the widest interval centred on the default
    inside the spread.
  - Throw. The kernel's default ball-ball friction curve, mu(v) = a + b exp(-c v) with
    a = 9.951e-3, b = 0.108 and c = 1.088 (v the relative sliding speed at the contact, m/s), is
    the curve D. G. Alciatore solves through three friction values from W. C. Marlow's book
    (Table 10, p. 245, with Marlow's speeds multiplied by sin 45 deg) in technical proof
    TP A.14, "The effects of cut angle, speed, and spin on object ball throw", supporting "The
    Illustrated Principles of Pool and Billiards" (revision of 19 May 2025, p. 4). The throw
    multiplier scales a and b (c kept), so it multiplies the whole curve, as the friction
    multiplier of the same technical proof does (p. 16). Its default is 1.0, the value TP A.14
    calls normal, and its spread 1.0 - 2.5 runs from that value to TP A.14's cling value (p. 16:
    1.0 normal, 1.5 dirty, 2.5 cling; its legend allows up to 3 for cling, skid or kick). The
    spread is a prior over ball-surface and contact conditions, not a measurement of any table.
    The multiplier is held at 1.0 in this version: the default is the low end of the spread, so
    the widest interval centred on it inside the spread is the single point 1.0. Published
    demonstrations show contact conditions both raising throw (a chalk mark) and lowering it
    (car wax, silicone spray): D. Alciatore, "Throw follow-up: part I: cling", Billiards Digest,
    July 2014.
