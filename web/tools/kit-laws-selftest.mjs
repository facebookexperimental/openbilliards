// Copyright (c) Meta Platforms, Inc. and affiliates.

// kit-laws-selftest.mjs — GH-877 node-only selftest for the kit-laws A2 sampler
// (a2Sample). Stub CDP clients + a synthetic PNG (zlib; decoded by kit-laws
// decodePng). No browser. Usage: node web/tools/kit-laws-selftest.mjs [--selftest]
// Arms: POSITIVE (agreeing reads -> byte-identical judge output to today's
// direct runs+still path), PLANT1 (first read text-1 ink, still dim-3 wash ->
// today's path reds 4.07:1, sampler retries and reports unsettled),
// PLANT2 (facts-less probe running forever -> bounded animating unsettled),
// PLANT3 (infinite animation on a non-run, non-ancestor, non-intersecting
// element -> settles, judge byte-identical to POSITIVE), CONTROL4 (running
// animation on a run ancestor -> animating unsettled), CONTROL4B (the same
// ancestor hit with a box that touches no run -> unsettled by the hit alone),
// CONTROL5 (running animation on a non-ancestor whose box intersects a run
// box -> unsettled).
import zlib from 'node:zlib';
import { a2Sample, a2SettleJs, A2_SAMPLE_BUDGET, decodePng, judgeTextGround } from './kit-laws.mjs';

const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function encodePng(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = []; for (let y = 0; y < h; y++) { const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; } rows.push(row); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

const GROUND = [51, 78, 98]; // the accent-dim-3 wash over glass-solid, rgb(51,78,98)
const TEXT1 = [181, 177, 164, 255]; // --ob-text-1 as the instrument reports it
const ACCENT = [198, 218, 245, 255]; // settled --ob-accent-text register (light accent ink)
const W = 100, H = 40;
const pngB64 = encodePng(W, H, GROUND).toString('base64');
const run = (ink) => ({ name: 'span[shell.place.play]', text: 'Play', fs: 16, ink, x: 10, y: 10, w: 50, h: 16 });

// Stub CDP client: settle evals answered from `running`; runs evals cycle `reads`.
function stub({ reads, running = 0 }) {
  let i = 0;
  return {
    eval: async (js) => (js === a2SettleJs() || js.includes('document.getAnimations') ? { running, total: running } : reads[Math.min(i++, reads.length - 1)]),
    send: async () => ({ data: pngB64 }),
  };
}
const cyclingStub = ({ reads, running = 0 }) => { let i = 0; return { eval: async (js) => (js.includes('document.getAnimations') ? { running, total: running } : reads[i++ % reads.length]), send: async () => ({ data: pngB64 }) }; };
// Fact stub (STEER-1 probe shape): settle evals return raw per-animation facts.
const factStub = ({ reads, facts }) => { let i = 0; return { eval: async (js) => (js.includes('document.getAnimations') ? { running: facts.length, facts } : reads[Math.min(i++, reads.length - 1)]), send: async () => ({ data: pngB64 }) }; };
let positiveLine = null;

let failed = 0;
const check = (label, ok, line) => { console.log(line); if (!ok) { failed++; console.log(`SELFTEST FAIL: ${label}`); } };

// POSITIVE: two reads agree -> sampler judge output byte-identical to today's path.
{
  const runs = [run(ACCENT)];
  const s = await a2Sample(stub({ reads: [runs, runs] }), { w: W, h: H, settlePollMs: 0 });
  const viaSampler = judgeTextGround(s.runs ?? [], s.img ?? decodePng(Buffer.from(pngB64, 'base64')), { cssW: W, min: 99 });
  const viaToday = judgeTextGround(runs, decodePng(Buffer.from(pngB64, 'base64')), { cssW: W, min: 99 });
  check('positive settled', s.settled === true && s.moved === 0, `POSITIVE settled=${s.settled} attempts=${s.attemptsUsed} settlePolls=${s.settlePollsUsed}`);
  positiveLine = viaSampler[0] ?? '[]';
  check('positive byte-identical', JSON.stringify(viaSampler) === JSON.stringify(viaToday), `POSITIVE sampler-judge: ${viaSampler[0] ?? '[]'}`);
  console.log(`POSITIVE today-judge:   ${viaToday[0] ?? '[]'}`);
  check('positive passes at 4.5', judgeTextGround(s.runs ?? [], s.img, { cssW: W }).length === 0, `POSITIVE at-4.5 violations=${judgeTextGround(s.runs ?? [], s.img, { cssW: W }).length}`);
}

// PLANT1: first read text-1, still dim-3 wash. Today reds 4.07:1; sampler re-read
// carries the settled accent ink, reads never agree (stub alternates), retries
// exhaust the budget -> unsettled instrument row, no contrast verdict.
{
  const today = judgeTextGround([run(TEXT1)], decodePng(Buffer.from(pngB64, 'base64')), { cssW: W });
  console.log(`PLANT1 today: ${today[0] ?? '[]'}`);
  check('plant1 today reds 4.07', today.length === 1 && today[0].includes('4.07:1'), `PLANT1 today-check lines=${today.length}`);
  const s = await a2Sample(cyclingStub({ reads: [[run(TEXT1)], [run(ACCENT)]] }), { w: W, h: H, settlePollMs: 0 });
  check('plant1 unsettled', s.settled === false && s.unsettled === 'A2 unsettled: 1 runs moved' && s.attemptsUsed === A2_SAMPLE_BUDGET.attempts,
    `PLANT1 sampler: ${s.unsettled} (attempts ${s.attemptsUsed}/${A2_SAMPLE_BUDGET.attempts}, settlePolls ${s.settlePollsUsed})`);
}

// PLANT2: settle probe running forever -> bounded animating unsettled inside the poll budget.
{
  const s = await a2Sample(stub({ reads: [[run(ACCENT)]], running: 1 }), { w: W, h: H, settlePollMs: 0 });
  check('plant2 bounded unsettled', s.settled === false && s.reason === 'animating' && s.unsettled === 'A2 unsettled: animating (1 running on judged runs)' && s.settlePollsUsed === A2_SAMPLE_BUDGET.settlePolls,
    `PLANT2 sampler: ${s.unsettled} (settle polls ${s.settlePollsUsed}/${A2_SAMPLE_BUDGET.settlePolls}, attempts ${s.attemptsUsed})`);
}

// PLANT3 (STEER-1): infinite animation on an element that is neither a run, nor
// an ancestor, nor intersecting any run box (cardrail-spin shape: box at
// x80/y30, run box x10..60/y10..26) -> must SETTLE, judge byte-identical to POSITIVE.
{
  const runs = [run(ACCENT)];
  const s = await a2Sample(factStub({ reads: [runs, runs], facts: [{ box: { x: 80, y: 30, w: 10, h: 5 }, hits: [false] }] }), { w: W, h: H, settlePollMs: 0 });
  const line = s.settled ? (judgeTextGround(s.runs, s.img, { cssW: W, min: 99 })[0] ?? '[]') : 'UNSETTLED';
  check('plant3 unrelated animation settles', s.settled === true, `PLANT3 settled=${s.settled} attempts=${s.attemptsUsed} settlePolls=${s.settlePollsUsed}`);
  check('plant3 judge identical to positive', line === positiveLine, `PLANT3 sampler-judge: ${line}`);
}

// CONTROL4 (STEER-1): running animation whose target is a judged run's ancestor
// (hits [true]) -> bounded animating unsettled with the animating text.
{
  const s = await a2Sample(factStub({ reads: [[run(ACCENT)]], facts: [{ box: { x: 0, y: 0, w: 100, h: 40 }, hits: [true] }] }), { w: W, h: H, settlePollMs: 0 });
  check('control4 ancestor blocks', s.settled === false && s.reason === 'animating' && s.unsettled === 'A2 unsettled: animating (1 running on judged runs)' && s.settlePollsUsed === A2_SAMPLE_BUDGET.settlePolls,
    `CONTROL4 sampler: ${s.unsettled} (settle polls ${s.settlePollsUsed}/${A2_SAMPLE_BUDGET.settlePolls}, attempts ${s.attemptsUsed})`);
}

// CONTROL4B: CONTROL4's box contains the run, so the box rule alone reds it and
// the ancestor-hit branch goes unexercised. Here the hit comes with a box that
// touches no run (a display: contents ancestor reports a zero rect) -> the hit
// alone must block.
{
  const s = await a2Sample(factStub({ reads: [[run(ACCENT)]], facts: [{ box: { x: 0, y: 0, w: 0, h: 0 }, hits: [true] }] }), { w: W, h: H, settlePollMs: 0 });
  check('control4b ancestor hit blocks without box overlap', s.settled === false && s.reason === 'animating' && s.unsettled === 'A2 unsettled: animating (1 running on judged runs)' && s.settlePollsUsed === A2_SAMPLE_BUDGET.settlePolls,
    `CONTROL4B sampler: ${s.unsettled} (settle polls ${s.settlePollsUsed}/${A2_SAMPLE_BUDGET.settlePolls}, attempts ${s.attemptsUsed})`);
}

// CONTROL5 (STEER-1): running animation on a non-ancestor (hits [false]) whose
// box intersects a run box -> bounded animating unsettled.
{
  const s = await a2Sample(factStub({ reads: [[run(ACCENT)]], facts: [{ box: { x: 20, y: 12, w: 10, h: 10 }, hits: [false] }] }), { w: W, h: H, settlePollMs: 0 });
  check('control5 intersecting blocks', s.settled === false && s.reason === 'animating' && s.unsettled === 'A2 unsettled: animating (1 running on judged runs)' && s.settlePollsUsed === A2_SAMPLE_BUDGET.settlePolls,
    `CONTROL5 sampler: ${s.unsettled} (settle polls ${s.settlePollsUsed}/${A2_SAMPLE_BUDGET.settlePolls}, attempts ${s.attemptsUsed})`);
}

console.log(failed ? `SELFTEST RESULT: FAIL (${failed} check(s))` : 'SELFTEST RESULT: PASS (positive identical, plant1 unsettled, plant2 bounded, plant3 non-blocking settles, control4 ancestor blocks, control4b hit alone blocks, control5 intersecting blocks)');
process.exit(failed ? 1 : 0);
