// Copyright (c) Meta Platforms, Inc. and affiliates.
import { scenarioToJson } from './scenario.js';
import { RecordError, parseShotRecord } from './record.js';
import { Sampler } from './sampler.js';
/** Thrown when the kernel reports `{"error": ...}` for a scenario. */
export class EngineError extends Error {
    name = 'EngineError';
}
const isNode = typeof process !== 'undefined' && process.versions?.node !== undefined;
/**
 * Load + instantiate the kernel and return an Engine.
 * `source` is either the glue module path/URL (pool_wasm.js; its sibling
 * pool_wasm_bg.wasm is loaded automatically) or an already-imported glue
 * module namespace. `wasmBytes` optionally overrides the .wasm binary.
 */
export async function init(source, wasmBytes) {
    let glue;
    let bytes = wasmBytes;
    if (typeof source === 'string' || source instanceof URL) {
        if (isNode) {
            const { pathToFileURL } = await import('node:url');
            const { readFile } = await import('node:fs/promises');
            const { fileURLToPath } = await import('node:url');
            const url = source instanceof URL || /^[a-z]+:/i.test(String(source))
                ? new URL(String(source))
                : pathToFileURL(String(source));
            glue = (await import(url.href));
            if (bytes === undefined) {
                const wasmUrl = new URL(url.href.replace(/\.js$/, '_bg.wasm'));
                bytes = await readFile(fileURLToPath(wasmUrl));
            }
        }
        else {
            glue = (await import(String(source)));
        }
    }
    else {
        glue = source;
    }
    // The glue's init is idempotent (returns the cached instance when already
    // initialized), so double-init from app + SDK is safe.
    await glue.default(bytes !== undefined ? { module_or_path: bytes } : undefined);
    return new Engine(glue);
}
/** Typed simulation surface over an instantiated kernel module. */
export class Engine {
    kernel;
    constructor(kernel) {
        this.kernel = kernel;
    }
    /** Kernel version string (embedded in every ShotRecord). */
    version() {
        return this.kernel.kernel_version();
    }
    /** WPA 9-ft table geometry — EXACTLY what the kernel simulates.
     * `ballR` is the ball radius the cushion nose height derives from; omit
     * it for the kernel default. Pass the first ball's radius to match
     * pool-cli's `"table": "wpa_9ft"` scenario expansion (spec 005 SC-001). */
    table(ballR) {
        const out = this.kernel.table_geometry_json(ballR);
        if (out.startsWith('{"error"')) {
            throw new EngineError(JSON.parse(out).error);
        }
        return JSON.parse(out);
    }
    /** The shipped equipment catalog, read from the canonical wasm itself
     * (kernel `catalog_json()`; the static mirror in catalog.ts is pinned
     * against this by the SDK drift test). */
    catalog() {
        return JSON.parse(this.kernel.catalog_json());
    }
    /** Seeded 9-ball rack scenario (kernel M7: same seed → bit-identical rack).
     * The placeholder shot (straight 3 m/s break) is meant to be overwritten.
     *
     * `equipment` (optional, may be partial — missing axes fill with the
     * default ids) routes the rack through the kernel's equipment resolve:
     * table geometry at the ballset radius, cloth-applied ball params, the
     * `system.equipment` tag, and the resolved options (cushion-model slice +
     * cue). Without it the output is byte-identical to the pre-catalog
     * builder (options = the kernel's `realistic()` preset, no equipment
     * tag). Unknown ids throw EngineError. */
    nineBallRack(seed, equipment) {
        return this.rack('nine', seed, equipment);
    }
    /** Seeded 10-ball rack scenario (feature 026, GH-343 — WPA 6.2
     * triangle: 1 at the apex on the foot spot, 10 at the triangle centre;
     * see `nineBallRack` for the equipment semantics). */
    tenBallRack(seed, equipment) {
        return this.rack('ten', seed, equipment);
    }
    /** Seeded 15-ball rack scenario (see `nineBallRack`). */
    fifteenBallRack(seed, equipment) {
        return this.rack('fifteen', seed, equipment);
    }
    /** Seeded snooker frame scenario (feature 012, mirroring
     * `fifteenBallRack`): 22 balls — cue in the D, frozen-topology reds,
     * colours on their spots — on the kernel's default snooker pairing, or
     * on `equipment` (its table must be the 12-ft snooker geometry; the
     * kernel validates). */
    snookerRack(seed, equipment) {
        return this.rack('snooker', seed, equipment);
    }
    /** Carom starting-position scenario (feature 012; UMB Art 23). The
     * kernel layout is seed-independent (3 fixed balls) with the breaker on
     * the RIGHT start spot as the canonical default; `breakerRight: false`
     * mirrors the breaker to the left start spot — a cue-ball PLACEMENT
     * (the recorded break-spot decision 10 rides the share placements axis,
     * exactly like ball-in-hand), by NEGATING the kernel's own start-spot x
     * (the start spots are symmetric about the centre line, UMB Art 23.1 —
     * no re-derived geometry). `seed` only feeds the derived `shot.seed`. */
    caromStart(breakerRight, seed = 0, equipment) {
        const scenario = this.rack('carom', seed, equipment);
        if (!breakerRight) {
            const breaker = scenario.system.balls[0];
            if (breaker === undefined || breaker.id !== 0) {
                throw new EngineError('carom scenario is missing the breaker ball');
            }
            breaker.state.pos = {
                ...breaker.state.pos,
                x: -Math.abs(breaker.state.pos.x),
            };
        }
        return scenario;
    }
    rack(kind, seed, equipment) {
        if (!Number.isSafeInteger(seed) || seed < 0) {
            throw new EngineError(`rack seed must be a non-negative safe integer, got ${seed}`);
        }
        const json = this.kernel.new_rack_scenario(kind, BigInt(seed), equipment === undefined ? undefined : JSON.stringify(equipment));
        const parsed = JSON.parse(json);
        if (parsed.error !== undefined)
            throw new EngineError(parsed.error);
        return parsed;
    }
    /** Simulate a scenario, returning the raw ShotRecord JSON (the lossless
     * replay/transfer format). Throws EngineError on kernel rejection. */
    simulateJson(scenario) {
        const json = typeof scenario === 'string' ? scenario : scenarioToJson(scenario);
        const out = this.kernel.simulate_json(json);
        // The kernel's error payload is exactly {"error": "..."} (pool-wasm
        // error_json); a ShotRecord starts with {"kernel_version".
        if (out.startsWith('{"error"')) {
            const probe = JSON.parse(out);
            throw new EngineError(probe.error);
        }
        return out;
    }
    /** Simulate a scenario into a typed, shape-validated ShotRecord.
     * Throws EngineError (kernel rejection) or RecordError (shape drift). */
    simulate(scenario) {
        return parseShotRecord(this.simulateJson(scenario), this.version());
    }
    /** Parse + strictly validate a stored ShotRecord (replay load): format
     * version AND kernel version must match this engine (P-III policy). */
    loadRecord(json) {
        return parseShotRecord(json, this.version());
    }
    /** Build a Sampler over a record. Accepts the raw record JSON (preferred —
     * avoids a re-serialize, and is the only lossless path for foreign records
     * with u64 seeds above 2^53 − 1; see the ShotRecord precision caveat) or a
     * parsed ShotRecord. The record's versions are enforced by the kernel-side
     * parser. */
    sampler(record) {
        const json = typeof record === 'string' ? record : JSON.stringify(record);
        let inner;
        try {
            inner = this.kernel.WasmSampler.from_record_json(json);
        }
        catch (e) {
            throw new RecordError(typeof e === 'string' ? e : String(e));
        }
        const rec = typeof record === 'string'
            ? JSON.parse(record)
            : record;
        return new Sampler(inner, rec.initial.balls.map((b) => b.id));
    }
}
