// Copyright (c) Meta Platforms, Inc. and affiliates.

// room.js — the club room (CONTRACT.md sections 4.5, 8 and 9). Owner: bake (round 1: room).
//
// Replaces what the camera and the environment cube see around the table: the app room's walls, floor, floor-shadow overlay and
// wall props are hidden; its lamp, luminaire meshes and three lights stay exactly as they are. The club room is a real shell
// (room/shell.js) lit by those three lights plus its own fixed emitters; the props (room/props.js) and the main table's
// luminaire (room/lamp.js), both other owners' modules, are called from here when they exist.
//
// Room light comes in two forms (room/light.js):
//   baked     web/assets/club/room-light.png (room/lightmap.js; made by web/tools/club/bake-room.html + bake-room.mjs): direct
//             light of every fixed emitter with soft shadows behind and under the furniture and both tables, bounced light,
//             and the visibility of the main lamp past the furniture. Two forms in the one file: a MAP, sampled by the
//             shell's floor, plaster and wood through their second UV set, and a coarse VOLUME (ambient cubes on a 0.4 m
//             grid), sampled by world position by everything else made through the room light: the props, the luminaire,
//             the wall lamps' brass. Used on the base and high tiers when the file is there AND was baked for this room: the
//             bake's signature (shell layout, light-map charts, emitter positions, the props' plan) must equal the live one.
//             The lite tier builds a smaller room and reads its own 512 px bake (`room.light.lite`): there the baked
//             variants drop the emitter loop altogether, so the lite room costs less per fragment baked than analytic.
//   analytic  per-emitter evaluation without occlusion plus a constant ambient: the fallback when the file is missing, stale
//             or switched off (`?clublm=0`). The degrade law.
// Who owns what on the floor near the main table: the occlusion service's floor map (or, without it, the built-in closed
// form) owns everything the MAIN TABLE does to the floor: the lamp's shadow, the ambient darkening under and around it. The
// bake therefore leaves the main table out of the floor's own texels (and out of the lamp-visibility channel everywhere) and
// keeps it for everything else, so the two multiply without counting the table twice.
//
// Order: build everything under a hidden group -> wait (bounded) for the shell's textures and the light map -> swap in one
// synchronous step (hide the app parts, show the club group, re-capture the environment cube), so no frame shows half a room.
// Nothing here adds, removes or changes a three light, and renderer.shadowMap is not touched.
import * as THREE from 'three';
import { roomLight, POOL } from './room/light.js';
import { buildShell, DIM, TILE } from './room/shell.js';
import { createLightmap, signatureOf, LM_VERSION, LM_ID, LM_ID_LITE } from './room/lightmap.js';

// interior of the room, metres, relative to the table centre (x = the table's long axis). The table sits off-centre toward
// the south-west so the north side has the depth for a second table and the east wall is the far wall of the break view.
// Beams and ceiling bays in room/shell.js assume these numbers; the height keeps the app's ceiling plane (the luminaire rods
// reach it).
const BOX = Object.freeze({ x0: -5.5, x1: 5.5, z0: -6.0, z1: 3.6, height: 3.24 });
// Bounded waits, all counted from the start of the build and running side by side (the props, the luminaire, the textures and
// the light map load at the same time), so the room is ready about PART_WAIT_MS after it started at the latest; what is slower
// comes in when it arrives. A capture tool on a slow renderer asks for a long service budget (`?clubtimeout=`, index.js):
// then the room waits for all of its parts instead (TOOL_WAIT_MS), so a picture never shows it half furnished.
const ASSET_WAIT_MS = 2500;     // the shell shows with stand-in textures / analytic light if the files are slower than this
const PART_WAIT_MS = 5000;      // props or a luminaire slower than this are added when they arrive
const TOOL_WAIT_MS = 45000;
const LAMP_SPAN = 0.25;         // half-width of the wall span a wall lamp keeps for itself (CONTRACT.md 8.6 `reserved`)
// the room ambient of the analytic light: what a baked solution holds as house light and multi-bounce light (warm, brighter
// from above; walls collect the most). Round 2: about the level the bake leaves on open surfaces (its constant ambient times
// a typical openness), so the lite tier and a refused map sit at the baked room's level
// (round 3: the mean indirect light of the round-3 bake: floor 0.56 / 0.34 / 0.20, ceiling 0.89 / 0.61 / 0.44, added on walls
// 0.61 / 0.46 / 0.34 in the full room; the lite room's bake has 0.49, 0.82 and 0.64 on red)
const AMBIENT = Object.freeze({ sky: [0.54, 0.33, 0.20], ground: [0.87, 0.60, 0.44], side: [0.62, 0.47, 0.34] });
// The level of the main lamp's spill emitter (`lamp.band`, registered by room/lamp.js: the lit glass band between the skirt
// and the shade). The emitter's place and size are the luminaire's; its LEVEL is part of the room's light balance and of the
// bake (the lamp role's note of round 2: "tune it as you like; soft signature only"), so the room sets it wherever the
// luminaire (re-)registers the emitter. Round 3: 0.5 -> 2.0: the ceiling bay and the beam over the played table take a warm
// pool from it (about 0.5 units of irradiance at the ceiling), which is what shows the beams in the wide views.
const LAMP_BAND = Object.freeze({ id: 'lamp.band', intensity: 2.0 });
const TIER_FIXED = 'the shell geometry, its materials, the emitter budget and the light map are built for one tier per page load; another tier applies on reload';

const stub = (reason) => ({ enabled: false, reason });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const MISSING_MODULE = /Failed to fetch|Cannot find module|error loading dynamically imported module|Importing a module script failed/i;
const r3 = (v) => Math.round(v * 1000) / 1000;

export async function createRoom(club) {
  const ctx = club?.ctx;
  const scene = ctx?.scene;
  if (!scene?.isScene) return stub('no scene');
  const appRoom = ctx.room ?? null;
  const lr = appRoom?.lightRefs ?? null;
  const detail = [0, 1, 2].includes(club?.knobs?.roomDetail) ? club.knobs.roomDetail : 1;
  const builtTier = club?.tier ?? null;
  const now = () => { try { return performance.now(); } catch { return Date.now(); } };
  const tStart = now();
  const timing = { shell: null, parts: null, assets: null, total: null, toolWait: false };
  let group = null;
  const hidden = []; // app objects this module hid (restored by dispose)
  try {
    // the floor plane is the app room's (it follows the active table's bed height): read it, never copy it
    const appFloor = lr?.floor ?? appRoom?.giRefs?.floor ?? null;
    const floorY0 = Number.isFinite(appFloor?.position?.y) ? appFloor.position.y : -0.79;
    const box = {
      min: new THREE.Vector3(BOX.x0, floorY0, BOX.z0),
      max: new THREE.Vector3(BOX.x1, floorY0 + BOX.height, BOX.z1),
      center: new THREE.Vector3(),
    };
    box.center.addVectors(box.min, box.max).multiplyScalar(0.5);

    // ---- the light map request starts first (it loads while the room is built). `?clublm=0` switches
    // it off (tools: the on / off pair of the same view).
    let lmSwitch = null;
    try { lmSwitch = ctx.query?.get?.('clublm') ?? null; } catch { lmSwitch = null; }
    try { timing.toolWait = Number(ctx.query?.get?.('clubtimeout')) >= 20000; } catch { timing.toolWait = false; }
    const partWait = timing.toolWait ? TOOL_WAIT_MS : PART_WAIT_MS, assetWait = timing.toolWait ? TOOL_WAIT_MS : ASSET_WAIT_MS;
    // The lite room is another plan (six wall lamps, no far table) with its own 512 px file under its own id; when the
    // manifest has no such row nothing is fetched and the lite room keeps the analytic light.
    const lite = club?.tier === 'lite' || detail === 0;
    const lmFile = createLightmap(club, { want: lmSwitch !== '0', id: lite ? LM_ID_LITE : LM_ID });
    if (lmSwitch === '0') lmFile.reason = 'switched off by ?clublm=0';
    const lm = { on: false, volume: false, reason: lmFile.reason ?? 'not decided yet', live: null, stale: [], late: false };

    // ---- light service first: materials are made through it
    roomLight.reset();
    roomLight.init({ club, envMap: scene.environment?.isTexture ? scene.environment : null });
    // tools: `?clubpool=t0,t1[,strength[,gain]]` sets the main lamp's pool on the floor for a pair of the same view (strength
    // 0 = no fade, gain 1 = the panel's own light); without the switch the pool is room/light.js POOL
    try {
      const pool = (ctx.query?.get?.('clubpool') ?? '').split(',').map(Number);
      if (pool.length >= 2 && pool.every(Number.isFinite)) roomLight.setPool({ t0: pool[0], t1: pool[1], strength: pool[2] ?? 1, gain: pool[3] ?? POOL.gain });
    } catch { /* the default pool stays */ }
    // The lite room has no varnish lobe (the reflection service patches the floor on the tiers with a box-projected cube
    // only): there the lamp's own highlight on the floor is the one image of the lamp the planks carry, so it stays whole.
    if (club?.tier === 'lite' || detail === 0) roomLight.setFloorGloss({ sheen: 1 });
    // tools: `?clubfloor=sheen:1,emitter:1,knee:0,cap:0.17,shadow:0,lamp:0` sets single terms of the floor's gloss
    // (room/light.js FLOOR_GLOSS; `lamp:0` takes the main lamp's own light off the floor) and `?clubfloor=r2` all of them as
    // round 2 had them, for pairs of the same view
    try {
      const raw = ctx.query?.get?.('clubfloor');
      if (typeof raw === 'string' && raw) {
        const o = raw === 'r2' ? { sheen: 1, emitter: 1, knee: 0, shadow: 0 } : Object.fromEntries(raw.split(',').map((kv) => { const [k, v] = kv.split(':'); return [k.trim(), Number(v)]; }));
        roomLight.setFloorGloss(o);
      }
    } catch { /* the default gloss stays */ }
    roomLight.setBox(box.min, box.max);
    const setAnalyticAmbient = (a = AMBIENT) => roomLight.setAmbient(new THREE.Color(...a.sky), new THREE.Color(...a.ground), new THREE.Color(...a.side));
    setAnalyticAmbient();

    // ---- shell
    const shell = buildShell({ club, roomLight, box, detail });
    roomLight.setSides(shell.sides);
    timing.shell = Math.round(now() - tStart);
    group = new THREE.Group();
    group.name = 'clubRoom';
    group.visible = false;
    group.add(shell.group);
    scene.add(group);
    const emissives = [...shell.emissives];

    // ---- the table: keep-out rectangle for the props, shadow rectangle for the floor
    const tb = new THREE.Box3();
    const tableRect = { cx: 0, cz: 0, hx: 1.45, hz: 0.82, top: 0.035 };
    const readTable = () => {
      const g = ctx.table?.group;
      if (!g?.isObject3D) return;
      tb.setFromObject(g);
      if (tb.isEmpty()) return;
      const hx = (tb.max.x - tb.min.x) / 2, hz = (tb.max.z - tb.min.z) / 2;
      if (!(hx > 0.6 && hx < 3 && hz > 0.4 && hz < 2)) return;
      tableRect.cx = (tb.max.x + tb.min.x) / 2; tableRect.cz = (tb.max.z + tb.min.z) / 2;
      tableRect.hx = hx; tableRect.hz = hz;
      tableRect.top = Math.min(0.09, Math.max(0.0, tb.max.y));
    };
    readTable();
    const clearance = 1.55; // stroke room around the table (a cue is 1.47 m)
    const tableBounds = {
      minX: tableRect.cx - tableRect.hx - clearance, maxX: tableRect.cx + tableRect.hx + clearance,
      minZ: tableRect.cz - tableRect.hz - clearance, maxZ: tableRect.cz + tableRect.hz + clearance,
    };

    // ---- the lamp rectangle (the app's rect lights, read every frame: a fixture swap moves them)
    const corner = new THREE.Vector3();
    const lampRect = { cx: 0, cz: 0, hx: 1.02, hz: 0.33, y: 1.02 };
    const readLamp = () => {
      const lights = (lr?.rectLights ?? []).filter((l) => l?.isRectAreaLight && l.visible !== false && l.intensity > 0);
      if (!lights.length) return false;
      let ax = Infinity, bx = -Infinity, az = Infinity, bz = -Infinity, y = 0;
      for (const l of lights) {
        l.updateWorldMatrix(true, false);
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          corner.set((sx * l.width) / 2, (sy * l.height) / 2, 0).applyMatrix4(l.matrixWorld);
          ax = Math.min(ax, corner.x); bx = Math.max(bx, corner.x); az = Math.min(az, corner.z); bz = Math.max(bz, corner.z);
          y += corner.y / 4;
        }
      }
      lampRect.cx = (ax + bx) / 2; lampRect.cz = (az + bz) / 2;
      lampRect.hx = Math.max(0.02, (bx - ax) / 2); lampRect.hz = Math.max(0.02, (bz - az) / 2);
      lampRect.y = y / lights.length;
      return true;
    };
    // 1 = the built-in table shadow on the floor is on. It goes to 0 when the occlusion service's own floor map has taken over
    // (its patch on the floor material scales every direct and indirect term, so the two must not stack): see onFrame.
    const shadowOn = { value: 1 };
    let shadowOwner = 'room';
    // a bake's floor map is a render target's texture; the service's open 1 x 1 map (no bake yet, or a bake that failed) is not
    const occFloorBaked = () => club.occ?.floor?.texture?.isRenderTargetTexture === true;
    const syncShadow = () => {
      const lamp = readLamp();
      roomLight.setShadow({ lamp: lampRect, table: tableRect, lampY: lampRect.y, tableY: tableRect.top, ambient: 0.32,
        strength: lamp ? shadowOn.value : 0 });
    };
    syncShadow();

    // ---- what the shell keeps of its walls, in the props' terms (CONTRACT.md 8.6: wall 'xp' | 'xn' | 'zp' | 'zn', from / to
    // in world metres along the wall): the door, the windows and every wall lamp. `layout` carries the full description.
    const wallId = { north: 'zn', south: 'zp', east: 'xp', west: 'xn' };
    const alongX = (wall) => wall === 'north' || wall === 'south';
    const reserved = [
      ...[shell.layout.door, ...shell.layout.windows].map((o, i) => ({ wall: wallId[o.wall], from: (alongX(o.wall) ? o.min[0] : o.min[2]) - 0.13, to: (alongX(o.wall) ? o.max[0] : o.max[2]) + 0.13, ...(i === 0 ? { floor: true, kind: 'door' } : { kind: 'window' }) })),
      ...shell.layout.sconces.map((sc) => { const at = alongX(sc.wall) ? sc.position[0] : sc.position[2]; return { wall: wallId[sc.wall], from: at - LAMP_SPAN, to: at + LAMP_SPAN, kind: 'lamp' }; }),
    ];

    // ---- other owners' modules: guarded import, bounded wait, never fatal. A part that arrives late is added when it does.
    const part = (name) => ({ name, status: 'absent', error: null, api: null, counts: null, ms: null });
    const lamp = part('lamp'), props = part('props');
    const failed = (p, e) => { p.status = 'failed'; p.error = String(e?.message ?? e); console.warn(`[club] room: the ${p.name} failed — the shell stands without it:`, e); };
    const take = (p, api, after) => {
      if (!api || typeof api !== 'object') { p.status = 'empty'; return; }
      if (api.enabled === false) { p.status = 'off'; p.error = api.reason ?? null; p.api = api; return; }
      if (api.group?.isObject3D) group.add(api.group);
      for (const e of api.emissives ?? []) if (e?.isObject3D && !emissives.includes(e)) emissives.push(e);
      p.api = api; p.status = 'built'; p.ms = Math.round(now() - tStart);
      try { p.counts = api.counts?.() ?? null; } catch { p.counts = null; }
      after?.();
    };
    // literal specifiers only (the served-strings gate rejects a computed one): each part brings its own loader
    async function callPart(p, load, fn, args, waitMs, after) {
      try {
        const mod = await load();
        if (typeof mod?.[fn] !== 'function') return null;
        p.status = 'building';
        const building = Promise.resolve().then(() => mod[fn](club, args));
        const first = await Promise.race([building.then((api) => ({ api }), (e) => ({ e })), delay(waitMs).then(() => ({ late: true }))]);
        if (first.late) { p.status = 'late'; return building; }
        if (first.e) failed(p, first.e); else take(p, first.api, after);
      } catch (e) {
        // a missing module is a normal case (the owner has not built it); anything else is reported once
        if (!MISSING_MODULE.test(String(e?.message ?? e))) failed(p, e);
      }
      return null;
    }
    const partArgs = () => ({ box: { min: box.min.clone(), max: box.max.clone() }, floorY: floorY0, tableBounds: { ...tableBounds }, roomLight });
    // a wall lamp that a prop covers is REPORTED, not moved (CONTRACT.md 8.6: props keep off the reserved spans): any hit of a
    // 3 x 3 fan of short rays from in front of the lamp toward the wall
    const lampsCovered = [];
    const checkLamps = () => {
      lampsCovered.length = 0;
      const root = props.api?.group;
      if (!root?.isObject3D) return;
      try {
        const ray = new THREE.Raycaster();
        const from = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3();
        root.updateWorldMatrix(true, true);
        shell.layout.sconces.forEach((spot, k) => {
          dir.fromArray(spot.normal).negate();
          side.fromArray(spot.tangent);
          for (const dy of [0, -0.24, 0.2]) for (const ds of [0, -0.15, 0.15]) {
            from.fromArray(spot.position).addScaledVector(dir, -0.32).addScaledVector(side, ds); from.y += dy + group.position.y;
            ray.set(from, dir); ray.near = 0; ray.far = DIM.sconceOut + 0.32;
            if (ray.intersectObject(root, true).length) { if (!lampsCovered.includes(k)) lampsCovered.push(k); return; }
          }
        });
      } catch (e) { console.warn('[club] room: the wall-lamp check against the props failed:', e); }
    };
    const [lampLate, propsLate] = await Promise.all([
      // `spill: true`: the luminaire registers its own glow (the lit glass band) as ONE fixed emitter before commit(), so the
      // bake holds its light on the ceiling and the beams over the table (asked for by the lamp role in round 2)
      callPart(lamp, () => import('./room/lamp.js'), 'buildLamp', { ...partArgs(), appRoom, spill: true }, partWait),
      callPart(props, () => import('./room/props.js'), 'buildProps', { ...partArgs(), reserved, layout: shell.layout }, partWait, checkLamps),
    ]);
    const levelBand = () => {
      const e = roomLight.emitters.find((x) => x.id === LAMP_BAND.id);
      if (!e || e.intensity === LAMP_BAND.intensity) return false;
      e.intensity = LAMP_BAND.intensity;
      return true;
    };
    levelBand();
    roomLight.commit();
    timing.parts = Math.round(now() - tStart);

    // ---- the signature of what a bake depends on (see the header). `hard`: geometry and emitter positions: a map baked for
    // another value is not used. `soft`: levels (emitter colours and intensities): a mismatch is reported, the map is used.
    const signature = () => {
      const em = [...roomLight.emitters].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const v3 = (v) => (v ? [r3(v.x), r3(v.y), r3(v.z)] : null);
      const pc = props.counts ?? {};
      const rel = (p) => p.map((x, i) => r3(i === 1 ? x - floorY0 : x)); // heights relative to the floor
      const hard = {
        v: LM_VERSION,
        box: [BOX.x0, BOX.x1, BOX.z0, BOX.z1, BOX.height],
        atlas: { size: shell.lightmap.size, scale: shell.lightmap.scale, charts: shell.lightmap.charts.map((c) => [c.kind, c.x, c.y, c.w, c.h, c.rot ? 1 : 0]) },
        door: [shell.layout.door.wall, rel(shell.layout.door.min), rel(shell.layout.door.max)],
        windows: shell.layout.windows.map((w) => [w.wall, rel(w.min), rel(w.max)]),
        sconces: shell.layout.sconces.map((sc) => [sc.wall, rel(sc.position)]),
        beams: shell.layout.beams,
        emitters: em.map((e) => [e.id, e.type, [r3(e.position.x), r3(e.position.y - floorY0), r3(e.position.z)], r3(e.radius), e.size ? e.size.map(r3) : null, v3(e.axis), v3(e.normal)]),
        props: { status: props.status === 'built' ? 'built' : 'none', slots: pc.slots ?? null, far: pc.far ?? null, bar: pc.bar ?? null },
      };
      const soft = { emitters: em.map((e) => [e.id, r3(e.color.r * e.intensity), r3(e.color.g * e.intensity), r3(e.color.b * e.intensity)]) };
      return { sig: signatureOf(hard), soft: signatureOf(soft), hard, softParts: soft };
    };

    // where the floor's chart lies in the map, for roomLight.floorIrradiance() (the chart's atlas record + its world origin)
    const floorChart = (() => { const c = shell.lightmap.charts.find((ch) => ch.kind === 'floor'); return c ? { ...c, o: [BOX.x0, floorY0, BOX.z0], size: shell.lightmap.size } : null; })();

    // ---- the baked map: decide (signatures), then switch the shell's materials, the props' overlay and the ambient together
    // The props' multiply-blended shadow overlays come in two classes (agreed with the props role in round 3):
    //   `club.props.contactshadow`  contact-size (a foot, a base and a soft edge): stays under the bake, which cannot hold
    //                               a 35 mm leg in a 16 mm texel; it is what seats small furniture on the floor;
    //   `club.props.castshadow`     cast-size (the wide blob under a table or a counter): the map holds the real one, the
    //                               two must not stack, so it is hidden while the bake is on.
    // A props tree without a cast class and without `group.userData.clubShadowSplit` is round 2's (one batch of large
    // overlays under the contact name): there the whole batch is hidden under the bake, as it was.
    const propsShadow = { contact: [], cast: [], split: false };
    const hiddenByBake = new Set(); // overlay meshes this module hid; only those are shown again
    const findPropsShadow = () => {
      propsShadow.contact = []; propsShadow.cast = [];
      const root = props.api?.group;
      root?.traverse?.((o) => {
        if (!o.isMesh) return;
        const n = o.material?.name;
        if (n === 'club.props.contactshadow') propsShadow.contact.push(o); else if (n === 'club.props.castshadow') propsShadow.cast.push(o);
      });
      propsShadow.split = propsShadow.cast.length > 0 || root?.userData?.clubShadowSplit === true;
    };
    const applyPropsShadow = (bakeOn) => {
      findPropsShadow();
      const hide = (o, off) => {
        if (off) { if (o.visible) { o.visible = false; hiddenByBake.add(o); } } else if (hiddenByBake.has(o)) { o.visible = true; hiddenByBake.delete(o); }
      };
      for (const o of propsShadow.cast) hide(o, bakeOn);
      for (const o of propsShadow.contact) hide(o, bakeOn && !propsShadow.split);
    };
    function applyLightmap(want = true) {
      lm.stale = [];
      lm.live = signature();
      const meta = lmFile.meta;
      let use = want && !!lmFile.texture && !!meta;
      if (!want) lm.reason = 'switched off (room.lightmap.set(false))';
      else if (!lmFile.texture) lm.reason = lmFile.reason ?? `the file is ${lmFile.status}`;
      else if (meta.sig !== lm.live.sig) { use = false; lm.reason = `baked for another room (signature ${meta.sig}, this room is ${lm.live.sig}): re-bake with web/tools/club/bake-room.mjs`; }
      else {
        lm.reason = null;
        if (meta.soft !== lm.live.soft) lm.stale.push('emitter levels changed since the bake (re-bake to match)');
        const pool = meta.lamp?.pool; // the bake's bounce off the floor was computed under this pool of the main lamp
        if (Array.isArray(pool) && (pool[0] !== POOL.t0 || pool[1] !== POOL.t1 || (pool[2] ?? 1) !== POOL.gain)) lm.stale.push('the main lamp pool changed since the bake (re-bake to match)');
      }
      lm.on = roomLight.setLightmap(use ? lmFile.texture : null, { fullScale: meta?.fullScale ?? 16, lampVisibility: 1, keepPoint: 0, floor: floorChart });
      // the volume of the same bake: everything that is not on the map (the props, the luminaire, the brass) reads it. Its
      // box is recorded with heights above the floor.
      const v = use ? lmFile.volume : null;
      lm.volume = roomLight.setVolume(v ? { texture: v.texture, data: v.data, dims: v.dims, bias: meta?.volume?.bias, fullScale: meta?.fullScale ?? 16,
        min: [v.min[0], v.min[1] + floorY0, v.min[2]], max: [v.max[0], v.max[1] + floorY0, v.max[2]] } : null);
      // a material that stays analytic under the bake (`volume: false`, or a file without a volume) takes the bake's mean
      // ambient, so it sits at the room's level
      const amb = lm.on && meta?.ambient?.sky && meta.ambient.ground && meta.ambient.side ? meta.ambient : AMBIENT;
      setAnalyticAmbient(amb);
      applyPropsShadow(lm.on);
      if (lm.reason && want && lmFile.status === 'loaded') console.warn(`[club] room: the light map is not used — ${lm.reason}`);
      return lm.on;
    }

    // ---- textures and the light map: bounded wait, then the swap
    let lmWanted = true;
    const ids = ['floor.color', 'floor.normal', 'floor.rough', 'wood_dark.color', 'wood_dark.normal', 'wood_dark.rough', 'wall.normal', 'wall.rough'];
    let texturesLate = false;
    try {
      const waits = [lmFile.ready.then(() => 'lm')];
      const ready = club.assets?.ready?.(ids);
      let texturesDone = !ready?.then;
      if (ready?.then) waits.push(ready.then(() => { texturesDone = true; }, () => { texturesDone = true; }));
      const all = Promise.all(waits).then(() => 'ok');
      const r = await Promise.race([all, delay(Math.max(0, assetWait - (now() - tStart))).then(() => 'late')]);
      if (r === 'late') {
        if (!texturesDone) { texturesLate = true; ready.then(() => recapture('textures'), () => {}); }
        if (lmFile.status === 'loading') { lm.late = true; lmFile.ready.then(() => { if (applyLightmap(lmWanted)) recapture('lightmap'); }); }
      }
    } catch { /* no asset service: stand-ins, analytic light */ }
    applyLightmap(lmWanted);
    timing.assets = Math.round(now() - tStart);

    const studio = () => { try { return window.__cinelight === true; } catch { return false; } };
    function recapture(reason) {
      if (!group.visible) return;
      if (studio()) return; // a studio window owns the environment; the app re-bakes at its close
      try {
        if (club.env?.enabled && typeof club.env.capture === 'function') club.env.capture(`room:${reason}`);
        else ctx.rebakeEnv?.();
      } catch (e) { console.warn('[club] room: the environment re-capture failed:', e); }
    }

    const hide = (o) => { if (o?.isObject3D && o.visible) { o.visible = false; hidden.push(o); } };
    function show() {
      // the app room: walls + ceiling box, floor, floor-shadow overlay, wall props. Its lamp, luminaire and lights stay.
      hide(lr?.walls); hide(appFloor); hide(lr?.blob ?? appRoom?.giRefs?.blob);
      appRoom?.group?.traverse?.((o) => { if (o.name === 'obFarPropTable') hide(o); });
      group.visible = true;
      recapture('show');
    }
    show();
    timing.total = Math.round(now() - tStart);

    // ---- late parts
    const late = (p, pending, after) => pending?.then((api) => { take(p, api, after); levelBand(); roomLight.commit(); applyLightmap(lmWanted); recapture(p.name); }, (e) => failed(p, e));
    late(lamp, lampLate);
    late(props, propsLate, checkLamps);

    // ---- per frame: follow the app floor (it re-seats per table class), the lamp rectangle, the luminaire
    let seated = floorY0;
    let tick = 0;
    let lampUpdate = true;
    const onFrame = () => {
      const y = Number.isFinite(appFloor?.position?.y) ? appFloor.position.y : seated;
      if (Math.abs(y - seated) > 1e-6) {
        seated = y;
        const dy = y - floorY0;
        group.position.y = dy;
        group.updateMatrixWorld(true);
        box.min.y = floorY0 + dy; box.max.y = floorY0 + BOX.height + dy; box.center.y = (box.min.y + box.max.y) / 2;
        roomLight.reseat(dy, box.min, box.max);
        readTable();
        recapture('reseat');
      }
      // the app may re-show what this module hid (a rebuild, a studio revert): keep the two rooms from overlapping
      for (const o of hidden) if (o.visible && group.visible) o.visible = false;
      // the occlusion service patched the floor: once its floor map is ready, its shadow replaces the built-in one. `ready`
      // also settles when a bake step threw or a bake shader did not link (occlusion.js stepJob, finishFloor): the service
      // then holds no baked floor map, so the built-in shadow stays (or comes back) and the hand-over is tried again
      if (shadowOwner === 'room' && club.occ?.enabled === true && (shell.floor.material.userData?.clubKeys ?? []).some((k) => /^occ/.test(k))) {
        shadowOwner = 'occ-pending';
        Promise.resolve(club.occ.floor?.ready).then(() => { if (occFloorBaked()) { shadowOwner = 'occ'; shadowOn.value = 0; } else shadowOwner = 'room'; }, () => { shadowOwner = 'room'; });
      } else if (shadowOwner === 'occ' && !occFloorBaked()) { shadowOwner = 'room'; shadowOn.value = 1; }
      syncShadow();
      if (lampUpdate && typeof lamp.api?.update === 'function') {
        try { lamp.api.update(ctx.camera); } catch (e) { lampUpdate = false; console.warn('[club] room: the luminaire update threw and is no longer called:', e); }
      }
      if ((tick++ & 127) === 0) { readTable(); if (levelBand()) roomLight.commit(); } // (the luminaire re-registers its emitter on a fixture change)
    };
    club.onFrame?.(onFrame);
    try { club.adopt?.classify?.('room', (_o, m) => typeof m?.userData?.clubRoom === 'string'); } catch { /* no registry */ }

    let tierAsked = null;
    const partState = (p) => {
      let own = null;
      try { own = p.api?.state?.() ?? null; } catch { own = null; }
      try { p.counts = p.api?.counts?.() ?? p.counts; } catch { /* keep the last counts */ }
      return { status: p.status, error: p.error, readyAtMs: p.ms, counts: p.counts, ...(own ? { state: own } : {}) };
    };
    const state = () => ({
      detail, box: { min: box.min.toArray(), max: box.max.toArray() }, floorY: seated,
      tier: { built: builtTier, asked: tierAsked, rebuild: false, reason: TIER_FIXED },
      timing: { ...timing },
      shell: shell.counts(), light: roomLight.state(), props: partState(props), lamp: partState(lamp),
      lightmap: {
        on: lm.on, volume: lm.volume, reason: lm.reason, stale: lm.stale.slice(), late: lm.late, file: lmFile.state(),
        live: lm.live ? { sig: lm.live.sig, soft: lm.live.soft } : null,
        atlas: { size: shell.lightmap.size, texelsPerMetre: shell.lightmap.scale, charts: shell.lightmap.charts.length },
        propsContactShadowsHidden: lm.on && !propsShadow.split && propsShadow.contact.length > 0,
        // the props' shadow overlays (see applyPropsShadow): meshes per class and how many of them are drawn now
        propsShadows: { split: propsShadow.split, contact: propsShadow.contact.length, cast: propsShadow.cast.length,
          contactShown: propsShadow.contact.filter((o) => o.visible).length, castShown: propsShadow.cast.filter((o) => o.visible).length },
      },
      floor: shell.floor.albedoState(),
      hiddenAppObjects: hidden.map((o) => o.name || o.type), texturesLate, tile: { ...TILE },
      lampRect: { ...lampRect }, table: { ...tableRect }, builtinShadow: shadowOn.value, shadowOwner,
      reserved: reserved.map((r) => ({ ...r })), lampsCovered: lampsCovered.slice(), lampsMoved: [],
    });

    const lightmap = {
      /** The baked map while it is in use, else null (analytic light). */
      get texture() { return lm.on ? lmFile.texture : null; },
      /** Resolves when the file has loaded or failed (the look's reveal waits for it, bounded). */
      ready: lmFile.ready,
      state: () => state().lightmap,
      /** Tools: switch between the baked and the analytic light at run time (one recompile of three programs). */
      set(on) { lmWanted = on !== false; const r = applyLightmap(lmWanted); recapture('lightmap'); return r; },
      /** The bake tool: the live signature (hard + soft, with their parts). */
      signature,
      /** The bake tool: show a map that is not in a file yet (RGBA8 texture + its record, and the volume of the same bake:
       * { texture, data, dims, min, max } or null), or null to go back to the file. */
      preview(texture, meta, volume = null) {
        if (texture?.isTexture && meta) { lmFile.texture = texture; lmFile.meta = meta; lmFile.volume = volume; lmFile.status = 'preview'; }
        return lightmap.set(true);
      },
      /** The baked light on the floor at world (x, z): [r, g, b] irradiance of the fixed emitters and the bounce (the main
       * table's own lamp is not in it), or null while the map is off or the point is off the floor. CPU, from the bytes. */
      floorIrradiance: (x, z) => roomLight.floorIrradiance(x, z),
    };

    return {
      enabled: true,
      group,
      box,
      // `albedo`: the floor's mean diffuse colour, linear RGB (the material's colour x the mean of its colour map)
      // (read live: the colour map may land after the room is shown; `state().floor` says where the mean comes from)
      floor: { mesh: shell.floor.mesh, material: shell.floor.material, builtinShadow: shadowOn, get albedo() { return shell.floor.albedo; } },
      emissives,
      lightmap,
      /**
       * The tier is fixed for a page load: explicitly NOT supported after the build (state().tier says why). Returns true only
       * for the tier that is built; nothing is forwarded to the props or the luminaire, so the room never mixes two tiers.
       */
      setTier(tier) { tierAsked = tier ?? null; return tier === builtTier; },
      // additions to the contract (see the reports): what the shell occupies, the light service, the keep-out rectangle
      layout: shell.layout, light: roomLight, tableBounds, dims: DIM, reserved,
      shell: { meshes: shell.meshes, lightmap: shell.lightmap, lightmapMeshes: shell.lightmapMeshes, sides: shell.sides },
      parts: { get props() { return props.api; }, get lamp() { return lamp.api; } },
      recapture, state,
      dispose() {
        club.offFrame?.(onFrame);
        try { lamp.api?.dispose?.(); } catch { /* the luminaire keeps what it holds */ }
        roomLight.setLightmap(null); roomLight.setVolume(null);
        group.visible = false;
        for (const o of hidden) o.visible = true;
        hidden.length = 0;
        scene.remove(group);
      },
    };
  } catch (e) {
    // leave the app room on screen exactly as it was
    try { if (group) { group.visible = false; scene.remove(group); } for (const o of hidden) o.visible = true; } catch { /* nothing to restore */ }
    console.warn('[club] room: the club room failed to build — the app room stays:', e);
    return stub(String(e?.message ?? e));
  }
}
