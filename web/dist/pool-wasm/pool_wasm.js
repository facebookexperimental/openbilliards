// Copyright (c) Meta Platforms, Inc. and affiliates.

/* @ts-self-types="./pool_wasm.d.ts" */

/**
 * Per-frame sampler over a parsed [`ShotRecord`] (contract §M10).
 *
 * JS usage (one reusable `Float64Array`, zero JS-side allocation per frame):
 * ```js
 * const sampler = WasmSampler.from_record_json(recordJson);
 * const n = sampler.sample_into(0, new Float64Array(0)); // query ball count
 * const buf = new Float64Array(8 * n);
 * // per frame:
 * sampler.sample_into(t, buf); // buf[8*i .. 8*i+8] = ball i's sample
 * ```
 */
export class WasmSampler {
    static __wrap(ptr) {
        const obj = Object.create(WasmSampler.prototype);
        obj.__wbg_ptr = ptr;
        WasmSamplerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSamplerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmsampler_free(ptr, 0);
    }
    /**
     * Parse a [`ShotRecord`] JSON (as produced by [`simulate_json`]).
     * Throws a JS string on malformed JSON or format-version mismatch.
     * @param {string} record_json
     * @returns {WasmSampler}
     */
    static from_record_json(record_json) {
        const ptr0 = passStringToWasm0(record_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsampler_from_record_json(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmSampler.__wrap(ret[0]);
    }
    /**
     * Sample every ball at time `t` \[s\] into `out`, returning the TOTAL
     * ball count (also the count for buffer sizing — call once with an empty
     * array to query it).
     *
     * Layout: ball `i` (in `record.initial` order, stable across calls)
     * occupies `out[8*i .. 8*i+8]` as `[x, y, z, qw, qx, qy, qz,
     * motion_code]` with motion_code per [`motion_code`]. Sampling semantics
     * are M8's: `t` before the first event ⇒ initial states, after the last
     * ⇒ final states. Only complete 8-slot ball entries that fit in `out`
     * are written; a short buffer is never a panic.
     * @param {number} t
     * @param {Float64Array} out
     * @returns {number}
     */
    sample_into(t, out) {
        var ptr0 = passArrayF64ToWasm0(out, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmsampler_sample_into(this.__wbg_ptr, t, ptr0, len0, out);
        return ret >>> 0;
    }
}
if (Symbol.dispose) WasmSampler.prototype[Symbol.dispose] = WasmSampler.prototype.free;

/**
 * Catalog v20 (#789): the kernel's digest alias rows as JSON
 * (`[{"axis", "digest", "neutral_id"}, ...]`, digests only, no plaintext
 * retired id), from [`pool_core::catalog::catalog_alias_digests_json`].
 * @returns {string}
 */
export function catalog_alias_digests_json() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.catalog_alias_digests_json();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * The shipped equipment catalog as JSON ([`EquipmentCatalog`] serde shape:
 * `{version, tables, cloths, ballsets, cues, cushion_models}`, every entry
 * with `id` + `display_name` + `calibration` provenance) so pickers and the
 * SDK registry mirrors read the registry from the canonical wasm itself.
 * @returns {string}
 */
export function catalog_json() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.catalog_json();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Kernel version string embedded in shot records
 * ([`pool_core::KERNEL_VERSION`]).
 * @returns {string}
 */
export function kernel_version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.kernel_version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Seeded rack scenario for the browser app (issue #11 P3): full scenario
 * JSON (`{system, shot, options}`) ready for [`simulate_json`] after the app
 * overwrites the placeholder `shot` (straight 3 m/s break azimuth) with the
 * player's aim. `kind` is `"nine"`, `"ten"` (GH-343 — the WPA 6.2 10-ball
 * triangle, same frozen-contact policy), `"fifteen"`, `"snooker"` or `"carom"`
 * (feature 012 — contracts/equipment-additions.md §3; the layouts expand to
 * explicit ball arrays pre-serde, additive-safe); anything else returns
 * `{"error": ...}`. Same seed → bit-identical rack (M7 contract).
 *
 * `equipment_json` (equipment-catalog wave, issue #15; omit/`undefined` for
 * the legacy behavior) is an [`EquipmentSpec`] JSON — partial objects fill
 * with the default ids. When present, the scenario is composed by
 * [`EquipmentCatalog::resolve`]: rack built on the resolved table at the
 * ballset radius with cloth-applied ball params, `system.equipment` tagged,
 * and `options` = the resolved options (cushion-model slice + cue). Unknown
 * ids return `{"error": ...}`. Without a spec the output is BYTE-IDENTICAL
 * to the pre-catalog builder for `"nine"`/`"fifteen"`: options are
 * [`SimOptions::realistic`] (calibrated Stronge cushion) and no equipment
 * tag is emitted.
 *
 * Feature 012 kinds (both are full resolved-equipment compositions —
 * their layouts are discipline-table coordinates):
 * - `"snooker"`: 22 balls (cue 0 in the D, frozen-topology reds 1–15,
 *   colours 16–21 on their spots) on the default snooker pairing
 *   (`EquipmentSpec::snooker_default`) or the given equipment, whose table
 *   must be the 12-ft snooker geometry;
 * - `"carom"`: 3 balls (UMB Art 23 — breaker 0 on the RIGHT start spot as
 *   the canonical seed-pure default; the recorded break-spot decision
 *   moves it via the placements axis) on `EquipmentSpec::carom_default`
 *   or the given equipment, whose table must be the pocketless 2.84 m
 *   geometry. The layout is seed-independent; the derived `shot.seed`
 *   still carries the seed.
 * @param {string} kind
 * @param {bigint} seed
 * @param {string | null} [equipment_json]
 * @returns {string}
 */
export function new_rack_scenario(kind, seed, equipment_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(equipment_json) ? 0 : passStringToWasm0(equipment_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.new_rack_scenario(ptr0, len0, seed, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Simulate a scenario (JSON in, JSON out).
 *
 * Input: `{ "system": SystemState, "shot": ShotParams, "options": SimOptions? }`.
 * Output: [`ShotRecord`] JSON on success, `{"error": "..."}` on any failure
 * (malformed JSON, validation error, event-budget exhaustion). Never throws.
 * @param {string} scenario_json
 * @returns {string}
 */
export function simulate_json(scenario_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(scenario_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.simulate_json(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * WPA 9-ft table geometry as JSON (the kernel's own `Table` serialization:
 * `width`, `length`, `linear` cushion segments, `circular` jaw arcs,
 * `pockets`, `cushion_response`) so the renderer draws EXACTLY the geometry
 * the kernel simulates.
 *
 * `ball_r` is the ball radius the cushion nose height derives from
 * (0.635 · 2r); omit it (`undefined`) for the kernel default radius. This
 * mirrors pool-cli's `"table": "wpa_9ft"` scenario convenience, which
 * expands with the FIRST ball's radius — pass that radius here so every
 * surface instantiates the same physics (spec 005 FR-002/SC-001). Invalid
 * radii (non-finite or ≤ 0) return `{"error": ...}`.
 * @param {number | null} [ball_r]
 * @returns {string}
 */
export function table_geometry_json(ball_r) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.table_geometry_json(!isLikeNone(ball_r), isLikeNone(ball_r) ? 0 : ball_r);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Table geometry for ANY catalog table id (feature 012,
 * contracts/equipment-additions.md §3): the kernel's own `Table`
 * serialization for the id's geometry family, built for balls of radius
 * `ball_r` (omit for the kernel default radius — pass the ACTIVE ballset
 * radius so renderer and physics instantiate the same nose heights).
 *
 * The existing zero-arg [`table_geometry_json`] stays byte-frozen on
 * wpa_9ft (`table_geometry_json_for("wpa_generic_9ft", r)` produces the
 * identical bytes — pinned test). A retired v8 Measured id builds its
 * neutral twin's geometry (the catalog v20 digest alias rows, as in
 * equipment resolve). Unknown ids and invalid radii return
 * `{"error": ...}`.
 * @param {string} table_id
 * @param {number | null} [ball_r]
 * @returns {string}
 */
export function table_geometry_json_for(table_id, ball_r) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(table_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.table_geometry_json_for(ptr0, len0, !isLikeNone(ball_r), isLikeNone(ball_r) ? 0 : ball_r);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Geometric shot feasibility (issue #57): the kernel-side rail-clearance
 * envelope ([`pool_core::cue_clearance`]) over a scenario's cue ball.
 *
 * Input: the SAME scenario JSON as [`simulate_json`] (`options` ignored);
 * `cue_geom_json` is an optional partial [`pool_core::CueGeometry`] object
 * (missing fields fill with the documented cuestick.js mirror defaults —
 * omit/`undefined` for the default 9-ft rod + rail bands + pocket-mouth
 * carve; pass `"mouths": null` for solid bands). UNKNOWN keys are
 * REJECTED (`deny_unknown_fields`, review F4 2026-07-21): a camelCase
 * misspelling like `{"railTop": …}` returns an `{"error"}` payload
 * instead of silently deserializing to the defaults and reporting a
 * wrong verdict.
 *
 * Output (never throws): `{"ok": true, "min_elevation_deg": X}` when the
 * shot's theta clears the geometric floor, `{"ok": false,
 * "min_elevation_deg": X, "error": "..."}` when it sits below it, and
 * `{"error": "..."}` on malformed input. `simulate_json` itself stays
 * PERMISSIVE (replay compatibility) — this is a separate pure surface the
 * app's input envelope feature-detects (`typeof glue.… === 'function'`,
 * the `table_geometry_json_for` precedent) and the RL harness may consume
 * for action-space masking.
 * @param {string} scenario_json
 * @param {string | null} [cue_geom_json]
 * @returns {string}
 */
export function validate_shot_geometry_json(scenario_json, cue_geom_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(scenario_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(cue_geom_json) ? 0 : passStringToWasm0(cue_geom_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.validate_shot_geometry_json(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_copy_to_typed_array_4db0cbe2cc60dbee: function(arg0, arg1, arg2) {
            new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./pool_wasm_bg.js": import0,
    };
}

const WasmSamplerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmsampler_free(ptr, 1));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat64ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('pool_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
