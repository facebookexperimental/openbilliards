// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Thrown by SDK-side validation (mirrors kernel `SimError::InvalidInput`). */
export class ValidationError extends Error {
    name = 'ValidationError';
}
/**
 * Validate shot parameters with the SAME rules as the kernel
 * (resolve/strike.rs::validate_shot, FR-004 as amended by kernel-api.md
 * Amendments 020/021): finite; 0 < v0 ≤ 15 m/s; contact-offset miscue
 * limit a² + b² ≤ (miscue_contact_cap_r·(1 + tip_radius/R))²;
 * 0 ≤ theta < π/2. Additionally requires the seed to be a non-negative
 * safe integer (it crosses the boundary as u64).
 *
 * The miscue cap is CUE-DEPENDENT: pass the equipped cue's geometry (and
 * its per-cue contact cap, Amendment 021 — a catalog `CueParams` passes
 * directly) via `cue` for an exact mirror (kernel default nickel/
 * 57.15 mm/cap 0.5 R assumed otherwise). The kernel (`simulate`, which
 * knows the equipped cue and struck ball) is AUTHORITATIVE — with a
 * narrower-tip or lower-cap cue the kernel may reject a command this
 * default-geometry check accepted.
 * Throws ValidationError; returns the params for chaining.
 */
export function validateShot(shot, cue) {
    const { v0, phi, theta, a, b, seed } = shot;
    const finite = [v0, phi, theta, a, b].every(Number.isFinite);
    if (!finite)
        throw new ValidationError('shot parameters must be finite');
    if (!(v0 > 0 && v0 <= 15)) {
        throw new ValidationError(`v0 must be in (0, 15] m/s, got ${v0}`);
    }
    // Malformed geometry must fail CLOSED: a NaN/∞/≤0 radius (or an
    // out-of-domain cap) would make the bound non-finite/oversized and the
    // comparison below silently accept any offset, while the kernel rejects
    // such cue params outright (validate_input, Amendments 012/021) —
    // mirror that rejection here. Cap domain (0, 0.6]: the kernel's
    // chalked-tip friction ceiling (CueParams::MISCUE_CONTACT_CAP_MAX).
    const tipR = cue?.tip_radius ?? 0.0106;
    const ballR = cue?.ball_radius ?? 0.028575;
    if (!(Number.isFinite(tipR) && tipR > 0 && Number.isFinite(ballR) && ballR > 0)) {
        throw new ValidationError(`miscue geometry must be finite and > 0: tip_radius ${tipR}, ball_radius ${ballR}`);
    }
    const cap = cue?.miscue_contact_cap_r ?? 0.5;
    if (!(Number.isFinite(cap) && cap > 0 && cap <= 0.6)) {
        throw new ValidationError(`miscue_contact_cap_r ${cap} must be finite and in (0, 0.6]`);
    }
    // Same formulation as the kernel: compare against (cap·limit)² (never
    // through the reciprocal) so the commanded axis boundary
    // cap·(1 + tip_radius/R) is accepted exactly in f64 (at the default
    // cap 0.5 the bound is bit-identical to the pre-021 0.25·limit·limit).
    const limit = 1 + tipR / ballR;
    const capCmd = cap * limit;
    if (a * a + b * b > capCmd * capCmd) {
        throw new ValidationError(`tip offset a² + b² = ${a * a + b * b} exceeds the miscue limit at the `
            + `contact point: contact offset ${Math.hypot(a, b) / limit} R > ${cap} R `
            + `(this cue's contact cap; commanded cap cap·(1 + tip_radius/R) = `
            + `${capCmd} R; the kernel is authoritative for the equipped cue)`);
    }
    if (!(theta >= 0 && theta < Math.PI / 2)) {
        throw new ValidationError(`theta must be in [0, π/2), got ${theta}`);
    }
    if (!Number.isSafeInteger(seed) || seed < 0) {
        throw new ValidationError(`seed must be a non-negative safe integer, got ${seed}`);
    }
    return shot;
}
/** Fluent ShotParams builder; `build()` runs the kernel-identical validation. */
export class ShotBuilder {
    p = { v0: 1, phi: 0, theta: 0, a: 0, b: 0, seed: 0 };
    /** Cue tip speed [m/s], (0, 15]. */
    v0(v) { this.p.v0 = v; return this; }
    /** Azimuth [rad] (0 = +x, π/2 = +y toward the foot rail). */
    phi(rad) { this.p.phi = rad; return this; }
    /** Cue elevation [rad], [0, π/2). */
    theta(rad) { this.p.theta = rad; return this; }
    /** Tip-CENTER offsets in units of R (side a, vertical b); the contact
     * offset is validated by `build()` against the cue geometry passed there
     * (Amendments 020/021; kernel authoritative). */
    tip(a, b) { this.p.a = a; this.p.b = b; return this; }
    /** Shot-scoped randomness seed (non-negative safe integer). */
    seed(s) { this.p.seed = s; return this; }
    /** Validate (kernel rules) and return a plain ShotParams object.
     *
     * A bare ShotParams builder has NO equipment context of its own, so pass
     * the intended cue's `MiscueGeometry` (a catalog `CueParams` works
     * directly — Amendment 021: `masse_trick` holds contact offsets up to
     * 0.58 R that the default envelope rejects). Omitted, the kernel-default
     * cue geometry applies (nickel tip, cap 0.5 R) — deliberately the
     * STRICT default rather than the widest catalog cap, so default-cue
     * users keep the exact kernel mirror; the kernel re-validates whatever
     * the shot is ultimately simulated with (authoritative). */
    build(cue) {
        return validateShot({ ...this.p }, cue);
    }
}
/**
 * Validate cue parameters with the SAME rules as the kernel
 * (`sim/event_loop.rs::validate_input`, Amendments 012/013/021/024/025):
 * m/tip_radius/end_mass finite > 0; tip_cor finite in (0, 1];
 * miscue_contact_cap_r finite in (0, 0.6]; pinch_dwell_gain finite in
 * [0, 1]; pinch_jam finite in [0, 1]; pinch_end_mass 0 (the "use
 * end_mass" sentinel) or finite in [end_mass, 0.05]; pinch_press_scale
 * finite in [0, 1]; shaft_first_mode_hz finite in [8, 200];
 * shaft_damping_ratio finite in (0, 1) EXCLUSIVE (Amendment 025 — the
 * render-side structural fields validate like any cue param even though
 * the strike solve never reads them, per the no-NaN determinism law).
 * Fail-CLOSED (the 021 pattern): out-of-domain values
 * throw here exactly where the kernel would reject the scenario —
 * absent optional fields are the kernel serde defaults and always pass.
 * Only `undefined` defaults (issue #232 P2b): kernel serde fills MISSING
 * keys, never `null` — Rust rejects `null` for f64 — so an explicit
 * `null` (reachable from untyped JS callers; `??` used to swallow it and
 * the field then serialized as null) fails CLOSED like any non-number.
 * Throws ValidationError; returns the params for chaining.
 */
export function validateCueParams(cue) {
    // Default ONLY undefined; anything else (null included) flows into the
    // Number.isFinite domain checks below and fails closed.
    const opt = (v, dflt) => v === undefined ? dflt : v;
    const pos = (v) => Number.isFinite(v) && v > 0;
    if (!(pos(cue.m) && pos(cue.tip_radius) && pos(cue.end_mass))) {
        throw new ValidationError(`cue params must be finite and > 0: m ${cue.m}, tip_radius `
            + `${cue.tip_radius}, end_mass ${cue.end_mass}`);
    }
    const tipCor = opt(cue.tip_cor, 1.0);
    if (!(Number.isFinite(tipCor) && tipCor > 0 && tipCor <= 1)) {
        throw new ValidationError(`cue tip_cor ${tipCor} must be finite and in (0, 1]`);
    }
    const cap = opt(cue.miscue_contact_cap_r, 0.5);
    if (!(Number.isFinite(cap) && cap > 0 && cap <= 0.6)) {
        throw new ValidationError(`cue miscue_contact_cap_r ${cap} must be finite and in (0, 0.6]`);
    }
    const gain = opt(cue.pinch_dwell_gain, 0.0);
    if (!(Number.isFinite(gain) && gain >= 0 && gain <= 1)) {
        throw new ValidationError(`cue pinch_dwell_gain ${gain} must be finite and in [0, 1]`);
    }
    const jam = opt(cue.pinch_jam, 0.0);
    if (!(Number.isFinite(jam) && jam >= 0 && jam <= 1)) {
        throw new ValidationError(`cue pinch_jam ${jam} must be finite and in [0, 1]`);
    }
    const pem = opt(cue.pinch_end_mass, 0.0);
    if (!(pem === 0
        || (Number.isFinite(pem) && pem >= cue.end_mass && pem <= 0.05))) {
        throw new ValidationError(`cue pinch_end_mass ${pem} must be 0 (use end_mass) or finite in `
            + `[end_mass = ${cue.end_mass}, 0.05]`);
    }
    const press = opt(cue.pinch_press_scale, 1.0);
    if (!(Number.isFinite(press) && press >= 0 && press <= 1)) {
        throw new ValidationError(`cue pinch_press_scale ${press} must be finite and in [0, 1]`);
    }
    const hz = opt(cue.shaft_first_mode_hz, 27.0);
    if (!(Number.isFinite(hz) && hz >= 8 && hz <= 200)) {
        throw new ValidationError(`cue shaft_first_mode_hz ${hz} must be finite and in [8, 200]`);
    }
    const zeta = opt(cue.shaft_damping_ratio, 0.08);
    if (!(Number.isFinite(zeta) && zeta > 0 && zeta < 1)) {
        throw new ValidationError(`cue shaft_damping_ratio ${zeta} must be finite and in (0, 1)`);
    }
    return cue;
}
/** `SimOptions::default()`: Han 2005 cushion, flat friction hook — the
 * frozen v1 physics. */
export function defaultOptions() {
    return {
        max_events: 8192,
        t_max: 120,
        bb_friction: { a: 9.951e-3, b: 0.108, c: 1.088 },
        cushion_model: 'Han2005',
        cushion_friction: { k: 0, v_ref: 1, mu_min: 0, mu_max: 1 },
    };
}
/** `SimOptions::realistic()`: Stronge-compliant cushion at the calibrated
 * omega_ratio (1.8) + the reference-footage-calibrated friction curve. */
export function realisticOptions() {
    return {
        ...defaultOptions(),
        cushion_model: { StrongeCompliant: { omega_ratio: 1.8 } },
        cushion_friction: { k: -0.4, v_ref: 1, mu_min: 0.2, mu_max: 0.4 },
        bb_hop_min_height: 1e-5,
        bt_min_bounce_height: 1e-5,
    };
}
/** Stage-3 HSV joint-fit preset: `CushionModel::mathavan_2010_fitted()`
 * (χ 0.8, e_x 0.9) paired with `CushionFriction::hsv_fitted()` per the fit
 * provenance. NOTE the third leg of the joint fit lives on the TABLE:
 * `table.cushion_response.ee0 = 0.80` (`CushionResponse::EE0_HSV_FITTED`) —
 * see `ScenarioBuilder.cushionResponse`. */
export function mathavanFittedOptions() {
    return {
        ...defaultOptions(),
        cushion_model: {
            Mathavan2010: {
                max_steps: 1000,
                delta_p_scale: 0.1,
                tangential_compliance: { freq_ratio: 0.8, e_x: 0.9 },
            },
        },
        cushion_friction: { k: -0.4, v_ref: 1, mu_min: 0.16, mu_max: 0.28 },
        bb_hop_min_height: 1e-5,
        bt_min_bounce_height: 1e-5,
    };
}
/** Cushion-v5 grip-mode preset: `CushionModel::mathavan_2010_grip()`
 * (χ 1.2, e_x 0.9, grip_ratio 2.5, grip_capture 0.6 m/s) paired with
 * `CushionFriction::hsv_fitted()`. NOTE: pair the TABLE with
 * `CushionResponse::grip_fitted()` (e0 0.85, k_v 0.18, v_ref 1, e_min 0.5,
 * e_max 0.98, ee0 0.65) — see `ScenarioBuilder.cushionResponse`. */
export function gripFittedOptions() {
    return {
        ...defaultOptions(),
        cushion_model: {
            Mathavan2010: {
                max_steps: 1000,
                delta_p_scale: 0.1,
                tangential_compliance: {
                    freq_ratio: 1.2, e_x: 0.9, grip_ratio: 2.5, grip_capture: 0.6,
                },
            },
        },
        cushion_friction: { k: -0.4, v_ref: 1, mu_min: 0.16, mu_max: 0.28 },
        bb_hop_min_height: 1e-5,
        bt_min_bounce_height: 1e-5,
    };
}
/** `CushionResponse::grip_fitted()` table pairing for `gripFittedOptions`. */
export function gripFittedCushionResponse() {
    return { e0: 0.85, k_v: 0.18, v_ref: 1, e_min: 0.5, e_max: 0.98, ee0: 0.65 };
}
/** Kernel cloth preset by id. `'default'`/`'simonis_860_tournament'` is the
 * kernel default cloth (applying it is a bit-exact no-op on default balls). */
export function clothPreset(id) {
    const dflt = { u_s: 0.2, u_r: 0.01, u_sp_scale: (10 * 2) / 5 / 9 };
    switch (id) {
        case 'default':
        case 'simonis_860_tournament': return dflt;
        case 'simonis_760_fast': return { ...dflt, u_r: 0.008 };
        case 'worn_slow': return { ...dflt, u_s: 0.25, u_r: 0.016 };
        case 'snooker_napped':
            // 22 rad/s² sidespin decay (Mathavan 2010): scale = α·2/(5·G).
            return { u_s: 0.212, u_r: 0.0128, u_sp_scale: (22 * 2) / (5 * 9.81) };
    }
}
/** Apply a cloth preset to every ball of a system IN PLACE (mirrors
 * `SystemState::with_cloth`): replaces the friction trio (u_sp re-derived
 * from each ball's radius) and e_t only when the preset carries one. */
export function applyCloth(system, cloth) {
    const c = typeof cloth === 'string' ? clothPreset(cloth) : cloth;
    for (const b of system.balls) {
        b.params.u_s = c.u_s;
        b.params.u_r = c.u_r;
        b.params.u_sp = c.u_sp_scale * b.params.r;
        if (c.e_t !== undefined)
            b.params.e_t = c.e_t;
    }
}
