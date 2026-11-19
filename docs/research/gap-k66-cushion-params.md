# gap: US pool (K-66) cushion parameter baseline table + arbitration of parameter conflicts between reports

## KEY TAKEAWAYS
- Mathavan 2010's h=7R/5 (sinθ=2/5) is an uncited assertion in the paper (the original sentence says 'In both snooker and pool'); it roughly holds for snooker and is clearly wrong for pool; pool v1 must use the WPA spec of 63.5%±1% of the ball diameter, i.e. h=36.3mm, sinθ=0.27, θ≈15.7°.
- Magnitude of the consequence of using the wrong convention: Han 2005 numerical experiments show that h=1.4R, compared with 1.27R, makes the rolling-ball rebound angle systematically longer by 4.7–5.8°, perpendicular rebound speed ratio 0.69 vs 0.81, cross-table bank landing error about 0.86 diamond.
- pooltool itself uses the WPA convention: cushion_height=0.64×2R at specs.py:108 (64% of the ball diameter, within the WPA tolerance), and both the han_2005 and stronge_compliant models derive θ from it; 7R/5 is used only in the ekiefl blog as the pocket back-edge height.
- Both pooltool conflicts are real: the e(v) at han_2005/properties.py:21 is unreachable dead code and its constant term 0.50 does not match Han's original 0.39; the omega_ratio class default is 1.7 (model.py:126) but default_resolver passes 1.8 (resolver.py:79), so 1.8 is what actually takes effect at runtime.
- For US pool there is no public first-hand measured K-66 cushion COR/friction data; the closest is Dr. Dave TP B.28 (2023), a measured sliding bank through-diamond table for 5 tables (the 7' Diamond banks nearly 1 diamond shorter than 'on system' tables).
- Usable semi-first-hand quantitative anchors: 1/3, 2/3, full sidespin perpendicular kick ≈ 1/2/3 diamonds lateral shift (Dr. Dave effects FAQ); Diamond system correction about 10% or 1/4 diamond (Diamond FAQ); TP 7.3 worked example e=0.7@1.5m/s, μ_rail=0.17; WPA §8 lag 4–4.5 table lengths.
- Neither of the two ready-made speed-dependent COR curves is adopted: the Mathavan quadratic fit is not in the paper's body text, numerically contradicts the paper's own stated 0.818 average equivalent COR, and comes from snooker equipment; the Han 2005 e(v) shape is unphysical and van Balen falsified it on similar carom equipment (a constant 0.85 is better).
- v1 landed formula: e_c is a constant 0.85 (Diamond/Artemis may go up to ~0.9), expose an e_c(v_n)=clamp(e0+k·(v_n−1), 0.6, 0.98) hook with k defaulting to 0 pending calibration; μw is 0.20 (range 0.14–0.22); valid domain normal speed component ≤2.5 m/s (upper limit of Mathavan's rigid assumption).
- Calibration priority: perpendicular rolling cushion rebound ratio curve (sets e_c and k) → slow oblique cushion rebound angle (checks θ) → fast sliding bank reproducing TP B.28 (joint validation + brand bias) → three-level sidespin kick (locks μw) → sidespin retention (locks the tangential compliance parameters).
- Nose height ≠ contact-point height: accounting for the K-66 round-nose radius of 5mm, the geometric contact angle is sinθ_eff≈0.23, and the TP 7.3 effective line of action is even as low as 0.08R; recommend sinθ∈[0.23,0.28] as a calibration range rather than a fixed value.

## OPEN QUESTIONS
- The exact source of the quadratic fit y=−0.0877x²+1.131x−0.0953 could not be verified: it is not in the Mathavan 2010 body text, the pooltool code/git history or ekiefl's two blog posts, and is presumably a digitized fit of the paper's Fig. 7; moreover its implied speed ratio (0.87–0.95) is in numerical tension with the paper's own stated 0.818 average equivalent COR, which can only be settled by obtaining the raw Fig. 7 data points.
- No manufacturer COR/hardness (durometer) datasheet was found for K-66 (or Artemis) cushion rubber, nor any first-hand high-speed-camera COR/friction measurement of any pool table cushion; champbilliards' nose-height test has only qualitative conclusions.
- Official nose-height values for snooker tables were not obtained (the WPBSA rules contain no percentage), so the accuracy of 7R/5 for snooker can only be rated 'self-consistent with Mathavan's own experiments', not independently confirmed.
- The conflict in TP 7.3 between the effective line of action a=0.08R and the geometric nose height 0.27R (the position of the normal-impulse line of action during cushion rubber compression) has no authoritative answer, and it directly affects what the 'effective value' of θ should be.
- Several pages on the billiards.colostate.edu domain return 403 (e.g. the old Diamond FAQ address, HSV B.41); some content was obtained via drdavepoolinfo.com mirrors and summaries, without a verbatim check against the original pages; Dr. Dave's HSV B.41 quantitative data on the effect of speed on bank angle was not obtained.
- The calibration basis for the pooltool resolver default omega_ratio=1.8 is not recorded in the CHANGELOG/PRs (#240, #256), and the effect of the 1.7→1.8 difference on pool sidespin retention is not quantified.
- The original Han 2005 paper PDF was not obtained directly; e(v)=0.39+0.257v−0.044v² was verified via the citation in van Balen's thesis (its mismatch with the 0.50 constant in pooltool's dead code is confirmed by two sources).

## REPORT
# US Pool Cushion Collision Model v1 Parameter Arbitration and Recommendation Report

Target equipment: K-66 cushion rubber + 2.25"/57.15mm Aramith balls + Simonis 860; basis for arbitration: the original Mathavan 2010 paper, the official WPA spec PDF, the original Dr. Dave FAQ/TP texts, pooltool source code and git history, van Balen's thesis, and numerical sensitivity experiments done with the Han 2005 equations.

---

## 1. Arbitration one: contact-height convention —— 7R/5 is an uncited assertion in the paper, pool must use the WPA convention sinθ≈0.27

**Mathavan 2010 original text verified** (text extracted from the full PDF): the paper's original sentence is *"According to Fig. 3, the height of the contact point at the rail (i.e. I) is h. In both snooker and pool h = 7R/5, where R is the ball radius. … thus, sinθ = 2/5."* —— this is an **assertion without any citation**, not a measurement on its experimental table (a Riley Renaissance snooker table), and it does not distinguish snooker from pool. For snooker (L-shaped cushion rubber, a 3/8"-high flat nose face, 52.5mm balls) this value is roughly credible (consistent with its own experimental fit); **for pool it is clearly wrong**.

**WPA first-hand spec** (RECOMMENDED-EQUIPMENT-SPECIFICATIONS, Nov 2001, https://wpapool.com/wp-content/uploads/2024/01/RECOMMENDED-EQUIPMENT-SPECIFICATIONS.pdf §7, verbatim): *"Rail height (nose-line to table-bed) should be 63 ½% (+1%) or between 62 ½% and 64 ½% of the diameter of the ball."* That is, nose height h = 0.635D = 36.30mm (2.25" ball), h/R = 1.27, **sinθ = 0.27, θ ≈ 15.66°**, tolerance band sinθ ∈ [0.25, 0.29].

**K-66 installed nose height in practice**: the champbilliards K-66 page gives a nose-height-to-angle table (61%→1-3/8", 62%→1-13/32", 63%→1-27/64", 64%→1-7/16", corresponding to profile angles 22°30′–23°30′), and its own test concludes in favor of 1-13/32" (62%); legacybilliards says the standard nose height should be 1-3/8"~1-7/16" (61%~64%). That is, an installed K-66 falls within the WPA tolerance band and **will never reach 70% (7R/5)**. The Dr. Dave cushion nose height FAQ (https://drdavepoolinfo.com/faq/table/cushion-nose-height/) likewise cites WPA 63.5%±1%, and explains that 0.7D (exactly the center of percussion, TP 4.2) would press the ball into the bed, wear a rail groove and make the ball jump, so 0.635D is an empirical compromise.

**Two refined conventions (mind them during calibration)**:
- Nose height ≠ contact-point height. Considering the K-66 round-nose radius r_n≈5mm (pooltool `cushion_nose_radius=0.005`), the geometric contact angle sinθ_eff = (h−R)/(R+r_n) ≈ 7.7/33.6 ≈ 0.23 (θ≈13.3°), slightly below 0.27.
- Dr. Dave's own TP 7.3 worked example even uses a = 0.08R (the effective line of action of the normal impulse is 0.08R above the ball center), suggesting that during compression the effective line of action may be far below the geometric nose height. v1 recommends following the mainstream convention sinθ = h/R−1 = 0.27, leaving sinθ ∈ [0.23, 0.28] as the calibration range.

**Magnitude of the consequence of using the wrong convention** (numerical experiment done with the Han 2005 equations, e=0.85, μ=0.2, rolling ball):
- Rebound angle (measured from the normal): at incidence 30°/45°/60°, h=1.4R is longer than h=1.27R by **+4.7° / +5.8° / +4.8°** respectively (independent of speed, a systematic bias);
- Rebound speed ratio of a perpendicularly incident rolling ball: **0.811** at h=1.27R, **0.690** at h=1.4R, i.e. the rebound speed is systematically lower by about 15% (relative);
- Converted to bank error: a cross-table bank on a 9-ft table (table width 50"), at 45° incidence tan(49.5°)−tan(43.7°)≈0.21, landing-point offset ≈ 10.7 inches ≈ **0.86 diamond** —— enough to systematically distort every bank/kick.

**Conclusion: pool v1 adopts θ = arcsin(0.27) ≈ 15.7° (h = 36.3mm = 0.635D); 7R/5 is used only when simulating snooker.**

## 2. Arbitration two: pooltool implementation check —— pooltool uses exactly the WPA convention; the dead-code and omega_ratio conflicts are both real

- **Contact height**: `pooltool/objects/table/specs.py:108` `cushion_height = 0.64 * 2 * 0.028575` (= 0.036576m, 64% of the ball diameter, within the WPA tolerance; `collection.py:34` has the same value). `han_2005/model.py:40` uses `theta_a = arcsin(h/R − 1)` (h taken from `cushion.height`, model.py:100); `stronge_compliant/model.py:33` takes the 3D normal via `cushion.get_normal_3d` (`components.py:186-212`), and `layout.py:27,74` sets the z of the cushion line endpoints to cushion_height, so both models likewise imply sinθ = 0.28. **Confirmed: pooltool uses the WPA convention, not the paper's 7R/5** (in the ekiefl blog 7R/5 is used only for the pocket back-edge height h_M, unrelated to the cushions).
- **Dead code**: `han_2005/properties.py:20-21` —— `return e_c` is immediately followed by the unreachable `return max([0.40, 0.50 + 0.257*v − 0.044*v²])`. Also note: **the constant term 0.50 does not match the original Han 2005**. van Balen's thesis (p.24) cites Han's original formula as **e = 0.39 + 0.257·v_x0 − 0.044·v_x0²**; the pooltool version changes 0.39 to 0.50 and adds a 0.40 floor, with no source for the change. The docstring cites van Balen's recommended constant 0.85.
- **The omega_ratio conflict is real**: the class default is 1.7 (`stronge_compliant/model.py:126,142`), but `default_resolver()` in `resolver.py:79,82` explicitly passes 1.8 —— **1.8 is what actually takes effect at runtime** (resolver.yaml VERSION=11). The CHANGELOG confirms that Stronge Compliant has replaced Mathavan 2010 as the default cushion model ([#256]), but does not record the tuning basis for 1.7→1.8.
- Ball parameter defaults: `objects/ball/params.py:81-82` e_c=0.85, f_c=0.2 (same for POOL_GENERIC, params.py:169-170), with its own note "nothing here is well-researched".

## 3. Inventory of first-hand/semi-first-hand cushion data for US pool

**Semi-first-hand quantitative data (Dr. Dave, measured on pool equipment):**
- **TP B.28** (2023-08, https://drdavepoolinfo.com/technical_proofs/new/TP_B-28.pdf): measured sliding bank through-diamond table for 5 tables (aim = 0.5/1/1.5/2/2.5/3): 9' Olhausen meas=[1.38,2.72,3.89,5.07,6.38,7.74]; 9' Diamond Red Label=[1.40,2.93,4.52,5.60,6.92,8.30]; 7' Valley=[1.51,2.74,4.12,5.19,6.52,7.54]; 9' Brunswick GC=[1.27,2.88,4.38,5.38,6.56,7.96]; 7' Diamond bar box=[1.6,3.31,4.94,6.22,7.55,8.59]. Conclusion verbatim: *"The 7' Diamond bar-box banked almost a diamond shorter than typical 'on system' tables!"* (note that a larger value in the table = a "shorter" rebound). This is currently the closest-to-first-hand public quantitative pool cushion data set.
- **Dr. Dave bank/kick effects FAQ** (https://drdavepoolinfo.com/faq/bank-kick/effects/) quantitative anchors: for a perpendicular kick into the cushion *"1/3, 2/3 and 3/3 of maximum spin result in approximately 1, 2 or 3 diamonds of cross-table change"*; the faster the speed, the shorter the bank (the mechanism is mainly fast → no rolling topspin → sliding state, plus rail throwback); "bouncier cushions (higher normal COR) make kick/bank shorter".
- **Quantified claims of Diamond 'bank short'** (https://drdavepoolinfo.com/faq/bank-kick/diamond/): Diamond uses Artemis cushion rubber "very bouncy"; nose height "often lower than normal and angled down slightly"; system corrections: about **10%** for the 2-to-1 and Corner-5 systems (aim 0.9 instead of 1, 2.7 instead of 3), about **1/4 diamond** for the Plus Two system; Blue Label still banks shorter than other brands.
- **TP 7.3** (https://drdavepoolinfo.com/technical_proofs/TP_7-3.pdf): the worked example uses rail COR **e = 0.7** (v = 5 ft/s ≈ 1.52 m/s), ball-cushion friction **μ = 0.17**, effective action height a = 0.08R. TP 6.3 proves: since e<1, when friction is ignored the rebound angle must be larger than the incidence angle (θr>θa).
- **WPA §8 functional speed spec**: a center-ball level firm stroke from the head spot, the ball must travel a full **4~4.5 table lengths** without jumping —— usable as a constraint for jointly calibrating e_c and u_r.

**Data transferred from papers/theses (non-pool equipment):**
- Mathavan 2010 (snooker, Riley table): best fit **e_e = 0.98 (Stronge energetic COR), μw = 0.14**; equivalent speed ratio of a rolling ball hitting the cushion perpendicularly **0.818** (average); valid domain of the rigid assumption **V0 (normal) < 2.5 m/s**; μs (ball-cloth) measured 0.178–0.245, taken as 0.212.
- Marlow "The Physics of Pool" (cited via Mathavan): pool cushion e_e = **0.55** (its definition leans toward an "effective value", not directly comparable with the energetic definition behind 0.98).
- van Balen's thesis (carom table, https://essay.utwente.nl/59134/1/scriptie_J_van_Balen.pdf p.24-25): after implementing Han e(v), the reproduction of 15 three-cushion paths was poor; switching to a **constant e = 0.85** was clearly better; μs=0.2 (Marlow), μsp tuned from 0.044 to 0.022.
- champbilliards' K-66 nose-height comparison test: only qualitative conclusions (62% nose height "maximum performance in rebound and consistency"), no COR values.

**Public first-hand measurements of K-66/pool table cushion COR and friction coefficient (high-speed camera, mechanical test rig): not found after multiple rounds of searching —— judged "none".** The closest are the TP B.28 bank landing data and Dr. Dave's HSV videos (no numeric tables provided). This means the exact values of e_c and μw for K-66+860 cloth must be calibrated by ourselves.

## 4. Speed-dependent COR: neither ready-made curve should be the pool default; landed as "constant base value + linear correction pending calibration"

- **Mathavan quadratic fit y = −0.0877x² + 1.131x − 0.0953**: this formula is **not in the paper's body text** (full text searched; the paper's own description of Fig. 7 is only "equivalent COR average 0.818" and the RMS fit of e_e=0.98/μw=0.14), nor in the pooltool code, the git history or ekiefl's two blog posts —— it should be a digitized fit of Fig. 7, source to be found. It is also numerically in tension: substituting in m/s, the formula gives speed ratios of 0.87–0.95 (0.5–2.5 m/s), significantly above the paper's own stated 0.818 average. Even if it holds, it is an **observation on snooker equipment (L-shaped cushion rubber + wool cloth + 52.5mm balls) under h=1.4R geometry**, differing from pool in θ, cushion rubber and cloth covering, and **cannot be transferred directly**.
- **Han 2005 e(v) = 0.39 + 0.257v − 0.044v² (carom)**: e=0.39 at v=0, peak 0.77 at 2.9 m/s —— "COR first rises then falls with speed" violates common knowledge about rubber, and looks more like geometric/friction effects mixed into the fit; van Balen could not reproduce paths with it even on **similar carom equipment** (constant 0.85 is better); in pooltool it is dead code anyway and its constant was altered. **Discarded.**
- **Landing recommendation**: v1 uses a constant e_c; expose the parameterized hook `e_c(v_n) = clamp(e0 + k·(v_n − v_ref), e_min, e_max)`, default k=0, v_ref=1 m/s, clamp [0.6, 0.98], with k calibrated from a self-shot 240fps "perpendicular rolling cushion rebound ratio vs incidence speed" curve. Rationale: (a) no first-hand pool data supports any non-constant shape; (b) "the harder you hit, the shorter the bank" is explained in impulse models mainly by the sliding/rolling state and μw, with no need to force it via e(v) (Dr. Dave HSV B.41 even speculates that rail throwback and the COR speed effect cancel each other out); (c) the quadratic behaves pathologically at the extrapolation ends (v→0, v>3 m/s), linear+clamp is more robust.

## 5. US pool v1 cushion parameter recommendation table

| Parameter | Recommended value (v1) | Basis/source | Confidence |
|---|---|---|---|
| Contact height h | 0.635D = 36.30mm (h/R=1.27) | WPA spec §7 verbatim; K-66 installation practice 61–64% | **First-hand spec** |
| θ (normal downward tilt angle) | arcsin(0.27) ≈ 15.7°; calibration range sinθ∈[0.23, 0.28] (nose radius/effective line of action uncertainty) | WPA + geometric derivation + TP 7.3 corroboration | spec+derivation; range pending calibration |
| e_c base value (normal COR, Han/Stronge-type model convention) | 0.85 (Diamond/Artemis may go up to 0.88–0.92; old K-66 down to 0.75) | van Balen carom path fit; pooltool default; TP 7.3's 0.7 and Marlow's 0.55 corroborate lower bounds under different definitions | **Transferred from papers, must be calibrated** |
| e_c(v) curve | constant; hook e0 + k·(v_n−1), k default 0, clamp [0.6, 0.98] | argued in §4 of this report; inspired by Mathavan's valid domain | **Pending calibration** |
| μw (ball-cushion friction) | 0.20 (range 0.14–0.22) | Mathavan snooker fit 0.14 (lower bound); TP 7.3 0.17; pooltool/Marlow convention 0.2 (cloth-covered K-66 has higher friction) | transferred from papers, pending calibration |
| Valid speed domain | model credible for normal speed component v_n ≤ 2.5 m/s; 2.5–5 m/s labelled "extrapolation", expect a shorter rebound and the ball sinking into the cushion rubber | Mathavan 2010 original (experiments at V0>2.5 m/s deviate from the rigid assumption) | transferred from papers (snooker), pool domain pending validation |
| Behavioral check anchors | rolling ball 2:1 through-diamond; sliding bank matches TP B.28; 1/3 / 2/3 / full sidespin perpendicular kick → 1/2/3 diamonds; WPA 4–4.5 table-length lag | Dr. Dave FAQ/TP + WPA §8 | semi-first-hand measurements |
| Diamond table brand bias (optional) | bank angle "shortening" bias: 7' Diamond ≈ −1 diamond @ aim 3 (or system correction −10%) | TP B.28 measured table; Diamond FAQ | semi-first-hand measurements |

**The pooltool side should be fixed in step**: (1) delete the dead code at `han_2005/properties.py:21`, or restore Han's original 0.39 and note why it is deprecated; (2) unify omega_ratio (class default 1.7 vs resolver 1.8), and record the calibration basis for 1.8; (3) 0.64D can stay (within the WPA tolerance); if the nominal value is wanted, change it to 0.635D.

## 6. Items to calibrate with self-shot 240fps video (by priority)

1. **Perpendicular rolling-ball cushion rebound speed ratio vs incidence speed** (0.5–4 m/s, ≥8 speed points, ≥5 shots per point): directly calibrates e_c and the e(v) slope k; also watch whether a "sinking into the cushion" knee appears at >2.5 m/s (sets the valid speed domain).
2. **Rebound angle of a no-sidespin rolling ball hitting the cushion obliquely** (15°/30°/45°/60°, slow): validates the θ/h convention (the rebound angle is most sensitive to θ and insensitive to speed —— so in both Mathavan Fig. 8 and this report's numerical experiments).
3. **Stun (stun/sliding) ball hitting the cushion obliquely**: fast cross-table bank, reproduce TP B.28's aim→meas table, calibrate the joint effect of μw and e_c, and quantify our own table's brand bias relative to "on system".
4. **Perpendicular kick + 1/3, 2/3, full sidespin**: validate the 1/2/3 diamonds anchor, lock μw on its own.
5. **Sidespin retention**: ratio of sidespin angular velocity before and after the cushion (high-speed close-up of ball-surface markings), constrains the tangential compliance parameters (omega_ratio / beta_t).
6. **lag test**: WPA §8's 4–4.5 table lengths, jointly check e_c and the rolling resistance u_r (to avoid misattributing cloth losses to the cushion).
7. (Optional) **Cushion-nose contact close-up**: contact duration and nose compression as functions of speed, supporting later modelling of h_eff(v).

## Appendix: key source files and line numbers
- `../pooltool/pooltool/physics/resolve/ball_cushion/han_2005/properties.py:20-21` (dead code)
- `../pooltool/pooltool/physics/resolve/ball_cushion/han_2005/model.py:40,100`(θ=arcsin(h/R−1),h=cushion.height)
- `../pooltool/pooltool/physics/resolve/ball_cushion/stronge_compliant/model.py:126,142` (omega_ratio=1.7) and `../pooltool/pooltool/physics/resolve/resolver.py:79,82` (the default resolver uses 1.8)
- `../pooltool/pooltool/objects/table/specs.py:108` (0.64×2R), `layout.py:27,74`, `components.py:186-212`
- `../pooltool/pooltool/objects/ball/params.py:81-82,163-172` (e_c=0.85, f_c=0.2)