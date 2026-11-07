# L4 expectations — flow `background-resume` (016 T026; test-pyramid par.4, FR-007/FR-008/FR-014, SC-006)

Version: 1 (016 freeze). Judged per checkpoint by the acceptance judging
agent (acceptance.mjs; research R15). Every criterion must hold for a
`pass` verdict; violations fail with notes.

Flow context: the lifecycle scenario — a scripted break is mid-replay
when the app is backgrounded for 3 s (home press) and reactivated; a
second launch then rides `-OBInjectFailure killOnce` (one simulated
content-process death after first readiness) through the shell's
auto-reload recovery (settings restored per R7: the language was set to
German BEFORE the snapshot edge). (2026-07-11 recorded fix: the flow
originally launched `contentKill`, which re-kills after EVERY load
completion — the ×3 escalation semantics L2 ComponentTree needs — so
the `recovered` criteria below were unreachable by design; the judged
criteria themselves are unchanged.) Scripted (`obtool`) boot: green
cloth expected. The scenario sets language `de` in phase 1, so GERMAN
HUD strings are expected from `pre-background` onward (and prove settings
survival at `recovered`).

## Checkpoint `pre-background`

- Landscape table scene mid-playback of a break shot: object balls
  visibly displaced from a rack triangle (the break is underway or the
  cluster is dispersing) — NOT an untouched racked table.
- HUD chrome present (status strip, FIRE pill region); no dialog, no
  error surface.
- HUD text that is visible reads in German (the settings write landed
  before the capture).

## Checkpoint `post-resume`

- The SAME session continues: a table position consistent with the
  pre-background break progressing — balls scattered/settling, same
  look and layout family; NOT a fresh racked table (a reset here means
  the resume lost the session = fail) and NOT a completely settled
  end-state identical to a cold boot.
- No recovery surface, no error dialog, no blank/white canvas region
  (the web view survived backgrounding).
- HUD strings still German.

## Checkpoint `recovered`

- A fully interactive game scene AFTER the content-process kill +
  automatic reload: table rendered, HUD chrome present, machine back in
  an aimable state; no recovery surface visible (auto-reload succeeded
  within budget — the native retry surface appearing here = fail).
- HUD strings STILL German — the `de` setting survived the ephemeral
  relaunch + kill via the UserDefaults snapshot restore (R7). English
  strings here = fail (settings lost).
- No blank canvas, no error text, landscape orientation.
