// Copyright (c) Meta Platforms, Inc. and affiliates.

// schema.js — the runtime validator of a ball-return track definition (feature
// 037). PURE, node-importable. Mirrors docs/geometry/ball-return-track.schema.json
// structurally and adds the LAW-level refusals the JSON Schema cannot express
// (data-model.md V0–V12, topology-aware since schema 1.1; V0 = the published JSON schema itself, enforced through
// jsonschema.js before anything else). Every refusal is a thrown Error whose message names the
// failing law and path — the module stays inert on refusal and, on scripted
// boots, reports once through the app error surface.
import { buildTrack, PRESET_UR, MM, G, supportDerived, accelAt, locate, resistCoeff, stationAt, EXPORT_GRAIN, drainsAt, routeEntry, routeTop } from './track.js';
import { validateAgainstSchema, schemaRefusal } from './jsonschema.js';
import TRACK_SCHEMA from './track-schema.js';

export const SCHEMA_ID = 'openbilliards/ball-return-track/1';
export const SINK_SHIELD_Y = -0.055; // sinkpivot.js / game.js mirror (cull line)

const TAGS = new Set(['MFR', 'MODEL', 'DERIVED', 'PHOTO', 'TEST']);
const DESIGN_PATHS = new Set(['arrival']); // DESIGN: a modelling decision — admissible ONLY where the schema enumerates the value (arrival.restitution), never on a dimension
const STATUS = new Set(['TEST', 'PROPOSAL', 'ACCEPTED']);

const fail = (law, msg) => { throw new Error(`ball-return track refused [${law}]: ${msg}`); };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function checkProvenance(obj, path, status) {
  const p = obj?.provenance;
  if (!p || typeof p !== 'object') fail('V1', `provenance missing at ${path}`);
  // a DESIGN path (arrival) admits DESIGN and nothing else — the JSON schema's
  // $defs/design_provenance is `const DESIGN` (round-3 note); every other path
  // admits the measurement tags and never DESIGN
  const allowed = DESIGN_PATHS.has(path) ? p.tag === 'DESIGN' : TAGS.has(p.tag);
  if (!allowed) fail('V1', `provenance.tag at ${path} must be ${DESIGN_PATHS.has(path) ? 'DESIGN (const)' : `one of ${[...TAGS].join('/')} (DESIGN is admissible only at arrival)`}`);
  if (typeof p.source !== 'string' || p.source.length < 4) fail('V1', `provenance.source at ${path} too short`);
  if (p.tag === 'TEST' && status !== 'TEST') fail('V1', `TEST tag at ${path} outside TEST status`);
}

function checkSupport(s, path, status, refD) {
  if (!s || typeof s !== 'object') fail('V1', `support missing at ${path}`);
  if (s.kind === 'twin-rail') {
    if (!isNum(s.gauge_mm) || s.gauge_mm <= 0) fail('V1', `${path}.gauge_mm`);
    if (!isNum(s.rail_diameter_mm) || s.rail_diameter_mm <= 0) fail('V1', `${path}.rail_diameter_mm`);
    if (!(s.gauge_mm < refD + s.rail_diameter_mm)) fail('V9', `${path}: gauge ${s.gauge_mm} admits the ball (>= ${refD} + ${s.rail_diameter_mm})`);
  } else if (s.kind === 'channel') {
    if (!isNum(s.width_mm) || s.width_mm <= 0) fail('V1', `${path}.width_mm`);
  } else {
    fail('V1', `${path}.kind must be twin-rail or channel`);
  }
  checkProvenance(s, path, status);
}

/**
 * Validate a definition against the schema + laws and return the BUILT track.
 * ctx: { pockets: [{x, z, r}] (three frame, kernel order), falls: [{x, z, r}]|null,
 *        pocketless?: boolean }. Without ctx the geometric laws V4/V5 are skipped
 * (structural + graph + capacity + drain still run) — the node gate passes ctx.
 */
/** The V0 shape refusal text for a definition, or null when the published JSON schema
 * accepts it — pure, needs no table geometry (index.js asks it before ownership). */
export function shapeRefusal(def) {
  if (!def || typeof def !== 'object') return 'ball-return track refused [V0]: JSON schema: / type: expected object';
  const shape = validateAgainstSchema(TRACK_SCHEMA, def);
  return shape.length ? `ball-return track refused [V0]: JSON schema: ${schemaRefusal(shape)}` : null;
}

export function validateTrack(def, ctx = null) {
  if (!def || typeof def !== 'object') fail('V1', 'definition is not an object');
  // V0 — the PUBLISHED JSON schema, enforced first and in full (every required
  // field, every const, every enum / pattern / bound): the runtime refuses exactly
  // what docs/geometry/ball-return-track.schema.json refuses, before any law runs
  // and before any geometry is built (seal 5, review r3 P2)
  const shape = validateAgainstSchema(TRACK_SCHEMA, def);
  if (shape.length) fail('V0', `JSON schema: ${schemaRefusal(shape)}`);
  if (def.schema !== SCHEMA_ID) fail('V1', `schema must be ${SCHEMA_ID}`);
  const doc = def.doc;
  if (!doc || typeof doc.table_id !== 'string' || !STATUS.has(doc.status)) fail('V1', 'doc.table_id / doc.status');
  const status = doc.status;
  if (def.units?.length !== 'mm' || def.units?.angle !== 'deg') fail('V1', 'units must be mm / deg');
  if (def.datum_frame?.id !== 'TCS-TBL-01') fail('V1', 'datum_frame.id must be TCS-TBL-01');
  if (def.debug_visual === true && status !== 'TEST') fail('V1', 'debug_visual outside TEST status');

  // ball
  if (!isNum(def.ball?.reference_diameter_mm) || def.ball.reference_diameter_mm <= 0) fail('V1', 'ball.reference_diameter_mm');
  checkProvenance(def.ball, 'ball', status);
  const refD = def.ball.reference_diameter_mm;
  const refR = refD * MM / 2;

  // support (top-level + overrides)
  checkSupport(def.support, 'support', status, refD);

  // rolling resistance: a named repo class + matching u_r
  const rr = def.rolling_resistance;
  if (!rr || !(rr.class in PRESET_UR)) fail('V8', `rolling_resistance.class must be a ClothPreset id (${Object.keys(PRESET_UR).join('/')})`);
  if (!isNum(rr.u_r) || rr.u_r !== PRESET_UR[rr.class]) fail('V8', `rolling_resistance.u_r ${rr.u_r} does not match class ${rr.class} (${PRESET_UR[rr.class]})`);
  checkProvenance(rr, 'rolling_resistance', status);

  // runways
  const topology = def.topology ?? 'trunk-tray';
  const terminal = topology === 'terminal-chutes';
  if (!Array.isArray(def.runways) || def.runways.length < (terminal ? 1 : 2)) fail('V2', terminal ? 'runways: at least one chute' : 'runways: at least an entry and a tray');
  const ids = new Set();
  for (const rw of def.runways) {
    if (typeof rw.id !== 'string' || !/^[a-z0-9-]+$/.test(rw.id)) fail('V2', `runway id ${rw.id}`);
    if (ids.has(rw.id)) fail('V2', `duplicate runway id ${rw.id}`);
    ids.add(rw.id);
    if (!Array.isArray(rw.points_mm) || rw.points_mm.length < 2) fail('V2', `runway ${rw.id}: points_mm needs >= 2 vertices`);
    for (const [i, p] of rw.points_mm.entries()) {
      if (!Array.isArray(p) || p.length !== 3 || !p.every(isNum)) fail('V2', `runway ${rw.id} vertex ${i}`);
    }
    if (!('next' in rw) || (rw.next !== null && typeof rw.next !== 'string')) fail('V2', `runway ${rw.id}.next`);
    if (rw.support) checkSupport(rw.support, `runways.${rw.id}.support`, status, refD);
    checkProvenance(rw, `runways.${rw.id}`, status);
  }
  // V12 support orientation (review r9 P2-2): an edge with no horizontal extent has no
  // support normal. The ball centre sits at P(s) + h·n̂ with n̂ the UP normal in the
  // vertical plane containing the tangent — a VERTICAL tangent lies in every vertical
  // plane, so n̂ is undefined: upNormal's fallback returns ŷ, which is PARALLEL to the
  // tangent there, and the rolling axis n̂ × t̂ collapses to the zero vector (non-unit
  // roll quaternions downstream). Refused rather than given an orientation: any chosen
  // perpendicular would be an authored constant, and no measured system quotes one.
  //
  // The floor is a RATIO, |Δxz| / |Δ| < 1e-9 [DERIVED from upNormal's own fallback
  // threshold: it normalises while |ŷ − t_y·t̂| = |Δxz|/|Δ| > 1e-12 and returns the
  // parallel ŷ below that; 1e-9 is three decades of margin, measured in arm u5b]. It is
  // deliberately NOT a slope law: a steep edge whose horizontal extent is small but real
  // has an exact unit rolling axis (arm u6) and is admitted, and a SHORT LEVEL edge is
  // admitted whatever its length (arm u6b) — the quantity that degenerates is the
  // orientation, not the size. A REPEATED vertex (no extent at all) stays the graph
  // defect buildTrack names. The stop's own body beyond the wall face is EXEMPT, exactly
  // as it is from the drain law V7: it is never traversed, and an up-turn clamp lip that
  // stands straight up is a shipped shape (every XW101 chute carries one).
  for (const rw of def.runways) {
    const wallS = rw.stop && isNum(rw.stop.wall_s_mm) ? rw.stop.wall_s_mm : Infinity;
    let s = 0;
    for (let i = 0; i + 1 < rw.points_mm.length; i++) {
      const p0 = rw.points_mm[i]; const p1 = rw.points_mm[i + 1];
      const dxz = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
      const dl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const traversed = s < wallS - 1;                                        // beyond the stop face (1 mm grain): the stop's own body, exempt like V7
      if (traversed && dl > 0 && dxz < 1e-9 * dl) {
        fail('V12', `runway ${rw.id} edge [${i}]: horizontal extent ${dxz.toExponential(3)} mm over a ${dl.toFixed(3)} mm edge is below 1e-9 of its length — a vertical edge has no support normal and no rolling axis`);
      }
      s += dl;
    }
  }

  for (const h of def.hooks ?? []) {
    if (!ids.has(h.runway) || !isNum(h.s_mm)) fail('V1', `hook ${h.id}`);
    checkProvenance(h, `hooks.${h.id}`, status);
  }

  // rest surfaces: the tray (trunk-tray) or each chute's stop (terminal-chutes)
  const tray = terminal ? null : def.tray;
  if (!terminal) {
    if (!tray || !ids.has(tray.runway) || tray.end !== 'wall') fail('V6', 'tray.runway / tray.end');
    if (!Number.isInteger(tray.capacity_balls) || tray.capacity_balls < 1) fail('V6', 'tray.capacity_balls');
    if (!isNum(tray.length_mm) || tray.length_mm <= 0) fail('V6', 'tray.length_mm');
    if (tray.support) checkSupport(tray.support, 'tray.support', status, refD);
    checkProvenance(tray, 'tray', status);
    for (const rw of def.runways) if (rw.stop || rw.role === 'chute') fail('V2', `runway ${rw.id}: a chute / stop belongs to the terminal-chutes topology`);
  } else {
    if (def.tray) fail('V6', 'terminal-chutes carries no tray (each chute has its own stop)');
    for (const rw of def.runways) {
      if (rw.next === null) {
        if (rw.role !== 'chute' || !rw.stop) fail('V2', `runway ${rw.id}: a terminal runway must be a role-chute runway with a stop`);
        if (!isNum(rw.stop.wall_s_mm) || rw.stop.wall_s_mm <= 0) fail('V6', `chute ${rw.id}: stop.wall_s_mm`);
        if (!Number.isInteger(rw.stop.capacity_balls) || rw.stop.capacity_balls < 1) fail('V6', `chute ${rw.id}: stop.capacity_balls`);
        checkProvenance(rw.stop, `runways.${rw.id}.stop`, status);
      } else if (rw.role === 'chute' || rw.stop) fail('V2', `runway ${rw.id}: only a terminal runway is a chute with a stop`);
    }
  }

  // pockets (served + unserved cover 0..5 exactly once)
  if (!Array.isArray(def.pockets) || def.pockets.length < 1) fail('V4', 'pockets: at least one served pocket');
  const seen = new Map();
  for (const p of def.pockets) {
    if (!Number.isInteger(p.index) || p.index < 0 || p.index > 5) fail('V4', `pocket index ${p.index}`);
    if (!ids.has(p.entry_runway)) fail('V4', `pocket ${p.index}: entry runway ${p.entry_runway} missing`);
    if (seen.has(p.index)) fail('V4', `pocket ${p.index} listed twice`);
    if (!isNum(p.exit_below_y_mm)) fail('V5', `pocket ${p.index}: exit_below_y_mm (lowest solid of the pocket assembly) required`);
    if (!(p.exit_below_y_mm * MM <= SINK_SHIELD_Y)) fail('V5', `pocket ${p.index}: exit_below_y_mm must lie at or below the cull line ${SINK_SHIELD_Y / MM}`);
    checkProvenance(p, `pockets.${p.index}`, status);
    seen.set(p.index, 'served');
  }
  for (const u of def.unserved_pockets ?? []) {
    if (!Number.isInteger(u.index) || u.index < 0 || u.index > 5) fail('V4', `unserved index ${u.index}`);
    if (typeof u.reason !== 'string' || u.reason.length < 8) fail('V4', `unserved pocket ${u.index}: reason required`);
    if (seen.has(u.index)) fail('V4', `pocket ${u.index} both served and unserved`);
    seen.set(u.index, 'unserved');
  }
  // V17 (order 20 → order 21 item 2): the track's OWN HARDWARE is declared by mesh name in a COMPANION file, ./hardware/<trackId>.json
  // (hardware.js) — the published JSON schema (V0) has root additionalProperties:false and no `hardware` slot, so a track JSON carrying
  // the block is refused by V0 before this line (the snooker lane proved it with this validator, §R3c.33.1); the controller loads the
  // companion after this build and sets `track.hardwareMeshNames`. The definition itself stays byte-identical to its owner's export.
  const hardwareMeshNames = [];
  // …and the ENVIRONMENT meshes the track declares in the same companion (#737 r8 class C): the scene meshes V16 must not read
  // as table body. Empty = nothing declared; V16 then classes a mesh by its own open-shell property alone, and an enclosing
  // solid is a collision like any other.
  const environmentMeshNames = [];
  const nPockets = ctx?.pockets ? ctx.pockets.length : 6;
  if (nPockets === 0) fail('V4', 'a pocketless table cannot carry a return track');
  for (let i = 0; i < nPockets; i++) {
    if (!seen.has(i)) fail('V4', `pocket ${i} neither served nor unserved`);
  }

  // per-runway support override applies to the tray runway when given on tray
  const defBuilt = tray?.support
    ? { ...def, runways: def.runways.map((rw) => (rw.id === tray.runway && !rw.support ? { ...rw, support: tray.support } : rw)) }
    : def;
  let track;
  try {
    track = buildTrack(defBuilt);
  } catch (e) {
    fail('V2', e.message);
  }

  // V3 junction landings
  for (const rw of track.runways.values()) {
    if (rw.next === null) continue;
    const nx = track.runways.get(rw.next);
    const tol = supportDerived(nx.support, refR).tol;
    if (rw.landingMiss > tol) {
      fail('V3', `junction ${rw.id} misses ${rw.next} by ${(rw.landingMiss / MM).toFixed(1)} mm (tol ${(tol / MM).toFixed(1)})`);
    }
  }

  // V6 tray identity: capacity == floor(length / d_ref); length == arclength ± 1 mm
  // (1 mm [DERIVED] = one unit of the mm datum frame the vertices and the tray
  // length are declared in — a MFR/MODEL length read is quoted at mm resolution,
  // so the arclength of its own vertices may differ by at most one unit)
  if (!terminal) {
    const trayRw = track.tray.runway;
    if (Math.abs(trayRw.length - tray.length_mm * MM) > 1 * MM) {
      fail('V6', `tray.length_mm ${tray.length_mm} != runway arclength ${(trayRw.length / MM).toFixed(1)}`);
    }
    const cap = Math.floor(tray.length_mm / refD + 1e-9);
    if (cap !== tray.capacity_balls) fail('V6', `tray capacity identity: floor(${tray.length_mm} / ${refD}) = ${cap} != ${tray.capacity_balls}`);
  } else {
    // per chute: the stop face lies on the chute (≤ arclength + 1 mm), the body beyond it
    // is at most one ball diameter, capacity == floor(wall_s_mm / d_ref)
    for (const [id, rest] of track.rests) {
      const src = def.runways.find((r) => r.id === id);
      const arclen = rest.runway.length / MM;
      if (src.stop.wall_s_mm > arclen + 1) fail('V6', `chute ${id}: stop.wall_s_mm ${src.stop.wall_s_mm} beyond the chute arclength ${arclen.toFixed(1)}`);
      if (arclen - src.stop.wall_s_mm > refD + 1) fail('V6', `chute ${id}: ${(arclen - src.stop.wall_s_mm).toFixed(1)} mm of support line beyond the stop (a lip may be at most one ball diameter ${refD})`);
      const cap = Math.floor(src.stop.wall_s_mm / refD + 1e-9);
      if (cap !== src.stop.capacity_balls) fail('V6', `chute ${id} capacity identity: floor(${src.stop.wall_s_mm} / ${refD}) = ${cap} != ${src.stop.capacity_balls}`);
    }
    // every runway that lands on a chute must land at least one ball diameter before
    // its stop face — otherwise the first ball cannot fit and the chute is never used
    for (const [id, rw] of track.runways) {
      if (rw.next === null || !track.rests.has(rw.next)) continue;
      const wallS = track.rests.get(rw.next).wallSDeclared ?? track.rests.get(rw.next).wallS;
      if (!(rw.landingS + 2 * refR <= wallS + 1e-9)) fail('V6', `runway ${id} lands on ${rw.next} at s ${(rw.landingS / MM).toFixed(1)} mm, less than one ball diameter before its stop face ${(wallS / MM).toFixed(1)}`);
    }
  }

  // V11 reachability (seal 3, review r1 P2-6): every runway must lie on at least
  // one served pocket's route — an orphan runway (fed by no pocket, feeding
  // nothing a ball can reach) is a definition error, not dead geometry to skip
  const onRoutes = new Set();
  for (const [, route] of track.routes) for (const id of route.chain ?? []) onRoutes.add(id);
  for (const [id] of track.runways) {
    if (!onRoutes.has(id)) fail('V11', `runway ${id} is on no served pocket's route (orphan runway)`);
  }

  // V7 drain: every non-tray edge of EVERY runway drives the reference ball
  // forward (seal 3: iterated over track.runways, not only the served routes'
  // spans — review r1 P2-6)
  for (const [id, rw] of track.runways) {
    if (track.tray && id === track.tray.runway.id) continue;                 // the tray is level by design (the rest surface)
    const rest = track.rests.get(id);                                         // a chute drains up to its stop face
    for (const [k, e] of rw.edges.entries()) {
      if (rest && e.s0 >= rest.wallS - 1 * MM) continue;                      // beyond the stop (within the 1 mm grain the station is quoted at): the stop's own body, exempt
      const der = supportDerived(rw.support, refR);
      const drive = der.k * G * e.sinTh;
      const resist = der.k * G * resistCoeff(der, refR, track.u_r) * e.cosTh;
      // `drainsAt` IS this comparison, exported so buildRoute's stop-body exclusion reads the law from
      // one place (GH-770 review r3, class U): what this refuses where a ball travels, that declines to
      // walk inside the exempt zone. The two numbers below are kept for the message, not for a second
      // reading of the rule.
      if (!drainsAt(der, e, refR, track.u_r)) {
        fail('V7', `runway ${id} edge [${k}] does not drain (k·g·sinθ ${drive.toFixed(4)} <= k·g·(7/5)(r/ρ)·u_r·cosθ ${resist.toFixed(4)})`);
      }
    }
  }

  // V5 entry stations: inside the fall radius in plan, below the cull line
  if (ctx?.pockets) {
    for (const [idx, route] of track.routes) {
      const cup = ctx.pockets[idx];
      const fall = ctx.falls?.[idx] ?? cup;
      if (!cup) fail('V5', `served pocket ${idx} does not exist on this table`);
      // THE ENTRY IS THE REBUILT ROUTE'S (GH-770 review r7, class AE): the station the ball lands on,
      // D = route.total, read through `routeEntry` — the one reader `handoffFromSink` and `poseAt`
      // share. Before this round the four readings below took the runway's FIRST point and FIRST edge
      // normal, which is the entry only when the walk keeps the first run; the corner law may drop a
      // leading run too short for its own corner (`canA`), and the ride then starts higher up the
      // chute. On every shipped definition and every corpus case the two coincide bit for bit (arm
      // AE-4); on review's fixture they differ by 9.26 mm of ball top and the wrong one passed.
      const en = routeEntry(route, refR);
      const st = { rw: en.rw };
      const p0 = en.sup;                                                          // the support point under the entry centre
      const dPlan = Math.hypot(p0[0] - fall.x, p0[2] - fall.z);
      const dCup = Math.hypot(p0[0] - cup.x, p0[2] - cup.z);
      // the entry lies under the visible fall (cup-floor systems) OR inside the kernel
      // cup's footprint (ring / bag systems: the ball leaves the bag at the cup — the
      // Star's corner rings sit 0.8 mm outside the inboard visual fall's radius and
      // ~46 mm inside the cup's; schema 1.1). The fall leg still starts at the sink's
      // fall centre and glides to the entry during the free fall (research R2).
      if (dPlan > fall.r && dCup > cup.r) fail('V5', `entry ${idx} plan offset ${(dPlan / MM).toFixed(1)} mm outside the fall radius ${(fall.r / MM).toFixed(1)} and ${(dCup / MM).toFixed(1)} mm outside the cup radius ${(cup.r / MM).toFixed(1)}`);
      const yCentre = en.y;                                                       // the entry centre itself
      // the ball at the entry station must sit FULLY below the cull line: its top
      // (centre + r) under SINK_SHIELD_Y, i.e. its centre below the handoff centre
      // yHandoff = shield − r (seal 6: the 1.0 mirror subtracted the radius twice and
      // refused any entry less than a diameter under the shield — the Star's ring
      // station is 22 mm under it, physically fine: the free fall needs dy > 0 only)
      const yHandoff = SINK_SHIELD_Y - refR;
      if (!(yCentre < yHandoff)) {
        fail('V5', `entry ${idx} centre ${(yCentre / MM).toFixed(1)} mm is not below the handoff centre ${(yHandoff / MM).toFixed(1)} (ball top above the cull line ${SINK_SHIELD_Y / MM})`);
      }
      // the ball must rest FULLY below the pocket assembly's lowest solid — at the entry it lands on…
      if (!(yCentre + refR <= route.exitY + 1e-9)) {
        fail('V5', `entry ${idx}: ball top ${((yCentre + refR) / MM).toFixed(3)} mm is above the pocket exit ${(route.exitY / MM).toFixed(1)} (exit_below_y_mm) — read at the REBUILT route's entry (D = ${(route.total / MM).toFixed(3)} mm, ${en.dropped} leading run${en.dropped === 1 ? '' : 's'} dropped by the corner law); the runway's first point is not where the ball lands`);
      }
      // …and at EVERY station of the drawn extent (class AE, arm AE-3): a twist window at a heading
      // change stands the centre h vertically over its vertex, which behind a short steep leading run
      // is above the entry pose. `poseAt` draws every on-route station unconditionally (its exit cull
      // applies upstream of the entry), so the law that keeps the drawn ball out of the pocket
      // assembly has to read the whole route, in the same closed form the renderer draws.
      const topR = routeTop(route, refR);
      if (topR && !(topR.top <= route.exitY + 1e-9)) {
        fail('V5', `pocket ${idx}: the drawn ball's top reaches ${(topR.top / MM).toFixed(3)} mm at D ${(topR.D / MM).toFixed(3)} mm (on a ${topR.kind}) — above the pocket exit ${(route.exitY / MM).toFixed(1)} (exit_below_y_mm); the route's highest drawn station is not its entry (entry top ${((yCentre + refR) / MM).toFixed(3)} mm at D ${(route.total / MM).toFixed(3)})`);
      }
      // SINK CLEARANCE (order 16, cross-lane S-SHIELD-CLEAR): the sink animation (game.js) draws
      // a potted ball down to the cull line — its last pose has its centre at the handoff centre
      // (fall.x, shield − r, fall.z) — while a ball this module has queued at the entry station
      // sits at the entry centre. V5 only asks the entry to be BELOW the handoff (dy > 0: the
      // free fall exists); it does not ask the two centres to be a diameter apart, and on the
      // Star they are 37.3 mm apart against 52.5 (22 mm of drop under 30 mm of plan offset).
      // Computed, never refused here: the cull line is game.js's constant (−55, Predator-derived)
      // and the fix is a per-pocket cull at exit_below_y, which is not this module's byte to
      // move; the number is exposed so the seal can state it.
      const dxH = en.x - fall.x;                                                  // the entry centre, the same reader
      const dzH = en.z - fall.z;
      route.sinkClearanceEntry = Math.hypot(dxH, yCentre - yHandoff, dzH) - 2 * refR;
      // …and at the highest DRAWABLE seat (order 16 round 4, refuter B's item 4): a ball perched above
      // the entry behind a tail is drawn once its top is below exit_below_y, so the nearest drawn
      // centre to the sink's last pose may sit above the entry — walk the extrapolated first segment
      // up to that top, one grain at a time, to the overflow limit (2r above the entry).
      // Since round 11 class A this walk and the module's one reader of "where can a ball be drawn"
      // (track.js reachSpan — what `poseAt` draws by and V16 scans) describe the SAME band: the same
      // overflow limit (2r above the entry) under the same exit-line test. They differ only in how the
      // band's top edge is resolved — this walk steps EXPORT_GRAIN (0.1 mm) and breaks at the first grid
      // point above the line, where V16 bisects the crossing and scans it exactly — so the clearance
      // reported here is read at most one grain below the highest drawn centre. Left as it stands: that
      // residual is 0.1 mm of position, and re-cutting the walk moves the Star XW101's V13 ownership set
      // (p1/p4 −8.14 → +0.43 mm) and the cross-lane S-SHIELD-CLEAR numbers — the maintainer's call.
      let worst = route.sinkClearanceEntry;
      for (let up = EXPORT_GRAIN; up <= 2 * refR + 1e-12; up += EXPORT_GRAIN) {
        const q = stationAt(route, route.total + up, refR, {});
        if (!(q.y + refR <= route.exitY + 1e-9)) break;
        worst = Math.min(worst, Math.hypot(q.x - fall.x, q.y - yHandoff, q.z - fall.z) - 2 * refR);
      }
      route.sinkClearance = worst;
    }
  }
  // V13 FAIL-CLOSE on a negative sink clearance (order 17 item 1b, review round 11 P2-b): a recorded negative
  // is a ball drawn inside a ball on screen. Until the ownership hand-off lands (the drawn ball owned by this
  // module from the hand-off instant — game.js's side, order 18 item 0), a track whose nearest drawn seat
  // lies inside the sink's last pose is DISABLED for its table: it builds (the gates read its numbers) and
  // `track.disabled` names the row; the presentation installs nothing for it and reports once. Never
  // silently drawn.
  {
    const neg = [];
    for (const [pk, route] of track.routes) if (Number.isFinite(route.sinkClearance) && route.sinkClearance < 0) neg.push({ pocket: pk, mm: +(route.sinkClearance * 1e3).toFixed(2) });
    // order 18 item 0: the clearance class is closed by the OWNERSHIP hand-off (the module owns the drawn ball from the
    // instant the sink pose meets a ball it draws or holds); the row is RECORDED here and the host decides — index.js
    // disables the track only when the host lacks the ownership hook (a stale game.js)
    if (neg.length) track.ownershipRequired = { row: 'V13', pockets: neg, reason: `ball-return track disabled [V13]: sink clearance negative at pocket ${neg.map((x) => `${x.pocket} (${x.mm} mm)`).join(', ')} — the nearest drawn seat lies inside the sink's last drawn pose; disabled for this table until the ownership hand-off (order 18 item 0)` };
  }
  // V14 RUNWAY CLEARANCE, fail-closed (order 17 item 3b, review round 11 P2-d): two runways that are not linked
  // — neither lands on the other, and they do not land on one runway at one station — must keep their
  // ball-centre paths one diameter plus the support's landing tolerance apart everywhere. Linked pairs meet
  // by definition and their convergence zone is the yield and contact laws' domain; an unrelated pair closer
  // than a ball is a place where the module has no law (refuter 1's runway-proximity rows: a crossing at
  // 0.48 mm, a parallel run at 46 mm — both validated until now). Sampled on the routes' own centre paths at
  // 2 mm and bucketed by runway.
  {
    const samples = new Map();
    for (const [, rt] of track.routes) {
      const q = {};
      // each sample carries its distance TO THE LANDING along its own runway (the runway's length minus the local station):
      // the shared-landing exemption below is read against the junction solver's reach from that landing, not the whole runway
      for (let D = 0; D <= rt.total + 1e-12; D += 2e-3) { stationAt(rt, D, refR, q); const id = q.runwayId; if (!samples.has(id)) samples.set(id, []); const rw = track.runways.get(id); const toLanding = rw ? Math.max(0, rw.length - locate(rt, D).sLocal) : Infinity; samples.get(id).push([q.x, q.y, q.z, D, toLanding]); }
    }
    const ids = [...samples.keys()];
    const landing = (rw) => { const nx = track.runways.get(rw.next); return nx ? { on: nx.id, s: rw.landingS ?? null } : null; };
    // 'whole': the pair is one path (a runway and the one it lands on, or its grandparent) — never a clearance question;
    // 'landing': two feeders sharing a landing station — linked ONLY within the junction solver's reach of that landing
    // (#737 review r2, class B): kinematics.js's converging-pair scan reads a feeder ball against the other feeder's ball while
    // both stand within 4 · 2r of their landing along their own paths (`convergeAtJunction`: aboveF ≤ 3·2r, aboveR ≤ 3·2r + 2r);
    // upstream of that reach the two are unrelated paths — a crossing there is what V14 refuses at declaration (a mirrored
    // wire slide crossing 470 mm above its common landing built under the whole-length exemption and ran two pots 30 ms apart
    // 15.2 mm apart). The reach is the solver's own number, read here, not a constant of this rule.
    const REACH = 4 * 2 * refR;
    const linked = (a, b) => {
      const ra = track.runways.get(a), rb = track.runways.get(b);
      if (!ra || !rb) return 'whole';
      if (ra.next === b || rb.next === a) return 'whole';
      // a runway landing on X is linked to what X hands over to (a feeder landing at the trunk's end meets the tray
      // at that corner): the grandparent relation is a junction, not two unrelated paths
      const nxA = track.runways.get(ra.next), nxB = track.runways.get(rb.next);
      if ((nxA && nxA.next === b) || (nxB && nxB.next === a)) return 'whole';
      const la = landing(ra), lb = landing(rb);
      return (la && lb && la.on === lb.on && la.s !== null && lb.s !== null && Math.abs(la.s - lb.s) <= supportDerived(track.runways.get(la.on).support, refR).tol) ? 'landing' : false;
    };
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const link = linked(ids[i], ids[j]);
      if (link === 'whole') continue;
      const A = samples.get(ids[i]), B = samples.get(ids[j]);
      const need = 2 * refR + supportDerived(track.runways.get(ids[i]).support, refR).tol;
      let best = Infinity, at = null;
      for (const a of A) for (const b of B) { if (link === 'landing' && a[4] <= REACH && b[4] <= REACH) continue; const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d < best) { best = d; at = [a[3], b[3], a, b]; } }
      if (link === 'landing' && best < need - 1e-9) fail('V14', `runway clearance: ${ids[i]} and ${ids[j]} share a landing but cross UPSTREAM of the junction solver's reach (4·2r = ${(REACH * 1e3).toFixed(1)} mm above the landing): their centre paths come within ${(best * 1e3).toFixed(2)} mm (< 2r + tol ${(need * 1e3).toFixed(2)}) at (${(at[2][0] * 1e3).toFixed(0)}, ${(at[2][1] * 1e3).toFixed(0)}, ${(at[2][2] * 1e3).toFixed(0)}) mm — ${ids[i]} ${(at[2][4] * 1e3).toFixed(0)} mm and ${ids[j]} ${(at[3][4] * 1e3).toFixed(0)} mm above the landing (D ${(at[0] * 1e3).toFixed(1)} / ${(at[1] * 1e3).toFixed(1)}); the converging-pair scan does not reach there and two balls would meet unscanned`);
      if (best < need - 1e-9) fail('V14', `runway clearance: ${ids[i]} and ${ids[j]} are not linked and their centre paths come within ${(best * 1e3).toFixed(2)} mm (< 2r + tol ${(need * 1e3).toFixed(2)}) at D ${(at[0] * 1e3).toFixed(1)} / ${(at[1] * 1e3).toFixed(1)} mm — no law of this module covers two unrelated runways closer than a ball`);
    }
  }
  // V15 AT MOST TWO BRANCHES AT ONE POINT, fail-closed (order 17, §21.11 P2-c's proof row): the schema admits any
  // number of runways landing at one station of one runway (V3 checks each landing alone, V14 exempts pairs that
  // share a landing station). On a two-feeder point the trunk occupant carries one of the two routes and that
  // route's arrival joins it by the contact law, so at most ONE branch ever holds; two holders waiting for one
  // point — the release clause of item 2b — can only arise at a point with three or more branches, which no
  // shipped or test geometry has and no arm gates. Until order 18's three-branch fixture lands with the
  // contact tree, a third landing at one station is refused by name. Runs last, so a V15 refusal states that
  // the definition passed every other row.
  {
    const groups = [];
    for (const rw of track.runways.values()) {
      if (rw.next === null || !Number.isFinite(rw.landingS)) continue;
      const tol = supportDerived(track.runways.get(rw.next).support, refR).tol;
      let g = groups.find((x) => x.on === rw.next && Math.abs(x.s - rw.landingS) <= tol);
      if (!g) { g = { on: rw.next, s: rw.landingS, ids: [] }; groups.push(g); }
      g.ids.push(rw.id);
    }
    for (const g of groups) {
      // order 18 item 1: the fixture family of the contact tree is validated through this TEST seam (ctx.allowThreeBranch)
      // until the tree holds and V15 is lifted for every definition; the app never sets it
      if (g.ids.length > 2 && !(ctx && ctx.allowThreeBranch === true)) fail('V15', `junction ${g.on} at s ${(g.s / MM).toFixed(1)} mm: ${g.ids.length} runways land at one station (${g.ids.join(', ')}) — a point with more than two branches has no release law under an arm; refused until the three-branch fixture (order 18)`);
    }
  }
  track.def = def;
  track.hardwareMeshNames = hardwareMeshNames; // V17: filled by the controller from the companion; read by V16 (furniture.js) apart from the table body
  track.environmentMeshNames = environmentMeshNames; // #737 r8 class C: filled by the controller from the same companion; read by V16 as the declared environment
  // V10 arrival law: the runtime implements ONE contact law on the track —
  // perfectly inelastic (e = 0, research R5, a DESIGN read from the brief). A
  // definition may STATE it (fixture honesty) but may not name another value:
  // there is no second solver to honour it.
  if (def.arrival !== undefined) {
    if (!def.arrival || typeof def.arrival !== 'object') fail('V10', 'arrival must be an object');
    if (def.arrival.restitution !== 0) fail('V10', `arrival.restitution ${def.arrival.restitution}: the runtime implements e = 0 only`);
    checkProvenance(def.arrival, 'arrival', def.doc.status);
  }
  return track;
}

/** Convenience: the accel table of a built track at the reference ball (report). */
export function drainTable(track) {
  const rows = [];
  for (const [idx, route] of track.routes) {
    let D = route.total;
    while (D > 1e-9) {
      const a = accelAt(route, D - 1e-9, track.refR);
      const next = route.breaks.find((b) => b < D - 1e-12) ?? 0;
      rows.push({ route: idx, runway: a.runwayId, dFrom: D, dTo: next, drive: a.drive, resist: a.resist, a: a.a });
      D = next;
    }
  }
  return rows;
}
