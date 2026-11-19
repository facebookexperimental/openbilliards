// Copyright (c) Meta Platforms, Inc. and affiliates.

// html-gen-id.mjs — app.html's generation id (issue #1173), shared by
// gen-sw-precache.mjs, which writes it, and e2e-userboot-3g-sw.mjs, whose
// swupdate deploy computes generation B's id from B's intended bytes.
//
// The root <html> tag (the line that starts with it) carries data-ob-html =
// the first 12 hex digits of the sha-256 of app.html with that attribute's
// value blanked. It hashes app.html only (never VERSION), so it is a fixed
// point: recomputing it over its own output changes nothing. Pure: text in,
// { id, text } out — or { error } when there is no root tag, more than one,
// or the attribute twice on it (the browser reads the first).
import { createHash } from 'node:crypto';

export function htmlGenId(src) {
  const tags = src.match(/^<html\b[^>]*>/gm) || [];
  if (tags.length !== 1) return { error: `app.html needs exactly one line starting with <html …> to carry data-ob-html (found ${tags.length})` };
  const tag = tags[0];
  if ((tag.match(/\sdata-ob-html=/g) || []).length > 1) return { error: 'app.html\'s root <html> tag carries data-ob-html more than once' };
  const blankTag = /\sdata-ob-html="[^"]*"/.test(tag)
    ? tag.replace(/(\sdata-ob-html=")[^"]*"/, '$1"')
    : tag.replace(/>$/, ' data-ob-html="">');
  const blank = src.replace(tag, blankTag);
  const id = createHash('sha256').update(blank).digest('hex').slice(0, 12);
  return { id, text: blank.replace(blankTag, blankTag.replace('data-ob-html=""', `data-ob-html="${id}"`)) };
}
