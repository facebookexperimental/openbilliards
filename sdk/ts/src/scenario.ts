// Copyright (c) Meta Platforms, Inc. and affiliates.

// scenario.ts — Scenario type + ScenarioBuilder with placement validation
// mirroring the kernel's input rules (sim/event_loop.rs::validate_input):
// unique ids, cue ball present and stationary, the z/vz-vs-Airborne rules
// (on-bed z ≡ R with vz ≡ 0; Airborne needs z > R or vz ≠ 0 and never below
// the bed), motion/velocity consistency (Stationary/Spinning/Sliding/
// Rolling), pinch-press constraints, loose in-bounds (|x| ≤ w/2 + r,
// |y| ≤ l/2 + r), and pairwise gap ≥ r_i + r_j − Eps::KISS.
// The SDK never reimplements physics — the kernel re-validates everything.

import type {
  Ball, BallParams, BallState, CushionResponse, EquipmentIds, SystemState,
  Table,
} from './types.js';
import { defaultBallParams } from './types.js';
import { isDefaultEquipment, validateEquipmentIds } from './catalog.js';
import type { ShotParams, SimOptions } from './shot.js';
import { ValidationError, validateCueParams, validateShot } from './shot.js';

/** Kernel Eps::KISS [m] (consts.rs): minimum admissible gap shortfall
 * between balls. */
export const EPS_KISS = 1e-6;
/** Kernel Eps::SPACE [m] (consts.rs): positional tolerance (z-vs-R rules). */
export const EPS_SPACE = 1e-9;
/** Kernel Eps::VEL [m/s] (consts.rs): below this a velocity is "at rest". */
export const EPS_VEL = 1e-9;
/** Kernel Eps::SPIN [rad/s] (consts.rs): below this a spin is "at rest". */
export const EPS_SPIN = 1e-9;

/** A full simulation scenario — the JSON payload of `simulate_json` and
 * `pool-cli simulate` (`{system, shot, options?}`). */
export interface Scenario {
  system: SystemState;
  shot: ShotParams;
  options?: SimOptions;
}

/** Serialize a scenario for the wasm/CLI boundary. */
export function scenarioToJson(scenario: Scenario): string {
  return JSON.stringify(scenario);
}

/** Options for `ScenarioBuilder.ball` explicit placement. */
export interface BallPlacement {
  x: number;
  y: number;
  /** Per-ball parameter override (defaults to `defaultBallParams()`). */
  params?: BallParams;
}

/**
 * Builds `{system, shot, options}` scenarios against a kernel table.
 * Get the table from `engine.table()` (the kernel's own WPA 9-ft geometry)
 * or reuse one from a rack scenario; `build()` validates placements with the
 * kernel's own rules and the shot with `validateShot` against the
 * scenario's OWN cue — `options.cue` + the cue ball's radius, exactly the
 * inputs the kernel's validate_shot reads (Amendments 020/021).
 */
export class ScenarioBuilder {
  private table: Table;
  private balls: Ball[] = [];
  private shotParams: ShotParams | undefined;
  private opts: SimOptions | undefined;
  private equip: EquipmentIds | undefined;

  constructor(table: Table) {
    this.table = table;
  }

  /** Place a stationary on-bed ball at kernel (x, y); z is set to R. */
  ball(id: number, placement: BallPlacement): this {
    const params = placement.params ?? defaultBallParams();
    const state: BallState = {
      pos: { x: placement.x, y: placement.y, z: params.r },
      vel: { x: 0, y: 0, z: 0 },
      avel: { x: 0, y: 0, z: 0 },
      motion: 'Stationary',
    };
    this.balls.push({ id, params, state });
    return this;
  }

  /** Add a fully specified ball (advanced states, e.g. Airborne replays). */
  rawBall(ball: Ball): this {
    this.balls.push(ball);
    return this;
  }

  /** Set the shot (validated in build()). */
  shot(shot: ShotParams): this {
    this.shotParams = shot;
    return this;
  }

  /** Set simulation options. When never called, `build()` OMITS the
   * `options` key entirely so the kernel's own serde default (v1 physics)
   * applies — the SDK never bakes a possibly-drifted mirror of it into the
   * scenario document. */
  options(options: SimOptions): this {
    this.opts = options;
    return this;
  }

  /** Override the table's cushion response (e.g. the mathavanFitted ee0 0.80
   * or `gripFittedCushionResponse()` pairing — see shot.ts presets). */
  cushionResponse(response: CushionResponse): this {
    this.table = { ...this.table, cushion_response: response };
    return this;
  }

  /** Tag the scenario with its equipment composition (catalog ids —
   * provenance metadata; the kernel simulates `balls`/`table`/`options`,
   * never the ids). Ids are validated against the registry mirror here
   * (EquipmentError on unknown ids). The kernel serde-skips the default
   * composition, so `build()` omits it too, keeping byte parity: pass the
   * equipment the table/params/options were resolved from (e.g. copy
   * `system.equipment` of an `Engine.nineBallRack(seed, equipment)`
   * template when rebuilding mid-game scenarios from it). */
  equipment(ids: EquipmentIds): this {
    this.equip = validateEquipmentIds({ ...ids });
    return this;
  }

  /** Validate (kernel input rules) and return the Scenario. */
  build(): Scenario {
    if (this.shotParams === undefined) {
      throw new ValidationError('scenario has no shot (call .shot())');
    }
    // Amendment 021 (issue #168): the strike envelope is CUE-dependent, so
    // mirror EXACTLY what the kernel's validate_shot will read from this
    // scenario — `options.cue` (the kernel serde-defaults a missing cue to
    // its default CueParams, which the validateShot defaults reproduce)
    // and the cue ball's own radius. The `equipment` ids are deliberately
    // NOT consulted: they are provenance metadata (the kernel simulates
    // balls/table/options, never the ids — see `equipment()` above), so a
    // scenario tagged masse_trick WITHOUT the resolved cue in its options
    // is rejected here precisely because the kernel would reject it too.
    const cue = this.opts?.cue;
    // Amendment 024 (issue #212): the cue-parameter domains (incl. the
    // four dwell fields) are kernel-validated in `simulate` — mirror that
    // rejection here, fail-closed (a missing cue is the kernel default
    // and always passes).
    if (cue !== undefined) validateCueParams(cue);
    // Amendment 026 (GH-383): the struck ball is `options.cue_ball`
    // (serde default 0 = the classic cue) — mirror the kernel's read.
    // ONLY an absent property defaults (review r6: `null` coerced to 0
    // here while build() preserved the null — the kernel then rejected
    // the u8; validate the domain the wire actually carries).
    if (this.opts !== undefined && 'cue_ball' in this.opts
      && this.opts.cue_ball !== undefined // JSON drops undefined = absent
      && (!Number.isInteger(this.opts.cue_ball)
        || (this.opts.cue_ball as number) < 0
        || (this.opts.cue_ball as number) > 255)) {
      throw new ValidationError(
        `options.cue_ball must be an integer in [0, 255] (u8), got `
        + `${String(this.opts.cue_ball)}`);
    }
    const cueBallId = this.opts?.cue_ball ?? 0;
    const cueBall = this.balls.find((b) => b.id === cueBallId);
    validateShot(this.shotParams, {
      ...(cue !== undefined && { tip_radius: cue.tip_radius }),
      ...(cue?.miscue_contact_cap_r !== undefined
        && { miscue_contact_cap_r: cue.miscue_contact_cap_r }),
      ...(cueBall !== undefined && { ball_radius: cueBall.params.r }),
    });
    validatePlacements(this.balls, this.table, cueBallId);
    const scenario: Scenario = {
      system: {
        balls: this.balls.map((b) => ({ ...b })),
        table: this.table,
        // kernel serde parity: the default composition is omitted
        ...(this.equip !== undefined && !isDefaultEquipment(this.equip)
          && { equipment: this.equip }),
      },
      shot: { ...this.shotParams },
      ...(this.opts !== undefined && { options: this.opts }),
    };
    return scenario;
  }
}

/**
 * Placement validation mirroring sim/event_loop.rs::validate_input (the
 * kernel re-checks; this mirrors its rejections so SDK users fail fast with
 * the same semantics): ids/cue/finiteness, pinch-press constraints, the
 * z/vz-vs-Airborne rules, bounds, motion/velocity consistency, and pairwise
 * overlap. Throws ValidationError.
 */
export function validatePlacements(
  balls: Ball[], table: Table, cueBallId = 0,
): void {
  if (balls.length === 0) throw new ValidationError('no balls');
  const ids = balls.map((b) => b.id);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('duplicate ball ids');
  }
  if (ids.some((id) => !Number.isInteger(id) || id < 0 || id > 255)) {
    throw new ValidationError('ball ids must be integers in [0, 255] (u8)');
  }
  // Amendment 026 (GH-383): `cueBallId` = `options.cue_ball` (default 0);
  // the error text stays byte-identical on the default path.
  const cue = balls.find((b) => b.id === cueBallId);
  if (!cue) throw new ValidationError(`missing cue ball (id ${cueBallId})`);
  if (cue.state.motion !== 'Stationary') {
    throw new ValidationError('cue ball must be Stationary at strike (v1)');
  }
  for (const b of balls) {
    const p = b.params;
    const finiteParams = [p.m, p.r, p.u_s, p.u_r, p.u_sp, p.e_b, p.e_c, p.f_c]
      .every(Number.isFinite);
    if (!finiteParams || p.m <= 0 || p.r <= 0) {
      throw new ValidationError(`ball ${b.id}: invalid params`);
    }
    const s = b.state;
    const finiteState = [
      s.pos.x, s.pos.y, s.pos.z, s.vel.x, s.vel.y, s.vel.z,
      s.avel.x, s.avel.y, s.avel.z,
    ].every(Number.isFinite);
    if (!finiteState) throw new ValidationError(`ball ${b.id}: non-finite state`);
    // Pinch press: k ≥ 1, t_rem ≥ 0, and only ever on a Sliding ball.
    if (s.pinch !== undefined) {
      if (!(Number.isFinite(s.pinch.k) && Number.isFinite(s.pinch.t_rem) &&
            s.pinch.k >= 1 && s.pinch.t_rem >= 0)) {
        throw new ValidationError(
          `ball ${b.id}: invalid pinch press (k ${s.pinch.k}, t_rem ${s.pinch.t_rem})`);
      }
      if (s.motion !== 'Sliding') {
        throw new ValidationError(
          `ball ${b.id}: pinch press requires motion 'Sliding', got '${s.motion}'`);
      }
    }
    if (s.motion === 'Pocketed') continue; // exempt from geometric checks
    // Amendment 002 z/vz rules: a ball off the bed (z > R) or with vertical
    // velocity MUST be Airborne; an Airborne ball must not be below the bed;
    // non-airborne balls sit on the bed (z ≡ R) with vz ≡ 0.
    const offBed = s.pos.z - p.r > EPS_SPACE || Math.abs(s.vel.z) > EPS_VEL;
    if (s.motion === 'Airborne') {
      if (s.pos.z < p.r - EPS_SPACE) {
        throw new ValidationError(`ball ${b.id}: Airborne but below the bed (z < R)`);
      }
      if (!offBed) {
        throw new ValidationError(`ball ${b.id}: Airborne requires z > R or vz != 0`);
      }
    } else {
      if (offBed) {
        throw new ValidationError(
          `ball ${b.id}: z > R or vz != 0 requires motion 'Airborne'`);
      }
      if (Math.abs(s.pos.z - p.r) > EPS_SPACE) {
        throw new ValidationError(`ball ${b.id}: on-bed ball must have z == R`);
      }
    }
    // In bounds (kernel's loose rule: within a ball radius of the nose lines).
    if (Math.abs(s.pos.x) > table.width / 2 + p.r ||
        Math.abs(s.pos.y) > table.length / 2 + p.r) {
      throw new ValidationError(`ball ${b.id}: outside playing surface`);
    }
    // Not resting inside a pocket capture disc (GH-595): an on-bed centre at
    // or inside a point-of-no-return disc pots immediately regardless of
    // direction — a ball cannot rest over the hole. Mirrors the kernel guard
    // in sim/event_loop.rs::validate_input (the v16 chinese8 corner disc
    // reaches into the rectangular legal-placement envelope). Boundary is
    // INCLUSIVE (ball_pocket_time pockets at gap <= 0). RESTING states only
    // (Stationary/Spinning): a translating ball inside a disc is a supported
    // advanced state that ball_pocket_time pockets immediately (review r2 P2);
    // airborne balls are ceiling-gated (GH-594).
    if (s.motion === 'Stationary' || s.motion === 'Spinning') {
      for (const pk of table.pockets) {
        const dx = s.pos.x - pk.center.x;
        const dy = s.pos.y - pk.center.y;
        if (dx * dx + dy * dy <= pk.radius * pk.radius) {
          throw new ValidationError(
            `ball ${b.id}: placed inside a pocket capture disc`);
        }
      }
    }
    // Motion/velocity consistency (data-model.md; Airborne was handled by
    // the z/vz rules above, Pocketed skipped earlier).
    const v = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
    const w = s.avel;
    if (s.motion === 'Stationary' &&
        (v > EPS_VEL || Math.hypot(w.x, w.y, w.z) > EPS_SPIN)) {
      throw new ValidationError(`ball ${b.id}: Stationary but moving`);
    }
    if (s.motion === 'Spinning' &&
        (v > EPS_VEL || Math.abs(w.z) <= EPS_SPIN ||
         Math.abs(w.x) > EPS_SPIN || Math.abs(w.y) > EPS_SPIN)) {
      throw new ValidationError(
        `ball ${b.id}: Spinning requires pure z-spin and no translation`);
    }
    if ((s.motion === 'Sliding' || s.motion === 'Rolling') && v <= EPS_VEL) {
      throw new ValidationError(`ball ${b.id}: ${s.motion} but not translating`);
    }
  }
  // Pairwise overlap (non-pocketed): gap ≥ r_i + r_j − Eps::KISS.
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i]!, b = balls[j]!;
      if (a.state.motion === 'Pocketed' || b.state.motion === 'Pocketed') continue;
      const min = a.params.r + b.params.r - EPS_KISS;
      const dx = a.state.pos.x - b.state.pos.x;
      const dy = a.state.pos.y - b.state.pos.y;
      const dz = a.state.pos.z - b.state.pos.z;
      if (dx * dx + dy * dy + dz * dz < min * min) {
        throw new ValidationError(`balls ${a.id}/${b.id} overlap`);
      }
    }
  }
}
