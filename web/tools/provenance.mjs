// Copyright (c) Meta Platforms, Inc. and affiliates.

// provenance.mjs — the TREE STAMP every measurement artifact carries.
//
// PR #633 round-3 skeptic: a sweep table was cited as "run on 46cb14e0" when
// the JSON had been produced on 254cb9c3 (the numbers reproduced on the tip,
// so the claim was true and the provenance was false). A number is a read
// you took on a tree; the artifact must say WHICH tree, structurally, so the
// claim cannot drift from the file. Every GH-626 tool writes `tree` from
// here into its JSON/manifest and prints it in its console header.
//
//   { sha, short, branch, dirty, modified: [...], untracked: n,
//     untrackedSample: [...], source: 'git' | 'env' | 'none', at }
//
//   dirty     TRACKED files differ from HEAD (git status --porcelain
//             --untracked-files=no is non-empty) — the same notion
//             `git describe --dirty` uses. Untracked files are counted
//             separately (output/ and *.log are excluded from the count:
//             every capture run creates them, they are not source).
//   fingerprint  sha1 of the tracked diff against HEAD + the untracked
//             source files' size/mtime — what treeStampEnd compares, so a
//             run on a tree that MOVED underneath it is flagged even when
//             the dirty boolean did not flip (review r9).
//   source    'git' when read from the working tree; 'env' when the tree is
//             a `git archive` extract with no .git (OB_TREE_SHA names the
//             archived commit — the capture-626-persist BEFORE protocol);
//             'none' when neither is available (the artifact then says so
//             instead of inventing a sha).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import path from 'node:path';

// trimEnd, not trim: `status --porcelain` lines START with a status column
// that may be a space (" M path"); a full trim ate the first line's column
// and the path came out as "eb/app/game.js" (review r8 side finding)
const git = (cwd, args) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
}).trimEnd();

const NOISE = /^(output\/|.*\.log$)/;

export function treeStamp(root = process.cwd()) {
  const at = new Date().toISOString();
  const envStamp = (why) => {
    const sha = process.env.OB_TREE_SHA ?? null;
    return {
      sha, short: sha ? sha.slice(0, 8) : null, branch: null,
      dirty: sha ? process.env.OB_TREE_DIRTY === '1' : null, modified: [],
      untracked: null, untrackedSample: [],
      source: sha ? 'env' : 'none', at,
      note: sha ? (process.env.OB_TREE_NOTE ?? `sha from OB_TREE_SHA (${why})`)
        : `${why}; no OB_TREE_SHA — provenance unknown`,
    };
  };
  let top;
  try { top = git(root, ['rev-parse', '--show-toplevel']); } catch { return envStamp('no git tree'); }
  // review r8: `git` walks UP from cwd, so a `git archive` extract placed
  // anywhere under a repository would be stamped with THAT repository's
  // HEAD as source 'git' — the exact drift this module exists to prevent.
  // The root handed in must BE the repository's top level, or the stamp
  // falls through to the env/none branch and says why.
  if (path.resolve(top) !== path.resolve(root)) {
    return envStamp(`${root} is not a repository root (enclosing repo: ${top})`);
  }
  const sha = git(top, ['rev-parse', 'HEAD']);
  let branch = null;
  try { branch = git(top, ['rev-parse', '--abbrev-ref', 'HEAD']); } catch { /* detached */ }
  const modified = git(top, ['status', '--porcelain', '--untracked-files=no'])
    .split('\n').filter((l) => l.trim()).map((l) => l.replace(/^.{2}\s/, ''));
  const untrackedAll = git(top, ['ls-files', '--others', '--exclude-standard', '--full-name'])
    .split('\n').filter(Boolean).filter((f) => !NOISE.test(f));
  // CONTENT fingerprint of the working tree (review r9 on PR #633): the
  // tracked diff against HEAD plus the untracked source files' size+mtime,
  // so a tree that started dirty and was edited further during a run — or
  // whose untracked sources moved — is caught by treeStampEnd; the dirty
  // BOOLEAN alone cannot see either.
  const h = createHash('sha1');
  h.update(git(top, ['diff', 'HEAD', '--', '.']));
  for (const f of untrackedAll) {
    try { const st = statSync(path.join(top, f)); h.update(`${f}:${st.size}:${st.mtimeMs}\n`); } catch { h.update(`${f}:gone\n`); }
  }
  return {
    sha, short: sha.slice(0, 8), branch, dirty: modified.length > 0, modified,
    untracked: untrackedAll.length, untrackedSample: untrackedAll.slice(0, 8),
    source: 'git', at, fingerprint: h.digest('hex').slice(0, 16),
  };
}

/** Re-stamp at the END of a run and compare with the start stamp: a tool
 * that ran for minutes must say whether the tree moved under it (review
 * r8: `at` was taken at launch and never checked). Returns the end stamp
 * with `treeChanged` set; callers write both and refuse to call a moved
 * tree's numbers a read on the start sha. */
export function treeStampEnd(start, root = process.cwd()) {
  const end = treeStamp(root);
  end.treeChanged = end.sha !== start.sha || end.dirty !== start.dirty
    || end.source !== start.source
    || (end.fingerprint ?? null) !== (start.fingerprint ?? null);
  return end;
}

/** One-line form for console headers and PR evidence lines. */
export function treeLabel(t) {
  if (!t.sha) return 'tree UNKNOWN';
  const flags = [];
  if (t.dirty) flags.push(`dirty:${t.modified.length}`);
  if (t.untracked) flags.push(`untracked:${t.untracked}`);
  if (t.source === 'env') flags.push('archive');
  return `tree ${t.short}${flags.length ? ` (${flags.join(', ')})` : ''}`;
}
