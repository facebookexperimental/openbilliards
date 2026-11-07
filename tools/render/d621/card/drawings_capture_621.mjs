// Copyright (c) Meta Platforms, Inc. and affiliates.

// Archive-generated S2/S4 SVGs, rendered with the ordered Chrome for visual QA.
// No purchased-model asset is read. Original SVG bytes remain untouched.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from '../../../../web/tools/cdp.mjs';

const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--letters-root', '--out'].includes(args[i]) || !args[i + 1]) throw new Error('usage: --letters-root DIR --out NEW_DIR');
  opt[args[i]] = args[i + 1];
}
if (!opt['--letters-root'] || !opt['--out']) throw new Error('both paths are required');
const input = path.resolve(opt['--letters-root']), output = path.resolve(opt['--out']);
if (fs.existsSync(output)) throw new Error('preserve earlier evidence; output already exists');
fs.mkdirSync(output, { recursive: true });
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const records = [];
function arrangeNotes(sheet) {
  const svg = document.documentElement;
  const texts = [...svg.querySelectorAll('text')];
  const normalized = (text) => text.replace(/\s+/g, ' ').trim();
  const contentBefore = texts.map((node) => normalized(node.textContent));
  const geometry = () => [...svg.children].filter((node) => node.localName !== 'text').map((node) => node.outerHTML);
  const geometryBefore = geometry();
  const changes = [];
  if (sheet === 's2-side') {
    const feather = texts.filter((node) => node.textContent.startsWith('featherstrip (CU-04'));
    const notch = texts.filter((node) => node.textContent.startsWith('cap notch r') && node.textContent.includes('SP-10'));
    if (feather.length !== 1 || notch.length !== 1) throw new Error('S2 note anchors changed');
    const a = feather[0].getBBox(), b = notch[0].getBBox();
    if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
      // TESSELLATION: document-label clearance only; no drawing primitive moves.
      const before = Number(feather[0].getAttribute('y'));
      const after = before + b.y + b.height - a.y + 5;
      feather[0].setAttribute('y', after);
      changes.push({ note: 'S2 featherstrip overlap', before, after });
    }
  } else if (sheet === 's4-rail-apron-elevation') {
    // TESSELLATION: derive the bounds from this sheet's own unchanged ledger
    // rectangle; the nine-foot sheet has a shorter frame than the size variants.
    const frames = [...svg.querySelectorAll('rect')].filter((node) => Number(node.getAttribute('x')) === 900);
    if (frames.length !== 1) throw new Error('S4 ledger frame anchor changed');
    const frame = frames[0];
    const left = Number(frame.getAttribute('x')), top = Number(frame.getAttribute('y'));
    // TESSELLATION: existing horizontal text inset, line pitch, and bottom inset.
    const right = left + Number(frame.getAttribute('width')) - 12, pitch = 12;
    const frameBottom = top + Number(frame.getAttribute('height')), bottom = frameBottom - 5;
    const titles = texts.filter((node) => /^C\d+ —/.test(node.textContent));
    if (titles.length !== 8) throw new Error('S4 conflict ledger anchors changed');
    const originalY = new Map(texts.map((node) => [node, Number(node.getAttribute('y'))]));
    const expansions = [];
    for (const node of titles) {
      const words = normalized(node.textContent).split(' '), lines = [];
      const x = Number(node.getAttribute('x'));
      let line = '';
      for (const word of words) {
        const candidate = line ? line + ' ' + word : word;
        node.textContent = candidate;
        if (line && node.getComputedTextLength() > right - x) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      lines.push(line);
      node.textContent = '';
      for (const [ordinal, value] of lines.entries()) {
        const span = document.createElementNS(svg.namespaceURI, 'tspan');
        span.setAttribute('x', x);
        span.setAttribute('dy', ordinal ? pitch : 0);
        span.textContent = (ordinal ? ' ' : '') + value;
        node.appendChild(span);
      }
      if (lines.length > 1) {
        expansions.push({ y: originalY.get(node), extra: (lines.length - 1) * pitch });
        changes.push({ note: words[0], lines: lines.length });
      }
    }
    for (const node of texts) {
      // TESSELLATION: only right-ledger text below a wrapped title is reflowed.
      const y = originalY.get(node), x = Number(node.getAttribute('x'));
      if (x < left || y < top || y >= frameBottom) continue;
      const extra = expansions.filter((row) => row.y < y).reduce((sum, row) => sum + row.extra, 0);
      if (extra) node.setAttribute('y', y + extra);
    }
    // TESSELLATION: retain font sizes and the fixed ledger frame. If wrapping
    // consumes the existing bottom margin, redistribute only note baselines.
    const notes = texts.filter((node) => Number(node.getAttribute('x')) >= left
      && originalY.get(node) >= 466 && originalY.get(node) < frameBottom);
    const baselines = notes.map((node) => Number(node.getAttribute('y')));
    const origin = Math.min(...baselines), last = Math.max(...baselines);
    const descender = Math.max(...notes.map((node) => {
      const bounds = node.getBBox();
      return bounds.y + bounds.height - Number(node.getAttribute('y'));
    }));
    // TESSELLATION: one SVG unit of inset from the fixed fit-check bottom.
    const scale = Math.min(1, (bottom - 1 - origin - descender) / (last - origin));
    if (scale < 1) {
      for (const node of notes) node.setAttribute('y', origin + (Number(node.getAttribute('y')) - origin) * scale);
      changes.push({ note: 'S4 open-item line pitch only; font sizes retained', scale });
    }
    for (const node of texts) {
      // TESSELLATION: the fixed right-ledger frame, independent of scene geometry.
      if (Number(node.getAttribute('x')) < left || originalY.get(node) < top || originalY.get(node) >= frameBottom) continue;
      const bounds = node.getBBox();
      if (bounds.x + bounds.width > right || bounds.y + bounds.height > bottom) {
        throw new Error('S4 ledger remains outside its frame: ' + node.textContent);
      }
    }
  } else throw new Error('only the ordered S2/S4 sheets may be arranged');
  if (JSON.stringify(contentBefore) !== JSON.stringify(texts.map((node) => normalized(node.textContent)))) {
    throw new Error('annotation layout changed drawing text');
  }
  if (JSON.stringify(geometryBefore) !== JSON.stringify(geometry())) throw new Error('annotation layout changed drawing geometry');
  return { changes, text_unchanged: true, geometry_unchanged: true, svg: new XMLSerializer().serializeToString(svg) };
}
const http = Number(process.env.OB_E2E_PORT);
if (!http || !Number(process.env.OB_E2E_CDP_PORT)) throw new Error('pin the lane HTTP and CDP ports');
// DERIVED: the existing lane launcher intentionally accepts HTTP page targets,
// not file: targets. Serve the generated SVGs read-only on the same lane band.
const server = spawnStaticServer(input, http);
await sleep(800);
try {
for (const size of ['9ft', '8ft', '7ft']) {
  const twin = path.join(input, `letters-${size}`, 'twin');
  for (const sheet of ['s2-side', 's4-rail-apron-elevation']) {
    const files = fs.readdirSync(twin).filter((name) => name.endsWith(`-${sheet}.svg`));
    if (files.length !== 1) throw new Error(`expected one ${size} ${sheet} SVG`);
    const file = path.join(twin, files[0]), png = path.join(output, `${size}-${sheet}.png`);
    const source = fs.readFileSync(file, 'utf8');
    const viewBox = source.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if (!viewBox) throw new Error('missing drawing viewport');
    // TESSELLATION: twice the source SVG viewport, preserving its aspect ratio.
    const width = Number(viewBox[1]) * 2, height = Number(viewBox[2]) * 2;
    let chrome;
    const before = os.loadavg();
    try {
      const relative = path.relative(input, file).split(path.sep).map(encodeURIComponent).join('/');
      chrome = await launchChrome(`http://127.0.0.1:${http}/${relative}`,
        { port: Number(process.env.OB_E2E_CDP_PORT), width, height });
      await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      let ready = false;
      for (let poll = 0; poll < 100 && !ready; poll++) {
        await sleep(100);
        ready = await chrome.eval("document.documentElement.localName === 'svg'").catch(() => false);
      }
      if (!ready) throw new Error('SVG did not load');
      await chrome.eval(`(() => { const svg = document.documentElement;
        svg.setAttribute('width', '${width}'); svg.setAttribute('height', '${height}'); return true; })()`);
      const layout = await chrome.eval(`(${arrangeNotes.toString()})(${JSON.stringify(sheet)})`);
      const layoutFile = path.join(output, `${size}-${sheet}-layout.svg`);
      fs.writeFileSync(layoutFile, layout.svg);
      delete layout.svg;
      await chrome.screenshot(png);
      fs.copyFileSync(file, path.join(output, `${size}-${sheet}.svg`));
      records.push({ size, sheet, svg_sha256: sha(file), png_sha256: sha(png),
        source: file, png: path.basename(png), layout_svg: path.basename(layoutFile), layout_svg_sha256: sha(layoutFile),
        annotation_layout: layout, width, height, load_average: { before, after: os.loadavg() } });
      console.log(`[drawing] ${size} ${sheet} ${width}x${height}; load=${JSON.stringify(os.loadavg())}`);
    } finally {
      if (chrome && await chrome.closeAndWait() === false) throw new Error('Chrome teardown unconfirmed');
    }
  }
}
} finally {
  await stopStaticServer(server);
}
fs.writeFileSync(path.join(output, 'DRAWINGS.json'), JSON.stringify({ tool: 'drawings_capture_621', records }, null, 2) + '\n');
