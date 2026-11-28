// Copyright (c) Meta Platforms, Inc. and affiliates.

// capture-out.mjs — #1290: an e2e suite's screenshots go to an output directory, never over the tracked PNGs at the
// root of web/ (the #1108 pattern of e2e-combined.mjs). `--out <dir>` (or `--out=<dir>`) names the directory; by
// default it is laneArtifactDir(<suite>, <cdp port>), /tmp/<suite>-<cdp port>, per lane under a port band. The
// committed web-root PNGs are reference frames that no check compares against; to refresh them on purpose, run the
// suite from the repository root with `--out web` and commit them only after a PASS (a red run leaves them removed or
// mixed: git checkout them back).
import fs from 'node:fs';
import path from 'node:path';
import { laneArtifactDir } from '../cdp.mjs';

/** One pass over a suite's arguments: { out } (null = the default directory) or { error }. `--out` takes a directory;
 * a bare, blank or repeated --out, a value that starts with `--`, any other option and any positional argument are
 * usage errors. */
export function parseOutArgs(argv) {
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const m = /^--out(?:=([\s\S]*))?$/.exec(argv[i]);
    if (!m) return { error: `unknown argument '${argv[i]}'` };
    if (out !== null) return { error: '--out given twice' };
    const v = m[1] !== undefined ? m[1] : argv[++i];
    if (v === undefined || v.trim() === '' || v.startsWith('--')) return { error: '--out needs a directory' };
    out = v;
  }
  return { out };
}

/** The suite's capture directory, read before any server or browser starts (a usage error exits 2):
 * { dir, shot(file), prepare(files) }. A suite calls prepare() once it holds its ports, so a run refused on busy
 * ports touches no capture, and a red run never leaves an older capture that reads as its own. */
export function captureOut(suite, cdpPort, argv = process.argv.slice(2)) {
  const { out, error } = parseOutArgs(argv);
  if (error) {
    console.error(`${suite}: ${error}; usage: node web/tools/${suite}.mjs [--out <dir>]`);
    process.exit(2);
  }
  const dir = out === null ? laneArtifactDir(suite, cdpPort) : path.resolve(out);
  return {
    dir,
    shot: (file) => path.join(dir, file),
    prepare(files) {
      fs.mkdirSync(dir, { recursive: true });
      for (const f of files) fs.rmSync(path.join(dir, f), { force: true });
      console.log(`${suite}: screenshots go to ${dir}`);
    },
  };
}
