// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-guard.mjs — the lighting tools' ONE numeric-validity rule (GH-975; review r2 + r3): a read is compared
// with a tolerance only after it is proven a finite number — and positive where it is a luminance, a gain or a
// denominator — and a failed proof is a NAMED failure, never a pass. Every comparison with NaN is false, so
// `x > tol` passes a NaN; null coerces to 0 in arithmetic; an empty or zero-filled read divides 0 by 0. Pure, no I/O:
// shared by lib/lighting-judge.mjs, lib/lighting-matrix.mjs (bootCell and every env-tail settle), web/tools/
// e2e-lighting-matrix.mjs (env and live arms), web/tools/e2e-lighting.mjs, web/tools/e2e-userboot-firstframe.mjs,
// tools/render/lighting-match-solve.mjs (the MATCH_GAINS writer) and web/tools/test-lighting-matrix-judge.mjs (the
// committed-table check).

/** A usable number: a finite JS number (never null, undefined, NaN, ±Infinity or a numeric string). */
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));

/** null when `v` is usable, else the named reason. opts: positive (> 0), min (>= min), int (an integer). */
export function whyInvalid(name, v, { positive = false, min = null, int = false } = {}) {
  if (!isNum(v)) return `${name}=${show(v)}`;
  if (int && !Number.isInteger(v)) return `${name} ${v} is not an integer`;
  if (positive && !(v > 0)) return `${name} ${v} is not positive`;
  if (min !== null && !(v >= min)) return `${name} ${v} < ${min}`;
  return null;
}

/** A failed proof (thrown by must(); the solver refuses to step or write on it). */
export class InvalidRead extends Error {
  constructor(why) { super(`N0 invalid read: ${why}`); this.name = 'InvalidRead'; this.why = why; }
}

/** `v` when usable (whyInvalid opts), else throws InvalidRead naming it. */
export function must(name, v, opts) {
  const why = whyInvalid(name, v, opts);
  if (why) throw new InvalidRead(why);
  return v;
}

/** |v - want| <= tol, and false when any of them is unusable — the fail-closed form of `Math.abs(v - want) > tol`. */
export const within = (v, want, tol) => isNum(v) && isNum(want) && isNum(tol) && Math.abs(v - want) <= tol;

/** v <= max / v >= min, and false when either is unusable. Negating a bare comparison is NOT fail-closed: null
 * coerces to 0 in a relational comparison, so `!(null <= 0.02)` is false and a null read passes (GH-1040). */
export const atMost = (v, max) => isNum(v) && isNum(max) && v <= max;
export const atLeast = (v, min) => isNum(v) && isNum(min) && v >= min;

/** null when `a` is a non-empty list of usable numbers (opts.len entries; each > 0 with opts.positive). */
export function whyBadList(name, a, { len = null, positive = false } = {}) {
  if (!Array.isArray(a)) return `${name} ${JSON.stringify(a) ?? String(a)} is not a list`;
  if (!a.length) return `${name} [] is empty`;
  if (len !== null && a.length !== len) return `${name} has ${a.length} entries, not ${len}`;
  for (let i = 0; i < a.length; i++) {
    const why = whyInvalid(`${name}[${i}]`, a[i], { positive });
    if (why) return why;
  }
  return null;
}

/** null when the list `a` holds the reference list `b`'s values as a multiset, each within rel x max(1, |b_i|);
 * an empty or unusable list on either side is a named failure (two empty reads are not "equal"). */
export function whyListsDiffer(nameA, a, nameB, b, rel = 1e-4) {
  const bad = whyBadList(nameA, a) ?? whyBadList(nameB, b);
  if (bad) return bad;
  const sa = [...a].sort((x, y) => x - y), sb = [...b].sort((x, y) => x - y);
  if (sa.length !== sb.length || sa.some((v, i) => !within(v, sb[i], rel * Math.max(1, Math.abs(sb[i]))))) {
    return `${nameA} ${JSON.stringify(a)} != ${nameB} ${JSON.stringify(b)}`;
  }
  return null;
}

/** The largest relative change of the list `a` against the positive reference list `b` of the same length:
 * { value } or { why }. */
export function maxRelChange(nameA, a, nameB, b) {
  const why = whyBadList(nameB, b, { positive: true })
    ?? whyBadList(nameA, a, { len: Array.isArray(b) ? b.length : null });
  return why ? { why } : { value: Math.max(...a.map((v, i) => Math.abs(v / b[i] - 1))) };
}

/** null when an env-cube read (lib/lighting-matrix.mjs ENV_FACES_SRC: { faces, unwritten, texels }) can be compared,
 * else the reason: a texel the readback never wrote still holds the in-page sentinel (three.js logs and returns on an
 * unreadable target, and a zero-initialised buffer would read as a black cube), and every face mean must be finite
 * and positive (a black face is no baseline and divides by zero). */
export function whyBadEnvRead(name, r) {
  if (!r || !Array.isArray(r.faces) || !Array.isArray(r.unwritten)) return `${name} read ${JSON.stringify(r) ?? String(r)} is malformed`;
  const tex = whyInvalid(`${name} sampled texels per face`, r.texels, { positive: true, int: true });
  if (tex) return tex;
  if (r.unwritten.length !== 6) return `${name} has ${r.unwritten.length} face reads, not 6`;
  if (r.unwritten.some((n) => n !== 0)) {
    return `${name} readback left [${r.unwritten.join(', ')}] of ${r.texels} sampled texels per face unwritten`;
  }
  return whyBadList(`${name} face means`, r.faces, { len: 6, positive: true });
}

/** E1 / E2: the largest relative change of the env cube's face means from the read `before` to the read `after`:
 * { value } or { why } (either read refused by whyBadEnvRead). */
export function envDrift(nameBefore, before, nameAfter, after) {
  const why = whyBadEnvRead(nameBefore, before) ?? whyBadEnvRead(nameAfter, after);
  return why ? { why } : maxRelChange(`${nameAfter} face means`, after.faces, `${nameBefore} face means`, before.faces);
}

/** The env tail census (web/app/main.js `__rebakeEnv.tail()`: { left, boot, size, error }) as a settle verdict:
 * { settled: true, failed: false, why: null }, or not settled with the named reason. A contained failure is LATCHED —
 * `left` reads 0 because the tail was aborted, not drained — so it is never settled and waiting cannot help (failed:
 * true; review r4: left === 0 read as drained and E1/E2 compared the previous cube). Still owing bakes, a boot tail not
 * done, or no census at all are unsettled (failed: false). */
export function envTailState(t) {
  if (!t || typeof t !== 'object') return { settled: false, failed: false, why: `env tail census unavailable (${JSON.stringify(t) ?? String(t)})` };
  if (t.error != null) return { settled: false, failed: true, why: `env tail failed: ${t.error}` };
  if (t.boot !== 'done') return { settled: false, failed: false, why: `env boot tail ${t.boot}` };
  if (t.left !== 0) return { settled: false, failed: false, why: `env tail owes ${t.left} bake(s)` };
  return { settled: true, failed: false, why: null };
}

/** GH-1131: the snooker occlusion transport. web/scene/table.js traces the `aOccl` attribute after every snooker build
 * in frame-paced 8 ms slices, and a part whose trace is still pending renders with the GL default (0, 0): fully lamp-lit.
 * A capture taken while the trace lands photographs a per-boot mix of lit and occluded parts.
 * whyOcclDrain judges the bootCell drain record (tools/render/lib/lighting-page.mjs SNK_OCCL_FLUSH_SRC:
 * { seam, ms, err, ... }). It returns null once window.__snkOccl.flush() ran without throwing, else the named reason. The error
 * is tested first: bootCell records a rejected evaluation (a CDP error) as { seam: null, err }, which is not a missing seam. */
export function whyOcclDrain(rec) {
  if (!rec || typeof rec !== 'object') return `occlusion drain record unavailable (${JSON.stringify(rec) ?? String(rec)})`;
  if (rec.err != null) return rec.seam === true ? `occlusion drain threw: ${rec.err}` : `occlusion drain eval failed: ${rec.err}`;
  if (rec.seam !== true) return 'occlusion drain: the page publishes no window.__snkOccl seam';
  return null;
}

/** GH-1131: MEASURE_SRC's occlusion census as the camera rendered ({ seam, pending, readers, unbaked }). It returns
 * null when the drain had no job pending at the render, else the named reason. A missing census or an invalid pending
 * count fails by name too. `readers` / `unbaked` are recorded only: some rendered meshes read the (0, 0) default by
 * design, because table.js flags snkGold for the transport but bakes only its leg-head members (18 of 168 readers on
 * wpbsa_snooker_12ft, the same count on every boot). Their count is not a landing signal. */
export function whyOcclRender(o) {
  if (!o || typeof o !== 'object') return `occlusion census unavailable (${JSON.stringify(o) ?? String(o)})`;
  if (o.seam !== true) return 'occlusion census: no window.__snkOccl.pending seam';
  const why = whyInvalid('occlusion pending', o.pending, { min: 0, int: true });
  if (why) return why;
  if (o.pending !== 0) return `occlusion transport still landing when the camera rendered: ${o.pending} job(s) pending`;
  return null;
}

/** Read floors. Every saved matrix read since m1 has >= 293 bed patches per camera, >= 15 centre patches, >= 24
 * overhead corner patches and >= 44 overhead cushion-strip pairs; the floors sit far below a full read and far above
 * an empty or broken one (a failed mask readback reads 0 patches). */
export const MIN_BED_SAMPLES = 40;
export const MIN_CENTRE_SAMPLES = 8;
export const MIN_CORNER_SAMPLES = 12;
export const MIN_STRIP_PAIRS = 22;

/** null when a camera's bed read (lib/lighting-matrix.mjs MEASURE_SRC `bed`) carries a usable centre luminance:
 * enough bed and centre patches, and a finite positive median. */
export function whyBadCentre(tag, bed) {
  return whyInvalid(`${tag} bed samples`, bed?.n, { min: MIN_BED_SAMPLES })
    ?? whyInvalid(`${tag} centre samples`, bed?.nCentre, { min: MIN_CENTRE_SAMPLES })
    ?? whyInvalid(`${tag} centre`, bed?.centre, { positive: true });
}

// ---- the committed gains tables (scene/lightingvisuals.js MATCH_GAINS / BAKED_MATCH_GAINS)

const blockRe = (name) => new RegExp(`^(?:export )?const ${name} = Object\\.freeze\\(\\{\\n([\\s\\S]*?)\\n\\}\\);\\n`, 'm');
const ROW_RE = /^ {2}(\w+): Object\.freeze\(\{ ([^{}]*) \}\),$/;
const CELL_RE = /^(\w+): (\S+)$/;

/** Parse a committed gains table: `const NAME = Object.freeze({`, one `  table: Object.freeze({ fixture: n, ... }),`
 * row per line, `});`. Throws on a missing block, a line that is not a row, a cell that is not `fixture: literal` or a
 * duplicate key — a parse that skipped a row would let its values pass unchecked. Values are Number(literal),
 * unvalidated (whyBadGains judges them). */
export function parseGainsBlock(source, name = 'MATCH_GAINS') {
  const m = String(source).match(blockRe(name));
  if (!m) throw new Error(`${name} block not found`);
  const out = {};
  for (const line of m[1].split('\n')) {
    const row = line.match(ROW_RE);
    if (!row) throw new Error(`${name}: not a row: '${line}'`);
    if (Object.hasOwn(out, row[1])) throw new Error(`${name}: duplicate row ${row[1]}`);
    const cells = {};
    for (const kv of row[2].split(', ')) {
      const cell = kv.match(CELL_RE);
      if (!cell) throw new Error(`${name}.${row[1]}: not a cell: '${kv}'`);
      if (Object.hasOwn(cells, cell[1])) throw new Error(`${name}.${row[1]}: duplicate cell ${cell[1]}`);
      cells[cell[1]] = Number(cell[2]);
    }
    out[row[1]] = cells;
  }
  return out;
}

/** null when a parsed gains table has rows, every row has cells and every cell is finite and positive. */
export function whyBadGains(gains, name = 'MATCH_GAINS') {
  const rows = Object.entries(gains ?? {});
  if (!rows.length) return `${name} has no rows`;
  for (const [t, fx] of rows) {
    const cells = Object.entries(fx ?? {});
    if (!cells.length) return `${name}.${t} has no cells`;
    for (const [f, v] of cells) {
      const why = whyInvalid(`${name}.${t}.${f}`, v, { positive: true });
      if (why) return why;
    }
  }
  return null;
}

const FIXTURE_ORDER = ['canopy_panel', 'perimeter_ring', 'pendant_bar', 'snooker_luminaire', 'carom_luminaire', 'joy_lowrect', 'pdt_studio'];
/** The MATCH_GAINS block text for `gains` (the committed layout: one row per table, cells in catalog order). */
export function renderGainsBlock(gains) {
  const rows = Object.entries(gains).map(([k, fx]) => {
    const cells = Object.keys(fx).sort((a, b) => FIXTURE_ORDER.indexOf(a) - FIXTURE_ORDER.indexOf(b)).map((f) => `${f}: ${fx[f]}`);
    return `  ${k}: Object.freeze({ ${cells.join(', ')} }),`;
  });
  return `export const MATCH_GAINS = Object.freeze({\n${rows.join('\n')}\n});\n`;
}

const sameGains = (a, b) => {
  const keys = (o) => Object.keys(o).sort().join(',');
  return keys(a) === keys(b) && Object.keys(b).every((t) => keys(a[t]) === keys(b[t])
    && Object.keys(b[t]).every((f) => a[t][f] === b[t][f]));
};

/** The MATCH_GAINS writer's last gate: `source` with its MATCH_GAINS block replaced by `gains` — { text, block } only
 * when every gain is finite and positive AND the new text parses back to exactly `gains`; otherwise { why }. */
export function prepareGainsWrite(source, gains) {
  const bad = whyBadGains(gains);
  if (bad) return { why: bad };
  const re = blockRe('MATCH_GAINS');
  if (!re.test(source)) return { why: 'MATCH_GAINS block not found' };
  const block = renderGainsBlock(gains);
  const text = source.replace(re, () => block);
  let back;
  try { back = parseGainsBlock(text); } catch (e) { return { why: `the new block does not parse back: ${e.message}` }; }
  if (!sameGains(back, gains)) return { why: 'the new block does not parse back to the solved gains' };
  return { text, block };
}
