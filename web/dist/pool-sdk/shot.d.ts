// Copyright (c) Meta Platforms, Inc. and affiliates.

import type { BallBallFriction, CushionFriction } from './types.js';
/** Cue strike parameters (shot.rs `ShotParams`). Angles in radians. */
export interface ShotParams {
    /** Cue tip speed at impact [m/s]; valid range (0, 15]. */
    v0: number;
    /** Azimuth [rad] (0 = +x, π/2 = +y toward the foot rail). */
    phi: number;
    /** Cue elevation [rad], valid range [0, π/2). */
    theta: number;
    /** Side tip offset in units of R (positive = right english). */
    a: number;
    /** Vertical tip offset in units of R (positive = follow). */
    b: number;
    /** Seed for all shot-scoped randomness (u64; use a non-negative safe integer). */
    seed: number;
}
/** Thrown by SDK-side validation (mirrors kernel `SimError::InvalidInput`). */
export declare class ValidationError extends Error {
    name: string;
}
/** Cue/ball geometry for the cue-aware miscue check (kernel-api.md
 * Amendments 020/021): the kernel scales the commanded tip-center offset
 * by 1/(1 + tip_radius/R) to the ball-surface CONTACT point and the
 * PER-CUE miscue cap (`miscue_contact_cap_r`, units of R — default 0.5,
 * the standard-tip limit; 0.58 on the `masse_trick` catalog entry) binds
 * that contact offset. Field names mirror the kernel
 * (`CueParams.tip_radius` [m]; `ball_radius` = struck ball R [m];
 * `CueParams.miscue_contact_cap_r`), so a catalog `CueParams` can be
 * passed directly. Defaults = the kernel defaults (nickel tip 10.6 mm on
 * the 57.15 mm ball, cap 0.5 R → commanded radial cap ≈ 0.6855 R). */
export interface MiscueGeometry {
    tip_radius?: number;
    ball_radius?: number;
    miscue_contact_cap_r?: number;
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
export declare function validateShot(shot: ShotParams, cue?: MiscueGeometry): ShotParams;
/** Fluent ShotParams builder; `build()` runs the kernel-identical validation. */
export declare class ShotBuilder {
    private p;
    /** Cue tip speed [m/s], (0, 15]. */
    v0(v: number): this;
    /** Azimuth [rad] (0 = +x, π/2 = +y toward the foot rail). */
    phi(rad: number): this;
    /** Cue elevation [rad], [0, π/2). */
    theta(rad: number): this;
    /** Tip-CENTER offsets in units of R (side a, vertical b); the contact
     * offset is validated by `build()` against the cue geometry passed there
     * (Amendments 020/021; kernel authoritative). */
    tip(a: number, b: number): this;
    /** Shot-scoped randomness seed (non-negative safe integer). */
    seed(s: number): this;
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
    build(cue?: MiscueGeometry): ShotParams;
}
/** Nose tangential bristle + e_x energy return (cushion_mathavan.rs
 * `TangentialCompliance`). `grip_ratio` (default 1) and `grip_capture`
 * (default 0) are serde-skipped at default — omit them for byte parity. */
export interface TangentialCompliance {
    freq_ratio: number;
    e_x: number;
    grip_ratio?: number;
    grip_capture?: number;
}
/** Ball–cushion impact model selector (shot.rs `CushionModel`): externally
 * tagged serde enum — the unit variant is the bare string `"Han2005"`. */
export type CushionModel = 'Han2005' | {
    StrongeCompliant: {
        omega_ratio: number;
    };
} | {
    Mathavan2010: {
        max_steps: number;
        delta_p_scale: number;
        /** serde-skipped when absent (cushion v4 additivity). */
        tangential_compliance?: TangentialCompliance;
    };
};
/** Cue stick parameters for the strike model (params.rs `CueParams`;
 * TP A-30/31 endmass squirt). */
export interface CueParams {
    m: number;
    tip_radius: number;
    end_mass: number;
    /** Tip–ball restitution e (kernel-api.md Amendment 013, feature 009 K1):
     * strike numerator `(1 + tip_cor)·v0`. Serde-skipped at its 1.0 default
     * (= the frozen perfectly-elastic v1 strike, bit-identical to `2·v0`);
     * leather ~0.73, phenolic ~0.85 on the v3 catalog cue entries. */
    tip_cor?: number;
    /** Miscue contact-offset cap [units of R] (kernel-api.md Amendment 021,
     * issue #168): the largest ball-surface contact offset this cue's tip
     * holds without miscuing — `validateShot` enforces
     * a² + b² ≤ (cap·(1 + tip_radius/R))² on the commanded offset.
     * Serde-skipped at its 0.5 default (the Amendment-020 constant —
     * bit-identical envelope for every pre-021 cue); 0.58 on the v10
     * `masse_trick` catalog entry (Venom W2 measured 0.567–0.579 R);
     * kernel-validated domain (0, 0.6]. */
    miscue_contact_cap_r?: number;
    /** Finite-dwell delivery gain of the pinned tip contact (kernel-api.md
     * Amendment 024, issue #212): the CoriolisSlip pinned solve's closure
     * becomes |T| = m·v_ax·(1 + g_eff), with g_eff energy-clamped per strike
     * (total ball KE ≤ cue KE, closed form). Read only at λ(θ) > 0 (cue
     * elevation > 60°). Serde-skipped at its 0.0 default (= the
     * instantaneous pre-024 strike, bit-identical); kernel-validated domain
     * [0, 1]. Carried by the v12 `masse_trick_dwell` catalog entry (issue
     * #232: the dwell calibration moved off `masse_trick`, which reverted
     * to its dwell-free v10 bytes). */
    pinch_dwell_gain?: number;
    /** Fraction of the Amendment-023 Poisson slate return suppressed at the
     * pinned strike (Amendment 024): 1 = the narrated soft-tip jam (grounded
     * massé — no flight channel), 0 (default, serde-skipped) = the #166
     * rebound bit-for-bit. Per-cue: phenolic/jump tips keep their flight.
     * Kernel-validated domain [0, 1]. */
    pinch_jam?: number;
    /** Transverse endmass [kg] used inside the PINNED solve only (Amendment
     * 024): shaft-wave recruitment over the dwell window. The free strike's
     * TP A-31 squirt keeps `end_mass` — planar behavior untouched.
     * Serde-skipped at its 0.0 default (sentinel = "use `end_mass`");
     * kernel-validated domain 0 or [end_mass, 0.05]. */
    pinch_end_mass?: number;
    /** Multiplier on the feature-005 press EXCESS under the dwell strike
     * (Amendment 024): k' = 1 + (k − 1)·scale — the dwell consumes stored
     * cloth compression the press would otherwise re-exert. Serde-skipped at
     * its 1.0 default (= the unscaled feature-005 press, bit-identical);
     * kernel-validated domain [0, 1]. */
    pinch_press_scale?: number;
    /** Whole-cue first transverse bending mode [Hz] (kernel-api.md Amendment
     * 025, issue #277, catalog v13). Structural shaft property: consumed by
     * the render-side cue visual dynamics engine (design 277) today;
     * reserved for future shaft mechanics (#167/#223 family; design-277
     * plan B). The strike solve does NOT read it — any legal value leaves
     * physics output bit-identical. Serde-skipped at its 27.0 default
     * (DBKcues free ring-down 27–29 Hz); kernel-validated domain
     * [8, 200] Hz. */
    shaft_first_mode_hz?: number;
    /** Dimensionless damping ratio ζ of the first bending mode (Amendment
     * 025 + its 2026-07-31 revision note, issue #277). Structural
     * render-side property the strike solve never reads. Serde-skipped at
     * its 0.08 default — the IN-STROKE (gripped) value measured by footage
     * tracking of HSV A.25 (peak-ratio ζ ≈ 0.08–0.12, ring-down < 2 mm by
     * 100–150 ms; docs/research/whip-calibration-277.md — replaces the
     * original tuned-by-eye 0.02, which lingered ~4x longer than footage);
     * kernel-validated domain (0, 1) EXCLUSIVE. */
    shaft_damping_ratio?: number;
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
export declare function validateCueParams(cue: CueParams): CueParams;
/** Grounded pinch-strike impulse decomposition (shot.rs
 * `StrikePinchModel`; kernel-api.md Amendment 022, issue #164): unit-variant
 * serde enum — bare strings on the wire. `'CoriolisSlip'` (the kernel
 * default) resolves λ(θ) > 0 strikes as the simultaneous three-contact
 * impulse problem (squirt-side massé launch, curve develops over the
 * slide); `'LegacyFrontload'` replays every pre-#164 pinch stream
 * byte-identically (the documented legacy-replay path). Only strikes above
 * 60° cue elevation read it. */
export type StrikePinchModel = 'CoriolisSlip' | 'LegacyFrontload';
/** Simulation options (shot.rs `SimOptions`). */
export interface SimOptions {
    max_events: number;
    t_max: number;
    bb_friction: BallBallFriction;
    cushion_model: CushionModel;
    cushion_friction: CushionFriction;
    /** Ball–ball micro-hop Zeno threshold [m] (ballball-detail wave;
     * serde-skipped at its 0.005 default = v1 planar ball–ball outputs).
     * The realism presets set 1e-5 so the TP A-14 vertical friction
     * component (Dr. Dave ball-hop: follow lifts the cue ball, draw lifts
     * the object ball, apex 0.02–1 mm) survives. */
    bb_hop_min_height?: number;
    /** Ball–table bounce Zeno threshold [m] (Amendment 011, stun
     * micro-dynamics gap; serde-skipped at its 0.005 default = pooltool v1
     * cascade). The realism presets set 1e-5 so the stun/draw press-down
     * rebound off the slate (apex 20–200 µm) survives as a real
     * micro-bounce instead of freezing the cue ball at z = R. */
    bt_min_bounce_height?: number;
    /** Cue stick parameters (equipment-catalog wave, kernel-api Amendment
     * 012; serde-skipped at the default cue — omit for byte parity). The
     * catalog cue entries land here via the kernel's equipment resolve. */
    cue?: CueParams;
    /** Pinch-strike impulse decomposition (kernel-api Amendment 022, issue
     * #164; serde-skipped at its `'CoriolisSlip'` default — omit for byte
     * parity). Set `'LegacyFrontload'` to replay a pre-#164 pinch record
     * byte-identically. */
    strike_pinch_model?: StrikePinchModel;
    /** Struck (cue) ball id (kernel-api Amendment 026, GH-383;
     * serde-skipped at its 0 default = the classic hardcoded cue ball —
     * omit for byte parity). Non-zero ids serve the per-seat cue-ball
     * disciplines (UMB carom Art 22/23: the second seat strikes ball 1);
     * the kernel validates the id exists and is Stationary, and the
     * emitted `Strike` event carries it. */
    cue_ball?: number;
}
/** `SimOptions::default()`: Han 2005 cushion, flat friction hook — the
 * frozen v1 physics. */
export declare function defaultOptions(): SimOptions;
/** `SimOptions::realistic()`: Stronge-compliant cushion at the calibrated
 * omega_ratio (1.8) + the reference-footage-calibrated friction curve. */
export declare function realisticOptions(): SimOptions;
/** Stage-3 HSV joint-fit preset: `CushionModel::mathavan_2010_fitted()`
 * (χ 0.8, e_x 0.9) paired with `CushionFriction::hsv_fitted()` per the fit
 * provenance. NOTE the third leg of the joint fit lives on the TABLE:
 * `table.cushion_response.ee0 = 0.80` (`CushionResponse::EE0_HSV_FITTED`) —
 * see `ScenarioBuilder.cushionResponse`. */
export declare function mathavanFittedOptions(): SimOptions;
/** Cushion-v5 grip-mode preset: `CushionModel::mathavan_2010_grip()`
 * (χ 1.2, e_x 0.9, grip_ratio 2.5, grip_capture 0.6 m/s) paired with
 * `CushionFriction::hsv_fitted()`. NOTE: pair the TABLE with
 * `CushionResponse::grip_fitted()` (e0 0.85, k_v 0.18, v_ref 1, e_min 0.5,
 * e_max 0.98, ee0 0.65) — see `ScenarioBuilder.cushionResponse`. */
export declare function gripFittedOptions(): SimOptions;
/** `CushionResponse::grip_fitted()` table pairing for `gripFittedOptions`. */
export declare function gripFittedCushionResponse(): import('./types.js').CushionResponse;
/** Stable cloth preset ids (kernel `ClothPreset::by_name`). */
export type ClothPresetId = 'default' | 'simonis_860_tournament' | 'simonis_760_fast' | 'worn_slow' | 'snooker_napped';
/** Ball–cloth friction bundle (params.rs `ClothPreset`; provenance in
 * docs/research/cloth-calibration.md). `u_sp = u_sp_scale · R`. */
export interface ClothPreset {
    u_s: number;
    u_r: number;
    u_sp_scale: number;
    e_t?: number;
}
/** Kernel cloth preset by id. `'default'`/`'simonis_860_tournament'` is the
 * kernel default cloth (applying it is a bit-exact no-op on default balls). */
export declare function clothPreset(id: ClothPresetId): ClothPreset;
/** Apply a cloth preset to every ball of a system IN PLACE (mirrors
 * `SystemState::with_cloth`): replaces the friction trio (u_sp re-derived
 * from each ball's radius) and e_t only when the preset carries one. */
export declare function applyCloth(system: import('./types.js').SystemState, cloth: ClothPreset | ClothPresetId): void;
