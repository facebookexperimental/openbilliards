// Copyright (c) Meta Platforms, Inc. and affiliates.

// tiers.js — the club look's quality tiers (CONTRACT.md section 5). One frozen table of every knob; modules read
// `club.knobs` and never sniff the device themselves. Pure data + one picker (it reads the renderer's capabilities and a few
// facts of the page through `deviceFacts`; the rule itself, `autoTier`, is pure), so the table and the rule are testable in node.
//
// The rule of the tiers (CONTRACT.md 10.2): `lite` and `base` stay at parity with the `tournament` look in scene renders per
// frame and close to it in draw calls and triangles; whatever costs a scene render or a large triangle count is `high` only,
// and `high` is opt-in: the picker never chooses it.
//
// What a tier costs per frame, beyond the one scene render every look makes (extraSceneRenders() below is the rule, and the
// node arm pins it):
//   lite   0 extra scene renders. The room at detail 0 with no far table; no reflection patch, no mirror, no ambient
//          occlusion pass, no lens, no bloom; the grade is the one added full-screen pass (the frame has fewer passes than
//          `tournament`, which runs the bloom). No texture above 1024 px; normal and roughness maps at 512 px.
//   base   0 extra scene renders. The full room at detail 1, the far table in its plain form; colour maps at 1024 px and
//          data maps at 512 px (the rail veneer scans excepted: BASE_SIZES); box-projected reflections
//          (uniforms only); the lens runs on the depth the scene pass already wrote (three full-screen passes, no
//          geometry), and only while the camera is at rest: a moving camera pays for the grade pass alone.
//   high   1 extra scene render, at half resolution, on frames that show the floor: the planar floor mirror. It draws a
//          reduced scene (no balls, no cloth, no aim overlays: env.js). Everything else is full-screen passes. Opt-in.
// The live cube re-capture (`envLive`: one more cube face of the whole scene per frame while the cue moves) is OFF on every
// tier: the cube is captured from one point over the middle of the cloth, so the cue lands at the wrong place on every surface
// away from that point, and its cycle made a still picture change several frames after it was posed. The code stays behind the
// knob for tools (`?clubenv=live:1`).
export const TIER_IDS = Object.freeze(['lite', 'base', 'high']);

// Per-id texture caps (assets.js): an id listed here takes this cap on its longer side instead of the tier's `textureSize` /
// `textureSizeData`. The base tier keeps full size only for the rail veneer scans (the wood part cuts a narrow strip from
// them for the wood tables' rail caps: V4 to V6; the strip is 2.8 MB + 0.7 MB). One colour map goes below the colour cap:
// the leather's colour is a low-frequency mottle, on bar stools and in the pockets. The two normal maps of the played table
// (`wood_dark.normal` under the rail's coat on the black tables, `leather.normal` in the pockets) take the tier's data cap
// like every other data map: halving them changed at most 1.1 % of the pixels of the rail band by 4 levels of 255 or more
// at V4, V5 and V6 (1280 x 720, software GL: reports/r3-parity.md), for 8 MB. Tools: `?clubtex=wood_dark.normal:1024,
// leather.normal:1024` puts them back for a pair.
const NO_SIZES = Object.freeze({});
const BASE_SIZES = Object.freeze({ 'veneer.color': 2048, 'veneer.normal': 1024, 'leather.color': 512 });

export const TIERS = Object.freeze({
  // phones, tablets, the iOS WKWebView shell, weak or software renderers
  lite: Object.freeze({
    textureSize: 1024, textureSizeData: 512, textureSizes: NO_SIZES, roughRG: true, anisotropy: 4,
    roomDetail: 0, roomMaps: 0, roomRound: 1, propsAtlasScale: 0.5, propSegments: 0.5, farTable: false, farTableDetail: 0,
    releaseHidden: true,
    envBox: false, envLive: false, envAmbient: true, floorMirror: false, mirrorScale: 0.5,
    floorCoat: 0, floorCoatRoughness: 0.2,
    atlas: 512, ao: 'off', aoScale: 0.5,
    dof: 'off', dofWorkRows: 720, bloom: false, smaa: false, grade: true,
    pocketLeather: false,
    motion: 'marks', motionDust: 0, motionMarks: 12, audio: 'sfx',
  }),
  // every laptop and desktop by default
  base: Object.freeze({
    textureSize: 1024, textureSizeData: 512, textureSizes: BASE_SIZES, roughRG: true, anisotropy: 8,
    roomDetail: 1, roomMaps: 1, roomRound: 1, propsAtlasScale: 0.5, propSegments: 0.75, farTable: true, farTableDetail: 0,
    releaseHidden: true,
    envBox: true, envLive: false, envAmbient: true, floorMirror: false, mirrorScale: 0.5,
    floorCoat: 1, floorCoatRoughness: 0.2,
    atlas: 1024, ao: 'off', aoScale: 0.5,
    dof: 'still', dofWorkRows: 720, bloom: true, smaa: false, grade: true,
    pocketLeather: true,
    motion: 'full', motionDust: 64, motionMarks: 32, audio: 'full',
  }),
  // opt-in (a desktop GPU): never picked automatically
  high: Object.freeze({
    textureSize: 2048, textureSizeData: 2048, textureSizes: NO_SIZES, roughRG: false, anisotropy: 8,
    roomDetail: 2, roomMaps: 2, roomRound: 2, propsAtlasScale: 1, propSegments: 1.4, farTable: true, farTableDetail: 1,
    releaseHidden: true,
    envBox: true, envLive: false, envAmbient: true, floorMirror: true, mirrorScale: 0.5,
    floorCoat: 1, floorCoatRoughness: 0.2,
    atlas: 1024, ao: 'off', aoScale: 0.5,
    dof: 'live', dofWorkRows: 720, bloom: true, smaa: false, grade: true,
    pocketLeather: true,
    motion: 'full', motionDust: 160, motionMarks: 32, audio: 'full',
  }),
});
// Knob notes:
//   textureSize         hard cap on the longer side of every loaded image (assets.js); where the cap is 1024 or less the
//                       loader takes the manifest's 1024 px file when a row has one. Base is 1024 since round 3: a 2048 px
//                       map is 22.4 MB on the GPU with its mips against 5.6 MB, and base bound three of them.
//   textureSizeData     the same cap for data maps (ids ending in `.normal` or `.rough`): their detail is the first to go
//                       unseen, and each 1024 px map costs 5.6 MB with its mips against 1.4 MB at 512.
//   textureSizes        per-id caps that replace the two above for the ids listed (tools: `?clubtex=id:px,...`).
//   roughRG             roughness maps (ids ending in `.rough`) are uploaded as two-channel RG8 instead of RGBA8: half the
//                       bytes, nothing visible (the file is grey; three's shader reads the map's G channel, which RG8 keeps).
//   roomMaps            which data maps the room shell binds (room/shell.js): 0 = the floor's normal map only (the lite
//                       room), 1 = plus the floor's roughness and the panelling's normal map, 2 = all five (plus the
//                       panelling's roughness and the plaster's normal and roughness).
//   propsAtlasScale     the props atlas (room/props/atlas.js): 1 = 2048 x 1024 (11.2 MB with mips), 0.5 = 1024 x 512 (2.8 MB).
//   roomRound           tessellation of the shell's wall lamps and door knob (room/shell.js lampGeometries): 2 = the full
//                       counts (high), 1 = the reduced counts of lite and base (the same shapes with about 64 % fewer
//                       triangles per lamp; the shade keeps 16 sides), 0 = round 2's lite counts (tools only: a pair).
//   propSegments        multiplier on the segment counts of the props' round parts (room/props.js `seg`; the bottles and
//                       the far table's balls follow it: 4 / 5 / 8 bottle segments, far balls 8 x 5 on base, 10 x 6 on high).
//   releaseHidden       index.js frees the GPU copy of every app texture the club look no longer shows (the app room's
//                       walls and floor, maps a part swapped out). The objects stay valid: three uploads one again if it
//                       is ever drawn. Tools: `?clubknobs=releaseHidden:0`.
//   anisotropy          the ONE anisotropy every anisotropic texture of the tier is sampled with (assets.js): a request for
//                       4 and a request for 8 on the same id were two GPU copies of the same image.
//   farTableDetail      1 = the far table with its smallest parts (the balls' highlight dots, the rail sights: under a
//                       pixel from across the room); 0 = without them. The balls, the cue, the cloth and the lamp are
//                       built either way (room/props/fartable.js; only read when `farTable`).
//   dofWorkRows         the most rows the lens works at (post.js: half the frame up to this; 720 = the post chain's own
//                       default: round discs up to a 1440 px frame; 360 = round 2's cost at every size, 3.7 MB of targets,
//                       and blocky discs above 720p). Nothing changes at 1280 x 720 either way.
//   envAmbient          the ambient cube of the reflection service (env.js `env.ambient`): six uniform colours, one small
//                       extra capture per bake of the cube, nothing per frame.
//   floorCoat           strength of the floor's varnish lobe (env/glsl.js ENV_COAT_CODE), 0..1; 0 = no varnish (the floor then
//                       mirrors only through its own roughness). It needs `envBox` (the lobe lives in the reflection patch).
//   floorCoatRoughness  roughness of that lobe (0.2 = a satin varnish; lower is glossier and shows the cube's resolution).
//   mirrorScale         the planar mirror's resolution as a fraction of the drawing buffer (only read when `floorMirror`).
//   ao, aoScale, smaa   the screen-space occlusion pass and SMAA. Both stages are OFF on every tier since round 2 and post.js
//                       does not read `ao` or `smaa` from here: they run only behind the tool switches `?clubpost=ao:live`
//                       and `?clubpost=smaa:1`. The table says what runs.
//   pocketLeather       the pocket part's leather normal map on the collars and in the cups (mat/pocket.js): one lazy
//                       1024 px image (`leather.normal`, 5.6 MB with its mips) and one sampler more in the casting and cup
//                       programs. Off on lite: the pockets keep their shading, flat.
//   motion              which motion parts are built (motion.js; CONTRACT.md section 12): 'full' = chalk dust at the cue tip
//                       and marks on the cloth, 'marks' / 'dust' = that part alone, 'off' = neither (motion.js then loads no
//                       part and subscribes no listener). Tools: `?clubmotion=off`, `?clubmotion=nodust,nomarks`, and
//                       `dust` / `marks` / `full` to ask for a part the tier leaves out (motionFor below).
//                       What a part costs (base, software GL host, a staged pot: reports/r4-wiring.md): dust = 1 draw call
//                       while particles live, 2 triangles per live particle, no texture, and ONE program that is linked
//                       at the first strike (the mesh is hidden until then); marks = no draw call and no triangle (a term
//                       in the cloth's program, compiled behind the curtain), one 32 x 2 float texture (1 024 bytes), one
//                       sampler more in the cloth program, and per cloth fragment inside the marks' bounds two texel
//                       fetches per mark. Lite takes the marks alone: nothing is compiled at the moment of the strike on
//                       the weakest devices, and no blended quads are added to a frame that has none.
//   motionDust          the most dust particles alive at one playback time (motion/dust.js sizes its one buffer by it:
//                       156 bytes a particle; 0 where the tier has no dust).
//   motionMarks         the most cloth marks drawn at one playback time (motion/marks.js; its record texture holds 32,
//                       so 32 is "all of them"). Lite: 12, which bounds the cloth's extra work at 24 texel fetches a
//                       fragment inside the marks' bounds (64 on base); a break makes more marks than that, and the cap
//                       keeps the strongest.
//   audio               what the audio service plays (audio.js): 'full' = the room (room tone and the sparse far sounds)
//                       and the chalking sound, 'sfx' = the chalking sound alone, 'off' = the service builds nothing (no
//                       AudioContext, no node, no listener). What a mode holds once the first gesture has come (the audio
//                       role's counts, reports/r4-audio.md): 'full' = 6 079 068 bytes of rendered buffers (the room bed
//                       alone is 4 800 000), three looping sources, eight gains and two panners running all the time;
//                       'sfx' = 224 756 bytes (four chalk takes), five gains and nothing looping. Lite: 'sfx': a phone
//                       renders and keeps no room bed. Tools: `?clubaudio=off|sfx|full` (audioFor below).

// ---- venues (CONTRACT.md section 13.3) -------------------------------------------------------------------------------------
// A venue is the room the look is built in: `club` (the club room, room.js) or `arena` (a tournament hall, arena/room.js).
// The leaf, the services and the tier table are the same; a venue row holds the few values that differ. Under `club` every
// value is what the look had before venues existed (the node arm pins the row against the constants of post/tune.js and the
// behaviour of audioFor), and the services take their venue branch only when the venue is not `club`.
//   room         the module index.js builds the room service from (a row of its table of literal loaders)
//   audioMax     the loudest audio mode the venue allows (audioFor caps the tier's mode and the `?clubaudio=` switch at
//                it): the arena has no room ambience this round, so it stops at 'sfx' (the chalking sound alone)
//   grade        the post chain's grade: `strength` and `exposure` (post/tune.js CLUB_TUNE.grade under `club`) and
//                `params`, the parameters of the grade table (post/gradelut.js; null = that module's GRADE_DEFAULTS, the
//                club grade: warm highlights, cool shadows). The arena's table is neutral to slightly cool and a little
//                flatter: a hall lit by white rig light, not by tungsten shades. Its exposure is the club's, so the bed is
//                exposed the same in both venues.
//   ambient      gain of the cloth's room-ambient term (mat/cloth.js reads `club.env.ambient` at this gain; 1 under club).
//                The LEVEL of the cloth's ambient light is the cloth part's own look value in every venue (a fixed share
//                of the lamp's light: a dark hall does not darken the bed); the ambient cube only decides how much of
//                that level carries the room's colour and direction. So the gain stays 1 until a frame says otherwise.
//   ambientTint  colour of the part of the cloth's ambient light that the ambient cube does not carry (mat/cloth.js: the
//                flat term). null = the cloth part's own value (mat/cloth/tune.js `pool.tint`: a warm room, the club).
//                The arena's is neutral: a hall lit by white rig light returns no warm fill.
//   floorAlbedo  the floor's diffuse reflectance (scene-linear RGB) for a consumer that models the floor as a matt
//                reflector and finds no `club.room.floor.albedo` (mat/wood.js: what the table's body mirrors and what
//                bounces the lamp's spill). null = that consumer's own stand-in (a varnished plank floor, the club). The
//                arena's is its carpet island (arena/layout.js PALETTE.island, #2a2c31, as linear values).
//   bloom        the app's bloom pass as the venue wants it: { strength, radius, threshold } (post.js; null = post/tune.js
//                CLUB_TUNE.bloom, the club's 0.11 / 0.62 / 1.35). Round A2, the arena: 0.18 / 0.40 / 1.35. The hall's
//                sources are narrow (the boards' LED strip is half a pixel high at the wide eye-height view, the step
//                lights a few pixels): at the club's values the strip was a hard white line, clipped over one pixel row
//                with 7 to 26 levels of halo in the seven rows above it. A smaller radius puts the pass's weight on its
//                narrow levels and the strength is raised: 24 to 77 levels in those rows, a glow the width of the rail,
//                while a dark surface away from any source moves by under 1 level (the drape: 14.0 without bloom, 14.3
//                at the club's values, 14.8 at these) and the bed by 1 (129.5, 129.9, 130.4). The threshold stays: no
//                lit surface of the hall reaches 1.35 (the bed is near 0.1 to 0.5; a threshold of 0.6 changed 2.6 % of
//                that frame's pixels, 1.35 none of those).
//                Round A5 (CONTRACT.md 17.4, glare at the sources): the row is UNCHANGED, and the fixtures' lit lenses
//                (arena/rig) are sized against it. The app's pass takes its gate on a half-resolution copy (the mean
//                of 2 x 2 frame pixels), hard, and adds the whole texel: what makes a halo is the lens disc's MEAN
//                radiance on screen times its area in pixels, not its peak. Measured in the app (high tier, the wide
//                eye-height view, bloom on against off, mid-round; the final lenses read a little higher): a far head
//                of 8 x 7 px gains 47 / 36 / 21 / 13 / 7 / 5 / 1 levels at 1 / 2 / 3 / 4 / 6 / 12 / 24 px outside it;
//                a lens whose map averaged 1.45 (a narrow core at 10.7) gained 3 to 8; the table, the boards and the
//                carpet gain 0.0 to 0.1 per 80 px cell. A core
//                keeps its halo under a moving camera when mean x a x b >= 28 (a, b: its diameters in px). There is
//                no second lobe. The lite tier has no bloom pass: there a core is a clipped dot (so is, in this venue, the base
//                tier: `tierKnobs` below).
//   falloff      strength of the app's exposure falloff toward the corners (null = CLUB_TUNE.falloff, 0.50)
//   textureSizes per-id texture caps of the venue's own asset ids, by tier: { <tier>: { <id>: px } } (null = none). They
//                are laid over the tier's `textureSizes` when the venue is in force (venueTierKnobs below; index.js), so
//                the tier table itself holds no id of a venue. Round A2, the arena on base: `arena.carpet.color` at 512
//                (asked by the carpet's owner: 2.1 mm per texel at 1.1 m per tile, the density of the base tier's 512 px
//                normal map; 1.40 MB on the GPU instead of 5.59 MB), and the two normal maps of the hall's cloths
//                (`arena.carpet.normal`, `arena.drape.normal`) at 256 instead of the tier's 512: 0.35 MB each instead of
//                1.40 MB. With the three caps the base tier's bound textures are 136.3 MiB against the tournament look's
//                118.9 MiB (1.146 x; the round-3 line is 1.15 x = 136.8 MiB; without the two normal caps 138.3 MiB). The
//                two normal caps changed no pixel by 4 levels of 255 or more at the three standard views (a same-tree
//                pair, 1280 x 720, software GL; largest single difference 11). Tools: `?clubtex=arena.carpet.normal:512,
//                arena.drape.normal:512` puts them back for a pair.
//   tierKnobs    knob values of the venue by tier: { <tier>: { <knob>: value } } (null = none). They are laid over the
//                tier's row when the venue is in force (venueTierKnobs below; index.js), as the texture caps are, so
//                the tier table keeps one row per tier for every venue. Only names the tier table has. The arena on
//                base: `bloom: false`. Measured in a visible window on a 120 Hz display (a canvas of 3200 x 1826 at
//                pixel ratio 2, four samples, a laptop GPU of 2024): the hall on base did not fit the display's
//                8.3 ms slot with the app's bloom pass and did fit it without; no other single knob of the tier
//                moved it there, and the old room and the hall on lite fitted. A slot is not a size: the measure
//                says on which side of the line a frame lies, not by how much. What leaves the picture with the pass
//                (a same-tree pair of stills, the wide eye-height view and the low aim view, 1280 x 720, software
//                GL): the halos at the roof lamps' lens cores (up to 138 levels of 255) and, in the low view, the
//                soft glow along the lit cue and at the cue ball's bright side (up to 106); an object ball's
//                highlight moves by 24 at most; the hood's lamp row, the step lights, the boards and the carpet stay
//                within 15, the size of the stills' own compression. The high tier, which is only ever asked for,
//                keeps the pass and the row's `bloom` values; the club venue keeps it on base.
//                Tools: `?clubpost=bloom:1` puts the pass back on base for a pair (`?clubknobs=bloom:1` does not:
//                that switch reads the tier table's row, where the knob is already on).
//   floor        what the room's floor is: 'wood' (a varnished board floor: the reflection service adds its varnish lobe
//                and, on the high tier, the planar mirror; the room draws a lamp reflection) or 'carpet' (matt: no varnish
//                lobe, no mirror, no lamp reflection, no box-projected gloss; CONTRACT.md 13.6). The occlusion service's
//                floor map (the table's shadow) is used on both.
export const VENUE_IDS = Object.freeze(['club', 'arena']);
export const VENUES = Object.freeze({
  club: Object.freeze({
    id: 'club', room: './room.js', audioMax: 'full', ambient: 1, ambientTint: null, floor: 'wood', floorAlbedo: null,
    grade: Object.freeze({ strength: 1.0, exposure: 0.92, params: null }),
    bloom: null, falloff: null, textureSizes: null, tierKnobs: null,
  }),
  arena: Object.freeze({
    id: 'arena', room: './arena/room.js', audioMax: 'sfx', ambient: 1, ambientTint: Object.freeze([1.0, 1.0, 1.0]), floor: 'carpet',
    // (round A3, the albedo law, CONTRACT.md 15.2: the island's carpet is 0.13; the room publishes [0.119, 0.130, 0.160])
    floorAlbedo: Object.freeze([0.12, 0.13, 0.15]),
    grade: Object.freeze({
      strength: 1.0, exposure: 0.92,
      // Round A2: the arena's own grade (round A1's, kept in the node arm as ARENA_A1, moved a frame by 3 levels and
      // read as neutral). A hall under white LED light as a broadcast shows it: cool blacks (the drape, the roof, the
      // seat rows), midtones a little cool (the carpet), whites left white, the cloth's blue and the warm sources kept
      // by a little more saturation, and the deep shadows lifted by 0.7 of a stop so the hall's dark stays above the
      // tone map's toe. Measured in the app at the wide eye-height view against A1's values (the same tree, eight minutes
      // apart): carpet 87,88,93 -> 83,87,96; drape 14,14,17 -> 15,16,21; pixels at or under level 2: 1.6 % -> 0.9 %; the
      // bed 66,142,204 -> 65,141,208. `midTint` and `shadowLift` are venue-only parameters (post/gradelut.js).
      // Round A3: THE TOE. The app's tone curve (three's ACES filmic fit at this exposure) returns exactly zero under a
      // scene radiance of 0.0025 and level 7 of 255 at 0.01; a camera's plain transfer shows 5 and 20 there. Under the
      // albedo law most of a hall lives at those radiances (a black lacquer in light: 0.01 to 0.03; the drape: 0.005 to
      // 0.02; seats in the house light: 0.03), and round A2's lift (0.7 of a stop, from 6 stops under mid grey down)
      // left the lite tier with 7.7 % of the wide frame at or under level 2. The lift is now 2.6 stops, all of it from
      // 7.5 stops under mid grey down and none of it from 1 stop under mid grey up (`shadowLiftRange`): level of 255
      // for a grey radiance, round A2 -> now: 0.001: 0.0 -> 1.8; 0.002: 0.2 -> 5.0; 0.004: 1.9 -> 9.4; 0.007: 4.4 ->
      // 13.4; 0.01: 6.7 -> 16.1; 0.02: 14.7 -> 22.6; 0.03: 21.9 -> 28.2; 0.045: 32.7 -> 36.5; 0.06: 43.4 -> 45.0; 0.09
      // and up: unchanged (the carpet's anchor, the bed, every source). That is a camera's deep end (a plain transfer
      // at the same anchor: 2.4, 4.8, 9.5 at 0.001, 0.002, 0.004) and still under it in the low midtones (20 and 32
      // at 0.01 and 0.02), so the hall keeps its weight. One stop of radiance is never under 4 levels: nothing goes
      // flat. The shadow tint is drawn in with it (0.80 / 1.24 -> 0.90 / 1.12): lifted shadows at round A2's tint
      // read blue. Measured in the app at the wide eye-height view, one boot each, round A2's toe | 1.6 to -6 | this:
      // high (the first A3 bake): at or under level 2: 2.38 % | 0.71 %; at or under 8: 13.45 % | 3.58 %. Base (the
      // second bake): at or under 2: - | 4.52 % | 1.32 %; at or under 8: - | 12.22 % | 6.91 %; the carpet beside the
      // table 88.1 in all; a lift of 3.0 to -8 gave 0.73 % and 5.36 % and began to grey the drape's folds.
      // Round A5 (CONTRACT.md 17.2: walls and drape at 5 to 14, no more than 3 % of a frame at or under level 4): THE
      // LIFT STAYS 2.6, measured against 2.0 and 1.8 in one boot under the round's half-way bake. A grade is one table
      // for the whole frame, and a wall under 0.5 to 0.7 units has the radiance of the black ball's body: 2.0 takes
      // the east drape from 14.9 to 10.7 and the black and the purple ball down by 3.8 and 3.6 levels on a channel
      // (the round holds the balls within 1). So a wall's level is the light's to set: with this toe 5 / 8 / 10 / 14
      // on screen are 0.18 / 0.29 / 0.39 / 0.69 units on the drape's 0.035. Without any lift that frame has 7.8 % of
      // its pixels at or under 4 (with it 0.11 %), and the carpet under the table reads 17 instead of 26.
      params: Object.freeze({
        contrast: 1.10, saturation: 1.18, shadowSaturation: 0.92, highlightSaturation: 1.0,
        shadowTint: Object.freeze([0.90, 1.0, 1.12]), midTint: Object.freeze([0.955, 1.0, 1.05]), highlightTint: Object.freeze([1.0, 1.0, 1.0]),
        shadowLift: 2.6, shadowLiftRange: Object.freeze([-1.0, -7.5]),
      }),
    }),
    bloom: Object.freeze({ strength: 0.18, radius: 0.40, threshold: 1.35 }), falloff: 0.50,
    // (step 2 of the flip: the light hall, `lite` by the stage flow, takes the same three caps)
    textureSizes: Object.freeze({ base: Object.freeze({ 'arena.carpet.color': 512, 'arena.carpet.normal': 256, 'arena.drape.normal': 256 }), lite: Object.freeze({ 'arena.carpet.color': 512, 'arena.carpet.normal': 256, 'arena.drape.normal': 256 }) }),
    tierKnobs: Object.freeze({ base: Object.freeze({ bloom: false }) }),
  }),
});

/**
 * The knobs of a tier as a venue sees them (round A2): the venue row's per-id texture caps for that tier
 * (`row.textureSizes[tier]`) laid over the tier's own `textureSizes`, and the row's knob values for that tier
 * (`row.tierKnobs[tier]`: only names the knob object has, only values that differ) laid over the knobs themselves. A row
 * with neither for the tier (the club row has none at all) gives back the SAME knob object, so under the club venue the
 * knobs are the tier's row itself. Pure.
 */
export function venueTierKnobs(knobs, tier, row) {
  try {
    if (!knobs || typeof knobs !== 'object') return knobs;
    const own = row?.textureSizes?.[tier], caps = !!own && typeof own === 'object' && Object.keys(own).length > 0;
    const asked = row?.tierKnobs?.[tier];
    const moved = asked && typeof asked === 'object' ? Object.entries(asked).filter(([k, v]) => Object.prototype.hasOwnProperty.call(knobs, k) && knobs[k] !== v) : [];
    if (!caps && moved.length === 0) return knobs;
    const out = { ...knobs };
    if (caps) out.textureSizes = Object.freeze({ ...(knobs.textureSizes && typeof knobs.textureSizes === 'object' ? knobs.textureSizes : {}), ...own });
    for (const [k, v] of moved) out[k] = v;
    return Object.freeze(out);
  } catch { return knobs; }
}

/** The venue id for a hand-over value: 'arena' for exactly that word, 'club' for everything else (missing, unknown, not a string). Pure. */
export function venueFor(value) {
  return typeof value === 'string' && VENUE_IDS.includes(value) ? value : 'club';
}

/**
 * The venue row a service reads: `club.venueKnobs` when it is one of the table's rows or carries the members a row has (a
 * dev page may hand its own), else the row of `club.venue`, else the club row. Never throws. Pure.
 */
export function venueKnobsOf(club) {
  try {
    const k = club?.venueKnobs;
    if (k && typeof k === 'object' && typeof k.floor === 'string') return k;
    return VENUES[venueFor(club?.venue)];
  } catch { return VENUES.club; }
}

/** True when the look is built in a venue other than the club room (the one test every venue branch of a service makes). Pure. */
export function isArena(club) {
  try { return venueFor(club?.venue) === 'arena'; } catch { return false; }
}

/**
 * Scene renders a tier adds to each frame (the count the cost table is built on). Pure. The planar mirror is one render of
 * the scene on frames that show the floor; the live cube capture is one cube face of the scene per frame while the cue moves.
 * `venue` (a row of VENUES, optional): a venue whose floor is not wood has no floor mirror on any tier (env.js), so the
 * mirror's render is not counted there. Without a row, or under the club row, the count is the tier's.
 */
export function extraSceneRenders(knobs, venue = null) {
  const mirror = knobs?.floorMirror === true && knobs?.envBox === true && !(typeof venue?.floor === 'string' && venue.floor !== 'wood');
  return (mirror ? 1 : 0) + (knobs?.envLive === true && knobs?.envBox === true ? 1 : 0);
}

// the words a string knob takes (?clubknobs= refuses any other): the mode knobs `ao` and `dof` share one list
const KNOB_WORDS_DEFAULT = Object.freeze(['off', 'still', 'live']);
const KNOB_WORDS = Object.freeze({ motion: Object.freeze(['off', 'dust', 'marks', 'full']), audio: Object.freeze(['off', 'sfx', 'full']) });

/**
 * Which motion parts to build: `{ dust, marks, why: { dust?, marks? } }` (`why` says what switched a part off). The tier's
 * `motion` knob decides; `?clubmotion=` (tools, on / off pairs) overrides it: a comma list of `off` (neither), `nodust`,
 * `nomarks`, and `dust`, `marks`, `full` (ask for a part the tier leaves out). Later words win. Pure.
 */
export function motionFor(knobs, query = null) {
  const mode = KNOB_WORDS.motion.includes(knobs?.motion) ? knobs.motion : 'full';
  const out = { dust: mode === 'full' || mode === 'dust', marks: mode === 'full' || mode === 'marks', why: {} };
  if (!out.dust) out.why.dust = `off on this tier (motion: ${mode})`;
  if (!out.marks) out.why.marks = `off on this tier (motion: ${mode})`;
  let raw = null;
  try { raw = query?.get?.('clubmotion') ?? null; } catch { raw = null; }
  if (typeof raw !== 'string' || !raw) return out;
  const set = (key, on) => { out[key] = on; if (on) delete out.why[key]; else out.why[key] = 'off by ?clubmotion'; };
  for (const word of raw.split(',').map((x) => x.trim().toLowerCase())) {
    if (word === 'off' || word === '0') { set('dust', false); set('marks', false); }
    else if (word === 'full' || word === 'on' || word === '1') { set('dust', true); set('marks', true); }
    else if (word === 'nodust') set('dust', false);
    else if (word === 'nomarks') set('marks', false);
    else if (word === 'dust') set('dust', true);
    else if (word === 'marks') set('marks', true);
  }
  return out;
}

/**
 * What the audio service plays: `{ mode: 'off' | 'sfx' | 'full', why }`. The tier's `audio` knob decides; `?clubaudio=off|
 * sfx|full` (tools) overrides it. On iOS (an iPhone, iPad or iPod user agent, or an iPad presenting itself as a Mac) the
 * answer is `off` unless the switch asks otherwise: the service uses a second audio context, and that has not been checked
 * against the iOS audio session on a device yet. Pure for given `facts` (default: the page's own, deviceFacts()).
 * `venue` (a row of VENUES, optional): the answer is capped at the row's `audioMax`, the switch included (the arena stops at
 * 'sfx': `?clubaudio=full` does not bring a room ambience into the hall). Without a row, or under the club row, nothing is capped.
 */
export function audioFor(knobs, query = null, facts = undefined, venue = null) {
  const out = audioForTier(knobs, query, facts);
  const words = KNOB_WORDS.audio, max = words.indexOf(venue?.audioMax);
  if (max < 0 || words.indexOf(out.mode) <= max) return out;
  return { mode: words[max], why: `venue ${venue?.id ?? '?'}: capped at ${words[max]} (asked: ${out.mode}, ${out.why})` };
}
function audioForTier(knobs, query, facts) {
  const tier = KNOB_WORDS.audio.includes(knobs?.audio) ? knobs.audio : 'full';
  let raw = null;
  try { raw = query?.get?.('clubaudio') ?? null; } catch { raw = null; }
  const asked = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (KNOB_WORDS.audio.includes(asked)) return { mode: asked, why: '?clubaudio' };
  let f = facts;
  if (f === undefined) { try { f = deviceFacts(); } catch { f = null; } }
  if (isIOS(f)) return { mode: 'off', why: 'iOS: off until the device listening check has passed (?clubaudio=full|sfx turns it on)' };
  return { mode: tier, why: `tier (audio: ${tier})` };
}

/** True for an iPhone, iPad or iPod user agent, and for an iPad that presents itself as a Mac (touch points on a Mac platform). */
export function isIOS(facts) {
  if (!facts) return false;
  if (typeof facts.userAgent === 'string' && /iphone|ipad|ipod/i.test(facts.userAgent)) return true;
  return typeof facts.platform === 'string' && /^mac/i.test(facts.platform) && facts.touchPoints > 1;
}

/**
 * `?clubknobs=name:value,name:value` — a tool override of single knobs of the picked tier (on / off pairs of one knob in a
 * picture or a count; never set by the app). Only names the tier table has; the value is read as the type the table holds
 * (boolean: 0 / 1 / true / false / on / off; number; one of the knob's own words for a string knob: KNOB_WORDS). Returns the tier's own frozen
 * object when nothing valid is asked, else a frozen copy, with the names that were changed in `changed`. Pure.
 */
export function knobsFor(tier, query = null) {
  const base = TIERS[tier] ?? TIERS.base;
  let raw = null;
  try { raw = query?.get?.('clubknobs') ?? null; } catch { raw = null; }
  if (typeof raw !== 'string' || !raw) return { knobs: base, changed: [] };
  const out = { ...base }, changed = [];
  for (const part of raw.split(',')) {
    const [k, v = '1'] = part.split(':').map((x) => x.trim());
    if (!k || !Object.prototype.hasOwnProperty.call(base, k)) continue;
    const was = base[k];
    let val;
    if (typeof was === 'boolean') { if (/^(1|true|on)$/.test(v)) val = true; else if (/^(0|false|off)$/.test(v)) val = false; }
    else if (typeof was === 'number') { const n = Number(v); if (v !== '' && Number.isFinite(n) && n >= 0) val = n; }
    else if (typeof was === 'string') { if ((KNOB_WORDS[k] ?? KNOB_WORDS_DEFAULT).includes(v)) val = v; }
    if (val === undefined || val === was) continue;
    out[k] = val; changed.push(k);
  }
  return changed.length ? { knobs: Object.freeze(out), changed } : { knobs: base, changed: [] };
}

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render|lavapipe/i;
const TOUCH_OS = /android|iphone|ipad|ipod|mobile/i;

/**
 * The facts the picker reads, as a plain object (so the rule below is pure). Every read is guarded: a fact that cannot be
 * read is `null` and decides nothing.
 */
export function deviceFacts({ renderer = null, env = globalThis } = {}) {
  const facts = { coarse: null, touchPoints: null, userAgent: null, platform: null, memoryGB: null, maxTextureSize: null, webgl2: null, floatBuffers: null, gpu: null };
  const mq = (q) => { try { const m = env.matchMedia?.(q); return m ? m.matches === true : null; } catch { return null; } };
  facts.coarse = mq('(pointer: coarse)');
  try {
    const nav = env.navigator;
    if (nav) {
      if (Number.isFinite(nav.maxTouchPoints)) facts.touchPoints = nav.maxTouchPoints;
      if (typeof nav.userAgent === 'string') facts.userAgent = nav.userAgent;
      if (typeof nav.platform === 'string') facts.platform = nav.platform;
      if (Number.isFinite(nav.deviceMemory)) facts.memoryGB = nav.deviceMemory;
    }
  } catch { /* no navigator */ }
  try {
    const caps = renderer?.capabilities;
    if (caps) {
      if (Number.isFinite(caps.maxTextureSize)) facts.maxTextureSize = caps.maxTextureSize;
      if (typeof caps.isWebGL2 === 'boolean') facts.webgl2 = caps.isWebGL2;
    }
    if (renderer?.extensions && typeof renderer.extensions.has === 'function') facts.floatBuffers = renderer.extensions.has('EXT_color_buffer_float') === true;
    const gl = renderer?.getContext?.();
    if (gl && typeof gl.getParameter === 'function') {
      // the plain name first (one browser answers it in full and warns when the debug extension is asked for); the
      // extension only where the plain name is the masked constant
      let name = gl.getParameter(gl.RENDERER);
      if (typeof name !== 'string' || !name || /^webkit webgl$|^mozilla$/i.test(name)) {
        const ext = typeof gl.getExtension === 'function' ? gl.getExtension('WEBGL_debug_renderer_info') : null;
        if (ext) name = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      }
      if (typeof name === 'string') facts.gpu = name.slice(0, 160);
    }
  } catch { /* unreadable capabilities: those facts stay null */ }
  return facts;
}

/**
 * The automatic tier for a set of facts: `{ tier: 'lite' | 'base', why }`. Pure. It never answers `high`.
 *   lite  the primary pointer is coarse (phones, tablets, the iOS shell); or the page runs on a touch-first system (its
 *         user agent says Android / iPhone / iPad / Mobile, or it is an iPad that presents itself as a Mac: a Mac platform
 *         with more than one touch point), whatever pointer is attached; or the renderer is a software one; or it lacks
 *         WebGL2, float colour buffers or 8192 px textures; or the device reports 4 GB of memory or less.
 *   base  everything else: every laptop and desktop, whatever its GPU and display.
 * Why `high` is never picked: a page cannot tell a desktop GPU from an integrated one (browsers mask or bucket the renderer
 * name; an integrated GPU drives a 2x display as readily as a discrete one, so pixel ratio and window width say nothing), and
 * `high` adds a second scene render per frame. Guessing wrong costs a laptop half its frame rate; guessing `base` costs a
 * desktop nothing it had before. So `high` is asked for, never assumed.
 */
export function autoTier(facts = {}) {
  if (facts.coarse === true) return { tier: 'lite', why: 'coarse primary pointer' };
  if (typeof facts.userAgent === 'string' && TOUCH_OS.test(facts.userAgent)) return { tier: 'lite', why: 'touch-first system (user agent)' };
  if (typeof facts.platform === 'string' && /^mac/i.test(facts.platform) && facts.touchPoints > 1) return { tier: 'lite', why: 'tablet presenting as a desktop (touch points on a Mac platform)' };
  if (typeof facts.gpu === 'string' && SOFTWARE_GL.test(facts.gpu)) return { tier: 'lite', why: 'software renderer' };
  if (facts.webgl2 === false) return { tier: 'lite', why: 'no WebGL2' };
  if (Number.isFinite(facts.maxTextureSize) && facts.maxTextureSize < 8192) return { tier: 'lite', why: 'maximum texture size under 8192' };
  if (facts.floatBuffers === false) return { tier: 'lite', why: 'no float colour buffers' };
  if (Number.isFinite(facts.memoryGB) && facts.memoryGB <= 4) return { tier: 'lite', why: 'device memory of 4 GB or less' };
  return { tier: 'base', why: 'default (high is opt-in)' };
}

/**
 * Pick the tier and say why: `{ tier, why, forced, facts }`. `?clubtier=lite|base|high` forces one (tests, capture packs, and
 * today the only way to opt in to `high`); otherwise the rule of autoTier().
 */
export function pickTierInfo({ renderer = null, query = null, env = globalThis } = {}) {
  let forced = null;
  try { forced = query?.get?.('clubtier') ?? null; } catch { forced = null; }
  const facts = deviceFacts({ renderer, env });
  if (TIER_IDS.includes(forced)) return { tier: forced, why: '?clubtier', forced: true, facts };
  const auto = autoTier(facts);
  return { tier: auto.tier, why: auto.why, forced: false, facts };
}

/** The tier alone (CONTRACT.md section 5). */
export function pickTier(args = {}) { return pickTierInfo(args).tier; }
