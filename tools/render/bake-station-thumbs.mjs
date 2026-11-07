// Copyright (c) Meta Platforms, Inc. and affiliates.

// bake-station-thumbs.mjs — REAL-SCENE station-card thumb/turntable baker
// (feature 032 S2.5 follow-up; owner directive 2026-08-18: "选择卡片上都是
// 实物的渲染小图, 甚至可以旋转着(展示各个角度)"). One invocation bakes ONE
// item of ONE category — self-contained and port-parameterized so a fleet
// of parallel runners can each claim a worktree + port pair and bake a
// shard (the render-batch convention).
//
//   node tools/render/bake-station-thumbs.mjs
//        --category tables|cloths|balls|lighting --id <catalog-id>
//        [--game N]              game preamble (changeGame skipConfirm) —
//                                REQUIRED for class-gated items: the
//                                snooker table/set ride game 2, carom 3
//                                (changeEquipment lawfully refuses
//                                out-of-class tables under the active game)
//        [--frames N]            turntable sweep (24-36 ruled); 1 = still
//        [--isolated]            ISOLATED PRODUCT-RENDER mode (owner design
//                                revision 2026-08-18, the atelier.md §7
//                                isolated product-render entry) — see the
//                                ISOLATION MODE block below
//        [--outname NAME]        output basename override (default = --id;
//                                staging samples use <id>-isolated)
//        [--anchor <station>]    framing-anchor override (staged register
//                                only; default = the category's own station)
//        [--pose tx,ty,tz,radius,theta,phi]  EXPLICIT framing override
//                                (visual-audit fix rounds); staged sweeps
//                                orbit the pose's theta; in --isolated mode
//                                the pose replaces the auto-fit framing
//        [--port 8470]           http static server port (web/ root)
//        [--cdp 16770]            Chrome CDP port
//        [--out DIR]             output root (default web/assets/stations)
//        [--width 896 --height 448]   bake window (2:1 = the card chip)
//
// ISOLATION MODE (--isolated; owner revision 2026-08-18: "桌子就是一个纯桌子,
// 没有环境背景, 透明背景, 就像杆子那样在那里旋转… ballset 不要把球放在桌子上,
// 单独球本身在磨砂玻璃的透明背景上旋转"): the card thumb becomes an isolated
// PRODUCT RENDER — the object alone, floating on TRUE transparent alpha, in
// the cue-thumb register (bake-cue-thumbs.mjs precedent).
//   tables — the bare table only (whitelist = the obTable subtree; the room,
//            floor, wall props, luminaire meshes, balls and every other
//            drawable go visible=false — the venue LIGHTS are siblings of
//            the scenery meshes, never descendants, so illumination and
//            scene.environment stay live).
//   balls  — the ball group ALONE in a tight product formation (no table,
//            no cloth): the racked cluster stands as-is (it IS the tight
//            formation), loose balls (cue ball / snooker colours) line up
//            touching ahead of the rack apex; a 3-ball carom set forms a
//            touching triangle. Sphere shader uniforms re-sync to the moved
//            meshes so the ball-ball AO/interreflection read is honest.
//   cloths — an isolated floating SWATCH: a metre-UV plane sharing the LIVE
//            venue-staged bed material (tint, maps, sheen, analytic nap
//            detail — texel density identical to the bed by the metre-UV
//            law), at bed height under the venue lamp, raking read, STATIC.
//   lighting — the FIXTURE MODEL alone (owner override 2026-08-19,
//            atelier.md §7 entry 18 — supersedes the venue-stills ruling:
//            "灯也要是那种没有其他背景的, 透明背景的, 然后灯具模型旋转着"):
//            the luminaire assembly LIT (emissive faces live — the product
//            must read as a lamp), no room, no floor light pool, no table;
//            ceiling-suspension rods excluded (generic rigging to a ceiling
//            that is not in the shot — see the keep-set block). The light
//            FIELD stays the live-scene preview's job; TURNTABLE-capable
//            in THIS register only (the staged venue still stays static).
// ALPHA LAW: the page boots with &bakealpha=1 (web/app/main.js isolation-
// bake seam: straight-alpha + MSAA canvas); capture is renderer.render
// direct-to-canvas (tone mapping lawfully applies at target null on r170)
// + gl.readPixels — never Page.captureScreenshot, never a matte/key
// composite (FORBIDDEN). Node-side: row flip, MSAA-edge unpremultiply,
// deterministic lib/png.mjs encode, and a per-frame alpha VERIFICATION
// (all four corners alpha=0, non-zero ink, >=5 % transparent background)
// that fails the bake if the alpha path regresses.
// Framing: product auto-fit from the kept-set bounding box (orbit-worst
// plan diagonal + projected height vs the 40° camera), category phi/theta
// carried from the approved station anchors; --pose overrides.
//
// WHAT IT STAGES (the real app, real-user boot — obtool=0, seed=1,
// reduced-motion; every frame is the shipped renderer):
//   tables   — __settings.changeEquipment('table_id', id) on the pristine
//              boot (silent commit + re-rack), camera at the atelier TABLE
//              station anchor (the design-approved wide 3/4 bed framing;
//              contracts/atelier.md §2), theta sweep for turntables.
//   cloths   — changeEquipment('cloth_id', id), CLOTH station anchor (the
//              low raking framing — the nap read). STATIC by ruling: the
//              raking-light direction IS the shot; an orbit would swing the
//              highlight off the nap and read as flicker at 112x56.
//   balls    — changeEquipment('ballset_id', id), BALLS station anchor
//              (mid framing over the racked foot area), theta sweep.
//   lighting — __settings.set('fixture', id) ('auto' included), LIGHTING
//              station anchor (wide room-under-preset read). The STAGED
//              register stays STATIC (room orbits read as wobble at chip
//              scale); the ISOLATED register is a fixture turntable (owner
//              override 2026-08-19 — the hardware IS an orbitable object).
//
// DETERMINISM EXPECTATIONS: seed=1 posed boot, prefers-reduced-motion
// (instant moves, no idle animation), fresh-presented-frame gate before
// every capture (the capture-525-taste freshFrames law), fixed station
// anchors read back from __atelier.registry() AFTER staging (bed-scale
// truth). Two runs on the same GPU class produce pose-exact, perceptually
// identical frames (GPU AA dither may vary sub-LSB; byte identity across
// GPU architectures is NOT promised — the committed-asset diff gate is
// perceptual, not byte).
//
// Output: <out>/<category>/<outname>.png (still) or
//         <out>/<category>/<outname>/f<k 2-digit>.png (sweep frames);
//         <outname> defaults to <id>. Isolated frames are alpha PNGs
//         (lib/png.mjs deterministic encode); staged frames stay
//         Page.captureScreenshot PNGs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './lib/png.mjs';

// GH-687: what this tool's numeric port-like flags MEAN (run-gate never guesses)
export const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoUrl = (p) => new URL(`file://${path.join(repoRoot, p)}`).href;
const { launchChrome, sleep, spawnStaticServer, stopStaticServer } =
  await import(repoUrl('web/tools/cdp.mjs'));

const args = process.argv.slice(2);
const arg = (k, dflt) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const CATEGORY = arg('category', null);
const ID = arg('id', null);
const FRAMES = Math.max(1, Number(arg('frames', 1)));
const ISOLATED = args.includes('--isolated');
const OUTNAME = arg('outname', ID);
const PORT = Number(arg('port', 8470));
const CDP = Number(arg('cdp', 16770));
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2
const OUT = path.resolve(__pathOpt('--out', { default: path.join(repoRoot, 'web/assets/stations'), tag: 'bake-station-thumbs' }));
const W = Number(arg('width', 896));
const H = Number(arg('height', 448));
// --venue <table id>: the table the item is staged on, ASSERTED after staging
// (a condition swatch composes over the venue's cloth, so a re-bake is
// comparable with its predecessor only on the same venue). Cloths default to
// the app default table (settings.js DEFAULTS.equipment.table_id); the other
// categories assert nothing unless asked.
const VENUE = __stringOpt('--venue', { default: CATEGORY === 'cloths' ? 'pool_pro_9ft' : null, tag: 'bake-station-thumbs' }); // the FIX2 form, as --out / --anchor: both `--venue x` and `--venue=x`; blank / trailing refused (review s1219r4: arg() let `--venue=x` fall back to the default)

const CATS = {
  tables: { axis: 'table_id', station: 'table', sweep: true },
  cloths: { axis: 'cloth_id', station: 'cloth', sweep: false },
  balls: { axis: 'ballset_id', station: 'balls', sweep: true },
  lighting: { axis: 'fixture', station: 'lighting', sweep: false },
};
const cat = CATS[CATEGORY];
const ANCHOR = (() => {
  const a = __stringOpt('--anchor', { default: null, tag: 'bake-station-thumbs' }); // FIX2: both `--anchor x` and `--anchor=x`; blank / trailing refused
  if (a !== null && a !== undefined && !['table', 'cloth', 'balls', 'lighting'].includes(a)) { console.error(`[bake-station-thumbs] REFUSED — unknown --anchor '${a}' (table | cloth | balls | lighting)`); process.exit(2); } // FIX2: a typo used to become 'no anchor'
  return a && ['table', 'cloth', 'balls', 'lighting'].includes(a) ? a : null;
})();
if (!cat || !ID) {
  console.error('usage: --category tables|cloths|balls|lighting --id <id> '
    + '[--frames N] [--port N] [--cdp N] [--out DIR]');
  process.exit(2);
}
// lighting sweeps in the ISOLATED register only (owner override 2026-08-19,
// atelier.md §7 entry 18: the fixture model is an orbitable product; the
// staged venue still stays static — a room orbit reads as wobble).
const sweepable = cat.sweep || (CATEGORY === 'lighting' && ISOLATED);
if (!sweepable && FRAMES > 1) {
  console.error(`${CATEGORY} is a STATIC category by ruling (header); `
    + 'refusing a multi-frame bake');
  process.exit(2);
}

const webDir = path.join(repoRoot, 'web');
const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const waitExpr = async (c, expr, tries = 100, ms = 150) => {
  for (let i = 0; i < tries; i++) {
    if (await c.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  return false;
};
const freshFrames = (c, n = 3) => c.eval(`(async () => {
  for (let i = 0; i < ${n}; i++) {
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
  return true;
})()`);

// ---- isolation mode (header ISOLATION MODE block) --------------------------

/** Row-flip (GL origin is bottom-left) + unpremultiply the MSAA edge
 * coverage (the bake-cue-thumbs.mjs law: MSAA resolve over the transparent
 * clear leaves edge texels premultiplied — dividing by alpha recovers the
 * true edge color, clean alpha edges). */
function toStraightRgba(raw, w, h) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    px.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  }
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 0) { px[i] = px[i + 1] = px[i + 2] = 0; continue; }
    if (a < 255) {
      px[i] = Math.min(255, Math.round((px[i] * 255) / a));
      px[i + 1] = Math.min(255, Math.round((px[i + 1] * 255) / a));
      px[i + 2] = Math.min(255, Math.round((px[i + 2] * 255) / a));
    }
  }
  return px;
}

/** Non-throwing ink/alpha scan: bbox of alpha>0 plus transparency stats. */
function inkBox(px, w, h) {
  let clear = 0, partial = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = px[(y * w + x) * 4 + 3];
      if (a === 0) { clear++; continue; }
      if (a < 255) partial++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { clearPct: (clear / (w * h)) * 100, partial, x0, x1, y0, y1 };
}

/** Alpha VERIFICATION (header ALPHA LAW): throws if the capture path lost
 * transparency. Returns stats for the bake log. */
function verifyAlpha(px, w, h, tag) {
  const s = inkBox(px, w, h);
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]
    .map(([x, y]) => px[(y * w + x) * 4 + 3]);
  if (corners.some((a) => a !== 0)) {
    throw new Error(`${tag}: corner alpha [${corners}] != 0 — the background `
      + 'is not transparent (alpha capture path regressed)');
  }
  if (s.x1 < 0) throw new Error(`${tag}: zero ink — nothing rendered`);
  if (s.clearPct < 5) {
    throw new Error(`${tag}: only ${s.clearPct.toFixed(1)}% transparent — `
      + 'the render is not isolated (environment still visible?)');
  }
  return s;
}

async function bakeIsolated(chrome, outDir, pose) {
  // one-time page-side staging: classify + hide + arrange + framing;
  // installs window.__isoBake.capture(theta)
  const setup = await chrome.eval(`(async () => {
    const THREE = await import('three');
    const { scene, renderer, camera } = window.__dbg;
    const CATEGORY = ${JSON.stringify(CATEGORY)};
    // ALPHA LAW: prove the drawing buffer honestly carries straight alpha
    // (the main.js bakealpha seam) BEFORE staging — matte/keying forbidden
    const attrs = renderer.getContext().getContextAttributes();
    if (!attrs.alpha) {
      throw new Error('drawing buffer has no alpha — bakealpha=1 boot seam missing');
    }
    if (attrs.premultipliedAlpha) {
      throw new Error('drawing buffer is premultiplied — straight-alpha law violated');
    }
    const table = scene.getObjectByName('obTable');
    if (!table) throw new Error('obTable missing');
    const drawable = (o) => o.isMesh || o.isLine || o.isPoints || o.isSprite;
    const effVisible = (o) => {
      for (let n = o; n; n = n.parent) { if (n.visible === false) return false; }
      return true;
    };

    // Uniform values a category needs PINNED for the bake. Assigning once is
    // not enough: the app owns these uniforms and re-derives them from its own
    // state on events the bake page can still receive (a game event for the
    // sphere count, a lazy async texture landing for the wear switch — review
    // r7 P2). capture() re-asserts every entry in the same atomic task as the
    // render, exactly as it already does for the keep/hidden visibility sets,
    // so nothing that lands between staging and the shot can survive.
    // Awaiting instead of pinning is not available: the loads in question are
    // lazy, so there is no promise to await when they are never started.
    const pins = [];
    const pin = (u, value) => { if (u) pins.push([u, value]); };

    // ---- category keep-set (header): the product object, nothing else ----
    let keep = [];
    if (CATEGORY === 'tables') {
      table.traverse((o) => {
        if (drawable(o) && effVisible(o)) keep.push(o);
      });
      if (!keep.length) throw new Error('bare table: no visible meshes');
      // bare-table law: the hidden rack's ANALYTIC contact shadows must not
      // paint on the cloth (shader-side sphere uniforms outlive mesh
      // visibility) — zero the sphere count for the bake page's lifetime
      pin(window.__gi?.uniforms?.uSphereCount, 0);
    } else if (CATEGORY === 'balls') {
      // the game ball group: unnamed direct scene child whose children are
      // all sphere meshes (ballset.js builds it nameless, kernel order —
      // uniform index == child index)
      const bg = scene.children.find((o) => o.isGroup && !o.name
        && o.children.length > 0
        && o.children.every((c) => c.isMesh
          && c.geometry?.type === 'SphereGeometry'));
      if (!bg) throw new Error('ball group not found');
      const live = bg.children.filter((m) =>
        effVisible(m) && m.position.y > -1); // skip pocket-parked (0,-10,0)
      if (!live.length) throw new Error('no live balls');
      const r = live[0].geometry.parameters.radius;
      const D = 2 * r + 0.0005; // touching + a hair (no visual overlap)
      const y = live.reduce((s, m) => s + m.position.y, 0) / live.length;
      if (live.length === 3) {
        // carom trio: touching triangle at the trio's centroid
        const c3 = new THREE.Vector3();
        live.forEach((m) => c3.add(m.position));
        c3.divideScalar(3);
        const ax = new THREE.Vector3(-1, 0, 0), pp = new THREE.Vector3(0, 0, 1);
        const hh = D / Math.sqrt(3);
        const slots = [
          c3.clone().addScaledVector(ax, hh),
          c3.clone().addScaledVector(ax, -hh / 2).addScaledVector(pp, D / 2),
          c3.clone().addScaledVector(ax, -hh / 2).addScaledVector(pp, -D / 2)];
        live.forEach((m, i) => { m.position.copy(slots[i]); m.position.y = y; });
      } else {
        // racked cluster (>=2 neighbours within 2.6r — rack contacts are
        // ~2r+micro-gap; the snooker pink reads exactly 1 and stays loose)
        // stands as-is: it IS the tight formation. Loose balls (cue ball /
        // snooker colours) line up touching ahead of the rack apex.
        const near = (a, b) => a.position.distanceTo(b.position) < 2.6 * r;
        const racked = live.filter((m) =>
          live.filter((o) => o !== m && near(m, o)).length >= 2);
        const loose = live.filter((m) => !racked.includes(m));
        if (racked.length && loose.length) {
          const cen = new THREE.Vector3();
          racked.forEach((m) => cen.add(m.position));
          cen.divideScalar(racked.length);
          const ax = new THREE.Vector3();
          loose.forEach((m) => ax.add(m.position));
          ax.divideScalar(loose.length).sub(cen);
          ax.y = 0;
          if (ax.lengthSq() < 1e-9) ax.set(-1, 0, 0);
          ax.normalize();
          let apex = racked[0], best = -Infinity;
          for (const m of racked) {
            const d = m.position.clone().sub(cen).dot(ax);
            if (d > best) { best = d; apex = m; }
          }
          const pp = new THREE.Vector3(-ax.z, 0, ax.x);
          const row = apex.position.clone().addScaledVector(ax, D);
          loose.forEach((m, i) => {
            m.position.copy(row)
              .addScaledVector(pp, (i - (loose.length - 1) / 2) * D);
            m.position.y = y;
          });
        }
      }
      // sphere-uniform truth follows the meshes (ball-ball AO /
      // interreflection on the formation; shading.js uSpheres = xyz+radius)
      const u = window.__gi?.uniforms;
      bg.children.forEach((m, i) => {
        const v = u?.uSpheres?.value?.[i];
        if (v && m.position.y > -1) {
          v.set(m.position.x, m.position.y, m.position.z,
            m.geometry.parameters.radius);
        }
      });
      keep = live;
    } else if (CATEGORY === 'cloths') {
      // floating swatch sharing the LIVE venue-staged bed material; the bed
      // is the largest-plan sheen mesh under obTable (clothMat is shared
      // with cushions/fall-lips — plan area disambiguates) that is unnamed
      // or carries one of the bed's own names: table.js dmFor names it
      // 'dm-bed-cloth' on a dmNames entry (GH-488D A2, the default
      // pool_pro_9ft since 08-28) and the cn8 style 'cn8-bed' — the condition-swatch re-bake found
      // the R1d-era unnamed-only filter skipping it ("cloth bed mesh not
      // found")
      let bed = null, bestA = 0;
      const BED_NAMES = new Set(['', 'dm-bed-cloth', 'cn8-bed']);
      table.traverse((o) => {
        if (!o.isMesh || !BED_NAMES.has(o.name) || !(o.material?.sheen > 0)) return;
        const b = new THREE.Box3().setFromObject(o);
        const a = (b.max.x - b.min.x) * (b.max.z - b.min.z);
        if (a > bestA) { bestA = a; bed = o; }
      });
      if (!bed) throw new Error('cloth bed mesh not found');
      const SW = 0.42, SH = 0.28;
      const geo = new THREE.PlaneGeometry(SW, SH, 1, 1);
      // bed UV convention: 1 UV unit = 1 plan metre (ShapeGeometry law) —
      // scale the plane's 0..1 UVs to metres so nap/mottle texel density
      // matches the bed exactly
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * SW, uv.getY(i) * SH);
      }
      // clothMat carries vertexColors since fd7ac77b (GH-490 r23): every
      // clothMat geometry needs the identity-white color attribute, which
      // table.js ensureClothColorAttrs writes only for the table group's own
      // meshes. Without it WebGL reads (0,0,0), the diffuse term goes to zero
      // and the swatch keeps only sheen and highlights — about 83/255
      // darker; the same trap table.js records for the d621 bed (9a7e4d8d).
      // Identity, never the bed's own colours: on a cn8 venue
      // cn8transport.js apply() overwrites those with the light response its
      // solver derived from the table and pocket geometry (ray visibility and
      // the pocket-void bounce exclusion; achromatic, 0.05-0.934, 0.86875 over
      // this footprint — review s1219r1/r2), and that table is not in this
      // isolated shot. Like the TERM 3 residual below, it is a fact about the
      // table, not about the cloth
      if (bed.material.vertexColors && !geo.getAttribute('color')) {
        geo.setAttribute('color', new THREE.BufferAttribute(
          new Float32Array(geo.getAttribute('position').count * 3).fill(1), 3));
      }
      const sw = new THREE.Mesh(geo, bed.material);
      sw.name = 'obIsoSwatch';
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(0, 0.0008, 0); // bed plane height, under the venue lamp
      scene.add(sw);
      // no ball contact shadows / nap dimples on a detached swatch
      pin(window.__gi?.uniforms?.uSphereCount, 0);
      // ...and no GH-542 TERM 3 traffic residual, for the same reason. That
      // field is one table's play history indexed by WORLD POSITION, so a
      // swatch floating at the origin reads the bed centre — over this
      // SW x SH footprint, abrasion runs 0.87x the field mean and deposit
      // 1.03x — which is a fact about where the origin is, not about the
      // cloth. (Method, because the earlier figures here were quoted without
      // one and could not be reproduced: mean of the f64 field over the cells
      // whose centres fall inside the swatch rectangle, divided by the mean
      // over the whole field. The pre-R1d field read 0.90x / 1.13x the same
      // way, against 0.95x / 1.16x as written — close enough to identify the
      // measure, not close enough to call it the same computation, so treat
      // the old pair as unsourced.) Off, the swatch renders the
      // cloth's PUBLISHED bed-mean condition (clothvisuals.js
      // appliedClothVisual), the same number the picker and the sheet quote.
      // It also makes the bake deterministic: the field is a lazy async fetch
      // that would otherwise land before or after the shot by luck — and
      // PINNED rather than assigned, because that fetch's own callback re-runs
      // the cloth leg and flips uWearOn back on when it lands (review r7 P2).
      // A one-time zero here is only correct on a host fast enough that the
      // field arrived before staging, which is precisely the wrong thing for a
      // committed asset to depend on.
      pin(bed.material.userData?.clothWear?.uWearOn, 0);
      keep = [sw];
    } else if (CATEGORY === 'lighting') {
      // FIXTURE HARDWARE only (owner override 2026-08-19, atelier.md §7
      // entry 18): the luminaire assembly LIT — emissive faces stay live
      // (MeshBasicMaterial HDR faces: the product must read as a lamp),
      // housings/frames/pendant bar+stems+shades kept; the room, floor
      // light pool, table and every other drawable are hidden by the
      // general loop below. CEILING-SUSPENSION RODS are EXCLUDED: every
      // fixture family hangs from the same generic 7 mm rods running to
      // the room ceiling (CEIL_Y 2.45) — rigging to a ceiling that is not
      // in the shot, zero product identity, and their 1.3+ m of vertical
      // ink would shrink the luminaire to a sliver in the 2:1 frame.
      // Detection is geometric truth, not names: a candidate whose world
      // AABB tops out above y = 2.0 is suspension (every luminaire BODY
      // sits below ~1.25; rods always reach 2.45).
      if (!window.__lighting?.state) {
        throw new Error('lighting runtime missing (__lighting)');
      }
      const isRod = (m) => new THREE.Box3().setFromObject(m).max.y > 2.0;
      const fm = window.__lighting.fixtureMeshes?.();
      if (fm?.length) {
        // non-canopy fixture: the lightingvisuals.js mesh-group seam
        keep = fm.filter((m) => effVisible(m) && !isRod(m));
      } else {
        // canopy register (the identity fixture — 'auto' resolves here on
        // the default pool class): room-owned meshes via the activeRoom
        // explicit-refs handle. Same module instance as the app boot —
        // every consumer imports the bare /scene/room.js specifier.
        const roomM = await import('/scene/room.js');
        const lr = roomM.activeRoom?.instance?.lightRefs;
        if (!lr) throw new Error('room lightRefs missing (canopy register)');
        keep = [lr.lampFace, lr.hood].filter((m) => m && effVisible(m));
      }
      if (!keep.length) throw new Error('no fixture meshes to isolate');
    } else {
      throw new Error('isolation unsupported for ' + CATEGORY);
    }

    // ---- hide every other drawable (lights are SIBLINGS of scenery meshes,
    // never descendants — venue illumination + scene.environment stay live)
    const keepSet = new Set(keep);
    const hidden = [];
    scene.traverse((o) => {
      if (drawable(o) && !keepSet.has(o) && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    });

    // ---- product auto-fit framing: EXACT corner-projection fit -----------
    // Seed from the plan diagonal, then expand the radius until all 8 bbox
    // corners clear the margins at EVERY sweep theta (an analytic estimate
    // clipped the table legs on the first cut), then center vertically.
    const bbox = new THREE.Box3();
    keep.forEach((m) => bbox.expandByObject(m));
    const c = bbox.getCenter(new THREE.Vector3());
    const dx = bbox.max.x - bbox.min.x, dy = bbox.max.y - bbox.min.y,
      dz = bbox.max.z - bbox.min.z;
    const halfDiag = Math.hypot(dx, dz) / 2; // orbit-worst plan half-extent
    // cloths phi 1.08 (not the station anchor's 1.36): at a full-grazing
    // view the sheen term + Fresnel env wash desaturate the swatch far off
    // the bed's color truth; ~30° elevation keeps the near-to-far nap-sheen
    // falloff (the raking read) while the felt color stays representative
    // lighting phi 1.98 (~23° BELOW the emitter plane, looking up): the
    // product face of a luminaire is its glowing underside — from above
    // only the housing top reads and the GH-381 occluder fade would fight
    // the shot (lampfade fades fixtures for cameras above the lamp plane;
    // below the plane it never engages)
    let phi = { tables: 1.02, balls: 0.85, cloths: 1.08,
      lighting: 1.98 }[CATEGORY];
    let theta0 = { tables: -0.55, balls: -0.95, cloths: -0.62,
      lighting: -0.55 }[CATEGORY];
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    let radius = Math.max(halfDiag / Math.tan(hfov / 2),
      halfDiag / Math.tan(vfov / 2) / 2, 0.05);
    const pose = ${JSON.stringify(pose)};
    if (pose) {
      c.set(pose.tx, pose.ty, pose.tz);
      radius = pose.radius; theta0 = pose.theta; phi = pose.phi;
    } else {
      const corners = [];
      for (const px of [bbox.min.x, bbox.max.x]) {
        for (const py of [bbox.min.y, bbox.max.y]) {
          for (const pz of [bbox.min.z, bbox.max.z]) {
            corners.push(new THREE.Vector3(px, py, pz));
          }
        }
      }
      const nTheta = Math.max(${FRAMES}, 12);
      const cam = camera.clone();
      const proj = (rad) => {
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (let i = 0; i < nTheta; i++) {
          const th = theta0 + (i * 2 * Math.PI) / nTheta;
          cam.position.setFromSpherical(
            new THREE.Spherical(rad, phi, th)).add(c);
          cam.lookAt(c);
          cam.updateMatrixWorld(true);
          for (const p of corners) {
            const v = p.clone().project(cam);
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
          }
        }
        return { minX, maxX, minY, maxY };
      };
      const MX = 0.92, MY = 0.86; // NDC ceilings: 4 % / 7 % margins per side
      const seed = radius;
      for (let round = 0; round < 4; round++) {
        // vertical centering FIRST (a rig translation shifts NDC by
        // -dy*sin(phi)/(radius*tan(vfov/2))), then REFIT the radius from a
        // shrunken start — center-then-grow alternation converges; a
        // grow-only loop locked in the badly-centered oversize
        const b = proj(radius);
        c.y += ((b.minY + b.maxY) / 2)
          * radius * Math.tan(vfov / 2) / Math.sin(phi);
        radius = Math.max(radius * 0.5, seed * 0.5);
        for (let i = 0; i < 80; i++) {
          const bb = proj(radius);
          if (Math.max(-bb.minX, bb.maxX) <= MX
            && Math.max(-bb.minY, bb.maxY) <= MY) break;
          radius *= 1.04;
        }
      }
      const fin = proj(radius);
      if (Math.max(-fin.minX, fin.maxX) > 1 || Math.max(-fin.minY, fin.maxY) > 1) {
        throw new Error('auto-fit failed to contain the object');
      }
    }

    window.__isoBake = {
      capture(theta) {
        // atomic: re-assert isolation + pinned uniforms + pose + render + read
        // in ONE task so the app's own rAF loop can never interleave
        for (const o of hidden) o.visible = false;
        for (const o of keep) o.visible = true;
        for (const [u, value] of pins) u.value = value;
        camera.position.setFromSpherical(
          new THREE.Spherical(radius, phi, theta)).add(c);
        camera.lookAt(c);
        const prevBg = scene.background;
        const prevClear = new THREE.Color();
        renderer.getClearColor(prevClear);
        const prevAlpha = renderer.getClearAlpha();
        const prevAuto = renderer.autoClear;
        scene.background = null;
        renderer.setRenderTarget(null); // canvas: tone mapping applies (r170)
        renderer.setClearColor(0x000000, 0);
        renderer.autoClear = true;
        renderer.render(scene, camera);
        const gl = renderer.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        scene.background = prevBg;
        renderer.setClearColor(prevClear, prevAlpha);
        renderer.autoClear = prevAuto;
        let bin = '';
        for (let i = 0; i < px.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
        }
        return { b64: btoa(bin), w, h };
      },
      adjust(dyPx, scale) {
        // ink-feedback framing (the node side measures REAL rendered ink —
        // bbox corners overestimate empty plan corners): a rig translation
        // d shifts screen ink by d*sin(phi)/worldPerPx
        const worldPerPx = (2 * radius * Math.tan(vfov / 2)) / ${H};
        c.y -= (dyPx * worldPerPx) / Math.sin(phi);
        radius *= scale;
        return { radius: +radius.toFixed(4), cy: +c.y.toFixed(4) };
      },
    };
    return { kept: keep.length, hidden: hidden.length, theta0, phi,
      radius: +radius.toFixed(4),
      target: { x: +c.x.toFixed(4), y: +c.y.toFixed(4), z: +c.z.toFixed(4) },
      bbox: { dx: +dx.toFixed(4), dy: +dy.toFixed(4), dz: +dz.toFixed(4) } };
  })()`);
  console.log(`[iso] kept ${setup.kept} drawable(s), hid ${setup.hidden}; `
    + `target (${setup.target.x}, ${setup.target.y}, ${setup.target.z}) `
    + `radius ${setup.radius} phi ${setup.phi} theta0 ${setup.theta0} `
    + `bbox ${setup.bbox.dx}x${setup.bbox.dy}x${setup.bbox.dz}`);

  // ---- ink-feedback framing refinement (skipped under --pose): probe a few
  // sweep thetas, measure the UNION of real rendered ink, and center/size the
  // product against the frame — the corner fit is only the seed (bbox corners
  // overestimate empty plan corners, which floated the first cut high+small)
  if (!pose) {
    // probe the EXACT ship thetas (review visual-audit r6 MAJOR, 2026-08-19:
    // the 6-angle probe missed intermediate worst-case angles of the
    // perimeter ring's wide plan — 14/30 shipped frames clipped the frame
    // edge; sweeps now measure the ink union over every frame they ship)
    const nProbe = FRAMES > 1 ? FRAMES : 1;
    const FILL_W = 0.90, FILL_H = 0.84; // ink ceilings (bottom air for the
    for (let round = 0; round < 4; round++) { // card's CSS drop shadow)
      let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
      for (let i = 0; i < nProbe; i++) {
        const th = setup.theta0 + (i * 2 * Math.PI) / nProbe;
        const r = await chrome.eval(`__isoBake.capture(${th})`);
        const s = inkBox(toStraightRgba(
          new Uint8Array(Buffer.from(r.b64, 'base64')), r.w, r.h), r.w, r.h);
        if (s.x1 < 0) throw new Error('framing probe: zero ink');
        x0 = Math.min(x0, s.x0); x1 = Math.max(x1, s.x1);
        y0 = Math.min(y0, s.y0); y1 = Math.max(y1, s.y1);
      }
      const inkW = x1 - x0 + 1, inkH = y1 - y0 + 1;
      const scale = Math.max(inkW / (FILL_W * W), inkH / (FILL_H * H));
      const dyPx = (y0 + y1) / 2 - H / 2;
      console.log(`[fit] round ${round}: ink ${inkW}x${inkH} `
        + `dy ${dyPx.toFixed(1)}px scale ${scale.toFixed(3)}`);
      if (Math.abs(dyPx) <= 6 && scale <= 1.005 && scale >= 0.93) break;
      const adj = await chrome.eval(`__isoBake.adjust(${dyPx}, `
        + `${Math.min(Math.max(scale, 0.6), 1.8)})`);
      console.log(`[fit]   -> radius ${adj.radius} target.y ${adj.cy}`);
    }
  }

  for (let k = 0; k < FRAMES; k++) {
    const theta = setup.theta0 + (k * 2 * Math.PI) / FRAMES;
    const r = await chrome.eval(`__isoBake.capture(${theta})`);
    if (r.w !== W || r.h !== H) {
      throw new Error(`drawing buffer ${r.w}x${r.h} != bake window ${W}x${H} `
        + '(device pixel ratio must be 1 on the bake boot)');
    }
    const raw = new Uint8Array(Buffer.from(r.b64, 'base64'));
    if (raw.length !== r.w * r.h * 4) {
      throw new Error(`readback ${raw.length} B != ${r.w}x${r.h}x4`);
    }
    const px = toStraightRgba(raw, r.w, r.h);
    const tag = FRAMES > 1 ? `${OUTNAME}/f${String(k).padStart(2, '0')}` : OUTNAME;
    const s = verifyAlpha(px, r.w, r.h, tag);
    // COMPLETE-SILHOUETTE guard (review visual-audit r6): a shipped frame
    // whose ink touches the frame edge is a clipped product render — with
    // the exact-theta probe above the fit guarantees margins, so an edge
    // touch here is always a real framing regression.
    if (s.x0 === 0 || s.y0 === 0 || s.x1 === r.w - 1 || s.y1 === r.h - 1) {
      throw new Error(`${tag}: ink touches the frame edge `
        + `(x[${s.x0}..${s.x1}] y[${s.y0}..${s.y1}]) — clipped silhouette`);
    }
    const file = FRAMES > 1
      ? path.join(outDir, `f${String(k).padStart(2, '0')}.png`)
      : path.join(outDir, `${OUTNAME}.png`);
    fs.writeFileSync(file, encodePng(r.w, r.h, px));
    console.log(`[bake] ${path.relative(OUT, file)}  ink x[${s.x0}..${s.x1}] `
      + `y[${s.y0}..${s.y1}]  ${s.clearPct.toFixed(1)}% transparent `
      + `(${s.partial} edge px)`);
  }
}

let chrome = null;
try {
  chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?obtool=0&seed=1`
    + `${ISOLATED ? '&bakealpha=1' : ''}&u=bake-${CATEGORY}-${ID}`,
    { port: CDP, tool: false, width: W, height: H });
  await chrome.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (!(await waitExpr(chrome, 'window.__test?.ready === true', 200, 200))) {
    throw new Error('boot never became ready');
  }
  if (!(await waitExpr(chrome, 'window.__shell?.isOpen?.() === true'))) {
    throw new Error('fresh boot never opened the shell');
  }
  await sleep(2500); // GI bake settle (honest-stills law)

  // ---- optional game preamble (class-gated tables/sets) ------------------
  const GAME = arg('game', null);
  if (GAME !== null) {
    const ok = await chrome.eval(`(async () => {
      const r = await window.__settings.changeGame(
        ${JSON.stringify(GAME)}, { skipConfirm: true });
      return r !== false;
    })()`);
    if (!ok) throw new Error(`game preamble ${GAME} refused`);
    await sleep(1500); // game staging + re-rack settle
    // A fresh game may carry an initialState-BORN rules decision (carom
    // break_spot, UMB Art 23.1(c) — wire choices 1|2): the shell honestly
    // REFUSES entry while it pends (FR-016 decisionPending gate), which
    // would dead-end the station framing below. The bake resolves it
    // programmatically (choice 1 = left spot; staging-only, nothing
    // persisted — the same __rules.decide e2e wire). Product-UX note:
    // GH issue filed — a fresh carom boot locks the atelier until the
    // prompt is answered even though the decision auto-resolves on the
    // first stroke (flow.js caromPreJudge).
    await chrome.eval(`(() => {
      if (window.__rules?.matchState?.()?.pendingDecision) {
        window.__rules.decide(1);
      }
      return true;
    })()`);
  }

  // ---- stage the item through the SHIPPED settings machinery ------------
  const staged = await chrome.eval(cat.axis === 'fixture'
    ? `(async () => {
        window.__settings.set('fixture', ${JSON.stringify(ID)});
        return true;
      })()`
    : `(async () => {
        const ok = await window.__settings.changeEquipment(
          ${JSON.stringify(cat.axis)}, ${JSON.stringify(ID)});
        return ok === true
          || window.__settings.get().equipment[${JSON.stringify(cat.axis)}]
             === ${JSON.stringify(ID)};
      })()`);
  if (!staged) throw new Error(`staging ${cat.axis}=${ID} refused`);
  await sleep(1200); // re-rack / lighting apply settle
  if (VENUE !== null) {
    const venue = await chrome.eval('window.__settings.get().equipment.table_id');
    if (venue !== VENUE) throw new Error(`bake venue ${venue} is not the pinned --venue ${VENUE}`);
    const spec = await chrome.eval(`import('/scene/table.js').then((t) => {
      const s = t.appliedClothVisual?.(); return s ? { color: s.color, sheen: s.sheen } : null; })`);
    console.log(`bake venue ${venue} (pinned); applied cloth `
      + (spec ? `#${spec.color.toString(16).padStart(6, '0')} sheen ${spec.sheen}` : 'n/a'));
  }

  // ---- station framing (the atelier anchors are the approved reads) -----
  await chrome.eval(`(window.__shell.isOpen() || __shell.openShell({})),`
    + `__shell.go('equipment'), true`);
  if (!(await waitExpr(chrome, 'typeof window.__atelier === "object"'))) {
    throw new Error('atelier never mounted');
  }
  const station = ANCHOR ?? cat.station;
  await chrome.eval(`__atelier.go('${station}'), true`);
  if (!(await waitExpr(chrome,
    `!__shell.moving() && __atelier.station() === '${station}'`))) {
    throw new Error(`station ${station} never landed`);
  }
  // chrome OFF for the bake (scene only; shell/rail/cards are UI, not item)
  await chrome.eval(`(() => {
    for (const sel of ['#ob-shell', '#ob-atelier-rail', '#ob-atelier-cue']) {
      const el = document.querySelector(sel);
      if (el) el.style.visibility = 'hidden';
    }
    return true;
  })()`);
  let anchor = await chrome.eval(`__atelier.registry()
    .find((s) => s.id === '${station}').anchor`);
  // explicit pose override (visual-audit fix rounds): staged mode writes the
  // orbit rig directly — the station landing above still owns place/chrome
  // state; isolated mode hands the pose to the auto-fit framing instead
  const POSE = arg('pose', null);
  let pose = null;
  if (POSE) {
    const [tx, ty, tz, radius, theta, phi] = POSE.split(',').map(Number);
    if (![tx, ty, tz, radius, theta, phi].every(Number.isFinite)) {
      throw new Error(`--pose needs 6 numbers, got: ${POSE}`);
    }
    pose = { tx, ty, tz, radius, theta, phi };
    anchor = pose;
    if (!ISOLATED) {
      await chrome.eval(`(() => {
        const o = window.__dbg.orbit;
        o.state.target.set(${tx}, ${ty}, ${tz});
        o.state.radius = ${radius};
        o.state.theta = ${theta};
        o.state.phi = ${phi};
        o.apply();
        return true;
      })()`);
    }
  }

  const outDir = FRAMES > 1
    ? path.join(OUT, CATEGORY, OUTNAME) : path.join(OUT, CATEGORY);
  fs.mkdirSync(outDir, { recursive: true });

  if (ISOLATED) {
    await bakeIsolated(chrome, outDir, pose);
  } else {
    for (let k = 0; k < FRAMES; k++) {
      if (FRAMES > 1) {
        const theta = anchor.theta + (k * 2 * Math.PI) / FRAMES;
        await chrome.eval(`(() => {
          const o = window.__dbg.orbit;
          o.state.theta = ${theta};
          o.apply();
          return true;
        })()`);
      }
      await freshFrames(chrome);
      const file = FRAMES > 1
        ? path.join(outDir, `f${String(k).padStart(2, '0')}.png`)
        : path.join(outDir, `${OUTNAME}.png`);
      await chrome.screenshot(file);
      console.log(`[bake] ${path.relative(OUT, file)}`);
    }
  }
  console.log(`BAKE DONE — ${CATEGORY}/${ID} x${FRAMES}`
    + `${ISOLATED ? ' (isolated product render, alpha-verified)' : ''}`
    + ` → ${outDir}`);
} catch (e) {
  console.error('BAKE FAIL', e.stack ?? e);
  process.exitCode = 1;
} finally {
  chrome?.close();
  stopStaticServer(server);
}
