# L4 expectations — flow `cold-launch` (016 T026; test-pyramid par.4, FR-010/FR-014)

Version: 1 (016 freeze). Judged per checkpoint by the acceptance judging
agent (acceptance.mjs; research R15). Every criterion must hold for a
`pass` verdict; any violation, ambiguity resolved AGAINST the screenshot,
is a `fail` with notes.

Flow context: UNSTAMPED real-user boot of the shell
(`app://local/app.html`, no query — research R6), captured once the page
reports interactive. The launch storyboard is solid Slate Void `#0b100c`
(felt-dark near-black with a green cast; the design charter register), so launch →
game must read as one continuous dark surface.

## Checkpoint `interactive`

- The full landscape game scene is rendered edge-to-edge: a billiards
  table with rails and pockets fills most of the frame; no letterboxing,
  no white or gray bands at any edge, no visible native chrome.
- Background/room tone is the felt-dark near-black register (Slate Void
  family). A bright/white background anywhere = fail (the "white flash"
  regression this flow exists to catch).
- The REAL-USER look is showing: the steel-gray/slate tournament cloth
  of the `tournament` boot look. A saturated green scripted-pin cloth on
  this UNSTAMPED boot = fail (R6 scripted-pin leak).
- A full rack of balls is visible (racked or ready position) with the
  cue ball present; balls render as shaded ivory/colored spheres, not
  placeholders.
- Touch-mode HUD chrome is present (coarse-pointer boot): the FIRE pill
  in the bottom-right quadrant and the status strip along the top band.
  Desktop-only chrome (the `#aimw` aim readout panel, keyboard help)
  must NOT be visible.
- No error surface, no recovery dialog, no blank canvas region, no
  obviously missing textures (solid magenta/black quads).
- Orientation is landscape (width > height in the captured frame).
