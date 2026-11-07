# Pinned rulebook: WPA Rules of Heyball (effective 2025-08-16)

**Status: PINNED reference for the `heyball-v1` ruleset composition (GH-491, build 18).**

Shipped composition: `crates/pool-rules/src/rulesets/heyball.rs` (registry slot 11, decisions
18–23); semantic wall `crates/pool-rules/tests/heyball_scenarios.rs` (interpretations I1–I6
documented there; I2 re-pinned by review r2 — the 8 driven OFF on the break is the II.20(c) loss,
only the POCKETED 8 rides the II.6(f) matrices; I4 amended by review r1+r2 — a frozen target's own
cushion re-contact satisfies II.15.2 once any post-contact pose proves departure from every
address-frozen rail plane; I6 pins the plane-only address-detection scope, jaw-arc wire growth
tracked in GH-503); frozen
byte oracle `scripts/fixtures/rules-corpus-variants/wpa-heyball.json` (59 cases, harvested once
at `3f41c726`, ALL bytes original. Pre-merge churn record: `judge-010-open-other-group-pot` was
briefly re-harvested at review r8 on a II.10.3-only reading (pot-keyed grouping) and RESTORED at
review r11 — II.12.1 "Ball Grouping" is the operative mechanism ("if the first ball shot or a
ball from the same group as the first ball shot is pocketed, the grouping is complete"); the
original harvest was correct).

- Source: World Pool-Billiard Association, *Rules of Heyball*, RULES OF PLAY effective 2025-08-16, 21 pages.
- Canonical URL: <https://wpapool.com/wp-content/uploads/2025/08/250816-Rules-of-Heyball.pdf>
- Fetched: 2026-08-09 via wpapool.com (direct download).
- SHA-256 of the pinned PDF: `2b92dd5088ea630337326e26b7a2a7a4499a9801f2c5da7e5cc40421d5424a24`
- Copyright: © World Pool-Billiard Association, 2025. The PDF itself is **not** committed to the repo
  (third-party copyrighted document); this digest paraphrases the game-mechanical content with
  section citations. Anyone re-verifying should re-download and check the hash above.
- Note: the consolidated WPA Rules of Play (effective 2025-09-15) marks Heyball as "Chapter 9,
  to be published in due course" and refers readers to the standalone document pinned here — the
  standalone 2025-08-16 document is the operative rulebook.

Document structure: Chapter I General Principles (competition administration), Chapter II Rules of
Heyball (the game rules — primary source for the composition), Chapter III Rules for Time-Limited
Matches, Appendix A WPA General Rules (subset). Citations below use `II.§n` form.

## 1. Identity and equipment (II.§2, II.§3)

- Win condition: pocket all of your own group (solids or stripes), then legally pocket the 8-ball (II.§2).
- Balls: 57.15 mm (±0.05), 156–170 g; WPA UNITY ball set mandatory from 2025-08-25 (II.§3c). Standard
  solids/stripes/8 semantics — the standard pool ball set is mechanically correct for simulation.
- Table: inner dimensions 2,540 mm × 1,270 mm (rulebook prints "1,260mm(+/-9mm)"), i.e. the Chinese
  eight-ball "9 ft" table with snooker-style rounded pockets → discipline pairs with the
  `chinese8_pro_9ft` table (GH-490).
- Foot spot: on the long axis, 635 mm from the top (foot-end) cushion. Head string: 635 mm from the
  bottom (head-end) cushion (II.§3d–e). Both are exactly 1/4 of the 2,540 mm length.
- Rack: triangle, apex ball on the foot spot, 8-ball at the center; one solid and one stripe at each
  end of the base row; solids/stripes otherwise separated as far as possible (II.§4). The three apex
  balls must be frozen; first two rows tightly racked (I.§4, II.§4).

## 2. Lag and order of break (II.§5, I.§12, III.§2)

- Lag decides who breaks first; the lag **winner chooses** who breaks (II.§5).
- Bad lag: ball crosses the long axis into opponent's half; fails to contact the top cushion;
  contacts it more than once; is pocketed/driven off; contacts a side cushion or rests in a corner
  pocket mouth past the bottom-cushion nose (II.§5.1a–e). Re-lag on: grossly unsynchronized strokes,
  referee cannot determine, or both bad (II.§5.2).
- **Match format: alternating breaks** (I.§12 "Alternating breaks will be used"; III.§2 "take turns
  to break"). No winner-breaks option in the rulebook.

## 3. Break laws (II.§6) — the Heyball-specific break/BIH family

- (a) Break must be forceful; soft breaks prohibited. Referee-judged illegal (soft) break: 1st
  offense warning, 2nd loss of rack, 3rd loss of match. (Referee-discretion ladder — surfaced as a
  prompt, not physics.)
- (b) Intentionally not breaking, or an intentional miscue on the break, is an intentional foul →
  loss of rack.
- (c) **Dry-break legality gate**: a break where fewer than 4 object balls contact cushions AND no
  ball is pocketed is an **illegal break** (not a foul): the opponent chooses to (i) accept the table
  and play on, or (ii) re-rack with either player breaking. **No ball-in-hand** attaches.
- (d) Cue ball placed anywhere behind the head string. If more than half the cue ball crosses the
  head string at placement: 1st offense reminder, 2nd offense a foul.
- (e) **Break-shot foul** (e.g. scratch on the break): opponent chooses (i) ball in hand **behind the
  head string** (NOT anywhere — Heyball-specific), (ii) re-rack + break himself, or (iii) re-rack +
  breaker breaks again.
- (f) 8-ball pocketed on the break, no foul: breaker chooses re-spot-8-and-play-on, or re-break.
  With a foul: opponent chooses re-spot-8 + BIH behind head string, re-rack + break himself, or
  re-rack + opponent (original breaker) breaks.
- (g) Unintentional break miscue where the cue ball never reaches the rack: opponent chooses
  break-himself or breaker-breaks-again; no BIH.

## 4. Open table, grouping, calling (II.§10, §11, §12.1, §13, §19)

- Table is open immediately after the break, **regardless of what was pocketed on the break** —
  group ownership is never determined by the break shot (II.§10.3). Even if all balls pocketed on
  the break are of one group, the table stays open (II.§10.1).
- While open: any object ball except the 8 may be contacted/pocketed first; cue ball contacting the
  8 first is a foul (II.§10.1). Illegally pocketed object balls stay down (II.§10.2).
- Grouping (II.§12.1 "Ball Grouping", verbatim mechanism): "if the first ball shot or a ball from
  the same group as the first ball shot is pocketed, the grouping is complete ... and the table is
  closed" — grouping keys on the FIRST-CONTACT ball's group being pocketed, never on an other-group
  slop (which stays down per §10.2 with the table still open). §10.3's general wording (who/when)
  defers to this mechanism. Once closed, first contact must be own group (or the 8 once cleared).
- Open-table simultaneous-groups edge (II.§10.4): if the cue ball legally contacts two balls of
  different groups simultaneously and balls of both groups are pocketed, the shooter chooses either
  group; the incoming player then plays the other group.
- Simultaneous legal+illegal contact, indeterminable order → presumed legal-first (II.§13).
- **No call shot** (II.§11): "There is no need to call your shot / designate a pocket, even for the
  8-ball or the shootout. Flukes are allowed." → calling = none; slop counts; there is no called-safety
  and no tap-in/concession mechanic (conceding a ball or a rack is unsportsmanlike conduct, II.§23).
- Group confusion (II.§19): if wrong-group play goes unnoticed past a shot boundary and is later
  discovered, the rack stops and is re-racked.

## 5. Shot legality and foul families (II.§12, §15–§17)

General foul penalty: **ball in hand anywhere** (II.§17 chapeau, II.§9), except the break-specific
family above. Fouls must be called before the next shot or they are void (II.§12.5, App-A 3).

- Drive-to-rail (II.§12.2): after cue–object contact, if nothing is pocketed, at least one ball
  (cue ball included) must contact a cushion.
- Balls off the table (II.§12.3, §17e): an object ball (other than the 8) coming to rest off the
  table is a foul, and the ball is **not re-spotted** ("legal disappearance" — it stays out of play).
  8-ball off the table = loss of rack (II.§20c,e). Cue ball off = scratch foul (II.§17a).
- Touch fouls (II.§12.4, §17f): any part of body/clothing/equipment except the cue tip touching any
  ball.
- Double hit + close-ball presumption (II.§12.5–12.6): tip contacting cue ball twice = foul; when
  the cue ball is very close to the object ball and the stroke lightly grazes, presumed legal.
- Push shot (II.§12.7, §17h): prolonged tip contact = foul.
- Ball resting on cushion (II.§12.8): rolling onto the cushion and returning untouched = legal;
  remaining on the cushion or touching anything while up there = illegal shot.
- Frozen to cushion (II.§15.2): striking an object ball frozen to a cushion — the ball must leave
  the cushion and re-contact a cushion, or another ball (incl. cue) must contact a cushion, or a
  ball must be pocketed; else foul (BIH).
- Cue frozen to legal object ball (II.§15.1): no direction restriction; obvious push still a foul.
- Jump shots (II.§16): legal if cue ball struck on the upper half; striking the lower half (or
  miscue-jump) that clears an obstructing ball = illegal jump → BIH.
- Full II.§17 foul list: (a) scratch/cue off table; (b) wrong first contact; (c) shooting while any
  ball moving; (d) **both feet off the floor** at strike; (e) object ball off table; (f) touching
  balls; (g) double hit; (h) push shot; (i) bad play behind the head string (BIH-behind-string
  restriction, II.§8); (j) **one-handed shot** (shooting without a bridge hand — Heyball-specific);
  (k) placing auxiliary equipment on the table to shoot; (l) mobile-device noise (1st = foul,
  thereafter loss of rack).
- BIH behind head string (II.§8): center of cue ball behind the string; may not shoot directly at an
  object ball also behind the string (may go up-table and return); if ALL legal object balls are
  behind the string, the nearest may be re-spotted to the foot spot on request (shooter picks among
  equidistant).
- Intentional fouls (II.§18, III.§5): 1st = loss of rack, 2nd = loss of match.

## 6. Rack (frame) and match endings (II.§20, §21, III.§4)

- Loss of rack (II.§20): (a) pocketing the 8 while fouling (after the break); (b) pocketing the 8 on
  the same shot as the last ball of the shooter's group [rulebook wording garbled: "Pockets the 8
  ball on his last shot before the 8 ball" — interpreted per standard Chinese-eight practice as
  8-with-last-own-ball on one stroke]; (c) driving the 8 off the table; (d) pocketing the 8 before
  clearing the group; (e) while the 8 remains on the table only fouls are possible; once the 8 is
  off the table (other than a legal win) it is loss of rack.
- Stalemate (II.§21): referee-proposed re-rack; if refused, ~3 more shots each; then declared —
  re-rack with the **original breaker breaking again**, shooting order unchanged.
- Match: race to an event-defined number of racks, alternating breaks. Time-limited format
  (Chapter III): 120-min example match clock, 45 s shot clock (one 30 s extension per player per
  rack), 30 s break clock with no extension; tie at time with balls on the table → stalemate rack →
  **shootout**: lag for order, 5 alternating spot shots (cue ball on head spot, 8-ball on foot spot,
  30 s each, 1 point per legal pot), then sudden death (III.§4). Shootout is a tournament-format
  tiebreak, not part of the heyball-v1 frame model.

## 6b. Registered composition surface (GH-491 growth events)

- Registry: `RULESET_IDS` `[&str; 10]` → `[&str; 11]`, `heyball-v1` appended last
  (registry-api.md §6 repin protocol); pool-rules `0.1.9` → `0.1.10`; rules artifact repinned.
- Share-codec decision allocation (additive, past the GH-382 id 17): **18** `illegal_break` (3:
  accept · re-rack chooser breaks · re-rack breaker again; II.§6c, NO ball in hand), **19**
  `break_foul` (3: BIH behind the head string as it lies · re-rack chooser breaks · re-rack breaker
  again; II.§6e), **20** `eight_break_pot` (2: spot the 8 + breaker continues · re-break; II.§6f),
  **21** `eight_break_foul` (3: spot the 8 + BIH behind the string · re-rack chooser breaks ·
  re-rack breaker again; II.§6f), **22** `break_miscue` (2: chooser breaks · breaker again, no BIH;
  II.§6g), **23** `stalemate` (1: re-rack, ORIGINAL breaker; II.§21 — agreement, never pending).
- Game catalog: 8th entry `heyball` (rack template `heyball_wpa` — II.§4 hard constraints; the
  soft "separated as far as possible" pattern is NOT enforced, seeded shuffle per the eight_wpa
  mechanism); table class pins `chinese8_pro_9ft` (the GH-490/v15 de-branded id; the pre-rename `joy_q8_9ft` alias stays resolve-only for replays).
- Frozen conformance slice: `wpa-heyball` (59 cases; kinds: initialState 2 / judge 35 /
  judge-error 3 / applyDecision 12 / applyDecision-error 4 / hudState 3).

## 7. Composition deltas vs the existing eight-ball family (summary for heyball-v1)

1. No calling at all (no called ball/pocket, no called safety) — flukes count, incl. the 8 (II.§11).
2. Table open after break regardless of pocketed balls; grouping completes when the FIRST-CONTACT
   ball or another ball of ITS group is legally pocketed — II.§12.1 "Ball Grouping" verbatim ("if
   the first ball shot or a ball from the same group as the first ball shot is pocketed, the
   grouping is complete"); §10.3's general wording (who/when) defers to 12.1's mechanism (how).
   An other-group slop stays down (§10.2), table stays open.
3. Break legality = ≥4 object balls to cushion OR any pocket; illegal break → opponent's
   accept-or-rerack option, no BIH (II.§6c).
4. Break foul → opponent's 3-way choice with BIH restricted **behind the head string** (II.§6e);
   post-break fouls → BIH anywhere (II.§17).
5. 8 POCKETED on break is not a win/loss: re-spot or re-break options (II.§6f). The 8 DRIVEN OFF
   on the break is loss of rack — II.§20(a) alone carries a break carve-out; §20(c)/(e) are
   unconditional (I2 re-pinned by review r2 on PR #502 against the rulebook text).
6. Object balls driven off the table stay off (foul, no re-spot) (II.§12.3).
7. Frozen-to-cushion escape law (II.§15.2) and upper-half jump-shot law (II.§16) are explicit foul
   primitives.
8. Loss-of-rack family: 8-while-fouling, 8-with-last-group-ball, 8-off-table, early 8 (II.§20).
9. Alternating breaks; stalemate re-rack keeps the original breaker (I.§12, II.§21).
10. Distinctive conduct fouls surfaced as prompts only (one-handed shot, both feet, phone noise);
    physical-conduct fouls are out of simulation scope but kept in the catalog for completeness of
    the foul taxonomy where representable.
