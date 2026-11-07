# L4 expectations — flow `break` (016 T026; test-pyramid par.4, FR-014)

Version: 1 (016 freeze). Judged per checkpoint by the acceptance judging
agent (acceptance.mjs; research R15). Every criterion must hold for a
`pass` verdict; violations fail with notes.

Flow context: the fullrack scenario's break leg (e2e-touch.mjs sc12
transcription) — touch-aimed break at phi = PI/2, gauge power 8.5, slight
draw (b = -0.1), fired by the FIRE pill. Scripted (`obtool`) boot: the
green scripted-pin cloth is EXPECTED here (unlike cold-launch).

## Checkpoint `break-aimed`

- Landscape table scene with a complete, un-broken 8-ball rack (triangle
  cluster intact at the foot spot) and the cue ball on the opposite
  (head) half of the table.
- The aim/cue indication points from the cue ball toward the rack
  (up-table): a cue stick and/or aim line oriented at the cluster.
- The power gauge on the left edge shows a HIGH fill — clearly above
  half (8.5 of the 0.5–12 range).
- The FIRE pill is visible in the bottom-right quadrant, unobstructed,
  large enough to read as the primary action (≥ 64 px square-ish pill).
- No open dialog/popup covers the table (the spin popup must be closed).
- No error surface; machine still in the aiming phase (no balls in
  motion blur / scattered yet).

## Checkpoint `break-settled`

- The rack triangle is BROKEN: object balls scattered across the table
  surface; no intact triangle cluster remains at the foot spot.
- All rendered balls are at rest on the cloth (no mid-flight rendering
  artifacts); the scene reads as a settled post-break position.
- The status strip (top band) is legible and shows post-shot state; a
  rulebook decision prompt MAY be visible (a break can park a decision —
  its options must then be unclipped and finger-sized if shown).
- HUD chrome (FIRE pill, gauge) still present and unobstructed; no error
  surface, no recovery dialog.
