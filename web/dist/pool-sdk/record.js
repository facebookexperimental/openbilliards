// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Shot-record format version the SDK understands (record.rs FORMAT_VERSION). */
export const FORMAT_VERSION = 1;
/** Thrown by `parseShotRecord` on malformed JSON or version mismatch. */
export class RecordError extends Error {
    name = 'RecordError';
}
/** Total simulated duration [s] (time of the final event; 0 if empty). */
export function recordDuration(record) {
    const last = record.events[record.events.length - 1];
    return last ? last.t : 0;
}
/**
 * Parse a ShotRecord JSON string, enforcing versions — the kernel's STRICT
 * policy (record.rs `ShotRecord::from_json`):
 * - `format_version` must equal FORMAT_VERSION exactly;
 * - when `expectedKernelVersion` is given (pass `engine.version()`),
 *   `kernel_version` must match it exactly — cross-version replay is not
 *   bit-reproducible (constitution P-III).
 * Throws RecordError with a clear message otherwise.
 */
export function parseShotRecord(json, expectedKernelVersion) {
    let raw;
    try {
        raw = JSON.parse(json);
    }
    catch (e) {
        throw new RecordError(`shot record JSON: ${e.message}`);
    }
    if (typeof raw !== 'object' || raw === null) {
        throw new RecordError('shot record JSON: not an object');
    }
    const rec = raw;
    if (typeof rec.error === 'string') {
        throw new RecordError(`kernel error: ${rec.error}`);
    }
    if (rec.format_version !== FORMAT_VERSION) {
        throw new RecordError(`unsupported shot record format_version ${rec.format_version} ` +
            `(expected ${FORMAT_VERSION})`);
    }
    if (typeof rec.kernel_version !== 'string') {
        throw new RecordError('shot record missing kernel_version');
    }
    if (expectedKernelVersion !== undefined &&
        rec.kernel_version !== expectedKernelVersion) {
        throw new RecordError(`kernel_version mismatch: record produced by "${rec.kernel_version}", ` +
            `this kernel is "${expectedKernelVersion}" (strict replay policy — ` +
            `cross-version replay is not bit-reproducible)`);
    }
    return validateRecordShape(rec);
}
// --- structural validation (the shape-drift guard) ---------------------------
const MOTION = new Set(['Stationary', 'Spinning', 'Sliding', 'Rolling', 'Airborne', 'Pocketed']);
function bad(path, why) {
    throw new RecordError(`shot record shape drift at ${path}: ${why}`);
}
function num(v, path) {
    if (typeof v !== 'number' || !Number.isFinite(v))
        bad(path, `expected finite number, got ${JSON.stringify(v)}`);
    return v;
}
/** Non-negative safe integer (shot.ts's seed rule). u64 seeds above
 * 2^53 − 1 already lost precision in JSON.parse, so re-serializing the
 * parsed record would silently carry a DIFFERENT seed — reject instead. */
function safeInt(v, path) {
    const n = num(v, path);
    if (!Number.isSafeInteger(n) || n < 0) {
        bad(path, `expected non-negative safe integer (u64 values above ` +
            `Number.MAX_SAFE_INTEGER are not representable in JS), got ${JSON.stringify(v)}`);
    }
    return n;
}
function obj(v, path) {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
        bad(path, 'expected object');
    return v;
}
function arr(v, path) {
    if (!Array.isArray(v))
        bad(path, 'expected array');
    return v;
}
function vec3(v, path) {
    const o = obj(v, path);
    num(o.x, `${path}.x`);
    num(o.y, `${path}.y`);
    num(o.z, `${path}.z`);
}
function motion(v, path) {
    if (typeof v !== 'string' || !MOTION.has(v))
        bad(path, `unknown MotionState ${JSON.stringify(v)}`);
}
function ballState(v, path) {
    const s = obj(v, path);
    vec3(s.pos, `${path}.pos`);
    vec3(s.vel, `${path}.vel`);
    vec3(s.avel, `${path}.avel`);
    motion(s.motion, `${path}.motion`);
    if (s.pinch !== undefined) {
        const p = obj(s.pinch, `${path}.pinch`);
        num(p.k, `${path}.pinch.k`);
        num(p.t_rem, `${path}.pinch.t_rem`);
    }
}
function eventKind(v, path) {
    if (v === 'Rest')
        return;
    const k = obj(v, path);
    const keys = Object.keys(k);
    const tag = keys[0];
    if (keys.length !== 1 || tag === undefined)
        bad(path, 'expected one-key tagged variant');
    const body = obj(k[tag], `${path}.${tag}`);
    const fields = {
        Strike: ['ball'], BallBall: ['b1', 'b2'], BallLinearCushion: ['ball', 'seg'],
        BallCircularCushion: ['ball', 'arc'], BallPocket: ['ball', 'pocket'],
        BallTable: ['ball'], BallOffTable: ['ball'], Transition: ['ball'],
    };
    const want = fields[tag];
    if (!want)
        bad(path, `unknown EventKind variant ${JSON.stringify(tag)}`);
    for (const f of want)
        num(body[f], `${path}.${tag}.${f}`);
    if (tag === 'Transition') {
        motion(body.from, `${path}.Transition.from`);
        motion(body.to, `${path}.Transition.to`);
    }
}
/** Walk a parsed record and verify EVERY field against the mirrored serde
 * shapes; throws RecordError naming the first drifted path. */
export function validateRecordShape(rec) {
    const initial = obj(rec.initial, 'initial');
    const balls = arr(initial.balls, 'initial.balls');
    balls.forEach((b, i) => {
        const ball = obj(b, `initial.balls[${i}]`);
        num(ball.id, `initial.balls[${i}].id`);
        const p = obj(ball.params, `initial.balls[${i}].params`);
        for (const f of ['m', 'r', 'u_s', 'u_r', 'u_sp', 'e_b', 'e_c', 'f_c']) {
            num(p[f], `initial.balls[${i}].params.${f}`);
        }
        if (p.e_t !== undefined)
            num(p.e_t, `initial.balls[${i}].params.e_t`);
        ballState(ball.state, `initial.balls[${i}].state`);
    });
    const table = obj(initial.table, 'initial.table');
    num(table.width, 'initial.table.width');
    num(table.length, 'initial.table.length');
    arr(table.linear, 'initial.table.linear').forEach((s, i) => {
        const seg = obj(s, `initial.table.linear[${i}]`);
        vec3(seg.p1, `initial.table.linear[${i}].p1`);
        vec3(seg.p2, `initial.table.linear[${i}].p2`);
        num(seg.height, `initial.table.linear[${i}].height`);
    });
    arr(table.circular, 'initial.table.circular').forEach((a, i) => {
        const c = obj(a, `initial.table.circular[${i}]`);
        vec3(c.center, `initial.table.circular[${i}].center`);
        num(c.radius, `initial.table.circular[${i}].radius`);
        num(c.height, `initial.table.circular[${i}].height`);
    });
    arr(table.pockets, 'initial.table.pockets').forEach((p, i) => {
        const pk = obj(p, `initial.table.pockets[${i}]`);
        vec3(pk.center, `initial.table.pockets[${i}].center`);
        num(pk.radius, `initial.table.pockets[${i}].radius`);
    });
    const cr = obj(table.cushion_response, 'initial.table.cushion_response');
    for (const f of ['e0', 'k_v', 'v_ref', 'e_min', 'e_max']) {
        num(cr[f], `initial.table.cushion_response.${f}`);
    }
    if (cr.ee0 !== undefined)
        num(cr.ee0, 'initial.table.cushion_response.ee0');
    const shot = obj(rec.shot, 'shot');
    for (const f of ['v0', 'phi', 'theta', 'a', 'b'])
        num(shot[f], `shot.${f}`);
    safeInt(shot.seed, 'shot.seed');
    validateOptionsShape(rec.options, 'options');
    arr(rec.events, 'events').forEach((e, i) => {
        const ev = obj(e, `events[${i}]`);
        num(ev.t, `events[${i}].t`);
        eventKind(ev.kind, `events[${i}].kind`);
        arr(ev.post, `events[${i}].post`).forEach((entry, j) => {
            const pair = arr(entry, `events[${i}].post[${j}]`);
            if (pair.length !== 2)
                bad(`events[${i}].post[${j}]`, 'expected [id, state] pair');
            num(pair[0], `events[${i}].post[${j}][0]`);
            ballState(pair[1], `events[${i}].post[${j}][1]`);
        });
    });
    if (rec.stats !== undefined) {
        const st = obj(rec.stats, 'stats');
        num(st.cushion_impacts_beyond_validity, 'stats.cushion_impacts_beyond_validity');
    }
    return rec;
}
/** Validate a SimOptions shape (shared with scenario parsing). */
export function validateOptionsShape(v, path) {
    const o = obj(v, path);
    num(o.max_events, `${path}.max_events`);
    num(o.t_max, `${path}.t_max`);
    const bb = obj(o.bb_friction, `${path}.bb_friction`);
    num(bb.a, `${path}.bb_friction.a`);
    num(bb.b, `${path}.bb_friction.b`);
    num(bb.c, `${path}.bb_friction.c`);
    const cf = obj(o.cushion_friction, `${path}.cushion_friction`);
    for (const f of ['k', 'v_ref', 'mu_min', 'mu_max'])
        num(cf[f], `${path}.cushion_friction.${f}`);
    const spm = o.strike_pinch_model;
    if (spm !== undefined && spm !== 'CoriolisSlip' && spm !== 'LegacyFrontload') {
        bad(`${path}.strike_pinch_model`, `unknown StrikePinchModel ${JSON.stringify(spm)}`);
    }
    const cm = o.cushion_model;
    if (cm === 'Han2005')
        return;
    const tagged = obj(cm, `${path}.cushion_model`);
    if ('StrongeCompliant' in tagged) {
        num(obj(tagged.StrongeCompliant, `${path}.cushion_model.StrongeCompliant`).omega_ratio, `${path}.cushion_model.StrongeCompliant.omega_ratio`);
    }
    else if ('Mathavan2010' in tagged) {
        const m = obj(tagged.Mathavan2010, `${path}.cushion_model.Mathavan2010`);
        num(m.max_steps, `${path}.cushion_model.Mathavan2010.max_steps`);
        num(m.delta_p_scale, `${path}.cushion_model.Mathavan2010.delta_p_scale`);
        if (m.tangential_compliance !== undefined) {
            const tc = obj(m.tangential_compliance, `${path}.cushion_model.Mathavan2010.tangential_compliance`);
            num(tc.freq_ratio, `${path}...tangential_compliance.freq_ratio`);
            num(tc.e_x, `${path}...tangential_compliance.e_x`);
            if (tc.grip_ratio !== undefined)
                num(tc.grip_ratio, `${path}...grip_ratio`);
            if (tc.grip_capture !== undefined)
                num(tc.grip_capture, `${path}...grip_capture`);
        }
    }
    else {
        bad(`${path}.cushion_model`, `unknown CushionModel ${JSON.stringify(cm)}`);
    }
}
