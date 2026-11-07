# Agent card: the baseline agent (`straightpool.base_agent`)

The simplest agent our 14.1 climb started from, and the agent the README climb and the demo start
from. It is a composition of closed-form geometry and simulation: no learned file, no random draw
outside the game's own streams.

## Composition

At every decision of a `straightpool.game` game:

1. **Menu.** `straightpool.candidates.enumerate_candidates`: for every object ball on the table,
   the ghost-ball pot into every pocket with a cut under 80 deg, two cheat-the-pocket offsets,
   natural-route position strokes and three safeties. With the cue ball in hand, each pocket's
   strokes are aimed from the seat of a placement behind the ball: the game's ball-in-hand rule
   clips it into the granted zone (the kitchen after some re-racks) and moves it off the other
   balls, and the painter and the rollouts use the same seat.
2. **Call and leave surface.** `straightpool.leave.painters.paint` (the v0.2 painter): the live
   direct pot of highest makeability, both legs of the pot checked, is called; the leave surface is
   painted for the ball that follows it. With no live direct pot the agent declares that no pot is
   callable, which ends the game.
3. **Refinement by simulation.** The candidates of the called shot (the ghost-ball pot and its two
   offsets) are scored on the decision's shared draw block; the best three are refined by best-of-K
   (`hillclimb.select.best_of_k`: 3 iterations of 16 proposals each, 10 shared draws per score,
   1,470 simulations for three seeds, under a budget of 2,000). A stroke's value is
   E[pot x W(rest)] - 1 x P(foul) over the draws (`straightpool.leave.wrapper.mean_objective`): W is
   the leave surface at the cue ball's rest, read in the surface's own frame, and a draw pots only
   when the called ball drops in the called pocket.
4. **Rollout law.** A rollout draw is judged by `straightpool.game.judge_rollout`: the 14.1 rules
   with one more foul, a first contact with any ball other than the called one. The played stroke
   is judged by `straightpool.game.judge`.
5. **Envelope.** Every proposal is clamped into the actuation envelope v1 (`straightpool.envelope`)
   and the played stroke must be inside its box; the cue-clearance floor is not applied.

It plays no safety (no live pot ends the game), no bank or kick shot and no break search, and it
uses neither learned file: C2, a learned pre-filter whose chosen stroke is always simulated, and V,
a learned leaf value used in the 2-ply, belong to the later agents (`hillclimb_examples/models/`).

## Label: the recorded baseline

| item | value |
|---|---|
| measured | mean run length 7.08 over 100 games (the plain mean of L; longest run 15; no game reached the cap of 200 balls) |
| how the games ended | 63 misses, 25 with no live pot, 8 that pocketed an object ball but not the call, 4 scratches |
| noise | the ICGA convention at r = 0.1 (the 0.1x unit), every stroke |
| record | internal research log, row 89 |
| kernel | 0.1.0+64e9e7a3 |
| status | a historical baseline, measured before the actuation envelope was enforced in our 14.1 games: the v1 box held on every played stroke (v0 at most 12 m/s, theta at most 89 deg, tip within 0.5 R) but the cue-clearance floor was not checked, so it is not an in-envelope number; not adopted as a result |

The same label is data in `straightpool.base_agent.LABEL`. The recorded games are not shipped:
their keys come from private research streams. Public runs use
fresh keys, and a public kernel newer than 0.1.0+64e9e7a3 is not expected to reproduce 7.08 bit for
bit (kernel changes are not bit-exact). The recorded agent aimed its in-hand
strokes from the placement before the seat moved it; this agent aims them from the seat, so the
two can choose differently only at a ball-in-hand decision where the seat moves one of the menu's
placements (into the kitchen, or off a ball).

## Where the climb went from here

Our later agents, as the internal research log states them (in-envelope first):

- The hard target, E[L] about 200 with P(L >= 45) >= 0.80 at the 0.1x unit, is **not met
  in-envelope**.
- **In-envelope (actuation envelope v2):** the full agent with the give-up fix (R1 + ML: where the
  agent would give up, a menu of further strokes and a leave term) reached E[L] 178.36 by
  conditional Monte Carlo over 60 games, a gain over R1 of +29.77 (95 % interval +13.07 to
  +50.92), labelled nominal-leave and not adopted (internal research log, row 585). The full agent
  alone (R1) read 150.01 on 12 games, where its run stopped (internal research log, row 571).
- **Out of envelope:** the certified agent (B + NGO) reached E[L] 263.8 at 0.10x by conditional
  Monte Carlo over 240 games (internal research log, row 543); it breaks the actuation envelope
  (internal research log, rows 546, 556, 559).

Every number above was measured on kernel 0.1.0+64e9e7a3.

## Levers

Each parameter of `base_agent.spec(...)` switches one part, so a climb step changes one of them:

| parameter | default | effect |
|---|---|---|
| `leave` | `True` | `False` reads W = 1 everywhere: the value becomes the pot rate less the foul penalty |
| `painter` | `"v0.2"` | `"v0.1"` checks only the cue ball's path to the ghost ball when it prices a call |
| `rollouts` | `"first-contact"` | `"rules"` judges rollout draws by the 14.1 rules alone (a planned combination can score) |
| `lambda_foul` | `1.0` | the foul penalty, in balls |
| `envelope` | `"v1"` | `"v2"` lifts the cap on the commanded cue speed v0 to 13.4 m/s at a break decision; `None` keeps only the kernel's stroke domain |
| `floor` | `False` | `True` holds every seed and proposal to the cue-clearance floor (re-seeded at the floor plus 0.5 deg) |
| `survivors`, `iterations`, `proposals`, `draws`, `budget` | 3, 3, 16, 10, 2000 | the best-of-K schedule |
| `namespace` | `"straightpool/base-agent/rollouts"` | the namespace of the rollout draws |

No parameter sets speed only: the rollouts run on one kernel thread, and a run plays its games on
workers, a setting of the run that no spec or record holds.

## Provenance

First-party code and constants. The menu's speed seeds, the cheat offset and the standoffs are
closed-form defaults; the leave surface is plane geometry (`straightpool/leave`); the opening break
of `straightpool.game` was chosen by a search in the kernel. The envelope's 12.0 m/s cap on the
commanded cue speed v0 is the top of the game's own cue-power range. Envelope v2 adopts 13.4 m/s
as its break cap on v0: about 30 mph (13.41 m/s) rounded down, the top of the 25-30 mph range of
cue-ball speeds that D. G. Alciatore's break-speed FAQ gives for typical top professional breaks
(https://drdavepoolinfo.com/faq/break/speed/). Both caps bound the cue speed v0, not the cue
ball's speed: on the kernel in this repository, with its default strike options and a centre hit,
the cue ball leaves the tip at about 1.54 times v0, so a break at v2's cap sends it off at about
46 mph and a stroke at the 12.0 m/s cap at about 41 mph, above the FAQ's range.
