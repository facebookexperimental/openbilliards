// Copyright (c) Meta Platforms, Inc. and affiliates.
import { ValidationError, validateShot } from './shot.js';
import { DEFAULT_EQUIPMENT, EquipmentError, miscueGeometryOf, validateEquipmentIds, } from './catalog.js';
import { DEFAULT_GAME, getGameEntry } from './games/catalog.js';
import { resolveRackTemplate } from './games/rack.js';
/** Version tag for the share-string format (bump on breaking changes).
 * v7 (replay seat identity, GH-448 — contracts/share-codec.md Amendment
 * v7) appends ONE element at index 12: `breaker` — the hotseat seat
 * (1 | 2) that broke the recorded session's first rack. Encoders ALWAYS
 * write it explicitly (recorded provenance is self-describing — the v5
 * discipline); replay pins its match fold to it, so a transport scrub
 * (⏮) re-folds the identical frame instead of inheriting whatever seat
 * the previous pass left live. v1–v6 links decode as `breaker: 1` — the
 * seat every legacy replay's fresh-boot FIRST pass always folded on
 * (flow.js boots the hotseat at seat 1), derived from the wire alone,
 * never from live UI state — so historic links replay every scrub pass
 * exactly like their reference first pass.
 * v6 (playground share fidelity, issue #68 follow-up —
 * contracts/share-codec.md Amendment v6) appends TWO elements:
 * index 10, the FREE-PLACEMENT axis — every committed sandbox placement
 * event `[shotIndex, ball, x, y]` (any ball id, cue = 0) in COMMIT
 * ORDER, tagged with the shot index it precedes (undo/redo restores are
 * just more committed events in order — the axis is an event log, never
 * a keyed map); and index 11, the SENDER-MODE flag (0 judged play /
 * practice, 1 playground) so the replay lane suppresses rules judgment
 * exactly like the sender's session did. v1–v5 links decode as
 * `moves: []`, `mode: 'play'` — byte-identical replay, never prompting.
 * v5 (rule variants, feature 022 — contracts/share-codec.md, FROZEN)
 * appends ONE element at index 9: `variant` — the session's rules-variant
 * preset id (string). Encoders ALWAYS write it explicitly (a default
 * session writes the family default id, e.g. `"wpa-8ball"`): recorded
 * provenance is self-describing, never implicit. v1–v4 links decode to
 * the decoded game's DEFAULT preset and replay byte-identically to their
 * pre-022 behavior (decode rule 1 — the default preset routes through the
 * frozen v1 ruleset id per the catalog `aliases` row); an UNKNOWN variant
 * id throws (never a silent fallback to a different rulebook).
 * v4 (multi-game wave, feature 011 — contracts/share-codec-v4.md, FROZEN)
 * appends the GAME AXIS: the GameCatalog id plus the recorded per-shot
 * calls/decisions tuples `[shotIndex, kind, a, b]` (called ball+pocket,
 * safety calls, rulebook option choices) — without them an 8-ball replay
 * could not reproduce its adjudications (FR-006). v1–v3 links decode as
 * `game: 'nine_ball'`, `calls: []`, never prompting.
 * v3 (equipment-catalog wave, issue #15) encodes the FULL equipment
 * composition (five catalog ids) and RETIRES the v2 `preset` + `cloth`
 * pair — the options preset was always the cushion-model axis in disguise,
 * so it folds into `equipment.cushion_model_id`. Older shares stay
 * decodable: v2's preset/cloth map into the spec
 * (preset→cushion_model_id, cloth→cloth_id, other axes default); v1
 * predates cloth selection (preset→cushion_model_id, all else default). */
export const SHARE_FORMAT_VERSION = 7;
/** Wire tuple arity per accepted format version (version gates BEFORE
 * arity — see decodeShare). The v4 row is retained at 9
 * (contracts/share-codec.md §1); the v5 row at 10 (Amendment v6); the
 * v6 row at 12 (Amendment v7). */
const WIRE_ARITY = Object.freeze({ 1: 7, 2: 8, 3: 7, 4: 9, 5: 10, 6: 12, 7: 13 });
/** Largest ball id any shipped discipline can free-place (snooker colours
 * end at 21; pool 1–15; cue 0 — the calls-axis id conventions). */
const MOVE_BALL_MAX = 21;
/** Free-placement coordinate envelope (meters, |x| and |y|): the 12-ft
 * snooker bed — the largest shipped playfield — spans ±1.784 m on its
 * long axis, so ±2 bounds every catalog table. Table-exact bounds are a
 * resolve-time concern (equipment ids resolve geometry at replay, not in
 * the codec); the envelope rejects garbage without pinning geometry. */
const MOVE_COORD_BOUND = 2;
/** Moves-axis event cap (mirrors the 1..4096 shots bound). Unlike the
 * calls axis, every replayed move costs a mesh write + shadow sync in the
 * app's replay lane, so an uncapped axis is a decode-then-freeze
 * amplification: highly repetitive tuples deflate to a few hundred KB of
 * link for millions of events. In-domain sessions sit orders of magnitude
 * below this (one event per committed gesture). */
const MOVES_MAX = 4096;
// ---- codec v5: rules-variant axis (feature 022, contracts/share-codec.md)
/** Known rules-variant preset ids per game, DEFAULT id FIRST. Pure data
 * (T009 mirror discipline): the eight_ball row mirrors the committed rules
 * artifact's catalog `presets` rows for `eightball-v2` (drift-pinned by
 * share.test.ts against `rules_catalog_json()`); disciplines the catalog
 * ships no preset rows for carry exactly their family default id — the
 * pinned-rulebook v1 behavior every default session records (WPA Rules of
 * Play for 9-ball/one-pocket, WPBSA for snooker, UMB for carom — the
 * 011/012 pinned editions). Future preset families APPEND behind their
 * default (registry-growth repin protocol, registry-api.md §6). */
export const GAME_VARIANTS = Object.freeze({
    nine_ball: Object.freeze(['wpa-9ball']),
    eight_ball: Object.freeze(['wpa-8ball', 'apa-8ball']),
    // GH-382 (build 17): the completion preset (snooker-v2 engine —
    // Foul and a Miss / Free Ball / Touching Ball). Index 0 stays the
    // FR-005 default alias (frozen snooker-v1); every legacy link
    // resolves there.
    snooker: Object.freeze(['wpbsa-snooker', 'wpbsa-snooker-full']),
    // GH-383: the carom3c preset family (rules catalog `carom3c-v2`
    // .presets, drift-pinned by share.test.ts). The default stays FIRST
    // (FR-005: every legacy/default link keeps routing through the frozen
    // carom3c-v1 alias); the two-cue-balls presets (Art 22/23 per-seat
    // assignment + the Art 83 announce fouls, ± the Art 29.4
    // equal-innings regime) APPEND behind it (registry-growth repin
    // protocol, registry-api.md §6).
    carom_3cushion: Object.freeze(['umb-carom', 'umb-carom-2cue', 'umb-carom-2cue-ei']),
    one_pocket: Object.freeze(['wpa-onepocket']),
    // feature 025 (issue #65): the fourteenone family's shipped preset
    // row (rules catalog `fourteenone-v1`.presets — drift-pinned by
    // share.test.ts). The default target-100 point; 75/125 ride the
    // task-config envelope, not new preset ids.
    straight_pool: Object.freeze(['wpa-14-1']),
    // feature 026 (GH-343): no preset rows shipped (single WPA variant —
    // the tenball-v1 pinned-rulebook behavior), family default id only.
    ten_ball: Object.freeze(['wpa-10ball']),
    // GH-491 (build 18): no preset rows shipped (single WPA variant —
    // the heyball-v1 pinned-rulebook behavior, WPA Rules of Heyball
    // eff. 2025-08-16), family default id only.
    heyball: Object.freeze(['wpa-heyball']),
});
/** The family DEFAULT preset id for a game (decode rule 1: every v1–v4
 * link resolves here; the default routes through the frozen v1 ruleset
 * id — FR-005 alias law, never re-adjudicated by a variant engine). */
export function defaultVariantFor(game) {
    return GAME_VARIANTS[game]?.[0] ?? 'wpa-9ball';
}
/** RULES_VERSION (semver part) of the rules catalog this codec's variant
 * table mirrors — named by the unknown-variant decode error so the reader
 * knows which catalog generation refused the id (contracts/share-codec.md
 * decode rule 3). Drift-pinned against `rules_version()` in share.test.ts;
 * bumps ride the registry-growth repin like every other mirror pin. */
export const RULES_CATALOG_VERSION = '0.1.10';
/** Kernel pocket count — every shipped Table has exactly 6 pockets; the
 * calls-axis pocket index is the kernel `Table.pockets` index (the same
 * u16 the BallPocket event carries). */
const POCKET_COUNT = 6;
/** Codec-v4 decision/choice enums (FROZEN; additive only — 6–10 are the
 * feature-012 appendices, contracts/rulesets-012.md §3; 11 is the
 * feature-025 appendix): decision id → number of choices (1-based). */
const DECISION_CHOICES = Object.freeze({
    1: 3, // dry_break (WPA 4.3(d)): accept | rerack+break | rerack+re-break
    2: 2, // eight_legal_break (4.3(e)): spot 8 + accept | re-break
    3: 2, // eight_foul_break (4.3(f)): re-spot 8 + BIH kitchen | re-break
    4: 2, // break_foul (4.3(g),(h)): accept table | BIH kitchen
    5: 1, // stalemate (4.11/1.13): re-rack, original breaker breaks
    6: 2, // onepocket_break_pocket (WPA 12.3): 1 left foot pocket | 2 right
    //   (viewed from the head; default = opposite the cue placement side)
    7: 2, // snooker_play_again (WPBSA Sec3 R13): 1 incoming plays | 2 offender again
    8: 2, // snooker_respotted_black_toss (Sec3 R4(b)): 1 player 1 shoots | 2 player 2
    9: 2, // onepocket_stalemate_lag (WPA 12.10): 1 player 1 breaks re-rack | 2 player 2
    10: 2, // carom_break_spot (UMB Art 23.1(c)): 1 left start spot | 2 right
    11: 2, // fourteenone_break_violation (WPA 7.3(b)): 1 accept the table |
    //   2 require a re-break (repeatable) — feature 025, issue #65
    12: 2, // tenball_pushout_response (WPA 6.4): 1 the pusher shoots again |
    //   2 the chooser takes the table — feature 026, GH-343
    13: 2, // tenball_wrongful_pot (WPA 6.6): 1 the shooter continues |
    //   2 the chooser takes the table — feature 026, GH-343
    14: 1, // onepocket_spot_nearest (WPA 1.6 para 2 via 12.8): the recorded
    //   nearest-ball spot request (never pending) — GH-371
    15: 1, // fourteenone_spot_nearest (WPA 1.6 para 2 via 7.9) — GH-371
    16: 1, // carom_contact_respot (UMB Art 27.1(a)): respot the balls
    //   concerned when frozen at address — GH-371
    17: 3, // snooker_foul_and_a_miss (WPBSA Sec3 R14(b)): 1 non-offender
    //   plays from the position left | 2 offender plays again from
    //   the position left | 3 offender plays again from the
    //   ORIGINAL position (all balls replaced) — GH-382, build 17
    18: 3, // heyball_illegal_break (WPA Heyball II.6(c)): 1 accept the
    //   table | 2 re-rack, chooser breaks | 3 re-rack, original
    //   breaker again (NO ball in hand) — GH-491, build 18
    19: 3, // heyball_break_foul (II.6(e)): 1 BIH behind the head string
    //   as it lies | 2 re-rack, chooser breaks | 3 re-rack,
    //   original breaker again — GH-491, build 18
    20: 2, // heyball_eight_break_pot (II.6(f) no-foul): 1 spot the 8,
    //   breaker continues | 2 re-break — GH-491, build 18
    21: 3, // heyball_eight_break_foul (II.6(f) foul): 1 spot the 8 + BIH
    //   behind the head string | 2 re-rack, chooser breaks |
    //   3 re-rack, original breaker again — GH-491, build 18
    22: 2, // heyball_break_miscue (II.6(g)): 1 chooser breaks | 2 the
    //   breaker breaks again (no BIH) — GH-491, build 18
    23: 1, // heyball_stalemate (II.21): re-rack, the ORIGINAL breaker
    //   breaks again (agreement, never pending) — GH-491, build 18
});
/** Upper bound (inclusive) for rack seeds. This is the CONSUMER's domain:
 * web/app/game.js rerack() clamps seeds to [0, 2^31] so that the derived
 * kernel shot seed (rackSeed * 1000 + shotIndex) stays an exact safe
 * integer / u64. The codec rejects anything above it — otherwise a crafted
 * share would pass validation yet silently re-simulate a DIFFERENT rack,
 * breaking the byte-exact reconstruction contract in the header. */
export const MAX_RACK_SEED = 2 ** 31;
const RACK_KINDS = ['nine', 'ten', 'fifteen', 'snooker', 'carom'];
export const PRESET_IDS = ['default', 'realistic', 'mathavan-fitted', 'grip-fitted'];
/** Cloth preset ids of the v2 wire format (kernel `ClothPreset::by_name`;
 * kept for decoding legacy shares — 'default' IS the 860-class catalog
 * entry, the rest are already catalog cloth ids). */
export const CLOTH_PRESET_IDS = [
    'default', 'simonis_860_tournament', 'simonis_760_fast', 'worn_slow',
    'snooker_napped',
];
/** v1/v2 options preset → the equivalent cushion-model catalog id (the
 * app's physics preset was always exactly this axis). */
export const PRESET_TO_CUSHION_MODEL = {
    default: 'han2005_default',
    realistic: 'stronge_realistic',
    'mathavan-fitted': 'mathavan_fitted',
    'grip-fitted': 'grip_fitted',
};
/** Equipment composition a legacy (v1/v2) share decodes to.
 * BYTE-FROZEN (feature 011 / contracts/share-codec-v4.md decode rule 3):
 * the wpa_generic_9ft pin, the preset→cushion-model map and the cloth fill
 * MUST NOT change — every pre-feature link re-simulates byte-identically
 * (the web/tools/fixtures/legacy-links.json corpus gates exactly this). */
function legacyEquipment(preset, cloth) {
    if (!PRESET_IDS.includes(preset)) {
        throw new ShareError(`unknown options preset '${String(preset)}'`);
    }
    if (!CLOTH_PRESET_IDS.includes(cloth)) {
        throw new ShareError(`unknown cloth preset '${String(cloth)}'`);
    }
    return {
        ...DEFAULT_EQUIPMENT,
        // FROZEN v1/v2 replay fill: stays the legacy (ui_hidden) pooltool-derived
        // table even though the APP default flipped to diamond_proam_9ft
        // (catalog-policy item 5) — old links must re-simulate byte-identically.
        table_id: 'wpa_generic_9ft',
        cloth_id: cloth === 'default' ? DEFAULT_EQUIPMENT.cloth_id : cloth,
        cushion_model_id: PRESET_TO_CUSHION_MODEL[preset],
    };
}
/** Thrown on malformed/incompatible share strings. */
export class ShareError extends Error {
    name = 'ShareError';
}
// ---- base64url (hand-rolled: no Buffer, no btoa — same code both runtimes)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INV = new Map([...B64].map((c, i) => [c, i]));
function toBase64url(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
        out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
        if (b1 !== undefined)
            out += B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
        if (b2 !== undefined)
            out += B64[b2 & 63];
    }
    return out;
}
function fromBase64url(s) {
    if (s.length % 4 === 1)
        throw new ShareError('truncated share string');
    const out = new Uint8Array(Math.floor((s.length * 3) / 4));
    let acc = 0, bits = 0, j = 0;
    for (const c of s) {
        const v = B64_INV.get(c);
        if (v === undefined)
            throw new ShareError(`invalid share character '${c}'`);
        acc = (acc << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[j++] = (acc >> bits) & 0xff;
        }
    }
    return out;
}
// ---- deflate-raw via CompressionStream (browser + node ≥ 20 globals)
async function collect(stream) {
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function deflate(bytes) {
    const cs = new CompressionStream('deflate-raw');
    return collect(new Blob([bytes]).stream().pipeThrough(cs));
}
async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    try {
        return await collect(new Blob([bytes]).stream().pipeThrough(ds));
    }
    catch (e) {
        throw new ShareError(`corrupt share payload: ${String(e)}`);
    }
}
/** ShotAnnotation → wire tuple [shotIndex, kind, a, b] (kind: 0 call,
 * 1 safety, 2 decision, 3 nominate, 4 push — contracts/share-codec-v4.md
 * + contracts/rulesets-012.md §3 / GH-343 additive extensions). */
function callToWire(c) {
    switch (c.kind) {
        case 'call': return [c.shotIndex, 0, c.ball, c.pocket];
        case 'safety': return [c.shotIndex, 1, 0, 0];
        case 'decision': return [c.shotIndex, 2, c.decision, c.choice];
        case 'nominate':
            return [c.shotIndex, 3, c.ball, c.freeBall ? 1 : 0];
        case 'push': return [c.shotIndex, 4, 0, 0];
    }
}
function callFromWire(t, i) {
    if (!Array.isArray(t) || t.length !== 4
        || t.some((v) => typeof v !== 'number')) {
        throw new ShareError(`call ${i}: wire tuple has the wrong shape`);
    }
    const [shotIndex, kind, a, b] = t;
    if (kind === 0)
        return { shotIndex, kind: 'call', ball: a, pocket: b };
    if (kind === 1) {
        if (a !== 0 || b !== 0) {
            throw new ShareError(`call ${i}: safety tuple must carry a=0, b=0`);
        }
        return { shotIndex, kind: 'safety' };
    }
    if (kind === 2)
        return { shotIndex, kind: 'decision', decision: a, choice: b };
    if (kind === 3) {
        // GH-382: b ∈ {0, 1} — 1 marks a free-ball nomination (Sec3 R12);
        // every other value stays the frozen v4 refusal.
        if (b !== 0 && b !== 1) {
            throw new ShareError(`call ${i}: nominate tuple must carry b=0|1`);
        }
        return b === 1
            ? { shotIndex, kind: 'nominate', ball: a, freeBall: true }
            : { shotIndex, kind: 'nominate', ball: a };
    }
    if (kind === 4) {
        if (a !== 0 || b !== 0) {
            throw new ShareError(`call ${i}: push tuple must carry a=0, b=0`);
        }
        return { shotIndex, kind: 'push' };
    }
    throw new ShareError(`call ${i}: unknown kind ${String(kind)}`);
}
/** Wire tuple [shotIndex, ball, x, y] → FreePlacement (codec v6 moves
 * axis; the callFromWire shape discipline — domains gate in
 * validateMoves, shared by encode and decode). */
function moveFromWire(t, i) {
    if (!Array.isArray(t) || t.length !== 4
        || t.some((v) => typeof v !== 'number')) {
        throw new ShareError(`move ${i}: wire tuple has the wrong shape`);
    }
    const [shotIndex, ball, x, y] = t;
    return { shotIndex, ball, x, y };
}
/** Encode a game into a URL-safe share string (put it after `#r=`).
 * Always writes the CURRENT format version (v6: game axis + variant id +
 * the playground axes). Transition seam for pre-v4/v5/v6 callers (a stale
 * web/app/share.js): a missing `game`/`calls` encodes as the default
 * nine_ball game with no calls, a missing `variant` encodes as the game's
 * DEFAULT preset id (contracts/share-codec.md §1: encoders always write
 * it explicitly), missing `moves`/`mode` encode as the empty axis in
 * judged play, and a missing `breaker` (pre-v7 caller) encodes seat 1 —
 * identical semantics to every legacy link. */
export async function encodeShare(game) {
    const gameId = game.game ?? DEFAULT_GAME;
    const g = {
        ...game,
        game: gameId,
        calls: game.calls ?? [],
        variant: game.variant ?? defaultVariantFor(gameId),
        moves: game.moves ?? [],
        mode: game.mode ?? 'play',
        // pre-v7 transition fill for an ABSENT field only (review r3 P2): an
        // explicit null/garbage from an untyped caller must reach the
        // validateGame domain gate, never launder into seat 1
        breaker: game.breaker === undefined ? 1 : game.breaker,
    };
    validateGame(g);
    const e = g.equipment;
    const wire = [
        SHARE_FORMAT_VERSION, g.kernelVersion, g.rackKind, g.seed,
        [e.table_id, e.cloth_id, e.ballset_id, e.cue_id, e.cushion_model_id],
        g.shots.map((s) => [s.v0, s.phi, s.theta, s.a, s.b]),
        Object.entries(g.placements)
            .map(([i, p]) => [Number(i), p.x, p.y])
            .sort((a, b) => a[0] - b[0]),
        g.game,
        g.calls.map(callToWire), // validated sorted by shotIndex (G3 identity)
        g.variant,
        // v6 moves axis: validated sorted by shotIndex; array order IS the
        // sender's commit order (encode never reorders — G3 identity)
        g.moves.map((m) => [m.shotIndex, m.ball, m.x, m.y]),
        g.mode === 'playground' ? 1 : 0,
        g.breaker, // v7: the session's first-rack breaker seat (GH-448)
    ];
    const bytes = new TextEncoder().encode(JSON.stringify(wire));
    return toBase64url(await deflate(bytes));
}
export async function decodeShare(text, opts) {
    const json = new TextDecoder().decode(await inflate(fromBase64url(text)));
    let wire;
    try {
        wire = JSON.parse(json);
    }
    catch {
        throw new ShareError('share payload is not valid JSON after inflate');
    }
    if (!Array.isArray(wire)) {
        throw new ShareError('share payload has the wrong shape');
    }
    // gate on the format version BEFORE the arity check: a future format may
    // change the tuple length, and the actionable message ("ask the sender to
    // re-share") must win over the generic wrong-shape one.
    const formatV = wire[0];
    const arity = WIRE_ARITY[formatV];
    if (arity === undefined) {
        throw new ShareError(`share format v${formatV} is not supported (this build reads ` +
            `v${SHARE_FORMAT_VERSION}); ask the sender to re-share`);
    }
    if (wire.length !== arity) {
        throw new ShareError('share payload has the wrong shape');
    }
    // Legacy arms map onto the v4/v5/v6 positions: v1/v2 carried preset
    // (+ cloth in v2) where v3+ carry the five-id equipment tuple; v1–v3
    // predate the game axis and NORMALIZE to nine_ball with no calls
    // (decode rule 2 — legacy links never prompt); v1–v4 predate the
    // variant slot and resolve to the decoded game's DEFAULT preset (022
    // decode rule 1 — pre-022 links replay byte-identically, never
    // prompting); v1–v5 predate the playground axes and decode as
    // `moves: []`, `mode: 'play'` (Amendment v6 decode rule); v1–v6
    // predate the breaker slot and decode as `breaker: 1` — the fresh-boot
    // fold seat every legacy replay's first pass always used (Amendment
    // v7 decode rule: derived from the wire alone, never live UI state).
    let equipment;
    let shots, places;
    let gameId = DEFAULT_GAME;
    let calls = [];
    let variant = null; // null ⇒ fill the game's default below
    let moves = [];
    let mode = 'play';
    let breaker = 1;
    if (formatV >= 3) {
        const ids = wire[4];
        if (!Array.isArray(ids) || ids.length !== 5) {
            throw new ShareError('share payload has the wrong shape');
        }
        equipment = {
            table_id: ids[0], cloth_id: ids[1],
            ballset_id: ids[2], cue_id: ids[3],
            cushion_model_id: ids[4],
        };
        [shots, places] = [wire[5], wire[6]];
        if (formatV >= 4) {
            gameId = wire[7];
            const rawCalls = wire[8];
            if (!Array.isArray(rawCalls)) {
                throw new ShareError('share payload has the wrong shape');
            }
            calls = rawCalls.map(callFromWire);
        }
        if (formatV >= 5) {
            if (typeof wire[9] !== 'string') {
                throw new ShareError('share payload has the wrong shape');
            }
            variant = wire[9]; // decode rules 2–4 apply in validateGame below
        }
        if (formatV >= 6) {
            const rawMoves = wire[10];
            if (!Array.isArray(rawMoves)) {
                throw new ShareError('share payload has the wrong shape');
            }
            moves = rawMoves.map(moveFromWire);
            if (wire[11] !== 0 && wire[11] !== 1) {
                throw new ShareError('share payload has the wrong shape');
            }
            mode = wire[11] === 1 ? 'playground' : 'play';
        }
        if (formatV >= 7) {
            // v7 breaker seat: the domain is exactly {1, 2} (hotseat seats)
            if (wire[12] !== 1 && wire[12] !== 2) {
                throw new ShareError('share payload has the wrong shape');
            }
            breaker = wire[12] === 2 ? 2 : 1;
        }
    }
    else {
        const preset = wire[4];
        const cloth = (formatV === 2 ? wire[5] : 'default');
        equipment = legacyEquipment(preset, cloth);
        const rest = formatV === 2 ? [wire[6], wire[7]] : [wire[5], wire[6]];
        [shots, places] = rest;
    }
    // GH-491 (review r7 P1): the consumer opt-in gate — heyball joined the
    // codec at this generation, so only a caller that DECLARES the heyball
    // replay chain may receive its payloads (the stale-adapter pairing
    // above). Gated before validateGame: the refusal names the cure, not
    // a generic shape error.
    if (gameId === 'heyball'
        && !(opts?.acceptGames?.includes('heyball') === true)) {
        throw new ShareError('this link is a Heyball share and the consuming build\'s cached '
            + 'modules predate the discipline — reload/update, then reopen '
            + 'the link');
    }
    const [, kernelVersion, rackKind, seed] = wire;
    const game = {
        kernelVersion: String(kernelVersion),
        formatV,
        rackKind,
        seed,
        equipment,
        shots: (Array.isArray(shots) ? shots : []).map((s) => ({
            v0: s[0], phi: s[1], theta: s[2], a: s[3], b: s[4],
        })),
        placements: Object.fromEntries((Array.isArray(places) ? places : []).map((p) => [p[0], { x: p[1], y: p[2] }])),
        game: gameId,
        calls,
        variant: variant ?? defaultVariantFor(gameId),
        moves,
        mode,
        breaker,
    };
    validateGame(game);
    return game;
}
/** Kernel compatibility lineage (feature 012, research R7 step 5 —
 * contracts/equipment-additions.md §4): `(old_hash, new_hash)` pairs whose
 * event streams were PROVEN byte-identical by Gate G-KERNEL (the blocking
 * `e2e-share.mjs --corpus` CI job re-simulates the pinned legacy corpus +
 * break fixture on both binaries and byte-diffs). The list is DATA with a
 * CI-enforced proof obligation, not a trust declaration — never add a pair
 * the gate has not proven. [`kernelGate`] suppresses the version warning
 * for lineage-connected versions, with ONE exception: a share on a
 * [`CHINESE8_POCKET_TABLE_IDS`] table minted on the pre-v21 pockets
 * ([`chinese8PocketsMoved`], GH-1080) keeps the warning, because the pairs
 * prove the corpus streams, not those pockets. Every other gate semantic
 * is unchanged. */
export const KERNEL_COMPAT_LINEAGE = Object.freeze([
    // feature 012 additive kernel (catalog v6 discipline tables/layouts):
    // Gate G-KERNEL proved 14/14 corpus event streams byte-identical.
    ['0.1.0+5bd2803', '0.1.0+ee629a3'],
    // catalog v7 arc-span kernel (Amendment A1 — snooker/joy pocket
    // re-derivation; pool serde/physics untouched): Gate G-KERNEL proved
    // 14/14 corpus event streams byte-identical vs the archived pre-012
    // wasm, and the legacy-links repin proved the ee629a3-era records
    // reproduce byte-for-byte modulo the version string.
    ['0.1.0+5bd2803', '0.1.0+4c2d25e'],
    ['0.1.0+ee629a3', '0.1.0+4c2d25e'],
    // landing restamp (post-Amendment-A1): clippy-only test/doc edits in
    // pool-core forced a canonical rebuild; kernel sources' behavior is
    // unchanged. Gate G-KERNEL re-proved 14/14 corpus event streams
    // byte-identical vs the archived pre-012 wasm, and the legacy-links
    // repin re-proved the version-only splice (4c2d25e-era records
    // reproduce byte-for-byte modulo the version string).
    ['0.1.0+5bd2803', '0.1.0+6cde449'],
    ['0.1.0+ee629a3', '0.1.0+6cde449'],
    ['0.1.0+4c2d25e', '0.1.0+6cde449'],
    // feature-018 opt-in restamp: the additive cluster-model kernel
    // (feature 018, internal spec) ships OPT-IN with the default path
    // byte-identical, and the dist-freshness gate forces a canonical
    // rebuild. Gate G-KERNEL re-proved 14/14 corpus event streams
    // byte-identical vs the archived pre-012 wasm, and the legacy-links
    // repin proved the version-only splice (6cde449-era records reproduce
    // byte-for-byte modulo the version string). NOTE: the feature-018
    // default FLIP (a real physics change for cluster-escalated breaks)
    // must NOT add a pair — flip-cascade.md §5.
    ['0.1.0+5bd2803', '0.1.0+6f8fd12'],
    ['0.1.0+ee629a3', '0.1.0+6f8fd12'],
    ['0.1.0+4c2d25e', '0.1.0+6f8fd12'],
    ['0.1.0+6cde449', '0.1.0+6f8fd12'],
    // build-15 version-only repins (GH-318): three canonical restamps
    // moved web/dist/pool-wasm 99bca8b6 -> 52c22c0d (Amendment 025
    // revision note, commit 30c41580) -> c7816023 (catalog v14 additive
    // archetypes, f4a31c8c) -> 208e1dc4 (catalog provenance text,
    // 9ca9490f). Gate G-KERNEL pair runs (`e2e-share.mjs --corpus-pair`,
    // archived dists extracted from git history) RE-PROVED 14/14 corpus
    // event streams byte-identical for EVERY pair below — the release
    // notes were not trusted (GH-318 law). The transitive closure is
    // listed explicitly, matching the ledger's style. The pre-flip
    // component above stays DISCONNECTED from this one: real physics
    // changes (018 cluster flip, 021 rail-seat flip, #77/#83/#164
    // corrections) sit between 6f8fd12 and 99bca8b6, so no pair may
    // bridge them and the strict-gate refusal path is preserved.
    ['0.1.0+99bca8b6', '0.1.0+52c22c0d'],
    ['0.1.0+99bca8b6', '0.1.0+c7816023'],
    ['0.1.0+99bca8b6', '0.1.0+208e1dc4'],
    ['0.1.0+52c22c0d', '0.1.0+c7816023'],
    ['0.1.0+52c22c0d', '0.1.0+208e1dc4'],
    ['0.1.0+c7816023', '0.1.0+208e1dc4'],
    // GH-343 additive 10-ball rack template: the canonical wasm restamp
    // 208e1dc4 -> dedc61cd is version-only PROVEN twice over — the repin
    // cascade (scripts/repin-wasm-fixtures.mjs splice-proof 13/13 + the
    // break fixture's pinned event sha) and the GH-318 Gate G-KERNEL
    // pair arm (`e2e-share.mjs --corpus-pair`, the 208e1dc4 dist
    // extracted from git history, 14/14 corpus event streams
    // byte-identical). The explicit transitive closure from the build-15
    // component follows the ledger's style; the pre-flip component stays
    // DISCONNECTED (no pair may bridge the 018 flip).
    ['0.1.0+208e1dc4', '0.1.0+dedc61cd'],
    ['0.1.0+99bca8b6', '0.1.0+dedc61cd'],
    ['0.1.0+52c22c0d', '0.1.0+dedc61cd'],
    ['0.1.0+c7816023', '0.1.0+dedc61cd'],
    // GH-383 Amendment 026 (SimOptions.cue_ball, additive serde-default):
    // the canonical wasm restamp dedc61cd -> 91ad8597 (stamped at the
    // rebase-onto-main landing commit — the reachable-base law: never
    // rebase after building) is version-only PROVEN twice over — the
    // repin cascade (scripts/repin-wasm-fixtures.mjs splice-proof + the
    // break fixture's pinned event sha) and the Gate G-KERNEL pair arm
    // (`e2e-share.mjs --corpus-pair`, the dedc61cd dist extracted from
    // git history, 14/14 corpus event streams byte-identical). Explicit
    // transitive closure from the build-15 component per the ledger's
    // style; the pre-flip component stays DISCONNECTED (no pair may
    // bridge the 018 flip).
    ['0.1.0+dedc61cd', '0.1.0+91ad8597'],
    ['0.1.0+208e1dc4', '0.1.0+91ad8597'],
    ['0.1.0+99bca8b6', '0.1.0+91ad8597'],
    ['0.1.0+52c22c0d', '0.1.0+91ad8597'],
    ['0.1.0+c7816023', '0.1.0+91ad8597'],
    // #789 catalog v20 (neutral twins, the retirement digest alias,
    // CATALOG_VERSION 19 -> 20; pool physics untouched): the canonical wasm
    // restamp b6b5dc3f -> a2b08c21 is version-only PROVEN by the Gate
    // G-KERNEL pair arm (`e2e-share.mjs --corpus-pair`, the b6b5dc3f dist
    // extracted from git history, 14/14 corpus event streams
    // byte-identical). b6b5dc3f sits beyond registered kernel changes (the
    // GH-490 repin, #790), so this pair starts a NEW component: no pair
    // links it to 91ad8597 or any older stamp, and the strict-gate refusal
    // path for those stamps is preserved.
    ['0.1.0+b6b5dc3f', '0.1.0+a2b08c21'],
    // #789 external-origin ids through the catalog v20 digest alias
    // (accessor-only kernel change; CATALOG_VERSION unchanged): the
    // canonical wasm restamp a2b08c21 -> 206ceb55 is version-only PROVEN
    // by the Gate G-KERNEL pair arm (`e2e-share.mjs --corpus-pair`, the
    // a2b08c21 dist extracted from git history, 14/14 corpus event streams
    // byte-identical). The explicit closure from b6b5dc3f, the stamp that
    // shipped, is proven by its own pair run over the b6b5dc3f dist, never
    // inferred through a2b08c21. The component stays disconnected from
    // 91ad8597 and every older stamp.
    ['0.1.0+a2b08c21', '0.1.0+206ceb55'],
    ['0.1.0+b6b5dc3f', '0.1.0+206ceb55'],
    // GH-958/GH-977/GH-973 (the catalog alias JSON without a panic site,
    // the cargo-home path remap in the canonical build, de-branded
    // Calibration text; no physics change): the canonical wasm restamp
    // 206ceb55 -> 72a839f6 is version-only PROVEN by the Gate G-KERNEL
    // pair arm (`e2e-share.mjs --corpus-pair`, the 206ceb55 dist
    // extracted from git history, 15/15 corpus event streams
    // byte-identical) and the repin cascade (splice-proof 14/14 + the
    // break fixture's events). The explicit closure from b6b5dc3f, the
    // build-18 stamp, is proven by its own pair run over the archived
    // b6b5dc3f dist (15/15), never inferred through 206ceb55; the CI
    // --corpus arm requires it for the b6b5dc3f-captured pin. The
    // component stays disconnected from 91ad8597 and every older stamp.
    // GH-1042 note: snooker/carom shares from these stamps re-simulate on
    // the kernel's default pairing (KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS)
    // — the pair proves the kernel, that set keeps the app's composition.
    ['0.1.0+206ceb55', '0.1.0+72a839f6'],
    ['0.1.0+b6b5dc3f', '0.1.0+72a839f6'],
    // GH-1080 (catalog v21, the chinese8 corner F2 + middle M-c repin): a
    // REGISTERED geometry change that moves only the chinese8_pro_9ft /
    // joy_q8_9ft pockets. Spec dump against the 72a839f6 dist: the other 17
    // table geometries are byte-identical at the pool, snooker and carom
    // ball radii, and the catalog differs only in the chinese8 note and the
    // version 20 -> 21. Each pair below is PROVEN by its own Gate G-KERNEL
    // pair run (`e2e-share.mjs --corpus-pair` over the dist extracted from
    // git history or the archived b6b5dc3f dist, 15/15 corpus event streams
    // byte-identical). The corpus is pool-only and embeds its own tables, so
    // the pair runs prove the pool physics; snooker and carom rest on the
    // spec dump. The pairs are appended under a HYBRID posture (catalog.rs
    // v21, docs/RELEASING.md §4): [`kernelGate`] still refuses a chinese8
    // share minted before this stamp ([`CHINESE8_POCKETS_PRE_V21_STAMPS`]) —
    // its re-simulation lands on different pockets.
    ['0.1.0+72a839f6', '0.1.0+a31f6516'],
    ['0.1.0+b6b5dc3f', '0.1.0+a31f6516'],
    ['0.1.0+206ceb55', '0.1.0+a31f6516'],
    // version-only canonical wasm restamp 15210514 -> 6adb7fd9 (the build-20 old-engine batch (FB-K)): PROVEN by the Gate
    // G-KERNEL pair arm (`e2e-share.mjs --corpus-pair`, the 15210514 dist extracted from git history,
    // full-corpus event streams byte-identical).
    ['0.1.0+15210514', '0.1.0+6adb7fd9'],
]);
/** True when `from` reaches `to` through KERNEL_COMPAT_LINEAGE pairs
 * (direct pair or a proven chain old→mid→new). Exported for the DVR's
 * lineage-aware old-kernel badge + diagnostic path (GH-318). NOTE:
 * identical versions return FALSE (there is no self-pair in the ledger)
 * — callers gate on `from !== to` first, or use [`kernelGate`]. */
export function lineageCompatible(from, to) {
    const seen = new Set([from]);
    const frontier = [from];
    while (frontier.length > 0) {
        const v = frontier.pop();
        for (const [o, n] of KERNEL_COMPAT_LINEAGE) {
            if (o === v && !seen.has(n)) {
                if (n === to)
                    return true;
                seen.add(n);
                frontier.push(n);
            }
        }
    }
    return false;
}
/** Kernel-version gate (constitution P-III: cross-version re-simulation is
 * not bit-reproducible). `ok: false` ⇒ show `message` and offer view-anyway.
 * Feature 012: versions connected through [`KERNEL_COMPAT_LINEAGE`] pass
 * silently — their byte identity is mechanically proven by Gate G-KERNEL,
 * so a scary banner on every pre-012 link would be a behavior regression
 * (US4-AS3). GH-1080 exception: a lineage-connected share on a
 * [`CHINESE8_POCKET_TABLE_IDS`] table minted on the pre-v21 pockets is
 * still refused ([`chinese8PocketsMoved`]) — its re-simulation lands on
 * different pockets. */
export function kernelGate(game, engineKernelVersion) {
    if (game.kernelVersion === engineKernelVersion)
        return { ok: true };
    if (lineageCompatible(game.kernelVersion, engineKernelVersion)
        && !chinese8PocketsMoved(game, engineKernelVersion)) {
        return { ok: true };
    }
    return {
        ok: false,
        message: `replay was recorded on kernel ${game.kernelVersion} but this build ` +
            `runs ${engineKernelVersion} — re-simulation may diverge from what ` +
            'the sender saw',
    };
}
/** GH-1042: the kernel stamps whose app racked snooker and carom on the
 * kernel's OWN default pairing (cue `standard` and the discipline's v6
 * table, cloth, ball set and cushion model) whatever equipment the player
 * had selected — and whatever equipment the share link encodes, because
 * the codec writes the selected spec. A snooker/carom share minted on one
 * of these stamps must re-simulate on that pairing to reproduce what the
 * sender saw; the app applies it to the discipline kinds only (game.js
 * composeRack). FROZEN at the fix: every stamp of KERNEL_COMPAT_LINEAGE up
 * to and including `0.1.0+206ceb55` (build 19, the last pre-fix build).
 * Never append to it — a stamp built after the fix racks on the selected
 * spec. Stamps outside the lineage already fail [`kernelGate`] (their
 * view-anyway re-simulation is an informed divergence). */
export const KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS = Object.freeze([
    '0.1.0+5bd2803', '0.1.0+ee629a3', '0.1.0+4c2d25e', '0.1.0+6cde449',
    '0.1.0+6f8fd12', '0.1.0+99bca8b6', '0.1.0+52c22c0d', '0.1.0+c7816023',
    '0.1.0+208e1dc4', '0.1.0+dedc61cd', '0.1.0+91ad8597', '0.1.0+b6b5dc3f',
    '0.1.0+a2b08c21', '0.1.0+206ceb55',
]);
/** True when a shared game was minted on a kernel stamp whose app racked
 * snooker/carom on the kernel's default pairing
 * ([`KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS`], GH-1042). */
export function kernelDefaultDisciplinePairing(game) {
    return KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS.includes(game.kernelVersion);
}
/** GH-1080 (catalog v21): the catalog table ids whose pocket geometry v21
 * moved — `chinese8_pro_9ft` and its resolve-only alias `joy_q8_9ft`
 * (heyball racks on chinese8_pro_9ft, so heyball shares carry it). */
export const CHINESE8_POCKET_TABLE_IDS = Object.freeze(['chinese8_pro_9ft', 'joy_q8_9ft']);
/** GH-1080: the kernel stamps that racked chinese8 tables on the pre-v21
 * pockets. A share on a [`CHINESE8_POCKET_TABLE_IDS`] table minted on one
 * of these stamps re-simulates on DIFFERENT pockets under a v21-or-later
 * kernel, so [`kernelGate`] refuses it (the standard warning, view-anyway)
 * even where KERNEL_COMPAT_LINEAGE connects the stamps — the pairs prove
 * every OTHER table byte-identical. FROZEN at v21: every stamp of
 * KERNEL_COMPAT_LINEAGE up to and including `0.1.0+72a839f6`, the last
 * pre-v21 kernel. Never append to it: a stamp built after v21 racks on the
 * v21 pockets. Archived DVR records are untouched by this set: they replay
 * their recorded event streams, which a geometry change cannot alter. */
export const CHINESE8_POCKETS_PRE_V21_STAMPS = Object.freeze([
    '0.1.0+5bd2803', '0.1.0+ee629a3', '0.1.0+4c2d25e', '0.1.0+6cde449',
    '0.1.0+6f8fd12', '0.1.0+99bca8b6', '0.1.0+52c22c0d', '0.1.0+c7816023',
    '0.1.0+208e1dc4', '0.1.0+dedc61cd', '0.1.0+91ad8597', '0.1.0+b6b5dc3f',
    '0.1.0+a2b08c21', '0.1.0+206ceb55', '0.1.0+72a839f6',
]);
/** True when a shared game racked on a chinese8 table was minted on the
 * pre-v21 pockets and is being re-simulated on a kernel that is not
 * ([`CHINESE8_POCKETS_PRE_V21_STAMPS`], GH-1080). A pair between two pre-v21
 * stamps is left as it was before v21: the four stamps that reach the v21
 * kernel (b6b5dc3f, a2b08c21, 206ceb55, 72a839f6; catalog v19-v20) rack
 * identical chinese8 pockets (spec dump), and the older pre-v21 pairs keep
 * their earlier silence, catalog v7's joy_q8_9ft re-derivation included. */
export function chinese8PocketsMoved(game, engineKernelVersion) {
    return CHINESE8_POCKET_TABLE_IDS.includes(game.equipment?.table_id ?? '')
        && CHINESE8_POCKETS_PRE_V21_STAMPS.includes(game.kernelVersion)
        && !CHINESE8_POCKETS_PRE_V21_STAMPS.includes(engineKernelVersion);
}
function validateGame(g) {
    if (typeof g.kernelVersion !== 'string' || g.kernelVersion.length === 0) {
        throw new ShareError('missing kernel version');
    }
    if (!RACK_KINDS.includes(g.rackKind)) {
        throw new ShareError(`unknown rack kind '${String(g.rackKind)}'`);
    }
    if (!Number.isInteger(g.seed) || g.seed < 0 || g.seed > MAX_RACK_SEED) {
        throw new ShareError(`rack seed must be an integer in [0, 2^31], got ${g.seed}`);
    }
    try {
        validateEquipmentIds(g.equipment);
    }
    catch (e) {
        if (e instanceof EquipmentError)
            throw new ShareError(e.message);
        throw e;
    }
    if (!Array.isArray(g.shots) || g.shots.length === 0 || g.shots.length > 4096) {
        throw new ShareError('share must contain 1..4096 shots');
    }
    // Amendment 021 (issue #168): the strike envelope is CUE-dependent and a
    // share replays on ITS OWN equipment (the ids resolve geometry at replay,
    // not in the codec), so shots validate against the share's equipped cue
    // (tip radius + per-cue miscue contact cap) and ball set (cue-ball
    // radius) — a legal masse_trick shot with contact offset in (0.5, 0.58]R
    // must decode. The ids were validated just above, so the lookups always
    // resolve; the kernel re-validates every replayed shot (authoritative).
    const miscue = miscueGeometryOf(g.equipment);
    g.shots.forEach((s, i) => {
        try {
            validateShot({ ...s, seed: 0 }, miscue); // kernel strike rules; seed is derived
        }
        catch (e) {
            if (e instanceof ValidationError) {
                throw new ShareError(`shot ${i}: ${e.message}`);
            }
            throw e;
        }
    });
    for (const [k, p] of Object.entries(g.placements)) {
        const i = Number(k);
        if (!Number.isInteger(i) || i < 0 || i >= g.shots.length) {
            throw new ShareError(`placement key ${k} is not a valid shot index`);
        }
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            throw new ShareError(`placement ${k} has non-finite coordinates`);
        }
    }
    validateGameAxis(g);
    validateMoves(g);
    // codec v7 (GH-448): the breaker seat domain — shared by encode and
    // decode like every other axis (decode already refused non-1|2 wire
    // values as wrong shape; this gates untyped encode callers too)
    if (g.breaker !== 1 && g.breaker !== 2) {
        throw new ShareError(`breaker seat must be 1 or 2, got ${String(g.breaker)}`);
    }
}
/** Codec-v6 playground-axes validation (contracts/share-codec.md Amendment
 * v6; shared by encode and decode like the rest of validateGame): a known
 * sender mode; free placements only under the playground mode (the
 * recorder only commits them there — a moves axis on a judged session is
 * a malformed payload); the [`MOVES_MAX`] event cap (the shots-bound
 * discipline — see the constant for the amplification rationale); shot
 * indices in range and non-decreasing (commit order is chronological —
 * mirror of the calls-axis sort law); ball ids in the kernel id domain;
 * coordinates finite and inside the catalog table envelope. */
function validateMoves(g) {
    if (g.mode !== 'play' && g.mode !== 'playground') {
        throw new ShareError(`unknown sender mode '${String(g.mode)}'`);
    }
    if (!Array.isArray(g.moves)) {
        throw new ShareError('moves must be an array');
    }
    if (g.moves.length > MOVES_MAX) {
        throw new ShareError(`share must contain 0..${MOVES_MAX} moves`);
    }
    if (g.moves.length > 0 && g.mode !== 'playground') {
        throw new ShareError('free placements require the playground sender mode');
    }
    let prev = 0;
    g.moves.forEach((m, i) => {
        if (!Number.isInteger(m.shotIndex) || m.shotIndex < 0
            || m.shotIndex >= g.shots.length) {
            throw new ShareError(`move ${i}: shot index ${m.shotIndex} out of range`);
        }
        if (m.shotIndex < prev) {
            throw new ShareError(`move ${i}: moves must be sorted by shot index`);
        }
        prev = m.shotIndex;
        if (!Number.isInteger(m.ball) || m.ball < 0 || m.ball > MOVE_BALL_MAX) {
            throw new ShareError(`move ${i}: ball id ${String(m.ball)} out of `
                + `0..${MOVE_BALL_MAX}`);
        }
        if (!Number.isFinite(m.x) || !Number.isFinite(m.y)
            || Math.abs(m.x) > MOVE_COORD_BOUND || Math.abs(m.y) > MOVE_COORD_BOUND) {
            throw new ShareError(`move ${i}: coordinates outside the table envelope (|x|,|y| <= `
                + `${MOVE_COORD_BOUND})`);
        }
    });
}
/** Codec-v4 game-axis validation (contracts/share-codec-v4.md rule 4):
 * playable GameCatalog entry, rack-kind cross-check, and the calls axis
 * (indices, kinds, ball/pocket domains, decision enums, sort order). */
function validateGameAxis(g) {
    let entry;
    try {
        entry = getGameEntry(g.game);
    }
    catch {
        throw new ShareError(`unknown game id '${String(g.game)}'`);
    }
    if (entry.readiness !== 'playable') {
        throw new ShareError(`game '${g.game}' is not playable (readiness entry)`);
    }
    const template = resolveRackTemplate(entry.rack_template);
    if (template === undefined || g.rackKind !== template.kernel_kind) {
        throw new ShareError(`rack kind '${g.rackKind}' does not match game '${g.game}' ` +
            `(expects '${template?.kernel_kind ?? 'unresolved'}')`);
    }
    if (!Array.isArray(g.calls)) {
        throw new ShareError('calls must be an array');
    }
    if (g.game === 'nine_ball' && g.calls.length > 0) {
        throw new ShareError('nine_ball shares carry no calls');
    }
    let prev = 0;
    g.calls.forEach((c, i) => {
        // GH-491 (review r2): heyball has no shot calls of any kind — no
        // called ball/pocket, no called safety, no nomination (WPA Heyball
        // II.11); flow judges every heyball shot with a null call, so a
        // link carrying one would silently replay differently than the
        // codec accepted. Only the decision kinds (the II.6 option
        // matrices / II.21 stalemate, enums 18-23) ride the calls axis —
        // the ten_ball push-gate precedent, inverted.
        if (g.game === 'heyball' && c.kind !== 'decision') {
            throw new ShareError(`call ${i}: heyball carries no shot calls (WPA Heyball II.11) — `
                + `'${String(c.kind)}' cannot replay`);
        }
        if (!Number.isInteger(c.shotIndex) || c.shotIndex < 0
            || c.shotIndex >= g.shots.length) {
            throw new ShareError(`call ${i}: shot index ${c.shotIndex} out of range`);
        }
        if (c.shotIndex < prev) {
            throw new ShareError(`call ${i}: calls must be sorted by shot index`);
        }
        prev = c.shotIndex;
        if (c.kind === 'call') {
            if (!Number.isInteger(c.ball) || c.ball < 1 || c.ball > 15) {
                throw new ShareError(`call ${i}: ball id ${c.ball} out of 1..15`);
            }
            if (!Number.isInteger(c.pocket) || c.pocket < 0
                || c.pocket >= POCKET_COUNT) {
                throw new ShareError(`call ${i}: pocket index ${c.pocket} out of 0..${POCKET_COUNT - 1}`);
            }
        }
        else if (c.kind === 'nominate') {
            // feature 012 (contracts/rulesets-012.md §3): snooker colour ids only
            if (!Number.isInteger(c.ball) || c.ball < 16 || c.ball > 21) {
                throw new ShareError(`call ${i}: nominate ball id ${c.ball} out of the colour range 16..21`);
            }
            // GH-382 (review r1 P2): the free-ball flag exists only under the
            // completion preset — the default (FR-005 alias) session replays
            // through snooker-v1, which cannot judge it; letting it encode
            // would mint an unreplayable link.
            if (c.freeBall !== undefined && c.freeBall !== true) {
                // explicit false would encode as the same b=0 an absent flag
                // does and decode WITHOUT the property — breaking the codec's
                // exact round-trip identity (review GH-382 r15): true or omitted
                throw new ShareError(`call ${i}: nominate freeBall must be true or omitted`);
            }
            if (c.freeBall === true && g.variant !== 'wpbsa-snooker-full') {
                throw new ShareError(`call ${i}: a free-ball nomination (WPBSA Sec3 R12) needs the `
                    + `wpbsa-snooker-full variant — '${String(g.variant)}' cannot `
                    + 'replay it');
            }
        }
        else if (c.kind === 'push') {
            // feature 026 (GH-343): the declared push out is 10-ball's second
            // shot of the rack (WPA 6.4) — the crate enforces the window; the
            // codec gates the game like the nine_ball no-calls rule above.
            if (g.game !== 'ten_ball') {
                throw new ShareError(`call ${i}: push out is a ten_ball input (WPA 6.4)`);
            }
        }
        else if (c.kind === 'decision') {
            const nChoices = DECISION_CHOICES[c.decision];
            if (nChoices === undefined) {
                throw new ShareError(`call ${i}: unknown decision ${c.decision}`);
            }
            if (!Number.isInteger(c.choice) || c.choice < 1 || c.choice > nChoices) {
                throw new ShareError(`call ${i}: choice ${c.choice} out of range for decision ${c.decision}`);
            }
            // GH-382 (review r3): decision 17 exists only under the completion
            // preset — a default-alias session replays through snooker-v1,
            // which cannot apply it (the free-ball nomination gate's twin)
            if (c.decision === 17 && g.variant !== 'wpbsa-snooker-full') {
                throw new ShareError(`call ${i}: decision 17 (WPBSA Sec3 R14) needs the `
                    + `wpbsa-snooker-full variant — '${String(g.variant)}' cannot `
                    + 'replay it');
            }
            // GH-491 (review r5 P2): the heyball decision family (18-23) is
            // ruleset-isolated BOTH ways — flow resolves recorded decisions
            // through per-family id maps, so a heyball link carrying an
            // out-of-family id (or any other game carrying 18-23) encodes an
            // UNREPLAYABLE link that the replay then refuses (the decision-17
            // variant-gate precedent, family axis).
            const heyDecision = c.decision >= 18 && c.decision <= 23;
            if ((g.game === 'heyball') !== heyDecision) {
                throw new ShareError(`call ${i}: decision ${c.decision} does not belong to `
                    + `'${g.game}' (the heyball family is 18-23)`);
            }
        }
        else if (c.kind !== 'safety') {
            // untyped JS callers can hand encodeShare arbitrary kinds at runtime
            throw new ShareError(`call ${i}: unknown kind '${String(c.kind)}'`);
        }
    });
    validateVariant(g);
}
/** Codec-v5 variant validation (contracts/share-codec.md decode rules
 * 2–4; shared by encode and decode like the rest of validateGame):
 * a KNOWN preset id whose family matches the wire's game pins the
 * variant; an id known to ANOTHER family is a malformed payload (rule 4 —
 * a `wpa-8ball` variant on a `nine_ball` game is not a playable point);
 * an id known to NOBODY throws the structured unknown-variant error
 * (rule 3) — NEVER a silent fallback to a different rulebook (US2
 * scenario 5; the judging surfaces return `unknown-preset` for the same
 * condition, identical in meaning). */
function validateVariant(g) {
    const id = g.variant;
    if (typeof id !== 'string' || id.length === 0) {
        throw new ShareError('missing rules-variant id');
    }
    if (GAME_VARIANTS[g.game].includes(id))
        return;
    if (Object.values(GAME_VARIANTS).some((ids) => ids.includes(id))) {
        throw new ShareError(`rules variant '${id}' does not belong to game '${g.game}' — `
            + 'not a playable point');
    }
    throw new ShareError(`rules variant '${id}' is not known to this build (reads catalog `
        + `RULES_VERSION ${RULES_CATALOG_VERSION}); update this app or ask `
        + 'the sender to re-share');
}
/** cp wire version tag (its own tiny version discipline, independent of
 * SHARE_FORMAT_VERSION). Bump on breaking cp-layout changes; older builds
 * ignore the whole param either way. */
export const CAMERA_PLAN_WIRE_VERSION = 1;
/** Model caps mirrored from the #301 contract §1.5 (playback.js CUT_MAX /
 * SLOT_MAX / FADE_CAP_CS — caps live in the MODEL, the codec mirrors). */
const CP_CUT_MAX = 128;
const CP_SLOT_MAX = 8;
const CP_FADE_CAP_CS = 500;
/** Anchor garbage envelope: one hour of segment-relative centiseconds. No
 * shipped kernel shot approaches it (a lag shot settles in ~30 s); the
 * bound rejects crafted amplification without pinning real durations. */
const CP_T_MAX = 360_000;
/** Registry id envelope for cam/transition (unknown ids INSIDE it ride
 * through to the #301 apply-time degrade; values beyond it are garbage,
 * not a future registry — the registries are append-only small ints). */
const CP_ID_MAX = 255;
/** Pose envelope (the MOVE_COORD_BOUND idiom — reject garbage without
 * pinning geometry), integer mm / decidegrees per the GH-302 design
 * freeze: |eye kx,ky| <= 12 m, eye h in [0, 8 m], |look kx,ky| <= 4 m,
 * look h in [-1, 3 m], fov 40.0°..110.0°. */
const CP_EYE_XY_MM = 12_000;
const CP_EYE_H_MM = [0, 8_000];
const CP_LOOK_XY_MM = 4_000;
const CP_LOOK_H_MM = [-1_000, 3_000];
const CP_FOV_DD = [400, 1_100];
/** Practical share-URL envelope (chars, whole URL). Browsers/WKWebView
 * carry tens of KB (Safari ~80 K) — 8 K keeps a cap-worst plan on a long
 * game far inside every shipped carrier with an order-of-magnitude
 * margin. web/app/share.js enforces it at link build time and DROPS the
 * plan with a visible notice when exceeded (honest degrade — never a
 * silently truncated plan); share.test.ts asserts the measured cap-worst
 * URL sits under it. */
export const SHARE_URL_ENVELOPE = 8192;
/** Decode-side amplification bounds (review GH-302 r1 P2): a crafted cp
 * blob of highly repetitive tuples deflates ~400:1, so the caps must
 * bind BEFORE JSON.parse/tuple allocation, not after. The blob itself
 * can never legitimately exceed the whole-URL envelope, and the
 * cap-worst legitimate plan (128 cuts + 8 poses) is ~5 KB of JSON — the
 * 64 KB inflate ceiling is an order of magnitude of headroom. */
const CP_INFLATED_MAX = 65_536;
/** Inflate with a hard output ceiling — the stream cancels the moment the
 * decompressed size passes `cap` (decode-then-freeze amplification
 * guard; the plain [`inflate`] stays for the physics tuple, whose moves
 * axis documents its own bound). */
async function inflateBounded(bytes, cap) {
    const ds = new DecompressionStream('deflate-raw');
    const reader = new Blob([bytes]).stream()
        .pipeThrough(ds).getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            total += value.length;
            if (total > cap) {
                await reader.cancel().catch(() => undefined);
                throw new ShareError(`camera plan inflates past ${cap} bytes — not a real plan`);
            }
            chunks.push(value);
        }
    }
    catch (e) {
        if (e instanceof ShareError)
            throw e;
        throw new ShareError(`corrupt camera plan payload: ${String(e)}`);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
        out.set(c, o);
        o += c.length;
    }
    return out;
}
/** Shared cp validation (encode AND decode — the validateGame discipline).
 * `shotCount`, when provided, gates `seg` against the carrying share's
 * shot list (the open-time cross-validation from the GH-302 design). */
function validateCameraPlan(plan, shotCount) {
    if (typeof plan !== 'object' || plan === null
        || !Array.isArray(plan.cuts) || !Array.isArray(plan.poses)) {
        throw new ShareError('camera plan has the wrong shape');
    }
    if (plan.cuts.length > CP_CUT_MAX) {
        throw new ShareError(`camera plan carries ${plan.cuts.length} cuts `
            + `(cap ${CP_CUT_MAX})`);
    }
    if (plan.poses.length > CP_SLOT_MAX) {
        throw new ShareError(`camera plan carries ${plan.poses.length} poses `
            + `(cap ${CP_SLOT_MAX})`);
    }
    let prevSlot = -1;
    const slots = new Set();
    // index iteration, never forEach (review r6 P2): a SPARSE array's holes
    // skip forEach entirely — validation would pass while JSON.stringify
    // emits `null`, an undecodable blob out of our own encoder.
    for (let i = 0; i < plan.poses.length; i++) {
        const p = plan.poses[i];
        // shape gates BEFORE any spread (review r4 P2: a non-iterable eye/look
        // must answer ShareError, never a TypeError out of the spread)
        if (!Array.isArray(p?.eye) || p.eye.length !== 3
            || !Array.isArray(p?.look) || p.look.length !== 3) {
            throw new ShareError(`camera pose ${i}: not 8 integers`);
        }
        const nums = [p.slot, ...p.eye, ...p.look, p.fov];
        if (!nums.every(Number.isInteger)) {
            throw new ShareError(`camera pose ${i}: not 8 integers`);
        }
        if (p.slot < 0 || p.slot >= CP_SLOT_MAX || p.slot <= prevSlot) {
            throw new ShareError(`camera pose ${i}: slot ${p.slot} out of order `
                + `or out of 0..${CP_SLOT_MAX - 1}`);
        }
        prevSlot = p.slot;
        slots.add(p.slot);
        const [ex, ey, eh] = p.eye;
        const [lx, ly, lh] = p.look;
        if (Math.abs(ex) > CP_EYE_XY_MM || Math.abs(ey) > CP_EYE_XY_MM
            || eh < CP_EYE_H_MM[0] || eh > CP_EYE_H_MM[1]
            || Math.abs(lx) > CP_LOOK_XY_MM || Math.abs(ly) > CP_LOOK_XY_MM
            || lh < CP_LOOK_H_MM[0] || lh > CP_LOOK_H_MM[1]) {
            throw new ShareError(`camera pose ${i}: outside the table envelope`);
        }
        if (p.fov < CP_FOV_DD[0] || p.fov > CP_FOV_DD[1]) {
            throw new ShareError(`camera pose ${i}: fov ${p.fov} out of `
                + `${CP_FOV_DD[0]}..${CP_FOV_DD[1]} decidegrees`);
        }
    }
    let prevSeg = 0, prevT = -1;
    for (let i = 0; i < plan.cuts.length; i++) {
        const c = plan.cuts[i];
        const nums = [c?.seg, c?.t, c?.cam, c?.transitionIn, c?.dur];
        if (!nums.every(Number.isInteger)) {
            throw new ShareError(`camera cut ${i}: not 5 integers`);
        }
        if (c.seg < 0 || (shotCount !== undefined && c.seg >= shotCount)) {
            throw new ShareError(`camera cut ${i}: shot index ${c.seg} out of range`);
        }
        if (c.t < 0 || c.t > CP_T_MAX) {
            throw new ShareError(`camera cut ${i}: anchor ${c.t} out of `
                + `0..${CP_T_MAX} centiseconds`);
        }
        if (c.seg < prevSeg || (c.seg === prevSeg && c.t < prevT)) {
            throw new ShareError(`camera cut ${i}: anchors must be non-decreasing in (seg, t)`);
        }
        [prevSeg, prevT] = [c.seg, c.t];
        if (c.cam < 0 || c.cam > CP_ID_MAX
            || c.transitionIn < 0 || c.transitionIn > CP_ID_MAX) {
            throw new ShareError(`camera cut ${i}: cam/transition id out of the `
                + `registry envelope 0..${CP_ID_MAX}`);
        }
        // a referenced CUSTOM slot must ship its pose (design cap discipline;
        // reserved 6-7 and future >= 16 ids ride through to apply-time degrade)
        if (c.cam >= 8 && c.cam < 8 + CP_SLOT_MAX && !slots.has(c.cam - 8)) {
            throw new ShareError(`camera cut ${i}: custom cam ${c.cam} has no pose for slot ${c.cam - 8}`);
        }
        if (c.dur < 0 || c.dur > CP_FADE_CAP_CS) {
            throw new ShareError(`camera cut ${i}: duration ${c.dur} out of `
                + `0..${CP_FADE_CAP_CS} centiseconds`);
        }
        // transition/duration pairing (the #301 model law for the KNOWN ids;
        // unknown future ids carry whatever their future semantics need)
        if (c.transitionIn === 2 && c.dur < 1) {
            throw new ShareError(`camera cut ${i}: a fade needs a duration`);
        }
        if ((c.transitionIn === 0 || c.transitionIn === 1) && c.dur !== 0) {
            throw new ShareError(`camera cut ${i}: cut/move transitions carry duration 0`);
        }
    }
}
/** Encode a camera plan into the `cp` param blob. Returns '' for an EMPTY
 * plan (no cuts, no poses) — the caller must then omit the param entirely
 * (empty plan = zero bytes over today's link). Throws ShareError on a
 * plan outside the envelope (the app-side consumer drops the plan with a
 * visible notice — honest degrade, never silent truncation). */
export async function encodeCameraPlan(plan, shotCount) {
    // shape gate BEFORE the emptiness dereference (review r4 P2): untyped
    // JS callers handing null/{}/non-array axes must get the documented
    // ShareError, never a TypeError.
    if (typeof plan !== 'object' || plan === null
        || !Array.isArray(plan.cuts) || !Array.isArray(plan.poses)) {
        throw new ShareError('camera plan has the wrong shape');
    }
    if (plan.cuts.length === 0 && plan.poses.length === 0)
        return '';
    validateCameraPlan(plan, shotCount);
    const wire = [
        CAMERA_PLAN_WIRE_VERSION,
        plan.cuts.map((c) => [c.seg, c.t, c.cam, c.transitionIn, c.dur]),
        plan.poses.map((p) => [p.slot, ...p.eye, ...p.look, p.fov]),
    ];
    const bytes = new TextEncoder().encode(JSON.stringify(wire));
    return toBase64url(await deflate(bytes));
}
/** Decode a `cp` param blob. Throws ShareError on malformed/truncated
 * input or an unknown cp wire version — the consumer must catch and
 * IGNORE (one console warn; the replay plays with the default camera).
 * `shotCount` = the carrying share's shot count (open-time
 * cross-validation: every `seg` must index a shared shot). */
export async function decodeCameraPlan(text, shotCount) {
    // amplification bounds FIRST (review GH-302 r1 P2): blob chars against
    // the URL envelope, inflate output against the plan ceiling — both
    // bind before any JSON.parse / tuple allocation.
    if (text.length > SHARE_URL_ENVELOPE) {
        throw new ShareError(`camera plan blob is ${text.length} chars — past the share-URL `
            + `envelope ${SHARE_URL_ENVELOPE}`);
    }
    const json = new TextDecoder().decode(await inflateBounded(fromBase64url(text), CP_INFLATED_MAX));
    let wire;
    try {
        wire = JSON.parse(json);
    }
    catch {
        throw new ShareError('camera plan is not valid JSON after inflate');
    }
    if (!Array.isArray(wire)) {
        throw new ShareError('camera plan has the wrong shape');
    }
    // version gate BEFORE the shape checks (the decodeShare discipline): a
    // future cp layout may change everything after the tag.
    const v = wire[0];
    if (v !== CAMERA_PLAN_WIRE_VERSION) {
        throw new ShareError(`camera plan v${String(v)} is not supported `
            + `(this build reads v${CAMERA_PLAN_WIRE_VERSION})`);
    }
    if (wire.length !== 3 || !Array.isArray(wire[1]) || !Array.isArray(wire[2])) {
        throw new ShareError('camera plan has the wrong shape');
    }
    const cuts = wire[1].map((t, i) => {
        if (!Array.isArray(t) || t.length !== 5
            || t.some((n) => typeof n !== 'number')) {
            throw new ShareError(`camera cut ${i}: wire tuple has the wrong shape`);
        }
        const [seg, tCs, cam, trans, dur] = t;
        return { seg: seg, t: tCs, cam: cam, transitionIn: trans, dur: dur };
    });
    const poses = wire[2].map((t, i) => {
        if (!Array.isArray(t) || t.length !== 8
            || t.some((n) => typeof n !== 'number')) {
            throw new ShareError(`camera pose ${i}: wire tuple has the wrong shape`);
        }
        const [slot, ex, ey, eh, lx, ly, lh, fov] = t;
        return {
            slot: slot, eye: [ex, ey, eh], look: [lx, ly, lh], fov: fov,
        };
    });
    const plan = { cuts, poses };
    validateCameraPlan(plan, shotCount);
    return plan;
}
