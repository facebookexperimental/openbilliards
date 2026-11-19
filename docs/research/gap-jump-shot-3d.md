# gap: completing full-pipeline 3D physics for jump shots/airborne balls, design and cost (a core user requirement; every report points out the gap but none offers a solution)

## KEY TAKEAWAYS
- The legal jump-shot mechanism (downward strike with vz<0 and z=R → get_airborne_time returns 0 → immediate BALL_TABLE event → e_t bounce) already runs end to end on pooltool main; the event sequence measured on this machine is stick_ball@0 → ball_table@0 → convergence after three decaying bounces, so no new mechanism needs to be built.
- Tunnelling through the cushion is confirmed by measurement and is worse: cushion detection returns inf for an airborne ball (detect/ball_cushion.py:176,229 TODO); after flying over the cushion the ball is treated as landing on an infinite bed plane and rolls 10.8 m off the table without any event — the rail top and BALL_OFF_TABLE are entirely missing from the pooltool roadmap and must be our own original work.
- All cushion models (stronge_compliant/model.py:90, impulse_frictional_inelastic/model.py:31) and the ball-ball model (frictional_inelastic/__init__.py:99-100) hard-code the outgoing vz to zero and force sliding; Han 2005's PZ is commented out at model.py:79 and :33 has a vz≈0 assertion, so an airborne ball entering it crashes.
- All new collision detection stays ≤ quartic polynomials: the airborne parabola (x,y linear, z quadratic) against the fixed-axis cylinder of the cushion nose is quartic, against the horizontal plane of the rail top is quadratic, against the vertical cylinder of the pocket mouth is quadratic, and ball-ball is quartic (#342 merged); the only exception is a torus pocket rim at degree 8, which upstream #304 confirms is not analytically solvable, approximated with cylinder segments.
- Cushion resolve choice: extend the existing sphere_half_space_collision.py (a quaternion rotates the true normal from get_normal_3d onto the z axis) rather than restore Han PZ — upstream #308 has already judged making Han 3D not worth it, and #310 confirms that making the impulse model 3D only needs deleting the two vz-zeroing lines.
- Ball-ball with a vertical component follows upstream #312's route: for the 3D line-of-centers, replace the xy projection rotation with a quaternion rotation and keep the k̂ component of the friction impulse in TP A.14 eq. (4)(5), which reproduces the two-ball hop and hop overcut effects documented by Dr. Dave.
- Dr. Dave/WPA Rule 2.11 confirm that a legal jump shot is defined exactly as bounce off slate (scoop is illegal); the coefficient of restitution of ball-slate through the cloth has no published authoritative value (pooltool uses e_t=0.5) and must be calibrated ourselves with high-speed video; this is the main open parameter risk.
- Virtual Pool 3/4 (Celeris) is a commercial full-3D precedent: its manual explicitly documents slate-bounce jump shots, a ball jumping onto the rail top and bouncing back as no foul, and Ball Off Table as a foul, proving the product path is feasible, but there are no published technical details; the engineering detail truly worth copying is the rotation dimension-reduction method cited in pooltool issue #303 (3D parabola vs cylinder → 2D parabola vs circle).
- Only two new event types are needed, BALL_RAIL_TOP and BALL_OFF_TABLE (cushion events reuse the existing types plus a contact-classification payload); for the Zeno risk, beyond the already solved ball-table bounce (min_bounce_height=5mm), the new form is an alternating cushion/table event explosion when a ball hugs the underside of the cushion nose, which needs an absorption threshold on the cushion normal velocity.
- The phasing proposal holds: 2.5D about 10–14 person-days (it must add a 2–3 person-day cushion-plane crossing height gate to eliminate tunnelling), the full-3D increment about 22–32 person-days, 32–46 person-days in total; 3D position hygiene in make_kiss (z-drift, never pressing a ball into the table) is a hidden pain point acknowledged by 3 upstream open issues; do not underestimate it.
- massé/air drag/Magnus would break the polynomial nature of the trajectories and must be explicitly excluded from the scope of the analytic event-driven kernel; otherwise the whole ≤ quartic root-finding premise fails.

## OPEN QUESTIONS
- The coefficient of restitution e_t of ball-slate through the cloth and its velocity dependence: Dr. Dave's material gives only the mechanism with no numbers, pooltool's default 0.5 has no source, and it needs calibration from real high-speed video; the e_c/f_c of an airborne ball hitting the cushion nose likewise have no measured data.
- In issue #303, the engine/author that the cited 'Simulator::predict_ball_rail_nose_collision' comes from could not be confirmed (suspected to be a comment by a contributor to some private C++ billiards engine); only the method itself can be verified.
- Virtual Pool 4's physics engine implementation details (Celeris) have no published technical material at all; the feature scope can only be inferred from the behavior descriptions in the VP3 manual.
- Whether the pooltool detector's event priority tier for BALL_TABLE (detector.py:87 TODO) is correct in multi-ball same-instant scenarios (such as the break) has not been verified by upstream either.
- A literature search found no dedicated modelling of an airborne ball hitting the cushion nose (billiards literature always assumes the ball is on the table); the choice of half-space impulse model + true normal is an engineering inference + upstream consensus, lacking an experimental comparison.
- Cue-to-ball legality checks (cue butt clearance over the cushion at high elevation angles, the judgment of a pinch causing massé rather than jump) are not included in this estimate; if the product needs strict rules simulation they need a separate design.

## REPORT
# Jump shot (Jump Shot) full-pipeline completion: design and cost assessment

## 0. Conclusions at a glance

- **The core mechanism of the legal jump shot (downward strike → immediate ball-table event → bounce up) already runs end to end on the pooltool main branch**; I verified it by measurement on this machine with a temporary venv (see §1.2); it is not a mechanism that needs to be built.
- What is truly missing is four pieces: **airborne ball vs cushion detection** (currently returns inf; measured tunnelling through the cushion and rolling 12 m off the bed), **outgoing vz of the cushion/ball-ball resolve** (all hard-coded to zero), **the two event classes rail top/flying off the bed** (neither is in the pooltool roadmap), and **make_kiss position hygiene under 3D** (a pain point acknowledged by 3 upstream open issues).
- All collision-time solves that need to be added **stay within ≤ quartic polynomials** (term-by-term derivation in §3a), so the kernel's existing ≤ quartic polynomial root finder can be reused directly; the only exception is modelling the pocket-mouth ring as a torus (degree 8, which upstream has confirmed is not analytically solvable; approximate with cylinder segments).
- The "2.5D first, then full 3D" phasing **holds**, but we recommend adding a "cushion-plane crossing height gate" of about 2–3 person-days in the 2.5D phase to eliminate tunnelling; otherwise tunnelling will ruin the playability of 2.5D.
- Total effort estimate: **2.5D phase about 10–14 person-days, full-3D increment about 22–32 person-days, 32–46 person-days in total** (a single engineer familiar with analytic event-driven physics, testing included).

---

## 1. pooltool source verification (../pooltool, main @ 9a8abfe)

### 1.1 Gap list (confirmed file by file)

| Gap | Location | Current state |
|---|---|---|
| Airborne ball vs linear cushion detection | `pooltool/evolution/event_based/detect/ball_cushion.py:176-178` | `if s == airborne: # TODO; dtau_E = np.inf` |
| Airborne ball vs circular cushion detection | same file `:229-231` | same as above, inf |
| Self-description of the 2D cushion detection functions | same file `:44,122` | the docstring states plainly "This is broken for airborne balls" |
| Han 2005 vertical impulse | `pooltool/physics/resolve/ball_cushion/han_2005/model.py:79` | `# rvw_R[1,2] += PZ/m` is commented out; `:33` also has `assert np.isclose(rvw_R[1,2], 0)`, so an incoming airborne ball crashes straight on the assert |
| StrongeCompliant (current default cushion model) zeroes vz | `ball_cushion/stronge_compliant/model.py:89-90` | `# FIXME-3D: add z-velocity back in; rvw[1][2] = 0.0`, and unconditionally `BallState(rvw, const.sliding)` |
| ImpulseFrictionalInelastic zeroes vz | `ball_cushion/impulse_frictional_inelastic/model.py:30-31` | same as above |
| Mathavan 2010 | `ball_cushion/mathavan_2010/model.py:640-676` | never writes vz (planar model; the two-contact-point assumption has the bed always supporting the ball), final state hard-coded to sliding |
| Ball-ball throw zeroes vz | `ball_ball/frictional_inelastic/__init__.py:97-100` | `# FIXME3D: include z velocity components; rvw1_f[1][2]=0.0; rvw2_f[1][2]=0.0`; the coordinate rotation at `:24-29` is only in the xy plane (`# FIXME3D: this should use quaternion rotation in 3D`), so the z component of the line-of-centers is ignored |
| Pocket airborne heuristic | `detect/ball_pocket.py:63-154` | landing point inside the pocket circle → judged pocketed directly; otherwise solve the influx/outflux quadratic, and `hf <= 7/5·R` judges "grazes the pocket back edge and drops in" — a purely phenomenological threshold, with no real pocket-wall geometry |
| dim tags of all cushion/ball-ball models | all `Dim.TWO` (confirmed by grep) | rejected by `SimulationEngine._validate_dimensionality` (`evolution/engine.py:44-65`) when a 3D engine is constructed; the sandbox demo only runs by brute-force patching them to `Dim.BOTH` |

3D foundations already in place (more complete than expected):
- **airborne motion state + parabolic evolution**: `constants.py:48` (airborne=5), `physics/evolve/__init__.py:50-51,192`.
- **BALL_TABLE event full pipeline**: detection `detect/ball_table.py` (`get_airborne_time` solves a quadratic, `physics/utils.py:59-69`); resolve `ball_table/frictional_inelastic/__init__.py` (TP A-14-style impulse model: normal (1+e_t) bounce + slip/no-slip 2/7 tangential branches), including **the Zeno bounce cutoff `min_bounce_height=0.005 m`** (`:71,83-84`, when the bounce height is <5mm vz is set to 0 and the state turns to sliding). `e_t` defaults to 0.5 (`objects/ball/params.py:80`).
- **3D ball-ball detection (#342 merged, commit 0b344e7)**: `detect/ball_position_polynomial.py` writes any motion state as a (3,3) coefficient matrix of `r(t)=p0+p1·t+p2·t²` (when airborne `p2=(0,0,-g/2)`), and `detect/quartic_coefficients.py` expands `|Δr(t)|²=(R1+R2)²` into quartic coefficients.
- **3D cue strike**: `stick_ball/instantaneous_point/__init__.py:108-170` `InstantaneousPoint3D`, the theta elevation angle produces `v_z=-V·sinθ` (downward), `stick_ball/core.py:13-25` `final_ball_motion_state`: vz≠0 → airborne. Note that the 2D version `InstantaneousPoint2D:188` zeroes vz — in 2D mode a jump shot is silently swallowed.
- **Cushion geometry is already 3D**: `objects/table/components.py:48-228` `LinearCushionSegment` describes itself as "skinny cylinder between p1 and p2", with `nose_radius` and `get_normal_3d()` (`:186-212`, the perpendicular component from the ball center to the cushion nose axis); `CircularCushionSegment.get_normal_3d` (`:294-305`).
- **Ball-half-space impulse model with an arbitrary normal**: `physics/resolve/sphere_half_space_collision.py:10-16` uses `quaternion_from_vector_to_vector` to rotate the collision normal onto the z axis and reuses the same slip/no-slip impulse code — this is the ready-made infrastructure for a "swap the normal" resolve.
- **quartic solver**: the quartic root finder under upstream `ptmath/roots/`, but `detect/ball_ball.py:53-57` has a FIXME: degeneration to cubic/quadratic needs manual branching.

### 1.2 Key verification: can a downward strike produce an "immediate ball-table event and bounce up"? — Yes, measured

Theoretical chain: after the cue strike resolve, vz<0, z=R, s=airborne → `ball_table_collision_time` calls `get_airborne_time`, solving `-g/2·t² + vz·t + (z-R)=0`; at z=R the roots are {0, 2vz/g<0}, and taking the max real root = **0** → the BALL_TABLE event is scheduled at `t = shot.t` (immediately); on the resolve side `_resolve_ball_table` requires `v_i[2]<0` (`ball_table/frictional_inelastic/__init__.py:25-28`, satisfied), and the outgoing `vz' = -e_t·vz > 0` bounces up.

Measurement (after installing all dependencies in a temporary uv venv, using the `_build_3d_engine` patch approach of `sandbox/airborne_demos.py`: every strategy's `dim` patched to `Dim.BOTH` + swapping in `InstantaneousPoint3D`, `is_3d=True`):

```
jump scenario (V0=2.0, theta=60°, ball at rest on the bed):
0.000000  stick_ball
0.000000  ball_table        ← immediate bounce up; same-instant events correctly ordered by the detector priority tier
0.271631  ball_table        ← second hop (e_t=0.5 decay)
0.407447  ball_table
0.475355  ball_table        ← bounce height <5mm, vz cut off to 0
1.356542  ball_linear_cushion
7.153039  rolling_stationary
```

**Conclusion: the legal jump-shot mechanism exists and is numerically stable** (same-instant events are tie-broken by the tier+energy priority in `detect/detector.py:29-100`; `detector.py:87-91` notes itself that the BALL_TABLE tier is not fully justified, a point to re-examine when porting).

### 1.3 Key verification: tunnelling through the cushion — confirmed, and the consequence is worse than "tunnelling"

Measurement: an airborne ball flies toward the cushion on a low arc with `v=(0, 2.0, 1.0)` from 0.3 m away from the top cushion (bed 0.99×1.98 m):

```
0.2039  ball_table   ← landing point y≈2.09, already outside the cushion line (y=1.98)
0.3058  ball_table
14.9301 rolling_stationary, final position y = 12.756 m
```

Zero cushion detection in the airborne segment → it flies straight over the cushion line; it lands on the "bed plane" (detection only checks z=R, not whether xy is still inside the table) and keeps rolling, **rolling 10.8 m off the bed before friction stops it**, with no event at all along the way. That is: not only does it tunnel through the cushion, even the terminal state "ball off table" does not exist.

### 1.4 Airborne ball-ball collision: detection right, resolve wrong (measured)

An airborne ball drops onto a stationary object ball: the quartic detection of #342 **correctly** finds the 3D collision at t=0.1313; but after resolve both balls have vz of 0 and both are marked sliding — the z component of the line-of-centers direction is dropped by the xy projection, the impulse direction is wrong, and the physics of hitting the upper half of the object ball ("hop over/press down") is completely absent.

### 1.5 Upstream roadmap (`support-3d` label actually queried with gh, supporting the design choices)

- **#303 (open) A2. 3D ball-linear-cushion detection**: cites the approach of the author of a private 3D engine — "build a rotated Z axis parallel to the cushion nose axis, rotate both the cushion nose and the ball's position polynomial into that frame, **turning 3D-parabola vs 3D-cylinder into 2D-parabola vs circle**; with a radius of 0 it is intersection against a line".
- **#304 (open) A3. circular cushion**: "**a torus is a degree-8 polynomial, solvable only numerically**; cylinder segments can be used instead; do a broad-phase with bounding spheres first".
- **#308 (closed) Han 2005**: conclusion **not worth making 3D** — "impulse-frictional-inelastic is equivalent to Han but easier to support in 3D". That is, upstream also gave up on restoring the PZ line.
- **#310 (open) ImpulseFrictionalInelastic made 3D**: "**only needs deleting those two lines at model.py L30-31**" (vz zeroing). #309 (open) Stronge likewise.
- **#312 (open) B5. 3D ball-ball resolver**: the plan is a quaternion rotating the collision normal to Z' (already demonstrated by `sphere_half_space_collision.py`); multi-size ball PR #290 already did one version.
- **#341/#345/#346/#347 (open) make_kiss made 3D**: prevent z-drift, prevent pressing balls into the bed; #345 already has an in-progress branch (rotating candidate points about the cushion axis to guarantee `z==R` (not airborne)/`z>=R` (airborne)).
- **#320 (open)**: wire 3D mode into the UI, "do it last".
- Rail top, ball-off-table boundary, real pocket-wall geometry: **completely absent from the roadmap** — these three pieces are the parts our in-house work must originate.

---

## 2. External research

### 2.1 Dr. Dave(drdavepoolinfo.com / billiards.colostate.edu)

- **Legal jump-shot mechanism** (faq/foul/scoop/, citing WPA Rule 2.11): "For a jump shot to be legal, you must hit the CB from above, causing it to **bounce off the table's slate**"; scoop (the cue tip touches the ball and the bed at the same time and scoops it up) is treated as a miscue, and an intentional scoop is a foul (Rule 3.16c). → Our mechanism (downward strike → slate bounce) is the rule definition itself.
- **ball hop / airborne ball-ball collision** (faq/follow/ball-hop/): every shot has some cue elevation → there is always a downward component → the ball will hop; **"If the CB hits the OB while airborne, the CB and OB can both hop after impact"**; and **"If the CB hits the OB while airborne, the effective cut angle is changed slightly" (hop overcut effect, aim thicker)** → the ball-ball resolve must keep the 3D line-of-centers and the vertical friction component to reproduce these two real effects.
- **TP A.14** (technical_proofs/new/TP_A-14.pdf, actually downloaded and read): the relative sliding velocity of throw `v_rel = v_Bt·t̂ + v_Bz·k̂` (eq. 4), and the friction impulse direction ê contains a k̂ component (eq. 5) — **throw inherently has a vertical component**, and it is exactly this term that pooltool's FIXME3D zeroing cuts off. pooltool's ball-table bounce model likewise cites the TP A-14 impulse framework.
- **TP A.30**: source of the cue strike model (cited in pooltool's `instantaneous_point` docstring); at elevation angle θ, `v_B = -v·(0, cosθ, sinθ)` — the take-off vertical velocity is proportional to sinθ, and the e_t of the slate bounce then sets the departure angle. **The coefficient of restitution of ball-slate through the cloth has no published precise value**; pooltool uses e_t=0.5 (must be calibrated ourselves, see risks).

### 2.2 Virtual Pool (commercial precedent)

- VP3 manual (full text on archive.org): "Hitting downward on the cue ball … and **bouncing the ball off the table** into the air is called a jump shot. This shot is legal as long as the cue ball is bounced off the table"; pinch (the ball squeezed between cue tip and bed) decides jump vs massé; the foul entry "Ball Off Table – Hit a ball off the table. **If a ball jumps onto the rail and returns to the table, there is no penalty**". → The commercial full-3D precedent explicitly covers: slate-bounce take-off, **the ball landing on the rail top and bouncing back**, and the ball-off-table terminal state — exactly the three things we need to add, proving this product path was already made to work in the 1990s.
- The VP4 Steam page only advertises "Jump Cues can be used to jump over obstructing balls", with no engine technical details; Celeris has not published physics documentation. The engineering detail truly worth copying is instead in the comment by that 3D engine author in pooltool issue #303 (the coordinate-rotation dimension-reduction method of `Simulator::predict_ball_rail_nose_collision`).

### 2.3 Literature

- **Han 2005** "Dynamics in Carom and Three Cushion Billiards": two-dimensional assumption (`c = -v_x·cosθ_a` self-annotated "2D assumption", `model.py:49`); PZ does exist in its eq. 22, but the model assumes the bed continuously supports the ball and the vertical impulse is absorbed by the slate — restoring the PZ line only makes sense for "a ball on the table hitting the cushion and then jumping", and for an incoming airborne ball its contact-angle formula θ_a=arcsin(h/R−1) fails (the true contact normal must be used).
- **Mathavan et al. 2010** (Proc. IMechE Part C, doi:10.1243/09544062JMES1964): numerical integration with two contact points (cushion + bed), likewise a planar assumption; making it 3D requires removing the bed contact and re-deriving the system of equations, and upstream #311 has not decided to do it either.
- Dedicated literature on an airborne ball hitting the cushion nose: **none found in search** (billiards literature always assumes the ball is on the table). The closest family is impulse/numerical models of oblique ball impact on rough surfaces (e.g. Sports Engineering 2014 "Numerical simulations of the frictional collisions of solid balls on a rough surface"), the same family as `sphere_half_space_collision.py` — for the choice, no ready-made option is better grounded than "half-space impulse model + true normal".

---

## 3. Completion design

### 3a. Parabola vs cushion 3D geometric intersection: all ≤ quartic (term-by-term derivation)

Airborne ball `r(t) = r0 + v·t + (0,0,−g/2)t²`: x(t), y(t) are linear, z(t) is quadratic (no air drag/Magnus; ball spin does not affect the center of mass). Ball on the table (sliding/rolling): x,y quadratic, z identically equal to R.

| Intersection target | Equation | Degree derivation | Conclusion |
|---|---|---|---|
| Cushion nose = horizontal cylinder at height h (axis u horizontal, capsule body) | `dist²(r(t), axis) = (R+r_nose)²`, i.e. `|w|² − (w·u)² = c`, w=r(t)−p1 | Airborne: each component of w has degree ≤2 → `|w|²` contains a z² term, degree 4; `w·u` contains only x,y (u horizontal), degree 1, squared degree 2 → total degree 4. On the table: x,y degree 2 → both terms degree 4 | **quartic** (equivalent to #303's rotation dimension-reduction method: rotation is a linear transform and does not raise the degree; 2D parabola vs circle is also quartic) |
| Cushion nose degenerated to a line (nose_radius=0) | same as above, c=R² | same as above | quartic |
| Capsule end-cap sphere (cushion segment seam) | `|r(t)−p|² = (R+r_nose)²` | each component of degree ≤2, squared and summed | quartic (same form as #342 ball-ball, with one ball's velocity 0) |
| Rail top = horizontal plane z=h_rail | `z(t) = h_rail + R` (descending segment) | z quadratic | **quadratic** + a posteriori gate on the xy rectangular region (same as the existing `s_score` check, `ball_cushion.py:93-96`) |
| Bed = horizontal plane z=0 | existing `get_airborne_time` | | quadratic (existing) |
| Inner edge of the cushion top (intersection line of the nose cylinder and the top face, a horizontal line segment) | point-to-line distance² = R² | same as the cushion nose line | quartic |
| Pocket-mouth jaw vertical cylinder (currently circular cushion) | `(x−a)²+(y−b)² = (r+R)²` | airborne x,y linear → **quadratic**; on the table x,y quadratic → quartic (existing) | quadratic/quartic + z interval gate |
| Pocket rim built as a torus | | **degree 8** (confirmed by upstream #304) | no analytic solve; approximate with 2–3 vertical cylinder segments + sphere capsules, or keep the 7/5R heuristic |
| Outer table boundary (ball-off-table judgment) | vertical plane | airborne x,y linear → **linear**; z gate | trivial |
| Ball-ball (any state combination) | `|Δr(t)|²=(ΣR)²` | sum of squares of component differences of degree ≤2 | quartic (#342 merged, copy directly) |

That is: as long as the geometric vocabulary is limited to {horizontal plane, vertical plane, sphere, vertical cylinder, **cylinder with an arbitrary fixed axis**, line segment} and the airborne motion has no drag term, **every collision time is a real root of a polynomial of degree ≤4**, and the kernel's existing ≤ quartic polynomial root finder + EPS filtering for the smallest positive real root are reused directly. Engineering details to add: unify the cubic/quadratic degenerate branches (fix the FIXME at `ball_ball.py:53`); for the same cushion segment, take the smallest positive root over the three candidates nose-cylinder / top-edge / rail-top, then classify by contact point position.

### 3b. Choice of resolve for an airborne ball hitting the cushion

**Choice: ball-half-space impulse model + true contact normal (i.e. extend `resolve_sphere_half_space_collision`)**, reasons:
1. The infrastructure exists: after a quaternion rotates the normal onto the z axis, the slip/no-slip impulse code is reused (`sphere_half_space_collision.py`), and `get_normal_3d` already gives the true normal of the cushion nose cylinder (direction of ball center − foot of the perpendicular on the axis; when an incoming airborne ball hits the nose from above, the normal naturally carries a −z component).
2. Double upstream endorsement: #308 explicitly judges making Han 3D not worth it ("impulse-frictional-inelastic is equivalent to Han and easier to make 3D"); #310 judges that making that model 3D "only needs deleting the two vz-zeroing lines".
3. **Not chosen: restoring Han PZ**: the PZ line (`han_2005/model.py:79`) was derived under the assumption "θ_a is fixed by the cushion height h, the ball is on the table"; for an incoming airborne ball the contact point is not at h, the θ_a formula fails, and the assert at `:33` crashes. Keeping Han as a 2D-only model is enough.
4. Stronge compliant (current default) can likewise be made 3D (#309: delete the zeroing at `model.py:90` + switch the final state to the generic `final_ball_motion_state`), as a high-fidelity option; the numerically integrated Mathavan 2010 is not made 3D (#311 shelved, high cost).

Key addition (not mentioned upstream): after the resolve output, the **unified `final_ball_motion_state`** (cf. `ball_table/core.py:21-38`: z>R or vz≠0 → airborne) must replace each model's hard-coded `const.sliding`; when the cushion nose presses the ball toward the bed (outgoing vz<0 and z≈R) a ball-table event must fire immediately to absorb it, which is exactly the real physics of the "small hop after hitting the cushion".

### 3c. Ball-ball collision with a vertical component (jump shot hitting the upper half of the object ball)

Following #312's route:
1. Replace the xy `coordinate_rotation` at `frictional_inelastic/__init__.py:25-29` with `quaternion_from_vector_to_vector(line_of_centers_3d, ẑ)` — the line-of-centers takes the true 3D direction (significantly off horizontal when an airborne ball hits the upper half).
2. Delete the vz zeroing at `:99-100`; per TP A.14 eq. (4)(5) the friction impulse naturally contains a k̂ component; no new physics is needed, only not cutting it off.
3. Use the generic `final_ball_motion_state` for the final state; the struck object ball enters airborne when its outgoing vz>0 (reproducing Dr. Dave's two-ball hop and hop overcut effect).
4. When the object ball is pressed toward the bed (vz<0, z=R), it gets an immediate ball-table bounce via the same mechanism as §1.2 — the event loop gives the correct behavior for free.
5. `make_kiss` (`ball_ball/core.py:51-131`) is already a 3D quadratic, but needs #347's "must not press a ball to z<R" constraint added.

### 3d. List of event types to add/change

Existing (`events/datatypes.py:21-60`): NONE, BALL_BALL, BALL_LINEAR_CUSHION, BALL_CIRCULAR_CUSHION, BALL_POCKET, STICK_BALL, BALL_TABLE, 4×transition.

New:
1. **BALL_RAIL_TOP** (or generalize BALL_TABLE into a BALL_SURFACE carrying a surface-id): bounce on landing on the rail top, with a coefficient of restitution/friction different from the cloth (wood/rubber+cloth); VP3 has already shown that "jumping onto the rail and bouncing back is no foul" is a real rules scenario.
2. **BALL_OFF_TABLE**: terminal event for an airborne ball crossing the outer table boundary (→ pocketed-like state + foul-judgment hook); fixes the "rolls out 12 m" of §1.3.
3. **BALL_CUSHION adds no new type**, but the event payload gains a contact classification (nose / top-edge / jaw), for resolve parameter selection and debugging playback.
4. (Optional, later) BALL_POCKET_LIP / BALL_POCKET_BACK: real pocket-wall bounces replacing the 7/5R heuristic.
5. The transition graph is unchanged: entering and leaving airborne always goes through collision events (the invariant at `cache.py:74-75` holds).

---

## 4. Effort estimate and risks

### 4.1 Itemized estimate (person-days, one person, unit tests included; in-house kernel, ported with pooltool as the reference implementation)

| # | Item | Person-days | Notes |
|---|---|---|---|
| 1 | airborne state + parabolic evolution + BALL_TABLE detection/resolve + min_bounce_height | 3–5 | all have a reference implementation, copy-level |
| 2 | 3D cue strike (TP A-30) + downward strike → immediate bounce chain + same-instant event priority | 2–3 | priority tier needs re-examination (detector.py:87 TODO) |
| 3 | 3D ball-ball detection (position polynomial + quartic) including the degenerate-branch fix | 2–3 | #342 can be copied |
| 4 | 3D ball-ball resolve (quaternion line-of-centers frame + keep vertical throw) | 3–5 | validate against TP A.14/hop effects |
| 5 | Airborne vs linear cushion detection (capsule: fixed-axis cylinder quartic + end-cap spheres + segment gate + nose/edge/top classification) | 4–6 | the hardest numerical engineering in the whole pipeline |
| 6 | Airborne vs circular cushion/pocket jaw (vertical cylinder quadratic + z gate; torus approximated with cylinder segments) | 3–5 | |
| 7 | Cushion resolve made 3D (half-space impulse + true normal + generic final state) | 2–3 | +2 to calibrate e_c/f_c for the airborne case |
| 8 | BALL_RAIL_TOP + BALL_OFF_TABLE (geometry, detection, resolve, rules hook) | 2–4 | no upstream reference, original |
| 9 | make_kiss 3D hygiene (z-drift, no pressing into the bed, rotation correction about the cushion axis) | 3–5 | upstream #341/345/346/347 attest to the difficulty |
| 10 | Zeno/event-explosion hardening + random jump-shot fuzz (energy monotonic, event-count cap, regression baseline vs pooltool) | 4–6 | |
| 11 | (Optional) real pocket-mouth geometry replacing the 7/5R heuristic | 3–8 | recommend deferring |

**2.5D phase (1+2+3+4 + tunnelling gate 2–3): about 10–14 person-days; full-3D increment (5–10): about 22–32 person-days; 32–46 person-days in total** (excluding rendering/interaction integration, excluding optional item 11).

### 4.2 Risks

- **Zeno bounce**: ① geometric decay of the ball-table bounce — the min_bounce_height scheme already exists, measured convergence after 4 bounces; ② **new form**: when a ball slides hugging the underside of the cushion nose, the nose-cylinder normal carries −z → pressed toward the bed → the bed bounces it back → touches the nose again, an alternating cushion/table event explosion. A similar min threshold is needed on the cushion normal velocity (below the threshold, absorb the normal component and turn to rolling); this is a problem pooltool has not solved either, reserved in #10.
- **Event explosion/performance**: airborne detection raises each step's candidates from "ball × cushion segment" quadratics to quartics, combined with CollisionCache invalidation storms (break + multiple airborne balls). Mitigation: broad-phase bounding spheres (suggested in #304), and only airborne balls take the 3D branch.
- **make_kiss energy injection**: if the 3D spacer correction translates in the wrong direction it raises z (injecting potential energy) or presses into the bed (triggering false events); upstream opened 3 issues specifically for this; it must be implemented per #345's "rotation about the cushion axis + z≥R constraint" with energy-conservation assertions added.
- **Numerical ill-conditioning**: near-double roots of the quartic for grazing trajectories; EPS discipline such as the complex-root filter threshold of `quadratic.solve` (`atol=1e-9`, `ball_pocket.py:128`) should be unified into a constants table.
- **No authoritative values for physical parameters**: ball-slate through the cloth e_t (pooltool uses 0.5) and the e_c/f_c of an airborne ball hitting the cushion all lack published measurements; Dr. Dave gives only the mechanism, not numbers. Calibrate with high-speed video/real footage; start by accepting pooltool's defaults.
- **Assumption boundaries**: ignore air drag/Magnus (to keep the polynomial form), ignore cue-ball pinch in the massé phase (scoop judgment only at the rules layer), ignore cue-to-bed clearance checks (a legality check "does the cue butt hit the cushion at this elevation angle" can be added later).

### 4.3 Phasing proposal: holds, but needs one gate added

**Phase 1 (2.5D, about 10–14 person-days)**: jump take-off, airborne fly-over (3D ball-ball detection prevents passing through balls), landing bounce, everything after landing as in 2D. No cushion solve while airborne — but **a "cushion-plane crossing gate" must be added** (airborne xy is linear → intersecting with the cushion's vertical plane is a linear equation; compare z(t_cross) with the cushion height h: below h → fire a cushion event and handle it as a degraded case with the existing 2D resolve; above h → allow the fly-over, and if it crosses the outer table boundary, the BALL_OFF_TABLE terminal state). About 2–3 person-days, downgrading "tunnelling" to "a low-flying ball approximated as an on-table cushion hit", eliminating the most glaring artifact. pooltool main is currently ≈ this phase minus the gate, which shows this split is natural (the dependency graph of the upstream A/B/C issue series splits it the same way).
**Phase 2 (full 3D, about 22–32 person-days)**: capsule cushion nose quartic detection, 3D cushion resolve, rail top, ball-ball vertical component, make_kiss hygiene, hardening.
**Phase 3 (optional)**: real pocket-mouth geometry, parameter calibration, massé (note: massé's curved trajectory is not a polynomial in t and would break this kernel's analytic root-finding premise; it should be explicitly excluded from this project's scope).

## Appendix: notes on the verification method

pooltool in a temporary `uv venv` environment (numpy/numba/quaternion/panda3d etc.) can directly run headless `simulate()` with an `is_3d=True` engine; the reproduction script is the `_build_3d_engine()` pattern of `sandbox/airborne_demos.py`, no graphics stack needed. All the event sequences above are output measured on this machine.