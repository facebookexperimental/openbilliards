# L4 expectations — flow `aimed-shot-spin-power` (016 T026; test-pyramid par.4, FR-014)

Version: 1 (016 freeze). Judged per checkpoint by the acceptance judging
agent (acceptance.mjs; research R15). Every criterion must hold for a
`pass` verdict; violations fail with notes.

Flow context: the fullrack scenario's called-pot leg — a shaped table
(cue ball at center, the called solid up-table toward the right corner
pocket), call composed by taps, then touch aim to the pot bearing
(phi ≈ 1.107), gauge power 2.5, neutral spin set through the popup pad,
fired by the FIRE pill. Scripted (`obtool`) boot: green cloth expected.

## Checkpoint `pot-aimed`

- A sparse shaped layout (a handful of balls, NOT a full rack): the cue
  ball near table center with a colored solid between it and the
  top/right corner region; the 8-ball and two far stripes parked on the
  lower half.
- The aim/cue indication points from the cue ball toward the called
  object ball on the pot line to the right-corner pocket.
- The power gauge shows a LOW fill — clearly below half (2.5 of the
  0.5–12 range). A near-full gauge = fail (this leg is the soft aimed
  shot, distinct from the break).
- The composed call is visible in the HUD: the status-strip call
  indicator shows a called ball/pocket (and/or a highlighted pocket
  marker at the target corner).
- The spin popup is CLOSED at capture (spin was set and dismissed); no
  dialog covers the table. FIRE pill visible bottom-right.
- No error surface.

## Checkpoint `pot-settled`

- The called solid is GONE from the cloth (potted); the cue ball remains
  on the table (no scratch on this leg).
- All rendered balls at rest; the scene reads as a settled post-shot
  position back in an aimable state.
- HUD chrome present (FIRE pill, gauge, status strip legible); no error
  surface, no recovery dialog.
