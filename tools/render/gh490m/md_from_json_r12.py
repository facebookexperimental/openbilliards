#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""md_from_json_r12.py — regenerate the tables of cn8-middle-furniture-definition.md (§4 rows,
§5 identities, §6 retired, §7 conflicts, §8 open items, §9 census, §10 gate rows) from the JSON, so the .md
can never drift from the machine authority. The prose sections are kept verbatim."""
import json, hashlib, re, sys
from pathlib import Path
REPO = Path(__file__).resolve().parents[3]
J = REPO / 'docs/geometry/cn8-middle-furniture-definition.json'
M = REPO / 'docs/geometry/cn8-middle-furniture-definition.md'
d = json.loads(J.read_text()); sha = hashlib.sha256(J.read_bytes()).hexdigest()
rows = []
for f in d['features']:
    val = f.get('value_mm', f.get('value'))
    if isinstance(val, (dict, list)): val = json.dumps(val, ensure_ascii=False)
    elif val is None: val = '—'
    rows.append(f"| {f['id']} | {f['name']} | {val} | {f['source']['tier']}{' · ' + f['status'] if f.get('status') else ''}{' · ' + f['conflict'] if f.get('conflict') else ''} |")
sec = {
 '## 4. Rows (every number tagged)': "| id | name | value (mm unless noted) | tier · status · conflict |\n| --- | --- | --- | --- |\n" + "\n".join(rows),
 '## 5. Identities asserted by the generator (`tools/render/gh490m/gen_drawing_490m_r12.py`)': "\n".join(f"{i+1}. {s}" for i, s in enumerate(d['checks']['identities'])),
 '## 6. Retired (r1–r11 rows that do not survive)': "\n".join(f"- **{k}** — {v}" for k, v in d['retired']['rows'].items()),
 '## 7. Conflicts for the owner': "\n".join(f"### {c['id']} — {c['name']}\n\n{c['adjudication']}\n" for c in d['conflicts']),
 '## 8. Open items': "\n".join(f"- **{o['id']}** — {o['item']}" for o in d['open_items']),
 '## 9. Object census the build must satisfy': "| family | per middle | what |\n| --- | --- | --- |\n" + "\n".join(f"| `{c['family']}` | {c['count_per_middle']} | {c['what']} |" for c in d['census']['families']),
 '## 10. Gate rows': "**Added (each read from this contract, each red-armed on the 02b42ac1 tree or by perturbation):**\n\n| row | reads | window | red arm |\n| --- | --- | --- | --- |\n" + "\n".join(f"| {g['row']} | {g['reads']} | {g['window']} | {g['arm']} |" for g in d['gate_rows']['add']) + "\n\n**Removed (every bay-cover / plate row):**\n\n" + "\n".join(f"- {r}" for r in d['gate_rows']['remove']),
}
text = M.read_text()
heads = [m for m in re.finditer(r'^## .*$', text, flags=re.M)]
out = []; pos = 0
for i, h in enumerate(heads):
    end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
    body = text[h.end():end]
    if h.group(0) in sec:
        body = "\n\n" + sec[h.group(0)] + "\n\n"
    out.append(text[pos:h.start()] + h.group(0) + body); pos = end
text = "".join(out)
text = re.sub(r"\(sha256 `[0-9a-f]{64}`\)", f"(sha256 `{sha}`)", text)
M.write_text(text); print('[md] regenerated from', J.name, 'sha', sha[:16], '| rows', len(rows), '| identities', len(d['checks']['identities']))
