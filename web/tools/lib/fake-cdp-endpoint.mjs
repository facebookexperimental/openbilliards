// Copyright (c) Meta Platforms, Inc. and affiliates.

// fake-cdp-endpoint.mjs — #1221: a scripted stand-in for Chrome's DevTools endpoint, so node tests drive cdp.mjs's REAL
// client (launchChrome, the protocol-error reply path, answerPausedRequest) and the gates built on it (the lighting
// matrix's instrument-error line) without a browser.
//
// Run it as the exec target of a CHROME_BIN wrapper — the wrapper contract (cdp.mjs resolveChromeBinary):
//   #!/bin/sh
//   exec /path/to/node /path/to/fake-cdp-endpoint.mjs "$@"
// so the listener IS the tracked child. It reads --remote-debugging-port=<port> from the launch arguments, answers
// /json/version and /json/list (one page target at the launch URL) and speaks just enough WebSocket (RFC 6455: text
// frames, ping, close) to answer every command:
//   OB_FAKE_DEVTOOLS_RULES  JSON list of { method, match?, error? | result? | silent? | close? | delay? }. The FIRST rule
//                           whose `method` is the command's and whose `match` (a RegExp source) finds params.expression
//                           (a navigation's params.url) answers it: with `error` (Chrome's { code, message, data? }),
//                           with `result`, or never (`silent`); `close` answers as usual, then drops the socket (a lost
//                           browser); `delay` (ms) holds the answer back, so a later command's answer can land first.
//                           Unmatched: Runtime.evaluate -> { result: { type: 'boolean', value: true } }, anything
//                           else -> {}.
//   OB_FAKE_DEVTOOLS_LOG    a file: one JSON line per command received ({ id, method, params }).
// Node built-ins only. SIGTERM / SIGINT end it, as they end a browser, and so does its parent going away.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';

const portArg = process.argv.find((a) => a.startsWith('--remote-debugging-port='));
const PORT = Number(portArg?.slice('--remote-debugging-port='.length));
if (!Number.isInteger(PORT) || PORT <= 0) {
  console.error('[fake-cdp] no --remote-debugging-port=<port> among the launch arguments');
  process.exit(2);
}
const RULES = JSON.parse(process.env.OB_FAKE_DEVTOOLS_RULES || '[]');
const LOG = process.env.OB_FAKE_DEVTOOLS_LOG || null;
const PAGE_URL = process.argv.slice(2).find((a) => /^https?:\/\//.test(a)) ?? `http://127.0.0.1:${PORT}/`;
const WS_PATH = '/devtools/page/FAKE';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const server = http.createServer((req, res) => {
  const body = req.url === '/json/version'
    ? { Browser: 'FakeChrome/1.0 (#1221)', webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}/devtools/browser/FAKE` }
    : req.url === '/json/list' || req.url === '/json'
      ? [{ id: 'FAKE', type: 'page', title: 'fake', url: PAGE_URL, webSocketDebuggerUrl: `ws://127.0.0.1:${PORT}${WS_PATH}` }]
      : null;
  res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(body ? JSON.stringify(body) : '');
});

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url !== WS_PATH || !key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const frame = (opcode, payload) => { // server frames are never masked
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | opcode, n]);
    else if (n < 65536) head = Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]);
    else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    sock.write(Buffer.concat([head, payload]));
  };
  const answer = (text) => {
    const { id, method, params = {} } = JSON.parse(text);
    if (LOG) fs.appendFileSync(LOG, JSON.stringify({ id, method, params }) + '\n');
    const rule = RULES.find((r) => r.method === method
      && (!r.match || new RegExp(r.match).test(String(params.expression ?? params.url ?? ''))));
    if (rule?.silent) return;
    const reply = rule?.error ? { id, error: rule.error }
      : { id, result: rule?.result ?? (method === 'Runtime.evaluate' ? { result: { type: 'boolean', value: true } } : {}) };
    const send = () => {
      frame(1, Buffer.from(JSON.stringify(reply)));
      if (rule?.close) sock.end(); // the reply is flushed, then the TCP connection ends with no close frame
    };
    if (rule?.delay > 0) setTimeout(send, rule.delay); else send();
  };
  let buf = Buffer.alloc(0);
  let parts = [];
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0, opcode = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const start = off + (masked ? 4 : 0);
      if (buf.length < start + len) return;
      const data = Buffer.from(buf.subarray(start, start + len));
      if (masked) for (let i = 0; i < data.length; i++) data[i] ^= buf[off + (i & 3)];
      buf = buf.subarray(start + len);
      if (opcode === 8) { frame(8, Buffer.alloc(0)); sock.end(); return; }
      if (opcode === 9) { frame(10, data); continue; }
      if (opcode === 1 || opcode === 0) {
        parts.push(data);
        if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; answer(text); }
      }
    }
  });
  sock.on('error', () => { /* the client went away */ });
});

server.listen(PORT, '127.0.0.1');
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));
const PARENT = process.ppid; // a launcher killed without its teardown must not leave this listener behind
setInterval(() => { if (process.ppid !== PARENT) process.exit(0); }, 1000).unref();
