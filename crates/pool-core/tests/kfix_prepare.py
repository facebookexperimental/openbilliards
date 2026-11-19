#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""K-fix plant inputs and exact-oracle expectations for the pool-core detect paths (F1, F2, F3).

Usage: python3 -I kfix_prepare.py K_DIR OUT_DIR P1_JSON  (plant inputs + exact expectations)
       python3 -I kfix_prepare.py expect OUT_DIR           (after the base capture: coverage and shifted-contact
                                                           expectations near today's roots)
       python3 -I kfix_prepare.py pre KEEPS_JSON OUT_DIR   (the (i') pre-filter keep list written by the
                                                           ignored unit test kfix_prefilter_capture -> exact
                                                           surface gap vs the floor 64u*M_pos: expect-pre.json)

K_DIR is perf's K evidence directory (k-90958db6). Read only:
  out/fail-{band,boundary,harvest,random}-rel.jsonl and diag/refdiscrete-140.json.
P1_JSON is kernelrw's k-verify/p1.json (read only): the 229 logged underflow-symptom inputs (NEW Some >= 1e200,
OLD None; ball_ball_time 112, ball_pocket_time 117) whose exact quartic has no real root in (t_min, inf) by
Sturm's theorem; F1 rows carry `p1: true` when they are one of them. Only OUT_DIR is written (inputs-*.json and
manifest.json). Every binary64 value is stored as its
16-hex-digit bit pattern, so the inputs round-trip bit for bit.

Exact expectations use fractions.Fraction on the binary64 inputs. decimal.Decimal (80 digits) is
used only to print square roots (gaps in metres). The kernel's binary64 builders are replicated
operation for operation (CPython float arithmetic is IEEE binary64, round to nearest, no FMA).
"""
import hashlib
import json
import math
import os
import struct
import sys
from decimal import Decimal, getcontext
from fractions import Fraction as F

getcontext().prec = 80
U = 2.0 ** -53
RESEAT_SLACK = 1e-4
STRATA = ('band', 'boundary', 'harvest', 'random')


def hx(x):
    return '%016x' % struct.unpack('<Q', struct.pack('<d', float(x)))[0]


def poly9(p):
    return [p[c][v] for c in ('c0', 'c1', 'c2') for v in 'xyz']


def encode(adapter, inp):
    """Flat argument list (binary64 values) in the Rust call order, plus an optional arc span."""
    span = None
    if adapter == 'ball_ball_time':
        a, b, ra, rb, t_min = inp
        vals = poly9(a) + poly9(b) + [ra, rb, t_min]
    elif adapter == 'ball_pocket_time':
        p, pk, t_min = inp
        vals = poly9(p) + [pk['center']['x'], pk['center']['y'], pk['center']['z'], pk['radius'], t_min]
    elif adapter in ('ball_circular_cushion_time', 'ball_circular_cushion_time_airborne'):
        p, arc, r, t_min, band = inp
        vals = poly9(p) + [arc['center']['x'], arc['center']['y'], arc['center']['z'], arc['radius'],
                           arc['height'], r, t_min, band]
        if 'span' in arc:
            span = [hx(arc['span']['start']), hx(arc['span']['sweep'])]
    elif adapter == 'ball_linear_cushion_time':
        p, seg, r, t_min, band = inp
        vals = poly9(p) + [seg['p1'][v] for v in 'xyz'] + [seg['p2'][v] for v in 'xyz'] + [seg['height'], r, t_min, band]
    elif adapter == 'ball_linear_cushion_time_airborne':
        p, seg, r, t_min = inp
        vals = poly9(p) + [seg['p1'][v] for v in 'xyz'] + [seg['p2'][v] for v in 'xyz'] + [seg['height'], r, t_min]
    else:
        raise ValueError(adapter)
    return {'adapter': adapter, 'f': [hx(v) for v in vals], 'span': span}


def replace_leaves(o, old, new):
    if isinstance(o, dict):
        return {k: replace_leaves(v, old, new) for k, v in o.items()}
    if isinstance(o, list):
        return [replace_leaves(v, old, new) for v in o]
    if isinstance(o, float) and o == old:
        return new
    if isinstance(o, float) and o == -old:
        return -new
    return o


# ---------------------------------------------------------------- binary64 builders (kernel replicas)

def xy_quartic(ax, ay, bx, by, px, py, cx, cy, dist):
    return [0.5 * (ax * ax + ay * ay), ax * bx + ay * by, ax * (px - cx) + ay * (py - cy) + 0.5 * (bx * bx + by * by),
            bx * (px - cx) + by * (py - cy), 0.5 * (cx * cx + cy * cy + px * px + py * py - dist * dist) - (px * cx + py * cy)]


def ev(k, t):
    v = F(0)
    for c in k:
        v = v * t + F(c)
    return v


def is_rn_root(k, t):
    lo = (F(math.nextafter(t, -math.inf)) + F(t)) / 2
    hi = (F(t) + F(math.nextafter(t, math.inf))) / 2
    a, b = ev(k, lo), ev(k, hi)
    return a == 0 or b == 0 or (a > 0) != (b > 0)


# ---------------------------------------------------------------- exact geometry

class Circle:
    """Exact |w(t)|^2 - D^2, w = path_xy - centre (G has the sign of the gap rho - D)."""

    def __init__(self, p, cx, cy, D):
        self.a = (F(p['c0']['x']) - F(cx), F(p['c0']['y']) - F(cy))
        self.b = (F(p['c1']['x']), F(p['c1']['y']))
        self.c = (F(p['c2']['x']), F(p['c2']['y']))
        self.D = D

    def w(self, t):
        return [self.a[i] + self.b[i] * t + self.c[i] * t * t for i in range(2)]

    def wd(self, t):
        return [self.b[i] + 2 * self.c[i] * t for i in range(2)]

    def G(self, t):
        w = self.w(t)
        return w[0] * w[0] + w[1] * w[1] - self.D * self.D

    def Gd(self, t):
        w, v = self.w(t), self.wd(t)
        return 2 * (w[0] * v[0] + w[1] * v[1])

    def gap(self, t):
        return dsqrt(self.G(t) + self.D * self.D) - dec(self.D)


class Capsule:
    """Exact L^2 (|w|^2 - (w.u)^2 - r^2) for the airborne nose axis (sign of the axis gap)."""

    def __init__(self, p, seg, r):
        x1, y1, h = F(seg['p1']['x']), F(seg['p1']['y']), F(seg['height'])
        self.dx, self.dy = F(seg['p2']['x']) - x1, F(seg['p2']['y']) - y1
        self.L2 = self.dx * self.dx + self.dy * self.dy
        self.a = (F(p['c0']['x']) - x1, F(p['c0']['y']) - y1, F(p['c0']['z']) - h)
        self.b = tuple(F(p['c1'][v]) for v in 'xyz')
        self.c = tuple(F(p['c2'][v]) for v in 'xyz')
        self.r = F(r)

    def w(self, t):
        return [self.a[i] + self.b[i] * t + self.c[i] * t * t for i in range(3)]

    def G(self, t):
        wx, wy, wz = self.w(t)
        cr = self.dx * wy - self.dy * wx
        return cr * cr + self.L2 * wz * wz - self.r * self.r * self.L2

    def gap(self, t):
        return dsqrt((self.G(t) + self.r * self.r * self.L2) / self.L2) - dec(self.r)


class Plane:
    """Exact signed plane distance minus d: cross(t)/L - d, sign via cross > 0 and cross^2 - d^2 L^2."""

    def __init__(self, p, seg, d):
        x1, y1 = F(seg['p1']['x']), F(seg['p1']['y'])
        self.dx, self.dy = F(seg['p2']['x']) - x1, F(seg['p2']['y']) - y1
        self.L2 = self.dx * self.dx + self.dy * self.dy
        ax, ay = F(p['c0']['x']) - x1, F(p['c0']['y']) - y1
        bx, by = F(p['c1']['x']), F(p['c1']['y'])
        cx, cy = F(p['c2']['x']), F(p['c2']['y'])
        self.k = (self.dx * ay - self.dy * ax, self.dx * by - self.dy * bx, self.dx * cy - self.dy * cx)
        self.d = d

    def cross(self, t):
        return self.k[0] + self.k[1] * t + self.k[2] * t * t

    def G(self, t):
        c = self.cross(t)
        if c <= 0:
            return c - 1  # far on the wrong side: negative, never a crossing of interest
        return c * c - self.d * self.d * self.L2

    def gap(self, t):
        return dec(self.cross(t)) / dsqrt(self.L2) - dec(self.d)


def dec(x):
    return Decimal(x.numerator) / Decimal(x.denominator)


def dsqrt(x):
    return dec(x).sqrt()


def bisect(G, a, b, ga_pos, rel=F(1, 2 ** 150)):
    """Sign-change bisection on [a, b] (G(a) has sign ga_pos), to width rel * max(1, |a|)."""
    width = rel * max(F(1), abs(a))
    while b - a > width:
        m = (a + b) / 2
        gm = G(m)
        if gm == 0:
            return m, m
        if (gm > 0) == ga_pos:
            a = m
        else:
            b = m
    return a, b


def descending_root_near(G, t0, max_doublings=80):
    """Exact descending crossing nearest t0 in the direction G(t0) points (G>0: later, G<0: earlier)."""
    T0 = F(t0)
    g0 = G(T0)
    if g0 == 0:
        return T0, T0
    step = max(abs(T0), F(1, 1000)) * F(1, 2 ** 48)
    direction = 1 if g0 > 0 else -1
    prev = T0
    for _ in range(max_doublings):
        t1 = T0 + direction * step
        g1 = G(t1)
        if g1 == 0:
            return t1, t1
        if (g1 > 0) != (g0 > 0):
            if direction > 0:
                return bisect(G, prev, t1, g0 > 0)
            return bisect(G, t1, prev, g1 > 0)
        prev = t1
        step *= 2
    return None


def padd(p, q):
    n = max(len(p), len(q))
    return [(p[i] if i < len(p) else 0) + (q[i] if i < len(q) else 0) for i in range(n)]


def pmul(p, q):
    out = [F(0)] * (len(p) + len(q) - 1)
    for i, a in enumerate(p):
        for j, b in enumerate(q):
            out[i + j] += a * b
    return out


def ptrim(p):
    p = list(p)
    while len(p) > 1 and p[-1] == 0:
        p.pop()
    return p


def peval(p, t):
    v = F(0)
    for c in reversed(p):
        v = v * t + c
    return v


def prem(a, b):
    a, b = ptrim(a), ptrim(b)
    while len(a) >= len(b) and any(a):
        k = a[-1] / b[-1]
        shift = len(a) - len(b)
        a = ptrim([a[i] - (k * b[i - shift] if i >= shift else 0) for i in range(len(a))])
        if len(a) < len(b) or (len(a) == 1 and a[0] == 0):
            break
    return a


def sturm_chain(p):
    p = ptrim(p)
    dp = ptrim([i * p[i] for i in range(1, len(p))]) if len(p) > 1 else [F(0)]
    chain = [p, dp]
    while len(chain[-1]) > 1 or chain[-1][0] != 0:
        r = prem(chain[-2], chain[-1])
        r = [-c for c in r]
        if len(r) == 1 and r[0] == 0:
            break
        chain.append(r)
        if len(r) == 1:
            break
    return chain


def sign_changes(chain, t):
    signs = [s for s in ((peval(q, t) > 0) - (peval(q, t) < 0) for q in chain) if s != 0]
    return sum(1 for i in range(1, len(signs)) if signs[i] != signs[i - 1])


def real_roots(p, lo, hi, rel=F(1, 2 ** 140)):
    """Exact enclosures of every distinct real root of p in (lo, hi] (Sturm + bisection)."""
    chain = sturm_chain(p)
    out = []
    stack = [(lo, hi)]
    width = rel * max(F(1), abs(lo), abs(hi))
    while stack:
        a, b = stack.pop()
        n = sign_changes(chain, a) - sign_changes(chain, b)
        if n == 0:
            continue
        if n == 1 and b - a <= width:
            out.append((a, b))
            continue
        if n == 1 and (peval(p, a) > 0) != (peval(p, b) > 0) and peval(p, a) != 0 and peval(p, b) != 0:
            # a single simple root with a sign change: plain bisection
            ga = peval(p, a) > 0
            while b - a > width:
                m = (a + b) / 2
                gm = peval(p, m)
                if gm == 0:
                    a = b = m
                    break
                if (gm > 0) == ga:
                    a = m
                else:
                    b = m
            out.append((a, b))
            continue
        if b - a <= width:
            out.append((a, b))
            continue
        m = (a + b) / 2
        stack.append((m, b))
        stack.append((a, m))
    return sorted(out)


def residual_poly(geo):
    """Exact residual as a rational polynomial (ascending powers) with the gap's sign (squared forms)."""
    if isinstance(geo, Circle):
        p = [-(geo.D * geo.D)]
        for i in range(2):
            q = [geo.a[i], geo.b[i], geo.c[i]]
            p = padd(p, pmul(q, q))
        return p, None
    if isinstance(geo, Capsule):
        cr = [geo.dx * geo.a[1] - geo.dy * geo.a[0], geo.dx * geo.b[1] - geo.dy * geo.b[0], geo.dx * geo.c[1] - geo.dy * geo.c[0]]
        wz = [geo.a[2], geo.b[2], geo.c[2]]
        p = padd(pmul(cr, cr), [x * geo.L2 for x in pmul(wz, wz)])
        return padd(p, [-(geo.r * geo.r * geo.L2)]), None
    cr = list(geo.k)
    return padd(pmul(cr, cr), [-(geo.d * geo.d * geo.L2)]), cr


def descending_crossings(geo, lo, hi):
    """Exact enclosures of the descending (outside -> inside) crossings of the residual in (lo, hi]."""
    p, cr = residual_poly(geo)
    out = []
    for a, b in real_roots(p, lo, hi):
        m = (a + b) / 2
        if cr is not None and peval(cr, m) <= 0:
            continue  # the cross = -dL branch of the squared plane residual
        d = peval([i * p[i] for i in range(1, len(p))], m)
        if d < 0 or (d == 0 and peval(p, a - (b - a)) > 0):
            out.append((a, b))
    return out


def float_neighbours(lo, hi):
    """Floats within one ulp of every point of [lo, hi] (a sub-ulp exact root enclosure)."""
    f = float(lo)
    if F(f) > lo:
        f = math.nextafter(f, -math.inf)
    g = math.nextafter(f, math.inf)
    if F(g) < hi:
        # the enclosure contains the float g: accept g and its two neighbours
        return [f, g, math.nextafter(g, math.inf)]
    if F(f) == lo == hi:
        return [math.nextafter(f, -math.inf), f, g]
    return [f, g]


# ---------------------------------------------------------------- row loading

def load_rows(kdir):
    rows = {}
    for s in STRATA:
        with open(f'{kdir}/out/fail-{s}-rel.jsonl') as fh:
            for line in fh:
                d = json.loads(line)
                rows[(s, d['adapter'], d['index'])] = d
    return rows


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        h.update(fh.read())
    return h.hexdigest()


# ---------------------------------------------------------------- F1

MINPOS = 2.2250738585072014e-308


def f1_class(adapter, inp):
    if adapter == 'ball_ball_time':
        A = [inp[0]['c2'][k] - inp[1]['c2'][k] for k in 'xyz']
        a4 = A[0] * A[0] + A[1] * A[1] + A[2] * A[2]
        nz = any(inp[0]['c2'][k] != inp[1]['c2'][k] for k in 'xyz')
    elif adapter in ('ball_pocket_time', 'ball_circular_cushion_time'):
        ax, ay = inp[0]['c2']['x'], inp[0]['c2']['y']
        a4 = 0.5 * (ax * ax + ay * ay)
        nz = ax != 0 or ay != 0
    elif adapter == 'ball_linear_cushion_time_airborne':
        wz2 = inp[0]['c2']['z']
        a4 = wz2 * wz2
        nz = wz2 != 0
    else:
        return False
    return nz and not (abs(a4) >= MINPOS)


def build_f1(rows, refd):
    reg = {(r['stratum'], r['adapter'], r['index']) for r in refd
           if r['class'] == 'regression' and r['adapter'] in ('ball_ball_time', 'ball_pocket_time')}
    out = []
    for key in sorted(rows, key=lambda k: (STRATA.index(k[0]), k[1], k[2])):
        s, adapter, index = key
        d = rows[key]
        inp = d['input']
        if not f1_class(adapter, inp):
            continue
        if adapter == 'ball_ball_time':
            nonpos = not (inp[2] > 0 and inp[3] > 0)
        else:
            nonpos = False
        in86 = key in reg or (adapter == 'ball_ball_time' and nonpos)
        kind = 'reference_discrete' if key in reg else ('ref_invalid' if in86 else 'extended')
        inp150 = replace_leaves(inp, 1e-300, 1e-150)
        assert not f1_class(adapter, inp150), key
        new_k = None
        for f in d['failing']:
            if f.get('kind') == 'shape' and 'ret.value' in f.get('new_outputs', {}):
                new_k = hx(f['new_outputs']['ret.value'])
        out.append({'id': f'{s}/{adapter}/{index}', 'set': 'f1a' if in86 else 'f1ext', 'kind': kind,
                    'args': encode(adapter, inp), 'args150': encode(adapter, inp150), 'new_k': new_k})
    n86 = sum(r['set'] == 'f1a' for r in out)
    assert n86 == 86, n86
    return out


def path(c0, c1, c2):
    return {'c0': dict(zip('xyz', c0)), 'c1': dict(zip('xyz', c1)), 'c2': dict(zip('xyz', c2))}


R = 0.028575
H = 0.036


def build_f1c():
    """Synthetic F1 plants: a ±1e-300 leading-coefficient input with a genuine lower-order contact (c),
    a genuine far contact of the exact quartic (A parallel to B), and spurious far roots on cushions."""
    out = []
    zero = (0.0, 0.0, 0.0)
    # (c) pair: decelerating head-on approach, A = (-1e-300, 0, 0) parallel to B; earliest root 0.5 - 2R.
    a = path((0.0, 0.0, R), (1.0, 0.0, 0.0), (-1e-300, 0.0, 0.0))
    b = path((0.5, 0.0, R), zero, zero)
    out.append({'id': 'f1c/pair/headon', 'kind': 'c', 'args': encode('ball_ball_time', [a, b, R, R, 1e-9])})
    # (c) pair: oblique approach, A = (0, 1e-300, -1e-300) not parallel to B.
    a = path((0.0, 0.02, R), (1.5, 0.0, 0.0), (0.0, 1e-300, -1e-300))
    b = path((0.6, 0.0, R), zero, zero)
    out.append({'id': 'f1c/pair/oblique', 'kind': 'c', 'args': encode('ball_ball_time', [a, b, R, R, 1e-9])})
    # (c) pair: both balls carry the same normal c2 except a 1e-300 component (difference underflows).
    a = path((-0.3, 0.1, R), (2.0, -0.5, 0.0), (-0.2, 0.05, 0.0))
    b = path((0.2, 0.0, R), (0.1, 0.0, 0.0), (-0.2, 0.05 + 0.0, 1e-300))
    out.append({'id': 'f1c/pair/shared-c2', 'kind': 'c', 'args': encode('ball_ball_time', [a, b, R, R, 1e-9])})
    # (c) pocket: straight run into the pocket with c2 = (1e-300, -1e-300).
    p = path((0.0, 0.0, R), (0.0, 2.0, 0.0), (1e-300, -1e-300, 0.0))
    out.append({'id': 'f1c/pocket/straight', 'kind': 'c',
                'args': encode('ball_pocket_time', [p, {'center': {'x': 0.0, 'y': 1.0, 'z': 0.0}, 'radius': 0.062}, 1e-9])})
    p = path((0.3, -0.2, R), (-0.7, 2.1, 0.0), (-1e-300, 0.0, 0.0))
    out.append({'id': 'f1c/pocket/oblique', 'kind': 'c',
                'args': encode('ball_pocket_time', [p, {'center': {'x': 0.0, 'y': 1.0, 'z': 0.0}, 'radius': 0.062}, 1e-9])})
    # (c) circular jaw: direct approach with c2 = (1e-300, 1e-300).
    arc = {'center': {'x': 0.5, 'y': 0.0, 'z': 0.0}, 'radius': 0.02095, 'height': H}
    p = path((-0.5, 0.0, R), (1.0, 0.0, 0.0), (1e-300, 1e-300, 0.0))
    out.append({'id': 'f1c/circular/direct', 'kind': 'c',
                'args': encode('ball_circular_cushion_time', [p, arc, R, 1e-9, 0.0])})
    # (c) airborne nose capsule: horizontal run at z = H - 0.01 with c2.z = -1e-300 (not physical; it isolates
    # the guard: the capsule quartic loses its a4 while the contact is the quadratic part's root).
    seg = {'p1': {'x': 0.5, 'y': 1.0, 'z': 0.0}, 'p2': {'x': -0.5, 'y': 1.0, 'z': 0.0}, 'height': H}
    p = path((0.0, 0.9, H - 0.01), (0.0, 2.0, 0.0), (0.0, 0.0, -1e-300))
    out.append({'id': 'f1c/capsule/level', 'kind': 'c',
                'args': encode('ball_linear_cushion_time_airborne', [p, seg, R, 1e-9])})
    # genuine FAR root of the exact quartic (A parallel to B): the pair separates at 1 m/s and comes back after ~1e300 s.
    a = path((0.5, 0.0, R), (1.0, 0.0, 0.0), (-1e-300, 0.0, 0.0))
    b = path((0.0, 0.0, R), zero, zero)
    out.append({'id': 'f1c/pair/far-genuine', 'kind': 'far-genuine', 'args': encode('ball_ball_time', [a, b, R, R, 1e-9])})
    p = path((0.0, 1.0 - 0.062 - 0.1, R), (0.0, -1.0, 0.0), (0.0, 1e-300, 0.0))
    out.append({'id': 'f1c/pocket/far-genuine', 'kind': 'far-genuine',
                'args': encode('ball_pocket_time', [p, {'center': {'x': 0.0, 'y': 1.0, 'z': 0.0}, 'radius': 0.062}, 1e-9])})
    # The two far-genuine plants above put the exact root near 1e300 s, where the expanded quartic's terms
    # (|B|^2 t^2 ~ 1e600) overflow binary64 in ANY power-of-two time scaling (term magnitudes at a root are
    # scale-invariant): reported only. The COMPUTABLE far-genuine plants below use |A| ~ 1e-155 (a4 ~ 1e-310,
    # subnormal, so the guard fires) and |B| ~ 1e-3: the exact root is near 1e152 s with terms ~1e298.
    a = path((0.1, 0.0, R), (1e-3, 0.0, 0.0), (-1e-155, 0.0, 0.0))
    b = path((0.0, 0.0, R), zero, zero)
    out.append({'id': 'f1c/pair/far-computable', 'kind': 'far-computable',
                'args': encode('ball_ball_time', [a, b, R, R, 1e-9])})
    p = path((0.0, 1.0 - 0.062 - 0.1, R), (0.0, -1e-3, 0.0), (0.0, 1e-155, 0.0))
    out.append({'id': 'f1c/pocket/far-computable', 'kind': 'far-computable',
                'args': encode('ball_pocket_time', [p, {'center': {'x': 0.0, 'y': 1.0, 'z': 0.0}, 'radius': 0.062}, 1e-9])})
    p = path((0.3, 0.0, R), (-1e-3, 0.0, 0.0), (1e-155, 0.0, 0.0))
    out.append({'id': 'f1c/circular/far-computable', 'kind': 'far-computable',
                'args': encode('ball_circular_cushion_time', [p, arc, R, 1e-9, 0.0])})
    p = path((0.0, 1.0 - 0.01, H + 0.05), (0.0, 0.0, 1e-3), (0.0, 0.0, -1e-155))
    out.append({'id': 'f1c/capsule/far-computable', 'kind': 'far-computable',
                'args': encode('ball_linear_cushion_time_airborne', [p, seg, R, 1e-9])})
    # In the under-nose band (gap < 0 at t = 0), leaving at 1 mm/s with c2 = 1e-155 back toward the jaw: the
    # main, seat and floor surfaces all run the guard (seat/floor validators carry the REST_APPROACH speed gate,
    # which the rescaled path must apply in original units). The earliest exact root is the main surface's.
    band = 0.0011 + RESEAT_SLACK
    p = path((0.5 - (0.02095 + R - 0.0004), 0.0, R), (-1e-3, 0.0, 0.0), (1e-155, 0.0, 0.0))
    out.append({'id': 'f1c/circular/band-far-computable', 'kind': 'far-computable',
                'args': encode('ball_circular_cushion_time', [p, arc, R, 1e-9, band])})
    # spurious far roots (exact far roots complex): leaving the arc / the nose with a skew 1e-300 c2.
    p = path((0.3, 0.05, R), (1.0, 0.2, 0.0), (-1e-300, 1e-300, 0.0))
    out.append({'id': 'f1c/circular/far-spurious', 'kind': 'far-spurious',
                'args': encode('ball_circular_cushion_time', [p, arc, R, 1e-9, 0.0])})
    p = path((0.0, 0.5, H), (0.3, -1.0, 0.2), (0.0, 0.0, -1e-300))
    out.append({'id': 'f1c/capsule/far-spurious', 'kind': 'far-spurious',
                'args': encode('ball_linear_cushion_time_airborne', [p, seg, R, 1e-9])})
    return out


def build_round2():
    """Round-2 plants (review pre-check on b3f06148).

    validator: refinements whose refined time fails the caller's validator while the represented root t0 passes it
      (expected: t0, i.e. today's bits). airborne-jaw-height is review's reproducer (z rises above the jaw top at the
      refined time); linear-span-end and arc-angle-span-end were found by scanning near-tangent contacts for a span
      boundary between t0 and the refined time.
    far-dip: certifiable far F1 contacts. With zero velocity the exact contact pair (entry/exit, ~0.6% apart) is well
      conditioned, but narrower than the old fixed 2^-6 probes; pair-review is review's reproducer.
    """
    out = []
    zero = (0.0, 0.0, 0.0)
    p = path((0.0, 0.049524999999999986, 0.048737499990574376), (1.0, 0.0, -0.009500009733184656), (0.0, 0.0, -4.905))
    arc = {'center': {'x': 0.05, 'y': 0.0, 'z': 0.0}, 'radius': 0.02095, 'height': 0.036}
    out.append({'id': 'k2/validator/airborne-jaw-height', 'kind': 'validator',
                'args': encode('ball_circular_cushion_time_airborne', [p, arc, R, 1e-9, 0.0])})
    p = path((0.0, 0.846455517578125, R), (1.0, 0.5, 0.0), (0.0, -0.5, 0.0))
    seg = {'p1': {'x': 0.492187500000002, 'y': 1.0, 'z': 0.0}, 'p2': {'x': -10.0, 'y': 1.0, 'z': 0.0}, 'height': 0.036}
    out.append({'id': 'k2/validator/linear-span-end', 'kind': 'validator',
                'args': encode('ball_linear_cushion_time', [p, seg, R, 1e-9, 0.0])})
    p = path((0.0, 0.0494766357421875, R), (1.0, 0.0, 0.0), zero)
    arc = {'center': {'x': 0.5, 'y': 0.0, 'z': 0.0}, 'radius': 0.02095, 'height': 0.036,
           'span': {'start': 1.6149940989406217, 'sweep': 0.5}}
    out.append({'id': 'k2/validator/arc-angle-span-end', 'kind': 'validator',
                'args': encode('ball_circular_cushion_time', [p, arc, R, 1e-9, 0.0])})
    a = path((10.0, 0.0, 0.0), zero, (-1e-155, 0.0, 0.0))
    b = path(zero, zero, zero)
    out.append({'id': 'k2/far-dip/pair-review', 'kind': 'far-dip', 'args': encode('ball_ball_time', [a, b, R, R, 1e-9])})
    p = path((0.0, -9.0, R), zero, (0.0, 1e-155, 0.0))
    out.append({'id': 'k2/far-dip/pocket', 'kind': 'far-dip',
                'args': encode('ball_pocket_time', [p, {'center': {'x': 0.0, 'y': 1.0, 'z': 0.0}, 'radius': 0.062}, 1e-9])})
    p = path((-9.5, 0.0, R), zero, (1e-155, 0.0, 0.0))
    arc = {'center': {'x': 0.5, 'y': 0.0, 'z': 0.0}, 'radius': 0.02095, 'height': 0.036}
    out.append({'id': 'k2/far-dip/arc', 'kind': 'far-dip',
                'args': encode('ball_circular_cushion_time', [p, arc, R, 1e-9, 0.0])})
    # review of record (b3f06148): coverage row band/ball_circular_cushion_time_airborne/0 with its z coefficients
    # replaced; the refined time rises above the jaw top (expected: the original time).
    p = path((-0.6203852548671713, 1.0958407362859062, 0.03260028384660944),
             (-0.9743155870787288, 4.668507729240654, 0.24720580670830136), (0.0, 0.0, -4.905))
    arc = {'center': {'x': -0.6870437320691886, 'y': 1.1550345623801515, 'z': 0.0}, 'radius': 0.02177589719056972,
           'height': 0.03520531498394695}
    out.append({'id': 'k2/validator/airborne-jaw-height-cov0', 'kind': 'validator',
                'args': encode('ball_circular_cushion_time_airborne', [p, arc, 0.03138349984189978, 9.859254447102612e-10, 0.0])})
    # review's far-contact grid: zero velocity, c2 = (accel, 0, 0) at distance from a stationary ball / a pocket of
    # radius 2R at the origin (a4 = accel^2: 1e-308 just below MIN_POSITIVE, 1e-310 and 1e-320 subnormal).
    for distance in (1.0, 2.0, 4.0, 10.0):
        for accel in (-1e-154, -1e-155, -1e-160):
            a = path((distance, 0.0, R), zero, (accel, 0.0, 0.0))
            b = path((0.0, 0.0, R), zero, zero)
            tag = f'd{distance:g}-a{accel:g}'
            out.append({'id': f'k2/far-dip/pair-{tag}', 'kind': 'far-dip', 'args': encode('ball_ball_time', [a, b, R, R, 1e-9])})
            out.append({'id': f'k2/far-dip/pocket-{tag}', 'kind': 'far-dip',
                        'args': encode('ball_pocket_time', [a, {'center': {'x': 0.0, 'y': 0.0, 'z': 0.0}, 'radius': 2.0 * R}, 1e-9])})
    for row in out:
        if row['kind'] == 'far-dip':
            lo, hi = exact_far_root(row['args']['adapter'], row['args'], beyond=60)
            row['exact'] = str(dec((lo + hi) / 2))
            row['accept'] = [hx(t) for t in float_neighbours(lo, hi)]
    return out


def exact_far_root(adapter, args_obj, beyond=100):
    """For the far-genuine plants (1-D motions by construction): the exact quartic's earliest root beyond
    1e100 s, as an exact enclosure. The contact window there is ~0.1 s wide, so the root is located in
    closed form (x(t) = +-d, two quadratics, Decimal) and then enclosed by exact bisection on G."""
    vals = [struct.unpack('<d', struct.pack('<Q', int(h, 16)))[0] for h in args_obj['f']]
    off2 = F(0)  # squared constant offset from the contact surface's axis (capsule only)
    if adapter == 'ball_ball_time':
        a, b = vals[0:9], vals[9:18]
        d = F(vals[18]) + F(vals[19])
        A = [F(a[6 + i]) - F(b[6 + i]) for i in range(3)]
        B = [F(a[3 + i]) - F(b[3 + i]) for i in range(3)]
        C = [F(a[i]) - F(b[i]) for i in range(3)]
    elif adapter == 'ball_linear_cushion_time_airborne':
        # z-only motion at a fixed horizontal offset delta from the nose axis: |w|^2 - (w.u)^2 = delta^2 + wz^2
        p = vals[0:9]
        assert p[3] == p[4] == p[6] == p[7] == 0.0, 'capsule plant must move in z only'
        cap = Capsule(path(p[0:3], p[3:6], p[6:9]), {'p1': dict(zip('xyz', vals[9:12])), 'p2': dict(zip('xyz', vals[12:15])),
                                                       'height': vals[15]}, vals[16])
        wx, wy, _ = cap.w(F(0))
        cr = cap.dx * wy - cap.dy * wx
        off2 = cr * cr / cap.L2
        d = F(vals[16])
        A = [F(0), F(0), F(p[8])]
        B = [F(0), F(0), F(p[5])]
        C = [F(0), F(0), F(p[2]) - F(vals[15])]
    else:
        p = vals[0:9]
        d = F(vals[12]) + (F(vals[14]) if adapter == 'ball_circular_cushion_time' else 0)
        A = [F(p[6]), F(p[7]), F(p[8]) * 0]
        B = [F(p[3]), F(p[4]), F(p[5]) * 0]
        C = [F(p[0]) - F(vals[9]), F(p[1]) - F(vals[10]), F(0)]

    def G(t):
        return off2 + sum((C[i] + B[i] * t + A[i] * t * t) ** 2 for i in range(3)) - d * d

    axes = [i for i in range(3) if A[i] != 0 or B[i] != 0]
    assert len(axes) == 1 and all(C[i] == 0 for i in range(3) if i not in axes), 'plant must be 1-D'
    k = axes[0]
    roots = []
    saved = getcontext().prec
    getcontext().prec = 400  # absolute resolution far below 1 ms at t ~ 1e300 s
    try:
        reach = dsqrt(d * d - off2)  # |x(t)| = reach on the contact surface
        for rhs in (reach, -reach):
            aa, bb = dec(A[k]), dec(B[k])
            cc = dec(C[k]) - rhs
            disc = bb * bb - 4 * aa * cc
            if disc < 0:
                continue
            sq = disc.sqrt()
            for sgn in (1, -1):
                roots.append((-bb + sgn * sq) / (2 * aa))
        far = min(r for r in roots if r > Decimal(10) ** beyond)
        farf = F(far)
    finally:
        getcontext().prec = saved
    lo, hi = farf - F(1, 1000), farf + F(1, 1000)
    assert G(lo) > 0 and G(hi) < 0, 'closed-form root does not bracket'
    return bisect(G, lo, hi, True, rel=F(1, 2 ** 80))


# ---------------------------------------------------------------- F2 (253 residual rows)

def m_pos_circle(p, cx, cy, t):
    n0 = math.hypot(p['c0']['x'] - cx, p['c0']['y'] - cy)
    n1 = math.hypot(p['c1']['x'], p['c1']['y'])
    n2 = math.hypot(p['c2']['x'], p['c2']['y'])
    return Decimal(n0) + Decimal(n1) * dec(F(t)) + Decimal(n2) * dec(F(t)) ** 2


def m_pos_capsule(p, seg, t):
    n0 = math.sqrt((p['c0']['x'] - seg['p1']['x']) ** 2 + (p['c0']['y'] - seg['p1']['y']) ** 2 + (p['c0']['z'] - seg['height']) ** 2)
    n1 = math.sqrt(sum(p['c1'][a] ** 2 for a in 'xyz'))
    n2 = math.sqrt(sum(p['c2'][a] ** 2 for a in 'xyz'))
    return Decimal(n0) + Decimal(n1) * dec(F(t)) + Decimal(n2) * dec(F(t)) ** 2


def circular_surfaces(p, arc, r, band):
    cx, cy, jaw = arc['center']['x'], arc['center']['y'], arc['radius']
    args = (p['c2']['x'], p['c2']['y'], p['c1']['x'], p['c1']['y'], p['c0']['x'], p['c0']['y'], cx, cy)
    contact = jaw + r
    rho0 = math.sqrt((p['c0']['x'] - cx) ** 2 + (p['c0']['y'] - cy) ** 2)
    surf = {'main': (xy_quartic(*args, jaw + r), F(jaw) + F(r))}
    if band > 0 and rho0 - contact < 0:
        seat_pen = band - RESEAT_SLACK
        surf['seat'] = (xy_quartic(*args, jaw + (r - seat_pen)), F(jaw) + F(r) - F(seat_pen))
        surf['floor'] = (xy_quartic(*args, jaw + (r - band)), F(jaw) + F(r) - F(band))
    return surf


def build_f2(rows, resid_perf):
    perf_r = {(r['stratum'], r['adapter'], r['index']): r['r'] for r in resid_perf}
    out = []
    for key in sorted(rows, key=lambda k: (STRATA.index(k[0]), k[1], k[2])):
        s, adapter, index = key
        d = rows[key]
        if adapter not in ('ball_circular_cushion_time', 'ball_linear_cushion_time_airborne'):
            continue
        fails = [f for f in d['failing'] if f.get('reason') == 'detect_residual']
        if not fails:
            continue
        f = fails[0]
        inp = d['input']
        p = inp[0]
        t0 = f['new']
        if adapter == 'ball_circular_cushion_time':
            arc, r, band = inp[1], inp[2], inp[4]
            surf = circular_surfaces(p, arc, r, band)
            which = [n for n, (k, _) in surf.items() if is_rn_root(k, t0)]
            name = which[0] if which else 'main'
            geo = Circle(p, arc['center']['x'], arc['center']['y'], surf[name][1])
            mpos = lambda t: m_pos_circle(p, arc['center']['x'], arc['center']['y'], t)
        else:
            seg, r = inp[1], inp[2]
            name = 'capsule'
            geo = Capsule(p, seg, r)
            mpos = lambda t: m_pos_capsule(p, seg, t)
        T0 = F(t0)
        X = F(1, 2 ** 16) * max(F(1), abs(T0))
        crossings = descending_crossings(geo, T0 - X, T0 + X)
        assert crossings, key
        lo, hi = min(crossings, key=lambda e: abs((e[0] + e[1]) / 2 - T0))
        accept = float_neighbours(lo, hi)
        floor = []
        margins = []
        for t in accept:
            g = geo.gap(F(t))
            fl = Decimal(64) * Decimal(U) * mpos(t)
            floor.append(str(fl))
            margins.append(float(fl / abs(g)) if g != 0 else float('inf'))
        rr = perf_r.get(key)
        agree = None
        if rr is not None:
            agree = float(abs(dec(lo) - Decimal(rr)) / Decimal(rr))
        out.append({'id': f'{s}/{adapter}/{index}', 'args': encode(adapter, inp), 'surface': name,
                    'new_k': hx(t0), 'old_k': hx(f['old']), 'accept': [hx(t) for t in accept],
                    'root': str(dec((lo + hi) / 2)), 'perf_r': rr, 'perf_r_rel_diff': agree,
                    'floor_margin_min': min(margins)})
    assert len(out) == 253, len(out)
    return out


# ---------------------------------------------------------------- F3 (phantom contacts)

def circle_min(geo, t0):
    """Exact minimiser of G near t0 (G' sign-change bisection), returns (t*, G(t*))."""
    T0 = F(t0)
    g0 = geo.Gd(T0)
    step = max(abs(T0), F(1, 1000)) * F(1, 2 ** 40)
    direction = 1 if g0 < 0 else -1
    prev = T0
    for _ in range(80):
        t1 = T0 + direction * step
        g1 = geo.Gd(t1)
        if (g1 > 0) != (g0 > 0) or g1 == 0:
            a, b = (prev, t1) if direction > 0 else (t1, prev)
            ga = geo.Gd(a)
            a, b = bisect(geo.Gd, a, b, ga > 0, rel=F(1, 2 ** 200))
            tm = (a + b) / 2
            return tm, geo.G(tm)
        prev = t1
        step *= 2
    raise AssertionError('no minimiser')


def build_f3(rows, refd):
    out, shifted = [], []
    for rr in refd:
        if 'cushion' not in rr['adapter']:
            continue
        key = (rr['stratum'], rr['adapter'], rr['index'])
        d = rows[key]
        inp = d['input']
        p = inp[0]
        t0 = rr['new_value']
        if rr['adapter'] == 'ball_circular_cushion_time':
            arc, r, t_min, band = inp[1], inp[2], inp[3], inp[4]
            surf = circular_surfaces(p, arc, r, band)
            which = [n for n, (k, _) in surf.items() if is_rn_root(k, t0)]
            name = which[0] if which else 'main'
            D = surf[name][1]
            geo = Circle(p, arc['center']['x'], arc['center']['y'], D)
            tm, gm = circle_min(geo, t0)
            rho_min = dsqrt(gm + D * D)
            gmin = rho_min - dec(D)
        else:
            seg, r, t_min, band = inp[1], inp[2], inp[3], inp[4]
            name = 'plane'
            geo = Plane(p, seg, F(r))
            k0, k1, k2 = geo.k
            assert k2 != 0
            tm = -k1 / (2 * k2)
            cmin = k0 - k1 * k1 / (4 * k2)
            assert cmin > 0
            gmin = dec(cmin) / dsqrt(geo.L2) - dec(F(r))
            gm = cmin * cmin - F(r) * F(r) * geo.L2
        assert gm > 0, (key, float(gmin))
        rid = f"{rr['stratum']}/{rr['adapter']}/{rr['index']}"
        out.append({'id': rid, 'class': rr['class'], 'args': encode(rr['adapter'], inp), 'surface': name,
                    'new_k': hx(t0), 'tstar': str(dec(tm)), 'gmin': '%.6e' % gmin})
        # (b) genuine shallow contacts at the same geometry: shift r (and the jaw radius) so the exact
        # minimum gap is the target, as close as the binary64 grid allows, and strictly negative.
        for target in (Decimal('-1e-18'), Decimal('-1e-15'), Decimal('-1e-12')):
            if rr['adapter'] == 'ball_circular_cushion_time':
                best = None
                jaw = arc['radius']
                want = gmin - target  # required increase of D
                base_r = r + float(want)  # first guess
                cands = []
                rc = base_r
                for _ in range(3):
                    rc = math.nextafter(rc, -math.inf)
                rs_ = []
                for _ in range(7):
                    rs_.append(rc)
                    rc = math.nextafter(rc, math.inf)
                jc = jaw
                for _ in range(3):
                    jc = math.nextafter(jc, -math.inf)
                js_ = []
                for _ in range(7):
                    js_.append(jc)
                    jc = math.nextafter(jc, math.inf)
                for r2 in rs_:
                    for j2 in js_:
                        D2 = F(j2) + F(r2) - (D - F(jaw) - F(r))  # keep the surface's band offset
                        g2 = rho_min - dec(D2)
                        if g2 < 0:
                            cands.append((abs(g2 - target), g2, r2, j2, D2))
                cands.sort(key=lambda c: c[0])
                _, g2, r2, j2, D2 = cands[0]
                # exact check: G at the exact minimiser is negative (rho_min^2 < D2^2) and the minimiser is unchanged
                assert gm + D * D - D2 * D2 < 0
                arc2 = dict(arc)
                arc2['radius'] = j2
                inp2 = [p, arc2, r2, t_min, band]
                geo2 = Circle(p, arc['center']['x'], arc['center']['y'], D2)
            else:
                want = gmin - target
                rc = r + float(want)
                for _ in range(3):
                    rc = math.nextafter(rc, -math.inf)
                cands = []
                for _ in range(7):
                    g2 = dec(cmin) / dsqrt(geo.L2) - dec(F(rc))
                    if g2 < 0 and cmin * cmin < F(rc) * F(rc) * geo.L2:
                        cands.append((abs(g2 - target), g2, rc))
                    rc = math.nextafter(rc, math.inf)
                cands.sort(key=lambda c: c[0])
                _, g2, r2 = cands[0]
                j2 = None
                inp2 = [p, seg, r2, t_min, band]
                geo2 = Plane(p, seg, F(r2))
            # exact entry root of the shifted geometry: the last descending crossing before the minimiser
            X = F(1, 2 ** 16) * max(F(1), abs(tm))
            before = [e for e in descending_crossings(geo2, tm - X, tm + X) if e[1] <= tm]
            ent = before[-1] if before else None
            shifted.append({'id': f"{rid}/shift{target}", 'base': rid, 'target': str(target),
                            'gmin': '%.6e' % g2, 'args': encode(rr['adapter'], inp2),
                            'accept': [hx(t) for t in float_neighbours(*ent)] if ent else None})
    assert len(out) == 70, len(out)
    return out, shifted


# ---------------------------------------------------------------- coverage rows (other cushion surfaces)

def build_cov(rows, per_adapter=400):
    counts = {}
    out = []
    for key in sorted(rows, key=lambda k: (STRATA.index(k[0]), k[1], k[2])):
        s, adapter, index = key
        if adapter not in ('ball_linear_cushion_time', 'ball_circular_cushion_time',
                           'ball_linear_cushion_time_airborne', 'ball_circular_cushion_time_airborne'):
            continue
        if counts.get(adapter, 0) >= per_adapter:
            continue
        inp = rows[key]['input']
        if any(isinstance(v, float) and v != 0 and abs(v) < 1e-200 for v in leaves(inp)):
            continue
        counts[adapter] = counts.get(adapter, 0) + 1
        out.append({'id': f'{s}/{adapter}/{index}', 'args': encode(adapter, inp)})
    return out


def leaves(o):
    if isinstance(o, dict):
        for v in o.values():
            yield from leaves(v)
    elif isinstance(o, list):
        for v in o:
            yield from leaves(v)
    else:
        yield o


def unhex(h):
    return struct.unpack('<d', struct.pack('<Q', int(h, 16)))[0]


def decode(args):
    """Inverse of encode() for the geometry the exact oracle needs."""
    f = [unhex(h) for h in args['f']]
    p = path(f[0:3], f[3:6], f[6:9])
    a = args['adapter']
    if a in ('ball_circular_cushion_time', 'ball_circular_cushion_time_airborne'):
        arc = {'center': {'x': f[9], 'y': f[10], 'z': f[11]}, 'radius': f[12], 'height': f[13]}
        return p, arc, f[14], f[15], f[16]
    if a == 'ball_linear_cushion_time':
        seg = {'p1': dict(zip('xyz', f[9:12])), 'p2': dict(zip('xyz', f[12:15])), 'height': f[15]}
        return p, seg, f[16], f[17], f[18]
    if a == 'ball_linear_cushion_time_airborne':
        seg = {'p1': dict(zip('xyz', f[9:12])), 'p2': dict(zip('xyz', f[12:15])), 'height': f[15]}
        return p, seg, f[16], f[17], None
    raise ValueError(a)


def cushion_surfaces(args):
    """Exact residual objects for every surface the kernel may have answered from (name, geo)."""
    a = args['adapter']
    p, geom, r, t_min, band = decode(args)
    out = []
    if a == 'ball_circular_cushion_time':
        for name, (_, D) in circular_surfaces(p, geom, r, band).items():
            out.append((name, Circle(p, geom['center']['x'], geom['center']['y'], D)))
    elif a == 'ball_circular_cushion_time_airborne':
        out.append(('jaw', Circle(p, geom['center']['x'], geom['center']['y'], F(geom['radius']) + F(r))))
    elif a == 'ball_linear_cushion_time':
        out.append(('plane', Plane(p, geom, F(r))))
        dx, dy = geom['p2']['x'] - geom['p1']['x'], geom['p2']['y'] - geom['p1']['y']
        ln = math.sqrt(dx * dx + dy * dy)
        lx, ly = -dy / ln, dx / ln
        l0 = -(lx * geom['p1']['x'] + ly * geom['p1']['y'])
        c = lx * p['c0']['x'] + ly * p['c0']['y'] + l0 - r
        if band > 0 and c < 0:
            seat_pen = band - RESEAT_SLACK
            out.append(('seat', Plane(p, geom, F(r) - F(seat_pen))))
            out.append(('floor', Plane(p, geom, F(r) - F(band))))
    else:
        out.append(('capsule', Capsule(p, geom, r)))
    return out, t_min


def exact_accept_near(args, t0, rel=F(1, 2 ** 16)):
    """Every exact descending crossing of the candidate surfaces within rel * max(1, |t0|) of t0 (Sturm
    isolation, so no narrow dip is skipped): the floats within one ulp of any of them, and of the nearest.
    None when there is no crossing in that window."""
    surfaces, _ = cushion_surfaces(args)
    T0 = F(t0)
    X = rel * max(F(1), abs(T0))
    found = []
    for name, geo in surfaces:
        for enc in descending_crossings(geo, T0 - X, T0 + X):
            found.append((abs((enc[0] + enc[1]) / 2 - T0), name, enc))
    if not found:
        return None
    found.sort(key=lambda x: x[0])
    every = sorted({hx(t) for _, _, enc in found for t in float_neighbours(*enc)})
    return {'surface': found[0][1], 'accept': every, 'nearest': [hx(t) for t in float_neighbours(*found[0][2])],
            'crossings': len(found)}


def expect_stage(outdir):
    """After the base capture: exact expectations for the coverage rows (base value -> nearest exact crossing)."""
    with open(os.path.join(outdir, 'base-outputs.json')) as fh:
        base = json.load(fh)
    with open(os.path.join(outdir, 'inputs-cov.json')) as fh:
        cov = json.load(fh)
    out = {}
    for row in cov:
        b = base['cov:' + row['id']]
        if b is None:
            continue
        t0 = unhex(b)
        _, t_min = cushion_surfaces(row['args'])
        if not t0 > t_min:
            continue
        out[row['id']] = exact_accept_near(row['args'], t0)
    with open(os.path.join(outdir, 'expect-cov.json'), 'w') as fh:
        json.dump(out, fh, indent=0, sort_keys=True)
        fh.write('\n')
    # Shifted genuine contacts: the exact crossings near today's root (which may be an earlier contact of the
    # same trajectory than the shifted dip).
    with open(os.path.join(outdir, 'inputs-f3b.json')) as fh:
        f3b = json.load(fh)
    out_b = {}
    for row in f3b:
        b = base['f3b:' + row['id']]
        if b is None:
            continue
        t0 = unhex(b)
        _, t_min = cushion_surfaces(row['args'])
        if t0 > t_min:
            out_b[row['id']] = exact_accept_near(row['args'], t0)
    with open(os.path.join(outdir, 'expect-f3b.json'), 'w') as fh:
        json.dump(out_b, fh, indent=0, sort_keys=True)
        fh.write('\n')
    print(json.dumps({'cov_rows_with_root': len(out), 'exact_crossing_found': sum(v is not None for v in out.values()),
                      'f3b_rows_with_root': len(out_b), 'f3b_exact_crossing_found': sum(v is not None for v in out_b.values())}))


def exact_m_pos(p, anchor, axes, t):
    """G2(d) M_pos = |c0 - anchor| + |c1| |t| + |c2| t^2 over the surface's anchored axes (exact inputs,
    80-digit square roots)."""
    n0 = dsqrt(sum((F(p['c0'][a]) - F(x)) ** 2 for a, x in zip(axes, anchor)))
    n1 = dsqrt(sum(F(p['c1'][a]) ** 2 for a in axes))
    n2 = dsqrt(sum(F(p['c2'][a]) ** 2 for a in axes))
    T = abs(dec(F(t)))
    return n0 + n1 * T + n2 * T * T


def pre_stage(keeps_path, outdir):
    """(i') plant: for every t0 the binary64 pre-filter kept, the exact gap of the surface it evaluated
    (plane offset r - pen, arc radius + r - pen, capsule r) against the exact floor 64u*M_pos(t0) with
    G2(d)'s anchored axes (airborne paths: x, y, z - height)."""
    rows = {}
    for set_, file in (('f2', 'inputs-f2.json'), ('cov', 'inputs-cov.json'), ('k2', 'inputs-k2.json'),
                       ('f3', 'inputs-f3.json'), ('f3b', 'inputs-f3b.json')):
        with open(os.path.join(outdir, file)) as fh:
            for r in json.load(fh):
                rows[f"{set_}:{r['id']}"] = r['args']
    with open(keeps_path) as fh:
        keeps = json.load(fh)
    out = {}
    worst = 0.0
    for k in keeps:
        args = rows[k['row']]
        a = args['adapter']
        p, geom, r, _t_min, _band = decode(args)
        neg_pen, t0 = F(unhex(k['neg_pen'])), unhex(k['t0'])
        airborne = a.endswith('_airborne')
        if k['surface'] == 0:
            assert a == 'ball_linear_cushion_time', k
            geo = Plane(p, geom, F(r) + neg_pen)
            anchor, axes = (geom['p1']['x'], geom['p1']['y']), 'xy'
        elif k['surface'] == 1:
            assert a.startswith('ball_circular_cushion_time'), k
            cx, cy = geom['center']['x'], geom['center']['y']
            geo = Circle(p, cx, cy, F(geom['radius']) + F(r) + neg_pen)
            anchor, axes = ((cx, cy, geom['height']), 'xyz') if airborne else ((cx, cy), 'xy')
        else:
            assert a == 'ball_linear_cushion_time_airborne' and neg_pen == 0, k
            geo = Capsule(p, geom, r)
            anchor, axes = (geom['p1']['x'], geom['p1']['y'], geom['height']), 'xyz'
        g = abs(geo.gap(F(t0)))
        floor = Decimal(64) * Decimal(U) * exact_m_pos(p, anchor, axes, t0)
        ratio = float(g / floor)
        worst = max(worst, ratio)
        out[k['key']] = {'ok': bool(g <= floor), 'ratio': ratio}
    with open(os.path.join(outdir, 'expect-pre.json'), 'w') as fh:
        json.dump(out, fh, indent=0, sort_keys=True)
        fh.write('\n')
    print(json.dumps({'kept': len(out), 'all_within_floor': all(v['ok'] for v in out.values()),
                      'max_gap_over_floor': worst}))


def main():
    if sys.argv[1] == 'expect':
        expect_stage(sys.argv[2])
        return
    if sys.argv[1] == 'pre':
        pre_stage(sys.argv[2], sys.argv[3])
        return
    kdir, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    rows = load_rows(kdir)
    with open(f'{kdir}/diag/refdiscrete-140.json') as fh:
        refd = json.load(fh)
    with open(f'{kdir}/diag/resid-253-rows.jsonl') as fh:
        resid_perf = [json.loads(line) for line in fh]
    f1 = build_f1(rows, refd)
    p1_path = sys.argv[3]
    with open(p1_path) as fh:
        p1 = {f"{r['stratum']}/{r['adapter']}/{r['index']}": r for r in json.load(fh)}
    for row in f1:
        row['p1'] = row['id'] in p1
        if row['p1']:
            assert encode(row['args']['adapter'], p1[row['id']]['input']) == row['args'], row['id']
    assert sum(r['p1'] for r in f1) == len(p1) == 229
    assert all(r['p1'] for r in f1 if r['set'] == 'f1a')
    f1c = build_f1c()
    for row in f1c:
        if row['kind'] in ('far-genuine', 'far-computable'):
            lo, hi = exact_far_root(row['args']['adapter'], row['args'])
            row['far_root'] = [str(dec(lo)), str(dec(hi))]
        elif row['kind'] == 'c' and 'cushion' in row['args']['adapter']:
            # closed-form estimates of the genuine contact, then the exact crossing nearest to them
            if row['args']['adapter'] == 'ball_circular_cushion_time':
                est = 1.0 - (0.02095 + R)
            else:
                est = (0.1 - math.sqrt(R * R - 1e-4)) / 2.0
            row['accept'] = exact_accept_near(row['args'], est)['accept']
    f2 = build_f2(rows, resid_perf)
    f3, f3b = build_f3(rows, refd)
    cov = build_cov(rows)
    k2 = build_round2()
    sets = {'inputs-f1.json': f1, 'inputs-f1c.json': f1c, 'inputs-f2.json': f2, 'inputs-f3.json': f3,
            'inputs-f3b.json': f3b, 'inputs-cov.json': cov, 'inputs-k2.json': k2}
    for name, data in sets.items():
        with open(os.path.join(outdir, name), 'w') as fh:
            json.dump(data, fh, indent=0, sort_keys=True)
            fh.write('\n')
    srcs = [f'out/fail-{s}-rel.jsonl' for s in STRATA] + ['diag/refdiscrete-140.json', 'diag/resid-253-rows.jsonl']
    manifest = {'k_dir': os.path.basename(os.path.normpath(kdir)), 'sources': {s: sha256(os.path.join(kdir, s)) for s in srcs},
                'p1_json_sha256': sha256(p1_path), 'counts': {k: len(v) for k, v in sets.items()}}
    with open(os.path.join(outdir, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=1, sort_keys=True)
        fh.write('\n')
    print(json.dumps(manifest['counts']))


if __name__ == '__main__':
    main()
