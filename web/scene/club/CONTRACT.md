# The `club` look: module contract

Source of truth for interfaces between the club modules. If a module needs something from another module, it uses exactly what
is written here. Nobody invents a cross-module API: a missing piece gets a safe fallback inside the module and a line in the
role's report.

## 1. Rules that bind every module

- three r170, WebGL2, plain ES modules, no build step. `import * as THREE from 'three'` (the app's import map). Addons only from
  `web/vendor/jsm/`. Read the vendored source instead of guessing an API.
- **Leaf rule.** Everything under `web/scene/club/` is reached only through the one guarded `import('../scene/club/index.js')`
  in `main.js`. Inside the directory modules may import each other statically. No club module is imported by any file outside the
  directory, and no existing module is edited to know about club (the seams in section 7 are the whole list).
- **Existing modules are read-only**: `table.js`, `shading.js`, `room.js`, `look.js`, `lightingvisuals.js`, `gi.js`, `postfx.js`,
  `game.js`, `balls.js`, `cuestick.js`. Reach their objects through the scene graph, `userData` tags, `window.__lighting`,
  `window.__gi`, the room's `lightRefs`, and the references `main.js` hands to `installClub`. Feature-detect every such read.
- **Look off = byte-identical.** Nothing in this directory runs unless the boot look is `club`. No module-level side effects:
  importing a club module must do nothing until `installClub` calls its `create*`.
- **Degrade, never die.** Every `create*` either returns its service or returns a stub with `enabled: false`; consumers check
  `enabled`. A failed asset falls back to a procedural stand-in. An uncaught error inside club must leave the `tournament` frame
  on screen.
- **Physics is untouched.** No motion equations. Poses come from the game (`ballSet`, the cue group); time comes from the game
  clock handed in `ctx`. Effects are pure functions of the shot record and the clock.
- **Units and axes.** Metres, seconds, radians. Y up. Bed plane y = 0, ball centre y = 0.028575. The table's long axis is world x.
  The room's floor is at y = `room.FLOOR_Y` (read it, do not copy it).
- **Linear HDR until the tone map.** Custom shaders write scene-linear colour and include three's `tonemapping_fragment` and
  `colorspace_fragment` chunks, so they also work when drawn straight to the screen.
- **Samplers.** WebGL2 gives a program 16 texture units and the cloth program already spends several. Each shared service may
  add at most ONE sampler to an adopted material. Every club material has a `name`.
- **Light set.** Do not add, remove, or toggle `castShadow` on any three light after boot, and do not enable `renderer.shadowMap`:
  the light set is part of every lit material's program key (`main.js` `lightSetKey`), and a change recompiles the whole scene.
  Room light is baked; emissive surfaces are `MeshBasicMaterial` or emissive maps.
- **No per-frame GPU read-back** (`readRenderTargetPixels`, `getBufferSubData`): load time only.
- **Studio windows.** While `window.__cinelight === true` do not write lights, exposure, the environment or the post chain; park
  the write and apply it on the `ob:cinelight` close, as `look.js` does.
- **Text.** English, no personal names, no home paths, no brand names or trade dress, in code, comments and assets.

## 2. `installClub(ctx)` (`index.js`, owner: integrator)

```
ctx = {
  renderer, scene, camera, composer,          // main.js objects
  room,                                        // roomMod.activeRoom.instance (group, lightRefs, envRefs, ...)
  gi, machine, game,                           // baked GI handle, the state machine (machine.on('frame', (clock, dt) => ...)), the game
  rebakeEnv,                                   // () => void: re-capture the environment cube
  query,                                       // URLSearchParams of the boot URL
}
club = await installClub(ctx)  ->  {
  enabled, tier,                               // 'lite' | 'base' | 'high' (tiers.js; ?clubtier= forces one)
  ctx,
  time: { value },                             // shared uniform object: game clock in seconds
  assets, adopt, env, occ, post, room,         // the services below
  onFrame(fn), offFrame(fn),                   // fn(clock, dt), called once per delivered frame before the composer renders
  state(),                                     // plain object for tools: tier, services enabled, counts, anchors hit/missed, assets loaded/fallback
}
```
`window.__club = club` is published for tools and dev pages only; no app code reads it. Order inside `installClub`: tiers ->
assets (manifest only) -> room -> env -> occ -> adopt -> post -> first environment capture -> `state().ready = true`.

## 3. Assets (`assets.js`, owner: integrator)

```
assets.texture(id, { srgb, repeat, anisotropy, fallback }) -> THREE.Texture   // returns at once; fills in when loaded
assets.ready(ids?) -> Promise<void>                                             // resolves when the named (or all requested) settle
assets.state() -> { requested, loaded, fallback, bytes }
```
Ids resolve through `web/assets/club/manifest.json` (id -> file per tier, sha256, bytes). A missing or failed file gives the
`fallback` (a small procedural canvas texture) and is counted. Tier `lite` loads the 1024 px variants.

## 4. Shared render services

### 4.1 Reflection (`env.js`, owner: light)
```
env = {
  enabled,
  box: { min: Vector3, max: Vector3, center: Vector3 },     // room box used for box projection (from the club room)
  uniforms: { uClubEnvBoxMin, uClubEnvBoxMax, uClubEnvPos }, // shared uniform OBJECTS
  glsl,                // declares the uniforms and: vec3 clubEnvDir(vec3 worldPos, vec3 R)  -> corrected lookup direction
  capture(reason),     // re-capture now (calls ctx.rebakeEnv); coalesced; never inside a studio window
  exclude(object3d),   // never drawn in the capture (dust, decals, the cue on tiers without live capture)
  mirror: null | { texture, matrix, enabled },               // high tier: planar floor mirror
}
```
The cube itself stays the app's 512 px cube bound as `scene.environment`; the service does not create a second cube sampler.

### 4.2 Occlusion and shadow (`occlusion.js`, owner: light)
```
occ = {
  enabled,
  table: { texture, uniforms: { uClubVisMap, uClubVisRect }, ready: Promise },   // top-down atlas of bed + cushions + rail tops
  floor: { texture, uniforms: { uClubFloorMap, uClubFloorRect }, ready: Promise },
  cue:   { uniforms: { uClubCueA, uClubCueB, uClubCueR, uClubCueOn } },           // capsule end points (world), radii, on/off
  glsl,     // vec2 clubVisibility(vec3 worldPos)   -> (lamp visibility 0..1, ambient occlusion 0..1) from the table atlas
            // float clubCueShadow(vec3 worldPos)   -> lamp visibility 0..1 past the cue capsule under the rectangular lamp
            // float clubFloorShadow(vec3 worldPos) -> lamp visibility on the floor
  rebuild(reason),  // table / fixture / brightness changed: recompute atlases in slices of <= 8 ms
  update(),         // per frame: cue pose -> uniforms
}
```
Atlas texel format RG8 (R = lamp visibility, G = ambient occlusion). The lamp rectangle comes from the shared emitter uniforms
the app already maintains (`shading.js setEmitters`: `uLightPos`, `uLightHalf`); do not duplicate lamp numbers.

### 4.3 Material adoption (`adopt.js`, owner: light; patches are written by the owner of each surface)
```
adopt.find(cls) -> Material[]            // cls: 'cloth' | 'railwood' | 'apron' | 'ball' | 'cue' | 'pocket' | 'metal' | 'sight' | 'room'
adopt.patch(material, { key, uniforms, pars, apply: [{ anchor, mode: 'before'|'after'|'replace', code }] })
adopt.state() -> { patched, anchorsHit, anchorsMissed: [{ material, key, anchor }] }
```
`patch` wraps `onBeforeCompile` (the previous hook runs first) and `customProgramCacheKey` (previous key + `|club:` + key), then
sets `needsUpdate`. Anchors are standard three chunk includes or documented marker lines; a missed anchor is recorded, logged
once with `console.error`, and the patch for that material is skipped whole (never half applied). Classes are found by
`userData.obClass`, object names (`obCueStick`), the ball set, and geometry tags listed in `adopt.js`.

### 4.4 Post chain (`post.js`, owner: render)
```
post = {
  enabled,
  depthTexture,                       // scene depth of the current frame
  dof:   { enabled, focus, aperture, setFocusTarget(Vector3 | null), auto },
  ao:    { enabled, intensity, radius },
  bloom: { strength, radius, threshold },
  grade: { lut, strength, exposure },
  hdrTap,                             // the render target holding linear HDR before the tone map (accumulator / export tap)
  setSize(w, h, pixelRatio), render(dt),
  counts(),                           // passes, render-target bytes
}
```
The chain is built on the app's existing `EffectComposer` instance (passes inserted between its RenderPass and OutputPass), so
`composer.render()`, `composer.setSize()`, `composer.readBuffer` semantics, `composer.__obCine` and the offline accumulator keep
working. `window.__obBloom` keeps its meaning.

### 4.5 Room (`room.js`, owner: room)
```
room = {
  enabled, group,                      // the club room; the app room's walls, floor and props are hidden, its lamp and lights stay
  box,                                 // interior box for env.box
  floor: { mesh, material },           // receives occ.floor and env.mirror
  emissives: Object3D[],               // lit signs, shelves, far lamps (bloom and bokeh sources)
  lightmap: { texture, ready },        // baked room light
  setTier(tier),
}
```

## 5. Tiers (`tiers.js`, owner: integrator)

`pickTier({ renderer, query })` -> `'lite' | 'base' | 'high'`; `TIERS[tier]` is a frozen table of every knob (texture size, AO
on/off and resolution, DOF mode, bloom, mirror, live capture, room detail). Modules read knobs from `club.tier` /
`TIERS[club.tier]` only; no module sniffs the device itself.

## 6. Dev pages, pictures, tests

- Dev page per role: `web/tools/club/dev-<role>.html`: imports the role's module, builds the smallest scene that shows it
  (stand-ins for other roles' services), sets `window.__ready = true` after the first real frames, takes `?view=` parameters.
- Pictures: only through the lane's `shot.zsh` (one Chrome for the lane, lease, hours, load). JPEG, at most 1280x720; prefer a
  number (`club.state()`, counts) when a number answers the question. Never read a PNG back.
- Node arms: `web/tools/club/test-club-*.mjs` for pure logic (tier table, manifest and credits, anchor tables, capsule shadow
  math against a brute-force reference).
- Every report states, per item: verified in the app at a fixed view / verified on the dev page only / compiled only / not done.

## 7. Seams in existing files (the whole list; owner: integrator)

`web/app/settings.js` (sanitizer + option + reload confirm), `web/app/locales/*.json` (one or two keys x 7),
`web/app/main.js` (boot-look read accepts `club`; one guarded dynamic import and hand-over), `web/vendor/jsm/` (four r170 addons
and their direct imports), `web/sw.js` + the `app.html` generation id (regenerated).

## 8. Round-1 role map and added interfaces

Round 1 runs seven roles. Each file below has exactly one owner; everything else is read-only for that role.

| role | owns |
|---|---|
| lead | `CONTRACT.md`, `adopt.js`, `patchtext.js` (frozen in round 1: ask in your report), the lane's shot tools and views |
| integrator | `index.js`, `tiers.js`, `assets.js`, the seams in `web/app/settings.js` and `web/app/locales/*.json`, `web/tools/club/test-club-core.mjs`, `test-club-identity*.mjs`, `test-club-assets.mjs`, `web/vendor/jsm/PROVENANCE-club.md` |
| assets | `web/assets/club/**` (files, `manifest.json`, `CREDITS.md`, `credits.json`), `web/tools/club/asset-*.mjs` |
| room | `room.js`, `room/shell.js`, `room/light.js`, `room/tex.js`, `web/tools/club/dev-room.html` |
| props | `room/props.js`, `room/props/**`, `web/tools/club/dev-props.html` |
| occ | `occlusion.js`, `occ/**`, `web/tools/club/dev-occ.html`, `web/tools/club/test-club-occ.mjs` |
| env | `env.js`, `env/**`, `web/tools/club/dev-env.html` |
| render | `post.js`, `post/**`, `web/tools/club/dev-post.html`, `web/tools/club/test-club-post.mjs` |

`mat/index.js` (materials) and `detail/`, `motion/` stay stubs until rounds 2-4.

### 8.1 Hand-over from `main.js` (as built)
`installClub(ctx)` receives `{ renderer, scene, camera, composer, gi, machine, game, room, table, rebakeEnv, query }`.
`room` is the app room (`roomMod.buildRoom(...)` result) and `table` the `buildTable(...)` result; both are read-only, feature-detect
every member. The import happens in `startLoop` right after the composer exists, so the first frames of a `club` boot are
`tournament` frames; the look must come in without a visible broken frame (build hidden, show when ready).

### 8.2 Room light (`room/light.js`, owner: room; used by room and props)
The club room's own materials are lit by (a) the app's existing three lights, which stay exactly as they are, and (b) the club
room's fixed emitters (sconces, lit shelves, far lamps, the main lamp's spill), evaluated analytically in club-owned materials.
No three light is added.
```
import { roomLight } from './light.js'            // props import it as '../light.js' through a guarded dynamic import
roomLight.addEmitter({ id, type: 'point' | 'rect' | 'tube', position: Vector3, color: Color, intensity,  // intensity in the app's light units
                       radius, size?: [w, h], axis?: Vector3, normal?: Vector3 })
roomLight.material({ color, map, roughness, metalness, normalMap, roughnessMap, emissive, emissiveMap, ao?: number, name })
    -> THREE.Material   // a MeshStandardMaterial lit by the three lights plus every registered emitter (up to roomLight.MAX_EMITTERS)
roomLight.emissive({ color, intensity, map, name }) -> THREE.Material   // an unlit HDR emitter surface (bloom and bokeh source)
roomLight.commit()      // called once by room.js after shell and props are built: freezes the emitter list into uniforms
```
Until `room/light.js` exports these, props falls back to plain `MeshStandardMaterial` / `MeshBasicMaterial` with the same
parameters, and switches when the import resolves with the functions present.

### 8.3 Props (`room/props.js`, owner: props; called by `room.js`)
```
export async function buildProps(club, { box, floorY, tableBounds, roomLight }) -> { group, emissives: Object3D[], setTier(tier), counts() }
```
`box` is the interior box of the shell (`{ min, max }`, world metres), `tableBounds` the keep-out rectangle around the table and
the players (`{ minX, maxX, minZ, maxZ }`), `roomLight` the 8.2 object or `null`. `room.js` adds `group` to its own group and
appends `emissives`. `club.knobs.roomDetail` (0, 1, 2) and `club.knobs.farTable` choose what is built.
The shell (room) owns: floor, walls, wainscot, ceiling, beams, doors, windows, skirting, wall lamps fixed to the shell, and hiding
the app room's walls, floor and props. Props owns everything that stands in or hangs on the room: back bar and lit shelves, the
far table and its lamp, chairs, stools, side tables, cue racks, framed pictures, signs, a scoreboard, plants, coat hooks.

### 8.4 Patches on adopted materials in round 1
With no materials role yet, the service owners apply their own patches through `club.adopt.patch`:
- occ: `clubVisibility` (lamp visibility + ambient occlusion from the table atlas) and `clubCueShadow` on `cloth`, `railwood`,
  `apron`; `clubFloorShadow` on the club floor material (through `club.room.floor.material`, when present).
- env: box-projected reflection lookup on `railwood`, `apron` and the club floor.
Keys: `occ-v<N>` and `env-v<N>`; a change of patch text changes the key. `before` / `after` anchors only, so the two compose
in either order. Each service adds at most one sampler to an adopted material.

### 8.5 Post chain order and taps (owner: render)
`scene -> [ao] -> [dof] -> bloom (the app's pass, retuned) -> falloff (the app's pass) -> grade -> OutputPass -> [smaa]`.
`post.hdrTap` is the linear HDR buffer the app's accumulator and export read today; the render role proves first, on its dev page
and in the app, that the offline accumulator / export path still sees the same image as the screen (GH-329) with the chain on.

### 8.6 Accepted additions (lead, during round 1)
- 8.3 `buildProps(club, { box, floorY, tableBounds, roomLight, reserved, layout })`: `reserved` = the wall spans the shell keeps
  for itself (door, windows, wall lamps), each `{ wall: 'xp' | 'xn' | 'zp' | 'zn', from, to }` in world metres along that wall;
  `layout` = the shell's full layout description (`room/shell.js`). Props must place nothing on a reserved span; the shell does
  not move or withdraw a lamp at run time once props honour `reserved`.
- 8.2 `roomLight.material({ ..., vertexColors, envMapIntensity })`: both pass through to the material.
- 8.2 emitter budget: `roomLight.MAX_EMITTERS` is shared; the shell uses at most half of it on every tier, so props always have
  the other half.
- Section 3 `assets.texture()`: one texture object and one upload per (id, options); the same id with other options shares
  the image source.
- `web/tools/club/test-club-props.mjs` belongs to the props role (node arm for `room/props/layout.js`).

## 9. Round 1b role map (after the round-1 lead review)

| role | owns |
|---|---|
| lead | `CONTRACT.md`, `adopt.js`, `patchtext.js`, `mat/index.js` (wiring), shot tools and views |
| cloth | `mat/cloth.js`, `mat/cloth/**`, `web/tools/club/dev-cloth.html`, `web/tools/club/test-club-cloth.mjs` |
| wood | `mat/wood.js`, `mat/wood/**`, `web/tools/club/dev-wood.html`, `web/tools/club/test-club-wood.mjs` |
| occ | `occlusion.js`, `occ/**`, `web/tools/club/dev-occ.html`, `web/tools/club/test-club-occ.mjs` |
| lamp | `room/lamp.js`, `room/lamp/**`, `web/tools/club/dev-lamp.html` |
| bake | `room.js`, `room/shell.js`, `room/light.js`, `room/tex.js`, `room/lightmap.js`, `web/tools/club/bake-room*.{mjs,html}`, `web/tools/club/dev-room.html`, the baked files `web/assets/club/room-light*.{png,jpg}` and their manifest and credits rows |
| render | `post.js`, `post/**`, `room/props.js`, `room/props/**`, `web/tools/club/dev-post.html`, `dev-props.html`, `test-club-post.mjs`, `test-club-props.mjs` |
| integrator | `index.js`, `tiers.js`, `assets.js`, `env.js`, `env/**`, `web/tools/club/dev-env.html`, `test-club-core.mjs`, `test-club-identity*.mjs`, `test-club-assets.mjs`, the settings and locale seams |

### 9.1 Material parts (`mat/cloth.js`, `mat/wood.js`)
```
export async function applyCloth(club) -> { enabled, reason?, rebuild(reason), state() }     // classes: cloth (bed and cushion cloth)
export async function applyWood(club)  -> { enabled, reason?, rebuild(reason), state() }     // classes: railwood, apron (+ sights)
```
Each part patches its classes through `club.adopt.patch` with keys `mat-cloth-v<N>` / `mat-wood-v<N>` (`before` / `after`
anchors only; they compose with `occ-v<N>` and `env-v<N>`, which are already in the shader text when a part runs), swaps maps on
the material instances where needed, and adds at most ONE sampler per material beyond what the material already binds (check the
program's sampler count against the 16-unit limit and report it). Uniform values that must return to the tournament state when
the look is off do not exist: the look applies per page load.

### 9.2 Luminaire (`room/lamp.js`, owner: lamp; called by `room.js`)
```
export async function buildLamp(club, { box, floorY, tableBounds, roomLight, appRoom }) -> { group, emissives, update(camera), setTier(tier), counts() }
```
The main table's luminaire as the club look shows it. The app's own light (the RectAreaLight and the shared emitter uniforms) is
never changed; this is the visible object only, plus how the app's luminaire meshes and its camera fade (`lampfade.js`) are treated
under club: solid or absent, never a translucent ghost.

## 10. Round 2 role map (after the round-1 look-check)

| role | owns |
|---|---|
| lead | `CONTRACT.md`, `adopt.js`, `patchtext.js`, `mat/index.js` (wiring), shot tools, views, `web/tools/club/sheet-pair.html` |
| pocket | `mat/pocket.js`, `mat/pocket/**`, `web/tools/club/dev-pocket.html`, `web/tools/club/test-club-pocket.mjs` |
| cloth | `mat/cloth.js`, `mat/cloth/**`, `web/tools/club/dev-cloth.html`, `web/tools/club/test-club-cloth.mjs` |
| wood | `mat/wood.js`, `mat/wood/**`, `web/tools/club/dev-wood.html`, `web/tools/club/test-club-wood.mjs` |
| lamp | `room/lamp.js`, `room/lamp/**`, `web/tools/club/dev-lamp.html` |
| props | `room/props.js`, `room/props/**`, `web/tools/club/dev-props.html`, `web/tools/club/test-club-props.mjs` |
| post | `post.js`, `post/**`, `web/tools/club/dev-post.html`, `web/tools/club/test-club-post.mjs` |
| room | `room.js`, `room/shell.js`, `room/light.js`, `room/tex.js`, `room/lightmap.js`, `web/tools/club/bake-room*`, `web/tools/club/dev-room.html`, `web/assets/club/room-light*` and their manifest / credits rows |
| integrator | `index.js`, `tiers.js`, `assets.js`, `env.js`, `env/**`, `occlusion.js`, `occ/**`, `web/tools/club/dev-env.html`, `dev-occ.html`, `test-club-core.mjs`, `test-club-identity*.mjs`, `test-club-assets.mjs`, `test-club-occ.mjs` |

### 10.1 Pocket part (`mat/pocket.js`)
`export async function applyPocket(club) -> { enabled, reason?, rebuild(reason), state() }`: the pocket liners, castings and the
cloth lip (class `pocket`, already adopted by the occ service; find them through `club.adopt.find('pocket')`), key
`mat-pocket-v<N>`, the 9.1 rules.

### 10.2 Rules added by the round-1 look-check
- **Legal:** every label, sign, picture and board is our own generic content: no real brand, logo or legible trade name.
- **Readability first:** depth of field never softens a ball on the bed, the aim line or a pocket in a player view; the cloth's
  far end keeps balls and numbers legible.
- **The played table leads:** the second table and its lamp are never brighter than the main bed in any frame.
- **Tiers:** `base` and `lite` stay at parity with the tournament look in scene renders per frame and close to it in draw calls and
  triangles; anything that costs a scene render or a large triangle count is `high` only.

### 10.3 Accepted in round 2 (these lines replace the older text where they differ)
- **Post chain (replaces the order in 8.5):** `scene -> bloom (app) -> [lens] -> falloff (app, folded into the grade) + grade ->
  OutputPass`. The ambient-occlusion pass and SMAA are off on every tier and stay behind the tool switches `clubpost=ao:live` and
  `clubpost=smaa:1` until an app picture proves them; `tiers.js` says what runs. The fold toggles the `enabled` flag of the app's
  falloff pass and gives it back on `dispose()`, on a failure and in a debug view.
- **Depth (replaces 4.4):** `depthTexture` is LINEAR view distance in metres (R32F) and is drawn only once a consumer reads the
  getter. The lens has a guard (`post/guard.js`): the sharp range always covers the whole playing surface, and `focus`,
  `setFocusTarget` and `auto` can only extend it. `counts()` reports `guard`, `programs`, `knobsNotUsed`, `frame.zone`.
- **Ambient for the cloth:** `club.env.ambient` (`env/ambient.js`): the room's light on the bed without the table lamp; the cloth
  reads it at gain 1. No cube render is added by the club look.
- **Pocket part:** adds and hides no mesh (the ball return reads scene meshes as furniture); it patches the app's own collar,
  lip and cup materials. It stands down on a table without a fall lip (the generic table).
- **Lamp:** the diffuser is plain data in `room/lamp/face.js` (`lamp.face()`), read by the wood part for the rail's lamp image;
  the lamp registers one room-light emitter, `lamp.band` (its spill).
- **Room light:** `room-light.png` carries the light map and a light volume for the furniture; the lite tier has its own file
  (`room.light.lite`). A bake made for another room is refused with a console warning: the seal boots each tier once and reads
  `club.room.state().lightmap.on`.
- **Tier knobs added:** `pocketLeather` (off on lite). `farTableDetail` has no reader yet.
- **Legal arm:** `test-club-props.mjs` pins the list of words and pictures the props draw; a new word or picture fails it until it
  has been audited.

## 11. Round 3 role map (after the round-2 look-check)

Order of work set by the look-check: base-tier parity first, then the lamp pool on the cloth in the player views, the lamp in
the standing view, the rail's reflection, the lamp from below and its floor pool, the start-up curtain, coverage of the other
fixtures and cloths.

### 11.1 Roles and files
| role | files | round-3 work |
|---|---|---|
| lead | `web/app/main.js` seam, `mat/index.js`, this file | the start-up curtain (the app's boot screen stays until the club look is shown) |
| parity | `tiers.js`, `assets.js`, `index.js`, `env.js`, `env/*`, `occlusion.js`, `occ/*`, the asset manifest and credits, and the tier lines of 11.2 | base tier within +15 % of the tournament look's texture memory and +10 % of its draw calls and triangles; lite no worse than base |
| cloth | `mat/cloth.js`, `mat/cloth/*` | the lamp pool visible at V1, V2, V7 with round 2's far-end legibility kept; other cloth colours |
| wood | `mat/wood.js`, `mat/wood/*` | the room mirrored in the rail's coat in close views; the rail's lamp image |
| lamp | `room/lamp.js`, `room/lamp/*` | the lamp in the standing view (eye line), the diffuser from below, the other fixtures in the app |
| room | `room.js`, `room/shell.js`, `room/light.js`, `room/lightmap.js`, the bake tools, the baked files | a lamp pool and a lamp-shaped reflection on the floor, grounded furniture, the last bake |
| props | `room/props.js`, `room/props/*` | bottles behind the lens, the second table, contact-size and cast-size shadow overlays split, base-tier geometry |
| post | `post.js`, `post/*` | the lens guard re-proved on the base tier; the base tier's moving frames |

### 11.2 Tier lines (owner: parity, in every club file)
A line that picks a texture size, a texture variant, a mip or anisotropy level, or a geometry detail level from the tier
belongs to `parity` this round, wherever it is. `parity` lists every such line it changed in its report; the file's owner
keeps everything else. Budgets (loan host numbers are provisional; the method is `renderer.info` plus the texture ledger of
the round-2 integrator report): base texture memory at most 1.15 x the tournament look's; base draw calls and triangles at
most 1.10 x at V1, V2 and V10; one scene render per frame on lite and base.

## 12. Round 4: sound and motion without new seams

### 12.1 Roles and files
| role | files | work |
|---|---|---|
| lead | this file, `mat/index.js`, the lane's picture tool | interfaces, review |
| wiring | `index.js`, `tiers.js`, `assets.js`, `motion.js` (new: the motion service's entry), the identity and core arms | list the two new services, tier knobs, look-off identity, bake and furniture safety of the new meshes |
| audio | `audio.js` (new: the audio service), `audio/*`, `web/tools/club/dev-audio.html`, `test-club-audio.mjs` | room ambience, chalking, small table sounds |
| dust | `motion/dust.js`, `motion/dust/*`, `web/tools/club/dev-dust.html`, `test-club-dust.mjs` | chalk dust at the cue tip on a strike |
| marks | `motion/marks.js`, `motion/marks/*`, `web/tools/club/dev-marks.html`, `test-club-marks.mjs`; this round also `mat/cloth.js` and `mat/cloth/*` if a mark term in the cloth patch is the better home | marks on the cloth |

### 12.2 Interfaces
- `web/scene/club/audio.js`: `export async function createAudio(club) -> { enabled, reason?, state(), set(opts), dispose() }`.
- `web/scene/club/motion.js` (wiring): `export async function createMotion(club) -> { enabled, reason?, parts, state(), dispose() }`;
  it loads its parts with literal dynamic imports, like `mat/index.js`: `./motion/dust.js` (`export async function
  applyDust(club)`) and `./motion/marks.js` (`export async function applyMarks(club)`), each returning
  `{ enabled, reason?, update(t, record), state(), dispose() }`. A missing or failing part leaves the others running.
- Parts as built: `applyDust(club, kit)` / `applyMarks(club, kit)` return `{ enabled, reason?, update(t, record, info), state(),
  dispose(), clear?(), onState?(), rebuild?() }`. `kit` (frozen) is what a part uses: `root` (a group already in the scene,
  named `obAimClubMotion.<key>`: everything a part draws goes under it, so the app's capture hiders and the ball-return's
  furniture walk skip it like the aim visuals), `scene` (read), `game` (a read-only proxy; `sampler` and `buf` read as
  undefined), `machine` (`state`, `is()` only), `table()`, `knobs`, `tier`, `want`, `note(text)`, `key`.
- Time: `motion.js` owns the one `'frame'` and the one `'stateChange'` listener and calls `update(t, record, info)` once per
  delivered frame while a record exists. **`t` is the ball clock (`game.clock`)**, the time the ball meshes are posed at; in a
  two-clock call (`renderAt(t, dt, tCam)`) the event's own time is the camera clock and is handed as `info.tEvent`. `t` jumps
  backwards, repeats and may exceed the duration; a part keeps no state that the next call needs. A throw from a part
  switches that part off for good, with a note.
- Switches: `?clubaudio=off|sfx|full`, `?clubmotion=off` and `?clubmotion=nodust,nomarks`; tier knobs `audio` and `motion`
  in `tiers.js` (wiring decides the lite values and says what each costs).

### 12.3 Laws (the round-4 addendum of the brief has the full text)
Read-only toward the game; pure in playback time; listeners never throw; no mesh that the ball-return could take for
furniture or that an environment capture could see; nothing exists with the look off; sound stays out of exports and never
touches the simulation; the audio service follows the app's mute and volume (`window.__sound.muted`, `.volume`) and creates
its AudioContext only after a real user gesture.

## 13. Round A1: the `arena` venue (a tournament hall on the club services)

`arena` is a second opt-in look id. It is the club look with another room: the same leaf, the same services, one venue
switch. The plan is the lane's `PLAN-A0-arena.md`. **The bar, for every role:** realism at the maximum; every surface is
judged against photographs and broadcast stills of the real thing, and the report says plainly where a browser game cannot
reach them. **No people in any scene:** no figure, silhouette, face or crowd, painted or modelled; the seating is empty.

### 13.1 Roles and files
| role | files | A1 work |
|---|---|---|
| lead | this file, `mat/index.js`, the lane's picture tools | interfaces, review, the sheet |
| venue | the seams (`web/app/main.js` club block, `web/app/settings.js` club block, `web/app/locales/*.json`, the census fixture's line pins), `index.js`, `tiers.js`, `assets.js`, `env.js`, `env/*`, `occlusion.js`, `occ/*`, `post.js`, `post/*`, `mat/*` except `mat/index.js`, `motion.js`, `motion/*`, `audio.js`, `audio/*`, `test-club-core.mjs`, `test-club-identity*.mjs` | the look id, the venue switch, the venue values, every place a shared service assumes the club room |
| hall | `arena/room.js`, `arena/shell.js`, `arena/shell/*`, `arena/layout.js`, `room/light.js`, `room/lightmap.js`, the bake tools (`web/tools/club/bake-room*`), `web/assets/club/arena-light*` with their manifest and credits rows, `web/tools/club/dev-arena.html`, `test-club-arena.mjs` | the hall, the carpet and island, the room object, the arena's light and bake |
| rig | `arena/rig.js`, `arena/rig/*`, `web/tools/club/dev-arena-rig.html`, `test-club-arena-rig.mjs` | truss, table-light housing, lamp heads, house lights |
| surround | `arena/surround.js`, `arena/surround/*`, `web/tools/club/dev-arena-surround.html`, `test-club-arena-surround.mjs` | boards and lit rail, seating, steps, backdrop, scoreboard, the word list |

`room.js` (the club room), `room/shell.js`, `room/tex.js`, `room/lamp*`, `room/props*`, `adopt.js`, `patchtext.js` have no
owner this round: read-only for everyone (import from them freely).

### 13.2 The law of this round: the club venue does not change by a byte
Every edit to an existing club file is venue-conditional or a pure refactor. With the venue `club` every value, every shader
string, every program key and every request is what it was at `48b5d9815`. The lead proves it with club frames at V1, V2
and V10 (high tier) from a frozen export of that commit against the round's tree; every club node arm stays green. With the
look off (`tournament`, `green`) nothing changes either: the identity arms as they are, plus: no visible `arena` option.

### 13.3 The venue switch (owner: venue)
- Look id: `?look=arena` or a stored `look: 'arena'` boots the tournament path and performs the SAME one guarded import as
  `club`. `main.js` hands `venue: 'arena'` in the hand-over, which keeps its pinned form `club: bootClub ? { ... } : null`.
- `club.venue`: `'club' | 'arena'` (default `'club'` for a missing or unknown value). `club.venueKnobs`: the frozen row of
  `tiers.js VENUES[venue]`: at least `{ room, audioMax, grade, ambient }`. Under `club` the row holds today's constants.
- `index.js` builds the room service from `./arena/room.js` (`createRoom`) under `arena` and from `./room.js` otherwise, both
  by literal dynamic imports. A missing or failing arena room is a stub (`enabled: false`): the app room stays, nothing dies.
- Under `arena`: the audio service's mode is capped at `sfx` (no room ambience; `?clubaudio=full` does not lift it this
  round); the post chain's grade takes the arena values (neutral to slightly cool); the tiers, the lens guard, the motion
  parts and the material parts run as under `club`.
- Settings: the sanitizer accepts `arena`; the stored-value entry and the reload offer cover it; label key
  `settings.lookArena` ("Tournament arena") in the 7 locales; no option in the markup.
- Tools: `dshot.zsh <role> --look arena ...` waits for the install like `--look club` and records `window.__club.state()`.

### 13.4 The arena room (`arena/room.js`, owner: hall)
`export async function createRoom(club)` returns the object of section 4.5 with every member another service reads today:
`enabled`, `group`, `box` (`min`, `max`, `center`: the hall), `floor: { mesh, material, albedo, builtinShadow }`, `emissives`,
`light` (the room-light service, with `irradianceAt`), `lightmap: { texture, ready, state(), set(on), signature(), preview(),
floorIrradiance(x, z) }`, `parts: { lamp, surround }` (`parts.lamp` is the rig: the luminaire of the venue), `layout`,
`tableBounds`, `setTier(tier)`, `recapture(reason)`, `state()`, `dispose()`. It hides the app room's walls, floor, floor
shadow overlay and wall props exactly as `room.js` does, builds hidden, and swaps in one synchronous step.
It loads its two parts by literal dynamic imports with bounded waits, the way `room.js` loads the lamp and the props
(a late part is added when it arrives; a failed part leaves the hall standing):
```
import('./rig.js')      -> buildRig(club, { box, floorY, tableBounds, roomLight, appRoom, layout, spill: true })
                           -> { group, emissives, update(camera), setTier(tier), counts(), face(), state(), dispose() }
import('./surround.js') -> buildSurround(club, { box, floorY, tableBounds, roomLight, layout })
                           -> { group, emissives, setTier(tier), counts(), state(), dispose() }
```
`buildRig` keeps the luminaire's interface (9.2, 10.3): `face()` is the diffuser as plain data (the wood part's lamp image
reads it), it registers the one spill emitter `lamp.band`, it treats the app's own luminaire meshes and their camera fade as
`room/lamp.js` does (solid or absent, never a translucent ghost), and it follows the lamp view rule of round 3 (drawn only
where the frame holds it whole). The app's light (the RectAreaLight, the shared emitter uniforms) is never changed.

### 13.5 Layout, palette, words (`arena/layout.js`, owner: hall; v0 by the lead)
One pure-data module, no three import: `ARENA` (hall box, island, keep-out, boards, seating, backdrop, rig, house lights,
reserved floor positions, the emitter shares), `PALETTE`, `WORDS`, `VIEWS`, `seatingRows()`, `blockFootprint()`. Heights are
above the floor; builders add the live floor height. Rig and surround read every position and size from it and write a
needed change to `scratch/<role>/NEED-FROM-hall.md`; hall answers by editing the module (and says so in its log).
- Keep-out: nothing stands in the stroke room around the table or inside the volume the app's camera can reach. Hall's first
  step is to read that volume from the app's camera code and pin it in the layout arm.
- Emitters: the room-light service has 24 for the room: hall 6, rig 9, surround 9.
- Words: only `WORDS` (`9-BALL`, `TABLE 1`, `ARENA`, `FINAL`) and geometric marks; the surround's arm pins the list and
  everything drawn. The game's own name is not used. No real event, sponsor, logo, venue or person; not the palette or
  board layout of a real event.

### 13.6 Light
No three light is added, removed or changed; `renderer.shadowMap` stays off. Arena-owned materials come from the room-light
service (`roomLight.material`, `roomLight.emissive`), lit by the app's three lights plus the registered emitters, analytic
first and baked when the hall's bake exists (ids `arena.light`, `arena.light.lite`; a bake made for another layout is
refused by its signature). The bed, the balls and the cue keep the tournament's light. The carpet is matt: no floor mirror,
no varnish lobe; the occlusion service's floor map owns the table's shadow on it.

### 13.7 Tiers and budget
Default tier (lite, base): 2048 px at most, the lane's 12 MB lazy cap for club and arena together, base texture memory at
most 1.15 x the tournament look's, base draw calls and triangles at most 1.10 x at V1, V2, V10, one scene render per frame.
On lite and base the seating is cards (one per row on base, one per block on lite); instancing and merged geometry
everywhere. A1 builds the default-tier content on every tier, parametrised by `club.knobs.roomDetail` (0, 1, 2); the high
tier's pack and geometry (4096 px hero maps, every seat real, lattice truss members) are round A2. Tier lines belong to
the file's owner this round.

## 14. Round A2: the arena toward a photograph

A1 reads as a tournament hall; A2 closes the distance to a photograph of one. Section 13 stands (the bar, no people, the
byte-equal law for the club venue, the venue switch, the interfaces); this section changes the role map and adds what is new.

### 14.1 Roles and files
| role | files | A2 work, in order |
|---|---|---|
| lead | this file, `mat/index.js`, the picture tools | review, the sheet |
| bake | `arena/room.js`, `arena/layout.js`, `room/light.js`, `room/lightmap.js`, `web/tools/club/bake-room*`, `web/assets/club/arena-light*` and their manifest and credits rows, `dev-arena.html`, `test-club-arena.mjs` | the arena's baked light: map and volume, lite file; contact darkening, bounce, seat rows that read; the final bake of the round |
| shell | `arena/shell.js`, `arena/shell/*`, `dev-arena-shell.html`, `test-club-arena-shell.mjs` | carpet (pile, seams, wear, colour pick-up), drape, the backdrop as stretched fabric, the roof's lid |
| rig | `arena/rig.js`, `arena/rig/*`, `dev-arena-rig.html`, `test-club-arena-rig.mjs` | FIRST: lamp heads light their own side; then roof steel with fixtures for the house lights, a denser rig, the housing's side and underside, haze cones (high) |
| surround | `arena/surround.js`, `arena/surround/*`, `dev-arena-surround.html`, `test-club-arena-surround.mjs` | the lit rail (bloom, spill), board panels and frames, every seat real on the high tier, seat fabric, step nosings, hoop handrails |
| floor | `arena/floor.js`, `arena/floor/*`, `dev-arena-floor.html`, `test-club-arena-floor.mjs` | TV cameras on pedestals, the players' chairs and side tables, the referee's table, steps to the stands, taped cable runs |
| assets | `web/assets/club/**` except `arena-light*`, `manifest.json`, `credits.json`, `CREDITS.md`, `assets.js`, `web/tools/club/asset-*`, `test-club-assets.mjs` | CC0 scans for the arena, the high tier's pack, the loader's high variants |
| venue | the A1 list of 13.1 without `assets.js` | a tool switch for the app's own cloth, the arena grade, the table's apron and legs in the hall's light, the rail's bloom, the texture ledger |

`manifest.json`, `credits.json` and `CREDITS.md` are edited by two roles (assets: everything; bake: only the `arena.light*`
rows): re-read the file before every edit and change only your rows, never rewrite the file.

### 14.2 New and changed interfaces
- **Floor part** (`arena/floor.js`, owner: floor; loaded by `arena/room.js` like the other parts):
  `buildFloor(club, { box, floorY, tableBounds, roomLight, layout })` -> `{ group, emissives, setTier(tier), counts(),
  state(), signature(), dispose() }`. Positions: `ARENA.floor` in the layout. `room.parts.floor`.
- **Geometry and the bake.** Every part publishes `signature()` (a short string that changes when its geometry or emitter
  positions change; levels are not in it). The bake's record carries the parts' signatures; a part that changed since the
  bake makes the room report it (`state().lightmap.stale`) and the map is still used unless the layout itself changed.
  Each part role writes `scratch/<role>/GEOMETRY-STABLE.md` (UTC time, its signature) when its geometry is final for the
  round, and never moves geometry after that line without telling the bake role in `scratch/<role>/NEED-FROM-bake.md`.
- **Shadow overlays.** Under a bake, cast-size overlays are hidden and contact-size ones stay, as in the club room
  (`arena.<part>.castshadow`, `arena.<part>.contactshadow`).
- **Emitters** (24 in all): bake 2, shell 4, rig 9, surround 6, floor 3. A part that needs more asks the bake role (the
  layout's owner). The lamp heads light the side of the island they hang over.
- **Assets** (owner: assets). New ids, each with a default-tier file inside the lane's 12 MB lazy cap and, where named, a
  high-tier file under `web/assets/club/high/` (JPEG only: that extension is outside the service worker's precache list):
  `arena.carpet.color|normal|rough` (high: 4096), `arena.seat.color|normal|rough`, `arena.drape.normal|rough`,
  `arena.alu.normal|rough` (or the club's `metal.*` if they serve). The loader takes the high file only when the tier is
  `high`; on lite and base no request names `high/`. Until a file exists the id falls back to the caller's procedural
  texture, as today. A2 ships at most 30 MB in all (bakes included).
- **The app's own cloth under the arena** (owner: venue): a tool switch, `?clubcloth=app`, leaves the cloth class as the
  tournament look has it (no cloth part, no cloth patch). It is read only when the venue is `arena` (ignored under `club`,
  never read with the look off), it is off by default, it lives inside the leaf (no seam), and the core and identity arms
  cover it. It exists for the owner's comparison frames and is removed or carded before any change of a default.
- **Tier lines** belong to the file's owner. A1's deviation stands: the lite seating is row cards.

### 14.3 What each surface is judged against
The lane's reference folder holds photographs of real halls, truss, seating and cameras with the lead's notes
(`reference/stills/arena/NOTES.md` in the lane directory, never in the repo). Six things a real hall has that A1 lacks, in
order: a roof full of steel, fixtures and hung equipment; seats lit enough to read row by row; lit board edges that bloom
and spill onto what is next to them; a dense rig; event furniture; carpet that takes the colour of the light near it.

## 15. Round A3: real materials under real light levels

A2 could be a hall; A3 removes what still says "rendered": a table that is a black cut-out, materials five times too dark
under five times too much light (so nothing bounces), a lit rail that switches by a view rule, cameras at knee height, a
blue-and-red palette. Sections 13 and 14 stand; this section changes the role map and adds the laws of the round.

### 15.1 Roles and files
| role | files | A3 work, in order |
|---|---|---|
| lead | this file, `mat/index.js`, the picture tools | review, the sheet |
| light | `arena/room.js`, `arena/layout.js`, `arena/rig.js`, `arena/rig/*`, `room/light.js`, `room/lightmap.js`, `web/tools/club/bake-room*`, `web/assets/club/arena-light*` with their manifest and credits rows, `dev-arena.html`, `dev-arena-rig.html`, `test-club-arena.mjs`, `test-club-arena-rig.mjs` | FIRST: the albedo table and the level factor in the layout; then the heads' levels, a cone for point emitters, the bake at the half-way point and the final bake |
| shell | `arena/shell.js`, `arena/shell/*`, `dev-arena-shell.html`, `test-club-arena-shell.mjs` | carpet, drape and backdrop on the albedo table; the island's edge; the base tier's drape |
| surround | `arena/surround.js`, `arena/surround/*`, `dev-arena-surround.html`, `test-club-arena-surround.mjs` | the rail as optics; seats in the plan's palette; boards and seats on the albedo table; the rail's spill |
| floor | `arena/floor.js`, `arena/floor/*`, `dev-arena-floor.html`, `test-club-arena-floor.mjs` | cameras at full height by placement; furniture on the albedo table |
| table | the venue role's list of 14.1 (`index.js`, `tiers.js`, `env*`, `occ*`, `post*`, `mat/*` except `mat/index.js`, `motion*`, `audio*`, core and identity arms) | the table's body in the hall; lite and base blacks; the base margins |

### 15.2 The albedo law
Every arena surface carries the albedo of its real material class, and the light levels are set so that the frame is
exposed as before. Nothing is tuned to a screenshot by darkening a material. The table (`ALBEDO` in `arena/layout.js`,
written first by the light role; mean diffuse reflectance, linear; a builder scales its colour map so the map's MEAN lands
on the value):

| surface | value | surface | value |
|---|---|---|---|
| carpet, outer | 0.10 | seat fabric (graphite upholstery) | 0.09 |
| carpet, island | 0.13 | seat shells, frames, handrails (black powder coat) | 0.04 |
| drape (black wool serge) | 0.035 | decks and steps (dark painted board) | 0.10 |
| backdrop fabric (grey stretch cloth) | 0.18 | step nosings (pale anti-slip strip) | 0.45 |
| board face (deep navy print) | 0.05 | camera bodies, pedestals (matt black) | 0.04 |
| board frames, truss, steel | metal (no diffuse albedo) | chair leather (dark brown) | 0.06 |
| referee's cloth (black) | 0.04 | table body | the app's own material per part (16.3) |

The level factor: A2's carpet stood at 0.03, so the lamp heads' wash comes down to about 0.3 of its A2 level and every
other emitter is re-set by the same reasoning (the light role publishes the factors per emitter group in
`scratch/light/LEVELS.md` within its first 30 minutes; the part roles apply them to their own emitters). The frame's
anchors stay where A2 had them at V10: carpet beside the table 75-90 of 255, the bed about 146 (the bed is lit by the
app's lamp and does not move). What changes is what the light does after it lands: bounce under the table, a pool
around it, lit undersides, colour pick-up.

### 15.3 No view rules
Nothing in the arena is shown, hidden, dimmed or switched by where the camera is, except what CONTRACT already carries
from the club look (the table light's lamp view rule of round 3; the hall's cut-away walls). The rail's glare cut-off goes:
the strip sits in a profile, and what a camera sees of it follows from the profile's geometry and the strip's emission
alone. The cameras stand at full height (lens 1.4-1.6 m) in places the app's camera cannot reach (`inCameraVolume()`).

### 15.4 Palette
Seats are graphite (the plan's palette), not red: red seats with navy boards are the blue-and-red scheme the accepted plan
excluded. `PALETTE` keeps navy boards, a white lit rail, an amber wash. The seat count is 384 (the layout's); nobody
claims more.

### 15.5 Bake and budget
The map stays 1024 px on every tier this round. The part roles write `scratch/<role>/GEOMETRY-STABLE.md` and
`LEVELS-STABLE.md` (emitter levels final); the light role bakes when both are in from every part, and again after any
declared change. A3 ships nothing new except re-baked light files; the default tier stays within 12 MB (10.47 MB now) and
the round's total within 30 MB.

## 16. Round A4: the light of a real empty hall

A3 made the hall physically honest and too dark to be alive: it shows a hall with the house lights off. A real hall with
nobody in it (our scenes have no people) has its house lights partly up. A4 keeps A3's physics (the albedo law, no view
rules, the palette) and brings that light. Sections 13-15 stand; the role map is 15.1's (light, shell, surround, floor,
table), each with its A3 files.

### 16.1 The state the hall is in
"Before the session, house lights at half": a soft, neutral to slightly warm wash from above over the whole hall (the roof
fixtures that exist), the rig's wash on the island, the lit boards, the backdrop's amber wash, the step lights. No coloured
wash on the seating (A3's violet goes). The table's own light is the app's and stays untouched; the bed remains the
brightest surface of the frame.

### 16.2 Level targets (the lead's, at V10 on the high tier, levels of 255; the roles hit them by light, never by albedo)
| surface | target | A3 | surface | target | A3 |
|---|---|---|---|---|---|
| bed | about 144 (must not move) | 144 | board faces (mean) | 45-70, words plainly legible | 19 |
| carpet 1 m outside the long rail | 75-90 | 83 | rail seen from the play views (V3: mean over its visible height) | 50-90, under the bed's mean | 16 |
| carpet at the boards | 45-60 | 44 | the table's legs (their own material) | 50-90 | 18 |
| carpet under the table | 15-30 | 28 | the table's apron (its own material) | by its material, with a visible band of the lit carpet | 16 |
| seat rows, front | 55-70 | 26 | drape, fold ridges | 25-45 | near black |
| seat rows, top | 40-55 | 33 | drape, deep folds and the hall's corners | at least 8 | 0-7 |
| roof steel and fixtures (upper third) | 30-50 | 39 | cameras and platforms (bodies) | 25-45, form readable | unseen |

Nothing but a light source or a small highlight is over 235. No more than 2 % of any review frame is at or under level 4.
Base and lite meet the same targets within 10 levels. The light role publishes the emitter levels that reach these numbers
in `scratch/light/LEVELS-A4.md` (with the arithmetic) within its first 40 minutes and bakes at the half-way point and at
the end; a role that cannot reach its target with the published light says so there, with numbers, instead of brightening
a material.

### 16.3 Corrections to 15.2
- **The table's body is not one black material.** Row "table body 0.04" is withdrawn. The table keeps the albedo and
  colour of the app's own material per part (legs, apron panels, trim, as the tournament look shows them); the arena only
  changes what lights them: the hall's baked light, the carpet's bounce, the planar mirror of the lit carpet, contact
  shading at the legs.
- **Board faces:** print lit from the front by its own strip, or panels that emit (LED boards), whichever a same-tree pair
  shows to be the better photograph; a printed face may use an albedo up to 0.20 for its light parts (the words and marks),
  with the navy ground kept dark.

### 16.4 The rail
A profile whose opal face is partly visible to a low eye (the strip tilted toward the playing floor or set in a channel
with a low inner lip), at half of A3's emission. Geometry and a surface emission law only; the arm that fails on a
camera-position term stays.

### 16.5 Cameras
Full height, on platforms outside the app camera's reach, in places V10, TV and BACK frame, and lit by the house light.

### 16.6 What the round found (the lead, at integration; these correct 16.2 and 16.4)
- **The legs' target (50-90) is withdrawn.** It contradicted 16.3: the lead read it off the tournament look, where the
  app's flat fill makes the cabinet grey. The app's cabinet is a black-stained wood (albedo about 0.003); under real hall
  light it is a dark table with form (legs 12-26, the long apron 36 at V10). The arena keeps the app's material
  (`HALL_OWN`, on a matt floor of 0.045, the number the club venue gives this material); another cabinet finish would
  be a seam edit and is not proposed.
- **16.4 asked for two things that cannot both hold.** A rail whose peak stays under the bed's peak is under the post
  chain's bloom threshold (1.35), so it has no halo; the threshold stays (lowering it costs the cue, the balls and the
  near rail 2 to 5 levels for under one level of halo). The rail is a chamfered corner profile with a 4 mm slit; no
  painted glow is allowed in its place.
- **Board faces are LED panels by default** (even face, words 40 levels over the ground); the front-lit print stays
  behind the tool switch `clubsurround=boards:print` and is never baked.
- **The frames' metal is a declared stand-in:** they take 0.04 of the table's reflection cube and a diffuse share in its
  place, because the hall has no reflection cube of its own. A second cube is not planned.
- **The seats' slot occlusion is a form factor of the seat's own section, stored per vertex:** occlusion of light, not a
  painted shade, and independent of the view.
- **The corners' "at least 8" is met with the venue grade's shadow lift** (grade off: 6 in the darkest fold).
- Open for the next round: 16.2's "within 10 levels" fails on base and lite at the upper east rows (cards against
  seats, up to 18), the under-table carpet reads 31-37 (over 15-30: the house light fills the table's shadow), the exit
  doors are not dark recesses, the lite tier's drape is flat panels.

## 17. Round A5: light with shape, and colour

A4 is the first arena that reads as a real hall, and it is grey and evenly lit (look-check c285ef1d). A5 keeps A4's
hall and changes how it is lit and what colour it has. Sections 13-16 stand (the albedo law, no view rules, no people,
the words, the role map of 15.1 with each role's files). Commit `813a58328f` is exported for the Mac word and is not
touched: A5 works in the clone only and never writes under `mac-export/`.

### 17.1 The picture
A real hall before a session: the playing floor is the bright zone, a pool of neutral light from the rig over the island
with the table's shadow inside it; the stands sit in warmer, dimmer light from a few directed floods, brighter in the
front rows and falling off upward; the walls and the drape above and behind the stands fall to near black; every lit
fixture is seen as a source (a hot core, a falloff, glare), and on the high tier its beam shows in the haze; the screens
are the brightest surfaces after the bed.

### 17.2 Level targets (V10, high tier, levels of 255; by light, never by albedo)
| surface | target | A4 | surface | target | A4 |
|---|---|---|---|---|---|
| bed | about 144 (must not move) | 145 | carpet under the table | 15-30, with a shadow edge that reads | 31-37 |
| carpet beside the table (the pool) | 80-95 | 67-83 | carpet at the boards | 40-55 | 50 |
| seat rows, front | 50-70 | 58-62 | seat rows, top | 28-45 | 54-62 |
| drape behind the stands, lower third | 12-25 | 29-34 | drape and walls, upper half | 5-14 | 29-35 |
| roof steel near a lit fixture / away | 30-45 / 10-25 | 30 | screens (mean of the lit face) | 95-130, under the bed's peak | not measured |
| a lit fixture's core | at least 240 in a few pixels, with a halo that falls off | flat white | camera bodies | 25-45, an edge that separates them from the drape | 30-43 |

Warm against cool: on a neutral surface in the stands (a stair nosing) red reads at least 8 levels over blue; on the
island's carpet the light stays neutral (the carpet's own tint only). No more than 3 % of any review frame is at or under
level 4; nothing but a source, a screen or a small highlight is over 235. Base and lite: the same targets within 10
levels (beams in the haze are a high-tier item).

### 17.3 Colour
- **Seats:** one muted colour inside the palette's exclusions (no red, no violet): a deep petrol green or an ochre,
  decided by the surround role from a same-tree pair at V10 and V3 against the hall photographs (the better photograph
  of an empty hall; the bed stays the most saturated thing in the play views; seats and navy boards must not read as a
  two-colour livery). Real fabric albedos (petrol about 0.05-0.08, ochre about 0.18-0.25). The colour not chosen and
  A4's graphite stay behind `clubsurround=seats:petrol|ochre|graphite`, never baked. The choice is published in
  `scratch/surround/SEAT-COLOUR.md` within the role's first 50 minutes, because the bake holds its bounce.
- **House light:** about 3000 K on the stands; the rig's light on the island neutral (about 4500-5600 K).
- White-ground printed boards are not in this round.

### 17.4 Sources
A lit fixture has a lens or reflector face modelled with a core over the post chain's bloom threshold and a body that
stays dark; the glare is the post chain's own bloom (no sprite that turns to the camera, no view rule). The rail, the
bed and the board faces stay under the threshold. Beams in the haze: high tier only, inside the existing haze cost.

### 17.5 Working rules that A4's slips made necessary
- The light role posts every bake window in `scratch/light/BAKE-STATE.md` (start, end, what must not be saved). Every
  role reads that file immediately before every save of a file that ships; inside a window nobody saves geometry, an
  emitter or an albedo.
- A part builds at every save: land each step whole (A4's floor part broke the shared tree twice).
- A level is read from a pixel box that holds only the surface named; the box is written beside the number.

### 17.6 What the round found (the lead, at integration)
- **Seats are ochre** (`#92875d`, fabric albedo 0.18), chosen over petrol green (`#2a4d54`, 0.065) and A4's graphite by
  a same-tree pair with the light map off (the two others refuse the bake: `clubsurround=seats:petrol|graphite`). Under
  the 3000 K floods it gives the hall its warm half against the bed's blue; petrol reads as a second cold colour.
- **The roof is lit by two declared stand-ins, not by the bake:** the lid by a shader term that sums the upward leak of
  the rig's lit bells (`HALL.bellUp`, high tier only), the roof steel by a vertex wash pooled beside the bells
  (`WASH.roofPool`). Both are light from modelled fixtures and independent of the view; neither is shadowed, and base
  and lite keep a black lid. A baked uplight replaces them when the bake gets one (then `bellUp` is 0).
- **Glare is the post chain's own bloom** on lens cores over its threshold; the arena's bloom row and the grade's
  shadow lift (2.6) did not change. The lite tier has no bloom pass: a core there is a clipped dot.
- **A low camera stands on the playing floor:** a remote head on a short post whose top (1.02 m) is under the app
  camera's cone by the layout's exact test (underside 1.125 m there).
- Not met and open for the next round: the table's shadow has no edge at the table's outline (a soft pool); the
  table's body has less form than in A4 (its near legs sink into the shadow); the stand cameras read 15-22 (target
  25-45); the scoreboard's face is at 33 (the screens' row: 95-130); base and lite seat cards are 10-15 under the
  real seats in the top rows; beams in the haze barely read; the backdrop's top is not dark; the exit doors' leaves are
  no darker than the drape beside them.

## 18. Round A6: the table in the pool, fabric, and the last stand-ins

A5 gave the hall light and colour (look-check 7c5c6d11: accepted, ochre chosen). What still reads as CG is the table (a
black block on black legs with a soft pool and no contact edge), the fabrics, the dark stand cameras, the roof's
stand-ins, an even carpet and a uniform hood edge. A6 answers those and changes nothing else. Sections 13-17 stand.
Commit `16b85e434` is exported for the Mac word and is frozen: A6 works in the clone only and never writes under
`mac-export/`. The app's black cabinet stays (ruling 7c5c6d11, question 2): it is lit better, not replaced.

### 18.1 Targets (V10, high tier, levels of 255, by light; each row has ONE owner, who answers for it in its report)
| surface | target | A5 | owner (helps) |
|---|---|---|---|
| bed | about 144 (must not move) | 144.8 | everyone |
| carpet beside the table / at the boards | 80-95 / 40-55 | 83 / 55 | light |
| the table's shadow | under the table 15-30, and a step of at least 8 levels across the table's outline within 6 px at V10 and TV | 23, no step | light (table) |
| the table's near legs, lit faces | 26-40, and at least 6 over the carpet's shadow beside them | 17-20, under it | light (table) |
| the long apron, lit face | 35-55 with a band of lit carpet low in its gloss | 32 | table (light) |
| seat rows, front / top | 50-70 / 28-45, upholstery that reads at V10 | 52-55 / 45-46, pads | surround |
| seat cards on base and lite | within 10 of high at (420,292), (790,292), (290,172), (900,188) | up to 15 under | surround (light) |
| the scoreboard's lit face | 95-130, under the bed's peak | 33 | surround |
| board words at the box centred (215,392) | at least 75 | 68 | surround |
| stand camera heads | 25-45 with a lit edge that separates them from the drape | 18 / 29 | floor (light) |
| the roof lid and steel, every tier | by the bake: 30-45 near a lit fixture, 10-25 away | stand-ins, black on base and lite | light (shell) |
| drape, lower third / upper half, beams included | 12-25 / 5-14 | 19-24 / 15-22 | light (shell) |
| a beam in the haze (high tier) | its core at least 6 over the drape beside it | barely reads | light |
| the backdrop's top third | at most 25, the amber holding the lower half | 56-63 | shell (light) |
| exit door leaves | at least 4 under the drape beside them | level with it | shell |
| the carpet's sheen | at V10 and TV a nap or sheen difference of at least 5 levels that follows the light and is not in the baked irradiance (app pair, on against off) | dev page only | shell |
| the hood's lower edge | its lamp rows read and the edge falls off toward its ends (no uniform bar); the bed's light does not change | a uniform white bar | light |

No more than 3 % of any review frame at or under level 4; nothing but a source, a screen or a small highlight over 235;
base and lite within 10 levels of high on every row that exists there.

### 18.2 Laws of the round
- The albedo law, no view rules, no people, the words, the palette (ochre seats, navy boards, no red, no violet) stand.
- The roof's stand-ins (`HALL.bellUp`, `WASH.roofPool`) go when the bake carries the bells' uplight; nothing is lit twice.
- The table's light on the bed, the balls, the cue and the rails' lamp image are the app's and do not change; the one
  exception is the lite tier's rail lamp image under the arena venue (24 levels over high at V1), which the table role
  may cure venue-conditionally.

### 18.3 Working rules (A5's slips)
- **A step lands dark, then is switched in.** New code goes in under new names that nothing reads yet; one edit of one
  file switches it in. After every save of a file that ships, the role runs its own arm and `test-club-arena.mjs`
  within the minute; a red arm is fixed or the save reverted within two minutes. A shader edit is followed at once by
  its compile check.
- **Asks between roles are written in the first 30 minutes** (`scratch/<asker>/NEED-FROM-<owner>.md`), and every role
  reads the asks addressed to it at least every 30 minutes. A target's owner is the one named in 18.1.
- Bake windows, pixel boxes and stamps as in 17.5 and the brief.

### 18.4 What the round found (the lead, at integration)
- **The table's shadow is the bake's, and it is one piece because of a bake rule.** The first A6 bake let low keys with
  shutter cuts light the carpet at the legs' feet (73-96 there, the shadow only 0.4 m inside the outline); the lead
  ordered a corrective bake (A6b). In it the four table keys are not baked and the heads' and profiles' light stops at
  the table's valance, 0.05 m either side of the outline: a rule in the bake tool, not occlusion by the table's mesh,
  and so a declared stand-in. The keys still light the table's body at run time (`hallKeysInBake` tells the body model
  which case holds). The step across the outline is 12-16 px wide at V10: the map's texel (3.6 cm) is the limit.
- **The legs' row is met in part** (near legs 26-29, the far-side box 15; A5 11-20): with the shadow whole the legs
  take what the keys give the app's black cabinet. The shadow has priority over the legs.
- **The roof is on the bake on every tier** (the bells' uplight); `HALL.bellUp` and `WASH.roofPool` are 0 (the two
  terms stay in the code as tool switches for pairs).
- **New declared stand-ins:** a constant on the cameras' front lens elements (the table's mirror image as a number,
  where a prop has no reflection of the island); a matt pale finish on the flight case's edges; the steel bottle as a
  darkened metal and the ice bucket as satin grey (a prop's mirror lookups fade to black downward and the table's cube
  over-fills them). They go when props get a reflection of the hall.
- **Seat cards on base and lite miss the top-left block** (base 12 under, lite 19 under): the high tier's haze over the
  stands, one normal per card, and no emitter loop on lite.
- Open for the next round: the bed reads 1.0 under A5 at the lead's box (haze in front of it); the drape's lower third
  is under its band in places and on base and lite; the lid near a lit bell is at 22-32 (30-45); the carpet's sheen at
  TV reads only beside the table; the door leaves read as a black mouth.

## 19. Round A7: the stand-ins end, the tiers agree, the bed comes back

A6 removed tells and left stand-ins (look-check c72f246e: accepted; the stand-ins of 18.4 are allowed only as a path,
never as the end state; the bed comes back to 144.8 in this round; dark pixels go back under A5's levels; the tape
crosses read as tape or go; the light map stays 1024 px and is re-packed). Sections 13-18 stand. Commit `0b1cad569` is
the base. Two exported trees are frozen (`mac-export/a5-16b85e434` for the Mac word, and the older A4 one).

### 19.1 One reflection of the hall (new; ends the stand-ins of 18.4 on props and metal)
- **The file:** a small static cube of the arena, baked on the loan host by the bake tool from the same scene the light
  map is baked from (the lit hall with the island, the stands, the screens and the hood, no bed content that moves):
  six faces of at most 128 px on high and base and 64 px on lite, in a PNG the service worker precaches, at most
  400,000 bytes in all on the default tier, with manifest and credits rows and a signature the bake check reads
  (`arena-env*.png`; owner: the light role). No cube is rendered at run time.
- **The service:** the env service hands it to arena materials that ask for it, venue-conditional, with a roughness
  chain (mips or a blurred copy) and the box of the hall for a local correction (owner: the table role). The club venue
  requests nothing new.
- **The readers:** the floor's props (steel, glass, lenses, the flight case's edges), the surround's frame metal
  (CONTRACT 16.6's stand-in) and, if it reads better in a pair, the table's body gloss. Each stand-in of 18.4 that its
  reader replaces is deleted, not left beside it.

### 19.2 The table is an occluder in the bake
The bake reads the table as the app builds it (cabinet, apron, legs, the rails' overhang, the hood): the valance rule of
18.4 goes. The floor's share of the 1024 px map is re-packed (the island's carpet at about 2 cm a texel or better) so
the step across the table's outline is under 8 px at V10. The keys may be baked again only if no light reaches the
carpet under the cabinet beyond the penumbra the mesh gives.

### 19.3 Targets (V10, high tier, levels of 255, the lead's 9 x 9 boxes by centre pixel unless a box is given; ONE owner each)
| surface | target | A6 | owner (helps) |
|---|---|---|---|
| bed (620,395) | 144.8 +- 0.3 (A5's; it must not move again) | 143.8 | light (table) |
| pixels at or under level 4 | V10 high at most 0.14 %, base 1.06 %, lite 1.30 % (A5's); every review pose on high under 0.5 % | 0.75 / 1.75 / 2.59 % | light (shell) |
| the table's shadow | under 15-30; feet boxes at most 6 over it; the step across the outline under 8 px at V10 and under 16 px at TV; by mesh occlusion | 23; 12-16 px; a bake rule | light (table) |
| near legs (440,505) (600,545) / long apron (705,440) | at least A6's (26 / 29 / 42) | 26 / 29 / 42 | table (light) |
| seat cards on base and lite | within 10 of high (aim 5) at four pad-only boxes, one per block and row, published by the surround in its first 30 minutes | 11.6 and 18.8 under at the top-left | surround (light) |
| seat rows on high, the same four boxes | front 50-70, top 28-45 | 39 / 52, 51 / 42 at the lead's old boxes | surround (light) |
| fabric at distance | at V10 and V3 the seats show weave or nap variation that is not there in A6 (a pair, crops at 1:1) | none | surround |
| steel (the bucket, the bottle), the lens, the case's edges, the frames' metal | read as their material by the hall's reflection: no constant, no darkened metal; under 20 % of a steel box at 0-2 | stand-ins | floor, surround (table, light) |
| drape, lower third, every tier | 12-25 | 10-19 on high, 7-9 on base and lite | light (shell) |
| the lid near a lit bell | 30-45 | 22-32 | light |
| the backdrop's top third, haze cone included | at most 25 | 25-27 cloth, 37-43 in the cone | light (shell) |
| exit door leaves | 3-8 and under the drape beside them, with a line or panel that says "door" | 1-2, a black mouth | shell |
| the floor's tape crosses | read as tape at V10 and V9 (matt, darker than now, wider) or are removed | two stray white dashes | floor |

Nothing but a source, a screen or a small highlight over 235. Base and lite within 10 of high on every row that exists
there. Budgets unchanged; the cube file is the only new shipped file.

### 19.4 Working rules (A6's slips)
- **Two bakes, and the lead looks at the first.** The light role writes `scratch/light/HALFWAY-A7.md` the moment the
  half-way files are written; the lead takes his own frames of them and writes `scratch/lead/HALFWAY-A7-LEAD.md`
  (what he sees, what must change). The final bake is not started before that note exists or 40 minutes have passed.
  A level goes into a final file only after a trial seen in the app at V10 AND V9. A third bake needs the lead's word
  (a line in `scratch/light/NEED-FROM-lead.md`; the lead reads it at least every 30 minutes).
- **Tags are used once:** the picture tool refuses a tag whose record exists; every tag of this round starts `a7`.
- **A step is tried in a scratch copy of the tree first** (`scratch/<role>/tree/`, your own copy of `web/scene/club` and
  `web/tools/club`): the arms run there; only a step that is green there is then made in the shared tree (the same
  edits, by the edit tool, dark first, then switched in by one edit). A red arm in the shared tree is fixed or reverted within two minutes. The aim is zero red spells.
- Asks in the first 30 minutes, read at least every 30 minutes; bake windows, pixel boxes and stamps as before.

### 19.5 What the round found (the lead, at integration; the lead's own frames `a7s1`..`a7s11` unless a role is named)
- **Met.** The stand-ins of 18.4 are deleted, not switched off: the valance rule (the table is a mesh occluder in the
  bake; the island's carpet is packed at 2.0 cm a texel in the 1024 px map), the lens constant, the darkened steel, the
  case's edges, the frames' metal. One baked cube of the hall (`arena-env.png` 128 px faces, `arena-env-lite.png`
  64 px; 389,602 of 400,000 bytes) is served by `club.env.hall` under the arena only; nothing is rendered at run time.
  The table's shadow: under 21.3 / 24.3, the five feet boxes 23.4 to 28.2, no light under the cabinet. Near legs and
  apron 25.9 / 28.9 / 42.0 (base 25.9 / 28.9 / 40.6, lite 27.0 / 30.3 / 40.7). Drape, lower third: 20.3 / 24.3 high,
  20.1 / 18.4 base, 17.7 / 16.8 lite. Pixels at or under level 4 at V10: base 0.44 %, lite 0.65 % (lines 1.06 / 1.30;
  A6 1.75 / 2.59); every review pose on high under 0.5 % (the most: V10 0.27, V9 0.22, TV 0.21, BACK 0.19). Seat rows
  on high at the surround's boxes 60.1 / 54.7 front, 42.1 top right. Cards on base: within 10 of high at all four boxes
  (+7.9, +6.5, -2.5, -3.2). The tape crosses, the coil and the run are removed; spike tape stays only at chair feet
  and the low camera's plate. The exit reads as a door pair (frame, bars, plates, a line of light). The lid beside a
  lit bell 30.2 at the light role's box (A6 19.5).
- **NOT met, each with its cause.**
  - *The bed (620,395): 143.8 to 144.0 in the final frames, 144.8 +- 0.3 asked.* A5's number was a veil's: the wash
    heads' haze cones (taken out in A6) lay over that box. Beside it, at (660,391), A5, A6 and A7 read 151.3, 151.4,
    151.4, and no ball's colour moved. Putting the cones back at 0.5 gives 144.4 and takes the upper drape over its
    band and the seats up by 2 to 4 (the light role's one-job pair); the lamp's own column in the air adds 0.2 to the
    bed and 14 to the stands behind it. The only clean route is the app's lamp (+1.2 %), which the law bars. The lead
    ships 144.0 and asks the release lead; the 19.3 row was written on a number whose cause nobody had isolated.
  - *Pixels at or under level 4, V10 high: 0.27 %, 0.14 % asked (A6 0.75 %).* By the light role's mask: the truss's
    shaded members and the banner frames 0.11, the table's own return mouth and inner leg face 0.08, furniture
    undersides 0.03, single fold pixels 0.05; none on a surface that reads the map. A5's 0.14 % was measured under the
    same veil (the cones back at 0.5: 0.16 %).
  - *The step across the outline: 9 / 8 / 13 / 6 px at V10 (light role, four columns; A6 16 / 12 / 9 / 25), under 8
    asked;* TV 10 to 16 px, inside its line. The feet boxes stand up to 6.9 over the darker under box (6 asked).
  - *The backdrop's top third at BACK: cloth 29.3, 38.2 and 46.6 in the cone (25 asked; A6 27.7, 37.8, 45.4).* The
    cone is the south run's profiles', which also hold the apron at 42.
  - *Exit door leaves: 13.5 to 16.3 at V10 (shell role), 3 to 8 asked,* under the cloth beside them on high only. The
    drape wash into the east corners (165 cd) lights them; the row's band was written for a door in an unlit corner.
  - *Seat row top left on high: 47.1 (band ends at 45). Cards on lite: front left +10.3 (within 10 asked), the aim of
    5 reached on neither tier.* The card's head panel reads about 10 % over the real seat's under the baked hall;
    the cause is not found. A per-seat level table (`setSeatLevels`) is built on the surround's side and nothing
    calls it: its other half needs a bake and was not delivered. It ships inert (factor 1) and is the next round's.
  - *Fabric at distance:* faint at V10, not seen at V3 (the surround's own word).
- **Changed against this section as written.** 19.1 says the cube holds the hood: the shipped cube leaves out the
  table, the luminaire and the hood (the service owner's reading: a prop under a cube taken beside the lamp mirrors
  the lamp as a white cap). So no prop mirrors the brightest thing in the hall, and the steel reads as dark pewter.
  The cube stays out of the table's body gloss (a pair could not be told apart). The profiles' shutter blade went into
  the final bake without a baked trial of its own (19.4): the light role asked at 19:52Z, the lead read the ask after
  the bake and judged the files on his own frame (no row worse than at half-way; no third bake).
- **Laws held.** Club V1, V2, V10 on high and tournament V1, V2, V10 byte-equal to their pinned frames; no three light,
  no shadow map, no view rule, no people; base within 1.10 x of the tournament's counts (V10 217 / 209 calls,
  392,987 / 360,355 triangles = 1.0906: 3,403 triangles left); default tier 10,786,451 of 12,000,000 bytes; high GPU
  502 MiB by the table role's ledger.
- **What the lead got wrong.** Three rows of 19.3 (bed, dark pixels, door leaves) were targets taken from an older
  frame without the cause of that frame's number; two of them could only be met by a veil A6 had removed on purpose.
  A target row names its cause before a role is asked to hit it.

## 20. Round A8 (and the club's round-4 leftovers): what a viewer sees first, each row with its cause

Look-check 65bd928e accepted A7 and re-wrote three rows; ruling c2c15d6d (the owner's two-day target, merged by
2026-11-18T23:50Z) starts this round now, beside the seal of the accepted tree (club round 4 + arena A7, commit
`32a2677a9`). **A8 joins that pull request only if it is accepted by seal time: every line of this round is small,
reviewable and finished, or it is not in the tree.** Sections 13-19 stand. Two exports are frozen
(`mac-export/a7-32a2677a9` and the club's r3 / r4 ones); the Mac words run on them tonight.

### 20.1 Rows re-written by look-check 65bd928e (they replace the same rows of 19.3)
- **Bed:** the haze-free box (660,391) at V10 on high reads 151.4 +- 0.3 (A5 151.3, A6 151.4, A7 151.4) and must not
  move. The old box (620,395) is a note only (143.8 to 144.0 without the veil).
- **Pixels at or under level 4 at V10:** high at most 0.27 % (accepted with its cause: truss members, the table's
  return mouth, undersides), base at most 0.44 %, lite at most 0.65 %; every review pose on high under 0.5 %.
- **The step across the table's outline:** no stair, at most 13 px at V10; the map stays 1024 px.

### 20.2 The round's rows (ONE owner each; the cause stands beside the target, or finding it is the first task)
| # | what the viewer sees | cause | target | owner (helps) |
|---|---|---|---|---|
| 1 | seat cards on base and lite differ from the real seats on high (missed four rounds; lite front left +10.3) | NOT known: the card's head panel reads about 10 % over the real seat's under the baked hall. A row-level factor is the same on card and seat and cannot close it | first 45 minutes: the cause, isolated with one-job pairs, written to `scratch/surround/CARD-CAUSE-A8.md`; then the cure at the cause: base and lite within 10 of high at the four pad boxes of `scratch/surround/SEAT-BOXES-A7.md` (aim 5). The inert `setSeatLevels` path is used or deleted: nothing inert ships | surround (light) |
| 2 | the low camera's head is a dark block about 25 px wide at V1 and TV | to be stated by the floor in its first 30 minutes (which light reaches which face) | reads as a camera at V1 and TV by light and material (a body side at 18 or more at a box the floor publishes, a lens that reads as glass); no constant | floor (light) |
| 3 | the backdrop's top third at BACK is as bright as its middle (cloth 29, 38 and 47 in the haze) | known: the south run's profile cones lie in front of it; the cloth itself takes the bells' bounce | the cloth falls off upward: the top third at least 8 under the middle third at the light role's boxes, the cone in front at most 8 over the cloth behind it; the apron stays at 42 or more | light (shell) |
| 4 | the exit door leaves are lighter than a door in a dark corner (13.5 to 16.3) | known: the drape wash (165 cd into the east corners) lights them down to the floor | the leaves at least 3 under the cloth beside them on every tier and never under 3; the door still reads as a door at the corner pose | shell (light) |
| 5 | steel reads as dark pewter | known: the hall's cube leaves out the luminaire, so no prop mirrors the brightest thing in the hall | first 40 minutes, a dev pair: the lamp in the props' reflection (a term from the room light's own rectangle, or the cube). It ships only if a same-tree pair at V1 and BACK reads better; at most 150,000 bytes more on the default tier; nothing rendered at run time | table (floor, light) |
| 6 | the west floor's middle is bare at BACK | not built | one or two pieces of event furniture that read as what they are, inside the floor's budgets; base stays within 1.10 x of the tournament's counts at V1, V2 and V10 (3,403 triangles are left at V10) | floor |
| 7 | the top-left seat row reads 47.1 (band ends at 45); three lid boxes just under 30 | air over the stand (run time); the bells' uplight (a bake input) | 45 or less by the air alone; the lid 30 or more only if a bake runs anyway | light |
| 8 | club: the chalk puff reads as a cotton tuft and its brightness is a constant | known (round 4's sheet, C3): soft lobes, no streaks; a constant holds the level | the puff takes its level from the light on the cloth under it (no constant) and shows fine streaks or specks at 1:1 on high and base; laws of round 4 unchanged (pure in time, read-only). **Out of this round's pull request (the release lead, 01:5xZ on 2026-11-17: nothing unseen on the Mac GPU rides the seal):** built and proven by the table role, taken out of the tree by the lead as `scratch/table/row8-9.patch`; a follow-up with its own motion word on the Mac | table |
| 9 | club: every rack of a session gets the same chalk pattern | corrected at 00:20Z by the table role's reading: the defect is the chalking SOUND's (`chalkPlan(seed, shotIndex)`); the picture already takes the rack through `record.shot.seed` | picture: the dust arm proves both halves (the same record gives the same bytes in any order; two rack seeds at one shot index give two clouds), no code change; the arm's case rides row 8's patch (it reads the grains). Sound: a second patch from the audio role's scratch tree, out of this pull request with row 10 | table (audio) |
| 10 | club: the sound's level step depends on browser bookkeeping (round 4's sheet, C5) | known: resource timing with a 250-entry buffer; a status-200 response that is not a WAV | the step no longer depends on the buffer's size; every failure ends quiet, never loud; the arm plants each failure. Smallest possible change: tonight's Mac machine check runs the round-4 export. **Out of this round's pull request (ruling 98c1ed27):** the role works in its scratch tree only and hands over a patch; it lands in a follow-up with its own audio word on the Mac | audio |

Withdrawn with its cause: "fabric at V3" (19.3). At V3 the stands are out of focus by the view's own depth of field;
there is nothing to show. Fabric stays judged at V10 and V9 only.
Not in this round: the table's body (the app's cabinet, a seam), a 2048 px map, anything that needs a new seam.

### 20.3 Working rules
- **Time box:** the last save of a shipped file by 03:45Z on 2026-11-17, reports by 04:15Z. An item that is not
  finished and proven by then is reverted to A7's text, not left half in the tree; say so in the report.
- **Small diffs.** No refactor, no rename, no reformatting, no new file where an edit does. What a change replaces it
  deletes. Each added line will be read by a reviewer within a day.
- **At most two bakes, and the lead looks at the first** (as 19.4): `scratch/light/HALFWAY-A8.md`, the lead's
  `scratch/lead/HALFWAY-A8-LEAD.md`; windows in `scratch/light/BAKE-STATE.md`. If no row needs a bake input, there is
  no bake. The cube is captured again whenever the light files change.
- **The lead reads `scratch/<role>/NEED-FROM-lead.md` at every half hour** and answers in `scratch/lead/`.
- A7's rules stand: a step is tried in the role's scratch copy of the tree first; tags are used once and start `a8`;
  asks in the first 30 minutes; stamps from the clock; pixel boxes beside every level.

### 20.4 What the round found (the lead, at integration; the lead's own frames `a8s1`..`a8s11` unless a role is named)
- **A small round, as planned: on high a viewer sees the same picture as A7.** A7 | A8 on high, mean absolute
  difference: 0.10 at V10 and V1, 0.06 at V2, 0.05 at TV, 0.26 at BACK (the west floor's two pieces). The lead's V10
  boxes of 19.5 read the same to 0.2: bed (660,391) 151.4, under the table 21.3 / 24.3, apron 42.0, carpet 89.6. ONE
  bake (the half-way files are the final files); its inputs changed only by the shell's deeper lobby and the floor's
  two solids. Default tier 10,794,379 of 12,000,000 bytes.
- **Row 1, the seat cards: met on base (within 5) and on lite (within 10).** Card minus real seat at the four pad
  boxes: base +4.1, +4.4, -1.8, -2.3 (A7 +7.9, +6.5, -2.5, -3.2); lite +7.7, +5.6, -8.1, -4.1 (A7 +10.3 at the front
  left). The cause was three slips in the card, not light (the surround's close pairs): the seat stood 14.1 mm low on
  its sheet, the pile's lean along the row was bent at 0.40 of its size, and the seam kept its middle depth across the
  whole pad. `setSeatLevels` is deleted. What is left on lite is the lite light file's volume (12 layers against 24:
  its rows read 0.84 to 0.87 of high); a next round's item, a bake input.
- **Row 2, the low camera: met.** A body side at the floor's boxes: TV 20.2 to 40.6, V1 16.7 to 40.2. The floor's own
  caution stands: the number was a weak test; what changed is that the casting has a tone (39 to 41) apart from its
  lens (15 to 18). At TV the lens's glint is one pixel.
- **Row 3, the backdrop's falloff: NOT MET as written, nothing shipped.** BACK reads 29.3 cloth, 38.2 / 46.6 at the cone
  boxes, as A7. The light role measured the cause: the cloth alone does fall off upward (haze off: 104 to 25 from
  0.7 m to 4.1 m up); what a viewer sees in front of it is the south run's four profile cones, one behind the other
  on that pose's lines of sight. Taking cones away costs dark pixels and was not shipped. The cone half of the row
  was a target written without its cause (the lead's slip) and is withdrawn.
- **Row 4, the exit: darker than the cloth on both sides on every tier, the number missed on base.** Leaves upper /
  lower at V10: high 10.9 / 10.4 (A7 15.1 / 14.3) against cloth 13.5 north and 20.6 south; base 10.3 / 9.5 against
  10.8 and 16.2; lite 10.7 / 10.0 against 13.4 and 15.5. "At least 3 under" holds at the corner pose and at V9 (the
  shell's frames) and against the south cloth everywhere; against the north cloth at V10 the leaves stand 2.6 / 3.1
  under on high, 2.7 / 3.4 on lite and only 0.5 / 1.3 on base: that cloth's last texels now lie in the deeper lobby's
  baked shadow. No leaf box reads under 3. The price: pixels at or under level 4 at V10 are 0.45 % on base and 0.66 % on
  lite (rows of 20.1: 0.44, 0.65); high stays 0.27 %. Accepted by look-check 93eed8d1 as the door's price.
  The door's satin term is deleted.
- **Row 5, the lamp in the props' reflection: tried, ships nothing.** A same-boot pair at V1 and BACK cannot be told
  apart (0.02 % and 0.08 % of the pixels move; the table role's trial). Steel stays pewter.
- **Row 6, the west floor: a floor monitor and an empty folding stool, on high and on base.** Base pays for the
  monitor by taking the 8 mm bevel off its three monitors' cases (their edges move by one to two pixels at V10). The
  stool came to base after the look-check (ruling 93eed8d1: no shadow ships without its object; one bake serves both
  tiers and holds the stool's shadow): 104 triangles, no draw call, no re-bake; the base floor's line goes from 4,800
  to 4,900 triangles (4,890 built). Base counts against the tournament's: V10 217 calls / 393,087 triangles = 1.038 x /
  1.091 x; V1 1.010 x / 1.056 x; V2 1.058 x / 1.063 x. High is byte-equal at BACK before and after that change.
- **Row 7, the top-left seat row and the lid: NOT MET, nothing shipped.** 47.1 (band ends at 45); lid 30.1. The air
  cannot do it: with every cone and all haze off the row still reads 45.2 (the light role's one-job pair), and the
  price is dark pixels (0.43 %). The row goes back to the lead; what is left is the row's baked light.
- **Rows 8, 9, 10 (the club's chalk puff, its arm, the sound's level step) are not in this tree.** Built and proven by
  their roles, kept as patches outside the repository; each lands in a follow-up with its own Mac word.
- **Deleted this round:** the inert lamp column of A7 (`HAZE.lamp`, `lampBeams()`), the door's satin, the seat-level
  setter. Added: one arm for the cube's arithmetic (arena arm 27). **Still inert in the light role's files:** the cove
  line (`HALL.cove.on` false) and the wall washers (`HALL.wallwash.on` false); a follow-up deletes them.
- **Found, not fixed.**
  - Two boots give the arena's cloth one of two ambient tints (`uClubClothAmbTint` 0.2289 or 0.2339) depending on
    when the environment service comes up (the light role). Under one level on the bed; a defect of order, not of look.
  - On a fast GPU the look is revealed by its 2 s cap before its textures have arrived; it then refreshes and the
    occlusion share fades in. For some seconds the floor is up to 40 levels off its settled picture. The first frames
    taken on the Mac GPU (A7's tree) caught exactly that state and are not "the arena on the Mac"; a settled Mac frame
    does not exist at this commit. As an opt-in look this is a start-up transition; it must be measured and closed
    before the look becomes a default.
  - 19.5 named the bake's mesh occlusion as the cause of the table's shadow. With the occlusion share off
    (`?cluboccoff=all`) the carpet under the table reads 68.5 / 89.0, not 21.3 / 24.3: most of that shadow is the
    run-time occlusion service's. The picture is right; that account of it was incomplete.
- **Laws:** club frames at rest (high) V1, V2, V10 byte-equal (c2b26d69, 3189f97a, f5ddde64); tournament V1, V2, V10
  byte-equal (8f364fc5, ea9dcc0e, 2e0c195a); no three light changed; no shadow map; no people; words 9-BALL, TABLE 1,
  ARENA, FINAL.
