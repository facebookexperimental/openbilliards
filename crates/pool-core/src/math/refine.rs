// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Certified geometric refinement of cushion contact times (K-fix F2) and the
//! certified-miss test for phantom cushion contacts (K-fix F3).
//!
//! Clean-room implementation from the published algorithms only:
//! - D. E. Knuth, *The Art of Computer Programming*, vol. 2, *Seminumerical
//!   Algorithms* (1969), §4.2.2: the error-free sum TwoSum ([`two_sum`]).
//! - T. J. Dekker, "A floating-point technique for extending the available
//!   precision", *Numerische Mathematik* 18 (1971), with G. W. Veltkamp's
//!   splitting: [`split`] and the error-free product TwoProduct ([`two_prod`]).
//! - T. Ogita, S. M. Rump, S. Oishi, "Accurate sum and dot product", *SIAM J.
//!   Sci. Comput.* 26(6) (2005): the a-priori error bounds of compensated
//!   (double-double) sums and products (γ_n = nu/(1 − nu)).
//!
//! Only IEEE-754 binary64 `+ − × /` and comparisons are used (no FMA, no
//! square root), so every result is bit-identical on native and wasm32.
//!
//! # Residuals (exact geometry)
//!
//! Every surface is built from EXACT input differences (TwoSum): the path
//! components w(t) = (c0 − anchor) + c1·t + c2·t² have exact double-double
//! constant terms and exact binary64 linear and quadratic terms.
//! - [`Residual::plane`], axis-aligned segment (p2 − p1 has a zero
//!   component): G = ±w_⊥(t) − d, the plane gap in metres (linear in w).
//! - [`Residual::plane`], general segment: X = cross(p2 − p1, w) and
//!   G = X² − d²·L² (sign of the gap where X > 0, checked per evaluation).
//! - [`Residual::circle`] (arc, airborne jaw): G = w_x² + w_y² − D².
//! - [`Residual::capsule`] (airborne nose): G = X² + L²·w_z² − r²·L²,
//!   L²·(squared point-to-axis distance − r²).
//!
//! # Error bound of one evaluation (derivation in REPORT-KFIX-v1, F2)
//!
//! u = 2^-53. A component Q = a + b·t + c·t² (a exact double-double, b, c
//! exact) is evaluated with TwoProduct/TwoSum for its leading parts; with
//! M = |a| + |b||t| + |c|t², every other operation touches a term of size at
//! most 4.01u·M and eight of them are summed in binary64 (γ_7), so
//! |Q − Q̃| ≤ β = 32u²·M. A cross term X = dx·Q_y − dy·Q_x adds
//! |dx|β_y + |dy|β_x + 24u²(|dx||Q_y| + |dy||Q_x|). Squaring, weighting and
//! the compensated total add at most 64u²·(Σ(M_j² + Q̃_j²) + |R2|) + 8u·(the
//! binary64-summed low parts); the propagated part is Σ(2|Q̃_j| + β_j)·β_j
//! plus the weight and R2 errors (≤ 32u² relative, set-up). Underflow inside
//! an error-free product is covered by an absolute 2^-900. Bounds computed in
//! binary64 are inflated by (1 + 2^-20).

/// u = 2^-53, the unit roundoff of binary64 round-to-nearest.
const U: f64 = 0.5 * f64::EPSILON;
/// u².
const U2: f64 = U * U;
/// Inflation of a bound computed in binary64 (covers ≤ 2^20 roundings).
const INFLATE: f64 = 1.0 + 1.0 / 1_048_576.0;
/// 2^-900: absolute slack for underflow inside the error-free transforms.
const UNDERFLOW_SLACK: f64 = f64::from_bits(123u64 << 52);
/// Evaluations stay where every intermediate is finite and the bounds hold.
const T_DOMAIN: f64 = 1_073_741_824.0; // 2^30 s
const M_DOMAIN: f64 = 1_152_921_504_606_846_976.0; // 2^60
/// Hard cap on residual evaluations per refinement (BRIEF-KFIX-v1, cond. 3).
pub(crate) const MAX_EVALS: u32 = 8;
/// Cap on derivative evaluations in the certified-miss test (rare path).
const MAX_MISS_EVALS: u32 = 64;

/// |x| ≤ limit (false for NaN).
fn in_domain(x: f64, limit: f64) -> bool {
    x.abs() <= limit
}

// ---------------------------------------------------------------- error-free transforms

/// Knuth's TwoSum: s + e = a + b exactly (barring overflow), s = fl(a + b).
#[inline(always)]
fn two_sum(a: f64, b: f64) -> (f64, f64) {
    let s = a + b;
    let bb = s - a;
    let e = (a - (s - bb)) + (b - bb);
    (s, e)
}

/// Veltkamp's split: a = hi + lo, each with at most 26 significant bits.
#[inline(always)]
fn split(a: f64) -> (f64, f64) {
    let c = 134_217_729.0 * a; // 2^27 + 1
    let hi = c - (c - a);
    (hi, a - hi)
}

/// Dekker's TwoProduct: p + e = a·b exactly (barring overflow/underflow).
#[inline(always)]
fn two_prod(a: f64, b: f64) -> (f64, f64) {
    let (bh, bl) = split(b);
    two_prod_split(a, b, bh, bl)
}

/// TwoProduct with b = bh + bl already split.
#[inline(always)]
fn two_prod_split(a: f64, b: f64, bh: f64, bl: f64) -> (f64, f64) {
    let p = a * b;
    let (ah, al) = split(a);
    let e = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
    (p, e)
}

/// Double-double square of a normalized x = hi + lo (relative error ≤ 4u²).
#[inline(always)]
fn dd_sq(hi: f64, lo: f64) -> (f64, f64) {
    let (p, e) = two_prod(hi, hi);
    two_sum(p, e + 2.0 * hi * lo)
}

/// Double-double product of normalized x, y (relative error ≤ 6u²).
#[inline(always)]
fn dd_mul(x: (f64, f64), y: (f64, f64)) -> (f64, f64) {
    let (p, e) = two_prod(x.0, y.0);
    two_sum(p, e + (x.0 * y.1 + x.1 * y.0))
}

/// Double-double sum of two nonnegative normalized values (relative ≤ 4u²).
#[inline(always)]
fn dd_add_pos(x: (f64, f64), y: (f64, f64)) -> (f64, f64) {
    let (s, e) = two_sum(x.0, y.0);
    two_sum(s, e + (x.1 + y.1))
}

// ---------------------------------------------------------------- components

/// One path component Q(t) = (a_hi + a_lo) + b·t + c·t², all coefficients
/// exact (a = c0 − anchor by TwoSum, b = c1, c = c2).
#[derive(Clone, Copy, Debug)]
struct Comp {
    a_hi: f64,
    a_lo: f64,
    b: f64,
    c: f64,
}

/// Q(t) in double-double with its bound (see the module docs).
#[derive(Clone, Copy, Debug)]
struct CompAt {
    hi: f64,
    lo: f64,
    /// β ≥ |Q − (hi + lo)|.
    beta: f64,
    /// M = |a| + |b||t| + |c|t².
    m: f64,
    /// Binary64 slope b + 2c·t.
    slope: f64,
    /// P = |b| + 2|c||t| ≥ |Q′|.
    p: f64,
}

/// The time point, split once for every component.
#[derive(Clone, Copy)]
struct TimeAt {
    t: f64,
    th: f64,
    tl: f64,
    tt: f64,
    tt_lo: f64,
    tth: f64,
    ttl: f64,
}

impl TimeAt {
    #[inline(always)]
    fn new(t: f64) -> TimeAt {
        let (th, tl) = split(t);
        let (tt, tt_lo) = two_prod_split(t, t, th, tl);
        let (tth, ttl) = split(tt);
        TimeAt {
            t,
            th,
            tl,
            tt,
            tt_lo,
            tth,
            ttl,
        }
    }
}

impl Comp {
    fn new(c0: f64, anchor: f64, c1: f64, c2: f64) -> Comp {
        let (a_hi, a_lo) = two_sum(c0, -anchor);
        Comp {
            a_hi,
            a_lo,
            b: c1,
            c: c2,
        }
    }

    #[inline(always)]
    fn at(&self, x: &TimeAt) -> CompAt {
        let (p1, e1) = two_prod_split(self.b, x.t, x.th, x.tl);
        let (p2, e2) = two_prod_split(self.c, x.tt, x.tth, x.ttl);
        let (s1, g1) = two_sum(self.a_hi, p1);
        let (s, g2) = two_sum(s1, p2);
        let low = self.a_lo + e1 + e2 + self.c * x.tt_lo + g1 + g2;
        let (hi, lo) = two_sum(s, low);
        let ta = x.t.abs();
        let m = self.a_hi.abs() + self.b.abs() * ta + self.c.abs() * x.tt;
        CompAt {
            hi,
            lo,
            beta: 32.0 * U2 * m,
            m,
            slope: self.b + 2.0 * self.c * x.t,
            p: self.b.abs() + 2.0 * self.c.abs() * ta,
        }
    }
}

// ---------------------------------------------------------------- residual

#[derive(Clone, Copy, Debug)]
enum Kind {
    /// G = s·Q − d (s = ±1), the gap to an axis-aligned plane.
    Axis { q: Comp, s: f64, d: (f64, f64) },
    /// G = Q_x² + Q_y² − R2.
    Circle { qx: Comp, qy: Comp, r2: (f64, f64) },
    /// G = X² + w·Q_z² − R2 with X = dx·Q_y − dy·Q_x (plane: no Q_z).
    Cross {
        qx: Comp,
        qy: Comp,
        qz: Option<Comp>,
        dx: (f64, f64),
        dy: (f64, f64),
        w: (f64, f64),
        r2: (f64, f64),
    },
}

/// The exact residual of one contact surface (see the module docs).
#[derive(Clone, Copy, Debug)]
pub(crate) struct Residual {
    kind: Kind,
    /// Absolute error bounds of the set-up constants R2 and w.
    r2_err: f64,
    w_err: f64,
}

/// One evaluation at t: G = g_hi + g_lo with |G_exact − G| ≤ bound, the
/// binary64 derivative dg with |G′_exact − dg| ≤ dg_err, and the curvature
/// bound |G″| ≤ a0 + a1·h + a2·h² on [t − h, t + h].
#[derive(Clone, Copy, Debug)]
pub(crate) struct Eval {
    g_hi: f64,
    g_lo: f64,
    bound: f64,
    dg: f64,
    dg_err: f64,
    a0: f64,
    a1: f64,
    a2: f64,
    /// False when the plane's cross term is not certified positive.
    valid: bool,
}

impl Eval {
    /// Certified sign of G: +1 (outside), −1 (inside) or 0 (undecided).
    fn sign(&self) -> i32 {
        let v = self.g_hi + self.g_lo;
        if !self.valid {
            0
        } else if v > self.bound {
            1
        } else if v < -self.bound {
            -1
        } else {
            0
        }
    }

    fn lower(&self) -> f64 {
        self.g_hi + self.g_lo - self.bound * INFLATE
    }

    /// Upper bound of |G″| on [t − h, t + h] (see [`Curv`]).
    #[inline(always)]
    fn curvature_bound(&self, h: f64) -> f64 {
        (self.a0 + (self.a1 + self.a2 * h) * h) * (INFLATE * INFLATE)
    }
}

/// Curvature accumulator: G″ = Σ 2ω(Q′² + 2Q·c) for a squared term with
/// |Q| ≤ q, |Q′| ≤ p, |c| ≤ c on [t − h, t + h] grows as
/// |Q′| ≤ p + 2ch, |Q| ≤ q + ph + ch², so
/// |G″| ≤ 2Σω(p² + 2qc) + 12Σω·pc·h + 12Σω·c²·h².
#[derive(Default, Clone, Copy)]
struct Curv {
    a0: f64,
    a1: f64,
    a2: f64,
}

impl Curv {
    #[inline(always)]
    fn add(&mut self, w: f64, q: f64, p: f64, c: f64) {
        self.a0 += 2.0 * w * (p * p + 2.0 * q * c);
        self.a1 += 12.0 * w * p * c;
        self.a2 += 12.0 * w * c * c;
    }
}

/// Fast ulp of a finite x > 0 (the spacing above x).
#[inline(always)]
fn ulp_of(x: f64) -> f64 {
    let e = x.to_bits() & 0x7ff0_0000_0000_0000;
    if e >= (53u64 << 52) {
        f64::from_bits(e - (52u64 << 52))
    } else {
        x.next_up() - x
    }
}

/// Compensated Σ hi_j + lo_j − R2: the hi parts summed exactly (TwoSum), the
/// low parts in binary64.
#[inline(always)]
fn total(h0: f64, l0: f64, h1: f64, l1: f64, r2: (f64, f64)) -> (f64, f64) {
    let (s1, g1) = two_sum(h0, h1);
    let (s2, g2) = two_sum(s1, -r2.0);
    two_sum(s2, ((l0 + l1) + (g1 + g2)) - r2.1)
}

/// x² as hi + lo for a normalized x = h + l (relative error ≤ 3u²).
#[inline(always)]
fn square(h: f64, l: f64) -> (f64, f64) {
    let (p, e) = two_prod(h, h);
    (p, e + 2.0 * h * l)
}

impl Residual {
    /// Arc or airborne jaw: w = path_xy − centre, D = d[0] + d[1] + d[2]
    /// exactly (arc radius, ball radius, minus the seat/floor offset).
    pub(crate) fn circle(
        c0: [f64; 2],
        c1: [f64; 2],
        c2: [f64; 2],
        centre: [f64; 2],
        d: [f64; 3],
    ) -> Residual {
        let (s, e) = two_sum(d[0], d[1]);
        let (s2, e2) = two_sum(s, d[2]);
        let (dh, dl) = two_sum(s2, e + e2); // |D − (dh + dl)| ≤ u|e + e2| ≤ 2u²|D|
        let r2 = dd_sq(dh, dl);
        Residual {
            kind: Kind::Circle {
                qx: Comp::new(c0[0], centre[0], c1[0], c2[0]),
                qy: Comp::new(c0[1], centre[1], c1[1], c2[1]),
                r2,
            },
            r2_err: 16.0 * U2 * r2.0.abs(),
            w_err: 0.0,
        }
    }

    /// Linear cushion plane at signed distance d = d[0] + d[1] exactly (ball
    /// radius, minus the seat/floor offset) on the playable side (left of
    /// p1 → p2).
    pub(crate) fn plane(
        c0: [f64; 2],
        c1: [f64; 2],
        c2: [f64; 2],
        p1: [f64; 2],
        p2: [f64; 2],
        d: [f64; 2],
    ) -> Residual {
        let qx = Comp::new(c0[0], p1[0], c1[0], c2[0]);
        let qy = Comp::new(c0[1], p1[1], c1[1], c2[1]);
        let dx = two_sum(p2[0], -p1[0]);
        let dy = two_sum(p2[1], -p1[1]);
        let dd = two_sum(d[0], d[1]);
        let axis = |q: Comp, s: f64| Residual {
            kind: Kind::Axis { q, s, d: dd },
            r2_err: 0.0,
            w_err: 0.0,
        };
        if dy == (0.0, 0.0) && dx.0 != 0.0 {
            // Horizontal: signed distance = sign(dx)·w_y.
            return axis(qy, if dx.0 > 0.0 { 1.0 } else { -1.0 });
        }
        if dx == (0.0, 0.0) && dy.0 != 0.0 {
            // Vertical: signed distance = −sign(dy)·w_x.
            return axis(qx, if dy.0 > 0.0 { -1.0 } else { 1.0 });
        }
        let l2 = dd_add_pos(dd_sq(dx.0, dx.1), dd_sq(dy.0, dy.1));
        let r2 = dd_mul(dd_sq(dd.0, dd.1), l2);
        Residual {
            kind: Kind::Cross {
                qx,
                qy,
                qz: None,
                dx,
                dy,
                w: (0.0, 0.0),
                r2,
            },
            r2_err: 32.0 * U2 * r2.0.abs(),
            w_err: 0.0,
        }
    }

    /// Airborne nose capsule: L²·(squared distance to the horizontal axis
    /// through (p1, height) along p2 − p1, minus r²).
    pub(crate) fn capsule(
        c0: [f64; 3],
        c1: [f64; 3],
        c2: [f64; 3],
        p1: [f64; 2],
        p2: [f64; 2],
        height: f64,
        r: f64,
    ) -> Residual {
        let dx = two_sum(p2[0], -p1[0]);
        let dy = two_sum(p2[1], -p1[1]);
        let l2 = dd_add_pos(dd_sq(dx.0, dx.1), dd_sq(dy.0, dy.1));
        let r2 = dd_mul(dd_sq(r, 0.0), l2);
        Residual {
            kind: Kind::Cross {
                qx: Comp::new(c0[0], p1[0], c1[0], c2[0]),
                qy: Comp::new(c0[1], p1[1], c1[1], c2[1]),
                qz: Some(Comp::new(c0[2], height, c1[2], c2[2])),
                dx,
                dy,
                w: l2,
                r2,
            },
            r2_err: 32.0 * U2 * r2.0.abs(),
            w_err: 16.0 * U2 * l2.0.abs(),
        }
    }

    /// Evaluate G and G′ at t. A-priori bounds (module docs): each component
    /// satisfies |Q| ≤ M + β and β ≤ 32u²M; a cross term X satisfies
    /// |X| ≤ M_X = |dx|M_y + |dy|M_x and β_X ≤ 57u²M_X. Squaring adds
    /// (2|Q̃| + β)β + 3u²M² per term and the compensated total 6u²(Σ ωM² +
    /// |R2|), so |G − G̃| ≤ 200u²(Σ ω_j M_j² + |R2|) + the set-up errors. The
    /// binary64 derivative 2Σ ω·Q̃·(b + 2ct) is within 32u·Σ ω_j M_j P_j
    /// (P = |b| + 2|c||t|) of G′.
    pub(crate) fn eval(&self, t: f64) -> Option<Eval> {
        if !in_domain(t, T_DOMAIN) {
            return None;
        }
        let x = TimeAt::new(t);
        let mut curv = Curv::default();
        let e = match self.kind {
            Kind::Axis { q, s, d } => {
                let v = q.at(&x);
                let (g_hi, e0) = two_sum(s * v.hi, -d.0);
                Eval {
                    g_hi,
                    g_lo: s * v.lo - d.1 + e0,
                    bound: (48.0 * U2 * (v.m + d.0.abs()) + UNDERFLOW_SLACK) * INFLATE,
                    dg: s * v.slope,
                    dg_err: 3.0 * U * v.p * INFLATE,
                    a0: 2.0 * q.c.abs(),
                    a1: 0.0,
                    a2: 0.0,
                    valid: in_domain(v.m, M_DOMAIN),
                }
            }
            Kind::Circle { qx, qy, r2 } => {
                let (vx, vy) = (qx.at(&x), qy.at(&x));
                let (sx, sy) = (square(vx.hi, vx.lo), square(vy.hi, vy.lo));
                let (g_hi, g_lo) = total(sx.0, sx.1, sy.0, sy.1, r2);
                let mags = vx.m * vx.m + vy.m * vy.m;
                curv.add(1.0, vx.hi.abs() + vx.beta + U * vx.m, vx.p, qx.c.abs());
                curv.add(1.0, vy.hi.abs() + vy.beta + U * vy.m, vy.p, qy.c.abs());
                Eval {
                    g_hi,
                    g_lo,
                    bound: (200.0 * U2 * (mags + r2.0.abs()) + self.r2_err + UNDERFLOW_SLACK)
                        * INFLATE,
                    dg: 2.0 * (vx.hi * vx.slope + vy.hi * vy.slope),
                    dg_err: 32.0 * U * (vx.m * vx.p + vy.m * vy.p) * INFLATE,
                    a0: curv.a0,
                    a1: curv.a1,
                    a2: curv.a2,
                    valid: in_domain(mags, M_DOMAIN),
                }
            }
            Kind::Cross {
                qx,
                qy,
                qz,
                dx,
                dy,
                w,
                r2,
            } => {
                let (vx, vy) = (qx.at(&x), qy.at(&x));
                // X = dx·Q_y − dy·Q_x.
                let (p1, e1) = two_prod(dx.0, vy.hi);
                let (p2, e2) = two_prod(dy.0, vx.hi);
                let (s, g) = two_sum(p1, -p2);
                let low =
                    (e1 - e2) + g + (dx.0 * vy.lo - dy.0 * vx.lo) + (dx.1 * vy.hi - dy.1 * vx.hi);
                let (xh, xl) = two_sum(s, low);
                let (adx, ady) = (dx.0.abs() + dx.1.abs(), dy.0.abs() + dy.1.abs());
                let mx = adx * vy.m + ady * vx.m;
                let px = adx * vy.p + ady * vx.p;
                let sq = square(xh, xl);
                let mut mags = mx * mx;
                let mut dg = 2.0 * xh * (dx.0 * vy.slope - dy.0 * vx.slope);
                let mut dg_err = 32.0 * U * mx * px;
                curv.add(
                    1.0,
                    xh.abs() + 64.0 * U * mx,
                    px,
                    adx * qy.c.abs() + ady * qx.c.abs(),
                );
                let mut extra = 0.0;
                let (g_hi, g_lo) = match qz {
                    None => total(sq.0, sq.1, 0.0, 0.0, r2),
                    Some(qz) => {
                        let vz = qz.at(&x);
                        let (zh, zl) = dd_mul(dd_sq(vz.hi, vz.lo), w);
                        let wabs = (w.0.abs() + w.1.abs() + self.w_err) * INFLATE;
                        mags += wabs * vz.m * vz.m;
                        extra =
                            self.w_err * (vz.m + vz.beta) * (vz.m + vz.beta) + 16.0 * U2 * zh.abs();
                        dg += 2.0 * w.0 * vz.hi * vz.slope;
                        dg_err += 32.0 * U * wabs * vz.m * vz.p
                            + 2.0 * (w.1.abs() + self.w_err) * vz.m * vz.p;
                        curv.add(wabs, vz.hi.abs() + vz.beta + U * vz.m, vz.p, qz.c.abs());
                        total(sq.0, sq.1, zh, zl, r2)
                    }
                };
                Eval {
                    g_hi,
                    g_lo,
                    bound: (200.0 * U2 * (mags + r2.0.abs())
                        + extra
                        + self.r2_err
                        + UNDERFLOW_SLACK)
                        * INFLATE,
                    dg,
                    dg_err: dg_err * INFLATE,
                    a0: curv.a0,
                    a1: curv.a1,
                    a2: curv.a2,
                    valid: in_domain(mags, M_DOMAIN) && (qz.is_some() || xh + xl > 64.0 * U * mx),
                }
            }
        };
        let finite = (e.g_hi + e.g_lo + e.bound + e.dg + e.dg_err + e.a0 + e.a1 + e.a2).is_finite();
        finite.then_some(e)
    }
}

// ---------------------------------------------------------------- represented-root error window

/// Root-error window around a represented root t of the binary64 builder
/// polynomial `k` (`[a4..a0]`): its coefficients are within 16u·S_k of the
/// exact ones (S_k = the builder's term-magnitude sums `sk`, at most eight
/// roundings per term), so the represented root sits within about
/// Δ = 16u·Σ S_k t^k / |C′(t)| of an exact one (first order; at a near-tangent
/// root |C′| itself shrinks like the square root of the dip depth, so Δ also
/// spans the second-order displacement). Window = 8Δ + 4ulp(t), capped at
/// 2^-20·max(1, |t|).
pub(crate) fn root_window(k: &[f64; 5], sk: &[f64; 5], t: f64) -> f64 {
    let ta = t.abs();
    let e = 16.0 * U * ((((sk[0] * ta + sk[1]) * ta + sk[2]) * ta + sk[3]) * ta + sk[4]);
    let dc = ((4.0 * k[0] * t + 3.0 * k[1]) * t + 2.0 * k[2]) * t + k[3];
    let ulp = t.next_up() - t;
    let cap = (1.0 / 1_048_576.0) * ta.max(1.0);
    let w = 8.0 * (e / dc.abs()) + 4.0 * ulp;
    if w.is_finite() {
        w.min(cap)
    } else {
        cap
    }
}

// ---------------------------------------------------------------- (i′) binary64 pre-filter

/// Pre-filter verdict: keep t0 (no refinement).
pub(crate) const PRE_KEEP: u8 = 0;
/// Condition (a) failed: the certified gap bound exceeds floor_lo/8.
pub(crate) const PRE_GAP: u8 = 1;
/// Condition (b) failed: no descending crossing certified near t0.
pub(crate) const PRE_CROSS: u8 = 2;

/// One component Q = (c0 − anchor) + b·t + c·t² in plain binary64 at t, with
/// running error bounds. Every rounded result z obeys |fl(z) − z| ≤ u·|fl(z)|
/// (round to nearest; underflow is covered by the caller's absolute slack),
/// so with a = fl(c0 − anchor), pb = fl(b·t), tt = fl(t·t), pc = fl(c·tt),
/// s = fl(pb + pc), q = fl(a + s):
/// |Q − q| ≤ u(|a| + |pb| + 2|pc| + |s| + |q|) (pc carries the error of tt),
/// and Q′ = b + 2c·t is within u(|fl(2c·t)| + |sl|) of sl = fl(b + fl(2c·t)).
/// The bounds are evaluated in binary64 and inflated once by the caller.
#[derive(Clone, Copy)]
struct Fc {
    q: f64,
    e: f64,
    sl: f64,
    esl: f64,
    /// P = |b| + 2|c||t| ≥ |Q′(t)|.
    p: f64,
    /// |c|.
    c: f64,
    /// |a| = |fl(c0 − anchor)| and |b| (for the floor).
    a: f64,
    b: f64,
}

#[inline(always)]
fn fc(c0: f64, anchor: f64, b: f64, c: f64, t: f64, tt: f64) -> Fc {
    let a = c0 - anchor;
    let pb = b * t;
    let pc = c * tt;
    let s = pb + pc;
    let q = a + s;
    let c2t = (2.0 * c) * t;
    let sl = b + c2t;
    Fc {
        q,
        e: U * (a.abs() + pb.abs() + 2.0 * pc.abs() + s.abs() + q.abs()),
        sl,
        esl: U * (c2t.abs() + sl.abs()),
        p: b.abs() + 2.0 * c.abs() * t.abs(),
        c: c.abs(),
        a: a.abs(),
        b: b.abs(),
    }
}

/// 1/√2 lowered by 2^-20 (relative): the two roundings of the sum branch of
/// [`norm_lo2`] stay far below that gap.
const INV_SQRT2_LO: f64 = std::f64::consts::FRAC_1_SQRT_2 * (1.0 - 1.0 / 1_048_576.0);

/// Lower bounds of a Euclidean norm without a square root:
/// max(max|v_i|, Σ|v_i|·c) with c below 1/√n (Cauchy–Schwarz); the two
/// roundings of the sum branch stay below the relative gap of c.
#[inline(always)]
fn norm_lo2(x: f64, y: f64) -> f64 {
    let (x, y) = (x.abs(), y.abs());
    x.max(y).max((x + y) * INV_SQRT2_LO)
}

#[inline(always)]
fn norm_lo3(x: f64, y: f64, z: f64) -> f64 {
    let (x, y, z) = (x.abs(), y.abs(), z.abs());
    x.max(y).max(z).max((x + y + z) * 0.577_350_2)
}

/// 64u·(1 − 16u) = 2^-47 − 2^-96 (exact in binary64).
const FLOOR_FACTOR: f64 = 64.0 * U * (1.0 - 16.0 * U);

/// floor_lo ≤ 64u·M_pos(t) with M_pos = |c0 − anchor| + |c1|·|t| + |c2|·t²
/// (norms over the G2 surface's anchored coordinates; `n0`, `n1`, `n2` are
/// the lower bounds above). The computed M is within (1 + 7u) of the exact
/// lower-bound expression (|a| carries fl(c0 − anchor)), so the factor
/// 1 − 16u keeps floor_lo below the exact floor.
#[inline(always)]
fn floor_lo(n0: f64, n1: f64, n2: f64, t: f64, tt: f64) -> f64 {
    (n0 + n1 * t.abs() + n2 * tt) * FLOOR_FACTOR
}

/// 1 − 2^-20 and 1 − 2^-19: margins for the roundings of a few products.
const SLACK20: f64 = 1.0 - 1.0 / 1_048_576.0;
const SLACK19: f64 = 1.0 - 1.0 / 524_288.0;

/// Condition (b) on a function F with the sign of the gap: |F(t0)| ≤ ub,
/// F̃′ < 0 with |F′(t0) − F̃′| ≤ edf, and |F″| ≤ k on [t0 − W, t0 + W],
/// W = 2^-20·max(1, |t0|). With m0 = −F̃′ − edf > 0 and w = 4·ub/m0, the
/// division-free tests 4·ub ≤ m0·W, 16·k·ub ≤ m0² and 4·ub ≤ (t0 − t_min)·m0
/// (each with a 2^-20 margin for their roundings) give w < W, w < t0 − t_min
/// and k·w ≤ m0/4, so F′ ≤ −(3/4)·m0 on [t0 − w, t0 + w] (constant sign) and
/// F(t0 − w) ≥ 2·ub > 0 > F(t0 + w): a descending crossing of the exact F lies
/// within w of t0, above t_min. Returns W.
#[inline(always)]
fn crossing_near(ub: f64, df: f64, edf: f64, curv: &Curv, t0: f64, t_min: f64) -> Option<f64> {
    let m0 = -df - edf;
    let descending = m0 > 0.0;
    if !descending {
        return None;
    }
    let cap = (1.0 / 1_048_576.0) * t0.abs().max(1.0);
    let k = (curv.a0 + (curv.a1 + curv.a2 * cap) * cap) * (INFLATE * INFLATE);
    let quarter = 4.0 * ub;
    let ok = quarter <= m0 * cap * SLACK20
        && 16.0 * k * ub <= m0 * m0 * SLACK20
        && quarter <= (t0 - t_min) * m0 * SLACK20;
    ok.then_some(cap)
}

/// Condition (a) for a squared form G = den·g·(g + 2d) with g + 2d ≥ d > 0
/// (circle: den = 1, d = D; plane: den = L², d = the plane offset, cross term
/// positive; capsule: den = L², d = r), from |G| ≤ ug and lower bounds
/// `den_lo`, `d_lo`: ε = |G|/(den·d) ≤ ug/(den_lo·d_lo) ≤ 2^-20·d_lo (first
/// test), so |g| = |G|/(den·(g + 2d)) ≤ ug/(den·(2d − ε)) ≤
/// ug/(2·den_lo·d_lo·(1 − 2^-21)), and the second test
/// 8·ug ≤ 2·den_lo·d_lo·floor_lo·(1 − 2^-19) gives 8·|g| ≤ floor_lo. No
/// division.
#[inline(always)]
fn gap_test_squared(ug: f64, den_lo: f64, d_lo: f64, floor: f64) -> bool {
    let pd = den_lo * d_lo;
    den_lo > 0.0
        && d_lo > 0.0
        && ug <= pd * d_lo * (1.0 / 1_048_576.0)
        && 8.0 * ug <= 2.0 * pd * floor * SLACK19
}

/// A lower bound of an exact x with |x − v| ≤ e (e computed in binary64;
/// the subtraction's own rounding included).
#[inline(always)]
fn lower(v: f64, e: f64) -> f64 {
    (v - e * INFLATE) * (1.0 - 4.0 * U)
}

/// (a) then (b): keep iff the gap test passed (floor finite) and a crossing
/// is certified. `_gap_ub`, `_gap_val` (the certified gap bound and the
/// binary64 gap value, metres) feed the test-only diagnostics.
#[inline(always)]
fn pre_verdict(
    gap_ok: bool,
    floor: f64,
    _gap_ub: f64,
    _gap_val: f64,
    cross: impl FnOnce() -> bool,
) -> u8 {
    #[cfg(test)]
    stats::pre_detail(_gap_ub, _gap_val, floor);
    if !(gap_ok && floor.is_finite()) {
        PRE_GAP
    } else if cross() {
        PRE_KEEP
    } else {
        PRE_CROSS
    }
}

/// The (i′) pre-filter of a linear cushion plane (inputs of
/// [`Residual::plane`]): t0 already passed the caller's validator; keep it
/// iff the certified plane gap at t0 is within floor_lo/8 and a descending
/// crossing is certified near t0. Axis-aligned segments evaluate the gap
/// G = s·Q − d directly; general segments the squared form X² − d²·L²
/// (X = cross(p2 − p1, w) certified positive over the crossing window).
#[allow(clippy::too_many_arguments)]
pub(crate) fn pre_plane(
    c0: [f64; 2],
    c1: [f64; 2],
    c2: [f64; 2],
    p1: [f64; 2],
    p2: [f64; 2],
    d: [f64; 2],
    t0: f64,
    t_min: f64,
) -> u8 {
    let v = pre_plane_inner(c0, c1, c2, p1, p2, d, t0, t_min);
    #[cfg(test)]
    stats::pre_record(0, d[1], t0, v);
    v
}

#[allow(clippy::too_many_arguments)]
#[inline(always)]
fn pre_plane_inner(
    c0: [f64; 2],
    c1: [f64; 2],
    c2: [f64; 2],
    p1: [f64; 2],
    p2: [f64; 2],
    d: [f64; 2],
    t0: f64,
    t_min: f64,
) -> u8 {
    if !in_domain(t0, T_DOMAIN) {
        return PRE_GAP;
    }
    let tt = t0 * t0;
    let qx = fc(c0[0], p1[0], c1[0], c2[0], t0, tt);
    let qy = fc(c0[1], p1[1], c1[1], c2[1], t0, tt);
    let floor = floor_lo(
        norm_lo2(qx.a, qy.a),
        norm_lo2(qx.b, qy.b),
        norm_lo2(c2[0], c2[1]),
        t0,
        tt,
    );
    let dd = d[0] + d[1];
    let e_dd = U * dd.abs();
    let axis = if p2[1] == p1[1] && p2[0] != p1[0] {
        Some((qy, if p2[0] > p1[0] { 1.0 } else { -1.0 }))
    } else if p2[0] == p1[0] && p2[1] != p1[1] {
        Some((qx, if p2[1] > p1[1] { -1.0 } else { 1.0 }))
    } else {
        None
    };
    if let Some((q, s)) = axis {
        // G = s·Q − d in metres; G″ = 2s·c.
        let g = s * q.q - dd;
        let ug = (g.abs() + q.e + e_dd + U * g.abs()) * INFLATE + UNDERFLOW_SLACK;
        let curv = Curv {
            a0: 2.0 * q.c,
            a1: 0.0,
            a2: 0.0,
        };
        let df = s * q.sl;
        let edf = q.esl * INFLATE + UNDERFLOW_SLACK;
        return pre_verdict(8.0 * ug <= floor, floor, ug, g.abs(), || {
            crossing_near(ug, df, edf, &curv, t0, t_min).is_some()
        });
    }
    let dx = p2[0] - p1[0];
    let dy = p2[1] - p1[1];
    let (e_dx, e_dy) = (U * dx.abs(), U * dy.abs());
    let x = cross_term(dx, dy, e_dx, e_dy, &qx, &qy);
    let (l2, e_l2) = length_sq(dx, dy, e_dx, e_dy);
    let d2 = dd * dd;
    let e_d2 = (2.0 * dd.abs() + e_dd) * e_dd + U * d2;
    let r2 = d2 * l2;
    let e_r2 = d2 * e_l2 + l2 * e_d2 + e_d2 * e_l2 + U * r2;
    let xx = x.v * x.v;
    let e_xx = (2.0 * x.v.abs() + x.e) * x.e + U * xx;
    let g = xx - r2;
    let ug = (g.abs() + e_xx + e_r2 + U * g.abs()) * INFLATE + UNDERFLOW_SLACK;
    // G = L²·g·(g + 2d) holds on the playable side only (X > 0).
    let (l2_lo, dd_lo) = (lower(l2, e_l2), lower(dd, e_dd));
    let gap_ok = lower(x.v, x.e) > 0.0 && gap_test_squared(ug, l2_lo, dd_lo, floor);
    let gap_ub = ug / (2.0 * l2_lo * dd_lo);
    pre_verdict(gap_ok, floor, gap_ub, g.abs() / (2.0 * dd * l2), || {
        let mut curv = Curv::default();
        curv.add(1.0, x.v.abs() + x.e, x.p, x.c);
        let (h, e_h) = x.times_slope();
        let Some(w) = crossing_near(
            ug,
            2.0 * h,
            2.0 * e_h * INFLATE + UNDERFLOW_SLACK,
            &curv,
            t0,
            t_min,
        ) else {
            return false;
        };
        // The cross term stays positive over the window (the X = −d·L
        // mirror crossing is excluded).
        lower(x.v, x.e + (x.p + x.c * w) * w) > 0.0
    })
}

/// X = dx·Q_y − dy·Q_x in binary64 with bounds: value, |X − X̃| ≤ e, the
/// slope bound P_X ≥ |X′|, the curvature coefficient C_X ≥ |X″|/2, and the
/// parts needed for X·X′.
struct CrossF {
    v: f64,
    e: f64,
    p: f64,
    c: f64,
    /// X̃′ and its bound.
    sl: f64,
    esl: f64,
}

impl CrossF {
    /// X̃·X̃′ and its bound (|X·X′ − X̃·X̃′|, before inflation).
    #[inline(always)]
    fn times_slope(&self) -> (f64, f64) {
        let h = self.v * self.sl;
        let e = (self.sl.abs() + self.esl) * self.e + self.v.abs() * self.esl + U * h.abs();
        (h, e)
    }
}

#[inline(always)]
fn cross_term(dx: f64, dy: f64, e_dx: f64, e_dy: f64, qx: &Fc, qy: &Fc) -> CrossF {
    let px = dx * qy.q;
    let py = dy * qx.q;
    let v = px - py;
    let e = dx.abs() * qy.e
        + qy.q.abs() * e_dx
        + e_dx * qy.e
        + dy.abs() * qx.e
        + qx.q.abs() * e_dy
        + e_dy * qx.e
        + U * (px.abs() + py.abs() + v.abs());
    let ux = dx * qy.sl;
    let uy = dy * qx.sl;
    let sl = ux - uy;
    let esl = dx.abs() * qy.esl
        + qy.sl.abs() * e_dx
        + e_dx * qy.esl
        + dy.abs() * qx.esl
        + qx.sl.abs() * e_dy
        + e_dy * qx.esl
        + U * (ux.abs() + uy.abs() + sl.abs());
    let (adx, ady) = (dx.abs() + e_dx, dy.abs() + e_dy);
    CrossF {
        v,
        e,
        p: adx * qy.p + ady * qx.p,
        c: adx * qy.c + ady * qx.c,
        sl,
        esl,
    }
}

/// L² = dx² + dy² with its bound.
#[inline(always)]
fn length_sq(dx: f64, dy: f64, e_dx: f64, e_dy: f64) -> (f64, f64) {
    let (sx, sy) = (dx * dx, dy * dy);
    let l2 = sx + sy;
    let e = (2.0 * dx.abs() + e_dx) * e_dx + (2.0 * dy.abs() + e_dy) * e_dy + U * (sx + sy + l2);
    (l2, e)
}

/// The (i′) pre-filter of a jaw arc or airborne jaw circle (inputs of
/// [`Residual::circle`]): squared form G = w_x² + w_y² − D².
pub(crate) fn pre_circle(
    c0: [f64; 2],
    c1: [f64; 2],
    c2: [f64; 2],
    centre: [f64; 2],
    d: [f64; 3],
    t0: f64,
    t_min: f64,
) -> u8 {
    let v = pre_circle_inner(c0, c1, c2, centre, d, t0, t_min);
    #[cfg(test)]
    stats::pre_record(1, d[2], t0, v);
    v
}

#[inline(always)]
fn pre_circle_inner(
    c0: [f64; 2],
    c1: [f64; 2],
    c2: [f64; 2],
    centre: [f64; 2],
    d: [f64; 3],
    t0: f64,
    t_min: f64,
) -> u8 {
    if !in_domain(t0, T_DOMAIN) {
        return PRE_GAP;
    }
    let tt = t0 * t0;
    let qx = fc(c0[0], centre[0], c1[0], c2[0], t0, tt);
    let qy = fc(c0[1], centre[1], c1[1], c2[1], t0, tt);
    let floor = floor_lo(
        norm_lo2(qx.a, qy.a),
        norm_lo2(qx.b, qy.b),
        norm_lo2(c2[0], c2[1]),
        t0,
        tt,
    );
    let s1 = d[0] + d[1];
    let dsum = s1 + d[2];
    let e_d = U * (s1.abs() + dsum.abs());
    let (sx, sy) = (qx.q * qx.q, qy.q * qy.q);
    let ss = sx + sy;
    let r2 = dsum * dsum;
    let g = ss - r2;
    let eg = (2.0 * qx.q.abs() + qx.e) * qx.e
        + (2.0 * qy.q.abs() + qy.e) * qy.e
        + (2.0 * dsum.abs() + e_d) * e_d
        + U * (sx + sy + ss + r2 + g.abs());
    let ug = (g.abs() + eg) * INFLATE + UNDERFLOW_SLACK;
    let d_lo = lower(dsum, e_d);
    let gap_ok = gap_test_squared(ug, 1.0, d_lo, floor);
    pre_verdict(
        gap_ok,
        floor,
        ug / (2.0 * d_lo),
        g.abs() / (2.0 * dsum),
        || {
            let (hx, hy) = (qx.q * qx.sl, qy.q * qy.sl);
            let h = hx + hy;
            let e_h = (qx.sl.abs() + qx.esl) * qx.e
                + qx.q.abs() * qx.esl
                + (qy.sl.abs() + qy.esl) * qy.e
                + qy.q.abs() * qy.esl
                + U * (hx.abs() + hy.abs() + h.abs());
            let mut curv = Curv::default();
            curv.add(1.0, qx.q.abs() + qx.e, qx.p, qx.c);
            curv.add(1.0, qy.q.abs() + qy.e, qy.p, qy.c);
            crossing_near(
                ug,
                2.0 * h,
                2.0 * e_h * INFLATE + UNDERFLOW_SLACK,
                &curv,
                t0,
                t_min,
            )
            .is_some()
        },
    )
}

/// The (i′) pre-filter of an airborne nose capsule (inputs of
/// [`Residual::capsule`]): squared form G = X² + L²·w_z² − r²·L².
#[allow(clippy::too_many_arguments)]
pub(crate) fn pre_capsule(
    c0: [f64; 3],
    c1: [f64; 3],
    c2: [f64; 3],
    p1: [f64; 2],
    p2: [f64; 2],
    height: f64,
    r: f64,
    t0: f64,
    t_min: f64,
) -> u8 {
    let v = pre_capsule_inner(c0, c1, c2, p1, p2, height, r, t0, t_min);
    #[cfg(test)]
    stats::pre_record(2, 0.0, t0, v);
    v
}

#[allow(clippy::too_many_arguments)]
#[inline(always)]
fn pre_capsule_inner(
    c0: [f64; 3],
    c1: [f64; 3],
    c2: [f64; 3],
    p1: [f64; 2],
    p2: [f64; 2],
    height: f64,
    r: f64,
    t0: f64,
    t_min: f64,
) -> u8 {
    if !in_domain(t0, T_DOMAIN) {
        return PRE_GAP;
    }
    let tt = t0 * t0;
    let qx = fc(c0[0], p1[0], c1[0], c2[0], t0, tt);
    let qy = fc(c0[1], p1[1], c1[1], c2[1], t0, tt);
    let qz = fc(c0[2], height, c1[2], c2[2], t0, tt);
    let floor = floor_lo(
        norm_lo3(qx.a, qy.a, qz.a),
        norm_lo3(qx.b, qy.b, qz.b),
        norm_lo3(c2[0], c2[1], c2[2]),
        t0,
        tt,
    );
    let dx = p2[0] - p1[0];
    let dy = p2[1] - p1[1];
    let (e_dx, e_dy) = (U * dx.abs(), U * dy.abs());
    let x = cross_term(dx, dy, e_dx, e_dy, &qx, &qy);
    let (l2, e_l2) = length_sq(dx, dy, e_dx, e_dy);
    let zz = qz.q * qz.q;
    let e_zz = (2.0 * qz.q.abs() + qz.e) * qz.e + U * zz;
    let wz = l2 * zz;
    let e_wz = l2 * e_zz + zz * e_l2 + e_l2 * e_zz + U * wz;
    let rr = r * r;
    let e_rr = U * rr;
    let r2 = rr * l2;
    let e_r2 = rr * e_l2 + l2 * e_rr + e_rr * e_l2 + U * r2;
    let xx = x.v * x.v;
    let e_xx = (2.0 * x.v.abs() + x.e) * x.e + U * xx;
    let s = xx + wz;
    let g = s - r2;
    let eg = e_xx + e_wz + e_r2 + U * (s + g.abs());
    let ug = (g.abs() + eg) * INFLATE + UNDERFLOW_SLACK;
    let l2_lo = lower(l2, e_l2);
    let gap_ok = gap_test_squared(ug, l2_lo, r, floor);
    pre_verdict(
        gap_ok,
        floor,
        ug / (2.0 * l2_lo * r),
        g.abs() / (2.0 * r * l2),
        || {
            let (hx, e_hx) = x.times_slope();
            let hz = qz.q * qz.sl;
            let e_hz = (qz.sl.abs() + qz.esl) * qz.e + qz.q.abs() * qz.esl + U * hz.abs();
            let lz = l2 * hz;
            let e_lz = l2 * e_hz + hz.abs() * e_l2 + e_l2 * e_hz + U * lz.abs();
            let h = hx + lz;
            let e_h = e_hx + e_lz + U * h.abs();
            let mut curv = Curv::default();
            curv.add(1.0, x.v.abs() + x.e, x.p, x.c);
            curv.add(l2 + e_l2, qz.q.abs() + qz.e, qz.p, qz.c);
            crossing_near(
                ug,
                2.0 * h,
                2.0 * e_h * INFLATE + UNDERFLOW_SLACK,
                &curv,
                t0,
                t_min,
            )
            .is_some()
        },
    )
}

// ---------------------------------------------------------------- F2 driver

/// Outcome of refining one validated represented root.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Refined {
    /// A time certified within one ulp of an exact descending crossing.
    Root(f64),
    /// No certificate: the represented root stays.
    Keep,
    /// G certified OUTSIDE (> 0) at the represented root and at every probe
    /// of the search, without a crossing: the F3 (near-tangent) state.
    Outside,
}

/// F2: refine the represented descending root `t0` (> `t_min`) of `res`;
/// `window` lazily supplies the root-error window ([`root_window`]).
///
/// Certificate (one evaluation at x): δ = G̃/G̃′ and x1 = fl(x − δ). With
/// h = 2|δ| + 2ulp(x), M2 ≥ |G″| and m ≤ |G′| on J = [x − h, x + h] (G′ < 0
/// there: a descending crossing), Taylor gives |G(x − δ)| ≤ R1 = B + |G̃_lo| +
/// u|G̃_hi| + ε′|δ| + M2·δ²/2, so a crossing lies within R1/m of x − δ, hence
/// within |δ| + R1/m of x. Early exit (the coordinator's rule, rigorous form):
/// if |δ| + R1/m ≤ ulp(x), x is kept after its single evaluation. Otherwise,
/// if R1/m ≤ ulp(x1)/2, then |x1 − crossing| ≤ ulp(x1) and x1 is returned.
///
/// Otherwise safeguarded Newton runs inside a certified sign bracket
/// (bisection when Newton leaves it), the certificate is tried at every
/// probe, and adjacent floats of opposite certified sign end it; at most
/// [`MAX_EVALS`] evaluations, after which the represented root stays.
/// The single-evaluation path is inline; the search is out of line.
#[inline]
pub(crate) fn refine(res: &Residual, t0: f64, t_min: f64, window: impl FnOnce() -> f64) -> Refined {
    let Some(e) = res.eval(t0) else {
        #[cfg(test)]
        stats::record(1, 5);
        return Refined::Keep;
    };
    if let Some(x1) = certify(&e, t0, t_min) {
        if (x1 - t0).abs() <= 1024.0 * ulp_of(t0) {
            #[cfg(test)]
            stats::record(1, if x1 == t0 { 0 } else { 1 });
            return Refined::Root(x1);
        }
    }
    let (outcome, _evals, _how) = refine_search(res, t0, t_min, e, window);
    #[cfg(test)]
    stats::record(_evals, _how);
    outcome
}

/// The one-evaluation certificate at x (see [`refine`]): `Some(y)` iff a
/// descending crossing of G lies within one ulp of y, where y = x when x
/// itself is certified within one ulp (the Newton step |δ| plus the Taylor
/// remainder R1/m stays within ulp(x): keep the probe), else
/// y = x1 = fl(x − δ) when R1/m ≤ ulp(x1)/2.
#[inline(always)]
fn certify(e: &Eval, x: f64, t_min: f64) -> Option<f64> {
    if !e.valid || e.dg >= 0.0 {
        return None;
    }
    let delta = e.g_hi / e.dg;
    let x1 = x - delta;
    if !x1.is_finite() || x1 <= t_min {
        return None;
    }
    let ulp = ulp_of(x);
    let h = 2.0 * delta.abs() + 2.0 * ulp;
    let m2 = e.curvature_bound(h);
    let m = -e.dg - e.dg_err - m2 * h;
    if m <= 0.0 {
        return None;
    }
    // R1 inflated for its own rounding and for the reach R1/m, compared as
    // products (no division): x kept iff |δ| + R1/m ≤ ulp(x), x1 returned
    // iff R1/m ≤ ulp(x1)/2.
    let r1 = (e.bound
        + e.g_lo.abs()
        + U * e.g_hi.abs()
        + e.dg_err * delta.abs()
        + 0.5 * m2 * delta * delta)
        * (INFLATE * INFLATE);
    if r1 <= (ulp - delta.abs()) * m && x > t_min {
        Some(x)
    } else if r1 <= 0.5 * ulp_of(x1) * m {
        Some(x1)
    } else {
        None
    }
}

/// The rest of [`refine`] after the first evaluation `e` at t0, with the
/// evaluation count and how it ended (1/3: certificate at t0 / a later probe;
/// 2: the same keeping the probe; 4: adjacent-float bracket; 5: keep;
/// 6: outside).
#[inline(never)]
fn refine_search(
    res: &Residual,
    t0: f64,
    t_min: f64,
    mut e: Eval,
    window: impl FnOnce() -> f64,
) -> (Refined, u32, u8) {
    let mut window = Some(window);
    let mut win: Option<f64> = None;
    let mut evals = 1;
    let mut x = t0;
    let mut lo: Option<(f64, f64)> = None; // certified G > 0: (t, |G̃|)
    let mut hi: Option<(f64, f64)> = None; // certified G < 0
    let mut outside = true;
    loop {
        if !e.valid {
            return (Refined::Keep, evals, 5);
        }
        if let Some(x1) = certify(&e, x, t_min) {
            if near_enough(x1, t0, &mut win, &mut window) {
                let how = match (evals == 1, x1 == x) {
                    (true, _) => 1,
                    (false, true) => 2,
                    (false, false) => 3,
                };
                return (Refined::Root(x1), evals, how);
            }
        }
        let x1 = x - e.g_hi / e.dg;
        let g_abs = e.g_hi.abs() + e.g_lo.abs();
        match e.sign() {
            1 => lo = Some((x, g_abs)),
            -1 => {
                hi = Some((x, g_abs));
                outside = false;
            }
            _ => return (Refined::Keep, evals, 5),
        }
        if evals >= MAX_EVALS {
            return if outside {
                (Refined::Outside, evals, 6)
            } else {
                (Refined::Keep, evals, 5)
            };
        }
        let next = match (lo, hi) {
            (Some((l, gl)), Some((h, gh))) => {
                if l >= h {
                    return (Refined::Keep, evals, 5);
                }
                if l.next_up() >= h {
                    let best = if gl <= gh { l } else { h };
                    return if best > t_min {
                        (Refined::Root(best), evals, 4)
                    } else {
                        (Refined::Keep, evals, 5)
                    };
                }
                let mut c = if x1 > l && x1 < h {
                    x1
                } else {
                    l + 0.5 * (h - l)
                };
                if c <= l {
                    c = l.next_up();
                } else if c >= h {
                    c = h.next_down();
                }
                c
            }
            (Some((l, _)), None) => {
                // The crossing is later than l; stay inside the window.
                let w = window_value(&mut win, &mut window);
                let edge = t0 + w;
                if l >= edge {
                    return (Refined::Outside, evals, 6);
                }
                let mut c = if x1.is_finite() && x1 > l {
                    x1
                } else {
                    l + 0.25 * w
                };
                if c <= l {
                    c = l.next_up();
                }
                c.min(edge)
            }
            (None, Some((h, _))) => {
                // The crossing is earlier than h.
                let w = window_value(&mut win, &mut window);
                let edge = (t0 - w).max(t_min.next_up());
                if h <= edge {
                    return (Refined::Keep, evals, 5);
                }
                let mut c = if x1.is_finite() && x1 < h {
                    x1
                } else {
                    h - 0.25 * w
                };
                if c >= h {
                    c = h.next_down();
                }
                c.max(edge)
            }
            (None, None) => return (Refined::Keep, evals, 5),
        };
        let Some(en) = res.eval(next) else {
            return (Refined::Keep, evals + 1, 5);
        };
        evals += 1;
        x = next;
        e = en;
    }
}

fn window_value(win: &mut Option<f64>, window: &mut Option<impl FnOnce() -> f64>) -> f64 {
    if let Some(w) = *win {
        return w;
    }
    let w = window.take().map_or(0.0, |f| f());
    *win = Some(w);
    w
}

/// A certified Newton target counts as the represented root's crossing when
/// it stays within the root-error window (moves up to 2^10 ulps never need
/// the window computed).
fn near_enough(
    x: f64,
    t0: f64,
    win: &mut Option<f64>,
    window: &mut Option<impl FnOnce() -> f64>,
) -> bool {
    let d = (x - t0).abs();
    d <= 1024.0 * (t0.next_up() - t0) || d <= window_value(win, window)
}

// ---------------------------------------------------------------- F3 certified miss (rare path)

/// hi + lo with an absolute error bound, for the rare-path F3 analysis.
#[derive(Clone, Copy, Debug)]
struct Ddb {
    hi: f64,
    lo: f64,
    err: f64,
}

impl Ddb {
    const ZERO: Ddb = Ddb {
        hi: 0.0,
        lo: 0.0,
        err: 0.0,
    };

    fn exact(x: f64) -> Ddb {
        Ddb {
            hi: x,
            lo: 0.0,
            err: 0.0,
        }
    }

    fn pair(x: (f64, f64), err: f64) -> Ddb {
        Ddb {
            hi: x.0,
            lo: x.1,
            err,
        }
    }

    fn mag(self) -> f64 {
        self.hi.abs() + self.lo.abs()
    }

    fn upper(self) -> f64 {
        (self.mag() + self.err) * INFLATE
    }

    /// Exact scaling by s ∈ {±1, ±2, ±4}.
    fn scale(self, s: f64) -> Ddb {
        Ddb {
            hi: s * self.hi,
            lo: s * self.lo,
            err: s.abs() * self.err,
        }
    }

    fn add(self, o: Ddb) -> Ddb {
        let (s, e) = two_sum(self.hi, o.hi);
        let t = self.lo + o.lo;
        let t2 = t + e;
        let (hi, lo) = two_sum(s, t2);
        Ddb {
            hi,
            lo,
            err: (self.err + o.err + U * (t.abs() + t2.abs())) * INFLATE,
        }
    }

    fn mul(self, o: Ddb) -> Ddb {
        let (p, e) = two_prod(self.hi, o.hi);
        let a = self.hi * o.lo;
        let b = self.lo * o.hi;
        let ab = a + b;
        let t = ab + e;
        let (hi, lo) = two_sum(p, t);
        let rounding = U * (a.abs() + b.abs() + ab.abs() + t.abs()) + (self.lo * o.lo).abs();
        let propagated = self.mag() * o.err + o.mag() * self.err + self.err * o.err;
        Ddb {
            hi,
            lo,
            err: (rounding + propagated + UNDERFLOW_SLACK) * INFLATE,
        }
    }
}

/// A component with bounded double-double coefficients.
#[derive(Clone, Copy, Debug)]
struct Quad {
    a: Ddb,
    b: Ddb,
    c: Ddb,
}

impl Quad {
    fn from(q: Comp) -> Quad {
        Quad {
            a: Ddb::pair((q.a_hi, q.a_lo), 0.0),
            b: Ddb::exact(q.b),
            c: Ddb::exact(q.c),
        }
    }

    /// Q(t), Q′(t).
    fn value_and_slope(&self, t: f64) -> (Ddb, Ddb) {
        let tt = Ddb::exact(t);
        let q = self.a.add(self.b.mul(tt)).add(self.c.mul(tt.mul(tt)));
        let qd = self.b.add(self.c.scale(2.0).mul(tt));
        (q, qd)
    }
}

/// The variable part of G = Σ ω_j·Q_j² + λ·Q_L − const, with bounded
/// coefficients (F3 only: G′ and G″ do not involve the constant).
struct Generic {
    squares: [(Ddb, Quad); 2],
    n: usize,
    linear: Option<(f64, Quad)>,
}

impl Residual {
    fn generic(&self) -> Generic {
        let zero = Quad::from(Comp {
            a_hi: 0.0,
            a_lo: 0.0,
            b: 0.0,
            c: 0.0,
        });
        match self.kind {
            Kind::Axis { q, s, .. } => Generic {
                squares: [(Ddb::ZERO, zero), (Ddb::ZERO, zero)],
                n: 0,
                linear: Some((s, Quad::from(q))),
            },
            Kind::Circle { qx, qy, .. } => Generic {
                squares: [
                    (Ddb::exact(1.0), Quad::from(qx)),
                    (Ddb::exact(1.0), Quad::from(qy)),
                ],
                n: 2,
                linear: None,
            },
            Kind::Cross {
                qx,
                qy,
                qz,
                dx,
                dy,
                w,
                ..
            } => {
                let (dx, dy) = (Ddb::pair(dx, 0.0), Ddb::pair(dy, 0.0));
                let (gx, gy) = (Quad::from(qx), Quad::from(qy));
                let k = |y: Ddb, x: Ddb| dx.mul(y).add(dy.mul(x).scale(-1.0));
                let xq = Quad {
                    a: k(gy.a, gx.a),
                    b: k(gy.b, gx.b),
                    c: k(gy.c, gx.c),
                };
                let z = qz.map(|q| (Ddb::pair(w, self.w_err), Quad::from(q)));
                Generic {
                    squares: [(Ddb::exact(1.0), xq), z.unwrap_or((Ddb::ZERO, zero))],
                    n: if z.is_some() { 2 } else { 1 },
                    linear: None,
                }
            }
        }
    }
}

impl Generic {
    /// G′(t) as (value, bound).
    fn slope(&self, t: f64) -> Option<(f64, f64)> {
        if !in_domain(t, T_DOMAIN) {
            return None;
        }
        let mut acc = Ddb::ZERO;
        for &(w, q) in &self.squares[..self.n] {
            let (v, d) = q.value_and_slope(t);
            acc = acc.add(w.mul(v.mul(d)).scale(2.0));
        }
        if let Some((s, q)) = self.linear {
            acc = acc.add(q.value_and_slope(t).1.scale(s));
        }
        let v = acc.hi + acc.lo;
        let b = (acc.err + 4.0 * U2 * acc.hi.abs()) * INFLATE + UNDERFLOW_SLACK;
        (v.is_finite() && b.is_finite()).then_some((v, b))
    }

    /// (lower bound of G″(t), binary64 G″(t), upper bound of |G‴| on
    /// [t − h, t + h]): G″ = Σ 2ω(Q′² + 2Q·c) + 2λc, G‴ = Σ 12ω·c·Q′.
    fn convexity(&self, t: f64, h: f64) -> Option<(f64, f64, f64)> {
        let mut acc = Ddb::ZERO;
        let mut g3 = 0.0;
        for &(w, q) in &self.squares[..self.n] {
            let (v, d) = q.value_and_slope(t);
            acc = acc.add(w.mul(d.mul(d).add(v.mul(q.c).scale(2.0))).scale(2.0));
            let c = q.c.upper();
            g3 += w.upper() * 12.0 * c * (d.upper() + 2.0 * c * h);
        }
        if let Some((s, q)) = self.linear {
            acc = acc.add(q.c.scale(2.0 * s));
        }
        let v = acc.hi + acc.lo;
        let lower = v - (acc.err + 4.0 * U2 * acc.hi.abs()) * INFLATE;
        let g3 = g3 * INFLATE;
        (lower.is_finite() && g3.is_finite()).then_some((lower, v, g3))
    }
}

/// F3: true iff the exact G is certified POSITIVE on all of [lo, hi] AND its
/// minimiser is certified INTERIOR (ob-release condition 2: the certificate
/// must cover the whole dip without relying on the window's completeness).
///
/// 1. Convexity: G″(m) − max|G‴|·(hi − lo)/2 > 0 at the midpoint m.
/// 2. G′ is then increasing. Only a certified sign change G′(lo) < 0 < G′(hi)
///    is accepted: the unique minimiser, the dip's local minimum, lies
///    strictly inside, and safeguarded Newton on G′ (step G′/G″, bisection
///    fallback, at most 64 evaluations) brackets it to adjacent floats
///    m1 < m2. When G′ keeps its sign on [lo, hi] the minimum sits at an
///    endpoint, the window may have cut the dip, and there is no rejection.
/// 3. Convexity gives G ≥ G(m1) on [lo, m1], G ≥ G(m2) on [m2, hi] and
///    G ≥ G(m1) − |G′(m1)|·(m2 − m1) on [m1, m2] (tangent line at m1): the
///    certified lower bound uses lower bounds of G and upper bounds of |G′|.
pub(crate) fn certified_positive(res: &Residual, lo: f64, hi: f64) -> bool {
    let ordered = lo < hi;
    if !ordered {
        return false;
    }
    let gen = res.generic();
    let mid = lo + 0.5 * (hi - lo);
    let half = (hi - lo) * (0.5 * INFLATE);
    let Some((g2_lower, g2, g3)) = gen.convexity(mid, half) else {
        return false;
    };
    let convex = g2_lower - g3 * half > 0.0;
    if !convex {
        return false;
    }
    let g_lower = |t: f64| res.eval(t).filter(|e| e.valid).map(|e| e.lower());
    let (Some((d_lo, b_lo)), Some((d_hi, b_hi))) = (gen.slope(lo), gen.slope(hi)) else {
        return false;
    };
    // Interior minimiser only: an endpoint minimum (G′ of one sign on the
    // interval) means the window may have cut the dip, so no rejection.
    let interior = d_lo < -b_lo && d_hi > b_hi;
    if !interior {
        return false;
    }
    let (mut a, mut b) = (lo, hi);
    let (mut da, mut ba, mut db) = (d_lo, b_lo, d_hi);
    let mut evals = 2;
    while a.next_up() < b {
        if evals >= MAX_MISS_EVALS {
            return false;
        }
        let (x, dx) = if da.abs() <= db.abs() {
            (a, da)
        } else {
            (b, db)
        };
        let mut c = x - dx / g2;
        if !(c > a && c < b) {
            c = a + 0.5 * (b - a);
        }
        if c <= a {
            c = a.next_up();
        } else if c >= b {
            c = b.next_down();
        }
        let Some((dc, bc)) = gen.slope(c) else {
            return false;
        };
        evals += 1;
        if dc < -bc {
            (a, da, ba) = (c, dc, bc);
        } else if dc > bc {
            (b, db) = (c, dc);
        } else {
            return false;
        }
    }
    let (Some(ga), Some(gb)) = (g_lower(a), g_lower(b)) else {
        return false;
    };
    let tangent = ga - (da.abs() + ba) * ((b - a) * INFLATE) * INFLATE;
    ga > 0.0 && gb > 0.0 && tangent > 0.0
}

/// Test-only tallies of [`refine`]: evaluations per call and how it ended.
#[cfg(test)]
pub(crate) mod stats {
    use std::cell::RefCell;

    thread_local! {
        static TALLY: RefCell<([u64; 17], [u64; 7])> = const { RefCell::new(([0; 17], [0; 7])) };
    }

    pub(crate) fn record(evals: u32, how: u8) {
        TALLY.with(|t| {
            let mut t = t.borrow_mut();
            t.0[(evals as usize).min(16)] += 1;
            t.1[how as usize] += 1;
        });
    }

    /// (calls by evaluation count 0..=16, calls by outcome 0..=6), reset.
    pub(crate) fn take() -> ([u64; 17], [u64; 7]) {
        TALLY.with(|t| std::mem::take(&mut *t.borrow_mut()))
    }

    thread_local! {
        /// (i′) pre-filter calls: (surface 0 plane / 1 circle / 2 capsule,
        /// the offset input −pen, t0, verdict).
        static PRE: RefCell<Vec<(u8, f64, f64, u8)>> = const { RefCell::new(Vec::new()) };
    }

    pub(crate) fn pre_record(surface: u8, neg_pen: f64, t0: f64, verdict: u8) {
        PRE.with(|p| p.borrow_mut().push((surface, neg_pen, t0, verdict)));
    }

    thread_local! {
        /// (certified gap bound, binary64 gap value, floor_lo) per call.
        static DETAIL: RefCell<Vec<(f64, f64, f64)>> = const { RefCell::new(Vec::new()) };
    }

    pub(crate) fn pre_detail(gap_ub: f64, gap_val: f64, floor: f64) {
        DETAIL.with(|p| p.borrow_mut().push((gap_ub, gap_val, floor)));
    }

    pub(crate) fn pre_detail_take() -> Vec<(f64, f64, f64)> {
        DETAIL.with(|p| std::mem::take(&mut *p.borrow_mut()))
    }

    /// The pre-filter calls since the last take, reset.
    pub(crate) fn pre_take() -> Vec<(u8, f64, f64, u8)> {
        PRE.with(|p| std::mem::take(&mut *p.borrow_mut()))
    }
}

#[cfg(test)]
mod cost {
    //! Diagnostics for the K-fix cost budget (ignored; run explicitly with
    //! KFIX_FIXTURES pointing at a J-like fixtures file).

    #[derive(serde::Deserialize)]
    struct Line {
        family: String,
        scenario: String,
    }

    #[derive(serde::Deserialize)]
    struct Scen {
        system: crate::SystemState,
        shot: crate::ShotParams,
        #[serde(default)]
        options: crate::SimOptions,
    }

    /// Refinements and evaluations per shot, per family.
    #[test]
    #[ignore = "diagnostic: needs KFIX_FIXTURES"]
    fn kfix_fixture_refinement_counts() {
        let path = std::env::var("KFIX_FIXTURES").expect("KFIX_FIXTURES");
        let text = std::fs::read_to_string(path).unwrap();
        let mut fam: std::collections::BTreeMap<String, [u64; 8]> = Default::default();
        let mut gapfail: std::collections::BTreeMap<String, [u64; 4]> = Default::default();
        for line in text.lines().filter(|l| !l.is_empty()) {
            let l: Line = serde_json::from_str(line).unwrap();
            let sc: Scen = serde_json::from_str(&l.scenario).unwrap();
            let _ = super::stats::take();
            let _ = super::stats::pre_take();
            let r = crate::simulate(&sc.system, &sc.shot, &sc.options);
            let (evals, how) = super::stats::take();
            let pre = super::stats::pre_take();
            for (d, c) in super::stats::pre_detail_take().iter().zip(&pre) {
                if c.3 == super::PRE_GAP {
                    let (ub, val) = (8.0 * d.0 / d.2, 8.0 * d.1 / d.2);
                    let k = if !ub.is_finite() {
                        3
                    } else if val <= 1.0 {
                        0
                    } else if val <= 8.0 {
                        1
                    } else {
                        2
                    };
                    gapfail.entry(l.family.clone()).or_insert([0u64; 4])[k] += 1;
                }
            }
            let calls: u64 = evals.iter().sum();
            let total_evals: u64 = evals.iter().enumerate().map(|(i, n)| i as u64 * n).sum();
            let events = r.as_ref().map_or(0, |rec| rec.events.len() as u64);
            let e = fam.entry(l.family).or_default();
            e[0] += 1;
            e[1] += calls;
            e[2] += total_evals;
            e[3] += how[0] + how[1];
            e[4] += events;
            e[5] += pre.len() as u64;
            e[6] += pre.iter().filter(|c| c.3 == super::PRE_KEEP).count() as u64;
            e[7] += pre.iter().filter(|c| c.3 == super::PRE_CROSS).count() as u64;
        }
        for (f, [n, calls, ev, one, events, pre, kept, cross]) in fam {
            println!(
                "{f}: shots {n}, events/shot {:.1}, pre-filter calls/shot {:.2}, kept share {:.4} \
                 (crossing refusals {:.4}), refinements/shot {:.2}, evaluations/refinement {:.3}, \
                 single-evaluation share {:.3}",
                events as f64 / n as f64,
                pre as f64 / n as f64,
                kept as f64 / pre.max(1) as f64,
                cross as f64 / pre.max(1) as f64,
                calls as f64 / n as f64,
                ev as f64 / calls.max(1) as f64,
                one as f64 / calls.max(1) as f64
            );
        }
        println!("gap-test failures by 8|g~|/floor_lo: [value <= 1 (bound only), 1-8 (gap within the floor), > 8 (gap above the floor), no bound]: {gapfail:?}");
    }

    /// ns per (i′) pre-filter call by surface, on the coverage rows'
    /// represented roots (release build).
    #[test]
    #[ignore = "diagnostic timing"]
    fn kfix_prefilter_cost_per_call() {
        use std::hint::black_box as bb;
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data/kfix");
        let unhex = |v: &serde_json::Value| {
            f64::from_bits(u64::from_str_radix(v.as_str().unwrap(), 16).unwrap())
        };
        let base: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dir.join("base-outputs.json")).unwrap())
                .unwrap();
        let rows: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dir.join("inputs-cov.json")).unwrap())
                .unwrap();
        let mut cases: std::collections::BTreeMap<&str, Vec<(Vec<f64>, f64)>> = Default::default();
        for row in rows.as_array().unwrap() {
            let a = &row["args"];
            let f: Vec<f64> = a["f"].as_array().unwrap().iter().map(unhex).collect();
            let Some(t0) = base[format!("cov:{}", row["id"].as_str().unwrap())].as_str() else {
                continue;
            };
            let t0 = f64::from_bits(u64::from_str_radix(t0, 16).unwrap());
            let kind = match a["adapter"].as_str().unwrap() {
                "ball_circular_cushion_time" | "ball_circular_cushion_time_airborne" => "circle",
                "ball_linear_cushion_time" if f[10] == f[13] || f[9] == f[12] => "plane-axis",
                "ball_linear_cushion_time" => "plane-cross",
                _ => "capsule",
            };
            cases.entry(kind).or_default().push((f, t0));
        }
        for (kind, v) in &cases {
            let reps = 20000;
            let start = std::time::Instant::now();
            let mut kept = 0u64;
            for _ in 0..reps {
                for (f, t0) in v {
                    let f = bb(f);
                    let t0 = bb(*t0);
                    let verdict = match *kind {
                        "circle" => super::pre_circle_inner(
                            [f[0], f[1]],
                            [f[3], f[4]],
                            [f[6], f[7]],
                            [f[9], f[10]],
                            [f[12], f[14], 0.0],
                            t0,
                            1e-9,
                        ),
                        "capsule" => super::pre_capsule_inner(
                            [f[0], f[1], f[2]],
                            [f[3], f[4], f[5]],
                            [f[6], f[7], f[8]],
                            [f[9], f[10]],
                            [f[12], f[13]],
                            f[15],
                            f[16],
                            t0,
                            1e-9,
                        ),
                        _ => super::pre_plane_inner(
                            [f[0], f[1]],
                            [f[3], f[4]],
                            [f[6], f[7]],
                            [f[9], f[10]],
                            [f[12], f[13]],
                            [f[16], 0.0],
                            t0,
                            1e-9,
                        ),
                    };
                    kept += u64::from(bb(verdict) == super::PRE_KEEP);
                }
            }
            let ns = start.elapsed().as_nanos() as f64 / (reps * v.len()) as f64;
            println!(
                "{kind}: {} rows, {ns:.1} ns per pre-filter call ({:.3} kept)",
                v.len(),
                kept as f64 / (reps * v.len()) as f64
            );
        }
    }

    /// ns per refinement by residual kind, on the coverage rows' represented
    /// roots (release build; the axis/cross split follows the segment).
    #[test]
    #[ignore = "diagnostic timing"]
    fn kfix_refine_cost_per_call() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/data/kfix");
        let unhex = |v: &serde_json::Value| {
            f64::from_bits(u64::from_str_radix(v.as_str().unwrap(), 16).unwrap())
        };
        let base: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dir.join("base-outputs.json")).unwrap())
                .unwrap();
        let rows: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dir.join("inputs-cov.json")).unwrap())
                .unwrap();
        let mut cases: std::collections::BTreeMap<&str, Vec<(super::Residual, f64, f64)>> =
            Default::default();
        for row in rows.as_array().unwrap() {
            let a = &row["args"];
            let f: Vec<f64> = a["f"].as_array().unwrap().iter().map(unhex).collect();
            let Some(t0) = base[format!("cov:{}", row["id"].as_str().unwrap())].as_str() else {
                continue;
            };
            let t0 = f64::from_bits(u64::from_str_radix(t0, 16).unwrap());
            let (c0, c1, c2) = ([f[0], f[1], f[2]], [f[3], f[4], f[5]], [f[6], f[7], f[8]]);
            let (res, tmin, kind) = match a["adapter"].as_str().unwrap() {
                "ball_circular_cushion_time" | "ball_circular_cushion_time_airborne" => (
                    super::Residual::circle(
                        [c0[0], c0[1]],
                        [c1[0], c1[1]],
                        [c2[0], c2[1]],
                        [f[9], f[10]],
                        [f[12], f[14], 0.0],
                    ),
                    f[15],
                    "circle",
                ),
                "ball_linear_cushion_time" => {
                    let r = super::Residual::plane(
                        [c0[0], c0[1]],
                        [c1[0], c1[1]],
                        [c2[0], c2[1]],
                        [f[9], f[10]],
                        [f[12], f[13]],
                        [f[16], 0.0],
                    );
                    let k = if matches!(r.kind, super::Kind::Axis { .. }) {
                        "plane-axis"
                    } else {
                        "plane-cross"
                    };
                    (r, f[17], k)
                }
                _ => (
                    super::Residual::capsule(
                        c0,
                        c1,
                        c2,
                        [f[9], f[10]],
                        [f[12], f[13]],
                        f[15],
                        f[16],
                    ),
                    f[17],
                    "capsule",
                ),
            };
            if t0 > tmin {
                cases.entry(kind).or_default().push((res, t0, tmin));
            }
        }
        // axis-aligned variants of the plane rows: same paths against y = const
        let axis: Vec<(super::Residual, f64, f64)> = cases
            .get("plane-cross")
            .map(|v| {
                v.iter()
                    .map(|&(_, t0, tmin)| {
                        (
                            super::Residual::plane(
                                [0.1, 0.2],
                                [0.0, 1.0],
                                [0.0, -0.1],
                                [1.0, 1.0],
                                [-1.0, 1.0],
                                [0.028575, 0.0],
                            ),
                            t0.min(0.5),
                            tmin,
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();
        if !axis.is_empty() {
            cases
                .entry("plane-axis-synthetic")
                .or_default()
                .extend(axis);
        }
        for (kind, v) in &cases {
            // single-evaluation path only: eval at t0 + the certificate
            let reps = 2000;
            let start = std::time::Instant::now();
            let mut hits = 0u64;
            for _ in 0..reps {
                for &(res, t0, tmin) in v {
                    if let Some(e) = std::hint::black_box(&res).eval(std::hint::black_box(t0)) {
                        hits += u64::from(super::certify(&e, t0, tmin).is_some());
                    }
                }
            }
            let ns1 = start.elapsed().as_nanos() as f64 / (reps * v.len()) as f64;
            println!(
                "{kind}: eval+certificate {ns1:.1} ns ({:.3} certified at t0)",
                hits as f64 / (reps * v.len()) as f64
            );
            let start = std::time::Instant::now();
            let mut acc = 0.0;
            for _ in 0..reps {
                for &(res, _, _) in v {
                    acc += std::hint::black_box(super::Residual::clone(std::hint::black_box(&res)))
                        .r2_err;
                }
            }
            let _ = (acc, start);
        }
        for (kind, v) in &cases {
            let reps = 2000;
            let start = std::time::Instant::now();
            let mut sink = 0.0;
            for _ in 0..reps {
                for &(res, t0, tmin) in v {
                    if let super::Refined::Root(x) = super::refine(
                        std::hint::black_box(&res),
                        std::hint::black_box(t0),
                        tmin,
                        || 1e-9,
                    ) {
                        sink += x;
                    }
                }
            }
            let ns = start.elapsed().as_nanos() as f64 / (reps * v.len()) as f64;
            println!(
                "{kind}: {} rows, {ns:.1} ns per refinement (sink {sink:e})",
                v.len()
            );
        }
    }
}
