// Copyright (c) Meta Platforms, Inc. and affiliates.

function renameLeadingToken(message, source, alias, separator) {
  for (const lead of ['', '[dense] ']) {
    const prefix = `${lead}${source}${separator}`;
    if (message.startsWith(prefix)) {
      return `${lead}${alias}${separator}${message.slice(prefix.length)}`;
    }
  }
  throw new Error(`alias replay: unexpected leading token for ${source}: ${message}`);
}

/** Failure-row identities accept only "id " or "[dense] id " prefixes. */
export const renameAliasRow = (row, source, alias) => renameLeadingToken(row, source, alias, ' ');

/** Entry status/sanity messages use "id: "; keep that grammar explicit and
 * separate from rail-row identities. Neither path can rename message bodies. */
export function renameAliasEvent({ msg }, source, alias) {
  if (msg.startsWith(`${source}: `) || msg.startsWith(`[dense] ${source}: `)) {
    return renameLeadingToken(msg, source, alias, ': ');
  }
  return renameAliasRow(msg, source, alias);
}
