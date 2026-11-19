# Banking / kicking systems — quantitative anchor catalog

Hunt date: 2026-07-03. Machine-readable twin:
`crates/pool-core/tests/fixtures/anchors/banking_systems.json`
(schema + consistency gates: `crates/pool-core/tests/anchors_banking.rs`).
Related, NOT duplicated here: `kick.json` (sidespin 1/2/3-diamond kick offsets),
`hsv_response_surface.json` (rebound kinematics), `mathavan2010_figs.json`,
`docs/research/gap-k66-cushion-params.md` §3, `an internal tangential-plan note` §2.2.

Our table is a 9-ft WPA pool table. Diamond-system numbers below are the Dr. Dave
**pool-table** forms; carom-numbered variants of Corner-5/Plus would be
REFERENCE-ONLY (none needed to be digitized). 1 diamond = 12.5 in = 0.3175 m.

## 1. Sliding-bank reference lines (fast / stun banks)

### TP B.27 — Sliding Bank System Comparisons (2023-08-10)
<https://drdavepoolinfo.com/technical_proofs/new/TP_B-27.pdf>

Measured through-diamond bank reference line (9' Olhausen):

| aim on banking rail | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 |
|---|---|---|---|---|---|---|
| cue crosses opposite rail | 1.38 | 2.72 | 3.89 | 5.07 | 6.38 | 7.74 |

Candidate systems compared against that line:

- 1-more-than-twice (through diamond): `y = 2x + 1` — overshoots small angles.
- Eckert / Briesath thirds (through diamond): `y = (8/3)x` — overshoots large angles.
- 1/3-more-than-twice **in the rail grooves**: `y = 2a + 1/3`.
- **Winner ("twice-plus-tenth"): `y = 2.2a` measured in the rail grooves across
  from the diamonds** (`f = 1/5`, groove targets for aim 0.5…3 are exactly
  1.1, 2.2, 3.3, 4.4, 5.5, 6.6). Geometry constants: diamond spacing D = 12.5",
  diamond-line→groove offset d = 4.25/12.5 = 0.34 diamond, groove-to-groove
  width w = 48.25/12.5 = 3.86 diamonds. Frame conversions:
  `a_opt(x) = x / (1 − d(1+f)/w)`, `opt(a) = (2+f)a + (1+f)(a/w)d`.
  Round-trip residuals vs the measured line ≤ 0.15 diamond (worst point aim=1).
  This completes the "≈2.2× in rail grooves" digitization started in
  `cushion-tangential-plan.md` §2.2.

### TP B.28 — five-table sliding-bank comparison (2023-08-26)
<https://drdavepoolinfo.com/technical_proofs/new/TP_B-28.pdf>

Same aim points; measured opposite-rail crossing (larger = banked shorter).
All tables except the Olhausen: slightly humid, old worn-in cloth.

| table | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 |
|---|---|---|---|---|---|---|
| 9' Olhausen | 1.38 | 2.72 | 3.89 | 5.07 | 6.38 | 7.74 |
| 9' Diamond Red Label | 1.40 | 2.93 | 4.52 | 5.60 | 6.92 | 8.30 |
| 7' Valley bar box | 1.51 | 2.74 | 4.12 | 5.19 | 6.52 | 7.54 |
| 9' Brunswick Gold Crown | 1.27 | 2.88 | 4.38 | 5.38 | 6.56 | 7.96 |
| 7' Diamond bar box | 1.60 | 3.31 | 4.94 | 6.22 | 7.55 | 8.59 |

Conclusions (Dr. Dave): twice-plus-tenth matches typical tables; Olhausen and
Valley "on system"; Gold Crown slightly short when humid/worn (medium angles);
Diamond tables bank **very** short, the 7' bar box "almost a diamond shorter
than typical 'on system' tables" (8.59 vs 7.74 at aim 3).

### McClain 4d-to-10d large-angle correction (sliding banks FAQ)
<https://drdavepoolinfo.com/faq/bank-kick/sliding/>

Origination rail numbered 4d, target rail 10d. Correction: `target = 0.4·departure − 1`
(long rail, before the corner) / `+ 1` (short rail, after it). Worked examples:
40→15, 60→23, 80→31, 100→41, 120→49. Alternatives named there: Schofield 8-10-12,
Briesath diamond-connect ("Large-Angle Banks", BD Dec 2023).

## 2. Rolling-ball systems (slow/medium, the "long" regime)

### 2-to-1 through-diamond system — BD Jan 2024 "Improved 2-to-1 System"
<https://drdavepoolinfo.com/bd_articles/2024/jan24.pdf>

Rolling CB, **strict centerball** ("even a hair of running spin → long; a hair
of reverse → short"). Tracks to the corner: 2→1, 3→1.5, 4→2, 5→2.5 (far rail →
near rail) and anything in between. Above the 5-to-2.5 line rolling kicks/banks
go **long** (e.g. the 6-to-3 track); measure the arrival error 2e and move the
aiming-rail point up-table by e (half). Between lines: 2-to-1 pivot (butt moves
2× the tip), never a parallel shift. Also usable for rolling banks off any rail.

### Corner-5 three-rail system — TP 7.2 + BD Jan 2011 adjustments
<https://drdavepoolinfo.com/technical_proofs/TP_7-2.pdf>,
<https://drdavepoolinfo.com/bd_articles/2011/jan11.pdf>

Rolling CB with **running english**, aim through the diamonds. Traditional
numbering: corner = 5; origination numbers fall by 1/2 per diamond along the
long rail (4.5, 4, 3.5, 3…), rise by 1 along the short rail (6, 7, 8).
Formula `T = D − F` (third-rail target = origination − first-rail aim);
alternative doubled numbering `T = D′/2 − F + 1`. Benchmark: 5 − 2 = 3 → far corner.
Adjustments (Jan 2011, quantified):

- Speed and english barely move the **3rd-rail** crossing (1st/2nd rail effects
  cancel) — good robustness anchor.
- **4th-rail** arrival: slower → short, faster → long (surviving sidespin into
  rail 3); less english → a little long off rail 3, more english → longer still.
- Origination D < 5 → tracks arrive short: reduce first-rail number
  (≈ 1/3 diamond at D = 3.5). D > 5 → long: increase it (≈ 1/3 diamond at D = 7).

### Plus (Plus-Two) system — handout
<https://drdavepoolinfo.com/resource_files/Plus_System.pdf>

Two-rail kicks off a short rail (also 3-rail off a long rail). Rolling CB with
running english. Short-rail numbering 1 (corner), 3, 5, 7 at the diamonds; aim
through diamond N → CB returns "plus N" diamonds up the first long rail.
Benchmark: through the 5th diamond → plus 5 → far corner. Sensitivities from
the handout: too much **speed → long**; too much **english → short**; high
numbers (6-7) want less english, low numbers (2) want more.

### One-rail mirror kicks

TP 6.2 (mirror-image kick geometry) and TP B.11 (shallow-angle contact-point
mirror) are pure geometry — weak anchors; the rolling 2-to-1 system above plus
the speed/spin effects below are what perturb the mirror in practice.

## 3. Physics effects (Dr. Dave bank/kick effects FAQ + TPs)
<https://drdavepoolinfo.com/faq/bank-kick/effects/>

- **Speed**: more speed shortens the rebound, less lengthens it. Mechanisms:
  fast shots arrive sliding (no roll to bend long after the cushion; post-rebound
  curve delayed) plus "rail throwback". HSV B.41 note: for the *immediate* rebound
  angle of a sliding ball, throwback (short) and cushion-efficiency (long) speed
  effects appear to roughly cancel → roll state is the dominant lever.
- **Top/draw**: topspin lengthens the kick rebound, backspin shortens it; a stun
  ball rebounds without curve at the mirror minus a small friction correction.
  Steep kicks: rolling in → stun out; stun in → roll out.
- **TP 7.3** (vertical spin at the rail, e=0.7, μ=0.17, contact a=0.08R, v=5 ft/s):
  `ω' = 5(1+e)v/(2R²)(μR + a) − ω`. Rolling in (53.3 rad/s) → 3.3 out (≈ killed);
  1.5× topspin (80) → −23.3 (follow survives); stun (0) → +18.1 (picks up follow);
  0.5× draw (−26.7) → 6.3 (≈ killed). The rail is a strong vertical-spin
  attenuator biased toward mild follow on exit.
- **Sidespin**: running lengthens + adds speed, reverse shortens + bleeds speed;
  angle effect greatest straight into the rail; speed-difference peaks ~20-40°
  from the perpendicular; 1/3, 2/3, 3/3 max spin ≈ 1, 2, 3 diamonds cross-table
  change (primary digitization: `kick.json`); at steep approach the sidespin can
  reverse off the cushion.
- **Cut-induced/transferred spin on banks**: outside cuts shorten, inside cuts
  lengthen (unless gearing outside english cancels); CB left english → OB right
  spin → rebound shifts right; magnitudes are throw-scale (small).
- **TP 6.3**: friction-free, `tan θr = tan θa / e` — restitution alone always
  lengthens banks; useful degenerate-mode solver check.
- **Equipment**: bouncier cushions (higher normal COR) → shorter kicks/banks;
  new/clean/polished balls, slick cloth, dry air → longer; low nose → shorter
  and hoppier (see `gap-k66-cushion-params.md`).

### Diamond-brand corrections
<https://drdavepoolinfo.com/faq/bank-kick/diamond/>

Artemis cushions "very bouncy", nose often low and angled down. 2-to-1 and
Corner-5: aim the calculated rail number −10% (0.9 for 1; 2.7 for 3), at the
rail not through the diamond. Plus system: ≈ 1/4-diamond shift over a wide range
of entry angles. Slow-roll alternative: aim relative to the rail groove. Blue
Label longer than Red Label but still shorter than other brands.

## 4. Roll-state experiment — Bob Jewett (BD 2004-08 "Shortening Banks")
<https://web.archive.org/web/2023id_/http://www.sfbilliards.com/articles/2004-08.pdf>
(already summarized in `cushion-tangential-plan.md` §2.2; carried here as a
banking anchor)

24-case controlled experiment: **rolling banks rebound ~14° longer than sliding
banks** (15° with waxed balls — cloth friction is not the carrier); sliding-bank
angle nearly speed-independent on pool rails (hard only 0.9° shorter); a snooker
L-profile rail *inverts* the speed effect (soft 3-4° shorter — REFERENCE-ONLY).
Companion 2004-09 "Short Banks": fixed ~70%-of-width aim point for sliding
cross-side banks. Pairing rule for the simulator: the same aim line replayed
rolling vs sliding must open ≈ 14°, and TP B.27/B.28 lines are the sliding side
while the 2-to-1 tracks are the rolling side of that pair.

## 5. Banking with the Beard (Freddy Bentivegna) — secondhand, low confidence

Sources: Bentivegna, *Banking with the Beard* (ISBN 9780976622819);
secondary coverage:
<https://crazyaboutpool.wordpress.com/2012/02/21/banking-lesson-from-freddy-the-beard-bentivegna/>,
AZB threads 315761 ("Banking Secrets"), 210628 ("Hard Banks Curve Short", Beard
posted), 413638, 531296.

Speed/english compensation tables (CB on vertical axis ±1/2 tip; entries are
tips of *opposite/bank-favoring* english; hard = always "no adjustment, hit full
in face" — his dead-ball doctrine):

| shot (cushion pt → opp. diamond) | soft | medium | hard |
|---|---|---|---|
| cross-side 1.6 → 2.5 | 1 | 1 | 0 |
| cross-side 2.6 → 3.0 | 2 | 2 | 0 |
| cross-side 3.3 → 3.5 | 3 | 3 | 0 |
| long cross-corner 1.6 → 5 | 1 | 0 | 0 |
| long cross-corner 2.6 → 6 | 2 | 1 | 0 |
| long cross-corner 3.3 → 7 | 3 | 2 | 0 |
| straight-back 3.3 → 2.5 | 0 | 1 | 0 |
| straight-back 5.4 → 3 | 0 | 1 | 0 |
| straight-back 6.8 → 3.5 | 0 | 1 | 0 |

Observational doctrine (ordinal, attributed): harder = shorter / softer = longer
("speed kills banks"); banks wider than ~37° open up at soft speed; shorten with
speed, draw (stun arrival) or inside english; zig-zag (multi-rail) banks compound
short — first-rail sidespin shortens the second rail, worse with speed;
interchangeability: **1 tip of english ≈ 1/4 diamond ≈ 1/4 ball-hit fullness**.
(An AZB instructor's separate rule — 2:1 ratio for soft banks, 2.5:1 for medium —
is consistent with the Dr. Dave rolling 2:1 vs sliding ~2.2-2.5 split.)

## 6. Cross-source contradictions and equipment dependence

1. **English lengthens vs shortens multi-rail tracks.** Corner-5 (3 rails, long
   rail first): *more* english → arrives longer off rail 3. Plus system (2 rails,
   short rail first): *too much* english → arrives **short** of the target corner.
   Not a physics conflict — geometry decides which side of the target the extra
   sidespin walks the ball to — but it forbids a global "english → long" rule.
2. **Speed shortens banks vs sliding banks are speed-independent.** "Harder =
   shorter" (Beard, FAQ) is about how much *roll* survives to the cushion; once
   the arrival is sliding, Jewett measured only 0.9° further shortening from
   speed on pool rails, and Dr. Dave's HSV B.41 sees throwback vs COR effects
   canceling. Encode speed through roll state, not as a direct angle knob.
   Snooker L-profile rails invert the residual speed effect (soft = shorter).
3. **Topspin lengthens the rebound vs fast+slick shortens the path.** The angle
   effect of topspin is always "long", but at fast speed on slick cloth the
   post-rebound curve is delayed so the *path to the target* can play shorter —
   length-of-curve vs rebound-angle must be asserted separately.
4. **Equipment dependence.** The whole TP B.28 spread (≈ 0.9 diamond at aim 3)
   is brand + humidity + cloth wear; Diamond-brand corrections (−10% rail number,
   1/4 diamond for Plus) are of the same order as system slack on a typical
   table. Any hard gate must therefore pin the table preset, and brand bias
   belongs in cushion parameters (e_n, nose height), not in system formulas.
