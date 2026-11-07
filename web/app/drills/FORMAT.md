# Drill task-definition format v1 (issue #66)

`web/app/drills/catalog.js` is the practice-drill task library: pure data +
pure functions, consumed by the `web/app/drills.js` runner and — by design —
exportable as RL curriculum tasks with minimal transformation. This note
states the mapping to the RL-research drill task manifests (internal) and
records every deliberate divergence.

## 1. Envelope mapping (catalog entry ↔ `manifest.drill-*.json`)

| catalog field | rl-research manifest key | notes |
| --- | --- | --- |
| `id` | `generator_id` | web ids are kebab-case (`bu-f1` ↔ `drill-…-v1`) |
| `corpus_id` | `corpus_id` | `DRILL-WEB-<ID>` namespace per drill |
| `base_seed` | `manifest.seeds[corpus_id]` | first 8 big-endian bytes of `SHA-256(corpus_id)` — the namespaces.v2.json derivation, published as hex AND re-derived/cross-checked by `web/tools/e2e-drills.mjs` (the `manifests.py` audit-on-load law) |
| `ruleset` | `ruleset` | `nineball-sandbox` = nineball-v1 judgment consumed by the evaluator only (§4); `ghost9` runs the real `nineball-v1` match; the snake drills run the real `snooker-v1` fold (§1b) |
| `discipline` | `env_config.discipline` (RESERVED) | §1b — absent/`'pool'` = the 9-ball sandbox pin; `'snooker'` = the discipline pin. HONEST mapping note: today's rl-research manifests carry NO discipline axis (every published drill env is the 9-ball sandbox); an RL export of a snooker drill would have to ADD that dimension to the env config — mapping recorded here so the manifest schema change is designed, not improvised |
| `attempt(ctx, k, entrySeed)` | generator (`state_constraints`) | pure function of the attempt index + entry seed; pool layouts in diamond units scaled to the ACTIVE kernel table; snooker layouts in metres on the drift-tested `SNOOKER_LAYOUT` kernel mirror (never the active table — the WPBSA table is not 2:1) |
| `protocol` | `episodes` | `ladder` (BU progressive, 10 shots) / `stations` / `run` / `racks` / `sequence` (issue #80: ordered pot chain over the live discipline fold) / `progressive` / `ten` / `penalty` / `called` / `fourteenone` (issue #119 challenge tier, §5) |
| `objective` (per attempt) | `scoring` | declarative predicate over record/judgment bytes only |
| `maxScore` | grading bound | published before any play (for `lowerIsBetter` drills it is the penalty CEILING, not a target) |
| `cuePlacement` | `state_constraints` placement class | §1a — per-attempt cue-ball placement law (issue #79) |
| `tier` (issue #119) | difficulty axis (RESERVED) | `'intermediate'` \| `'advanced'` \| `'expert'` — on EVERY drill; the picker groups cards by tier and `expert` IS the challenge category. Card order stays deterministic (catalog order within a tier). |
| `lowerIsBetter` (issue #119) | scoring direction | `true` on rotation15 (penalty rating): fewer penalties win. The runner flips best selection + the score chip; persistence stays a plain number (§4). |
| `rating` (issue #119) | rating chart (published data) | `[{max, label}]` bands; the picker best line appends `drills.rating.<label>`. `lowerIsBetter` reads the same chart. |
| `gamePin` (issue #119) | discipline game (RESERVED) | e.g. `'straight_pool'` for century — the runner pins the fold's game SESSION-only (setTransientGame; restored when the drill session ends, §1c), distinct from the `discipline: 'snooker'` PERSISTING pin (§3.6). |

### 1a. Cue-ball placement law (`cuePlacement`, issue #79)

Each drill states its per-attempt cue-ball placement class, set honestly
against the source protocol sheets (#66 research record):

- `'fixed'` (default when absent) — the attempt layout's cue spot IS part of
  the drill (BU ladder stations F1–F4, BU F6 set shots, circle center); the
  runner stays in AIM and the cue ball is NOT draggable pre-shot.
- `'anywhere'` — CB in hand for each laid attempt (BU F5 stun, BU F7 wagon
  wheel, Dr. Dave L drill; since issue #131 the WHOLE lineup 蛇彩 family —
  the owner spec starts every line-up with the cue in hand anywhere, not
  kitchen): after `game.layout()` the runner enters the REAL
  `BALL_IN_HAND` machine state (the aim.js/touch.js place-drag affordance),
  from the same macrotask that laid the attempt — never inside a settle
  dispatch, so flow.js's SETTLED adjudication right is untouched (the
  recorded the ownership ledger carve-out). The laid spot remains the default.
- `'kitchen'` — in hand behind the head string (the 9-ball break of every
  ghost rack, WPA 5.3(a) — 6.3(a) for the ten-ball ghost; rotation15's
  seeded racks; century's 14.1 opening break, WPA 7.3(a)): same affordance
  with the drills-owned `game.placeCue` pre-clamp to
  `y <= -length/4 - 1e-6` — EXCLUSIVE of the head string per WPA 2.1/3.10
  (GH-370 class 2; the grant also re-seats the laid on-line default
  strictly above the line); placement validation (bed clamp, overlap
  snap-to-contact) rides the flow.js-wrapped path, so a drag can never
  disturb object balls.

- `'d'` — in hand ON/WITHIN the D (snooker law, WPBSA Sec3 R5 "Playing
  from In-hand" — the issue #62 erratum: Sec3 R8 is Touching Ball; the D
  boundary is INCLUSIVE, unlike the WPA kitchen; issue #80): same
  affordance riding the frozen `game.placeCueInD` clamp (feature-detected
  — a stale game.js degrades to the baulk-line pre-clamp over flow's
  validated path; the kitchen region strictly contains the D on the WPBSA
  table).

The placement window closes at the stroke (PLAYBACK). Run-drill continues
(kernel rest-position re-lays) never re-grant placement — mid-run the cue
plays where it lies — EXCEPT where the GH-370 class-5 axes grant one:

- `foulPlacement` — the placement class a FOUL re-grant opens (rotation15
  `'anywhere'`: its Dr Dave rule body defers to standard 9-ball rules —
  WPA 5.7 via 1.6, BIH anywhere after any foul; before GH-370 the foul
  re-grant accidentally inherited the break's `'kitchen'` class).
- `postBreakBih` — the placement class granted after EVERY break (the
  ghost convention, ghost9 + ghost10 `'anywhere'`: "After the break, take
  ball in hand and run out, in rotation" — Joe Tucker via
  drdavepoolinfo.com/faq/rating/10-ball/; Dr. Dave rating sheets). The
  ghost10 break SCRATCH is play-on per the sheet: penalty stands, balls
  potted on the scratch spot back on the long string, BIH still granted.
- `voluntaryBih` — the drill's own take-BIH-any-time affordance zone
  (rotation15 `'anywhere'`: +1 penalty per use, the Dr Dave rating's core
  scoring affordance — the dock ✋ button renders only when set).

A zone-bounded grant (e.g. "in hand within the circle") is NOT in the v1
vocabulary; the circle drill stays `'fixed'` (recorded follow-up). The BU
F2–F4 sheets' "vary away from the rail" allowance (a setup-time shift of
the WHOLE shot line, CB ≤ 1 diamond off the rail) is likewise not modeled:
our re-parameterized F2–F4 lines live in the table interior, outside the
allowance's own bound — recorded divergence (GH-370, defensible
re-parameterization). BU F6's 10 stations approximate the official
2-CB-positions × 5-shots structure with 8 distinct spots — recorded
divergence (GH-370; the station list stays `TUNING:`).

### 1b. Discipline contexts (`discipline`, issue #80)

A catalog entry may declare `discipline: 'snooker'`; absent means `'pool'`
(the §3.5 sandbox law, unchanged for every pre-#80 drill). For a snooker
drill the runner:

1. **Pins the discipline** instead of the 9-ball sandbox pin — primary
   path `window.__settings.changeGame('snooker', { skipConfirm: true })`
   (adopts the per-game equipment pairing, rebuilds the visual table over
   the equipment broadcast, re-racks; PIN over refuse, the #68 doctrine);
   fallback on a stale settings.js: `__rules.setGame('snooker')` + the
   `ob:settings` equipment dispatch (the activateSnooker wire shape).
   Recorded consequences — the two pins do NOT share a persistence
   shape: the 9-ball sandbox pin (§3.5, `__settings.setTransientGame`
   since GH-980) is SESSION-only (never touches the persisted settings
   blob, and the drill session's exit restores the game it replaced,
   §1c), while this primary path rides `__settings.changeGame` →
   `set('game')`, which PERSISTS to localStorage: the user's saved game
   becomes snooker across boots and the exit restores nothing (it lays a
   fresh snooker rack, §1c). "Honoring the user's table" is impossible —
   snooker tables are kernel-kind-locked, so the drill always stages the
   WPBSA 12-ft pairing. A session-only snooker pin (the settings.js
   `set('game', id, { persist: false })` / `setTransientGame` shape) is a
   recorded future option, not v1 — it would cost a second table rebuild
   at every exit (the GH-980 decision (a) rationale, §1c).
   Absent seams ⇒ the start is REFUSED (`drills.unavailable`) and the
   pre-pin session mode is restored (no practice-mode stranding); pool
   drills are untouched.
2. **Lays out on the kernel mirror**: snooker attempts receive a ctx
   derived from the drift-tested `SNOOKER_LAYOUT`
   (`dist/pool-sdk/games/layouts.js`, a guarded dynamic leaf import —
   a still-PENDING healthy import is AWAITED by start(), so an
   immediate tap right after install never spuriously refuses; a
   REJECTED/shape-stale import ⇒ snooker drills refuse and
   `__drills.layout()` returns null), never the active table's diamond
   grid.
3. **Runs the REAL `snooker-v1` fold underneath** (the ghost9 precedent
   generalized): after its own `game.layout()` the runner shapes the
   fresh fold to `final_colours` via the sanctioned
   `__rules.setMatchState` seam (flow.js docstring + the ownership ledger drills
   ledger), so the nomination auto-arms (flow's game.shoot wrap) and
   legal ascending pots stay down (R3(h)(ii)). Fouled-in colours respot
   per WPBSA Sec3 R7 — `judgment.respot` carries the ids immediately and
   flow.js applies the pure `snookerRespotPlan` when the R13 play-again
   option resolves (real snooker sequencing: the run is already over, the
   post-drill prompt is the referee's election); the runner NEVER
   duplicates respot math (issue #80 coordination note: a future
   own-spot-line fix in the SDK plan, the #90 wave, is consumed
   automatically through this single path).

`sequence` protocol scoring (recorded): score = colours CLEARED before the
run ends (byte-derived: `order.length` minus the colours the judgment's
`next.onTable` still carries — legal pots stay down, fouled-in colours
return), NOT WPBSA break points (27 for a full snake). maxScore 6. Any
foul or legal dry stroke ends the run; the black's frame end (R4(b))
completes it. There are no re-lay windows: like `racks`, every stroke
belongs to the live fold, and after the terminal the runner deals its own
fresh frame inside flow's WIN window (the RACK_MS law) so the completion
banner survives.

Seed laws shared verbatim (BigInt mirrors, import-time self-checked against
the exact Python vectors — the `seeding.py` doctrine):

- entry seed n = `shot_seed(base, n)` = SplitMix64(base XOR golden_gamma·(n+1)),
  the frozen 017 mix (the RL environment's `seeding.py`, internal);
- layout draws = the `LAYOUT_GAMMA` sub-stream of
  the RL-research drill generators (`generators.py`, internal)
  (`u_k = SplitMix64((entry_seed + LAYOUT_GAMMA·(k+1)) mod 2^64)`,
  unit = `(u >> 11)·2^-53`).

### 1c. The drill session (GH-980 / GH-981 / GH-982)

A drill OWNS the table from `start()` until its session ends — through the
live run and through the parked post-run snapshot (`finished`, GH-133).
The session records what the drill borrowed, and every exit hands back a
table identical to a FRESH entry of the destination (practice idle, Play,
Free practice): table, rules, settings (`__settings.get().game`), layout,
seat and the hall's current card agree.

Pins at start (one row per drill class × table):

| drill | on a pool table (9-ball) | on another pool game (8/10-ball, one-pocket, 14.1, heyball) | on snooker / carom |
|---|---|---|---|
| pool (§3.5 sandbox) | none | `setTransientGame('nine_ball')` — session-only, restored at exit | `changeGame('nine_ball', {skipConfirm})` — PERSISTS (badge "Switches the table to 9-Ball"); nothing restored |
| century (`gamePin`) | `setTransientGame('straight_pool')`, restored at exit | same | persisted 9-ball switch first (badge), then the 14.1 session pin; exit restores 9-ball |
| snooker (`discipline`) | `changeGame('snooker', {skipConfirm})` — PERSISTS (badge); nothing restored | same | carom: same; snooker: none |

GH-980 decision (a) (recorded on the issue): a pool drill on a non-pool
table switches persistently, mirroring the #80 snooker leg —
ONE table rebuild, and the badge's promise is literal. A drill → drill
switch (picker or the dock's restart) keeps the FIRST drill's borrow, so
the exit still restores the game the user came from; a persisted switch in
between clears it.

Exits — each runs `endSession()` (drills.js): the borrowed game comes back
through the settings layer SYNCHRONOUSLY at the session's end (only while it
is still the drill's pin, no shared replay holds the table and no other
settings transaction — a live atelier preview, a table request still
building — is in flight; otherwise the pin lingers, consistent with the
rules, until the next game pick or reload), then, deferred, `__rules
.newMatch()` + a fresh rack on the active seed (breaker seat 1 — never the
run's turn holder). The deferred rack carries the table-ownership
generation it was queued under and stands down at run time once any newer
owner took the table — a re-rack or a layout (the atelier's Try it lays its
two-ball comparison right after the `changeMode('playground')` that ended
the session; review r1 P2), a new session, or a shared replay. The restore
itself resolves a microtask later (game.setGame awaits the games module),
so a layout laid in the same task folds under the pinned game; when the
restore lands after such a layout — still the latest table, no shot since
— the exit re-folds it for the restored game (`__rules.refold()`: rules,
fold, hud title; no ball moves; review r2 P2). Exits:
dock Stop / `__drills.stop()`; any `changeMode` away from practice (Play,
Free practice); a foreign re-rack (Re-rack, a game/equipment switch — only
a restored game re-racks again, the foreign rack already replaced the
layout); a refused/aborted start after its table changed. A foreign
scripted LAYOUT keeps its table and the pin (its owner decides) — also
when it lands while a start is awaiting its pins: the start refuses and
never lays the drill over it. Pre-fix:
the pool pin went straight to `__rules.setGame` (values.game kept the old
game, so the hall's current card was a dead click), nothing restored it,
and every exit left the drill layout under the 9-ball fold, whose
full-rack `onTable` could never end the frame.

Start gates (GH-981) — a drill start is a table change like any game
switch: `start()` (every caller) refuses outside the QUIET stages
(AIM / BALL_IN_HAND / WIN) with `shell.notice.busy` and, outside a drill
session, on a pending decision of a progressed rack with
`shell.notice.decision` (settings.js decisionConflict, GH-541 ruling 7);
the user openers (toolbar pill, dock, hall) refuse a busy table too. The
USER start paths (picker card, practice place Last drill) then ask the
kit consent `__drills.startConsent(id)` names: a live run → "Switch
drills?" (the same drill → the dock's "Restart this drill?"); a
progressed game outside the sandbox → "Leave this game?". Cancel is a full
no-op; a pristine rack or a parked snapshot starts with no prompt. The api
stays dialog-free (the changeGame `skipConfirm` law).

## 2. Objective vocabulary (the objective-evaluator law)

Verdicts derive EXCLUSIVELY from kernel record/judgment facts — the rl-env
`smoke.py` law; no physics is re-derived in JS (constitution P-II):

- `pot {ball, pocket} | {count} | {count, pocket}` — `BallPocket {ball,
  pocket}` events. With `pocket` beside `count` (issue #131, the L/diagonal
  only-pocket law) the WHOLE stroke is restricted to the designated pocket:
  any object ball dropped elsewhere fails the attempt (reason `pocket`);
- `firstContact` — first `BallBall` event involving ball 0;
- `noScratch` — no `BallPocket`/`BallOffTable` for ball 0;
- `noCueOff` (GH-384 review r2) — no `BallOffTable` for ball 0 ONLY: the
  narrower word for drills whose sheet allows the pocketed-cue scratch
  (BU F1 "you are allowed to scratch") while staying strict on the
  distinct driven-off-the-table foul the sheet never mentions;
- `noCueCushion` — zero `BallLinearCushion`/`BallCircularCushion` events for
  ball 0 (the catalog's cushion whitelist, empty);
- `needFootCushion` (GH-384, BU F5 positions 5-7) — the mirror constraint:
  ball 0 MUST contact a FOOT-end cushion AFTER its first object-ball
  contact ("the CB must rebound off the end rail" describes the post-stun
  drift; a pre-contact bank off the foot rail from the in-hand address
  never counts — review GH-384 r1). Byte-derived: pre-contact cushion
  events are skipped, then each cue `BallLinearCushion {seg}` /
  `BallCircularCushion {arc}` event resolves against the record's OWN table
  geometry (`initial.table.linear[seg].p1/p2`, `.circular[arc].center`); a
  foot-end segment/arc has all its geometry beyond `+length/4` (the foot
  nose + its corner facings/jaws sit at ~`+l/2`, while a long-rail segment
  reaches a side pocket at y≈0 and is disqualified by its min endpoint).
  Fail reason `norail`; same precedence slot as `noCueCushion` (path laws
  before the pot block);
- `cueRest {circle | rect}` — cue rest position from the kernel sampler at
  `recordDuration` (paper-target rect 0.68×0.88 diamond units; ghost-ball
  tolerance 0.18 diamonds). A rect authored under a "within or OVERLAPPING
  the target" source law (BU F3/F5 letter) carries `overlapR` = the ball
  radius (GH-384, bu-f5): the evaluator then runs the TRUE circle-vs-rect
  overlap test (clamped distance to the rect ≤ r — the rounded Minkowski
  sum; a square-corner half-extent inflation would falsely admit centers
  diagonally off the paper corners);
- `containCue {circle}` — a `sample(t)` walk over `[0, duration]` through the
  shipped kernel sampler (the sanctioned surface), evaluated ONCE at settle,
  never in the frame loop;
- rack drills (`ghost9`) — `window.__rules` judgment bytes (legal, pocketed,
  terminal) of the real nineball-v1 referee;
- `sequence {order}` (issue #80) — `window.__rules` judgment bytes of the
  real snooker-v1 referee: `legal`, `next.onTable` (progress = colours off
  the table), `terminal` (the R4(b) frame end). Order enforcement is the
  fold's own law — the wrong-first-ball / not-on-pot fouls of the judge ARE
  the out-of-order verdict; the runner re-derives nothing.
- `rotation {true}` (issue #119) — the required first contact is the LOWEST
  object-ball id still on the table, so it is DYNAMIC: the runner tracks the
  on-table set from kernel `sample(t)` rest positions and compares
  `analyze().firstContact` against that lowest id (not the static
  `objective.firstContact` the generic evaluator keys on). Still purely
  record-derived (P-II); used by `progressive` / `ten` / `penalty`, and —
  issue #131 — by `run` drills whose objective carries `rotation: true`
  (the lineup 蛇彩 family). Order-encoding law: a variant's clear order is
  encoded as ID PLACEMENT (ids ascend in clear order), so this one dynamic
  predicate machine-checks every order variant (foot-end-up,
  ends-to-middle, middle-to-ends — on the center string AND the lateral
  row — random-by-number, the L's corner-outward alternation, the
  diagonal's pocket-nearest-first). A wrong-order first contact ends the
  run (reason `contact`); precedence: scratch > `pocket` > contact >
  everything else (issue #131 review finding 4 — a stroke that both drops
  a ball in a non-designated pocket AND wrong-first-contacts keeps the
  evaluator's `pocket` verdict, so the user-facing fail hint names the
  only-pocket law it broke; the contact override never re-labels it).
- `cleanContact {true}` (issue #134, the lineup 蛇彩 family's BASE rule) —
  after the cue ball's FIRST `BallBall` event, ANY further `BallBall` event
  involving ball 0 fails the stroke (reason `crash`); still a pure count of
  kernel record bytes (`analyze().cueContacts > 1`, P-II). Cue↔cushion
  contact stays legal (no interaction with `noCueCushion`). Recorded OWNER
  BOUNDARIES: (a) the scope is CUE-BALL-ONLY — object-ball-to-object-ball
  disturbance is NOT a fail (the owner scoped the rule to the cue ball);
  (b) the literal count>1 predicate also fails a DOUBLE-KISS on the
  designated ball (a second cue↔ball-N contact reads exactly like a crash
  into a neighbour — accepted as the machine-checkable reading). Precedence:
  the check sits AFTER the pot block and BEFORE `containCue` in the
  evaluator, so scratch > `contact` > `cushion` > `pocket` > miss > `crash`
  — a dry stroke reads `miss` before the crash word is consulted, and the
  `rotation` override's `contact` relabel (GH-131 finding 4) outranks
  `crash`. Consumed by the generic evaluator (`run` kind) AND mirrored in
  the `progressive`/`called` settle handlers (same gate, same precedence;
  `called` demotes a would-be pass only).
- `called {true}` (issue #119, lineup-called) — a drills-OWNED pocket
  nomination (`window.__drills.call(ball, pocket)` → `active.pendingCall`,
  armed per stroke, cleared at the stroke), checked against the
  `BallPocket {ball, pocket}` bytes. The nineball sandbox fold exposes no
  `call()` (flow.js gates it on `eightActive || fourteenoneActive`), so the
  drill owns the nomination itself (§3.8, OWNER-CONFIRMED). The player
  actually calls through the EXISTING ball+pocket affordance: while a called
  drill is live, `aim.js deriveNomination` surfaces the same pocket markers +
  legal-target rings it renders for the call regimes (all object balls on the
  table are legal targets — a run-out), and `driveCallSurfaces` routes the
  composed `{kind:'call', ball, pocket}` to `window.__drills.call` — so the
  pocket-marker click (desktop), the touch tap-up, AND the touchwidgets picker
  all feed the drill through one seam, no new nomination UI. Un-nominated
  strokes are SLOP: counted, streak reset. A dry / scratched / wrong-called-
  pocket stroke ends the run.

## 3. Recorded divergences (web layer vs perfect RL alignment)

1. **Layout functions, not generator ids**: v1 web layouts are JS functions
   in the catalog (mostly FIXED diamond placements; the BU sheets'
   approximate coordinates are parametric with `TUNING:` comments). An RL
   export would register each as a generator manifest; the seed plumbing is
   already identical so only the envelope serialization is new.
2. **Rack-seed domain**: rack drills fold the u64 entry seed into the app's
   rack-seed bound (`entry_seed mod 2^31`, share-codec `MAX_RACK_SEED`) —
   the kernel rack constructor and the share codec cap rack seeds there.
3. **Ghost ball-in-hand (DELIVERED by GH-370)**: the official rating rules
   grant ball in hand after EVERY break, and since GH-370 the web runner
   grants it — ghost9 and ghost10 declare `postBreakBih: 'anywhere'`
   (§1a), so a legal continuing break re-opens the placement affordance
   with the full-table zone (the pre-370 "recorded follow-up" is closed;
   rating scores are now earned on the same surface the source charts were
   calibrated against). Scoring is otherwise the official table (any
   post-break miss/foul loses the ghost9 rack, a legal 9 wins; ghost10's
   break scratch is play-on per its sheet — see §1a).
4. **task-config `kind:"drill"`**: RESERVED in feature 022 (internal spec) (P-VII — admitted
   only with its consumer). This format is shape-compatible; compiling into
   the envelope is the recorded second increment, not v1.
5. **Sandbox semantics** (decision, recorded per issue #66 law 6): layout
   drills run over the ACTIVE nine-ball flow — the nineball-v1 judge is
   per-record/stateless, the drills runner consumes its judgment bytes
   read-only, and after every settle the runner re-lays the next attempt
   (or the kernel rest positions on run-drill continues), which supersedes
   any hotseat routing (respots/ball-in-hand) before the next stroke. The
   share codec is untouched in v1 (no wire changes; drills stay out of
   share links — recorded follow-up). Since issue #80 this law is
   PER-DRILL: an entry's `discipline` field supersedes it (§1b) — the
   snake drills judge over the real snooker-v1 fold, everything without a
   `discipline` field keeps the 9-ball sandbox byte-for-byte.
   **Terminal gate (issue #138)**: the sandbox law now includes flow.js's
   narrow match-terminal gate. While a SANDBOX-kind drill is active
   (`state().sandbox === true` — the liveFold complement:
   `run`/`ladder`/`stations`/`called`/`progressive`/`ten`/`penalty`),
   flow SKIPS the match-terminal surfaces on a judged terminal (no winner
   banner, no play_again decision, no WIN transition, no auto re-rack —
   "9 potted = rack over" is nonsense under a 15-ball line-up) and the
   stroke lands as a plain settle; the drill's own evaluator/re-lay owns
   the run. Fouls/scratches KEEP adjudicating (fail signals +
   cue-in-hand). Fold-observer kinds (`racks`/`sequence`/`fourteenone`)
   expose `sandbox: false` and keep their REAL terminals (ghost9 reads
   `gameOver`, the sequence winRelayTimer requires the machine WIN,
   century reads `terminal`). The suppressed terminal still lands in the
   judgment ledger; the `[flow] drillTerminalSuppressed` console mirror
   is the e2e wire.
   **Issue #209 addendum — the gate covers the POST-COMPLETION parked
   state (GH-138 x GH-133 reconciliation)**: the #138 gate originally read
   `sandbox === true && done !== true`, so once a sandbox drill COMPLETED
   (`done === true`, the GH-133 `finished` snapshot the dock replay/reset
   register keeps) the suppression stopped — the still-pinned 9-ball fold
   went live and a continued shot potting the 9 leaked a spurious "PLAYER
   WINS" (issue #209 Bug 2). The gate is now `sandbox === true` ALONE
   (flow.js `drillSandboxActive`): the invariant is "the 9-ball fold is
   never the live adjudicator once a sandbox drill has run in the session".
   Two runner-side guarantees keep the relaxed gate from bleeding into a
   REAL match: (a) a genuine game/discipline switch while a drill is parked
   clears `finished` in the drills `stateChange` foreign-rerack guard (a
   settings `changeGame` seed-rerack), and a mode switch away from practice
   clears it via `stop()`; (b) a REAL continued shot after completion is an
   implicit play-again — the runner SOFT AUTO-RESETS (option b): the
   `shotComplete` hook, when `!active && finished.sandbox === true`,
   schedules `restartRun(finished.id)` from a MACROTASK (never inside the
   settle dispatch — the SETTLED-ownership carve-out), re-laying the fresh
   attempt-0 run. The GH-133 completion banner + dock Reset/↻ are
   untouched; continued PLAY simply re-lays instead of leaking a terminal.
   **GH-680 addendum (2026-09-06) — the gate covers the WHOLE decision
   path, not the terminal alone**: under a non-rotation objective (the
   Circle drill) a stroke that potted a ball off a first contact other
   than the 1 read "Success" from the drill AND "FOUL — wrong ball first"
   + BALL IN HAND + a cue revive at the head spot + a P2 rotation from the
   still-adjudicating 9-ball fold; a drag inside that 1.4 s in-hand window
   out-lived the drill's fixed re-lay. The "fouls/scratches KEEP
   adjudicating" clause above is WITHDRAWN: while `state().sandbox ===
   true` (live or parked) flow.js records the honest judgment-ledger row
   and lands EVERY stroke as a plain AIM settle (`settleUnderDrill`) — no
   `foulCalled`/`playerChanged`/`gameWon` hooks, no turn switch, no
   respot, no in-hand right, no cue revive; `[flow] drillFoulSuppressed
   {fouls}` joins `drillTerminalSuppressed` as the e2e wire. The sandbox
   kinds never read the fold (evaluate/analyze are record-byte-derived)
   and own their cue: re-lays re-seat a pocketed cue, foul re-grants ride
   `grantPlacement`, and `complete()` now revives a cue the run-ending
   stroke pocketed (no re-lay follows a completion); flow.js revives a
   pocketed cue itself only under the PARKED snapshot (`done !== false`).
   Fold-observer kinds are untouched. Proof: e2e-drills arm 26 (+ the
   match-path control). **Review r1 P1 (2026-09-06) — the in-app Replay
   rides the same law**: `routeReplay` takes a sandbox arm ahead of the
   match fold's restoration (no fold respots under a sandbox drill; the
   replayed stroke re-lands as the plain AIM settle), reviving a pocketed
   cue only under the PARKED snapshot — a replayed run-ending scratch had
   fallen through to the AIM routing with the cue still down (the fold
   revives only for BALL_IN_HAND, and this runner ignores the duplicate
   record). A LIVE run's replay-identity branch above still re-runs its
   own re-lay / re-grant. Proof: e2e-drills arm 27.
6. **Snooker discipline pin one-way + no D-zone foul continue** (issue
   #80): the pin persists the game switch and stop restores no game
   (§1b.1) — the session's exit lays a fresh snooker rack (§1c). A foul ENDS a sequence run, which sidesteps the post-foul
   continue hazard entirely (a rest-position re-lay after a foul would
   undo flow's applied respots — any future continue-after-foul design
   must merge `judgment.respot` placements and `__rules.decide()` from a
   macrotask first, recorded follow-up).
7. **ghost10 ten-ball rack: JS-laid, no kernel `ten` kind** (issue #119
   path (a)). `KERNEL_KIND_RACK_BALLS` carries only nine/fifteen/snooker/
   carom — there is no `ten` rack constructor and no tenball-v1 fold. The
   drill lays its own four-row ten-ball triangle (`catalog.tenRack`) over a
   fifteen-ball ballset (`rerackKind('fifteen', 1)` supplies ids 0..15; ids
   1..10 are used) via `game.layout()`, and evaluates rotation + scratch in
   the drills sandbox evaluator. No new kernel fold, no wasm rebuild — the
   owner-gated determinism binary is untouched. Rack loop caveat: `layout()`
   does NOT reset `game.shotIndex` (only `applyRack` does), so the ghost9
   `shotIndex <= 1` break idiom is INVALID here — ghost10 keeps its OWN
   per-rack `shotInRack` counter. Call-pocket is DEFERRED (see §3.8).
8. **Called-shot nomination is drills-owned (OWNER-CONFIRMED); call-pocket
   deferred for ghost10** (issue #119). The nineball sandbox fold exposes no
   `call()` (flow.js gates the nomination on `eightActive() ||
   fourteenoneActive()`, snooker on `snookerActive()`), so lineup-called owns
   its own nomination (`window.__drills.call`, §2 `called`). The
   drills-owned seam is the confirmed approach; it is now REACHABLE through
   the shipped ball+pocket affordance (aim.js surfaces the nomination for a
   live called drill and routes the composed call to `window.__drills.call` —
   §2 `called`; recorded reverse-coupling in the ownership ledger). ghost10's
   "all-called" call-pocket uses the SAME gap but is a recorded FOLLOW-UP for
   v1: ghost10 scores rotation + scratch only (both byte-checkable from
   records). The beat-your-score meta-ladder for lineup-called (slop → called
   → called + noCueCushion → two-rack 30) is likewise a recorded follow-up:
   v1 ships the machine-checkable single-run counted score (slop counts,
   CALLED pots build the streak) + the ob-drills-v1 best.
9. **century pins straight_pool SESSION-only (OWNER-CONFIRMED)** (issue
   #119). Unlike the #80 snooker pin (which PERSISTS the game across boots,
   §3.6/§1b.1), century pins `straight_pool` via
   `window.__settings.setTransientGame` (`persist:false`) — 14.1 shares the
   ACTIVE 2:1 pool table, so a persisted switch would be a surprising side
   effect of tapping a drill, and the session-only shape restores the user's
   saved game on the next boot (the confirmed choice over #80's persisting
   pin). ctx = `layoutCtx` (the active pool diamond grid), NOT the snooker
   mirror. The drill is a pure OBSERVER of the real fourteenone-v1 fold (the
   ghost9/sequence pattern): it reads `__rules.matchState().run` as the high
   run and never re-lays under the live fold (a rest-position re-lay would
   undo the fold's continuous respot/re-rack plan — the §3.6 snooker hazard).
   The OPENING break is exempt from the miss/foul terminal (WPA 7.3: a legal
   14.1 break is a no-pot safety — legal, zero pocketed; the ghost9/ghost10
   isBreak law, keyed on the first observed settle so it survives the fold's
   own continuous re-racks): a LEGAL break plays on, and only a foul on the
   break, a genuine miss/foul once play has started, or the fold terminal
   ends the visit. Refuses cleanly (restoring the pre-pin mode) when the
   rules registry or straight_pool seam is absent.

10. **The lineup (蛇彩) family geometry law + retained `lineup` id** (issue
    #131). The owner's on-device verdict found the shipped half-BALL-gap
    line unplayable (half the table span, no potting angle on the 1-ball);
    the whole family now lays the owner's AUTHORITATIVE geometry:
    half-DIAMOND spacing on the center long string (14 × 0.5D = 7D span
    centered on the 8D length), cue ball in hand ANYWHERE at the start,
    cleared in placement order from the foot end up (`rotation` on the
    `run` objective, §2). Recorded decisions: (a) `lineup` KEEPS its id so
    `ob-drills-v1` bests survive — pre-#131 bests were earned on the old
    unplayable layout and an easier any-ball law (accepted semantics
    change); (b) NO separate 'free line-up' card ships — the picker stays
    lean and the any-ball register survives inside `lineup-called`'s
    nomination law; (c) `lineup-random`'s shuffle draws EXACTLY
    `layoutUnit(entry_seed, k)` for k = 0..13 (a Fisher–Yates over the 15
    slots, fixed draw indices) so `__drills.layout(id, k)` stays
    byte-identical across boots for every k; (d) the lateral row derives
    its c2c gap from the cushion-inset span ((4 − 2·0.35)/14 D — 15 balls
    cannot fit the 4-diamond width at 0.5D), and the owner's 1–2-diamond
    difficulty-ladder row shift is a recorded follow-up knob (`LAT_DY`);
    (e) the lateral row carries the SAME owner order variants as the
    center string (#131 review finding 1 — 横向一排"同样地可以从一头清到
    另一头, 或者两头到中间, 中间到两头"): `lineup-lat-e2m` /
    `lineup-lat-m2e` permute id placement over the identical row slots,
    nothing else; (f) **the play-count-k rule** (#131 review finding 2):
    the runner derives a `run`-kind attempt's index k from the PERSISTED
    play count (`ob-drills-v1` `plays` — the run's latched assist mode's
    since GH-200, §4; written only by a completed run), so play n lays
    `attempt(ctx, n, shot_seed(base, n))` —
    `lineup-random` gets a FRESH permutation every play (the owner's
    random-row variety) while each layout stays a pure function of
    (drill_id, k, entry_seed): byte-stable per k across boots, and
    reset()/void/replay re-lays re-derive the SAME k mid-run (plays is
    untouched until complete()). Every other `run` drill ignores
    k/entry_seed in its generator, so the rule is layout-neutral there;
    `progressive` keeps k = N and every other kind keeps its own index.
    **Issue #134 addendum — the clean-contact BASE rule**: every family
    member (the nine `run` variants, `progressive-lineup`, `lineup-called`)
    carries `cleanContact: true` (§2) — after the pot, the cue ball must not
    touch another ball; any such contact ends the run with reason `crash`
    (the strict line-up convention from #131's research addendum). The
    #134 re-pin: `lineup-diagonal`'s default cue flipped from the −55° to
    the mirrored +45° cut side — from the old side the post-pot tangent ran
    INTO the line, so every probed stroke from the default address crashed
    (offline sweep, `web/tools/find-lineup-recipes.mjs`).
    **Issue #136 addendum — owner geometry corrections (photo-confirmed)**:
    (a) `lineup-l` REBUILT to the owner photo spec — the shipped
    rail-hugging L at the foot-left pocket was the wrong shape. The corner
    ball (id 8) sits ON the center string 2 diamonds off the foot rail
    (pt(2, 6), the foot spot); leg A (ids 1..7) runs from just above the
    FOOT-RAIL MIDPOINT up the center string to the corner, leg B (ids
    9..15) from the corner across to the right long rail — 7 balls evenly
    over each 2-diamond leg at the uniform step (2D − m)/7 with m = the
    clampBed margin r + 1e-3, so the far-end balls sit AT the margin
    beside their cushions (the leg-end law imports r into a previously
    pure-diamond layout). The L thus WRAPS the quadrant CONTAINING the
    foot-right pocket (kernel pocket 5 — 围住 that corner pocket); ALL 15
    balls pot ONLY into the enclosed pocket (`pot.pocket 5`), and the
    clear order is END-TO-END (leg A far end → corner → leg B far end)
    encoded as ID PLACEMENT. (b) The lateral row's gap law supersedes
    (d)'s 0.35D end insets: the owner observed the end balls sitting
    farther from the cushions than balls sit from each other, so the row
    is now FULLY UNIFORM — 15 balls make 16 EQUAL gaps (14 inter-ball +
    the 2 cushion-to-end-ball gaps), g = (w − 15·ball_d)/16, slot center
    x = −w/2 + g + r + s·(2r + g). The FORMULA is the law (r-dependent,
    no longer pure diamond units): it computes ≈ 25.8 mm on the kernel
    9-ft table — the issue's "≈ 16.4 mm" aside does not reproduce and was
    not tuned toward. End gap == inter gap by construction (asserted in
    the e2e arm-16 layout checks).
    **Issue #177 addendum — the L's ends-to-middle hard variant**:
    `lineup-l-e2m` (EXPERT) lays the IDENTICAL #136 L (same slots, same
    default cue, same enclosed-pocket-5 objective) under the alternating
    id-placement permutation — the (e) mechanism (`lineup-lat-e2m`)
    applied to the L. Shot order over the L's slots (slot 1..7 = leg A
    far end in, 8 = the corner, 9..15 = leg B corner-out) is
    1,15,2,14,3,13,4,12,5,11,6,10,7,9,8 — both leg FAR ENDS alternate
    inward and the CORNER ball is potted LAST (owner verbatim: 现在的15打
    第2杆, 2打第3杆, 14打第4杆, …, 8打第15杆). Encoded as ID PLACEMENT:
    odd ids walk leg A far-end-in (slot (i+1)/2), even ids walk leg B
    far-end-in (slot 16 − i/2); id 15 lands on the corner slot. Ball 1
    keeps slot 1, so `lineup-l`'s pinned first-ball recipe replays
    byte-identically (re-verified offline, `find-lineup-recipes.mjs`,
    cueContacts === 1) and the only-pocket red leg is shared.
    **Issue #209 addendum — `lineup-diagonal` any-pocket reduction +
    run-ended labeling**. (a) The diagonal designated ONLY pocket 5
    (`lineupObjective(5)`), but pocket 5 sits on the diagonal's OWN
    collinear extension — the A→B line (pt(3.4,6.8)→pt(0.6,1.2)) IS the
    pocket-5 ray, so every pot into pocket 5 runs ALONG the packed line: the
    ghost-ball contact point for each ball sits ON the line (behind it,
    where the next ball waits) and after contact the cue is driven along the
    line into a scratch (toward the pocket) or a crash (back into the pack).
    The first ball is openable but the run is NOT clearable into one pocket
    (offline probe: a dense greedy search stalls at ≤5/15 into pocket 5, the
    same wall as the sibling only-pocket L; a full 15-leg one-pocket chain
    is beyond the offline prober), and a real player's natural straight shot
    from the awkward cut default sent ball 1 OFF pocket 5 into a
    non-designated pocket, failing the only-pocket law and ending the run at
    0/15 (owner Bug 1). The recorded difficulty reduction: the diagonal now
    runs the family BASE any-pocket law (`lineupObjective()`, like
    `lineup`) — each ball drops in its nearest pocket in rotation order
    (cleanContact still applies), so the first natural pot SCORES and the
    run continues instead of dead-ending at 0/15. What is DEMONSTRATED is
    the reduction it was made for: the diagonal is OPENABLE, the first
    natural pot scores and the run continues (e2e arm 16c), and a short
    finish parks with the correct RUN ENDED label (arm 19e). It is NOT
    proven to a full 15/15 any-pocket clear — the `lineup` CHAIN19 proves
    the STRAIGHT lineup to 15, but the packed diagonal (c2c ≈ 0.447D) has
    no offline probe walking it to a 15-ball any-pocket clear (the greedy
    one-pocket search above stalled at ≤5/15, and no any-pocket 15-leg
    chain was probed). `id`/`corpus_id`/`base_seed` and the A/B
    geometry are FROZEN (ob-drills-v1 bests + the arm-3 byte identity + the
    SHA-256 audit survive). The only-pocket law is still exercised by
    `lineup-l`/`lineup-l-e2m` (pocket 5, fed at an angle). e2e arm 16c flips
    from the only-pocket-red assertion to the any-pocket GREEN continuation
    (RED on pre-#209 main: the 0/15 dead-end). (b) **Run-ended vs complete
    labeling**: `complete()` reaches BOTH a full clear AND a failed early
    run-end for the clear-goal kinds (`run`/`called`). A completion with
    `score < protocol.balls` now holds `drills.runEndedBanner`
    ("RUN ENDED — N/max", ×7 locales) instead of `drills.completeBanner` —
    the owner's "complete 0/15" mislabel. Rating/rack kinds (ladder /
    stations / progressive / ten / penalty / sequence / fourteenone) have no
    clear goal and keep `completeBanner`. A failed run still writes
    `plays + 1` and seeds `best = score` (recorded — the GH-131 finding-2
    run-k index counts every completed run; unchanged).

11. **bu-f7 wagon wheel plays a VIRTUALIZED spoke law, not the BU Exam I
    F7 law (GH-371 recorded divergence; audit 2026-08-05)**: the official
    sheet scores 2 attempts at each of 10 REAL rail target balls — success
    = pot the OB (a short side-pocket pot) AND the cue ball HITS the
    current target ball, at most one adjacent rail-first cushion en route,
    1 point per attempt, /20. The shipped drill instead runs 10
    single-attempt stations scoring pot (1) + cue REST within 0.5 diamonds
    of a VIRTUAL spoke point (1), with a foot-corner pot and no path
    constraint (`WHEEL_TARGETS_D`/`WHEEL_TOL_D`, the `cueRest+zoneOptional`
    objective). An in-app /20 is therefore NOT comparable to a real BU F7
    /20 (the rl extraction pipeline scores real exam videos under the
    official law). The faithful overhaul (ordered cue-contact ids + a
    `cueHits` predicate + the cushion gate + 2x10 stations over real
    target balls) is the recorded follow-up on the GH-371 closing
    checklist; until it lands, catalog.js's TUNING comment names this
    ledger row instead of implying BU fidelity.

12. **GH-384 drill-family convention rulings** (owner-ordered, build 17;
    ruling policy: where sources diverge pick the most authoritative/
    consistent convention and record the rejected variant; where sources
    are silent keep current behavior and document the silence; NO invented
    rules).
    - **lineup-lat-m2e mid-run BIH — once, not per shot.** Sources diverge:
      the mypoolblog PPP sheet (the lateral-row layout source) re-grants
      ball in hand on EACH shot; the 蛇彩 convention (the source of the
      middle-to-ends order itself) grants one opening in-hand placement and
      then continuous position play. CHOSEN: once at the start — the
      register every other line-up source states (billiards101, Billiard
      Gods, the historic Line-Up game), the family law (§1a) and the GH-131
      owner spec. REJECTED: the PPP per-shot re-grant (a positional-aiming
      register, not a run-out). No behavior change; citation at the catalog
      entry.
    - **Clean-contact 'crash' scope — cue-ball-only count.** Sources
      diverge: billiards101's ambiguous "No contact with other balls" vs
      billiardsforum's operational "cue ball hits more than 1 ball per
      shot". CHOSEN: the billiardsforum cue-ball-scoped count — machine-
      checkable, the GH-131 addendum's adoption, consistent with the
      §2 owner-recorded CUE-BALL-ONLY boundary (double-kiss-fails literal
      reading kept). REJECTED: the any-disturbance reading (object↔object
      adjudication has no stated rules in any source). No behavior change.
    - **lineup-called reset scope — triggers 1-3 of the BilliardsForum
      instructor drill** (miss-desired-pocket / scratch / cue contacts >1
      ball). REJECTED: trigger 4 (object↔object or object→cue crash) —
      inconsistent with the family-wide owner-scoped cue-ball-only law; a
      single forum source does not overturn a recorded owner scope. The
      slop register stays the §3.8 recorded v1 boundary (unchanged by this
      ruling). No behavior change.
    - **lineup-l scratch handling — run ends (kept).** billiards101 is
      SILENT on scratches; the strict billiardsforum convention (GH-131
      addendum) ends the run on a scratch; no source grants mid-run ball in
      hand. The family `noScratch` is that adopted convention. (lineup-l's
      frozen-to-cushion placement note is OWNED by the GH-370 phase-1 lane
      — class 3 frozen-placement snap-to-contact — and is not ruled here.)
    - **bu-f1 seven-station geometry — the sheet's diagram points.** The
      parametric 5°..65°@2D cut ladder (recorded TUNING approximation) is
      replaced by the F1 diagram stations measured off the published sheet
      (±1/8D): CB stations AT long-rail diamonds 1-7, one diamond off the
      rail; OB one diamond off the opposite long rail, "one ball gap" to
      the end cushion (center 3r off the nose); mirrored onto pocket 2
      under the sheet's mirror allowance. `protocol.start: 4` + the
      maxScore-10 diploma cap per the sheet ("Start with the cue ball in
      position 4"; "The maximum total score allowed is 10"). Persisted
      bests carry over (the §3.10(a) recorded-semantics-change precedent).
    - **bu-f1 scratch law — allowed, per the sheet's letter.** The F1
      diagram states "you are allowed to scratch": `noScratch` is REMOVED —
      a stroke that pots the OB and scratches advances the ladder. The
      sheet is SILENT on the cue driven OFF the table (a distinct foul):
      that keeps the pre-384 strictness via the narrower `noCueOff` word
      (§2; GH-384 review r2 — the scratch allowance must not legalize it). Class
      contrast, per sheet letter: F6 explicitly bans ("You are not allowed
      to scratch", kept), F3's diagram says "without scratching" (its
      noScratch kept as letter), F2/F4/F5 are silent (noScratch kept as
      current behavior — documented silence; operationally equivalent to
      their zone laws, since a pocketed cue has no rest position).
    - **bu-f2-f4/f6 hand-placement allowances — recorded N/A in-sim.** The
      sheet's F2-F4 "vary the CB and OB positions away from the rail (CB
      within one diamond of the rail)" and F2/F4 "position 1 → place the CB
      anywhere between positions 1 and 2" are ergonomic relief laws tied to
      the sheet's rail-adjacent station line, which the F2-F4 parametric
      approximation does not stage, and a zone-bounded in-hand grant is not
      in the v1 placement vocabulary (§1a recorded follow-up). They become
      live obligations if F2-F4 adopt the sheet line. F6 grants no hand
      placement (fixed stations — kept 'fixed').
    - **bu-f5 — realigned to the sheet's law.** The ladder moves the TARGET
      (start 4, seven positions, cap 10), the OB is fixed one ball below
      the table center (pot = the side pocket; the stun tangent runs down
      the CENTER STRING), targets 1/2/3 = paper centers at long-rail
      diamonds 5/6/7 on that string, 5/6/7 the same papers after the
      END-RAIL rebound (`needFootCushion`, §2), position 4 long-edge
      against the foot cushion; success = pot + CB "within or overlapping"
      the paper (the rounded circle-vs-rect overlap test, `overlapR`).
      RULED: the sheet's "must head straight to the target" (1-3) reads
      OPERATIONALLY as the cushion law — the human-administered exam
      judges the route by cushion contact, and every legitimate stun
      drift arcs slightly while residual spin decays, so a literal
      path-straightness predicate would fail honest strokes; a
      masse-curve exploit is a recorded non-goal. The rebound predicate
      counts POST-CONTACT cushions only (a pre-contact bank off the
      foot rail from the in-hand address never satisfies the path law).
      Replaces the pre-384 inverted CB-ladder onto one fixed target
      with all cushions banned (recorded TUNING approximation).
    - **bu-f7 wagon-wheel law — NOT ruled here.** Owned by the GH-371
      lane (its scope item 5; GH-370 phase 1 deferred it) and LANDED as
      §3.11 above — the virtualized spoke law is the recorded divergence
      and the faithful 2x10 real-target overhaul is that lane's recorded
      follow-up; skipped here with citation per the GH-384 lane order.

## 4. Persistence

`localStorage['ob-drills-v1']` — one versioned JSON blob
`{ v: 2, last, drills: { [id]: { [assist]: { best, plays, ts } } } }`, written
only after user-initiated drill activity (never at boot — the issue-#14
hermetic-boot doctrine; `e2e.mjs` asserts empty localStorage on scripted
boots).

**Assist-keyed records** (issue GH-200). `assist` ∈ `off | standard |
practice` — the settings.js aim-assist axis (`ASSIST_LEVELS`, mirrored in
drills.js as `ASSISTS`; drills.js may not import settings.js, so the values
ride the `window.__settings` seam + the `ob:settings 'assist'` broadcast). A
full-assist clear and a no-assist clear are different difficulties, so
`best`/`plays`/`ts` live under `{drill_id, assist_mode}` and never see each
other. A run LATCHES the assist mode it started under; a mid-run flip only
ever ESCALATES to a more-assisted level (never de-escalates) — the score is
credited against the easiest assistance that touched the run. Every
displayed best (picker card, settings recent cards, the completion banner's
` · ` assist tag — JS punctuation, the GH-144 chips law) is the CURRENTLY
selected assist mode's; recent-drill recency still ranks by the newest `ts`
across ALL modes (most-recent play regardless of mode). Seam split:
`__drills.bests()` stays the flat pre-200 shape as the ACTIVE mode's
projection (older consumers degrade safely); `__drills.bestsByAssist()` is
the full v2 map.

**v1 → v2 load-migration** (GH-200, recorded choice): a legacy
`{ v: 1, drills: { [id]: { best, plays, ts } } }` blob loads with each flat
record mapped to the DEFAULT assist mode `'standard'`
(settings.js `DEFAULTS.assist`; `MIGRATE_ASSIST` in drills.js). The
migration is IN-MEMORY only — the v2 shape reaches localStorage on the next
user-initiated `persist()`, never at load (hermetic-boot law).

**Two scoring directions** (issue #119). `best` is a plain number in BOTH
directions and is NEVER stored as `Infinity` (`loadBlob` drops a non-number
best): the first completion seeds `best = score`, and thereafter
`best = higherIsBetter ? max(prev, score) : min(prev, score)`. A "new best"
banner fires only on a genuine improvement over a PREVIOUS play
(`plays > 0`), direction-aware, per assist mode. `lowerIsBetter` drills
(rotation15) store the raw penalty total; the picker best line + score chip
present it as a penalty tally, and the rating chart (`rating`) maps it to a
band the same way.

## 5. Challenge-tier protocols (issue #119)

New `protocol.kind`s, all judged ONLY from kernel record/judgment bytes +
`sample(t)` (P-II). Each verdict is computed ONCE at settle.

- `called` (lineup-called, EXPERT) — the fifteen-ball line-up run as a
  CALLED-shot run-out (§2 `called`). score = balls run, maxScore 15. Slop →
  called ladder + noCueCushion/two-rack 30 meta-progression: recorded
  follow-up (§3.8).
- `progressive` (progressive-lineup, ADV) — `{ start, floor, ceiling, racks }`.
  Lay N balls (ids 1..N) in rotation; clear all ⇒ N+1, any fail ⇒ N-1
  (floor). score = highest N cleared over `racks` rack tries. maxScore 15.
- `ten` (ghost10, EXPERT) — `{ racks, scratchPenalty }`. A JS-laid ten-ball
  triangle looped over `racks` racks (§3.7): break from the kitchen, run
  1→10 in rotation, scratch −`scratchPenalty` (UNCONDITIONAL — the sheet
  documents no floor, so the running total may go negative; GH-459 removed
  the silent 0-clamp that absorbed early scratches), a miss ends the rack.
  score = balls potted across the racks; `rating` → the band chart (any
  sub-zero total grades in the lowest band via `score <= max`).
- `penalty` (rotation15, ADV, `lowerIsBetter`) — `{ racks }`. Seeded
  fifteen-ball racks (`rerackKind('fifteen', rackSeedFor(n))`); per-stroke
  penalties (miss/scratch/off +1, wrong-first +2, +1 ball-in-hand ceded on
  any foul) accrue into score. LOWER wins; `rating` → the band chart.
- `fourteenone` (century, EXPERT) — `{ milestones }`. A pure OBSERVER of the
  real fourteenone-v1 fold on a SESSION-only straight_pool pin (§3.9). score =
  the high run reached (`matchState().run`); a miss/foul or the fold terminal
  ends the visit; milestone ladder 14 → 28 → 50 → 100 (Century).

`progressive`/`ten`/`penalty` re-lay the KERNEL rest positions to continue a
rack (the run-drill law); a foul in `penalty` re-grants placement in the
drill's `foulPlacement` zone (rotation15 `'anywhere'` per WPA 5.7 via 1.6 —
GH-370 class 5; before GH-370 the re-grant accidentally inherited the
break's kitchen class), spotting off-table object balls and non-lowest
make-and-scratch pots on the long string per the Dr Dave sheet (§1a).
`racks`/`penalty`/`fourteenone` carry no per-attempt layout — `__drills.layout`
returns null for them.
