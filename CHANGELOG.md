# Changelog

Every released package gets an entry here, newest first, written for a
player reading "what changed for me". History before build 17 predates
this file — see the git tags (`v0.1.0-build2` … `v0.1.0-build16`).

From build 19, work with no change to the shipped game is listed under
Internal.

## v0.1.0-build20 — 2026-10-27

Milestone **build 20** (169 closed items) · release commit = the commit
tagged `v0.1.0-build20` · kernel `0.1.0+6adb7fd9` · rules catalog
`0.1.10+6adb7fd9`.

### Highlights

- **Every lamp now lights every table to the same level, and far less of the
  cue ball burns out to flat white** (#975, #996).
- **Snooker and three-cushion carom now strike with the cue you chose**, not
  the pool cue (#1042).
- **A stray click no longer wipes a frame**: Re-rack and practice drills ask
  before discarding a frame in progress and are refused while a rules
  decision is pending, and double-clicks act only on what you clicked (#990,
  #981, #986, #987, #988, #1072).
- **Switching games is smoother**: a progress overlay covers the switch,
  nothing you press during it reaches the table, going back to a recently
  played table no longer freezes the picture, and entering snooker no longer
  stutters (#974, #976, #969).
- **The Chinese 8-ball table's pockets now follow real tables**, on screen and
  in play (#1080).
- **Exports are harder to lose**: one dropped video frame no longer discards a
  whole export, and cancelling the save sheet in the macOS app keeps the
  finished export (#997, #991).
- **The web game now says when a new version is ready** and offers a reload
  straight into it (#1047).
- **Keyboard and screen-reader play goes further**: spin can be set from the
  keyboard on desktop, keyboard play keeps its place after every shot, and
  screen readers announce every dropdown by its label (#1051, #1056, #1052).

### Rules & gameplay

- **Snooker and three-cushion carom now strike with the cue you chose**:
  both games played every shot with the pool "standard" maple cue,
  whatever the HUD showed, so the cue's weight, tip, end-mass squirt and
  tip rebound all came from the pool cue, and "New cue plays from the
  next shot" was false after a change. Shots now play and record the
  selected cue, such as the snooker ash cue or the conical carom cue,
  and a change applies from the next shot as the hint says (#1042,
  landed as #1139). Present since build 18 or earlier.
- **Re-rack no longer wipes a frame in one click**: while a rules
  decision was pending — after a snooker foul and a miss, say — Re-rack
  stayed live and dealt a new rack at once, throwing away the score, the
  miss count and the opponent's choice, in every discipline. It is now
  refused until the decision is answered, as switching games and Free
  practice already were, and on any rack in progress it asks before
  discarding the frame; a fresh rack still re-racks on one click (#990,
  landed as #1087). On desktop 10-ball, a double-click on Replay in the
  push-out window no longer re-racks either: starting the replay hid
  Push out, so Re-rack slid under the pointer and the second click dealt
  a new rack, losing the break with no undo. Push out now stays in its
  slot during the replay, dimmed and inactive, so nothing moves (#986,
  landed as #1087 and #1139).
- **APA 8-ball no longer asks you to call your shots**: with the APA
  rules preset, the "call required: click a pocket" prompt, the CALL
  SHOT box with its Safety button and the target rings on object balls
  are gone, since APA has no call shot and no safety call. You mark a
  pocket only when the 8 is your ball, because an 8 in an unmarked
  pocket still loses (#1043, landed as #1139).
- **Starting a practice drill no longer throws away the game in
  progress**: the toolbar's Practice drills picker used to start a drill
  at once, discarding the frame, its scores and any pending rules
  decision, and could cut off a shot mid-roll. A drill now refuses to
  start while the balls are rolling or a rules decision is pending, with
  the same notices the hall shows, and asks first ("Leave this game?")
  when a frame is under way; on a fresh rack it starts at once, as
  before (#981, landed as #1087).
- **A pool drill started on the snooker or carom table now moves to your
  pool table, as its badge says**: it used to switch only the rules,
  so a drill started on snooker ran on the snooker table with the D
  still drawn, and the Century run (14.1) drill racked 15 balls on the
  snooker bed or, on carom, refused to start but left 14.1 rules behind,
  so the next Re-rack laid 15 balls on the pocketless table; afterwards
  the rules, the table, your saved game and the hall's current-game card
  disagreed, with that card a dead click. The move to 9-ball now sticks
  like any game switch, the Century run plays 14.1 on the pool table for
  the drill only, and every pool drill card, the Century run included,
  now shows the "Switches the table to 9-Ball" badge on carom as well as
  on snooker. From another pool game such as 8-ball, the drill's 9-ball
  rules (14.1 for the Century run) last only for the drill and your game
  comes back when it ends. A refused start no longer leaves the drill's
  rules behind, and the rules, the table, the HUD and the hall always
  name the same game (#980 and #1041, both landed as #1087).
- **Going back to Play from a drill now gives a fresh rack**: leaving
  Practice with "Back to play" in the hall used to keep the drill's
  balls on the table under a 9-ball frame that still counted all nine,
  so after the last ball dropped the frame could never end, the HUD
  named no ball to play, and only Re-rack got out. A drill now hands
  back the same table as a fresh Play entry (#982, landed as #1087). The
  bug dates back to build 18 or earlier.
- **Switching games from the hall now starts the new game with fresh
  stroke settings**: 2.0 m/s power and a centred cue tip, as a fresh
  entry or a reload does. The previous game's power and spin used to
  carry into the new game's first stroke, so a 12 m/s 8-ball break power
  could fire a snooker break-off (#993, landed as #1139).
- **Three-cushion carom counts innings correctly**: the HUD inning chip
  read 0 through the whole first inning, and a game the breaker won was
  reported one inning short ("race to target in 0 innings" for a run-out
  on the first visit), as was every game on the shared-white preset. The
  chip now shows the inning in play and the result banner counts the
  winner's last inning, so the two agree when the game ends (#1050,
  landed as #1087).
- **A new rack no longer hands the break to whoever happened to be on
  turn**: abandoning a rack with the HUD Re-rack button, or by keeping a
  new table and confirming, gave the new rack's break to the player on
  turn in the abandoned rack, so in hot-seat play one press could win
  you the break. The new rack now goes to the player who broke the
  abandoned one, the same seat a stalemate re-rack uses, and a game
  switch still starts with Player 1 (#1018, landed as #1087). Leaving
  Free practice for Play now gives the break to Player 1 too, as a fresh
  entry into Play always does, instead of to whoever was on turn in the
  game you had left (#1035, landed as #1087).
- **A 14.1 or one-pocket match now survives the equipment picker after a
  re-rack the rules carry over**: after a re-rack that keeps the match
  going (a third consecutive foul or a re-break after a breaking
  violation in 14.1, or a one-pocket stalemate), the game treated the
  new rack as untouched, so just previewing a table in the equipment
  picker re-racked at once and reset the score to 0–0 with no question.
  Such a rack now counts as in play: a preview leaves it alone, Keep and
  other equipment changes ask first, and a game switch is guarded as in
  any match (#1062, landed as #1087).
- **Free practice's Undo placement no longer reaches into a fresh
  rack**: after a game switch or a table change, the Undo chip stayed
  lit with your last drag from the old table, and one click pulled a
  ball out of the new rack toward that old spot. Every fresh table now
  clears the undo, as Re-rack, Clear table and a mode change already did
  (#994, landed as #1087).
- **Switching to Free practice just after winning a frame no longer
  leaves a dead sandbox**: inside the 2.6 s win hold, the switch
  cancelled the automatic re-rack, so the sandbox sat on "WIN —
  re-racking…" with Shoot (FIRE on phones) disabled until a manual
  Re-rack. The hold's re-rack now still runs, and the sandbox opens on a
  fresh rack as a normal entry does (#1027, landed as #1087).
- **A cue picked after Continue on another game's shared replay is saved
  for that game**: continuing a snooker replay while your own game was
  9-ball, then picking a cue, wrote that cue into your 9-ball equipment,
  and the snooker pick was lost on reload. The pick now saves for the
  game on the table, and your own game keeps its cue (#1034, landed as
  #1087). Build 19's Continue rule (#789) had already narrowed the save
  to the one changed item, but still aimed it at the wrong game.

### Video export

- **Share replay in the macOS and iOS apps now copies a link that opens
  the replay in the OpenBilliards app**: it used to copy an `app://`
  link that no browser and no app could open, while the toast reported
  it copied. The apps now copy an `openbilliards://replay` link, which
  opens the replay wherever the OpenBilliards app is installed but not
  in a web browser, and the toast and the export card's link note now
  say so. The export card also shows the replay link compactly, in the
  apps and in browsers (where it points, then the start and end of the
  replay data, on two lines at most), with the full link behind Copy and
  the tooltip; on phones the share toast also stays clear of a live
  banner (#1023, landed as #1139). Present since the macOS app first
  shipped.
- **One dropped video frame no longer discards a whole export**: a phone
  export that lost 1 frame of 7335 (most likely after switching apps
  once) failed with no file. A lost frame is now recovered where it can
  be, and otherwise the frame before it stays up over the gap with the
  sound in sync, for isolated single frames up to 0.1% of the video (at
  least one); a bigger loss no longer ends with nothing either, as the
  Export dialog, the playback clip card and the full-game draft banner
  offer Save anyway next to Export again or Start over (#997, landed as
  #1087).
- **Cancelling the save sheet in the macOS app no longer throws away a
  finished export**: the Export dialog said "done" before you chose, and
  Cancel or Esc lost the video with no way back short of a full
  re-render (minutes on the 4K tiers). The dialog now reads "rendered —
  choose where to save it" while the sheet is up and "not saved" after a
  Cancel, with a Save again button that hands the same video back to the
  sheet without re-rendering; videos over 384 MiB still use the previous
  way of saving (#991, landed as #1087).
- **A double-click on Export no longer leaves the table dead to
  clicks**: a second press while the first Export dialog was still
  opening built a second dialog, and closing both left an invisible
  full-screen layer that swallowed every click until a reload. A second
  press now joins the dialog already on its way, so one dialog opens and
  closing it leaves nothing behind (#985, landed as #1087).
- **The replay player now follows window resizes**: resizing the window,
  or entering or leaving full screen in the macOS app, left the 3D view
  at its old size, with black bands at the right and bottom or only a
  top-left crop of the picture, until you left the player. It now refits
  at once, paused or playing, and a clip being recorded in real time
  keeps the size it was recorded at (#983, landed as #1087).
- **Export opened during the win banner now exports the frame-winning
  shot**: the automatic re-rack 2.6 s after a frame win used to clear
  that shot under the open Export dialog, which still showed time
  estimates and an enabled Export button that then failed with "no shot
  to export yet". The dialog now keeps the winning shot (#1024, landed
  as #1087).
- **Saving a playback clip by live capture no longer comes out empty**:
  a short clip could reach its end before the recorder took its first
  frame and fail with "Live capture produced no file — try again". The
  clip now holds its first pose until the recorder has started, then
  records the whole trim, and a recorder that never starts fails within
  about 10 s with the existing start-failure message instead of after
  about a minute (#1099, landed as #1176).
- **Continue export now says what it is doing**: in the macOS and iOS
  apps, after offering to finish an export "interrupted at 60%",
  Continue showed "Finishing the interrupted export…" over a bar that
  restarted at 0% with the whole render's time left, which looked like
  starting over. The resume banner now describes what Continue is
  actually doing at every step (#1046, landed as #1087).

### Visuals & tables

- **Every lamp now lights every table to the same level**: 83 of 180
  table, lamp and brightness combinations used to fall outside a normal
  range — any lamp but its own luminaire left the snooker table at
  0.17–0.32× its reference brightness, the default lamps on the metal-rim
  and Chinese 8-ball tables read 0.59× the canopy, the ring and pendant had
  drifted dimmer, the pendant left every table's corners dark, and the ring
  left a dark band along the cushions of the 9-ft pool tables. Each table
  now carries a brightness match for every lamp, tuned on its factory cloth
  and re-applied when you switch tables; those two default lamps come up to
  the canopy level; the pendant spreads its shades along the table (four
  over the 12-ft snooker table) with a shade face the size of its 15-inch
  catalog shade, lifting the 9-ft pool table's corners from 0.24–0.32 to
  0.47 of the centre; and the ring no longer leaves that band (#975,
  landed as #1087).
- **The Chinese 8-ball table's pockets now follow real tables, on screen
  and in play**: the corner jaws, which read as a straight channel, now run
  from a larger rounded nose into a short throat, 85.2 mm across the
  cushion noses against a nominal 85 mm pocket size, and the larger nose
  makes the corners play easier; the middle pockets, which looked 83.84 mm
  wide but played 99.0 mm wide, now measure 87 mm at nose height both on
  screen and in play, inside the Chinese national standard GB/T 22751
  (86 ± 1 mm). This comes with catalog v21 and a kernel rebake (#1080,
  landed as #1196); follow-ups to the pocket checks and the jaw mesh remain
  open (#1178, #1184, #1185).
- **A stray second cue no longer floats over the table after a game switch
  or a cue change**: after at least one shot, switching games, equipping
  another cue in the hall or changing the cue in the HUD could bring back
  the hidden cue from the last stroke, floating above the cloth beside the
  real aiming cue (for example a dark 8-ball cue over a new snooker table),
  and could leave the aiming cue showing over the hall. Only the aiming cue
  shows now, and it hides while the hall is open (#967, landed as #1069).
- **Going back to a recently played table no longer freezes the picture
  for up to 2.5 s**: each return used to rebuild the table (1.1–1.8 s) and
  recompile its shaders (0.2–0.7 s) in a single frame. The game now keeps
  recently played tables within a memory budget (on phones and tablets, the
  current table and one more) and brings the kept one straight back, and
  repeated snooker visits no longer keep earlier builds' materials in
  memory; a first visit still builds the table as before (#976, landed as
  #1087).
- **Entering snooker no longer stutters for seconds after the switch**: the
  table's shading bake could run up to 12 slices back to back inside one
  frame. On a loaded machine a first entry played at about 12 fps on
  average, and about 3 fps at worst, for several seconds, and even a calm
  machine showed 120–130 ms frames. That shading now ships precomputed
  with the game (#1131), so a normal entry runs no bake at all; when that
  data is late or missing and the game bakes it instead, the bake now
  takes one shorter slice per frame, after that frame is drawn, with the
  same result (#969, landed as #1069).
- **Far less of the cue ball burns out to flat white**: under every lamp but
  the canopy, up to 53 % of its disc clipped to pure white, more as the
  brightness went up. The matte part of the balls' lighting now eases off
  softly instead of clipping, scaled with the lamp brightness, and the
  highlight, the clear-coat shine and the reflections are left untouched;
  on all ten tables under all six lamps, the clipped share now stays within
  7 % up to ×1.0 brightness and 10 % at ×1.4 (9 % and 15 % on the snooker
  table) (#996, landed as #1164).
- **A game switch no longer keeps the previous table's camera view**: with
  the default orbit camera, the view came back exactly as you had left it
  on the previous table. After a close, low orbit on 8-ball, snooker opened
  in ball-in-hand with the D and the cue ball off-screen. Confirming a
  different game or table bed in the hall now lands on the starting view a
  fresh launch into that game shows, where snooker's D and cue ball are in
  view, and a hall visit without a switch still brings back your own view
  (#1025, landed as #1139).
- **Relaunching with snooker as the last game no longer opens the hall on a
  close-up of the blue ball**: in the macOS app, the room behind the Play
  panel was replaced by an overhead close-up of the table centre. A resize
  did not fix it; only going to the table and back did. The hall now opens
  on the room and the table at the Play view. The fault dates from build 18
  or earlier, and games other than 9-ball, such as carom, probably hit it
  too (#984, landed as #1139).
- **Keeping a lighting pick in the hall no longer leaves the table lamp
  dimmed**: after a Keep in the hall's Lighting station, the lamp came back
  at 85 % of its level when you left the hall, lower again with each
  further pick in the same visit, and stayed that dim through a game
  switch, so the table looked under-lit against the room. Leaving the hall
  now restores the level you picked, and a game entered after a lighting
  change looks the same as a fresh entry into it (#970, landed as #1069).
- **Reflections no longer carry the previous table's light after a
  switch**: each time the game redrew the reflections on cushion tops,
  rails and balls, the new ones were lit by the old ones, so after a switch
  from carom to One Pocket the reflected room kept carom's blue cast, up to about twice as blue as a
  fresh entry, and the difference stayed through every later switch within the
  same table class. The reflections now settle fully after every redraw,
  boot included (a fresh boot sat 32–63 % off on the reflected walls and
  floor and now sits within 1.5 %, so reflections right after boot look
  slightly different), and every redraw keeps all cues and aim overlays out
  of the reflections, not only the first one found (#971, landed as #1087
  and #1139).
- **The snooker table's legs now have their shading from the first lit
  frame**: the table's soft shadowing used to be worked out while the game
  ran, with the eight turned legs near the end of that work, so for seconds
  after a snooker boot or switch some legs showed fully lit; which ones
  varied from boot to boot, and under the perimeter ring light two boots
  could differ by up to 15 display levels on the legs. That shadowing now
  ships precomputed with the game, so a snooker boot or switch has it from
  the first lit frame (#1131, landed as #1176).
- **The snooker table's pocket valances now look the same on your first
  visit as on later ones**: two identical parts of the table's shading bake
  overwrote each other, so on a fresh load part of the valance lost its
  soft shadowing and the first snooker visit rendered it differently from
  the next. The first visit now matches what the second visit already showed
  (#978, landed as #1087).
- **Worn cloth shows slightly less chalk**: on worn snooker green cloth, the
  most chalked spot had drifted outside the range in which worn cloth still
  reads as its own colour (a colour difference of 18.92 against a limit of
  17.75). The worn-cloth chalk level therefore comes down from 0.0199 to
  0.0174, which brings that spot to 17.21. The atelier's Cloth station
  picture of worn cloth is redrawn to match, a change of at most 3 of 255
  levels (#1209, landed as #1222).

### UI & settings

- **The hall's quick-play corner reads as one main action plus a quiet
  preference**: "Start at the table next time" was a boxed row with a
  radio-like mark under the "To the table" pill, and it took two lines in
  German. It is now a switch row, renamed "Skip the hall next time" so it
  fits on one line in all seven languages. On phones the place strip now
  shows its edge fade whenever it overflows; in German it used to clip
  51 px with no fade (#1012, landed as #1139 and #1164).
- **The web game now says when a new version is ready**: after an update
  was published, reloading kept the old version for as long as any tab of
  the game stayed open, and nothing said a newer one was waiting. A notice
  now says a new version is ready and offers a reload straight into it
  (#1047, landed as #1087).
- **Spin can now be set from the keyboard on desktop**: the cue-ball pad
  in the HUD panel is a Tab stop between Elevation and Cue, the arrow keys
  move the tip by 0.01 R (0.1 R with Shift), Home re-centres it, the
  miscue limit applies as when dragging, screen readers hear both offsets,
  and the Help overlay lists the keys in all seven languages. Before, a
  keyboard-only player could play only centre-ball shots and could not
  clear a spin set with the mouse; the SPIN (A, B) pad stays pointer-only
  (#1051, landed as #1139).
- **Double-clicking "Back to the table" no longer changes your shot**: the
  hall closed on the first click, so the second landed on the table and
  swung the aim toward the pointer, sometimes also raising the cue to
  clear a rail (for example from 5° to 18°). For a moment after you leave
  the hall a press on the table is now ignored, while other controls
  answer as usual, and the same protection now covers related double
  clicks and presses (#988, landed as #1139, with #987, #1044 and #1068).
- **HUD text is easier to read and stays out of the way**: the controls
  help line at the bottom left sits on a solid backing (its contrast
  measured 2.7:1 straight over the felt), the hint toast is capped beside
  the HUD panel with balanced lines so it no longer covers the spin pad
  and elevation row at 800 px wide, and on phones the wrong-ball warning
  chip sits on a solid backing instead of a faint tint over the lit felt
  (#1014, landed as #1139). The foul banner can still fade out as an empty
  box; that carries over to #1180.
- **The HUD panel's cue picker and button layout now match the rest of the
  game**: the cue picker keeps the standard 40 px control height and 14 px
  text instead of a squeezed 34 px box with 12 px text above the 40 px
  buttons, and when Push out joins Shoot, Replay and Re-rack in 10-ball,
  the four share a 2 × 2 grid instead of Re-rack wrapping alone as the
  widest button in the panel (#1009, landed as #1139). The action buttons'
  12 px text with 4 px pads and the panel title's size move to #1180.
- **Two browser tabs on one profile no longer undo each other's saved
  settings**: each settings change wrote back that tab's whole copy from
  when it opened, silently reverting assists, equipment and the current
  game saved in the other tab and dropping other games' saved equipment —
  easy to hit by opening a shared replay link while the game is already
  open. Each tab now keeps what the other saved (#1019, landed as #1087;
  web only, since the macOS app has a single window).
- **The Settings gear now opens while a rules decision is waiting**: the
  toolbar gear used to ignore clicks with no notice and no disabled look
  whenever a decision was pending — in Three-Cushion Carom, at the start
  of every rack until you picked your start spot — and the hall's Settings
  gear, which goes through it, failed the same way. The decision is still
  waiting when you close Settings (#1053, landed as #1087).
- **The hall's Settings gear works in narrow desktop windows**: below
  about 950 px wide (about 1000 px in German), the quick-play corner's
  start-at-table row (now "Skip the hall next time", #1012) covered the
  gear. A click on the gear silently turned on start at the table, so the
  next launch skipped the hall, and Settings never opened. The quick-play
  corner now moves up above the place strip whenever the two would
  overlap, at any width and in every language (#989, landed as #1139;
  first logged in the #686 QA ledger).
- **The default cloth look now reads "Tournament gray"** in all seven
  languages, and the equipment Details text for the default cushion model
  and the worn ball sets is reworded. Saved settings and `?look=` links
  that use the old look id still open the same look, and bug reports that
  carry it still read correctly (#973, landed as #1069, #1087 and #1139).
- **The replay player's controls now match the rest of the game**: the
  Play button grows from 38 px to the standard 40 px control height (44 px
  on touch), the step buttons and the strip toggle are true squares, and
  the camera captions in Chinese, Japanese and Korean grow from an
  illegible 10 px to 13 px, while other languages keep the compact 10 px.
  A larger touch area for the director strip, a proper switch for the
  lead-in setting and the save card's fit on phones move to #1180 (#1011,
  landed as #1139).
- **Practice and Equipment now almost always open fully drawn from the
  hall, even on a slow connection**: the hall waits at most a quarter
  second for a place to paint, but these places only started loading
  their styles when you clicked, so on a slow connection a bare
  placeholder showed instead. The hall places' styles now load one at a
  time while the game is idle after boot, so a click almost never finds
  them still loading; Play, the place the hall opens on, is tracked in
  #810 (#811, landed as #1147 and #1196).
- **Cancelling a game switch in the hall puts the selection back on the
  game you are playing**: the declined card used to stay painted as
  selected, with its rules in Details and your current game's card
  scrolled out of the rail, and it stayed that way after a trip to the
  table and back. Now your current game's card is selected again and shown
  whole in the rail (#992, landed as #1139; present since build 18 or
  earlier).
- **The phone pocket picker keeps its spacing every time it opens**: from
  the second open on, its rows lost their 8 px gaps, so the 8-ball badge
  sat on the first pocket row and the last row touched Close (#1079,
  landed as #1139).
- **Browsing the game cards with the arrow keys ends on a whole card**: on
  a slow or busy device, a second arrow press during the rail's glide
  could leave the rail resting one card past the card you had moved to,
  with that card only a quarter to a half in view. The rail now waits
  until it stops and then brings the browsed card fully into view; a
  touch, wheel or pointer in the rail cancels it (#1085, landed as #1147).
- **The error card's "Reload page" button is full-size on phones**: it was
  a small 95 × 24 px chip beside a 44 px close button; it is now a
  standard button that meets the 44 pt minimum touch size (#1015, landed
  as #1139). The replay director strip's thin blocks, logged in the same
  report, are not enlarged yet; they stay with #1011 and move to #1180.
- **The atelier's station buttons now sit centred on phones in
  landscape**: the card counter stayed in the strip even while hidden and
  pushed them toward its end, as when you first arrive before picking a
  station, so they sat off-centre in all seven languages at 844 × 390
  (#1223, landed as #1224).
- **Arriving at an atelier station on a phone no longer clips the first
  card's focus ring**: the cards row could come to rest a few pixels off
  its starting position, pushing the ring over the rail's edge; the row
  now settles back to its start (#1206, landed as #1213).
- **Switching games now shows a progress overlay, and nothing you press
  during the switch reaches the table**: a switch that changed the table
  used to freeze the screen for seconds, with the accepted confirm still
  showing and no sign of progress, and a Space or click made during the
  freeze fired a shot on the new table once it appeared. The overlay
  appears before the table is built and names each step (building the
  table, downloading it for Chinese 8-ball, preparing materials, almost
  ready); it stays up at least half a second, leaves once the new table
  is steady, ignores keys, clicks and the mouse wheel, and skips its
  sweep and fade under reduced motion (#974, landed as #1087).
- **The phone HUD's top row now leaves room for the whole toolbar**:
  since the hall button joined the toolbar, the status pill started
  under the toolbar's fifth button; it now starts where the toolbar
  actually ends. The row's pills share one centre line instead of
  hanging from the top edge, the 10-ball chips (push out, players, ball
  on) sit in one row instead of stacking three deep over the cloth, and
  a rules decision on a phone shows its question above the answer
  buttons instead of the answers alone (#1010, landed as #1139).
- **Double-clicking or double-tapping a game card in the hall's Play
  rail no longer cancels the switch**: the second press landed outside
  the Switch game confirm that the first press had just opened, which
  cancelled it, so the dialog flashed, the game stayed the same and the
  rail highlighted the card you had not switched to. A double activation
  now counts as one: the confirm opens and waits for your answer, and
  other dialogs opened by a click, such as Export video, also stay open
  after a double-click (#987, landed as #1139; present since build 18 or
  earlier).
- **Cards in the equipment screen now line up, and phones show them
  larger**: every card in a carousel has the same height in every
  station and language (on phones, heights within one rail ranged from
  70 to 106 px); on phones the rail runs wider than the old 288 px, with
  bigger cards and thumbnails than the old 56×28 px pictures and every
  label below its picture; and the "Previewing" marker beside Put back
  and Keep is now a plain status marker, not a small pill that looked
  like a button. On desktop and in the macOS app the equipment panel
  keeps one height in every station, with a new one-line hint for Cloth
  and Balls, and in 1280 × 800 and 1024 × 640 windows the cue card's
  buttons no longer cover its Details summaries (#1001, landed as #1196).
- **Equipment you preview can now be seen whole**: a new Full view
  button beside Put back and Keep hides the equipment panels so the
  piece you are previewing stands clear in the scene, with the camera
  still free to move, and Exit view brings the panels back. On phones,
  previewing a table also steps the camera back to show the whole table;
  once you pan, zoom or orbit, the table framing leaves your view alone
  until you return to the table station or pick another table (#1001,
  landed as #1196; follow-up #1191, landed as #1203).
- **A double or held Enter no longer shoots on its own**: Continue in
  the Switch game confirm, or an answer to a rules decision such as
  "Replace balls — offender plays again", moved focus to Shoot, where a
  second press or key repeat broke the fresh rack or retook the restored
  shot before you could re-aim (most easily with reduced motion on), and
  holding Enter through a scratched break could even answer the
  decision, then shoot again. Key repeats that follow focus to a new
  control, and a second Enter or Space on another control within half a
  second, are now ignored; one deliberate Enter on Shoot still shoots
  (#1044 and #1068, landed as #1139; the same fix closes #987 and #988).
- **Keyboard play keeps its place after every shot**: a shot or replay
  started with Enter left nothing focused, so the next Enter did nothing
  and getting back to Shoot cost two extra key presses. When aiming
  resumes, focus now returns to Shoot or Replay with its focus ring
  showing, unless you have moved it elsewhere meanwhile, and an Enter
  still held from the shot never fires the next one (#1056, landed as
  #1139).
- **A keyboard press in Practice is no longer ignored after a
  press-and-hold**: for 600 ms after a press-and-hold in the hall's
  Practice place, Enter, Space or a screen-reader activation on Drills,
  Free practice, All assists or Last drill did nothing; now only the
  hold's own trailing click is ignored (#1136, landed as #1164).
- **Game text reads consistently**: rule citations in decision prompts
  keep their case ("WPA 4.3(d)", no longer "WPA 4.3(D)", a rule that
  does not exist); the HUD title uses each game's catalog name ("9-Ball"
  rather than "9-ball", like "8-Ball" and "10-Ball"); the hall's "press
  and hold" Replays hint no longer shows with a mouse or trackpad;
  standalone status and hint sentences start with a capital letter; and
  German uses one name for replays instead of three (#1013, landed in
  #1139 and #1164; jargon in a carom rules-preset title is tracked in
  #1180).
- **Each game keeps its own saved equipment through a drill or a
  replay's Continue**: while a drill or a replay's Continue had a game
  active for that session only, switching games overwrote that game's
  saved equipment with your saved game's; for example, after a switch
  during the century drill, 14.1 came back on 8-ball's 7-ft table. Now
  14.1 comes back on its own table and 8-ball keeps the 7-ft one (#1036,
  landed as #1087).
- **Controls that sit side by side now share one height**: on touch
  screens the game's standard buttons, pickers and options are at least
  44 × 44 points on every screen, and when one answer in a prompt is too
  long for a pill, all of its answers switch to the row shape together
  instead of one standing taller than the rest (#1002, landed in #1087
  and #1139).
- **Double-clicks in the desktop HUD now act only on what you clicked**:
  a double-click on Re-rack inside the 10-ball push-out window opens one
  Re-rack confirm and no longer flips Slow-mo with its second click; a
  double-click in an open dropdown list, such as the HUD cue list, no
  longer reaches the control underneath, where it could fire Shoot; and
  a double-click on a dropdown whose list opens over its own button, as
  the cue list does in a 1024 × 640 window, no longer picks the option
  the second click lands on (#1072, fixed by the Re-rack confirm from
  #990 and the double-click guard from #987, landed as #1087 and #1139;
  #1152, landed as #1164).
- **On a landscape phone, a cue you tap in the equipment screen's rail
  now shows whole after its sheet closes**: tapping a partly visible
  card opened the cue sheet before the rail could scroll, so when the
  sheet closed the chosen card stayed cut off at the edge of the strip,
  or fully off-screen for the card with the widest name, in every
  language. The rail now centres the card again when it comes back
  (#1217, landed as #1222).
- **The snooker ash cue's dossier now reads in your language**: in the
  equipment screen, the dossier on the snooker ash cue's card quoted the
  cue's catalog note in English whatever your language; it now shows a
  translated version in all seven languages (#1179, landed as #1203).
- **"Cue path after contact: Off" now also holds at Full aim assist**:
  Full still draws every object ball's path and the cue ball's approach
  to the ghost ball, but the cue ball's own path now stops at first
  contact instead of running on through every cushion to where it comes
  to rest (#1048, landed as #1139).
- **Screen readers now announce every dropdown by its label**: the HUD
  Cue dropdown and the Settings dropdowns (Aim assist, Line contrast,
  Power response, Default camera, Cloth look, Language) were read as an
  unnamed "combobox" with only their value, so the two Assists dropdowns
  whose values begin with "Standard" sounded alike. Each dropdown is now
  named by its visible label, for screen readers and voice control alike
  (#1052, landed as #1139).
- **The web app's browser tab now reads OpenBilliards** in all seven
  languages: it showed a development placeholder in English and an old
  9-ball title in the other six (#1181, landed as #1222).

### Under the hood

- **Kernel fix**: a ball that ends a shot marked at rest but still carrying
  a tiny leftover roll is now set fully at rest when the shot ends, so the
  next shot from that layout is no longer rejected and the table can no
  longer lock up; events before the rest stay byte-identical, and the case
  was latent, reproduced with constructed shots (#1195, landed as #1203).
  It changed the kernel (`0.1.0+15210514` at landing), after which share
  links recorded on build 19's kernel met the cross-version notice (View
  anyway or Dismiss) instead of replaying at once.
- On macOS and iOS, the app no longer stays blank for good when its web
  content process dies during the first page load, as happened when the
  system web view's GPU process kept stalling under heavy load. A death the
  system reports now gets the same recovery as a crash after boot, up to
  two automatic reloads and then the recovery screen with Retry; for a
  death it never reports, a watchdog notices a boot that never commits,
  asks the page whether it is still alive and starts the same recovery,
  while a slow but live boot is left to finish (#1045 and #1073, both
  landed as #1087).
- A harmless browser notice, "ResizeObserver loop completed with
  undelivered notifications", can no longer stop the boot on the "Could not
  start — A module failed to load" card, as it once did on a heavily loaded
  Mac's first cold launch. The older web engine on iOS 16 and macOS 13
  reports the same notice as a bare "Script error.", and that no longer
  fails the boot either, while real module and script failures still do
  (#1081, landed as #1139).
- Aim drags outside the aim view no longer stall on the aim lines'
  adaptive ink. The ink samples the picture behind the lines to keep them
  readable, and it read that picture back from the GPU about every fourth
  frame of a drag; on a heavily loaded test machine in Chrome each read
  typically blocked the game for 137–190 ms, 58 % of the drag's time. A
  change that only moves the lines is now worked out from the ink's cached
  copy of the picture, so such a drag reads nothing back until the lines
  hold still. Camera moves still read back, and so does an aim drag in the
  aim view, whose camera follows the aim; the ink at rest is unchanged
  (#1114, landed as #1147).
- Balls now share one shader program per ball variant instead of each
  building an identical copy. A re-rack or game switch used to rebuild one
  program per ball (16 on 8-ball, 22 on snooker), which cost about 325 ms
  on the first frame of a 9-ball → 8-ball switch on the same table; the
  picture is unchanged (#979, landed as #1087).
- A stalled download of a table's precomputed shading data can no longer
  hang the table build. A snooker build, whose wait for that data came
  with #1131 (also in this build), now goes ahead after 8 s and computes
  that shading in the game instead; a Chinese 8-ball build, which has no
  such fallback, is refused with a named error after 240 s; and data that
  arrives late is kept for the next time that table is built (#1170,
  landed as #1196).
- Coming back to the hall's Play place now brings the current game's card
  back into view in the same step, before the first frame: after a game
  switch the rail could reopen scrolled to its start for a frame or more on
  a loaded machine, long enough for an early click to miss the card. A pan
  you make while Play is showing is left alone (#1155, landed as #1176; a
  card left half-clipped after re-entry is tracked in #1156).
- On a boot where frames arrive late, the boot overlay no longer disappears
  in one step while still fully opaque: its timer fallback used to remove
  it before its fade had shown, and it now keeps the fade (#1061, landed as
  #1087).
- Drop-down lists are steadier: a list that is closing no longer takes
  clicks, so a quick click on the control beneath it as it fades out, such
  as the next drop-down, reaches that control instead of picking one of
  the closing list's options. A key press now also ends the double-click
  protection that follows a click (from #988, also in this build), so a
  quick click at the same spot after you close a panel with Escape is no
  longer ignored (#1113, landed as #1139).
- Switching between tables with different baked lighting, such as a 9-ft
  pool table and the 12-ft snooker table, no longer leaks GPU memory: each
  switch loaded four new lighting textures (about 0.7 MB) without freeing
  the four it replaced, and going back downloaded and uploaded them again.
  A small per-file cache now reuses them on a return and frees what it
  drops, with identical pixels (#968, landed as #1069).
- In the web version, a newer update that starts installing while an older
  one takes over no longer loses its offline cache to the older one's sweep
  of old caches, which threw away that download and left the game without
  offline readiness until it refilled. The sweep now re-checks its guard
  right before each delete, so a rollback install that starts mid-sweep
  keeps its cache, and it also clears an empty cache re-created after the
  browser restarted the worker. The offline download itself is sturdier: a
  failed step now pauses it until the next request, where it used to stop
  with files missing until the worker restarted; an update now always
  saves the first part of the download as it takes over, even when the
  page asks for the download first; a delayed step no longer starts a
  second copy of the download; and an outdated version no longer
  re-creates its deleted cache as orphaned storage (#1039 and #1162, both
  landed as #1176, with a fix to the offline-fill check).
- At boot, the reflection settle (from #971, also in this build) now
  waits, within a bound, until the room's baked lighting and the lamp fade
  are in place, so a boot whose room lighting arrives late still settles
  on the same reflections; without the wait, about one boot in fifteen in
  loaded test runs settled before the room's lighting arrived and kept
  very slightly different reflections. The wait adds about 26 ms at the
  median and up to about 0.5 s when the room's lighting or the lamp fade
  arrives late (#1093, landed as #1087).
- The boot's lighting-environment settle (from #971, also in this build)
  no longer runs extra bakes for lighting requests made before it starts:
  on a slow software-rendered test machine it ran 10–14 bakes instead of 8,
  and it now always ends 8 bakes after the last request and lands on the
  same environment, with no measurable change in boot time there (#1105,
  landed as #1139).
- Exports with studio lighting now hide every cue and aim overlay while
  they bake their private reflections, as gameplay bakes already do; an
  export started straight from aiming could otherwise reflect a frozen cue
  and aim line in every frame. The Playback route players use was already
  clean, so clips saved there do not change (#1103, landed as #1139).
- A scripted overhead camera move hides the overhead lamp, and room
  reflections recomputed during it (for example after a table rebuild or
  a lighting or cloth-colour change) were captured without the lamp, so
  the cloth stayed far darker and more saturated under every later
  camera until they were next recomputed; in one measurement the centre
  of the cloth came out at under 40% of its normal brightness.
  Reflections are now always captured with the lamp in place. Nothing a
  player does scripts such a move: the overhead view in play, the replay
  player's top preset and the exports players make never hid the lamp,
  so nothing players see changes (#972, landed as #1087).
- The service worker's boot precache now includes the practice and atelier
  stylesheets, which the hall's idle prefetch has requested during a cold
  boot since #811. The service-worker fill check no longer sees two boot
  requests outside the boot precache (#1104, landed as #1147).
- The web version's offline cache and the iOS and macOS apps no longer
  carry an animation library of about 73 KB that the game stopped using
  in build 18 (landed as #1232).
- **Settings > About now has a Licences button**: it shows the third-party
  licence notices shipped with the game (#1183, landed as #1203, #1213 and
  #1222; the button landed as #1232).
- A kernel rebake (`0.1.0+72a839f6`, rules `0.1.10+72a839f6` at landing)
  cleans up the file paths in the two shipped WebAssembly binaries: the
  ten dependency source paths each binary keeps for error locations now
  start with a neutral placeholder, and a new check keeps build paths out
  of the shipped binaries (#977). The kernel also drops the one
  source-file path a panic site had put in it, since the catalog's alias
  list is now written without a call that can panic (#958). The corpus
  break fixture replays byte-identically on the rebaked kernel (both
  landed as #1139).
- **Kernel `0.1.0+6adb7fd9`** (rules `0.1.10+6adb7fd9`) is a rebake that
  changes only text strings inside the two binaries, not the physics: it
  replays all 15 corpus shots byte-identically to the kernel fix's
  `0.1.0+15210514`, and that pair is listed (landed as #1234). No listed
  pairs connect it to build 19's `0.1.0+206ceb55`, so share links
  recorded on build 19 open with the cross-version notice that came with
  the kernel fix.
- At boot, the shaders that the room's lighting and the hall's spotlights
  need are now compiled ahead while the game holds its next frame, instead
  of inside a drawn frame. On a normal pool boot in Chrome tests, the game
  is ready about 0.12 s sooner and no frame after the first picture stops
  to build a shader (#1174, landed as #1203). When the room's lighting
  arrives after the boot overlay has gone, though, the start of the
  opening camera move can freeze for longer than before; #1174 and #1202
  remain open for it.
- The shader compile-ahead above no longer throws when a material is
  disposed before its shader is built, for example when a table rebuild
  lands mid-compile. It now compiles and checks readiness itself, and
  counts such a material as done. The error appeared once in a test run
  before release and never in a shipped build (#1199, landed as #1203).
- Switching into the atelier's cue station no longer requests cue images
  for the previous station's selected card, a table or a lamp: the rotating
  cue preview now loads only for cues, which removes failed requests and
  console errors that players never saw (#1220, landed as #1222).
- On phones, the pocket picker's six pocket names and the snooker colour
  names now follow a language change made while the picker is open,
  instead of keeping the old language until it is reopened, and 10-ball's
  No-call row no longer turns into "Safety" then. No shipped flow reaches
  this: the language changes only in Settings, which cannot be opened
  while the picker is open (#1077, landed as #1139).

### Internal (no change to the shipped game)

- #1207 and #1208 (homepage copy edits; landed as #1222),
  #1055 (the bug-report analyzer measures the balls on the table
  instead of taking their sizes from the previous game's last shot, via
  #1087), #1219 (the station-picture baker finds the named cloth bed, pins
  its venue and gives the cloth swatch the vertex colour it was missing; the
  committed pictures were already up to date; via #1222), #1063 (the
  venue-lighting check, which CI does not run, re-pinned for the per-class lighting gains, via
  #1139), #1020 (the T1 corner-tone lighting check leaves the hall first,
  then reads canvas pixels only and measures them against the rail beside
  the corner block; the table and its lighting are unchanged), #870 and #965
  (e2e-replays ran up against its 25-minute CI cap, with under a minute of
  margin; the job cap is now 60 minutes, a 25-minute suite budget plus
  setup, landed as #1069), #1140 (run-gate gets its own deadline, which ends
  the suite's processes and frees its port band before a CI step times out,
  via #1176), #1194 (one verdict grammar for run-gate's arm counts and
  failure lines, which now names an uncaught error, via #1203; the
  printed-line gap is #1210, still open), #1006 and #1101 (lint-readable
  port defaults for the lighting matrix tools, and the combined-capture
  tool's default ports moved past the widened CI port reservation, which now
  ends at 20029; both via #1087), #1119 (private-registry node tests take
  their own band-mutex port, so they no longer starve live claimants of the
  shared one; holds over 5 s are reported), #1143 (the test port-band
  registry reads process birth times in one fixed locale, so a lease written
  under French or Chinese settings no longer reads as pid reuse, landed as
  #1176), #1205 (a process-birth-token selftest passes on hosted macOS
  without waiting on the runner's 35 s reverse lookup, via #1213), #763
  (four red harness-hygiene check rows on the main branch's own code;
  closed once the suite's probe selftest also passed on the hosted macOS
  runner, landed as #1176, #1196 and #1203), #1158 (the harness-hygiene 4e check
  times the losing relaunch's refusal from the latest of three anchors, such as the frozen session's reap, not a
  fixed 12 s total, and gains a plain-node selftest, via #1176), #1193 (that
  selftest runs on a virtual clock, so machine load cannot fail a row, via
  #1203), #860, #1110 and #1118 (one shared helper makes e2e-settings G5,
  e2e-shell K05 on phones and e2e-replays R5d await the locale switch and
  read settled values, K05 within a bound, instead of fixed sleeps such as
  G5's 350 ms and R5d's 450 ms; landed as #1147), #1049 (e2e-shell H waits
  for the place pill to finish painting instead of a fixed 300 ms, via
  #1139), #1094 (e2e-shell QA713 times its double tap on the input clock and
  judges it by the page's own timestamps, via #1147), #1106 (e2e-shell A2
  judges the rack only on a settled, rendered camera, landed as #1176),
  #1157 (e2e-shell A2b turns off the browser cache before it blocks
  atelier.js, via #1176), #1116 (intermittent e2e-shell rows wait for their
  own preconditions and name an unsettled read, via #1176 and earlier
  fixes), #915 (e2e-atelier's last uncaught paused-request answers, in
  arm B6 and the S5-D and S5-Y legs, now use build 19's shared helper
  (#930), so a request the page has already dropped no longer kills the
  suite and any other failure is named, via #1147), #1033 (e2e-atelier arms
  B and B7 wait for the station strip and the app to be ready, landed as
  #1147), #1117 (e2e-atelier S5-W judges the focus ring only once the cards
  row is at rest, landed as #1164; the product cause it then exposed is
  #1206), #1198 (e2e-atelier arm C waits for the cue's rest-pull ease to
  settle before each snapshot), #1225 (e2e-atelier arm C's 300 ms
  float-latency check counts the floating cue preview as shown only on a
  frame set to draw it, so it can no longer pass with the preview missing;
  landed as #1232), #1066 (e2e-replays R1 retries a desktop click that
  machine load stretched into a hold, via #1164), #1089
  (e2e-replays arm 1 settles on signals instead of a fixed 1.5 s sleep and
  explains a card mismatch, landed as #1164; its recent red traced to the
  lighting changes rendering the two boots' card backdrop one colour level
  apart), #1126 (e2e-replays F1c decodes its two stills for real, so its
  pixel threshold runs and a failed decode can no longer pass, landed as
  #1164), #1142 (an e2e-replays fade check survives one stall swallowing the
  200 ms ramp, via #1196), #1186 (e2e-replays 0e turns the browser cache off
  before it blocks replays.js, and e2e-rules P2-MC now does so before it
  serves an outdated keygate.js, landed as
  #1196 and #1203; #1190 remains open), #1214 (the e2e-ui suite's
  cue-title fold check judges only enabled cards and waits with a bound, via
  #1218), #1215 (the phone e2e-ui suite's worst-name rail pick: enabled
  cards only, a confirmed selection and a real tap, landed as #1218 and
  #1224), #1216 (the e2e-ui snooker-viewport check waits, bounded, for the
  camera to follow the resize and the top preset instead of two fixed 500 ms
  sleeps, landed as #1218), #1091 (the userboot stale-dictionary check
  judges the boot guard's final document, not one a self-heal reload has
  replaced, landed as #1147), #1124 (a fix for the boot-manifest staleness
  check of the e2e-userboot-3g service-worker fill leg, which stopped
  watching before its own window ended; landed as #1147), #1161 (the
  userboot service-worker update leg bounds every check after Reload at 20 s
  and releases restarted workers, so a stall fails by name instead of at the
  1500 s cap, landed as #1176), #1159 and #1165 (e2e-touch-disciplines D1
  and e2e-touch S10 poll until the drag lift settles instead of reading it
  after a fixed 250 ms, landed as #1176 and #1196), #1154 (e2e-play P-E1(a)
  polls up to 3 s for the confirm to leave instead of reading after a fixed
  600 ms, and fails by name if it never does, landed as #1176), #1197
  (e2e-playback arm 20k's drill cell no longer ends its run with a drill
  stop, which since #982 re-racks, but with the layout exit, which keeps the
  table; its red was a stale test assumption, not a product bug; landed as
  #1213), and five issues closed with no change in this build because their
  fixes had already shipped: #688 (the snooker end-rail loft seam, cured by
  build 18's #637; the loft check has covered that table by default since
  build 19's #932), #749 (the TEST-y3-obtuse ball-return fixture, moved to
  the node-only tools tree by build 19's #925), #861 and #880 (both fixed by
  build 19's #930: the test-browser reaper leaves alone a helper whose
  profile path is the session's own path plus a space and a word, and the
  e2e-ui gate's settings sound-toggle knob check compares its accent colour
  as a colour across colour spaces, not
  as a string) and #883 (e2e-atelier's phone mount rows wait for the game's
  first-arrival write before reloading, fixed by build 19's #908).

### QA

The unverified ledgers from build 18's QA (#686, #703, #722, #736) are still
open and carry forward, as does the ledger from this build's QA (#995).
One confirmed finding from this build's QA waits on one last check:
the macOS app's accessibility name for the page has not been re-checked
yet (#1181).

## v0.1.0-build19 — 2026-10-06

Milestone **build 19** (19 closed items) · release commit = the commit
tagged `v0.1.0-build19` · kernel `0.1.0+206ceb55` · rules catalog
`0.1.10+2d62d871`.

### Rules & gameplay

- **Replays and share links play on exactly the sender's table, cloth,
  balls and cue** when the loaded game has them, and refuse otherwise
  with a message that never shows an internal id — never quietly on a
  look-alike table or cloth, even when part of the game is still cached
  from before the rename (#789, landed as #948; edge cases tracked in
  #947).
- **Continue from a replay borrows the replay's equipment for that
  session only**: play goes on with the sender's equipment the game
  knows, and a reload brings back your own saved equipment; an item you
  change after Continue saves only that item, never the sender's whole
  set as your choice. To keep one of the sender's items, pick it again:
  it saves with no confirm, re-rack or close, unless part of the game is
  still cached from before the rename and cannot use it; in the atelier
  preview the Keep bar comes up with no visible change on the table, and
  Keep saves it (#789, landed as #948).

### Video export

- **A ball that drops late is no longer cut off in replay playback**: in
  one test shot, playback moved on at 2.750 s while the ball was still
  visible until 3.964 s. Playback now holds each shot until a late ball
  has dropped, as the export already did, and the camera, the cue, the
  cuts and the fades all follow that later end, so they line up with what
  is on the table (#864, landed as #931).
- **Exports no longer clip a late drop at a cut either**: where a walk
  transition exports as a cut, that cut now also waits until the ball has
  dropped instead of falling at the end of the shot's motion; only where
  that cut falls moves, and the shots themselves are unchanged (#864; the
  cut fallback is from #299).
- **On jacked-up (elevated-cue) shots the cue butt no longer blocks the
  POV camera, in playback and in exports**: it used to cover a quarter to
  a half of the frame until the camera rose after the strike; the camera
  now lifts just enough to stay clear of the cue before the strike and
  through the rise, worked out from the replay itself so a shared replay
  still frames the same for everyone, and shots where the cue never comes
  near keep their frame (#911, landed as #953).

### Visuals & tables

- **The carom table now stands at regulation height**: the UMB height
  window (World Rules of Carom Billiard) is measured from the floor to the
  top of the frame, not to the bed, so the frame top comes down from 837 mm
  to 800 mm, with the legs and feet re-fitted to the floor and the room
  lighting recomputed to match (#730, landed as #920). No other table
  moves, and the carom frame width and cushions are unchanged.
- **Opening the hall right after boot no longer pauses**: its spotlights
  used to join the scene only on the first open, freezing the picture for
  about 400 ms; that work now happens behind the boot overlay while boot
  holds back the first picture (build 18's #785), with nothing lit early,
  so a boot that does not start in the hall finishes about 0.4 s later
  (warm cache, hall opened right away). If that hold times out first on a
  slow boot, the first open still pauses as before (#910, landed as #927).
- **Internal equipment ids follow the de-branded names**, the second
  step of the rename begun in build 18: saved choices carry over to the
  renamed entries, and the table picker never greys out or refuses a
  table that is legal for the game, even when part of the game is still
  cached from before the rename. While a stand-in shows for a saved
  table, cloth, balls or cue, changing a different item leaves your saved
  choice in place, and an entry retired by the rename that a replay still
  uses shows under its new name, marked as a legacy alias (#789, landed
  as #948; edge cases tracked in #947).

### UI & settings

- **Cue names fit their rail card in French, Spanish, German and
  Japanese**: nine over-long names — the massé/trick cues, plus the three
  Pro LD pivot shafts in Spanish — are shortened so the card no longer
  grows tall to hold them (#904, landed as #918).

### Under the hood

- **Kernel `0.1.0+206ceb55`** changes the catalog (v20) and id lookup,
  not the physics, and replays all 15 corpus shots byte-identically to
  build 18's `b6b5dc3f`; that pair is listed, so build-18 replays and
  share links open with no cross-version notice (#789, landed as #948).
- Two shipped edge cases are hardened: the pocket-net reset restores
  every sock before rethrowing the first error, and Escape during a
  stalled direct-launch import now cancels the archive hold, a case no
  shipped flow reaches (#898 in part, via #925).
- While the boot overlay waits for the venue lighting, the whole game
  loop now waits too, not only the drawing, and the wait is capped; the
  picture is visually unchanged (a follow-up to build 18's #785, landed
  as #908).
- The ball-return controller gains an activation handle for its lifecycle
  tests, and the OX ball return stays unarmed with no ball-return hardware
  declared, per the #913 ruling (#903, landed as #925); the TEST-y3-obtuse
  fixture moves to the node-only tools tree (#749, still open).
- The service worker's boot precache now carries the elevated-cue POV module
  (`app/povpose.js`), which the #911 landing imported from playback but left
  fill-only, so the nightly service-worker fill check no longer sees a boot
  request outside the boot precache (#959, landed as #961).

### Internal (no change to the shipped game)

- #795 (one shared source scanner for the port-band lint, #750), #796 (six
  round-gate holes closed, #613 still open), #914 (venom-render keeps its
  Chrome profile, #757), #923 (an e2e replays wait), #933 (an e2e replays
  settle, #798), #930 (six tool fixes: #852, #863 and #881; #861, #880 and
  #915 still open), #932 (a fold-settle judge, #887; loft-check defaults
  restored and widened, #688 still open), #937 (pool-cli temp paths, #924;
  storm-guard and retry bounds, #935 landed as #960; #926 still open; see
  build 18's #691), #945 (hosted macOS CI legs off pull requests, #942), and
  the tooling halves of #908 (a main-thread stall probe, two e2e timing
  fixes), #918 (a kit-laws sampler, #877), #920 (a shared loft classifier,
  #728), #925 (Chinese-8 node checks, a cushion CI step, a label census) and
  #931 (a per-PR export CI job, four kernel-corpus CI steps).

### QA

The unverified ledgers from build 18's QA (#686, #703, #722, #736) are
still open and carry forward.

## v0.1.0-build18 — 2026-09-22

Milestone **build 18** (71 closed items) · release commit = the commit
tagged `v0.1.0-build18` · kernel `0.1.0+b6b5dc3f` · rules catalog
`0.1.10+2d62d871`.

### Rules & gameplay

- **Heyball is a playable discipline**: the WPA Rules of Heyball (eff.
  2025-08-16) as the `heyball-v1` composition — no call shot ever, the
  II.6 break option matrices, open-table-regardless grouping, the II.15.2
  frozen-cushion escape and the II.20 loss family — paired with the
  Chinese 8-ball tournament table (#491).
- **One-pocket's pocket choice is direct manipulation** — tap the pocket
  on the table; the racked balls are no longer blanked while you decide
  (#447). Desktop 10-ball push-out lives next to Shoot instead of a corner
  away (#464), and the call-required hint and the "No call" stance share
  one name (#439).
- **Ball-in-hand can no longer be dropped inside a pocket's capture disc**
  (#595), and a low hop into a Chinese-8 corner throat is pocketed instead
  of tunnelling through the pocket hardware and leaving the table (#594,
  landed as c0265e79 via #642) — the build's two kernel behaviour changes;
  neither moves the 14-shot replay corpus (see Kernel lineage below).
- Flow correctness: a carom equal-innings draw presents as a DRAW, ghost10
  no longer floors an early scratch at zero, and a discipline switch reseeds
  the breaker (#458, #459, #460); the snooker frame winner no longer breaks
  the next frame (#716).
- Replays tell the truth: a ⏮ scrub keeps the breaker seat (share codec
  v7, #448), a rapid double-⏮ no longer wedges the replay (#450), decision
  moments render as chips instead of dead prompts (#451), and a shared
  carom link waits for the rules fold before firing its first shot (#492).
- Phone snooker keeps its touching-ball chip and the free-ball pocket picker
  opens while unarmed (#449, #462); desktop call-gate copy says Click, not
  tap (#463); drill foul banners keep their reason (#436) and every drill
  objective zone is printed on the cloth as a paper decal (#442).

### Video export

- **Crash-grade resume now covers sound-on exports** through the windowed
  audio bed (#435), and a background/foreground flip mid-encode gets a
  frame-exact pause seam — a truncated export keeps its draft instead of
  discarding everything (#472).
- Lead-in practice strokes wait for the camera to settle (#474); the
  strike-point overlay gains optional elevation and power annotations
  (#475); the snooker miss-REPLACE boundary is bridged by a fade instead of
  a one-frame teleport (#452); plain-web players are no longer told to
  "update the App" (#438).

### Visuals & tables

- **Three new tables**: the Rasson OX 9 ft — official 100 × 50 in playing
  surface, 4.5 in corners / 5.0 in sides, K-55 cushion, built from the
  purchased model under the purchased-baseline law — the model is the
  baseline, manufacturer and WPA numbers correct it (#641) — and
  the Diamond Pro-Am **8 ft** and **7 ft bar box** (#621), with the 9 ft
  Pro-Am re-derived from the same purchased model. Equipment catalog v19,
  13 entries.
- **Pool tables rebuilt 1:1 against factory references**: Predator Apex
  (GH-488P) and Diamond Pro-Am (GH-488D) render rebuilds, the Diamond pocket
  pass — leather horseshoe liner, fall-lip cloth roll, 15° facing lean
  (#488, #517) — the Predator side mouth corrected to the official 4.92 in
  (catalog v17), a potted ball that rests on the Predator foam plug (#633 for #626),
  and the Apex corner fillet ring law (#671). Pocket geometry is now single-
  sourced between model and drawing (ADR-0015, #569).
- **Snooker table to the Star XW101 / WST identity**: open-throat pocket
  assembly with saddle leather cap (#489, #570), 141 mm rail band, 3850 ×
  2060 footprint and the 864 mm WPBSA height stack (#518, #499), and the
  pocket-rim fireflies cured by derivation with liner density, ring tone
  and nap re-calibrated in the craft R2 pass (#637; #625).
- **Chinese eight-ball table rebuilt as a class**: playing width repinned
  1270 → 1260 mm (catalog v15, #490), the R82 molded-mouth corner pocket
  (catalog v16), 92 mm factory frame with leather-over-copper mouth rings
  (#490), GI bake-proxy and shadow-rig fidelity (#572, #573), a net
  interruption that no longer strands the ball (#574), and the rebuilt
  apron and pocket furniture — chamfered rail-wood ends, narrower leather
  horseshoes, a solid lit fascia, supported nets and a continuous drop
  channel (#896, from the #748 prototype; card 28).
- **Venue lighting, on by default**: material-class room dressing on every
  table, a runtime-derived Predator fill (the cue ball no longer clips to
  white), and single-sourced ball shading from a derived occlusion table
  (#638, landed as #727 + #854); `?venue=off` restores the previous look.
- **Fixture tables no longer freeze on first launch** (#785): the first
  rendered frame waits 2–5 frames (tens of milliseconds) for the venue
  lighting leaf, so a fixture's lights are compiled once with that frame
  instead of a whole-scene recompile a moment after boot (the 8–13 s
  cold-cache main-thread stall; about 25 fewer programs per boot); the boot
  overlay covers the held frames and pixels are unchanged.
- Env-lit walls, props and dark finishes are graded through derived
  environment terms — the corner-miter blue wash and mismatched corner
  materials are gone (#440, #473, #480, #482); ball contact shadows cover
  the rail-edge diagonal (#406); assist-ink colour is deterministic across
  boots (#496).
- Cloth condition — deposit and abrasion from a derived traffic field
  (material-core R4, #612; the wear read at overview framings is still
  under review in #542) — and a derived maple ring-grain on the cue; every
  material finish now carries provenance (ADR-0016).
- **De-branded equipment display names** (#789, step 1): pickers read
  "Pool tournament 9-ft (4.5 in pockets)", "Pool tournament 7-ft, bar box"
  and so on in all seven locales, with the French, Spanish and Japanese
  names sized to the phone rail card (#642); internal ids follow in build
  19. The private calibration table and cloth leave every selection
  surface (the 2026-08-19 settings demotion).

### UI & settings

- **The game UI redesign (GH-525) ships end to end**: a hall-backed cards
  shell with places navigation (S1), the five-station equipment atelier —
  cues / table / cloth / balls / lighting — with live swaps and a deep cue
  station (S2), the Play, Practice and Replays places (S4), and the S5
  design pass that puts every shell surface on one design-system component
  library (#668). Replays-place snapshot freshness and launch races are
  fixed (#692, #693); pending decisions keep a placement belt when the kit
  sheet is stale (#738).
- **Installable as an app**: Add to Home Screen gives a zero-chrome,
  fully offline build; Settings gains a capability-gated Fullscreen row
  (#617). The help overlay links back to the project site (#616).
- Settings → Display → Default camera is live (the derived overhead
  register, #441); decision prompts take keyboard focus with real dialog
  semantics (#465); closed rules-variant labels never ellipsize (#443);
  phone toolbar pills no longer first-paint as white discs (#461); zh-CN
  punctuation and seat naming are consistent (#437).
- Three journey-QA fix rounds on the new shell — hold-timer gestures,
  focus successors, boot-overlay hold law, finished-replay resolution,
  sender-tab replay, DVR keyboard seeking, coarse-pointer iPad registers
  (GH-676…685, GH-694…702, GH-709…721).

### Under the hood

- Kernel `0.1.0+b6b5dc3f` is a **behaviour-changing** kernel relative to
  every earlier stamp (`91ad8597` build 17 → `88084c37` v15 GH-490 →
  `e803d369` / `9cf38284` v16 → `a1f38fb3` / `2b2d415f` / `89ad4aa2` GH-595
  → `a7c980b4` v17 → `b6b5dc3f` v19): the hops carry the GH-490 pocket
  geometry repin, the CALIB-B1 Chinese-8 mouth, the GH-595 placement guard
  and the GH-594 airborne throat capture (#642). No `KERNEL_COMPAT_LINEAGE`
  pair is added — the 14-shot replay corpus reads byte-identical across
  these stamps, but the kernel sources do not (a cn8 cue shot that hops the
  corner throat simulates differently), so replays and share links made on
  any earlier kernel open through the cross-version notice (view-anyway).
- Rules catalog 0.1.10 adds the `heyball-v1` composition (registry slot
  11); judgments carry no version stamp, the 430-case corpus is byte-
  identical.
- Ball-return extension (GH-650, ADR-0017 — Accepted, ratified by the owner
  2026-09-22 at this landing; constitution 1.4.0): the post-pocket rolling
  and stacking module lands with its determinism suites wired into CI (#895;
  the route-builder fix #768 under #770) and the Diamond and OX pocket
  assemblies declared (#644, #906); it is armed on no shipped table yet —
  opt-in per table (arming preconditions: #903).
- Kernel records: the Predator Apex side-facing CAL-2/CAL-3 found-data
  round and its verification tooling (#855–#858, #886); the served-strings
  privacy gate keeps owner words, personal dates and private provenance out
  of every shipped string (#789). The app no longer depends on GSAP.
- Harness/CI structural work: the committed port-band table with
  local-claim refusal and registry-aware widening (#483, #687), a
  storm bar derived from a measured resting baseline (#691), 33 of 39 e2e
  suites wired into CI in two tiers (#562), fail-closed static-server
  binds (#557), the pinned wasm-bindgen CLI (#669), the middle-jaw
  contact-height concordance gate (#568), the retry wrapper that
  recognises every suite verdict (#816), and a sweep of suite-race and
  nightly-red fixes (#446, #453, #505, #507, #514, #519, #634, #664,
  #665, #747).

### QA

Three exploratory S4 journey-QA rounds on the new shell plus an
iOS-simulator WebKit wave ran during the build; the fix PRs for the
confirmed findings merged in-build (#689, #706, #723) and the unverified
ledgers (#686, #703, #722, #736) carry to build 19. Also in this build:
the carom fresh-boot break-spot lock that hid the atelier (#541), the
carom second-cue-ball radio pills (#667), the zh-CN HUD cue label that
ellipsized (#561) and the phone atelier rail insets (#539). The build-17 round-1 ledger
closed (#444). Every table landing — Predator, Diamond, Chinese-8,
snooker, Rasson, venue lighting — passed an independent visual audit
against factory references before merge.

## v0.1.0-build17 — 2026-08-08

Milestone **build 17** (38 issues) · release SHA `883bde87` ·
kernel `0.1.0+91ad8597` · rules catalog `0.1.9+9c81350d`.

### Rules & gameplay

- **Snooker plays the full WPBSA ruleset by default**: foul-and-a-miss
  (Sec 3 R14) with the replace/play-again prompt and frame-forfeit warning,
  free ball (R12) nominated by tapping the ball in scene, and touching-ball
  (R8) declaration (#382).
- **Carom plays pro two-cue-ball rules**: per-seat white/yellow assignment
  (Art 22/23), respot-shooter parameter (Art 27.3), optional equal innings
  (Art 29.4), Art 83 foul classification (#383).
- **10-ball push-out** is a first-class button on the FIRE strip on phone,
  and an armed push disarms loudly (never silently) when a scene tap
  supersedes it (#360, #380).
- **Opening break and ball-in-hand placement aligned to official rules in
  every discipline** — kitchen / D / anywhere scopes with honest zone
  overlays, frozen-contact snap, the WPA 3.11 foul family, the 14.1
  re-break zone, and carom Art 27 (#370, #371).
- Drill-family conventions ruled and enforced: lineup mid-run ball-in-hand,
  clean-contact scope, called-pocket reset, bu-f1/f5/f7 station fidelity
  (#384).

### Video export

- **Full-game export with sound, streamed to disk** — no duration wall;
  with-sound sessions are bounded only by the container's 4 GiB (#305,
  #373).
- **Crash-grade resume**: exports keep the device awake, pause gracefully
  when backgrounded, and resume from the streamed chunks after
  lock/background/crash (#362).
- **Pre-strike lead-ins** with practice strokes (v2, cue-program
  choreography) before each segment (#363); a lead-only trim window now
  associates to its parent shot instead of silently disarming the export,
  and zero-content selections refuse with an honest note (#433).
- Optional **strike-point teaching overlay** rendered into exported clips
  (#364).

### Visuals

- **Ball contact shadows are derived from the actual area light source**
  (penumbra from the emitter's angular size) instead of an authored
  point-source approximation (#385) — and stay inside the 60 fps budget
  even under snooker's 22 balls (#434).
- **Each table class hangs its own lamp** with class×fixture GI bakes:
  snooker 12-ft and carom tables no longer borrow the pool 9-ft canopy
  (#386, #337). The carom break-view slab clip is gone (#381) and the
  carom frame's corner miter is sealed (#387).
- A language switch alone no longer re-skins the venue (#368).

### UI & settings

- **Assist-line contrast is now a setting** (Settings → Assists), default
  byte-identical to the previous WCAG guarantee; the maximum level keeps
  per-ball hue identity (#417).
- Immersive playback console auto-hides after 3 s on phone again, and
  tap-outside dismisses it (#361).

### Under the hood

- Rules catalog 0.1.9 adds the snooker-v2 FULL and carom3c-v2
  compositions; kernel lineage `dedc61cd → 91ad8597` is mechanically
  proven, so build-16 replay links open without the old-kernel badge.
- Harness/CI structural work: port-band arbitration registry (#338, #389,
  #410), the green-fingerprint gate ledger for ceremony preflight (#347),
  the storm-aware pacing classifier (#425), and a sweep of suite-race
  fixes surfaced by the wave (#344, #394, #395, #404, #407, #412, #413,
  #416, #423, #396, #313).

### QA

Two exploratory journey-QA rounds (13 persona journeys on the shipped
renderer) ran before the ceremony; every finding was triaged to build 18 —
zero build-17 regressions among them.
