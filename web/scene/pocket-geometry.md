# Pocket geometry contract (render layer)

Shared truth between the table geometry (`web/scene/table.js`, feat/gap-table
remodel) and the pocket-drop animation (`web/app/game.js` `sinkIndex()` /
`poseSink()`, feat/gap-renderfix). Both sides read the SAME export so the
drop path can never clip through visible pocket geometry.

## Source of truth

Kernel pocket circles: `crates/pool-core/src/table.rs` (`Table::wpa_9ft`),
mirrored 1:1 into the scene as `TABLE.pockets` in `web/scene/table.js`
(drift-gated at boot by `checkKernelMirrors` in `web/app/main.js`).

## The contract — what table.js MUST keep exporting

```js
export const TABLE = {
  ...,
  // three.js frame (x = long axis, z = short axis, y up, bed plane y = 0),
  // kernel order lb lc lt rb rc rt
  pockets: [{ x, z, r, corner }, ...],
};
```

- `x, z`: pocket CUP CENTER on the bed plane = the kernel pocket-circle
  center (three.x = kernel.y, three.z = kernel.x). The drop animation
  steers pocketed balls to this point before they fall.
- `r`: kernel pocket-circle radius. The rattle amplitude and the bed-hole
  cut derive from it.
- `corner`: true for the four corner pockets (rim/back-wall dressing only;
  the drop path does not branch on it).

If the remodel moves the VISUAL cup center away from the kernel circle
center, export the visual cup center as an additional field
(`cup: { x, z }`) and keep `x, z` kernel-exact for the mirror gate —
game.js will prefer `cup` when present. Until then, `x, z` IS the cup.

## Clearances the drop animation relies on

- Bed cloth hole radius ≥ `r + 0.004` around each cup center (today:
  exactly that, `buildTable` bedShape holes) — a ball (R = 0.028575)
  falling anywhere within `r - R` of the center never intersects cloth.
- The mouth is open (no geometry) for `y ∈ [-0.055, bed]` within radius
  `r` of the center: the ball is culled once its TOP crosses
  `SINK_SHIELD_Y = -0.055` (game.js), so anything below that line may be
  solid. The current throat cylinder + gradient wall satisfy this.
- Mouth dressing clearance: any geometry above the mouth (`y ∈ [0,
  railTop]`) must stay outside radius `r - 0.005` of the cup center so the
  ball's glide into the cup passes it. (The gap-table remodel removed the
  rim torus entirely: corner shields / side C-channel liners wrap the mouth
  with arc notches at radius `r + 0.002`, and the throat cup is an open
  tapered cylinder spanning `y ∈ [-0.199, 0.001]` whose radius stays ≥
  `0.85 (r + 0.004)` above the game.js floor clamp at `y = -0.16` — the
  drop path, rattle included, never intersects it.) The K-66 cushion
  profile (2026-07-12 mesh fix) only RECEDES the jaw facings from the plan
  outline above/below the nose height and retired the 5 mm-proud side-jaw
  end caps, so mouth clearances strictly improved; the widest cushion
  fiber remains the kernel plan outline at nose height.
- Template (snooker-family) dressing — curved-jaw remodel (catalog v7,
  the internal snooker-pocket visual audit): shields/liners are replaced
  by leather cap bands at radius `r + 0.001` outward (still outside the
  `r - 0.005` clearance), and the cup is a SEALED straight-walled bucket at
  `r + 0.004` with its bottom disc at `y = -0.155` — above the `-0.16`
  floor clamp but below the `-0.055` cull line, so the drop animation culls
  the ball before it could visually reach the disc. Pool entries keep the
  paragraph above byte-stable.
- Chinese-8 (`cn8`) EXCEPTION — GH-490 round-12 (owner ruling, gestalt
  adjudication gap (d)): the sealed bucket + housing drum are RETIRED for
  this style. SIDE pockets: the throat is a SHORT open lip wall at
  `r + 0.004` spanning
  `y ∈ [-0.017, 0.001]` (ROUND-13, gate r11 finding 2: 30 → 18 mm — the
  slate-rim dressing truth with a 1 mm overlap onto the raised hem —
  review r13-r2: wall and sock must MEET or a 1 mm annulus threads; the
  deeper lip filled the C1s side sightline's visible interior band
  with its black gradient), then the
  below-fall assembly (GH-490 PASS-3 B4, the middle-pocket boot round —
  the r12 slack bag/bare-hoop stations retired with it): the
  `cn8cap-boot-*` leather TAB drapes the bay from under the cap hem to
  `y = -0.0955` on the r32 side-bay drape plane family (parallel edges,
  full depth `|lat| <= 52 mm`, dying across 52-62 mm); the knitted sock
  (LatheGeometry, top radius `r + 0.001` at `y = -0.016` — raised with
  the lip, rows 1-2 pulled inward to `p.r - 0.002 / p.r - 0.006` so the
  visible band stays inside the tab) bulges to `0.0445` at `y = -0.122`
  and gathers through the relocated brass ring iron (torus 22.5/2.8 mm)
  at `y = -0.152` — the corner B5 construction at side scale — closing
  on the axis at `y = -0.1575`; the gathered KNITTED-BOTTOM axis disc
  is `r 0.022` at `y = -0.140` inside the gather (opaque — the GH-387
  axis seal is byte-equivalent — wearing the solid-ground knit tile, so
  the overhead read is cotton, never a black void).
  Cull-law re-verification (PASS-3): the ball culls at centre
  `y = -0.084` (bottom `-0.112`); the sock interior at `-0.112` is
  ~0.050 >= ball r + 5 mm and the bag is opaque-ground below `-0.098`,
  so the legacy drop lane still terminates on knit at every depth the
  ball is visible.
  Lateral seal: the sock is DUAL-BAND — alpha-cut knit only on the hem
  band above `y = -0.092`; the lower bag draws the same knit over an
  OPAQUE near-black ground, so a low side ray that would thread the
  in-phase holes of both alpha walls terminates ON the sock by
  construction. The authored depth-shade floor is 0.66 (ROUND-13: the
  0.30 floor was a drum-era read; with the cup retired the bag hangs in
  open venue spill, and the C5 pockets must read gathered cotton).
  C1s SIDE-REGISTER VISIBILITY (round-13 geometric adjudication): at el
  ~21° through the side fall the near cap crest (`y 0.051` at
  `r − 0.0045`) occludes every sightline below bed level (deepest
  raycast first-hit `y −0.008` = the lip rim), so NO below-bed
  construction is visible there — the dark gap the register shows is
  the physical table's own read at that angle; the below-table net
  reads at R1/R2/C5.
  Drop-path clearances (SIDES) are UNCHANGED-or-better vs the bucket:
  every
  assembly radius above the `-0.16` floor clamp stays ≥ the bucket's
  `r + 0.004` wall until `y < -0.09` (the sock's inward turn starts below
  the `-0.055` cull line, so the culled ball never visually meets the
  knit), and below-bed sightlines terminate on knit or the knitted
  bottom disc — never on leg tops or the room floor (the GH-387 seal,
  now carried by the net assembly; gestalt_490.py throat bars + the e2e
  canaries hold it).
- Chinese-8 CORNER pockets — GH-490 ROUND-20 (owner-annotated drawing
  `pocket-drawing-490-20260813-005448.png` + construction spec
  `#490` c5277063842 + two-layer ruling c5277689210): the corner throat
  is a smooth cloth FUNNEL descending on a 13 × 18 mm quarter-ellipse
  (`D_throat` 18 / `I_funnel` 13 / `R_blend` ≈ 12) from a per-azimuth
  top curve: the bed-hole rim `r + 0.004` on the MOUTH window (the
  hole-radius contract above is intact where the ball travels), the
  plank bay-notch wall under the rails, and the leather annulus lip
  (`Ø105` about the fillet centre `O_f`, ≈ 47–57 mm from the cup
  centre) on the outward window. The funnel wall therefore descends
  INSIDE `r + 0.004` above `y = -0.09` — a RELAXATION of the side rule,
  proven safe against the actual drop kinematics rather than the
  conservative cylinder bound: with the round-20 GLIDE cap (review
  r20-r1 P1, corrected r20-r2 — the 0.06 s glide floor caps at 1.5×
  the true travel time `dist/|v|`, epsilon 12 ms) the bezier control
  point `entry + v·glide/2` sits at ≤ `0.75 d`, INSIDE the entry→cup
  segment, so a radial entry follows `d(1 − 1.5u + 0.5u²)` — monotone
  to 0, ZERO overshoot past the cup by construction (before the cap a
  6 m/s corner entry carried the control point to `2d` and the curve's
  `d/3 ≈ 30 mm` excursion near bed height clipped the lip-climbing
  outward wall by ~2 mm); entries the floor never clamps keep the
  exact legacy curve, and the early drop keeps the measured velocity
  (the test-sinkpivot 4c near-tangent-pot law).
  Meanwhile the gravity
  drop lags (`t_f = dt − 0.35·glide`), so the sphere's worst-case reach
  at funnel depths is ≈ 52 mm from the cup centre (glide 0.22 s,
  u 0.75, centre y −9 mm) vs the funnel's ≥ 77 mm mouth-window wall;
  the cup-axis
  rattle is ≤ 6 mm (`poseSink`), vs the ≥ 42 mm funnel bottom ring; the
  pivot path keeps the full sphere inside the `r + 0.004` hole through
  bed-crossing (unchanged). Below the funnel the swept net sock meets
  its bottom edge per azimuth (+0.5 mm MEET overlap, the review r13-r2
  law), the corner bag pulls in radially ×0.885 (inside the apron
  planes after the corner fillet retired the covering skirt) and its
  bowl depths below `-0.092` compress ×0.82 (reference-shallow bowl,
  chosen so the gathered tip still hangs below the apron bottom — the
  ruling-⑥ below-table-net subject); the ring iron moves to
  `p.r − 0.0048` (3 mm tube) at `y = -0.075` — window [82.0, 88.0]
  about the cup centre, tube inner edge behind the mouth-side sock
  row 0 and outer extreme behind the recessed blind planes —
  plan-hidden under the continuous opaque funnel/annulus/plank cover
  by construction (俯拍不可见, Section A-A). The GH-387 below-bed seal
  holds: every through-mouth or plan ray terminates on the opaque
  funnel cloth, opaque-ground knit, liner, or the knitted bottom —
  never on leg tops or the room floor.

- Chinese-8 CORNER net receive — GH-490 BLOCKER-CURE B1 (finale
  adversarial review): the dressed drop no longer ends at the shield
  line. The corner sink-dressing spec carries a `net` capability
  (`sinkDressFor(...).net`: `yRest −0.122`, `slotDy 0.046`,
  `sagMax 0.012`, `restAt(slot)`, `deform(balls)`) and game.js's dressed
  lane continues the visual fall INTO the sock: free-fall from the tSeat
  release to the cradle station, damped-harmonic catch inside the sag
  budget, then a PERMANENT visible rest in the net (the dossier read —
  pocketed balls sit in the nets; the corner sock gathers through the
  gold ring at −0.1505, tip closed at −0.1564 for the GH-387 seal).
  `deform` recomputes the sock's vertex positions from a pristine base
  buffer as a pure function of the currently-netted ball poses —
  update()/seek() stay random-access identical, and a scrub back across
  the pocket event restores the base buffer exactly. The SHIELD-LINE
  CULL law above still governs every class WITHOUT the capability
  (sides, templates, pool — bit-identical), and `SINK_SHIELD_Y` itself
  does not move; sinkpivot.js stays byte-frozen (the C-r18-5 /
  Amendment-026 posture: this is a dressed-path pose-lane extension,
  capability-gated on both sides of the module boundary).
  Unit gate: `node web/tools/test-sinkdress.mjs` (net rows).

- Predator Apex SOLID CLOSURE rest — GH-626 (owner P1: a potted ball passed
  THROUGH the foam plug). The Apex is a `FLUSH_RIM_DROP` family: its wells
  are closed by a foam dampener plug whose top face sits one ball DIAMETER
  below the cloth (`FT-PLUG-THICKNESS`,
  `docs/geometry/gh488p-predator-apex-canonical.json`; `PDT_PLUG_Y`
  −0.05715 in the builder). The generic sink pose law predates any closed
  pocket — it falls from the lip and stops only at the shield cull — so the
  ball sank ~54 mm past the plug crest before it vanished (measured: 54.0 /
  54.7 / 53.8 mm at 0.35 / 1.2 / 3.0 m/s entries).
  A table that models a closure now PUBLISHES it: `sinkRestFor(x, z)`
  (scene/table.js, the `sinkDressFor` twin) returns
  `{ x, z, ySurface, rSupport, rVent, rSeat, taper }` for the nearest pocket, and
  the Predator builder is the only family that populates it — every other
  class returns `null` and keeps the historical fall-and-cull
  bit-identically. game.js precomputes the touchdown per sink entry
  (`restEntryFor`: bisection on the public `poseInSink`, closed-form root
  on the legacy glide) and `poseSink` samples the pose law at the CLAMPED
  clock `min(dt, tLand)`, so position AND orientation freeze together on
  the plug — the pose stays a pure function of `(entry, dt)`.
  The rest station is DERIVED, not tuned: `y = ySurface + r`, and because
  `ySurface` is exactly −(ball diameter) the resting ball's crown lands on
  the bed plane — the datum the dossier chose the plug depth for. The dead
  stop is the model, not a shortcut: the part is a foam DAMPENER, and the
  kernel's own resolver zeroes v and ω at capture
  (`crates/pool-core/src/resolve/pocket.rs`). A landed ball reports
  `pocketed` exactly the way a netted ball does.
  The face is an ANNULUS, not a disc (review r5 on PR #633): the builder
  draws the plug as `RingGeometry(rVent, rPlug)` around the measured
  14.0 mm vent (`FT-PLUG-VENT`, 0.168 of the plug radius — 6.251 mm on a
  corner, 6.978 mm on a side), and the first cut of the rest law modelled
  it solid, floating a near-centred ball at the flat datum with nothing
  under its bottom point. The spec now publishes `rVent` and the seat is the
  geometry of a sphere on an annulus: with `d` the landing plan offset from
  the closure axis, the bottom point is on the face when `d ≥ rVent` (crown
  on the bed plane, as above); inside the vent the sphere settles onto the
  vent RIM — its section at the face plane, radius `sqrt(r² − h²)`, is
  internally tangent to the vent circle — so `h(d) = sqrt(r² − (rVent − d)²)`
  and the crown sits `r − h` below the bed plane: at most `r − sqrt(r² −
  rVent²)` = 0.692 mm (corner) / 0.865 mm (side) for a centred drop. The
  term only ever LOWERS the seat, so the flat datum stays the upper bound
  the shield gate and `closureCapacity` read; a vent wider than the ball's
  section has no rim to catch it and the drop keeps the legacy lane (not a
  Predator case). Measured on this tree (the committed sweep): corner rests
  land 2.58–10.25 mm off axis — 727 of 964 on the face (crown on
  the bed) and 237 inside the vent, seated on the rim at most
  0.237 mm below the flat datum; every side rest lands 3.50–4.06 mm
  off axis, all 1462 inside the vent, at most 0.213 mm below it (the
  gate's own side pot: 0.181 mm at d = 3.77 mm).
  `restEntryFor` bisects the touchdown against the seat under the pose's
  own plan and freezes the station at the landing plan (the clamp freezes
  the plan with the clock, so the two cannot drift). The legacy glide
  (no pivot leaf — the degrade lane) keeps the flat datum.
  PERSISTENCE is derived from the model, not from the net lane: the resting
  crown is ON the bed plane, i.e. above the shield line, so the old settle()
  hide — written for a ball that had fallen below the cull — blinked a
  plainly visible ball out at the PLAYBACK->AIM transition (PR #633 skeptic,
  measured: `visible` true→false at y = −0.028575). A ball settle() leaves on
  a closure is now RETAINED there (game.js `restRetained`, the closure twin
  of `nettedRetained`) for as long as the kernel says it is in that pocket:
  it survives the next shots' sink-index teardown, is excluded from
  `activeBalls()` (no collision, no framing), and clears only when the cup
  is cleared — re-rack (`applyRack` disposes the meshes), a scripted
  `layout()` / quiet record load (table-state replacement), or the ball
  handed back to the table (`pocketed=false`: respotCue / flow respots via
  `syncShadows`). An equipment preview re-binds a retained rest to the
  active build's closure (hidden-but-retained while a non-Predator build is
  previewed; the revert restores the exact pose). Replay/seek of the record
  that potted it re-derive the same pose. The occupancy is live-bed truth
  and the GH-257 Playback borrow/restore carries it BY BALL ID with the
  rest of its per-ball snapshot (review r4 on PR #633: the player's quiet
  staging — segment loads, a quiet rack swap — clears `restRetained` with
  the table state it replaces, and `restorePoses` re-applies pose/flags
  only, so the restored ball stood on the plug with no owner: a preview
  left it hanging on the removed plug and the next pot took its station).
  `game.snapshotRests()` / `game.restoreRests()` ride `snapLive()` /
  `restorePoses()` — the sink ENTRY travels (pure in the ball id, no mesh
  reference, so it survives a rebuilt ball set) and the close-side
  `syncShadows` re-derives the station from it; feature-detected on both
  sides (cache-poison contract). The REVERSE pairing — a fresh game.js under
  a cached pre-GH-626 playback.js, which knows no `rests` and restores
  pose/flags only — is covered game-side (review r6 on PR #633, the
  bidirectional fallback the ownership ledger demands): `refreshNets` RECONSTRUCTS
  the occupancy from what that restore put on screen. A pocketed ball on
  screen that no lane owns (not retained, not netted, not the current
  record's sink lane) standing exactly at a published closure's seat under
  its own plan (KISS band) can only be a by-id restore of a closure rest —
  nothing else leaves a pocketed ball visible — so it is re-adopted as that
  cup's occupant with the pose the restore gave it (an ADOPTED record in
  place of the sink entry; a preview hides it, a revert restores it,
  `bindRests` counts it). The carrier runs first and owns the ball, so the
  reconstruction is a no-op whenever the pairing is fresh. Gate: the
  `stale` arm serves this tree's own playback.js with the `rests:` capture
  stripped over CDP interception and runs the same borrow rows over it.
  NOT carried, recorded: the export restore
  (offline-render re-stages the pre-export record quietly and keeps no pose
  snapshot — a ball resting from an EARLIER shot is hidden by that
  re-stage and its cup released: self-consistent, presentation lost until
  the next rack) and the archived player's own segments (balls pocketed in
  an earlier segment are hidden in every later segment on every family —
  pre-existing player presentation, not a GH-626 regression).
  Containment is an invariant, not a clamp, and the number is REPRODUCED
  FROM THE TREE by `node web/tools/sweep-626-containment.mjs` (the real app
  over CDP: 17 approach azimuths × 13 aim errors × 11 cue speeds 1–8 m/s =
  2431 kernel-simulated shots per family, admissible = exactly one
  BallPocket of the object ball into the target cup; read at t0 + 0.9 s).
  At the LOWEST seat (a centred drop on the vent rim, `h = sqrt(r² −
  rVent²)`) the well cone's clearance for the sphere centre is
  `rSeat + taper·h − r·√(1+taper²)` = 14.432 mm (corner) /
  19.342 mm (side) — evaluated conservatively at `h` rather than `r`
  since review r5 (0.13 / 0.18 mm tighter than the flat-datum figures).
  Measured 2026-09-02 on this tree (re-run after the vent-rim seat, review
  r5): corner 964 admissible, 964 landed, 0 failures, worst plan
  offset 10.246 mm (ψ 10°, ε 2°, v0 7 m/s; p50 7.29, p95 9.19 mm) —
  margin 4.186 mm, every contact point on the plug (727 face / 237 vent
  rim); side 1462 admissible, 1462 landed, 0 failures, worst 4.062 mm
  (ψ -15°, ε -2°, v0 1.5 m/s; p50 3.61, p95 4.01 mm) — margin 15.280 mm,
  every contact point on the vent rim. The corner rest
  sits 7–10 mm off the closure axis toward the far wall almost independent
  of speed (9.46 mm at 1 m/s, 10.25 mm at 7–8 m/s), so the margin is real
  but a fraction of the earlier claim: an earlier draft of this note cited
  "3.326 / 4.029 mm over 3936 entries" from an instrument that was never
  committed; that figure is withdrawn and superseded by the committed
  sweep. `SINK_SHIELD_Y` / `SINK_FLOOR_Y` do not move and sinkpivot.js
  stays byte-frozen (the same capability-gated posture as the cn8 net
  receive above).
  An equipment PREVIEW rebuilds the visual table without reracking, so the
  rest re-binds on that boundary (game.js `refreshNets`) and the MESH is
  repaired with it: a ball already resting on a plug the preview removed is
  parked (GH-276 form) instead of hanging in the air — a landed ball reports
  `pocketed=true`, so `update()`'s hide branch can never do it. The repair is
  scoped to a ball that is on screen or to PLAYBACK, and only ever to a ball
  the sampler calls Pocketed at the clock being posed whose pot has already
  happened — the sink index spans the WHOLE record, so a later pot's entry
  exists while its ball is still rolling, and a respot hands a ball back to
  the table with its pocket event still in the map. A hidden ball outside
  playback that is NOT retained is a cleared state and stays cleared until
  the next `seek()`.
  CAPACITY is per cup and DERIVED, not chosen — `closureCapacity` (game.js,
  exported, red-armed by the gate): occupant k stacks at
  `ySurface + (2k+1)r` with its crown at `ySurface + (2k+2)r` (the flat
  datum — the vent seat is never higher, so the count is exact or
  conservative), and it is in
  the well only while that crown stays at or below the bed plane — the datum
  the plug depth was derived against. So `cap = floor(−ySurface / 2r)`,
  floored at ZERO: the Predator (`ySurface = −2r` exactly, exact in float)
  holds ONE; a closure shallower than one diameter holds NONE and keeps the
  legacy lane (an earlier form floored the count at one, which would have
  seated an occupant whose crown stands proud of the cloth); the kernel KISS
  band (1e-6) is the only tolerance, so an exact-multiple closure cannot
  lose a station to a last-ulp rounding. A RETAINED occupant holds its
  station until the cup clears, so a later pot into a held cup — the next
  shot's ball, or the cue on a scratch — overflows. One shot can also pot
  two balls into one cup (a follow scratch does it); the first arrival rests
  and the overflow keeps the legacy drop lane, the same posture the cn8 net
  slot pass already takes for its own overflow. "First arrival" is ordered by
  TOUCHDOWN (`s.t + tLand` at station 0), never by capture — the drop duration
  at one closure varies with entry (measured 112-133 ms at a Predator corner
  over v0 2.2-5.0 m/s), so two pots inside that window can land out of capture
  order, and the ball that physically reaches the crest first is the one the
  closure supports. That is the same law the B1 net slot pass states for its
  cradle. A drop that never reaches the crest inside its own budget is not a
  candidate and never consumes a station. The well's collection
  behaviour past one ball is NOT modelled — the dossier carries no ball-return
  or stacking law — so the overflow ball still drops past the plug as it did
  before GH-626 (visibly through the retained ball when the cup is held —
  the honest limit of a one-ball well with no modelled collection).
  LIGHTING of the resting ball (PR #633 r8 — the owner-visible "blown-out
  white" rest). Diagnosed by measurement, not by hypothesis: under one and
  the same top-down camera (0.45 m over the crown, fov 18, the inner 0.6 r
  of the disc) the ball resting on the plug and ball 1 laid on the OPEN bed
  read the same disc — Predator bed ball 1 mean linear Y 0.982, sRGB
  255/254/238 (a yellow ball rendered cream); the well ball 0.978,
  254/253/243 — so the well ball received no term a bed ball does not; it
  received EVERY term a bed ball does, at free-field strength, while the
  plug 28 mm under it and the well wall beside it carry the derived
  through-mouth transport (`pdtPlugField` / `pdtWellTransport`, the aOccl
  rail). One cup, two lighting models. The ball was the one member of the
  cup with no transport on the rails (`injectAnalytic` excludes balls from
  the per-vertex aOccl splice by design: a ball's surface is not a
  build-time vertex set).
  CURE, the plug's own law on the plug's own rails, per fragment
  (`shading.js` SPIKE_WELL_PARS; derivation + numeric gate
  `tools/derive-well-ball-transport.mjs`, wired into the CI `test` job):
  `sinkRestFor` publishes the SHAFT the transport is baked against
  (`shaft: { rBore, yTop, yAper }` — a read of the values the loop already
  passes to the plug/wall bakes); game.js `poseSink` writes it, with the
  closure's support height `ySurface`, into the per-ball slots
  `material.userData.wellOccl` / `wellFloor` (the `giBallOn` contract:
  feature-detected both ways, a stale side on either end keeps the ball
  open) for every entry the closure lane owns, and clears them wherever the
  ball leaves the cup (table lane, respot — cue AND rule respots through
  `syncShadows` —, scrub-back, re-lay, re-rack, preview-hide, settle-hide;
  a retained rest keeps them exactly as it keeps its pose, across the
  Playback borrow/restore in both pairings). In the shader a fragment inside
  the shaft (below `yAper`, within `rBore`; a ball tipping over the lip
  keeps its upper half lit) takes `hemiVis(P, n)` — the cosine-weighted
  form factor from the fragment to the aperture disc, Lambert's contour
  integral over an equal-area 32-gon rim clipped to the tangent plane
  (exact for the polygon; 1.2e-6 from the 4096-gon limit; on axis it
  reproduces R²/(R²+h²) to 1.2e-6; 4.1e-4 from a 2e6-ray MC over the whole
  ball surface) — on the diffuse ambient legs (env irradiance, bed-plane SH
  probe, venue hemisphere, hemi fill), and `lampVis(P, n)` — the
  cos θ/d²-weighted fraction of the LIVE bar rig visible through the
  aperture, closed-form along each emitter's LONGER axis (a line source: the
  antiderivative of (n·D)/|D|³; a z-long emitter is handed in x↔z swapped
  coordinates) over 32 strips across the shorter one — on spikeShadow,
  every direct leg; and the SPECULAR legs (base + clearcoat, one
  `getIBLRadiance` feeds both) take the exact reflected-ray aperture test (a
  reflected ray that does not leave the convex shaft sees the well lining,
  not the room probe). Floors are the plug's `pdtOccl` ceilings (0.04 /
  0.05). The shaft is convex (the well cone under the constant bore), so from
  an interior point the aperture crossing alone decides — the plug's
  two-crossing test is the wall-point form of the same bound. The strip
  count is chosen over EVERY emitter set in `lightingvisuals.js` (the
  player can hang any FIXTURE_IDS rig over the table; the tool parses the
  catalog from the source): the worst irradiance-weighted error at 32 strips
  is 1.8e-3 (pendant_bar), 2.8× under the 5e-3 bar; the Predator's own bars
  sit at 4.7e-4. The ball's existing cloth-plane contact term (`spikePh`) is
  measured from the SUPPORT inside the shaft — the plug at `ySurface`, not
  the bed plane 57 mm above it (at the bed datum every fragment of a resting
  ball read as touching the support: an un-derived 7–20 % extra darkening on
  the shoulders; the y = 0 line stays verbatim for every ball outside a
  shaft). And a ball that is PRESENTED (pocketed but on screen — the closure
  rest) now has its baked-GI probe sampled at where it is presented
  (`gi.js updateBallProbes`; the old skip of every pocketed ball left the
  rest's ambient history-dependent — the last pre-landing frame, a bed
  sample after a scrub that jumped past touchdown, or zeros on a rebuilt
  ball set — which seek()'s random-access contract forbids; review r8 P2).
  The derived values on the ball at rest (crown / upper-cap mean): corner
  hemiVis 0.574 / 0.229, lampVis 0.72–0.82 / 0.51–0.59; side 0.627 /
  0.263, 0.97–0.98 / 0.57–0.60 (the side pocket sits under the bars' span,
  the corner outboard of the outermost bar). The plug's own lamp leg is
  gated OFF under every fixture but `snooker_luminaire` (`uSpikeOcclLampOn`,
  the review env-r1 gate — GH-624 item 1, open); the ball's lamp leg is
  computed live against the active emitters and never stale, so until #624
  item 1 lands the ball carries the direct-leg transport the plug beside it
  does not. Disclosed, not dialled around. Two more fidelity limits,
  disclosed: the reflected-ray test uses the lobe's mean direction (exact
  for the clearcoat at roughness 0.04; the base lobe at 0.1–0.25 is wider,
  so the aperture rim reflects as a crisp ring where a blurred one would be
  right), and the ray that does not escape takes the plug's diffuse leak
  floor (0.05) where the true radiance is the near-black lining's.
  MEASURED (`capture-626-restlight.mjs`, sha-stamped manifests; the same
  frames off the 46cb14e0 extract and off this tree; ring = the 0.55–0.85 r
  annulus, off the crown's white number decal — review r9 caught the first
  cut of the tool measuring 0.647–0.85 r while reporting 0.55–0.85 r; these
  are the corrected annulus): corner top-down disc 0.978 → 0.937 mean linear
  Y (sRGB 254/253/243 → 252/248/225), ring 0.962 → 0.835 with the yellow
  identity R−B 24 → 84; side top-down ring 0.966 → 0.894 (clip 16 % → 8 %),
  R−B 20 → 57; side rest-hi (the owner's register) disc 0.939 → 0.870,
  252/248/222 → 249/240/188, ring 0.819 → 0.719 — the ball reads as a yellow
  ball with a lit crown instead of a white disc; the remaining white at the
  corner's crown is the ball's own number decal facing up. The gate's
  rendered A/B (same frame, slot armed vs forced open, LINEAR tone mapping at
  an unclamped exposure, bound 1 − a·(1 − F0) derived from the spec and the
  measured ambient share a) pins the direction and magnitude on every run.
  WHAT THE CURE CANNOT DO, disclosed with numbers: the Predator rig lights
  every ball far above white on the OPEN bed — inverting three's ACES fit
  for a neutral, the bed ball 1 disc at output 0.982 corresponds to a scene
  value ≈ 7× the level that renders as white (1.0 → 0.775), where the
  Diamond's ball 1 at the same register (0.915, sRGB 255/246/199) sits at
  ≈ 2.4×; the venue hemisphere probe `PDT_VENUE_L` 9.91 was solved on
  cloth/apron ratios and never checked against a ball's albedo. A 0.57
  crown factor lands the crown still above white. That is a pre-existing,
  table-wide fact of the Predator rig, out of this PR's fence (no exposure
  knob, no rig retune here), and it is the follow-up the r8 comment on
  PR #633 proposes. REGISTERS: the boot frame is NOT a stable register — the
  baked-GI apply lands asynchronously after `__test.ready` and the balls'
  probes are written only by a uniform sync, so a boot frame read on a
  timer lands on either side of that race (an earlier draft of this note
  called the Diamond boot frame "byte-identical" on one such read; the
  stamped artifacts refute it, review r8). The tool now waits for the
  landing and re-lays the rack before the boot read, and the byte-still
  claims are made on the bed-topdown register: bed balls are untouched by
  construction (`rBore = 0` identity, the y = 0 contact line verbatim): on
  the bed-topdown register every disc read is identical to the 46cb14e0
  extract to four decimals and the frames differ by at most 1 LSB on a few
  percent of pixels (2.0 % on the stamped run; 0.1–2.5 % across runs) — the
  GPU code-generation noise of an edited shader, the same magnitude the
  register shows run-to-run on one tree once the rack is re-laid after the
  GI landing (the stamped `--compare` table prints the pixel counts; the
  boot frame, even re-laid, still varies by up to 3 LSB run-to-run and is
  not a byte-still register). `treeStampEnd` compares a content fingerprint
  (the tracked diff + untracked sources' size/mtime), not the dirty boolean
  alone, so a tree that moved under a run is flagged (review r9).
  Unit gate: `node web/tools/test-sinkrest.mjs` (Predator corner + side
  rest rows incl. the vent-rim seat, capacity floor, persistence across PLAYBACK->AIM / the next
  shot / re-rack, the held-cup overflow, the Playback borrow/restore round
  trip over both the fresh and the stale playback.js pairing, the r8
  `light` rows incl. the rendered A/B (linear read, spec-derived bound) and
  the GI-probe purity row, plus the
  no-closure/no-regression rows for diamond, wpa, snooker and chinese8). Wired in CI as job
  `e2e-sink` (with `test-sinkdress.mjs`; `test-sinkpivot.mjs` and
  `tools/derive-well-ball-transport.mjs` ride the
  `test` job) — PR #633. Containment sweep:
  `node web/tools/sweep-626-containment.mjs` (writes
  `output/gh626/containment-sweep.json`, sha-stamped). Capture sheets:
  `web/tools/capture-626-sinkrest.mjs`, `web/tools/capture-626-persist.mjs`,
  `web/tools/capture-626-restlight.mjs` (every manifest carries the tree
  stamp from `web/tools/provenance.mjs`).
  LANDING FENCE (2026-09-04, main c01bb535 merged into PR #633): the
  material-identity fence law — every non-target table per-mesh AND
  per-material identical to main, judged on the COMPILED program source
  (census schema v2: the chinese8 lane's `tools/render/census-490-tables.mjs`
  + `fence-judge-490.py`, base = a clean archive of main) — read RED on all
  9 non-target tables on the merged tip 00623117: geometry / attributes /
  flags 0 diffs everywhere, but the compiled GLSL of every table material
  (bed, cushions, subrails, …) differed, because round 8 had written the
  three well blocks INTO the shared SPIKE_APPLY / SPIKE_ENV_CHUNK text under
  `#ifdef SPIKE_BALL` — stripped by the preprocessor on every table material
  (no table pixel moved) but part of every program's SOURCE (the same class
  as the chinese8 lane's "soil uniforms in the shared header"). Cured on
  the issue #89 / GH-440 surgical-variant precedent: the shared chunks carry
  main's text byte-for-byte and the ball program takes `SPIKE_APPLY_WELL` /
  `SPIKE_APPLY_MULTI_WELL` / `SPIKE_ENV_CHUNK_WELL`, composed at module
  load from the three moved blocks (`SPIKE_WELL_CONTACT` / `_APPLY` /
  `_ENV`) and anchor-checked (`spikeWellOk`: a missed anchor leaves every
  ball OPEN and the `light` rows red). The ball program's text is unchanged
  from round 8. After the cure the census reads IDENTICAL on 9/9 non-target
  tables (the Predator, reported not judged, also 0 diffs: its plug / well
  meshes and materials are built as before, the closure is published beside
  them) and the three red arms (roughness +0.01 on every material / one
  vertex normal flipped / castShadow toggled on one mesh) each read RED;
  the sha-stamped table is in the PR #633 landing comment.
- GH-489 snooker open-pocket assembly (`wpbsa_snooker_12ft` only; joy keeps
  the sealed bucket above) — **AMENDMENT 026 (W6 construction round)**, see
  the named section below. The rev-4…rev-11 constructions this section used
  to describe (capture-disc fall wall, saddle cap + binding + crown
  stitches, 270° horseshoe, W1/W2 wide-limb boot) were retired by the
  owner's construction-level rejection (#489 c5259714909) and the
  construction adjudications (corner c5259957376, middle c5260535193).

## Amendment 026 — the visible fall is NOT the kernel capture disc
  (GH-489 W6, 2026-08-12; owner rulings c5260294606)

The kernel pocket circles (`TABLE.pockets` / `makeGeom(id).pockets`,
drift-gated) are physics CAPTURE REGIONS. The SLATE HOLE the table shows is
the CEBP drop label: corner Ø 84.15 mm, middle Ø 99.21 mm. table.js derives
the visible falls in `snookerFallCtx` and exports them as
`pocketVisualFalls(id)` → `[{ x, z, r }]` (order = `makeGeom(id).pockets`;
null off-snooker):

- middle falls are CONCENTRIC with the kernel circles (the kernel jaw tips
  stand 53.19 − 49.61 ≈ 3.6 mm outside the visible rim);
- corner falls sit ON THE POCKET DIAGONAL at the mouth — canonical offset
  (−6.2, −6.2) mm from the nose corner (≈ 58.6 mm inward of the capture
  centre), solved from the adjudicated wood-end law (gap chord 102.7 mm on
  the kernel nose-tip line at 55.3 mm from the cup).

*SNK-R34 erratum (review round 8 P2 A, 2026-09-10 — GAMEPLAY; the loss is the craft lane's).* R3-SNK-9 (RULING R-S8-2, commit d06d3ab0, 2026-09-03) made the RENDERED corner fall the kernel's CEBP disc (R 88.90 about the slate-edge intersection) and R3-SNK-10 the middle fall the kernel's R 53.19 at the template centre — both a verbatim copy of the kernel pocket record — and kept the leather PLATE DATUM (the corner plate centre 27.87 mm inboard, r 42.08) as `snookerFallCtx(G).cups`; but `pocketVisualFalls()` kept returning those plate datums. Under this amendment the export is the drop animation's APERTURE, so every corner capture — always on the kernel disc's rim, 88.90 − 27.87 = 61.03 from the plate centre, +19.07 mm outside r 42.08 — was rejected by the lip-pivot gate and glided over the opening, from 2026-09-03 to SNK-R33. From SNK-R34 `pocketVisualFalls()` returns the RENDER FALL discs (`pocketFallDiscs()`) and the plate datum lives under its own name, `pocketPlateDatums()` (the letters, the fullview judge, the construction gate's cup-relative rays, the leather scans and the corner probe read that). Measured while fixing it: the kernel's capture point recomposes 0.1–3.4 µm OUTSIDE the rim (≈ 1.4 µm per m/s of entry speed — an OPEN row for the kernel owner), so the frozen game.js gate's plain `<= fall.r` still rejected the render-fall discs by microns; on the maintainer's ruling (A, identity form; the ownership ledger (internal)) the gate takes, in one condition, a fall whose centre and radius equal the kernel pocket's bit-for-bit without a geometric re-test — the kernel's capture point is on that rim by construction, the dressed-opening bound holds by construction, and any fall that differs from its capture disc keeps the re-test. Fenced by `tools/render/check-falls-identity-489.mjs` (F1 exact identity, F2 one copy site; red arm `falls-perturb`). **Consequence, owned:** the W7 middle-pot glide's premise — the middle visible fall (Ø 99.21, r 49.61) smaller than the capture disc — expired at R3-SNK-10 when the middle fall became the capture disc; nobody noticed because the µm rejection kept the glide by accident. From SNK-R34 the middles build the lip pivot too, with this amendment's descent gate retained (`fall !== pocket`). Recorded as "W7 premise expired at R3-SNK-10; revisited by R34", not a new adjudication; the spin-preserving middle pivot stays the OPEN model-extension row. The interface shape `[{ x, z, r }]` in pocket order is unchanged; `null` stays the off-snooker value; sinkpivot.js is untouched. Red arm `?obArm=falls-plate` restores the pre-fix return.

What each side owns under the amendment:

- **Bed/slate**: the cloth hole per fall is `fall.r + 0.004` (the arris-roll
  lip cut — the cloth rolls INTO the hole; `snookerBedCutPath` also cuts the
  slate corners away outside a keep-ring at `fall.r + lip + 6 mm`). The old
  `r + 0.004` clause now reads on the VISIBLE fall, not the kernel r.
- **Mouth-open law**: no solid inside radius `fall.r` of the FALL CENTRE for
  `y ∈ [−0.055, bed]`. The cloth throat walls stand AT `fall.r` (corner to
  −0.034 with the laced sock below; middle to −0.056 with the −0.075 ring
  class); ring irons, collars, sock shoulders and the boot's inner skirt all
  sit radially OUTSIDE `fall.r` above the cull line. Everything below
  −0.055 may be solid (unchanged). *W7 knit-top erratum (gate r10 blocker
  3, c5264581300)*: the knit takes over directly under the cloth walls —
  corner collar top −0.036 (the adjudicated 25–45 mm net-top band; the
  −40 mm through-mouth read is KNIT, construction-gate C4b), middle knit
  top ≈ −0.055 (the 50–65 mm band, bar B3; the W6 dark sleeve that pushed
  the first knit surface to −88 mm is retired). Every above-cull knit knot
  stays radially outside `fall.r` (the funnel turns inward only below the
  cull line), so the mouth-open law is unchanged by the raise.
- **Mouth dressing clearance**: above-bed dressing (the cream boot) keeps
  its inner skirt ≥ `fall.r + 0.002` from the fall centre — the glide/rattle
  envelope below never reaches it.
- **Drop animation** (game.js + app/sinkpivot.js, feature-detected via
  `pocketVisualFalls` — a stale table.js keeps the kernel cups verbatim):
  - the glide bezier and the lip pivot STEER TO THE FALL CENTRE (`s.fall`),
    not the kernel cup; the kernel cup remains the capture identity;
  - the legacy glide gains a DESCENT GATE (`s.tFall`): gravity starts only
    once the sphere fits inside `fall.r − R − 2 mm` (precomputed on the
    bezier, seek-safe) — the old 0.35·glide start would sink the ball
    through the now-real bed cloth between capture and the mouth;
  - the lip pivot only builds when capture happens OVER the fall
    (`|pos − fall| ≤ fall.r`); jaw-tip captures take the gated glide;
  - both drop paths carry a THROAT CONTAINMENT clamp: a descending sphere's
    bed-plane cross-section stays inside `fall.r + 0.004 − 0.5 mm`
    (overshooting fast oblique entries glance off the far throat wall —
    unit-gated in web/tools/test-sinkpivot.mjs §5b at both snooker falls);
  - rattle amplitude `min(6 mm, 0.3·(fall.r − R))` = 6 mm at both families;
    containment margin ≥ `fall.r − R − 6 mm` ≈ 9.8 mm corner / 17.3 mm
    middle (snooker R = 26.25 mm);
  - swallow margins: corner `fall.r − R` ≈ 15.8 mm, middle ≈ 23.4 mm.
- **Lip-hang sliver** (recorded residual, same class as pre-026): a live
  ball whose centre sits just outside the capture circle can overhang the
  visible fall by ≤ ~8 mm of contact patch at the corner diagonal (was
  ≤ 4 mm against the old oversized hole). Kernel physics is flat-bed there;
  the read is a ball hanging on the lip, as real snooker balls do.
- **Kernel untouched**: capture discs, jaw plans, `TABLE.pockets`, the
  boot drift gate and all replay/serde surfaces are byte-identical (#484
  "kernel geometry NEEDS NO CHANGES" stands; the amendment is render/
  presentation-side only).
- Raised-furniture cue clearance rides the re-derived `pocketMouthObstacles`
  (cup-centred boot envelope; consumed by cuestick, gated by
  check-cue-clearance #13/#15).
- Cavity sight-lines (*W7 re-draw — gate r10 blockers 1+2, c5264581300*):
  slate-underside shelves (cup-centred holes), the corner post FLANK ARMS
  + outward WEDGE STUBS, the shortened corner drop-plates and the
  under-frame boards re-seal what stays sealed. The W6 monolith post
  (square ∖ cup-hole, top +0.0205 — the clause above previously recorded
  −0.004, and the drift WAS the defect) stood proud of the bed inside the
  play corner and boxed the assembly off from outside; the W7 post keeps
  its two full-height arms strictly OUTSIDE the nose lines (bar B1: no
  solid above bed inboard of them), opens the outward diagonal as a bay
  (Star order: boot face → wires → dropped ring iron at −0.117 → sock
  band; stub top −0.120 keeps the gold reading BELOW the furniture), and
  holds NO post in the play-corner notch (bed cloth + slate cover it).
  Raycast-verified: e2e-snooker S1-corner sweep + construction-gate
  B1/B2a–c.

### Amendment 026b — the REVERSE cache pairing (W6 finisher, review r2 P2)

The 026 feature detection covers a stale `table.js` (fresh game.js keeps
the kernel cups verbatim). The REVERSE pairing — a returning browser's
STALE pre-026 `game.js` with a fresh scene — passes the KERNEL capture
cup into `buildSinkPivot` (px/pz/pr from `template.system.table.pockets`)
while the visible corner fall now sits 58.5 mm inward with r 42.1 vs the
capture 88.9: a kernel-targeted pivot would sink through the bed cloth/
boot. `sinkpivot.js` (a leaf the stale game.js dynamic-imports FRESH)
re-bases the pivot itself: nearest visible fall to the passed cup via a
guarded `pocketVisualFalls` dynamic import, taken only when the passed
radius mismatches the fall class (> 1 mm within 120 mm). A fresh caller's
fall payload matches its own radius and passes through untouched; a null
provider (stale table.js, pool/carom) keeps the passed cup verbatim.
Unit-gated: test-sinkpivot §5c (stale-caller corner red-proof: worst
extent about the fall 84.8 mm vs hole 46.1 mm pre-fix). RECORDED
residual: the stale game.js LEGACY GLIDE path (airborne arrivals /
null-pivot degrades) still targets the kernel cup — a narrow, stale-
cache-transient class that self-heals on revalidation; the pivot path
(on-bed captures, the overwhelming pot class) is bridged.

*W7 hardening (review r8 P2 ×2, both cache-pairing directions):*
- the provider import now PRELOADS at leaf load (deferred 3 s — off the
  boot window, resolved long before any human-paced first shot); the
  first-call-lazy kick could never resolve inside the first
  `buildSinkPivot`'s own synchronous stack, so the stale-game.js
  pairing's ENTIRE first shot indexed against the kernel cups;
- the FORWARD pairing (fresh game.js + STALE pre-W6 leaf) is gated by a
  capability marker (`SINK_CAPS.throatClamp`): the old `poseInSink`
  passes name-based feature detection but has no throat-containment
  clamp, so it must never receive the ~42 mm visible falls — without
  the capability the pot keeps the fresh legacy glide, whose own
  descent gate + clamp read the visible fall.

### Amendment 026c — the pre-roll to the hole edge before the tip (GH-489 SNK-R36, review round 10 P2 B; maintainer ruling (a), 2026-09-11)

**Finding.** Since R3-SNK-10 the render fall IS the kernel capture disc and SNK-R34's identity gate lets the corner lip pivot build — but `buildSinkPivot` started its pendulum AT the capture point, which on a corner is the capture-disc rim (R 88.90 about the slate-edge intersection), 19.07 mm short of the dressed leather opening (the plate datum `pocketPlateDatums()`: r 42.08, centred 27.87 mm inboard along the diagonal). The drop therefore converged on the capture-disc centre, 27.87 mm off the throat axis; a 26.25 mm ball in a 42.08 mm throat has 15.83 mm of slack, so the ball went ≈ 6.6 mm into the built leather — replayed through the committed WASM + `poseInSink` against the built `obPocketCap`: **−6.57 mm at 47.5 ms** on the S2p 2.5 m/s pot (−6.73 at 4.5 m/s, −6.00 / −5.68 on the 1.2 m/s pot and its scratch). The S2p "pivot BUILT" rows could not see it.

**Why not table.js alone.** `game.js` picks the visual fall nearest the kernel cup, takes it by identity and passes THAT fall as the steering disc; `sinkpivot.js`'s only re-base moves the steering disc to the visual fall nearest it — the kernel copy at distance 0 always wins. Under the identity gate the descent axis is the fall's centre by construction; B1 (clearance) and B4 (pivot builds) were mutually exclusive without touching the frozen files. Measured for the record (node replay, no chain): (d) the plate datum as the corner fall = R33's corners, gate rejects at 61 > 42 mm, no pivot; (c) a plate-centred disc of derived radius = pivot at the capture point over cloth, 19 mm early. Neither is the model.

**The model (the W9-named extension, now built).** `sinkpivot.js` `buildSinkPivot` reads the throat (`pocketPlateDatums()` through its existing guarded import; `spec.throats` for instruments). When the steering disc differs from the throat by more than the re-base tolerance (1 mm) AND the capture point lies outside the throat, the ball ROLLS on along its capture velocity until its centre crosses the throat rim — ray–circle intersection, the smallest s ≥ 0 (a ray that misses the throat rolls to the nearest rim point, recorded `how: 'nearest-rim'`); roll time = distance / capture speed (kernel state at capture; the kernel's rolling resistance µ_r·g ≈ 0.098 m/s² shifts the rim entry by ½·a·(s/v)² < 0.3 mm over ≤ 30 mm at the slowest scripted capture, 0.265 m/s — below the 1 mm export grain; the speed floor is the existing `OMEGA_SEED·r` = 0.021 m/s); the measured spin keeps integrating (the pivot phase's own law). The existing pendulum then runs at the rim point with px/pz/pr = the throat; `poseInSink` gains the roll phase (position on the bed at height r, orientation by the spin law) and shifts dt by the roll time; ttl grows by it. No new constant; `game.js` untouched (the R34 identity gate stays; the descent axis is now the throat).

**Measured after, on the SCRIPTED S2 lanes (node instrument `tools/render/check-sink-clearance-489.mjs`; the browser rows in e2e-snooker through `window.__test.sinkClearance` read the same numbers on the cap):** S2p 2.5 → roll 19.071 mm / 5.53 ms, min clearance vs the cap **+18.37 mm**; 4.5 → 19.075 mm / 2.81 ms, +18.32; 1.2 → 19.069 mm / 20.99 ms, +18.39; the scratch (0.265 m/s) → 19.068 mm / 71.87 ms, +19.01 (the browser's whole-furniture minimum on these pots is the fall roll at the mouth, +0.70 mm at the capture instant — the ball resting beside the padded fall edge, not a penetration). Middles: the plate datum rides the kernel middle disc (R3-SNK-10 ruling (b)), throat == steering disc (0–2 µm), **no roll, poses byte-identical** (+31.8 / +33.0 / +30.6 / +33.0 mm before and after — the S2m clips of R34 remain the shipped motion). Red arm: the branch disabled (`--no-throats`; in the app `?obArm=throat-off`, no plate datum) → −6.73 … −5.68 mm again (browser: −6.66 mm on the stitch, −6.57 on the cap). Byte identity where the branch must not fire: `test-sinkpivot.mjs` §8 and `tools/render/check-sinkpivot-identity-489.mjs` (86 non-corner specs identical in entry and 401 poses across 073785eb → this tree; the 21 corner specs differ WITH a `roll` record).

**Bounds of the derivation, stated.** The constant-speed roll is derived for the scripted captures (≥ 0.265 m/s): ½·µ_r·g·(s/v)² < 0.3 mm over ≤ 30 mm. Below the existing speed floor `OMEGA_SEED·r` = 0.021 m/s the roll time is capped by that floor (a 0.03 m/s capture rolls 21 mm in ≈ 0.7 s while a real ball would stop after v²/(2·µ_r·g) ≈ 4.6 mm) — a dead-slow class the kernel rarely captures, carried with this note. The `nearest-rim` fallback for a velocity ray that misses the throat is a RULE (the shortest roll to the rim), not a derivation; it is recorded per entry (`roll.how`) and counted by the census below (16 of 68 reachable captures at pocket 5).

**OPEN row — off-axis corner captures (refuter 1 of SNK-R36; `check-sink-clearance-489 --sweep`).** A kernel-reachable census into pocket 5 — one cue ball on 396 lanes: bearings −70…+70° off the corner diagonal (step 7°) × distances 0.6 / 1.2 m × aim offsets −8…+8° (step 2°) × v0 1.0 / 2.5, minus the start points that would sit off the bed (the on-bed filter takes 21 × 2 × 9 × 2 = 756 down to 396); every capture replayed with the tree's own pose law against the built cap (capture spin ω = 0, q0 = identity — the pose's clearance does not depend on them; a collar-clamp proof must RE-RUN the sweep, deterministic WASM, rather than replay the rows) — reads **10 of 68 captures still penetrating, worst −3.24 mm** (lane 35° off the diagonal, 1.2 m, aim −2°, v0 1.0: capture 1.05 m/s at bearing 8.9°, roll 25.7 mm, −3.24 mm at 47 ms; the browser reads −3.25 mm on the same lane) — **before SNK-R36: 66 of 68, worst −11.5 mm; new worse than old: 0 of 68**. Mechanism: after the roll the fly-in keeps the capture velocity (a projectile), the bezier steers to the throat axis over `glide`, and the only wall is the containment clamp `lim = pr + 3.5 mm − disc(y)`, which models a hole in a FLAT surface (the sphere's section at the bed plane fits the hole); the snooker leather is a RAISED collar (the built cap stands to +40 mm above the bed around the 42.08 mm opening), so an oblique entry clips the far side of the collar before it has fallen enough. The cure is a second derived law in the same branch — the containment also reads the collar's TOP plane: the sphere's section at the leather crest height must fit inside the throat with the same margin, the crest height a derived read of the built plate carried on the plate datum (no new constant) — accepted only with its own census: 0 of 68 worse than today and ≥ 0 mm clearance on every reachable lane (the sweep is the instrument). Not built in this round (maintainer ruling, 2026-09-11): a collar clamp without its census would trade a rare 3 mm clip for a visible radial snap on every oblique pot. One frame of the worst residual pose ships with §R3c.42 for the owner's eye.

**Rows closed.** W7-REVISIT (SNK-R34 OPEN row) is closed by measurement: the middle pivot needs no pre-roll because its throat is the capture disc; the corner pre-roll IS the model extension W9 named. Amendment 026's rule stands: the visible fall is not a slate hole; the kernel capture disc is the gate identity; the dressed throat is the drop's axis.

### Amendment 026d — the drop's completion budget, the leaf's capability, the arm gate (GH-489 SNK-R37, review round 11; 2026-09-11)

**Completion budget.** Every pivot entry now carries `tEnd`, its own end time — the dt at which the ball is culled below the shield (roll + tip + drop), read from the entry's pure pose law by bisection; `game.js` settles a record at `max(duration + 0.4, the last sink's capture + tEnd)` (recorded deviation A). Scripted numbers: S2p 2.5 → tEnd 0.161 s (inside the pad, deadline unchanged); the slow final-event scratch on the same lane (v0 0.94, capture 0.037 m/s) → roll 0.515 + tip 0.164 → tEnd 0.792 s, deadline 2.977 → 3.368 s, the drop now plays; the middles 0.18 s (unchanged). The slowest WASM-reachable capture on that lane is 0.014 m/s at v0 0.935 (tEnd 1.21 s — the roll's speed floor caps it there; v0 0.936 → 0.021 m/s reads the same tEnd); at v0 ≤ 0.934 the ball stops short of the capture disc (node mirror scan with `check-sink-clearance-489 --v0`, retained with the seal).

**Capability negotiation.** The leaf declares `SINK_CAPS.preRoll`; `game.js`'s identity gate takes the capture-disc fall only from a leaf that declares it (recorded deviation B). Without it (or with no leaf at all) the corner's fall becomes the plate datum BEFORE the glide law sizes `dist` / `glide` / `tFall`, so the drop takes R33's plate-steered glide verbatim (+18.5 mm clear on every S2p pot, never the cap; the §R3c.42 (d) rows re-asserted on this tree) — the degraded form of a mixed cache, measured through the real entry point (pre-fix −6.66 mm with the pivot at the capture rim; post-fix pivot false, no roll, clearance PASS). The e2e names the loaded leaf's capabilities every run.

**Arm gate.** `?obArm=<name>` fires only on a scripted boot (`?obtool` / `?cinema` / the `ob-scripted` carry) — every URL arm, the R30+ `obArmOn` set and the pre-R30 trio (`plank-dense` / `lid-cover` / `lid-inject`, now read through `obArmOn`); a default boot keeps the shipped motion and names the ignored arm (landing rule L3, folded into R37). The two real-user-boot tools that drive URL arms (the construction gate, the as-modeled sheets) declare the carry before the snooker build on ARMED runs only. Completion-budget bound: outside a rolling snooker corner `tEnd` ≤ 0.314 s (pool radius, any speed) / 0.306 s (snooker middle), so the deadline is provably unchanged there. The pose law itself is unchanged since SNK-R36: the R36 → R37 identity census reads every class byte-identical in 401 poses (entries identical modulo the additive `tEnd`), the 396-lane sweep still 10/68 at −3.243 mm, the S2m poses identical.

## Drop animation (for reference, owned by game.js + app/sinkpivot.js)

- entry pose + entry velocity + entry ANGULAR velocity/orientation sampled
  from the ShotRecord just before the `BallPocket` event (kernel truth, no
  JS physics; issue #236);
- lip-pivot phase (slow entries only, |v| < √(gR) ≈ 0.53 m/s): the ball
  tips about its bed contact point at capture as an inverted pendulum
  until the physical fly-off condition; the tip direction is strongly
  cup-biased (d̂ = v̂ + 3·ĉ normalized) and the drop's steer completes by
  the time the sphere is half-sunk (glide ≤ bed-crossing time), which
  keeps the FULL SPHERE inside the `r + 0.004` cloth hole through pivot
  and drop at any capture obliqueness — ≥ 2 mm worst-case margin
  (unit-gated: `web/tools/test-sinkpivot.mjs` containment arm). Fast
  entries skip the pivot entirely and keep the exact legacy path below;
- momentum bezier glide from the fly-off point into the cup center
  (`glide = clamp(dist/speed, min(0.06, max(0.012, 1.5·dist/speed)),
  0.22)` kernel-seconds — the round-20 capped floor, see the corner
  clearance section above — additionally
  clamped to the bed-crossing time after a pivot);
- gravity fall (9.8 m/s², kernel time — slow-mo scales it for free) with a
  small damped rattle across the throat, floor-clamped at y = -0.16; mesh
  spin retained and evolving (frozen at the fly-off angular velocity);
- culled below the shield line; no scale tricks, no visible clipping.

## Catalog v16 (calibration wave B1) — the cn8 CORNER kernel repin

The #484-registered chinese8 corner divergence (kernel scaled-CEBP fall
disc Ø 179.6 centred 48.1 mm beyond both noses vs the photo fall-bucket
family ~105–120 at the mouth) is resolved KERNEL-side: `chinese8_pro_9ft`
corners now carry the same R82 drawing construction the visual has
shipped since GH-490 — rails end at the departure `Y_N` 78.744 mm, R45
nose rolls run onto the capture disc = the Ø 105 mouth circle about the
drawing `O_f` (±(L/2 + C), ±(W/2 + C), C = 3.5 mm — the SAME datum as
the visible bed hole `K8.R`/`ofxP`, fullview `c_Of` and the cammatch
mouth gate; the roll∩circle end is the drawing's own `X_N` station —
ADR-0015 single-source convergence). The drawing's throat-wall and R10
lines are liner construction INSIDE the disc (collision-unreachable).
Kernel element layout for cn8: 6 linear rails + 16 circular (8 nose
rolls + 8 CEBP middle arcs). The visible corner mesh is untouched (the
drawing constants were already the authority); the kernel drop-steer
target (`TABLE.pockets`) moved to the visible hole exactly (the
sink-dressing residual is now the fabric-aperture squeeze only). Middle
pockets byte-identical (no middle-pocket photo evidence — ledgered
owner-deferred item).

## Catalog v21 (GH-1080, card 41) — cn8 corner F2 and middle M-c

Render and kernel move together in one landing: the active-table drift gate
needs every kernel rail endpoint to be a rail-polygon vertex, so neither half
can ship alone. Sources in this repo: `CN8_F2` / `CN8_R82` (table.js), the
kernel twin (`cn8` / `Cn8Molded`, `MiddlePocketFamily::Cn8Arc1` in
crates/pool-core/src/table.rs), docs/geometry/cn8-middle-furniture-definition.json
(r13) and the corner contract's erratum E-D2B-F2-JAW. The card-41 drawing
sheets D2B-01/02/03 REV R3 are an owner-review attachment kept outside the repo.

- **Corner F2.** `CN8_F2` (table.js, inside the D2 section that
  `cn8_emitted_checks` extracts) derives every jaw letter from the
  clamp-free photo fit: the rail departs at 90.151 mm into a nose fillet
  R72.199 mm, then a straight throat wall opens 3.411° per side and runs
  40.256 mm on to the Ø 105 mouth circle. Wall and ring meet in a sharp
  34.15° junction (R0, the A1 fill law; neither purchased model supplies a
  positive blend). The sharp corner is the blend's zero-radius limit:
  coincident chain points whose normals fan from the wall normal to the
  outward radial, plus the matching OFF arc on the bed jaw-foot chain.
  Narrowest nose gap 85.200 mm, on the fillet.
- **Kernel corner.** `Cn8Molded` keeps one arc per jaw: the fillet from the
  departure to its throat-side crossing with the Ø 105 capture disc
  (X_N (48.027, −13.563) mm from N; closure margin 15.25 mm), so the two
  collision fillets end 87.10 mm apart. The fillet past the crossing (with
  the 85.200 mm narrowest), the throat wall and the junction lie inside the
  disc and stay out of collision.
- **Middle M-c.** The render keeps the template arc 1 and ends it on a
  90° face at |u| = 43.5 (nose width 87.000, face depth 37.394 → 48.106);
  DT-09, LP-01, LP-09 and the LP-11 pitch follow the furniture contract r13;
  LP-07[1], LP-10, the LP-11 depth, LP-19 and SK-04 stay the render's own
  JOY EST values (the contract's render_spec).
  The kernel's new `MiddlePocketFamily::Cn8Arc1` sweeps arc 1 on to the
  template capture circle (sweep 51.222°, closure margin 5.59 mm); the face
  lies inside the disc.
- **Kernel element layout for cn8:** 6 linear rails + 12 circular (8 corner
  fillets + 4 middle arcs). Capture discs unchanged.

Questions / changes: update this file in the same PR as the geometry
change and ping the render-fix stream (deviations note in the wave doc).
