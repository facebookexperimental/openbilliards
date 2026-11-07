// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-playback.mjs — Playback DVR UI gate (GH-225, 030 Phase C:
// feature 030 (internal spec) design charter + the owner-signed mockups). Drives
// web/app/playback.js headlessly through the pill / __playback seam on a
// self-served web/ (?archive=1 armed boot — the e2e-archive convention):
//
//   arms:
//   0. empty state: an armed boot with no sessions opens the list to the
//      localized empty notice + storage footer; closes clean.
//   1. list rendering + markers: settled shots materialize rows with mode
//      icon, title, marker glyph strip (pot dots / foul ticks), time meta,
//      and the usage footer; filters partition by mode.
//   2. scrub seeks the correct shot/time: opening a session enters the
//      player over the live bed (chrome hidden, ob-pb-live), the playhead
//      maps global T to the right segment's record (game.clock == local t),
//      and close RESTORES the live table (state machine back, no duplicate
//      archive rows, suspend released).
//   3. trim+camera+speed produce the expected renderDrill timeline args —
//      asserted via a stubbed __export.renderDrill. CONFIRM-FIRST (the owner
//      two-step-save fix): opening the card renders NOTHING — arm 3 asserts
//      renderDrill was called zero times, that the honest pre-render estimate
//      line is painted and that the bar stays off, then presses the Export
//      CTA. 3d: the WYSIWYG law under that lifecycle — a res change after a
//      settled render INVALIDATES instead of auto-rendering (3d-post), the
//      setup plan follows the picker (3d-plan), the confirmed render delivers
//      exactly the displayed 1280x720, and a running encode LOCKS the picker
//      and hides the CTA (3d-mid, the replacement for the deleted
//      cancel-and-re-render repair); 3c: one REAL render (size-shimmed to
//      640x360) runs the actual engine from inside the open player and the
//      player survives it (in-player restore).
//   4. destination routing (the obSaveVideo shell contract, GH-225): the
//      documentStart capability hint (__obSaveVideo {v:1, dests:[...]})
//      gates the bridge tiles by MEMBERSHIP — iOS shape photos/files/share;
//      the files-only macOS shape shows NO Photos tile; a bridge-less shell
//      falls back to the download tile; a webm render hides Photos ONLY
//      when the GH-252 transcode probe fails (4f — VideoDecoder absent);
//      with the probe passing, 4f2 renders a REAL webm, taps Photos, runs
//      the REAL transcode.js and delivers the mp4 down the chunked wire
//      (begin mime video/mp4, ftyp-verified reassembled bytes, latch held),
//      and 4f3 proves the FAILED transcode honest (unlatched, localized
//      playback.transcodeFailed, failure register on the tapped tile) with
//      the untouched webm still delivered through Files.
//      A tile click posts {v,name,mime,b64,dest}, disarms EVERY
//      tile behind the Saving… paint, and the shell's ONE
//      'ob:save-video-result' re-arms: ok paints Saved, an error code
//      paints its honest localized message (denied arm — never "Saved").
//      A shell WITHOUT the hint (stale) keeps the optimistic degrade.
//      4j-4m (GH-255): the ACCENT FOLLOWS THE LIVE ATTEMPT. At rest every
//      tile shares ONE neutral material — the static "recommended" accent on
//      Photos is gone (the owner read it as "selected"); a REAL hit-tested tap
//      moves the working register onto THAT tile and no other, and it survives
//      both the collective disarm's opacity dim and the pointer still resting
//      on it; a denied/busy result resolves the honest failure register on the
//      tapped tile while its neighbours stay at rest, and only ONE tile ever
//      carries a state; a mismatched-identity result paints nothing anywhere;
//      the working state survives card close/reopen with the LATCH it is
//      derived from, while the retired RESULT paint still lands nowhere; and
//      the res-change invalidation retires a settled success too; and 4n =
//      the fire-and-forget routes (driven through the legacy obPhotos shell)
//      ACKNOWLEDGE on their own tile instead of staying silent, and 4n2
//      (GH-251 review) = the legacy shell's own 'ob:photos-result' CORRECTS
//      that optimistic paint (identity-gated; the card owns the listener
//      now that record.js's left with its rescue machinery). Registers
//      are judged on computed material against token-built probes, never on
//      class names (destTiles()).
//      4k (GH-256): with the shell advertising `chunk`, the clip crosses the
//      bridge as BOUNDED AWAITED CHUNKS and never as one giant string —
//      zero v1 posts, begin/chunk×N-in-order/end, every chunk under the
//      advertised ceiling and a fraction of the whole clip, at most ONE op
//      in flight (the reply IS the backpressure), padding only in the final
//      chunk, and the reassembled bytes byte-identical to the clip through
//      an injected bridge. 4k2: a refused transfer paints the shell's own
//      localized reason and never "Saved". 4k3: a shell without `chunk`
//      still takes the v1 whole-string post (the recorded degrade).
//      4k4 (GH-256 P1): dest 'share' streams too — a hint naming 'share'
//      renders the Share tile and the tap crosses as begin(dest=share)/
//      chunks/end with the obShare handler byte-idle; a hint WITHOUT
//      'share' renders NO Share tile even with obShare registered (the
//      review measured that tile shipping the v1 whole-string crash wire).
//   5. delete: per-row delete confirms (kit dialog) and removes the session.
//   6. stale-module degradation (cache-poison contract): a stale
//      playback.js graph boots with NO pill and zero errors; a stale
//      export.js (renderDrill absent) fails the save flow honestly; and
//      (6c, own browser) an ui/icons.js served as an EMPTY register drives
//      every face to its TEXT fallback — the mode face reads '?', never the
//      retired '·' that was indistinguishable from the practice glyph; and
//      (6d, own browser) with the ui/icons.js REQUEST FAILED outright — the
//      harder degrade, where the guarded import rejects — the primary chrome
//      pills (#ob-playback / #ob-gear / #ob-help / #ob-drills, and on a
//      coarse boot #ob-nudge-ccw / #ob-nudge-cw / #ob-rec-start) still
//      render their REAL vector mark, markup byte-identical to what
//      ui/icons.js `iconHtml()` emits. That identity is the whole point of
//      GH-246 defect 1 and is asserted against the expectation computed in
//      NODE from icons.js itself, so an inlined copy that drifts from the
//      module fails here as well as in web/tools/glyph-audit.mjs; and
//      (6e, own browser) the `playback` mark's COUNTER measured ON PIXELS —
//      the LIVE pill's own markup rasterised by Chrome at 20/22/13 px on DPR
//      1 and 3, thresholded, and judged on connected components, angular
//      coverage of the ring around the triangle, and the minimum clear gap in
//      device px, with the pre-GH-246 geometry measured in the same pass as
//      the control (it MERGES into one ink component at 20px DPR1 — the
//      "filled swirl" the owner reported, reproduced in pixels).
//   7. REAL-INPUT reachability (the ea2af949 regression wall): the core
//      interaction paths re-run as HIT-TESTED CDP input
//      (Input.dispatchMouseEvent / dispatchKeyEvent at real viewport
//      coordinates — the e2e-touch.mjs methodology). Arms 0-5 drive eval
//      element.click(), which bypasses hit-testing: they stayed green while
//      the promoted kit backdrop (z:69) sat ABOVE the old z:60/62 surfaces
//      and ate every real tap (QA wave; fixed ea2af949 — panel+card z:70).
//      Real pill tap opens the list; elementFromPoint z-ladder probes at the
//      panel/card centers must resolve INSIDE the surface (not the
//      backdrop); filter chip tap partitions; row tap opens the player;
//      Save tap opens the card; Cancel real tap aborts mid-render; a
//      destination tile real tap posts the bridge; back tap restores the
//      list; focused per-row delete ✕ + REAL Enter opens the confirm (the
//      e9acbf79 keyboard fix); delete ✕ real tap → confirm accept deletes.
//      Red-proofed at introduction: a test-page CSS injection pinning
//      #ob-pb-panel back to z:60 fails 7b/7c/7d (see the introducing
//      commit body). Arms 0-5 stay seam-based on purpose: they gate LOGIC;
//      arm 7 gates REACHABILITY. 7e also hit-tests the new Export CTA (the
//      only entry into a render) before the Cancel/tile taps.
//   8. card/list STRUCTURE on a coarse 852x393 phone boot (the playable
//      orientation — portrait is gated behind rotate-to-play): the pinned
//      head survives a scroll to the bottom of the card body with an
//      elementFromPoint hit-test on the ✕ (owner defect B), the session list
//      keeps the same property, the resolution picker is the kit combobox
//      whose popover opens by real pointer with every option centre
//      hit-testable inside the modal (owner defect C + the GH-36/238 clamp
//      findings) and commits without rendering, no native-styled control
//      survives anywhere in the card or the list, and the card's controls
//      clear the coarse 44px floor.
//   9. GH-242 marker vocabulary: the foul mark is the ui/icons.js danger
//      CROSS, measured against the owner decision sheet (12px glyph box,
//      1.80 CSS px strokes at 45°, ink 0.96× a 7px pot dot, +19px on the
//      dense 15-glyph strip) and out-scoping the player track's own
//      `height:13px` rule; a scratch stays folded into that ONE cross beside
//      the pot dot; every marker is a role=img named off the archive record
//      (real ball number, scratch vs foul, game-won vs drill-completed); and
//      the footer legend renders inline beside the storage note at 1440x900
//      in en/zh-CN/de and relayouts onto its OWN line at 667x375 with no
//      overlap, no overflow and no ellipsis. The marker LEDGER is shimmed
//      through `__archive.session` (the arm-3g `__archive.records`
//      precedent); every pixel is still the shipped module's. 9k (GH-328):
//      a 1-shot session reads the SINGULAR rowMeta — list row AND player
//      chip — via playback.rowMetaOne (the playback.usageOne law).
//  10. the OPEN-ANYTHING law (GH-257, own browser): a REAL corpus — one
//      session per equipment class (9-ball, snooker, carom), each recorded
//      by firing actual shots — is opened from EVERY entry state: mid-game
//      of another class (the owner's defect), mid-game of the same class,
//      before any shot (virgin rack), MID-SHOT (which must AWAIT the settle
//      behind the localized `playback.settling` notice and then open ITSELF,
//      never refuse), not in a game (playground with a hand-authored
//      layout), and WIN (whose pending auto-rerack beat must resume after
//      the close). Each round trip proves the SESSION's own bed staged (ball
//      census + table length), a real scrub on it, and a close that restores
//      the live state with ZERO deltas on a 20-field fingerprint (every
//      ball's pocketed/pos/quat/baseQuat at 9 decimals, kernel equipment,
//      __test.bed(), match-fold projection, judgment ledger, drill state,
//      share log, archive current+suspend, camera, orbit, Replay button) and
//      no archive duplication. 10h: an old-kernel session still opens
//      (view-anyway). 10j: a THROW injected inside the open unwinds the
//      WHOLE bracket — 0 deltas, suspend released, and the DVR keeps
//      recording (the pre-existing P0 soft-lock). 10k (GH-257 review P2):
//      a REAL #r= shared replay boots, a session is tapped MID-replay, and
//      the tap WAITS behind playback.replayRunning (player closed, replay
//      unmolested) then opens ITSELF once replay.done flips — a wait,
//      never the old refusal, red-proofed in both directions. 10l (GH-257
//      review P1): a DVR borrow inside a live drill's 1.4 s re-lay window is
//      NOT a stroke — the entry emission is replay-class + dvr-marked, so
//      the next legitimate drill stroke still scores (two attempt events,
//      zero void events; pre-fix code voided it).
//  11. CAMERA = USER STATE (GH-273, own browser, red-proofed against the
//      pre-fix code): a REAL hit-tested CHASE tile tap followed by REAL
//      pointer drags on the track — within-segment both directions, across
//      the segment boundary both directions — asserting a CAMERA POSE
//      fingerprint (full-precision position/quaternion/fov matrix values,
//      never aria state) that stays CHASE-class (a moving-rig pose, not
//      the broadcast static pose) and is BYTE-STABLE at the same scrub
//      pixel regardless of scrub history (render-clock law). 11c: scrub
//      then REAL play tap — the track resumes from the scrub position (eye
//      byte-unmoved, smooth pan, rig active), deterministic across two
//      identical runs. 11d: the export args read the SAME assignment map
//      the UI mutated (backfilled chase both segments; a mixed
//      overhead-cut plan; chase re-emitted with its deterministic
//      per-segment eye, never null-inherited). 11e: close/reopen keeps the
//      assignments (the GH-273 latch law). 11f: sibling audit — speed
//      detent + trim survive every scrub direction. 11g (review round-2
//      P2): chase wears the canonical 40 fov even entered from overhead's
//      78, live pose AND exported directive. 11h (review round 3,
//      red-proofed): live-vs-export WYSIWYG across the overhead→chase
//      cut — an in-page rAF fingerprint of a REAL play crossing vs a
//      REAL 640×360 renderDrill of the same plan sampled per encoded
//      frame (onProgress); post-cut frames must wear fov 40 + the
//      deterministic eye in BOTH paths, frame-by-frame equal (pre-fix,
//      the export rig EASED 78→40 across a cut the live player cut
//      instantly — the fovSnap directive moves the snap into the rig).
//  14. GH-250 capability floor (own browser): a boot with WebCodecs encoders
//      stubbed ABSENT (the e2e-export [fallback] recipe) offers the
//      REALTIME-CAPTURE tier on the DVR save card — honest wall-clock copy,
//      pickers gone, CTA armed; Cancel mid-capture delivers NOTHING; a full
//      REAL MediaRecorder capture over the live bed arms the tiles (webm +
//      failed transcode probe → Photos hidden) and Files delivers the
//      capture down the CHUNKED wire byte-complete under the GH-255 latch;
//      14a-startfail (review round 1) proves a THROWING MediaRecorder lands
//      in the honest could-not-start paint with the lifecycle restored,
//      never a wedged card. 14b stubs MediaRecorder away too → the honest
//      export.noneAvailable state with a disabled CTA (the pre-GH-250
//      arm-3f claim, preserved in
//      its register). Arm 3f in the main browser holds the OTHER half: no
//      offline encoder + working MediaRecorder = realtime offer, never the
//      dead end; 13e/13e-rt pin the setup hint's pressability mirror.
//  15. GH-299 one-take WALK BEATS (own browser; the owner-approved
//      round-2.1 model): POV→POV boundaries carry a quantized walk beat
//      off the ONE schedule builder (15a — walk moves never baked into the
//      plan); the beat stages segment N+1's INITIAL state so the BIH cue
//      ball exists from the first beat frame (15b live, 15h a REAL
//      export); the per-frame CB-in-frame + gaze-settle gate holds from
//      (beat end − 0.5 s) through (tImpact + 0.3 s) with the measured
//      returning-ball exemption, red-proofed via the walkSpec noLock knob
//      (15c); same-T byte identity with probes inside the beats under
//      disarm+scrub poison (15d); live-vs-export beat-window identity over
//      a REAL renderDrill (15e); measured peak gaze rate under the
//      100 deg/s ceiling on both boundaries (15f); and the trimmed-exit
//      red/green — the pre-299 one-clock clamp shimmed back FREEZES the
//      walk, the shipped two-clock split walks it (15g).
//  3t. design 277 slice 3 PR-2 cue timeline: per-segment cue-life tails
//      (ADDITIVE state field; total = Σ(durs+tails+beats)); the withdrawal
//      MOVES on pixels inside the tail with the balls held settled; tail
//      scrub parity; the mid-withdrawal TRIM LAW on two REAL hashed
//      renders — play prefix byte-equal to the untrimmed render (frame-
//      clock purity) and the held out-frame FROZEN through the settle
//      tail; arm 3's cueArmed pin flipped to the PR-2 WYSIWYG truth (the
//      renderer owns the whole cue bracket) + the cuePostTailCapable
//      marker chain. 3t2 (GH-404): the lampfade STAGING-BOUNDARY law —
//      a live above-plane fade excursion between player sessions must
//      never move the SCENE bytes of the same seek (two SYMMETRIC warm
//      opens of one session differing ONLY by a settled live poison at
//      the e2e-lighting F2 pose between them, same-seek scene-capture
//      byte-equal — DOM chrome hidden for the capture: the law governs
//      the rendered scene, and the glass tiles' backdrop-filter re-rounds
//      1 LSB on compositor-layer churn with the scene proven identical;
//      red on the pre-404 lampfade.js whose rate-limiter residue crossed
//      the boundary — the exact leak behind the two 3t parity reds on
//      pristine build-17 main).
// 15x. GH-315 RISE-INCOMPLETE boundaries WALK (own browser; the build-15
//      owner one-take jump): a record shorter than its own POV rise used
//      to hard-cut its boundary (beatFor's rise-completion gate) while
//      every other boundary walked. The beat now FINISHES the shipped
//      rise first, holds the watch, then walks the approved ring path —
//      emitted as a holdSec-0 composite 60 Hz dolly over an exit-clipped
//      base script. 15x-a the boundary carries a beat (RED pre-fix:
//      null); 15x-b the composite shape + clipped base laws; 15x-c LIVE
//      60 Hz pose continuity across play → beat → next play (RED
//      pre-fix: the crossing teleports to the next address), the rise
//      climbs to the stand height, the arrival lands the next address;
//      15x-d a REAL renderDrill walks the same boundary with bounded
//      per-frame eye steps and live-matching beat poses (WYSIWYG).
//  16. GH-301 DIRECTOR STRIP (own browsers; contract 5150532321 + owner
//      amendments A1/A2): the cameraPlan model laws (16a quantize-at-save,
//      duplicate-anchor last-write-wins, the 128-cut cap, unknown-id
//      apply-time degrade), 16b edit-time REJECTION of mid-segment cuts
//      into dynamic rigs (both directions: dynamic target at t>0 and a
//      static cut leaving a dynamic span), 16c scrub determinism with
//      probes inside EVERY transition class (mid-segment cut / fade window
//      / walk move) — chronological vs shuffled byte-identity under
//      disarm+scrub poison, 16d WYSIWYG live-vs-export on a plan carrying
//      a mid-segment cut + a fade: camera poses per encoded frame
//      byte-identical across the cut, and the fade proven ON THE ENCODED
//      BYTES via hashFrames against a fade-less control render (equal
//      outside the window, different inside, EXACTLY black at the cut
//      frame — the page recomputes the black-frame fnv1a), 16e A1
//      adaptive block labels (text → icon → color-only on one plan, no
//      clipped label anywhere, accessible names persist), 16f A2 slot-pill
//      geometry equality against the preset pills, 16g REAL-pointer snap
//      engage/disengage (lit tick + snapped bubble showing the shot label,
//      hysteresis release), 16h montage-chip/planFits agreement on a
//      capped plan (fades insert NO output seconds), 16i the capture flow
//      (latch suppresses the crossing re-apply, mm/dd quantized pose,
//      slot-pill insert applies the tripod), 16j the move seam (walk
//      duration derived read-only, measured peak gaze rate ≤ 100 deg/s,
//      move disabled on non-POV seams), 16k the plan latch across
//      close/reopen, 16n (GH-324) the NON-DESTRUCTIVE drag law — a seam
//      dragged through/into an OCCUPIED shot-boundary snap zone never
//      deletes the anchored cut (static victim crossed through; POV
//      victim parked+released in-zone with the beat-inclusive timeline
//      length intact; refused moves stand the magnet visuals down;
//      deletion stays the picker Remove, 16m-(k)), and the phone
//      register (compound CAM ▾ pill +
//      flyout with A2 entry geometry, measured row1 budget). 16z (own
//      browser): the DEGRADE path — playback-strip.js request FAILED →
//      pill-only player, boundary-only writes (exact GH-273), savePlan
//      valid, zero errors.
//  17. GH-304 (own browser): the byte-derived export duration budget —
//      the PLAYBACK half of the plan-time budget derivation (see the arm
//      banner for the 17a-17e sub-arm map; the engine arithmetic is
//      pinned in e2e-export B1-B5).
//  18. GH-302 (own browser): a shared replay carrying the `&cp=` camera
//      plan (sibling-param codec, contracts/share-codec.md Amendment
//      cp-v1) seeds the DVR player of THE SESSION IT DESCRIBES once it
//      stages — content-addressed by RECORD BYTES (the re-simulated
//      records prefix-match the staged session's; the replay pass itself
//      never archives per the ARCHIVE-PHASE-A law, so the consumer is
//      the author's PERSISTED original session after the in-memory
//      camLatch died with the page): the decoded plan byte-equals the
//      author's integer model, the strip paints it (blocks + fade seam
//      glyph), cameraAt drives the RENDERED pose across the mid-segment
//      cut, the fade alpha rides the author's window, state().cams
//      derives the boundary view, and DVR user state WINS on reopen (an
//      edit latches over the decoded plan).
//  19. GH-314 IMMERSIVE CONSOLE (own browsers; the owner-approved A+C+D-lite
//      contract; renumbered from 18 at the feat-302 rebase — GH-302's cp
//      arm took 18 first): the 3-state overlay machine (hidden /
//      shown-transient / pinned) with the RENDERER SIZE asserted
//      byte-constant across every
//      state (the whole point of C: the video never resizes). 19a opens
//      PINNED (paused pin) with the strip resting as the D-lite sliver;
//      19b sliver↔expanded is VISUAL-ONLY — every block/seam hit rect
//      byte-identical between the two states (the gesture-byte-identity
//      law's geometric half; the behavioral half is arms 2/11/16 re-running
//      green unchanged); 19c play → shown → the ~3 s RENDER-CLOCK timer
//      hides (shelf opacity 0 / visibility hidden, hit-tests fall through
//      to the bed, renderer fingerprint unchanged); 19d a REAL bed tap
//      reveals WITHOUT toggling play — dispatched AT THE PLAY BUTTON's own
//      coordinates, the exact hazard the click-eater exists for — and a
//      second MOUSE bed tap is a NO-OP (the owner amendment retired the
//      mouse dismiss-click: motion would re-reveal it instantly; touch
//      keeps the shipped tap-dismiss — 19h; build 15 did NOTHING on a
//      playback bed tap, so no play/pause toggle is grandfathered);
//      19e EVERY pin condition holds the overlay and releases into the
//      re-armed transient (paused / scrub drag / trim drag / strip
//      expanded — which pins THROUGH play and blocks the timer — / picker
//      open / capture latch / save card); 19f the z-order law during a
//      GH-301 fade (fade first child under the scrim under the controls,
//      alpha ~1 while the shelf stays opacity 1 and hit-testable); 19g the
//      degrade red-proof — the hide mechanism is 100% [data-ui]-CSS-keyed
//      (zero inline style/hidden writes on the chrome, so a stale cached
//      sheet paints the build-15 static console) and a stale-module
//      simulation (attribute removed) restores the full console; 19h the
//      phone register (852x393 coarse + landscape-iPhone safe-area
//      insets): §3.11 top/shelf inset geometry, the toggle's kit 44pt
//      coarse floor, touch-tap reveal/dismiss (byte-kept under the owner
//      amendment), a touch drag never hover-reveals + mouseSeen stays
//      unlatched (the leave path structurally unarmed), renderer
//      constant; 19i the OWNER AMENDMENT (2026-08-02, QuickTime desktop
//      semantics): a REAL mouse move reveals, the idle timer still hides
//      a resting pointer, hide-on-leave lands one 0.3 s render-clock
//      grace after documentElement mouseleave — RED-PROOFED against a
//      no-leave control over the same 0.6 s window — re-entry cancels
//      the grace, a pin outranks the leave, and a pin released with the
//      pointer out shows the re-armed transient then grace-hides.
//  21. GH-334: Escape closes the player — layered (REAL key input): an open
//      transition picker takes the Escape (strip onDocKey, player stays), an
//      open save card takes it (dialog.js, player stays), a lingering strip
//      SELECTION is its own layer (review r1 — cleared, player stays; drags
//      and held console/bed pointers keep Escape inert via trackDrag/
//      holdIds/bedIds, review r2), a BARE
//      Escape runs the existing back-pill close path (closePlayer →
//      restoreLive, list reopened), and a further Escape closes the list.
//  22. GH-330: grammar-refused CAM pill / slot taps SPEAK — the capture
//      latch disables every pill (kit :disabled + localized title; the
//      statically-knowable no-op) and re-arms on exit; contextual
//      playhead-insert refusals paint the strip's transient hint with the
//      reason (inside-dynamic-span / cut cap) over a byte-untouched model;
//      a dynamic pill mid-shot stays an ASSIGN (whole-segment law), and an
//      expired note under a standing selection restores the editing copy.
//  23. GH-361 (own browser, phone register): the director strip's
//      AUTO-expansion latch releases on resume — a paused CAM-tile tap's
//      implicit expansion rests to the D-lite sliver when play resumes,
//      while the user's own toggle expansion stays sticky and pins
//      through play (see the arm banner for the journey map).
//  25. GH-313 B1 (own browser): stale-locale budget-copy honesty — a fresh
//      playback.js + fresh en.json over a STALE es.json (the *Dur key
//      family stripped, the GH-304 versioned-copy seam) paints the chip
//      through the RETAINED LEGACY es {sec} template, never the fresh
//      ENGLISH *Dur copy the en fallback would leak, and the missing-key
//      detector stays CLEAN (i18n.hasLocal asks the ACTIVE dictionary;
//      red pre-fix: has() consulted the fallback and t() warned per key).
//  26. GH-313 B2 (own browser): a transcode-probe settle NEVER repaints the
//      SETUP estimate lines over a DONE card — the probe is HELD (stubbed
//      VideoDecoder.isConfigSupported) through a fake renderDrill DONE
//      (webm forced via an avc-encode stub), then settles ok:false, which
//      flips the derivable budget photos-wall→wire-wall (2 s→4 s on the
//      64 MB/s fixture): the delivered card's copy must stand
//      byte-unchanged, a LATER locale-switch repaint must still describe
//      the delivered file (the press-time snapshot is the delivered
//      state's budget truth — review r2), and a REOPENED card derives the
//      settled 4 s (the latch never wedges the flow).
//  27. GH-364 (own browser): the strike-point teaching overlay — the save
//      card's Advanced toggle (default OFF, structural offer), plan
//      stability on a REAL on→off round trip (arm-3h law), the ACTIVE
//      locale's caption in the plan (zh-CN switch), the LIVE preview
//      layer's alpha law at leaf-derived scrub points (pre-impact 1 /
//      mid-linger (0,1) / post-linger 0 — the 11h-style identity: one
//      strikeglyph.js derivation for preview and export), paint confined
//      to plateRect, disarm clears, and the full-mode plan carrying
//      opts.strike verbatim. Engine half: e2e-export S1-S4.
//  LD. GH-363 pre-strike lead-in (own browser) — the leads-ON world. The
//      LEGACY families above run with the lead option pinned OFF at
//      waitReady (the documented product toggle; they gate the pre-363
//      beat/tail grammar). LD-a the lead-inclusive schedule + fusion
//      T_add = max(0, T_pre − (T_beat − BEAT_HOLD)) with the NOT-STACKING
//      red-proof; LD-b plan opts.leads emission + the option-off
//      byte-stability law (no key, timeline shrinks by exactly Σleads,
//      re-enable byte-identical); LD-c live/export WYSIWYG cue-pose
//      identity across a REAL fused walk + lead head window (record-clock
//      convergence on contact; option-off control proves the fused arm's
//      teeth); LD-d montage degrade ladder red/green against the
//      replicated first-fit sweep + the amber lead notice; LD-e reopen
//      determinism (the jittered schedule is a pure function of the
//      records — kernel replay law); LD-f GH-433 lead-only/zero-content
//      trim windows — a window inside lead 0 ASSOCIATES to shot 0 (one
//      full slice, lead kept, CTA armed; RED pre-433: empty plan, silent
//      disarm) and a beat-interior window paints the localized
//      playback.trimNoContent refusal beside the disabled CTA.
//  RF. GH-452 reset-boundary fade (own browser) — a REAL snooker
//      foul-and-a-miss REPLACE session (GH-382 choice 3: bit-exact
//      address restore). RF-a the plan carries the derived boundary fade
//      ({ i, t: 0, dur: RESET_FADE_SEC, b: 1 } — the EXISTING GH-301
//      dip-to-black element, boundary-anchored; RED pre-452: no fades key,
//      the replaced balls teleport in one frame on the unchanged broadcast
//      camera); RF-b the live dip mirror (evalAlpha: exactly black at the
//      boundary instant, C2 shoulders both sides, clear away from it);
//      RF-c the capability gate (resetFadeCapable false → no key + no dip
//      on BOTH surfaces — the GH-363 consistent-degrade shape — and
//      byte-identical restore); RF-d a POV→POV walk covers the boundary
//      (GH-299 state handoff) — no fade emitted, no dip under the beat.
//  FF. GH-435 crash-resume determinism-class contract (own browser) — the
//      ffEligible truth table on the ONE predicate resumeRunInner
//      consults (seam-exposed; RED pre-435: no seam, and with-sound mp4
//      plans restarted): mp4 sound-off → fast-forward; mp4 sound-on →
//      fast-forward IFF __export.fullAudioExact (the windowed-EXACT bed
//      capability, true on a fresh module chain); webm → restart either
//      way; no/garbage plan → restart; capability masked false (the
//      stale-pairing degrade, RF-c's mutation idiom) flips ONLY the
//      sound-on row — sound-off never depends on the audio chain; and the
//      gate-time prefer-software probe seam (the class's video leg, review
//      r1 P1) answers true at the CR-class dims. The wire-level halves
//      live in e2e-export CR1/CR5/CR5b/CR6.
//  SELK. GH-668 S5 kit review r3 P2 (own browser) — the save-card's kit
//      selects leave WITH the card: five open/close cycles return the
//      select.js clamp-observer census (scripted-boot seam
//      __obSelect.clampCensus) to its pre-cycle baseline with zero
//      detached-button observers and no `.ob-select` beyond the baseline
//      in the document (RED on the pre-fix bytes + the seam alone: the
//      count grows by the card's select count every cycle).
//   All arms: zero console errors / app errors.
//
//   node web/tools/e2e-playback.mjs [--port 8311]   (needs Chrome + node ≥22)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { drag, setPhoneMetrics, setSafeAreaInsets, tap } from './touch-cdp.mjs';
// arm 6d computes its expectations from the SHIPPED icon module (a leaf with
// zero imports and no DOM at module scope, so it loads in node): the inlined
// pill glyphs must render markup byte-identical to iconHtml()'s.
import { iconHtml } from '../app/ui/icons.js';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8311);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 26060);
// GH-410: this suite's DECLARED PORT INVENTORY — run-gate.mjs reads it as
// TEXT (cdp.mjs parsePortInventory; a suite is never import()ed to ask,
// importing one runs it) and sizes the lane's GH-338 band claim with it.
// One http origin (PORT); sessions boot on CDP+0..CDP+26 (the #305
// full-export growth, the GH-404 3t2 warm-open pair, the GH-534 EQID and
// the GH-668 SELK sessions), so a default
// 30-wide band — cdp(0) = start+15 — cannot host this suite: the wrapper
// claims a widened band instead of letting CDP+15..+24 silently escape
// into a neighboring lane's turf.
// KEEP IN SYNC when adding sessions: the e2e-harness-hygiene inventory
// audit red-flags any `CDP + i` derivation this declaration undercounts
// (it caught exactly this line drifting when the 3t2 arm landed mid-lane).
export const PORT_INVENTORY = { http: 1, cdp: 27 };
export const PORT_FLAGS = { '--port': 'http' };
const fail = (msg) => { console.error('E2E-PLAYBACK FAIL:', msg); process.exitCode = 1; };
const check = (tag, ok, detail = '') => {
  if (ok) console.log(`ok: ${tag}`);
  else fail(`${tag}${detail ? ` — ${detail}` : ''}`);
};
// GH-864 class (a): the live schedule ends segment i at
// E_i = max(durs + tails, completion ?? durs) (playback.js pb.segEndSec(i, tails[i])),
// read from state(); the same operands in the same order, so it is bit-exact.
const segEnd = (st, i) => Math.max(st.durs[i] + (st.tails?.[i] ?? 0), st.completions?.[i] ?? st.durs[i]);

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

function watch(chrome, consoleErrors) {
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      consoleErrors.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      consoleErrors.push(params.entry.text);
    }
  });
}
// GH-313 (GH-329 residual C4): the READY window default is LOAD-AWARE —
// 600 tries (2 min) when the box is provably busy at suite start (1-min
// loadavg / cores >= 1.5; the GH-329 arm-6 flake reproduced on pristine main
// at load 55-85), the pre-313 200 otherwise. The env override still wins
// unconditionally.
const LOAD_NORM = os.loadavg()[0] / Math.max(1, os.cpus().length);
const READY_TRIES = Number(process.env.OB_E2E_READY_TRIES
  ?? (LOAD_NORM >= 1.5 ? 600 : 200));
if (!process.env.OB_E2E_READY_TRIES && LOAD_NORM >= 1.5) {
  console.log(`note: loaded box at suite start (1-min loadavg/cores `
    + `${LOAD_NORM.toFixed(2)} >= 1.5) — READY_TRIES defaults to 600 (GH-313)`);
}
async function waitReady(chrome, what = 'app') {
  for (let i = 0; i < READY_TRIES; i++) {
    await sleep(200);
    if (await chrome.eval('window.__test?.ready === true').catch(() => false)) {
      // GH-363 SUITE PIN: the legacy families below gate the PRE-LEAD
      // beat/tail grammar (schedule arithmetic, cut-frame indexes, plan
      // byte-stability) — they run with the pre-strike lead-in option OFF
      // (the documented product toggle, not a harness backdoor; the
      // cuepostlive setEnabled precedent). The LD family re-enables the
      // shipped DEFAULT (ON) and owns the leads-on world: fusion
      // arithmetic, degrade ladder, WYSIWYG identity, option-off
      // byte-stability. playback.js loads via a guarded DYNAMIC import, so
      // the seam can land after __test.ready — bounded wait, then pin
      // (setLeadIn returns the new state: false = pinned). A stale/broken
      // playback module (arm 6) never pins — the loop times out and the
      // arm's own degrade assertions run as before.
      for (let p = 0; p < 25; p++) {
        const pinned = await chrome.eval(
          `typeof window.__playback?.setLeadIn === 'function'
            ? window.__playback.setLeadIn(false) === false : false`)
          .catch(() => false);
        if (pinned) break;
        await sleep(200);
      }
      return;
    }
  }
  throw new Error(`${what} never became ready`);
}
/** GH-313 (GH-329 residual C4): scripted re-navigation with ONE retry for
 * the interception arms — under heavy box load the SECONDARY boot behind a
 * Fetch-interception stub can die before ready (measured 2-of-3 at load
 * 55-85, reproduced on byte-identical main, so load/infra, not tree). The
 * retry re-issues the SAME Page.navigate; the arm's interception handler is
 * already armed, so the stub serves the retry identically. */
async function navReady(chrome, url, what) {
  await chrome.send('Page.navigate', { url });
  try { await waitReady(chrome, what); } catch (e) {
    console.log(`note: ${what} — first boot never became ready under `
      + `interception; re-navigating once (GH-313 C4): ${e.message}`);
    await chrome.send('Page.navigate', { url });
    await waitReady(chrome, `${what} (retry)`);
  }
}
async function waitFor(chrome, expr, what, tries = 100, ms = 200) {
  for (let i = 0; i < tries; i++) {
    if (await chrome.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  fail(`${what} never came true (${expr})`);
  return false;
}
async function fire(chrome, tag, shot) {
  // aiming-state retry (the #197 law, verbatim from e2e-export.mjs:530 /
  // e2e-record.mjs:823): under load the PREVIOUS shot's settle path can still
  // be finishing when this fire() lands, and __test.shoot then answers 'not in
  // an aiming state' — a load-dependent false red, not a defect (GH-248).
  let err = null;
  for (let i = 0; i < 20; i++) {
    err = await chrome.eval(`__test.shoot(${JSON.stringify(shot)})`);
    if (!err || !/aiming state/.test(String(err))) break;
    await sleep(500);
  }
  if (err) { fail(`${tag}: shot rejected: ${err}`); return 'REJECTED'; }
  let state = 'PLAYBACK';
  for (let i = 0; i < 200 && (state === 'PLAYBACK' || state === 'SIMULATING'); i++) {
    await sleep(300);
    state = await chrome.eval('__test.state()');
  }
  if (state === 'PLAYBACK') fail(`${tag}: shot never settled`);
  return state;
}

// ---- REAL-INPUT primitives (arm 7): hit-tested CDP input ---------------------
// Coordinates come from getBoundingClientRect (eval), but the DISPATCH goes
// through Chrome's real input pipeline — z-order, pointer-events and the
// backdrop ladder all apply, exactly what eval element.click() bypasses.
async function centerOf(chrome, sel) {
  return chrome.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
}
async function realClick(chrome, sel, tag) {
  const c = await centerOf(chrome, sel);
  if (!c) { fail(`${tag}: no visible ${sel} to real-click`); return false; }
  await chrome.send('Input.dispatchMouseEvent',
    { type: 'mouseMoved', x: c.x, y: c.y, buttons: 0 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
    x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
    x: c.x, y: c.y, button: 'left', buttons: 0, clickCount: 1 });
  return true;
}
/** REAL Enter key to the focused element (the e9acbf79 keyboard arm). */
async function realEnter(chrome) {
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown',
    key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r',
    windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp',
    key: 'Enter', code: 'Enter',
    windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
}
/** CONFIRM-FIRST save flow (owner defect A): the card opens in SETUP and
 * renders NOTHING until the Export CTA is pressed. Every arm that used to
 * rely on `__playback.save()` starting a render now presses the button —
 * deliberately through a DOM click on `.ob-pb-go` (and a hit-tested real
 * click in arm 7e), never a seam shortcut, so the button stays reachable. */
/** The Export CTA is disabled while the encoder-capability probe is in
 * flight (playback.js `probingEncoder`, review round 3 P2) — the FIRST card
 * open in a session pays for detectExportSupport(). A user cannot tap a
 * disabled button either, so every driver waits for it exactly like one. */
async function ctaArmed(chrome, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await chrome.eval(`(() => { const b =
      document.querySelector('#ob-pb-card .ob-pb-go');
      return !!b && b.disabled === false; })()`).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}
/** cardOpen() flips the instant closeCard() runs, but the node survives the
 * kit exit tween — a `#ob-pb-card` query fired on the flag resolves to the
 * FADING card, not the fresh one. Wait for the DOM to drain instead. */
async function cardNodeGone(chrome, tag = 'card') {
  return waitFor(chrome, 'document.querySelectorAll("#ob-pb-card").length === 0',
    `${tag}: card node gone`);
}
async function confirmClip(chrome, tag) {
  await ctaArmed(chrome);
  const ok = await chrome.eval(`(() => {
    const b = document.querySelector('#ob-pb-card .ob-pb-go');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  })()`);
  if (!ok) fail(`${tag}: Export CTA missing or disabled in the setup state`);
  return ok;
}
/** Per-tile destination feedback (GH-255 arms 4j-4m / 7e): the state classes,
 * the aria/sub-label voice AND the painted MATERIAL of every `.ob-pb-dest`.
 *
 * The material is judged the J3 way (e2e-ui toolbar family): computed
 * bg/border/ink strings compared against PROBE elements painted from the very
 * tokens each register is supposed to consume, so the arms never parse a token
 * value or hardcode an oklch string — a rest tile that wears the accent, or a
 * "done" tile indistinguishable from "working", fails on pixels-worth of
 * computed style rather than on a class name. `reg: 'other'` means the tile
 * matched no known register (a hardcoded colour would land there). */
async function destTiles(chrome) {
  return chrome.eval(`(() => {
    const mk = (bg, bd, ink) => {
      const d = document.createElement('div');
      d.style.position = 'fixed'; d.style.left = '-9999px'; d.style.top = '0';
      d.style.background = bg; d.style.border = '1px solid ' + bd;
      d.style.color = ink;
      document.body.appendChild(d);
      const cs = getComputedStyle(d);
      const v = [cs.backgroundColor, cs.borderTopColor, cs.color].join('|');
      d.remove();
      return v;
    };
    const REG = {
      rest: mk('var(--ob-bg-2)', 'var(--ob-line-1)', 'var(--ob-text-0)'),
      working: mk('var(--ob-accent-dim)', 'var(--ob-accent-line)',
        'var(--ob-accent-text)'),
      done: mk('var(--ob-accent-dim)', 'var(--ob-accent)',
        'var(--ob-accent-text)'),
      failed: mk('var(--ob-danger-dim)', 'var(--ob-danger)',
        'var(--ob-danger-text)'),
    };
    // GH-245 wave B: the tiles now carry the kit '.ob-btn .ob-btn--tile' in
    // front of their structure class. The probe reports the STRUCTURE class
    // (first) and the GH-255 STATE classes (state); kit classes are
    // transparent to every assertion downstream — they are voice plumbing,
    // not attempt state.
    const kitCls = (c) => c === 'ob-btn' || c.indexOf('ob-btn--') === 0;
    return [...document.querySelectorAll('.ob-pb-dest')].map((b) => {
      const cs = getComputedStyle(b);
      const s = b.querySelector('small');
      const mat = [cs.backgroundColor, cs.borderTopColor, cs.color].join('|');
      return { dest: b.dataset.dest,
        first: [...b.classList].find((c) => !kitCls(c)) ?? '',
        state: [...b.classList]
          .filter((c) => c !== 'ob-pb-dest' && !kitCls(c)).join(','),
        busy: b.getAttribute('aria-busy'), disabled: b.disabled,
        sub: s?.textContent ?? '', subKey: s?.dataset.i18n ?? '',
        opacity: cs.opacity, shadow: cs.boxShadow, mat,
        reg: Object.keys(REG).find((k) => REG[k] === mat) ?? 'other' };
    });
  })()`);
}
/** Park the pointer far off the tiles and let --ob-t-fast finish, so no tile
 * is measured mid-hover-transition (the J3 settle recipe). */
async function parkPointer(chrome) {
  await chrome.send('Input.dispatchMouseEvent',
    { type: 'mouseMoved', x: 4, y: 4, buttons: 0 });
  await sleep(400);
}
/** elementFromPoint z-ladder probe: the hit at sel's center must land INSIDE
 * sel — a backdrop above the surface is the QA-wave P1 class. */
async function hitInside(chrome, sel) {
  return chrome.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return { ok: false, hit: 'missing surface' };
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { ok: !!hit && el.contains(hit),
      hit: hit ? (hit.id || hit.getAttribute('class') || hit.tagName) : 'none' };
  })()`);
}

// =============================================================================
// ---- arm DVR-A11Y (GH-717 / GH-718 / GH-720): the DVR player's keyboard
// focus law — REAL-USER boot (tool:false), desktop 1280x800, real CDP keys
// and hit-tested clicks (the verifier's dvr-focus-body / keyboard-dvr-seek /
// save-card-focus-name drivers, turned into suite legs).
//   717: entry lands focus INSIDE #ob-pb-player on every launch path (place
//        Open, band row, toolbar list row, mouse, reduced motion) and every
//        exit (Escape, Back pill, Back to recordings → Escape) lands on a
//        REAL successor — the invoker when visible, else the table primary
//        — never <body>; the next Tab is never a dead press.
//   718: the scrub track is a role=slider Tab stop: ←/→ ±1 s, Shift ±5 s,
//        PageUp/Down ±10 s, Home/End; keys are consumed ONLY on the slider;
//        the Help sheet's Keyboard section lists them (7 locales).
//   720: Enter on Save moves focus into the card (title anchor), the card
//        carries an accessible name, Escape returns focus to Save — and
//        (review r6) the KIT-LESS card (ui/dialog.js held) keeps the same
//        law: focus in, its own Escape, focus back to Save / Play.
// This block sits FIRST so `--only dvr-a11y` (stop after this block) is the
// red/green proof harness; CI runs the whole suite as before.
{
  const ONLY = argOf('--only');
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?archive=1`,
    { port: CDP, width: 1280, height: 800, tool: false });
  watch(chrome, errs);
  const VKEYS = { Tab: 9, Enter: 13, Escape: 27, Home: 36, End: 35,
    PageUp: 33, PageDown: 34, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39,
    ArrowDown: 40, ' ': 32, '?': 191 };
  const key = async (k, mods = 0) => {
    const code = k === ' ' ? 'Space' : (k === '?' ? 'Slash' : k);
    const text = k === 'Enter' ? '\r' : (k.length === 1 ? k : undefined);
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code,
      windowsVirtualKeyCode: VKEYS[k], nativeVirtualKeyCode: VKEYS[k],
      modifiers: mods, text, unmodifiedText: text });
    await sleep(20);
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code,
      windowsVirtualKeyCode: VKEYS[k], nativeVirtualKeyCode: VKEYS[k], modifiers: mods });
    await sleep(60);
  };
  const ACTIVE = `(() => { const a = document.activeElement; if (!a) return null;
    return { tag: a.tagName, id: a.id || null, ob: a.dataset?.ob ?? null,
      dp: a.dataset?.place ?? null, cls: String(a.className || '').slice(0, 80),
      aria: a.getAttribute('aria-label'), role: a.getAttribute('role'),
      text: (a.textContent || '').trim().slice(0, 40), body: a === document.body,
      inPlayer: !!a.closest('#ob-pb-player'), inPanel: !!a.closest('#ob-pb-panel'),
      inCard: !!a.closest('#ob-pb-card'), inHud: !!a.closest('#hud'),
      canvas: a.tagName === 'CANVAS', tabIndex: a.tabIndex,
      vis: getComputedStyle(a).visibility }; })()`;
  const active = () => chrome.eval(ACTIVE).catch(() => null);
  const name = (a) => (!a ? 'null' : a.body ? 'BODY'
    : `${a.tag}#${a.id || ''}[${a.ob || a.dp || a.role || ''}]{${a.aria || a.text}}`);
  const tabUntil = async (pred, max = 40) => {
    const stops = [];
    for (let i = 0; i < max; i++) {
      await key('Tab');
      const a = await active();
      stops.push(name(a));
      if (a && pred(a)) return { n: i + 1, hit: a, stops };
    }
    return { n: max, hit: null, stops };
  };
  const successor = (a) => !!a && !a.body && (a.id === 'shoot' || a.inHud
    || a.canvas || a.id === 'ob-playback' || a.id === 'ob-shell-open');
  const shellOpen = () => chrome.eval('window.__shell?.isOpen?.() === true');
  const waitStill = () => waitFor(chrome,
    'window.__shell?.moving?.() === false', 'shell still', 80, 100);
  const playerUp = () => chrome.eval('!!document.getElementById("ob-pb-player")');
  /** Wait for the player to mount, then give the entry focus <= 300 ms. */
  const waitPlayerFocus = async (tag) => {
    const up = await waitFor(chrome, '!!document.getElementById("ob-pb-player")',
      `${tag}: player mounts`, 60, 100);
    if (!up) return null;
    let a = null;
    for (let i = 0; i < 6; i++) { a = await active(); if (a?.inPlayer) break; await sleep(50); }
    check(`${tag}: focus lands INSIDE the player within 300 ms of the mount `
      + '(RED pre-fix: BODY)', !!a?.inPlayer && a.tabIndex >= -1
      && (a.tag === 'BUTTON' || a.tabIndex >= 0), name(a));
    return a;
  };
  const goReplays = async () => {
    if (!(await shellOpen())) {
      const t = await tabUntil((a) => a.id === 'ob-shell-open', 30);
      if (!t.hit) { fail('DVR-A11Y: hall toggle #ob-shell-open unreachable by Tab'); return; }
      await key('Enter');
      await waitFor(chrome, 'window.__shell?.isOpen?.() === true && __shell.moving() === false',
        'hall lands', 80, 150);
      await sleep(400);
    }
    if ((await chrome.eval('window.__shell?.place?.()')) !== 'replays') {
      const t = await tabUntil((a) => a.dp !== null, 30);
      if (!t.hit) { fail('DVR-A11Y: rail unreachable by Tab'); return; }
      for (let i = 0; i < 6; i++) {
        const a = await active();
        if (a?.dp === 'replays') break;
        await key('ArrowRight'); await sleep(250);
      }
      await waitFor(chrome, 'window.__shell?.moving?.() === false', 'rail still', 80, 100);
      await sleep(500);
    }
  };
  const openLatestByKey = async (tag) => {
    const t = await tabUntil((a) => a.ob === 'replays-open-latest', 40);
    check(`${tag}: "Open latest session" reachable by Tab`, !!t.hit, t.stops.join(' > '));
    await key('Enter');
    return waitPlayerFocus(tag);
  };
  const exitCheck = async (tag, a) => {
    check(`${tag}: exit lands on a REAL successor, never BODY (RED pre-fix: BODY)`,
      successor(a), name(a));
    await key('Tab');
    const t1 = await active();
    check(`${tag}: the next Tab is not a dead press`, !!t1 && !t1.body, name(t1));
  };
  const playerGone = (tag) => waitFor(chrome,
    '!document.getElementById("ob-pb-player") && !document.documentElement.classList.contains("ob-pb-live")',
    `${tag}: player closes`, 60, 100);
  const st = () => chrome.eval('JSON.parse(JSON.stringify({ t: window.__playback.state()?.t, '
    + 'total: window.__playback.state()?.total, left: document.querySelector(".ob-pb-playhead")?.style.left, '
    + 'read: document.querySelector(".ob-pb-tcur")?.textContent, '
    + 'now: document.querySelector(".ob-pb-track")?.getAttribute("aria-valuenow"), '
    + 'vt: document.querySelector(".ob-pb-track")?.getAttribute("aria-valuetext") }))');
  const near = (x, y, eps = 0.15) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= eps;
  try {
    await waitReady(chrome, 'DVR-A11Y real-user boot');
    await waitFor(chrome, 'typeof window.__playback?.openSession === "function"', 'DVR seam');
    // a fresh profile boots into the hall: leave through quick play (a real click)
    if (await shellOpen()) {
      await realClick(chrome, '#ob-shell-quickplay', 'DVR-A11Y quick play');
      await waitStill(); await sleep(800);
    }
    // seed: two settled shots (the declared seam), flushed to the archive
    for (const phi of [0.02, 0.9]) {
      await fire(chrome, 'DVR-A11Y seed', { phi, theta: 0, a: 0, b: 0, v0: 1.7 });
      await sleep(400);
    }
    await chrome.eval('window.__archive?.flush?.()').catch(() => null);
    await sleep(600);

    // ---- leg A (entry): place "Open latest session" by Enter -------------
    await goReplays();
    const aIn = await openLatestByKey('717-A');
    check('717-A: html.ob-pb-live is up (the HUD stand-down that used to drop focus)',
      await chrome.eval('document.documentElement.classList.contains("ob-pb-live")'));
    check('717-A: entry focus is a focusable transport control (Play first)',
      !!aIn && aIn.tag === 'BUTTON' && /ob-pb-play/.test(aIn.cls), name(aIn));

    // ---- 718: the scrub track is a keyboard slider -------------------------
    const ts = await tabUntil((a) => a.inPlayer && a.role === 'slider', 12);
    check('718: a role=slider Tab stop exists inside the player (RED pre-fix: '
      + 'the track is a bare div, no slider anywhere)', !!ts.hit, ts.stops.join(' > '));
    const attrs = await chrome.eval(`(() => { const s = document.querySelector('#ob-pb-player [role=slider]');
      if (!s) return null; return { cls: s.className, tab: s.tabIndex, label: s.getAttribute('aria-label'),
        min: s.getAttribute('aria-valuemin'), max: s.getAttribute('aria-valuemax'),
        now: s.getAttribute('aria-valuenow'), vt: s.getAttribute('aria-valuetext'),
        total: window.__playback.state()?.total }; })()`);
    check('718: the slider IS the shipped track (.ob-pb-track, tabindex 0, labelled, '
      + 'valuemin 0 / valuemax = clip length / valuenow 0 / valuetext 0:00.0)',
    !!attrs && /ob-pb-track/.test(attrs.cls) && attrs.tab === 0 && !!attrs.label
        && attrs.min === '0' && near(Number(attrs.max), attrs.total, 0.06)
        && Number(attrs.now) === 0 && attrs.vt === '0:00.0', JSON.stringify(attrs));
    const total = attrs?.total ?? 0;
    const s0 = await st();
    await key('ArrowRight'); await key('ArrowRight');
    const s1 = await st();
    check('718: ArrowRight x2 seeks +2 s — state.t, the readout, the thumb and the '
      + 'aria value all follow (RED pre-fix: stays 0:00.0)',
    near(s1.t, Math.min((s0.t ?? 0) + 2, total)) && s1.read === '0:02.0'
        && parseFloat(s1.left) > 0 && near(Number(s1.now), 2) && s1.vt === '0:02.0',
    JSON.stringify(s1));
    await key('ArrowRight', 8); // Shift
    const s2 = await st();
    check('718: Shift+ArrowRight seeks +5 s', near(s2.t, Math.min(s1.t + 5, total)), JSON.stringify(s2));
    await key('PageDown');
    const s3 = await st();
    check('718: PageDown seeks -10 s (clamped at 0)', near(s3.t, Math.max(s2.t - 10, 0)), JSON.stringify(s3));
    await key('PageUp');
    const s4 = await st();
    check('718: PageUp seeks +10 s (clamped at the clip end)',
      near(s4.t, Math.min(s3.t + 10, total)), JSON.stringify(s4));
    await key('End');
    const s5 = await st();
    check('718: End seeks to the clip end (thumb at 100 %)',
      near(s5.t, total) && near(parseFloat(s5.left), 100, 0.6), JSON.stringify(s5));
    // ---- 718 review r1 P2: the slider RANGE follows the schedule ---------
    // refreshSchedule() re-lengthens the clip (a lead-in / camera-walk
    // toggle changes pb.total); the keyboard and the playhead already use
    // the new total — AT must read the same range (replays.md:449): valuemax
    // == total after every toggle and valuenow <= valuemax with the playhead
    // parked at the OLD end. RED pre-fix: valuemax stayed the build-time
    // total (valuenow > valuemax after the shrink).
    const rangeOf = () => chrome.eval(`(() => { const s = document.querySelector('#ob-pb-player [role=slider]');
      return { max: Number(s.getAttribute('aria-valuemax')), now: Number(s.getAttribute('aria-valuenow')),
        vt: s.getAttribute('aria-valuetext'), total: window.__playback.state()?.total,
        read: document.querySelector('#ob-pb-player .ob-pb-tcur')?.textContent ?? null,
        t: window.__playback.state()?.t, lead: window.__playback.leadIn() }; })()`);
    const r0 = await rangeOf();
    const leadFlip = await chrome.eval(`window.__playback.setLeadIn(${r0.lead ? 'false' : 'true'})`);
    await sleep(250);
    const r1 = await rangeOf();
    check('718 r1: the lead-in toggle changes the schedule total (the fixture: '
      + 'a total-changing refreshSchedule)', leadFlip === !r0.lead && !near(r1.total, r0.total, 0.05),
    JSON.stringify({ r0, r1 }));
    check('718 r1: aria-valuemax republished == the NEW total after refreshSchedule '
      + '(RED pre-fix: the build-time total)', near(r1.max, r1.total, 0.06), JSON.stringify(r1));
    check('718 r1: aria-valuenow <= aria-valuemax and follows the remapped playhead',
      r1.now <= r1.max + 1e-9 && near(r1.now, r1.t, 0.06) && r1.vt === r1.read, JSON.stringify(r1));
    await chrome.eval(`window.__playback.setLeadIn(${r0.lead ? 'true' : 'false'})`);
    await sleep(250);
    const r2 = await rangeOf();
    check('718 r1: toggling back restores total and valuemax together',
      near(r2.total, r0.total, 0.05) && near(r2.max, r2.total, 0.06) && r2.now <= r2.max + 1e-9,
    JSON.stringify(r2));
    await key('Home');
    const s6 = await st();
    check('718: Home seeks to 0 (readout 0:00.0, thumb at 0 %)',
      s6.t === 0 && s6.read === '0:00.0' && parseFloat(s6.left) === 0, JSON.stringify(s6));
    await key('ArrowLeft');
    check('718: ArrowLeft at 0 stays at 0 (no negative seek)', (await st()).t === 0);
    // consumption law: the keys belong to the FOCUSED slider only
    await key('Tab', 1); // Shift+Tab: the previous console control (strip toggle / Play)
    const offSlider = await active();
    check('718: Shift+Tab leaves the slider for a neighbouring console control',
      !!offSlider?.inPlayer && offSlider.role !== 'slider', name(offSlider));
    await key('ArrowRight');
    const s7 = await st();
    check('718: ArrowRight OFF the slider does NOT seek — consumed only '
      + 'while the slider holds focus', s7.t === 0, JSON.stringify(s7));
    check('718: the machine stays in PLAYBACK across the key battery (no aim moved)',
      (await chrome.eval('__test.state()')) === 'PLAYBACK');
    // the Help sheet lists the seek keys (7 locales: read from disk; the DOM: en)
    const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh-CN'];
    const SEEK_KEYS = ['seek.k', 'seek.v', 'seekJump.k', 'seekJump.v', 'seekEnds.k', 'seekEnds.v']
      .map((k) => `help.controls.keyboard.${k}`).concat(['playback.seek']);
    const missing = [];
    for (const loc of LOCALES) {
      const d = JSON.parse(readFileSync(path.join(webDir, 'app', 'locales', `${loc}.json`), 'utf8'));
      for (const k of SEEK_KEYS) if (typeof d[k] !== 'string' || !d[k].trim()) missing.push(`${loc}:${k}`);
    }
    check('718: every locale carries the seek Help rows + the slider name (7 x 7 keys)',
      missing.length === 0, missing.join(' '));
    await key('?');
    // GH-718 review r5/r6: the seek rows are GATED rows (tr[data-gated], help.js
    // syncGatedRows) whose cells are t()-composed and NEVER data-i18n-bound —
    // so the DOM is read by STRUCTURE (the visible gated rows and their
    // th/td) and judged against the FRESH dictionary (window.__i18n.t: the
    // page's own en). The stale-dictionary OMIT leg (rows hidden, no
    // literal key, no warn) is e2e-i18n's. RED pre-r6: this leg waited on
    // [data-i18n=…seek.k] cells that the r5 register deliberately never
    // paints — a deterministic timeout.
    const SEEK_ROWS = '[...document.querySelectorAll(\'tr[data-gated^="help.controls.keyboard.seek"]\')]'
      + '.filter((tr) => !tr.hidden && tr.children.length === 2 && tr.getClientRects().length > 0)';
    const helpRows = await waitFor(chrome, `${SEEK_ROWS}.length === 3`,
      '718: Help opens with the three gated seek rows painted', 30, 100);
    const rowTxt = await chrome.eval(`(() => { const rows = ${SEEK_ROWS};
      const out = { n: rows.length, bound: 0, mismatch: [] };
      for (const tr of rows) { const stem = tr.dataset.gated;
        const k = tr.firstElementChild.textContent.trim(), v = tr.lastElementChild.textContent.trim();
        out[stem.slice('help.controls.keyboard.'.length)] = { k, v };
        out.bound += tr.querySelectorAll('[data-i18n]').length;
        if (k !== window.__i18n.t(stem + '.k') || v !== window.__i18n.t(stem + '.v')) out.mismatch.push(stem); }
      return out; })()`);
    check('718: the Help Keyboard section paints the seek rows (arrow / page / home-end) '
      + 'as gated rows whose cells equal the fresh dictionary and carry no data-i18n',
    helpRows && rowTxt.n === 3 && rowTxt.bound === 0 && rowTxt.mismatch.length === 0
        && /←/.test(rowTxt.seek?.k ?? '') && /1 s/.test(rowTxt.seek?.v ?? '')
        && /Page/.test(rowTxt.seekJump?.k ?? '') && /Home/.test(rowTxt.seekEnds?.k ?? ''),
    JSON.stringify(rowTxt));
    await key('Escape');
    await waitFor(chrome, `${SEEK_ROWS}.length === 0`, '718: Help closes (the gated rows leave with it)', 30, 100);
    await sleep(300);

    // ---- 720: Enter on Save moves focus into the NAMED card ---------------
    const tsv = await tabUntil((a) => a.inPlayer && /ob-pb-save/.test(a.cls), 12);
    check('720: the Save button is a Tab stop in the player', !!tsv.hit, tsv.stops.join(' > '));
    await key('Enter');
    const cardUp = await waitFor(chrome, '!!document.getElementById("ob-pb-card")', '720: card opens', 30, 50);
    let inCard = null;
    for (let i = 0; i < 6 && cardUp; i++) { inCard = await active(); if (inCard?.inCard) break; await sleep(50); }
    check('720: focus moves INTO the card within 300 ms of Enter (RED pre-fix: '
      + 'stays on Save behind the backdrop)', !!inCard?.inCard, name(inCard));
    const axName = await chrome.eval(`(() => { const c = document.getElementById('ob-pb-card'); if (!c) return null;
      const by = c.getAttribute('aria-labelledby'); const el = by && document.getElementById(by);
      return { by, role: c.getAttribute('role'), modal: c.getAttribute('aria-modal'),
        name: (el?.textContent ?? c.getAttribute('aria-label') ?? '').trim(),
        title: c.querySelector('h2')?.textContent?.trim() ?? '' }; })()`);
    check('720: the card carries an accessible name = its "Save clip" title '
      + '(aria-labelledby -> the h2; RED pre-fix: no name)',
    !!axName && axName.role === 'dialog' && !!axName.by && axName.name.length > 0
        && axName.name === axName.title, JSON.stringify(axName));
    await key('Escape');
    await cardNodeGone(chrome, '720 card');
    await sleep(150);
    const backOnSave = await active();
    check('720: Escape returns focus to the Save button', /ob-pb-save/.test(backOnSave?.cls ?? ''), name(backOnSave));

    // ---- leg A (exit): Escape from a transport control ---------------------
    const tp = await tabUntil((a) => a.inPlayer && /ob-pb-play/.test(a.cls), 14);
    check('717-A: Play reachable by Tab (Shift-less wrap through the console)', !!tp.hit, tp.stops.join(' > '));
    await key('Escape');
    await playerGone('717-A');
    await sleep(250);
    await exitCheck('717-A Escape', await active());

    // ---- leg B: Back pill by Enter ----------------------------------------
    await goReplays();
    await openLatestByKey('717-B');
    const tb = await tabUntil((a) => a.inPlayer && /ob-pb-pillico/.test(a.cls) && /back/i.test(a.aria ?? ''), 14);
    check('717-B: the Back pill is reachable by Tab', !!tb.hit, tb.stops.join(' > '));
    await key('Enter');
    await playerGone('717-B');
    await sleep(250);
    await exitCheck('717-B Back pill', await active());

    // ---- leg C: the place's band row by Enter ------------------------------
    await goReplays();
    const tr = await tabUntil((a) => /ob-pb-row/.test(a.cls) && !a.inPanel, 40);
    check('717-C: a session row of the Replays place is reachable by Tab', !!tr.hit, tr.stops.join(' > '));
    await key('Enter');
    await waitPlayerFocus('717-C');
    await key('Tab');
    await key('Escape');
    await playerGone('717-C');
    await sleep(250);
    await exitCheck('717-C Escape', await active());

    // ---- leg D: toolbar pill -> list -> row -> Back to recordings -> Escape -
    if (await shellOpen()) {
      const tc = await tabUntil((a) => a.id === 'ob-shell-open', 40);
      check('717-D: the hall toggle is reachable by Tab', !!tc.hit, tc.stops.join(' > '));
      await key('Enter'); await waitStill(); await sleep(800);
    }
    const tpill = await tabUntil((a) => a.id === 'ob-playback', 40);
    check('717-D: the live table\'s Playback pill is reachable by Tab', !!tpill.hit, tpill.stops.join(' > '));
    await key('Enter');
    await waitFor(chrome, '(() => { const p = document.getElementById("ob-pb-panel"); return !!p && p.style.display !== "none"; })()',
      '717-D: list opens', 40, 100);
    await sleep(300);
    const trow = await tabUntil((a) => a.inPanel && /ob-pb-row/.test(a.cls), 16);
    check('717-D: a list row is reachable by Tab', !!trow.hit, trow.stops.join(' > '));
    await key('Enter');
    await waitPlayerFocus('717-D');
    const tb2 = await tabUntil((a) => a.inPlayer && /ob-pb-pillico/.test(a.cls) && /back/i.test(a.aria ?? ''), 14);
    check('717-D: the Back (to recordings) pill is reachable by Tab', !!tb2.hit, tb2.stops.join(' > '));
    await key('Enter');
    await playerGone('717-D');
    await waitFor(chrome, '(() => { const p = document.getElementById("ob-pb-panel"); return !!p && p.style.display !== "none" && p.contains(document.activeElement); })()',
      '717-D: the list reopens and OWNS focus (its title anchor)', 40, 100);
    const onList = await active();
    check('717-D: focus sits inside the reopened list', !!onList?.inPanel, name(onList));
    await key('Escape');
    await waitFor(chrome, '(() => { const p = document.getElementById("ob-pb-panel"); return !p || p.style.display === "none"; })()',
      '717-D: Escape closes the reopened list', 40, 100);
    await sleep(250);
    const afterD = await active();
    check('717-D: Escape on the reopened list returns focus to the Playback pill '
      + '(RED pre-fix: BODY — dialog.js prev was the removed Back pill)',
    afterD?.id === 'ob-playback', name(afterD));
    await key('Tab');
    const tD = await active();
    check('717-D: the next Tab is not a dead press', !!tD && !tD.body, name(tD));

    // ---- leg E: prefers-reduced-motion: reduce ----------------------------
    await chrome.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await sleep(300);
    check('717-E: reduced motion is in force', await chrome.eval('matchMedia("(prefers-reduced-motion: reduce)").matches'));
    await goReplays();
    await openLatestByKey('717-E (reduced motion)');
    await key('Tab');
    await key('Escape');
    await playerGone('717-E');
    await sleep(250);
    await exitCheck('717-E Escape (reduced motion)', await active());
    await chrome.send('Emulation.setEmulatedMedia', { features: [] });

    // ---- leg F: mouse — click Open, click the Back pill --------------------
    await goReplays();
    await realClick(chrome, '[data-ob=replays-open-latest]', '717-F mouse open');
    await waitPlayerFocus('717-F (mouse)');
    await realClick(chrome, '#ob-pb-player .ob-pb-top .ob-pb-pillico', '717-F mouse back');
    await playerGone('717-F');
    await sleep(250);
    const afterF = await active();
    check('717-F: a mouse Back lands on a real successor, never BODY', successor(afterF), name(afterF));

    // ---- 720 review r6: the KIT-LESS card keeps keyboard focus ---------------
    // ui/dialog.js is HELD at the network (Fetch paused, never answered): the
    // guarded import stays PENDING for the page's life — the degradation
    // path the cache-poison contract (the ownership ledger) requires to keep working.
    // The card then opens through playback.js's module fallback (scrim, no
    // .ob-backdrop). RED pre-fix: the fallback focused the title on open but
    // registered no Escape (onBedKey treats the card as a layer — the press
    // was inert, no keyboard exit) and closeCard removed the node without a
    // restore (focus -> BODY). Law: opener if still visible, else the
    // player's first control.
    let held = 0;
    chrome.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (/app\/ui\/dialog\.js/.test(params.request.url)) { held++; return; } // held, never answered
      chrome.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    });
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*dialog.js*' }] });
    await chrome.send('Network.enable');
    await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
    const appErrPre = await chrome.eval('__test.errors.slice()'); // the first page's ledger, before it navigates away
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?archive=1&arm=nodlg` });
    await waitReady(chrome, '720-r6: dialog.js-held boot');
    await waitFor(chrome, 'typeof window.__playback?.openSession === "function"', '720-r6: DVR seam');
    if (await shellOpen()) {
      await realClick(chrome, '#ob-shell-quickplay', '720-r6 quick play');
      await waitStill(); await sleep(800);
    }
    await goReplays();
    await openLatestByKey('720-r6');
    check('720-r6: the ui/dialog.js request is HELD (the guarded import pending)', held > 0, `held=${held}`);
    const tsv6 = await tabUntil((a) => a.inPlayer && /ob-pb-save/.test(a.cls), 12);
    check('720-r6: the Save button is a Tab stop (kit-less player)', !!tsv6.hit, tsv6.stops.join(' > '));
    await key('Enter');
    const up6 = await waitFor(chrome, '!!document.getElementById("ob-pb-card")', '720-r6: card opens', 30, 50);
    const kitless = await chrome.eval('!!document.querySelector(".ob-pb-scrim") && !document.querySelector(".ob-backdrop")');
    check('720-r6: the card opened through the MODULE fallback (scrim, no kit backdrop — '
      + 'so the leg exercises the degradation path, not dialog.js)', up6 && kitless, `kitless=${kitless}`);
    let in6 = null;
    for (let i = 0; i < 6 && up6; i++) { in6 = await active(); if (in6?.inCard) break; await sleep(50); }
    check('720-r6: focus moves INTO the kit-less card (title anchor)', !!in6?.inCard, name(in6));
    await key('Escape');
    const gone6 = await waitFor(chrome, '!document.getElementById("ob-pb-card") && !document.querySelector(".ob-pb-scrim")',
      '720-r6: Escape closes the kit-less card (RED pre-fix: inert — no fallback Escape)', 30, 50);
    check('720-r6: the player stays up (the card claimed the press; onBedKey never saw a dismissal)',
      gone6 && await playerUp());
    await sleep(150);
    const back6 = await active();
    check('720-r6: Escape returns focus to the Save button (RED pre-fix: BODY)',
      /ob-pb-save/.test(back6?.cls ?? ''), name(back6));
    await key('Tab');
    const t6 = await active();
    check('720-r6: the next Tab is not a dead press', !!t6 && !t6.body, name(t6));
    // the law's ELSE branch: the opener is not visible at close (hidden under
    // test while the card is up) -> the player's first control (Play), never BODY
    await key('Tab', 8); // Shift+Tab (CDP modifier 8): back onto Save
    let onSave6 = await active();
    if (!/ob-pb-save/.test(onSave6?.cls ?? '')) { // belt: walk forward to it
      onSave6 = (await tabUntil((a) => a.inPlayer && /ob-pb-save/.test(a.cls), 14)).hit;
    }
    check('720-r6b: Save is reachable again by keyboard', /ob-pb-save/.test(onSave6?.cls ?? ''), name(onSave6));
    await key('Enter');
    const up6b = await waitFor(chrome, '!!document.getElementById("ob-pb-card") && !!document.querySelector(".ob-pb-scrim")',
      '720-r6b: the kit-less card opens again', 30, 50);
    await chrome.eval('(() => { const b = document.querySelector("#ob-pb-player .ob-pb-save"); b.style.visibility = "hidden"; return true; })()');
    await key('Escape');
    const gone6b = await waitFor(chrome, '!document.getElementById("ob-pb-card")', '720-r6b: Escape closes the card', 30, 50);
    await sleep(150);
    const back6b = await active();
    check('720-r6b: with the opener hidden, Escape hands focus to the player\'s first '
      + 'control (Play) — never BODY', up6b && gone6b && !!back6b?.inPlayer && /ob-pb-play/.test(back6b?.cls ?? ''), name(back6b));
    await chrome.eval('(() => { const b = document.querySelector("#ob-pb-player .ob-pb-save"); b.style.visibility = ""; return true; })()');
    await chrome.send('Fetch.disable');
    const appErr6 = await chrome.eval('__test.errors.slice()');
    check('720-r6: zero app errors on the dialog.js-held page', appErr6.length === 0, JSON.stringify(appErr6));

    check('DVR-A11Y: zero app errors (legs A-F, the first page)', appErrPre.length === 0, JSON.stringify(appErrPre));
    check('DVR-A11Y: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
  if (ONLY === 'dvr-a11y') {
    await stopStaticServer(server);
    console.log(process.exitCode ? 'E2E-PLAYBACK FAIL (--only dvr-a11y)' : 'E2E-PLAYBACK PASS (--only dvr-a11y)');
    process.exit(process.exitCode ?? 0);
  }
}

// =============================================================================
// ---- armed boot: arms 0-5 -----------------------------------------------------
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'armed boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '__playback seam');
    check('boot: playback pill installed',
      await chrome.eval('!!document.getElementById("ob-playback")'));

    // GH-225 build-11 owner regression: the pill shipped Phase C in the
    // ACCENT voice (accent-dim fill / accent-line border / accent-hi ink)
    // and read as permanently ACTIVE on device. At REST it must wear the
    // NEUTRAL toolbar-family tokens. Asserted against TOKEN PROBES rather
    // than a sibling's live computed style: a sibling caught mid
    // hover-transition returns an interpolated oklab() and the arm would
    // flake. (e2e-ui's J3 family probe gates family-wide sameness; this arm
    // is the cheap, module-local wall that names the offending pill and the
    // exact tokens it must and must not use.)
    // SETTLE FIRST — measured, not assumed. playback.css is a leaf sheet
    // linked AFTER the button is in the DOM, so the pill's own first paint
    // TRANSITIONS from the UA default to --ob-glass over --ob-t-fast; a
    // sample taken in flight comes back as an interpolated
    // `oklab(0.156991 -0.00963502 …)` instead of the specified
    // `oklch(0.155 0.01 165 / 0.82)` and the string compare below fails on
    // a pill that is in fact correct. (Observed exactly once in a full-wave
    // run — the reviewer's flake class was real and the token probes alone
    // did not close it: they fix the REFERENCE, this fixes the SUBJECT.)
    // Wait for zero running animations on the pill AND a stable
    // backgroundColor across two reads, bounded at ~3 s so a genuinely
    // broken skin still reaches the assertion and fails loudly.
    const settled = await chrome.eval(`(async () => {
      const el = document.getElementById('ob-playback');
      if (!el) return 'no-pill';
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      let last = null;
      for (let i = 0; i < 30; i++) {
        const running = (el.getAnimations?.() ?? []).length;
        const now = getComputedStyle(el).backgroundColor;
        if (!running && now === last) return 'settled@' + i;
        last = now;
        await nap(100);
      }
      return 'timeout';
    })()`);
    check('boot: pill paint settles before the voice probe (anti-flake)',
      settled !== 'no-pill' && settled !== 'timeout', String(settled));
    const voice = await chrome.eval(`(() => {
      const probe = (expr) => {
        const s = document.createElement('span');
        s.style.cssText = 'position:fixed;left:-9999px;'
          + 'background:' + expr + ';border-color:' + expr + ';color:' + expr;
        document.body.appendChild(s);
        const cs = getComputedStyle(s);
        const v = { bg: cs.backgroundColor, bd: cs.borderColor, ink: cs.color };
        s.remove();
        return v;
      };
      const el = document.getElementById('ob-playback');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        got: { bg: cs.backgroundColor, bd: cs.borderColor, ink: cs.color,
          blur: cs.backdropFilter, radius: cs.borderRadius },
        glass: probe('var(--ob-glass)').bg,
        line1: probe('var(--ob-line-1)').bd,
        text0: probe('var(--ob-text-0)').ink,
        accentDim: probe('var(--ob-accent-dim)').bg,
        accentLine: probe('var(--ob-accent-line)').bd,
        accentHi: probe('var(--ob-accent-hi)').ink,
      };
    })()`);
    check('boot: pill wears the NEUTRAL toolbar voice at rest (not accent)',
      !!voice && voice.got.bg === voice.glass && voice.got.bd === voice.line1
      && voice.got.ink === voice.text0 && voice.got.radius === '999px'
      && voice.got.blur !== 'none'
      && voice.got.bg !== voice.accentDim && voice.got.bd !== voice.accentLine
      && voice.got.ink !== voice.accentHi,
      JSON.stringify(voice));

    // ---- arm 0: empty state --------------------------------------------------
    await chrome.eval('document.getElementById("ob-playback").click()');
    await waitFor(chrome, 'window.__playback.isOpen() === true', '0: list open');
    await sleep(400);
    check('0: empty state renders the localized notice',
      await chrome.eval(
        'document.querySelector("#ob-pb-panel .ob-pb-empty")?.textContent.length > 0'));
    check('0: storage footer present',
      await chrome.eval(
        '/MB/.test(document.querySelector(".ob-pb-foot span")?.textContent ?? "")'));
    await chrome.eval('window.__playback.close()');
    await sleep(300);
    check('0: list closes clean',
      await chrome.eval('window.__playback.isOpen()') === false);

    // ---- arm 1: list rendering + markers --------------------------------------
    await fire(chrome, '1: shot A', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '1: shot B', { v0: 1.4, phi: -0.9, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    await chrome.eval('window.__playback.open()');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '1: one session row');
    const row = await chrome.eval(`(() => {
      const r = document.querySelector('.ob-pb-row');
      const det = window.__rules.judgments();
      return {
        title: r.querySelector('.ob-pb-title')?.textContent ?? '',
        // GH-668 B-K08 / R15: the face names the GAME — a money-ball disc
        // or a discipline chip, never an icons.js mode glyph in a well
        face: (() => { const m = r.querySelector('.ob-pb-face');
          return { disc: !!m?.classList.contains('ob-pb-face--disc'),
            chip: !!m?.classList.contains('ob-pb-face--chip'),
            svg: !!m?.querySelector('svg'), text: m?.textContent ?? '',
            well: m ? getComputedStyle(m).borderStyle : null }; })(),
        trash: !!r.querySelector('.ob-pb-del svg[data-icon="trash"]'),
        tracks: getComputedStyle(r).gridTemplateColumns.split(' ').length,
        ellipsis: getComputedStyle(r.querySelector('.ob-pb-title')).textOverflow,
        glyphs: r.querySelectorAll('.ob-pb-marks .ob-pb-pot, .ob-pb-marks .ob-pb-foul').length,
        expected: det.reduce((s, j) => s
          + (j.pocketed?.filter((id) => id !== 0).length ?? 0)
          + (j.legal === false || j.fouls?.length ? 1 : 0), 0),
        meta: r.querySelector('.ob-pb-m')?.textContent ?? '',
        del: !!r.querySelector('.ob-pb-del'),
      };
    })()`);
    check('1: row carries game title + a GAME face (disc xor chip, no svg, '
      + 'no well) + a trash delete; DVR tracks = face · body · del · chev; '
      + 'the title never ellipsizes (B-K07/B-K08)',
      row.title.length > 0 && row.del && row.trash
      && (row.face.disc !== row.face.chip) && !row.face.svg
      && row.face.text.trim().length > 0 && row.face.well === 'none'
      && row.tracks === 4 && row.ellipsis === 'clip', JSON.stringify(row));
    check('1: marker glyph strip mirrors the judgment ledger (pots + fouls)',
      row.glyphs > 0 && row.glyphs >= Math.min(row.expected, 24),
      JSON.stringify(row));
    check('1: time meta renders shots count', /2/.test(row.meta), row.meta);
    // filters partition by mode: this is a play-mode session
    await chrome.eval('window.__playback.setFilter("practice")');
    await sleep(300);
    check('1: practice filter hides the match session',
      await chrome.eval('document.querySelectorAll(".ob-pb-row").length') === 0);
    await chrome.eval('window.__playback.setFilter("match")');
    await sleep(300);
    check('1: match filter shows it again',
      await chrome.eval('document.querySelectorAll(".ob-pb-row").length') === 1);
    await chrome.eval('window.__playback.setFilter("all")');
    await sleep(300);

    // ---- arm 2: scrub seeks the correct shot/time + restore -------------------
    const preState = await chrome.eval('__test.state()');
    const preSessions = await chrome.eval('window.__archive.sessions()');
    await chrome.eval('document.querySelector(".ob-pb-row").click()');
    await waitFor(chrome, 'window.__playback.playerOpen() === true', '2: player open');
    check('2: live-bed chrome stands down (ob-pb-live)',
      await chrome.eval('document.documentElement.classList.contains("ob-pb-live")'));
    check('2: player chrome present (top bar + shelf + track)',
      await chrome.eval('!!document.querySelector("#ob-pb-player .ob-pb-shelf .ob-pb-track")'));
    const st0 = await chrome.eval('window.__playback.state()');
    check('2: timeline spans both shots (segment tick present)',
      st0.total > 0 && await chrome.eval('document.querySelectorAll(".ob-pb-seg").length') === 1,
      JSON.stringify(st0));
    // scrub into shot 1 at 90% — the staged record must be segment 1 and the
    // live clock the segment-local time (the fast renderAt path)
    const s2 = await chrome.eval(`(() => {
      const st = window.__playback.state();
      const T = st.total * 0.9;
      window.__playback.seek(T);
      const after = window.__playback.state();
      return { T, ...after, boundary: T - (after.t - after.clock) };
    })()`);
    check('2: scrub staged the correct shot', s2.shot === 1, JSON.stringify(s2));
    check('2: scrub posed the segment-local clock (T == cum[1] + clock)',
      Math.abs(s2.t - s2.T) < 1e-6 && s2.clock > 0 && s2.clock < s2.t,
      JSON.stringify(s2));
    // scrub BACK into shot 0
    const s3 = await chrome.eval(`(() => {
      window.__playback.seek(0.5);
      return window.__playback.state();
    })()`);
    check('2: backward scrub re-stages segment 0',
      s3.shot === 0 && Math.abs(s3.clock - 0.5) < 1e-6, JSON.stringify(s3));
    check('2: play/pause toggles',
      await chrome.eval(`(async () => {
        document.querySelector('.ob-pb-play').click();
        const on = window.__playback.state().playing;
        await new Promise((r) => setTimeout(r, 400));
        const advanced = window.__playback.state().t > 0.5;
        document.querySelector('.ob-pb-play').click();
        return on && advanced && window.__playback.state().playing === false;
      })()`));
    // ---- arm 2c: the post-strike cue rides the player (design 277 slice 3
    // PR-1, playback.js syncCueArm): a scrubbed segment shows its staged
    // record's cue life (the engine is a pure function of the frame clock),
    // arm changes land only at staging boundaries, and scrub parity is
    // byte-stable WITH the cue in frame.
    {
      await chrome.eval('window.__playback.seek(0.5)');
      const cueSt = await chrome.eval('__test.cuePostState()');
      check('2c: scrubbed segment arms the post-strike cue for ITS record',
        cueSt?.armed === true
        && Math.abs((cueSt?.plan?.t_contact ?? 1) - 0) < 1e-9,
        JSON.stringify(cueSt?.plan ?? cueSt));
      const snap = async () => {
        const { data } = await chrome.send('Page.captureScreenshot',
          { format: 'png' });
        return createHash('sha256').update(Buffer.from(data, 'base64'))
          .digest('hex');
      };
      const withCueA = await snap();
      // scrub away (re-stages segment 1, re-arms for THAT record)…
      await chrome.eval(
        'window.__playback.seek(window.__playback.state().total * 0.9)');
      const cueSt1 = await chrome.eval('__test.cuePostState()');
      check('2c: boundary crossing re-arms for the newly staged record',
        cueSt1?.armed === true, JSON.stringify(cueSt1?.plan ?? cueSt1));
      // …and back: the SAME T poses the SAME cue — byte-stable pixels
      await chrome.eval('window.__playback.seek(0.5)');
      const withCueB = await snap();
      check('2c: scrub parity holds with the cue in frame (seek(T) x2 '
        + 'byte-identical)', withCueA === withCueB,
      `${withCueA.slice(0, 12)} vs ${withCueB.slice(0, 12)}`);
      // reconciliation review P2 red-proof: the cuepostlive setEnabled(false)
      // escape hatch governs the DVR surface too — a STANDING player arm
      // dies on the next staged render (no cueArmFail latch), and
      // re-enable + rescrub re-arms.
      check('2c: escape hatch reports disabled',
        await chrome.eval('__test.cuePostLive.setEnabled(false)') === false);
      await chrome.eval('window.__playback.seek(0.5)');
      check('2c: setEnabled(false) disarms the standing DVR arm on the '
        + 'next staged render (escape-hatch law)',
      (await chrome.eval('__test.cuePostState()'))?.armed !== true);
      await chrome.eval('__test.cuePostLive.setEnabled(true)');
      await chrome.eval('window.__playback.seek(0.5)');
      check('2c: re-enable + rescrub re-arms (the disable was a switch, '
        + 'never a latched refusal)',
      (await chrome.eval('__test.cuePostState()'))?.armed === true);
    }
    // ---- arm 3: trim+camera+speed → the renderDrill timeline args -------------
    await chrome.eval('window.__playback.setTrim(0.4, window.__playback.state().total)');
    await chrome.eval('window.__playback.setSpeed(0.5)');
    // playhead sits in segment 0 (scrubbed back above); assign Overhead to
    // segment 1 from ITS playhead. GH-273 RULING (deliberate arm update,
    // red-proofed): the camera is USER STATE — a single explicit choice
    // BACKFILLS every never-assigned earlier segment (the design charter decision 2,
    // per-segment presets), so the plan carries 'top' on BOTH segments —
    // static presets emit explicitly PER SEGMENT (review round-2 P1: the
    // renderer re-frames over each segment's staged initial state exactly
    // like the live player's boundary re-anchor; null-inherit froze the
    // previous segment's framing). The pre-273 expectation ["side","top"]
    // pinned the forward-only broadcast default the owner reported as the
    // defect.
    await chrome.eval('window.__playback.seek(window.__playback.state().total * 0.9)');
    await chrome.eval('window.__playback.setCam("overhead")');
    const plan = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('3: plan includes both records with the global trim mapped per segment',
      plan.records.length === 2
      && Math.abs(plan.opts.trims[0].startT - 0.4) < 1e-6
      && plan.opts.trims[0].endT === null && plan.opts.trims[1].endT === null
      && plan.opts.trims[1].startT === 0,
      JSON.stringify(plan.opts.trims));
    check('3: per-segment cameras (single overhead choice backfills seg 0; '
      + 'static explicit per segment — GH-273)',
      JSON.stringify(plan.opts.perShotCamera) === '["top","top"]',
      JSON.stringify(plan.opts.perShotCamera));
    check('3: speed detent rides opts.slowmo; keepBlob+noDownload set',
      plan.opts.slowmo === 0.5 && plan.opts.keepBlob === true
      && plan.opts.noDownload === true, JSON.stringify(plan.opts));
    // the SAVE flow forwards exactly the plan to __export.renderDrill —
    // stubbed capture, no full render (the task's __export-seam assertion)
    await chrome.eval(`(() => {
      window.__realRenderDrill = window.__export.renderDrill; // arm 3c uses it
      window.__export.renderDrill = async (records, opts) => {
        window.__pbCapture = { n: records.length, trims: opts.trims,
          cams: opts.perShotCamera, slowmo: opts.slowmo,
          keepBlob: opts.keepBlob, noDownload: opts.noDownload,
          width: opts.width, height: opts.height, tier: opts.tier,
          cinelight: opts.cinelight, // #259 (additive capture field)
          // design 277 slice 3 PR-2: the renderer owns the whole cue
          // bracket now (entry disarm, per-segment arm, exit disarm), so
          // the DVR arm stays UP at this call boundary — the PR-1
          // recorded-seam pin (cueArmed === false) fired here by design
          // when PR-2 landed and flipped to the WYSIWYG truth below
          cueArmed: window.__test.cuePostState()?.armed ?? null };
        opts.onProgress?.(30, 60, 16); opts.onProgress?.(60, 60, 16);
        return { blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }),
          size: 64, frames: 60, clipSec: 1, ext: 'mp4', wallSec: 0.1,
          segments: [30, 30], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '3: card open');
    // defect-A wall: opening the card renders NOTHING (renderDrill is called
    // zero times) — the setup state is a promise, not a job
    await sleep(600);
    check('3: opening the card starts NO render (confirm-first law)',
      await chrome.eval('typeof window.__pbCapture === "undefined"'),
      JSON.stringify(await chrome.eval('window.__pbCapture ?? null')));
    // review round 1 P2: `/\d/` also matched the DEGRADED `2 shots` fallback,
    // so the arm stayed green if the card stopped calling estimateDrill
    // entirely. Match the full clipPlan SHAPE instead, built locale-agnostically
    // from the i18n template itself: shot count, a `~<n> MB` size and an ETA
    // field that carries a number — and require it NOT to be the fallback.
    const estShape = await chrome.eval(`(() => {
      const txt = document.querySelector('#ob-pb-card .ob-pb-estimate')
        ?.textContent ?? '';
      const T = window.__i18n.t;
      const tmpl = T('playback.clipPlan',
        { shots: '\\u0001', size: '\\u0002', eta: '\\u0003' });
      const rx = new RegExp('^' + tmpl.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')
        .replace('\\u0001', '2')
        .replace('\\u0002', '\\\\d+(?:\\\\.\\\\d)? MB')
        .replace('\\u0003', '[^·]*\\\\d[^·]*') + '$');
      return { txt, rx: rx.source, match: rx.test(txt),
        fallback: txt === T('playback.clipShots', { shots: 2 }) };
    })()`);
    check('3: setup shows the honest pre-render estimate line '
      + '(shots · ~size · ETA, not the degraded shots-only fallback)',
      estShape.match === true && estShape.fallback === false,
      JSON.stringify(estShape));
    // the estimate seam's documented tier fallback (GH-238 review finding 2):
    // `realtime` is a real EXPORT_TIERS key with NO defaultRes, so a nullish
    // guard let it through and the destructure threw out of a public seam
    const estFB = await chrome.eval(`(() => {
      try {
        return { rt: window.__export.estimateDrill({ tier: 'realtime', sec: 1 }),
          bogus: window.__export.estimateDrill({ tier: 'no-such-tier', sec: 1 }),
          std: window.__export.estimateDrill({ tier: 'standard', sec: 1 }) };
      } catch (e) { return { threw: String(e) }; }
    })()`);
    check('3: estimateDrill resolves a NON-OFFLINE tier to standard instead '
      + 'of throwing out of the public seam',
      Number.isFinite(estFB?.rt?.etaSec)
      && estFB.rt.bytes === estFB.std.bytes && estFB.rt.etaSec === estFB.std.etaSec
      && estFB.bogus.bytes === estFB.std.bytes,
      JSON.stringify(estFB));
    check('3: the progress bar stays off until Export is pressed',
      await chrome.eval(
        '!document.querySelector("#ob-pb-card .ob-pb-progress")?.classList.contains("on")'));
    await confirmClip(chrome, '3');
    await waitFor(chrome, 'typeof window.__pbCapture === "object"', '3: render ran');
    const cap = await chrome.eval('window.__pbCapture');
    check('3: renderDrill received the trimmed timeline args verbatim',
      cap.n === 2 && Math.abs(cap.trims[0].startT - 0.4) < 1e-6
      && JSON.stringify(cap.cams) === '["top","top"]' && cap.slowmo === 0.5
      && cap.keepBlob === true && cap.noDownload === true,
      JSON.stringify(cap));
    check('3: DVR cue arm stays UP at the renderDrill boundary (design 277 '
      + 'slice 3 PR-2 — offline-render.js owns the whole cue bracket now; '
      + 'the PR-1 pre-277 pin fired here by design)',
      cap.cueArmed === true, JSON.stringify(cap.cueArmed));
    check('3: the player bed re-arms the cue after the render settles',
      (await chrome.eval('__test.cuePostState()'))?.armed === true);
    check('3: export.js propagates the cue-timeline capability marker '
      + '(cuePostTailCapable — the walkBeatCapable shape)',
      await chrome.eval('window.__export.cuePostTailCapable === true'));
    check('3: progress bar drove to done', // CSSOM reads back '100%'
      /^100(\.0)?%$/.test(await chrome.eval(
        'document.querySelector(".ob-pb-bar > div")?.style.width ?? ""')));
    check('3: height pairs with a matching 16:9 width (1920x1080 standard)',
      await chrome.eval('window.__pbCapture.width === 1920'
        + ' && window.__pbCapture.height === 1080'
        + ' && window.__pbCapture.tier === "standard"'));

    // ---- arm 3d: the WYSIWYG law under the confirm-first lifecycle -------------
    // The delivered container ALWAYS matches the options on display. The
    // 6c2d3ba5 cancel-and-re-render repair is gone; its intent is now
    // structural — SETUP changes are free, a running encode LOCKS the picker,
    // and a settled blob is INVALIDATED when the pick changes.
    // 3d-post: a res change AFTER a settled render disarms + invalidates and
    // starts nothing on its own
    await chrome.eval(`(() => {
      const s = document.querySelector('#ob-pb-card select');
      s.value = '720';
      s.dispatchEvent(new Event('change'));
    })()`);
    await sleep(500);
    check('3d-post: res change after a render invalidates instead of '
      + 'auto-rendering (no new renderDrill call)',
      await chrome.eval('window.__pbCapture.height === 1080')
      && await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`)
      && await chrome.eval(`document.querySelector('#ob-pb-card .ob-pb-ptext span')
        ?.textContent === window.__i18n.t('playback.resChanged')`),
      await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-ptext span")?.textContent ?? ""'));
    check('3d-post: the CTA comes back so the new pick is one tap away',
      await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-go")?.disabled === false'));
    // 3d-plan: the SETUP plan already carries the new pick, paired 16:9
    const plan720 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan().opts))');
    check('3d-plan: the setup plan follows the picker (1280x720, standard)',
      plan720.height === 720 && plan720.width === 1280
      && plan720.tier === 'standard', JSON.stringify(plan720));
    // 3d-confirm: pressing Export now delivers EXACTLY the displayed option.
    // The spy also gates review round 1 P2: a re-render must drop the PREVIOUS
    // payload (playback's lastBlob AND export.js's lastResult.blob) as it
    // starts, not when it finishes — the confirm-first CTA makes "Export
    // again" a one-tap loop. The counter starts here, AFTER the 3d-post res
    // change already did its own releaseBlob().
    await chrome.eval(`(() => {
      window.__pbRelease = 0;
      const real = window.__export.releaseDrill;
      window.__export.releaseDrill = () => { window.__pbRelease++; return real?.(); };
    })()`);
    await confirmClip(chrome, '3d');
    await waitFor(chrome,
      'window.__pbCapture?.height === 720 && window.__pbCapture?.width === 1280',
      '3d: confirmed render ran at the displayed 1280x720');
    check('3d: re-render kept the trimmed plan intact',
      await chrome.eval('window.__pbCapture.n === 2'
        + ' && Math.abs(window.__pbCapture.trims[0].startT - 0.4) < 1e-6'));
    check('3d: the re-render dropped the previous payload as it started '
      + '(releaseDrill, not just lastBlob = null)',
      await chrome.eval('window.__pbRelease >= 1'),
      String(await chrome.eval('window.__pbRelease ?? null')));
    // 3d-mid: while the encode runs the picker is LOCKED (native + kit
    // button), so the container can never drift from the label
    await chrome.eval(`(() => {
      window.__pbInstant = window.__export.renderDrill;
      window.__pbPark = {};
      window.__export.renderDrill = (records, opts) => new Promise((resolve) => {
        window.__pbPark.resolve = resolve;
        window.__pbPark.height = opts.height;
        opts.onProgress?.(10, 60, 16);
      });
      window.__pbPark.cancel = window.__export.cancel;
      window.__export.cancel = () => window.__pbPark.resolve?.(null);
    })()`);
    await confirmClip(chrome, '3d-mid');
    await waitFor(chrome, 'window.__pbPark?.resolve !== undefined',
      '3d-mid: parked render in flight');
    const lock = await chrome.eval(`(() => {
      const s = document.querySelector('#ob-pb-card select');
      const b = s?.nextElementSibling;
      return { sel: !!s?.disabled,
        kit: b?.dataset?.ob === 'select-button' ? !!b.disabled : 'no-kit',
        cta: !!document.querySelector('#ob-pb-card .ob-pb-actions')
          ?.classList.contains('off') };
    })()`);
    check('3d-mid: a running encode locks the resolution picker and hides '
      + 'the CTA (Cancel is the only way out)',
      lock.sel === true && lock.kit === true && lock.cta === true,
      JSON.stringify(lock));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-ptext button").click()');
    await waitFor(chrome,
      '(document.querySelector(".ob-pb-bar > div")?.style.width ?? "") === "0%"',
      '3d-mid: Cancel settled the parked render');
    check('3d-mid: the settled render unlocks the picker again',
      await chrome.eval(
        'document.querySelector("#ob-pb-card select")?.disabled === false'));
    await chrome.eval(`(() => {
      window.__export.renderDrill = window.__pbInstant;
      window.__export.cancel = window.__pbPark.cancel;
      const s = document.querySelector('#ob-pb-card select');
      s.value = '1080'; s.dispatchEvent(new Event('change'));
    })()`);
    await confirmClip(chrome, '3d-restore');
    await waitFor(chrome, 'window.__pbCapture?.height === 1080',
      '3d: restored to the 1080p plan for the destination arms');

    // ---- arm 3e: the EMPTY plan tells the truth (GH-238 review finding 7) -----
    // estimateDrill floors frames at 1 and always adds the 160 kB container
    // constant, so a plan with zero included segments used to print
    // "0 shots · ~0.2 MB · ~1 s" — a promise for a file that will never exist.
    // Not reachable by pointer (the trim drag clamps to a >= 0.1 s window
    // inside [0, total] and the segments tile that span) but reachable on the
    // public __playback.setTrim seam, which is where this arm drives it.
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '3e');
    const trim0 = await chrome.eval(
      '(({ tIn, tOut, total }) => ({ tIn, tOut, total }))(window.__playback.state())');
    await chrome.eval(`window.__playback.setTrim(${trim0.total}, ${trim0.total})`);
    check('3e: setTrim(total, total) really empties the plan',
      await chrome.eval('window.__playback.plan().records.length') === 0);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '3e: card open');
    await sleep(400);
    const empty = await chrome.eval(`(() => ({
      line: document.querySelector('#ob-pb-card .ob-pb-estimate')?.textContent ?? '',
      shotsOnly: document.querySelector('#ob-pb-card .ob-pb-estimate')?.textContent
        === window.__i18n.t('playback.clipShots', { shots: 0 }),
      cta: document.querySelector('#ob-pb-card .ob-pb-go')?.disabled,
    }))()`);
    check('3e: an empty plan prints the shot count ONLY — no size, no ETA',
      empty.shotsOnly === true && !/MB|\d\s*s\b/.test(empty.line.replace(/^0 /, '')),
      JSON.stringify(empty));
    check('3e: and the Export CTA is disabled next to it',
      empty.cta === true, JSON.stringify(empty));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '3e');
    await chrome.eval(
      `window.__playback.setTrim(${trim0.tIn}, ${trim0.tOut})`);

    // ---- arm 3f (retargeted by GH-250): NO offline encoder → the REALTIME
    // tier. review round 1 P2 recorded the original claim: renderDrill EXISTS
    // on an engine whose WebCodecs configs are all unsupported, and the card
    // used to disable the CTA behind export.noneAvailable. GH-250 changes
    // that branch: when MediaRecorder can capture AND hand the blob back
    // (this Chrome can — __record.supported + the additive lastRecording
    // getter), the card offers the realtime-capture tier instead of the
    // dead end: honest realtime copy, resolution/quality pickers GONE, CTA
    // ARMED. The noneAvailable claim lives on in arm 14's both-absent boot.
    await chrome.eval(`(() => {
      window.__pbRealHd = window.__export.hdInfo;
      window.__pbRealSup = window.__export.support;
      window.__export.hdInfo = async () => null;
      window.__export.support = () => ({ webcodecs: true, mp4: false, webm: false });
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '3f: card open');
    await waitFor(chrome,
      `document.querySelector('#ob-pb-card .ob-pb-estimate')?.textContent
        === window.__i18n.t('playback.realtimeNote')`,
      '3f: the honest realtime promise is painted', 40, 200);
    const rtOffer = await chrome.eval(`(() => ({
      cta: document.querySelector('#ob-pb-card .ob-pb-go')?.disabled,
      adv: document.querySelector('#ob-pb-card .ob-pb-adv')?.style.display,
      line: document.querySelector('#ob-pb-card .ob-pb-quality span')?.textContent,
      none: document.querySelector('#ob-pb-card .ob-pb-ptext span')?.textContent
        === window.__i18n.t('export.noneAvailable'),
    }))()`);
    check('3f: no offline encoder + MediaRecorder → the realtime tier is '
      + 'offered (CTA armed, pickers gone, never the noneAvailable dead end)',
      rtOffer.cta === false && rtOffer.adv === 'none' && rtOffer.none === false
      && /live capture/.test(rtOffer.line ?? ''),
      JSON.stringify(rtOffer));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '3e');
    // 3f-slow (review round 3 P2): capability is UNKNOWN until the async probe
    // settles, and an armed CTA in that window enters renderDrill only to
    // throw. The CTA must stay disabled until hdInfo() answers — and must
    // arm itself once it does.
    await chrome.eval(`(() => {
      window.__export.hdInfo = () => new Promise((res) => setTimeout(
        () => res({ heights: [720, 1080], slowmos: [1, 0.5, 0.25] }), 2500));
      window.__export.support = () => ({ webcodecs: true, mp4: true, webm: true });
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '3f-slow: card open');
    check('3f-slow: the CTA stays disabled while the encoder probe is in flight',
      await chrome.eval(
        `document.querySelector('#ob-pb-card .ob-pb-go')?.disabled`) === true);
    await waitFor(chrome,
      `document.querySelector('#ob-pb-card .ob-pb-go')?.disabled === false`,
      '3f-slow: the CTA arms once the probe settles', 60, 200);
    check('3f-slow: the settled probe armed the CTA (no permanent dead button)',
      await chrome.eval(
        `document.querySelector('#ob-pb-card .ob-pb-go')?.disabled`) === false);
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '3f-slow');
    // 3f-hang (review round 4 P2): a probe that NEVER answers must leave a
    // DISABLED CTA on a CLOSABLE card. Re-arming it on a timer is the WORST
    // outcome — startRender sets rendering=true (Close blocked) while
    // drillRender has not yet assigned the AbortController Cancel needs, so
    // the card wedges. The 4.6 s wait outlives the deleted 4 s watchdog, so a
    // reintroduced timer fails this arm.
    await chrome.eval('window.__export.hdInfo = () => new Promise(() => {}); true');
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '3f-hang: card open');
    await sleep(4600);
    check('3f-hang: a never-settling probe keeps the CTA disabled '
      + '(no timer re-arm into an uncancellable render)',
      await chrome.eval(
        `document.querySelector('#ob-pb-card .ob-pb-go')?.disabled`) === true);
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '3f-hang');
    check('3f-hang: and the card still closes — a stalled probe never wedges it',
      await chrome.eval('window.__playback.cardOpen() === false'));
    await chrome.eval(`(() => {
      window.__export.hdInfo = window.__pbRealHd;
      window.__export.support = window.__pbRealSup;
    })()`);

    // ---- arm 3h (#259): the quality picker — offer gate, byte-identity, ------
    // coupling, lock, invalidation. NEW-numbered family (additive lane).
    // 3h-degrade: a tiers() surface that OMITS cinematic (stale export.js /
    // float-blend-gated GPU) renders NO quality select, and the plan it
    // yields is the byte-identity BASELINE for the default path.
    await chrome.eval(`(() => {
      window.__pbRealTiers = window.__export.tiers;
      window.__export.tiers = () => ({ realtime: 'webm', standard: 'mp4',
        high: 'mp4', ultra4k: 'mp4', cinema4k: 'mp4' });
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '3h-degrade: card open');
    check('3h-degrade: no cinematic offer → NO quality select in the card',
      await chrome.eval('document.getElementById("ob-pb-qual") === null'));
    const planDeg = await chrome.eval(
      'JSON.stringify(window.__playback.plan().opts)');
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '3h-degrade');
    await chrome.eval('window.__export.tiers = window.__pbRealTiers; true');
    // 3h-offer: the real tiers() on this Chrome gates cinematic GREEN
    // (float blend probed by e2e-export [#259]) → the select renders, and
    // its DEFAULT (Auto) plan is JSON-BYTE-IDENTICAL to the degraded card's
    check('3h-offer: this Chrome offers the cinematic tier',
      await chrome.eval('"cinematic" in (window.__export.tiers?.() ?? {})'));
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '3h: card open');
    check('3h-offer: quality select rendered when tiers().cinematic exists',
      await chrome.eval('!!document.getElementById("ob-pb-qual")'));
    check('3h-offer: Auto is the default',
      await chrome.eval('document.getElementById("ob-pb-qual")?.value === "auto"'));
    const planAuto = await chrome.eval(
      'JSON.stringify(window.__playback.plan().opts)');
    check('3h: the default (Auto) plan is JSON-byte-identical to the '
      + 'pre-#259 (picker-less) plan',
      planAuto === planDeg, JSON.stringify({ planAuto, planDeg }));
    // the probed 4K option must be in before the coupling legs judge it
    await waitFor(chrome, `[...document.querySelector('#ob-pb-card select')
      .options].some((o) => o.value === '2160')`,
    '3h: probed 4K option landed', 60, 200);
    // 3h-cine: selecting Cinematic prunes 4K (the tier renders ≤1080p only),
    // flips the plan tier, adds NO cinelight key, and paints the cine line
    await chrome.eval(`(() => {
      const q = document.getElementById('ob-pb-qual');
      q.value = 'cinematic';
      q.dispatchEvent(new Event('change'));
    })()`);
    await sleep(300);
    const cine = await chrome.eval(`(() => {
      const res = document.querySelector('#ob-pb-card select');
      const txt = document.querySelector('.ob-pb-quality .ob-nums')
        ?.textContent ?? '';
      const T = window.__i18n.t;
      const tmpl = T('playback.qualityLineCine', { sec: '\\u0001', res: '\\u0002' });
      const rx = new RegExp('^' + tmpl.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')
        .replace('\\u0001', '\\\\d+').replace('\\u0002', '1080p') + '$');
      return { opts: [...res.options].map((o) => o.value), sel: res.value,
        plan: JSON.parse(JSON.stringify(window.__playback.plan().opts)),
        line: txt, lineOk: rx.test(txt) };
    })()`);
    check('3h-cine: cinematic prunes 4K from the resolution list',
      JSON.stringify(cine.opts) === JSON.stringify(['720', '1080'])
      && cine.sel === '1080', JSON.stringify(cine));
    check('3h-cine: plan carries tier cinematic and NO cinelight key '
      + '(the flag belongs to the third option only)',
      cine.plan.tier === 'cinematic' && !('cinelight' in cine.plan)
      && cine.plan.height === 1080 && cine.plan.width === 1920,
      JSON.stringify(cine.plan));
    check('3h-cine: the quality line paints the playback.qualityLineCine copy',
      cine.lineOk === true, JSON.stringify({ line: cine.line }));
    // 3h-auto: back to Auto restores the probed list (4K returns) + the plan
    await chrome.eval(`(() => {
      const q = document.getElementById('ob-pb-qual');
      q.value = 'auto';
      q.dispatchEvent(new Event('change'));
    })()`);
    await sleep(300);
    const backAuto = await chrome.eval(`(() => ({
      opts: [...document.querySelector('#ob-pb-card select').options]
        .map((o) => o.value),
      plan: JSON.parse(JSON.stringify(window.__playback.plan().opts)) }))()`);
    check('3h-auto: returning to Auto restores the probed resolution list '
      + 'and the pre-#259 plan shape',
      backAuto.opts.includes('2160') && backAuto.plan.tier === 'standard'
      && !('cinelight' in backAuto.plan), JSON.stringify(backAuto));
    // 3h-cinelight: the third option carries cinelight:true through the plan
    // AND through renderDrill's opts (the capture stub records it)
    await chrome.eval(`(() => {
      const q = document.getElementById('ob-pb-qual');
      q.value = 'cinelight';
      q.dispatchEvent(new Event('change'));
    })()`);
    await sleep(300);
    const planCl = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan().opts))');
    check('3h-cinelight: plan carries tier cinematic + cinelight:true',
      planCl.tier === 'cinematic' && planCl.cinelight === true
      && planCl.height === 1080, JSON.stringify(planCl));
    await chrome.eval('window.__pbCapture = undefined; true');
    await confirmClip(chrome, '3h-cinelight');
    await waitFor(chrome, 'window.__pbCapture?.tier === "cinematic"',
      '3h-cinelight: render ran with the cinematic tier');
    check('3h-cinelight: renderDrill received cinelight:true verbatim',
      await chrome.eval('window.__pbCapture.cinelight === true'
        + ' && window.__pbCapture.height === 1080'
        + ' && window.__pbCapture.width === 1920'),
      JSON.stringify(await chrome.eval('window.__pbCapture')));
    // 3h-invalidate: a settled blob under a CHANGED quality is invalidated —
    // tiles disarm, playback.resChanged paints, the CTA returns, NO render
    await chrome.eval(`(() => {
      const q = document.getElementById('ob-pb-qual');
      q.value = 'cinematic';
      q.dispatchEvent(new Event('change'));
    })()`);
    await sleep(400);
    const inval = await chrome.eval(`(() => ({
      tier: window.__pbCapture.tier, cl: window.__pbCapture.cinelight,
      tiles: [...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled),
      note: document.querySelector('#ob-pb-card .ob-pb-ptext span')
        ?.textContent === window.__i18n.t('playback.resChanged'),
      cta: document.querySelector('#ob-pb-card .ob-pb-go')?.disabled,
    }))()`);
    check('3h-invalidate: a quality change over a settled blob invalidates '
      + 'instead of auto-rendering (tiles disarmed, resChanged, CTA back)',
      inval.cl === true && inval.tiles === true && inval.note === true
      && inval.cta === false, JSON.stringify(inval));
    // 3h-lock: a running encode LOCKS the quality picker exactly like the
    // resolution picker (native disabled + kit button disabled)
    await chrome.eval(`(() => {
      window.__pbInstant2 = window.__export.renderDrill;
      window.__pbPark2 = {};
      window.__export.renderDrill = (records, opts) => new Promise((resolve) => {
        window.__pbPark2.resolve = resolve;
        opts.onProgress?.(10, 60, 16);
      });
      window.__pbPark2.cancel = window.__export.cancel;
      window.__export.cancel = () => window.__pbPark2.resolve?.(null);
    })()`);
    await confirmClip(chrome, '3h-lock');
    await waitFor(chrome, 'window.__pbPark2?.resolve !== undefined',
      '3h-lock: parked render in flight');
    const qLock = await chrome.eval(`(() => {
      const q = document.getElementById('ob-pb-qual');
      const b = q?.nextElementSibling;
      return { sel: !!q?.disabled,
        kit: b?.dataset?.ob === 'select-button' ? !!b.disabled : 'no-kit' };
    })()`);
    check('3h-lock: a running encode locks the quality picker '
      + '(native + kit button)',
      qLock.sel === true && qLock.kit === true, JSON.stringify(qLock));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-ptext button").click()');
    await waitFor(chrome,
      '(document.querySelector(".ob-pb-bar > div")?.style.width ?? "") === "0%"',
      '3h-lock: Cancel settled the parked render');
    check('3h-lock: the settled render unlocks the quality picker again',
      await chrome.eval(
        'document.getElementById("ob-pb-qual")?.disabled === false'));
    await chrome.eval(`(() => {
      window.__export.renderDrill = window.__pbInstant2;
      window.__export.cancel = window.__pbPark2.cancel;
    })()`);
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '3h');

    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '3e: trim restored');
    await confirmClip(chrome, '3e-restore');
    await waitFor(chrome, 'window.__pbCapture?.height === 1080',
      '3e: re-rendered for the destination arms');

    // ---- arm 4: destination routing (the obSaveVideo shell contract) ----------
    check('4: web build offers share/download only',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .map((b) => b.dataset.dest).join(',')`) === 'share,download');
    // re-open the card under the REAL iOS shell shape (GH-225): the
    // documentStart capability hint + obSaveVideo/obPhotos/obShare handlers
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    await chrome.eval(`(() => {
      window.__pbPosts = [];
      const h = (tag) => ({ postMessage: (m) => window.__pbPosts.push({ tag, ...m }) });
      window.webkit = { messageHandlers: {
        obSaveVideo: h('saveVideo'), obPhotos: h('photos'), obShare: h('share') } };
      window.__obSaveVideo = { v: 1, dests: ['photos', 'files'] };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4: card reopen');
    await confirmClip(chrome, '4');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4: destinations armed');
    check('4: iOS hint (photos+files, NO streamed share) shows photos/files '
      + 'ONLY — an obShare handler alone never earns a Share tile (GH-256 '
      + 'P1: that tile was verbatim the measured v1 crash wire)',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .map((b) => b.dataset.dest).join(',')`) === 'photos,files');
    // a result NOBODY awaits drops silently (the saveWait latch law)
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',
      { detail: { ok: false, name: 'x.mp4', dest: 'files', error: 'denied' } })); true`);
    await sleep(200);
    check('4: spurious result before any attempt paints nothing',
      await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        !== window.__i18n.t('record.saveFailed')`)
      && await chrome.eval(
        'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0'));
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome, 'window.__pbPosts?.length === 1', '4: bridge post');
    const post = await chrome.eval(
      '(({ tag, v, dest, mime, name, b64 }) => ({ tag, v, dest, mime, name, len: b64?.length ?? 0 }))(window.__pbPosts[0])');
    check('4: Files routes the blob through obSaveVideo (dest + b64 + mime)',
      post.tag === 'saveVideo' && post.v === 1 && post.dest === 'files'
      && post.mime === 'video/mp4' && post.len > 0 && /\.mp4$/.test(post.name),
      JSON.stringify(post));
    // 4b: the awaited attempt DISARMS every tile behind the Saving… paint;
    // the shell's ONE ok result re-arms and paints the localized Saved
    check('4b: post in flight — every tile disarmed, Saving… painted',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`)
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saving')`));
    // a NONMATCHING result (a late echo from some other attempt) keeps
    // the latch — identity is name+dest (review re-gate P2)
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',
      { detail: { ok: true, name: 'someone-else.mp4', dest: 'files' } })); true`);
    await sleep(200);
    check('4b: nonmatching result keeps the tiles disarmed (identity law)',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`));
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',
      { detail: { ok: true, name: ${JSON.stringify(post.name)}, dest: 'files' } })); true`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4b: matching ok result re-armed the tiles');
    check('4b: ok result paints the localized Saved',
      await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saved')`));
    // 4c: denied paints the honest error (record.saveFailed), never "Saved"
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=photos]").click()');
    await waitFor(chrome, 'window.__pbPosts?.length === 2', '4c: photos post');
    check('4c: Photos rides obSaveVideo dest=photos; tiles disarmed again',
      await chrome.eval('window.__pbPosts[1].tag === "saveVideo"'
        + ' && window.__pbPosts[1].dest === "photos"')
      && await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`));
    // the result must carry THIS attempt's name (identity law)
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',
      { detail: { ok: false, name: window.__pbPosts[1].name, dest: 'photos',
        error: 'denied' } })); true`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4c: denied result re-armed the tiles');
    check('4c: denied paints the record.saveFailed wording, not Saved',
      await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('record.saveFailed')`));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // 4d: files-only capability (the macOS shell shape) — NO dead Photos
    // tile, no download (the bridge covers saving), no obShare on macOS
    await chrome.eval(`(() => {
      window.webkit = { messageHandlers: { obSaveVideo: { postMessage: () => {} } } };
      window.__obSaveVideo = { v: 1, dests: ['files'] };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4d: card open');
    await confirmClip(chrome, '4d');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4d: destinations armed');
    check('4d: files-only capability shows Files ONLY (no dead Photos tile)',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .map((b) => b.dataset.dest).join(',')`) === 'files');
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // 4e: a shell WITHOUT the save bridge (the pre-obSaveVideo macOS
    // wrapper: handlers exist, none of ours) falls back to the download
    // tile — the old zero-tile card is the recorded defect
    await chrome.eval(`(() => {
      delete window.__obSaveVideo;
      window.webkit = { messageHandlers: { obLog: { postMessage: () => {} } } };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4e: card open');
    await confirmClip(chrome, '4e');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4e: destinations armed');
    check('4e: bridge-less shell falls back to the download tile',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .map((b) => b.dataset.dest).join(',')`) === 'download');
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // 4f (retargeted by GH-252): mime honesty is now PROBE-gated. A webm
    // render hides the Photos tile exactly as before WHEN the transcode
    // probe fails (here: VideoDecoder absent → probeTranscodeSupport().ok
    // false — the pre-GH-252 claim, byte-identical tile row); 4f2/4f3 below
    // then prove the tile PRESENT + delivering / failing honestly when the
    // probe passes.
    await chrome.eval(`(() => {
      window.__pbPosts = [];
      const h = (tag) => ({ postMessage: (m) => window.__pbPosts.push({ tag, ...m }) });
      window.webkit = { messageHandlers: {
        obSaveVideo: h('saveVideo'), obPhotos: h('photos'), obShare: h('share') } };
      window.__obSaveVideo = { v: 1, dests: ['photos', 'files'] };
      window.__pbRealVD = window.VideoDecoder; // interface objects are
      window.VideoDecoder = undefined;         // writable — restored in 4f2
      window.__export.renderDrill = async (records, opts) => {
        opts.onProgress?.(60, 60, 16);
        return { blob: new Blob([new Uint8Array(64)], { type: 'video/webm' }),
          size: 64, frames: 60, clipSec: 1, ext: 'webm', wallSec: 0.1,
          segments: [60], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4f: card open');
    await confirmClip(chrome, '4f');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4f: destinations armed');
    check('4f: webm render + FAILED transcode probe hides the Photos tile '
      + '(files only — mime honesty; no streamed share on this hint, so no '
      + 'Share tile either)',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .map((b) => b.dataset.dest).join(',')`) === 'files');
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // ---- arm 4f2 (GH-252): webm + PROBED transcode → Photos delivers mp4 ----
    // A REAL webm (this Chrome's own MediaRecorder, ~1.4 s of a painted
    // canvas) rendered into the card, the REAL transcode.js run on the tap,
    // and the resulting mp4 delivered down the UNCHANGED chunked wire —
    // begin op mime video/mp4 + .mp4 name (mime honesty end-to-end), the
    // reassembled bytes a REAL mp4 (ftyp signature) of exactly the announced
    // size, zero v1 posts, the GH-255 latch held until the shell's one
    // result. Red-proof: pre-GH-252 code never rendered a Photos tile for a
    // webm blob at all, so every check below fails there.
    const realWebmSize = await chrome.eval(`(async () => {
      const c = document.createElement('canvas');
      c.width = 96; c.height = 64;
      const g = c.getContext('2d');
      let hue = 0;
      const paint = () => {
        g.fillStyle = 'hsl(' + (hue = (hue + 7) % 360) + ',80%,50%)';
        g.fillRect(0, 0, 96, 64);
      };
      paint();
      const rec = new MediaRecorder(c.captureStream(30),
        { mimeType: 'video/webm;codecs=vp9' });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const done = new Promise((res) => { rec.onstop = res; });
      rec.start(100);
      const iv = setInterval(paint, 33);
      await new Promise((r) => setTimeout(r, 1400));
      clearInterval(iv);
      rec.stop();
      await done;
      window.__pbRealWebm = new Blob(chunks, { type: 'video/webm' });
      return window.__pbRealWebm.size;
    })()`);
    check('4f2: this Chrome recorded a real webm to transcode', realWebmSize > 0,
      String(realWebmSize));
    await chrome.eval(`(() => {
      window.VideoDecoder = window.__pbRealVD; // the probe passes again
      window.__pbV1Posts = [];
      window.__pbStream = { ops: [], b64: '' };
      const S = window.__pbStream;
      window.webkit = { messageHandlers: {
        obSaveVideo: { postMessage: (m) => window.__pbV1Posts.push(m) },
        obSaveVideoStream: { postMessage: (m) => new Promise((res) => {
          S.ops.push({ op: m.op, name: m.name, seq: m.seq, dest: m.dest,
            mime: m.mime, bytes: m.bytes, chunks: m.chunks });
          if (m.op === 'chunk') S.b64 += m.b64;
          // GH-362 r13: HOLD the end reply — the arm samples the wake
          // state MID-TRANSFER (the hold must still be on) and only then
          // releases this resolver
          if (m.op === 'end' && window.__pbHoldEnd) {
            window.__pbEndRes = () => res({ ok: true });
            return;
          }
          setTimeout(() => res({ ok: true }), 4);
        }) },
      } };
      window.__obSaveVideo = { v: 1, chunk: 786432, dests: ['photos', 'files'] };
      // GH-362 landing review r12+r13: arm the keep-awake wire — the Photos
      // transcode must hold the ONE latch through the WebCodecs pass AND
      // the chunked handoff
      window.__wakeOps = [];
      window.__pbHoldEnd = true;
      window.__obKeepAwake = { v: 1 };
      window.webkit.messageHandlers.obKeepAwake =
        { postMessage: (m) => window.__wakeOps.push(m) };
      window.__export.renderDrill = async (records, opts) => {
        opts.onProgress?.(60, 60, 16);
        const b = window.__pbRealWebm;
        return { blob: b, size: b.size, frames: 42, clipSec: 1.4, ext: 'webm',
          wallSec: 0.1, segments: [42], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4f2: card open');
    await confirmClip(chrome, '4f2');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4f2: destinations armed');
    await waitFor(chrome, `[...document.querySelectorAll('.ob-pb-dest')]
      .map((b) => b.dataset.dest).join(',') === 'photos,files'`,
    '4f2: the probed-ok webm card offers the Photos tile');
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=photos]").click()');
    await waitFor(chrome,
      'window.__pbStream.ops.some((o) => o.op === "end")',
      '4f2: the transcoded clip crossed the chunked wire', 300, 200);
    // GH-362 landing review r12+r13 (P1): sampled MID-TRANSFER (the mock is
    // holding the end reply, so onSent has not fired) the hold must still
    // be ON — a release at the dispatch handoff (the r13 red) or no hold at
    // all (the r12 red) both fail here; then the released reply lets onSent
    // settle the latch and the hold with it.
    check('4f2: the keep-awake hold is still on mid-handoff (held at the '
      + 'tap, not released at dispatch — landing review r12+r13 P1)',
      await chrome.eval(`JSON.stringify(window.__wakeOps)
        === '[{"v":1,"on":true}]'`),
      await chrome.eval('JSON.stringify(window.__wakeOps)'));
    await chrome.eval('window.__pbEndRes()');
    await waitFor(chrome,
      `JSON.stringify(window.__wakeOps)
        === '[{"v":1,"on":true},{"v":1,"on":false}]'`,
      '4f2: onSent (the post left) released the keep-awake hold', 100, 100);
    const TR = await chrome.eval(`(() => {
      const S = window.__pbStream;
      const ops = S.ops;
      const bin = atob(S.b64);
      return {
        v1Posts: window.__pbV1Posts.length,
        seq: ops.map((o) => o.op).join(','),
        begin: ops[0], end: ops[ops.length - 1],
        decodedLen: bin.length,
        ftyp: bin.slice(4, 8),
        srcSize: window.__pbRealWebm.size,
      };
    })()`);
    check('4f2: the wire is begin -> chunk xN -> end with dest=photos and the '
      + 'HONEST transcoded mime (video/mp4, .mp4 name — never the source webm)',
      /^begin(,chunk)+,end$/.test(TR.seq) && TR.begin.dest === 'photos'
      && TR.begin.mime === 'video/mp4' && /\.mp4$/.test(TR.begin.name)
      && TR.end.name === TR.begin.name,
      JSON.stringify({ seq: TR.seq, begin: TR.begin, end: TR.end }));
    check('4f2: the delivered bytes are a REAL mp4 of exactly the announced '
      + `size (${TR.decodedLen} B, ftyp box), not the ${TR.srcSize} B webm`,
      TR.ftyp === 'ftyp' && TR.decodedLen === TR.begin.bytes
      && TR.decodedLen > 0 && TR.v1Posts === 0,
      JSON.stringify({ ftyp: TR.ftyp, decodedLen: TR.decodedLen,
        begin: TR.begin.bytes, v1Posts: TR.v1Posts }));
    check('4f2: the GH-255 latch held across the transcode (tiles disarmed '
      + 'behind Saving… until the shell result)',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`)
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')
        ?.textContent === window.__i18n.t('playback.saving')`));
    await chrome.eval(`(() => { const b = window.__pbStream.ops[0];
      if (!b) return false;
      window.dispatchEvent(new CustomEvent('ob:save-video-result',
        { detail: { ok: true, name: b.name, dest: b.dest } }));
      return true; })()`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4f2: the shell result re-armed the card');
    check('4f2: and it paints the localized Saved on the Photos attempt',
      await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saved')`));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // ---- arm 4f3 (GH-252): a FAILED transcode is honest + strands nothing ---
    // Garbage webm bytes (demux rejects) behind a PASSING probe: the tap
    // unlatches (no post ever leaves), the shared row states the localized
    // playback.transcodeFailed reason, the tapped tile wears the failure
    // register — and the untouched webm still delivers through Files (the
    // bytes-never-stranded law), as a webm, honestly.
    await chrome.eval(`(() => {
      window.__pbStream.ops = [];
      window.__pbStream.b64 = '';
      window.__pbV1Posts = [];
      window.__wakeOps = []; // GH-362 r12: the FAILED path must release too
      window.__pbHoldEnd = false; // the Files leg's wire flows freely here
      window.__export.renderDrill = async (records, opts) => {
        opts.onProgress?.(60, 60, 16);
        const bytes = new Uint8Array(64);
        for (let i = 0; i < 64; i++) bytes[i] = (i * 37 + 11) & 0xff;
        return { blob: new Blob([bytes], { type: 'video/webm' }), size: 64,
          frames: 60, clipSec: 1, ext: 'webm', wallSec: 0.1,
          segments: [60], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4f3: card open');
    await confirmClip(chrome, '4f3');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4f3: destinations armed');
    await waitFor(chrome, `[...document.querySelectorAll('.ob-pb-dest')]
      .map((b) => b.dataset.dest).join(',') === 'photos,files'`,
    '4f3: the probed-ok card still offers Photos for the webm');
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=photos]").click()');
    await waitFor(chrome,
      `document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.transcodeFailed')`,
      '4f3: the failed transcode paints its honest localized reason', 150, 200);
    check('4f3: the FAILED transcode released the keep-awake hold too '
      + '(landing review r12 P1 — the unwind releases the latch AND the hold)',
      await chrome.eval(`JSON.stringify(window.__wakeOps)
        === '[{"v":1,"on":true},{"v":1,"on":false}]'`),
      await chrome.eval('JSON.stringify(window.__wakeOps)'));
    const TRF = await chrome.eval(`(() => ({
      rearmed: [...document.querySelectorAll('.ob-pb-dest')]
        .some((b) => !b.disabled),
      failedTile: document.querySelector('.ob-pb-dest[data-dest=photos]')
        ?.classList.contains('ob-pb-dest--failed'),
      ops: window.__pbStream.ops.length,
      v1Posts: window.__pbV1Posts.length,
    }))()`);
    check('4f3: the failed transcode unlatched (nothing posted, tiles re-armed, '
      + 'the tapped tile wears the failure register)',
      TRF.rearmed === true && TRF.failedTile === true
      && TRF.ops === 0 && TRF.v1Posts === 0, JSON.stringify(TRF));
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome,
      'window.__pbStream.ops.some((o) => o.op === "end")',
      '4f3: Files still delivers the untouched webm', 200, 100);
    check('4f3: …as a webm, honestly (begin mime video/webm, .webm name — '
      + 'bytes never stranded)',
      await chrome.eval(`(() => { const b = window.__pbStream.ops[0];
        return b.dest === 'files' && b.mime === 'video/webm'
          && /\\.webm$/.test(b.name); })()`));
    await chrome.eval(`(() => { const b = window.__pbStream.ops[0];
      window.dispatchEvent(new CustomEvent('ob:save-video-result',
        { detail: { ok: true, name: b.name, dest: b.dest } }));
      return true; })()`);
    await sleep(300);
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // 4g: stale shell (handlers, NO hint) keeps the recorded optimistic
    // degrade: both bridge tiles show, a click paints Saved right away
    // and never disarms (no result event is guaranteed to come)
    await chrome.eval(`(() => {
      delete window.__obSaveVideo; // the stale shell never injected it
      delete window.__obKeepAwake; // …nor the GH-362 keep-awake hint
      window.__pbPosts = [];
      const h = (tag) => ({ postMessage: (m) => window.__pbPosts.push({ tag, ...m }) });
      window.webkit = { messageHandlers: {
        obSaveVideo: h('saveVideo'), obPhotos: h('photos'), obShare: h('share') } };
      window.__export.renderDrill = async (records, opts) => {
        opts.onProgress?.(60, 60, 16);
        return { blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }),
          size: 64, frames: 60, clipSec: 1, ext: 'mp4', wallSec: 0.1,
          segments: [60], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4g: card open');
    await confirmClip(chrome, '4g');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4g: destinations armed');
    check('4g: hint-less shell still shows both SAVE tiles (degrade) — and '
      + 'no Share tile, whose only wire there would be the v1 crash post',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .map((b) => b.dataset.dest).join(',')`) === 'photos,files');
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome, 'window.__pbPosts?.length === 1', '4g: bridge post');
    check('4g: stale shell keeps the optimistic Saved (no disarm, no wait)',
      await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saved')`)
      && await chrome.eval(
        'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0'));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // 4h: the awaited latch SURVIVES card close/reopen (review re-gate P1:
    // a reopened card must not post a second near-cap body while the
    // native save runs) — only the attempt's own result re-arms
    await chrome.eval('window.__obSaveVideo = { v: 1, dests: ["photos", "files"] };'
      + ' window.__pbPosts = []; true');
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4h: card open');
    await confirmClip(chrome, '4h');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4h: destinations armed');
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome, 'window.__pbPosts?.length === 1', '4h: bridge post');
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await waitFor(chrome, 'window.__playback.cardOpen() === false',
      '4h: card closed mid-save');
    await sleep(400);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4h: card reopen');
    // the latch outranks the SETUP state: the reopened card previews its
    // tiles DISARMED before any render, so a second near-cap post can never
    // stack while the native save runs
    check('4h: reopened card in SETUP previews disarmed tiles (latch held)',
      await chrome.eval('document.querySelectorAll(".ob-pb-dest").length > 0')
      && await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`));
    await confirmClip(chrome, '4h');
    await waitFor(chrome, // render settles, tiles render but STAY disarmed
      '/^100(\\.0)?%$/.test(document.querySelector(".ob-pb-bar > div")?.style.width ?? "")'
      + ' && document.querySelectorAll(".ob-pb-dest").length > 0',
      '4h: reopened card rendered');
    check('4h: reopened card stays disarmed while the save is in flight',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`));
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',
      { detail: { ok: true, name: window.__pbPosts[0].name, dest: 'files' } })); true`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4h: the attempt\'s own result re-armed the reopened card');
    // 4i: a res change DURING a pending save retires that save's PAINT
    // (review round 2 P2). The clip really was delivered — but at the OLD
    // resolution, so stamping Saved over playback.resChanged would make the
    // newly displayed option look delivered. The latch release and tile
    // re-arm stay generation-independent; only the paint is retired.
    await chrome.eval(`(() => { window.__pbN = window.__pbPosts.length;
      document.querySelector('.ob-pb-dest[data-dest=files]').click(); })()`);
    await waitFor(chrome, 'window.__pbPosts.length === window.__pbN + 1',
      '4i: second bridge post in flight');
    await chrome.eval(`(() => {
      const s = document.querySelector('#ob-pb-card select');
      s.value = '720'; s.dispatchEvent(new Event('change'));
    })()`);
    await sleep(300);
    check('4i: the res change paints resChanged over the in-flight Saving…',
      await chrome.eval(`document.querySelector('#ob-pb-card .ob-pb-ptext span')
        ?.textContent === window.__i18n.t('playback.resChanged')`),
      await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-ptext span")?.textContent ?? ""'));
    await chrome.eval(`(() => { const p = window.__pbPosts[window.__pbN];
      window.dispatchEvent(new CustomEvent('ob:save-video-result',
        { detail: { ok: true, name: p.name, dest: p.dest } })); })()`);
    await sleep(400);
    check('4i: the stale attempt\'s result does NOT stamp Saved over the '
      + 'invalidated resolution (paintGen retired it)',
      await chrome.eval(`document.querySelector('#ob-pb-card .ob-pb-ptext span')
        ?.textContent === window.__i18n.t('playback.resChanged')`)
      && await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`),
      await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-ptext span")?.textContent ?? ""'));
    await chrome.eval(`(() => {
      const s = document.querySelector('#ob-pb-card select');
      s.value = '1080'; s.dispatchEvent(new Event('change'));
    })()`);
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);

    // ---- arms 4j-4m: the accent FOLLOWS THE LIVE ATTEMPT (GH-255) -------------
    // Owner report on build 12: "点击 photo, file, share 的时候, 那个 card 不会变蓝色
    // 高亮, 永远是 photo 那个高亮". Two defects — a STATIC accent on Photos
    // (`primary: true` → the retired `.ob-pb-dest--primary` wash) and no
    // per-tile acknowledgement at all. These arms gate the fix on painted
    // MATERIAL, not on class names (destTiles()).
    await chrome.eval(`(() => {
      window.__pbPosts = [];
      const h = (tag) => ({ postMessage: (m) => window.__pbPosts.push({ tag, ...m }) });
      window.webkit = { messageHandlers: {
        obSaveVideo: h('saveVideo'), obPhotos: h('photos'), obShare: h('share') } };
      window.__obSaveVideo = { v: 1, dests: ['photos', 'files'] };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4j: card open');
    await confirmClip(chrome, '4j');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4j: destinations armed');
    // 4j: AT REST — armed tiles, no attempt in flight — every tile shares ONE
    // material and it is the NEUTRAL register. A static "recommended" accent
    // applies to exactly one tile, so both legs catch it. (Two tiles since
    // GH-256 P1: this hint names no streamed share, so no Share tile.)
    await parkPointer(chrome);
    let tiles = await destTiles(chrome);
    check('4j: at rest every destination tile shares ONE material and NONE '
      + 'wears the accent (the retired --primary marker)',
      tiles.length === 2 && tiles.every((x) => x.reg === 'rest'
        && x.mat === tiles[0].mat && x.state === '' && x.busy === null
        && x.first === 'ob-pb-dest'
        && x.subKey === `playback.dest.${x.dest}Sub`),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.state}/${x.mat}`)));
    // 4k: a REAL hit-tested tap moves the WORKING state onto THAT tile (the
    // owner's "变蓝色高亮"), and a denied result resolves the honest failure on
    // the SAME tile while its neighbours stay at the rest material.
    await realClick(chrome, '.ob-pb-dest[data-dest=files]', '4k: Files tile');
    await waitFor(chrome, 'window.__pbPosts?.length === 1', '4k: bridge post');
    // measured with the pointer STILL on the tapped tile — a real mouse tap
    // leaves it there, and `.ob-pb-dest:hover` outranks the state rules on
    // specificity, so an unguarded hover erases the very feedback the tap
    // produced (the neutral --ob-bg-3 wash over the accent one). The settle is
    // mandatory: kit.css transitions every `.ob-panel button`'s background /
    // border-color / color over --ob-t-fast, and a tile sampled inside that
    // window reports an INTERPOLATED oklab that matches no register (this
    // exact flake produced the first red of the arm).
    await sleep(300);
    const hovered = (await destTiles(chrome)).find((x) => x.dest === 'files');
    check('4k: the working accent survives the pointer that tapped it '
      + '(hover may not outrank the state register)',
      hovered?.reg === 'working', JSON.stringify(hovered));
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    const work = tiles.find((x) => x.dest === 'files');
    check('4k: the REAL tap put the working accent on the TAPPED tile only, '
      + 'at full strength through the collective disarm',
      work?.reg === 'working' && work.busy === 'true' && work.disabled === true
      && work.opacity === '1'
      && work.sub === await chrome.eval(`window.__i18n.t('playback.saving')`)
      && tiles.filter((x) => x.dest !== 'files')
        .every((x) => x.reg === 'rest' && x.state === '' && x.busy === null
          && x.opacity === '0.45'),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.opacity}/${x.sub}`)));
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',
      { detail: { ok: false, name: window.__pbPosts[0].name, dest: 'files',
        error: 'denied' } })); true`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4k: denied result re-armed the tiles');
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4k: denied paints the failure register on the tapped tile, leaves '
      + 'its neighbours at rest, and keeps the honest wording in the row',
      tiles.find((x) => x.dest === 'files')?.reg === 'failed'
      && tiles.find((x) => x.dest === 'files')?.sub
        === await chrome.eval(`window.__i18n.t('playback.destFailed')`)
      && tiles.find((x) => x.dest === 'files')?.busy === null
      && tiles.filter((x) => x.dest !== 'files')
        .every((x) => x.reg === 'rest' && x.state === '')
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('record.saveFailed')`),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.sub}`)));
    // a SECOND attempt on another tile: exactly ONE tile ever carries a state,
    // and `busy` is as honest a failure as `denied`
    await realClick(chrome, '.ob-pb-dest[data-dest=photos]', '4k: Photos tile');
    await waitFor(chrome, 'window.__pbPosts?.length === 2', '4k: photos post');
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',
      { detail: { ok: false, name: window.__pbPosts[1].name, dest: 'photos',
        error: 'busy' } })); true`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4k: busy result re-armed the tiles');
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4k: busy resolves on Photos and RETIRES the previous tile\'s '
      + 'failure (one tile carries a state at a time)',
      tiles.find((x) => x.dest === 'photos')?.reg === 'failed'
      && tiles.filter((x) => x.dest !== 'photos')
        .every((x) => x.reg === 'rest' && x.state === '')
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saveBusy')`),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.sub}`)));
    // 4l: a result whose IDENTITY does not match the attempt paints NOTHING —
    // not on the tapped tile, not anywhere — and keeps the latch (4b's law,
    // now with the tile paint under the same gate)
    await realClick(chrome, '.ob-pb-dest[data-dest=files]', '4l: Files tile');
    await waitFor(chrome, 'window.__pbPosts?.length === 3', '4l: bridge post');
    await chrome.eval(`(() => { const n = window.__pbPosts[2].name;
      window.dispatchEvent(new CustomEvent('ob:save-video-result',
        { detail: { ok: true, name: 'someone-else.mp4', dest: 'files' } }));
      window.dispatchEvent(new CustomEvent('ob:save-video-result',
        { detail: { ok: true, name: n, dest: 'photos' } })); // right name, wrong dest
    })()`);
    await sleep(300);
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4l: a mismatched-identity result paints NO tile and keeps the '
      + 'working state on the real attempt',
      tiles.find((x) => x.dest === 'files')?.reg === 'working'
      && !tiles.some((x) => /--done|--failed/.test(x.state))
      && tiles.filter((x) => x.dest !== 'files').every((x) => x.reg === 'rest'),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.state}`)));
    // 4m: the tile state survives card close/reopen exactly like the LATCH it
    // is derived from (the reopened card's disarmed tiles say WHY), while the
    // retired RESULT still paints nothing after the per-open paintGen bump
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await waitFor(chrome, 'window.__playback.cardOpen() === false',
      '4m: card closed mid-save');
    await cardNodeGone(chrome, '4m');
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4m: card reopen');
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4m: the reopened card still shows WHICH tile is saving (latch-scoped '
      + 'working state, tiles disarmed)',
      tiles.find((x) => x.dest === 'files')?.reg === 'working'
      && tiles.find((x) => x.dest === 'files')?.busy === 'true'
      && tiles.every((x) => x.disabled === true)
      && tiles.filter((x) => x.dest !== 'files').every((x) => x.reg === 'rest'),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.disabled}`)));
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',
      { detail: { ok: true, name: window.__pbPosts[2].name, dest: 'files' } })); true`);
    await sleep(300);
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4m: the reopened card RE-ARMS but never inherits the stale outcome '
      + '(paintGen retired the paint; the latch release did not)',
      tiles.every((x) => x.reg === 'rest' && x.state === '' && x.busy === null),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.state}`)));
    // and a settled DONE state is retired by the res-change invalidation too
    await confirmClip(chrome, '4m');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4m: destinations re-armed after the re-render');
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome, 'window.__pbPosts?.length === 4', '4m: bridge post');
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',
      { detail: { ok: true, name: window.__pbPosts[3].name, dest: 'files' } })); true`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4m: ok result re-armed the tiles');
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    const done = tiles.find((x) => x.dest === 'files');
    check('4m: ok resolves SUCCESS on the tapped tile, in a register the '
      + 'working state cannot be mistaken for',
      done?.reg === 'done' && done.busy === null
      && done.sub === await chrome.eval(`window.__i18n.t('playback.saved')`)
      && done.shadow !== 'none' && done.mat !== work?.mat,
      JSON.stringify({ done: done?.mat, shadow: done?.shadow, work: work?.mat }));
    await chrome.eval(`(() => {
      const s = document.querySelector('#ob-pb-card select');
      s.value = '720'; s.dispatchEvent(new Event('change'));
    })()`);
    await sleep(300);
    tiles = await destTiles(chrome);
    check('4m: the res-change invalidation retires the SUCCESS tile too '
      + '(nothing may claim delivery of a clip that no longer exists)',
      tiles.every((x) => x.reg === 'rest' && x.state === '')
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.resChanged')`),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.state}`)));
    await chrome.eval(`(() => {
      const s = document.querySelector('#ob-pb-card select');
      s.value = '1080'; s.dispatchEvent(new Event('change'));
    })()`);
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // 4n: the routes that get NO result event still ACKNOWLEDGE on their tile
    // (GH-255 recorded decision — silence was the second half of the defect).
    // Driven through the LEGACY obPhotos shell (no obSaveVideo, no hint), the
    // one fire-and-forget route a headless gate can tap without opening a
    // native share sheet: the tile says HANDED OFF rather than claiming a
    // confirmed save, while the shared row keeps its recorded optimistic paint.
    await chrome.eval(`(() => {
      delete window.__obSaveVideo;
      window.__pbPosts = [];
      window.webkit = { messageHandlers: { obPhotos: {
        postMessage: (m) => window.__pbPosts.push({ tag: 'photos', ...m }) } } };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4n: card open');
    await confirmClip(chrome, '4n');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4n: destinations armed');
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=photos]").click()');
    await waitFor(chrome, 'window.__pbPosts?.length === 1', '4n: legacy photos post');
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4n: a no-result route acknowledges on its own tile (handoff), never '
      + 'silence, and never disarms',
      tiles.find((x) => x.dest === 'photos')?.subKey === 'playback.destHandoff'
      && tiles.find((x) => x.dest === 'photos')?.reg === 'done'
      && tiles.every((x) => x.disabled === false)
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saved')`),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.subKey}`)));
    // 4n2 (GH-251 review round-1 P1): the legacy obPhotos controller DOES
    // report back — through 'ob:photos-result' — and record.js's listener
    // left with its rescue machinery, so the CARD owns the correlated
    // correction now. A mismatched name paints nothing (identity law);
    // the matching denied result corrects the optimistic handoff to the
    // honest per-code failure on the tapped tile. Red-proof: pre-fix code
    // has no listener, so the denied write stays behind "Saved" forever.
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:photos-result',
      { detail: { ok: false, name: 'someone-else.mp4', error: 'denied' } })); true`);
    await sleep(300);
    check('4n2: a mismatched legacy result paints nothing (identity law)',
      await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saved')`));
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:photos-result',
      { detail: { ok: false, name: window.__pbPosts[0].name,
        error: 'denied' } })); true`);
    await waitFor(chrome,
      `document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('record.saveFailed')`,
      '4n2: the matching denied result corrects the optimistic paint');
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4n2: …and the tapped tile flips handoff → the failure register',
      tiles.find((x) => x.dest === 'photos')?.reg === 'failed'
      && tiles.find((x) => x.dest === 'photos')?.subKey === 'playback.destFailed',
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.subKey}`)));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // 4o (GH-255 review r1 P2): the acknowledgement may only claim a HANDOFF the
    // route actually made. `deliver()` returns before the FileReader resolves,
    // so the legacy obPhotos / obShare routes now forward `onDrop` too — an
    // OVER-CAP blob is refused in b64Post's pre-flight and never posts, and the
    // tile must state that failure instead of a success-coloured "Handed off"
    // beside a shared row that says "clip too large".
    await chrome.eval(`(() => {
      delete window.__obSaveVideo;
      window.__pbPosts = [];
      window.webkit = { messageHandlers: { obPhotos: {
        postMessage: (m) => window.__pbPosts.push({ tag: 'photos', ...m }) } } };
      window.__export.renderDrill = async (records, opts) => {
        opts.onProgress?.(60, 60, 16);
        const b = new Blob([new Uint8Array(64)], { type: 'video/mp4' });
        // a real 400 MB Blob would be absurd in a gate; the cap is read off
        // blob.size, so shadow that ONE getter and keep the bytes tiny
        Object.defineProperty(b, 'size', { value: 400 * 1024 * 1024 });
        return { blob: b, size: b.size, frames: 60, clipSec: 1, ext: 'mp4',
          wallSec: 0.1, segments: [60], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4o: card open');
    await confirmClip(chrome, '4o');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4o: destinations armed');
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=photos]").click()');
    await sleep(400);
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4o: an over-cap blob that never posted paints the FAILURE register on '
      + 'its tile — never the handoff acknowledgement',
      await chrome.eval('window.__pbPosts.length') === 0
      && tiles.find((x) => x.dest === 'photos')?.reg === 'failed'
      && tiles.find((x) => x.dest === 'photos')?.subKey === 'playback.destFailed'
      && /too large/.test(await chrome.eval(
        `document.querySelector('.ob-pb-ptext span')?.textContent ?? ''`)),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.subKey}`))
      + ' row=' + await chrome.eval(
        `JSON.stringify(document.querySelector('.ob-pb-ptext span')?.textContent)`));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // 4p (GH-255 review r1 P2): a SUPERSEDED attempt paints nothing. The
    // hint-less bridge route never latches, so its tiles stay armed while the
    // FileReader is still reading and a second tap starts a second attempt at
    // the SAME paintGen — the generation gate cannot tell them apart, and the
    // first attempt's late no-post callback used to stamp ITS failure over the
    // tile the user tapped afterwards. Both taps go out in ONE eval so no
    // FileReader can resolve between them; the `files` bridge THROWS, which is
    // the 'dropped' kind, and it lands after `photos` has already resolved.
    await chrome.eval(`(() => {
      delete window.__obSaveVideo;
      window.__pbPosts = [];
      window.webkit = { messageHandlers: { obSaveVideo: { postMessage: (m) => {
        if (m.dest === 'files') throw new Error('bridge refused');
        window.__pbPosts.push(m);
      } } } };
      window.__export.renderDrill = async (records, opts) => {
        opts.onProgress?.(60, 60, 16);
        return { blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }),
          size: 64, frames: 60, clipSec: 1, ext: 'mp4', wallSec: 0.1,
          segments: [60], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4p: card open');
    await confirmClip(chrome, '4p');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4p: destinations armed');
    await chrome.eval(`(() => {
      document.querySelector('.ob-pb-dest[data-dest=files]').click();
      document.querySelector('.ob-pb-dest[data-dest=photos]').click();
      return true;
    })()`);
    await waitFor(chrome, 'window.__pbPosts?.length === 1', '4p: photos post landed');
    await sleep(500); // let the superseded files attempt's throw unwind
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4p: the SUPERSEDED attempt\'s late failure paints nothing — the state '
      + 'stays on the tile the user tapped last',
      tiles.find((x) => x.dest === 'photos')?.reg === 'done'
      // the hint-less BRIDGE route keeps the recorded optimistic verdict
      // (playback.saved), not the fire-and-forget handoff wording of 4n
      && tiles.find((x) => x.dest === 'photos')?.subKey === 'playback.saved'
      && tiles.find((x) => x.dest === 'files')?.reg === 'rest'
      && tiles.find((x) => x.dest === 'files')?.state === ''
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saved')`),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.subKey}`)));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // 4q (GH-255 review r2 P2): NOTHING may claim a handoff before the post
    // LEAVES. `deliver()` returns while the FileReader is still reading, and on
    // a phone-sized clip that read runs for seconds — so an acknowledgement
    // painted at click time claimed a delivery that had not happened, and if
    // the read then failed after the card closed there was nothing left to
    // correct it. The read is HELD OPEN here (a controllable FileReader stub —
    // the one instrument that can stop time inside b64Post) so the in-flight
    // window is measurable instead of a 40 ms race.
    await chrome.eval(`(() => {
      delete window.__obSaveVideo;
      window.__pbPosts = [];
      window.webkit = { messageHandlers: { obPhotos: {
        postMessage: (m) => window.__pbPosts.push({ tag: 'photos', ...m }) } } };
      window.__realFR = window.FileReader;
      window.__pbReads = []; // pending reads, released one at a time
      window.FileReader = class {
        constructor() { this.result = null; this.onload = null; this.onerror = null; }
        readAsDataURL(b) {
          window.__pbReads.push(() => {
            this.result = 'data:' + (b.type || '') + ';base64,QUJD';
            this.onload?.();
          });
        }
      };
      window.__export.renderDrill = async (records, opts) => {
        opts.onProgress?.(60, 60, 16);
        return { blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }),
          size: 64, frames: 60, clipSec: 1, ext: 'mp4', wallSec: 0.1,
          segments: [60], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4q: card open');
    await confirmClip(chrome, '4q');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4q: destinations armed');
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=photos]").click()');
    await waitFor(chrome, 'window.__pbReads?.length === 1', '4q: read in flight');
    await sleep(300);
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4q: while the post is still being READ the tile says WORKING — it may '
      + 'not claim a handoff that has not happened',
      await chrome.eval('window.__pbPosts.length') === 0
      && tiles.find((x) => x.dest === 'photos')?.reg === 'working'
      && tiles.find((x) => x.dest === 'photos')?.subKey === 'playback.saving'
      && tiles.find((x) => x.dest === 'photos')?.busy === 'true'
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saving')`),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.subKey}`))
      + ' row=' + await chrome.eval(
        `JSON.stringify(document.querySelector('.ob-pb-ptext span')?.textContent)`));
    await chrome.eval('window.__pbReads.shift()(); true'); // release the read
    await waitFor(chrome, 'window.__pbPosts?.length === 1', '4q: the post left');
    await sleep(300);
    await parkPointer(chrome);
    tiles = await destTiles(chrome);
    check('4q: the acknowledgement lands WITH the post, on that tile, and the '
      + 'shared row takes its recorded optimistic Saved at the same moment',
      tiles.find((x) => x.dest === 'photos')?.reg === 'done'
      && tiles.find((x) => x.dest === 'photos')?.subKey === 'playback.destHandoff'
      && tiles.find((x) => x.dest === 'photos')?.busy === null
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saved')`),
      JSON.stringify(tiles.map((x) => `${x.dest}:${x.reg}/${x.subKey}`)));
    await chrome.eval('window.FileReader = window.__realFR; delete window.__realFR;'
      + ' delete window.__pbReads; true');
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    // ---- arm 4k: the CHUNKED transfer (GH-256 — the build-12 device crash) ---
    // The v1 wire posted the WHOLE clip as one base64 string; measured in real
    // WebKit that costs ~4.1x the file size in the app process alone (a 90 MiB
    // clip took it 36.6 -> 403.8 MB) and ~13x across the three processes — a
    // jetsam kill on a phone, i.e. the reported 闪退. This arm asserts the
    // MECHANISM: with the shell advertising `chunk`, no whole-file string ever
    // crosses postMessage, every chunk is BOUNDED, only ONE is ever in flight
    // (the awaited reply is the backpressure), and the reassembled bytes are
    // byte-identical to the clip. The v1 arms above keep gating the degrade.
    const CLIP_BYTES = 2_500_000; // spans 4 chunks at 768 KiB
    // the PREVIOUS card's node survives its exit tween, and a stale tile
    // there is dead (closeCard released the blob) — wait for the DOM to
    // drain or every `.ob-pb-dest` query below resolves to the fading card
    await cardNodeGone(chrome, '4k');
    await chrome.eval(`(() => {
      window.__pbV1Posts = [];
      window.__pbStream = { ops: [], b64: '', maxChunkChars: 0,
        inFlight: 0, maxInFlight: 0, padInNonFinal: 0 };
      const S = window.__pbStream;
      window.webkit = { messageHandlers: {
        // the v1 handler stays PRESENT and must stay UNUSED
        obSaveVideo: { postMessage: (m) => window.__pbV1Posts.push(m) },
        obSaveVideoStream: { postMessage: (m) => new Promise((res) => {
          S.inFlight += 1;
          S.maxInFlight = Math.max(S.maxInFlight, S.inFlight);
          S.ops.push({ op: m.op, v: m.v, name: m.name, seq: m.seq,
            dest: m.dest, mime: m.mime, bytes: m.bytes, chunks: m.chunks,
            len: m.b64 ? m.b64.length : 0 });
          if (m.op === 'chunk') {
            S.maxChunkChars = Math.max(S.maxChunkChars, m.b64.length);
            if (S.padEnded) S.padInNonFinal += 1; // a chunk AFTER a padded one
            if (m.b64.endsWith('=')) S.padEnded = true;
            S.b64 += m.b64;
          }
          setTimeout(() => { S.inFlight -= 1; res({ ok: true }); }, 8);
        }) },
      } };
      window.__obSaveVideo = { v: 1, chunk: 786432, dests: ['photos', 'files'] };
      // a deterministic clip whose bytes we can compare against
      const bytes = new Uint8Array(${CLIP_BYTES});
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
      window.__pbClip = bytes;
      window.__export.renderDrill = async (records, opts) => {
        opts.onProgress?.(60, 60, 16);
        return { blob: new Blob([bytes], { type: 'video/mp4' }),
          size: bytes.length, frames: 60, clipSec: 1, ext: 'mp4',
          wallSec: 0.1, segments: [60], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4k: card open');
    await confirmClip(chrome, '4k');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4k: destinations armed');
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome,
      'window.__pbStream.ops.some((o) => o.op === "end")',
      '4k: the chunked transfer completed', 200, 100);
    const S = await chrome.eval(`(() => {
      const S = window.__pbStream;
      const ops = S.ops;
      const chunks = ops.filter((o) => o.op === 'chunk');
      // reassemble and compare against the clip, byte for byte
      const bin = atob(S.b64);
      let same = bin.length === window.__pbClip.length;
      if (same) {
        for (let i = 0; i < bin.length; i++) {
          if (bin.charCodeAt(i) !== window.__pbClip[i]) { same = false; break; }
        }
      }
      return {
        v1Posts: window.__pbV1Posts.length,
        seq: ops.map((o) => o.op).join(','),
        seqs: chunks.map((o) => o.seq).join(','),
        begin: ops[0], end: ops[ops.length - 1],
        clip: window.__pbClip.length,
        wholeB64Chars: S.b64.length,
        maxChunkChars: S.maxChunkChars,
        maxInFlight: S.maxInFlight,
        padInNonFinal: S.padInNonFinal,
        bytesSame: same, decodedLen: bin.length,
      };
    })()`);
    check('4k: NOTHING crossed the v1 whole-string bridge (the crash path is '
      + 'dead when the shell advertises `chunk`)',
      S.v1Posts === 0, JSON.stringify({ v1Posts: S.v1Posts }));
    check('4k: the wire is begin -> chunk xN in order -> end '
      + `(${S.seq.slice(0, 60)})`,
      /^begin(,chunk){4}(,end)$/.test(S.seq) && S.seqs === '0,1,2,3'
      && S.begin.v === 2 && S.begin.bytes === S.clip
      && S.begin.mime === 'video/mp4' && S.begin.dest === 'files'
      && S.end.chunks === 4 && S.end.name === S.begin.name,
      JSON.stringify({ seq: S.seq, seqs: S.seqs, begin: S.begin, end: S.end }));
    check('4k: every chunk is BOUNDED — the biggest is the shell\'s advertised '
      + `ceiling (${S.maxChunkChars} chars), a fraction of the whole clip's `
      + `${S.wholeB64Chars}`,
      S.maxChunkChars <= 1_048_576
      && S.maxChunkChars < S.wholeB64Chars / 3,
      JSON.stringify({ max: S.maxChunkChars, whole: S.wholeB64Chars }));
    check('4k: at most ONE op in flight — the awaited reply IS the '
      + 'backpressure (no queued whole-clip burst)',
      S.maxInFlight === 1, String(S.maxInFlight));
    check('4k: padding appears only in the FINAL chunk (the chunk-wise vs '
      + 'whole-string decode parity law)', S.padInNonFinal === 0,
      String(S.padInNonFinal));
    check('4k: END-TO-END — the reassembled bytes are byte-identical to the '
      + `clip (${S.decodedLen} B)`,
      S.bytesSame === true && S.decodedLen === S.clip,
      JSON.stringify({ decodedLen: S.decodedLen, clip: S.clip }));
    check('4k: the awaited latch still holds (every tile disarmed behind '
      + 'Saving…, because only ob:save-video-result is the honest ack)',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`)
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')
        ?.textContent === window.__i18n.t('playback.saving')`));
    await chrome.eval(`(() => { const b = window.__pbStream.ops[0];
      if (!b) return false;
      window.dispatchEvent(new CustomEvent('ob:save-video-result',
        { detail: { ok: true, name: b.name, dest: b.dest } }));
      return true; })()`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4k: the shell result re-armed the card');
    check('4k: and it paints the localized Saved',
      await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saved')`));
    // 4k2: a REFUSED transfer (the shell rejects `begin`) unlatches and paints
    // the shell's OWN localized reason — no result event is coming
    await chrome.eval(`(() => {
      window.__pbStream.ops = [];
      window.webkit.messageHandlers.obSaveVideoStream.postMessage =
        (m) => { window.__pbStream.ops.push({ op: m.op });
          return Promise.reject(new Error('busy')); };
    })()`);
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4k2: the refused transfer unlatched the card');
    check('4k2: a refused transfer stops at `begin` and paints the shell\'s own '
      + 'honest reason (playback.saveBusy), never "Saved"',
      await chrome.eval('window.__pbStream.ops.length') === 1
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saveBusy')`),
      await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-ptext span")?.textContent ?? ""'));
    // 4k3: a shell WITHOUT `chunk` (or without the stream handler) still takes
    // the v1 post — the recorded degrade, and the ONLY path left to it
    await chrome.eval(`(() => {
      window.__pbV1Posts = [];
      window.__obSaveVideo = { v: 1, dests: ['photos', 'files'] }; // no chunk
    })()`);
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome, 'window.__pbV1Posts.length === 1',
      '4k3: the hint-without-chunk shell falls back to the v1 post');
    check('4k3: v1 degrade carries the whole clip in ONE b64 field (the '
      + 'measured crash path — reachable only on a shell that never '
      + 'advertised `chunk`)',
      await chrome.eval('window.__pbV1Posts[0].b64.length')
        > Math.floor(CLIP_BYTES * 4 / 3),
      String(await chrome.eval('window.__pbV1Posts[0].b64.length')));
    await chrome.eval(`(() => { const p = window.__pbV1Posts[0];
      if (!p) return false;
      window.dispatchEvent(new CustomEvent('ob:save-video-result',
        { detail: { ok: true, name: p.name, dest: p.dest } }));
      return true; })()`);
    await sleep(300);
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    // ---- arm 4k4: dest 'share' rides the CHUNKED bridge (GH-256 P1) ----------
    // The adversarial review measured the Share tile still shipping the v1
    // obShare whole-string post — verbatim the wire measured at +363.3 MB
    // app-process for a 90 MiB clip — because tile membership keyed on the
    // obShare handler's PRESENCE while only photos/files ever streamed.
    // Fixed law, both halves red-proofed: (a) HERE, a hint NAMING 'share'
    // renders the tile and the tap crosses as begin(dest='share')/chunks/end
    // with the obShare handler byte-idle and zero v1 posts; (b) in arms
    // 4/4f/4g above, a hint WITHOUT 'share' renders NO Share tile even
    // with obShare registered.
    await chrome.eval(`(() => {
      window.__pbV1Posts = [];
      window.__pbSharePosts = [];
      window.__pbStream = { ops: [] };
      const S = window.__pbStream;
      window.webkit = { messageHandlers: {
        obSaveVideo: { postMessage: (m) => window.__pbV1Posts.push(m) },
        obShare: { postMessage: (m) => window.__pbSharePosts.push(m) },
        obSaveVideoStream: { postMessage: (m) => new Promise((res) => {
          S.ops.push({ op: m.op, name: m.name, seq: m.seq, dest: m.dest,
            mime: m.mime, bytes: m.bytes, chunks: m.chunks });
          setTimeout(() => res({ ok: true }), 4);
        }) },
      } };
      window.__obSaveVideo = { v: 1, chunk: 786432,
        dests: ['photos', 'files', 'share'] };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '4k4: card open');
    await confirmClip(chrome, '4k4');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4k4: destinations armed');
    check('4k4: the streamed-share hint adds the Share tile',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .map((b) => b.dataset.dest).join(',')`) === 'photos,files,share');
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=share]").click()');
    await waitFor(chrome,
      'window.__pbStream.ops.some((o) => o.op === "end")',
      '4k4: the chunked share transfer completed', 200, 100);
    const S4 = await chrome.eval(`(() => {
      const ops = window.__pbStream.ops;
      return { seq: ops.map((o) => o.op).join(','),
        begin: ops[0], end: ops[ops.length - 1],
        v1Posts: window.__pbV1Posts.length,
        sharePosts: window.__pbSharePosts.length };
    })()`);
    check('4k4: the Share clip crossed in CHUNKS with dest=share — the '
      + 'obShare handler stayed byte-idle and NOTHING crossed the v1 post',
      /^begin(,chunk){4},end$/.test(S4.seq) && S4.begin.dest === 'share'
      && S4.begin.bytes === CLIP_BYTES && S4.end.chunks === 4
      && S4.v1Posts === 0 && S4.sharePosts === 0,
      JSON.stringify(S4));
    check('4k4: the awaited latch holds until the activity sheet reports '
      + '(every tile disarmed behind Saving…)',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`)
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')
        ?.textContent === window.__i18n.t('playback.saving')`));
    await chrome.eval(`(() => { const b = window.__pbStream.ops[0];
      if (!b) return false;
      window.dispatchEvent(new CustomEvent('ob:save-video-result',
        { detail: { ok: true, name: b.name, dest: 'share' } }));
      return true; })()`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '4k4: the sheet-completion result re-armed the card');
    check('4k4: and it paints the localized Saved',
      await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saved')`));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    await chrome.eval('window.__export.renderDrill = window.__pbInstant; true');
    await chrome.eval('delete window.webkit; delete window.__obSaveVideo;'
      + ' delete window.__pbSharePosts; true');
    await sleep(400);
    // 4r (GH-255 review r3 P2): the plain-web Share tile rides
    // `navigator.share()`, which is a PROMISE — and its rejection is not one
    // thing. The blanket `.catch(() => {})` this route used to carry was
    // written for "a user who dismisses the sheet did not hit a defect" (true,
    // and that is AbortError); every OTHER rejection means the sheet never
    // opened, so swallowing it acknowledged a handoff that did not happen. All
    // three outcomes are driven here against a controllable share() stub, with
    // the promise HELD OPEN first so the in-flight window is measured.
    await chrome.eval(`(() => {
      delete window.webkit; delete window.__obSaveVideo;
      window.__pbShares = [];
      const def = (k, v) => Object.defineProperty(navigator, k,
        { value: v, configurable: true, writable: true });
      window.__realShare = Object.getOwnPropertyDescriptor(navigator, 'share');
      window.__realCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
      def('canShare', () => true);
      def('share', () => new Promise((res, rej) => {
        window.__pbShares.push({ res, rej });
      }));
      window.__export.renderDrill = async (records, opts) => {
        opts.onProgress?.(60, 60, 16);
        return { blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }),
          size: 64, frames: 60, clipSec: 1, ext: 'mp4', wallSec: 0.1,
          segments: [60], montageRate: 1 };
      };
    })()`);
    const shareRound = async (tag, settle, want) => {
      await chrome.eval('window.__playback.save()');
      await waitFor(chrome, 'window.__playback.cardOpen() === true', `${tag}: card open`);
      await confirmClip(chrome, tag);
      await waitFor(chrome,
        'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
        `${tag}: destinations armed`);
      await chrome.eval('window.__pbShares = []; true');
      await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=share]").click()');
      await waitFor(chrome, 'window.__pbShares?.length === 1', `${tag}: share() called`);
      await sleep(250);
      await parkPointer(chrome);
      const held = (await destTiles(chrome)).find((x) => x.dest === 'share');
      check(`${tag}: while share() is still PENDING the tile says WORKING`,
        held?.reg === 'working' && held.subKey === 'playback.saving'
        && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
          === window.__i18n.t('playback.saving')`), JSON.stringify(held));
      await chrome.eval(settle);
      await sleep(350);
      await parkPointer(chrome);
      const done = (await destTiles(chrome)).find((x) => x.dest === 'share');
      check(`${tag}: ${want.why}`,
        done?.reg === want.reg && done.state === want.state
        && done.subKey === want.subKey
        && await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
          === (${want.row})`),
        JSON.stringify(done) + ' row=' + await chrome.eval(
          `JSON.stringify(document.querySelector('.ob-pb-ptext span')?.textContent)`));
      await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
      await sleep(400);
    };
    await shareRound('4r', 'window.__pbShares[0].res(); true',
      { reg: 'done', state: 'ob-pb-dest--done', subKey: 'playback.destHandoff',
        row: "window.__i18n.t('playback.saved')",
        why: 'a RESOLVED share() acknowledges the handoff on its own tile' });
    await shareRound('4r',
      `window.__pbShares[0].rej(Object.assign(new Error('x'),
        { name: 'AbortError' })); true`,
      { reg: 'rest', state: '', subKey: 'playback.dest.shareSub',
        row: "window.__i18n.t('export.cancelled')",
        why: 'an AbortError (the user dismissed the sheet) retires the tile to '
          + 'REST — their own decision is not a failure' });
    await shareRound('4r',
      `window.__pbShares[0].rej(Object.assign(new Error('x'),
        { name: 'NotAllowedError' })); true`,
      { reg: 'failed', state: 'ob-pb-dest--failed', subKey: 'playback.destFailed',
        // the generic honest fallback: 'save-failed' is not a shell code, so
        // saveErrorText() carries the machine token into playback.saveFailed
        row: "window.__i18n.t('playback.saveFailed', { code: 'save-failed' })",
        why: 'a NON-abort rejection (the sheet never opened) paints the honest '
          + 'failure — never a handoff' });
    await chrome.eval(`(() => {
      if (window.__realShare) Object.defineProperty(navigator, 'share', window.__realShare);
      else delete navigator.share;
      if (window.__realCanShare) {
        Object.defineProperty(navigator, 'canShare', window.__realCanShare);
      } else delete navigator.canShare;
      delete window.__realShare; delete window.__realCanShare; delete window.__pbShares;
      return true;
    })()`);
    await sleep(300);

    // ---- arm 3c: REAL save render from inside the player (no stub) -------------
    // The actual renderTimeline runs the trimmed 2-segment plan (staging
    // OTHER records under the open player) and its finally must restore the
    // staged record INTO the player: scrubbing keeps working afterwards and
    // the later 2b close still restores the live table. A width/height shim
    // keeps the encode tiny; every other opt is the player's own plan.
    const seam = await chrome.eval(`(() => {
      window.__playback.seek(window.__playback.state().total * 0.9);
      const st = window.__playback.state();
      return st.t - st.clock; // cum[1] — the shot-boundary seam
    })()`);
    await chrome.eval('window.__playback.setSpeed(1)');
    await chrome.eval(
      `window.__playback.setTrim(${seam - 0.35}, ${seam + 0.35})`);
    await chrome.eval(`window.__export.renderDrill = (recs, opts) =>
      window.__realRenderDrill(recs, { ...opts, width: 640, height: 360 })`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '3c: card open');
    await confirmClip(chrome, '3c');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '3c: real render delivered a blob (tiles armed)', 240, 500);
    check('3c: real render bar drove to done',
      /^100(\.0)?%$/.test(await chrome.eval(
        'document.querySelector(".ob-pb-bar > div")?.style.width ?? ""')));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    const after3c = await chrome.eval(`(() => {
      window.__playback.seek(0.5);
      const st = window.__playback.state();
      return { shot: st.shot, clock: st.clock, state: __test.state() };
    })()`);
    check('3c: player scrubs after the real render (in-player restore held)',
      after3c.shot === 0 && Math.abs(after3c.clock - 0.5) < 1e-6
      && after3c.state === 'PLAYBACK', JSON.stringify(after3c));

    // ---- arm 2b: close restores the live table ---------------------------------
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"', '2b: close re-settle', 60, 300);
    check('2b: chrome restored (ob-pb-live off, player gone)',
      await chrome.eval('!document.documentElement.classList.contains("ob-pb-live")'
        + ' && !document.getElementById("ob-pb-player")'));
    check('2b: machine restored to the pre-open state',
      await chrome.eval('__test.state()') === preState,
      `${await chrome.eval('__test.state()')} vs ${preState}`);
    check('2b: playback settles archived NOTHING (suspend held)',
      await chrome.eval('window.__archive.suspended()') === false
      && JSON.stringify(await chrome.eval('window.__archive.sessions()'))
        === JSON.stringify(preSessions));
    check('2b: the post-strike cue dies with the player (design 277 s3)',
      (await chrome.eval('__test.cuePostState()'))?.armed !== true);

    // ---- arm 3g: the FEASIBILITY boundary (review rounds 3+4 P2) ---------------
    // The settle beats are FIXED output frames and planPlayback contributes at
    // least ONE play frame per positive segment however high the montage rate
    // climbs, so 15(n-1) + 30 + n <= 3600 → 224 shots is the last plan that
    // can render. Past it renderDrill dies (beats-only throw, or the
    // convergence tripwire for 225..235) while the card used to quote a size
    // and an ETA. Both sides are gated. Driven by shimming __archive.records
    // to repeat the real record — the player only needs loadable record JSON.
    const sidBig = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    await chrome.eval(`(async () => {
      window.__pbRealRecs = window.__archive.records;
      window.__pbRec1 = (await window.__pbRealRecs(${sidBig}))[0];
      window.__export.renderDrill = async () => { window.__pbBigRender = true; };
    })()`);
    for (const [n, feasible] of [[224, true], [225, false]]) {
      await chrome.eval(`(() => { window.__archive.records = async () =>
        Array.from({ length: ${n} }, () => window.__pbRec1); })()`);
      await chrome.eval(`window.__playback.openSession(${sidBig})`);
      await waitFor(chrome, 'window.__playback.playerOpen() === true',
        `3g: ${n}-segment player open`, 160, 250);
      await chrome.eval('window.__playback.save()');
      await waitFor(chrome, 'window.__playback.cardOpen() === true',
        `3g: ${n}: card open`);
      await ctaArmed(chrome, feasible ? 60 : 10);
      const big = await chrome.eval(`(() => ({
        n: window.__playback.plan().records.length,
        line: document.querySelector('#ob-pb-card .ob-pb-estimate')?.textContent ?? '',
        tooLong: document.querySelector('#ob-pb-card .ob-pb-estimate')?.textContent
          === window.__i18n.t('playback.clipTooLongDur', { shots: ${n}, sec: 60,
            dur: window.__i18n.t('playback.durSec', { s: 60 }) }),
        cta: document.querySelector('#ob-pb-card .ob-pb-go')?.disabled,
        rendered: window.__pbBigRender === true,
      }))()`);
      check(`3g: ${n} included shots — ${feasible ? 'still feasible: a real '
        + 'estimate and an armed CTA' : 'infeasible: clipTooLong and a '
        + 'disabled CTA (no ETA for a render that only throws)'}`,
      big.n === n && big.rendered === false
        && big.tooLong === !feasible && big.cta === !feasible,
      JSON.stringify(big));
      await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
      await cardNodeGone(chrome, '3g');
      await chrome.eval('window.__playback.close()');
      await waitFor(chrome, 'window.__playback.playerOpen() === false',
        `3g: ${n}: player closed`);
      // openSession refuses unless the machine is back in AIM/BALL_IN_HAND —
      // the close re-stages the live table and that settle is asynchronous
      await waitFor(chrome, '["AIM","BALL_IN_HAND"].includes(__test.state())',
        `3g: ${n}: machine restored before the next open`, 80, 250);
      await sleep(500);
    }
    await chrome.eval(`(() => {
      window.__archive.records = window.__pbRealRecs;
      window.__export.renderDrill = window.__pbInstant;
      delete window.__pbBigRender;
    })()`);
    await sleep(400);

    // ---- arm 5: per-row delete (kit confirm) -----------------------------------
    await chrome.eval('window.__playback.open()');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '5: row back');
    await chrome.eval('document.querySelector(".ob-pb-del").click()');
    await waitFor(chrome, '!!document.querySelector("[data-ob=confirm-accept]")',
      '5: kit confirm up');
    await chrome.eval('document.querySelector("[data-ob=confirm-accept]").click()');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 0',
      '5: row deleted');
    check('5: delete emptied the archive',
      (await chrome.eval('window.__archive.sessions()')).length === 0);
    check('5: empty state returns after delete',
      await chrome.eval('!!document.querySelector("#ob-pb-panel .ob-pb-empty")'));
    await chrome.eval('window.__playback.close()');

    // ---- arm 3t: cue-life timeline tails + the mid-withdrawal trim law
    // (design 277 slice 3 PR-2 — the PR-1 deferred timeline surgery).
    // A cue overhang exists only when tHide outlives the record (a SHORT
    // shot: the D4 withdrawal starts at the rest event and outruns the
    // last event), so this arm seeds its OWN one-shot session with a soft
    // tap. The player timeline extends the segment by the probed overhang
    // (withdrawal frames to play in); the export extends PLAY time by the
    // same geometry (renderDrill's probe mirror). The trim law: an out
    // point INSIDE the withdrawal renders a frozen held out-frame — the
    // engine is a pure function of the frame clock, so the trimmed clip's
    // play prefix is byte-equal to the untrimmed render's and the held
    // tail never pops or advances.
    {
      await chrome.eval('__test.rerack(21)'); // fresh AIM bed (deterministic)
      // the SHORT record: a deterministic scratch (the cuepost-live-sheet
      // bih fixture) — the cue ball a short straight run from the foot
      // corner pocket rests in ~1.5 s, well inside the 3 s stay-down, so
      // tHide outlives the record and the segment carries a real tail (a
      // rolling tap rests in 4-5 s and legitimately probes 0)
      const fx = await chrome.eval(`(() => {
        const b = __test.bed();
        const px = b.tableWidth / 2, py = b.tableLength / 2;
        const cx = px - 0.35, cy = py - 0.35;
        __test.layout([{ id: 0, x: cx, y: cy }, { id: 9, x: 0, y: -0.4 }]);
        const phi = Math.atan2(px - cx, py - cy);
        __test.aim(phi);
        return { phi };
      })()`);
      const settled3t = await fire(chrome, '3t',
        { v0: 2.2, phi: fx.phi, theta: 0.06, a: 0, b: 0 });
      check('3t: scratch fixture settled', settled3t !== 'REJECTED'
        && settled3t !== 'PLAYBACK', String(settled3t));
      await chrome.eval('window.__archive.flush()');
      await waitFor(chrome,
        '(async () => (await window.__archive.sessions()).length === 1)()',
        '3t: session archived');
      const sid = await chrome.eval(
        '(async () => (await window.__archive.sessions())[0].id)()');
      check('3t: session opens straight into the player',
        await chrome.eval(`window.__playback.openSession(${JSON.stringify(sid)})`));
      const g = await chrome.eval('window.__playback.state()');
      check('3t: the timeline carries per-segment cue tails (ADDITIVE '
        + 'state field)', Array.isArray(g.tails)
        && g.tails.length === g.durs.length, JSON.stringify(g.tails));
      const sum = g.durs.reduce((s, d, i) => s + segEnd(g, i)
        + (g.beats[i] ?? 0), 0);
      check('3t: total == Σ(E_i + beats) (extension-inclusive geometry, GH-864)',
        Math.abs(sum - g.total) < 1e-6, `${sum} vs ${g.total}`);
      const ti = g.tails.findIndex((v) => v > 0.05);
      check('3t: the short record has withdrawal frames to play in '
        + '(the PR-1 deferred observation, resolved)', ti >= 0,
      JSON.stringify({ tails: g.tails, durs: g.durs }));
      if (ti >= 0) {
        // scrub INTO the tail: the cue stays armed and the withdrawal
        // MOVES on pixels while the balls hold the settled pose
        const tEnd = g.cum[ti] + g.durs[ti];
        const snap3t = async (T) => {
          await chrome.eval(`window.__playback.seek(${T})`);
          const { data } = await chrome.send('Page.captureScreenshot',
            { format: 'png' });
          return createHash('sha256').update(Buffer.from(data, 'base64'))
            .digest('hex');
        };
        const hEnd = await snap3t(tEnd);
        const hMid = await snap3t(tEnd + g.tails[ti] * 0.5);
        const cueSt3t = await chrome.eval('__test.cuePostState()');
        check('3t: the cue rides the tail (armed, plan alive past the '
          + 'record end)', cueSt3t?.armed === true
          && (cueSt3t?.plan?.tHide ?? 0) > g.durs[ti] + 0.05,
        JSON.stringify({ armed: cueSt3t?.armed, tHide: cueSt3t?.plan?.tHide }));
        check('3t: the withdrawal MOVES inside the tail (record-end frame '
          + '!= mid-tail frame)', hEnd !== hMid,
        `${hEnd.slice(0, 12)} vs ${hMid.slice(0, 12)}`);
        check('3t: tail scrub parity (seek(T) x2 byte-identical)',
          hMid === await snap3t(tEnd + g.tails[ti] * 0.5));
        // THE TRIM LAW on two REAL renders (320x180, hashed frames)
        const law = await chrome.eval(`(async () => {
          const st = window.__playback.state();
          const outT = ${(tEnd + g.tails[ti] * 0.5).toFixed(6)};
          window.__playback.setSpeed(1);
          window.__playback.setTrim(0, outT);
          const pA = window.__playback.plan();
          const a = await window.__realRenderDrill(pA.records, { ...pA.opts,
            width: 320, height: 180, hashFrames: true, keepBlob: false,
            noDownload: true, withAudio: false });
          window.__playback.setTrim(0, st.total);
          const pB = window.__playback.plan();
          const b = await window.__realRenderDrill(pB.records, { ...pB.opts,
            width: 320, height: 180, hashFrames: true, keepBlob: false,
            noDownload: true, withAudio: false });
          return { a: a.hashes, b: b.hashes, segA: a.segments,
            segB: b.segments, trimA: pA.opts.trims };
        })()`);
        const finalTailF = 30; // framestep.js TAIL_SEC 0.5 × 60
        const lastSegA = law.segA.length - 1;
        const playA = law.segA[lastSegA] - finalTailF;
        const offA = law.segA.slice(0, lastSegA).reduce((s, n) => s + n, 0);
        check('3t: the trimmed plan reaches INTO the tail (endT past the '
          + 'record duration — the belt/capability chain is real)',
        law.trimA[lastSegA].endT > g.durs[ti] + 0.05,
        JSON.stringify(law.trimA));
        let prefixEq = playA > 10;
        for (let k = 0; k < playA; k++) {
          if (law.a[offA + k] !== law.b[offA + k]) { prefixEq = false; break; }
        }
        check('3t: trim law — the play prefix is byte-equal to the '
          + 'untrimmed render (the engine is a pure function of the frame '
          + 'clock)', prefixEq, `first ${playA} frames of segment ${lastSegA}`);
        let heldEq = true;
        for (let k = playA; k < law.segA[lastSegA]; k++) {
          if (law.a[offA + k] !== law.a[offA + playA]) { heldEq = false; break; }
        }
        check('3t: trim law — the held out-frame is FROZEN through the '
          + 'settle tail (a cut mid-withdrawal never pops)', heldEq,
        `${law.segA[lastSegA] - playA} held frames`);

        // ---- arm 3t2 (GH-404, the staging-boundary law): the luminaire
        // fade's rate limiter is LIVE-VIEWPORT state and its residue must
        // never cross a player staging boundary. Pre-404, a live
        // above-plane excursion between sessions changed the BYTES of the
        // SAME seek — seek(T) rate-limited the lamp from whatever value
        // the excursion left (each entry a different image of one T)
        // instead of deriving it from the staged pose, which is exactly
        // how the two 3t parity checks above went red on pristine main
        // (the build-17 boot residue stood in for the excursion). Design:
        // TWO SYMMETRIC warm opens of the same session — a control
        // (close → reopen → seek) and a poisoned run (identical, plus a
        // live fade excursion to its SETTLED above-plane endpoint on real
        // RAF frames between them — the e2e-lighting F2 pose; settled 0,
        // never a mid-ramp race) — differing ONLY by the excursion. The
        // same seek must render the SCENE byte-equal.
        //   - Compared on the RAW COMPOSITED SCENE (DOM chrome hidden for
        //     the capture): the determinism law governs the rendered scene
        //     and the export path hashes canvas frames, never DOM. A
        //     full-viewport compare here trips a measured Chrome artifact
        //     OUTSIDE the app: with the scene sha256-identical across
        //     cycles (probed during GH-404), the kit glass tiles'
        //     backdrop-filter still re-rounds by 1 LSB after the
        //     excursion's compositor-layer churn. The in-session parity
        //     checks above stay full-viewport (no layer churn between
        //     their captures) — only this cross-session arm needs the
        //     scene-only lens.
        //   - Deliberately NOT referenced against the pre-close in-player
        //     frame: the trim-law eval above called __realRenderDrill
        //     DIRECTLY (no save-card lifecycle), so this player's cue arm
        //     is render-disarmed until the next staging boundary — a
        //     harness-path residue the fresh opens both clear.
        // scene/lampfade.js snapNext() + playback.js renderAtT are the
        // shipped mechanism.
        const tMid2 = tEnd + g.tails[ti] * 0.5;
        const sceneShot = async (T) => {
          await chrome.eval(`window.__playback.seek(${T})`);
          await chrome.eval(`(() => {
            window.__pb3t2Hid = [...document.body.children].filter((e) =>
              e.tagName !== 'CANVAS' && e.style.display !== 'none');
            window.__pb3t2Hid.forEach((e) => { e.__pb3t2D = e.style.display;
              e.style.display = 'none'; });
          })()`);
          await sleep(150); // style recalc + compositor commit
          const { data } = await chrome.send('Page.captureScreenshot',
            { format: 'png' });
          await chrome.eval(`(() => {
            (window.__pb3t2Hid ?? []).forEach((e) => {
              e.style.display = e.__pb3t2D; delete e.__pb3t2D; });
            window.__pb3t2Hid = [];
          })()`);
          return createHash('sha256').update(Buffer.from(data, 'base64'))
            .digest('hex');
        };
        await chrome.eval('window.__playback.close()');
        await waitFor(chrome, '__test.state() !== "PLAYBACK"',
          '3t2: control close re-settle', 60, 300);
        check('3t2: __lampfade seam present (the GH-404 boundary law is '
          + 'testable on this tree)', await chrome.eval(
          'typeof window.__lampfade?.value === "function"'));
        check('3t2: control re-open accepted', await chrome.eval(
          `window.__playback.openSession(${JSON.stringify(sid)})`));
        const hCtl2 = await sceneShot(tMid2);
        await chrome.eval('window.__playback.close()');
        await waitFor(chrome, '__test.state() !== "PLAYBACK"',
          '3t2: poison close re-settle', 60, 300);
        await chrome.eval('__test.camera(-2.4, 1.7, 0.6)');
        let vex = null;
        for (let i = 0; i < 30; i++) {
          vex = await chrome.eval('window.__lampfade?.value?.() ?? null');
          if (vex !== null && vex <= 0.02) break;
          await sleep(100);
        }
        check('3t2: the live excursion faded the luminaire on real RAF '
          + 'frames (the poison is real, settled — never a mid-ramp race)',
        vex !== null && vex <= 0.02, String(vex));
        check('3t2: warm re-open accepted', await chrome.eval(
          `window.__playback.openSession(${JSON.stringify(sid)})`));
        const hWarm2 = await sceneShot(tMid2);
        check('3t2: a live fade excursion between sessions never moves the '
          + 'scene bytes of the same seek (staging-boundary law — the fade '
          + 'is a pure function of the staged pose)', hWarm2 === hCtl2,
        `${hCtl2.slice(0, 12)} vs ${hWarm2.slice(0, 12)}`);
      }
      await chrome.eval('window.__playback.close()');
      await waitFor(chrome, '__test.state() !== "PLAYBACK"',
        '3t: close re-settle', 60, 300);
    }

    // ---- error gates ------------------------------------------------------------
    const appErr = await chrome.eval('__test.errors.slice()');
    check('armed arms: zero app errors', appErr.length === 0, JSON.stringify(appErr));
    check('armed arms: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 6: stale-module degradation (cache-poison contract) ----------------
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=stale`,
    { port: CDP + 1 });
  watch(chrome, errs);
  try {
    // 6a: a STALE playback.js (pre-Phase-C cached graph) must boot the app
    // with NO pill and zero errors — the e2e-settings SC-007 shape
    chrome.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      // GH-302 harness belt: an interception send can race the paused
      // request's death (the LAUNCH page's own late dynamic import gets
      // cancelled by the scripted Page.navigate) — "Invalid
      // InterceptionId" there is benign, and un-caught it kills the whole
      // node process; the arm's REAL assertions still gate the stub's
      // effect downstream.
      if (params.request.url.includes('app/playback.js')) {
        chrome.send('Fetch.fulfillRequest', {
          requestId: params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
          body: Buffer.from('export const stale = 1; // pre-030C cached leaf\n')
            .toString('base64'),
        }).catch(() => {});
      } else {
        chrome.send('Fetch.continueRequest', { requestId: params.requestId })
          .catch(() => {});
      }
    });
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*playback.js*' }] });
    await chrome.send('Network.enable');
    await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
    await navReady(chrome,
      `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=stale2`,
      'stale-module boot');
    await sleep(1500);
    check('6a: stale playback.js boots with NO pill, app alive',
      await chrome.eval('!document.getElementById("ob-playback")')
      && await chrome.eval('window.__test.ready === true'));
    check('6a: stale boot zero app errors',
      (await chrome.eval('__test.errors.slice()')).length === 0);
    await chrome.send('Fetch.disable');

    // 6b: FRESH playback.js over a stale export.js (renderDrill absent) —
    // the save flow fails honestly (localized notice, no crash)
    await navReady(chrome,
      `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=stale3`,
      'stale-export boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '6b: fresh playback seam');
    await fire(chrome, '6b: shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('6b: session exists', Number.isFinite(sid));
    check('6b: player opens via the seam',
      await chrome.eval(`window.__playback.openSession(${sid})`) === true);
    await chrome.eval('delete window.__export.renderDrill'); // stale export.js
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '6b: card open');
    await sleep(400);
    check('6b: stale export.js degrades to the honest failure notice',
      await chrome.eval(
        '/stale export\\.js/.test(document.querySelector(".ob-pb-ptext span")?.textContent ?? "")'));
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"', '6b: restore settle', 60, 300);
    const appErr = await chrome.eval('__test.errors.slice()');
    check('6b: zero app errors', appErr.length === 0, JSON.stringify(appErr));
    check('6: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 6c: ui/icons.js ABSENT — the text-fallback register (GH-242) --------
// icons.js is served as an EMPTY register (its OWN contract's "'' for unknown
// names" degrade), so every face() falls back to text. The mode face must NOT
// be the retired '·': that character was a pixel twin of the shipped practice
// `target` ring+bull, so an icons-less DEGRADE was indistinguishable from a
// legitimate practice row. Own browser on purpose — arm 6 already holds a
// Fetch handler that would continueRequest what this one fulfils.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=noico`,
    { port: CDP + 5 });
  watch(chrome, errs);
  try {
    chrome.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (/app\/ui\/icons\.js/.test(params.request.url)) {
        chrome.send('Fetch.fulfillRequest', {
          requestId: params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
          body: Buffer.from('export const ICON_NAMES = [];\n'
            + "export function iconHtml() { return ''; }\n"
            + 'export function icon() { return null; }\n').toString('base64'),
        }).catch(() => {}); // the 6a belt: a dead paused request is benign
      } else {
        chrome.send('Fetch.continueRequest', { requestId: params.requestId })
          .catch(() => {});
      }
    });
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*icons.js*' }] });
    await chrome.send('Network.enable');
    await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=noico2` });
    await waitReady(chrome, 'icons-absent boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '6c: __playback seam');
    await fire(chrome, '6c: shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    await chrome.eval(`(() => {
      const a = window.__archive;
      a.__realSession ??= a.session.bind(a);
      a.session = async (id) => ({ ...((await a.__realSession(id)) ?? {}),
        markers: [{ kind: 'shot', idx: 0, pots: [3], legal: false,
          fouls: ['scratch'] }, { kind: 'drill', ev: 'complete' }] });
      return true;
    })()`);
    await chrome.eval('window.__playback.open()');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '6c: one session row');
    await sleep(400);
    const nokit = await chrome.eval(`(() => {
      const panel = document.getElementById('ob-pb-panel');
      const txt = (s) => { const e = panel.querySelector(s); return e ? e.textContent : null; };
      return { anySvg: panel.querySelectorAll('svg').length,
        mode: txt('.ob-pb-row .ob-pb-face'),
        foul: txt('.ob-pb-marks .ob-pb-foul'),
        star: txt('.ob-pb-marks .ob-pb-star'),
        legendFoul: txt('.ob-pb-legend .ob-pb-foul'),
        legendStar: txt('.ob-pb-legend .ob-pb-star'),
        legendLabels: [...panel.querySelectorAll('.ob-pb-legend .ob-pb-lg')]
          .map((i) => i.lastElementChild.textContent) };
    })()`);
    // GH-668 B-K08: the face is the game disc / chip — pure DOM + ball
    // paint, so the icons-less boot renders the SAME face (the GH-242 '?'
    // degrade is retired with the mode glyphs it guarded)
    check('6c: the game face renders without icons.js — a number or chip, '
      + "never '?' and never the retired '·'",
      /^(\d{1,2}|[A-Z0-9.]{1,4})$/.test((nokit.mode ?? '').trim()),
      JSON.stringify(nokit));
    check('6c: foul + sparkle degrade to their text faces, zero inline SVG, '
      + 'and the legend still teaches',
      nokit.anySvg === 0 && nokit.foul === '✕' && nokit.star === '✦'
      && nokit.legendFoul === '✕' && nokit.legendStar === '✦'
      && nokit.legendLabels.length === 3
      && nokit.legendLabels.every((s) => s && s.trim().length),
      JSON.stringify(nokit));
    await chrome.send('Fetch.disable');
    const appErr = await chrome.eval('__test.errors.slice()');
    check('6c: zero app errors on the icons-absent path', appErr.length === 0,
      JSON.stringify(appErr));
    check('6c: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 6d: ui/icons.js REQUEST FAILED — the inlined pills must not care ----
// GH-246 defect 1. The request is FAILED (not fulfilled empty like 6c), so the
// guarded `import('./ui/icons.js')` REJECTS — the harder of the two allowed
// degrades. Every primary chrome pill must still render its REAL vector mark,
// and the markup must be byte-identical to what `iconHtml()` emits, which is
// why the expectation is computed HERE in node from ui/icons.js itself: a local
// inlined copy that drifts from the module fails this arm, not just the static
// web/tools/glyph-audit.mjs. The control assertion is the long tail — the panel
// head mark, which deliberately still routes through face() — reading its TEXT
// glyph, proving the block actually took effect. Own browser: arm 6/6c already
// hold Fetch handlers of their own.
{
  const errs = [];
  const PILLS = [
    ['#ob-playback', 'playback'], ['#ob-gear', 'gear'],
    ['#ob-help', 'help'], ['#ob-drills', 'target'],
  ];
  // #ob-rec-start is NOT here: GH-225 Phase D Part 2 retired the record dock
  // (the DVR is the recording surface now), so the coarse HUD's inlined glyphs
  // are the two nudge chevrons.
  const COARSE_PILLS = [
    ['#ob-nudge-ccw', 'chevron-left'], ['#ob-nudge-cw', 'chevron-right'],
  ];
  const expect = (list) => JSON.stringify(list.map(([sel, name]) =>
    [sel, name, iconHtml(name)]));
  const PROBE = (list) => `((rows) => rows.map(([sel, name, want]) => {
    const host = document.querySelector(sel);
    const svg = host?.querySelector('svg[data-icon="' + name + '"]') ?? null;
    // both sides through the SAME serializer so attribute/void-tag
    // normalisation cannot be mistaken for drift
    const holder = document.createElement('div');
    holder.innerHTML = want;
    return { sel, name, host: !!host, svg: !!svg,
      same: !!svg && svg.outerHTML === holder.firstElementChild.outerHTML,
      got: svg ? svg.outerHTML : (host ? host.textContent : null) };
  }))(${expect(list)})`;
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=noico3`,
    { port: CDP + 6 });
  watch(chrome, errs);
  try {
    let blocked = 0;
    chrome.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (/app\/ui\/icons\.js/.test(params.request.url)) {
        blocked++;
        chrome.send('Fetch.failRequest',
          { requestId: params.requestId, errorReason: 'Failed' })
          .catch(() => {}); // the 6a belt: a dead paused request is benign
      } else {
        chrome.send('Fetch.continueRequest', { requestId: params.requestId })
          .catch(() => {});
      }
    });
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*icons.js*' }] });
    await chrome.send('Network.enable');
    await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
    for (const register of ['desktop', 'coarse']) {
      if (register === 'coarse') await setPhoneMetrics(chrome, { width: 852, height: 393 });
      await chrome.send('Page.navigate',
        { url: `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=noico3-${register}` });
      await waitReady(chrome, `6d ${register}: icons-failed boot`);
      await waitFor(chrome, 'typeof window.__playback?.open === "function"',
        `6d ${register}: __playback seam`);
      const list = register === 'coarse' ? [...PILLS, ...COARSE_PILLS] : PILLS;
      // help.js / drills.js / touchwidgets.js install through their OWN nested
      // dynamic imports, which neither waitReady nor the __playback seam
      // awaits — a fixed sleep raced them on a loaded box and would have failed
      // a working build (review round 3 finding 4). POLL for the hosts instead;
      // the assertions below then judge CONTENT, never arrival.
      await waitFor(chrome,
        `[${list.map(([s]) => JSON.stringify(s)).join(',')}]`
        + '.every((s) => !!document.querySelector(s))',
        `6d ${register}: every audited control installed`, 150, 200);
      const got = await chrome.eval(PROBE(list));
      for (const r of got) {
        check(`6d ${register}: ${r.sel} renders its OWN inlined '${r.name}' mark, `
          + 'byte-identical to ui/icons.js iconHtml(), with icons.js FAILED',
          r.host && r.svg && r.same, JSON.stringify(r));
      }
    }
    check('6d: the ui/icons.js request really was failed', blocked > 0,
      `intercepts: ${blocked}`);
    // control: the long tail still degrades honestly (panel head mark = text)
    await chrome.eval('window.__playback.open()');
    await waitFor(chrome, '!!document.querySelector(".ob-pb-head .ob-pb-mark")',
      '6d: panel head mark');
    const tail = await chrome.eval(`(() => {
      const m = document.querySelector('.ob-pb-head .ob-pb-mark');
      return { svg: m.querySelectorAll('svg').length, text: m.textContent };
    })()`);
    check('6d control: the face()-routed panel head mark still degrades to its '
      + "TEXT glyph (so the block was real, and the '#49' doctrine survives)",
      tail.svg === 0 && tail.text === '▸', JSON.stringify(tail));
    await chrome.send('Fetch.disable');
    const appErr = await chrome.eval('__test.errors.slice()');
    check('6d: zero app errors on the icons-failed path', appErr.length === 0,
      JSON.stringify(appErr));
    // Chrome logs one network-level ERR_FAILED per navigation for the request
    // THIS ARM failed on purpose. That entry is the arm working; anything else
    // is a regression, so the two are counted separately rather than the whole
    // console-error law being relaxed for this arm.
    const deliberate = errs.filter((e) => /net::ERR_FAILED/.test(e));
    const other = errs.filter((e) => !/net::ERR_FAILED/.test(e));
    check('6d: the only console errors are the deliberately failed icons.js '
      + 'requests', other.length === 0 && deliberate.length > 0,
      `other: ${other.slice(0, 5).join(' | ')} | deliberate: ${deliberate.length}`);
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 6e: the playback mark's COUNTER, measured on PIXELS -----------------
// GH-246 defect 2. The claim is about what the RENDERER paints — "a replay ring
// wrapping a play triangle, with a visible counter between them at 20px" — so it
// is measured on the rasterised mark, not computed from the path data. The
// markup comes from the LIVE #ob-playback pill's own outerHTML, so what is
// judged is what shipped; Chrome rasterises it at the target device resolution
// and the arm reads pixels back:
//   * connected components of the ink (alpha >= 128, 8-neighbour). Exactly TWO
//     means the triangle and the ring/arrowhead do not touch anywhere — that IS
//     the "reads as a ring around a triangle, not a filled swirl" property, and
//     the shipped mark's own predecessor fails it;
//   * ANGULAR COVERAGE of the outer component around the triangle's centroid:
//     the mark is a 270-degree arc plus a tangential arrowhead, so the annulus
//     is deliberately OPEN (that is where the arrowhead lives) — the assertion
//     is therefore ">= 250 degrees of the sweep has ring ink beyond the
//     triangle", which is what "wraps" means for this glyph;
//   * the MINIMUM CLEAR GAP between the two components in device px.
// The pre-GH-246 geometry is measured in the SAME pass as the control, so the
// numbers are comparable and the improvement is proved rather than asserted.
{
  const errs = [];
  const OLD_PLAYBACK = '<path d="M4.9 10A5.1 5.1 0 1 0 10 4.9"/>'
    + '<path d="M11.8 3.2L10 4.9L11.7 6.7"/>'
    + '<path d="M8.5 7.8L12.4 10L8.5 12.2Z" fill="currentColor" stroke="none"/>';
  // (cssSize, why) — 20 is the toolbar pill in BOTH registers (the coarse pill
  // grows 34->44px but the glyph stays 20, so the coarse difference is DPR, not
  // size), 22 is the panel-head .ob-pb-mark, 13 is the small-size check.
  const SIZES = [[20, 'toolbar pill (both registers)'],
    [22, '.ob-pb-mark panel head'], [13, 'small-size robustness']];
  const DPRS = [1, 3];
  // Floors in DEVICE px. The pixel measurement is the CLEAR span between ink at
  // alpha>=128, so it reads a little under the geometric gap by construction
  // (the anti-aliased shoulder belongs to neither side). Each floor is placed
  // BETWEEN the shipped mark and the rejected one — the control below asserts
  // exactly that, so the floors are pinned to the defect instead of picked.
  //          shipped / pre-GH-246 (measured):
  //   20@1     3.000 / 1.236     22@1   3.000 / 1.828    13@1  1.828 / 1.000
  //   20@3     8.055 / 4.831     22@3   8.487 / 5.403    13@3  5.325 / 3.123
  const FLOOR = { '20@1': 2.0, '20@3': 6.5, '22@1': 2.4, '22@3': 7.0,
    '13@1': 1.4, '13@3': 4.4 };
  // The measured SVG is built from a LIVE element, not from path data plus a
  // synthetic wrapper: the wrapper is where viewBox, stroke-width and the
  // stroke geometry live, and CSS can override them (`#ob-playback svg` or
  // `.ob-pb-mark svg` could widen the stroke and close the counter). So the
  // arm clones the shipped element, keeps every authored attribute, and pins
  // the COMPUTED stroke-width / linecap / linejoin and a white currentColor
  // as inline style — a CSS override therefore lands in the raster.
  const LIVE_SVG = `((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const clone = el.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // currentColor -> white on a transparent canvas; fill/stroke ATTRIBUTES on
    // the children stay as authored so 'currentColor' still resolves
    clone.style.color = '#fff';
    clone.style.strokeWidth = cs.strokeWidth;
    clone.style.strokeLinecap = cs.strokeLinecap;
    clone.style.strokeLinejoin = cs.strokeLinejoin;
    return { markup: clone.outerHTML, strokeWidth: cs.strokeWidth,
      viewBox: el.getAttribute('viewBox'),
      box: (() => { const r = el.getBoundingClientRect();
        return { w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; })() };
  })`;
  const MEASURE = `(async (markup, cssSize, dpr) => {
    // re-size the cloned root to the size under test; everything else about it
    // is what the app shipped
    const svg = markup.replace(/\\swidth="[^"]*"/, ' width="' + cssSize + '"')
      .replace(/\\sheight="[^"]*"/, ' height="' + cssSize + '"');
    const px = Math.round(cssSize * dpr);
    const img = new Image(); // rasterise through Chrome's own SVG painter
    img.width = px; img.height = px;
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = () => rej(new Error('svg raster failed'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, px, px);
    g.drawImage(img, 0, 0, px, px);
    const data = g.getImageData(0, 0, px, px).data;
    const ink = new Uint8Array(px * px);
    for (let i = 0; i < px * px; i++) ink[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
    // 8-neighbour connected components
    const lab = new Int32Array(px * px).fill(-1);
    const comps = [];
    for (let s = 0; s < px * px; s++) {
      if (!ink[s] || lab[s] >= 0) continue;
      const id = comps.length;
      const cells = [];
      const stack = [s];
      lab[s] = id;
      while (stack.length) {
        const p = stack.pop();
        cells.push(p);
        const x = p % px, y = (p - x) / px;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= px || ny >= px) continue;
          const q = ny * px + nx;
          if (ink[q] && lab[q] < 0) { lab[q] = id; stack.push(q); }
        }
      }
      comps.push(cells);
    }
    const mid = Math.floor(px / 2) * px + Math.floor(px / 2);
    // the CORE is the component covering the glyph centre; if the centre pixel
    // itself is clear (a merged swirl can leave it so), fall back to the
    // component nearest the centre
    let core = comps.findIndex((cells) => cells.includes(mid));
    if (core < 0) {
      let bestD = Infinity;
      comps.forEach((cells, i) => {
        for (const p of cells) {
          const x = p % px, y = (p - x) / px;
          const d = Math.hypot(x - px / 2, y - px / 2);
          if (d < bestD) { bestD = d; core = i; }
        }
      });
    }
    const outer = comps.map((_, i) => i).filter((i) => i !== core);
    const xy = (p) => [p % px, Math.floor(p / px)];
    let gap = Infinity, at = null;
    if (core >= 0 && outer.length) {
      const A = comps[core];
      for (const i of outer) for (const q of comps[i]) {
        const [qx, qy] = xy(q);
        for (const p of A) {
          const [pxx, pyy] = xy(p);
          const d = Math.hypot(qx - pxx, qy - pyy);
          if (d < gap) { gap = d; at = [pxx, pyy, qx, qy]; }
        }
      }
    }
    // angular coverage: from the core's centroid, how much of the sweep has
    // OUTER ink beyond the core's own extent in that direction
    let cx = 0, cy = 0;
    if (core >= 0) {
      for (const p of comps[core]) { const [x, y] = xy(p); cx += x; cy += y; }
      cx /= comps[core].length; cy /= comps[core].length;
    }
    const outerSet = new Set();
    for (const i of outer) for (const p of comps[i]) outerSet.add(p);
    let covered = 0;
    const STEPS = 360;
    for (let k = 0; k < STEPS; k++) {
      const a = (k / STEPS) * 2 * Math.PI;
      const ux = Math.cos(a), uy = Math.sin(a);
      for (let r = 1; r < px; r += 0.5) {
        const x = Math.round(cx + ux * r), y = Math.round(cy + uy * r);
        if (x < 0 || y < 0 || x >= px || y >= px) break;
        if (outerSet.has(y * px + x)) { covered++; break; }
      }
    }
    return { px, components: comps.length, coreSize: core >= 0 ? comps[core].length : 0,
      outerSize: [...outerSet].length,
      gap: Number.isFinite(gap) ? +gap.toFixed(3) : null,
      clear: Number.isFinite(gap) ? +(gap - 1).toFixed(3) : null,
      at, coverageDeg: +(covered * 360 / STEPS).toFixed(1) };
  })`;
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=counter`,
    { port: CDP + 7 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, '6e: counter boot');
    await waitFor(chrome, '!!document.querySelector("#ob-playback svg")',
      '6e: the pill glyph');
    // BOTH shipped consumers of this glyph: the toolbar pill and the panel-head
    // mark. Each is measured through its OWN live element, so each one's CSS is
    // part of what is judged.
    await chrome.eval('window.__playback.open()');
    await waitFor(chrome, '!!document.querySelector(".ob-pb-head .ob-pb-mark svg")',
      '6e: the panel head mark');
    const live = await chrome.eval(`${LIVE_SVG}('#ob-playback svg')`);
    const head = await chrome.eval(`${LIVE_SVG}('.ob-pb-head .ob-pb-mark svg')`);
    await chrome.eval('window.__playback.close()');
    check("6e: the measured SVG is the LIVE pill's own element, wrapper included",
      !!live && live.markup.startsWith('<svg') && live.viewBox === '0 0 20 20'
      && live.markup.includes('<path'), JSON.stringify(live)?.slice(0, 160));
    check('6e: the panel-head mark resolves to the same glyph and viewBox '
      + '(the second shipped consumer, measured through its own element)',
      !!head && head.viewBox === '0 0 20 20'
      && head.markup.includes('data-icon="playback"'),
      JSON.stringify(head)?.slice(0, 160));
    console.log(`     6e live wrappers: pill stroke-width ${live.strokeWidth},`
      + ` box ${live.box.w}x${live.box.h}; panel-head stroke-width `
      + `${head.strokeWidth}, box ${head.box.w}x${head.box.h}`);
    for (const [size, why] of SIZES) {
      for (const dpr of DPRS) {
        // 22px is the panel-head consumer, so it is measured through THAT
        // element; 20 and 13 go through the pill's
        const src = size === 22 ? head : live;
        const now = await chrome.eval(
          `${MEASURE}(${JSON.stringify(src.markup)}, ${size}, ${dpr})`);
        const was = await chrome.eval(
          `${MEASURE}(${JSON.stringify(
            live.markup.replace(/><path[\s\S]*?<\/svg>$/,
              `>${OLD_PLAYBACK}</svg>`))}, ${size}, ${dpr})`);
        const floor = FLOOR[`${size}@${dpr}`];
        console.log(`     6e ${String(size).padStart(2)}px DPR${dpr} (${why}):`
          + ` clear ${now.clear} device px (${(now.clear / dpr).toFixed(2)} CSS)`
          + `, ${now.components} components, coverage ${now.coverageDeg} deg`
          + `  |  pre-GH-246: clear ${was.clear}, ${was.components} components`);
        check(`6e ${size}px DPR${dpr}: the triangle and the ring are SEPARATE `
          + 'ink components (not one filled swirl)',
          now.components === 2, JSON.stringify(now));
        check(`6e ${size}px DPR${dpr}: the ring wraps the triangle `
          + `(>= 250 deg of ring ink around it)`,
          now.coverageDeg >= 250, JSON.stringify(now));
        check(`6e ${size}px DPR${dpr}: clear counter ${now.clear} >= ${floor} `
          + 'device px', now.clear !== null && now.clear >= floor,
          JSON.stringify(now));
        check(`6e ${size}px DPR${dpr}: strictly better than the pre-GH-246 mark`
          + ` (${now.clear} > ${was.clear} device px)`,
          now.clear !== null && was.clear !== null && now.clear > was.clear,
          `now ${JSON.stringify(now)} was ${JSON.stringify(was)}`);
      }
    }
    // THE CONTROL that pins the floors: the mark the owner REJECTED must FAIL
    // every floor above. Without this the floors would be numbers someone
    // chose; with it they are the boundary between the rejected mark and the
    // shipped one, at every size and DPR, measured in the same pass.
    const oldMarkup = live.markup.replace(/><path[\s\S]*?<\/svg>$/,
      `>${OLD_PLAYBACK}</svg>`);
    const over = [];
    for (const [size, ] of SIZES) {
      for (const dpr of DPRS) {
        const was = await chrome.eval(
          `${MEASURE}(${JSON.stringify(oldMarkup)}, ${size}, ${dpr})`);
        const floor = FLOOR[`${size}@${dpr}`];
        if (!(was.clear < floor)) over.push(`${size}@${dpr}: ${was.clear} >= ${floor}`);
      }
    }
    check('6e control: the pre-GH-246 mark fails EVERY floor this arm enforces '
      + '(so the floors sit between the rejected mark and the shipped one, not '
      + 'at an arbitrary value)', over.length === 0, over.join('; '));
    // SECOND CONTROL — the arm must observe CSS, not just path data. A test-only
    // stylesheet widens the pill glyph's stroke; the measurement is re-taken
    // through the LIVE element, so the counter has to collapse under the floor.
    // Without this the wrapper could be synthetic and a stroke override would
    // close the counter on screen with the gate still green (review final round).
    await chrome.eval(`(() => {
      const st = document.createElement('style');
      st.id = 'ob-6e-probe';
      st.textContent = '#ob-playback svg { stroke-width: 3px }';
      document.head.appendChild(st);
      return true;
    })()`);
    const widened = await chrome.eval(`${LIVE_SVG}('#ob-playback svg')`);
    // measured at 20px DPR3 — the densest of the shipped cells, so the effect is
    // quantified rather than lost to a 20x20 grid's rounding
    const widenedMeasure = await chrome.eval(
      `${MEASURE}(${JSON.stringify(widened.markup)}, 20, 3)`);
    const cleanMeasure = await chrome.eval(
      `${MEASURE}(${JSON.stringify(live.markup)}, 20, 3)`);
    await chrome.eval(`document.getElementById('ob-6e-probe').remove()`);
    console.log('     6e css probe @20px DPR3: stroke-width '
      + `${live.strokeWidth} -> ${widened.strokeWidth}, clear `
      + `${cleanMeasure.clear} -> ${widenedMeasure.clear} device px `
      + `(floor ${FLOOR['20@3']})`);
    check('6e control: a CSS stroke-width override on the LIVE pill glyph '
      + 'collapses the measured counter under the floor — the arm reads the '
      + "rendered element's computed style, not just its path data",
      widened.strokeWidth !== live.strokeWidth
      && widenedMeasure.clear !== null
      && widenedMeasure.clear < cleanMeasure.clear
      && widenedMeasure.clear < FLOOR['20@3'],
      `widened ${JSON.stringify(widened.strokeWidth)} clear `
      + `${widenedMeasure.clear} vs live ${JSON.stringify(live.strokeWidth)} `
      + `clear ${cleanMeasure.clear}, floor ${FLOOR['20@3']}`);
    // and the pill is back to its shipped rendering afterwards
    const restored = await chrome.eval(`${LIVE_SVG}('#ob-playback svg')`);
    check('6e: the probe stylesheet is gone and the pill is back to its shipped '
      + 'stroke', restored.strokeWidth === live.strokeWidth,
      `${restored.strokeWidth} vs ${live.strokeWidth}`);
    const appErr = await chrome.eval('__test.errors.slice()');
    check('6e: zero app errors', appErr.length === 0, JSON.stringify(appErr));
    check('6e: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 7: REAL-INPUT reachability (hit-tested CDP input) -------------------
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 2 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'real-input boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '7: __playback seam');
    await fire(chrome, '7: shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');

    // 7a: a REAL tap on the pill opens the list
    await realClick(chrome, '#ob-playback', '7a: pill');
    await waitFor(chrome, 'window.__playback.isOpen() === true',
      '7a: list open (real pill tap)');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '7a: session row rendered');

    // 7b: z-ladder — the panel center hit-tests INSIDE the panel, never the
    // promoted backdrop (kit z:69 vs panel z:70 — the ea2af949 wall)
    const zPanel = await hitInside(chrome, '#ob-pb-panel');
    check('7b: elementFromPoint at the panel center resolves inside the panel',
      zPanel.ok, `hit: ${zPanel.hit}`);

    // 7c: filter chip real tap partitions
    await realClick(chrome, '.ob-pb-filters label[data-filter=practice]',
      '7c: practice chip');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 0',
      '7c: practice chip hides the match session (real tap)');
    await realClick(chrome, '.ob-pb-filters label[data-filter=all]', '7c: all chip');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '7c: all chip restores it (real tap)');

    // 7d: row real tap opens the player
    await realClick(chrome, '.ob-pb-row', '7d: row');
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '7d: player open (real row tap)');

    // 7e: card flow under real input — Save tap opens the card; Cancel real
    // tap aborts mid-render; a destination tile real tap posts the bridge.
    // Controllable render stub (arm 3c already gates the REAL engine; these
    // arms gate reachability): renderDrill parks until cancel resolves null,
    // exactly renderDrill's abort=no-partial contract.
    await chrome.eval(`(() => {
      window.__pbStub = {};
      window.__pbReal = { rd: window.__export.renderDrill,
        cancel: window.__export.cancel };
      window.__export.renderDrill = (records, opts) => new Promise((resolve) => {
        window.__pbStub.resolve = resolve;
        opts.onProgress?.(10, 60, 16);
      });
      window.__export.cancel = () => {
        window.__pbStub.cancelled = true;
        window.__pbStub.resolve?.(null);
      };
      window.__pbPosts = [];
      const h = (tag) => ({ postMessage: (m) => window.__pbPosts.push({ tag, ...m }) });
      window.webkit = { messageHandlers: {
        obSaveVideo: h('saveVideo'), obPhotos: h('photos'), obShare: h('share') } };
      window.__obSaveVideo = { v: 1, dests: ['photos', 'files'] }; // REAL shell shape
    })()`);
    await realClick(chrome, '#ob-pb-player .ob-pb-save', '7e: Save');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '7e: card open (real Save tap)');
    const zCard = await hitInside(chrome, '#ob-pb-card');
    check('7e: elementFromPoint at the card center resolves inside the card',
      zCard.ok, `hit: ${zCard.hit}`);
    // the confirm CTA is the new entry into every render: it must be
    // HIT-TESTED through the real input pipeline (the ea2af949 z-ladder wall
    // applies to it exactly like the tiles)
    check('7e: the card opens in SETUP — no render before the real Export tap',
      await chrome.eval('window.__pbStub.resolve === undefined'));
    check('7e: the CTA arms once the encoder probe settles',
      await ctaArmed(chrome) === true);
    const zGo = await hitInside(chrome, '#ob-pb-card .ob-pb-go');
    check('7e: elementFromPoint at the Export CTA resolves to the CTA',
      zGo.ok, `hit: ${zGo.hit}`);
    await realClick(chrome, '#ob-pb-card .ob-pb-go', '7e: Export');
    await waitFor(chrome, 'window.__pbStub.resolve !== undefined',
      '7e: real Export tap started the render');
    await waitFor(chrome,
      'document.querySelector("#ob-pb-card .ob-pb-progress")?.classList.contains("on")',
      '7e: the progress block is up');
    // mid-render: the bar runs on the parked stub — the Cancel button must be
    // REACHABLE by real input (at the old ladder dismissable=false swallowed
    // the tap and Cancel was a silent no-op)
    await realClick(chrome, '#ob-pb-card .ob-pb-ptext button', '7e: Cancel');
    await waitFor(chrome, 'window.__pbStub.cancelled === true',
      '7e: Cancel real tap aborted the render');
    await waitFor(chrome,
      '(document.querySelector(".ob-pb-bar > div")?.style.width ?? "") === "0%"',
      '7e: cancelled state reset the bar');
    // re-arm with an instant render → tiles; Files tile real tap → bridge post
    await chrome.eval(`window.__export.renderDrill = async (records, opts) => {
      opts.onProgress?.(60, 60, 16);
      return { blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }),
        size: 64, frames: 60, clipSec: 1, ext: 'mp4', wallSec: 0.1,
        segments: [60], montageRate: 1 };
    }`);
    await realClick(chrome, '#ob-pb-card .ob-pb-close', '7e: card close');
    await waitFor(chrome, 'window.__playback.cardOpen() === false',
      '7e: card closed (real ✕ tap)');
    await sleep(400); // kit exit fade — the old card node leaves the DOM
    await realClick(chrome, '#ob-pb-player .ob-pb-save', '7e: Save (re-arm)');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '7e: card reopened (real Save tap)');
    // GH-668 S5 replays vfix1 (anti-flake, tools-only): the re-opened card's
    // CTA arms when its encoder probe settles — the first pass waited for
    // it, this pass tapped at once and on a loaded box (load 50+) the real
    // tap landed on a still-disabled CTA: no render, "tiles armed never came
    // true" (2/2 on the lane tip, 0/1 on the base parity run — a race, not
    // a byte). Wait for the armed CTA before the re-arm tap.
    check('7e: the re-opened card\'s CTA arms before the re-arm Export tap (12 s budget)',
      await ctaArmed(chrome) === true);
    await realClick(chrome, '#ob-pb-card .ob-pb-go', '7e: Export (re-arm)');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '7e: tiles armed');
    await realClick(chrome, '.ob-pb-dest[data-dest=files]', '7e: Files tile');
    await waitFor(chrome, 'window.__pbPosts?.length === 1',
      '7e: destination tile real tap posted the bridge');
    const rPost = await chrome.eval(
      '(({ tag, dest, name, b64 }) => ({ tag, dest, name, len: b64?.length ?? 0 }))(window.__pbPosts[0])');
    check('7e: the tap routed Files through obSaveVideo',
      rPost.tag === 'saveVideo' && rPost.dest === 'files' && rPost.len > 0,
      JSON.stringify(rPost));
    // the awaited tap disarmed the tiles; the shell result re-arms — the
    // full disarm/re-arm cycle under REAL input (GH-225 contract)
    check('7e: awaited tap disarmed every tile (hint present)',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`));
    // GH-255 under REAL input: the working state lands on the TAPPED tile and
    // on no other. Arm 4k proves the same thing on the same pipeline; this arm
    // keeps it inside the reachability wall, where the tap is the only way in.
    let rTiles = await destTiles(chrome);
    check('7e: the real tap moved the working state onto the tapped tile only',
      rTiles.find((x) => x.dest === 'files')?.reg === 'working'
      && rTiles.filter((x) => x.dest !== 'files')
        .every((x) => x.reg === 'rest' && x.state === ''),
      JSON.stringify(rTiles.map((x) => `${x.dest}:${x.reg}`)));
    await chrome.eval(`window.dispatchEvent(new CustomEvent('ob:save-video-result',
      { detail: { ok: true, name: ${JSON.stringify(rPost.name ?? 'clip.mp4')},
        dest: 'files' } })); true`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '7e: shell result re-armed the tiles');
    await parkPointer(chrome); // the re-armed tile is under the pointer that
    // tapped it, and the done state legally walks its own hover rung there
    rTiles = await destTiles(chrome);
    check('7e: the matching ok result resolved SUCCESS on that same tile',
      rTiles.find((x) => x.dest === 'files')?.reg === 'done'
      && rTiles.filter((x) => x.dest !== 'files').every((x) => x.reg === 'rest'),
      JSON.stringify(rTiles.map((x) => `${x.dest}:${x.reg}`)));
    await realClick(chrome, '#ob-pb-card .ob-pb-close', '7e: card close 2');
    await waitFor(chrome, 'window.__playback.cardOpen() === false',
      '7e: card closed again');
    await chrome.eval(`(() => {
      delete window.webkit;
      delete window.__obSaveVideo;
      window.__export.renderDrill = window.__pbReal.rd;
      window.__export.cancel = window.__pbReal.cancel;
      return true;
    })()`);
    await sleep(400);

    // 7f: back pill real tap → player closes, list returns
    await realClick(chrome, '#ob-pb-player .ob-pb-pillico', '7f: back');
    await waitFor(chrome, 'window.__playback.playerOpen() === false',
      '7f: player closed (real back tap)');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"', '7f: live re-settle', 60, 300);
    await waitFor(chrome, 'window.__playback.isOpen() === true'
      + ' && document.querySelectorAll(".ob-pb-row").length === 1',
      '7f: list back with the row');

    // 7g: keyboard arm — focus the per-row delete ✕, REAL Enter opens the
    // CONFIRM (e9acbf79: the row handler must not steal the button's key)
    await chrome.eval('document.querySelector(".ob-pb-del").focus()');
    await realEnter(chrome);
    await waitFor(chrome, '!!document.querySelector("[data-ob=confirm-accept]")',
      '7g: focused delete ✕ + Enter opened the confirm');
    check('7g: Enter did NOT open the player (delete ≠ activate)',
      await chrome.eval('window.__playback.playerOpen()') === false);
    await realClick(chrome, '[data-ob=confirm-cancel]', '7g: confirm cancel');
    await waitFor(chrome, '!document.querySelector("[data-ob=confirm-accept]")',
      '7g: confirm dismissed');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '7g: row kept after cancel');

    // 7h: per-row delete real tap → confirm accept deletes the session
    await realClick(chrome, '.ob-pb-del', '7h: delete ✕');
    await waitFor(chrome, '!!document.querySelector("[data-ob=confirm-accept]")',
      '7h: delete ✕ real tap opened the confirm');
    await realClick(chrome, '[data-ob=confirm-accept]', '7h: confirm accept');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 0',
      '7h: row deleted (real input end-to-end)');
    check('7h: archive emptied',
      (await chrome.eval('window.__archive.sessions()')).length === 0);
    await realClick(chrome, '#ob-pb-panel .ob-pb-close', '7: list close');
    await waitFor(chrome, 'window.__playback.isOpen() === false',
      '7: list closed (real ✕ tap)');

    const appErr = await chrome.eval('__test.errors.slice()');
    check('7: zero app errors', appErr.length === 0, JSON.stringify(appErr));
    check('7: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 8: card/list STRUCTURE on the phone geometry -----------------------
// The owner's three save-card defects, gated where they actually bit: a
// coarse 852x393 boot (the playable phone orientation — the app gates
// portrait behind rotate-to-play) is the one geometry where the card body
// really overflows.
//   8a pinned head: after scrolling the card body to the BOTTOM the head and
//      its ✕ are still inside the card AND elementFromPoint at the ✕ centre
//      resolves to the ✕ (defect B — the whole card used to be the scroller).
//   8b the session-list panel keeps the same property (regression lock).
//   8c the resolution picker is the KIT combobox, its popover opens by real
//      pointer, every option centre hit-tests inside the list, and committing
//      720 flows to the plan WITHOUT rendering (defects A + C, the GH-36/238
//      clamp findings inside a z:70 modal).
//   8d zero native-styled controls anywhere in the card or the list (the same
//      rule e2e-ui --audit's walker applies).
//   8e coarse tap floors on the new controls.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 3 });
  watch(chrome, errs);
  try {
    // coarse must be live BEFORE the app boots (main.js reads the media query
    // once) — the e2e-touch frozen recipe
    await setPhoneMetrics(chrome, { width: 852, height: 393 });
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=phone` });
    await waitReady(chrome, 'phone boot');
    await sleep(1200);
    check('8: coarse phone boot',
      await chrome.eval(`matchMedia('(pointer: coarse)').matches`) === true);
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '8: __playback seam');
    await fire(chrome, '8: shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid8 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('8: session archived', Number.isFinite(sid8));
    check('8: player opens via the seam',
      await chrome.eval(`window.__playback.openSession(${sid8})`) === true);
    // 8f (GH-275): the POV tile is a PHONE tile — the measured tile-band
    // ruling says 4 tiles + speed detents + a lit montage chip fit the
    // 852x393 row with ~190 px slack, so the 4th tile must be visible,
    // inside the shelf row, wear the 48px coarse floor, and leave the
    // speed detents untouched (no wrap, no clipping). GH-301 adds the
    // compound `CAM ▾` slot pill as a FIFTH phone tile (contract §3.3 —
    // the re-measured budget: 738/798 px worst case, arm 16); the census
    // waits for the strip leaf so the count is deterministic.
    await waitFor(chrome, 'window.__playback.strip?.()?.mounted?.() === true',
      '8f: strip leaf mounted (the 5th tile exists)');
    await sleep(400);
    const shelf8 = await chrome.eval(`(() => {
      const row = document.querySelector('.ob-pb-row1');
      const pov = row?.querySelector('.ob-pb-cam[data-cam="pov"]');
      if (!row || !pov) return { err: 'no row1/pov tile' };
      const rr = row.getBoundingClientRect(), pr = pov.getBoundingClientRect();
      const speed = row.querySelector('.ob-pb-speed')?.getBoundingClientRect();
      const cams = [...row.querySelectorAll('.ob-pb-cam')]
        .filter((b) => b.getClientRects().length
          && getComputedStyle(b).display !== 'none');
      const l = pov.querySelector('.ob-pb-cam-l');
      return { phoneCams: cams.length, h: +pr.height.toFixed(1),
        inRow: pr.left >= rr.left - 1 && pr.right <= rr.right + 1
          && pr.top >= rr.top - 1 && pr.bottom <= rr.bottom + 1,
        speedInRow: !!speed && speed.right <= rr.right + 1
          && speed.top >= rr.top - 1 && speed.bottom <= rr.bottom + 1,
        labelFits: !!l && l.scrollWidth <= l.clientWidth + 1 };
    })()`);
    check('8f: the POV tile joins the phone shelf (4 preset tiles + the '
      + 'GH-301 compound CAM ▾ pill = 5, 48px floor, row intact — the '
      + 'GH-275 tile-band ruling + the §3.3 re-measure)',
      shelf8.phoneCams === 5 && shelf8.h >= 48 && shelf8.inRow === true
      && shelf8.speedInRow === true && shelf8.labelFits === true,
      JSON.stringify(shelf8));
    // a capture spy proves 8c changes nothing behind the user's back
    await chrome.eval(`(() => {
      window.__pbReal8 = window.__export.renderDrill;
      window.__export.renderDrill = async (records, opts) => {
        window.__pbCapture = { height: opts.height, width: opts.width };
        opts.onProgress?.(60, 60, 16);
        return { blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }),
          size: 64, frames: 60, clipSec: 1, ext: 'mp4', wallSec: 0.1,
          segments: [60], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '8: card open');
    await sleep(500);

    // 8a: the pinned head survives a scroll to the very bottom
    const pinned = await chrome.eval(`(() => {
      const card = document.getElementById('ob-pb-card');
      const body = card.querySelector('.ob-pb-card-body');
      if (!body) return { err: 'no .ob-pb-card-body scroll region' };
      body.scrollTop = body.scrollHeight;
      // ALSO try to scroll the card itself: on the defective frame the card
      // was the scroller and this is exactly what dragged the ✕ out of reach
      card.scrollTop = card.scrollHeight;
      const head = card.querySelector('.ob-pb-card-head');
      const x = card.querySelector('.ob-pb-close');
      const cr = card.getBoundingClientRect();
      const hr = head.getBoundingClientRect(), xr = x.getBoundingClientRect();
      const hit = document.elementFromPoint(xr.x + xr.width / 2, xr.y + xr.height / 2);
      return {
        overflowed: body.scrollHeight - body.clientHeight > 8,
        scrolled: body.scrollTop,
        headInside: hr.top >= cr.top - 1 && hr.bottom <= cr.bottom + 1,
        xInside: xr.top >= cr.top - 1 && xr.bottom <= cr.bottom + 1,
        hitIsX: !!hit && (hit === x || x.contains(hit)),
        hit: hit ? (hit.id || hit.getAttribute('class') || hit.tagName) : 'none',
        footPinned: (() => {
          const f = card.querySelector('.ob-pb-card-foot');
          const fr = f?.getBoundingClientRect();
          return !!fr && fr.bottom <= cr.bottom + 1 && fr.top >= cr.top;
        })(),
      };
    })()`);
    check('8a: the card body actually overflows at 852x393 (the owner case)',
      pinned.overflowed === true && pinned.scrolled > 0, JSON.stringify(pinned));
    check('8a: head + ✕ stay inside the card after scrolling to the bottom',
      pinned.headInside === true && pinned.xInside === true, JSON.stringify(pinned));
    check('8a: elementFromPoint at the ✕ centre still resolves to the ✕',
      pinned.hitIsX === true, `hit: ${pinned.hit}`);
    check('8a: the progress/CTA foot stays pinned too',
      pinned.footPinned === true, JSON.stringify(pinned));

    // 8c: kit combobox + popover reachability INSIDE the z:70 modal
    // (8a left the body scrolled to the bottom — bring the Advanced row back
    // into the scroll viewport or the real pointer lands on clipped content)
    await chrome.eval(`(() => {
      document.querySelector('#ob-pb-card .ob-pb-card-body').scrollTop = 0;
      document.querySelector('#ob-pb-card .ob-pb-adv').click();
    })()`);
    await sleep(300);
    // anchor the scroll on the PICKER ROW, not the advRow container
    // (GH-475: the grid gained the annotation knob rows — centering the
    // now-taller container parks the resolution row under the pinned
    // head and the real tap lands on it; the arm's subject is the
    // picker, and a user reaches it by scrolling exactly this row in)
    await chrome.eval(`document.querySelector('#ob-pb-card [data-ob=select-button]')
      ?.scrollIntoView({ block: 'center' })`);
    await sleep(200);
    const kitSel = await chrome.eval(`(() => {
      const s = document.querySelector('#ob-pb-card select');
      if (!s) return { err: 'no resolution select in the card' };
      const b = s.nextElementSibling;
      return { hidden: !!s.hidden, kit: b?.dataset?.ob === 'select-button',
        expanded: document.querySelector('#ob-pb-card .ob-pb-adv')
          ?.getAttribute('aria-expanded') };
    })()`);
    check('8c: the resolution picker is the KIT combobox (native hidden, '
      + 'value-authoritative)',
      kitSel.hidden === true && kitSel.kit === true, JSON.stringify(kitSel));
    check('8c: the Advanced disclosure carries aria-expanded',
      kitSel.expanded === 'true', JSON.stringify(kitSel));
    await realClick(chrome, '#ob-pb-card [data-ob=select-button]', '8c: combobox');
    await sleep(400);
    const pop = await chrome.eval(`(() => {
      const list = document.querySelector('[data-ob=select-list]');
      if (!list) return { open: false };
      const misses = [];
      for (const li of list.children) {
        const r = li.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!hit || !list.contains(hit)) {
          misses.push(li.textContent + ' -> '
            + (hit ? (hit.id || String(hit.className).slice(0, 20)) : 'null'));
        }
      }
      const lr = list.getBoundingClientRect();
      return { open: true, n: list.children.length, misses,
        inViewport: lr.top >= 0 && lr.bottom <= window.innerHeight
          && lr.left >= 0 && lr.right <= window.innerWidth };
    })()`);
    check('8c: the popover opens by REAL pointer inside the modal and every '
      + 'option centre hit-tests inside it',
      pop.open === true && pop.n > 0 && !pop.misses?.length
      && pop.inViewport === true, JSON.stringify(pop));
    // REAL tap with bounded re-measure (2026-08-02 load flake): the option
    // coordinates can go STALE between the measuring eval and the input
    // dispatches (late async layout under load shifts the popover), the
    // press lands beside the option and the popover dismisses without a
    // commit. Same real-input pipeline, re-measured per attempt; a missed
    // tap that closed the popover reopens it through the same REAL entry.
    let committed8c = false;
    for (let attempt = 0; attempt < 3 && !committed8c; attempt++) {
      const committed = await chrome.eval(`(() => {
        const list = document.querySelector('[data-ob=select-list]');
        const li = [...(list?.children ?? [])].find((l) => l.textContent === '720p');
        if (!li) return { err: 'no 720p option' };
        const r = li.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`);
      if (!committed?.x) {
        await realClick(chrome, '#ob-pb-card [data-ob=select-button]',
          '8c: combobox reopen');
        await sleep(400);
        continue;
      }
      await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
        x: committed.x, y: committed.y, button: 'left', clickCount: 1 });
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
        x: committed.x, y: committed.y, button: 'left', clickCount: 1 });
      await sleep(400);
      committed8c = await chrome.eval(
        'window.__playback.plan().opts.height === 720'
        + ' && window.__playback.plan().opts.width === 1280');
    }
    check('8c: a real option tap commits to the plan (720p → 1280x720)',
      committed8c === true);
    check('8c: the commit rendered NOTHING (setup changes are free)',
      await chrome.eval('typeof window.__pbCapture === "undefined"'),
      JSON.stringify(await chrome.eval('window.__pbCapture ?? null')));

    // 8d: zero native-styled controls in the card
    const CARD_NATIVE = `((root) => {
      const vis = (el) => el.getClientRects().length > 0
        && getComputedStyle(el).visibility !== 'hidden';
      const bad = [];
      for (const el of root.querySelectorAll('select:not([hidden])')) {
        if (!vis(el)) continue;
        const up = [...(el.parentElement?.children ?? [])]
          .some((c) => c !== el && c.dataset && c.dataset.ob === 'select-button');
        if (!up) bad.push('select#' + (el.id || '(anon)'));
      }
      for (const el of root.querySelectorAll('input[type=checkbox]')) {
        if (vis(el) && !el.closest('.ob-toggle')) bad.push('checkbox');
      }
      for (const el of root.querySelectorAll('input[type=range]')) {
        if (vis(el) && !el.classList.contains('ob-range')) bad.push('range');
      }
      for (const el of root.querySelectorAll('input[type=radio]')) {
        if (vis(el) && !el.closest('.ob-segmented')) bad.push('radio');
      }
      for (const el of root.querySelectorAll(
        'input:not([type=checkbox]):not([type=range]):not([type=radio]), textarea')) {
        if (vis(el)) bad.push(el.tagName.toLowerCase() + '[' + (el.type || '') + ']');
      }
      return bad;
    })`;
    const cardNative = await chrome.eval(
      `${CARD_NATIVE}(document.getElementById('ob-pb-card'))`);
    check('8d: no native-styled control anywhere in the save card',
      Array.isArray(cardNative) && cardNative.length === 0,
      JSON.stringify(cardNative));

    // 8e: coarse tap floors on EVERY interactive control the card renders.
    // Review finding 1: the previous probe named four selectors by hand
    // (cta/close/adv/combobox), so `.ob-pb-dismiss` — a control the SAME
    // commit introduced — shipped at 39px straight through a green gate. The
    // list is now ENUMERATED from the card's own DOM (head + body + foot), so
    // any control added later is floored by this arm without touching it.
    const floors = await chrome.eval(`(() => {
      const card = document.getElementById('ob-pb-card');
      if (!card) return { err: 'no #ob-pb-card' };
      const m = {};
      // the progress row is display:none in SETUP; reveal it for the sweep
      // (pure CSS class, no render) so the mid-render Cancel — the ONLY way
      // out of the card once an encode runs — is measured too
      const prog = card.querySelector('.ob-pb-progress');
      const wasOn = prog?.classList.contains('on');
      prog?.classList.add('on');
      // interactive = focusable/clickable chrome; the native <select> is
      // hidden behind the kit combobox (8d) and drops out of the sweep with
      // every other invisible node
      for (const el of card.querySelectorAll(
        'button, a[href], input, select, textarea,'
        + ' [role=button], [data-ob=select-button], [tabindex]:not([tabindex="-1"])')) {
        const r = el.getBoundingClientRect();
        if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') {
          continue;
        }
        // GH-245 wave B: converted controls lead with the kit 'ob-btn'
        // voice classes — key on the first STRUCTURE class so the per-
        // control floor law keeps its granularity (one merged 'ob-btn'
        // bucket would also sink the >= 4 enumeration guard below)
        const key = (el.className && String(el.className).trim().split(/\\s+/)
          .filter((c) => c !== 'ob-btn' && c.indexOf('ob-btn--') !== 0)[0])
          || el.dataset?.ob || el.tagName.toLowerCase();
        // keep the SMALLEST peer per class — the floor is a per-control law
        const h = +r.height.toFixed(1);
        m[key] = m[key] === undefined ? h : Math.min(m[key], h);
      }
      if (!wasOn) prog?.classList.remove('on');
      return m;
    })()`);
    const shorts = Object.entries(floors)
      .filter(([, v]) => !(typeof v === 'number' && v >= 44));
    check('8e: coarse 44px floors on EVERY interactive control in the card '
      + `(${Object.keys(floors).length} enumerated from the DOM)`,
      Object.keys(floors).length >= 4 && !shorts.length,
      `${JSON.stringify(shorts)} of ${JSON.stringify(floors)}`);

    // 8b: the session list keeps the same pinned-head property
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await waitFor(chrome, 'window.__playback.cardOpen() === false', '8b: card closed');
    await sleep(400);
    await chrome.eval('document.querySelector("#ob-pb-player .ob-pb-pillico").click()');
    await waitFor(chrome, 'window.__playback.isOpen() === true', '8b: list open', 120, 300);
    await sleep(400);
    const listPinned = await chrome.eval(`(() => {
      const panel = document.getElementById('ob-pb-panel');
      const list = panel.querySelector('.ob-pb-list');
      list.scrollTop = list.scrollHeight;
      const head = panel.querySelector('.ob-pb-head');
      const x = panel.querySelector('.ob-pb-close');
      const pr = panel.getBoundingClientRect();
      const hr = head.getBoundingClientRect(), xr = x.getBoundingClientRect();
      const hit = document.elementFromPoint(xr.x + xr.width / 2, xr.y + xr.height / 2);
      const foot = panel.querySelector('.ob-pb-foot')?.getBoundingClientRect();
      return { headInside: hr.top >= pr.top - 1 && hr.bottom <= pr.bottom + 1,
        hitIsX: !!hit && (hit === x || x.contains(hit)),
        hit: hit ? (hit.id || hit.getAttribute('class') || hit.tagName) : 'none',
        footPinned: !!foot && foot.bottom <= pr.bottom + 1 };
    })()`);
    check('8b: the session-list head + ✕ stay pinned while the list scrolls',
      listPinned.headInside === true && listPinned.hitIsX === true
      && listPinned.footPinned === true, JSON.stringify(listPinned));
    const listNative = await chrome.eval(
      `${CARD_NATIVE}(document.getElementById('ob-pb-panel'))`);
    check('8d: no native-styled control anywhere in the session list',
      Array.isArray(listNative) && listNative.length === 0,
      JSON.stringify(listNative));
    await chrome.eval('window.__playback.close()');
    await sleep(300);
    await chrome.eval('window.__export.renderDrill = window.__pbReal8; true');

    const appErr8 = await chrome.eval('__test.errors.slice()');
    check('8: zero app errors', appErr8.length === 0, JSON.stringify(appErr8));
    check('8: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 9: GH-242 marker vocabulary — the danger CROSS + footer legend ------
// The marker LEDGER is shimmed (`__archive.session`, the arm-3g
// `__archive.records` precedent) so the real renderList() / markerGlyphs() /
// face() path paints exact, reproducible strips: a short strip, the dense
// 15-glyph worst case, and the pot+scratch adjacency. Only the judgment DATA
// is synthetic — every pixel comes out of the shipped module.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 4 });
  watch(chrome, errs);
  // 13 pot dots + 2 crosses = the 15-glyph dense worst case; exactly TWO
  // fouls so the decision sheet's "+19 px" (2 x 9.5 px per marker over the
  // retired 2.5px bar) is directly checkable against measured geometry
  const MK = {
    // `pocketed` mirrors `pots` on the legal shots: these are genuine POTS, so
    // the names must read as pots (an absent `pocketed` is the judgment-less
    // playground shape, which arm 9h covers separately)
    short: [
      { kind: 'shot', idx: 0, pots: [3], legal: true, pocketed: [3] },
      { kind: 'shot', idx: 0, pots: [], legal: false, pocketed: [],
        fouls: ['no-rail-after-contact'] },
      { kind: 'shot', idx: 0, pots: [9], legal: true, pocketed: [9] },
    ],
    dense: [
      { kind: 'shot', idx: 0, pots: [1, 2, 3], legal: true, pocketed: [1, 2, 3] },
      { kind: 'shot', idx: 0, pots: [4, 5, 6], legal: true, pocketed: [4, 5, 6] },
      { kind: 'shot', idx: 0, pots: [7], legal: false, pocketed: [7],
        fouls: ['no-rail-after-contact'] },
      { kind: 'shot', idx: 0, pots: [8, 9, 10], legal: true, pocketed: [8, 9, 10] },
      { kind: 'shot', idx: 0, pots: [11, 12], legal: true, pocketed: [11, 12] },
      { kind: 'shot', idx: 0, pots: [13], legal: false, pocketed: [13],
        fouls: ['wrong-first-ball'] },
    ],
    // pot + SCRATCH: the cue ball (id 0) is folded into the ONE foul mark,
    // never drawn as a white dot — the strip must stay [dot][cross]
    scratch: [{ kind: 'shot', idx: 0, pots: [3, 0], legal: false,
      fouls: ['scratch'], pocketed: [3] }],
    named: [
      { kind: 'shot', idx: 0, pots: [3, 0], legal: false, fouls: ['scratch'],
        pocketed: [3] },
      { kind: 'shot', idx: 0, pots: [9], legal: true, terminal: true,
        pocketed: [9] },
      { kind: 'drill', ev: 'complete' },
    ],
    // OFF-TABLE semantics (review round 1 P2). `pots` rides the kernel's
    // Pocketed motion state, which BallOffTable also sets, so a JUMPED ball
    // is in `pots` while the rules ledger's `pocketed` excludes it.
    offTable: [
      // an object ball driven off the table: named "left the table", not potted
      { kind: 'shot', idx: 0, pots: [7], legal: false, pocketed: [],
        fouls: [{ code: 'ball-off-table', cite: 'WPA 8.5' }] },
      // the CAROM shape: striker 0 off the table with NO scratch concept —
      // carom3c pushes only `ball-off-table`, so this must read a plain foul
      { kind: 'shot', idx: 0, pots: [0], legal: false, pocketed: [],
        fouls: [{ code: 'ball-off-table', cite: 'UMB 12' }] },
      // a REAL pool scratch, foul id as a bare STRING (nine-ball legacy row)
      { kind: 'shot', idx: 0, pots: [0, 4], legal: false, fouls: ['scratch'],
        pocketed: [4] },
    ],
    // playground: the archive suppresses adjudication, so there is no
    // judgment to claim a pot from and no foul mark at all
    playground: [{ kind: 'shot', idx: 0, pots: [5] }],
    // 24 crosses = the module's own strip cap in its WIDEST shape (403 CSS px
    // with the 5px gaps): the case that must clip instead of painting into
    // the timestamp column on a 667px phone (review round 1 P2)
    dense24: Array.from({ length: 24 }, () => ({
      kind: 'shot', idx: 0, pots: [], legal: false, pocketed: [],
      fouls: ['no-rail-after-contact'],
    })),
  };
  const shim = (markers) => chrome.eval(`(() => {
    const a = window.__archive;
    a.__realSession ??= a.session.bind(a);
    a.session = async (id) => ({ ...((await a.__realSession(id)) ?? {}),
      markers: ${JSON.stringify(markers)} });
    return true;
  })()`);
  /** Optional session-META override. The row is a grid
   * `40px 1fr auto auto 14px`, so the WIDTH of `.ob-pb-when` (duration + shot
   * count, locale-dependent) is what actually decides how much 1fr the marker
   * strip gets — the number that decides whether a capped strip fits. Pass
   * null to hand the real archive back. */
  const shimMetas = (metas) => chrome.eval(`(() => {
    const a = window.__archive;
    a.__realSessions ??= a.sessions.bind(a);
    a.sessions = ${metas ? `async () => ${JSON.stringify(metas)}` : 'a.__realSessions'};
    return true;
  })()`);
  const rerender = async (markers) => {
    await shim(markers);
    await chrome.eval('window.__playback.setFilter("all")'); // → renderList()
    await sleep(300);
  };
  const FOUL_PROBE = `(() => {
    const box = document.querySelector('.ob-pb-marks .ob-pb-foul');
    if (!box) return { err: 'no foul mark in the strip' };
    const tok = (name) => { const probe = document.createElement('span');
      probe.style.cssText = 'position:fixed;left:-9999px;color:var(' + name + ')';
      document.body.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; };
    const danger = tok('--ob-danger'), dangerText = tok('--ob-danger-text'), dangerLine = tok('--ob-danger-line');
    const svg = box.querySelector('svg[data-icon="foul"]');
    const path = svg && svg.querySelector('path');
    const br = box.getBoundingClientRect();
    if (!path) return { err: 'foul mark carries no icons.js face', html: box.innerHTML };
    const sr = svg.getBoundingClientRect();
    const scale = sr.width / 20;                    // viewBox units -> CSS px
    const w = parseFloat(getComputedStyle(path).strokeWidth) * scale;
    const leg = (path.getTotalLength() / 2) * scale; // two 45deg subpaths
    // round-capped union of two crossing strokes, minus the shared square
    const ink = 2 * (leg * w + Math.PI * (w / 2) ** 2) - w * w;
    const dot = Math.PI * (7 / 2) ** 2;              // .ob-pb-pot is 7px
    return { box: [+br.width.toFixed(2), +br.height.toFixed(2)],
      svg: [+sr.width.toFixed(2), +sr.height.toFixed(2)],
      stroke: +w.toFixed(3), leg: +leg.toFixed(2), ink: +ink.toFixed(2),
      inkRatio: +(ink / dot).toFixed(3),
      extent: +path.getBoundingClientRect().width.toFixed(2),
      color: getComputedStyle(box).color, danger, dangerText, dangerLine,
      shadow: getComputedStyle(box).boxShadow,
      pill: parseFloat(getComputedStyle(box).borderRadius) >= 8,
      chipBg: getComputedStyle(box).backgroundColor,
      centered: Math.abs((sr.x + sr.width / 2) - (br.x + br.width / 2)) < 0.6
        && Math.abs((sr.y + sr.height / 2) - (br.y + br.height / 2)) < 0.6 };
  })()`;
  try {
    await waitReady(chrome, '9: marker boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '9: __playback seam');
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await fire(chrome, '9: shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    await chrome.eval('window.__playback.open()');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '9: one session row');
    await rerender(MK.short);

    // ---- 9a: the cross itself ------------------------------------------------
    const f = await chrome.eval(FOUL_PROBE);
    // GH-668 B-K08: the 12 px cross sits centred in a 16 px danger-dim
    // CHIP (a badge, not a control) — the bare ✕ read as a dismiss mark
    check('9a: the foul mark is the ui/icons.js 12px CROSS centred in a '
      + '16px pill chip',
      !f.err && f.box[0] === 16 && f.box[1] === 16 && f.svg[0] === 12
      && f.svg[1] === 12 && f.centered === true && f.pill === true
      && f.chipBg !== 'rgba(0, 0, 0, 0)', JSON.stringify(f));
    check(`9a: cross strokes measure ${f.stroke} CSS px at 45deg `
      + '(decision-sheet budget 1.80)',
      !f.err && Math.abs(f.stroke - 1.8) < 0.02, JSON.stringify(f));
    check(`9a: cross ink ${f.ink} CSS px2 = ${f.inkRatio}x a 7px pot dot `
      + '(sheet budget 0.96x)',
      !f.err && f.inkRatio >= 0.92 && f.inkRatio <= 1.0, JSON.stringify(f));
    // GH-668 S5 review visual audit r1 F1 (RESTATES "wears --ob-danger"): the
    // chip is the kit danger register at chip scale — the cross wears the
    // READING ink --ob-danger-text, the hue stays the wash + the inset
    // --ob-danger-line hairline; the hue on its own wash measured 2.30:1
    // under the replays band's current-row fill (e2e-replays arm V1)
    check('9a: cross wears the kit danger READING ink --ob-danger-text on its '
      + 'chip (never the hue --ob-danger, never a literal) with the inset '
      + '--ob-danger-line hairline',
      !f.err && f.color === f.dangerText && f.color !== f.danger
      && /inset/.test(f.shadow) && f.shadow.includes(f.dangerLine), JSON.stringify(f));

    // ---- 9b: it OUT-SCOPES the player-track height rule ----------------------
    // playback.css shipped `.ob-pb-track .ob-pb-mark .ob-pb-foul{height:13px}`
    // at specificity 0,3,0 for the retired BAR, and the sibling
    // `> * { display:block }` would kill the glyph box's own centring.
    await chrome.eval('document.querySelector(".ob-pb-row").click()');
    await waitFor(chrome, 'window.__playback.playerOpen() === true', '9b: player open');
    await sleep(400);
    const tk = await chrome.eval(`(() => {
      const box = document.querySelector('.ob-pb-track .ob-pb-mark .ob-pb-foul');
      if (!box) return { err: 'no foul mark on the player track' };
      const svg = box.querySelector('svg[data-icon="foul"]');
      const br = box.getBoundingClientRect();
      const sr = svg && svg.getBoundingClientRect();
      const cs = getComputedStyle(box);
      return { box: [+br.width.toFixed(2), +br.height.toFixed(2)],
        svg: sr ? [+sr.width.toFixed(2), +sr.height.toFixed(2)] : null,
        display: cs.display, cssHeight: cs.height,
        centered: !!sr
          && Math.abs((sr.y + sr.height / 2) - (br.y + br.height / 2)) < 0.6 };
    })()`);
    check('9b: the track renders the SAME 12px cross (out-scopes height:13px '
      + 'and the > * display:block)',
      !tk.err && tk.box[0] === 12 && tk.box[1] === 12 && tk.cssHeight === '12px'
      && tk.display === 'flex' && tk.svg?.[0] === 12 && tk.centered === true,
      JSON.stringify(tk));
    // 9b-i18n: the track's markers are built ONCE per open, so a live locale
    // switch must RE-NAME them — applyDom() cannot see an imperative
    // aria-label, and a screen reader would otherwise read boot-locale marker
    // names beside re-localized player chrome (review round 3).
    const relabel = await chrome.eval(`(async () => {
      // the POT dot, not the cross: 'Foul' is the SAME word in en and de
      // (house terminology), so a cross probe cannot see a relabel at all
      const sel = '.ob-pb-track .ob-pb-mark .ob-pb-pot';
      const before = document.querySelector(sel)?.getAttribute('aria-label');
      __settings.set('language', 'de');
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (window.__i18n.locale() === 'de') break;
      }
      await new Promise((r) => setTimeout(r, 400));
      const after = document.querySelector(sel)?.getAttribute('aria-label');
      const want = window.__i18n.t('playback.mark.pot', { ball: '3' });
      __settings.set('language', 'en');
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (window.__i18n.locale() === 'en') break;
      }
      await new Promise((r) => setTimeout(r, 400));
      const back = document.querySelector(sel)?.getAttribute('aria-label');
      return { before, after, want, back };
    })()`);
    check('9b: a live locale switch RE-NAMES the track markers (no stale '
      + 'boot-locale names beside localized chrome)',
      !!relabel.before && relabel.after === relabel.want
      && relabel.after !== relabel.before && relabel.back === relabel.before,
      JSON.stringify(relabel));
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"', '9b: restore settle', 60, 300);
    await chrome.eval('window.__playback.open()');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '9b: list back');

    // ---- 9c: the dense 15-glyph strip + the measured +19px cost --------------
    await rerender(MK.dense);
    const dense = await chrome.eval(`(() => {
      const marks = document.querySelector('.ob-pb-row .ob-pb-marks');
      if (!marks) return { err: 'no strip' };
      const kids = [...marks.children];
      const span = () => kids.at(-1).getBoundingClientRect().right
        - kids[0].getBoundingClientRect().left;
      const after = span();
      // BEFORE geometry measured in THIS dom: a test-only style pins
      // .ob-pb-foul back to the retired 2.5x11 danger bar, then is removed
      const st = document.createElement('style');
      st.textContent = '.ob-pb-marks .ob-pb-foul{width:2.5px;height:11px}'
        + '.ob-pb-marks .ob-pb-foul>svg{display:none}';
      document.head.appendChild(st);
      const before = span();
      st.remove();
      const mr = marks.getBoundingClientRect();
      return { glyphs: kids.length,
        crosses: marks.querySelectorAll('.ob-pb-foul').length,
        dots: marks.querySelectorAll('.ob-pb-pot').length,
        before: +before.toFixed(2), after: +after.toFixed(2),
        delta: +(after - before).toFixed(2),
        // ONE line = one shared vertical CENTRE. Never the top edge: the
        // strip mixes 7px dots with 12px crosses under align-items:center,
        // so their tops legitimately differ by 2.5px on a single row.
        lines: new Set(kids.map((k) => {
          const r = k.getBoundingClientRect();
          return Math.round(r.top + r.height / 2);
        })).size,
        centred: (() => {
          const mid = marks.getBoundingClientRect();
          return kids.every((k) => {
            const r = k.getBoundingClientRect();
            return Math.abs((r.top + r.height / 2) - (mid.top + mid.height / 2)) < 0.6;
          });
        })(),
        height: +mr.height.toFixed(2),
        overflow: marks.scrollWidth > marks.clientWidth + 0.5,
        vw: document.documentElement.clientWidth };
    })()`);
    // GH-668 B-K08: the strip line is the 16 px CHIP's height and each foul
    // costs the chip (16 − 2.5 = +13.5 over the retired bar → +27 for the
    // two crosses; the GH-242 sheet's +19 was the bare 12 px cross)
    check('9c: dense strip = 15 glyphs (13 dots + 2 crosses) on ONE 16px line, '
      + 'every glyph centred, no overflow',
      !dense.err && dense.glyphs === 15 && dense.dots === 13 && dense.crosses === 2
      && dense.lines === 1 && dense.centred === true && dense.height === 16
      && dense.overflow === false, JSON.stringify(dense));
    check(`9c: the foul chip costs +${dense.delta}px on the dense strip `
      + `(${dense.before} -> ${dense.after}; B-K08 chip: +27.0, GH-242 cross was +19.0)`,
      Math.abs(dense.delta - 27) < 0.6, JSON.stringify(dense));

    // ---- 9d: the scratch case stays [dot][cross] -----------------------------
    await rerender(MK.scratch);
    const sc = await chrome.eval(`(() => {
      const kids = [...document.querySelector('.ob-pb-row .ob-pb-marks').children];
      return { classes: kids.map((k) => k.className),
        labels: kids.map((k) => k.getAttribute('aria-label')),
        scratch: window.__i18n.t('playback.mark.scratch'),
        foul: window.__i18n.t('playback.mark.foul'),
        adjacent: kids.length === 2 && kids[1].getBoundingClientRect().left
          >= kids[0].getBoundingClientRect().right };
    })()`);
    check('9d: a scratch folds into the ONE cross beside the pot dot '
      + '(no white cue dot)',
      JSON.stringify(sc.classes) === '["ob-pb-pot","ob-pb-foul"]'
      && sc.adjacent === true, JSON.stringify(sc));
    check('9d: the cross NAMES the scratch, distinct from a plain foul',
      sc.labels[1] === sc.scratch && sc.scratch !== sc.foul, JSON.stringify(sc));

    // ---- 9e: accessible names on every marker (no aria-hidden) ---------------
    await rerender(MK.named);
    const a11y = await chrome.eval(`(() => {
      const kids = [...document.querySelector('.ob-pb-row .ob-pb-marks').children];
      const T = window.__i18n.t;
      return { n: kids.length,
        hidden: kids.filter((k) => k.getAttribute('aria-hidden')).length,
        roles: [...new Set(kids.map((k) => k.getAttribute('role')))],
        labels: kids.map((k) => k.getAttribute('aria-label')),
        pot3: T('playback.mark.pot', { ball: '3' }),
        pot9: T('playback.mark.pot', { ball: '9' }),
        win: T('playback.mark.win'), drill: T('playback.mark.drill') };
    })()`);
    check('9e: every marker glyph is a role=img with a name (zero aria-hidden)',
      a11y.n === 5 && a11y.hidden === 0
      && JSON.stringify(a11y.roles) === '["img"]'
      && a11y.labels.every((l) => !!l && l.length > 0), JSON.stringify(a11y));
    check('9e: pot names carry the REAL ball number off the archive record',
      a11y.labels[0] === a11y.pot3 && a11y.labels[2] === a11y.pot9
      && a11y.pot3 !== a11y.pot9, JSON.stringify(a11y));
    check('9e: the overloaded sparkle is disambiguated (won vs completed)',
      a11y.labels[3] === a11y.win && a11y.labels[4] === a11y.drill
      && a11y.win !== a11y.drill, JSON.stringify(a11y));

    // ---- 9h: OFF-TABLE semantics (review round 1 P2) --------------------------
    await rerender(MK.offTable);
    const off = await chrome.eval(`(() => {
      const kids = [...document.querySelector('.ob-pb-row .ob-pb-marks').children];
      const T = window.__i18n.t;
      return { classes: kids.map((k) => k.className),
        labels: kids.map((k) => k.getAttribute('aria-label')),
        pot7: T('playback.mark.pot', { ball: '7' }),
        gone7: T('playback.mark.gone', { ball: '7' }),
        pot4: T('playback.mark.pot', { ball: '4' }),
        foul: T('playback.mark.foul'), scratch: T('playback.mark.scratch') };
    })()`);
    check('9h: a ball DRIVEN OFF the table is not announced as potted',
      off.labels[0] === off.gone7 && off.labels[0] !== off.pot7
      && off.gone7 !== off.pot7, JSON.stringify(off));
    check('9h: a striker off the table with no `scratch` foul (the carom '
      + 'shape) reads a plain foul, never a scratch',
      off.labels[1] === off.foul && off.labels[2] === off.foul,
      JSON.stringify(off));
    check('9h: a REAL scratch still names itself, from a bare-STRING foul id, '
      + 'beside a genuinely potted ball',
      off.labels[3] === off.pot4 && off.labels[4] === off.scratch,
      JSON.stringify(off));
    await rerender(MK.playground);
    const pg = await chrome.eval(`(() => {
      const kids = [...document.querySelector('.ob-pb-row .ob-pb-marks').children];
      const T = window.__i18n.t;
      return { n: kids.length, classes: kids.map((k) => k.className),
        label: kids[0] && kids[0].getAttribute('aria-label'),
        gone5: T('playback.mark.gone', { ball: '5' }),
        pot5: T('playback.mark.pot', { ball: '5' }) };
    })()`);
    check('9h: a judgment-LESS playground row claims no pot and paints no '
      + 'foul mark',
      pg.n === 1 && pg.classes[0] === 'ob-pb-pot' && pg.label === pg.gone5
      && pg.label !== pg.pot5, JSON.stringify(pg));

    // ---- 9j: carom balls are named by COLOUR, never by id (review round 2) ---
    // A carom set carries no numerals (ballset.js: 1 = Aramith yellow,
    // 2 = red), and with no pockets the only way a carom ball reaches `pots`
    // is BallOffTable — so this is exactly the path that must not read "1".
    const Tc = Date.now();
    await shimMetas([{ id: 1, gameId: 'carom_3cushion',
      startTs: Tc - 6e5, endTs: Tc, shots: 2 }]);
    await rerender([
      { kind: 'shot', idx: 0, pots: [1], legal: false, pocketed: [],
        fouls: [{ code: 'ball-off-table', cite: 'UMB 12' }] },
      { kind: 'shot', idx: 0, pots: [2], legal: false, pocketed: [],
        fouls: [{ code: 'ball-off-table', cite: 'UMB 12' }] },
    ]);
    const car = await chrome.eval(`(() => {
      const kids = [...document.querySelector('.ob-pb-row .ob-pb-marks').children];
      const T = window.__i18n.t;
      return { labels: kids.map((k) => k.getAttribute('aria-label')),
        yellow: T('playback.mark.gone', { ball: T('playback.ball.carom.1') }),
        red: T('playback.mark.gone', { ball: T('playback.ball.carom.2') }),
        byId1: T('playback.mark.gone', { ball: '1' }),
        colours: [T('playback.ball.carom.1'), T('playback.ball.carom.2')] };
    })()`);
    check(`9j: carom balls are named by colour (${JSON.stringify(car.colours)}), `
      + 'never by their internal id',
      car.labels[0] === car.yellow && car.labels[2] === car.red
      && car.labels[0] !== car.byId1 && !/^\d+$/.test(car.colours[0]),
      JSON.stringify(car));
    await shimMetas(null);

    // ---- 9i: the 24-marker cap CLIPS, it never paints into the timestamp ----
    // review round 1 P2: the 12px cross makes the widest capped strip ~403 CSS
    // px, past the row's 1fr marker column on a 667px phone where the retired
    // 2.5px bars still fit. .ob-pb-marks is nowrap with unshrinkable children.
    // GH-668 B-K07: the clock · meta line moved UNDER the title, so the
    // body's 1fr no longer competes with a `.ob-pb-when` column — at 667 the
    // capped strip (24 × 16 px chips + gaps ≈ 500 px) would FIT. The forced
    // worst case is therefore the phone-portrait panel (100vw at 480): body
    // ≈ 480 − pads − 40 face − 34 trash − 14 chevron − 3 gaps ≈ 330 px.
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: 480, height: 375, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    // the long localized meta line (de "1440 Min · 9999 Stöße") now wraps as
    // DATA under the title; what bounds the strip is the body track itself.
    const T9 = Date.now();
    await shimMetas([{ id: 1, gameId: 'nine_ball',
      startTs: T9 - 1440 * 60000, endTs: T9, shots: 9999 }]);
    await chrome.eval(`__settings.set('language', 'de')`);
    await waitFor(chrome, `window.__i18n.locale() === 'de'`, '9i: locale de',
      60, 200);
    await rerender(MK.dense24);
    const clip = await chrome.eval(`(() => {
      const row = document.querySelector('.ob-pb-row');
      const marks = row.querySelector('.ob-pb-marks');
      // the trailing controls column (trash + chevron) is what the strip
      // must never paint into now that the clock line sits under the title
      const when = row.querySelector('.ob-pb-chev') ?? row.querySelector('.ob-pb-del');
      const body = row.querySelector('.ob-pb-what');
      const kids = [...marks.children];
      const r = (e) => e.getBoundingClientRect();
      const mr = r(marks), wr = r(when), br = r(body);
      const content = kids.length
        ? +(r(kids.at(-1)).right - r(kids[0]).left).toFixed(1) : 0;
      // a CLIPPED child's layout rect still reports its full extent —
      // overflow:hidden changes PAINT, not geometry. So the honest probes
      // are (a) the strip's own box stays out of the timestamp column, which
      // is what bounds the paint, and (b) a REAL hit test inside that column
      // at the strip's own height never lands on a marker glyph.
      const px = Math.min(wr.left + 4, wr.right - 2);
      const hit = document.elementFromPoint(px, mr.top + mr.height / 2);
      const isMark = !!hit && ['ob-pb-foul', 'ob-pb-pot', 'ob-pb-star']
        .some((c) => hit.classList.contains(c));
      return { glyphs: kids.length, content, column: +mr.width.toFixed(1),
        clipped: getComputedStyle(marks).overflow,
        scrollOver: +(marks.scrollWidth - marks.clientWidth).toFixed(1),
        pastColumn: +(r(kids.at(-1)).right - mr.right).toFixed(1),
        boxIntoWhen: mr.right > wr.left + 0.5 || mr.right > br.right + 0.5,
        hitIsMarker: isMark,
        hitAt: hit ? (hit.getAttribute('class') || hit.tagName) : 'none',
        vw: document.documentElement.clientWidth };
    })()`);
    check(`9i: 24 markers want ${clip.content}px in a ${clip.column}px column `
      + `at 480x375 de — the strip CLIPS (overflow ${clip.clipped}, `
      + `${clip.scrollOver}px hidden past its box) and the trailing controls `
      + `column hit-tests to '${clip.hitAt}', never a marker`,
      clip.glyphs === 24 && clip.clipped === 'hidden'
      && clip.hitIsMarker === false && clip.boxIntoWhen === false
      && clip.scrollOver > 0, JSON.stringify(clip));
    await chrome.send('Emulation.clearDeviceMetricsOverride');
    await shimMetas(null);
    await sleep(300);
    await rerender(MK.named);

    // ---- 9f/9g: the footer legend, inline then relayouted -------------------
    const LEGEND = `(() => {
      const foot = document.querySelector('.ob-pb-foot');
      const lg = foot && foot.querySelector('.ob-pb-legend');
      if (!lg) return { err: 'no footer legend' };
      const r = (e) => e.getBoundingClientRect();
      const items = [...lg.querySelectorAll('.ob-pb-lg')];
      const note = foot.querySelector('.ob-nums');
      const clear = foot.querySelector('.ob-pb-clear');
      const fr = r(foot), lr = r(lg), nr = r(note), cr = r(clear);
      const hit = (a, b) => !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5
        || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5);
      const cs = getComputedStyle(foot);
      const gap = parseFloat(cs.columnGap) || 0;
      const inner = fr.width - parseFloat(cs.paddingLeft)
        - parseFloat(cs.paddingRight);
      const panel = document.getElementById('ob-pb-panel').getBoundingClientRect();
      // the legend BOX stretches to 100% on its own line, so its CONTENT
      // extent is the only meaningful width there
      const content = items.length
        ? items.at(-1).getBoundingClientRect().right
          - items[0].getBoundingClientRect().left : 0;
      return { items: items.length,
        labels: items.map((i) => i.lastElementChild.textContent),
        glyphs: items.map((i) => i.firstElementChild.className),
        faces: items.map((i) => !!i.firstElementChild.querySelector('svg')),
        legendLines: new Set(items.map((i) => Math.round(r(i).top))).size,
        // 1 = the legend rides the note's line; 2 = it took its own
        footerLines: lr.top >= Math.max(nr.bottom, cr.bottom) - 0.5 ? 2 : 1,
        withNote: Math.abs(lr.top - nr.top) < 6,
        ownLine: lr.top >= Math.max(nr.bottom, cr.bottom) - 0.5,
        hitsNote: hit(lr, nr), hitsClear: hit(lr, cr),
        overflowX: +(foot.scrollWidth - foot.clientWidth).toFixed(1),
        inner: +inner.toFixed(1),
        content: +content.toFixed(1),
        need: +(nr.width + content + cr.width + 2 * gap).toFixed(1),
        slack: +(inner - nr.width - content - cr.width - 2 * gap).toFixed(1),
        slackLine1: +(inner - nr.width - cr.width - gap).toFixed(1),
        slackLine2: +(inner - content).toFixed(1),
        // negative = Clear all still sits inside the panel's right edge
        outsideBy: +(cr.right - panel.right).toFixed(1),
        ellipsized: items.some((i) => i.lastElementChild.scrollWidth
          > i.lastElementChild.clientWidth + 0.5),
        vw: document.documentElement.clientWidth };
    })()`;
    const setLoc = async (loc) => {
      await chrome.eval(`__settings.set('language', ${JSON.stringify(loc)})`);
      await waitFor(chrome,
        `window.__i18n.locale() === ${JSON.stringify(loc)}`, `9: locale ${loc}`,
        60, 200);
      await sleep(350);
    };
    // ABOVE the 750px breakpoint the legend is INLINE beside the storage note.
    // Gated on all SEVEN locales (the wrap-never-ellipsize law is per-locale,
    // and es/fr are the width worst cases — not de) at the desktop width, the
    // phone's playable 852 CSS px where the panel is 100vw, and 800 px, which
    // sits inside the band where the two widest locales no longer fit on one
    // legend line. There the legend WRAPS to a second legend line in place —
    // which is the law working, not a defect: it must still never ellipsize,
    // never overflow and never collide with the note or Clear all.
    const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh-CN'];
    for (const vw of [1440, 852, 800]) {
      await chrome.send('Emulation.setDeviceMetricsOverride',
        { width: vw, height: vw === 1440 ? 900 : 390, deviceScaleFactor: 1,
          mobile: false });
      await sleep(400);
      for (const loc of LOCALES) {
        await setLoc(loc);
        const L = await chrome.eval(LEGEND);
        check(`9f/${vw}/${loc}: the legend renders 3 real-glyph items with `
          + `localized labels (${JSON.stringify(L.labels)})`,
          !L.err && L.items === 3 && L.labels.every((s) => s && s.trim().length)
          && JSON.stringify(L.glyphs)
            === '["ob-pb-pot","ob-pb-foul","ob-pb-star"]'
          && L.faces[1] === true && L.faces[2] === true, JSON.stringify(L));
        check(`9f/${vw}/${loc}: inline beside the storage note on `
          + `${L.legendLines} legend line(s) (slack ${L.slack}px, overflow `
          + `${L.overflowX}px)`,
          !L.err && L.footerLines === 1 && L.withNote === true
          && L.legendLines <= 2
          && L.hitsNote === false && L.hitsClear === false
          && L.overflowX <= 0 && L.outsideBy < 0 && L.ellipsized === false,
          JSON.stringify(L));
      }
    }
    // 3b: below 750 CSS px the legend takes its OWN line. 667x375 is the
    // measured failure viewport — inline German overflowed by 80.8px there
    // and "Partie gewonnen" painted over "Alle löschen".
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: 667, height: 375, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    for (const loc of LOCALES) {
      await setLoc(loc);
      const N = await chrome.eval(LEGEND);
      check(`9g/${loc}: at 667x375 the legend takes its OWN line (line 1 slack `
        + `${N.slackLine1}px, line 2 slack ${N.slackLine2}px), no overlap, no `
        + `overflow (${N.overflowX}px), Clear all ${-N.outsideBy}px inside the `
        + 'panel edge',
        !N.err && N.ownLine === true && N.footerLines === 2
        && N.legendLines === 1 && N.hitsNote === false
        && N.hitsClear === false && N.overflowX <= 0 && N.outsideBy < 0
        && N.slackLine1 > 0 && N.slackLine2 > 0 && N.ellipsized === false,
        JSON.stringify(N));
    }
    await chrome.send('Emulation.clearDeviceMetricsOverride');

    // ---- 9k: GH-328 — a 1-shot session reads the SINGULAR rowMeta ------------
    // Red pre-fix: the list row and the player chip both said "1 min ·
    // 1 shots" (playback.rowMetaOne did not exist). Same meta shim seam as
    // 9j, but the REAL session id is kept so the row click stages the
    // genuine session for the chip probe.
    await setLoc('en');
    const m328 = (await chrome.eval('window.__archive.sessions()'))[0];
    await shimMetas([{ ...m328, shots: 1,
      endTs: (m328.startTs ?? Date.now()) + 60000 }]);
    await chrome.eval('window.__playback.setFilter("all")');
    await sleep(300);
    const one328 = await chrome.eval(`(() => {
      const T = window.__i18n.t;
      return { meta: document.querySelector('.ob-pb-row .ob-pb-m')?.textContent ?? '',
        hasKey: window.__i18n.keys().includes('playback.rowMetaOne'),
        want: T('playback.rowMetaOne', { min: 1, shots: 1 }),
        plural: T('playback.rowMeta', { min: 1, shots: 1 }) };
    })()`);
    check('9k: a 1-shot session row reads the SINGULAR rowMeta (GH-328)',
      one328.hasKey && one328.meta === one328.want
      && one328.meta !== one328.plural, JSON.stringify(one328));
    await chrome.eval('document.querySelector(".ob-pb-row").click()');
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '9k: player open');
    await sleep(400);
    const chip328 = await chrome.eval(`(() => {
      const T = window.__i18n.t;
      return { m: document.querySelector('.ob-pb-chip-m')?.textContent ?? '',
        want: T('playback.rowMetaOne', { min: 1, shots: 1 }),
        plural: T('playback.rowMeta', { min: 1, shots: 1 }) };
    })()`);
    check('9k: the player chip meta carries the singular form too (GH-328)',
      chip328.m.includes(chip328.want) && !chip328.m.includes(chip328.plural),
      JSON.stringify(chip328));
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"', '9k: restore settle',
      60, 300);
    await shimMetas(null);
    await chrome.eval('window.__playback.open()');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '9k: list back');

    await chrome.eval('window.__playback.close()');
    await sleep(300);
    const appErr9 = await chrome.eval('__test.errors.slice()');
    check('9: zero app errors', appErr9.length === 0, JSON.stringify(appErr9));
    check('9: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 10: the OPEN-ANYTHING law (GH-257) ----------------------------------
// Every archived session opens from EVERY entry state, and closing it puts the
// live table back EXACTLY — measured on a 20-field fingerprint (every ball's
// id/pocketed/pos/quat/baseQuat at 9 decimals, the kernel-truth equipment, the
// bed identity via __test.bed(), the match fold projection, the judgment
// ledger length, the archive's current session + suspend flag + session list,
// camera pose/fov, orbit rig, the Replay button) with ZERO tolerated deltas.
// The corpus is REAL: a 9-ball session, a snooker session and a carom session
// each recorded by firing actual shots through the real game, so every open is
// a real cross-CLASS stage (10 balls on a 9-ft pool bed, 22 on the 12-ft
// snooker bed, 3 on the pocketless carom bed), not a shimmed record.
// Own browser: the corpus needs game switches that arms 0-9 must not see.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 8 });
  watch(chrome, errs);
  // The one arm that EXPECTS console errors is 10j (an injected throw inside
  // the open, whose recovery is loud on purpose) — everything else must be
  // silent, so the allowlist is exact.
  const ALLOWED_ERR = /injected open failure/;
  const FP = `(() => {
    const balls = window.__test.balls().map((b) => ({
      id: b.id, po: !!b.pocketed,
      p: b.pos.map((x) => x.toFixed(9)), q: b.quat.map((x) => x.toFixed(9)),
      bq: b.baseQuat.map((x) => x.toFixed(9)),
    }));
    const cam = window.__dbg?.camera, orb = window.__dbg?.orbit;
    let judg = -1, hud = 'ERR', drill = 'ERR', share = 'ERR', arch = 'ERR';
    try { judg = (window.__rules?.judgments?.() ?? []).length; } catch { /* seam */ }
    try { hud = JSON.stringify(window.__rules?.matchState?.() ?? null); } catch { /* seam */ }
    try { drill = JSON.stringify(window.__drills?.state?.() ?? null); } catch { /* seam */ }
    try { share = JSON.stringify(window.__share?.log?.() ?? null); } catch { /* seam */ }
    try {
      arch = JSON.stringify({ cur: window.__archive?.current?.() ?? null,
        susp: window.__archive?.suspended?.() ?? null });
    } catch { /* seam */ }
    return { state: window.__test.state(), balls, judg, hud, drill, share, arch,
      bed: JSON.stringify(window.__test.bed()),
      equip: JSON.stringify(window.__test.equipment()),
      cam: cam ? [cam.position.x.toFixed(6), cam.position.y.toFixed(6),
        cam.position.z.toFixed(6), cam.fov] : null,
      orb: orb?.state ? [orb.state.radius.toFixed(6), orb.state.theta.toFixed(6),
        orb.state.phi.toFixed(6)] : null,
      canReplay: document.getElementById('replay')?.disabled === false };
  })()`;
  const fpDiff = (a, b) => {
    const out = [];
    if (JSON.stringify(a) === JSON.stringify(b)) return out;
    for (const k of Object.keys(a)) {
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
      if (k === 'balls') {
        for (let i = 0; i < Math.max(a.balls.length, b.balls.length); i++) {
          if (JSON.stringify(a.balls[i]) !== JSON.stringify(b.balls[i])) {
            out.push(`ball[${i}] ${JSON.stringify(a.balls[i])} -> `
              + `${JSON.stringify(b.balls[i])}`);
          }
        }
      } else out.push(`${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
    }
    return out;
  };
  const sessionsOf = () => chrome.eval('(async () => (await window.__archive'
    + '.sessions()).map((s) => [s.id, s.gameId, s.shots]))()');
  /** open `sid`, prove the staged bed, close, prove ZERO deltas. */
  const roundTrip = async (tag, sid, expect) => {
    const before = await chrome.eval(FP);
    const opened = await chrome.eval(`window.__playback.openSession(${sid})`);
    const staged = await chrome.eval('(() => ({ state: window.__test.state(),'
      + ' bed: window.__test.bed(), playerOpen: window.__playback.playerOpen(),'
      + ' equip: window.__test.equipment(),'
      + ' note: document.querySelector(".ob-pb-empty[data-note]")?.textContent'
      + ' ?? "" }))()');
    // the note gate refuses REFUSAL copies only: a tap that landed on a
    // still-settling beat paints the TRANSIENT wait copy and then opens
    // itself — that self-clearing notice may still be up at probe time
    // (its reaper runs 6 s past the last repaint) and is not a refusal
    const waitCopies = [
      await chrome.eval('window.__i18n.t("playback.settling")'),
      await chrome.eval('window.__i18n.t("playback.replayRunning")'),
    ];
    check(`${tag}: the session OPENS (no refusal)`,
      opened === true && staged.playerOpen === true
      && staged.state === 'PLAYBACK'
      && (staged.note === '' || waitCopies.includes(staged.note)),
      JSON.stringify({ opened, ...staged }));
    check(`${tag}: staged on the SESSION's own bed `
      + `(${expect.census} balls, table ${expect.tableLength} m)`,
      staged.bed.census === expect.census
      && Math.abs(staged.bed.tableLength - expect.tableLength) < 1e-6,
      JSON.stringify(staged.bed));
    // scrub proves the stage is really renderable, not just entered
    await chrome.eval('window.__playback.seek(0.4)');
    await sleep(300);
    const pstate = await chrome.eval('window.__playback.state()');
    check(`${tag}: scrubs on that bed (clock follows T)`,
      !!pstate && Math.abs(pstate.clock - 0.4) < 1e-6, JSON.stringify(pstate));
    await chrome.eval('window.__playback.close()');
    await sleep(600);
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      `${tag}: close re-settled`, 80, 250);
    await sleep(1200); // the post-settle pose re-apply beat
    const after = await chrome.eval(FP);
    const d = fpDiff(before, after);
    check(`${tag}: close restored the live state EXACTLY (0 deltas)`,
      d.length === 0, d.slice(0, 6).join(' ;; '));
    return before;
  };
  try {
    await waitReady(chrome, 'open-anything boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '10: __playback seam');
    // ---- corpus: one session per equipment CLASS, all really played --------
    const LIVE_BED = {};
    LIVE_BED.nine_ball = await chrome.eval(
      '(({ census, tableLength }) => ({ census, tableLength }))'
      + '(window.__test.bed())');
    await fire(chrome, '10 corpus 9-ball 1', { v0: 2.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(1500);
    await fire(chrome, '10 corpus 9-ball 2', { v0: 1.4, phi: Math.PI / 2, theta: 0, a: 0.2, b: 0 });
    await sleep(1800);
    // the game switch rides settings.changeGame, NOT __rules.setGame: only
    // the settings path broadcasts ob:settings, which is what SPLITS the
    // archive session and stamps it with the new gameId (measured: through
    // __rules.setGame all three sessions came out stamped nine_ball)
    for (const g of ['snooker', 'carom_3cushion']) {
      const sw = await chrome.eval(
        `window.__settings.changeGame(${JSON.stringify(g)}, { skipConfirm: true })`);
      check(`10 corpus: switched to ${g}`, sw === true, String(sw));
      await sleep(2200);
      // carom opens on the UMB Art 23.1(c) break-spot OPTION, and a shot is
      // refused while a rulebook decision is pending — resolve it first
      const pend = await chrome.eval(
        '(window.__rules.matchState()?.pendingDecision?.kind) ?? null');
      if (pend === 'break_spot') {
        check('10 corpus: the carom break-spot option resolves',
          await chrome.eval('window.__rules.decide("break_spot", 1)') === true);
        await sleep(400);
      }
      // the bed each session was RECORDED on is the expectation its later
      // playback must reproduce — read it here rather than hard-coding dims
      LIVE_BED[g] = await chrome.eval(
        '(({ census, tableLength }) => ({ census, tableLength }))'
        + '(window.__test.bed())');
      await fire(chrome, `10 corpus ${g}`, { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
      await sleep(1800);
    }
    check('10 corpus: back to nine_ball',
      await chrome.eval(
        'window.__settings.changeGame("nine_ball", { skipConfirm: true })') === true);
    await sleep(2200);
    await fire(chrome, '10 corpus 9-ball 3', { v0: 1.8, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(1800);
    await chrome.eval('window.__archive.flush()');
    await sleep(700);
    const rows = await sessionsOf();
    const idOf = (g) => (rows.find((r) => r[1] === g && r[2] > 0) ?? [])[0];
    const SID = { nine: idOf('nine_ball'), snooker: idOf('snooker'),
      carom: idOf('carom_3cushion') };
    check('10: the corpus holds a session per class (9-ball, snooker, carom)',
      Number.isFinite(SID.nine) && Number.isFinite(SID.snooker)
      && Number.isFinite(SID.carom), JSON.stringify({ rows, SID }));
    const BED = { nine: LIVE_BED.nine_ball, snooker: LIVE_BED.snooker,
      carom: LIVE_BED.carom_3cushion };
    check('10: each class recorded on its own bed (census/table dims read '
      + 'from the live game, not hard-coded)',
      BED.nine.census === 10 && BED.snooker.census === 22
      && BED.carom.census === 3 && BED.snooker.tableLength > BED.nine.tableLength,
      JSON.stringify(BED));
    const sessionsBefore = JSON.stringify(rows);

    // ---- 10a-10c: mid-game of a 9-BALL match, every OTHER class ------------
    // the owner's exact defect: "in another game" must not refuse
    await roundTrip('10a (mid-game 9-ball -> snooker session)',
      SID.snooker, BED.snooker);
    await roundTrip('10b (mid-game 9-ball -> carom session)',
      SID.carom, BED.carom);
    await roundTrip('10c (mid-game 9-ball -> 9-ball session, same bed)',
      SID.nine, BED.nine);
    check('10a-c: playback archived NOTHING (no duplicate sessions)',
      JSON.stringify(await sessionsOf()) === sessionsBefore,
      JSON.stringify(await sessionsOf()));

    // ---- 10d: BEFORE ANY SHOT (a virgin rack) ------------------------------
    await chrome.eval('__test.rerack(77)');
    await sleep(1200);
    check('10d: the rack really is virgin (no record, no sampler)',
      await chrome.eval('window.__test.bed().hasRecord') === false
      && await chrome.eval('window.__test.bed().hasSampler') === false);
    await roundTrip('10d (virgin rack -> snooker session)',
      SID.snooker, BED.snooker);

    // ---- 10e: MID-SHOT — the ONLY refusal left is a WAIT -------------------
    const preJudg = await chrome.eval('(window.__rules.judgments() ?? []).length');
    await chrome.eval('__test.shoot({v0:2.4,phi:Math.PI/2,theta:0,a:0,b:0})');
    await sleep(500);
    check('10e: the table is genuinely in flight at tap time',
      ['SIMULATING', 'PLAYBACK'].includes(await chrome.eval('__test.state()')));
    const opening = chrome.eval(`window.__playback.openSession(${SID.snooker})`);
    await sleep(400);
    const waitNote = await chrome.eval(
      'document.querySelector(".ob-pb-empty[data-note]")?.textContent ?? ""');
    check('10e: the wait SAYS what is happening (playback.settling, localized)',
      waitNote === await chrome.eval('window.__i18n.t("playback.settling")')
      && waitNote.length > 0, JSON.stringify(waitNote));
    const openedMid = await opening;
    check('10e: and then it OPENS itself once the table settles '
      + '(no refusal, no second tap)',
      openedMid === true
      && await chrome.eval('window.__playback.playerOpen()') === true,
      String(openedMid));
    check('10e: staged the snooker bed even though entry was mid-shot',
      (await chrome.eval('window.__test.bed()')).census === 22);
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '10e: close re-settled', 80, 250);
    await sleep(1500);
    check('10e: the in-flight shot was judged EXACTLY once (no re-adjudication)',
      await chrome.eval('(window.__rules.judgments() ?? []).length') === preJudg + 1,
      `${preJudg} -> ${await chrome.eval('(window.__rules.judgments() ?? []).length')}`);

    // ---- 10f: NOT IN A GAME — playground, with an AUTHORED layout ----------
    check('10f: playground mode',
      await chrome.eval('window.__settings.changeMode("playground")') === true);
    await sleep(1600);
    const placed = await chrome.eval(`(() => {
      const ok = [];
      for (const [id, x, y] of [[1, 0.2, 0.3], [2, -0.2, -0.3], [3, -0.1, 0.35]]) {
        ok.push(window.__playground?.placeBall?.(id, x, y) ?? null);
      }
      return ok;
    })()`);
    check('10f: three balls hand-placed', placed.every((x) => x === true),
      JSON.stringify(placed));
    await sleep(500);
    await roundTrip('10f (playground authored layout -> snooker session)',
      SID.snooker, BED.snooker);
    check('10f: back to play mode',
      await chrome.eval('window.__settings.changeMode("play")') === true);
    await sleep(1600);

    // ---- 10g: WIN (banner up, the auto-rerack beat pending) ----------------
    // A real 9-ball win: cue + the 9 alone, lined up straight into the corner.
    await chrome.eval('__test.rerack(31)');
    await sleep(1000);
    await chrome.eval('__test.layout([{id:0,x:0.2,y:0.4},{id:9,x:0.4,y:0.8}])');
    await sleep(700);
    // The WIN window can be NARROW (the auto-rerack beat lands ~300 ms
    // after the fold on this boot — measured 2026-08-02, load-40 flake:
    // fire()'s own 300 ms settle cadence plus a fixed 200 ms sleep sampled
    // AIM/seed-32 after the beat had already resumed). Observation race
    // only — the physics is deterministic — so CATCH the state with a
    // tight poll and, if the whole window was missed inside fire(),
    // re-stage the identical win.
    let winCaught = false;
    for (let attempt = 0; attempt < 3 && !winCaught; attempt++) {
      if (attempt > 0) {
        await chrome.eval('__test.rerack(31)');
        await sleep(1000);
        await chrome.eval('__test.layout([{id:0,x:0.2,y:0.4},{id:9,x:0.4,y:0.8}])');
        await sleep(700);
      }
      await fire(chrome, '10g: the winning shot',
        { v0: 1.5, phi: 1.107, theta: 0, a: 0, b: 0 });
      for (let i = 0; i < 40 && !winCaught; i++) {
        if (await chrome.eval('__test.state()') === 'WIN') winCaught = true;
        else await sleep(50);
      }
    }
    if (winCaught) {
      const beforeWin = await chrome.eval(FP);
      check('10g: a session opens from WIN',
        await chrome.eval(`window.__playback.openSession(${SID.carom})`) === true
        && await chrome.eval('window.__test.bed().census') === 3);
      await sleep(300);
      await chrome.eval('window.__playback.close()');
      await sleep(700);
      const afterWin = await chrome.eval(FP);
      const dw = fpDiff(beforeWin, afterWin);
      check('10g: close restored WIN exactly (0 deltas)', dw.length === 0,
        dw.slice(0, 5).join(' ;; '));
      // the pre-open semantics resume: entering PLAYBACK cancelled flow's
      // banner beat, and the bare WIN re-emission re-armed it
      // GH-370: the resumed re-rack's fresh rack grants the opening
      // BALL_IN_HAND (kitchen right) a macrotask after its AIM
      await waitFor(chrome,
        '__test.state() === "AIM" || __test.state() === "BALL_IN_HAND"',
        '10g: the pending WIN re-rack beat resumed', 40, 250);
      check('10g: and it re-racked the NEXT rack (seed + 1)',
        await chrome.eval('window.__test.bed().seed') === 32,
        String(await chrome.eval('window.__test.bed().seed')));
    } else {
      fail('10g: could not reach WIN (state '
        + await chrome.eval('__test.state()') + ')');
    }

    // ---- 10h: a session with a FOREIGN kernel stamp still opens ------------
    // strict-replay/view-anyway semantics are untouched by the new entry
    // BOTH seams are shimmed (arm-9 `__archive.session` precedent): the
    // view-anyway flag rides the session META's kernelVersion, while the
    // strict sampler gate reads the RECORD's — a record restamped alone is
    // correctly REFUSED by the strict-replay policy (measured), so the shim
    // has to move the pair together, exactly like a real old session.
    const vmOpen = await chrome.eval(`(async () => {
      const realRecs = window.__archive.records;
      const realSess = window.__archive.session;
      const recs = await realRecs(${SID.nine});
      const detail = await realSess(${SID.nine});
      window.__archive.records = async () => recs.map((r) => JSON.stringify(
        { ...JSON.parse(r), kernel_version: '0.0.0-ancient' }));
      window.__archive.session = async () => (
        { ...detail, kernelVersion: '0.0.0-ancient' });
      const ok = await window.__playback.openSession(${SID.nine});
      const state = window.__test.state();
      const badge = !!document.querySelector('.ob-pb-chip .ob-pb-badge');
      const saveDisabled = document.querySelector('.ob-pb-save')?.disabled;
      window.__archive.records = realRecs;
      window.__archive.session = realSess;
      return { ok, state, badge, saveDisabled };
    })()`);
    check('10h: an OLD-kernel session still opens (view-anyway held)',
      vmOpen.ok === true && vmOpen.state === 'PLAYBACK', JSON.stringify(vmOpen));
    // GH-318 (the genuinely-different half of the lineage law): a stamp
    // OUTSIDE KERNEL_COMPAT_LINEAGE keeps the exact pre-318 face — badge
    // painted, save disabled (view-only law)
    check('10h: a genuinely different kernel still wears the badge + '
      + 'view-only save', vmOpen.badge === true && vmOpen.saveDisabled === true,
    JSON.stringify(vmOpen));
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '10h: close re-settled', 80, 250);

    // ---- 10h-lineage (GH-318, re-aimed GH-507, #789 and GH-1195): the lineage law -
    // on the committed dist. GH-490 (#497) repinned the canonical wasm
    // 0.1.0+91ad8597 -> 0.1.0+88084c37 as a REGISTERED geometry change:
    // flip-cascade.md §5, the ledger gains no pair across it and the
    // build-15 chain ENDS at 91ad8597. #789's VERSION-ONLY restamps
    // appended the proven pairs a2b08c21 -> 206ceb55 and (the explicit
    // closure from the shipped stamp) b6b5dc3f -> 206ceb55, the then-live
    // kernel, so the live kernel has had a proven component since, and
    // GH-318's NORMAL-replay half is restored
    // (the re-plan law, never a silent skip):
    //   (a) the proven build-15 chain still rides the committed dist —
    //       lineageCompatible(99bca8b6 -> 91ad8597) stays true (red if the
    //       export or the table breaks);
    //   (b) the strict-gate refusal path proves NO lineage chain bridges
    //       the flip: the ledger pairs into the live kernel are exactly
    //       PROVEN_PREVS (its proven predecessors), the last pre-490 PROVEN
    //       stamp does not
    //       reach it, and a session restamped to that stamp wears the
    //       old-kernel badge + view-only save against the live engine (red
    //       if an unproven pair is ever appended across the flip — a
    //       contract violation);
    //   (c) a session restamped to PROVEN_PREV, the shipped predecessor,
    //       opens as a NORMAL replay: PLAYBACK, no old-kernel badge, save
    //       enabled (GH-318's green half; re-cut at GH-1195, below).
    // GH-1080 (catalog v21, hybrid posture): the pairs into the live kernel
    // are now 206ceb55, 72a839f6 and b6b5dc3f, each proven by its own pair
    // run, and the shipped predecessor 72a839f6 opens as a NORMAL replay.
    // The table-aware chinese8 refusal lives only in kernelGate (share-link
    // re-simulation): a DVR session replays its recorded event streams
    // through the lineage-only kernelMismatch, whatever its table.
    // GH-1195 (the Rest barrier's residual snap) is a REGISTERED physics
    // change (flip-cascade.md §5): no pair enters the live kernel, so
    // PROVEN_PREVS is EMPTY and (c) had no subject. (c) is re-cut into the
    // refusal for the pre-flip predecessor: a session restamped to
    // LAST_PRE_FLIP (the GH-1080 kernel) wears the old-kernel badge and opens
    // view-only with Save disabled, as the pre-490 stamp does in (b).
    // The build-20 old-engine batch's VERSION-ONLY restamp proved and
    // appended the pair 15210514 -> the live kernel, so (c)'s NORMAL-replay
    // half is restored on PROVEN_PREV, the proven predecessor (linLive
    // below); the pre-flip refusal stays.
    // NEXT VERSION-ONLY REPIN: re-aim PROVEN_PREVS at the new live kernel's
    // proven predecessors and PROVEN_PREV at the proven one. The pairIntoLive
    // gate below goes red at that repin ON PURPOSE so the re-aim cannot be
    // forgotten (equipment-additions A2 repin checklist, GH-507).
    const PROVEN_PREVS = ['0.1.0+15210514'];
    const PROVEN_PREV = '0.1.0+15210514';
    const LAST_PRE_FLIP = '0.1.0+a31f6516';
    const lin = await chrome.eval(`(async () => {
      const sdk = await import('/dist/pool-sdk/share.js');
      const live = (await import('/dist/pool-wasm/pool_wasm.js'))
        .kernel_version();
      const OLD = '0.1.0+99bca8b6';
      const LAST_PROVEN = '0.1.0+91ad8597';
      const PROVEN_PREVS = ${JSON.stringify(PROVEN_PREVS)};
      const chain = sdk.lineageCompatible?.(OLD, LAST_PROVEN);
      const bridged = sdk.lineageCompatible?.(LAST_PROVEN, live);
      const intoLive = (sdk.KERNEL_COMPAT_LINEAGE ?? [])
        .filter(([, n]) => n === live);
      const pairIntoLive = JSON.stringify(intoLive.map(([o]) => o).sort())
        === JSON.stringify(PROVEN_PREVS);
      const realRecs = window.__archive.records;
      const realSess = window.__archive.session;
      const recs = await realRecs(${SID.nine});
      const detail = await realSess(${SID.nine});
      window.__archive.records = async () => recs.map((r) => JSON.stringify(
        { ...JSON.parse(r), kernel_version: LAST_PROVEN }));
      window.__archive.session = async () => (
        { ...detail, kernelVersion: LAST_PROVEN });
      const ok = await window.__playback.openSession(${SID.nine});
      const state = window.__test.state();
      const badge = !!document.querySelector('.ob-pb-chip .ob-pb-badge');
      const saveDisabled = document.querySelector('.ob-pb-save')?.disabled;
      window.__archive.records = realRecs;
      window.__archive.session = realSess;
      return { live, chain, bridged, pairIntoLive, ok, state, badge,
        saveDisabled };
    })()`);
    check('10h-lineage: the proven build-15 chain is exported + connected '
      + '(lineageCompatible rides the committed dist)',
    lin.chain === true, JSON.stringify(lin));
    check('10h-lineage(789): NO lineage chain bridges the GH-490 flip — '
      + 'the ledger pairs into the live kernel are exactly the proven '
      + `${PROVEN_PREVS.map((v) => v.slice(6)).join(', ') || 'none (GH-1195)'} `
      + 'pairs, the last pre-490 proven stamp stays disconnected',
    lin.pairIntoLive === true && lin.bridged === false,
    JSON.stringify(lin));
    check('10h-lineage(507): the last-PROVEN stamp still opens, but only '
      + 'view-anyway (PLAYBACK held)',
    lin.ok === true && lin.state === 'PLAYBACK', JSON.stringify(lin));
    check('10h-lineage(507): the old-kernel badge PAINTS across the flip '
      + '(the strict gate refuses a registered physics change)',
    lin.badge === true, JSON.stringify(lin));
    check('10h-lineage(507): save is DISABLED (view-only law across the '
      + 'flip)', lin.saveDisabled === true, JSON.stringify(lin));
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '10h-lineage: close re-settled', 80, 250);
    const linLive = await chrome.eval(`(async () => {
      const PROVEN_PREV = ${JSON.stringify(PROVEN_PREV)};
      const realRecs = window.__archive.records;
      const realSess = window.__archive.session;
      const recs = await realRecs(${SID.nine});
      const detail = await realSess(${SID.nine});
      window.__archive.records = async () => recs.map((r) => JSON.stringify(
        { ...JSON.parse(r), kernel_version: PROVEN_PREV }));
      window.__archive.session = async () => (
        { ...detail, kernelVersion: PROVEN_PREV });
      const ok = await window.__playback.openSession(${SID.nine});
      const state = window.__test.state();
      const badge = !!document.querySelector('.ob-pb-chip .ob-pb-badge');
      const saveDisabled = document.querySelector('.ob-pb-save')?.disabled;
      window.__archive.records = realRecs;
      window.__archive.session = realSess;
      return { ok, state, badge, saveDisabled };
    })()`);
    check('10h-lineage(318): the proven predecessor stamp opens as a '
      + 'NORMAL replay (PLAYBACK, no view-anyway refusal)',
    linLive.ok === true && linLive.state === 'PLAYBACK',
    JSON.stringify(linLive));
    check('10h-lineage(318): NO old-kernel badge on a byte-identical '
      + 'engine', linLive.badge === false, JSON.stringify(linLive));
    check('10h-lineage(318): save stays ENABLED (strict staging accepts '
      + 'the lineage-proven record)', linLive.saveDisabled === false,
    JSON.stringify(linLive));
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '10h-lineage: proven-predecessor close re-settled', 80, 250);
    const linFlip = await chrome.eval(`(async () => {
      const sdk = await import('/dist/pool-sdk/share.js');
      const live = (await import('/dist/pool-wasm/pool_wasm.js'))
        .kernel_version();
      const LAST_PRE_FLIP = ${JSON.stringify(LAST_PRE_FLIP)};
      const bridged = sdk.lineageCompatible?.(LAST_PRE_FLIP, live);
      const realRecs = window.__archive.records;
      const realSess = window.__archive.session;
      const recs = await realRecs(${SID.nine});
      const detail = await realSess(${SID.nine});
      window.__archive.records = async () => recs.map((r) => JSON.stringify(
        { ...JSON.parse(r), kernel_version: LAST_PRE_FLIP }));
      window.__archive.session = async () => (
        { ...detail, kernelVersion: LAST_PRE_FLIP });
      const ok = await window.__playback.openSession(${SID.nine});
      const state = window.__test.state();
      const badge = !!document.querySelector('.ob-pb-chip .ob-pb-badge');
      const saveDisabled = document.querySelector('.ob-pb-save')?.disabled;
      window.__archive.records = realRecs;
      window.__archive.session = realSess;
      return { live, bridged, ok, state, badge, saveDisabled };
    })()`);
    check('10h-lineage(1195): NO lineage chain bridges the GH-1195 flip — '
      + `the pre-flip predecessor ${LAST_PRE_FLIP.slice(6)} stays disconnected`,
    linFlip.bridged === false, JSON.stringify(linFlip));
    check('10h-lineage(1195): the pre-flip predecessor stamp still opens, '
      + 'but only view-anyway (PLAYBACK held)',
    linFlip.ok === true && linFlip.state === 'PLAYBACK',
    JSON.stringify(linFlip));
    check('10h-lineage(1195): the old-kernel badge PAINTS across the '
      + 'registered flip', linFlip.badge === true, JSON.stringify(linFlip));
    check('10h-lineage(1195): save is DISABLED (view-only law across the '
      + 'flip)', linFlip.saveDisabled === true, JSON.stringify(linFlip));
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '10h-lineage: pre-flip predecessor close re-settled', 80, 250);

    // ---- 10i: a shell-less refusal NEVER happens for equipment reasons ----
    // the retired copy must be unreachable on a FRESH graph: no open in this
    // whole arm painted playback.switchBlocked or the old notNow wording
    check('10i: no refusal notice was ever painted in arm 10',
      await chrome.eval(
        'document.querySelector(".ob-pb-empty[data-note]")?.textContent ?? ""')
        !== await chrome.eval('window.__i18n.t("playback.switchBlocked")'));

    // ---- 10j: a THROW inside the open unwinds the WHOLE bracket ------------
    // (pre-existing P0: a throw after __archive.suspend(true) stranded the DVR
    // suspended in PLAYBACK forever — no player to close, nothing recorded
    // again for the rest of the session, and the next open refused too)
    await sleep(1200);
    const beforeThrow = await chrome.eval(FP);
    await chrome.eval(`(() => {
      window.__pbRealSetManual = window.__test.setManual;
      window.__test.setManual = () => { throw new Error('injected open failure'); };
    })()`);
    const threwOpen = await chrome.eval(
      `window.__playback.openSession(${SID.snooker})`);
    await chrome.eval('window.__test.setManual = window.__pbRealSetManual; true');
    await sleep(2500);
    const afterThrow = await chrome.eval(FP);
    const dt = fpDiff(beforeThrow, afterThrow);
    check('10j: a throw inside the open unwinds to the pre-open state '
      + '(0 deltas), releases the suspend and leaves no player',
      threwOpen === false && dt.length === 0
      && await chrome.eval('window.__archive.suspended()') === false
      && await chrome.eval('window.__playback.playerOpen()') === false,
      dt.slice(0, 5).join(' ;; '));
    check('10j: and the DVR is NOT dead — the app still shoots',
      await chrome.eval('__test.shoot({v0:1.0,phi:Math.PI/2,theta:0,a:0,b:0})')
        === null);
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '10j: that shot settled', 80, 300);
    await sleep(1500);
    await chrome.eval('window.__archive.flush()');
    await sleep(600);
    check('10j: and it was ARCHIVED (the recorder came back)',
      (await sessionsOf()).some((r) => r[2] > 0));

    // ---- 10k: a RUNNING SHARED REPLAY is a WAIT, not a refusal --------------
    // (GH-257 review P2: awaitSettle() noted playback.replayRunning — whose
    // own copy PROMISES "Playback opens when it finishes" — and then returned
    // false. And no arm ever loaded a real shared replay, so the refusal had
    // no red-proof.) A REAL #r= replay boots here (the e2e-archive arm-5
    // convention: vary the query so the navigation is a document load), a
    // session is tapped MID-replay, and the law is proved in both directions:
    // the player must NOT open while the replay's scheduler owns the table
    // (a too-eager open would borrow the bed its next shot needs), and the
    // SAME tap must resolve into an OPEN player once replay.done flips —
    // no refusal, no second tap. Pre-fix code fails the final check
    // (openSession resolved false); an ignored replay fails the mid-probe.
    await fire(chrome, '10k: second corpus shot (a 2-shot replay window)',
      { v0: 1.3, phi: Math.PI / 2 + 0.15, theta: 0, a: 0, b: 0 });
    await sleep(1200);
    const shareUrl = String(await chrome.eval('window.__share.encode()'))
      .replace('archive=1', 'archive=1&u=rp10k');
    check('10k: the live log encoded a 2-shot replay link',
      /#r=/.test(shareUrl), shareUrl.slice(0, 80));
    await chrome.send('Page.navigate', { url: shareUrl });
    await waitReady(chrome, '10k: shared-replay boot');
    await waitFor(chrome, 'typeof window.__playback?.openSession === "function"'
      + ' && typeof window.__share?.replay === "function"',
      '10k: seams up on the replay boot');
    await waitFor(chrome,
      'window.__share.replay().active === true && window.__share.replay().done !== true',
      '10k: the shared replay is RUNNING', 100, 200);
    const opening10k = chrome.eval(
      `window.__playback.openSession(${SID.nine})`);
    // the replayRunning notice paints ASYNC once the wait latches (and
    // self-removes after 6 s) — BOUNDED POLL instead of one fixed 600 ms
    // sample (2026-08-02 load flake: note '' at the single sample); the
    // player-closed + replay-active invariants are read in the same
    // in-page snapshot as the note, so the assertions are unchanged.
    let midProbe = null;
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      midProbe = await chrome.eval(`(() => ({
        playerOpen: window.__playback.playerOpen(),
        replay: window.__share.replay(),
        note: document.querySelector('.ob-pb-empty[data-note]')?.textContent ?? '',
      }))()`);
      if (midProbe.note || midProbe.playerOpen || midProbe.replay.done) break;
    }
    check('10k: MID-replay the tap waits — player closed, the honest '
      + 'playback.replayRunning notice up, the replay unmolested',
      midProbe.playerOpen === false && midProbe.replay.active === true
      && midProbe.note === await chrome.eval(
        'window.__i18n.t("playback.replayRunning")'),
      JSON.stringify(midProbe));
    // review round-2 P2: note()'s element self-removes after 6 s — the wait
    // must repaint it for as long as the open is pending, so probe again
    // PAST that horizon (guarded: only while the replay is still running)
    await sleep(6600);
    if (await chrome.eval('window.__share.replay().done !== true'
      + ' && window.__playback.playerOpen() === false')) {
      check('10k: the wait notice is still painted past note()\'s 6 s reaper',
        (await chrome.eval('document.querySelector(".ob-pb-empty[data-note]")'
          + '?.textContent ?? ""')).length > 0);
    }
    await waitFor(chrome, 'window.__share.replay().done === true',
      '10k: the replay finished on its own', 240, 500);
    check('10k: every replayed shot fired (the wait never diverted the '
      + 'scheduler)', await chrome.eval(
      '(() => { const r = window.__share.replay(); return r.n === 2 && r.i === 1; })()'),
      JSON.stringify(await chrome.eval('window.__share.replay()')));
    const opened10k = await opening10k;
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '10k: ...and the SAME tap then opened the player', 60, 250);
    check('10k: the tap resolved true (a wait, never a refusal)',
      opened10k === true && await chrome.eval('window.__test.state()') === 'PLAYBACK',
      String(opened10k));
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '10k: close re-settled', 80, 250);
    await sleep(1200);
    const post10k = await chrome.eval(`(() => ({
      replay: window.__share.replay(),
      susp: window.__archive.suspended(),
    }))()`);
    check('10k: close handed the table back to the finished replay '
      + '(banner state intact, suspend released)',
      post10k.replay.active === true && post10k.replay.done === true
      && post10k.susp === false, JSON.stringify(post10k));
    await chrome.eval('window.__share.exit()');
    await sleep(800);

    // ---- 10l: a DVR borrow during a LIVE DRILL is not a stroke ---------------
    // (GH-257 review P1: the entry emission was a BARE PLAYBACK, which drills'
    // stateChange reads as a stroke when a re-lay is pending — voidShot
    // latched + the timer cleared, and because the close settle's
    // replay-identity branch returns before voidShot is consumed, the NEXT
    // legitimate drill stroke was silently discarded. The emission is now
    // REPLAY-class + dvr-marked.) Sequence: drill stroke 1 settles (re-lay
    // timer armed, NEXT_MS = 1.4 s) -> the session opens INSIDE that window
    // -> close -> the rescheduled re-lay fires -> stroke 2 must score as a
    // normal attempt: TWO '[drills] attempt' events and ZERO '[drills] void'
    // events. Pre-fix code voids stroke 2.
    await waitFor(chrome, 'typeof window.__drills?.start === "function"',
      '10l: drills seam up');
    await chrome.eval(`(() => {
      window.__pbDrillLog = [];
      const rl = console.log.bind(console);
      window.__pbRealLog = console.log;
      console.log = (...a) => {
        const s = String(a[0] ?? '');
        if (s.startsWith('[drills]')) window.__pbDrillLog.push(s);
        rl(...a);
      };
    })()`);
    // a per-attempt pool drill whose layout hands the table back in AIM
    // (no cue-placement grant): probed at runtime, never hardcoded
    const drill10l = await chrome.eval(`(async () => {
      const cands = window.__drills.list().filter((d) =>
        ['run', 'stations', 'ladder', 'progressive'].includes(d.kind)
        && (d.discipline ?? 'pool') === 'pool').slice(0, 5);
      for (const c of cands) {
        if (window.__drills.start(c.id) === false) continue;
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (window.__test.state() === 'AIM') return c.id;
          if (window.__test.state() === 'BALL_IN_HAND') break;
        }
        window.__drills.stop();
        await new Promise((r) => setTimeout(r, 400));
      }
      return null;
    })()`);
    check('10l: a per-attempt drill started in AIM', drill10l !== null,
      String(drill10l));
    await fire(chrome, '10l: drill stroke 1',
      { v0: 1.6, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    // the settle just routed: the drill's re-lay timer is armed for 1.4 s —
    // open the session INSIDE that window (fire() already waited the settle)
    const attempts1 = await chrome.eval(
      'window.__pbDrillLog.filter((s) => s.startsWith("[drills] attempt")).length');
    check('10l: stroke 1 scored an attempt', attempts1 >= 1, String(attempts1));
    const opened10l = await chrome.eval(
      `window.__playback.openSession(${SID.nine})`);
    check('10l: the session opened mid-window with the drill LIVE',
      opened10l === true
      && (await chrome.eval('window.__drills.state()'))?.id === drill10l,
      String(opened10l));
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '10l: close re-settled', 80, 250);
    await sleep(2600); // the rescheduled re-lay beat (NEXT_MS + margin)
    check('10l: the drill survived the borrow (no stop, no void so far)',
      (await chrome.eval('window.__drills.state()'))?.id === drill10l
      && await chrome.eval('window.__pbDrillLog.filter((s) => '
        + 's.startsWith("[drills] void")).length') === 0,
      JSON.stringify(await chrome.eval('window.__pbDrillLog')));
    await fire(chrome, '10l: drill stroke 2',
      { v0: 1.4, phi: Math.PI / 2 + 0.2, theta: 0, a: 0, b: 0 });
    await sleep(800);
    const log10l = await chrome.eval('window.__pbDrillLog.slice()');
    check('10l: stroke 2 SCORED (a second attempt event, zero voids) — the '
      + 'DVR borrow was never read as a stroke',
      log10l.filter((s) => s.startsWith('[drills] attempt')).length >= 2
      && log10l.filter((s) => s.startsWith('[drills] void')).length === 0,
      JSON.stringify(log10l));
    // 10l-2 (review round-6 P1): the SAME borrow AFTER the re-lay landed —
    // game.record is retained (GH-158) but it is no longer the live routing
    // identity, and the old close re-SETTLED it: flow re-adjudicated the
    // stroke against its nulled lastRecord (judgment ledger +1) and drills
    // scheduled another re-lay. The identity-aware restore (recordLive via
    // __rules.settledRecord + the direct state emission) settles NOTHING.
    await sleep(2600); // stroke 2's re-lay lands; the retained record is stale
    const preJ = await chrome.eval('(window.__rules.judgments() ?? []).length');
    const preEvents = await chrome.eval('window.__pbDrillLog.length');
    check('10l-2: opened on the re-laid attempt (retained record, live drill)',
      await chrome.eval(`window.__playback.openSession(${SID.nine})`) === true
      && await chrome.eval('window.__playback.playerOpen()') === true);
    await chrome.eval('window.__playback.close()');
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '10l-2: close re-settled', 80, 250);
    await sleep(2000);
    const postJ = await chrome.eval('(window.__rules.judgments() ?? []).length');
    const newEvents = await chrome.eval(
      `window.__pbDrillLog.slice(${preEvents})`);
    check('10l-2: the close settled NOTHING — no re-adjudication '
      + `(judgments ${preJ} -> ${postJ}), no new drill events, run still live`,
      postJ === preJ && newEvents.length === 0
      && (await chrome.eval('window.__drills.state()'))?.id === drill10l,
      JSON.stringify({ preJ, postJ, newEvents }));
    await chrome.eval('window.__drills.stop(); console.log = window.__pbRealLog; true');
    await sleep(600);

    const appErr10 = await chrome.eval('__test.errors.slice()');
    check('10: zero app errors', appErr10.length === 0, JSON.stringify(appErr10));
    const unexpected = errs.filter((e) => !ALLOWED_ERR.test(String(e)));
    check('10: zero unexpected console errors (only 10j\'s injected failure)',
      unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 11: CAMERA = USER STATE (GH-273) ------------------------------------
// The owner build-13 defect: pick CHASE, drag the scrub bar, the camera snaps
// back to BROADCAST. Every assertion here is a POSE fingerprint — the actual
// camera matrix values at FULL Float64 precision — never aria state (aria is
// asserted only as a secondary voice check). Own browser: real-input drags
// must not disturb the armed-boot session state.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 9 });
  watch(chrome, errs);
  // full-precision camera matrix + rig flag; JSON string == byte identity
  const POSE = `(() => { const c = window.__dbg?.camera; return c
    ? JSON.stringify({ p: [c.position.x, c.position.y, c.position.z],
      q: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w],
      fov: c.fov, track: !!window.__track?.active?.() }) : null; })()`;
  const P = (s) => JSON.parse(s);
  const posDelta = (a, b) => Math.hypot(...P(a).p.map((v, i) => v - P(b).p[i]));
  const qDot = (a, b) => Math.abs(P(a).q.reduce((s, v, i) => s + v * P(b).q[i], 0));
  /** chase-CLASS: the moving rig owns the camera and the pose is NOT the
   * broadcast static pose (matrix values, not aria). */
  const chaseClass = (pose, broadcast) => !!pose && P(pose).track === true
    && posDelta(pose, broadcast) > 5e-3;
  /** REAL pointer drag along the track (press jumps the playhead — the
   * shipped wireTrack contract — then rAF-throttled live scrub). */
  const dragTrack = async (fromFrac, toFrac, steps = 6) => {
    const r = await chrome.eval(`(() => {
      const el = document.querySelector('.ob-pb-track');
      if (!el || !el.getClientRects().length) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y + b.height / 2, w: b.width };
    })()`);
    if (!r) { fail('11: no visible .ob-pb-track to drag'); return; }
    const X = (f) => Math.round(r.x + r.w * f);
    const Y = Math.round(r.y);
    await chrome.send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: X(fromFrac), y: Y, buttons: 0 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: X(fromFrac), y: Y, button: 'left', buttons: 1, clickCount: 1 });
    for (let s = 1; s <= steps; s++) {
      const f = fromFrac + (toFrac - fromFrac) * (s / steps);
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved',
        x: X(f), y: Y, button: 'left', buttons: 1 });
      await sleep(35); // let the rAF-throttled scrub drain per step
    }
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: X(toFrac), y: Y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(300); // the parked pendingT renders on the next frame
  };
  try {
    await waitReady(chrome, 'GH-273 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '11: __playback seam');
    await fire(chrome, '11: shot A', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '11: shot B', { v0: 1.4, phi: -0.9, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    await chrome.eval('window.__playback.open()');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '11: session row');
    await chrome.eval('document.querySelector(".ob-pb-row").click()');
    await waitFor(chrome, 'window.__playback.playerOpen() === true', '11: player open');
    await sleep(400);
    const broadcastPose = await chrome.eval(POSE);
    check('11: open frames the broadcast default (static, rig off)',
      !!broadcastPose && P(broadcastPose).track === false, String(broadcastPose));
    // the two-shot corpus puts the segment boundary ~0.42 of the timeline;
    // measure it so the fracs below stay honest under corpus drift
    const bFrac = await chrome.eval(`(() => {
      const st = window.__playback.state();
      window.__playback.seek(st.total * 0.88);
      const at = window.__playback.state();
      return (at.t - at.clock) / at.total; })()`);
    check('11: boundary sits inside the drag range (corpus sanity)',
      bFrac > 0.3 && bFrac < 0.6, String(bFrac));

    // ---- 11a: REAL CHASE tap, then REAL within-segment scrubs ---------------
    await dragTrack(0.6, 0.88); // press past the boundary, park deep in seg 1
    check('11a: drag landed in segment 1',
      await chrome.eval('window.__playback.state().shot') === 1);
    await realClick(chrome, '.ob-pb-cam[data-cam="chase"]', '11a: chase tile');
    await sleep(250);
    const poseTap = await chrome.eval(POSE);
    check('11a: the tap hands the camera to the chase rig (pose fingerprint)',
      chaseClass(poseTap, broadcastPose), String(poseTap));
    check('11a: the tap wrote the per-segment assignment',
      JSON.stringify(await chrome.eval('window.__playback.state().cams'))
      === '[null,"chase"]');
    await dragTrack(0.88, 0.7); // backward WITHIN segment 1
    check('11a: still segment 1 after the within-segment scrub',
      await chrome.eval('window.__playback.state().shot') === 1);
    const poseWithin = await chrome.eval(POSE);
    check('11a: backward within-segment scrub stays CHASE-class '
      + '(moving-rig pose, not the broadcast static pose)',
      chaseClass(poseWithin, broadcastPose) && poseWithin !== poseTap,
      String(poseWithin));
    await dragTrack(0.7, 0.88); // forward back to the SAME pixel as the tap
    const poseTap2 = await chrome.eval(POSE);
    check('11a: same scrub pixel = same pose, BYTE-stable (render-clock law)',
      poseTap2 === poseTap, JSON.stringify({ poseTap, poseTap2 }));

    // ---- 11b: REAL scrubs ACROSS the segment boundary ------------------------
    await dragTrack(0.88, 0.2); // backward across the boundary into seg 0
    check('11b: drag crossed into segment 0',
      await chrome.eval('window.__playback.state().shot') === 0);
    const poseBack = await chrome.eval(POSE);
    check('11b: the selected camera SURVIVES the backward boundary crossing '
      + '(chase-class pose — the owner build-13 defect)',
      chaseClass(poseBack, broadcastPose), String(poseBack));
    check('11b: the chase tile stays pressed (secondary aria voice)',
      await chrome.eval(`document.querySelector('.ob-pb-cam[data-cam="chase"]')
        ?.getAttribute('aria-pressed')`) === 'true');
    await dragTrack(0.2, 0.88); // forward across the boundary, same pixel again
    const poseTap3 = await chrome.eval(POSE);
    check('11b: the pose is scrub-HISTORY independent across boundaries '
      + '(byte-equal at the same pixel after a round trip)',
      poseTap3 === poseTap, JSON.stringify({ poseTap, poseTap3 }));

    // ---- 11c: tap-then-scrub-then-PLAY — the track resumes at the scrub ------
    // position, deterministically across two identical runs
    const runScrubPlay = async (tag) => {
      await dragTrack(0.88, 0.2);
      const s0 = await chrome.eval('window.__playback.state()');
      const poseS = await chrome.eval(POSE);
      check(`${tag}: scrub pose is chase-class before play`,
        chaseClass(poseS, broadcastPose), String(poseS));
      await realClick(chrome, '.ob-pb-play', `${tag}: play`);
      await sleep(320);
      await realClick(chrome, '.ob-pb-play', `${tag}: pause`);
      await sleep(150);
      const s1 = await chrome.eval('window.__playback.state()');
      const poseP = await chrome.eval(POSE);
      check(`${tag}: play advanced from the scrub position in segment 0`,
        s1.playing === false && s1.t > s0.t && s1.shot === 0,
        JSON.stringify({ from: s0.t, to: s1.t }));
      check(`${tag}: the track RESUMED from the scrub position — rig active, `
        + 'eye byte-unmoved (no snap), smooth pan only',
        P(poseP).track === true && posDelta(poseP, poseS) < 1e-9
        && qDot(poseP, poseS) > 0.75,
        JSON.stringify({ poseS, poseP }));
      return poseS;
    };
    const run1 = await runScrubPlay('11c run 1');
    const run2 = await runScrubPlay('11c run 2');
    check('11c: DETERMINISTIC across two identical runs '
      + '(scrub pose byte-equal, play history in between)',
      run1 === run2, JSON.stringify({ run1, run2 }));

    // ---- 11d: the export args read the SAME assignment map the UI shows ------
    const plan1 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan().opts.perShotCamera))');
    check('11d: one CHASE choice exports as chase on BOTH segments '
      + '(backfill + re-emission; a moving rig is never null-inherited)',
      Array.isArray(plan1) && plan1.length === 2 && plan1.every((e) =>
        e && e.track && e.track.target === 'cue'
        && Array.isArray(e.track.cam) && e.track.cam.length === 3),
      JSON.stringify(plan1));
    // plan stability: the export args must not depend on the playhead
    await dragTrack(0.2, 0.88);
    const plan1b = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan().opts.perShotCamera))');
    check('11d: the plan is playhead-independent',
      JSON.stringify(plan1) === JSON.stringify(plan1b), JSON.stringify(plan1b));
    // mixed cut: REAL overhead tap on segment 0 → ['top', chase-directive],
    // and the UI voice (pressed tile per segment) matches it segment-by-segment.
    // GH-301: a STATIC pill tap now inserts at the QUANTIZED PLAYHEAD (the
    // owner-approved §3.2 pill law — arm 16 owns that behavior), so this
    // arm's segment-level claim taps AT the segment head, where the write
    // is byte-identical to the GH-273 assignment it always asserted.
    await dragTrack(0.88, 0.004);
    await realClick(chrome, '.ob-pb-cam[data-cam="overhead"]', '11d: overhead tile');
    await sleep(250);
    const uiSeg0 = await chrome.eval(`[...document.querySelectorAll('.ob-pb-cam')]
      .find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.cam`);
    await dragTrack(0.2, 0.88);
    const uiSeg1 = await chrome.eval(`[...document.querySelectorAll('.ob-pb-cam')]
      .find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.cam`);
    const plan2 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan().opts.perShotCamera))');
    check('11d: export args equal the UI assignment after tap+scrub '
      + '(seg 0 overhead=top explicit, seg 1 chase re-emitted with its eye)',
      uiSeg0 === 'overhead' && uiSeg1 === 'chase'
      && plan2.length === 2 && plan2[0] === 'top'
      && plan2[1]?.track?.target === 'cue'
      && Array.isArray(plan2[1]?.track?.cam),
      JSON.stringify({ uiSeg0, uiSeg1, plan2 }));

    // ---- 11g: canonical chase projection (review round-2 P2) -------------------
    // The rig never sets fov at start, so chase used to INHERIT the
    // previous preset's projection — 78° when entered from overhead. The
    // playhead sits at 0.88 (seg 1 chase) having just crossed from the
    // overhead segment 0: the pose must carry the canonical 40, and the
    // exported directive must pin the same fov (WYSIWYG).
    const poseChase78 = await chrome.eval(POSE);
    check('11g: chase entered FROM overhead wears the canonical 40 fov '
      + '(never the inherited 78)',
      !!poseChase78 && P(poseChase78).track === true
      && P(poseChase78).fov === 40, String(poseChase78));
    check('11g: the exported chase directive pins the same projection',
      await chrome.eval('window.__playback.plan().opts'
        + '.perShotCamera[1]?.track?.fov') === 40);

    // ---- 11h: live-vs-export WYSIWYG across the overhead→chase cut ------------
    // (GH-273 review round 3, red-proofed): round 2 snapped only the LIVE
    // camera to 40 through __dbg.camera, but the rig EASES fov and
    // renderDrill passes the directive untouched — an exported chase
    // segment entered from overhead eased 78→40 over ~0.35 s while the
    // live player cut instantly. The fovSnap directive moves the snap
    // into the rig's start() so both paths ride one mechanism. Fingerprint
    // the frames AFTER the cut in each path: live via an in-page rAF
    // sampler across a REAL play crossing, export via a REAL 640×360
    // renderDrill of the same plan sampled per encoded frame through the
    // forwarded onProgress hook (fires after each frame's render, before
    // the next — the pose is frame K's). Post-cut fov must be the
    // canonical 40 from the FIRST chase frame in BOTH paths, and the eye
    // must be the same deterministic per-segment seed (no crane in the
    // chase preset, so the post-cut eye is constant in both).
    await dragTrack(0.88, Math.max(0.05, bFrac - 0.08)); // park in seg 0
    check('11h: parked in segment 0 just before the cut',
      await chrome.eval('window.__playback.state().shot') === 0);
    await chrome.eval(`(() => {
      window.__fovLive = []; window.__fovOn = true;
      const tick = () => {
        const c = window.__dbg?.camera;
        if (c) window.__fovLive.push({ f: c.fov, p: [c.position.x,
          c.position.y, c.position.z], tr: !!window.__track?.active?.() });
        if (window.__fovOn) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick); return true; })()`);
    await realClick(chrome, '.ob-pb-play', '11h: play across the cut');
    await waitFor(chrome, 'window.__playback.state().shot === 1',
      '11h: play crossed into the chase segment', 100, 100);
    await sleep(400); // a few post-cut frames land under the sampler
    await realClick(chrome, '.ob-pb-play', '11h: pause');
    await chrome.eval('window.__fovOn = false');
    const live11h = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__fovLive))');
    const liveCut = live11h.findIndex((s) => s.tr === true);
    const livePost = liveCut > 0 ? live11h.slice(liveCut, liveCut + 5) : [];
    check('11h: the live crossing captured ≥5 post-cut frames',
      liveCut > 0 && livePost.length === 5,
      JSON.stringify({ liveCut, n: live11h.length }));
    check('11h: LIVE post-cut frames wear the canonical projection from '
      + 'the first chase frame', livePost.every((s) => Math.abs(s.f - 40) < 1e-6),
      JSON.stringify(livePost));
    await chrome.eval(`(() => {
      window.__fovExp = []; window.__fovExpDone = null;
      const plan = window.__playback.plan();
      window.__export.renderDrill(plan.records, { ...plan.opts,
        width: 640, height: 360, keepBlob: false, noDownload: true,
        withAudio: false,
        onProgress: () => { const c = window.__dbg.camera;
          window.__fovExp.push({ f: c.fov, p: [c.position.x, c.position.y,
            c.position.z], tr: !!window.__track.active() }); },
      }).then(() => { window.__fovExpDone = { ok: true }; },
        (e) => { window.__fovExpDone = { ok: false, err: String(e) }; });
      return true; })()`);
    await waitFor(chrome, 'window.__fovExpDone !== null',
      '11h: export render settled', 240, 500);
    const expDone = await chrome.eval('window.__fovExpDone');
    check('11h: the real export render succeeded', expDone?.ok === true,
      JSON.stringify(expDone));
    const expSeq = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__fovExp))');
    const expCut = expSeq.findIndex((s) => s.tr === true);
    const expPost = expCut > 0 ? expSeq.slice(expCut, expCut + 5) : [];
    check('11h: the export crossed the same cut with ≥5 post-cut frames',
      expCut > 0 && expPost.length === 5,
      JSON.stringify({ expCut, n: expSeq.length }));
    check('11h: EXPORT post-cut frames wear the SAME canonical projection '
      + 'from the first chase frame (the pre-fix rig eased 78→40 across '
      + 'the cut the live player cut instantly)',
      expPost.every((s) => Math.abs(s.f - 40) < 1e-6), JSON.stringify(expPost));
    check('11h: live and export post-cut fingerprints MATCH frame-by-frame '
      + '(fov + eye within float tolerance — WYSIWYG)',
      livePost.length === 5 && expPost.length === 5
      && livePost.every((s, i) => Math.abs(s.f - expPost[i].f) < 1e-6
        && Math.hypot(...s.p.map((v, j) => v - expPost[i].p[j])) < 1e-9),
      JSON.stringify({ livePost, expPost }));
    // re-pose the paused player bed (renderDrill's finally leaves the
    // settled table — the save card calls restorePlayerBed here)
    await chrome.eval('window.__playback.seek(window.__playback.state().total * 0.88)');
    await sleep(200);

    // ---- 11f: sibling audit — speed detent + trim survive scrubbing ----------
    await realClick(chrome, '.ob-pb-speed label:nth-child(2)', '11f: ½× detent');
    await chrome.eval('window.__playback.setTrim(0.5, '
      + 'window.__playback.state().total - 0.5)');
    const sib0 = await chrome.eval('window.__playback.state()');
    await dragTrack(0.88, 0.2);
    await dragTrack(0.2, 0.7);
    const sib1 = await chrome.eval('window.__playback.state()');
    check('11f: speed detent and trim handles survive every scrub direction',
      sib1.speed === 0.5 && sib0.speed === 0.5
      && sib1.tIn === sib0.tIn && sib1.tOut === sib0.tOut,
      JSON.stringify({ sib0, sib1 }));

    // ---- 11e: close/reopen keeps the assignments (the latch law) -------------
    await realClick(chrome, '#ob-pb-player .ob-pb-pillico', '11e: back pill');
    await waitFor(chrome, 'window.__playback.playerOpen() === false',
      '11e: player closed');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '11e: list back');
    await chrome.eval('document.querySelector(".ob-pb-row").click()');
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '11e: player reopened');
    await sleep(400);
    const reopen = await chrome.eval('window.__playback.state()');
    const poseReopen = await chrome.eval(POSE);
    check('11e: reopen READS the latched per-segment assignments',
      JSON.stringify(reopen.cams) === '["overhead","chase"]',
      JSON.stringify(reopen.cams));
    check('11e: the reopened bed frames segment 0 on ITS assigned camera '
      + '(overhead pose, not the broadcast default)',
      !!poseReopen && poseReopen !== broadcastPose
      && P(poseReopen).fov !== P(broadcastPose).fov
      && await chrome.eval(`document.querySelector(
        '.ob-pb-cam[data-cam="overhead"]')?.getAttribute('aria-pressed')`)
        === 'true',
      String(poseReopen));
    await chrome.eval('window.__playback.close()');
    await sleep(600);

    const appErr11 = await chrome.eval('__test.errors.slice()');
    check('11: zero app errors', appErr11.length === 0, JSON.stringify(appErr11));
    check('11: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 12: POV preset — "address then rise" (GH-275) ------------------------
// Owner decision B: a new shelf tile arming the camerascript.js pure pose(t)
// rig per segment. Every camera assertion is a POSE fingerprint at full
// Float64 (the arm-11 doctrine); the POV pose class is fov 60 + rig-less
// (track false) + off the broadcast static pose. Red-proof CONTROLS ride
// inside the arm (the 6e-control convention): the stale-rig register is
// exercised by really neutering the trampoline, and the pose-class
// predicate is proven to discriminate before it is trusted.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 10 });
  watch(chrome, errs);
  // GH-911 (plan C7 (7)): watch() keeps console errors only, so a second
  // listener keeps the playback open's `pov-rod engine:` console.info line.
  // Each open (12b, 12g, the 12b-elev sub-block) marks the capture before it
  // opens and prints what arrived after its plan read, `12 engine: none`
  // when the open printed no engine line.
  const engLines12 = [];
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'info') {
      const s = params.args.map((a) => a.value ?? a.description).join(' ');
      if (s.startsWith('pov-rod engine:')) engLines12.push(s);
    }
  });
  let engMark12 = 0;
  const engPrint12 = () => {
    const got = engLines12.slice(engMark12);
    engMark12 = engLines12.length;
    if (!got.length) console.log('12 engine: none');
    for (const s of got) console.log(`12 engine: ${s}`);
  };
  // GH-911 (plan C7 (1), (2), (2a)): the address height h = cam z - look z
  // of a segment's first move, read from the leaf's own output. `unfired`
  // is the shipped 0.36 pin, `fired` a lift at or above the pin's own 1e-9
  // (no new tolerance), `below` a height under 0.36, which the lift never
  // gives. `shape` holds on unfired or fired; which branch is right is the
  // E12 judge's call, from its independent source, never the suite's.
  const povBranch12 = (h) => (Math.abs(h - 0.36) < 1e-9 ? 'unfired'
    : (h - 0.36 >= 1e-9 ? 'fired' : 'below'));
  /** One `12b seg=` line per plan element, outside shape and check so it
   * prints even when a shape clause short-circuits; optional chaining only,
   * so no read here can throw (a missing or non-finite height is `none`). */
  const segLine12 = (id, e) => {
    const c = e?.script?.moves?.[0]?.cam?.[2];
    const l = e?.script?.moves?.[0]?.look?.[2];
    if (!Number.isFinite(c) || !Number.isFinite(l)) return `12b seg=${id} branch=none h=-`;
    return `12b seg=${id} branch=${povBranch12(c - l)} h=${c - l}`;
  };
  const firstLine12 = (e) => String(e?.message ?? e).split('\n')[0];
  const POSE = `(() => { const c = window.__dbg?.camera; return c
    ? JSON.stringify({ p: [c.position.x, c.position.y, c.position.z],
      q: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w],
      fov: c.fov, track: !!window.__track?.active?.() }) : null; })()`;
  const P = (s) => JSON.parse(s);
  const posDelta = (a, b) => Math.hypot(...P(a).p.map((v, i) => v - P(b).p[i]));
  /** POV pose class: the scripted rig's own signature — the pinned fov 60,
   * NO moving rig, and not the broadcast static pose. */
  const povClass = (pose, broadcast) => !!pose && P(pose).track === false
    && Math.abs(P(pose).fov - 60) < 1e-9 && posDelta(pose, broadcast) > 5e-3;
  /** kernel [kx, ky, h] → the three-frame [x, y, z] POSE.p convention. */
  const kToP = (k) => [k[1], k[2], k[0]];
  const eq3 = (a, b, tol = 0) => a.length === 3
    && a.every((v, i) => (tol ? Math.abs(v - b[i]) <= tol : v === b[i]));
  const dragTrack = async (fromFrac, toFrac, steps = 6) => {
    const r = await chrome.eval(`(() => {
      const el = document.querySelector('.ob-pb-track');
      if (!el || !el.getClientRects().length) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y + b.height / 2, w: b.width };
    })()`);
    if (!r) { fail('12: no visible .ob-pb-track to drag'); return; }
    const X = (f) => Math.round(r.x + r.w * f);
    const Y = Math.round(r.y);
    await chrome.send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: X(fromFrac), y: Y, buttons: 0 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: X(fromFrac), y: Y, button: 'left', buttons: 1, clickCount: 1 });
    for (let s = 1; s <= steps; s++) {
      const f = fromFrac + (toFrac - fromFrac) * (s / steps);
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved',
        x: X(f), y: Y, button: 'left', buttons: 1 });
      await sleep(35);
    }
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: X(toFrac), y: Y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(300);
  };
  try {
    await waitReady(chrome, 'GH-275 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '12: __playback seam');
    await fire(chrome, '12: shot A', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '12: shot B', { v0: 1.4, phi: -0.9, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const poseLive0 = await chrome.eval(POSE); // the pre-open live framing
    engMark12 = engLines12.length; // GH-911 C7 (7): the 12b open's capture
    await chrome.eval('window.__playback.open()');
    await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length === 1',
      '12: session row');
    await chrome.eval('document.querySelector(".ob-pb-row").click()');
    await waitFor(chrome, 'window.__playback.playerOpen() === true', '12: player open');
    // the tap arms through the guarded camerascript.js import — make the
    // rig's presence part of the arm, not a race (main.js polling contract)
    await waitFor(chrome, 'window.__test.cameraScript?.(null) === true',
      '12: camerascript rig loaded');
    await sleep(400);
    const broadcastPose = await chrome.eval(POSE);
    check('12: open frames the broadcast default (static, rig off, not fov 60)',
      !!broadcastPose && P(broadcastPose).track === false
      && P(broadcastPose).fov !== 60, String(broadcastPose));
    const bFrac = await chrome.eval(`(() => {
      const st = window.__playback.state();
      window.__playback.seek(st.total * 0.88);
      const at = window.__playback.state();
      window.__playback.seek(0);
      return (at.t - at.clock) / at.total; })()`);
    check('12: boundary sits inside the drag range (corpus sanity)',
      bFrac > 0.3 && bFrac < 0.6, String(bFrac));
    const total12 = await chrome.eval('window.__playback.state().total');
    const B = bFrac * total12;

    // ---- 12a: REAL POV tile tap arms the preset -------------------------------
    await dragTrack(0.6, 0.88); // park deep in segment 1
    check('12a: drag landed in segment 1',
      await chrome.eval('window.__playback.state().shot') === 1);
    // red-proof CONTROL (the 6e-control convention): with the rig REALLY
    // neutered (the stale-camerascript register), the tap must leave the
    // previous framing — proving the pose-class predicate discriminates
    // and that the live degrade is a no-op, never a throw
    await chrome.eval(`(() => { window.__realCamScript =
      window.__test.cameraScript;
      window.__test.cameraScript = () => false; })()`);
    await realClick(chrome, '.ob-pb-cam[data-cam="pov"]', '12a-control: pov tile');
    await sleep(250);
    const poseNeutered = await chrome.eval(POSE);
    check('12a control: a neutered (stale) rig leaves the previous framing '
      + 'and the POV pose class correctly answers NO',
      !povClass(poseNeutered, broadcastPose)
      && await chrome.eval('__test.errors.length') === 0,
      String(poseNeutered));
    await chrome.eval(
      'window.__test.cameraScript = window.__realCamScript; true');
    // the real tap (tile still pressed from the control tap; the assignment
    // was already written — re-tap re-arms through renderAtT)
    await realClick(chrome, '.ob-pb-cam[data-cam="pov"]', '12a: pov tile');
    await sleep(250);
    const poseTap = await chrome.eval(POSE);
    check('12a: the tap hands the camera to the POV script '
      + '(pose fingerprint: fov 60, rig-less, off broadcast)',
      povClass(poseTap, broadcastPose), String(poseTap));
    check('12a: the tap wrote the per-segment assignment',
      JSON.stringify(await chrome.eval('window.__playback.state().cams'))
      === '[null,"pov"]');

    // ---- 12b: scrub forward/backward keeps it; address vs risen by local t ----
    const plan12 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan().opts.perShotCamera))');
    // GH-911 (plan C7 (2), (2a), (2b), (b10)): the per-segment branch and
    // record lines, printed before the :6300 check decides (check never
    // throws). The two reads are C7's own evals, each guarded: a throw
    // prints its first line and leaves the value null, so k (the records
    // length) or the `12b rec seg=` count comes up short for the judge.
    let recsLen12 = null;
    try {
      recsLen12 = await chrome.eval('window.__playback.plan().records.length');
    } catch (e) { console.log(`12b recs-read=throw ${firstLine12(e)}`); recsLen12 = null; }
    let recs12 = null;
    try {
      recs12 = await chrome.eval(`window.__playback.plan().records.map((r) =>
        (typeof r === 'string' ? r : JSON.stringify(r)))`);
    } catch (e) { console.log(`12b rec-read=throw ${firstLine12(e)}`); recs12 = null; }
    if (!Array.isArray(plan12)) console.log('12b seg-src=nonarray');
    (Array.isArray(plan12) ? plan12 : []).forEach((e, i) => {
      console.log(segLine12(i, e));
      if (typeof recs12?.[i] === 'string') console.log(`12b rec seg=${i} ${recs12[i]}`);
    });
    engPrint12();
    check('12b: BOTH segments export the POV script directive '
      + '(backfill + explicit per segment, never null-inherited)',
      Array.isArray(plan12) && plan12.length === 2
      && plan12.every((e) => e && e.script && Array.isArray(e.script.moves)),
      JSON.stringify(plan12).slice(0, 400));
    const shape = (d) => {
      const m = d?.script?.moves;
      return Array.isArray(m) && m.length === 2
        && m[0].kind === 'pose' && m[0].t0 === 0 && m[0].fov === 60
        && m[1].kind === 'dolly' && m[1].ease === 'smoother' && m[1].fov === 60
        && m[1].t0 === m[0].t1 && Math.abs(m[1].t1 - m[1].t0 - 1.4) < 1e-9
        && m[1].path?.length === 2
        && eq3(m[1].path[0].cam, m[0].cam) && eq3(m[1].path[0].look, m[0].look)
        && m[1].path[1].cam[2] === 0.81
        && eq3(m[1].path[1].look, [0, 0, 0.02])
        // GH-911 (plan C7 (1)): the two-branch height clause, unfired
        // (the 0.36 pin) or fired (lifted by at least the pin's 1e-9)
        && povBranch12(m[0].cam[2] - m[0].look[2]) !== 'below';
    };
    check('12b: the directive is the decision-comment math verbatim '
      + '(address pose fov 60 -> 1.4 s smoother dolly to h 0.81 watching '
      + '[0,0,0.02])', plan12.every(shape), JSON.stringify(plan12).slice(0, 400));
    check('12b control: the shape predicate REJECTS a chase directive '
      + '(it cannot be satisfied vacuously)',
      !shape({ script: { moves: [] } })
      && !shape({ track: { target: 'cue' } }), 'predicate control');
    check('12b: per-segment scripts anchor on their OWN records '
      + '(different address eyes across the cut)',
      !eq3(plan12[0].script.moves[0].cam, plan12[1].script.moves[0].cam),
      JSON.stringify([plan12[0].script.moves[0].cam,
        plan12[1].script.moves[0].cam]));
    // plan stability: the export args must not depend on the playhead
    await dragTrack(0.88, 0.7);
    const plan12b = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan().opts.perShotCamera))');
    check('12b: the plan is playhead-independent',
      JSON.stringify(plan12) === JSON.stringify(plan12b), 'plan drifted');
    // WYSIWYG anchor: the LIVE pose at an address-window t equals the
    // exported directive's own kernel-frame address pose, byte-for-byte
    // (both sides are the ONE povScript builder — kToThree is set(k1,k2,k0))
    const rise0 = plan12[0].script.moves[1]; // segment 0 rise window
    await chrome.eval('window.__playback.seek(0.02)');
    await sleep(150);
    const poseAddr = await chrome.eval(POSE);
    check('12b: seg-0 address pose == the exported directive, byte-for-byte '
      + '(WYSIWYG: one builder feeds the tap and the plan)',
      !!poseAddr && eq3(P(poseAddr).p, kToP(plan12[0].script.moves[0].cam))
      && P(poseAddr).fov === 60, JSON.stringify({ poseAddr,
        want: kToP(plan12[0].script.moves[0].cam) }));
    // corpus sanity: segment 0 outlives its rise, so the risen register is
    // reachable inside the segment
    check('12b: segment 0 outlives its rise (corpus sanity)',
      B > rise0.t1 + 0.15, JSON.stringify({ B, riseEnd: rise0.t1 }));
    await chrome.eval(`window.__playback.seek(${rise0.t1 + 0.1})`);
    await sleep(150);
    const poseRisen = await chrome.eval(POSE);
    // tolerance 1e-9, not byte-exact: the dolly evaluator clamps its leg
    // parameter to legs - 1e-12 (never indexes past the last leg), so the
    // held end pose sits ~1e-12 lerp-widths from path[1] BY DESIGN — the
    // byte law lives in 12c (same t = same bytes), not here
    check('12b: past the rise the pose is the STANDING eye (world y 0.81, '
      + 'the floor-relative lamp-canopy clamp), still fov 60',
      !!poseRisen && eq3(P(poseRisen).p, kToP(rise0.path[1].cam), 1e-9)
      && Math.abs(P(poseRisen).p[1] - 0.81) < 1e-9 && P(poseRisen).fov === 60,
      JSON.stringify({ poseRisen, want: kToP(rise0.path[1].cam) }));
    check('12b control: address and risen registers are DISTINCT poses '
      + '(the local-t discrimination is real)',
      posDelta(poseAddr, poseRisen) > 0.2,
      String(posDelta(poseAddr, poseRisen)));

    // ---- 12c: the rise is deterministic — same t, byte-identical pose ---------
    const tMid = rise0.t0 + 0.7; // mid-rise, the eased-motion register
    const seekPose = async (T) => {
      await chrome.eval(`window.__playback.seek(${T})`);
      await sleep(150);
      return chrome.eval(POSE);
    };
    const mid1 = await seekPose(tMid);
    await seekPose(0.05);            // excursion: address
    await seekPose(rise0.t1 + 0.2);  // excursion: risen, other side
    const mid2 = await seekPose(tMid);
    check('12c: two renders of the SAME mid-rise t are byte-identical '
      + '(the pose is a pure function of the render clock)',
      !!mid1 && mid1 === mid2, JSON.stringify({ mid1, mid2 }));
    check('12c: and the mid-rise pose really is mid-motion (between the '
      + 'address and standing eyes)',
      P(mid1).p[1] > P(poseAddr).p[1] + 0.02
      && P(mid1).p[1] < 0.81 - 0.02, String(P(mid1).p[1]));

    // ---- 12d: boundary crossings keep the assignment (scrub survival) ---------
    await dragTrack(0.2, 0.88); // forward across the boundary into seg 1
    check('12d: drag crossed into segment 1',
      await chrome.eval('window.__playback.state().shot') === 1);
    const poseSeg1 = await chrome.eval(POSE);
    check('12d: POV survives the forward boundary crossing (pose class)',
      povClass(poseSeg1, broadcastPose), String(poseSeg1));
    await dragTrack(0.88, 0.2); // backward across the boundary into seg 0
    check('12d: drag crossed back into segment 0',
      await chrome.eval('window.__playback.state().shot') === 0);
    const poseSeg0 = await chrome.eval(POSE);
    check('12d: POV survives the backward crossing too (backfill — the '
      + 'GH-273 user-state law)', povClass(poseSeg0, broadcastPose),
    String(poseSeg0));
    check('12d: the pov tile stays pressed (secondary aria voice)',
      await chrome.eval(`document.querySelector('.ob-pb-cam[data-cam="pov"]')
        ?.getAttribute('aria-pressed')`) === 'true');
    await dragTrack(0.2, 0.88); // same pixel as 12d's first park
    const poseSeg1b = await chrome.eval(POSE);
    check('12d: same scrub pixel = same pose after a boundary round trip '
      + '(byte-stable, scrub-history independent)',
      poseSeg1b === poseSeg1, JSON.stringify({ poseSeg1, poseSeg1b }));

    // ---- 12e: live-vs-export fingerprint across a cut INTO a POV segment ------
    // (the 11h doctrine): seg 0 overhead, seg 1 POV; the first frames after
    // the cut must wear fov 60 and the SAME address eye in BOTH paths — the
    // address hold is >= tImpact+0.3 s, so the first 5 post-cut frames are
    // inside it in either clock (rAF live, 60 fps export).
    // GH-301: the static pill tap lands at the segment HEAD (the §3.2 pill
    // law inserts at the playhead now — the 11d note; arm 16 owns mid-
    // segment inserts), keeping this arm's segment-level cut intact.
    await dragTrack(0.88, 0.004);
    await realClick(chrome, '.ob-pb-cam[data-cam="overhead"]', '12e: overhead tile');
    await sleep(250);
    check('12e: mixed cut assigned (overhead then pov)',
      JSON.stringify(await chrome.eval('window.__playback.state().cams'))
      === '["overhead","pov"]');
    // a tight trim keeps the REAL 640x360 export short (~1.5 s) while still
    // exercising trims + the pov directive together
    await chrome.eval(`window.__playback.setTrim(${B - 0.5}, ${B + 1.0})`);
    await chrome.eval(`window.__playback.seek(${B - 0.3})`);
    await sleep(200);
    await chrome.eval(`(() => {
      window.__povLive = []; window.__povOn = true;
      const tick = () => {
        const c = window.__dbg?.camera;
        if (c) window.__povLive.push({ f: c.fov, p: [c.position.x,
          c.position.y, c.position.z] });
        if (window.__povOn) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick); return true; })()`);
    await realClick(chrome, '.ob-pb-play', '12e: play across the cut');
    await waitFor(chrome, 'window.__playback.state().shot === 1',
      '12e: play crossed into the POV segment', 100, 100);
    await sleep(400);
    await realClick(chrome, '.ob-pb-play', '12e: pause');
    await chrome.eval('window.__povOn = false');
    const live12 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__povLive))');
    const liveCut = live12.findIndex((s) => Math.abs(s.f - 60) < 1e-9);
    const livePost = liveCut > 0 ? live12.slice(liveCut, liveCut + 5) : [];
    check('12e: the live crossing captured >= 5 post-cut frames',
      liveCut > 0 && livePost.length === 5,
      JSON.stringify({ liveCut, n: live12.length }));
    const addr1 = kToP(plan12[1].script.moves[0].cam);
    check('12e: LIVE post-cut frames hold the seg-1 ADDRESS pose at fov 60 '
      + 'from the first POV frame',
      livePost.every((s) => Math.abs(s.f - 60) < 1e-9 && eq3(s.p, addr1)),
      JSON.stringify({ livePost, addr1 }));
    // GH-313 (GH-318 residual C5.1, mechanism pinned by review r4): the pose
    // is sampled at RENDER time, never at CALLBACK time. runExport's loop is
    // renderAt(K) → encode → BACKPRESSURE (await sleep(2) polls — engaged
    // only under load) → onProgress(K+1): during those awaits the event loop
    // runs and the app's own handlers can move the SHARED __dbg.camera, so a
    // callback-time read sampled a stale pose — the measured loser mode (the
    // 5th sample past the address hold, same escaped pose every time, load-
    // dependent). Wrapping the export's two render entries (__test.renderAt /
    // renderAccum — one call per output frame) samples synchronously with
    // the render itself: one sample per virtual frame BY CONSTRUCTION, and
    // on a quiet box byte-identical to what the callback used to read.
    await chrome.eval(`(() => {
      window.__povExp = []; window.__povExpDone = null;
      const T = window.__test;
      const real = { at: T.renderAt, accum: T.renderAccum };
      const sample = () => { const c = window.__dbg.camera;
        window.__povExp.push({ f: c.fov, p: [c.position.x, c.position.y,
          c.position.z] }); };
      T.renderAt = (...a) => { const r = real.at.apply(T, a); sample(); return r; };
      T.renderAccum = (...a) => { const r = real.accum.apply(T, a); sample(); return r; };
      const plan = window.__playback.plan();
      window.__export.renderDrill(plan.records, { ...plan.opts,
        width: 640, height: 360, keepBlob: false, noDownload: true,
        withAudio: false,
      }).then(() => { window.__povExpDone = { ok: true }; },
        (e) => { window.__povExpDone = { ok: false, err: String(e) }; })
        .finally(() => { T.renderAt = real.at; T.renderAccum = real.accum; });
      return true; })()`);
    await waitFor(chrome, 'window.__povExpDone !== null',
      '12e: export render settled', 240, 500);
    const expDone12 = await chrome.eval('window.__povExpDone');
    check('12e: the real export render succeeded (the { script } directive '
      + 'armed — a stale rig would have thrown the honest error)',
      expDone12?.ok === true, JSON.stringify(expDone12));
    const expSeq = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__povExp))');
    const expCut = expSeq.findIndex((s) => Math.abs(s.f - 60) < 1e-9);
    const expPost = expCut > 0 ? expSeq.slice(expCut, expCut + 5) : [];
    // review r2 P2: one render call (and so one sample) per output frame —
    // the window MUST hold all five frames on any box; fewer means a
    // truncated export, which must fail, not pass.
    check('12e: the export crossed the same cut with all five post-cut '
      + 'frames sampled at render time',
    expCut > 0 && expPost.length === 5,
    JSON.stringify({ expCut, n: expSeq.length }));
    check('12e: live and export post-cut fingerprints MATCH byte-for-byte '
      + '(fov 60 + the same address eye on the first five post-cut frames '
      + '— WYSIWYG across the cut)',
    livePost.length === 5 && expPost.length === 5
      && expPost.every((s) => Math.abs(s.f - 60) < 1e-9 && eq3(s.p, addr1)),
    JSON.stringify({ expPost, addr1 }));

    // ---- 12h: a held script survives a null-inherit cut (review r3 P2) --------
    // renderDrill documents `perShotCamera[i] = null` as "keep the previous
    // segment's camera". For a SCRIPT that means the armed rig holds (pure
    // pose(t) over each segment's own clock) — including an overhead move's
    // canopy-hide. The pre-fix per-segment disarm restored the canopy MID-
    // TIMELINE, so the inherited top-down segment rendered THROUGH it.
    const nullInherit = await chrome.eval(`(async () => {
      const lr = (await import('/scene/room.js')).activeRoom?.instance?.lightRefs;
      if (!lr?.lampFace) return { err: 'no lightRefs handle' };
      const plan = window.__playback.plan();
      const vis = [];
      try {
        await window.__export.renderDrill(plan.records, { ...plan.opts,
          trims: [{ startT: 0, endT: 0.25 }, { startT: 0, endT: 0.25 }],
          perShotCamera: [
            { script: { moves: [{ kind: 'overhead', t0: 0, t1: 0.2 }] } },
            null],
          width: 320, height: 180, keepBlob: false, noDownload: true,
          withAudio: false,
          onProgress: () => { vis.push(lr.lampFace.visible); },
        });
      } catch (e) { return { err: String(e) }; }
      return { frames: vis.length, anyVisible: vis.some((v) => v === true),
        seg1Tail: vis.slice(-10), restored: lr.lampFace.visible };
    })()`);
    check('12h: the overhead script keeps its canopy-hide across the '
      + 'null-inherit cut (no frame renders through the canopy) and the '
      + 'finally restores it',
      !nullInherit.err && nullInherit.frames > 30
      && nullInherit.anyVisible === false && nullInherit.restored === true,
      JSON.stringify(nullInherit));

    // re-enter the POV segment across a boundary: the crossing re-arms the
    // script after the export's finally disarmed it (renderAtT stays the
    // ONE camera authority) — and 12f below then proves the CLOSE disarm
    // against a genuinely armed script
    await chrome.eval('window.__playback.seek(0.1)');
    await sleep(150);
    await chrome.eval(`window.__playback.seek(${B + 0.2})`);
    await sleep(150);
    const poseReArm = await chrome.eval(POSE);
    check('12e: the next boundary crossing re-arms the POV script after '
      + 'the export', povClass(poseReArm, broadcastPose), String(poseReArm));

    // ---- 12f: close disarms the script — the live camera comes back ----------
    await realClick(chrome, '#ob-pb-player .ob-pb-pillico', '12f: back pill');
    await waitFor(chrome, 'window.__playback.playerOpen() === false',
      '12f: player closed');
    await sleep(700); // several live RAF frames — an armed script would
    // re-pose every one of them (the one-writer close law)
    const poseClosed = await chrome.eval(POSE);
    check('12f: the restored live framing holds after close — the POV '
      + 'script no longer writes the camera',
      !!poseClosed && posDelta(poseClosed, poseLive0) < 1e-6
      && P(poseClosed).fov === P(poseLive0).fov
      && P(poseClosed).fov !== 60,
      JSON.stringify({ poseLive0, poseClosed }));
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '12g: close re-settled', 80, 250);

    // ---- 12g: a MALFORMED record (non-finite event t) still exports ----------
    // Review nit: povScript validates only [p.x,p.y,p.z,phi], so a matched
    // BallBall event whose t is non-finite rode into the moves spec as
    // tRise=NaN — camerascript rejected the spec at arm time (live degraded
    // to the previous framing, fine) but an EXPORT threw the honest
    // stale-module error about what is actually BAD DATA. The povTImpact
    // guard folds a non-finite matched t into the documented 0.5 s no-event
    // default, so both paths degrade to a VALID POV script. Shim: the
    // kernel sampler strictly rejects a corrupted record STRING at open
    // (measured — the record could never stage), so the corruption lands on
    // the JS-side PARSED VIEW the pov builder reads: a scoped JSON.parse
    // wrap NaNs the first BallBall t of shot A's parse (phi = PI/2 keys the
    // record; the pristine string still feeds engine.sampler, so the
    // session opens). ONCE only — the first matching parse IS pb.recs[0]
    // (the archive hands structured clones, and loadRecord's own parse
    // comes later): g.record must stay pristine or the post-export live
    // restore re-stringifies the NaN and the sampler rejects it, an
    // artifact of the shim, not of the register. Segment 1 stays pristine.
    const sid12 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('12g: session id resolvable', Number.isFinite(sid12), String(sid12));
    await chrome.eval(`(() => {
      window.__realParse12 = JSON.parse;
      window.__corrupt12 = 0;
      JSON.parse = function (s, r) {
        const o = window.__realParse12.call(JSON, s, r);
        if (!window.__corrupt12 && o && typeof o.kernel_version === 'string'
          && Array.isArray(o.events) && o.shot?.phi === Math.PI / 2) {
          for (const e of o.events) {
            const k = e?.kind;
            if (k && typeof k !== 'string' && k.BallBall) {
              e.t = NaN; window.__corrupt12++; break;
            }
          }
        }
        return o;
      };
      return true; })()`);
    engMark12 = engLines12.length; // GH-911 C7 (7): the 12g open's capture
    check('12g: session reopens over the malformed record (the kernel gets '
      + 'the pristine string; only the JS view is corrupted)',
      await chrome.eval(`window.__playback.openSession(${sid12})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '12g: player open');
    await waitFor(chrome, 'window.__test.cameraScript?.(null) === true',
      '12g: camerascript rig loaded');
    await chrome.eval('JSON.parse = window.__realParse12; true');
    check('12g control: the corruption REALLY landed on a matched BallBall '
      + 'event, exactly once — pb.recs[0], the pov builder\'s view (the '
      + 'register is exercised, never vacuous; g.record stays pristine)',
      await chrome.eval('window.__corrupt12') === 1,
      String(await chrome.eval('window.__corrupt12')));
    await chrome.eval('window.__playback.seek(0.02)');
    await sleep(150);
    await realClick(chrome, '.ob-pb-cam[data-cam="pov"]', '12g: pov tile');
    await sleep(250);
    const poseBad = await chrome.eval(POSE);
    check('12g: the POV script ARMS over the malformed record — live pose '
      + 'class (fov 60, rig-less, off broadcast), never a rejected spec',
      povClass(poseBad, broadcastPose), String(poseBad));
    const plan12g = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan().opts.perShotCamera))');
    engPrint12(); // GH-911 C7 (7)
    check('12g: every exported move time is FINITE (pre-fix, the corrupted '
      + 't rode into moves[0].t1 as a non-finite value camerascript rejects)',
      Array.isArray(plan12g) && plan12g.length === 2
      && plan12g.every((e) => e?.script?.moves?.every((m) =>
        Number.isFinite(m.t0) && Number.isFinite(m.t1))),
      JSON.stringify(plan12g).slice(0, 400));
    check('12g: the malformed segment wears the documented 0.5 s default '
      + '(address hold ends at 0.5 + 0.3 exactly, the no-event fallback)',
      plan12g[0].script.moves[0].t1 === 0.8,
      JSON.stringify(plan12g[0].script.moves.map((m) => [m.t0, m.t1])));
    check('12g: the pristine segment still carries the decision-comment '
      + 'shape verbatim (the guard never rewrites good data)',
      shape(plan12g[1]) && plan12g[1].script.moves[0].t1 !== 0.8,
      JSON.stringify(plan12g[1]).slice(0, 400));
    const expBad = await chrome.eval(`(async () => {
      const plan = window.__playback.plan();
      try {
        await window.__export.renderDrill(plan.records, { ...plan.opts,
          trims: [{ startT: 0, endT: 0.25 }, { startT: 0, endT: 0.25 }],
          width: 320, height: 180, keepBlob: false, noDownload: true,
          withAudio: false });
      } catch (e) { return { ok: false, err: String(e) }; }
      return { ok: true };
    })()`);
    check('12g: a REAL export of the malformed-record plan SUCCEEDS — bad '
      + 'data degrades to a valid POV script, never the stale-module throw',
      expBad.ok === true, JSON.stringify(expBad));
    await chrome.eval('window.__playback.close()');
    await sleep(400);

    // ---- 12b-elev: one ELEVATED shot through the same fire path (GH-911) -----
    // Plan C7 (3): shots A and B fire at theta 0, so whether either lifts is
    // not decidable from the page; this sub-block adds shot B's parameters at
    // theta 0.35 rad (the largest record elevation the suite already fires,
    // arm 27), so the two-segment checks above keep their two segments. It
    // predicts one session row holding A, B and this shot (no rerack, mode,
    // game or drill boundary splits the archive session) and prints the
    // prediction beside the observation; whether the shot fires is the E12
    // judge's call. Tags outside the 12b checks begin `12 elev:`, so a wait
    // or fire FAIL here is not a 12b line. Every read is C7's own and
    // guarded, and the body sits in one try/catch naming its step, so no
    // sub-block throw reaches the arm's catch (C7 r9 (b), r10 (b10)).
    let planE12 = null, recsLenE12 = null, stepE12 = 'settle';
    try {
      const settledE = await waitFor(chrome, '__test.state() !== "PLAYBACK"',
        '12 elev: close re-settled', 80, 250);
      if (!settledE) {
        console.log('12b-elev settle=false');
        console.log('12b-elev fire=skipped');
      } else {
        console.log(`12b-elev pre state=${await chrome.eval('__test.state()')}`);
        stepE12 = 'fire';
        const firedE = await fire(chrome, '12 elev: shot',
          { v0: 1.4, phi: -0.9, theta: 0.35, a: 0, b: 0 });
        console.log(`12b-elev fire=${firedE}`);
        // a settled shot rests in AIM, BALL_IN_HAND (a foul) or WIN (the 9
        // potted); REJECTED, PLAYBACK, SETTLED or SIMULATING skip the open
        // (C7 r10 (f10) with its r11 bracket)
        if (firedE === 'AIM' || firedE === 'BALL_IN_HAND' || firedE === 'WIN') {
          stepE12 = 'flush';
          await chrome.eval('window.__archive.flush()');
          stepE12 = 'list';
          engMark12 = engLines12.length; // C7 (7): the sub-block open's capture
          await chrome.eval('window.__playback.open()');
          await waitFor(chrome, 'document.querySelectorAll(".ob-pb-row").length >= 1',
            '12 elev: session row');
          const rowsE = await chrome.eval('document.querySelectorAll(".ob-pb-row").length');
          stepE12 = 'row';
          await chrome.eval('document.querySelector(".ob-pb-row").click()');
          await waitFor(chrome, 'window.__playback.playerOpen() === true',
            '12 elev: player open');
          await waitFor(chrome, 'window.__test.cameraScript?.(null) === true',
            '12 elev: camerascript rig loaded');
          stepE12 = 'tile';
          await chrome.eval('window.__playback.seek(0.02)');
          await sleep(150);
          await realClick(chrome, '.ob-pb-cam[data-cam="pov"]', '12 elev: pov tile');
          await sleep(250);
          stepE12 = 'plan';
          let planThrewE = false;
          try {
            planE12 = await chrome.eval(
              'JSON.parse(JSON.stringify(window.__playback.plan().opts.perShotCamera))');
          } catch (e) {
            planThrewE = true;
            console.log(`12b-elev plan-read=throw ${firstLine12(e)}`);
            planE12 = null;
          }
          if (!planThrewE && !Array.isArray(planE12)) console.log('12b-elev plan-read=nonarray');
          try {
            recsLenE12 = await chrome.eval('window.__playback.plan().records.length');
          } catch (e) { console.log(`12b recs-read=throw ${firstLine12(e)}`); recsLenE12 = null; }
          stepE12 = 'recs';
          let recsE = null;
          if (Array.isArray(planE12)) {
            try {
              recsE = await chrome.eval(`window.__playback.plan().records.map((r) =>
                (typeof r === 'string' ? r : JSON.stringify(r)))`);
            } catch (e) { console.log(`12b-elev recs-read=throw ${firstLine12(e)}`); recsE = null; }
          }
          stepE12 = 'loop';
          (Array.isArray(planE12) ? planE12 : []).forEach((e, i) => {
            console.log(segLine12(`e${i}`, e));
            if (typeof recsE?.[i] === 'string') console.log(`12b rec seg=e${i} ${recsE[i]}`);
          });
          stepE12 = 'check';
          if (Array.isArray(planE12)) {
            check('12b-elev: the elevated-shot session exports the decision-comment '
              + 'directive on every segment (address pose fov 60 -> 1.4 s smoother '
              + 'dolly to h 0.81, the two-branch height clause)',
              planE12.every(shape), JSON.stringify(planE12).slice(0, 400));
          }
          console.log(`12b-elev predicted rows=1 segs=3 observed rows=${rowsE} `
            + `segs=${Array.isArray(planE12) ? planE12.length : '-'}`);
          stepE12 = 'engine';
          engPrint12();
        }
      }
    } catch (e) { console.log(`12b-elev sub-block=throw ${stepE12} ${firstLine12(e)}`); }
    // C7 (2b): the comparands, after both loops — n over the two plans the
    // loops walked (12g's plan adds none), k over the two records reads
    console.log(`12b segs=${(Array.isArray(plan12) ? plan12.length : 0)
      + (Array.isArray(planE12) ? planE12.length : 0)}`);
    console.log(`12b recs=${(recsLen12 ?? 0) + (recsLenE12 ?? 0)}`);

    const appErr12 = await chrome.eval('__test.errors.slice()');
    check('12: zero app errors', appErr12.length === 0, JSON.stringify(appErr12));
    check('12: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 15: GH-299 one-take WALK BEATS (owner-approved round-2.1 model) -----
// POV→POV boundaries gain an inter-segment walk beat: 0.3 s risen-watch
// hold + a rail-following ring walk at v_walk 1.3 m/s, over the NEXT
// segment's INITIAL ball state (the round-2.1 state-handoff law), gaze
// arrival-locked onto the shipped address look target. The REQUIRED gate
// arms from the implementation contract:
//   15a  schedule shape: quantized beatSec (= round(beatSec·60)/60), beats
//        only between POV→POV pairs, walk moves NOT baked into the plan's
//        perShotCamera (renderDrill places them post-cap — catch (3)(b)),
//        plan carries opts.beats off the ONE builder.
//   15b  beat ball-state handoff (contract 4): the beat stages segment
//        N+1 @ 0 — the BIH cue ball exists from the FIRST beat frame at
//        its re-placed spot (measured non-vacuous: the spot differs from
//        segment N's settled cue), never popping in at the arrival.
//   15c  per-frame CB-in-frame + gaze-settle gate (contract 6a): 30 fps
//        from (beat end − 0.5 s) through (tImpact + 0.3 s), CB present ∧
//        in front ∧ |NDC| ≤ 0.7 both axes, with the measured returning-
//        ball exemption (approaching ∧ inside the 1.05 m address
//        standoff); settled frames aim EXACTLY at the address look target.
//        RED-proofed: the same sweep over the `walkSpec(i, {noLock})`
//        rebuild (the arrival lock disabled) must FAIL the gate.
//   15d  scrub determinism (contract 6b): same-T byte identity with
//        probes INSIDE the beats, chronological vs shuffled with rig
//        disarm + scrub-away poison between samples.
//   15e  live-vs-export identity on a beat window (contract 6c): a REAL
//        renderDrill sampled per encoded frame — hold + arrival poses
//        byte-identical, mid-walk ≤ 1e-9 (the two paths place the same
//        moves at different absolute clocks; the beat-local evaluation is
//        identical arithmetic modulo one float add), fov 60 throughout.
//   15f  comfort (contract 6d): measured peak gaze rate at 120 Hz stays
//        under the 100 deg/s ceiling on BOTH boundaries (prototype pins:
//        mild ~53-61, worst budget-pinned ~90.3).
//   15g  the trimmed-exit red/green (contract 2 / 6e): with the camera
//        clock re-clamped at endT (the pre-299 one-clock law, shimmed
//        back in) the beat FREEZES at its hold pose; with the shipped
//        two-clock split it WALKS.
//   15h  export-side state handoff on the WORST (BIH) boundary: every
//        beat frame of a REAL renderDrill has the cue ball AT the
//        ball-in-hand spot of segment N+1's initial state.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 13 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'GH-299 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '15: __playback seam');
    // the round-2.1 prototype session, verbatim (seed=5): A soft break
    // up-table, B same direction (MILD boundary, ~+28.6°), C opposite side
    // (WORST, ~155.4°); shot B scratches, so the worst boundary walks into
    // a BALL-IN-HAND initial state — the round-2 defect's exact geometry.
    await fire(chrome, '15: shot A', { v0: 4.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '15: shot B', { v0: 0.55, phi: Math.PI / 2 + 0.5, theta: 0, a: 0, b: 0 });
    await fire(chrome, '15: shot C', { v0: 1.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid15 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('15: session id resolvable', Number.isFinite(sid15), String(sid15));
    check('15: session opens',
      await chrome.eval(`window.__playback.openSession(${sid15})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true', '15: player open');
    await waitFor(chrome, 'window.__test.cameraScript?.(null) === true',
      '15: camerascript rig loaded');
    check('15: the two-clock renderAt seam is live (__test.twoClock)',
      await chrome.eval('window.__test.twoClock === true'));
    // page-side probes: CB projection through the LIVE camera (the r21
    // cbNdc law), forward-axis alignment to a kernel-frame look point, and
    // the full-precision pose fingerprint
    await chrome.eval(`(() => {
      window.__ob299 = {
        pose() {
          const c = window.__dbg.camera;
          return [c.position.x, c.position.y, c.position.z, c.quaternion.x,
            c.quaternion.y, c.quaternion.z, c.quaternion.w, c.fov];
        },
        ball0() {
          const b = window.__test.balls().find((x) => x.id === 0);
          return b ? { pos: b.pos, pocketed: b.pocketed } : null;
        },
        cbNdc() {
          const c = window.__dbg.camera;
          const b = window.__test.balls().find((x) => x.id === 0);
          if (!b || b.pocketed) return { present: false };
          const v = new c.position.constructor(b.pos[0], b.pos[1], b.pos[2]);
          c.updateMatrixWorld();
          c.matrixWorldInverse.copy(c.matrixWorld).invert();
          v.applyMatrix4(c.matrixWorldInverse);
          const zCam = v.z;
          v.applyMatrix4(c.projectionMatrix);
          const horizDist = Math.hypot(b.pos[0] - c.position.x,
            b.pos[2] - c.position.z);
          return { present: true, ndc: [v.x, v.y], zCam, horizDist,
            ok: zCam < 0 && Math.abs(v.x) <= 0.7 && Math.abs(v.y) <= 0.7 };
        },
        align(lookK) { // rad between camera forward and (lookK − eye)
          const c = window.__dbg.camera;
          const V = c.position.constructor;
          const lk = new V(lookK[1], lookK[2], lookK[0]).sub(c.position).normalize();
          const f = new V(0, 0, -1).applyQuaternion(c.quaternion);
          return Math.acos(Math.min(1, Math.max(-1, f.dot(lk))));
        },
      };
      return true; })()`);
    // POV everywhere via ONE explicit choice (GH-273 backfill law)
    await chrome.eval('window.__playback.seek(0.02)');
    check('15: pov assigned', await chrome.eval('window.__playback.setCam("pov")'));
    const st15 = await chrome.eval('JSON.parse(JSON.stringify(window.__playback.state()))');

    // ---- 15a: schedule + plan shape -------------------------------------------
    check('15a: both POV→POV boundaries carry a walk beat; the last segment '
      + 'never does', Array.isArray(st15.beats) && st15.beats.length === 3
      && st15.beats[0] > 0 && st15.beats[1] > 0 && st15.beats[2] === null,
    JSON.stringify(st15.beats));
    check('15a: beatSec is frame-quantized (round(beatSec·60)/60 — the live/'
      + 'export agreement law)', [0, 1].every((i) =>
      Math.abs(st15.beats[i] * 60 - Math.round(st15.beats[i] * 60)) < 1e-9),
    JSON.stringify(st15.beats));
    check('15a: the live timeline is Σ E_i plus exactly the beats '
      + '(pb.total, GH-864)',
    Math.abs(st15.total - (st15.durs.reduce((a, _, i) => a + segEnd(st15, i), 0)
        + st15.beats[0] + st15.beats[1])) < 1e-9,
    JSON.stringify({ total: st15.total, durs: st15.durs, beats: st15.beats }));
    check('15a: beatSec = 0.3 + max(0.6, pathLen/1.3, turn floor '
      + '1.875·|dYaw|/90°/s), quantized (the contract-(1) law + the review '
      + 'round-1 sweep-budget floor, against the builder\'s own meta)',
    await chrome.eval(`(() => {
      const ok = [0, 1].every((i) => {
        const m = window.__playback.walkMeta(i);
        const want = Math.round((0.3 + Math.max(0.6, m.pathLen / 1.3,
          1.875 * Math.abs(m.gazeSweepDeg) / 90)) * 60) / 60;
        return Math.abs(window.__playback.state().beats[i] - want) < 1e-12;
      });
      return ok; })()`));
    check('15a: the predicted gaze peak respects the 90 deg/s budget AND '
      + 'the built path\'s MEASURED peak rate holds the 100 deg/s ceiling '
      + 'on BOTH boundaries (turn floor + the measured wall)',
    await chrome.eval(`[0, 1].every((i) => {
      const m = window.__playback.walkMeta(i);
      return m.gazePeakPred <= 90 + 1e-9 && m.ratePeakDegS <= 100 + 1e-9;
    })`));
    const plan15 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('15a: the plan carries opts.beats aligned to records '
      + '(walk after 0 and 1, none after the final segment)',
    Array.isArray(plan15.opts.beats) && plan15.opts.beats.length === 3
      && plan15.opts.beats[0]?.path?.length >= 25
      && plan15.opts.beats[1]?.path?.length >= 25
      && plan15.opts.beats[2] === null
      && Math.abs(plan15.opts.beats[0].beatSec - st15.beats[0]) < 1e-12
      && Math.abs(plan15.opts.beats[1].beatSec - st15.beats[1]) < 1e-12,
    JSON.stringify({ b0: plan15.opts.beats?.[0]?.beatSec,
      b1: plan15.opts.beats?.[1]?.beatSec }));
    check('15a: walk moves are NOT baked into perShotCamera (catch (3)(b) — '
      + 'renderDrill places them after the cap loop)',
    plan15.opts.perShotCamera.every((c) => c?.script?.moves?.length === 2),
    JSON.stringify(plan15.opts.perShotCamera.map((c) => c?.script?.moves?.length)));
    const meta15 = {
      mild: await chrome.eval('window.__playback.walkMeta(0)'),
      worst: await chrome.eval('window.__playback.walkMeta(1)'),
    };
    console.log('15a: walk meta',
      JSON.stringify({ mild: { pathLen: meta15.mild.pathLen,
        walkTime: meta15.mild.walkTime, gazePeakPred: meta15.mild.gazePeakPred,
        xLean: meta15.mild.xLean, xSettle: meta15.mild.xSettle,
        settleLeadSec: meta15.mild.settleLeadSec },
      worst: { pathLen: meta15.worst.pathLen, walkTime: meta15.worst.walkTime,
        gazePeakPred: meta15.worst.gazePeakPred, xLean: meta15.worst.xLean,
        xSettle: meta15.worst.xSettle,
        settleLeadSec: meta15.worst.settleLeadSec } }));
    check('15a: the worst boundary is the prototype\'s opposite-side class '
      + '(gaze sweep > 120°) and rides the 90 deg/s budget',
    Math.abs(meta15.worst.gazeSweepDeg) > 120
      && meta15.worst.gazePeakPred <= 90 + 1e-9,
    JSON.stringify(meta15.worst));

    // records (parsed) for ball-state laws
    const recs15 = await chrome.eval(`(() => {
      const rs = window.__playback.plan().records;
      return JSON.parse(JSON.stringify(rs.map((r) =>
        (typeof r === 'string' ? JSON.parse(r) : r))));
    })()`);
    const cueThree = (rec) => {
      const p = rec.initial.balls.find((b) => b.id === 0).state.pos;
      return [p.y, p.z, p.x]; // kernel → three (kPosToThree convention)
    };

    // ---- 15b: beat ball-state handoff (BIH appears at beat START) -------------
    const B2start = st15.cum[1] + segEnd(st15, 1); // worst beat window start (the beat departs at E_1, GH-864)
    const settled1 = await chrome.eval(`(() => {
      window.__playback.seek(${B2start - 0.001});
      return window.__ob299.ball0(); })()`);
    const bihSpot = cueThree(recs15[2]);
    const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    check('15b: the handoff is OBSERVABLE (segment 2\'s settled cue differs '
      + 'from segment 3\'s initial spot — the scratch/BIH corpus is live, '
      + 'never a vacuous pass)',
    !!settled1 && (settled1.pocketed === true
        || d3(settled1.pos, bihSpot) > 1e-3),
    JSON.stringify({ settled1, bihSpot }));
    const beatPresence = await chrome.eval(`(() => {
      const rows = [];
      const w = ${st15.beats[1]};
      for (let m = 0; m <= Math.floor(w * 30); m++) {
        const tau = Math.min(m / 30, w - 1e-4);
        window.__playback.seek(${B2start} + tau);
        rows.push({ tau, ...window.__ob299.ball0() });
      }
      return rows; })()`);
    check('15b: the BIH cue ball exists AT ITS SPOT from the first beat '
      + 'frame through the arrival (0 absent frames — the round-2 defect '
      + 'law)', beatPresence.length > 100
      && beatPresence.every((r) => r.pos && r.pocketed === false
        && d3(r.pos, bihSpot) < 1e-9),
    JSON.stringify({ n: beatPresence.length,
      bad: beatPresence.filter((r) => !r.pos || r.pocketed
        || d3(r.pos, bihSpot) >= 1e-9).slice(0, 3) }));

    // ---- 15c: the CB-in-frame + gaze-settle gate (both boundaries) ------------
    // tImpact per segment from the plan's own address move (t1 = ti + 0.3)
    const tiOf = (j) => plan15.opts.perShotCamera[j].script.moves[0].t1 - 0.3;
    const NDC_LIM = 0.7, STANDOFF = 1.05;
    const gateRows = async (B) => {
      const w = st15.beats[B - 1];
      const beatEnd = st15.cum[B];
      const lookK = plan15.opts.perShotCamera[B].script.moves[0].look;
      const wm = await chrome.eval(`window.__playback.walkMeta(${B - 1})`);
      const settleTau = wm.beatSec - wm.walkTime * (1 - wm.xSettle);
      return chrome.eval(`(() => {
        const rows = [];
        const look = ${JSON.stringify(lookK)};
        for (let m = Math.ceil(-0.5 * 30); m <= Math.ceil((${tiOf(B)} + 0.3) * 30); m++) {
          const x = m / 30;
          const T = x < 0 ? ${beatEnd} + x : ${beatEnd} + Math.min(x, ${tiOf(B)} + 0.3);
          window.__playback.seek(T);
          const c = window.__ob299.cbNdc();
          rows.push({ x, phase: x < 0 ? 'beat' : 'shot',
            settled: x < 0 && (${w} + x) >= ${settleTau},
            align: window.__ob299.align(look), ...c });
        }
        return rows; })()`);
    };
    const judgeGate = (rows) => {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i], prev = rows[i - 1];
        r.exempt = r.phase === 'shot' && i > 0
          && Number.isFinite(r.horizDist) && Number.isFinite(prev?.horizDist)
          && r.horizDist < STANDOFF && r.horizDist < prev.horizDist;
      }
      const fails = rows.filter((r) => !(r.present && (r.ok || r.exempt)));
      const settleFails = rows.filter((r) => r.settled && !(r.align < 1e-4));
      const maxAbs = [0, 0];
      for (const r of rows) {
        if (r.ndc && !r.exempt) {
          maxAbs[0] = Math.max(maxAbs[0], Math.abs(r.ndc[0]));
          maxAbs[1] = Math.max(maxAbs[1], Math.abs(r.ndc[1]));
        }
      }
      return { frames: rows.length, fails: fails.length,
        settleFrames: rows.filter((r) => r.settled).length,
        settleFails: settleFails.length,
        exempt: rows.filter((r) => r.exempt).length, maxAbs };
    };
    for (const [name, B] of [['mild', 1], ['worst', 2]]) {
      const g = judgeGate(await gateRows(B));
      console.log(`15c: ${name} gate`, JSON.stringify(g));
      check(`15c: ${name} boundary — CB in the central 70% from (beat end − `
        + '0.5 s) through (tImpact + 0.3 s), returning-ball exemption '
        + 'measured, gaze settled EXACTLY on the address look target',
      g.frames > 30 && g.fails === 0 && g.settleFrames > 3
        && g.settleFails === 0,
      JSON.stringify(g));
    }
    // RED proof (contract 6a): the SAME gate over the noLock rebuild — the
    // arrival lock disabled — must fail on the settle law (the look point
    // rides the parallel sweep direction instead of the ball line)
    const redRows = await chrome.eval(`(() => {
      const spec = window.__playback.walkSpec(1, { noLock: true });
      const look = ${JSON.stringify(plan15.opts.perShotCamera[2].script.moves[0].look)};
      const wm = window.__playback.walkMeta(1);
      const settleTau = wm.beatSec - wm.walkTime * (1 - wm.xSettle);
      const durs1 = ${st15.durs[1]};
      const rows = [];
      for (let m = Math.ceil(-0.5 * 30); m < 0; m++) {
        const x = m / 30, tau = ${st15.beats[1]} + x;
        window.__playback.seek(${B2start} + tau); // stages seg 2 @ 0
        window.__test.cameraScript(spec);          // the no-lock override
        window.__test.renderAt(0, 1 / 60, durs1 + tau);
        const c = window.__ob299.cbNdc();
        rows.push({ tau, settled: tau >= settleTau,
          align: window.__ob299.align(look), ...c });
      }
      return rows; })()`);
    const redSettled = redRows.filter((r) => r.settled);
    check('15c RED: with the arrival lock disabled the gate FAILS — settled '
      + 'frames no longer aim at the address target (the gate has teeth)',
    redSettled.length > 3 && redSettled.some((r) => !(r.align < 1e-4)),
    JSON.stringify(redSettled.slice(0, 4)));
    // restore the shipped rig through a legit path and prove it
    await chrome.eval('window.__playback.setCam("pov")');
    const backPose = await chrome.eval(
      `(() => { window.__playback.seek(${B2start} + 1.0);
        return JSON.stringify(window.__ob299.pose()); })()`);
    const backPose2 = await chrome.eval(
      `(() => { window.__playback.seek(0.5);
        window.__playback.seek(${B2start} + 1.0);
        return JSON.stringify(window.__ob299.pose()); })()`);
    check('15c: the shipped rig is back after the red-proof override '
      + '(same-T byte identity holds again)', backPose === backPose2,
    JSON.stringify({ backPose, backPose2 }));

    // ---- 15d: scrub determinism with probes INSIDE the beats ------------------
    const probes15 = [
      st15.cum[1] - st15.beats[0] + 0.11,             // inside mild beat
      st15.cum[1] - st15.beats[0] + st15.beats[0] / 2, // mid mild walk
      B2start + 0.15,                                  // worst risen hold
      B2start + st15.beats[1] * 0.6,                   // mid worst walk
      B2start + st15.beats[1] - 0.05,                  // worst arrival
      st15.cum[2] + 0.4,                               // inside segment 3
    ];
    // RENDER-RELEVANT ball state only: a pocketed ball is invisible with
    // pocketed-NEUTRAL shader uniforms (the GH-276 law), and balls ABSENT
    // from the staged record park invisible with their mesh position
    // deliberately untouched (game.js layout()) — that raw position is
    // scrub-history-dependent by design and never rendered, so the byte
    // law reads pose + every VISIBLE ball's pos/quat + the pocketed flags.
    const snapAt = async (T) => chrome.eval(`(() => {
      window.__playback.seek(${T});
      return JSON.stringify({ p: window.__ob299.pose(),
        b: window.__test.balls().map((x) => [x.id, x.pocketed,
          x.pocketed ? null : x.pos, x.pocketed ? null : x.quat]) });
    })()`);
    const chron = {};
    for (const T of probes15) chron[T] = await snapAt(T);
    const shuffled = [probes15[4], probes15[1], probes15[5], probes15[0],
      probes15[3], probes15[2]];
    const shuf = {};
    for (const T of shuffled) {
      // poison: disarm the rig, scrub away, re-assign through the shipped
      // path (the GH-273 write is the user's re-arm gesture)
      await chrome.eval(`(() => {
        window.__test.cameraScript(null);
        window.__playback.seek(0.2);
        window.__playback.setCam('pov');
        return true; })()`);
      shuf[T] = await snapAt(T);
    }
    const diff15d = probes15.filter((T) => chron[T] !== shuf[T]).map((T) => {
      const a = chron[T], b = shuf[T];
      let i = 0;
      while (i < Math.min(a.length, b.length) && a[i] === b[i]) i += 1;
      return { T, at: i, a: a.slice(Math.max(0, i - 40), i + 60),
        b: b.slice(Math.max(0, i - 40), i + 60) };
    });
    check('15d: same-T frames are byte-identical, chronological vs shuffled '
      + 'random access with disarm + scrub poison (probes inside both '
      + 'beats — pose AND ball set)', diff15d.length === 0,
    JSON.stringify(diff15d.slice(0, 2)));

    // ---- 15e: live-vs-export identity on the MILD beat window -----------------
    const beat0 = st15.beats[0];
    const mildStart = st15.cum[1] - beat0; // == cum[0] + E_0 (GH-864)
    await chrome.eval(`window.__playback.setTrim(${mildStart - 1.0}, ${st15.cum[1] + 1.0})`);
    const planE = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('15e: the trimmed plan keeps the mild beat (2 records, beat after '
      + 'segment 0)', planE.records.length === 2
      && Math.abs(planE.opts.beats[0].beatSec - beat0) < 1e-12
      && planE.opts.beats[1] === null,
    JSON.stringify({ n: planE.records.length, beats: planE.opts.beats?.map((w) => w?.beatSec) }));
    const expRun = await chrome.eval(`(async () => {
      const plan = window.__playback.plan();
      const frames = [];
      let res;
      try {
        res = await window.__export.renderDrill(plan.records, { ...plan.opts,
          width: 320, height: 180, keepBlob: false, noDownload: true,
          withAudio: false,
          onProgress: () => {
            frames.push({ p: window.__ob299.pose(),
              b0: window.__ob299.ball0() });
          } });
      } catch (e) { return { err: String(e) }; }
      return { frames, segments: res.segments, montageRate: res.montageRate };
    })()`);
    check('15e: the REAL beat export succeeded', !expRun.err
      && Array.isArray(expRun.segments) && expRun.segments.length === 2,
    JSON.stringify({ err: expRun.err, segments: expRun.segments }));
    const beatFrames0 = Math.round(beat0 * 60);
    const tail0At = expRun.segments[0] - beatFrames0; // first beat frame idx
    const livePoseAt = async (T) => chrome.eval(`(() => {
      window.__playback.seek(${T});
      return JSON.stringify(window.__ob299.pose()); })()`);
    const cmp = [];
    for (const j of [0, 10, 17]) { // risen-watch HOLD frames (τ < 0.3 s)
      const live = await livePoseAt(mildStart + j / 60);
      cmp.push({ j, kind: 'hold',
        eq: live === JSON.stringify(expRun.frames[tail0At + j].p) });
    }
    for (const j of [30, 55, 80]) { // mid-walk frames
      const live = JSON.parse(await livePoseAt(mildStart + j / 60));
      const exp = expRun.frames[tail0At + j].p;
      const d = Math.max(...live.map((v, k) => Math.abs(v - exp[k])));
      cmp.push({ j, kind: 'walk', d, eq: d <= 1e-9 });
    }
    {
      const live = await livePoseAt(st15.cum[1]); // the ARRIVAL address pose
      cmp.push({ j: beatFrames0, kind: 'arrival',
        eq: live === JSON.stringify(expRun.frames[expRun.segments[0]].p) });
    }
    check('15e: live and export beat-window poses match — hold + arrival '
      + 'byte-identical, mid-walk ≤ 1e-9, fov 60 throughout',
    cmp.every((c) => c.eq)
      && expRun.frames.slice(tail0At, expRun.segments[0] + 1)
        .every((f) => f.p[7] === 60),
    JSON.stringify(cmp));

    // ---- 15f: comfort — measured peak gaze rate under the 100 deg/s ceiling ---
    const comfort15 = {};
    for (const [name, B] of [['mild', 1], ['worst', 2]]) {
      const w = st15.beats[B - 1];
      const start = st15.cum[B] - w;
      const samples = await chrome.eval(`(() => {
        const out = [];
        for (let k = 0; k <= Math.ceil((${w} + 1.3) * 120); k++) {
          const T = ${start} - 0.3 + k / 120;
          window.__playback.seek(T);
          out.push(window.__ob299.pose());
        }
        return out; })()`);
      let peak = 0, peakAt = 0;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i];
        let dot = Math.abs(a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6]);
        dot = Math.min(1, dot);
        const deg = 2 * Math.acos(dot) * 180 / Math.PI * 120;
        if (deg > peak) { peak = deg; peakAt = i / 120; }
      }
      comfort15[name] = { peakDegS: peak, peakAtSec: peakAt };
      console.log(`15f: ${name} peak ${peak.toFixed(1)} deg/s @ ${peakAt.toFixed(2)} s`);
    }
    check('15f: both boundaries hold the 100 deg/s comfort ceiling '
      + '(prototype pins: mild ~53-61, worst budget-pinned ~90.3)',
    comfort15.mild.peakDegS < 100 && comfort15.worst.peakDegS < 100
      && comfort15.mild.peakDegS > 30
      && comfort15.worst.peakDegS > 80 && comfort15.worst.peakDegS < 96,
    JSON.stringify(comfort15));

    // ---- 15g: the trimmed-exit red/green (the two-clock split) ----------------
    // A trimmed exit at endT ≥ the rise end keeps its walk (the builder's
    // exit pose is the standing watch either way — same walk bytes), and
    // the beat must WALK over the frozen out-frame. RED first: shim the
    // pre-299 one-clock law back in (camera clock re-clamped at endT) —
    // the walk FREEZES; then the shipped path: it walks.
    const end0 = st15.durs[0] - 0.8;
    await chrome.eval(`window.__playback.setTrim(0, ${st15.total})`);
    // the builder's exit pose at any endT ≥ the rise end IS the standing
    // watch pose, so the full plan's beats[0] is byte-identical to what a
    // trimmed-exit plan would build — reuse it beside the override trims
    const runTrimmed = async () => chrome.eval(`(async () => {
      const full = window.__playback.plan();
      const frames = [];
      let res;
      try {
        res = await window.__export.renderDrill(
          [full.records[0], full.records[1]], { ...full.opts,
            trims: [{ startT: 0, endT: ${end0} }, { startT: 0, endT: 1.0 }],
            beats: [full.opts.beats[0], null],
            perShotCamera: [full.opts.perShotCamera[0],
              full.opts.perShotCamera[1]],
            width: 320, height: 180, keepBlob: false, noDownload: true,
            withAudio: false,
            onProgress: () => { frames.push(window.__ob299.pose()); } });
      } catch (e) { return { err: String(e) }; }
      return { frames, segments: res.segments };
    })()`);
    // RED: the pre-299 clamp, shimmed back over the seam
    await chrome.eval(`(() => {
      window.__realRA299 = window.__test.renderAt;
      window.__test.renderAt = (t, dt, tc) =>
        window.__realRA299(t, dt, Math.min(tc ?? t, ${end0}));
      return true; })()`);
    const red15 = await runTrimmed();
    await chrome.eval(
      'window.__test.renderAt = window.__realRA299; delete window.__realRA299; true');
    const green15 = await runTrimmed();
    const walkSpan = (r) => {
      if (r.err) return { err: r.err };
      const b0 = r.segments[0] - beatFrames0;
      const beat = r.frames.slice(b0 + 20, r.segments[0]); // past the hold
      let span = 0;
      for (let i = 1; i < beat.length; i++) {
        span = Math.max(span, Math.hypot(beat[i][0] - beat[0][0],
          beat[i][1] - beat[0][1], beat[i][2] - beat[0][2]));
      }
      return { span, n: beat.length };
    };
    const redSpan = walkSpan(red15), greenSpan = walkSpan(green15);
    check('15g RED: with the camera clock clamped at the trimmed exit (the '
      + 'pre-299 one-clock law) the beat FREEZES — the eye never moves',
    !redSpan.err && redSpan.n > 50 && redSpan.span < 1e-9,
    JSON.stringify(redSpan));
    check('15g GREEN: the shipped two-clock split WALKS the trimmed-exit '
      + 'beat (the eye travels the ring)',
    !greenSpan.err && greenSpan.n > 50 && greenSpan.span > 0.3,
    JSON.stringify(greenSpan));

    // ---- 15h: export-side state handoff on the WORST (BIH) boundary -----------
    const exp15h = await chrome.eval(`(async () => {
      const full = window.__playback.plan();
      const frames = [];
      let res;
      try {
        res = await window.__export.renderDrill(
          [full.records[1], full.records[2]], { ...full.opts,
            trims: [{ startT: ${st15.durs[1]} - 1.0, endT: null },
              { startT: 0, endT: 1.0 }],
            beats: [full.opts.beats[1], null],
            perShotCamera: [full.opts.perShotCamera[1],
              full.opts.perShotCamera[2]],
            width: 320, height: 180, keepBlob: false, noDownload: true,
            withAudio: false,
            onProgress: () => { frames.push(window.__ob299.ball0()); } });
      } catch (e) { return { err: String(e) }; }
      return { frames, segments: res.segments };
    })()`);
    const beatFrames1 = Math.round(st15.beats[1] * 60);
    const hRows = exp15h.err ? []
      : exp15h.frames.slice(exp15h.segments[0] - beatFrames1, exp15h.segments[0]);
    check('15h: every beat frame of the REAL export has the BIH cue ball at '
      + 'segment N+1\'s initial spot (present, never pocketed — the state '
      + 'handoff law on the render path)',
    !exp15h.err && hRows.length === beatFrames1
      && hRows.every((r) => r && r.pocketed === false
        && d3(r.pos, bihSpot) < 1e-9),
    JSON.stringify({ err: exp15h.err, n: hRows.length,
      bad: hRows.filter((r) => !r || r.pocketed
        || d3(r.pos, bihSpot) >= 1e-9).slice(0, 3) }));

    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErr15 = await chrome.eval('__test.errors.slice()');
    check('15: zero app errors', appErr15.length === 0, JSON.stringify(appErr15));
    check('15: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 15x: GH-315 rise-incomplete boundaries WALK (owner one-take jump) ----
// Build-15 owner defect (the 15-shot line-up drill export): shot 10's
// record (1.47 s) ended before its own POV rise (~1.8 s), beatFor's
// rise-completion gate answered null, and the one-take hard-cut at output
// 45.383 s while all 13 other boundaries walked. The GH-315 law: the walk
// still departs from the risen watch pose — the beat FINISHES the shipped
// GH-275 rise first (from the exact exit pose, on the shipped curve),
// takes the BEAT_HOLD watch, then walks the approved ring path; shipped
// as a holdSec-0 composite 60 Hz dolly beside an exit-CLIPPED base script
// (both shapes already inside the beat contract — offline-render.js is
// untouched). The fixture reproduces the class deterministically: a short
// stun pot whose record settles before its rise completes, then a normal
// second shot far enough away that the pre-fix hard cut is a measurable
// teleport.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 17 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'GH-315 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '15x: __playback seam');
    // the boot rack must be SETTLED before the fixture layout — under load
    // the opening settle can outlive waitReady, the un-checked layout()
    // refuses, and shot 1 fires on the DEFAULT RACK instead (measured
    // 2026-08-02: dur 2.555 vs the fixture's 1.278 — bistable on load,
    // deterministic within a run). fire() has its aiming-state retry for
    // exactly this; layout() needs the same patience.
    // GH-370: the settled boot rack parks in the opening BALL_IN_HAND
    await waitFor(chrome,
      '__test.state() === "AIM" || __test.state() === "BALL_IN_HAND"',
      '15x: boot settled', 100, 200);
    // shot 1 — the SHORT record: a 25 cm stun pot into the top-right
    // corner (object ball dead in line with the pocket mouth); the cue
    // stuns near-dead, the object drops in ~0.2 s, the table settles well
    // before tImpact + 1.7 s. Kernel frame: x = short axis (half 0.635),
    // y = long axis (half 1.27); pocket at (0.635, 1.27).
    await chrome.eval('__test.layout([{id:0,x:0.368,y:0.9215},{id:9,x:0.52,y:1.12}])');
    await fire(chrome, '15x: short stun pot',
      { v0: 1.6, phi: Math.atan2(0.794, 0.608), theta: 0, a: 0, b: 0 });
    // shot 2 — a normal-length shot from the OTHER half of the table (the
    // pre-fix hard cut across this boundary is a >1 m eye teleport)
    await chrome.eval('__test.layout([{id:0,x:-0.3,y:-0.6},{id:8,x:-0.1,y:-0.2}])');
    await fire(chrome, '15x: normal second shot',
      { v0: 1.5, phi: Math.atan2(0.4, 0.2), theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sidX = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('15x: session id resolvable', Number.isFinite(sidX), String(sidX));
    check('15x: session opens',
      await chrome.eval(`window.__playback.openSession(${sidX})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '15x: player open');
    await waitFor(chrome, 'window.__test.cameraScript?.(null) === true',
      '15x: camerascript rig loaded');
    await chrome.eval(`(() => {
      window.__ob315 = { pose() {
        const c = window.__dbg.camera;
        return [c.position.x, c.position.y, c.position.z, c.quaternion.x,
          c.quaternion.y, c.quaternion.z, c.quaternion.w, c.fov];
      } };
      return true; })()`);
    await chrome.eval('window.__playback.seek(0.02)');
    check('15x: pov assigned',
      await chrome.eval('window.__playback.setCam("pov")'));
    const stX = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.state()))');
    const planX = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    // fixture validity: the class only exists while the record is SHORTER
    // than its own rise (tImpact + 0.3 + 1.4, read off the plan's own
    // address move t1 = ti + 0.3) — an honest red if physics drift ever
    // lengthens the settle past the rise
    const riseEndX = planX.opts.perShotCamera[0].script.moves[0].t1 + 1.4;
    check('15x: fixture is IN CLASS (record ends before its own rise: '
      + `dur ${stX.durs[0].toFixed(3)} < riseEnd ${riseEndX.toFixed(3)})`,
    stX.durs[0] > 0.6 && stX.durs[0] < riseEndX - 0.05,
    JSON.stringify({ dur: stX.durs[0], riseEndX }));

    // ---- 15x-a: the boundary CARRIES a beat (RED pre-fix: null) ---------------
    check('15x-a: the rise-incomplete boundary carries a walk beat (RED '
      + 'pre-fix: beatFor\'s rise-completion gate hard-cut it — the '
      + 'owner\'s one-take jump)',
    Array.isArray(stX.beats) && stX.beats.length === 2
      && stX.beats[0] > 0 && stX.beats[1] === null,
    JSON.stringify(stX.beats));
    check('15x-a: beatSec is frame-quantized',
      Math.abs(stX.beats[0] * 60 - Math.round(stX.beats[0] * 60)) < 1e-9,
      String(stX.beats[0]));

    // ---- 15x-b: composite shape + clipped base laws ---------------------------
    const wX = planX.opts.beats[0];
    const metaX = await chrome.eval('window.__playback.walkMeta(0)');
    check('15x-b: the beat is the holdSec-0 composite (rise + watch hold + '
      + 'walk in ONE 60 Hz path: beatSec·60 + 1 waypoints; riseSec > 0; '
      + 'beatSec = riseSec + 0.3 + walkTime on the frame grid)',
    !!wX && wX.holdSec === 0 && Array.isArray(wX.path)
      && wX.path.length === Math.round(wX.beatSec * 60) + 1
      && metaX?.riseSec > 0
      && Math.abs(wX.beatSec - (metaX.riseSec + 0.3 + wX.walkTime)) < 1e-9,
    JSON.stringify({ holdSec: wX?.holdSec, n: wX?.path?.length,
      beatSec: wX?.beatSec, riseSec: metaX?.riseSec, walkTime: wX?.walkTime }));
    const baseX = planX.opts.perShotCamera[0].script.moves;
    const maxT1 = baseX.reduce((m, mv) => Math.max(m, mv.t1 ?? 0), 0);
    check('15x-b: the emitted base script is CLIPPED at the exit (max t1 == '
      + 'the segment duration — renderDrill\'s trim re-check and the '
      + 'camerascript no-overlap law both hold), waypointed rise portion',
    Math.abs(maxT1 - stX.durs[0]) < 1e-9 && baseX.length === 2
      && baseX[1].kind === 'dolly' && baseX[1].path.length >= 2,
    JSON.stringify({ maxT1, dur: stX.durs[0],
      moves: baseX.map((m) => [m.kind, m.t0, m.t1]) }));
    check('15x-b: the second segment keeps the shipped 2-move povScript '
      + '(plan-stability — only the rise-incomplete class changes shape)',
    planX.opts.perShotCamera[1].script.moves.length === 2
      && planX.opts.perShotCamera[1].script.moves[1].path.length === 2,
    JSON.stringify(planX.opts.perShotCamera[1].script.moves
      .map((m) => [m.kind, m.path?.length ?? null])));

    // ---- 15x-c: LIVE continuity across play → beat → next play ----------------
    const sweepX = await chrome.eval(`(() => {
      const rows = [];
      const T0 = ${stX.durs[0]} - 0.3;
      const T1 = ${stX.cum[1]} + 0.3;
      for (let k = 0; k <= Math.ceil((T1 - T0) * 60); k++) {
        window.__playback.seek(T0 + k / 60);
        rows.push(window.__ob315.pose());
      }
      return rows; })()`);
    let maxStep = 0, stepAt = -1;
    for (let k = 1; k < sweepX.length; k++) {
      const a = sweepX[k - 1], b = sweepX[k];
      const st = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (st > maxStep) { maxStep = st; stepAt = k; }
    }
    check('15x-c: the live 60 Hz pose sweep has NO teleport across '
      + 'play → beat → next play (max eye step < 8 cm/frame; RED pre-fix: '
      + 'the crossing jumped >1 m straight to the next address)',
    sweepX.length > 100 && maxStep < 0.08,
    JSON.stringify({ n: sweepX.length, maxStep, stepAt,
      atSec: stepAt >= 0 ? (stX.durs[0] - 0.3 + stepAt / 60) : null }));
    const heights = sweepX.map((p) => p[1]);
    const hAtBeatStart = heights[Math.round(0.3 * 60)];
    check('15x-c: the beat FINISHES the rise — the eye enters the beat '
      + 'mid-rise (below 0.78) and climbs to the 0.81 stand height before '
      + 'walking (world-h = three.y)',
    hAtBeatStart < 0.78 && Math.max(...heights) > 0.805,
    JSON.stringify({ hAtBeatStart, hMax: Math.max(...heights) }));
    const addr2 = planX.opts.perShotCamera[1].script.moves[0].cam; // kernel
    const arrival = await chrome.eval(`(() => {
      window.__playback.seek(${stX.cum[1]} - 0.001);
      return window.__ob315.pose(); })()`);
    // kernel [kx, ky, h] → three [ky, h, kx]
    const dArr = Math.hypot(arrival[0] - addr2[1], arrival[1] - addr2[2],
      arrival[2] - addr2[0]);
    check('15x-c: the walk ARRIVES at the next segment\'s address eye '
      + '(≤ 2 cm at one frame before the boundary)',
    dArr < 0.02, JSON.stringify({ arrival: arrival.slice(0, 3), addr2, dArr }));

    // ---- 15x-d: a REAL renderDrill walks the same boundary (WYSIWYG) ----------
    const expX = await chrome.eval(`(async () => {
      const plan = window.__playback.plan();
      const frames = [];
      let res;
      try {
        res = await window.__export.renderDrill(plan.records, { ...plan.opts,
          width: 320, height: 180, keepBlob: false, noDownload: true,
          withAudio: false,
          onProgress: () => { frames.push(window.__ob315.pose()); } });
      } catch (e) { return { err: String(e) }; }
      return { frames, segments: res.segments, montageRate: res.montageRate };
    })()`);
    check('15x-d: the REAL rise-carrying beat export succeeded at rate 1 '
      + '(no montage — the plan fits the floor budget)',
    !expX.err && Array.isArray(expX.segments) && expX.segments.length === 2
      && expX.montageRate === 1,
    JSON.stringify({ err: expX.err, segments: expX.segments,
      rate: expX.montageRate }));
    const beatN = Math.round(stX.beats[0] * 60);
    const tailAt = expX.segments[0] - beatN;
    let expMax = 0, expAt = -1;
    for (let k = Math.max(1, tailAt - 5);
      k <= Math.min(expX.frames.length - 1, expX.segments[0] + 5); k++) {
      const a = expX.frames[k - 1], b = expX.frames[k];
      const st = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (st > expMax) { expMax = st; expAt = k; }
    }
    check('15x-d: the encoded frames walk the boundary — per-frame eye '
      + 'steps bounded across the whole beat window (< 8 cm; RED pre-fix: '
      + 'the INNER_TAIL hard cut teleported to the next address)',
    expMax < 0.08, JSON.stringify({ expMax, expAt, tailAt,
      seg0: expX.segments[0] }));
    // live-vs-export identity at beat-local instants (the 15e law on the
    // new class: same beat-local clock, different absolute clocks — the
    // dolly evaluation differs by one float add, ≤ 1e-9). Cross into
    // segment 1 first: the render left ITS last segment directive armed
    // while pb.appliedKey still says segment 0, so the first same-key
    // seek would sample the export's stale rig (the §2.1 re-apply key is
    // per-crossing by design; 15e crosses segments the same way).
    await chrome.eval(`(() => {
      window.__playback.seek(${stX.cum[1] + 0.2});
      return true; })()`);
    const cmpX = [];
    for (const tau of [metaX.riseSec / 2, metaX.riseSec + 0.15,
      stX.beats[0] * 0.7, stX.beats[0] - 0.05]) {
      const k = Math.round(tau * 60);
      const live = await chrome.eval(`(() => {
        window.__playback.seek(${stX.durs[0] + k / 60});
        return window.__ob315.pose(); })()`);
      const exp = expX.frames[tailAt + k];
      const d = Math.max(...live.map((v, i) => Math.abs(v - exp[i])));
      cmpX.push({ k, d, ok: d <= 1e-9 });
    }
    check('15x-d: live and export beat poses match at the same beat-local '
      + 'frames — rise, hold and walk ≤ 1e-9, fov 60 throughout',
    cmpX.every((c) => c.ok)
      && expX.frames.slice(tailAt, expX.segments[0] + 1)
        .every((f) => f[7] === 60),
    JSON.stringify(cmpX));

    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErrX = await chrome.eval('__test.errors.slice()');
    check('15x: zero app errors', appErrX.length === 0,
      JSON.stringify(appErrX));
    check('15x: zero console errors', errs.length === 0,
      errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 13: the SETUP hint under the destination preview (GH-274, option a) --
// Build-13 owner defect: the save card opens with three grey tiles and no
// reason ("why are all three grey?"). The hint states the two-step flow in
// SETUP only, and is GONE the moment a render runs or its blob lands —
// and it never lies over a dead CTA (stale export.js / no encoder).
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 11 });
  watch(chrome, errs);
  const HINT = `(() => {
    const h = document.querySelector('#ob-pb-card .ob-pb-desthint');
    if (!h) return { present: false };
    return { present: true,
      vis: h.getClientRects().length > 0
        && getComputedStyle(h).display !== 'none',
      txt: h.textContent, key: h.dataset.i18n,
      clipped: h.scrollWidth > h.clientWidth + 1 };
  })()`;
  try {
    await waitReady(chrome, 'GH-274 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '13: __playback seam');
    await fire(chrome, '13: shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid13 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('13: session archived', Number.isFinite(sid13));
    check('13: player opens via the seam',
      await chrome.eval(`window.__playback.openSession(${sid13})`) === true);
    // DEFERRED render stub: the arm must observe the RENDERING state, so
    // the stub parks until the harness releases it (arm-3 stub shape)
    await chrome.eval(`(() => {
      window.__realRD13 = window.__export.renderDrill;
      window.__export.renderDrill = (records, opts) => new Promise((res) => {
        window.__pbRelease13 = () => {
          opts.onProgress?.(60, 60, 16);
          res({ blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }),
            size: 64, frames: 60, clipSec: 1, ext: 'mp4', wallSec: 0.1,
            segments: [60], montageRate: 1 });
        };
      });
    })()`);
    // review GH-274 P2: while the encoder-capability probe is IN FLIGHT the
    // CTA is disabled — the hint must not instruct a press it cannot honor.
    // Park the probe, open the card, assert silence, then release.
    await chrome.eval(`(() => {
      window.__hdReal13 = window.__export.hdInfo;
      window.__export.hdInfo = () => new Promise((res) => {
        window.__hdRelease13 = () => res(null); });
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '13: card open');
    await sleep(500);
    const hProbe = await chrome.eval(HINT);
    check('13a: while the probe is pending (CTA disabled) the hint stays '
      + 'hidden (review P2)',
      hProbe.present === true && hProbe.vis === false, JSON.stringify(hProbe));
    await chrome.eval(
      'window.__hdRelease13(); window.__export.hdInfo = window.__hdReal13; true');
    await waitFor(chrome, `(() => { const b =
      document.querySelector('#ob-pb-card .ob-pb-go');
      return !!b && b.disabled === false; })()`, '13a: CTA armed after probe');
    await sleep(200);

    // 13a: SETUP shows the hint — localized, wrapping, never ellipsized
    const h0 = await chrome.eval(HINT);
    check('13a: the setup card shows the hint under the tile row',
      h0.present === true && h0.vis === true, JSON.stringify(h0));
    check('13a: localized through data-i18n (the live t() copy, key intact)',
      h0.key === 'playback.destHint' && h0.txt
      === await chrome.eval('window.__i18n.t("playback.destHint")'),
      JSON.stringify(h0));
    check('13a: the hint WRAPS, never ellipsizes (no horizontal clipping)',
      h0.clipped === false, JSON.stringify(h0));
    check('13a: and the tiles it explains are really the grey setup preview',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`));

    // 13b: live locale switch re-paints the hint copy (applyDom path)
    const zh = await chrome.eval(`(async () => {
      __settings.set('language', 'zh-CN');
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (window.__i18n.locale() === 'zh-CN') break;
      }
      await new Promise((r) => setTimeout(r, 300));
      const txt = document.querySelector('#ob-pb-card .ob-pb-desthint')
        ?.textContent;
      const want = window.__i18n.t('playback.destHint');
      __settings.set('language', 'en');
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (window.__i18n.locale() === 'en') break;
      }
      return { txt, want };
    })()`);
    check('13b: a live locale switch re-localizes the hint',
      !!zh.txt && zh.txt === zh.want && zh.txt !== h0.txt, JSON.stringify(zh));

    // 13c: the hint leaves WITH the setup state — hidden while the encode
    // runs, and still hidden once the blob lands (the tiles arm instead)
    await confirmClip(chrome, '13c');
    await waitFor(chrome, 'typeof window.__pbRelease13 === "function"',
      '13c: render started (stub parked)');
    await sleep(300);
    const hRun = await chrome.eval(HINT);
    check('13c: RENDERING hides the hint (the instruction is being obeyed)',
      hRun.present === true && hRun.vis === false, JSON.stringify(hRun));
    await chrome.eval('window.__pbRelease13(); delete window.__pbRelease13; true');
    await sleep(500);
    const hDone = await chrome.eval(HINT);
    check('13c: render completion REMOVES the hint (tiles armed instead)',
      hDone.vis === false && await chrome.eval(
        `[...document.querySelectorAll('.ob-pb-dest')].every((b) => !b.disabled)`),
      JSON.stringify(hDone));

    // 13d: the res-change invalidation releases the blob — the card is
    // SETUP again and the hint must COME BACK (the exact under-
    // communication regression the owner reported, one layer deeper)
    await chrome.eval(`(() => {
      const s = document.querySelector('#ob-pb-card select');
      s.value = '720';
      s.dispatchEvent(new Event('change'));
    })()`);
    await sleep(400);
    const hBack = await chrome.eval(HINT);
    check('13d: the res-change invalidation brings the hint back '
      + '(blob released, setup again)',
      hBack.vis === true && await chrome.eval(
        `[...document.querySelectorAll('.ob-pb-dest')].every((b) => b.disabled)`),
      JSON.stringify(hBack));

    // 13d-empty (review P2, retargeted by GH-433): an EMPTY trim disables
    // the CTA — a card reopened over it must not carry the INSTRUCTION
    // ("Export the clip first…" beside a dead button was the review P2
    // catch). GH-433 keeps that law and closes its silent half: the hint
    // element now paints the localized zero-content REFUSAL instead of
    // hiding — a reason beside the dead controls, never the instruction
    // and never silence (this session runs leads-OFF, so the seam window
    // past the content stays genuinely empty — nothing associates).
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '13d-empty');
    await chrome.eval(`window.__playback.setTrim(
      window.__playback.state().total, window.__playback.state().total)`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '13d-empty: card open');
    // GH-490 r31 harness hardening (the storm-aware law, the userboot
    // carom precedent): the refusal hint paints a frame AFTER cardOpen
    // settles — the single 500 ms-sleep read caught vis:false under
    // machine I/O churn (batteries 3/4: present+correct text, no client
    // rects yet) while the refusal itself is sound.  Bounded 3 s poll
    // for visibility; a refusal that NEVER paints still fails, and every
    // other clause is judged on the settled read.
    let hEmpty = await chrome.eval(HINT);
    for (let i13 = 0; i13 < 30 && !(hEmpty.present && hEmpty.vis); i13++) {
      await sleep(100);
      hEmpty = await chrome.eval(HINT);
    }
    check('13d: an empty plan (CTA disabled) paints the GH-433 refusal — '
      + 'visible, localized, never the dead-button instruction (review P2 '
      + 'intent kept)',
    hEmpty.present === true && hEmpty.vis === true
      && hEmpty.key === 'playback.trimNoContent'
      && hEmpty.txt === await chrome.eval(
        `window.__i18n.t('playback.trimNoContent')`)
      && hEmpty.clipped === false
      && await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-go")?.disabled === true'),
    JSON.stringify(hEmpty));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '13d-empty restore');
    await chrome.eval(
      'window.__playback.setTrim(0, window.__playback.state().total)');

    // 13e: the honest-notice registers never show it — a dead CTA must not
    // carry an instruction to press it
    await chrome.eval(`(() => {
      window.__rd13 = window.__export.renderDrill;
      delete window.__export.renderDrill; })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '13e: stale-export card open');
    await sleep(500);
    const hStale = await chrome.eval(HINT);
    check('13e: stale export.js (no renderDrill) shows the honest notice, '
      + 'NOT the hint', hStale.present === true && hStale.vis === false
      && await chrome.eval(`document.querySelector('#ob-pb-card .ob-pb-ptext span')
        ?.textContent.length > 0`), JSON.stringify(hStale));
    // GH-433 review r4 P2: capability gates OUTRANK the refusal — an empty
    // trim over the SAME stale engine keeps the hint hidden (the honest
    // unavailability notice owns the card; "widen the trim" beside it
    // would instruct a step that cannot arm anything)
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '13e-empty');
    await chrome.eval(`window.__playback.setTrim(
      window.__playback.state().total, window.__playback.state().total)`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '13e-empty: card open');
    await sleep(500);
    const hStaleEmpty = await chrome.eval(HINT);
    check('13e: an empty trim over the stale engine still hides the hint '
      + '(no trimNoContent beside the unavailability notice — GH-433 r4)',
    hStaleEmpty.present === true && hStaleEmpty.vis === false,
    JSON.stringify(hStaleEmpty));
    await chrome.eval(
      'window.__playback.setTrim(0, window.__playback.state().total)');
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '13e restore');
    await chrome.eval('window.__export.renderDrill = window.__rd13; true');
    // no-encoder register (retargeted by GH-250): hdInfo answers empty and
    // support() says neither container works. With MediaRecorder ALSO out
    // of reach (supported=false stub) the noneAvailable notice owns the
    // card and the hint stays off — the original 13e claim, in the register
    // it now belongs to. 13e-rt then proves the OTHER half: with a working
    // MediaRecorder the same probe outcome flips the card into the REALTIME
    // tier, whose CTA is live — so the hint legitimately STAYS (the GH-274
    // law: the hint mirrors pressability verbatim).
    await chrome.eval(`(() => {
      window.__hd13 = window.__export.hdInfo;
      window.__sup13 = window.__export.support;
      window.__rec13 = window.__record.supported;
      window.__export.hdInfo = async () => null;
      window.__export.support = () => ({ mp4: false, webm: false });
      window.__record.supported = false; })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '13e: no-encoder card open');
    await waitFor(chrome, `document.querySelector('#ob-pb-card .ob-pb-ptext span')
      ?.textContent === window.__i18n.t('export.noneAvailable')`,
    '13e: noEncoder notice painted');
    const hNoEnc = await chrome.eval(HINT);
    check('13e: no supported encoder AND no MediaRecorder hides the hint '
      + 'behind the honest notice',
      hNoEnc.present === true && hNoEnc.vis === false, JSON.stringify(hNoEnc));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '13e restore 2');
    // 13e-rt (GH-250): same dead offline probe, MediaRecorder back — the
    // realtime tier arms the CTA and the hint stands WITH it
    await chrome.eval('window.__record.supported = window.__rec13; true');
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '13e-rt: realtime card open');
    await waitFor(chrome, `document.querySelector('#ob-pb-card .ob-pb-estimate')
      ?.textContent === window.__i18n.t('playback.realtimeNote')`,
    '13e-rt: realtime tier painted');
    const hRt = await chrome.eval(HINT);
    check('13e-rt: the realtime tier keeps the hint beside its LIVE CTA '
      + '(pressability mirror — GH-274 law under GH-250)',
      hRt.present === true && hRt.vis === true && await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-go")?.disabled === false'),
      JSON.stringify(hRt));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '13e restore 3');
    await chrome.eval(`(() => {
      window.__export.hdInfo = window.__hd13;
      window.__export.support = window.__sup13; })()`);

    // 13f (review round-2 P2): an exporter that predates keepBlob resolves
    // WITHOUT a blob — the stale-export error paints and the hint stands
    // DOWN with it (no instruction beside a pipeline that cannot deliver)
    await chrome.eval(`(() => {
      window.__export.renderDrill = async (records, opts) => {
        opts.onProgress?.(60, 60, 16);
        return { size: 0, frames: 60, clipSec: 1, ext: 'mp4', wallSec: 0.1,
          segments: [60], montageRate: 1 }; // NO blob (pre-keepBlob shape)
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '13f: card open');
    await confirmClip(chrome, '13f');
    await waitFor(chrome, `document.querySelector('#ob-pb-card .ob-pb-ptext span')
      ?.textContent?.includes('no blob from renderDrill')`,
    '13f: no-blob error painted');
    const hNoBlob = await chrome.eval(HINT);
    check('13f: a no-blob export result suppresses the hint (review P2)',
      hNoBlob.present === true && hNoBlob.vis === false,
      JSON.stringify(hNoBlob));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '13f restore');
    await chrome.eval('window.__export.renderDrill = window.__realRD13; true');

    // 13g (review round-2 P1): a POV plan against a merge-base-cached
    // export.js — simulated by REALLY deleting the additive seam marker —
    // must open on the honest reload notice with the CTA disabled and no
    // hint, never a silent wrong-camera export
    check('13g: POV assignment written for the stale-seam register',
      await chrome.eval('window.__playback.setCam("pov")') === true);
    await chrome.eval(`(() => {
      window.__csc13 = window.__export.camScriptCapable;
      delete window.__export.camScriptCapable; })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '13g: card open');
    await waitFor(chrome, `document.querySelector('#ob-pb-card .ob-pb-ptext span')
      ?.textContent?.includes('scripted camera unavailable')`,
    '13g: the reload notice painted at OPEN');
    await sleep(300);
    const hStaleCam = await chrome.eval(HINT);
    check('13g: stale-seam POV plan — CTA disabled behind the notice, '
      + 'hint hidden (review P1)',
      hStaleCam.present === true && hStaleCam.vis === false
      && await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-go")?.disabled === true'),
      JSON.stringify(hStaleCam));
    // the marker back = the SAME card arms again on the next open
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '13g restore');
    await chrome.eval('window.__export.camScriptCapable = window.__csc13; true');
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '13g: card reopened');
    await waitFor(chrome, `(() => { const b =
      document.querySelector('#ob-pb-card .ob-pb-go');
      return !!b && b.disabled === false; })()`,
    '13g: capability restored re-arms the CTA');
    const hCapBack = await chrome.eval(HINT);
    check('13g: and the hint returns with the working POV plan',
      hCapBack.vis === true, JSON.stringify(hCapBack));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '13g close');
    await chrome.eval('window.__playback.close()');
    await sleep(400);

    const appErr13 = await chrome.eval('__test.errors.slice()');
    check('13: zero app errors', appErr13.length === 0, JSON.stringify(appErr13));
    check('13: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 14: GH-250 — WebCodecs ABSENT → the realtime-capture tier ----------
// The e2e-export [fallback]/[honesty] boot recipes replayed on the DVR save
// card. 14a: VideoEncoder/AudioEncoder undefined at documentStart → the card
// offers the REALTIME tier (honest copy, pickers gone, CTA armed), a REAL
// MediaRecorder capture runs over the live bed playing the trim window,
// Cancel mid-run delivers NOTHING and re-arms, a full run arms the tiles off
// the capture blob (webm + probe-false → Photos hidden: the GH-252 mime-
// honesty half with a REAL webm) and Files delivers the capture down the
// CHUNKED wire byte-complete. 14b: MediaRecorder undefined TOO → the honest
// export.noneAvailable state with a disabled CTA (arm 3f's original claim,
// preserved in the register it now belongs to). The GH-255 state machine
// (latch, identity, one-writer tile row) must survive the whole route.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=rt`,
    { port: CDP + 12 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'arm-14 boot');
    const { identifier: noWc } = await chrome.send(
      'Page.addScriptToEvaluateOnNewDocument', { source: `
      Object.defineProperty(window, 'VideoEncoder', { value: undefined });
      Object.defineProperty(window, 'AudioEncoder', { value: undefined });` });
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=rt2` });
    await waitReady(chrome, 'no-WebCodecs boot');
    check('14a: the boot really has no WebCodecs encoders',
      await chrome.eval('typeof VideoEncoder === "undefined"'
        + ' && typeof AudioEncoder === "undefined"'));
    check('14a: …and a working MediaRecorder with the additive blob getter',
      await chrome.eval('window.__record?.supported === true'
        + ' && typeof window.__record?.lastRecording === "function"'));
    await fire(chrome, '14a: shot', { v0: 2.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('14a: session archived', Number.isFinite(sid));
    check('14a: player opens via the seam',
      await chrome.eval(`window.__playback.openSession(${sid})`) === true);
    // bound the wall-clock run: a ~2.5 s trim window at 1× (realtime capture
    // has no montage cap — the wall seconds ARE the cost, so keep them small)
    const total14 = await chrome.eval('window.__playback.state().total');
    await chrome.eval(`window.__playback.setTrim(0, Math.min(${total14}, 2.5))`);
    // the iOS-shape shell + CHUNKED bridge: proves the delivery ladder end
    await chrome.eval(`(() => {
      window.__pbV1Posts = [];
      window.__pbStream = { ops: [], b64: '' };
      const S = window.__pbStream;
      window.webkit = { messageHandlers: {
        obSaveVideo: { postMessage: (m) => window.__pbV1Posts.push(m) },
        obSaveVideoStream: { postMessage: (m) => new Promise((res) => {
          S.ops.push({ op: m.op, name: m.name, seq: m.seq, dest: m.dest,
            mime: m.mime, bytes: m.bytes, chunks: m.chunks });
          if (m.op === 'chunk') S.b64 += m.b64;
          setTimeout(() => res({ ok: true }), 4);
        }) },
      } };
      window.__obSaveVideo = { v: 1, chunk: 786432, dests: ['photos', 'files'] };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '14a: card open');
    await waitFor(chrome,
      `document.querySelector('#ob-pb-card .ob-pb-estimate')?.textContent
        === window.__i18n.t('playback.realtimeNote')`,
      '14a: the realtime tier is offered on the honest probe failure', 60, 200);
    const offer = await chrome.eval(`(() => ({
      cta: document.querySelector('#ob-pb-card .ob-pb-go')?.disabled,
      adv: document.querySelector('#ob-pb-card .ob-pb-adv')?.style.display,
      line: document.querySelector('#ob-pb-card .ob-pb-quality span')?.textContent,
    }))()`);
    check('14a: realtime offer — CTA armed, pickers gone, honest wall-clock '
      + 'copy (no res/quality/slowmo promise)',
      offer.cta === false && offer.adv === 'none'
      && /live capture/.test(offer.line ?? ''), JSON.stringify(offer));
    // ---- 14a-cancel: Cancel mid-capture delivers NOTHING ---------------------
    await confirmClip(chrome, '14a-cancel');
    await waitFor(chrome, 'window.__record.recording() === true',
      '14a-cancel: the live capture is rolling', 40, 100);
    // lifecycle probe + the Cancel tap in ONE page-side eval: the capture
    // window is the short fixture trim's wall clock, and under load it can
    // END between separate CDP round-trips (2026-08-02 flake: the row was
    // back and Cancel hidden by the second eval) — sample and act inside
    // one evaluation while the run is still live.
    const midCancel = await chrome.eval(`(() => {
      const off = document.querySelector('#ob-pb-card .ob-pb-actions')
        ?.classList.contains('off') === true;
      const cancelBtn = document.querySelector('#ob-pb-card .ob-pb-pcancel');
      const vis = !!cancelBtn && cancelBtn.style.display !== 'none';
      if (vis) cancelBtn.click();
      return { off, vis };
    })()`);
    check('14a-cancel: the run rides the render lifecycle (actions row away, '
      + 'Cancel visible)', midCancel.off === true && midCancel.vis === true,
    JSON.stringify(midCancel));
    await waitFor(chrome,
      `document.querySelector('#ob-pb-card .ob-pb-ptext span')?.textContent
        === window.__i18n.t('export.cancelled')`,
      '14a-cancel: the cancelled paint landed');
    check('14a-cancel: recorder stopped, nothing delivered, tiles unarmed, '
      + 'CTA re-armed',
      await chrome.eval('window.__record.recording() === false')
      && await chrome.eval('window.__pbStream.ops.length === 0')
      && await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`)
      && await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-go")?.disabled === false'));
    // ---- 14a-run: the full capture → tiles arm off the capture blob ----------
    await confirmClip(chrome, '14a-run');
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '14a-run: the capture finished and armed the destinations', 300, 300);
    // (300×300 ms: the app-side finalize poll is 60 s under load — the
    // arm must outwait it, not race it)
    const ran = await chrome.eval(`(() => ({
      done: document.querySelector('#ob-pb-card .ob-pb-ptext span')?.textContent ?? '',
      size: window.__record.lastSize(),
      tiles: [...document.querySelectorAll('.ob-pb-dest')]
        .map((b) => b.dataset.dest).join(','),
    }))()`);
    check('14a-run: a real capture landed (size > 0) behind the honest '
      + 'captured verdict', ran.size > 0 && /captured/.test(ran.done),
    JSON.stringify(ran));
    check('14a-run: the webm capture + FAILED transcode probe hides Photos '
      + '(the GH-252 mime-honesty half on a REAL webm — files only)',
      ran.tiles === 'files', JSON.stringify(ran));
    // ---- 14a-deliver: the normal ladder, chunked, byte-complete --------------
    await chrome.eval('document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome,
      'window.__pbStream.ops.some((o) => o.op === "end")',
      '14a-deliver: the chunked transfer completed', 200, 200);
    const DL = await chrome.eval(`(() => {
      const S = window.__pbStream;
      const ops = S.ops;
      return { seq: ops.map((o) => o.op).join(','),
        begin: ops[0], end: ops[ops.length - 1],
        decodedLen: atob(S.b64).length,
        v1Posts: window.__pbV1Posts.length,
        recSize: window.__record.lastSize() };
    })()`);
    check('14a-deliver: begin -> chunk xN -> end, mime honesty (video/webm + '
      + '.webm name) and the reassembled bytes complete the announced size',
      /^begin(,chunk)+,end$/.test(DL.seq) && DL.begin.dest === 'files'
      && DL.begin.mime === 'video/webm' && /\.webm$/.test(DL.begin.name)
      && DL.decodedLen === DL.begin.bytes && DL.begin.bytes === DL.recSize
      && DL.v1Posts === 0,
      JSON.stringify(DL));
    check('14a-deliver: the GH-255 latch holds until the shell result',
      await chrome.eval(`[...document.querySelectorAll('.ob-pb-dest')]
        .every((b) => b.disabled)`)
      && await chrome.eval(`document.querySelector('.ob-pb-ptext span')
        ?.textContent === window.__i18n.t('playback.saving')`));
    await chrome.eval(`(() => { const b = window.__pbStream.ops[0];
      if (!b) return false;
      window.dispatchEvent(new CustomEvent('ob:save-video-result',
        { detail: { ok: true, name: b.name, dest: b.dest } }));
      return true; })()`);
    await waitFor(chrome,
      'document.querySelectorAll(".ob-pb-dest:not([disabled])").length > 0',
      '14a-deliver: the result re-armed the card');
    check('14a-deliver: and it paints the localized Saved',
      await chrome.eval(`document.querySelector('.ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.saved')`));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '14a');
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErr14a = await chrome.eval('__test.errors.slice()');
    check('14a: zero app errors', appErr14a.length === 0,
      JSON.stringify(appErr14a));
    // ---- 14a-startfail (review round-1 P1): a THROWING recorder never wedges --
    // If MediaRecorder construction throws inside __record.start, the run
    // must land in the honest failure paint with the lifecycle restored —
    // pre-fix, the promise rejected with `rendering` latched and rtCancel
    // unset, so Close stayed blocked forever (the wedged-card class the
    // 3f-hang arm exists to forbid).
    check('14a-startfail: player still open for the failure leg',
      await chrome.eval(`window.__playback.openSession(${sid})`) === true);
    await chrome.eval('window.__playback.setTrim(0, Math.min('
      + `${total14}, 2.5))`);
    await chrome.eval(`(() => {
      window.__pbRealStart = window.__record.start;
      window.__record.start = () => { throw new Error('constructor boom'); };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '14a-startfail: card open');
    await confirmClip(chrome, '14a-startfail');
    await waitFor(chrome,
      `document.querySelector('#ob-pb-card .ob-pb-ptext span')?.textContent
        === window.__i18n.t('playback.realtimeStartFailed')`,
      '14a-startfail: the honest LOCALIZED could-not-start paint landed');
    check('14a-startfail: lifecycle restored — CTA re-armed, recorder idle',
      await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-go")?.disabled === false')
      && await chrome.eval('window.__record.recording() === false'));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '14a-startfail');
    check('14a-startfail: and the card still closes (never wedged)',
      await chrome.eval('window.__playback.cardOpen() === false'));
    await chrome.eval('window.__record.start = window.__pbRealStart; true');
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    // ---- 14c (GH-1099): the recorder's FIRST FRAME arrives late ---------------
    // start() returning true only means MediaRecorder accepted the call; the
    // first video frame — and the native 'start' event — can come seconds
    // later. Pre-fix the clip advanced at once, so a 2.5 s trim finished and
    // stopped before the recorder saw a frame: an EMPTY capture, "Live capture
    // produced no file". The declared media-input condition (the issue's
    // repro): the capture's canvas track passes through a native
    // MediaStreamTrackProcessor → a transform that HOLDS the first frame
    // 4000 ms (frame objects and timestamps untouched) → a native
    // MediaStreamTrackGenerator, for this one capture only. The clip must
    // wait at its first pose until the recorder starts, then land the WHOLE
    // trim: a real capture (size > 0), the captured verdict, Files armed.
    check('14c: player still open for the late-first-frame leg',
      await chrome.eval(`window.__playback.openSession(${sid})`) === true);
    await chrome.eval('window.__playback.setTrim(0, Math.min('
      + `${total14}, 2.5))`);
    const gate14c = await chrome.eval(`(() => {
      if (typeof MediaStreamTrackProcessor !== 'function'
        || typeof MediaStreamTrackGenerator !== 'function') return false;
      const C = HTMLCanvasElement.prototype;
      const orig = C.captureStream;
      const G = window.__gate1099 = { holdMs: 4000, calls: 0, frames: 0, firstAt: null, releasedAt: null };
      C.captureStream = function (fps) {
        C.captureStream = orig; // one-shot: this capture only
        G.calls += 1;
        const src = orig.call(this, fps);
        const [track] = src.getVideoTracks();
        const proc = new MediaStreamTrackProcessor({ track });
        const gen = new MediaStreamTrackGenerator({ kind: 'video' });
        let held = false;
        proc.readable.pipeThrough(new TransformStream({
          async transform(frame, ctl) {
            G.frames += 1;
            if (!held) {
              held = true; G.firstAt = performance.now();
              await new Promise((r) => setTimeout(r, G.holdMs));
              G.releasedAt = performance.now();
            }
            ctl.enqueue(frame);
          },
        })).pipeTo(gen.writable).catch(() => {}); // the stop ends the pipe
        const genStop = gen.stop.bind(gen);
        gen.stop = () => { genStop(); try { track.stop(); } catch { /* ended */ } };
        return new MediaStream([gen]);
      };
      return true; })()`);
    if (!gate14c) {
      console.log('14c: SOFT-SKIP — this Chrome has no MediaStreamTrackProcessor/Generator');
    } else {
      await chrome.eval('window.__playback.save()');
      await waitFor(chrome, 'window.__playback.cardOpen() === true',
        '14c: card open');
      await confirmClip(chrome, '14c');
      await waitFor(chrome,
        `document.querySelectorAll('.ob-pb-dest:not([disabled])').length > 0
          || document.querySelector('#ob-pb-card .ob-pb-ptext span')?.textContent
            === window.__i18n.t('playback.realtimeNoFile')`,
        '14c: the late-first-frame capture settled', 300, 300);
      const late = await chrome.eval(`(() => ({
        done: document.querySelector('#ob-pb-card .ob-pb-ptext span')?.textContent ?? '',
        size: window.__record.lastSize(),
        tiles: [...document.querySelectorAll('.ob-pb-dest:not([disabled])')]
          .map((b) => b.dataset.dest).join(','),
        gate: window.__gate1099,
        heldReal: (window.__gate1099.releasedAt ?? 0) - (window.__gate1099.firstAt ?? 0),
      }))()`);
      // the gate's own facts, independent of the code under test (the
      // pre-fix early stop ends the pipe right after the release)
      check('14c: the gate really held the first frame of the capture ~4 s '
        + '(exactly one gated capture; the first frame released after the hold)',
      late.gate.calls === 1 && late.gate.frames >= 1 && late.heldReal >= 3900,
      JSON.stringify(late.gate));
      check('14c: a capture whose first frame arrives 4 s late still lands '
        + 'the whole trim — a real capture behind the captured verdict, '
        + 'Files armed (pre-fix: "Live capture produced no file")',
      late.size > 0 && /captured/.test(late.done) && late.tiles === 'files',
      JSON.stringify({ done: late.done, size: late.size, tiles: late.tiles }));
      await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
      await cardNodeGone(chrome, '14c');
      await chrome.eval('window.__playback.close()');
      await sleep(400);
    }
    // ---- 14b: BOTH absent → the honest unavailable state ---------------------
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      Object.defineProperty(window, 'MediaRecorder', { value: undefined });` });
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=rt3` });
    await waitReady(chrome, 'both-absent boot');
    check('14b: MediaRecorder really gone (unsupported seam)',
      await chrome.eval('window.__record?.supported === false'));
    // __archive/__playback land via post-ready dynamic imports — poll for
    // the seams before the open (a one-shot read raced them under load)
    await waitFor(chrome,
      'typeof window.__archive?.sessions === "function"'
      + ' && typeof window.__playback?.openSession === "function"',
    '14b: archive + playback seams up');
    await waitFor(chrome, `window.__playback.openSession(${sid})`,
      '14b: the archived session survives the reload');
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '14b: card open');
    await waitFor(chrome,
      `document.querySelector('#ob-pb-card .ob-pb-ptext span')?.textContent
        === window.__i18n.t('export.noneAvailable')`,
      '14b: the honest no-video-path notice is painted', 60, 200);
    const none = await chrome.eval(`(() => ({
      cta: document.querySelector('#ob-pb-card .ob-pb-go')?.disabled,
      cancelHidden: document.querySelector('#ob-pb-card .ob-pb-pcancel')
        ?.style.display === 'none',
    }))()`);
    check('14b: neither WebCodecs nor MediaRecorder → export.noneAvailable '
      + 'with a disabled CTA (the arm-3f claim, in its honest register)',
      none.cta === true && none.cancelHidden === true, JSON.stringify(none));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '14b');
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    await chrome.send('Page.removeScriptToEvaluateOnNewDocument',
      { identifier: noWc });
    const appErr14 = await chrome.eval('__test.errors.slice()');
    check('14: zero app errors', appErr14.length === 0, JSON.stringify(appErr14));
    check('14: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 16: GH-301 DIRECTOR STRIP (contract 5150532321 + A1/A2) -------------
// The cameraPlan cut-list model, the compiled-camerascript transition
// engine, the strip editor and the WYSIWYG/determinism laws — see the
// header block for the sub-arm map. Uses the arm-15 corpus (seed=5, shots
// A/B/C) so the POV walk geometry is the owner-approved one.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 14 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'GH-301 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '16: __playback seam');
    await fire(chrome, '16: shot A', { v0: 4.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '16: shot B', { v0: 0.55, phi: Math.PI / 2 + 0.5, theta: 0, a: 0, b: 0 });
    await fire(chrome, '16: shot C', { v0: 1.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid16 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('16: session opens',
      await chrome.eval(`window.__playback.openSession(${sid16})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true', '16: player open');
    await waitFor(chrome, 'window.__test.cameraScript?.(null) === true',
      '16: camerascript rig loaded');
    await waitFor(chrome, 'window.__playback.strip()?.mounted() === true',
      '16: strip editor mounted (leaf resolved)');
    await chrome.eval(`(() => {
      window.__ob301 = { pose() {
        const c = window.__dbg.camera;
        return [...c.matrixWorld.elements, c.fov];
      } };
      return true; })()`);
    const st0 = await chrome.eval('JSON.parse(JSON.stringify(window.__playback.state()))');

    // ---- 16a: model laws — quantize-at-save, last-write-wins, caps, degrade --
    check('16a: quantize-at-save (§1.1): seconds in, INTEGER centiseconds '
      + 'stored', await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0.80421, cam: 3, transitionIn: 0, dur: 0 },
        { seg: 1, t: 0, cam: 2, transitionIn: 2, dur: 1.0049 }], poses: [] });
      const p = window.__playback.getCutPlan();
      return p.cuts[0].t === 80 && Number.isInteger(p.cuts[0].t)
        && p.cuts[1].dur === 100; })()`));
    check('16a: duplicate (seg, t) anchor — LAST write wins',
      await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 1.0, cam: 3, transitionIn: 0, dur: 0 },
        { seg: 0, t: 1.0, cam: 5, transitionIn: 0, dur: 0 }], poses: [] });
      const p = window.__playback.getCutPlan();
      return p.cuts.length === 1 && p.cuts[0].cam === 5; })()`));
    check('16a: the 128-cut model cap refuses the 129th (§1.5)',
      await chrome.eval(`(() => {
      const mk = (n) => Array.from({ length: n }, (_, k) =>
        ({ seg: 0, t: 0.05 * k, cam: k % 2 ? 3 : 0, transitionIn: 0, dur: 0 }));
      const over = window.__playback.setCutPlan({ cuts: mk(129), poses: [] });
      const cap = window.__playback.setCutPlan({ cuts: mk(128), poses: [] });
      const kept = window.__playback.getCutPlan().cuts.length;
      return over === false && cap === true && kept === 128; })()`));
    check('16a: unknown camId degrades at APPLY time (cam 7 → broadcast '
      + 'emission + broadcast block family), never a throw (§1.4)',
      await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 7, transitionIn: 0, dur: 0 }], poses: [] });
      window.__playback.seek(0.2);
      const plan = window.__playback.plan();
      const b = document.querySelector('.ob-pb-strip-block');
      return plan.opts.perShotCamera[0] === 'side'
        && b?.dataset.fam === 'broadcast'
        && window.__playback.getCutPlan().cuts[0].cam === 7; })()`));
    // GH-864 F1: the ext-inclusive clock prices a completion overhang like play (1/speed), so this probe reads the alpha it read before.
    check('16a: unknown transitionIn degrades to a hard cut (no alpha, '
      + 'cut glyph, no throw)', await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
        { seg: 1, t: 0, cam: 3, transitionIn: 9, dur: 2.0 }], poses: [] });
      const cum1 = window.__playback.state().cum[1];
      return window.__playback.fadeAlphaAt(cum1) === 0
        && document.querySelector('.ob-pb-strip-seam[data-seam="1"] .ob-pb-strip-g')
          ?.textContent === '❙'; })()`));

    // ---- 16b: edit-time rejection — mid-segment cuts × dynamic rigs (§1.5) ---
    check('16b: a dynamic rig may not anchor mid-segment (chase at t>0 '
      + 'REFUSED)', await chrome.eval(`window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0.5, cam: 1, transitionIn: 0, dur: 0 }], poses: [] })`) === false);
    check('16b: a mid-segment cut may not LEAVE a dynamic span (static cut '
      + 'inside a chase-ruled segment REFUSED)',
    await chrome.eval(`window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 1, transitionIn: 0, dur: 0 },
        { seg: 0, t: 1.0, cam: 3, transitionIn: 0, dur: 0 }], poses: [] })`) === false);
    check('16b: …including an INHERITED dynamic span (chase at (0,0), '
      + 'static mid-cut in segment 1 REFUSED)',
    await chrome.eval(`window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 1, transitionIn: 0, dur: 0 },
        { seg: 1, t: 1.0, cam: 3, transitionIn: 0, dur: 0 }], poses: [] })`) === false);
    check('16b: a refused plan leaves the model untouched',
      await chrome.eval(`window.__playback.getCutPlan().cuts.length === 2`));
    check('16b: writeCut normalization — a pill-tap dynamic target sweeps '
      + 'its span\'s mid-segment anchors instead of stranding them',
    await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
        { seg: 0, t: 1.0, cam: 3, transitionIn: 0, dur: 0 }], poses: [] });
      window.__playback.seek(0.1);
      window.__playback.setCam('chase');
      const cuts = window.__playback.getCutPlan().cuts;
      return cuts.length === 1 && cuts[0].cam === 1 && cuts[0].t === 0; })()`));

    // ---- the WORKING plan for 16c-16j: mid-segment cut + fade + move ---------
    // seg0: broadcast head → overhead at 0.80 (the compiled camerascript
    // class); seg1/seg2: whole-segment POV — the (1,0) seam FADES (1.0 s)
    // and the (2,0) seam MOVES (the GH-299 walk, duration derived).
    const plan16 = { cuts: [
      { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
      { seg: 0, t: 0.8, cam: 3, transitionIn: 0, dur: 0 },
      { seg: 1, t: 0, cam: 2, transitionIn: 2, dur: 1.0 },
      { seg: 2, t: 0, cam: 2, transitionIn: 1, dur: 0 },
    ], poses: [] };
    check('16: the working plan is accepted', await chrome.eval(
      `window.__playback.setCutPlan(${JSON.stringify(plan16)})`));
    const st16 = await chrome.eval('JSON.parse(JSON.stringify(window.__playback.state()))');
    check('16: the MOVE seam walks and the FADE seam hard-cuts under its '
      + 'dip (beats: none after 0, walk after 1, none after the final)',
    st16.beats[0] === null && st16.beats[1] > 0 && st16.beats[2] === null,
    JSON.stringify(st16.beats));
    // GH-864 F1: the ext-inclusive clock prices a completion overhang like play (1/speed), so this probe reads the alpha it read before.
    check('16: fade alpha is EXACTLY 1 at the cut instant and 0 outside '
      + 'the window (§2.4)', await chrome.eval(`(() => {
      const A = window.__playback.state().cum[1];
      return window.__playback.fadeAlphaAt(A) === 1
        && window.__playback.fadeAlphaAt(A - 0.51) === 0
        && window.__playback.fadeAlphaAt(A + 0.51) === 0
        && window.__playback.fadeAlphaAt(A - 0.25) > 0
        && window.__playback.fadeAlphaAt(A - 0.25) < 1; })()`));

    // ---- 16c: scrub determinism — probes inside EVERY transition class ------
    // GH-864 F1: the ext-inclusive clock prices a completion overhang like play (1/speed), so this probe reads the alpha it read before.
    const cut0T = 0.8;
    const probes16 = [0.4, cut0T - 1 / 60, cut0T + 1 / 60, // across the mid-seg cut
      st16.cum[1] - 0.3, st16.cum[1], st16.cum[1] + 0.4,   // inside the fade window
      st16.cum[2] - st16.beats[1] * 0.5,                   // mid-walk (the move)
      st16.cum[2] - st16.beats[1] + 0.1,                   // walk hold
      st16.cum[2] + 0.2];                                  // arrival segment
    const fp16 = `(async (Ts) => {
      const out = [];
      for (const T of Ts) {
        // poison between samples: disarm the rig + scrub away (the 15d law)
        window.__test.cameraScript?.(null);
        window.__playback.seek(${st16.total} * 0.987);
        window.__playback.seek(T);
        out.push(JSON.stringify([window.__ob301.pose(),
          window.__playback.fadeAlphaAt(T),
          document.getElementById('ob-pb-fade')?.style.opacity]));
      }
      return out; })`;
    const chron16 = await chrome.eval(`${fp16}(${JSON.stringify(probes16)})`);
    const shuf16idx = [4, 8, 0, 6, 2, 7, 1, 5, 3];
    const shuf16 = await chrome.eval(
      `${fp16}(${JSON.stringify(shuf16idx.map((i) => probes16[i]))})`);
    check('16c: same-T frames are byte-identical, chronological vs shuffled, '
      + 'with probes inside the cut/fade/move classes (pose + alpha)',
    shuf16idx.every((orig, k) => shuf16[k] === chron16[orig]),
    JSON.stringify({ chron: chron16.map((s) => s.slice(0, 24)) }));

    // ---- 16d: WYSIWYG live-vs-export — a mid-segment cut + a fade ------------
    // trim to segments 0-1 (2 s into seg 1) to keep the render small; the
    // fade at (1,0) centers on segment 1's FIRST output frame.
    await chrome.eval(`window.__playback.setTrim(0, ${st16.cum[1] + 2})`);
    const plan16d = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('16d: the sliced plan carries the compiled seg-0 spec (2 pose '
      + 'moves), the fade window and NO beats',
    plan16d.opts.perShotCamera[0]?.script?.moves?.length === 2
      && Array.isArray(plan16d.opts.fades)
      && plan16d.opts.fades.length === 1
      && plan16d.opts.fades[0].i === 1 && plan16d.opts.fades[0].dur === 1
      && !plan16d.opts.beats,
    JSON.stringify({ fades: plan16d.opts.fades,
      cams: plan16d.opts.perShotCamera.map((c) => (typeof c === 'string'
        ? c : Object.keys(c))) }));
    const expRun16 = await chrome.eval(`(async () => {
      const plan = window.__playback.plan();
      const frames = [];
      let res;
      try {
        res = await window.__export.renderDrill(plan.records, { ...plan.opts,
          width: 320, height: 180, keepBlob: false, noDownload: true,
          withAudio: false, hashFrames: true,
          onProgress: () => { frames.push(window.__ob301.pose()); } });
      } catch (e) { return { err: String(e) }; }
      return { frames: frames.map((p) => JSON.stringify(p)),
        hashes: res.hashes, segments: res.segments,
        montageRate: res.montageRate }; })()`);
    check('16d: the REAL fade+cut export succeeded (rate 1)',
      !expRun16.err && expRun16.segments?.length === 2
      && expRun16.montageRate === 1,
    JSON.stringify({ err: expRun16.err, seg: expRun16.segments }));
    const kCut16 = Math.ceil(0.8 * 60); // the mid-segment cut's output frame
    // fresh-arm probes: the export's finally disarmed the rig and restored
    // the camera, so poison + cross a segment boundary before every sample
    // (the 16c discipline) — the re-arm is part of what the probe proves
    const livePose16 = async (T) => chrome.eval(`(() => {
      window.__test.cameraScript?.(null);
      window.__playback.seek(${st16.total} * 0.987);
      window.__playback.seek(${T});
      return JSON.stringify(window.__ob301.pose()); })()`);
    {
      const cmp = [];
      for (const k of [20, kCut16 - 1, kCut16, kCut16 + 1, kCut16 + 20]) {
        const live = await livePose16(k / 60);
        cmp.push({ k, eq: live === expRun16.frames[k] });
      }
      check('16d: live and export poses are BYTE-IDENTICAL per frame across '
        + 'the mid-segment cut (the compiled spec is the one writer in both)',
      cmp.every((c) => c.eq), JSON.stringify(cmp));
      check('16d: the cut SNAPS pose+fov at the cut frame (frames k-1/k '
        + 'differ, fov static per move — §2.3)',
      expRun16.frames[kCut16 - 1] !== expRun16.frames[kCut16]
        && JSON.parse(expRun16.frames[kCut16 - 1])[16] === 40
        && JSON.parse(expRun16.frames[kCut16])[16] === 78);
    }
    // the fade on the ENCODED BYTES: control render with the fade seam
    // hard-cut instead — equal outside the window, different inside,
    // EXACTLY black at the cut frame (§2.4)
    await chrome.eval(`(() => {
      const p = window.__playback.getCutPlan();
      p.cuts = p.cuts.map((c) => (c.seg === 1 && c.t === 0
        ? { ...c, t: 0, transitionIn: 0, dur: 0 } : c));
      p.cuts = p.cuts.map((c) => ({ ...c, t: c.t / 100, dur: c.dur / 100 }));
      return window.__playback.setCutPlan(p); })()`);
    const ctrlRun16 = await chrome.eval(`(async () => {
      const plan = window.__playback.plan();
      try {
        const res = await window.__export.renderDrill(plan.records,
          { ...plan.opts, width: 320, height: 180, keepBlob: false,
            noDownload: true, withAudio: false, hashFrames: true });
        return { hashes: res.hashes };
      } catch (e) { return { err: String(e) }; } })()`);
    check('16d: the control render (fade seam → hard cut) succeeded',
      !ctrlRun16.err, String(ctrlRun16.err ?? ''));
    {
      const a = expRun16.hashes, b = ctrlRun16.hashes;
      const segStart = expRun16.segments[0]; // the fade center (anchor t=0)
      // dur 1.0 s → ±30 OUTPUT frames (the §2.2 law verbatim: the dip
      // keeps ramping through the settle tail's held frames)
      const win = 30;
      const outside = [0, kCut16, segStart - win - 5, segStart + win + 5]
        .every((k) => a[k] === b[k]);
      const inside = [segStart - 10, segStart, segStart + 10]
        .every((k) => a[k] !== b[k]);
      const blackHash = await chrome.eval(`(() => {
        const c = document.createElement('canvas');
        c.width = 320; c.height = 180;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.fillStyle = '#000';
        x.fillRect(0, 0, 320, 180);
        const bytes = x.getImageData(0, 0, 320, 180).data;
        let h = 0x811c9dc5;
        for (let i = 0; i < bytes.length; i++) {
          h ^= bytes[i];
          h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(16).padStart(8, '0'); })()`);
      check('16d: fade windows are PURE CLIPPING on the encoded bytes — '
        + 'equal to the control outside the window, different inside, and '
        + 'EXACTLY black at the cut frame',
      outside && inside && a[segStart] === blackHash,
      JSON.stringify({ outside, inside, cutHash: a[segStart], blackHash }));
    }
    // restore the working plan + the full trim
    await chrome.eval(`window.__playback.setCutPlan(${JSON.stringify(plan16)})`);
    await chrome.eval(`window.__playback.setTrim(0, ${st16.total})`);

    // ---- 16e: A1 adaptive block labels (owner amendment) ---------------------
    {
      await chrome.eval(`window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
        { seg: 0, t: 0.3, cam: 3, transitionIn: 0, dur: 0 },
        { seg: 0, t: 0.34, cam: 5, transitionIn: 0, dur: 0 },
        { seg: 0, t: 0.9, cam: 4, transitionIn: 0, dur: 0 }], poses: [] })`);
      const a1 = await chrome.eval(`(() => {
        const bs = window.__playback.strip().blockRepr();
        const reprs = bs.map((b) => b.repr);
        const clipped = [...document.querySelectorAll(
          '.ob-pb-strip-block .ob-pb-strip-bl')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1).length;
        const named = bs.every((b) => typeof b.name === 'string' && b.name.length > 0);
        const iconHasSvg = bs.every((b, i) => b.repr !== 'icon'
          || !!document.querySelectorAll('.ob-pb-strip-block')[i]
            .querySelector('svg'));
        const colorBare = bs.every((b, i) => b.repr !== 'color'
          || document.querySelectorAll('.ob-pb-strip-block')[i]
            .childElementCount === 0);
        return { reprs, clipped, named, iconHasSvg, colorBare }; })()`);
      check('16e: A1 — text→icon→color-only on one plan, zero clipped '
        + 'labels, aria persists, icon tier carries the CAMS svg, the '
        + 'color tier carries color ONLY',
      a1.reprs.includes('text') && a1.reprs.includes('icon')
        && a1.reprs.includes('color') && a1.clipped === 0 && a1.named
        && a1.iconHasSvg && a1.colorBare,
      JSON.stringify(a1));
    }

    // ---- 16f: A2 slot-pill geometry equality (owner amendment) ---------------
    const a2 = await chrome.eval(`(() => {
      const preset = document.querySelector('.ob-pb-cam[data-cam="broadcast"]');
      const slot = document.querySelector('.ob-pb-slot');
      if (!preset || !slot) return { err: 'pills missing' };
      const box = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const lb = el.querySelector('.ob-pb-cam-l');
        const lcs = lb ? getComputedStyle(lb) : {};
        return { w: +r.width.toFixed(1), h: +r.height.toFixed(1),
          pad: cs.padding, radius: cs.borderRadius,
          font: lcs.fontSize + '/' + lcs.fontWeight + '/' + lcs.letterSpacing,
          classes: [...el.classList].filter((c) => c.indexOf('ob-btn') === 0)
            .join(' ') };
      };
      return { preset: box(preset), slot: box(slot) }; })()`);
    check('16f: A2 — the slot pill wears the preset pill\'s EXACT geometry '
      + 'and typography (box, padding, radius, label metrics, kit classes)',
    !a2.err && JSON.stringify(a2.preset) === JSON.stringify(a2.slot),
    JSON.stringify(a2));

    // ---- 16g: snap engage/disengage on a REAL pointer drag -------------------
    await chrome.eval(`window.__playback.setCutPlan({ cuts: [
      { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
      { seg: 0, t: 0.8, cam: 3, transitionIn: 0, dur: 0 }], poses: [] })`);
    const geo16 = await chrome.eval(`(() => {
      const lane = document.querySelector('.ob-pb-strip');
      const seam = lane.querySelector('.ob-pb-strip-seam[data-seam="1"]');
      const lr = lane.getBoundingClientRect();
      const sr = seam.getBoundingClientRect();
      const st = window.__playback.state();
      return { laneL: lr.left, laneW: lr.width, laneY: lr.top + lr.height / 2,
        seamX: sr.left + sr.width / 2, cum1: st.cum[1], total: st.total }; })()`);
    const bX = geo16.laneL + geo16.laneW * (geo16.cum1 / geo16.total);
    const mouse = (type, x, y, buttons = 1) => chrome.send(
      'Input.dispatchMouseEvent',
      { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : buttons,
        clickCount: type === 'mouseMoved' ? 0 : 1 });
    await mouse('mousePressed', geo16.seamX, geo16.laneY);
    await mouse('mouseMoved', geo16.seamX + 12, geo16.laneY); // break the tap
    await mouse('mouseMoved', bX + 2, geo16.laneY);           // inside the radius
    await sleep(150);
    const snapOn = await chrome.eval(`(() => ({
      lit: !!document.querySelector('.ob-pb-seg--lit'),
      snapCls: !!document.querySelector('.ob-pb-strip-seam--snap'),
      bubble: document.querySelector('.ob-pb-strip-bubble')?.textContent,
      want: window.__i18n.t('playback.strip.snapped', { n: 2 }),
      cut: window.__playback.getCutPlan().cuts[1] }))()`);
    check('16g: snap ENGAGES inside the radius — magnetized tick lit, '
      + 'snapped seam style, the bubble shows the SHOT LABEL, the anchor '
      + 'writes the exact boundary (seg 1, t = 0)',
    snapOn.lit && snapOn.snapCls && snapOn.bubble === snapOn.want
      && snapOn.cut.seg === 1 && snapOn.cut.t === 0,
    JSON.stringify(snapOn));
    // drag far past the escape distance → the snap releases
    const escX = geo16.laneL + geo16.laneW
      * ((geo16.cum1 - 1.6) / geo16.total);
    await mouse('mouseMoved', escX, geo16.laneY);
    await sleep(150);
    const snapOff = await chrome.eval(`(() => ({
      lit: !!document.querySelector('.ob-pb-seg--lit'),
      snapCls: !!document.querySelector('.ob-pb-strip-seam--snap'),
      bubble: document.querySelector('.ob-pb-strip-bubble')?.textContent,
      cut: window.__playback.getCutPlan().cuts[1] }))()`);
    check('16g: snap DISENGAGES past the escape distance — tick dark, '
      + 'bubble back to the time readout, mid-segment anchor restored',
    !snapOff.lit && !snapOff.snapCls && /\d:\d\d\.\d/.test(snapOff.bubble ?? '')
      && snapOff.cut.t > 0,
    JSON.stringify(snapOff));
    await mouse('mouseReleased', escX, geo16.laneY);
    await sleep(100);
    await chrome.eval('window.__playback.strip().closePop?.(); true');

    // ---- 16h: montage-chip / planFits agreement on a capped plan -------------
    await chrome.eval(`window.__playback.setCutPlan(${JSON.stringify(plan16)})`);
    const chipOf = async () => chrome.eval(`(() => {
      const m = document.querySelector('.ob-pb-montage');
      return { lit: m.classList.contains('on'), txt: m.textContent }; })()`);
    await chrome.eval('window.__playback.setSpeed(0.25)');
    const chipFade = await chipOf();
    await chrome.eval(`(() => {
      const p = window.__playback.getCutPlan();
      p.cuts = p.cuts.map((c) => ({ ...c, t: c.t / 100,
        dur: c.seg === 1 && c.t === 0 ? 0 : c.dur / 100,
        transitionIn: c.seg === 1 && c.t === 0 ? 0 : c.transitionIn }));
      return window.__playback.setCutPlan(p); })()`);
    const chipCut = await chipOf();
    check('16h: the ×0.25 plan lights the montage chip and FADES INSERT NO '
      + 'OUTPUT SECONDS — chip byte-identical with the fade vs a hard cut '
      + '(one schedule builder, §2.5)',
    chipFade.lit && chipCut.lit && chipFade.txt === chipCut.txt,
    JSON.stringify({ chipFade, chipCut }));
    const est16 = await chrome.eval(`(async () => {
      window.__playback.save();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (window.__playback.cardOpen()) break;
      }
      const est = document.querySelector('#ob-pb-card .ob-pb-estimate')
        ?.textContent ?? '';
      const tooLong = window.__i18n.t('playback.clipTooLong',
        { shots: 3, sec: 60 });
      document.querySelector('#ob-pb-card .ob-pb-close')?.click();
      return { est, agree: est !== tooLong }; })()`);
    check('16h: planFits AGREES with the lit chip (the capped plan still '
      + 'fits — the estimate line never claims clipTooLong)',
    est16.agree === true, JSON.stringify(est16));
    await chrome.eval('window.__playback.setSpeed(1)');
    await sleep(400);

    // ---- 16i: the capture flow (§3.2) ----------------------------------------
    await chrome.eval(`window.__playback.setCutPlan(${JSON.stringify(plan16)})`);
    const cap16 = await chrome.eval(`(async () => {
      window.__playback.seek(0.4);
      const strip = window.__playback.strip();
      strip.enterCapture(0);
      const latched = strip.captureActive();
      const before = JSON.stringify(window.__ob301.pose());
      // the latch must suppress the crossing re-apply: scrub across the
      // segment boundary and back — the camera may not move
      window.__playback.seek(window.__playback.state().cum[1] + 0.5);
      window.__playback.seek(0.4);
      const after = JSON.stringify(window.__ob301.pose());
      const saved = strip.saveCapture();
      const poses = window.__playback.getCutPlan().poses;
      return { latched, framingHeld: before === after, saved,
        poses, unlatched: !strip.captureActive() }; })()`);
    check('16i: capture — latch suppresses the crossing re-apply (framing '
      + 'byte-held across a boundary scrub), save writes INTEGER mm/dd '
      + '(quantize-at-save §1.1), latch releases',
    cap16.latched && cap16.framingHeld && cap16.saved && cap16.unlatched
      && cap16.poses.length === 1 && cap16.poses[0].slot === 0
      && [...cap16.poses[0].eye, ...cap16.poses[0].look, cap16.poses[0].fov]
        .every(Number.isInteger),
    JSON.stringify(cap16));
    const slotIns = await chrome.eval(`(async () => {
      window.__playback.seek(2.0);
      const b = document.querySelector('.ob-pb-slot[data-slot="0"]');
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await mouse('mousePressed', slotIns.x, slotIns.y);
    await sleep(80);
    await mouse('mouseReleased', slotIns.x, slotIns.y);
    await sleep(300);
    const trip16 = await chrome.eval(`(() => {
      const cuts = window.__playback.getCutPlan().cuts;
      const c = cuts.find((x) => x.cam === 8);
      if (!c) return { err: 'no tripod cut' };
      window.__playback.seek(2.0);
      const cam = window.__dbg.camera;
      const pose = window.__playback.getCutPlan().poses[0];
      // camera kernel-mm vs the stored quantized ints (threePosToK frame)
      const eyeMm = [Math.round(cam.position.z * 1000),
        Math.round(cam.position.x * 1000), Math.round(cam.position.y * 1000)];
      return { cut: c, eyeMm, eye: pose.eye,
        fov: cam.fov, fovDd: pose.fov,
        block: [...document.querySelectorAll('.ob-pb-strip-block')]
          .some((b) => b.dataset.fam === 'custom') }; })()`);
    check('16i: a REAL slot-pill tap inserts the tripod cut at the '
      + 'quantized playhead and the applied camera IS the stored mm/dd '
      + 'pose (custom block family on the strip)',
    !trip16.err && trip16.cut.t === 200
      && JSON.stringify(trip16.eyeMm) === JSON.stringify(trip16.eye)
      && Math.round(trip16.fov * 10) === trip16.fovDd && trip16.block,
    JSON.stringify(trip16));

    // ---- 16j: the MOVE seam — derived duration, comfort, legality ------------
    await chrome.eval(`window.__playback.setCutPlan(${JSON.stringify(plan16)})`);
    const move16 = await chrome.eval(`(() => {
      const strip = window.__playback.strip();
      strip.openTransPicker(3); // the (2,0) POV→POV seam
      const pop = document.getElementById('ob-pb-transpick');
      const moveBtn = pop?.querySelector('button[data-trans="1"]');
      const meta = window.__playback.walkMeta(1);
      const beat = window.__playback.state().beats[1];
      const out = { txt: moveBtn?.textContent, disabled: moveBtn?.disabled,
        pressed: moveBtn?.getAttribute('aria-pressed'),
        derived: beat?.toFixed(2), rate: meta?.ratePeakDegS };
      strip.closePop();
      strip.openTransPicker(1); // the (0, 0.8) static mid-segment seam
      const pop2 = document.getElementById('ob-pb-transpick');
      out.staticMoveDisabled = pop2?.querySelector('button[data-trans="1"]')
        ?.disabled;
      strip.closePop();
      return out; })()`);
    check('16j: the POV→POV seam offers MOVE with the DERIVED walk '
      + 'duration read-only (§1.5), the measured peak gaze rate holds the '
      + '100 deg/s ceiling, and a static seam\'s MOVE is disabled',
    move16.disabled === false && move16.pressed === 'true'
      && move16.txt?.includes(move16.derived)
      && move16.rate <= 100 + 1e-9
      && move16.staticMoveDisabled === true,
    JSON.stringify(move16));

    // ---- 16k: the plan latch across close/reopen (§1.3) ----------------------
    const latch16 = await chrome.eval(`(async () => {
      const before = JSON.stringify(window.__playback.getCutPlan());
      window.__playback.close();
      await new Promise((r) => setTimeout(r, 800));
      await window.__playback.openSession(${sid16});
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (window.__playback.playerOpen()) break;
      }
      return { before, after: JSON.stringify(window.__playback.getCutPlan()) };
    })()`);
    check('16k: the WHOLE plan (cuts + tripod poses) survives close/reopen '
      + '(the GH-273 latch law over the plan, §1.3)',
    latch16.before === latch16.after && latch16.before.includes('"cuts"'),
    latch16.before.slice(0, 80));

    // ---- 16m: review round-1 laws ----------------------------------------------
    // (a) the LIVE fade rides the OUTPUT clock through the speed detent:
    // at ¼× a 1 s fade spans dur/2·speed = 0.125 CONTENT seconds per side
    // (the export's exact 60-output-frame window), not 0.5.
    // GH-864 F1: the ext-inclusive clock prices a completion overhang like play (1/speed), so this probe reads the alpha it read before.
    await chrome.eval(`window.__playback.setCutPlan(${JSON.stringify(plan16)})`);
    const fade25 = await chrome.eval(`(() => {
      const A = window.__playback.state().cum[1];
      window.__playback.setSpeed(0.25);
      const out = {
        at: window.__playback.fadeAlphaAt(A),
        inside: window.__playback.fadeAlphaAt(A - 0.12),
        outside: window.__playback.fadeAlphaAt(A - 0.2),
      };
      window.__playback.setSpeed(1);
      return out; })()`).catch(() => null);
    check('16m: the live fade window scales with the speed detent (¼× → '
      + '±0.125 content s — the output-clock law, review r1 P1)',
    fade25 && fade25.at === 1 && fade25.inside > 0 && fade25.outside === 0,
    JSON.stringify(fade25));
    // (b) deleting a boundary seam SWEEPS mid-segment anchors the merged
    // dynamic span would otherwise rule (review r1 P1)
    check('16m: delete-cut sweep — a mid-segment anchor exposed to a '
      + 'dynamic span goes with the deleted seam (and the orphaned plan '
      + 'is unrepresentable through setCutPlan)',
    await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 1, transitionIn: 0, dur: 0 },
        { seg: 1, t: 0, cam: 3, transitionIn: 0, dur: 0 },
        { seg: 1, t: 1.0, cam: 5, transitionIn: 0, dur: 0 }], poses: [] });
      const cuts0 = window.__playback.getCutPlan().cuts;
      const i = cuts0.findIndex((c) => c.seg === 1 && c.t === 0);
      // the orphaned shape must be UNREPRESENTABLE through the seam…
      const rejected = window.__playback.setCutPlan({ cuts: cuts0
        .filter((_, k) => k !== i)
        .map((c) => ({ ...c, t: c.t / 100, dur: c.dur / 100 })),
      poses: [] }) === false;
      // …and the editor's delete SWEEPS instead of stranding: removing the
      // (1,0) overhead boundary takes the (1,1.0) close anchor with it
      const del = window.__playback.strip().deleteCut(i);
      const left = window.__playback.getCutPlan().cuts;
      return rejected && del === true && left.length === 1
        && left[0].cam === 1; })()`));
    // (c) a MOVE seam beside a re-cammed static block downgrades to CUT
    // (review r1 P2 — the editor must describe the rendered transition)
    check('16m: a stranded MOVE seam normalizes to CUT when its pair '
      + 'stops being POV→POV', await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 2, transitionIn: 0, dur: 0 },
        { seg: 1, t: 0, cam: 2, transitionIn: 1, dur: 0 },
        { seg: 2, t: 0, cam: 2, transitionIn: 1, dur: 0 }], poses: [] });
      const before = window.__playback.getCutPlan()
        .cuts.map((c) => c.transitionIn).join(',');
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 3, transitionIn: 0, dur: 0 },
        { seg: 1, t: 0, cam: 2, transitionIn: 1, dur: 0 },
        { seg: 2, t: 0, cam: 2, transitionIn: 1, dur: 0 }], poses: [] });
      const after = window.__playback.getCutPlan()
        .cuts.map((c) => c.transitionIn).join(',');
      const beats = window.__playback.state().beats;
      return before === '0,1,1' && after === '0,0,1'
        && beats[0] === null && beats[1] > 0; })()`));
    // (d) an EMPTY custom slot renders as the broadcast it degrades to —
    // family color AND emission agree (review r1 P2)
    check('16m: an empty custom slot\'s block wears the BROADCAST family '
      + '(apply-time degrade, §1.4 — never a custom-colored lie)',
    await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 9, transitionIn: 0, dur: 0 }], poses: [] });
      const b = document.querySelector('.ob-pb-strip-block');
      return b?.dataset.fam === 'broadcast'
        && window.__playback.plan().opts.perShotCamera[0] === 'side'; })()`));
    // (e) keyboard activation (review r1 P2): Enter on a block selects it
    check('16m: Enter on a strip block enters the EDITING state '
      + '(keyboard path — no synthesized click on role=button spans)',
    await chrome.eval(`(() => {
      window.__playback.setCutPlan(${JSON.stringify(plan16)});
      const b = document.querySelector('.ob-pb-strip-block[data-cut="1"]');
      b.focus();
      b.dispatchEvent(new KeyboardEvent('keydown',
        { key: 'Enter', bubbles: true, cancelable: true }));
      const sel = window.__playback.strip().selected();
      window.__playback.strip().select(null);
      return sel && sel.kind === 'block' && sel.cut === 1; })()`));
    // (f) a FILLED slot pill re-cams a SELECTED block instead of inserting
    // beside it (review r2 P2 — the preset-pill re-target law, §3.2)
    check('16m: a filled slot pill RE-CAMS the selected block (no stray '
      + 'insert)', await chrome.eval(`(() => {
      window.__playback.setCutPlan(${JSON.stringify(plan16)});
      // fill slot 0 through the capture flow (arm 16i proved the pose law)
      const strip = window.__playback.strip();
      strip.enterCapture(0);
      strip.saveCapture();
      const n0 = window.__playback.getCutPlan().cuts.length;
      strip.select(1); // the (0, 0.8) overhead block
      // the POINTER tap path (a keyboard click opens the flyout instead)
      const b = document.querySelector('.ob-pb-slot[data-slot="0"]');
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const cuts = window.__playback.getCutPlan().cuts;
      const re = cuts.find((c) => c.seg === 0 && c.t === 80);
      strip.select(null);
      return cuts.length === n0 && re?.cam === 8; })()`));
    // (f2) a KEYBOARD activation on a slot pill opens the flyout — the
    // path that makes re-capture keyboard-reachable (review r4 P2)
    check('16m: keyboard-activating a slot pill opens the flyout (select '
      + '+ re-capture both reachable)', await chrome.eval(`(() => {
      document.querySelector('.ob-pb-slot[data-slot="0"]').click(); // detail 0
      const fly = document.getElementById('ob-pb-slotfly');
      const acts = fly ? fly.querySelectorAll('.ob-pb-slotact').length : 0;
      window.__playback.strip().closePop();
      return !!fly && acts === 3; })()`));
    // (h) the BACKFILLED head span is a REAL control (review r3 P2): select
    // it, and a pill re-target writes the explicit (0, 0) anchor
    check('16m: the leading (backfilled) block selects and re-targets '
      + 'through the pills — never a dead button',
    await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 1, t: 0, cam: 3, transitionIn: 0, dur: 0 }], poses: [] });
      const strip = window.__playback.strip();
      const head = document.querySelector('.ob-pb-strip-block:not([data-cut])');
      head.dispatchEvent(new KeyboardEvent('keydown',
        { key: 'Enter', bubbles: true, cancelable: true }));
      const selected = strip.selected()?.cut === -1;
      document.querySelector('.ob-pb-cam[data-cam="close"]').click();
      const cuts = window.__playback.getCutPlan().cuts;
      strip.select(null);
      return selected && cuts.length === 2
        && cuts[0].seg === 0 && cuts[0].t === 0 && cuts[0].cam === 5; })()`));
    // (i) a malformed pose fov REFUSES at the edit-time door (review r3 P2)
    check('16m: setCutPlan refuses a non-finite custom-pose fov (the '
      + 'export would otherwise throw at the armed script)',
    await chrome.eval(`window.__playback.setCutPlan({ cuts: [],
      poses: [{ slot: 0, eye: [0, 0, 500], look: [100, 0, 20],
        fov: "bad" }] }) === false`));
    // (j) block selection is an OBJECT identity, not an index (review r4
    // P2): a write that re-sorts the cuts keeps the SAME span selected
    check('16m: selection survives a re-sorting write (identity, not '
      + 'index)', await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
        { seg: 0, t: 2.0, cam: 3, transitionIn: 0, dur: 0 }], poses: [] });
      const strip = window.__playback.strip();
      strip.select(1); // the (0, 2.0) overhead block
      // an EARLIER insert re-sorts the array under the selection (the raw
      // model op — a pill tap would consume the selection as a re-target)
      window.__playback.seek(1.0);
      strip.insertAtPlayhead(5);
      const cuts = window.__playback.getCutPlan().cuts;
      const sel = strip.selected();
      const still = cuts[sel?.cut];
      strip.select(null);
      return cuts.length === 3 && sel?.kind === 'block'
        && still?.t === 200 && still?.cam === 3; })()`));
    // (k) the picker carries Remove cut — the keyboard delete path
    // (review r4 P2; the pointer long-press stays)
    check('16m: the transition picker\'s Remove-cut action deletes the '
      + 'seam (keyboard-reachable path)', await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
        { seg: 0, t: 2.0, cam: 3, transitionIn: 0, dur: 0 }], poses: [] });
      const strip = window.__playback.strip();
      strip.openTransPicker(1);
      const del = document.querySelector('#ob-pb-transpick .ob-pb-transdel');
      if (!del) return false;
      del.click();
      return window.__playback.getCutPlan().cuts.length === 1; })()`));
    // (l) trim bounds are EXACT: a trim starting just BEFORE a cut keeps
    // the pre-cut camera for its first frame; starting just AFTER drops
    // the anchor into the backfilled head (review r4 P2)
    check('16m: compiled trim bounds are exact (0.796 keeps the pre-cut '
      + 'head, 0.804 folds the cut into the head)',
    await chrome.eval(`(() => {
      window.__playback.setCutPlan(${JSON.stringify(plan16)});
      const total = window.__playback.state().total;
      window.__playback.setTrim(0.796, total);
      const a = window.__playback.plan().opts.perShotCamera[0];
      window.__playback.setTrim(0.804, total);
      const b = window.__playback.plan().opts.perShotCamera[0];
      window.__playback.setTrim(0, total);
      return a?.script?.moves?.length === 2 && a.script.moves[0].fov === 40
        && b === 'top'; })()`));
    // (m) a fade anchored EXACTLY at an explicit out-trim vanishes with
    // its trimmed cut — no orphaned dip on the tail frames (review r4 P2)
    // GH-864 F1: the ext-inclusive clock prices a completion overhang like play (1/speed), so this probe reads the alpha it read before.
    check('16m: an out-trim exactly at a fade anchor drops the fade '
      + '(explicit endT is exclusive, matching the camera compiler) — and '
      + 'the LIVE preview drops it too (r13: no dip the export lacks)',
    await chrome.eval(`(() => {
      window.__playback.setCutPlan(${JSON.stringify(plan16)});
      const st = window.__playback.state();
      window.__playback.setTrim(0, st.cum[1]); // tOut exactly at the fade
      const fades = window.__playback.plan().opts.fades ?? null;
      const liveA = window.__playback.fadeAlphaAt(st.cum[1] - 0.1);
      window.__playback.setTrim(0, st.total);
      const back = window.__playback.plan().opts.fades?.length === 1;
      const liveBack = window.__playback.fadeAlphaAt(st.cum[1]) === 1;
      return fades === null && liveA === 0 && back && liveBack; })()`));
    // (n) capture framing is LIVE (review r5 P1): the latch runs a
    // presentation rAF loop — the canvas repaints while the user frames.
    // GH-423: the windows are measured in the tab's OWN rAF ticks, never
    // wall-clock. The pre-fix 400/300 ms sleeps counted ABSOLUTE frames,
    // so RAF starvation under gate-stampede load (the #425 storm class)
    // read a healthy latch loop as dead — the ledger holds this arm red
    // on 5+ distinct pristine trees in one night, and a tab-local CPU
    // throttle burst reproduced it 20/20 (during 1-4 < 5) while the
    // tick-counted form stayed 12/12 renders under the identical cadence.
    // The latch loop and this counter ride the SAME rAF queue, so K
    // observed ticks bound the loop's opportunities at ANY frame rate;
    // state + measurement live in ONE eval (the GH-344/GH-413 law), and
    // a genuinely frozen canvas still fails (ticks fire, renders don't —
    // and a dead rAF pipeline trips the honest capMs sentinel).
    const capLoop16 = await chrome.eval(`(async () => {
      window.__playback.setCutPlan(${JSON.stringify(plan16)});
      const strip = window.__playback.strip();
      const real = window.__dbg.composer.render.bind(window.__dbg.composer);
      let n = 0;
      window.__dbg.composer.render = (...a) => { n += 1; return real(...a); };
      const ticks = (k, capMs) => new Promise((res) => {
        let i = 0;
        const cap = setTimeout(() => res(false), capMs);
        const step = () => {
          if (++i >= k) { clearTimeout(cap); res(true); }
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      strip.enterCapture(1);
      const tickedIn = await ticks(12, 15000);
      const during = n;
      strip.cancelCapture();
      const tickedOut = await ticks(8, 10000);
      const after = n;
      window.__dbg.composer.render = real;
      // loop live while latched (>= 5 renders across 12 observed ticks),
      // STOPPED after exit (bounded drain: the exitCapture applyAt
      // re-render only — nothing per-frame)
      return { ok: tickedIn && tickedOut && during >= 5
        && (after - during) <= 3,
      during, drain: after - during, tickedIn, tickedOut }; })()`);
    check('16m: the capture latch runs the presentation render loop '
      + '(framing never happens against a frozen canvas)',
    capLoop16?.ok === true, JSON.stringify(capLoop16));
    // (o) entering capture CLEARS an active fade (review r5 P2): the
    // framing view is never black under a stale dip
    check('16m: capture entry clears the live fade layer',
      await chrome.eval(`(async () => {
      window.__playback.setCutPlan(${JSON.stringify(plan16)});
      const A = window.__playback.state().cum[1];
      window.__playback.seek(A); // exactly black at the cut instant
      const before = document.getElementById('ob-pb-fade').style.opacity;
      const strip = window.__playback.strip();
      strip.enterCapture(2);
      const during = document.getElementById('ob-pb-fade').style.opacity;
      strip.cancelCapture();
      await new Promise((r) => setTimeout(r, 100));
      return Number(before) === 1 && Number(during) === 0; })()`));
    // (p) an anchor on a segment's END grid line canonicalizes to the
    // NEXT boundary — no orphaned fade on the settle tail (review r5 P2)
    check('16m: an end-of-segment anchor canonicalizes to (seg+1, 0); the '
      + 'final segment pins one grid step inside',
    await chrome.eval(`(() => {
      const durs = window.__playback.state().durs;
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
        { seg: 0, t: Math.round(durs[0] * 100) / 100, cam: 3,
          transitionIn: 2, dur: 1.0 },
        { seg: 2, t: Math.round(durs[2] * 100) / 100, cam: 5,
          transitionIn: 0, dur: 0 }], poses: [] });
      const cuts = window.__playback.getCutPlan().cuts;
      const mid = cuts.find((c) => c.cam === 3);
      const last = cuts.find((c) => c.cam === 5);
      return mid?.seg === 1 && mid?.t === 0
        && last?.seg === 2 && last?.t === Math.round(durs[2] * 100) - 1; })()`));
    // (q) OPEN-picker actions resolve their cut by IDENTITY (review r6 P2):
    // a write that re-sorts the plan under a standing picker must not make
    // Remove/transition edit a different seam
    check('16m: a standing picker edits ITS OWN seam after a re-sorting '
      + 'write (identity resolution at click time)',
    await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
        { seg: 0, t: 2.0, cam: 3, transitionIn: 0, dur: 0 }], poses: [] });
      const strip = window.__playback.strip();
      strip.openTransPicker(1); // the (0, 2.0) seam
      // re-sort under it: insert an EARLIER anchor
      window.__playback.seek(1.0);
      strip.insertAtPlayhead(5);
      document.querySelector('#ob-pb-transpick .ob-pb-transdel')?.click();
      const cuts = window.__playback.getCutPlan().cuts;
      return cuts.length === 2
        && !cuts.some((c) => c.t === 200)   // ITS seam went
        && cuts.some((c) => c.t === 100); })()`)); // the new one stands
    // (r) malformed fade durations REFUSE at the seam (review r6 P2)
    check('16m: setCutPlan refuses a NaN duration and a zero-duration '
      + 'FADE (no fade the clocks would silently skip)',
    await chrome.eval(`(() => {
      const nan = window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: "bad" }], poses: [] });
      const zero = window.__playback.setCutPlan({ cuts: [
        { seg: 1, t: 0, cam: 3, transitionIn: 2, dur: 0 }], poses: [] });
      return nan === false && zero === false; })()`));
    // (s) a live locale switch never strands overlay copy (review r6 P2):
    // transient popovers close; the capture bar re-writes in place
    check('16m: locale switch closes popovers and re-writes the capture '
      + 'bar copy', await chrome.eval(`(async () => {
      window.__playback.setCutPlan(${JSON.stringify(plan16)});
      const strip = window.__playback.strip();
      strip.openTransPicker(1);
      strip.enterCapture(0);
      __settings.set('language', 'zh-CN');
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (window.__i18n.locale() === 'zh-CN') break;
      }
      await new Promise((r) => setTimeout(r, 400));
      const popGone = !document.getElementById('ob-pb-transpick');
      const barTxt = document.querySelector('#ob-pb-capture span')?.textContent;
      const want = window.__i18n.t('playback.capture.hint');
      strip.cancelCapture();
      __settings.set('language', 'en');
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (window.__i18n.locale() === 'en') break;
      }
      return popGone && !!barTxt && barTxt.includes(want); })()`));
    // (t) capture blocks play + exits before the save card (review r7 P2)
    check('16m: play stays parked while the capture latch is held, and '
      + 'opening the save card abandons the capture first',
    await chrome.eval(`(async () => {
      window.__playback.setCutPlan(${JSON.stringify(plan16)});
      const strip = window.__playback.strip();
      strip.enterCapture(0);
      document.querySelector('.ob-pb-play').click();
      await new Promise((r) => setTimeout(r, 150));
      const parked = window.__playback.state().playing === false;
      window.__playback.save();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (window.__playback.cardOpen()) break;
      }
      const cardUp = window.__playback.cardOpen();
      const unlatched = !strip.captureActive()
        && !document.getElementById('ob-pb-capture');
      document.querySelector('#ob-pb-card .ob-pb-close')?.click();
      await new Promise((r) => setTimeout(r, 500));
      return parked && cardUp && unlatched; })()`));
    // (u) Escape dismisses the picker with focus back on its seam
    // (review r7 P2 — the keyboard dismissal path)
    check('16m: Escape closes the transition picker and returns focus to '
      + 'the seam', await chrome.eval(`(() => {
      const strip = window.__playback.strip();
      strip.openTransPicker(2);
      document.dispatchEvent(new KeyboardEvent('keydown',
        { key: 'Escape', bubbles: true, cancelable: true }));
      const gone = !document.getElementById('ob-pb-transpick');
      const focused = document.activeElement
        ?.classList?.contains('ob-pb-strip-seam');
      return gone && focused; })()`));
    // (v) the lit pill never LEADS the rendered camera (review r7 P3):
    // reads floor onto the grid, so 0.796 still wears the pre-cut tile
    check('16m: the pressed camera tile floors onto the grid (0.796 → '
      + 'broadcast, 0.804 → overhead around the 0.80 cut)',
    await chrome.eval(`(() => {
      window.__playback.setCutPlan(${JSON.stringify(plan16)});
      window.__playback.seek(0.796);
      const a = [...document.querySelectorAll('.ob-pb-cam')]
        .find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.cam;
      window.__playback.seek(0.804);
      const b = [...document.querySelectorAll('.ob-pb-cam')]
        .find((x) => x.getAttribute('aria-pressed') === 'true')?.dataset.cam;
      return a === 'broadcast' && b === 'overhead'; })()`));
    // (g) fade opacity REPAINTS on a paused speed change (review r2 P2)
    check('16m: a paused speed change repaints the fade layer NOW '
      + '(alpha rides the speed-mapped output clock)',
    await chrome.eval(`(() => {
      window.__playback.setCutPlan(${JSON.stringify(plan16)});
      const A = window.__playback.state().cum[1];
      window.__playback.setSpeed(1);
      window.__playback.seek(A - 0.2); // inside the 1× window
      const before = document.getElementById('ob-pb-fade').style.opacity;
      window.__playback.setSpeed(0.25); // ±0.125 content window: outside
      const after = document.getElementById('ob-pb-fade').style.opacity;
      window.__playback.setSpeed(1);
      return Number(before) > 0 && Number(after) === 0; })()`));

    // ---- 16n (GH-324): a seam drag through an OCCUPIED shot-boundary snap
    // zone is NON-DESTRUCTIVE. Pre-fix, writeCut's duplicate-anchor filter
    // silently DELETED the cut anchored on the boundary the instant the
    // dragged seam snapped onto it — a continuing drag through the zone
    // lost that cut with no gesture ending (and losing a POV/CHASE cut
    // rescaled the timeline under the pointer). The law: no destructive
    // action from a continuing drag — an occupied target anchor REFUSES
    // the move (the seam holds, the magnet visuals stand down) and
    // deletion stays the picker Remove / long-press (16m-(k) pins Remove).
    // Two legs: (i) STATIC victim — the drag crosses THROUGH the zone and
    // lands beyond it, victim intact; (ii) POV victim carrying the walk
    // beat — the drag parks IN the zone and releases there, victim + the
    // beat-inclusive timeline length both intact.
    {
      // (i) static victim on the seg-1 boundary; drag the (0, 0.8) seam
      // through it into segment 1
      await chrome.eval(`window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
        { seg: 0, t: 0.8, cam: 3, transitionIn: 0, dur: 0 },
        { seg: 1, t: 0, cam: 4, transitionIn: 0, dur: 0 }], poses: [] })`);
      const g16n = await chrome.eval(`(() => {
        const lane = document.querySelector('.ob-pb-strip');
        const seam = lane.querySelector('.ob-pb-strip-seam[data-seam="1"]');
        const lr = lane.getBoundingClientRect();
        const sr = seam.getBoundingClientRect();
        const st = window.__playback.state();
        return { laneL: lr.left, laneW: lr.width,
          laneY: lr.top + lr.height / 2,
          seamX: sr.left + sr.width / 2, cum1: st.cum[1],
          total: st.total }; })()`);
      const toX = (T) => g16n.laneL + g16n.laneW * (T / g16n.total);
      const planProbe = () => chrome.eval(`(() => {
        const cuts = window.__playback.getCutPlan().cuts;
        return { n: cuts.length,
          victim: cuts.some((c) => c.seg === 1 && c.t === 0 && c.cam === 4),
          dragged: cuts.find((c) => c.cam === 3) ?? null,
          lit: !!document.querySelector('.ob-pb-seg--lit'),
          snapCls: !!document.querySelector('.ob-pb-strip-seam--snap'),
          total: window.__playback.state().total }; })()`);
      await mouse('mousePressed', g16n.seamX, g16n.laneY);
      await mouse('mouseMoved', g16n.seamX + 12, g16n.laneY); // break the tap
      await mouse('mouseMoved', toX(g16n.cum1) + 2, g16n.laneY); // IN the zone
      await sleep(150);
      const inZone = await planProbe();
      check('16n: dragging INTO an occupied boundary snap zone deletes '
        + 'NOTHING (both cuts + the victim anchor survive mid-drag) and '
        + 'the magnet visuals stand down on the refused move',
      inZone.n === 3 && inZone.victim && !inZone.lit && !inZone.snapCls,
      JSON.stringify(inZone));
      await mouse('mouseMoved', toX(g16n.cum1 + 0.6), g16n.laneY); // THROUGH
      await sleep(150);
      await mouse('mouseReleased', toX(g16n.cum1 + 0.6), g16n.laneY, 0);
      await sleep(150);
      const through = await planProbe();
      check('16n: the drag crosses THROUGH the occupied zone — the dragged '
        + 'seam lands beyond the boundary, the anchored cut is intact',
      through.n === 3 && through.victim && through.dragged?.seg === 1
        && through.dragged.t > 0,
      JSON.stringify(through));
      // (ii) POV victim carrying the walk beat: park + release IN the zone
      await chrome.eval(`window.__playback.setCutPlan(${JSON.stringify({
        cuts: [
          { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
          { seg: 0, t: 0.8, cam: 3, transitionIn: 0, dur: 0 },
          { seg: 1, t: 0, cam: 2, transitionIn: 2, dur: 1.0 },
          { seg: 2, t: 0, cam: 2, transitionIn: 1, dur: 0 },
        ], poses: [] })})`);
      const g16n2 = await chrome.eval(`(() => {
        const lane = document.querySelector('.ob-pb-strip');
        const seam = lane.querySelector('.ob-pb-strip-seam[data-seam="1"]');
        const sr = seam.getBoundingClientRect();
        const st = window.__playback.state();
        return { seamX: sr.left + sr.width / 2, cum1: st.cum[1],
          total: st.total }; })()`);
      const toX2 = (T) => g16n.laneL + g16n.laneW * (T / g16n2.total);
      await mouse('mousePressed', g16n2.seamX, g16n.laneY);
      await mouse('mouseMoved', g16n2.seamX + 12, g16n.laneY);
      await mouse('mouseMoved', toX2(g16n2.cum1) + 2, g16n.laneY);
      await sleep(150);
      await mouse('mouseReleased', toX2(g16n2.cum1) + 2, g16n.laneY, 0);
      await sleep(150);
      const povKept = await chrome.eval(`(() => {
        const cuts = window.__playback.getCutPlan().cuts;
        return { n: cuts.length,
          victim: cuts.some((c) => c.seg === 1 && c.t === 0 && c.cam === 2),
          dragged: cuts.find((c) => c.cam === 3) ?? null,
          total: window.__playback.state().total }; })()`);
      check('16n: a drag RELEASED inside the occupied zone still deletes '
        + 'nothing — the POV cut and the beat-inclusive timeline length '
        + 'both survive (no rescale under the pointer)',
      povKept.n === 4 && povKept.victim
        && povKept.dragged?.seg === 0 && povKept.dragged.t > 0
        && Math.abs(povKept.total - g16n2.total) < 1e-9,
      JSON.stringify({ ...povKept, totalBefore: g16n2.total }));
      // the identity-move degenerate case: a seam dragged INTO the zone and
      // back OUT keeps ITSELF too (self-anchors never refuse)
      const selfKeep = await chrome.eval(`(() => {
        const cuts = window.__playback.getCutPlan().cuts;
        return cuts.length === 4; })()`);
      check('16n: plan cardinality stable across the whole gesture set',
        selfKeep === true);
      // (iii) review round-1 P2: the refusal is the DRAG stream's alone — a
      // selected mid-segment block re-cammed to a DYNAMIC rig (the pill
      // re-target, opts.replace WITHOUT opts.drag) canonicalizes onto
      // (seg, 0) and must WIN an occupied boundary (§1.1 last-write-wins),
      // never be silently consumed.
      check('16n: an explicit block re-cam to CHASE wins the occupied '
        + 'boundary anchor (re-target keeps last-write-wins; only the '
        + 'continuing drag refuses)', await chrome.eval(`(() => {
        window.__playback.setCutPlan({ cuts: [
          { seg: 1, t: 0, cam: 4, transitionIn: 0, dur: 0 },
          { seg: 1, t: 2.0, cam: 3, transitionIn: 0, dur: 0 }],
        poses: [] });
        const strip = window.__playback.strip();
        strip.select(1); // the (1, 2.0) overhead block
        document.querySelector('.ob-pb-cam[data-cam="chase"]').click();
        const cuts = window.__playback.getCutPlan().cuts;
        strip.select(null);
        return cuts.length === 1 && cuts[0].seg === 1 && cuts[0].t === 0
          && cuts[0].cam === 1; })()`));
    }

    // ---- the PHONE register: compound CAM ▾ pill + flyout (§3.3, A2) ---------
    await setPhoneMetrics(chrome, { width: 852, height: 393 });
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=301ph` });
    await waitReady(chrome, '16 phone boot');
    await waitFor(chrome, 'typeof window.__playback?.openSession === "function"',
      '16 phone: seam');
    check('16 phone: session reopens', await chrome.eval(
      `window.__playback.openSession(${sid16})`) === true);
    await waitFor(chrome, 'window.__playback.strip()?.mounted() === true',
      '16 phone: strip mounted');
    await chrome.eval('window.__playback.setSpeed(0.25)'); // light the chip:
    // the WORST-case row1 (compound pill + montage chip both lit — the
    // §3.3 re-measure ruling)
    await sleep(300);
    const ph16 = await chrome.eval(`(() => {
      const slots = [...document.querySelectorAll('.ob-pb-slot')];
      const compound = document.querySelector('.ob-pb-slots');
      const lane = document.querySelector('.ob-pb-strip');
      const row1 = document.querySelector('.ob-pb-row1');
      const r1 = row1.getBoundingClientRect();
      // used = the fixed children (everything but the .ob-pb-grow filler)
      // + the flex gaps; slack = what the filler still absorbs
      let used = 0, n = 0;
      for (const el of row1.children) {
        const r = el.getBoundingClientRect();
        if (!(r.width > 0)) continue;
        n += 1;
        if (!el.classList.contains('ob-pb-grow')) used += r.width;
      }
      used += 8 * (n - 1); // --ob-sp-2 flex gaps
      const overflow = row1.scrollWidth > row1.clientWidth + 1;
      window.__playback.strip().openSlotFlyout();
      const fly = document.getElementById('ob-pb-slotfly');
      const entry = fly?.querySelector('.ob-pb-slotfly-pill');
      const preset = document.querySelector('.ob-pb-cam[data-cam="broadcast"]');
      const box = (el) => {
        const r = el.getBoundingClientRect();
        const lb = el.querySelector('.ob-pb-cam-l');
        const lcs = lb ? getComputedStyle(lb) : {};
        return { w: +r.width.toFixed(1), h: +r.height.toFixed(1),
          font: lcs.fontSize + '/' + lcs.fontWeight };
      };
      const out = {
        slotsHidden: slots.every((b) => !b.getBoundingClientRect().width),
        compoundOn: !!compound && compound.getBoundingClientRect().width > 0,
        laneH: +lane.getBoundingClientRect().height.toFixed(1),
        row1W: +r1.width.toFixed(1), row1Used: +used.toFixed(1),
        overflow,
        flyOpen: !!fly, entries: fly
          ? fly.querySelectorAll('.ob-pb-slotfly-pill').length : 0,
        entryBox: entry ? box(entry) : null, presetBox: box(preset),
      };
      window.__playback.strip().closePop();
      return out; })()`);
    check('16 phone: ONE compound CAM ▾ pill (inline slot pills hidden), '
      + 'the 3-slot flyout opens, its entries wear the A2 preset-pill '
      + 'geometry, the lane pays the 10 px phone rent, and the WORST-case '
      + 'row1 (compound pill + lit montage chip) keeps positive slack',
    ph16.slotsHidden && ph16.compoundOn && ph16.flyOpen && ph16.entries === 3
      && JSON.stringify(ph16.entryBox) === JSON.stringify(ph16.presetBox)
      && ph16.laneH === 10 && ph16.row1Used < ph16.row1W && !ph16.overflow,
    JSON.stringify(ph16));
    console.log('16 phone: row1 budget measured (chip lit)', JSON.stringify({
      used: ph16.row1Used, width: ph16.row1W,
      slack: +(ph16.row1W - ph16.row1Used).toFixed(1) }));
    await chrome.eval('window.__playback.setSpeed(1)');
    await chrome.eval('window.__playback.close()');
    await sleep(500);
    const appErr16 = await chrome.eval('__test.errors.slice()');
    check('16: zero app errors', appErr16.length === 0, JSON.stringify(appErr16));
    check('16: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 16z: GH-301 DEGRADE — the strip leaf FAILS to load ------------------
// (contract §3.4): pill-only player, boundary-only writes = the exact
// GH-273 behavior, savePlan still emits a valid plan, zero errors.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=301z`,
    { port: CDP + 15 });
  watch(chrome, errs);
  try {
    chrome.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (/app\/playback-strip\.js/.test(params.request.url)) {
        chrome.send('Fetch.failRequest',
          { requestId: params.requestId, errorReason: 'Failed' })
          .catch(() => {}); // the 6a belt: a dead paused request is benign
      } else {
        chrome.send('Fetch.continueRequest', { requestId: params.requestId })
          .catch(() => {});
      }
    });
    await chrome.send('Fetch.enable',
      { patterns: [{ urlPattern: '*playback-strip.js*' }] });
    await chrome.send('Network.enable');
    await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=301z2` });
    await waitReady(chrome, '16z: strip-failed boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '16z: __playback seam');
    await fire(chrome, '16z: shot A', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '16z: shot B', { v0: 1.2, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sidZ = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('16z: session opens with the strip leaf ABSENT',
      await chrome.eval(`window.__playback.openSession(${sidZ})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '16z: player open');
    await sleep(800);
    const z = await chrome.eval(`(() => ({
      strip: window.__playback.strip(),
      lane: !!document.querySelector('.ob-pb-strip'),
      slots: document.querySelectorAll('.ob-pb-slot, .ob-pb-slots').length,
      pills: document.querySelectorAll('.ob-pb-cam').length }))()`);
    check('16z: NO lane, NO slot pills, the preset pills stand (the exact '
      + 'GH-273 player)', z.strip === null && z.lane === false
      && z.slots === 0 && z.pills >= 4, JSON.stringify(z));
    // a pill tap MID-SEGMENT writes the BOUNDARY anchor (GH-273 exactly)
    const zWrite = await chrome.eval(`(async () => {
      window.__playback.seek(0.7); // mid-segment playhead
      document.querySelector('.ob-pb-cam[data-cam="overhead"]').click();
      await new Promise((r) => setTimeout(r, 200));
      const cuts = window.__playback.getCutPlan().cuts;
      const st = window.__playback.state();
      return { cuts, cams: st.cams }; })()`);
    check('16z: the mid-playhead pill tap writes the BOUNDARY-ONLY '
      + 'assignment (seg 0, t = 0) — the recorded degrade is GH-273 verbatim',
    zWrite.cuts.length === 1 && zWrite.cuts[0].seg === 0
      && zWrite.cuts[0].t === 0 && zWrite.cuts[0].cam === 3
      && zWrite.cams[0] === 'overhead',
    JSON.stringify(zWrite));
    const zPlan = await chrome.eval(`(() => {
      const p = window.__playback.plan();
      return { cams: p.opts.perShotCamera, fades: p.opts.fades ?? null }; })()`);
    check('16z: savePlan still emits a VALID plan (string presets, no '
      + 'fades key)', Array.isArray(zPlan.cams)
      && zPlan.cams.every((c) => c === 'top') && zPlan.fades === null,
    JSON.stringify(zPlan));
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErrZ = await chrome.eval('__test.errors.slice()');
    check('16z: zero app errors', appErrZ.length === 0, JSON.stringify(appErrZ));
    // Chrome logs one network-level ERR_FAILED per deliberately failed
    // playback-strip.js request (the arm 6d precedent) — that is the arm's
    // own doing, never an app defect; anything else fails.
    const otherZ = errs.filter((e) => !/net::ERR_FAILED/.test(String(e)));
    check('16z: zero console errors beyond the deliberate strip-fetch '
      + 'failure', otherZ.length === 0, otherZ.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 17: GH-304 — the byte-derived export duration budget ---------------
// The plan-time budget (playback planBudget → __export.exportBudget →
// offline-render exportBudgetSec, the ONE derivation) replaces the fixed
// 60 s montage/save ceiling. This arm gates the PLAYBACK half (the engine
// arithmetic itself is pinned in e2e-export B1-B5):
//   17a  the honest floor, red-proofed at the plan level: a fresh profile
//        (calibration store forcibly absent) plans EXACTLY the pre-304
//        shape — no opts.budgetSec, walk beats kept, no amber notice, and
//        the seam answers { sec: 60, derived: false }.
//   17b  derived budget + mirrors byte-agree: a sanity-ceiling fixture rate
//        over the negotiated container derives the smallest reachable
//        wire-wall budget (4 s — dests name no Photos, so the wire wall
//        governs both containers, capped by the ruled 300 MB file
//        acceptance); walk beats degrade per
//        the REPLICATED first-fit sweep over the builder's own beatSec
//        outputs (GH-299's degrade path, now red/greened BY the derived
//        budget), the amber notice paints the derived length through
//        {dur} (the ADDITIVE versioned keys), the montage chip's rate
//        equals the test's own play/(budget − tails) arithmetic, and the
//        plan carries the derived opts.budgetSec.
//   17c  green: a low fixture rate derives a long budget — beats KEPT,
//        notice hidden, chip off, opts.budgetSec = the derived seconds.
//   17d  mixed-cache honesty: byteBudgetCapable forced false floors the
//        WHOLE chain (no opts.budgetSec, beats back, notice hidden) even
//        over a derivable store — the marker gate's teeth.
//   17e  the legacy whole-string wire floors: a save bridge WITHOUT the
//        chunked stream (the measured GH-256 jetsam wire) plans the 60 s
//        floor whatever the store says (review round-3 P1).
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=304budget`,
    { port: CDP + 16 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'GH-304 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '17: __playback seam');
    // the arm-15 session shape: three shots, both boundaries POV→POV
    await fire(chrome, '17: shot A', { v0: 4.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '17: shot B', { v0: 0.55, phi: Math.PI / 2 + 0.5, theta: 0, a: 0, b: 0 });
    await fire(chrome, '17: shot C', { v0: 1.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid17 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('17: session opens',
      await chrome.eval(`window.__playback.openSession(${sid17})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true', '17: player open');
    await waitFor(chrome, 'window.__test.cameraScript?.(null) === true',
      '17: camerascript rig loaded');
    await chrome.eval('window.__playback.seek(0.02)');
    check('17: pov assigned', await chrome.eval('window.__playback.setCam("pov")'));
    const st17 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.state()))');
    check('17: both boundaries carry walk beats (the degrade fixture needs '
      + 'them)', st17.beats?.[0] > 0 && st17.beats?.[1] > 0,
    JSON.stringify(st17.beats));
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '17: card open');
    check('17: CTA armed (support probed)', await ctaArmed(chrome));
    // container-agnostic: the arm derives its expectations from the
    // negotiated container (this harness may probe mp4 OR fall back to
    // webm). The governing wall is the 384 MiB WIRE envelope for BOTH
    // containers by construction: the shell stub below advertises dests
    // ['files'] only, so photosBridge() is FALSE and the transcode wall
    // can never price in (its arithmetic is pinned in e2e-export B1;
    // the plan-level Photos gating is planPhotosTranscode, review r1 P2).
    const fmt17 = (await chrome.eval('__export.tiers()')).standard;
    check('17: a standard-tier container negotiated',
      fmt17 === 'webm' || fmt17 === 'mp4', String(fmt17));
    const wall17 = 384 * 1024 * 1024;
    // worst-of(measured, configured-nominal 12 Mbps + audio) against
    // min(wire wall × safety, the ruled 300 MB file acceptance) — the
    // engine's rounds-5+7 wall-rate law, replicated
    const NOM17 = 12e6 / 8 + 16000;
    const budOf = (Bps) => Math.max(1,
      Math.floor(Math.min(wall17 * 0.85, 300e6) / Math.max(Bps, NOM17)));
    const reopenCard = async (tag) => {
      // the budget snapshot is PER CARD (paint/press law): out-of-band
      // store writes are deliberately invisible to an open card, so each
      // fixture change re-opens it exactly like a user would
      await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-close").click()');
      await cardNodeGone(chrome, tag);
      await chrome.eval('window.__playback.save()');
      await waitFor(chrome, 'window.__playback.cardOpen() === true',
        `${tag}: card reopened`);
      await ctaArmed(chrome);
      await chrome.eval(`window.__playback.setTrim(0, ${st17.total})`);
    };
    // ---- 17a: the honest floor (store forcibly absent) ------------------------
    await chrome.eval(`localStorage.removeItem('ob-export-bps-v1')`);
    const floorSeam = await chrome.eval(
      `__export.exportBudget({ tier: 'standard', height: 1080, photos: true })`);
    check('17a: seam floors at EXACTLY 60 s, derived:false',
      floorSeam?.sec === 60 && floorSeam.derived === false,
      JSON.stringify(floorSeam));
    const planFloor = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('17a: floor plan carries NO opts.budgetSec (pre-304 byte shape) '
      + 'and keeps both walk beats',
    planFloor.opts.budgetSec === undefined
      && planFloor.opts.beats?.[0]?.beatSec > 0
      && planFloor.opts.beats?.[1]?.beatSec > 0,
    JSON.stringify({ budgetSec: planFloor.opts.budgetSec,
      beats: planFloor.opts.beats?.map((w) => w?.beatSec ?? null) }));
    check('17a: no amber notice at the floor (nothing degrades)',
      await chrome.eval(`document.querySelector('#ob-pb-card .ob-pb-beatwarn')
        ?.classList.contains('on') === false`));
    // ---- 17b: derived budget degrades the beats + mirrors byte-agree ----------
    // files-only shell stub (photosBridge FALSE → wire wall, both
    // containers). Bps at the 64 MB/s sanity ceiling derives the SMALLEST
    // reachable wire budget: floor(min(384 MiB · 0.85, 300e6) / 64e6)
    // = 4 s. Both walks sum ~5.5 s of beats, so the sweep MUST degrade at
    // least the second walk; the expected kept/degraded pattern is
    // REPLICATED from the documented first-fit arithmetic over the
    // builder's own beatSec outputs. The card REOPENS after the fixture
    // lands (the snapshot law), exactly as a user re-entering the save
    // flow would.
    const bTight = budOf(64e6);
    await chrome.eval(`(() => {
      window.webkit = { messageHandlers: {
        obSaveVideoStream: { postMessage: () => Promise.resolve({ ok: true }) },
      } };
      window.__obSaveVideo = { v: 1, chunk: 786432, dests: ['files'] };
      localStorage.setItem('ob-export-bps-v1',
        JSON.stringify({ '${fmt17}:1080': { Bps: 64e6, n: 2 } }));
      return true; })()`);
    await reopenCard('17b');
    // the first-fit sweep, replicated (exportBeats' documented arithmetic)
    const costs17 = [Math.round(st17.beats[0] * 60), Math.round(st17.beats[1] * 60)];
    const budgetF17 = bTight * 60 - 30 - Math.max(60, 3);
    const kept17 = [];
    {
      let spent = 0, later = 2 * 15;
      for (let j = 0; j < 2; j++) {
        later -= 15;
        if (spent + costs17[j] + later <= budgetF17) {
          kept17.push(true);
          spent += costs17[j];
        } else { kept17.push(false); spent += 15; }
      }
    }
    const deg17 = kept17.filter((x) => !x).length;
    check('17b: the tight derived budget really degrades (the arm\'s teeth '
      + '— both walks cannot fit)', deg17 >= 1,
    JSON.stringify({ bTight, budgetF17, costs17, kept17 }));
    const plan17 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check(`17b: the plan carries the derived opts.budgetSec = ${bTight} `
      + '(fixed at plan time, renderDrill\'s cap input)',
    plan17.opts.budgetSec === bTight, JSON.stringify(plan17.opts.budgetSec));
    const planBeats17 = plan17.opts.beats?.map((w) => w?.beatSec ?? null)
      ?? [null, null, null];
    check('17b: the plan\'s beat schedule matches the replicated first-fit '
      + 'degrade (degraded boundaries null, kept ones intact)',
    [0, 1].every((j) => (kept17[j]
      ? Math.abs(planBeats17[j] - st17.beats[j]) < 1e-12
      : planBeats17[j] === null))
      && (kept17.some(Boolean) ? plan17.opts.beats?.length === 3
        : plan17.opts.beats === undefined),
    JSON.stringify({ planBeats17, kept17 }));
    const note17 = await chrome.eval(`(() => {
      const el = document.querySelector('#ob-pb-card .ob-pb-beatwarn');
      return { on: el?.classList.contains('on'), text: el?.textContent ?? '' };
    })()`);
    const wantNote = await chrome.eval(`window.__i18n.t(
      ${JSON.stringify(deg17 === 1 ? 'playback.walkCutsOneDur' : 'playback.walkCutsDur')},
      { n: ${deg17}, sec: ${bTight},
        dur: window.__i18n.t('playback.durSec', { s: ${bTight} }) })`);
    check('17b: the amber notice states the DERIVED length through {dur}',
      note17.on === true && note17.text === wantNote,
      JSON.stringify({ note17, wantNote }));
    // mirrors byte-agree: the chip's montage rate must equal the test's own
    // arithmetic over the builder's outputs — play = Σ kernel durs at 1×,
    // tails = FINAL 0.5 + per boundary (kept beatSec | degraded 0.25),
    // rate = play/(budget − tails), .toFixed(1) — plannedMontage verbatim
    const play17 = st17.durs.reduce((a, b) => a + b, 0);
    let tails17 = 0.5;
    for (let j = 0; j < 2; j++) tails17 += kept17[j] ? st17.beats[j] : 0.25;
    const wantRate = (play17 / (bTight - tails17)).toFixed(1);
    const chip17 = await chrome.eval(`(() => {
      const el = document.querySelector('.ob-pb-montage');
      return { on: el?.classList.contains('on'), text: el?.textContent ?? '' };
    })()`);
    const wantChip = await chrome.eval(`window.__i18n.t('playback.montageDur',
      { rate: '${wantRate}', sec: ${bTight},
        dur: window.__i18n.t('playback.durSec', { s: ${bTight} }) })`);
    check('17b: the montage chip byte-agrees with the builder '
      + `(rate = play/(budget − tails) over the derived ${bTight} s)`,
    chip17.on === true && chip17.text === wantChip,
    JSON.stringify({ chip17, wantChip, play17, tails17 }));
    const qline17 = await chrome.eval(
      `document.querySelector('#ob-pb-card .ob-pb-quality span')?.textContent ?? ''`);
    const wantQline = await chrome.eval(`window.__i18n.t('playback.qualityMontage',
      { rate: '${wantRate}' }) + ' · ' + window.__i18n.t('playback.qualityLine',
      { sec: ${bTight}, res: '1080p' })`);
    check('17b: the quality line clamps the promised length to the derived '
      + 'budget', qline17 === wantQline,
    JSON.stringify({ qline17, wantQline }));
    // ---- 17c: green — a long derived budget keeps the beats -------------------
    const bLong = budOf(1.2e6); // 197 s — the nominal 12 Mbps rate + the
    // 300 MB file acceptance govern (a low measured sample cannot loosen
    // the walls past them)
    await chrome.eval(`localStorage.setItem('ob-export-bps-v1',
      JSON.stringify({ '${fmt17}:1080': { Bps: 1.2e6, n: 2 } }))`);
    await reopenCard('17c');
    const plan17c = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check(`17c: long derived budget (${bLong} s) — beats KEPT, plan carries it`,
      plan17c.opts.budgetSec === bLong
      && plan17c.opts.beats?.[0]?.beatSec > 0
      && plan17c.opts.beats?.[1]?.beatSec > 0,
    JSON.stringify({ budgetSec: plan17c.opts.budgetSec,
      beats: plan17c.opts.beats?.map((w) => w?.beatSec ?? null) }));
    check('17c: notice hidden, chip off (nothing degrades, nothing montages)',
      await chrome.eval(`document.querySelector('#ob-pb-card .ob-pb-beatwarn')
        ?.classList.contains('on') === false`)
      && await chrome.eval(`document.querySelector('.ob-pb-montage')
        ?.classList.contains('on') === false`));
    // ---- 17d: the marker gate's teeth (mixed-cache honesty) -------------------
    await chrome.eval(`(() => {
      window.__pbRealBudgetCap = window.__export.byteBudgetCapable;
      window.__export.byteBudgetCapable = false;
      return true; })()`);
    await chrome.eval(`window.__playback.setTrim(0, ${st17.total})`);
    const plan17d = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('17d: byteBudgetCapable=false floors the WHOLE chain over a '
      + 'derivable store (no opts.budgetSec, beats back at the 60 s floor)',
    plan17d.opts.budgetSec === undefined
      && plan17d.opts.beats?.[0]?.beatSec > 0
      && await chrome.eval(`document.querySelector('#ob-pb-card .ob-pb-beatwarn')
        ?.classList.contains('on') === false`),
    JSON.stringify({ budgetSec: plan17d.opts.budgetSec,
      beats: plan17d.opts.beats?.map((w) => w?.beatSec ?? null) }));
    await chrome.eval(`(() => {
      window.__export.byteBudgetCapable = window.__pbRealBudgetCap;
      delete window.__pbRealBudgetCap;
      return true; })()`);
    // ---- 17e: the legacy whole-string wire floors (review round-3 P1) ----------
    // A save bridge WITHOUT the chunked stream (no __obSaveVideo chunk
    // hint) delivers through the v1 base64 postMessage — the measured
    // jetsam wire; a derived budget must never grow clips toward the
    // walls there, whatever the calibration store says.
    await chrome.eval(`(() => {
      window.webkit = { messageHandlers: {
        obSaveVideo: { postMessage: () => {} },
      } };
      delete window.__obSaveVideo; // hint gone → streamBridge() === null
      localStorage.setItem('ob-export-bps-v1',
        JSON.stringify({ '${fmt17}:1080': { Bps: 1.2e6, n: 2 } }));
      return true; })()`);
    await reopenCard('17e');
    const plan17e = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('17e: a legacy whole-string wire (save bridge, no chunked stream) '
      + 'floors the plan — no opts.budgetSec over a derivable store, beats '
      + 'kept at the 60 s floor',
    plan17e.opts.budgetSec === undefined
      && plan17e.opts.beats?.[0]?.beatSec > 0
      && plan17e.opts.beats?.[1]?.beatSec > 0,
    JSON.stringify({ budgetSec: plan17e.opts.budgetSec,
      beats: plan17e.opts.beats?.map((w) => w?.beatSec ?? null) }));
    await chrome.eval(`localStorage.removeItem('ob-export-bps-v1')`);
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '17');
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErr17 = await chrome.eval('__test.errors.slice()');
    check('17: zero app errors', appErr17.length === 0, JSON.stringify(appErr17));
    check('17: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 18: GH-302 — a DECODED share camera plan drives the strip -----------
// A shared replay carrying `&cp=` (the sibling-param codec) seeds the DVR
// player of THE SESSION IT DESCRIBES once it stages (content-addressed by
// record bytes — here the author's persisted original session, reopened
// from the link after the in-memory camLatch died with the page): the
// strip paints the author's plan (blocks + the fade seam glyph), cameraAt
// drives the RENDERED pose across the mid-segment cut, the fade alpha
// rides the author's window, state().cams derives the boundary view — and
// DVR user state WINS on reopen (an edited plan latches over the decoded
// one).
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=6&archive=1&arm=302a`,
    { port: CDP + 17 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'GH-302 author boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '18: __playback seam');
    await fire(chrome, '18: shot A', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '18: shot B', { v0: 1.1, phi: -Math.PI / 2 + 0.4, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sidA = await chrome.eval('window.__archive.current()');
    check('18: author session opens',
      await chrome.eval(`window.__playback.openSession(${sidA})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '18: author player open');
    // broadcast head → CLOSE at 0.8 (mid-segment compiled cut) → fade
    // into OVERHEAD at the (1, 0) boundary → custom tripod at (1, 0.6)
    check('18: author plan accepted', await chrome.eval(
      `window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0,   cam: 0, transitionIn: 0, dur: 0 },
        { seg: 0, t: 0.8, cam: 5, transitionIn: 0, dur: 0 },
        { seg: 1, t: 0,   cam: 3, transitionIn: 2, dur: 1.0 },
        { seg: 1, t: 0.6, cam: 8, transitionIn: 0, dur: 0 },
      ], poses: [
        { slot: 0, eye: [-1234, 2210, 1600], look: [120, -85, 30], fov: 600 },
      ] })`) === true);
    const plan18 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.getCutPlan()))');
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const url18 = await chrome.eval('__share.encode()');
    check('18: the link carries the sibling &cp= param',
      /#r=[A-Za-z0-9_-]+&cp=[A-Za-z0-9_-]+$/.test(url18), url18);

    // ---- the link lane: a fresh query forces the FULL navigation — the
    // in-memory camLatch (which held the plan) dies with the page while
    // the author's original session persists in IndexedDB; the decoded
    // &cp= plan then seeds THAT session's player (content-addressed —
    // shared-replay passes themselves never archive, the Phase-A law).
    await chrome.send('Page.navigate',
      { url: url18.replace('arm=302a', 'arm=302b') });
    await waitReady(chrome, 'GH-302 link boot');
    await waitFor(chrome, 'window.__share?.replay?.().done === true',
      '18: shared replay finished', 150, 400);
    check('18: the decoded plan rode in beside the replay',
      await chrome.eval(`(() => { const p = window.__share.replay().plan;
        return !!p && p.cuts === 4 && p.poses === 1; })()`));
    check('18: content-matched session opens', await chrome.eval(
      `window.__playback.openSession(${sidA})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '18: viewer player open');
    await waitFor(chrome, 'window.__playback.strip()?.mounted() === true',
      '18: strip editor mounted');
    await sleep(400);

    // the decoded plan IS the model — byte-equal on the #301 integers
    const got18 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.getCutPlan()))');
    check('18: decoded plan byte-equals the author\'s integer model',
      JSON.stringify(got18) === JSON.stringify(plan18),
      JSON.stringify(got18));

    // …and DRIVES the strip + the read law + the render
    const view18 = await chrome.eval(`(() => {
      const st = window.__playback.state();
      const pose = () => { const c = window.__dbg.camera;
        return [...c.matrixWorld.elements, c.fov].join(','); };
      window.__playback.seek(0.4);  const pA = pose();
      window.__playback.seek(0.9);  const pB = pose();
      window.__playback.seek(1.15); const pB2 = pose();
      return {
        durs0: st.durs[0],
        cams: st.cams,
        blocks: document.querySelectorAll('.ob-pb-strip-block').length,
        fadeGlyph: document.querySelector(
          '.ob-pb-strip-seam[data-seam="2"] .ob-pb-strip-g')?.textContent,
        cutSwitches: pA !== pB, closeHolds: pB === pB2,
        fadeAtCut: window.__playback.fadeAlphaAt(st.cum[1]),
        fadeOutside: window.__playback.fadeAlphaAt(st.cum[1] - 0.51),
      }; })()`);
    check('18: seg-0 probes sit inside the segment (recipe guard)',
      view18.durs0 > 1.3, JSON.stringify(view18.durs0));
    check('18: the strip paints the author\'s plan (4 blocks, ◆ fade seam) '
      + 'and state().cams derives the boundary view',
    view18.blocks === 4 && view18.fadeGlyph === '◆'
      && JSON.stringify(view18.cams) === '["broadcast","overhead"]',
    JSON.stringify(view18));
    check('18: cameraAt drives the RENDERED pose — the 0.8 s mid-segment '
      + 'cut switches the camera and the CLOSE span holds byte-stable',
    view18.cutSwitches === true && view18.closeHolds === true,
    JSON.stringify(view18));
    // GH-864 F1: the ext-inclusive clock prices a completion overhang like play (1/speed), so this probe reads the alpha it read before.
    check('18: the fade rides the author\'s window (alpha 1 at the cut '
      + 'instant, 0 outside)', view18.fadeAtCut === 1 && view18.fadeOutside === 0,
    JSON.stringify([view18.fadeAtCut, view18.fadeOutside]));

    // ---- DVR user state WINS on reopen: an edit latches over the decoded
    // plan (the camLatch guard — the decoded plan seeds ONLY latch-less
    // sessions)
    check('18: viewer edit accepted', await chrome.eval(
      `window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 4, transitionIn: 0, dur: 0 }], poses: [] })`) === true);
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    check('18: reopen keeps the EDIT', await chrome.eval(
      `window.__playback.openSession(${sidA})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '18: viewer player reopen');
    const edited18 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.getCutPlan()))');
    check('18: the viewer\'s edit latched OVER the decoded plan (user '
      + 'state wins)', edited18.cuts.length === 1 && edited18.cuts[0].cam === 4
      && edited18.poses.length === 0, JSON.stringify(edited18));
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErr18 = await chrome.eval('__test.errors.slice()');
    check('18: zero app errors', appErr18.length === 0, JSON.stringify(appErr18));
    check('18: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 19: GH-314 (renumbered from 18 at the feat-302 rebase) IMMERSIVE CONSOLE — the 3-state overlay machine ----------
// hidden / shown-transient / pinned (see the header map). The renderer-size
// fingerprint is the arm's spine: canvas backing-store px + CSS rect +
// pixel ratio, sampled at every state edge and required byte-identical —
// the video NEVER resizes (contract C).
const RENDERER_FP = `(() => {
  const r = window.__dbg?.renderer;
  if (!r) return 'no-renderer';
  const c = r.domElement;
  const b = c.getBoundingClientRect();
  return [c.width, c.height, b.x, b.y, b.width, b.height,
    typeof r.getPixelRatio === 'function' ? r.getPixelRatio() : '?'].join('|');
})()`;
const UI_STATE = 'window.__playback.ui()?.state';
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=314console`,
    { port: CDP + 18 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'GH-314 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '19: __playback seam');
    // the arm-15/16/17 corpus shape: three shots, POV-able boundaries
    await fire(chrome, '19: shot A', { v0: 4.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '19: shot B', { v0: 0.55, phi: Math.PI / 2 + 0.5, theta: 0, a: 0, b: 0 });
    await fire(chrome, '19: shot C', { v0: 1.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid19 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('19: session opens',
      await chrome.eval(`window.__playback.openSession(${sid19})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true', '19: player open');
    await waitFor(chrome, 'window.__playback.strip()?.mounted() === true',
      '19: strip editor mounted');
    const fp0 = await chrome.eval(RENDERER_FP);
    check('19: renderer fingerprint readable', !/^no-/.test(fp0), fp0);

    // ---- 19a: opens PINNED (paused pin); the strip rests as the sliver ------
    const ui0 = await chrome.eval('JSON.parse(JSON.stringify(window.__playback.ui()))');
    check('19a: the player opens PINNED on the paused pin',
      ui0?.state === 'pinned' && ui0.pins?.paused === true, JSON.stringify(ui0));
    check('19a: D-lite — the strip rests as the sliver (collapsed default, '
      + 'toggle present, aria says expand)', await chrome.eval(`(() => {
      const lane = document.querySelector('.ob-pb-strip');
      const tg = document.querySelector('.ob-pb-strip-toggle');
      return window.__playback.strip().expanded() === false
        && lane?.classList.contains('ob-pb-strip--sliver') === true
        && tg?.getAttribute('aria-expanded') === 'false'; })()`));

    // ---- 19b: sliver ↔ expanded is VISUAL-ONLY (hit rects byte-identical) ---
    check('19b: working plan accepted', await chrome.eval(
      `window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
        { seg: 1, t: 0, cam: 3, transitionIn: 2, dur: 2.0 },
        { seg: 2, t: 0, cam: 5, transitionIn: 0, dur: 0 } ], poses: [] })`));
    check('19b: a wholesale plan RESTORE (setCutPlan — the GH-302 decoded '
      + 'seed\'s vehicle) keeps the resting sliver: a share viewer opens on '
      + 'the quiet register, never an expanded editor',
    await chrome.eval('window.__playback.strip().expanded() === false'));
    check('19b: a USER edit while paused (setCam → writeCut) auto-expands '
      + 'the sliver — an edit reveals the surface it wrote into',
    await chrome.eval(`(() => {
      window.__playback.setCam('overhead');
      return window.__playback.strip().expanded() === true; })()`));
    const stripRects = `JSON.stringify([...document.querySelectorAll(
      '.ob-pb-strip-block, .ob-pb-strip-seam')].map((el) => {
        const r = el.getBoundingClientRect();
        return [el.className.split(' ')[0], el.dataset.cut ?? el.dataset.seam ?? '',
          r.x, r.y, r.width, r.height]; }))`;
    const rectsExpanded = await chrome.eval(stripRects);
    await chrome.eval('window.__playback.strip().setExpanded(false)');
    const rectsSliver = await chrome.eval(stripRects);
    check('19b: every block/seam HIT RECT is byte-identical between the '
      + 'sliver and the expanded lane (the sliver is paint, never geometry)',
    rectsExpanded === rectsSliver && rectsExpanded.includes('ob-pb-strip-seam'),
    `expanded=${rectsExpanded} sliver=${rectsSliver}`);
    check('19b: the sliver paints the thin bar off the token (block ::before '
      + 'at --ob-pb-strip-sliver) while the lane box holds its height',
    await chrome.eval(`(() => {
      const b = document.querySelector('.ob-pb-strip-block');
      const lane = document.querySelector('.ob-pb-strip');
      const bar = getComputedStyle(b, '::before');
      const want = getComputedStyle(lane).getPropertyValue('--ob-pb-strip-sliver')
        .trim() || '4px';
      return bar.height === want
        && lane.getBoundingClientRect().height >= 10; })()`));

    // ---- 19c: play → shown; the RENDER-CLOCK timer hides at ~3 s ------------
    await realClick(chrome, '.ob-pb-play', '19c: play');
    check('19c: playing → the paused pin releases into the re-armed '
      + 'transient (shown)', await chrome.eval(
      `window.__playback.state()?.playing === true && ${UI_STATE} === 'shown'`));
    check('19c: still shown before the deadline (timer is ~3 s, not instant)',
      await chrome.eval(`${UI_STATE} === 'shown'`));
    await chrome.eval('window.__playback.setSpeed(0.25)'); // outlast the timer
    const hid = await waitFor(chrome,
      `${UI_STATE} === 'hidden' && window.__playback.state()?.playing === true`,
      '19c: auto-hide while still playing', 40, 200);
    if (hid) {
      check('19c: auto-hide landed while PLAYING (state 1: nothing covers '
        + 'the video)', true);
    }
    // GH-313 (GH-318 residual C5.2): wait for the hide transition END by
    // polling the computed style — the old fixed 400 ms sleep let the
    // hit-test probe MID-opacity-fade on a starved compositor (visibility
    // flips only at transition end, so the probe still hit the shelf)
    await waitFor(chrome, `(() => {
      const cs = getComputedStyle(document.querySelector('.ob-pb-shelf'));
      return cs.opacity === '0' && cs.visibility === 'hidden'; })()`,
    '19c: hide transition settled', 60, 200);
    check('19c: hidden = shelf opacity 0 + visibility hidden, and the hit '
      + 'test at the shelf center falls through to the BED',
    await chrome.eval(`(() => {
      const sh = document.querySelector('.ob-pb-shelf');
      const cs = getComputedStyle(sh);
      const r = sh.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return cs.opacity === '0' && cs.visibility === 'hidden'
        && !document.getElementById('ob-pb-player').contains(hit); })()`));
    const fpHidden = await chrome.eval(RENDERER_FP);
    check('19c: renderer size BYTE-CONSTANT across pinned→shown→hidden '
      + '(the video never resizes)', fpHidden === fp0,
    `open=${fp0} hidden=${fpHidden}`);

    // ---- 19d: a REAL bed tap reveals and NEVER toggles play ------------------
    // dispatched AT THE PLAY BUTTON's own viewport coordinates — the exact
    // hazard: the control materializes under the finger on reveal, and the
    // tap's click must be eaten, not delivered to it.
    const playPt = await centerOf(chrome, '.ob-pb-play');
    check('19d: play button rect resolvable while hidden', !!playPt);
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: playPt.x, y: playPt.y, button: 'left', buttons: 1, clickCount: 1 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: playPt.x, y: playPt.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(150);
    check('19d: the bed tap REVEALED (shown) and play kept running — the '
      + 'reveal tap is consumed, never a play/pause toggle (build-15 bed '
      + 'taps did nothing; that no-op is preserved)',
    await chrome.eval(`${UI_STATE} === 'shown'
      && window.__playback.state()?.playing === true`));
    // a second MOUSE bed tap while SHOWN is a NO-OP since the owner
    // amendment (QuickTime semantics): motion re-reveals instantly, so a
    // mouse dismiss-click would be self-defeating — desktop dismissal is
    // the idle timer or pointer-leave (arm 19i). Touch keeps the shipped
    // tap-dismiss (arm 19h).
    const bedPt = { x: 640, y: 260 }; // canvas center-field, clear of chrome
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: bedPt.x, y: bedPt.y, button: 'left', buttons: 1, clickCount: 1 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: bedPt.x, y: bedPt.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(150);
    check('19d: a second MOUSE bed tap while shown is a NO-OP (owner '
      + 'amendment) — still shown, still playing, still no toggle',
    await chrome.eval(
      `${UI_STATE} === 'shown' && window.__playback.state()?.playing === true`));
    // park hidden for the keydown leg via the amendment's LEAVE path
    // (documentElement mouseleave — the OS signal headless input cannot
    // produce, driven as a page event; the listener is trust-agnostic)
    await chrome.eval(`document.documentElement.dispatchEvent(
      new MouseEvent('mouseleave')); true`);
    // GH-313 C5.2: 60x200 (was 20x100) — the leave-hide rides a 0.3 s
    // render-clock grace + idle timers that overrun a starved compositor
    await waitFor(chrome, `${UI_STATE} === 'hidden'`,
      '19d: leave-hide parks the console', 60, 200);
    const fpTap = await chrome.eval(RENDERER_FP);
    check('19d: renderer size constant across reveal/no-op-tap/leave-hide',
      fpTap === fp0, `open=${fp0} tap=${fpTap}`);
    // keyboard reveal (a11y): hidden chrome leaves the focus order, so a
    // keydown must re-arm the transient — pure observer, key not consumed
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown',
      key: 'ArrowRight', code: 'ArrowRight',
      windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp',
      key: 'ArrowRight', code: 'ArrowRight',
      windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    await sleep(120);
    check('19d: a keydown reveals for keyboard users (still playing)',
      await chrome.eval(`${UI_STATE} === 'shown'
        && window.__playback.state()?.playing === true`));
    // park back hidden for the pins battery below (the leave path again —
    // a mouse tap no longer dismisses per the owner amendment)
    await chrome.eval(`document.documentElement.dispatchEvent(
      new MouseEvent('mouseleave')); true`);
    await waitFor(chrome, `${UI_STATE} === 'hidden'`,
      '19d: leave-hide parks the console again', 60, 200); // GH-313 C5.2

    // ---- 19e: EVERY pin condition holds the overlay --------------------------
    const pinsAt = 'JSON.parse(JSON.stringify(window.__playback.ui()))';
    // (paused) reveal, then a REAL pause press
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: bedPt.x, y: bedPt.y, button: 'left', buttons: 1, clickCount: 1 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: bedPt.x, y: bedPt.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(400); // reveal transition in — the control must be pressable
    await realClick(chrome, '.ob-pb-play', '19e: pause');
    await sleep(100);
    const uiPaused = await chrome.eval(pinsAt);
    check('19e: PAUSED pins', uiPaused?.state === 'pinned'
      && uiPaused.pins?.paused === true, JSON.stringify(uiPaused));
    // (scrub) REAL held drag on the track body
    const trackPt = await centerOf(chrome, '.ob-pb-track');
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: trackPt.x, y: trackPt.y, button: 'left', buttons: 1, clickCount: 1 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved',
      x: trackPt.x + 30, y: trackPt.y, buttons: 1 });
    await sleep(100);
    const uiScrub = await chrome.eval(pinsAt);
    check('19e: SCRUB DRAG pins (mid-hold)', uiScrub?.state === 'pinned'
      && uiScrub.pins?.scrub === true && uiScrub.pins?.hold === true,
    JSON.stringify(uiScrub));
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: trackPt.x + 30, y: trackPt.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(100);
    check('19e: scrub release clears the drag pin', await chrome.eval(
      `window.__playback.ui().pins.scrub === false
       && window.__playback.ui().pins.hold === false`));
    // (trim) REAL held drag on the IN handle
    const hInPt = await chrome.eval(`(() => {
      const h = document.querySelectorAll('.ob-pb-handle')[0];
      const r = h.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: hInPt.x, y: hInPt.y, button: 'left', buttons: 1, clickCount: 1 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved',
      x: hInPt.x + 12, y: hInPt.y, buttons: 1 });
    await sleep(100);
    const uiTrim = await chrome.eval(pinsAt);
    check('19e: TRIM-HANDLE DRAG pins (mid-hold)', uiTrim?.state === 'pinned'
      && uiTrim.pins?.trim === true, JSON.stringify(uiTrim));
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: hInPt.x + 12, y: hInPt.y, button: 'left', buttons: 0, clickCount: 1 });
    await chrome.eval(`window.__playback.setTrim(0, window.__playback.state().total)`);
    // (strip expanded) — pins THROUGH play and blocks the render-clock timer
    await realClick(chrome, '.ob-pb-strip-toggle', '19e: expand strip');
    await sleep(80);
    check('19e: the toggle expanded the strip (aria follows)',
      await chrome.eval(`window.__playback.strip().expanded() === true
        && document.querySelector('.ob-pb-strip-toggle')
          ?.getAttribute('aria-expanded') === 'true'`));
    await realClick(chrome, '.ob-pb-play', '19e: play with strip expanded');
    await sleep(3600); // well past UI_HIDE_SEC on the render clock
    const uiStrip = await chrome.eval(pinsAt);
    check('19e: STRIP EXPANDED pins through play — the timer never hides an '
      + 'open editing surface', uiStrip?.state === 'pinned'
      && uiStrip.pins?.strip === true
      && await chrome.eval('window.__playback.state()?.playing === true'),
    JSON.stringify(uiStrip));
    await realClick(chrome, '.ob-pb-strip-toggle', '19e: collapse strip');
    await sleep(120);
    check('19e: collapse releases into the re-armed transient (shown), '
      + 'then the timer hides again', await chrome.eval(
      `${UI_STATE} === 'shown'`)
      && await waitFor(chrome, `${UI_STATE} === 'hidden'`,
        '19e: post-collapse auto-hide', 40, 200));
    // reveal FIRST (the play button is invisible mid-hidden), then pause
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: bedPt.x, y: bedPt.y, button: 'left', buttons: 1, clickCount: 1 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: bedPt.x, y: bedPt.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(400);
    await realClick(chrome, '.ob-pb-play', '19e: pause for the popover legs');
    await waitFor(chrome, 'window.__playback.state()?.playing === false',
      '19e: paused for popover legs');
    // (transition picker open)
    await chrome.eval('window.__playback.strip().openTransPicker(1)');
    await sleep(80);
    const uiPick = await chrome.eval(pinsAt);
    check('19e: TRANSITION PICKER pins', uiPick?.pins?.picker === true
      && uiPick.state === 'pinned', JSON.stringify(uiPick));
    // a bare closePop() would leave the SEAM SELECTION live — a lingering
    // selection is an editing engagement and correctly pins forever (the
    // stripEngage pin); a real user's tap-away clears it via onDocDown, so
    // the arm dismisses the same way (closePop + select(null))
    check('19e: a lingering seam SELECTION alone still pins (engaged)',
      await chrome.eval(`(() => {
        window.__playback.strip().closePop();
        return window.__playback.ui().pins.stripEngage === true
          && window.__playback.ui().state === 'pinned'; })()`));
    await chrome.eval('window.__playback.strip().dismiss()');
    check('19e: dismiss releases the selection pin', await chrome.eval(
      'window.__playback.ui().pins.stripEngage === false'));
    // the picker auto-EXPANDED the strip (a seam interaction is an editing
    // engagement) — collapse it as a user would, or the strip pin holds
    // 19g's play leg forever (which is the D-lite contract working)
    await chrome.eval('window.__playback.strip().setExpanded(false)');
    check('19e: collapsing the auto-expanded strip releases its pin',
      await chrome.eval('window.__playback.ui().pins.strip === false'));
    // (tripod capture latch)
    await chrome.eval('window.__playback.strip().enterCapture(0)');
    await sleep(80);
    const uiCap = await chrome.eval(pinsAt);
    check('19e: TRIPOD CAPTURE LATCH pins', uiCap?.pins?.capture === true
      && uiCap.state === 'pinned', JSON.stringify(uiCap));
    await chrome.eval('window.__playback.strip().cancelCapture()');
    // (save card open)
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '19e: card open');
    const uiCard = await chrome.eval(pinsAt);
    check('19e: SAVE CARD pins', uiCard?.pins?.card === true
      && uiCard.state === 'pinned', JSON.stringify(uiCard));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '19e');
    const fpPins = await chrome.eval(RENDERER_FP);
    check('19e: renderer size constant across every pin leg', fpPins === fp0,
      `open=${fp0} pins=${fpPins}`);

    // ---- 19f: the z-order law during a GH-301 fade ---------------------------
    // the (1,0) fade (dur 2.0) from 19b's plan: seek its anchor — alpha ~1
    const cum1 = await chrome.eval('window.__playback.state().cum[1]');
    await chrome.eval(`window.__playback.seek(${cum1})`);
    await sleep(100);
    check('19f: mid-fade — the dip layer darkens the VIDEO under the scrim '
      + 'under the controls (DOM z-law), the shelf stays opacity 1 and the '
      + 'play button is hit-testable THROUGH the dip',
    await chrome.eval(`(() => {
      const player = document.getElementById('ob-pb-player');
      const fade = document.getElementById('ob-pb-fade');
      const alpha = Number(fade?.style.opacity ?? 0);
      // the z-law generalized for GH-364: CONTENT layers under the fade
      // (only #ob-pb-strike may precede it — the burned plate sits under
      // the burned dip), then the shade scrim, then the controls
      const kids = [...player.children];
      const fi = kids.indexOf(fade);
      const order = fi >= 0
        && kids.slice(0, fi).every((el) => el.id === 'ob-pb-strike')
        && kids[fi + 1]?.classList.contains('ob-pb-shade');
      const sh = document.querySelector('.ob-pb-shelf');
      const play = document.querySelector('.ob-pb-play');
      const r = play.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return alpha > 0.9 && order
        && getComputedStyle(sh).opacity === '1'
        && (play === hit || play.contains(hit)); })()`));
    // GH-864 F1: the ext-inclusive clock prices a completion overhang like play (1/speed), so this probe reads the alpha it read before.
    check('19f: the seam answers the same alpha (fadeAlphaAt ~1 at the anchor)',
      await chrome.eval(`window.__playback.fadeAlphaAt(${cum1}) > 0.9`));

    // ---- 19g: the degrade red-proof ------------------------------------------
    // (i) the hide mechanism is 100% [data-ui]-CSS-keyed: the module writes
    // NO inline opacity/visibility/hidden on the chrome children — so a
    // stale cached playback.css (no v27 rules) simply never hides anything
    // and the user keeps the full build-15 static console.
    await realClick(chrome, '.ob-pb-play', '19g: play');
    await waitFor(chrome, `${UI_STATE} === 'hidden'`, '19g: hidden again', 40, 200);
    check('19g: hidden state carries ZERO inline hiding on the chrome '
      + '(pure [data-ui] CSS — the stale-sheet pairing degrades to the '
      + 'build-15 static console by construction)',
    await chrome.eval(`(() => {
      const kids = [...document.getElementById('ob-pb-player').children]
        .filter((el) => el.id !== 'ob-pb-fade');
      return kids.length >= 3 && kids.every((el) => el.style.opacity === ''
        && el.style.visibility === '' && el.style.display === ''
        && !el.hasAttribute('hidden')); })()`));
    // (ii) the stale-MODULE simulation: no [data-ui] attribute at all (a
    // pre-314 playback.js never writes one) must paint the full console.
    // Pause FIRST — while playing, the fresh module's render-clock syncUi
    // re-takes the attribute on the very next frame (the machine working);
    // a stale module has no such writer, so the honest simulation removes
    // the attribute with the loop stood down.
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: bedPt.x, y: bedPt.y, button: 'left', buttons: 1, clickCount: 1 });
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: bedPt.x, y: bedPt.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(400);
    await realClick(chrome, '.ob-pb-play', '19g: pause (loop stands down)');
    await waitFor(chrome, 'window.__playback.state()?.playing === false',
      '19g: paused for the stale-module simulation');
    await chrome.eval(`(() => {
      document.getElementById('ob-pb-player').removeAttribute('data-ui');
      return true; })()`);
    await sleep(400);
    check('19g: with the attribute ABSENT the console is fully painted and '
      + 'pressable (the stale-module register is the build-15 console — the '
      + '[data-ui="hidden"] rule is the ONLY hide path in the sheet)',
    await chrome.eval(`(() => {
      const sh = document.querySelector('.ob-pb-shelf');
      const cs = getComputedStyle(sh);
      const play = document.querySelector('.ob-pb-play');
      const r = play.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return cs.opacity === '1' && cs.visibility === 'visible'
        && (play === hit || play.contains(hit)); })()`));
    // the machine re-takes the attribute on its next discrete write (belt)
    await realClick(chrome, '.ob-pb-play', '19g: resume re-takes the attribute');
    await sleep(150);
    check('19g: the next syncUi write restores the attribute (the re-armed '
      + 'transient)', await chrome.eval(`${UI_STATE} === 'shown'`));
    // (iii) the stale-STRIP pairing (review r1 P2): a mounted pre-314 strip
    // has no expanded/engaged seams — the machine must read it as
    // EXPANDED (the build-15 static console), never auto-hide under its
    // orphanable body-level hint. Simulated by deleting the seams off the
    // live object; restored right after.
    check('19g: a mounted strip WITHOUT the 314 seams reads as EXPANDED '
      + '(the stale-strip pairing = the build-15 static console)',
    await chrome.eval(`(() => {
      const s = window.__playback.strip();
      window.__pb314 = { expanded: s.expanded, engaged: s.engaged };
      delete s.expanded;
      delete s.engaged;
      return window.__playback.ui().pins.strip === true; })()`));
    // the DATASET follows on the next render-clock sync, not inside the
    // same synchronous eval (review r2 P1) — playback is running here, so
    // the play loop's per-frame syncUi picks the pin up within a frame
    await sleep(200);
    check('19g: …and the machine pins on the next render-clock sync',
      await chrome.eval(`${UI_STATE} === 'pinned'`));
    check('19g: restoring the seams releases the stale-strip pin '
      + '(collapsed lane again)', await chrome.eval(`(() => {
      Object.assign(window.__playback.strip(), window.__pb314);
      delete window.__pb314;
      return window.__playback.ui().pins.strip === false; })()`));

    // ---- 19i: the OWNER AMENDMENT — QuickTime pointer semantics (desktop) ---
    // Mouse MOTION reveals (and re-arms the idle clock); the mouse LEAVING
    // the document hides after the 0.3 s render-clock grace unless pinned;
    // the 3 s idle-hide still rules a RESTING pointer; pins trump leave.
    // The leave signal is driven as a page MouseEvent('mouseleave') on
    // documentElement — the OS-level exit no headless synthetic input can
    // produce; reveals and grace-cancels use REAL mouse moves.
    const bedLeave = () => chrome.eval(
      `document.documentElement.dispatchEvent(new MouseEvent('mouseleave')); true`);
    const bedMove = (x, y) => chrome.send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x, y, buttons: 0 });
    await chrome.eval('window.__playback.seek(1); true'); // headroom
    await waitFor(chrome, `${UI_STATE} === 'hidden'
      && window.__playback.state()?.playing === true`, '19i: parked hidden', 40, 200);
    await bedMove(500, 300);
    await sleep(120);
    check('19i: a REAL mouse move REVEALS — motion is the desktop signal '
      + '(still playing, nothing toggled)', await chrome.eval(
      `${UI_STATE} === 'shown' && window.__playback.state()?.playing === true`));
    check('19i: the idle timer still hides a RESTING pointer (~3 s render '
      + 'clock, no further input)', await waitFor(chrome,
      `${UI_STATE} === 'hidden'`, '19i: idle-hide with pointer inside', 40, 200));
    // hide-on-leave, RED-PROOFED against a no-leave control over the SAME
    // 0.6 s window: without the leave the console must still be shown
    // there (the idle timer alone cannot fire that early), with it hidden
    await bedMove(520, 300);
    await sleep(600);
    check('19i: control — 0.6 s after a reveal with NO leave the console '
      + 'is still shown (the arm\'s teeth: the early hide below can only '
      + 'come from the leave path)', await chrome.eval(`${UI_STATE} === 'shown'`));
    await bedLeave();
    check('19i: the leave GRACE holds the console for the first beat '
      + '(no edge flicker)', await chrome.eval(`${UI_STATE} === 'shown'`));
    await sleep(600);
    check('19i: hide-on-leave — gone one grace after the mouse left, '
      + 'playback untouched', await chrome.eval(
      `${UI_STATE} === 'hidden' && window.__playback.state()?.playing === true`));
    // grace-cancel: re-entry (a REAL mouse move) inside the window keeps it
    await bedMove(540, 300);
    await sleep(120);
    await bedLeave();
    await sleep(100);
    await bedMove(560, 300); // back inside before the grace expires
    await sleep(600);
    check('19i: re-entering within the grace CANCELS the leave-hide',
      await chrome.eval(`${UI_STATE} === 'shown'`));
    // pins trump leave: pause (eval click — no pointer events, so the
    // press cannot count as pointer presence), leave, wait past the grace
    await chrome.eval(`document.querySelector('.ob-pb-play').click()`);
    await waitFor(chrome, 'window.__playback.state()?.playing === false',
      '19i: paused');
    await bedLeave();
    await sleep(600);
    check('19i: a PIN outranks the leave (paused console stays past the '
      + 'grace with the mouse gone)', await chrome.eval(
      `${UI_STATE} === 'pinned'`));
    // the release with the pointer STILL OUT: resume re-arm shows the
    // transient, then the grace hides it one beat later
    // the release→transient→grace-hide sequence is sampled IN-PAGE (load
    // hardening, 2026-08-02 flake ×2): the transient lives ~one 0.3 s
    // render-clock grace, and a CDP round-trip under load could land the
    // first sample after the hide — the in-page poll shares the page's own
    // clock, so the observed ORDER is the ruled surface, unchanged.
    const rel19i = await chrome.eval(`(async () => {
      document.querySelector('.ob-pb-play').click();
      const seen = [];
      for (let i = 0; i < 60; i++) {
        const st = window.__playback.ui()?.state;
        if (!seen.length || seen[seen.length - 1] !== st) seen.push(st);
        if (st === 'hidden') break;
        await new Promise((r) => setTimeout(r, 40));
      }
      return seen;
    })()`);
    check('19i: pin release with the pointer out — the resume re-arm shows '
      + 'the transient first', Array.isArray(rel19i)
      && rel19i.includes('shown'), JSON.stringify(rel19i));
    check('19i: …then the leave grace hides it (the QuickTime release '
      + 'semantics)', rel19i?.[rel19i.length - 1] === 'hidden'
      || await waitFor(chrome, `${UI_STATE} === 'hidden'`,
        '19i: post-release grace hide', 15, 100));
    const fp19i = await chrome.eval(RENDERER_FP);
    check('19i: renderer size constant across the hover semantics', fp19i === fp0,
      `open=${fp0} hover=${fp19i}`);
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErr19 = await chrome.eval('__test.errors.slice()');
    check('19: zero app errors', appErr19.length === 0, JSON.stringify(appErr19));
    check('19: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 19h: the phone register (852x393 coarse + safe-area insets) ---------
{
  const errs = [];
  // a throwaway DESKTOP boot first (launchChrome's target finder wants an
  // http page), then metrics, then the REAL navigation — the arm-8 recipe:
  // coarse must be live BEFORE the app boots (main.js reads the media
  // query once)
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5`, { port: CDP + 19 });
  watch(chrome, errs);
  try {
    await setPhoneMetrics(chrome, { width: 852, height: 393 });
    // landscape-iPhone insets (the e2e-touch §3.1 row-1 values); the §3.11
    // top-band contract is asserted on REAL env() geometry when the
    // protocol supports the override, and on the flat register otherwise
    // (both are legal device shapes — the flat one is inset 0 everywhere).
    const SA19 = { top: 0, left: 47, right: 47, bottom: 21 };
    const saMode = await setSafeAreaInsets(chrome, SA19);
    const sa = saMode ? SA19 : { top: 0, left: 0, right: 0, bottom: 0 };
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=314phone` });
    await waitReady(chrome, '19h phone boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '19h: __playback seam');
    await fire(chrome, '19h: shot A', { v0: 4.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '19h: shot B', { v0: 1.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sidP = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('19h: session opens',
      await chrome.eval(`window.__playback.openSession(${sidP})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '19h: player open');
    await waitFor(chrome, 'window.__playback.strip()?.mounted() === true',
      '19h: strip mounted');
    const fpP0 = await chrome.eval(RENDERER_FP);
    // §3.11 safe-area geometry: the top row and the shelf carry the insets
    const geo = await chrome.eval(`(() => {
      const top = document.querySelector('.ob-pb-top').getBoundingClientRect();
      const sh = document.querySelector('.ob-pb-shelf').getBoundingClientRect();
      return { topY: top.y, topL: top.x, topR: innerWidth - top.right,
        shB: innerHeight - sh.bottom, shL: sh.x }; })()`);
    const near = (a, b) => Math.abs(a - b) <= 1.5;
    check('19h: §3.11 — the top chrome row sits at safe-top + 10 and insets '
      + 'both corners', near(geo.topY, sa.top + 10) && near(geo.topL, sa.left + 10)
      && near(geo.topR, sa.right + 10), JSON.stringify({ geo, sa, saMode }));
    check('19h: the shelf clears the home indicator (safe-bottom + 10) and '
      + 'the left inset', near(geo.shB, sa.bottom + 10) && near(geo.shL, sa.left + 10),
    JSON.stringify({ geo, sa, saMode }));
    // the toggle's coarse floor comes from the KIT's own html.ob-touch
    // --icon rule (44pt) — the 014 law, not a strip one-off
    check('19h: the strip toggle wears the kit 44pt coarse floor',
      await chrome.eval(`(() => {
        const r = document.querySelector('.ob-pb-strip-toggle')
          ?.getBoundingClientRect();
        return !!r && r.width >= 44 && r.height >= 44; })()`));
    // touch-tap reveal/dismiss on the phone register
    await chrome.eval('window.__playback.setSpeed(0.25)');
    await chrome.eval(`document.querySelector('.ob-pb-play').click()`);
    await waitFor(chrome, `${UI_STATE} === 'hidden'`
      + ' && window.__playback.state()?.playing === true',
    '19h: phone auto-hide while playing', 40, 200);
    await tap(chrome, 426, 160); // bed tap — center field, clear of chrome
    await sleep(200);
    check('19h: touch bed tap reveals without toggling play',
      await chrome.eval(`${UI_STATE} === 'shown'
        && window.__playback.state()?.playing === true`));
    await tap(chrome, 426, 160);
    await sleep(200);
    check('19h: second touch tap dismisses (still playing) — the SHIPPED '
      + 'phone semantics, byte-kept under the owner amendment',
    await chrome.eval(`${UI_STATE} === 'hidden'
        && window.__playback.state()?.playing === true`));
    // owner-amendment guard: hover is MOUSE-only — a touch drag over the
    // bed neither reveals nor dismisses (a moved press is never a tap),
    // and the phone boot never latches mouseSeen, so the hide-on-leave
    // path is structurally unarmed on this register
    await drag(chrome, { x: 426, y: 160 }, { x: 520, y: 210 });
    await sleep(200);
    check('19h: a touch DRAG never hover-reveals (mouse-only semantics) '
      + 'and mouseSeen stays unlatched on the phone register',
    await chrome.eval(`(() => {
      const ui = window.__playback.ui();
      return ui.state === 'hidden' && ui.mouseSeen === false
        && window.__playback.state()?.playing === true; })()`));
    const fpP1 = await chrome.eval(RENDERER_FP);
    check('19h: renderer size constant across the phone states', fpP1 === fpP0,
      `open=${fpP0} later=${fpP1}`);
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErrP = await chrome.eval('__test.errors.slice()');
    check('19h: zero app errors', appErrP.length === 0, JSON.stringify(appErrP));
    check('19h: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 20: GH-319 — cross-game archives ALWAYS open (record picks the bed) --
// The owner's build-15 defect: live SNOOKER, tap an archived "9-ball" session
// → "Playback unavailable: record balls [10..15] not in the current rack".
// The session was a LINEUP-family drill: drills.js racks those on the DRILL's
// kind (rack:'fifteen' under the nine_ball game), so the session stamp
// (gameId nine_ball → 'nine') under-provisioned the swap bed — a NEVER-COVERED
// GH-257 gap (arm 10's corpus is plain game sessions only; the stamp always
// matched the records there). playback.js recordKind() now derives the bed
// from the RECORD (max ball id + the kind-locked discipline table dims), the
// stamp only tiebreaks. This arm is the permanent matrix: every live
// discipline opens an archived session of a DIFFERENT discipline (snooker ↔
// pool both directions, carom — the no-pockets extreme — both ways), plus the
// two RED-PROVEN drill cells (live snooker → lineup session = the owner's
// exact report, and live nine_ball → lineup session, which refused from the
// session's OWN game pre-fix). Every open must stage on the bed the session
// was RECORDED on, scrub, and close back to the GH-257 0-delta fingerprint.
// Own browser: the corpus needs game switches no other arm may see. Port
// offset REUSES arm 6c's (+6, long closed by now): fresh offsets past +19
// would push a 20-port CDP window (e.g. the self-hosted 9430-9449 lane)
// out of range.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 6 });
  watch(chrome, errs);
  const FP = `(() => {
    const balls = window.__test.balls().map((b) => ({
      id: b.id, po: !!b.pocketed,
      p: b.pos.map((x) => x.toFixed(9)), q: b.quat.map((x) => x.toFixed(9)),
      bq: b.baseQuat.map((x) => x.toFixed(9)),
    }));
    const cam = window.__dbg?.camera, orb = window.__dbg?.orbit;
    let judg = -1, hud = 'ERR', drill = 'ERR', share = 'ERR', arch = 'ERR';
    try { judg = (window.__rules?.judgments?.() ?? []).length; } catch { /* seam */ }
    try { hud = JSON.stringify(window.__rules?.matchState?.() ?? null); } catch { /* seam */ }
    try { drill = JSON.stringify(window.__drills?.state?.() ?? null); } catch { /* seam */ }
    try { share = JSON.stringify(window.__share?.log?.() ?? null); } catch { /* seam */ }
    try {
      arch = JSON.stringify({ cur: window.__archive?.current?.() ?? null,
        susp: window.__archive?.suspended?.() ?? null });
    } catch { /* seam */ }
    return { state: window.__test.state(), balls, judg, hud, drill, share, arch,
      bed: JSON.stringify(window.__test.bed()),
      equip: JSON.stringify(window.__test.equipment()),
      cam: cam ? [cam.position.x.toFixed(6), cam.position.y.toFixed(6),
        cam.position.z.toFixed(6), cam.fov] : null,
      orb: orb?.state ? [orb.state.radius.toFixed(6), orb.state.theta.toFixed(6),
        orb.state.phi.toFixed(6)] : null,
      canReplay: document.getElementById('replay')?.disabled === false };
  })()`;
  const fpDiff = (a, b) => {
    const out = [];
    if (JSON.stringify(a) === JSON.stringify(b)) return out;
    for (const k of Object.keys(a)) {
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
      if (k === 'balls') {
        for (let i = 0; i < Math.max(a.balls.length, b.balls.length); i++) {
          if (JSON.stringify(a.balls[i]) !== JSON.stringify(b.balls[i])) {
            out.push(`ball[${i}] ${JSON.stringify(a.balls[i])} -> `
              + `${JSON.stringify(b.balls[i])}`);
          }
        }
      } else out.push(`${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
    }
    return out;
  };
  /** Resolve a pending rulebook decision (carom break_spot, etc.) so the
   * live state is a settled mid-game one before a cell runs. */
  const resolvePending = async (tag) => {
    const pend = await chrome.eval(
      '(window.__rules.matchState()?.pendingDecision?.kind) ?? null');
    if (!pend) return;
    check(`${tag}: pending ${pend} decision resolves`,
      await chrome.eval(`window.__rules.decide(${JSON.stringify(pend)}, 1)`) === true);
    await sleep(400);
  };
  /** #690: a progressed rack's pending post-shot decision (8-ball dry_break,
   * 14.1 break_violation, ...) lawfully refuses the discipline switch
   * (GH-541, settings.changeGame's decisionConflict guard): pin the refusal,
   * resolve the OUTGOING decision, then switch; a decision the new game's
   * rack raises (carom break_spot) is resolved after the switch. */
  const switchGame = async (g) => {
    const out = await chrome.eval(
      '(window.__rules.matchState()?.pendingDecision?.kind) ?? null');
    if (out) {
      const refused = await chrome.eval(
        `window.__settings.changeGame(${JSON.stringify(g)}, { skipConfirm: true })`);
      check(`20 corpus: switching to ${g} is refused while the ${out} decision `
        + 'pends (GH-541)', refused === false, String(refused));
      await resolvePending(`20 before->${g}`);
    }
    const sw = await chrome.eval(
      `window.__settings.changeGame(${JSON.stringify(g)}, { skipConfirm: true })`);
    check(`20 corpus: switched to ${g}`, sw === true, String(sw));
    await sleep(2200);
    await resolvePending(`20 switch->${g}`);
  };
  /** open `sid`, prove the RECORDED bed, scrub, close, prove ZERO deltas. */
  const roundTrip = async (tag, sid, expect) => {
    const before = await chrome.eval(FP);
    const opened = await chrome.eval(`window.__playback.openSession(${sid})`);
    const staged = await chrome.eval('(() => ({ state: window.__test.state(),'
      + ' bed: window.__test.bed(), playerOpen: window.__playback.playerOpen(),'
      + ' note: document.querySelector(".ob-pb-empty[data-note]")?.textContent'
      + ' ?? "" }))()');
    const waitCopies = [
      await chrome.eval('window.__i18n.t("playback.settling")'),
      await chrome.eval('window.__i18n.t("playback.replayRunning")'),
    ];
    check(`${tag}: the session OPENS (no refusal)`,
      opened === true && staged.playerOpen === true
      && staged.state === 'PLAYBACK'
      && (staged.note === '' || waitCopies.includes(staged.note)),
      JSON.stringify({ opened, ...staged }));
    check(`${tag}: staged on the bed it was RECORDED on `
      + `(${expect.census} balls, table ${expect.tableLength} m)`,
      staged.bed.census === expect.census
      && Math.abs(staged.bed.tableLength - expect.tableLength) < 1e-6,
      JSON.stringify(staged.bed));
    await chrome.eval('window.__playback.seek(0.4)');
    await sleep(300);
    const pstate = await chrome.eval('window.__playback.state()');
    check(`${tag}: scrubs on that bed (clock follows T)`,
      !!pstate && Math.abs(pstate.clock - 0.4) < 1e-6, JSON.stringify(pstate));
    await chrome.eval('window.__playback.close()');
    await sleep(600);
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      `${tag}: close re-settled`, 80, 250);
    await sleep(1200); // the post-settle pose re-apply beat
    const after = await chrome.eval(FP);
    const d = fpDiff(before, after);
    check(`${tag}: close restored the live state EXACTLY (0 deltas)`,
      d.length === 0, d.slice(0, 6).join(' ;; '));
  };
  try {
    await waitReady(chrome, 'GH-319 matrix boot');
    await waitFor(chrome, 'typeof window.__playback?.openSession === "function"'
      + ' && typeof window.__drills?.start === "function"', '20: seams');
    // ---- corpus: the OWNER's session shape first — a lineup drill under the
    // nine_ball game (drills.js racks it on rack:'fifteen'; the archive
    // stamps the session gameId 'nine_ball') ----
    check('20 corpus: lineup drill starts',
      await chrome.eval('window.__drills.start("lineup")') === true);
    await sleep(1500);
    const DRILL_BED = await chrome.eval(
      '(({ census, tableLength }) => ({ census, tableLength }))'
      + '(window.__test.bed())');
    check('20 corpus: the lineup drill racked the DRILL\'s kind (fifteen: 16 '
      + 'balls on the pool bed) under the nine_ball game',
      DRILL_BED.census === 16
      && await chrome.eval('window.__test.bed().gameId') === 'nine_ball',
      JSON.stringify(DRILL_BED));
    await fire(chrome, '20 corpus lineup stroke',
      { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(1800);
    await chrome.eval('window.__drills.stop(true)');
    await sleep(800);
    // ---- corpus: a VARYING-LAYOUT drill session (review r2 P2) — the FIRST
    // record lays a 2-ball subset, the SECOND the full fifteen, in ONE
    // session (attempt layouts never split): the id-domain union across the
    // records must size the bed, or the first record alone re-commits the
    // session to a nine bed the later segment cannot stage on. Built over
    // the drill machinery's own bed: a second start() splits a fresh drill
    // session, and the first __test.layout ends that run as the foreign
    // LAYOUT exit, which keeps the table and the archive session (#1197:
    // since GH-982 an explicit stop() hands back a fresh 9-ball rack, which
    // splits the session and swaps the bed); __test.layout poses subsets.
    check('20 corpus: second lineup start (varying-layout session)',
      await chrome.eval('window.__drills.start("lineup")') === true);
    await sleep(1200);
    const lay = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__drills.layout("lineup", 0).balls))');
    check('20 corpus: the lineup layout seam provides the 16-ball line',
      Array.isArray(lay) && lay.length === 16, JSON.stringify(lay?.length));
    await chrome.eval(`__test.layout(${JSON.stringify(lay.slice(0, 2))})`);
    await sleep(600);
    const exit20 = await chrome.eval(
      '({ drill: window.__drills.state(), census: window.__test.bed().census })');
    check('20 corpus: the first scripted layout ended the drill run and kept '
      + 'the fifteen bed (the layout exit, #1197)',
      exit20.drill === null && exit20.census === 16, JSON.stringify(exit20));
    await fire(chrome, '20 corpus vary stroke 1 (ids 0..1)',
      { v0: 1.4, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(1800);
    await chrome.eval(`__test.layout(${JSON.stringify(lay)})`);
    await sleep(600);
    await fire(chrome, '20 corpus vary stroke 2 (ids 0..15)',
      { v0: 1.4, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(1800);
    // fresh nine rack: the layout exit does NOT re-rack, so this both closes
    // the drill session (rerack split) and puts the nine_ball game back on
    // its own bed before its plain corpus session records
    await chrome.eval('__test.rerack(7)');
    await sleep(1500);
    // ---- corpus: one plain session per discipline ----
    const GAMES = ['nine_ball', 'eight_ball', 'one_pocket', 'straight_pool',
      'snooker', 'carom_3cushion'];
    const LIVE_BED = {};
    for (const g of GAMES) {
      if (g !== 'nine_ball') await switchGame(g); // nine_ball: the rerack above
      LIVE_BED[g] = await chrome.eval(
        '(({ census, tableLength }) => ({ census, tableLength }))'
        + '(window.__test.bed())');
      await fire(chrome, `20 corpus ${g}`,
        { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
      await sleep(1800);
    }
    await chrome.eval('window.__archive.flush()');
    await sleep(700);
    const rows = await chrome.eval('(async () => (await window.__archive'
      + '.sessions()).map((s) => [s.id, s.gameId, s.shots, s.drill?.id ?? null]))()');
    const SID = {};
    for (const g of GAMES) {
      SID[g] = (rows.find((r) => r[1] === g && r[2] > 0 && r[3] === null) ?? [])[0];
    }
    SID.lineup = (rows.find((r) => r[3] === 'lineup' && r[2] === 1) ?? [])[0];
    SID.vary = (rows.find((r) => r[3] === 'lineup' && r[2] === 2) ?? [])[0];
    check('20: the corpus holds all six plain sessions + the two lineup '
      + 'drill sessions (stamped nine_ball)',
      GAMES.every((g) => Number.isFinite(SID[g])) && Number.isFinite(SID.lineup)
      && Number.isFinite(SID.vary)
      && rows.filter((r) => r[3] === 'lineup')
        .every((r) => r[1] === 'nine_ball'),
      JSON.stringify({ rows, SID }));

    // ---- the matrix: live discipline × archived-other (+ the drill cells) --
    // live carom first (we are already there), then walk the rest; snooker ↔
    // pool covered in BOTH directions, carom opened from pool and snooker
    // lives AND opening pool/snooker archives itself.
    await roundTrip('20a (live carom -> snooker session)',
      SID.snooker, LIVE_BED.snooker);
    await roundTrip('20b (live carom -> 8-ball session)',
      SID.eight_ball, LIVE_BED.eight_ball);
    await switchGame('snooker');
    await fire(chrome, '20 live snooker', { v0: 1.6, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await sleep(1800);
    await roundTrip('20c (live snooker -> 9-ball session — the owner\'s exact '
      + 'report)', SID.nine_ball, LIVE_BED.nine_ball);
    await roundTrip('20d (live snooker -> LINEUP drill session stamped '
      + 'nine_ball — the GH-319 red cell)', SID.lineup, DRILL_BED);
    await roundTrip('20e (live snooker -> carom session)',
      SID.carom_3cushion, LIVE_BED.carom_3cushion);
    // ---- 20k (review r2 P2): the varying-layout session — record 0 lays
    // ids 0..1, record 1 lays 0..15. The bed must be sized by the UNION
    // (fifteen), and the cross-segment scrub must stage segment 2: sizing
    // by the first record alone opens on a nine bed and the seek into the
    // second record dies on its quiet stage.
    await roundTrip('20k (live snooker -> varying-layout drill session: '
      + 'union sizes the bed)', SID.vary, DRILL_BED);
    check('20k: reopen for the cross-segment scrub',
      await chrome.eval(`window.__playback.openSession(${SID.vary})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '20k: player reopened');
    // #1133: no open player = no timeline. The cross-segment scrub is then a
    // named FAIL (never a silent skip, never a throw that ends arm 20),
    // and the arm goes on to 20f..20j
    if (await chrome.eval('window.__playback.state() !== null') !== true) {
      check('20k: the SECOND record (full fifteen) stages and scrubs', false,
        'not run: no open player, so no timeline (#1133)');
    } else {
      // cum[1], not durs[0]: the live timeline is beat-INCLUSIVE (GH-299) —
      // segment 1 starts after segment 0's duration PLUS its walk beat
      const cum20k = await chrome.eval('window.__playback.state().cum.slice()');
      await chrome.eval(`window.__playback.seek(${cum20k[1]} + 0.4)`);
      await sleep(300);
      const seg2 = await chrome.eval('(() => ({ shot: window.__playback.state().shot,'
        + ' clock: window.__playback.state().clock,'
        + ' census: window.__test.bed().census }))()');
      check('20k: the SECOND record (full fifteen) stages and scrubs',
        seg2.shot === 1 && Math.abs(seg2.clock - 0.4) < 0.05 && seg2.census === 16,
        JSON.stringify({ cum20k, seg2 }));
      await chrome.eval('window.__playback.close()');
      await sleep(600);
      await waitFor(chrome, '__test.state() !== "PLAYBACK"',
        '20k: cross-segment close re-settled', 80, 250);
      await sleep(1200);
    }
    await switchGame('nine_ball');
    await roundTrip('20f (live 9-ball -> snooker session — the reverse '
      + 'direction)', SID.snooker, LIVE_BED.snooker);
    await roundTrip('20g (live 9-ball -> LINEUP drill session — refused from '
      + 'its OWN game pre-fix)', SID.lineup, DRILL_BED);
    await switchGame('eight_ball');
    await roundTrip('20h (live 8-ball -> carom session)',
      SID.carom_3cushion, LIVE_BED.carom_3cushion);
    await switchGame('one_pocket');
    await roundTrip('20i (live one-pocket -> snooker session)',
      SID.snooker, LIVE_BED.snooker);
    await switchGame('straight_pool');
    // same-CLASS staging rides the live bed untouched (the GH-257 design:
    // 9-ball rows on a fifteen rack — dims/paint identical, absent balls
    // park as pocketed), so the expected bed here is the LIVE 14.1 one
    await roundTrip('20j (live 14.1 -> 9-ball session, same-class: rides the '
      + 'live bed)', SID.nine_ball, LIVE_BED.straight_pool);
    const appErr20 = await chrome.eval('__test.errors.slice()');
    check('20: zero app errors', appErr20.length === 0, JSON.stringify(appErr20));
    check('20: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}


// =============================================================================
// ---- arm 21: GH-334 — Escape closes the player (layered dismissal) ----------
// Every other surface closes on Escape; the player did not. REAL-key law:
// Escape FIRST belongs to any open popover/picker/card (their own handlers —
// strip onDocKey / dialog.js — with the GH-314 pin machine untouched), and
// only with nothing layered does it run the EXISTING back-pill close path
// (closePlayer → restoreLive, restore law + list reopen included). Red
// pre-fix: 21c/21d — the bare Escape was a pure-observer reveal re-arm and
// the player stayed open. Own browser: the arm ends with the player gone.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 7 });
  watch(chrome, errs);
  const realEsc = async () => {
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown',
      key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp',
      key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(400);
  };
  try {
    await waitReady(chrome, 'GH-334 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '21: __playback seam');
    await fire(chrome, '21: shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid21 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('21: session opens',
      await chrome.eval(`window.__playback.openSession(${sid21})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '21: player open');
    await waitFor(chrome, 'window.__playback.strip()?.mounted() === true',
      '21: strip mounted');
    await sleep(400);

    // ---- 21a: Escape with the transition picker open takes the PICKER -------
    check('21a: transition picker opens', await chrome.eval(`(() => {
      window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
        { seg: 0, t: 2.0, cam: 3, transitionIn: 0, dur: 0 }], poses: [] });
      window.__playback.strip().openTransPicker(1);
      return !!document.getElementById('ob-pb-transpick'); })()`) === true);
    await realEsc();
    const a21 = await chrome.eval(`(() => ({
      pick: !!document.getElementById('ob-pb-transpick'),
      player: window.__playback.playerOpen() }))()`);
    check('21a: Escape dismisses the open picker and the player STAYS '
      + '(layered dismissal, GH-314 semantics intact)',
    a21.pick === false && a21.player === true, JSON.stringify(a21));

    // ---- 21b: Escape with the save card open takes the CARD -----------------
    await chrome.eval('document.querySelector(".ob-pb-save").click()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '21b: card open');
    await sleep(300);
    await realEsc();
    const b21 = await chrome.eval(`(() => ({
      card: window.__playback.cardOpen(),
      player: window.__playback.playerOpen() }))()`);
    check('21b: Escape closes the save card and the player STAYS',
      b21.card === false && b21.player === true, JSON.stringify(b21));

    // ---- 21b2: HELP over the player is a layer too (review r4) ---------------
    // the global `?` shortcut stands Help over an open player; its Escape
    // belongs to dialog.js — the player must not tear down beneath it.
    await chrome.eval('window.__help.open(); true');
    await waitFor(chrome, 'window.__help.isOpen() === true', '21b2: help open');
    await sleep(300);
    await realEsc();
    const b21h = await chrome.eval(`(() => ({
      help: window.__help.isOpen(),
      player: window.__playback.playerOpen() }))()`);
    check('21b2: Escape closes the Help overlay and the player STAYS',
      b21h.help === false && b21h.player === true, JSON.stringify(b21h));

    // ---- 21c: a standing strip SELECTION is its own layer (review r1) --------
    // (staged explicitly: opening the save card in 21b already dismissed
    // the picker's lingering seam selection)
    await chrome.eval('window.__playback.strip().select(0); true');
    await sleep(200);
    const preC21 = await chrome.eval(
      'window.__playback.strip().engaged()');
    check('21c: a strip block selection stands (the layer under test '
      + 'exists)', preC21 === true, JSON.stringify(preC21));
    await realEsc();
    const c21sel = await chrome.eval(`(() => ({
      engaged: window.__playback.strip().engaged(),
      player: window.__playback.playerOpen() }))()`);
    check('21c: Escape clears the standing strip selection and the player '
      + 'STAYS (review r1 pointer/selection guard)',
    c21sel.engaged === false && c21sel.player === true,
    JSON.stringify(c21sel));

    // ---- 21c2: a HELD bed pointer keeps Escape inert (review r2) -------------
    // orbit/touch camera gestures live in bedIds, not holdIds — Escape must
    // never tear the player down under a captured bed pointer.
    await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed',
      x: 400, y: 200, button: 'left', clickCount: 1 });
    await sleep(150);
    await realEsc();
    const c21hold = await chrome.eval('window.__playback.playerOpen()');
    check('21c2: Escape during a held bed pointer is INERT (no teardown '
      + 'under a captured gesture)', c21hold === true,
    JSON.stringify(c21hold));
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased',
      x: 400, y: 200, button: 'left', clickCount: 1 });
    await sleep(250);

    // ---- 21d: bare Escape closes the PLAYER via the existing close path -----
    await realEsc();
    await waitFor(chrome, 'window.__playback.playerOpen() === false',
      '21d: player closed', 40, 300);
    await waitFor(chrome, '__test.state() !== "PLAYBACK"',
      '21d: restore settle', 60, 300);
    const c21 = await chrome.eval(`(() => ({
      player: window.__playback.playerOpen(),
      list: window.__playback.isOpen(),
      live: document.documentElement.classList.contains('ob-pb-live') }))()`);
    check('21d: bare Escape closes the player down the back-pill path '
      + '(live chrome back, session list reopened)',
    c21.player === false && c21.list === true && c21.live === false,
    JSON.stringify(c21));

    // ---- 21e: Escape on the reopened list still closes IT (dialog.js law) ---
    await realEsc();
    check('21e: Escape then closes the session list (no double-close leaked '
      + 'from the player press)',
    await chrome.eval('window.__playback.isOpen()') === false);

    const appErr21 = await chrome.eval('__test.errors.slice()');
    check('21: zero app errors', appErr21.length === 0, JSON.stringify(appErr21));
    check('21: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 22: GH-330 — grammar-refused CAM pill / slot-flyout taps speak -----
// Silent no-ops pre-fix. The law now: the STATICALLY-knowable no-op — every
// pill while the tripod capture latch holds — DISABLES (kit :disabled +
// localized title reason, preset pills via setLatch, slot pills via the
// strip), re-arming with the latch; the CONTEXTUAL grammar refusals (a
// static cut landing inside a dynamic span, the 128-cut cap) paint the
// strip's transient hint with the localized reason over a byte-untouched
// model; an expired note under a standing block selection restores the
// editing copy. A dynamic pill mid-shot is NOT a refusal (whole-segment
// law: it pins to t=0 and re-cams the segment) — 22c pins that taxonomy.
// Red pre-fix: 22a (no disable), 22d/22e (no hint), 22f (no note).
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 8 });
  watch(chrome, errs);
  const HINT = `(() => {
    const h = document.querySelector('.ob-pb-strip-hint');
    return { shown: !!h && h.style.display !== 'none',
      text: h?.textContent ?? '',
      cuts: window.__playback.getCutPlan().cuts.length };
  })()`;
  try {
    await waitReady(chrome, 'GH-330 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '22: __playback seam');
    await fire(chrome, '22: shot', { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid22 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('22: session opens',
      await chrome.eval(`window.__playback.openSession(${sid22})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '22: player open');
    await waitFor(chrome, 'window.__playback.strip()?.mounted() === true',
      '22: strip mounted');
    await sleep(400);

    // ---- 22a: the capture latch DISABLES every pill (the static no-op) ------
    const a22 = await chrome.eval(`(() => {
      window.__playback.strip().enterCapture(0);
      const pill = (sel) => {
        const b = document.querySelector(sel);
        return b ? { dis: b.disabled, title: b.title,
          faded: parseFloat(getComputedStyle(b).opacity) } : null;
      };
      return { chase: pill('.ob-pb-cam[data-cam="chase"]'),
        broadcast: pill('.ob-pb-cam[data-cam="broadcast"]'),
        slot: pill('.ob-pb-slot[data-slot="0"]'),
        want: window.__i18n.t('playback.strip.capturing') };
    })()`);
    check('22a: capture latch disables preset + slot pills (kit :disabled '
      + 'fade + localized title reason)',
    !!a22.chase?.dis && !!a22.broadcast?.dis && !!a22.slot?.dis
      && a22.chase.title === a22.want && a22.slot.title === a22.want
      && a22.chase.faded < 0.5, JSON.stringify(a22));

    // ---- 22b: cancelling the capture re-arms them ----------------------------
    const b22 = await chrome.eval(`(() => {
      window.__playback.strip().cancelCapture();
      const b = (sel) => document.querySelector(sel);
      return { chase: b('.ob-pb-cam[data-cam="chase"]').disabled,
        slot: b('.ob-pb-slot[data-slot="0"]').disabled,
        chaseTitle: b('.ob-pb-cam[data-cam="chase"]').title,
        slotTitle: b('.ob-pb-slot[data-slot="0"]').title,
        empty: window.__i18n.t('playback.cam.slotEmpty') };
    })()`);
    check('22b: capture exit re-arms the pills (slot title back to its OWN '
      + 'meaning, no stale reason)',
    b22.chase === false && b22.slot === false && b22.chaseTitle === ''
      && b22.slotTitle === b22.empty, JSON.stringify(b22));

    // ---- 22c: taxonomy pin — a dynamic pill mid-shot is an ASSIGN, not a
    //           refusal (whole-segment law): no hint, segment re-cams -----------
    await chrome.eval(`window.__playback.setCutPlan({ cuts: [
      { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
      { seg: 0, t: 2.0, cam: 3, transitionIn: 0, dur: 0 }], poses: [] })`);
    await chrome.eval('window.__playback.strip().setExpanded(true)');
    await chrome.eval('window.__playback.seek(1.0)');
    await sleep(200);
    await chrome.eval(
      'document.querySelector(".ob-pb-cam[data-cam=\\"chase\\"]").click()');
    await sleep(200);
    const c22 = await chrome.eval(`(() => {
      const h = document.querySelector('.ob-pb-strip-hint');
      return { shown: !!h && h.style.display !== 'none',
        cuts: window.__playback.getCutPlan().cuts };
    })()`);
    check('22c: a chase tap mid-shot re-cams the SEGMENT (t pins to 0, mid '
      + 'anchors sweep) with NO refusal hint',
    c22.shown === false && c22.cuts.length === 1 && c22.cuts[0].t === 0
      && c22.cuts[0].cam === 1, JSON.stringify(c22));

    // ---- 22d: contextual — a static cut inside the chase span says WHY ------
    await chrome.eval('window.__playback.seek(1.0)');
    await sleep(200);
    await chrome.eval(
      'document.querySelector(".ob-pb-cam[data-cam=\\"broadcast\\"]").click()');
    await sleep(200);
    const d22 = await chrome.eval(HINT);
    const dWant = await chrome.eval(
      `window.__i18n.t('playback.strip.refusedSpan')`);
    check('22d: a static tap inside a chase span paints the span refusal '
      + 'and writes NOTHING', d22.shown === true && d22.text === dWant
      && d22.cuts === 1, JSON.stringify({ d22, dWant }));

    // ---- 22e: contextual — the 128-cut cap says WHY ---------------------------
    const e22 = await chrome.eval(`(() => {
      const cuts = [{ seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 }];
      for (let i = 1; i < 128; i++) {
        cuts.push({ seg: 0, t: +(i * 0.03).toFixed(2), cam: 3,
          transitionIn: 0, dur: 0 });
      }
      return window.__playback.setCutPlan({ cuts, poses: [] });
    })()`);
    check('22e: the 128-cut fixture plan is accepted', e22 === true,
      JSON.stringify(e22));
    await chrome.eval('window.__playback.strip().setExpanded(true)');
    await chrome.eval('window.__playback.seek(4.2)');
    await sleep(200);
    await chrome.eval(
      'document.querySelector(".ob-pb-cam[data-cam=\\"overhead\\"]").click()');
    await sleep(200);
    const e22b = await chrome.eval(HINT);
    const eWant = await chrome.eval(
      `window.__i18n.t('playback.strip.refusedCap')`);
    check('22e: the 129th cut paints the cap refusal and writes NOTHING',
      e22b.shown === true && e22b.text === eWant && e22b.cuts === 128,
      JSON.stringify({ e22b, eWant }));

    // ---- 22f: an expired note under a block selection restores the editing
    //           copy (never a stranded stale refusal) --------------------------
    await chrome.eval(`window.__playback.setCutPlan({ cuts: [
      { seg: 0, t: 0, cam: 1, transitionIn: 0, dur: 0 }], poses: [] })`);
    await chrome.eval('window.__playback.strip().select(0)');
    await chrome.eval('window.__playback.strip().setExpanded(true)');
    await chrome.eval('window.__playback.seek(1.0)');
    await chrome.eval('window.__playback.strip().insertAtPlayhead(3)');
    await sleep(200);
    const f22a = await chrome.eval(HINT);
    const fWant = await chrome.eval(
      `window.__i18n.t('playback.strip.refusedSpan')`);
    check('22f: the refusal note paints over the editing banner',
      f22a.shown === true && f22a.text === fWant, JSON.stringify(f22a));
    await sleep(2800); // past the 2.5 s note TTL
    const f22b = await chrome.eval(`(() => {
      const h = document.querySelector('.ob-pb-strip-hint');
      return { shown: !!h && h.style.display !== 'none',
        text: h?.textContent ?? '',
        want: window.__i18n.t('playback.strip.editing') };
    })()`);
    check('22f: the expired note restores the editing copy under the '
      + 'standing selection', f22b.shown === true && f22b.text === f22b.want,
    JSON.stringify(f22b));

    await chrome.eval('window.__playback.close()');
    const appErr22 = await chrome.eval('__test.errors.slice()');
    check('22: zero app errors', appErr22.length === 0, JSON.stringify(appErr22));
    check('22: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 23: GH-361 — the AUTO-expansion latch releases on resume ------------
// The build-16 owner device defect: a paused CAM-tile tap auto-expands the
// director strip (arm 19b), and pre-fix that implicit expansion latched the
// STRIP pin forever — play never auto-hid the immersive console and the
// tap-outside dismiss read as dead (pinned swallows bed taps by design).
// The GH-314 contract pins editing engagement "until playback RESUMES":
// resume (and the last engagement clearing mid-play) now rests an
// auto-expanded lane back to the D-lite sliver, while the user's own
// TOGGLE expansion stays sticky and keeps pinning through play (arm 19e's
// owner-approved register, re-proved here on the phone). Phone register,
// real touch throughout — the exact reported journey.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5`, { port: CDP + 23 });
  watch(chrome, errs);
  try {
    await setPhoneMetrics(chrome, { width: 852, height: 393 });
    await setSafeAreaInsets(chrome, { top: 0, left: 47, right: 47, bottom: 21 });
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=361resume` });
    await waitReady(chrome, '23 phone boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '23: __playback seam');
    await fire(chrome, '23: shot A', { v0: 4.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '23: shot B', { v0: 1.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid23 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('23: session opens',
      await chrome.eval(`window.__playback.openSession(${sid23})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true', '23: player open');
    await waitFor(chrome, 'window.__playback.strip()?.mounted() === true',
      '23: strip mounted');
    await sleep(300);
    const fp23 = await chrome.eval(RENDERER_FP);
    const rTap = async (sel, tag) => {
      const c = await chrome.eval(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el || !el.getClientRects().length) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()`);
      if (!c) { fail(`23 ${tag}: no visible ${sel}`); return null; }
      await tap(chrome, c.x, c.y);
      await sleep(200);
      return c;
    };
    await chrome.eval('window.__playback.setSpeed(0.25)'); // playback must
    // outlive the idle windows below (the 19h recipe)
    check('23: entry is the paused pin, strip at rest',
      await chrome.eval(`${UI_STATE} === 'pinned'`)
      && await chrome.eval('window.__playback.strip().expanded() === false'));

    // ---- the reported journey: paused edit -> (card round-trip) -> play ----
    await rTap('.ob-pb-cam[data-cam="overhead"]', 'CAM tile');
    check('23a: the paused tile tap auto-expands the strip (19b intact) and '
      + 'marks the expansion AUTO',
    await chrome.eval('window.__playback.strip().expanded() === true')
      && await chrome.eval('window.__playback.strip().autoExpanded?.() === true'));
    // the owner journey passed through the save card between edit and play
    // (SETUP only — the render itself is arm 3/4/17 territory)
    await rTap('.ob-pb-save', 'Save pill');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '23a: card open');
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-dismiss").click()');
    await waitFor(chrome, 'document.querySelectorAll("#ob-pb-card").length === 0',
      '23a: card gone');
    check('23a: the card round-trip leaves the auto expansion standing '
      + '(paused still pins)',
    await chrome.eval('window.__playback.strip().expanded() === true')
      && await chrome.eval(`${UI_STATE} === 'pinned'`));
    await rTap('.ob-pb-play', 'play');
    check('23b: RESUME rests the auto-expanded lane to the sliver and the '
      + 'strip pin releases into the re-armed transient',
    await chrome.eval('window.__playback.strip().expanded() === false')
      && await chrome.eval(`${UI_STATE} === 'shown'`
        + ' && window.__playback.state()?.playing === true'));
    await waitFor(chrome, `${UI_STATE} === 'hidden'`
      + ' && window.__playback.state()?.playing === true',
    '23b: auto-hide while still playing (the reported journey, pre-fix RED)',
    40, 200);
    // tap-outside works again: reveal, then dismiss (shipped touch grammar)
    await tap(chrome, 426, 140);
    await sleep(250);
    check('23b: bed tap reveals (play keeps running)',
      await chrome.eval(`${UI_STATE} === 'shown'`
        + ' && window.__playback.state()?.playing === true'));
    await tap(chrome, 426, 140);
    await sleep(250);
    check('23b: second tap dismisses — the reported dead tap-outside lives',
      await chrome.eval(`${UI_STATE} === 'hidden'`));

    // ---- mid-play engagement: select -> deselect rests the lane ------------
    await tap(chrome, 426, 140); // reveal so the lane is hittable
    await sleep(250);
    await rTap('.ob-pb-strip-block', 'strip block');
    check('23c: a mid-play block selection engages + auto-expands (pinned)',
      await chrome.eval(`${UI_STATE} === 'pinned'`)
      && await chrome.eval('window.__playback.strip().engaged() === true')
      && await chrome.eval('window.__playback.strip().expanded() === true'));
    await tap(chrome, 426, 140); // bed tap clears the selection (onDocDown)
    await sleep(250);
    check('23c: deselecting mid-play rests the auto lane (no standing pin)',
      await chrome.eval('window.__playback.strip().engaged() === false')
      && await chrome.eval('window.__playback.strip().expanded() === false'));
    await waitFor(chrome, `${UI_STATE} === 'hidden'`
      + ' && window.__playback.state()?.playing === true',
    '23c: …and the idle timer hides again', 40, 200);

    // ---- the EXPLICIT toggle register is untouched (19e on the phone) ------
    await tap(chrome, 426, 140); // reveal
    await sleep(250);
    await rTap('.ob-pb-play', 'pause');
    await waitFor(chrome, 'window.__playback.state()?.playing === false',
      '23d: paused');
    await rTap('.ob-pb-strip-toggle', 'toggle expand');
    check('23d: the toggle expansion is the user\'s own (NOT auto)',
      await chrome.eval('window.__playback.strip().expanded() === true')
      && await chrome.eval('window.__playback.strip().autoExpanded?.() === false'));
    await rTap('.ob-pb-play', 'play with toggled strip');
    await sleep(3600); // a full idle window
    check('23d: an EXPLICITLY expanded strip still pins through play '
      + '(arm 19e\'s owner-approved register)',
    await chrome.eval(`${UI_STATE} === 'pinned'`
        + ' && window.__playback.strip().expanded() === true'
        + ' && window.__playback.state()?.playing === true'));
    await rTap('.ob-pb-strip-toggle', 'toggle collapse');
    check('23d: collapse releases into the re-armed transient',
      await chrome.eval(`${UI_STATE} === 'shown'`));
    await waitFor(chrome, `${UI_STATE} === 'hidden'`, '23d: auto-hide', 40, 200);

    check('23: renderer size byte-constant across the whole journey',
      await chrome.eval(RENDERER_FP) === fp23);
    await chrome.eval('window.__playback.close()');
    const appErr23 = await chrome.eval('__test.errors.slice()');
    check('23: zero app errors', appErr23.length === 0, JSON.stringify(appErr23));
    check('23: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 25: GH-313 B1 — stale-locale budget copy stays LOCALIZED ------------
// The GH-304 versioned-copy seam under its supported stale pairing, judged on
// the ACTIVE dictionary: a fresh playback.js + fresh en.json over a STALE
// non-English locale JSON (predating the *Dur key family). has() consults the
// en fallback, so the pre-313 register painted the fresh ENGLISH *Dur copy
// into the es UI (plus one missing-key warn per key); i18n.hasLocal() asks
// the active dictionary alone, so the chip degrades to the RETAINED LEGACY
// es {sec} template and the missing-key detector stays clean. Red pre-fix on
// both assertions. Own browser: the arm re-navigates under a Fetch
// interception of locales/es.json (the arm-6 convention).
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=313b1`,
    { port: CDP + 20 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'GH-313 B1 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '25: __playback seam');
    // the arm-17 session shape (three settled shots — enough play seconds
    // that a 4 s budget must montage-compress, so the chip paints)
    await fire(chrome, '25: shot A', { v0: 4.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '25: shot B', { v0: 0.55, phi: Math.PI / 2 + 0.5, theta: 0, a: 0, b: 0 });
    await fire(chrome, '25: shot C', { v0: 1.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    // persisted BEFORE the re-navigation: the es language choice + the
    // tight-budget fixture (both containers keyed — the harness box may
    // negotiate mp4 or webm; 64 MB/s derives the smallest wire budget, 4 s)
    await chrome.eval(`(() => {
      localStorage.setItem('ob-settings-v1', JSON.stringify({ language: 'es' }));
      localStorage.setItem('ob-export-bps-v1', JSON.stringify({
        'webm:1080': { Bps: 64e6, n: 2 }, 'mp4:1080': { Bps: 64e6, n: 2 } }));
      return true; })()`);
    // the STALE dictionary: the SHIPPED es.json minus the *Dur family — a
    // real pre-304 cache, not a synthetic dictionary (every legacy key,
    // including playback.montage's {sec} template, is retained verbatim)
    const esStale = JSON.parse(readFileSync(
      path.join(webDir, 'app', 'locales', 'es.json'), 'utf8'));
    const durKeys = Object.keys(esStale).filter((k) => /^playback\.(durSec|durMin|durMinOnly|montageDur|walkCutsDur|walkCutsOneDur|clipTooLongDur)$/.test(k));
    for (const k of durKeys) delete esStale[k];
    check('25: the stale fixture strips the whole *Dur family (7 keys)',
      durKeys.length === 7, JSON.stringify(durKeys));
    // GH-668 S5 replays r8 (review r5 P3): the strips' keyboard hint
    // (`playback.help.filterKeys`, a G4 key) is NEWER still — the same
    // pre-change cache lacks it; stripped too (asserted present in the
    // shipped es.json first, so the fixture keeps its teeth), and the fresh
    // en copy is read from disk for the locale-switch leg below
    const helpKey25 = 'playback.help.filterKeys';
    check('25: the shipped es.json carries the strips\' help key the fixture strips',
      typeof esStale[helpKey25] === 'string' && esStale[helpKey25].length > 0);
    delete esStale[helpKey25];
    const enHelp25 = JSON.parse(readFileSync(
      path.join(webDir, 'app', 'locales', 'en.json'), 'utf8'))[helpKey25];
    check('25: the shipped en.json carries the strips\' help key',
      typeof enHelp25 === 'string' && enHelp25.length > 0);
    chrome.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (/locales\/es\.json/.test(params.request.url)) {
        chrome.send('Fetch.fulfillRequest', {
          requestId: params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(esStale)).toString('base64'),
        }).catch(() => {}); // the 6a belt: a dead paused request is benign
      } else {
        chrome.send('Fetch.continueRequest', { requestId: params.requestId })
          .catch(() => {});
      }
    });
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*es.json*' }] });
    await chrome.send('Network.enable');
    await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
    await navReady(chrome,
      `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=313b1b`,
      'stale-es boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '25: seam after the es re-boot');
    check('25: the app runs es over the STALE dictionary',
      await chrome.eval('window.__i18n.locale()') === 'es');
    // the 17b files-only chunked shell stub: the WIRE wall governs (4 s)
    await chrome.eval(`(() => {
      window.webkit = { messageHandlers: {
        obSaveVideoStream: { postMessage: () => Promise.resolve({ ok: true }) },
      } };
      window.__obSaveVideo = { v: 1, chunk: 786432, dests: ['files'] };
      return true; })()`);
    const sid25 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('25: the persisted session survives the re-navigation',
      Number.isFinite(sid25));
    check('25: session opens',
      await chrome.eval(`window.__playback.openSession(${sid25})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '25: player open');
    // the budget derives only over a PROBED container (formatFor) — the
    // save card's open probes it and the settle repaints the chip
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '25: card open');
    check('25: CTA armed (support probed — the budget can derive)',
      await ctaArmed(chrome));
    const bud25 = await chrome.eval(
      `__export.exportBudget({ tier: 'standard', height: 1080, photos: false })`);
    check("25: the fixture derives the tight 4 s wire budget (the arm's teeth)",
      bud25?.sec === 4 && bud25.derived === true, JSON.stringify(bud25));
    const chip25 = await chrome.eval(`(() => {
      const el = document.querySelector('.ob-pb-montage');
      return { on: el?.classList.contains('on'), text: el?.textContent ?? '' };
    })()`);
    // expected: the RETAINED LEGACY es template with {sec}=4 — computed in
    // NODE from the served stale fixture bytes, independent of the app's
    // own fallback machinery ({rate} is the app's arithmetic, matched loose)
    const esc25 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const legacyRe = new RegExp(`^${esc25(esStale['playback.montage'])
      .replace(esc25('{rate}'), '\\d+(?:\\.\\d+)?')
      .replace(esc25('{sec}'), '4')}$`);
    check('25: the chip paints the RETAINED LEGACY es template — never the '
      + 'fresh ENGLISH *Dur copy the en fallback would leak (red pre-fix: '
      + `'×{rate} · fits {dur}' in an es UI)`,
    chip25.on === true && legacyRe.test(chip25.text),
    JSON.stringify({ chip25, want: String(legacyRe) }));
    const missing25 = await chrome.eval('window.__i18n.missing()');
    check('25: the missing-key detector stays CLEAN (hasLocal asked the '
      + 'ACTIVE dictionary; t() never reached for the en fallback — red '
      + 'pre-fix: one warn per *Dur key)',
    Array.isArray(missing25) && missing25.length === 0,
    JSON.stringify(missing25));
    // ---- r8 help-key leg (GH-668 S5 replays, review r5 P3): under the STALE
    // es dictionary the player's speed strip and the list's filter strip
    // (the panel is built for the session) carry NO title (hasLocal-gated —
    // red pre-r8: the literal key as the tooltip once en lacks it too) and
    // NEVER a data-i18n-title (the judge owns the title: an earlier locale
    // listener's applyDom would repaint the attribute through t() under the
    // stale dictionary — measured red: one missing-key warn per switch);
    // re-judged on a locale change: en (fresh) → the en hint, never a raw
    // playback.* key; back to es (stale) → omitted again; the missing-key
    // detector stays clean across the switches (t() never reached).
    const hint25 = () => chrome.eval(`(() => {
      const q = (sel) => { const el = document.querySelector(sel); return el
        ? { has: el.hasAttribute('title'), title: el.getAttribute('title'), key: el.dataset.i18nTitle ?? null } : null; };
      return { speed: q('.ob-pb-speed'), filters: q('#ob-pb-panel .ob-pb-filters') }; })()`);
    const omitted25 = (h) => !!h?.speed && !!h.filters && !h.speed.has && !h.filters.has
      && h.speed.key === null && h.filters.key === null;
    const raw25 = (x) => /^playback\./.test(x?.title ?? '');
    const h0 = await hint25();
    check('25: under the STALE es dictionary the speed strip and the filter '
      + 'strip carry NO title and no data-i18n-title (hasLocal-gated — red '
      + 'pre-r8: the raw key `playback.help.filterKeys` as the tooltip)',
    omitted25(h0), JSON.stringify(h0));
    await chrome.eval('window.__i18n.setLocale("en")');
    await waitFor(chrome, 'window.__i18n.locale() === "en"', '25: en switch');
    const h1 = await hint25();
    check('25: after a switch to the FRESH en dictionary both strips carry the '
      + 'hint (title = the en copy, never a raw playback.* key; still no '
      + 'data-i18n-title — the judge owns the title, not applyDom)',
    !!h1?.speed && !!h1.filters && h1.speed.has && h1.filters.has
      && h1.speed.key === null && h1.filters.key === null
      && !raw25(h1.speed) && !raw25(h1.filters)
      && h1.speed.title === enHelp25 && h1.filters.title === enHelp25,
    JSON.stringify({ h1, want: enHelp25 }));
    await chrome.eval('window.__i18n.setLocale("es")');
    await waitFor(chrome, 'window.__i18n.locale() === "es"', '25: es switch back');
    const h2 = await hint25();
    check('25: switching back to the STALE es dictionary RE-JUDGES: the hint '
      + 'is omitted again on both strips (no title)',
    omitted25(h2), JSON.stringify(h2));
    const missing25b = await chrome.eval('window.__i18n.missing()');
    check('25: the missing-key detector stays CLEAN across the en → es '
      + 'switches (the gate asked hasLocal; t() never reached for the help key)',
    Array.isArray(missing25b) && missing25b.length === 0,
    JSON.stringify(missing25b));
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '23');
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    await chrome.send('Fetch.disable');
    const appErr25 = await chrome.eval('__test.errors.slice()');
    check('25: zero app errors', appErr25.length === 0, JSON.stringify(appErr25));
    check('25: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- arm 26: GH-313 B2 — a probe settle never repaints SETUP over DONE -------
// The GH-304 residual-2 window, red/green: the GH-252 transcode probe is HELD
// (stubbed VideoDecoder.isConfigSupported promises that resolve only when the
// arm releases them), the container is FORCED to webm (avc-encode stub — the
// photos/transcode wall exists for webm only), and renderDrill is FAKED to a
// DONE webm delivery. While the probe pends, planPhotosTranscode answers TRUE
// (the documented tight-wall pending law), so the press-time plan prices the
// 2 s photos wall on the 64 MB/s fixture; the released probe settles ok:false
// and flips the derivable budget to the 4 s wire wall. Pre-313 the settle
// dropped the snapshot and repainted the SETUP estimate lines (2 s → 4 s
// copy) over the card describing the delivered 2 s-planned file; post-313 the
// `rendering` latch extends to the delivered state — the DONE card's copy is
// byte-unchanged, a later locale-switch repaint still reads the press-time
// snapshot (planBudget's delivered latch, review r2), and a reopened card
// derives the settled 4 s.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1&arm=313b2`,
    { port: CDP + 21 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'GH-313 B2 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '26: __playback seam');
    // WebCodecs shaping BEFORE any export surface probes: avc encode
    // unsupported (deterministic webm negotiation on every box) and the
    // VideoDecoder probes HELD until the arm releases them (ok:false)
    await chrome.eval(`(() => {
      const realVE = VideoEncoder.isConfigSupported.bind(VideoEncoder);
      VideoEncoder.isConfigSupported = (cfg) => (
        String(cfg?.codec ?? '').startsWith('avc1')
          ? Promise.resolve({ supported: false, config: cfg }) : realVE(cfg));
      window.__vdHolds = [];
      window.__vdSettled = false;
      VideoDecoder.isConfigSupported = (cfg) => (window.__vdSettled
        ? Promise.resolve({ supported: false, config: cfg })
        : new Promise((res) => window.__vdHolds.push(
          () => res({ supported: false, config: cfg }))));
      // settle telemetry: probeTranscodeSupport awaits its AAC leg strictly
      // AFTER the held VideoDecoder Promise.all — a post-release increment
      // proves the probe passed the released gate (the arm's settle signal)
      window.__aacProbes = 0;
      const realAE = AudioEncoder.isConfigSupported.bind(AudioEncoder);
      AudioEncoder.isConfigSupported = (cfg) => {
        window.__aacProbes += 1;
        return realAE(cfg);
      };
      return true; })()`);
    await fire(chrome, '26: shot A', { v0: 4.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '26: shot B', { v0: 0.55, phi: Math.PI / 2 + 0.5, theta: 0, a: 0, b: 0 });
    await fire(chrome, '26: shot C', { v0: 1.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    // photos-bearing chunked shell + the 64 MB/s fixture: a PENDING probe
    // prices the photos/transcode wall (2 s); settled ok:false prices the
    // wire wall (4 s) — the exact flip the defective repaint painted
    await chrome.eval(`(() => {
      window.webkit = { messageHandlers: {
        obSaveVideoStream: { postMessage: () => Promise.resolve({ ok: true }) },
      } };
      window.__obSaveVideo = { v: 1, chunk: 786432, dests: ['photos', 'files'] };
      localStorage.setItem('ob-export-bps-v1',
        JSON.stringify({ 'webm:1080': { Bps: 64e6, n: 2 } }));
      return true; })()`);
    const sid26 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('26: session opens',
      await chrome.eval(`window.__playback.openSession(${sid26})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '26: player open');
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true', '26: card open');
    check('26: CTA armed (the encoder probe settles independently of the '
      + 'held transcode probe)', await ctaArmed(chrome));
    check('26: the avc stub forced the webm negotiation',
      (await chrome.eval('__export.tiers()')).standard === 'webm');
    const bud26 = await chrome.eval(`({
      photos: __export.exportBudget({ tier: 'standard', height: 1080, photos: true }).sec,
      wire: __export.exportBudget({ tier: 'standard', height: 1080, photos: false }).sec })`);
    check("26: the fixture walls really differ (photos 2 s / wire 4 s — the arm's teeth)",
      bud26?.photos === 2 && bud26?.wire === 4, JSON.stringify(bud26));
    check('26: the pending-probe plan prices the photos wall (opts.budgetSec '
      + '= 2, the documented tight-wall pending law)',
    await chrome.eval('window.__playback.plan().opts.budgetSec') === 2);
    // fake renderDrill DONE: the real module answered every open-time probe;
    // only the render itself is faked, resolving a webm blob so the
    // delivered state arms exactly as a real 2 s-planned render would
    await chrome.eval(`(() => {
      window.__b2Press = null;
      window.__export.renderDrill = async (records, opts) => {
        window.__b2Press = { budgetSec: opts.budgetSec ?? null, n: records.length };
        await new Promise((r) => setTimeout(r, 120));
        opts.onMontage?.(2.5);
        const blob = new Blob([new Uint8Array(2000000)], { type: 'video/webm' });
        return { blob, size: blob.size, ext: 'webm', frames: 120,
          wallSec: 2.0, montageRate: 2.5 };
      };
      return true; })()`);
    await confirmClip(chrome, '26: Export CTA');
    await waitFor(chrome,
      '[...document.querySelectorAll(".ob-pb-dest")].some((b) => !b.disabled)',
      '26: DONE card (tiles armed behind the delivered blob)');
    check('26: the press-time plan carried the photos-wall budget (2 s)',
      await chrome.eval('window.__b2Press?.budgetSec') === 2,
      JSON.stringify(await chrome.eval('window.__b2Press')));
    const CARD_COPY = `(() => ({
      q: document.querySelector('#ob-pb-card .ob-pb-quality span')?.textContent ?? '',
      est: document.querySelector('#ob-pb-card .ob-pb-estimate')?.textContent ?? '',
      p: document.querySelector('#ob-pb-card .ob-pb-ptext')?.textContent ?? '',
      chip: document.querySelector('.ob-pb-montage')?.textContent ?? '',
      dests: [...document.querySelectorAll('.ob-pb-dest')]
        .map((b) => b.dataset.dest).join(),
      cta: document.querySelector('#ob-pb-card .ob-pb-go')?.disabled ?? null,
    }))()`;
    const done26 = await chrome.eval(CARD_COPY);
    check('26: the DONE card stands (delivery text painted; a webm under a '
      + 'PENDING probe earns no Photos tile — mime honesty)',
    done26.p.length > 0 && done26.q.length > 0 && done26.est.length > 0
      && done26.dests === 'files', JSON.stringify(done26));
    const aacBefore = await chrome.eval('window.__aacProbes');
    const released = await chrome.eval(`(() => {
      window.__vdSettled = true;
      const h = window.__vdHolds.splice(0);
      h.forEach((r) => r());
      return h.length; })()`);
    check('26: the held VideoDecoder probes released (the transcode probe '
      + 'can settle ok:false)', released >= 1, String(released));
    // the settle's observable: the probe's AAC leg runs strictly AFTER the
    // released VideoDecoder gate (plan()/budget seams deliberately read the
    // delivered latch now, so they cannot signal the settle)
    await waitFor(chrome, `window.__aacProbes > ${aacBefore}`,
      '26: the released probe reached its AAC leg (settle landed)');
    await sleep(400); // the .finally (and any defective repaint) lands
    const after26 = await chrome.eval(CARD_COPY);
    check('26: the DONE card copy is BYTE-UNCHANGED across the settle — the '
      + 'SETUP lines never repaint over a delivered file (red pre-313: the '
      + 'settle re-derived the 2 s copy to 4 s beside the 2 s-planned blob)',
    done26.q === after26.q && done26.est === after26.est
      && done26.p === after26.p && done26.chip === after26.chip
      && done26.dests === after26.dests && done26.cta === after26.cta,
    JSON.stringify({ done26, after26 }));
    // GH-313 review r2 P2: a LATER repaint over the still-DONE card (locale
    // switch is the shipped one) must ALSO describe the delivered file —
    // the press-time snapshot is the delivered state's budget truth, so
    // the de repaint says 2 s, never the settled next-plan 4 s (red: the
    // settle's syncCardActions chain overwrote the snapshot through the
    // flipped photos key, and the de repaint derived 4 s)
    await chrome.eval(`window.__i18n.setLocale('de'); true`);
    await waitFor(chrome, `window.__i18n.locale() === 'de'`, '26: de applied');
    await sleep(300); // the locale listeners repaint the card
    const deQ = await chrome.eval(
      `document.querySelector('#ob-pb-card .ob-pb-quality span')?.textContent ?? ''`);
    const deWant = await chrome.eval(`window.__i18n.t('playback.qualityMontage',
      { rate: '2.5' }) + ' · ' + window.__i18n.t('playback.qualityLine',
      { sec: 2, res: '1080p' })`);
    check('26: the locale-switch repaint over the DONE card still describes '
      + 'the DELIVERED clip (press-time 2 s budget, delivered ×2.5 rate — '
      + 'never the settled 4 s next-plan budget)',
    deQ === deWant, JSON.stringify({ deQ, deWant }));
    await chrome.eval(`window.__i18n.setLocale('en'); true`);
    await waitFor(chrome, `window.__i18n.locale() === 'en'`, '26: en restored');
    // …and the settled truth reaches the NEXT card: a reopen drops the
    // delivered state (fresh snapshot; the stubbed probe now settles
    // ok:false instantly) and the SETUP plan derives the 4 s wire wall —
    // the latch protects the delivered copy, it never wedges the flow
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '24');
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '26: card reopened');
    await ctaArmed(chrome);
    check('26: the REOPENED card derives the settled wire wall '
      + '(opts.budgetSec = 4 — nothing wedges past the delivered latch)',
    await chrome.eval('window.__playback.plan().opts.budgetSec') === 4);
    await chrome.eval('document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, '26 (reopen)');
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErr26 = await chrome.eval('__test.errors.slice()');
    check('26: zero app errors', appErr26.length === 0, JSON.stringify(appErr26));
    check('26: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 24: GH-305 — the FULL-GAME streaming export mode -------------------
// The save card grows a mode row (montage | full game). Full mode's tiles
// are the STARTERS (dest chosen at the v3 `begin` — no CTA, the setup hint
// carries the instruction) and the whole attempt rides ONE latch: begin →
// positioned v3 chunks DURING the (mocked) render → end (exactness) → the
// shell's ob:save-video-result resolves the same saveWait machinery every
// awaited montage save uses. The ENGINE half (real render, budget
// exemption, memory) is pinned in e2e-export FULL1-FULL3 — this arm gates
// the CARD half:
//   24a  v2-only shell (chunk hint, NO `full`): the mode row renders with
//        FULL disabled + the honest localized reason; the seam switch
//        refuses (the degrade red).
//   24b  v3 shell: full offered; REAL mode-button click hides the CTA,
//        swaps the setup hint to playback.fullHint, ARMS the tiles with no
//        blob; a Files tile click posts v3 begin (NO bytes, the plan's own
//        mime) → re-sliced positioned chunks (a piece above the negotiated
//        chunk cap must split with correct `at`s; a low-offset backpatch
//        rides as-is) → end{chunks,bytes} == the extent; the shell result
//        paints Saved + the done tile; zero v1 posts; the full plan emits
//        NO budgetSec.
//   24c  a failing render posts `abort` (the shell frees slot + partial
//        file NOW), releases the latch, fails the tapped tile honestly.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=7&archive=1&arm=305full`,
    { port: CDP + 24 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'GH-305 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '24: __playback seam');
    await fire(chrome, '24: shot A', { v0: 1.6, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, '24: shot B', { v0: 0.9, phi: 0.4, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sid24 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('24: session opens',
      await chrome.eval(`window.__playback.openSession(${sid24})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '24: player open');

    // ---- 24w (GH-438): PLAIN WEB — no shell at all. The full-mode note
    // must name the browser's real constraint (no streaming save) and the
    // supported path (the highlight clip), NEVER the "update the app"
    // shell copy — there is no app to update on this surface. Probed
    // BEFORE 24a fabricates window.webkit.messageHandlers. --------------------
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '24w: card open');
    const web24 = await chrome.eval(`(() => {
      const full = document.querySelector('.ob-pb-mode[data-mode=full]');
      const note = document.querySelector('.ob-pb-modenote');
      return { rowThere: !!full, disabled: full?.disabled === true,
        noteOn: note?.classList.contains('on') === true,
        noteText: note?.textContent ?? '',
        // review r3 P2: the web-voice note NEVER rides dataset.i18n — the
        // locale callback applyDoms the card before syncModeRow, so a
        // stale-dictionary live switch would warn + flash English off the
        // dataset key; the syncModeRow re-derive owns this repaint.
        noDataset: !('i18n' in (note?.dataset ?? {})),
        want: window.__i18n.t('playback.fullNeedsWeb'),
        shellCopy: window.__i18n.t('playback.fullNeedsShell') };
    })()`);
    check('24w: plain web — full disabled, web-voice reason (never "update the app")',
      web24.rowThere && web24.disabled && web24.noteOn && web24.noteText === web24.want
      && web24.noteText !== web24.shellCopy && web24.noDataset,
      JSON.stringify(web24));
    await chrome.eval('window.__playback.close()');
    await chrome.eval(`window.__playback.openSession(${sid24})`);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '24w: player reopen');

    // ---- 24a: v2-only shell — full DISABLED with the honest reason ----------
    await chrome.eval(`(() => {
      window.__fs = { ops: [], parts: [], dest: null, v1Posts: 0 };
      window.webkit = { messageHandlers: {
        obSaveVideo: { postMessage: () => { window.__fs.v1Posts++; } },
        obSaveVideoStream: { postMessage: (m) => new Promise((res) => {
          const S = window.__fs;
          S.ops.push({ v: m.v, op: m.op, name: m.name, seq: m.seq, at: m.at,
            hasBytes: 'bytes' in m, bytes: m.bytes, chunks: m.chunks,
            mime: m.mime, dest: m.dest });
          if (m.op === 'begin') S.dest = m.dest;
          if (m.op === 'chunk') S.parts.push({ at: m.at, b64: m.b64 });
          if (m.op === 'end') {
            setTimeout(() => window.dispatchEvent(new CustomEvent(
              'ob:save-video-result', { detail: { ok: true, name: m.name,
                dest: S.dest } })), 60);
          }
          setTimeout(() => res({ ok: true }), 2);
        }) },
      } };
      // v2-only: chunk advertised, NO full — the pre-305 shell class
      window.__obSaveVideo = { v: 1, chunk: 786432,
        dests: ['photos', 'files'] };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '24a: card open');
    check('24a: CTA armed (montage mode, probe settled)', await ctaArmed(chrome));
    const a24 = await chrome.eval(`(() => {
      const full = document.querySelector('.ob-pb-mode[data-mode=full]');
      const note = document.querySelector('.ob-pb-modenote');
      return { rowThere: !!full, disabled: full?.disabled === true,
        noteOn: note?.classList.contains('on') === true,
        noteText: note?.textContent ?? '',
        want: window.__i18n.t('playback.fullNeedsShell'),
        seamSwitch: window.__playback.setExportMode('full'),
        mode: window.__playback.exportMode(),
        ok: window.__playback.fullModeOk() };
    })()`);
    check('24a: v2-only shell — full disabled, honest reason, seam refuses',
      a24.rowThere && a24.disabled && a24.noteOn && a24.noteText === a24.want
      && a24.seamSwitch === false && a24.mode === 'montage' && a24.ok === false,
    JSON.stringify(a24));

    // ---- 24b: v3 shell — the whole starter-tile attempt ----------------------
    await chrome.eval('window.__playback.close()');
    await chrome.eval(`window.__playback.openSession(${sid24})`);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '24b: player reopen');
    await chrome.eval(`(() => {
      window.__obSaveVideo = { v: 1, chunk: 786432, full: 4294967296,
        dests: ['photos', 'files'] };
      window.__realRD305 = window.__export.renderDrill;
      window.__export.renderDrill = async (records, opts) => {
        window.__fsOpts = {
          hasStream: typeof opts?.stream?.post === 'function',
          budgetSec: opts?.budgetSec ?? null,
          records: records.length };
        // 900000 > the negotiated 786432 cap → the driver must SPLIT with
        // correct absolute offsets; the 4-byte piece at 8 is the muxer
        // finalize-backpatch class (position < extent)
        const A = new Uint8Array(900000);
        for (let i = 0; i < A.length; i++) A[i] = i & 255;
        const B = new Uint8Array(500000);
        for (let i = 0; i < B.length; i++) B[i] = (i * 7) & 255;
        const P = new Uint8Array([9, 9, 9, 9]);
        await opts.stream.post(A, 0);
        opts.onProgress?.(30, 60, 10);
        await opts.stream.post(B, A.length);
        await opts.stream.post(P, 8);
        opts.onProgress?.(60, 60, 10);
        const n = A.length + B.length;
        return { size: n, streamedBytes: n, frames: 60, clipSec: 1,
          ext: 'mp4', wallSec: 0.1, segments: [60], montageRate: 1 };
      };
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '24b: card open');
    check('24b: CTA armed before the switch', await ctaArmed(chrome));
    const fmt24 = await chrome.eval(
      `window.__export.planFormat({ tier: 'standard', height: 1080 })`);
    check('24b: planFormat resolves a container', fmt24 === 'mp4'
      || fmt24 === 'webm', String(fmt24));
    await chrome.eval(
      'document.querySelector(".ob-pb-mode[data-mode=full]").click()');
    await sleep(150);
    const b24 = await chrome.eval(`(() => {
      const go = document.querySelector('#ob-pb-card .ob-pb-go');
      const hint = document.querySelector('.ob-pb-desthint');
      const tiles = [...document.querySelectorAll('.ob-pb-dest')];
      return { mode: window.__playback.exportMode(),
        pressed: document.querySelector('.ob-pb-mode[data-mode=full]')
          ?.getAttribute('aria-pressed'),
        goHidden: !!go && getComputedStyle(go).display === 'none',
        hintKey: hint?.dataset.i18n,
        hintShown: hint?.classList.contains('off') === false,
        hintText: hint?.textContent,
        wantHint: window.__i18n.t('playback.fullHint'),
        tiles: tiles.map((x) => x.dataset.dest).join(','),
        armed: tiles.length > 0 && tiles.every((x) => !x.disabled) };
    })()`);
    const wantTiles24 = fmt24 === 'mp4' ? 'photos,files' : 'files';
    check('24b: full mode — CTA gone, fullHint shown, starter tiles ARMED '
      + 'with no blob, Photos gated on mp4-at-encode',
    b24.mode === 'full' && b24.pressed === 'true' && b24.goHidden
      && b24.hintKey === 'playback.fullHint' && b24.hintShown
      && b24.hintText === b24.wantHint && b24.tiles === wantTiles24
      && b24.armed, JSON.stringify({ b24, wantTiles24 }));
    await chrome.eval(
      'document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome, `document.querySelector('.ob-pb-ptext .ob-nums')
      ?.textContent === window.__i18n.t('playback.saved')`,
    '24b: the shell result painted Saved', 100, 100);
    const w24 = await chrome.eval(`(() => {
      const S = window.__fs;
      const files = document.querySelector('.ob-pb-dest[data-dest=files]');
      return { seq: S.ops.map((o) => o.op).join(','),
        begin: S.ops.find((o) => o.op === 'begin'),
        end: S.ops.find((o) => o.op === 'end'),
        chunkOps: S.ops.filter((o) => o.op === 'chunk')
          .map((o) => ({ v: o.v, seq: o.seq, at: o.at })),
        parts: S.parts.map((p) => ({ at: p.at, len: atob(p.b64).length })),
        v1Posts: S.v1Posts,
        opts: window.__fsOpts,
        tileDone: files?.classList.contains('ob-pb-dest--done') === true };
    })()`);
    check('24b: v3 wire shape — begin(no bytes) -> positioned chunks -> '
      + 'end(exactness)', /^begin(,chunk)+,end$/.test(w24.seq)
      && w24.begin?.v === 3 && w24.begin.hasBytes === false
      && w24.begin.dest === 'files'
      && w24.begin.mime === (fmt24 === 'mp4' ? 'video/mp4' : 'video/webm')
      && w24.end?.v === 3 && w24.end.chunks === 4
      && w24.end.bytes === 1400000 && w24.v1Posts === 0,
    JSON.stringify({ seq: w24.seq, begin: w24.begin, end: w24.end,
      v1Posts: w24.v1Posts }));
    check('24b: the oversized piece SPLIT at the negotiated cap with '
      + 'absolute offsets (backpatch rides as-is)',
    JSON.stringify(w24.chunkOps) === JSON.stringify([
      { v: 3, seq: 0, at: 0 }, { v: 3, seq: 1, at: 786432 },
      { v: 3, seq: 2, at: 900000 }, { v: 3, seq: 3, at: 8 }]),
    JSON.stringify(w24.chunkOps));
    check('24b: full plans emit NO budgetSec and carry the stream',
      w24.opts?.hasStream === true && w24.opts.budgetSec === null
      && w24.opts.records === 2, JSON.stringify(w24.opts));
    check('24b: the tapped tile settled DONE off the shell result',
      w24.tileDone === true);
    // byte truth: reassemble the positioned parts and verify the backpatch
    const bytes24 = await chrome.eval(`(() => {
      const S = window.__fs;
      let extent = 0;
      const parts = S.parts.map((p) => {
        const bin = atob(p.b64);
        extent = Math.max(extent, p.at + bin.length);
        return { at: p.at, bin };
      });
      const buf = new Uint8Array(extent);
      for (const p of parts) {
        for (let i = 0; i < p.bin.length; i++) {
          buf[p.at + i] = p.bin.charCodeAt(i);
        }
      }
      let bad = 0;
      for (let i = 0; i < 900000; i++) {
        const want = (i >= 8 && i < 12) ? 9 : (i & 255);
        if (buf[i] !== want) bad++;
      }
      for (let i = 0; i < 500000; i++) {
        if (buf[900000 + i] !== ((i * 7) & 255)) bad++;
      }
      return { extent, bad };
    })()`);
    check('24b: the assembled bytes are exact (append + backpatch, no holes)',
      bytes24.extent === 1400000 && bytes24.bad === 0,
      JSON.stringify(bytes24));

    // ---- 24c: a failing render aborts the wire + fails the tile honestly ----
    await chrome.eval(`(() => {
      window.__fs.ops = [];
      window.__fs.parts = [];
      window.__export.renderDrill = async () => {
        throw new Error('boom-305');
      };
    })()`);
    await waitFor(chrome, `(() => {
      const tiles = [...document.querySelectorAll('.ob-pb-dest')];
      return tiles.length && tiles.every((x) => !x.disabled);
    })()`, '24c: tiles re-armed after the settled save');
    await chrome.eval(
      'document.querySelector(".ob-pb-dest[data-dest=files]").click()');
    await waitFor(chrome,
      `window.__fs.ops.some((o) => o.op === 'abort')`,
      '24c: abort crossed the wire');
    const c24 = await chrome.eval(`(() => {
      const files = document.querySelector('.ob-pb-dest[data-dest=files]');
      return { seq: window.__fs.ops.map((o) => o.op).join(','),
        failed: files?.classList.contains('ob-pb-dest--failed') === true,
        ptext: document.querySelector('.ob-pb-ptext .ob-nums')?.textContent ?? '',
        want: window.__i18n.t('export.failed', { message: 'boom-305' }) };
    })()`);
    check('24c: begin -> abort, tile failed, honest row copy, latch released',
      c24.seq === 'begin,abort' && c24.failed && c24.ptext === c24.want,
      JSON.stringify(c24));

    await chrome.eval(`(() => {
      window.__export.renderDrill = window.__realRD305;
      window.__playback.setExportMode('montage');
    })()`);
    await chrome.eval('window.__playback.close()');
    const appErr24 = await chrome.eval('__test.errors.slice()');
    check('24: zero app errors', appErr24.length === 0, JSON.stringify(appErr24));
    check('24: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- arm 27: GH-364 — the strike-point teaching overlay (WYSIWYG pair) ------
// The save card grows an Advanced toggle (default OFF, structural offer per
// the GH-259/GH-305 laws); the plan carries opts.strike ONLY while armed
// (title = the ACTIVE locale's caption — the one burned-text source); the
// LIVE preview layer (#ob-pb-strike) paints the same strikeglyph.js plate
// on the same alpha law the export composites (segment start → the
// record's impact anchor → a one-settle-beat smootherstep bow-out). The
// burned-side truth is pinned on real bytes in e2e-export S1-S4 — this arm
// gates the CARD + PREVIEW half:
//   27a  offer + default OFF: toggle present + unchecked, plan carries no
//        strike key; a REAL on→off round trip returns the plan
//        JSON-byte-identical (the arm-3h plan-stability law).
//   27b  armed: the plan carries the ACTIVE locale's caption, and a zh-CN
//        switch swaps it (i18n of the burned text at its one source).
//   27c  the live preview (the 11h-style identity): the layer's alpha
//        follows the leaf-derived law at scrub points computed from the
//        seam's OWN tOff (pre-impact exactly 1, mid-linger in (0,1),
//        post-linger exactly 0 — the same pure function the export maps to
//        frames); the live tOff/glyph equal an independent in-page
//        strikeglyph.js derivation (one leaf truth); painted pixels stay
//        inside plateRect(+2px); disarming clears the layer.
//   27d  both modes carry the option: a v3 shell's full mode keeps
//        opts.strike in the plan verbatim (the engine maps it identically
//        on the streamed path — mode-agnostic by construction).
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?seed=9&archive=1&arm=364strike`,
    // offset 2: INSIDE a 30-wide band's CDP slice (base+0..14) — offsets
    // ≥ 15 spill into the NEIGHBOR band and launchChrome refuses a port
    // under a live foreign claim (measured: +22 crashed this arm under
    // run-gate --band). Sequential arms close their browsers, so a low
    // offset reused by an earlier arm is free again here.
    { port: CDP + 2 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'GH-364 boot');
    await waitFor(chrome, 'typeof window.__playback?.open === "function"',
      '27: __playback seam');
    // CONTROLLED shots (the 15x layout law; probed on this seed: both
    // settle to AIM, impacts at ~0.31 s / ~0.23 s): shot A is a spin-heavy
    // draw stroke — early definite cue-ball impact (the plate's bow-out
    // anchor) with a dot well off face center
    await chrome.eval(
      '__test.layout([{id:0,x:-0.2,y:-0.35},{id:8,x:0.05,y:0.15}])');
    await fire(chrome, '27: shot A',
      { v0: 1.8, phi: Math.atan2(0.5, 0.25), theta: 0.35, a: 0.3, b: -0.4 });
    await chrome.eval(
      '__test.layout([{id:0,x:0.2,y:0.4},{id:8,x:0.4,y:0.8}])');
    await fire(chrome, '27: shot B',
      { v0: 1.4, phi: Math.atan2(0.4, 0.2), theta: 0, a: -0.2, b: 0.3 });
    await chrome.eval('window.__archive.flush()');
    const sid27 = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('27: session opens',
      await chrome.eval(`window.__playback.openSession(${sid27})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      '27: player open');
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '27: card open');
    await waitFor(chrome,
      'document.getElementById("ob-pb-strike-tog") !== null',
      '27a: toggle offered');

    // ---- 27a: default OFF + the plan-stability round trip -------------------
    const a0 = await chrome.eval(`(() => {
      const tog = document.getElementById('ob-pb-strike-tog');
      const opts = window.__playback.plan().opts;
      return { checked: tog.checked === true,
        armed: window.__playback.strikeArmed() === true,
        hasKey: 'strike' in opts, plan: JSON.stringify(opts) };
    })()`);
    check('27a: default OFF — unchecked, disarmed, plan carries no strike key',
      !a0.checked && !a0.armed && !a0.hasKey,
      JSON.stringify({ ...a0, plan: undefined }));
    await realClick(chrome, '.ob-pb-adv', '27a: expand Advanced');
    await realClick(chrome, '.ob-pb-strikerow:has(#ob-pb-strike-tog)', '27a: real toggle on');
    const a1 = await chrome.eval(`(() => {
      const opts = window.__playback.plan().opts;
      return { checked: document.getElementById('ob-pb-strike-tog').checked,
        armed: window.__playback.strikeArmed() === true,
        title: opts.strike?.title ?? null,
        want: window.__i18n.t('playback.strikeTitle') };
    })()`);
    check('27a: the REAL control arms it — plan carries the localized caption',
      a1.checked && a1.armed && !!a1.title && a1.title === a1.want,
      JSON.stringify(a1));
    await realClick(chrome, '.ob-pb-strikerow:has(#ob-pb-strike-tog)', '27a: real toggle off');
    const a2 = await chrome.eval(
      'JSON.stringify(window.__playback.plan().opts)');
    check('27a: OFF plan JSON-byte-identical after the round trip',
      a2 === a0.plan);

    // ---- 27a2 (GH-475): the annotation knob rows ------------------------------
    // Mounted WITH the overlay row against a capable chain (leaf fmtElev +
    // __export.strikeAnnoCapable + the ×7 keys), default OFF/unchecked,
    // DISABLED until the overlay arms (a knob without the plate burns
    // nothing), and the REAL control writes the plan fields.
    {
      const k0 = await chrome.eval(`(() => {
        const rows = [...document.querySelectorAll('.ob-pb-strikeanno')];
        const togs = rows.map((r) => r.querySelector('.ob-pb-striketog'));
        return { n: rows.length,
          capable: window.__export?.strikeAnnoCapable === true,
          keys: rows.map((r) => r.querySelector('.ob-caps')?.dataset.i18n),
          checked: togs.map((t2) => t2?.checked),
          disabled: togs.map((t2) => t2?.disabled) }; })()`);
      check('27a2: two knob rows mount with the overlay row — localized '
        + 'labels, unchecked, disabled while the overlay is off',
      k0.capable && k0.n === 2
        && k0.keys.join() === 'playback.strikeElev,playback.strikePower'
        && k0.checked.every((c) => c === false)
        && k0.disabled.every((d) => d === true),
      JSON.stringify(k0));
      await realClick(chrome, '.ob-pb-strikerow:has(#ob-pb-strike-tog)', '27a2: overlay on');
      const k1 = await chrome.eval(`(() => {
        const togs = [...document.querySelectorAll('.ob-pb-strikeanno .ob-pb-striketog')];
        return { disabled: togs.map((t2) => t2.disabled) }; })()`);
      check('27a2: the knobs arm WITH the overlay',
        k1.disabled.every((d) => d === false), JSON.stringify(k1));
      await realClick(chrome, '.ob-pb-strikeanno', '27a2: elevation knob on');
      const k2 = await chrome.eval(`(() => {
        const s = window.__playback.plan().opts.strike;
        return { anno: window.__playback.strikeAnno(),
          plan: { readout: s?.readout, elev: s?.elev, power: s?.power } };
      })()`);
      check('27a2: the REAL elevation control writes the plan (readout '
        + 'retired on the user path, power still off)',
      k2.anno.elev === true && k2.anno.power === false
        && k2.plan.readout === false && k2.plan.elev === true
        && k2.plan.power === false,
      JSON.stringify(k2));
      // restore: knobs off, overlay off (the 27b block re-arms itself)
      await chrome.eval('window.__playback.setStrikeAnno("elev", false)');
      await chrome.eval('window.__playback.setStrike(false)');
      const k3 = await chrome.eval(
        'JSON.stringify(window.__playback.plan().opts)');
      check('27a2: full OFF round trip stays plan-byte-identical',
        k3 === a0.plan);
    }

    // ---- 27b: the caption follows the ACTIVE locale --------------------------
    await chrome.eval('window.__playback.setStrike(true)');
    const b0 = await chrome.eval('window.__playback.plan().opts.strike.title');
    await chrome.eval(`window.__i18n.setLocale('zh-CN')`);
    await waitFor(chrome,
      `window.__i18n.t('playback.strikeTitle') === '击球点'`,
      '27b: zh-CN dictionary converged');
    const b1 = await chrome.eval('window.__playback.plan().opts.strike.title');
    check('27b: the plan caption switches with the locale',
      b1 === '击球点' && b1 !== b0, JSON.stringify({ b0, b1 }));
    await chrome.eval(`window.__i18n.setLocale('en')`);
    await waitFor(chrome,
      `window.__i18n.t('playback.strikeTitle') === '${b0}'`,
      '27b: en dictionary back');

    // ---- 27c: the live preview follows the ONE alpha law ---------------------
    await chrome.eval(
      'document.querySelector("#ob-pb-card .ob-pb-dismiss")?.click()');
    await waitFor(chrome, 'window.__playback.cardOpen() !== true',
      '27c: card closed (option stays armed)');
    const c0 = await chrome.eval(
      '(window.__playback.seek(0), window.__playback.strikeLive())');
    check('27c: pre-impact plate fully on (alpha exactly 1, segment 0)',
      c0 && c0.armed === true && c0.seg === 0 && c0.alpha === 1
      && Number.isFinite(c0.tOff) && c0.tOff > 0.02 && c0.tOff < c0.dur,
      JSON.stringify(c0));
    const tImp = c0.segStart + Math.min(c0.tOff, c0.dur);
    const mid = await chrome.eval(
      `(window.__playback.seek(${tImp} + 0.12), window.__playback.strikeLive())`);
    check('27c: mid-linger bow-out (0 < alpha < 1)',
      mid && mid.seg === 0 && mid.alpha > 0 && mid.alpha < 1,
      JSON.stringify(mid));
    const post = await chrome.eval(
      `(window.__playback.seek(${tImp} + 0.26), window.__playback.strikeLive())`);
    check('27c: one settle beat after impact the plate is gone (alpha 0)',
      post && post.seg === 0 && post.alpha === 0, JSON.stringify(post));
    // one leaf truth: the seam's tOff/glyph == an independent in-page
    // derivation over the record bytes (the derivation the EXPORT maps)
    const ident = await chrome.eval(`(async () => {
      const sg = await import('/app/strikeglyph.js');
      let rec = window.__playback.plan().records[0];
      if (typeof rec === 'string') rec = JSON.parse(rec);
      const dur = rec.events.length ? rec.events[rec.events.length - 1].t : 0;
      const live = window.__playback.strikeLive();
      return { leafT: sg.impactTimeFor(rec, dur),
        leafG: JSON.stringify(sg.glyphFor(rec)),
        liveT: live.tOff, liveG: JSON.stringify(live.glyph) };
    })()`);
    check('27c: live preview and export read ONE leaf derivation',
      Math.abs(ident.leafT - ident.liveT) < 1e-12 && ident.leafG === ident.liveG,
      JSON.stringify(ident));
    // painted pixels confined to the leaf's own plateRect (+2px apron)
    const px = await chrome.eval(`(async () => {
      window.__playback.seek(0);
      const sg = await import('/app/strikeglyph.js');
      const el = document.getElementById('ob-pb-strike');
      const W = el.width, H = el.height;
      const img = el.getContext('2d').getImageData(0, 0, W, H).data;
      let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
      for (let y = 0; y < H; y += 2) {
        for (let x = 0; x < W; x += 2) {
          if (img[(y * W + x) * 4 + 3] > 0) {
            n++;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      const r = sg.plateRect({ W, H,
        title: window.__i18n.t('playback.strikeTitle') });
      return { n, box: [x0, y0, x1, y1], rect: r };
    })()`);
    check('27c: live plate painted and confined to plateRect (+2px)',
      px.n > 200 && px.box[0] >= px.rect.x - 2 && px.box[1] >= px.rect.y - 2
      && px.box[2] <= px.rect.x + px.rect.w + 2
      && px.box[3] <= px.rect.y + px.rect.h + 2,
      JSON.stringify(px));
    const offN = await chrome.eval(`(() => {
      window.__playback.setStrike(false);
      const el = document.getElementById('ob-pb-strike');
      const img = el.getContext('2d')
        .getImageData(0, 0, el.width, el.height).data;
      let n = 0;
      for (let i = 3; i < img.length; i += 4) if (img[i] > 0) n++;
      return n;
    })()`);
    check('27c: disarming clears the layer', offN === 0, `residue ${offN}`);

    // ---- 27d: full mode keeps the option in the plan -------------------------
    await chrome.eval(`(() => {
      window.webkit = { messageHandlers: {
        obSaveVideoStream: { postMessage: () => Promise.resolve({ ok: true }) },
      } };
      window.__obSaveVideo = { v: 1, chunk: 786432, full: 4294967296,
        dests: ['photos', 'files'] };
      window.__playback.setStrike(true);
    })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      '27d: card reopen');
    const d0 = await chrome.eval(`(() => {
      const sw = window.__playback.setExportMode('full');
      const opts = window.__playback.plan().opts;
      return { sw, mode: window.__playback.exportMode(),
        title: opts.strike?.title ?? null,
        want: window.__i18n.t('playback.strikeTitle'),
        budget: 'budgetSec' in opts };
    })()`);
    check('27d: the full-mode plan carries the option verbatim',
      d0.sw === true && d0.mode === 'full' && d0.title === d0.want
      && d0.budget === false, JSON.stringify(d0));
    await chrome.eval(`(() => {
      window.__playback.setExportMode('montage');
      window.__playback.setStrike(false);
    })()`);
    await chrome.eval('window.__playback.close()');
    const appErr27 = await chrome.eval('__test.errors.slice()');
    check('27: zero app errors', appErr27.length === 0,
      JSON.stringify(appErr27));
    check('27: zero console errors', errs.length === 0,
      errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// =============================================================================
// ---- LD family: GH-363 pre-strike lead-in (the leads-ON world) --------------
// The legacy families run with the lead option pinned OFF (the waitReady
// doc); THIS family re-enables the shipped DEFAULT and owns the leads-on
// world: LD-a the lead-inclusive schedule under the GH-474 camera-settle
// law (every lead carries its FULL quantized T_pre — choreography starts
// at the walk's arrival, never inside the transition); LD-b plan emission
// + the option-off byte-stability law;
// LD-c live/export WYSIWYG identity across a fused beat window + lead head
// frames on a REAL renderDrill (cue pose fingerprints) + the GH-474
// static-address-through-the-walk frame-exact proof, with the
// option-off control proving the fused-arm teeth; LD-d the montage degrade
// ladder red/green against a replicated first-fit sweep + the amber lead
// notice; LD-e reopen determinism (the jittered schedule is a pure
// function of the records); LD-f GH-433 — a lead-only window associates
// to its parent shot (armed CTA + full slice + lead), a beat-interior
// window refuses HONESTLY (playback.trimNoContent visible, never a
// silent disarm); LD-g (GH-474) stroke-start >= camera-settle on the
// FIXED mounts (broadcast/overhead, frame-exact render sampling);
// LD-h (GH-474/475) the strike plate rides [backswing, strike) on the
// hash surface + the live-preview alpha mirror + the annotation knobs.
{
  const errs = [];
  const chrome = await launchChrome(
    // offset 3: INSIDE the declared PORT_INVENTORY (cdp 25 → CDP+0..+24;
    // the arm-27 lesson — an offset past the declaration escapes the
    // run-gate band claim). Sequential families close their browsers, so
    // a low offset reused by an earlier family is free again here.
    `http://127.0.0.1:${PORT}/app.html?seed=5&archive=1`, { port: CDP + 3 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'LD boot');
    await waitFor(chrome, 'typeof window.__playback?.setLeadIn === "function"',
      'LD: setLeadIn seam');
    check('LD: the shipped default re-arms (the waitReady pin is a product '
      + 'toggle, not a backdoor)',
    await chrome.eval('window.__playback.setLeadIn(true)') === true
      && await chrome.eval('window.__playback.leadIn()') === true);
    // the 15-family session recipe: two POV→POV boundaries (mild + worst)
    await fire(chrome, 'LD: shot A', { v0: 4.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    await fire(chrome, 'LD: shot B', { v0: 0.55, phi: Math.PI / 2 + 0.5, theta: 0, a: 0, b: 0 });
    await fire(chrome, 'LD: shot C', { v0: 1.3, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 });
    await chrome.eval('window.__archive.flush()');
    const sidLD = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('LD: session opens',
      await chrome.eval(`window.__playback.openSession(${sidLD})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true', 'LD: player open');
    await chrome.eval('window.__playback.seek(0.02)');
    check('LD: pov assigned', await chrome.eval('window.__playback.setCam("pov")'));
    const q60 = (s) => Math.round(s * 60) / 60;
    const stLD = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.state()))');
    const ld = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.leads()))');

    // ---- LD-a: the lead-inclusive schedule + fusion (not stacking) ------------
    check('LD-a: every record probes a v2 lead (pre > 0, tier v2)',
      ld.tiers.every((t2) => t2 === 'v2')
      && ld.pre.every((p) => p && p.v2 > 0 && p.v1 > 0 && p.v1s > 0),
    JSON.stringify(ld));
    check('LD-a: both boundaries carry walk beats (the fusion fixture)',
      stLD.beats[0] > 0 && stLD.beats[1] > 0 && stLD.beats[2] === null,
    JSON.stringify(stLD.beats));
    check('LD-a: segment 0 (no beat in) leads with the FULL quantized T_pre',
      Math.abs(ld.leads[0] - q60(ld.pre[0].v2)) < 1e-9,
    JSON.stringify({ lead: ld.leads[0], pre: ld.pre[0].v2 }));
    // GH-474 camera-settle law (RETARGET of the GH-363 overlay arithmetic;
    // justification on the issue): the choreography clock starts at the
    // walk's ARRIVAL, so beat-fed boundaries carry the FULL quantized
    // T_pre — the walk frames show a static address stance instead of
    // overlaying feathers (the owner-reported build-17 defect: strokes at
    // 1.9 m/s of camera speed; the retired law was
    // T_add = max(0, T_pre − (T_beat − BEAT_HOLD))).
    check('LD-a (GH-474): beat-fed boundaries carry the FULL quantized '
      + 'T_pre — choreography starts at the walk arrival (the settle), '
      + 'never inside the transition',
    Math.abs(ld.leads[1] - q60(ld.pre[1].v2)) < 1e-9
      && Math.abs(ld.leads[2] - q60(ld.pre[2].v2)) < 1e-9,
    JSON.stringify({ leads: ld.leads, pre: ld.pre.map((p) => p.v2),
      beats: stLD.beats }));
    {
      let acc = 0;
      let cumOk = true;
      for (let i = 0; i < stLD.durs.length; i++) {
        acc += stLD.leads[i];
        if (Math.abs(stLD.cum[i] - acc) > 1e-9) cumOk = false;
        acc += segEnd(stLD, i) + (stLD.beats[i] ?? 0);
      }
      check('LD-a: cum[i] = the lead-inclusive play start; total = the full '
        + 'sum', cumOk && Math.abs(stLD.total - acc) < 1e-9,
      JSON.stringify({ cum: stLD.cum, total: stLD.total }));
    }

    // ---- LD-b: plan emission + the option-off byte-stability law --------------
    const planLD = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('LD-b: the plan carries opts.leads mirroring the live schedule '
      + '(sec per slice, tier v2, fuse on the beat-fed boundaries)',
    Array.isArray(planLD.opts.leads) && planLD.opts.leads.length === 3
      && planLD.opts.leads.every((l, j) => l && l.tier === 'v2'
        && Math.abs(l.sec - stLD.leads[j]) < 1e-9
        && l.fuse === (j > 0)),
    JSON.stringify(planLD.opts.leads));
    await chrome.eval('window.__playback.setLeadIn(false)');
    const offLD = await chrome.eval(`(() => ({
      leads: window.__playback.state().leads.slice(),
      total: window.__playback.state().total,
      hasKey: 'leads' in window.__playback.plan().opts }))()`);
    const sumLeads = stLD.leads.reduce((s, v) => s + v, 0);
    check('LD-b: option OFF — no opts.leads key (plan byte-stability), the '
      + 'live schedule drops every lead and the timeline shrinks by exactly '
      + 'their sum', offLD.hasKey === false
      && offLD.leads.every((v) => v === 0)
      && Math.abs(offLD.total - (stLD.total - sumLeads)) < 1e-9,
    JSON.stringify({ offLD, sumLeads }));
    await chrome.eval('window.__playback.setLeadIn(true)');
    const backLD = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.leads()))');
    check('LD-b: option back ON — the schedule returns byte-identical '
      + '(deterministic jitter, no state bleed)',
    JSON.stringify(backLD) === JSON.stringify(ld));

    // ---- LD-c: live/export WYSIWYG identity across the fused window -----------
    // Trim to the mild boundary (the 15e shape): slice 0 carries the kept
    // walk, slice 1 leads in fused. The export samples the CUE FINGERPRINT
    // (cuePostState().frame — record-clock t + tip/axis) per encoded frame;
    // the live player must pose the SAME cue at the same output instants
    // through the fused arm (different clock offsets, same record clock).
    const leadStart1 = stLD.cum[1] - stLD.leads[1];
    const beatStart0 = leadStart1 - stLD.beats[0];
    await chrome.eval(`window.__playback.setTrim(${beatStart0 - 1.0}, ${stLD.cum[1] + 1.0})`);
    const planLC = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('LD-c: the trimmed plan keeps the walk + the fused lead '
      + '(2 records; lead only on slice 1 — a mid-shot head never leads)',
    planLC.records.length === 2 && planLC.opts.beats?.[0]?.beatSec > 0
      && planLC.opts.leads?.[0] === null
      && planLC.opts.leads?.[1]?.fuse === true
      && Math.abs(planLC.opts.leads[1].sec - stLD.leads[1]) < 1e-9,
    JSON.stringify({ beats: planLC.opts.beats?.map((w) => w?.beatSec),
      leads: planLC.opts.leads }));
    const expLD = await chrome.eval(`(async () => {
      const plan = window.__playback.plan();
      const frames = [];
      let res;
      try {
        res = await window.__export.renderDrill(plan.records, { ...plan.opts,
          width: 320, height: 180, keepBlob: false, noDownload: true,
          withAudio: false,
          onProgress: () => {
            const f = window.__test.cuePostState()?.frame ?? null;
            frames.push(f ? { t: f.t, visible: f.visible === true,
              tip: f.tip ?? null } : null);
          } });
      } catch (e) { return { err: String(e) }; }
      return { frames, segments: res.segments };
    })()`);
    check('LD-c: the REAL fused export succeeded', !expLD.err
      && expLD.segments?.length === 2, JSON.stringify({ err: expLD.err,
      segments: expLD.segments }));
    if (!expLD.err) {
      const beatF = Math.round(stLD.beats[0] * 60);
      const H1 = Math.round(planLC.opts.leads[1].sec * 60);
      const tail0At = expLD.segments[0] - beatF; // first walk frame index
      // fused-arm presence: the staged cue is VISIBLE through the walk and
      // the head window (the pre-363 disarm law flipped — design 363 §5)
      const fusedWin = expLD.frames.slice(tail0At, expLD.segments[0] + H1);
      check('LD-c: the staged cue is armed + visible across the whole walk '
        + 'tail and lead head window', fusedWin.length === beatF + H1
        && fusedWin.every((f) => f && f.visible),
      JSON.stringify({ nulls: fusedWin.filter((f) => !f).length,
        hidden: fusedWin.filter((f) => f && !f.visible).length }));
      // record-clock convergence: the LAST fused frame sits one frame
      // before contact (t ≈ −1/60), and the walk's first frame at
      // −(beatF + H1)/60 — the fusion clock law, engine-side
      const tFirst = expLD.frames[tail0At]?.t;
      const tLast = expLD.frames[expLD.segments[0] + H1 - 1]?.t;
      check('LD-c: the fused cue clock converges on contact (first walk '
        + 'frame at −(T_beat + T_add), last head frame at −1/60)',
      Number.isFinite(tFirst) && Number.isFinite(tLast)
        && Math.abs(tFirst - (-(beatF + H1) / 60)) < 1e-6
        && Math.abs(tLast - (-1 / 60)) < 1e-6,
      JSON.stringify({ tFirst, tLast, beatF, H1 }));
      // GH-474 settle law, frame-exact (POV mount): the cue holds a
      // STATIC address stance through the WHOLE walk (tip world pose
      // byte-constant across every transition frame — the fused arm's
      // record clock sits before practice.start there) and the FIRST tip
      // motion lands at/after the head start, i.e. stroke-start ≥ the
      // walk's arrival. RED pre-474: feathering began BEAT_HOLD into the
      // walk (tips swept at walk speed — the red-proof's 68 marked
      // frames).
      {
        const walkTips = expLD.frames.slice(tail0At, expLD.segments[0]);
        const tip0 = walkTips[0]?.tip;
        const dMax = tip0 ? Math.max(...walkTips.map((f) => (f?.tip
          ? Math.max(...f.tip.map((v, i2) => Math.abs(v - tip0[i2]))) : Infinity)))
          : Infinity;
        const headTips = expLD.frames.slice(expLD.segments[0],
          expLD.segments[0] + H1);
        const moved = headTips.findIndex((f) => f?.tip
          && Math.max(...f.tip.map((v, i2) => Math.abs(v - tip0[i2]))) > 1e-6);
        check('LD-c (GH-474): static address through the whole walk — tip '
          + 'byte-constant across the transition, first motion only at/'
          + 'after the arrival (stroke-start >= camera-settle)',
        dMax < 1e-9 && moved >= 0,
        JSON.stringify({ dMax, firstMotionHeadFrame: moved, beatF, H1 }));
      }
      // live/export identity at sampled output instants (hold, mid-walk,
      // head): the live player's fused/lead arms must pose the same cue
      const tIn = beatStart0 - 1.0;
      const cmpLD = [];
      for (const j of [2, Math.floor(beatF / 2), beatF + Math.floor(H1 / 2),
        beatF + H1 - 2]) {
        const live = await chrome.eval(`(() => {
          window.__playback.seek(${tIn} + ${(tail0At + j)} / 60);
          const f = window.__test.cuePostState()?.frame ?? null;
          return f ? { t: f.t, visible: f.visible === true,
            tip: f.tip ?? null } : null; })()`);
        const exp = expLD.frames[tail0At + j];
        const dt = live && exp ? Math.abs(live.t - exp.t) : Infinity;
        const dTip = live?.tip && exp?.tip
          ? Math.max(...live.tip.map((v, k) => Math.abs(v - exp.tip[k])))
          : Infinity;
        cmpLD.push({ j, dt, dTip,
          ok: dt < 1e-6 && dTip < 1e-6 && live?.visible === exp?.visible });
      }
      check('LD-c: live and export cue poses match across the fused window '
        + '(record clock + tip within 1e-6 — WYSIWYG, one schedule)',
      cmpLD.every((c) => c.ok), JSON.stringify(cmpLD));
      // the option-off CONTROL: the same trimmed plan without leads keeps
      // the pre-363 beat-tail disarm — the fused-arm assertion has teeth
      await chrome.eval('window.__playback.setLeadIn(false)');
      const ctlLD = await chrome.eval(`(async () => {
        const plan = window.__playback.plan();
        const frames = [];
        try {
          await window.__export.renderDrill(plan.records, { ...plan.opts,
            width: 320, height: 180, keepBlob: false, noDownload: true,
            withAudio: false,
            onProgress: () => {
              frames.push(window.__test.cuePostState()?.armed === true);
            } });
        } catch (e) { return { err: String(e) }; }
        return { frames };
      })()`);
      await chrome.eval('window.__playback.setLeadIn(true)');
      const ctlTail = ctlLD.err ? []
        : ctlLD.frames.slice(tail0At, expLD.segments[0]);
      check('LD-c control: with the option OFF the beat tail disarms the '
        + 'cue exactly as pre-363 (the fused arm belongs to the option)',
      !ctlLD.err && ctlTail.length === beatF && ctlTail.every((a) => !a),
      JSON.stringify({ err: ctlLD.err, armed: ctlTail.filter(Boolean).length }));
    }
    await chrome.eval(`window.__playback.setTrim(0, ${stLD.total})`);

    // ---- LD-d: the montage degrade ladder red/green ----------------------------
    // Stub the ONE budget seam (the 17d byteBudgetCapable precedent): a
    // derived budget the sweep must honor. Expected tiers are REPLICATED
    // from the documented first-fit arithmetic over the schedule's own
    // numbers (the 17b law).
    const SEC_RED = 9;
    await chrome.eval(`(() => {
      window.__ldBud = { cap: window.__export.byteBudgetCapable,
        fn: window.__export.exportBudget };
      window.__export.byteBudgetCapable = true;
      window.__export.exportBudget = () => ({ sec: ${SEC_RED}, derived: true });
      return true; })()`);
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      'LD-d: card open');
    await sleep(400);
    const redLD = await chrome.eval(`(() => {
      const plan = JSON.parse(JSON.stringify(window.__playback.plan()));
      const notes = [...document.querySelectorAll('#ob-pb-card .ob-pb-beatwarn')];
      return { leads: plan.opts.leads ?? null,
        budgetSec: plan.opts.budgetSec ?? null,
        beats: plan.opts.beats?.map((w) => (w ? w.beatSec : null)) ?? null,
        noteOn: notes[1]?.classList.contains('on') === true,
        noteText: notes[1]?.textContent ?? '' };
    })()`);
    // node-side replication of the documented sweep (INNER_TAIL 0.25,
    // FINAL_TAIL 0.5, the planFits floor, beats first then the tier ladder)
    const repl = (() => {
      const n = 3;
      const innerF = 15;
      const budget = SEC_RED * 60 - 30 - Math.max(60, n);
      const beats = redLD.beats ?? [null, null, null];
      let spent = 0;
      for (let j = 0; j + 1 < n; j++) {
        spent += beats[j] ? Math.round(beats[j] * 60) : innerF;
      }
      const out = [];
      let degraded = 0;
      for (let j = 0; j < n; j++) {
        const w = j > 0 ? beats[j - 1] : null;
        let took = null;
        for (const [tier, pre] of [['v2', ld.pre[j].v2], ['v1', ld.pre[j].v1],
          ['v1s', ld.pre[j].v1s]]) {
          // GH-474: the FULL tier T_pre — no walk-overlap subtraction
          // (the camera-settle law; fused leads cost their whole window)
          const sec = q60(pre);
          const cost = Math.round(sec * 60);
          if (spent + cost <= budget) {
            // index = the ORIGINAL segment index (review r2 — untrimmed
            // plan, so it equals the slice position here)
            took = { sec, tier, fuse: !!w, index: j };
            spent += cost;
            break;
          }
        }
        out.push(took);
        if (!took || took.tier !== 'v2') degraded += 1;
      }
      return { out, degraded };
    })();
    check(`LD-d RED: at a ${SEC_RED} s derived budget the ladder degrades `
      + 'exactly as the documented first-fit sweep replicates (v2 → v1 → '
      + 'v1s → none; GH-474: every lead costs its FULL tier T_pre)',
    JSON.stringify(redLD.leads) === JSON.stringify(repl.out)
      && repl.degraded > 0 && redLD.budgetSec === SEC_RED,
    JSON.stringify({ got: redLD.leads, want: repl.out,
      degraded: repl.degraded, budgetSec: redLD.budgetSec }));
    const wantNote = await chrome.eval(`window.__i18n.t(${repl.degraded === 1
      ? "'playback.leadCutsOne'" : "'playback.leadCuts'"}, { n: ${repl.degraded} })`);
    check('LD-d RED: the amber lead notice paints the localized degrade '
      + 'count (the walkCuts idiom, its own line)',
    redLD.noteOn === true && redLD.noteText === wantNote,
    JSON.stringify({ noteOn: redLD.noteOn, noteText: redLD.noteText, wantNote }));
    await chrome.eval(`(() => {
      window.__export.byteBudgetCapable = window.__ldBud.cap;
      window.__export.exportBudget = window.__ldBud.fn;
      delete window.__ldBud;
      return true; })()`);
    await chrome.eval(
      'document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await sleep(400);
    const greenLD = await chrome.eval(`(() => {
      const plan = JSON.parse(JSON.stringify(window.__playback.plan()));
      return plan.opts.leads ?? null; })()`);
    check('LD-d GREEN: at the honest floor the whole schedule keeps the v2 '
      + 'tier (nothing degrades)',
    Array.isArray(greenLD) && greenLD.every((l) => l && l.tier === 'v2'),
    JSON.stringify(greenLD));

    // ---- LD-e: reopen determinism ---------------------------------------------
    await chrome.eval('window.__playback.close()');
    await sleep(500);
    check('LD-e: session reopens',
      await chrome.eval(`window.__playback.openSession(${sidLD})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      'LD-e: player reopened');
    await sleep(300);
    const ld2 = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.leads()))');
    check('LD-e: the reopened schedule is byte-identical (the jittered '
      + 'lead schedule is a pure function of the records — kernel replay '
      + 'law)', JSON.stringify(ld2) === JSON.stringify(ld),
    JSON.stringify({ first: ld, reopened: ld2 }));

    // ---- LD-f: GH-433 — lead-only + zero-content trim windows -----------------
    // The build-17 train edge: the DVR timeline is lead-inclusive and the
    // strip drag clamps only the 0.1 s minimum width, so a REAL user can
    // park the whole window inside segment 0's practice-stroke lead.
    // includedSegments() used to intersect PLAY spans only — such a window
    // honestly planned NOTHING and every export surface disarmed with no
    // note anywhere (the #380 silent-disarm class). The ASSOCIATE ruling:
    // a lead is prologue to its parent shot, so the window MEANS shot 0 —
    // one FULL slice, the lead kept (tIn 0 sits at the choreography start;
    // the exportLeads r5 P2 deliberate-cut law is untouched). A window
    // with NO content at all (inside a walk beat — no lead overlaps it)
    // stays honestly empty and the card paints the localized refusal line
    // instead of hiding the hint.
    const stF = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.state()))');
    check('LD-f: the pool default lead makes (0, 1.2) a lead-only window '
      + '(precondition, not the arm)', stF.cum[0] > 1.25
      && Math.abs(stF.cum[0] - stF.leads[0]) < 1e-9,
    JSON.stringify({ cum0: stF.cum[0], lead0: stF.leads[0] }));
    await chrome.eval('window.__playback.setTrim(0, 1.2)');
    const planF = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('LD-f GREEN: a lead-only window ASSOCIATES to its parent shot — '
      + 'ONE full slice, the lead armed at the full v2 tier, index 0 (RED '
      + 'pre-433: an empty plan)',
    planF.records.length === 1 && planF.opts.trims.length === 1
      && planF.opts.trims[0].startT === 0
      && planF.opts.trims[0].endT === null
      && planF.opts.leads?.[0]?.tier === 'v2'
      && planF.opts.leads[0].fuse === false
      && planF.opts.leads[0].index === 0
      && Math.abs(planF.opts.leads[0].sec - stF.leads[0]) < 1e-9,
    JSON.stringify({ records: planF.records.length,
      trims: planF.opts.trims, leads: planF.opts.leads ?? null }));
    // review r1 P1: the ASSOCIATION must reach every tier — the effective
    // window (the one span the play loop, the realtime capture and its
    // wall preflight consume) is the associated slice's live span, and the
    // LIVE preview actually plays through the strike instead of parking at
    // the raw 1.2 s out-point while the card promises the shot.
    const effF = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.effWindow()))');
    check('LD-f (r1 P1): the effective window is the associated span — '
      + 'lead start through the segment natural end, held a boundary '
      + 'epsilon short (r4/r5: the end instant already stages the '
      + 'follower; a fixed frame would drop real frames under slow-mo)',
    Math.abs(effF.tIn - 0) < 1e-9
      && Math.abs(effF.tOut
        - (stF.cum[0] + segEnd(stF, 0) - 1e-4)) < 1e-9,
    JSON.stringify({ effF, cum0: stF.cum[0], dur0: stF.durs[0],
      tail0: stF.tails[0], comp0: stF.completions[0] }));
    await chrome.eval('window.__playback.seek(0.02)');
    await chrome.eval('document.querySelector(".ob-pb-play").click()');
    const crossed = await (async () => {
      for (let i = 0; i < 80; i++) { // lead is rate-1 (~3.2 s) then play
        const s = await chrome.eval(
          '({ t: window.__playback.state().t, playing: window.__playback.state().playing })');
        if (s.t > stF.cum[0] + 0.05) return true;
        if (!s.playing) return false; // parked before the strike = the red
        await sleep(250);
      }
      return false;
    })();
    check('LD-f (r1 P1): the live preview plays THROUGH the strike (RED: '
      + 'the loop parked at the raw 1.2 s out-point inside the lead)',
    crossed === true);
    await chrome.eval('document.querySelector(".ob-pb-play").click()'); // pause
    await sleep(200);
    // review r7 P2: a pause PAST the raw endpoint must RESUME from the
    // pause point when Play returns — the raw-out special case below is
    // for a PARKED playhead only, never a bounce back to the prologue.
    const tPause = await chrome.eval('window.__playback.state().t');
    await chrome.eval('document.querySelector(".ob-pb-play").click()');
    await sleep(300);
    const tResume = await chrome.eval('window.__playback.state().t');
    check('LD-f (r7): resuming past the raw endpoint continues from the '
      + 'pause point (RED: restarted at the prologue)',
    tResume >= tPause - 1e-6 && tResume >= stF.cum[0] - 1e-6,
    JSON.stringify({ tPause, tResume, cum0: stF.cum[0] }));
    await chrome.eval('document.querySelector(".ob-pb-play").click()'); // pause
    await sleep(200);
    // review r6 P2: an out-handle drag parks the playhead AT the raw out
    // point (1.2 s — inside the expanded window) — Play must restart at
    // the effective start, never resume mid-lead.
    await chrome.eval('window.__playback.seek(1.2)');
    await chrome.eval('document.querySelector(".ob-pb-play").click()');
    // load-robust read: a restarted loop's early samples sit near 0 (the
    // lead plays rate-1 from the effective start); a non-restarted one
    // never drops below the 1.2 s park point
    const tR = await (async () => {
      for (let i = 0; i < 10; i++) {
        await sleep(100);
        const v = await chrome.eval('window.__playback.state().t');
        if (v < 1.15 || v > 1.6) return v;
      }
      return chrome.eval('window.__playback.state().t');
    })();
    check('LD-f (r6): Play after an out-handle park restarts at the '
      + 'effective start (RED: resumed mid-lead from the raw out point)',
    tR < 1.15, JSON.stringify({ tR }));
    await chrome.eval('document.querySelector(".ob-pb-play").click()'); // pause
    await sleep(200);
    // review r2 P2: a PARTIAL-lead window (tIn inside the lead) — the r5 P2
    // grammar cuts the lead deliberately, so the associated plan is the
    // BARE shot (no opts.leads key), the effective window opens at the
    // strike address, and Play must restart there instead of previewing
    // the practice strokes the export discarded (the lower-bound clamp).
    await chrome.eval('window.__playback.setTrim(0.5, 1.2)');
    const planP = await chrome.eval(`(() => {
      const p = window.__playback.plan();
      return { records: p.records.length, hasLeads: 'leads' in p.opts,
        trims: p.opts.trims }; })()`);
    check('LD-f (r2): a partial-lead window associates to the BARE shot '
      + '(one full slice, lead deliberately cut — no opts.leads key)',
    planP.records === 1 && planP.hasLeads === false
      && planP.trims[0].startT === 0 && planP.trims[0].endT === null,
    JSON.stringify(planP));
    const effP = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.effWindow()))');
    check('LD-f (r2): its effective window opens at the strike address',
      Math.abs(effP.tIn - stF.cum[0]) < 1e-9
      && Math.abs(effP.tOut - effF.tOut) < 1e-9,
    JSON.stringify({ effP, cum0: stF.cum[0] }));
    await chrome.eval('window.__playback.seek(0.6)'); // inside the cut lead
    await chrome.eval('document.querySelector(".ob-pb-play").click()');
    await sleep(400);
    const tP = await chrome.eval('window.__playback.state().t');
    check('LD-f (r2): Play restarts AT the strike — never previewing the '
      + 'discarded practice strokes (RED: upper-bound-only clamp played '
      + 'from the raw 0.6 s in-point)', tP >= stF.cum[0] - 1e-6,
    JSON.stringify({ tP, cum0: stF.cum[0] }));
    await chrome.eval('document.querySelector(".ob-pb-play").click()'); // pause
    await sleep(200);
    await chrome.eval('window.__playback.setTrim(0, 1.2)'); // the CTA leg's window
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      'LD-f: card open');
    check('LD-f GREEN: the Export CTA arms over the associated plan (RED '
      + 'pre-433: silently disabled)', await ctaArmed(chrome));
    const hintF = await chrome.eval(`(() => {
      const hint = document.querySelector('.ob-pb-desthint');
      return { key: hint?.dataset.i18n ?? null }; })()`);
    check('LD-f: an ARMED lead-only window never paints the refusal line',
      hintF.key !== 'playback.trimNoContent', JSON.stringify(hintF));
    await chrome.eval(
      'document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, 'LD-f');
    // review r3 P2, RETARGETED by GH-474: the choreography interval starts
    // AT the lead window start (liveChorStart(1) = the walk's arrival —
    // the camera-settle law; walk frames hold a static address and are
    // TRANSITION, not choreography). A window parked on the practice
    // strokes means shot 1; tIn past chorStart cuts the lead (the r5 P2
    // grammar): the plan is the BARE shot 1, the effective window opens
    // at ITS strike address.
    const beatStartF = stF.cum[0] + segEnd(stF, 0);
    const chor1F = stF.cum[1] - stF.leads[1]; // liveChorStart(1), replicated
    const fIn = chor1F + 0.02;
    const fOut = Math.min(stF.cum[1] - 0.02, fIn + 0.12);
    check('LD-f (r3): the choreography interval sits at the walk arrival '
      + '(GH-474 settle law) and fits a selection (precondition)',
    fOut - fIn >= 0.1
      && Math.abs(chor1F - (beatStartF + stF.beats[0])) < 1e-9,
    JSON.stringify({ chor1F, beatStartF, beat0: stF.beats[0], fIn, fOut }));
    await chrome.eval(`window.__playback.setTrim(${fIn}, ${fOut})`);
    const planFu = await chrome.eval(`(() => {
      const p = window.__playback.plan();
      const eff = window.__playback.effWindow();
      return { n: p.records.length, hasLeads: 'leads' in p.opts,
        trims: p.opts.trims, eff }; })()`);
    check('LD-f (r3): a window on the practice strokes ASSOCIATES '
      + 'to shot 1 — bare full slice (mid-choreography tIn cuts the '
      + 'lead), effective window at ITS strike (RED: the refusal line '
      + 'over visible practice strokes)',
    planFu.n === 1 && planFu.hasLeads === false
      && planFu.trims[0].startT === 0 && planFu.trims[0].endT === null
      && Math.abs(planFu.eff.tIn - stF.cum[1]) < 1e-9,
    JSON.stringify({ planFu, cum1: stF.cum[1] }));
    // …and a tIn at/before chorStart KEEPS the lead: the compacted plan
    // re-arms the FULL v2 tier UNFUSED (no predecessor slice — the
    // renderDrill un-fuse law), while the effective window opens on the
    // parent's OWN excess-lead span, never inside the walk (the export
    // renders no walk-camera frames — review r3 P2 mirror direction).
    await chrome.eval(`window.__playback.setTrim(${chor1F - 0.02}, ${fOut})`);
    const planKp = await chrome.eval(`(() => {
      const p = window.__playback.plan();
      const eff = window.__playback.effWindow();
      return { n: p.records.length, lead: p.opts.leads?.[0] ?? null,
        eff }; })()`);
    check('LD-f (r3): a tIn at the choreography start keeps the lead — '
      + 'FULL v2 tier, unfused, index 1; the effective window opens at '
      + 'the excess-lead span (cum[1] − leads[1])',
    planKp.n === 1 && planKp.lead?.tier === 'v2'
      && planKp.lead.fuse === false && planKp.lead.index === 1
      && Math.abs(planKp.lead.sec - q60(ld.pre[1].v2)) < 1e-9
      && Math.abs(planKp.eff.tIn - (stF.cum[1] - stF.leads[1])) < 1e-9,
    JSON.stringify({ planKp, want: { sec: q60(ld.pre[1].v2),
      effIn: stF.cum[1] - stF.leads[1] } }));
    // zero-content: a window inside walk beat 0 — under the GH-474 settle
    // law the WHOLE walk is transition (the fused cue only holds a static
    // address there; choreography starts at the arrival), so no play
    // span, no choreography, nothing associates. The plan is honestly
    // empty and the setup hint IS the refusal (i18n ×7), never a silent
    // disarm beside a visibly nonempty selection.
    const bInF = beatStartF + 0.02;
    const bOutF = Math.min(chor1F - 0.02, bInF + 0.12);
    check('LD-f: the beat hold fits the zero-content selection '
      + '(precondition)', stF.beats[0] !== null && bOutF - bInF >= 0.1,
    JSON.stringify({ beat0: stF.beats[0], bInF, bOutF }));
    await chrome.eval(`window.__playback.setTrim(${bInF}, ${bOutF})`);
    check('LD-f: a beat-interior window plans nothing (no shot content, '
      + 'no lead to associate)',
    await chrome.eval('window.__playback.plan().records.length') === 0);
    const effZ = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.effWindow()))');
    check('LD-f: a NON-associated window keeps the raw trim bounds '
      + '(byte-identical effective window)',
    Math.abs(effZ.tIn - bInF) < 1e-9 && Math.abs(effZ.tOut - bOutF) < 1e-9,
    JSON.stringify({ effZ, bInF, bOutF }));
    await chrome.eval('window.__playback.save()');
    await waitFor(chrome, 'window.__playback.cardOpen() === true',
      'LD-f: card reopen');
    await sleep(600); // the open-time probes settle; the hint derive is sync
    const refuseF = await chrome.eval(`(() => {
      const hint = document.querySelector('.ob-pb-desthint');
      return { key: hint?.dataset.i18n,
        shown: hint?.classList.contains('off') === false,
        txt: hint?.textContent,
        want: window.__i18n.t('playback.trimNoContent'),
        cta: document.querySelector('#ob-pb-card .ob-pb-go')?.disabled };
    })()`);
    check('LD-f GREEN: the zero-content refusal line is VISIBLE + localized '
      + 'beside the disabled CTA (RED pre-433: hint hidden — dead buttons '
      + 'with no reason anywhere)',
    refuseF.key === 'playback.trimNoContent' && refuseF.shown === true
      && refuseF.txt === refuseF.want && refuseF.cta === true,
    JSON.stringify(refuseF));
    await chrome.eval(
      'document.querySelector("#ob-pb-card .ob-pb-close").click()');
    await cardNodeGone(chrome, 'LD-f end');

    // ---- LD-g (GH-474): stroke-start >= camera-settle on FIXED mounts ---------
    // broadcast + overhead: static presets settle AT the cut by
    // construction (camerascript boundary-hold law) — the arm renders the
    // real plan per mount, samples the RENDER camera (__dbg.camera) and
    // the cue frame per encoded frame, and asserts frame-exactly that the
    // camera never moves inside any lead-carrying slice while the strokes
    // DO run there (settled camera, live choreography).
    await chrome.eval(`window.__playback.setTrim(0, ${stLD.total})`);
    for (const mount of ['broadcast', 'overhead']) {
      await chrome.eval('window.__playback.seek(0.02)');
      check(`LD-g: ${mount} assigned`,
        await chrome.eval(`window.__playback.setCam(${JSON.stringify(mount)})`));
      const g = await chrome.eval(`(async () => {
        const plan = window.__playback.plan();
        const cam = window.__dbg.camera;
        const samples = [];
        let res;
        try {
          res = await window.__export.renderDrill(plan.records, { ...plan.opts,
            width: 320, height: 180, keepBlob: false, noDownload: true,
            withAudio: false,
            onProgress: () => {
              const f = window.__test.cuePostState()?.frame ?? null;
              samples.push({ cam: cam.position.toArray(),
                tip: f?.tip ?? null });
            } });
        } catch (e) { return { err: String(e) }; }
        return { samples, segments: res.segments,
          leads: plan.opts.leads?.map((l) => (l ? l.sec : null)) ?? [] };
      })()`);
      check(`LD-g: ${mount} render succeeded`, !g.err
        && Array.isArray(g.segments) && g.segments.length === 3,
      JSON.stringify({ err: g.err, segments: g.segments }));
      if (!g.err) {
        let off = 0;
        for (let j = 0; j < g.segments.length; j++) {
          const H = Math.round((g.leads[j] ?? 0) * 60);
          if (H > 0) {
            const seg = g.samples.slice(off, off + g.segments[j]);
            const cam0 = seg[0].cam;
            const camMove = Math.max(...seg.map((s) => Math.max(
              ...s.cam.map((v, i2) => Math.abs(v - cam0[i2])))));
            const tip0 = seg[0].tip;
            const moved = tip0 ? seg.slice(0, H).findIndex((s) => s.tip
              && Math.max(...s.tip.map((v, i2) => Math.abs(v - tip0[i2]))) > 1e-6)
              : -1;
            check(`LD-g: ${mount} slice ${j} — camera settled for the WHOLE `
              + 'slice (fixed mount) while the strokes run inside the head '
              + '(stroke-start >= settle, frame-exact)',
            camMove < 1e-9 && moved >= 0,
            JSON.stringify({ j, camMove, firstMotionFrame: moved, H }));
          }
          off += g.segments[j];
        }
      }
    }

    // ---- LD-h (GH-474/GH-475): the strike plate rides the BACKSWING -----------
    // The overlay fades in WITH the first backswing (its first burned
    // frame IS the v2 backswing frame = the slice's first head frame),
    // hides AT the strike, and never shows during transitions. Proven on
    // the ruled pre-encode-hash surface: strike-on vs strike-off renders
    // of the SAME POV plan may differ ONLY inside each lead slice's
    // [head start, play start) window (RED pre-474: alpha 1 from segment
    // start through impact + linger — play-frame diffs everywhere).
    await chrome.eval('window.__playback.seek(0.02)');
    check('LD-h: pov re-assigned', await chrome.eval('window.__playback.setCam("pov")'));
    await waitFor(chrome, 'window.__playback.setStrike(true) === true'
      + ' && window.__playback.strikeArmed() === true', 'LD-h: strike arm');
    const annoDefaults = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.strikeAnno()))');
    check('LD-h (GH-475): the annotation knobs DEFAULT OFF (clean clips '
      + 'unless opted in)', annoDefaults.elev === false
      && annoDefaults.power === false, JSON.stringify(annoDefaults));
    const renderHashes = async () => chrome.eval(`(async () => {
      const plan = window.__playback.plan();
      try {
        const res = await window.__export.renderDrill(plan.records,
          { ...plan.opts, width: 320, height: 180, keepBlob: false,
            noDownload: true, withAudio: false, hashFrames: true });
        return { hashes: res.hashes, segments: res.segments,
          leads: plan.opts.leads?.map((l) => (l ? l.sec : null)) ?? [],
          strike: plan.opts.strike ?? null };
      } catch (e) { return { err: String(e) }; }
    })()`);
    const hOn = await renderHashes();
    await chrome.eval('window.__playback.setStrike(false)');
    const hOff = await renderHashes();
    await chrome.eval('window.__playback.setStrike(true)');
    check('LD-h: strike-on plan carries the GH-475 shape (readout retired '
      + 'on the user path, knob fields present + false) AND the GH-474 '
      + 'timing declaration (window474 — the review r1 P1 mixed-cache gate)',
    !hOn.err && hOn.strike && hOn.strike.readout === false
      && hOn.strike.elev === false && hOn.strike.power === false
      && hOn.strike.window474 === true
      && !hOff.err && hOff.strike === null,
    JSON.stringify({ on: hOn.strike, off: hOff.strike, e1: hOn.err,
      e2: hOff.err }));
    let hWindows = null;
    if (!hOn.err && !hOff.err) {
      const bounds = [];
      let off = 0;
      for (let j = 0; j < hOn.segments.length; j++) {
        const H = Math.round((hOn.leads[j] ?? 0) * 60);
        if (H > 0) bounds.push({ j, a: off, b: off + H });
        off += hOn.segments[j];
      }
      const diffs = [];
      for (let k = 0; k < hOn.hashes.length; k++) {
        if (hOn.hashes[k] !== hOff.hashes[k]) diffs.push(k);
      }
      const outside = diffs.filter(
        (k) => !bounds.some((w) => k >= w.a && k < w.b));
      const perWin = bounds.map((w) => {
        const inW = diffs.filter((k) => k >= w.a && k < w.b);
        return { j: w.j, first: inW[0] ?? null, last: inW[inW.length - 1] ?? null,
          a: w.a, b: w.b };
      });
      // first-diff apron: the window OPENS at the backswing frame (alpha
      // law, pinned by the live probes below), but the C2 ramp's earliest
      // frames sit under 8-bit pixel quantization — the first VISIBLE
      // diff may lag by up to the ramp length (hFrames = 15). ZERO diffs
      // before the backswing frame is the sync law's teeth (outside === 0
      // covers it: any pre-backswing paint — the pre-474 segment-start
      // plate, or any transition-frame paint — lands outside the window).
      check('LD-h: plate diffs live ONLY inside [backswing, strike) — '
        + 'nothing before the backswing frame, first visible diff within '
        + 'the C2 ramp apron, hidden at/before the strike, ZERO play-frame '
        + 'diffs (RED pre-474: the plate rode segment start through '
        + 'impact + linger)',
      outside.length === 0 && perWin.length > 0
        && perWin.every((w) => w.first !== null && w.first >= w.a
          && w.first <= w.a + 15 && w.last !== null && w.last < w.b),
      JSON.stringify({ outside: outside.slice(0, 8), perWin }));
      hWindows = bounds;
    }
    // the live preview mirrors the burned window (WYSIWYG, one clock)
    {
      const probes = [];
      const chor1 = stLD.cum[1] - stLD.leads[1];
      for (const [tag, T, want] of [
        ['walk (transition)', chor1 - 0.4, 'zero'],
        ['backswing - half frame', chor1 - 0.5 / 60, 'zero'],
        ['backswing + half frame', chor1 + 0.5 / 60, 'pos'],
        ['mid-choreography', chor1 + stLD.leads[1] / 2, 'pos'],
        ['strike + 0.05', stLD.cum[1] + 0.05, 'zero'],
      ]) {
        const a = await chrome.eval(`(() => {
          window.__playback.seek(${T});
          return window.__playback.strikeLive()?.alpha ?? null; })()`);
        probes.push({ tag, T, a,
          ok: want === 'zero' ? a === 0 : a > 0 });
      }
      check('LD-h: the LIVE preview alpha mirrors the backswing→strike '
        + 'window (0 in the walk, >0 from the backswing, 0 after the '
        + 'strike — RED pre-474: 1 through the impact anchor)',
      probes.every((p) => p.ok), JSON.stringify(probes));
    }
    // GH-475: knobs burn INSIDE the plate's own window only, and the
    // writer invalidates like every option (the setStrikeOn contract)
    await chrome.eval('window.__playback.setStrikeAnno("elev", true)');
    await chrome.eval('window.__playback.setStrikeAnno("power", true)');
    const hAnno = await renderHashes();
    await chrome.eval('window.__playback.setStrikeAnno("elev", false)');
    await chrome.eval('window.__playback.setStrikeAnno("power", false)');
    if (!hAnno.err && !hOn.err && hWindows) {
      check('LD-h (GH-475): the armed plan carries the knobs',
        hAnno.strike?.elev === true && hAnno.strike?.power === true,
        JSON.stringify(hAnno.strike));
      const diffs2 = [];
      for (let k = 0; k < hAnno.hashes.length; k++) {
        if (hAnno.hashes[k] !== hOn.hashes[k]) diffs2.push(k);
      }
      const outside2 = diffs2.filter(
        (k) => !hWindows.some((w) => k >= w.a && k < w.b));
      check('LD-h (GH-475): elevation/power annotations change frames ONLY '
        + 'within the plate windows (they ride the overlay, never leak '
        + 'into play frames) and DO burn',
      diffs2.length > 0 && outside2.length === 0,
      JSON.stringify({ n: diffs2.length, outside: outside2.slice(0, 8) }));
    } else if (!hOn.err) {
      check('LD-h (GH-475): knob render succeeded', !hAnno.err,
        JSON.stringify({ err: hAnno.err }));
    }

    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErrLD = await chrome.eval('__test.errors.slice()');
    check('LD: zero app errors', appErrLD.length === 0, JSON.stringify(appErrLD));
    check('LD: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- RF family: GH-452 reset-boundary fade (replace-class discontinuity) ----
// A snooker miss-REPLACE (GH-382 choice 3) restores the judged stroke's
// address BIT-EXACTLY, so segment r's record stages a byte-identical copy of
// segment r−1's initial census — a mid-scene state reset no camera cut
// covers on the default broadcast plan. The fix bridges it with the EXISTING
// GH-301 fade element, boundary-anchored (RED pre-452: the cue + colours
// snapped from the leave to the replaced address in exactly one frame of the
// full-game export, flat brightness, no camera change — issue #452 evidence).
{
  const errs = [];
  const chrome = await launchChrome(
    // offset 4: inside the declared PORT_INVENTORY; the earlier CDP+4
    // family closed its browser before this one boots (sequential law).
    `http://127.0.0.1:${PORT}/app.html?seed=6&archive=1`, { port: CDP + 4 });
  watch(chrome, errs);
  /** Boot-window eval retry (the fire() transient-law shape, GH-248 class):
   * a page fresh at the END of this suite's 900-arm run can have an eval's
   * promise collected while boot imports/GC are still churning ("Promise
   * was collected" — measured 1-of-2 on the standalone driver and once in
   * the battery, both at THIS family's first evals, byte-identical code
   * green on retry). Retry the CDP transient only; every real rejection
   * (and every later, post-boot eval) keeps the plain one-shot path. */
  const evB = async (js, tries = 5) => {
    for (let i = 0; ; i++) {
      try { return await chrome.eval(js); } catch (e) {
        if (i >= tries - 1 || !/collected|context was destroyed|cannot find context/i
          .test(String(e))) throw e;
        await sleep(600);
      }
    }
  };
  try {
    await waitReady(chrome, 'RF boot');
    await waitFor(chrome, 'typeof window.__playback?.setLeadIn === "function"',
      'RF: setLeadIn seam');
    await evB('window.__playback.setLeadIn(true)'); // shipped default
    // ---- the REAL replace session (issue #452 repro, verbatim) ---------------
    check('RF: snooker activates',
      await evB('window.__rules.activateSnooker("wpbsa-snooker-full")') === true);
    await sleep(800);
    const SPOT = {
      16: { x: 0.292, y: -1.0475 }, 17: { x: -0.292, y: -1.0475 },
      18: { x: 0, y: -1.0475 }, 19: { x: 0, y: 0 },
      20: { x: 0, y: 0.89225 }, 21: { x: 0, y: 1.4605 },
    };
    await evB(`__test.layout(${JSON.stringify([
      { id: 0, x: 0, y: -0.5 }, { id: 1, x: 0.35, y: 0.9 },
      { id: 16, x: 0, y: 0.2 },
      ...[17, 18, 19, 20, 21].map((id) => ({ id, ...SPOT[id] }))])})`);
    check('RF: match state pins (reds, ballOn red)',
      await evB(`window.__rules.setMatchState(${JSON.stringify({
        phase: 'reds', shooter: 1, scores: { 1: 0, 2: 0 }, currentBreak: 0,
        ballOn: 'red', onTable: [1, 16, 17, 18, 19, 20, 21],
        respotQueue: [], pendingDecision: null, foulContext: null,
        result: null, freeBallEligible: false, miss: null,
        missRestore: null })})`) === true);
    await sleep(400);
    await fire(chrome, 'RF: miss shot',
      { v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    const dec = await chrome.eval(
      'window.__rules.judgment()?.decisionRequired?.kind ?? null');
    check('RF: foul-and-a-miss decision fires', dec === 'foul_and_a_miss', dec);
    await sleep(400);
    const clicked = await chrome.eval(`(() => {
      // locale-stable selection (review r5 P2): the buttons carry only
      // localized copy — match the ACTIVE locale's own choice-3 string
      // (WPBSA R14(b) replace) instead of English text
      const want = window.__i18n.t('decision.opt.foul_and_a_miss.3');
      const bs = [...document.querySelectorAll('#hud-decision .hd-btns button')];
      const b = bs.find((x) => x.textContent.trim() === want);
      if (!b) return null;
      b.click();
      return b.textContent.trim();
    })()`);
    check('RF: the replace option clicks', typeof clicked === 'string', clicked);
    await sleep(600);
    await fire(chrome, 'RF: re-shoot',
      { v0: 1.6, phi: Math.PI / 2 + 0.28, theta: 0, a: 0, b: 0 });
    // a follow-up decision (e.g. play-from-here) must not hold the archive
    await chrome.eval(`(() => {
      const b = document.querySelector('#hud-decision .hd-btns button');
      if (b) b.click();
    })()`);
    await sleep(400);
    await chrome.eval('window.__archive.flush()');
    const sidRF = (await chrome.eval('window.__archive.sessions()'))[0]?.id;
    check('RF: session opens',
      await chrome.eval(`window.__playback.openSession(${sidRF})`) === true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      'RF: player open');
    await sleep(400);

    // ---- RF-a: the plan carries the derived boundary fade --------------------
    const planRF = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan()))');
    check('RF-a: two records, boundary fade emitted — the EXISTING fade '
      + 'element, boundary-anchored ({ i: 1, t: 0, dur: 1, b: 1 }); RED '
      + 'pre-452: no fades key at all',
    planRF.records.length === 2
      && JSON.stringify(planRF.opts.fades)
        === JSON.stringify([{ i: 1, t: 0, dur: 1, b: 1 }]),
    JSON.stringify(planRF.opts.fades ?? null));

    // ---- RF-b: the live dip mirror (evalAlpha) --------------------------------
    const stRF = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.state()))');
    const Tb = stRF.cum[1] - (stRF.leads?.[1] ?? 0); // the boundary instant
    const alphaAt = async (T) => {
      await chrome.eval(`window.__playback.seek(${T})`);
      await sleep(150);
      return parseFloat(await chrome.eval(
        'document.getElementById("ob-pb-fade")?.style.opacity ?? "0"')) || 0;
    };
    // GH-864: the dip clock sums Ext_i (C3) and the schedule ends at E_i (C1); the probe distance is unchanged.
    const aC = await alphaAt(Tb);
    const aOut = await alphaAt(Math.max(0, Tb - 0.25));
    const aIn = await alphaAt(Tb + 0.25);
    const aFar = await alphaAt(Tb + 1.2);
    check('RF-b: the live player dips to EXACTLY black at the boundary '
      + 'instant, C2 shoulders both sides, clear away from it',
    aC > 0.999 && aOut > 0.05 && aOut < 0.95 && aIn > 0.05 && aIn < 0.95
      && aFar === 0,
    JSON.stringify({ Tb, aC, aOut, aIn, aFar }));

    // ---- RF-c: the capability gate (consistent degrade, byte-stability) ------
    await chrome.eval('window.__export.resetFadeCapable = false');
    const offRF = await chrome.eval(`(() => ({
      hasKey: 'fades' in window.__playback.plan().opts }))()`);
    const aGated = await alphaAt(Tb);
    await chrome.eval('window.__export.resetFadeCapable = true');
    const backRF = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.plan().opts.fades ?? null))');
    check('RF-c: capability off → no fades key AND no live dip (the GH-363 '
      + 'consistent-degrade shape); back on → byte-identical schedule',
    offRF.hasKey === false && aGated === 0
      && JSON.stringify(backRF) === JSON.stringify(planRF.opts.fades),
    JSON.stringify({ offRF, aGated, backRF }));

    // ---- RF-d: a POV→POV walk covers the boundary (GH-299 handoff) -----------
    await chrome.eval('window.__playback.seek(0.02)'); // cut at segment 0 —
    // the §1.2 backfill law rules the whole timeline POV (the LD recipe)
    check('RF-d: pov assigns', await chrome.eval('window.__playback.setCam("pov")'));
    await sleep(200);
    const povRF = await chrome.eval(`(() => ({
      beat0: window.__playback.state().beats[0],
      hasKey: 'fades' in window.__playback.plan().opts }))()`);
    const aWalk = await alphaAt(Tb);
    check('RF-d: the walk beat owns the covered boundary — no fade emitted, '
      + 'no dip (the state handoff renders the replaced address under the '
      + 'walking camera)',
    povRF.beat0 > 0 && povRF.hasKey === false && aWalk === 0,
    JSON.stringify({ povRF, aWalk }));

    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const appErrRF = await chrome.eval('__test.errors.slice()');
    check('RF: zero app errors', appErrRF.length === 0, JSON.stringify(appErrRF));
    check('RF: zero console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- FF family: GH-435 — the crash-resume determinism-class contract --------
// The sound-on fast-forward's PLAN GATE, pinned as a truth table on the one
// seam-exposed predicate (playback.js ffEligible — exactly what
// resumeRunInner consults before arming the wire). The wire-level halves
// (real banner journeys, byte-identity, restart shapes) live in e2e-export
// CR1/CR5/CR6; THIS family owns the decision function and its degrade:
// with-sound eligibility must ride __export.fullAudioExact (the
// windowed-EXACT bed capability) and NOTHING else may — masking the
// capability (the RF-c mutation idiom) flips only the sound-on row.
// RED pre-435: the seam does not exist, and the with-sound row read
// restart (canFastForward was `withAudio === false && mp4`).
{
  const errs = [];
  const chrome = await launchChrome(
    // offset 5: inside the declared PORT_INVENTORY; the RF family (CDP+4)
    // closed its browser before this one boots (sequential law).
    `http://127.0.0.1:${PORT}/app.html?seed=1&archive=1`, { port: CDP + 5 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'FF boot');
    await waitFor(chrome,
      'typeof window.__playback?.ffEligible === "function"',
      'FF: ffEligible seam (RED pre-435: missing)');
    const table = await chrome.eval(`(async () => {
      const ff = window.__playback.ffEligible;
      const P = (mime, withAudio) => ({ mime, opts: { withAudio } });
      const cap0 = window.__export?.fullAudioExact;
      const rows = {
        cap: cap0,
        mp4Off: ff(P('video/mp4', false)),
        mp4On: ff(P('video/mp4', true)),
        mp4Default: ff({ mime: 'video/mp4', opts: {} }), // savePlan pins
        // withAudio: true; an absent flag must read as SOUND-ON (the
        // conservative side — never fast-forward a bed you cannot re-bake)
        webmOff: ff(P('video/webm', false)),
        webmOn: ff(P('video/webm', true)),
        noPlan: ff(null),
        noMime: ff({ opts: { withAudio: false } }),
      };
      // the stale-pairing degrade: capability masked (RF-c idiom) — only
      // the sound-on rows may flip
      window.__export.fullAudioExact = false;
      rows.maskedOn = ff(P('video/mp4', true));
      rows.maskedOff = ff(P('video/mp4', false));
      window.__export.fullAudioExact = cap0;
      rows.restored = ff(P('video/mp4', true));
      // the class's VIDEO leg (review GH-435 r1 P1): the gate-time
      // prefer-software probe seam — resumeRunInner consults it before
      // arming a fast-forward wire (the wire-level mask leg is
      // e2e-export CR5b); on this shell it must answer true at the
      // CR-class dims
      rows.swProbeSeam = typeof window.__export.swVideoSupported;
      rows.swProbe = rows.swProbeSeam === 'function'
        ? await window.__export.swVideoSupported(
          { format: 'mp4', width: 320, height: 180 })
        : null;
      return rows;
    })()`);
    check('FF-a: fresh module chain exposes the exact-bed capability '
      + '(__export.fullAudioExact)', table.cap === true,
    JSON.stringify(table));
    check('FF-b: mp4 sound-off fast-forwards (the GH-362 class, unchanged)',
      table.mp4Off === true, JSON.stringify(table));
    check('FF-c: mp4 sound-on fast-forwards on the exact bed (GH-435 — '
      + 'RED pre-435: restart)', table.mp4On === true
      && table.mp4Default === true, JSON.stringify(table));
    check('FF-d: webm restarts either way (cluster rewrites defeat the '
      + 'append-order hash)', table.webmOff === false
      && table.webmOn === false, JSON.stringify(table));
    check('FF-e: no/garbage plan restarts', table.noPlan === false
      && table.noMime === false, JSON.stringify(table));
    check('FF-f: capability masked → ONLY the sound-on row flips to '
      + 'restart (the stale-pairing degrade; sound-off never rides the '
      + 'audio chain)', table.maskedOn === false && table.maskedOff === true
      && table.restored === true, JSON.stringify(table));
    check('FF-g: the gate-time prefer-software probe seam exists and '
      + 'answers true at the CR-class dims on this shell (review r1 P1 — '
      + 'the video leg of the class; wire-level mask leg: e2e-export CR5b)',
    table.swProbeSeam === 'function' && table.swProbe === true,
    JSON.stringify(table));
    const appErrFF = await chrome.eval('__test.errors.slice()');
    check('FF: zero app errors', appErrFF.length === 0,
      JSON.stringify(appErrFF));
    check('FF: zero console errors', errs.length === 0,
      errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- EQID) GH-534 G1 (round-2 QA, promoted from GH-536 item 3): DVR bed
// staging honors EQUIPMENT IDENTITY — footprint alone staged the
// POST-swap table/cue for pre-swap sessions whenever length/width matched
// (all 9-ft pool tables). bedFits now compares the canonicalized
// rec.initial.equipment tag (absent == kernel-default == null) against
// the live template tag; a mismatch routes into the proven swapBed path.
// VISUAL-PROVENANCE class: replay physics always re-sampled the record —
// the defect was the staged bed/cue identity. The second bedFits call
// site (render-resume staging) shares the ONE predicate by construction.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&archive=1&u=eqid`,
    { port: CDP + 25, tool: false });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'EQID boot');
    const settle = async (tag) => {
      const rej = await chrome.eval('__test.shoot({ power: 3 })');
      if (rej) { fail(`EQID ${tag}: shot rejected: ${rej}`); return; }
      for (let i = 0; i < 160; i++) {
        const st = await chrome.eval('__test.state()');
        if (st === 'AIM' || st === 'BALL_IN_HAND' || st === 'WIN') break;
        await sleep(250);
      }
    };
    await settle('record');
    await chrome.eval('window.__archive.flush()', true).catch(() => {});
    await sleep(800);
    const sid = await chrome.eval(
      '(async () => (await window.__archive.sessions())[0]?.id ?? null)()',
      true);
    check('EQID-0: default-pairing session recorded', sid !== null,
      JSON.stringify(sid));
    // (a) GUARD — the untagged/default record on the DEFAULT live bed
    // still fits: opening stages WITHOUT any equipment flip (null ==
    // kernel-default equivalence; no spurious swap on legacy records)
    await chrome.eval(`window.__playback.openSession(${JSON.stringify(sid)})`,
      true);
    await sleep(1500);
    const eqDuring0 = await chrome.eval(
      '(__test.equipment() || {}).table_id ?? null');
    check('EQID-a: default record on the default bed stages with NO '
      + 'equipment flip', eqDuring0 === null
      || eqDuring0 === 'pool_pro_9ft', JSON.stringify(eqDuring0));
    await chrome.eval('window.__playback.close?.(), true').catch(() => {});
    for (let i = 0; i < 60; i++) {
      const st = await chrome.eval('__test.state()');
      if (st === 'AIM' || st === 'BALL_IN_HAND') break;
      await sleep(250);
    }
    // (b) swap BOTH identity axes live (same 2.54x1.27 footprint — the
    // pre-fix hole), then reopen the PRE-SWAP session
    await chrome.eval(`window.__settings.changeEquipment('cue_id',
      'break_phenolic', { skipConfirm: true }), true`);
    await chrome.eval(`window.__settings.changeEquipment('table_id',
      'wpa_spec_9ft', { skipConfirm: true }), true`);
    await waitFor(chrome,
      `(__test.equipment() || {}).table_id === 'wpa_spec_9ft'`,
      'EQID live swap');
    await chrome.eval(`window.__playback.openSession(${JSON.stringify(sid)})`,
      true);
    await sleep(2000);
    const staged = await chrome.eval(`({
      st: __test.state(),
      t: (__test.equipment() || {}).table_id ?? null,
      c: (__test.equipment() || {}).cue_id ?? null })`);
    check('EQID-b: the pre-swap session stages its RECORDED pairing '
      + '(pool_pro_9ft/standard — RED pre-fix: wpa/break)',
    (staged.t === 'pool_pro_9ft' || staged.t === null)
      && (staged.c === 'standard' || staged.c === null),
    JSON.stringify(staged));
    // (c) close restores the LIVE pairing + state (the restoreLive
    // rackChanged leg — NEW debt on this path once fits reads false)
    await chrome.eval('window.__playback.close?.(), true').catch(() => {});
    for (let i = 0; i < 60; i++) {
      const st = await chrome.eval('__test.state()');
      if (st === 'AIM' || st === 'BALL_IN_HAND') break;
      await sleep(250);
    }
    await sleep(800);
    const restored = await chrome.eval(`({
      t: (__test.equipment() || {}).table_id ?? null,
      c: (__test.equipment() || {}).cue_id ?? null })`);
    check('EQID-c: close restores the LIVE pairing exactly',
      restored.t === 'wpa_spec_9ft' && restored.c === 'break_phenolic',
      JSON.stringify(restored));
    // (d) GUARD — a session recorded ON the current pairing re-stages with
    // no equipment flip (same-tag identity: no spurious swap/re-rack)
    await settle('same-eq record');
    await chrome.eval('window.__archive.flush()', true).catch(() => {});
    await sleep(800);
    const sid2 = await chrome.eval(
      '(async () => (await window.__archive.sessions())[0]?.id ?? null)()',
      true);
    await chrome.eval(`window.__playback.openSession(${JSON.stringify(sid2)})`,
      true);
    await sleep(1500);
    const same = await chrome.eval(`({
      t: (__test.equipment() || {}).table_id ?? null,
      c: (__test.equipment() || {}).cue_id ?? null })`);
    check('EQID-d: a same-pairing session stages with NO equipment flip',
      same.t === 'wpa_spec_9ft' && same.c === 'break_phenolic',
      JSON.stringify(same));
    await chrome.eval('window.__playback.close?.(), true').catch(() => {});
    await sleep(800);
    const appErr = await chrome.eval('__test.errors.slice()');
    check('EQID: zero app errors', appErr.length === 0,
      JSON.stringify(appErr));
    check('EQID: zero console errors', errs.length === 0,
      errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

// ---- SELK) GH-668 S5 kit review r3 P2: the save-card's kit selects leave
// WITH the card. Each upgradeSelect() owns a clamp ResizeObserver (the
// two-line clamp re-measure); pre-fix its handle was DISCARDED, closeCard()
// only refresh()-ed the widgets and removed the node, and the live observers
// retained the detached buttons and, through them, the whole card subtree —
// one per card select per open/close cycle, unbounded. Fix: the handle lives
// on the widget, destroy() disconnects it, and closeCard() destroy()s both
// widgets right before the node removal. The census seam (select.js
// clampCensus — installed on scripted boots only, the archive.js
// `ob-scripted` idiom) reads the live registry: after five cycles it must
// sit at the pre-cycle baseline with ZERO detached-button observers, and no
// `.ob-select` button beyond the baseline may remain in the document. The
// per-card select count is READ on the first open (1 or 2: the quality
// picker rides the cinematic-tier capability), never assumed. GC is
// requested between reads (HeapProfiler.collectGarbage, the e2e-export
// FULL2 recipe) so the DOM reads never see a not-yet-collected node; the
// census itself is registry truth, not heap luck. RED on the pre-fix bytes
// + the seam alone: observers climb by the card count every cycle and every
// one of them holds a detached button.
{
  const errs = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&archive=1&u=selk`,
    { port: CDP + 26 });
  watch(chrome, errs);
  try {
    await waitReady(chrome, 'SELK boot');
    await waitFor(chrome,
      'typeof window.__playback?.openSession === "function"',
      'SELK: __playback seam');
    // one recorded session to open the player on (the EQID recipe)
    const rej = await chrome.eval('__test.shoot({ power: 3 })');
    if (rej) fail(`SELK: shot rejected: ${rej}`);
    for (let i = 0; i < 160; i++) {
      const st = await chrome.eval('__test.state()');
      if (st === 'AIM' || st === 'BALL_IN_HAND' || st === 'WIN') break;
      await sleep(250);
    }
    await chrome.eval('window.__archive.flush()', true).catch(() => {});
    await sleep(800);
    const sid = await chrome.eval(
      '(async () => (await window.__archive.sessions())[0]?.id ?? null)()',
      true);
    check('SELK-0: a session recorded', sid !== null, JSON.stringify(sid));
    await chrome.eval(`window.__playback.openSession(${JSON.stringify(sid)})`,
      true);
    await waitFor(chrome, 'window.__playback.playerOpen() === true',
      'SELK: player open');
    await sleep(600);
    // the seam rides select.js, which playback.js imports lazily — present
    // on this scripted boot once the module resolved
    await waitFor(chrome,
      'typeof window.__obSelect?.clampCensus === "function"',
      'SELK: census seam (select.js scripted-boot surface)');
    await chrome.send('HeapProfiler.enable');
    const census = async () => {
      await chrome.send('HeapProfiler.collectGarbage');
      await sleep(150);
      await chrome.send('HeapProfiler.collectGarbage');
      return chrome.eval(`(() => {
        const c = window.__obSelect.clampCensus();
        return { observers: c.observers, detached: c.detached,
          buttons: document.querySelectorAll('.ob-select').length,
          cardButtons: document.querySelectorAll('#ob-pb-card .ob-select').length,
          cards: document.querySelectorAll('#ob-pb-card').length };
      })()`);
    };
    const base = await census();
    check('SELK-1: the pre-cycle baseline holds no detached-button observer '
      + 'and no card', base.detached === 0 && base.cards === 0
      && base.cardButtons === 0, JSON.stringify(base));
    const rows = [];
    let perCard = null; // the card's kit-select count, READ on cycle 0
    for (let k = 0; k < 5; k++) {
      await chrome.eval('window.__playback.save()');
      await waitFor(chrome, 'window.__playback.cardOpen() === true',
        `SELK cycle ${k}: card open`);
      // the resolution combobox is always upgraded (retrofitSelect covers a
      // late module); the quality one rides the cinematic capability
      await waitFor(chrome,
        'document.querySelectorAll("#ob-pb-card .ob-select").length >= 1',
        `SELK cycle ${k}: kit select upgraded in the card`);
      await sleep(250); // a same-tick second upgrade (quality) settles
      const open = await census();
      if (perCard === null) perCard = open.cardButtons;
      await chrome.eval(
        'document.querySelector("#ob-pb-card .ob-pb-close").click()');
      await cardNodeGone(chrome, `SELK cycle ${k}`);
      await sleep(200);
      const closed = await census();
      rows.push({ k, open, closed });
    }
    console.log(`note: SELK per-card kit selects = ${perCard}; baseline `
      + `${JSON.stringify(base)}; rows ${JSON.stringify(rows)}`);
    check('SELK-2: every open adds exactly the card\'s own selects '
      + '(read, not assumed) on top of the baseline — no carry-over from '
      + 'the previous cycle (RED pre-fix: the opens climb)',
    perCard >= 1 && rows.every((r) => r.open.cardButtons === perCard
        && r.open.observers === base.observers + perCard),
    JSON.stringify({ perCard, base: base.observers,
      opens: rows.map((r) => r.open.observers) }));
    check('SELK-3: after each close the live clamp-observer count is back at '
      + 'the baseline (RED pre-fix: + per-card count every cycle, unbounded)',
    rows.every((r) => r.closed.observers === base.observers),
    JSON.stringify({ base: base.observers,
      closes: rows.map((r) => r.closed.observers) }));
    check('SELK-4: no live observer holds a detached .ob-select button after '
      + 'any close', rows.every((r) => r.closed.detached === 0),
    JSON.stringify(rows.map((r) => r.closed.detached)));
    check('SELK-5: no .ob-select button beyond the baseline stays in the '
      + 'document, and the card node is gone, after every close',
    rows.every((r) => r.closed.buttons === base.buttons
        && r.closed.cardButtons === 0 && r.closed.cards === 0),
    JSON.stringify({ base: base.buttons,
      buttons: rows.map((r) => r.closed.buttons) }));
    await chrome.eval('window.__playback.close?.(), true').catch(() => {});
    await sleep(600);
    const appErr = await chrome.eval('__test.errors.slice()');
    check('SELK: zero app errors', appErr.length === 0,
      JSON.stringify(appErr));
    check('SELK: zero console errors', errs.length === 0,
      errs.slice(0, 5).join(' | '));
  } catch (e) { fail(e.stack ?? e); } finally { chrome.close(); }
}

await stopStaticServer(server);
console.log(process.exitCode ? 'E2E-PLAYBACK FAIL' : 'E2E-PLAYBACK PASS');
