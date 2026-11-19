# pool-rules — the rules crate & its primitives

`crates/pool-rules` is the single source of rules truth (feature 013):
pool/snooker/carom adjudication as **pure functions over recorded shot event
streams**. No physics, no clock, no randomness, no I/O — a verdict derives
exclusively from serializable inputs (prior match state, the kernel
`ShotRecord` event stream, recorded calls/decisions), so identical inputs
produce **byte-identical** verdicts on every surface:

| Surface | Entry | Bytes |
|---|---|---|
| TypeScript / web | committed wasm artifact [`web/dist/pool-rules/`](../../web/dist/pool-rules/) behind the frozen 011/012 `Ruleset` API ([`sdk/ts/src/rules/`](../../sdk/ts/src/rules/)) | crate bytes verbatim |
| Python | `pool_py.rules_*_json` functions | crate bytes verbatim |
| CLI | `pool-cli judge` | crate bytes verbatim |

The crate is deliberately **open** (MIT, explicit in its `Cargo.toml`) and
depends on **no other workspace crate** — it parses its own lenient mirror of
the `ShotRecord` wire ([`src/wire.rs`](../../crates/pool-rules/src/wire.rs)).
The rules transcribe public rulebooks (WPA, WPBSA, UMB); every foul and
terminal verdict carries its pinned rule citation.

## Quick start

```sh
cargo test -p pool-rules                      # unit + ruleset + example tests
cargo clippy -p pool-rules                    # includes the float-discipline lint
cargo run -p pool-rules --example moneyball   # the worked new-game example
```

## The judgment boundary

Five `_json` functions ([`src/lib.rs`](../../crates/pool-rules/src/lib.rs))
are the canonical boundary; every surface returns their bytes verbatim and
none re-serializes:

```rust
pub const RULES_VERSION: &str;   // "0.1.0+<git>", independent of the kernel

pub fn catalog_json() -> String; // ids, foul codes, cites, decision tables
pub fn initial_state_json(ruleset: &str, breaker: u8)
    -> Result<String, RulesError>;
pub fn judge_json(ruleset: &str, state_json: &str, record_json: &str,
    call_json: &str) -> Result<String, RulesError>;
pub fn apply_decision_json(ruleset: &str, state_json: &str,
    decision_json: &str) -> Result<String, RulesError>;
pub fn hud_state_json(ruleset: &str, state_json: &str)
    -> Result<String, RulesError>;
```

A judgment is always the nine keys, in this order (`src/judgment.rs`; the
output domain is ints/strings/bools/null only — **no floats**, structurally):

```json
{"legal": …, "fouls": […], "pocketed": […], "ballInHand": "…",
 "respot": […], "turn": "…", "decisionRequired": …, "terminal": …,
 "next": { … }}
```

Failures never cross as panics/exceptions: every fallible entry point emits
`{"error": {"code", "message"}}` with one of the seven frozen codes
(`unknown-ruleset`, `bad-record`, `bad-state`, `bad-call`, `bad-decision`,
`match-over`, `decision-pending` —
[`src/error.rs`](../../crates/pool-rules/src/error.rs)).

Two doctrines govern everything below:

- **Stream-position causality**: every before/after question resolves by
  event-stream position (emission order), never by timestamp comparison —
  the kernel resolves several events at identical `t`.
- **Float discipline**: judgment-relevant arithmetic is restricted to
  IEEE-754-exact ops (`+ - * /`, `sqrt`, comparisons);
  [`clippy.toml`](../../crates/pool-rules/clippy.toml) forbids `hypot`,
  `mul_add`, and all transcendentals crate-wide, so native and wasm builds
  cannot diverge on the one geometric judge (snooker P10).

## Primitives catalog (P1–P20)

The shared machinery of `pool_rules::primitives`, factored out of the five
shipped rulesets *after* five concrete consumers existed (nothing
speculative). All primitives are pure and operate on the parsed wire types.

| # | Primitive | Crate surface | Contract |
|---|---|---|---|
| P1 | ShotFacts scan | `scan::scan(&WireRecord, &ScanConfig) -> ShotFacts` | ONE forward O(events) pass producing every stream-derived fact below; no second pass permitted. `ScanConfig` selects the per-ruleset variants. |
| P2 | First contact | `ShotFacts::{struck, first_contact, cannon}` | The striker's first `BallBall` (stream index + other id) and the second-distinct-object cannon. Striker derives from the `Strike` event under `ScanConfig::striker_from_strike` (carom); the pocket games pin the cue at id 0. |
| P3 | Contact-legality hook | `contact::check_first_contact(facts, legal_first, on_no_contact, on_wrong_first)` + `contact::lowest(&[i64])` | Per-ruleset closures decide which first contact is legal and what `CitedFoul`s a miss/illegal contact earns (lowest-first for 9-ball, group/open for 8-ball, on-set for snooker, break red-first for carom, always-legal for 1P). |
| P4 | Rail-after-contact | `ShotFacts::driven_after_contact` | Any pocket/cushion event at a stream index after the first contact. Folding vs splitting the no-contact case is per-ruleset judgment logic. |
| P5 | Pocket classification | `ShotFacts::{pocketed, pocketed_ids()}` + `pockets::{partition_by_pocket, call_fulfilled, pocket_of, off_set}` | Ordered `{ball, pocket}` list, cue excluded; classifiers: any-pocket, call-fulfillment + terminal-pocket match, own/opp/neutral partition by kernel pocket index, on-set vs `not-nominated`. |
| P6 | Distinct-object-rail count | `ShotFacts::object_rail_count` | Distinct non-striker balls reaching a rail (8-ball dry break, WPA 4.3(d)). |
| P7 | Cushions before second contact | `ShotFacts::cushions_before_second` | Striker cushion events before the cannon; same-cushion repeats count (UMB Art 83); the count freezes at the cannon. |
| P8 | Off-table tracking | `ShotFacts::off_table` (+ `ScanConfig::dedup_off_table`) | `BallOffTable` ids in stream order; per-ruleset exceptions live in the ruleset (8-ball excepts the 8). |
| P9 | Cue scratch | `ShotFacts::cue_scratch` (+ `ScanConfig::off_table_includes_striker`) | Striker pocketed OR driven off the table. |
| P10 | Jump-over geometry hook | `ScanConfig::jump_over_geometry` → `ShotFacts::jumped_over` | Chord test over initial snapshot + per-event `post[]` cue poses (snooker Sec2 R20); exact-ops only. |
| P11 | Foul assembly | `fouls::Fouls` (`push`, `legal`, `into_vec`) | `CitedFoul {code, cite}` accumulation, citation order = detection order; invariant `legal == fouls.is_empty()`. |
| P12 | Sequence/phase enforcement | per-ruleset state machines | Phase enums + transitions stay in each ruleset by design (they ARE the game); composed from P3/P5. |
| P13 | Respot chains | `respot_chain::{sort_numeric, sort_highest_first, flush_queues}` | Ball-**id** lists only — XY spot geometry stays in the TS adapter (`sdk/ts/src/rules/respot.ts`); fixed / decision-gated / immediate + end-of-turn queues / highest-value-first variants. |
| P14 | Penalty computation | `penalty::{snooker_penalty, pay_one_ball}` | Snooker `clamp(4, max(ball-on, concerned), 7)` one-per-stroke; one-pocket LIFO tray pop or `owed + 1`. |
| P15 | Consecutive-foul counters | `counters::{FoulCounterMode, step}` | `Tracked {loss_threshold}` with reset-on-legal, or `Disabled` (WPA 8-ball 3.13 self-exclusion — a distinct mode, not config `false`). |
| P16 | Decision plumbing | `decisions::{Decision, parse_decision, check_pending, check_choice, unknown_id}` | Shared wire `{decision, choice}`; validation liturgy IN ORDER: post-match guard → kind-vs-pending match → choice range. Shipped ids 1–10 are frozen (share-codec v4); both judgment-born and initialState-born pendings exist. |
| P17 | Terminal plumbing | `terminal::{terminal, guard_not_over, guard_no_pending}` | `{winner, reason, cite}`; judge-after-end = frozen `match-over`; judge-while-pending = frozen `decision-pending`. |
| P18 | Turn/seat resolution | `turn::{other, resolve_seat}` | Terminal or pending decision HOLDS the seat; else `continue` keeps it, `pass` flips it. |
| P19 | HUD projection | per-ruleset `hud_state` fns | Serializable snapshot, shape owned by the ruleset (carom's `phase`→`stage` rename is shipped behavior). |
| P20 | Foul-context envelope | `fouls::{FoulContext, FoulContextPenalty, foul_context}` | `{fouls[], by}` (+ `penalty` for snooker) carried in next-state; `None` on a legal stroke. |

### Per-ruleset usage matrix

9 = nineball-v1, 8 = eightball-v1, 1P = onepocket-v1, SN = snooker-v1,
C3 = carom3c-v1. ● = consumes, ◐ = ruleset-specific variant, — = unused.

| Primitive | 9 | 8 | 1P | SN | C3 |
|---|---|---|---|---|---|
| P1 ShotFacts scan | ● | ● | ● | ● | ● |
| P2 First contact | ● | ● | ◐ (idx only) | ● | ◐ (Strike-derived + cannon) |
| P3 Contact legality | ◐ lowest | ◐ group/open | — (all legal) | ◐ on-set | ◐ break red-first |
| P4 Rail-after-contact | ● | ● | ◐ (folded code) | — | — |
| P5 Pocket classification | ◐ any | ◐ call+8-pocket | ◐ own/opp/neutral | ◐ on-set | — |
| P6 Distinct-object-rail count | — | ● (dry break) | — | — | — |
| P7 Cushions before 2nd contact | — | — | — | — | ● |
| P8 Off-table tracking | ● | ◐ (8 excepted) | ● | ● | ◐ (deduped) |
| P9 Cue scratch | ● | ● | ● | ● | — |
| P10 Jump-over geometry | — | — | — | ● | — |
| P11 Foul assembly | ● | ● | ● | ● | ● |
| P12 Phase enforcement | ◐ | ◐ | ◐ | ◐ | ◐ |
| P13 Respot chains | ◐ [9] | ◐ decision-only | ◐ queues | ◐ value-order | ◐ concerned |
| P14 Penalty | — | — | ● | ● | — |
| P15 Consecutive fouls | — | ◐ (locked off) | ● | — | — |
| P16 Decision plumbing | — | ● (ids 1–5) | ● (6, 9) | ● (7, 8) | ● (10) |
| P17 Terminal plumbing | ● | ● | ● | ● | ● |
| P18 Turn resolution | ● | ● | ● | ● | ● |
| P19 HUD projection | ● | ● | ● | ● | ◐ (stage) |
| P20 Foul context | — | ● | ● | ◐ (+penalty) | ● |

Every row has at least one real consumer; P1/P11/P12/P13/P17/P18/P19 have
five — the copy-paste that got factored (SC-003). Single-consumer facts
(P6/P7/P10, P14 variants) are cataloged because the toy example below and
future games may claim them.

## Worked example: `moneyball-toy`

[`crates/pool-rules/examples/moneyball.rs`](../../crates/pool-rules/examples/moneyball.rs)
is a **complete** toy ruleset — a toy Chinese money-ball rotation game —
whose entire bespoke module is **184 lines of code** (a test in the example
fails above 200; SC-003), everything else coming from the primitives:

- Rotation legality: the cue must first contact the lowest ball on the table
  (P3), afterwards some ball must reach a rail or pocket (P4); scratches
  (P9) and jumped balls (P8) are fouls.
- Money: balls 3 and 6 pay 1 point, the 9 pays 2, on a legal stroke only;
  money balls always respot (P13, ids only). First to 4 points wins; three
  consecutive fouls lose (P15).
- After any non-terminal foul the incoming player picks the response (P16,
  decision kind `foul_response`): play from where the balls lie, or ball in
  hand.

### The judge, end to end

The full pipeline is ~90 lines. Guards first (P17/P16 — the liturgy order
every shipped ruleset uses), then ONE scan (P1), then policy:

```rust
term::guard_not_over(state.result.is_some(),
    "moneyball-toy: judge called after the match ended")?;
term::guard_no_pending(state.pending.is_some(),
    "moneyball-toy: a foul_response decision is pending".to_string())?;
// …
let record = wire::parse_record(record_json)?;
let facts = scan::scan(&record, &scan::ScanConfig::default());
```

Foul detection is entirely primitive-driven — the bespoke part is only the
*policy* (which contact is legal, which codes/cites to emit):

```rust
let mut fouls = Fouls::new();
for f in contact::check_first_contact(&facts, |ball| ball == lowest,
    || Some(CitedFoul::new("no-contact", "toy 1")),
    |_| Some(CitedFoul::new("wrong-first-ball", "toy 1"))) {
    fouls.push(&f.code, &f.cite);
}
if facts.first_contact.is_some() && !facts.driven_after_contact {
    fouls.push("no-rail-after-contact", "toy 2");
}
if facts.cue_scratch {
    fouls.push("scratch", "toy 3");
}
```

Counters, terminals, respots, decisions, and the seat all come from their
primitives:

```rust
let step = counters::step(
    counters::FoulCounterMode::Tracked { loss_threshold: THREE_FOULS },
    *state.foul_streak.get(state.shooter), !legal);
// …
let respot = if terminal.is_some() { Vec::new() } else {
    respot_chain::sort_numeric(pocketed.iter().chain(&facts.off_table)
        .copied().filter(|id| money_value(*id).is_some()).collect())
};
let decision = (!legal && terminal.is_none()).then(|| DecisionRequired {
    kind: FOUL_RESPONSE_KIND.to_string(),
    chooser: Chooser::Seat(turn::other(state.shooter)),
});
let next_shooter = turn::resolve_seat(
    state.shooter, terminal.is_some(), decision.is_some(), turn_v);
```

`apply_decision` is the P16 validation liturgy verbatim (post-match guard →
pending match → id → choice range), and the whole thing plugs into the same
entry shape the registry dispatches:

```rust
static ENTRY: RulesetEntry = RulesetEntry {
    id: "moneyball-toy",
    initial_state, judge, apply_decision, hud_state, catalog,
};
```

The toy is **not** registered: the five ids in
[`src/rulesets/registry.rs`](../../crates/pool-rules/src/rulesets/registry.rs)
are frozen (011/012 contracts) and the static `REGISTRY` slice cannot be
extended at runtime — a test in the example asserts
`judge_json("moneyball-toy", …)` is `unknown-ruleset` and that the catalog
does not contain the toy. Its decision id (11) deliberately sits outside the
frozen share-codec id space 1–10.

### Run it

```sh
cargo run -p pool-rules --example moneyball
```

```text
moneyball-toy — a toy ruleset composed from pool_rules primitives (SC-003)
rules crate 0.1.0+<git>
initial : {"shooter":1,"onTable":[1,2,3,4,5,6,7,8,9],"scores":{"1":0,"2":0},"foulStreak":{"1":0,"2":0},"pending":null,"ballInHand":false,"result":null}
stroke 1: legal=true fouls=[] pocketed=[3] respot=[3] turn="continue" decision=null terminal=null
stroke 2: legal=false fouls=[{"cite":"toy 1","code":"wrong-first-ball"}] pocketed=[] respot=[] turn="pass" decision={"chooser":2,"kind":"foul_response"} terminal=null
decision: {"shooter":2,"onTable":[1,2,4,5,6,7,8,9,3],"scores":{"1":1,"2":0},"foulStreak":{"1":1,"2":0},"pending":null,"ballInHand":true,"result":null}
hud     : {"shooter":2,"lowest":1,"scores":{"1":1,"2":0},"pending":null,"result":null}
catalog : {"id":"moneyball-toy","fouls":[{"code":"no-contact","cite":"toy 1"},…],"decisions":[{"id":11,"kind":"foul_response","choiceMax":2}],"terminals":["money-target","three-fouls"],"config":{"money":{"3":1,"6":1,"9":2},"target":4}}
```

(The stroke lines print through a `serde_json::Value`, which reorders keys
alphabetically — demo only; real surfaces keep the crate bytes verbatim.)

### Test it

Ten scenario tests are embedded in the example (`Cargo.toml` sets
`[[example]] test = true`, so the plain crate invocation runs them):

```sh
cargo test -p pool-rules --example moneyball
```

They cover: legal money pot (score + respot + continue), non-money pot,
stacked fouls in detection order, off-table money, the full
`foul_response` round-trip (including the `decision-pending` judge gate),
the ordered decision-rejection liturgy, three consecutive fouls, the
money-target terminal (including the `match-over` gate), catalog
serialization + registry exclusion, and the SC-003 line budget itself.

## The new-game recipe

1. **Read the smallest real consumer first**:
   [`src/rulesets/nineball.rs`](../../crates/pool-rules/src/rulesets/nineball.rs)
   (~260 lines including the wrapper mapping and catalog) — it is the same
   shape as the toy, plus the behavior-freeze discipline of a shipped port.
2. **Compose primitives into a bespoke module** under `src/rulesets/`:
   typed match state (serde declaration order IS the wire key order;
   seat-keyed maps via `SeatPair`), `initial_state` / `judge` /
   `apply_decision` / `hud_state`, all `str -> String` at the boundary.
   Budget expectation: ≤ 200 bespoke lines plus configuration (SC-003).
3. **Registry entry + catalog row**: add the `RulesetEntry` to `REGISTRY`
   in `src/rulesets/registry.rs` with a new versioned id (`<game>-v1`) and
   a `CatalogEntry` (foul codes/cites, decision rows, terminal reasons,
   pure-data config). New decision kinds claim the next free ids in the
   global share-codec space (1–10 are taken and frozen).
4. **Scenario tests**: hand-built event streams through the public
   `judge_json` API (the example's `record()` helper shows the minimal
   lenient wire), one test per foul code, decision, terminal, and error
   path.
5. **Corpus cases + gates**: add cases for the new id to
   `scripts/fixtures/rules-corpus.json` (additions are fine — regenerating
   existing cases is a spec-level event), then run the migration gate:
   `cargo test -p pool-rules`, `cargo clippy -p pool-rules`, rebuild +
   repin `web/dist/pool-rules/`, `node scripts/rules-conformance.mjs
   --ruleset <id>`, and the TS battery if a TS wrapper ships.

Keep in mind:

- **Respot geometry stays out**: judgments carry ball **ids** to respot;
  XY placement is the adapter's job (`sdk/ts/src/rules/respot.ts`).
- **i18n stays out**: emit stable foul/decision codes + citations; human
  strings live in the app locales.
- **Floats stay out of judgments**: if your game must read geometry (like
  snooker's jump detection), keep it inside the scan under the clippy
  float discipline and emit only ints/strings/bools.

## See also

- The pool-rules feature spec (internal) — plan, research (R1–R14), and
  frozen contracts (crate API, artifact pipeline, conformance gate).
- `site/docs/ts.html` §11 — the TS `Ruleset` API these bytes back.
- [`scripts/fixtures/rules-corpus.json`](../../scripts/fixtures/rules-corpus.json)
  — the harvested byte oracle (DO NOT REGENERATE).
