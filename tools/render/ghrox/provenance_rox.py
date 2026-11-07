#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Tier/tag consistency and resolvable sources, separate from geometry values."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re

REPO = Path(__file__).resolve().parents[3]
DEFINITION = REPO / 'docs/geometry/rasson-ox-9ft-table-definition.json'


def check(definition):
    counts = Counter()
    for row in definition['features']:
        source = row.get('source')
        if not isinstance(source, dict):
            raise ValueError(f"PROVENANCE_SOURCE_REFUSED: {row['id']} source must be a structured citation")
        tier = source.get('tier')
        tag = row.get('provenance_tag', '')
        for category in ('MODEL', 'EST', 'PHOTO'):
            if tag.startswith(category + '(') and tier != category:
                raise ValueError(f"PROVENANCE_TIER_REFUSED: {row['id']} tag {category} but source.tier={tier}")
            if tier == category and not tag.startswith(category + '('):
                raise ValueError(f"PROVENANCE_TIER_REFUSED: {row['id']} source.tier={tier} but tag {tag}")
        counts[tier] += 1
    return dict(counts)


def source_fence(definition, root=REPO):
    """Resolve every source object, including sources nested inside value tables.

    refs explicitly name repo files/JSON records or hash-registered documents.
    Narrative descriptions never supply a fallback; a pointer to prose fails.
    """
    root = Path(root).resolve()
    canonical = root / DEFINITION.relative_to(REPO)
    documents = {}
    sources = []

    def visit(node, location='', owner='definition'):
        if isinstance(node, dict):
            owner = node.get('id', owner)
            if 'source' in node or re.fullmatch(r'/features/\d+', location):
                sources.append((owner, location + '/source', node.get('source')))
            for key, value in node.items():
                visit(value, location + '/' + key, owner)
        elif isinstance(node, list):
            for i, value in enumerate(node):
                visit(value, location + '/' + str(i), owner)

    def ledger(node):
        if isinstance(node, dict):
            if isinstance(node.get('dossier_file'), str):
                documents[node['dossier_file']] = node
            for value in node.values():
                ledger(value)
        elif isinstance(node, list):
            for value in node:
                ledger(value)

    visit(definition)
    ledger(definition.get('doc', {}).get('source_ledger', {}))
    files = {canonical: definition}

    def resolve(ref, chain):
        if not isinstance(ref, dict):
            raise ValueError('source ref must be a structured path or document')
        if set(ref) == {'document'}:
            name = ref['document']
            entry = documents.get(name)
            if not entry or not re.fullmatch(r'[a-f0-9]{64}', str(entry.get('sha256', ''))):
                raise ValueError('unregistered named document: ' + str(name))
            return ['document:' + name]
        if not isinstance(ref.get('path'), str) or set(ref) - {'path', 'pointer', 'feature'}:
            raise ValueError('source ref needs a repo path or registered document')
        path = (root / ref['path']).resolve()
        if Path(ref['path']).is_absolute() or not path.is_relative_to(root) or not path.is_file():
            raise ValueError('repo source path missing or outside tree: ' + ref['path'])
        selectors = set(ref) & {'pointer', 'feature'}
        if len(selectors) > 1 or (path == canonical and not selectors):
            raise ValueError('definition source requires one explicit record selector')
        if not selectors:
            return [ref['path']]
        if path not in files:
            files[path] = json.loads(path.read_text())
        node = files[path]
        if 'feature' in ref:
            matches = [r for r in node.get('features', []) if r.get('id') == ref['feature']]
            if len(matches) != 1:
                raise ValueError('missing or ambiguous source feature: ' + str(ref['feature']))
            key = (path, ref['feature'])
            if key in chain:
                raise ValueError('circular source feature: ' + ref['feature'])
            return refs(matches[0].get('source'), chain + (key,))
        pointer = ref['pointer']
        if not isinstance(pointer, str) or not pointer.startswith('/'):
            raise ValueError('source pointer must be a JSON pointer')
        for part in pointer[1:].split('/'):
            part = part.replace('~1', '/').replace('~0', '~')
            node = node[int(part)] if isinstance(node, list) else node[part]
        if isinstance(node, (str, bool)) or node is None:
            raise ValueError('prose is not a source record: ' + pointer)
        return [ref['path'] + '#' + pointer]

    def refs(source, chain):
        if not isinstance(source, dict):
            raise ValueError('source must be a structured repo or document citation')
        entries = source.get('refs')
        if 'refs' not in source and isinstance(source.get('dossier_file'), str):
            # Existing named dossier citations remain valid. The optional
            # parenthesis is a document title, not an inferred source path.
            names = [part.strip() for part in source['dossier_file'].split(';')]
            matches = [[name for name in documents if part == name or
                        (part.startswith(name + ' (') and part.endswith(')'))] for part in names]
            if matches and all(len(match) == 1 for match in matches):
                entries = [dict(document=match[0]) for match in matches]
        if not isinstance(entries, list) or not entries:
            raise ValueError('source.refs missing; prose alone cannot establish provenance')
        return [target for ref in entries for target in resolve(ref, chain)]

    records, failures = [], []
    for owner, location, source in sources:
        try:
            resolved = refs(source, ((canonical, owner),))
            records.append(dict(id=owner, location=location, resolved=resolved))
        except (ValueError, TypeError, KeyError, IndexError, OSError) as exc:
            failures.append(dict(id=owner, location=location, reason=str(exc)))
    if not sources:
        failures.append(dict(id='definition', location='/features', reason='no sources inspected'))
    return dict(row='PROVENANCE_SOURCE_RESOLUTION', source_count=len(sources),
                resolved_count=len(records), records=records, failures=failures, passed=not failures)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', type=Path, default=DEFINITION)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    definition = json.loads(args.json.read_text())
    print('PROVENANCE TIER/TAG OK', json.dumps(check(definition), sort_keys=True))
    result = source_fence(definition)
    result['definition_sha256'] = hashlib.sha256(args.json.read_bytes()).hexdigest()
    if args.out:
        with args.out.open('x') as stream:
            json.dump(result, stream, indent=2)
            stream.write('\n')
    print(result['row'], 'PASS' if result['passed'] else 'FAIL',
          f"{result['resolved_count']}/{result['source_count']} sources resolved")
    for failure in result['failures']:
        print('PROVENANCE_SOURCE_REFUSED:', failure['id'], failure['location'], failure['reason'])
    if not result['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
