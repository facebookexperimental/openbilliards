# Copyright (c) Meta Platforms, Inc. and affiliates.

"""argpaths.py — OPTION PRESENCE IS NOT OPTION VALUE, for the python render tools (ORDER-CN8-731-FIX2, review round 2 on #731
P2 (b); FIX10, review round 10: ONE parse to completion before any effect). argparse turns `--out ''` into an empty string and a
missing input path into a crash somewhere later; a gate must instead exit 2 naming the flag — and it must do so AFTER the parser
returned (help 0 / errors 2 first) and BEFORE any effect. The order every argparse tool follows:

    a = ap.parse_args()                                                     # ONE parse of the whole argv to completion
    guard_values({'--refs': 'dir', '--out': 'out', '--frames': 'value'})    # every occurrence of every declared value flag non-blank
    invalidate_dest(a.out, ['report.json'])                                 # the first effect, from the PARSED destination
    guard_exists({'--refs': 'dir'})                                         # input existence — after the first effect (FIX3)

kind: 'file' / 'dir' → the flag, when present, must name an existing file / directory (guard_exists); 'out' / 'value' → present-but-blank
is refused (guard_values), existence is not required. Absent flags are left to argparse (defaults / required=True). The value checks read
sys.argv (every occurrence, as argparse does not) so they need no knowledge of the parser's attribute names. The FIX2–FIX9 pre-scan helpers
(invalidate_prior, _raw_value / raw_value, resolve_mode, invalidate_for_mode, _refuse_blank) are DELETED; guard_paths stays as the
non-invalidating tools' post-parse guard (= guard_values + guard_exists) — a pre-scan is a
second reader of the argv (review round 10); invalidate_path stays for the positional scripts (called after their own parse)."""
import os
import re
import sys


_NEG_NUMBER = re.compile(r'^-\d+$|^-\d*\.\d+$')


def _values(flag, argv):
    """every value given to `flag` (`--flag value` / `--flag=value`); None marks a trailing flag"""
    out = []
    for i, a in enumerate(argv):
        if a == flag:
            nxt = argv[i + 1] if i + 1 < len(argv) else None
            # argparse's own rule: a next token that looks like an option (starts with '-' and is not a negative number) is NOT a value
            looks_like_option = nxt is not None and nxt.startswith('-') and nxt != '-' and not _NEG_NUMBER.match(nxt)  # argparse: a lone '-' is a value (Fable pass 2 on FIX10)
            out.append(None if nxt is None or looks_like_option else nxt)
        elif a.startswith(flag + '='):
            out.append(a[len(flag) + 1:])
    return out


def invalidate_path(path, tag=None):
    """Positional-destination form of invalidate_prior (FIX3, refuter pass 2): remove the single prior verdict
    artefact at `path` as the FIRST effect of the run — for tools whose destination is a positional prefix."""
    tag = tag or os.path.basename(sys.argv[0])
    if path and os.path.isfile(path):
        try: os.remove(path)
        except OSError as e:
            print(f"[{tag}] REFUSED — could not invalidate the prior artefact {path}: {e}", file=sys.stderr); sys.exit(2)
        print(f"[{tag}] prior artefact(s) invalidated before any guard: {path}", file=sys.stderr)
        return [path]
    return []


def guard_values(spec, argv=None, tag=None):
    """FIX10 (review round 10 on #731): the PARSER's own completion — every occurrence of every declared value flag must carry a
    non-blank value (argparse accepts '' as a string; the tools never did). Called right after parse_args(), before any effect."""
    argv = sys.argv[1:] if argv is None else argv
    tag = tag or os.path.basename(sys.argv[0])
    for flag in spec:
        for v in _values(flag, argv):
            if v is None or not str(v).strip():
                print(f"[{tag}] REFUSED — {flag} given without a value (blank or trailing); name the path or omit the flag", file=sys.stderr); sys.exit(2)


def guard_values_of(ap, argv=None, tag=None, extra=None, always=('--out',)):
    """FIX10 (Fable pass 2): the guard_values spec DERIVED FROM THE PARSER — every option that takes a value (store / append / typed),
    never a store_true / store_false / count / help / version action — so no declared value flag is left unguarded (edgeaudit's
    --cam / --look and make_card's --title had been outside a hand-written spec). `extra` adds kinds for guard_exists' use."""
    spec = {}
    for act in getattr(ap, '_actions', []):
        if act.nargs == 0 or not act.option_strings: continue           # switches / counts / help / version take no value; positionals are not options
        if act.default == '' and not act.required and not any(o in always for o in act.option_strings): continue   # an option whose own default is '' takes '' as a meaningful value (make_card --sub '' = no subtitle) — Fable pass 3; the DESTINATION (`always`, default --out) is guarded regardless (edgeaudit's --out defaults to '')
        for o in act.option_strings:
            if o.startswith('--'): spec[o] = 'value'
    if extra: spec.update(extra)
    guard_values(spec, argv=argv, tag=tag)
    return spec


def guard_exists(spec, argv=None, tag=None):
    """FIX10: the INPUT guards (file / dir existence) — after the first effect, as FIX3 ordered them (a missing input never leaves a
    prior verdict standing). Judged on the raw value argparse hands the tool (refuter pass 5 on FIX2) — the LAST occurrence (FIX11)."""
    argv = sys.argv[1:] if argv is None else argv
    tag = tag or os.path.basename(sys.argv[0])
    for flag, kind in spec.items():
        vals = _values(flag, argv)
        if not vals: continue
        v = vals[-1]                     # FIX11 (review round 11 on #731 P2 B): existence is judged on the EFFECTIVE value — argparse takes the LAST
        if v is None: continue           # occurrence (`--input /missing --input <good>` is an appended override); the every-occurrence BLANK check stays in guard_values
        if True:
            v = str(v)
            if kind == 'file' and not os.path.isfile(v):
                print(f"[{tag}] REFUSED — {flag} {v!r}: file not found", file=sys.stderr); sys.exit(2)
            if kind == 'dir' and not os.path.isdir(v):
                print(f"[{tag}] REFUSED — {flag} {v!r}: directory not found", file=sys.stderr); sys.exit(2)


def guard_paths(spec, argv=None, tag=None):
    """The FIX2 post-parse guard of the NON-invalidating python tools (14 callers): the value check and the existence check in one
    call — kept as exactly guard_values + guard_exists (FIX10). Invalidating tools call the two halves around their first effect."""
    guard_values(spec, argv=argv, tag=tag)
    guard_exists({k: v for k, v in spec.items() if v in ('file', 'dir')}, argv=argv, tag=tag)


def invalidate_dest(dest, patterns, tag=None):
    """FIX10: the first effect, from the PARSED destination (never a re-read of argv). `patterns` None = the destination file itself;
    a list = filename patterns under the destination directory (listed, filename-matched, never glob-expanded — FIX4)."""
    import fnmatch as _fnmatch
    tag = tag or os.path.basename(sys.argv[0])
    if not dest: return []
    gone = []
    if patterns is None:
        if os.path.isfile(dest):
            try: os.remove(dest); gone.append(dest)
            except OSError as e:
                print(f"[{tag}] REFUSED — could not invalidate the prior artefact {dest}: {e}", file=sys.stderr); sys.exit(2)
    else:
        try: names = sorted(os.listdir(dest))
        except OSError: names = []
        for pat in patterns:
            for nm in names:
                if not _fnmatch.fnmatchcase(nm, pat): continue
                f = os.path.join(dest, nm)
                if not os.path.isfile(f): continue
                try: os.remove(f); gone.append(f)
                except OSError as e:
                    print(f"[{tag}] REFUSED — could not invalidate the prior artefact {f}: {e}", file=sys.stderr); sys.exit(2)
    if gone: print(f"[{tag}] prior artefact(s) invalidated before any guard (the first effect, after the parse): {', '.join(gone)}", file=sys.stderr)
    return gone
