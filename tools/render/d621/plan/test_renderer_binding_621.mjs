// Copyright (c) Meta Platforms, Inc. and affiliates.

// Synthetic byte fixtures test served provenance, not geometry or tolerances.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {measureServedRenderer, RENDERER_FILES} from './renderer_binding_621.mjs';
import {waitForHttpReadiness} from '../../../../web/tools/cdp.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fixture = () => Object.fromEntries(RENDERER_FILES.map(name => [name, Buffer.from(`// served ${name}\n`)]));
const serve = files => async url => new Response(files[new URL(url).pathname.replace('/candidate/web/', '')]);
// Synthetic fetches bind no socket; a lane pin still controls their origin.
const fixtureOrigin = new URL('http://127.0.0.1');
fixtureOrigin.port = process.env.OB_E2E_PORT ?? '';
const page = new URL('/candidate/web/app.html?table=diamond_proam_8ft', fixtureOrigin).href;
const rootUrl = new URL('.', page).href;

async function withEnv(values, run) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('the digest uses HTTP response bytes from the page root, with cache bypass', async () => {
  const files = fixture();
  const seen = [];
  const result = await measureServedRenderer(page, async (url, options) => {
    seen.push(String(url));
    assert.equal(options.cache, 'no-store');
    return serve(files)(url);
  });
  assert.equal(result.root_url, new URL('/candidate/web/', fixtureOrigin).href);
  assert.deepEqual(seen, [rootUrl, ...[...RENDERER_FILES].sort().map(name => result.root_url + name)]);
  for (const [name, bytes] of Object.entries(files)) assert.equal(result.files[name], sha(bytes));
});

test('a one-byte change to each served renderer file changes the digest', async () => {
  const files = fixture();
  const original = await measureServedRenderer(page, serve(files));
  for (const name of RENDERER_FILES) {
    const changed = {...files, [name]: Buffer.concat([files[name], Buffer.from(' ')])};
    const result = await measureServedRenderer(page, serve(changed));
    assert.notEqual(result.sha256, original.sha256, name);
    assert.notEqual(result.files[name], original.files[name], name);
  }
});

test('an absent served file refuses instead of hashing an error page', async () => {
  await assert.rejects(measureServedRenderer(page, async () => new Response('missing', {status: 404})),
    /letters served renderer.*scene\/.*HTTP 404/);
});

test('HTTP capture and Python archive binding have the same named-file digest', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'd621-renderer-binding-'));
  try {
    mkdirSync(path.join(root, 'scene'));
    for (const [name, bytes] of Object.entries(fixture())) writeFileSync(path.join(root, name), bytes);
    const captured = await measureServedRenderer(page, async url => String(url) === rootUrl
      ? new Response('ready')
      : new Response(readFileSync(path.join(root, new URL(url).pathname.replace('/candidate/web/', '')))));
    const card = fileURLToPath(new URL('../card/', import.meta.url));
    const result = spawnSync('python3', ['-B', '-c',
      'import json,sys; from pathlib import Path; sys.path.insert(0,sys.argv[1]); '
      + 'from o22_pack_621 import renderer_digest; print(json.dumps(renderer_digest(Path(sys.argv[2]))))', card, root],
    {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const archive = JSON.parse(result.stdout);
    assert.equal(captured.sha256, archive.sha256);
    assert.deepEqual(captured.files, archive.files);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

// TESSELLATION: synthetic network failures, not geometry or measurement bars.
test('the identity opt-out cannot bypass startup retries before renderer bytes', async () => {
  await withEnv({OB_SKIP_TREE_PREFLIGHT: '1'}, async () => {
    const seen = [];
    let starting = true;
    const files = fixture();
    const result = await measureServedRenderer(page, async (url, options) => {
      seen.push(String(url));
      if (String(url) === rootUrl) {
        assert.equal(options.redirect, 'manual');
        if (starting) {
          starting = false;
          throw new TypeError('fetch failed', {cause: {code: 'ECONNREFUSED'}});
        }
      }
      return serve(files)(url);
    });
    assert.deepEqual(seen, [rootUrl, rootUrl, ...[...RENDERER_FILES].sort().map(name => rootUrl + name)]);
    for (const [name, bytes] of Object.entries(files)) assert.equal(result.files[name], sha(bytes));
  });
});

// TESSELLATION: a response status establishes transport readiness, not identity.
test('HTTP readiness accepts an error status without following a redirect or judging bytes', async () => {
  const ready = await waitForHttpReadiness(page, async (url, options) => {
    assert.equal(String(url), rootUrl);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.cache, 'no-store');
    return new Response('no index at this root', {status: 404});
  });
  assert.deepEqual(ready, {root_url: rootUrl, status: 404});
});

// TESSELLATION: short runtime deadline fixture; the real arms retain 15000 ms.
test('the identity opt-out cannot bypass a named readiness deadline', async () => {
  await withEnv({OB_SKIP_TREE_PREFLIGHT: '1', OB_CDP_PREFLIGHT_MS: '50'}, async () => {
    const seen = [];
    await assert.rejects(measureServedRenderer(page, async url => {
      seen.push(String(url));
      throw new TypeError('fetch failed', {cause: {code: 'ECONNREFUSED'}});
    }), /served-tree preflight: nothing answers .*candidate\/web\/app.html within 50 ms.*never bound/);
    assert.ok(seen.length > 0);
    assert.ok(seen.every(url => url === rootUrl));
  });
});

// TESSELLATION: hold the test event loop while AbortSignal's unref'd timer fires.
test('a listener that never sends headers is bounded by the same readiness deadline', async () => {
  await withEnv({OB_SKIP_TREE_PREFLIGHT: '1', OB_CDP_PREFLIGHT_MS: '50'}, async () => {
    const keepAlive = setInterval(() => {}, 1000);
    let signal;
    try {
      await assert.rejects(waitForHttpReadiness(page, async (_url, options) => {
        signal = options.signal;
        return new Promise((_resolve, reject) => signal.addEventListener('abort',
          () => reject(signal.reason), {once: true}));
      }), /I\/O-STARVED host.*NOT a tree verdict/);
      assert.equal(signal.aborted, true);
    } finally {
      clearInterval(keepAlive);
    }
  });
});

// TESSELLATION: a stalled first request must leave time for a healthy retry.
test('readiness retries a stalled first request inside the shared deadline', async () => {
  await withEnv({OB_SKIP_TREE_PREFLIGHT: '1', OB_CDP_PREFLIGHT_MS: '3500'}, async () => {
    const keepAlive = setInterval(() => {}, 1000);
    let requests = 0;
    let firstSignal;
    try {
      await waitForHttpReadiness(page, async (_url, {signal}) => {
        requests++;
        if (requests > 1) return new Response('ready');
        firstSignal = signal;
        return new Promise((_resolve, reject) => signal.addEventListener('abort',
          () => reject(signal.reason), {once: true}));
      });
      assert.equal(firstSignal.aborted, true);
      assert.equal(requests, 2);
    } finally {
      clearInterval(keepAlive);
    }
  });
});

// TESSELLATION: every healthy response takes 5 s, beyond the initial windows.
test('default readiness retains the bounded starvation extension for slow headers', async () => {
  await withEnv({OB_CDP_PREFLIGHT_MS: '', OB_GATE_RTT_FILE: '', OB_GATE_RTT_P50_MS: ''}, async () => {
    const started = Date.now();
    let requests = 0;
    const ready = await waitForHttpReadiness(page, async (_url, {signal}) => {
      requests++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort);
          resolve(new Response('ready'));
        }, 5000);
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        signal.addEventListener('abort', abort, {once: true});
      });
    });
    assert.equal(ready.status, 200);
    assert.ok(requests > 1);
    // DERIVED: the default base budget and existing starvation cap plus tick.
    assert.ok(Date.now() - started > 15000);
    assert.ok(Date.now() - started <= 60000 + 250);
  });
});
