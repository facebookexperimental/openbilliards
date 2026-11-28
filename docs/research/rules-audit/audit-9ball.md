# 9-Ball rules audit — `nineball-v1` vs pinned WPA edition

Lane: AUDIT LANE 9-BALL (project direction: audit all game rules vs
international rulebooks; variants become selectable configuration layers).

## Pinned authority

- WPA "Rules of Play", **effective 2025-09-15** ((c) WPA 2025, file posted
  2026-01-02) — the edition pinned in the multi-game-support research
  notes (internal), R1 (row "9-Ball (existing)": "Same WPA edition ...
  9-Ball = Section 5 of the same book; existing v1 simplifications stay
  documented in `sdk/ts/src/rules/nineball.ts`").
- Verified against the actual pinned PDF re-downloaded from the pinned URL
  (`https://wpapool.com/wp-content/uploads/2026/01/2026.01.02-WPA-Rules.pdf`,
  44 pages) — text extracted locally for this audit. All clause quotes
  below are from that extraction.

## Audited surfaces

- `crates/pool-rules/src/rulesets/nineball.rs` (the judge; corpus-frozen)
- `crates/pool-rules/src/primitives/{scan,contact,turn,counters}.rs`
- `sdk/ts/src/rules/nineball.ts` (frozen API + the documented v1 exclusion
  list), `sdk/ts/src/rules/respot.ts` (spot geometry)
- `sdk/ts/src/games/catalog.ts` + `sdk/ts/src/games/rack.ts` (provenance
  claims), `crates/pool-core/src/rack.rs` (rack geometry)
- `web/app/flow.js`, `web/app/game.js`, `web/app/touch.js` (adapter: turn,
  placement rights, stalemate/decision affordances)

Behavior freeze context: verdict bytes are pinned by
`scripts/fixtures/rules-corpus.json` (95 nineball-v1 cases,
`crates/pool-rules/tests/corpus.rs:136`). Any fix below that changes judgment
bytes (including `cite` strings) requires the full erratum process: pinned
clause proof + minimal per-case erratum + RULES_VERSION bump + artifact
rebuild + three-leg conformance green.

---

## 1. Lowest-ball-first legality — CONFORMANT

WPA 5.7 item 3.2: "The first object-ball contacted by the cue-ball on each
shot must be the lowest-numbered ball remaining on the table." WPA 5.5: legal
pot => continue; legal 9 => rack won; dry/foul => pass. WPA 3.3: after
contact, at least one ball (cue or object) to a rail unless a ball is
pocketed.

Implementation (`nineball.rs::judge`):
- lowest = min over deduped positive `onTable` ids (`contact::lowest`);
  first contact checked against it (`contact::check_first_contact`) — 3.2 OK.
- `no-rail-after-contact` when contact happened and no pocket/cushion event
  at a later stream index (`scan.rs`: `driven_after_contact` set by
  `BallPocket` and cushion events with `idx > first_contact.idx`; the cue
  ball's own rail contact counts, matching 3.3's "(cue-ball or any
  object-ball)") — 3.3 OK.
- `scratch` on cue pocketed OR cue off table (`scan.rs::BallOffTable`
  striker branch) — exactly 3.1 "Cue-ball Scratch or off the Table" — OK.
- Foul => `PlacementRight::Anywhere` — 5.7 + 1.6 OK (9-ball has no
  kitchen-restricted foul penalty; break fouls also give anywhere).
- Turn: `Continue` iff legal AND pocketed non-empty, else `Pass`
  (`turn::resolve_seat`, terminal holds seat) — 5.5 OK. The adapter
  (`flow.js` `if (j.next.shooter !== player) switchPlayer()`) follows the
  crate's seat. The 8-ball group-flip bug report does not reproduce a
  9-ball-side turn inversion in this code path.
- Combos count; the 9 need not be first contacted (game_over = legal &&
  9 pocketed) — Section 5 preamble OK.
- Call gate: `nineball-v1: 9-ball has no call/safety inputs` — correct;
  Section 5 defines no call shot.
- Simultaneous first contact: 3.2/3.3 give the shooter benefit of the doubt
  ("approximately the same instant ... assumed the legal object-ball was
  struck first"); v1 resolves equal-t events by kernel emission order
  (documented frozen convention, `nineball.rs` doc block). Deterministic
  kernel => no ambiguity to adjudicate; acceptable mechanical reading.

## 2. Rack anchor — DIVERGENCE vs WPA 5.2 (genuine, kernel-side)

WPA 5.2: "racked ... in a diamond shape, with the 1-ball at the apex of the
diamond towards the head of the table and **the 9-ball in the middle of the
diamond and on the Foot Spot**."

`crates/pool-core/src/rack.rs:299-305` + `nine_offsets()` anchor the **apex
(1-ball) on the foot spot** ("Apex (1-ball) on the foot spot pointing at the
breaker"); the 9 sits 2 lattice rows behind it (offset `(0, 2*sqrt3/2)` in
pitch units ~= 99 mm toward the foot rail for r = 28.575 mm). Under the
pinned text the diamond's CENTER belongs on the spot, i.e. the entire rack
should sit ~99 mm closer to the head.

`sdk/ts/src/games/rack.ts:67` cites "WPA Sec. 5 (9-ball diamond, 1 at the
apex, 9 in the middle)" — the citation quietly omits 5.2's "on the Foot
Spot" anchor, so the provenance string papers over the divergence.

Contrast: the 8-ball triangle (apex on the foot spot) is CORRECT per WPA 4.2,
and 10-ball (6.2) also wants the apex ball on the spot — 9-ball is the one
discipline where the center ball anchors. Not corpus-frozen (rack geometry is
kernel/scenario territory, not rules-judgment bytes), but it IS frozen by
kernel golden traces/determinism gates and the 001 M7 contract ("apex ball on
the spot") — a fix is a kernel-contract change, not a rules-crate erratum.

## 3. `no-contact` foul mis-citation — DIVERGENCE (metadata, corpus-frozen)

`nineball.rs:142` (and the catalog mirror `nineball.rs:245`,
`sdk/ts/src/games/catalog.ts` foul_taxonomy) cite `no-contact` as
**"WPA 3.2"**. In the pinned edition the contact REQUIREMENT lives in 3.3:
"If no ball is pocketed on a shot, **the cue-ball must contact an
object-ball**, and after that contact at least one ball ... must be driven to
a rail, or the shot is a foul." 3.2 (Wrong Ball First) only governs first
contact with the WRONG ball — it presupposes a contact. Correct cite for the
no-contact case: WPA 3.3 (via 5.7).

Cites ride the judgment JSON bytes, so this is behavior-frozen: fixing it
requires the erratum process (pinned-clause proof above; the affected corpus
cases are exactly the nineball no-contact cases; RULES_VERSION bump; artifact
rebuild; three-leg conformance). Same mis-cite pattern should be checked in
the 8-ball lane (eightball.rs uses the same code/cite pair).

## 4. Push-out (WPA 5.4) — NOT IMPLEMENTED; exclusion documented (honest)

WPA 5.4: after a foul-free break the shooter may declare a push out; 3.2 and
3.3 are suspended for that shot; a 9 pocketed on a push out is spotted (5.6);
after a foul-free push out the OTHER player chooses who shoots next (see also
2.8 inning note "a player may choose not to come to the table ... e.g. a
push-out at 9-Ball").

Repo state: zero push-out code paths (`grep -ri "push.?out" web/app
sdk/ts/src` is empty). Exclusion IS documented at every promised location:
- `sdk/ts/src/rules/nineball.ts:23` "push-out NOT implemented in v1"
- `crates/pool-rules/src/rulesets/nineball.rs:18` "push-out, off-table
  fouls, dry-break rail minimum, and three-foul loss are NOT in v1"
- `sdk/ts/src/games/catalog.ts` break_requirements points at the nineball.ts
  header for v1 simplifications.

Verdict: honest documented v1 exclusion. Variant note: push-out is a clean
selectable-config candidate (a `decision_required` pre-shot declaration +
one-shot 3.2/3.3 suspension + a post-shot pass-back decision — the decisions
primitive and apply_decision plumbing already exist for 8-ball/one-pocket).

## 5. Three-foul rule (WPA 5.8 via 3.13) — NOT IMPLEMENTED; documented (honest)

WPA 5.8: "For 3.13 Three Consecutive Fouls, the penalty is loss of the
current Rack." 3.13: fouls must be in a single rack; referee must warn at two
fouls, else the third counts as the second.

Repo state: `nineball-v1` carries no counter; documented at
`sdk/ts/src/rules/nineball.ts:25` ("three-fouls NOT tracked in v1") and the
nineball.rs doc block. The machinery already exists:
`crates/pool-rules/src/primitives/counters.rs` (P15
`FoulCounterMode::Tracked { loss_threshold }`, reset-on-legal) is live in
`onepocket-v1` ("WPA 12.9 via 3.13"). A `nineball-v2`/WPA-strict variant can
adopt `Tracked{3}` plus the warning surface (HUD "on two fouls" banner)
without new primitives.

Nit: `counters.rs` module doc says "the other disciplines carry no counter" —
true of the CODE, but the pinned book gives 9-ball the rule; a clarifying
"(9-ball's 3.13 is a documented v1 exclusion)" would prevent misreading the
primitive doc as a rulebook claim.

## 6. Jump / foul taxonomy

- Jump shots: legal in WPA pool (no Section 3/5 jump foul; the miscue-jump
  ban is tournament Regulation territory, out of engine scope). The P10
  jump-over detector is snooker-only and correctly unused here. OK.
- Cue off table => `scratch` (3.1) — OK (`scan.rs` BallOffTable striker
  branch).
- Object ball driven off table: WPA 3.5 (in 5.7's foul list) makes it a
  FOUL; v1 cites NO foul — documented exclusion
  (`nineball.ts:23-24` "off-table object balls are NOT a foul in v1").
  Spotting side is conformant with 5.6/3.5: only a jumped 9 is spotted,
  other jumped balls stay off. So the DIVERGENCE is only the missing foul
  (and its BIH), and it is honestly documented.
- Edge nuance (undocumented, cosmetic): WPA 2.7 counts a pocketed or
  off-table ball as "driven to a rail". `scan.rs` sets
  `driven_after_contact` on BallPocket and cushion events but NOT on
  BallOffTable — so a post-contact ball leaving the table with no other rail
  contact judges as `no-rail-after-contact` where WPA would call 3.5. Net
  penalty identical in 9-ball (standard foul, BIH anywhere); only the foul
  code label differs. Corpus-frozen; fold into any 3.5 variant work.
- Edge nuance (undocumented): WPA 2.7 says a ball frozen to a rail is "not
  considered driven to that rail unless it leaves the rail and returns" (a
  referee-declaration rule). v1 counts any cushion event after contact,
  including same-rail re-contact of a frozen ball. Permissive divergence in
  a corner case that WPA itself gates on a declaration; acceptable
  mechanical reading, worth one doc line.
- Out-of-engine fouls 3.4 (foot on floor), 3.6 (touched ball), 3.7 (double
  hit/frozen), 3.8 (push shot), 3.9 (balls still moving — mechanically
  impossible, shots start at rest), 3.12, 3.14, 3.15, 3.16: no engine
  surface; consistent with the 011 research out-of-engine boundary.
  Note 3.7 double-hit: the kernel's strike model cannot double-hit, so this
  is physically excluded rather than adjudicated.

## 7. Spotting (WPA 5.6 + 1.5) — CONFORMANT (with documented approximations)

WPA 5.6: 9 pocketed on a foul or push out, or driven off => spotted; "No
other object-ball is ever spotted." 1.5: place on the long string as close
as possible to the foot spot, BETWEEN foot spot and foot rail first; if that
whole segment is blocked, above the foot spot as close as possible.

Implementation: crate emits ids only (`respot: [9]` iff not game-over AND
(9 pocketed on foul OR 9 off table) — exactly 5.6 since a legally pocketed 9
ends the rack). Geometry `sdk/ts/src/rules/respot.ts::respotBallSpot`: foot
spot, then y+ toward the foot rail, then back toward the head — matches
1.5's search order. Approximations (documented in respot.ts): a
`PLACE_CLEARANCE` = 1e-4 daylight gap instead of 1.5's "in contact (if
possible) with the interfering ball", and r/4 quantized steps. Kernel-safety
deviation, fine for v1; a strict variant could place frozen-contact minus
kernel EPS_KISS.

## 8. Stalemate (WPA 5.9 via 1.13) — NOT IMPLEMENTED and NOT on the exclusion list (honesty gap)

WPA 5.9: "If a stalemate occurs the original breaker of the rack will break
again (see 1.13 Stalemate)."

`web/app/flow.js:1064-1066`: the stalemate affordance is gated
`eightActive()` (WPA 4.11) — 8-ball has it, one-pocket has `stalemateLag`
(12.10), 9-ball has NO stalemate path. Unlike push-out/three-foul/off-table/
dry-break, stalemate is absent from the documented v1 exclusion list
(`nineball.ts` header, `nineball.rs` doc block, catalog notes). Either extend
the `stalemate` decision to nine_ball (it is game-agnostic: re-rack +
original breaker) or add 5.9 to the documented exclusions. Doc-only fix does
not touch corpus bytes.

## 9. Break rules (WPA 5.3)

- **5.3(a)** "the cue-ball begins in hand above the Head String": the app
  gives the breaker NO placement right — rerack routes the machine to AIM
  (`game.js:162`), placement drag exists only in BALL_IN_HAND
  (`touch.js:294,412`; `aim.js:440`), and the rack template pins the cue
  exactly on the head spot (`rack.rs` module doc). The breaker cannot choose
  a break position. DIVERGENCE (restrictive), and
  `catalog.ts` break_requirements text claims "Cue ball in hand behind the
  head string" — overstating the shipped behavior. Also relevant to RL
  task-space: break-position choice is a real action dimension the PRE-TDL
  config should eventually expose.
- **5.3(b)** dry break: >= 4 object balls to rails or foul — not
  implemented; documented ("dry-break rail minimum", `nineball.rs:18`;
  catalog break_requirements). Honest.
- **5.3(c)** (new in this edition): if no ball is pocketed, three balls must
  cross the head string or the break is an "illegal break" (Regulation 16,
  Three-Ball Break Rule) — not implemented and not specifically listed;
  covered only by the umbrella "break judged like any other shot"
  (`nineball.ts:25`). Recommend naming 5.3(b)+(c) explicitly in the
  exclusion list next time these files are legitimately touched.
- Break foul penalty: BIH anywhere — v1 grants Anywhere on every foul,
  which IS the WPA 9-ball rule (5.7; no 8-ball-style 4.3(g)/(h) kitchen
  restriction). OK.

## 10. Minor notes

- `game.js::placeCue` kitchen clamp allows ky = -l/4 exactly (cue center ON
  the head string) and `respotCue` seeds exactly there; WPA 3.10 makes
  playing "from on or below the Head String" a foul when placement is
  restricted. Measure-zero nuance; matters only for the break spawn and the
  8-ball kitchen right.
- Terminal cite is "WPA Sec. 5" (`nineball.rs:177`); the precise clause is
  5.5 ("If he legally pockets the 9-ball on any shot (except a push out), he
  wins the Rack."). Cosmetic, corpus-frozen.
- HUD `lowest` = min over RAW onTable without the positive-id filter
  (`nineball.rs::hud_state`) — known ported quirk, explicitly documented,
  unreachable in normal play.

## Variant-layer mapping (project direction)

The WPA-strict deltas form one coherent selectable layer over `nineball-v1`:
1. push-out (5.4) — pre-shot declaration + 3.2/3.3 suspension + pass-back
   decision (decisions plumbing exists);
2. three-foul loss (5.8 via 3.13) — P15 `Tracked{3}` + warning surface
   (one-pocket precedent);
3. off-table object-ball foul (3.5) — one foul push on non-empty
   `facts.off_table` (+ BallOffTable counting for 2.7);
4. break compliance (5.3(b)/(c)) — P6 `object_rail_count` already scanned
   (8-ball dry-break precedent) + a head-string crossing fact;
5. break placement right (5.3(a)) — a `kitchen` placement grant at rack
   start (plumbing exists for 8-ball break fouls);
6. stalemate (5.9) — ungate the existing decision for nine_ball.
None of these can ship into `nineball-v1` (corpus-frozen); they are
`nineball-v2`/config-layer work sharing the PRE-TDL variant mechanism.
