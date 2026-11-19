// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Candidate-only coefficient decomposition; none of its residuals admits a root.
use crate::arith::{Expansion, X};
use crate::isolate::{coordinate, quadratic_hints, rank, Solver};
use crate::poly::Poly;
use core::cmp::Ordering;

#[derive(Clone, Copy)]
struct Factors {
    z: [X; 4],
    complex: bool,
}
pub(crate) struct Proposals {
    pub values: [X; 4],
    pub len: usize,
    pub usable: bool,
    pub nonreal_pair: bool,
    pub sources: [u8; 4],
}
fn score(v: X, w: X) -> X {
    let d = v.sub(w).abs();
    if w.m == 0.0 {
        d
    } else {
        d.div(w.abs())
    }
}
fn lex(a: &[X], b: &[X]) -> Ordering {
    for (x, y) in a.iter().zip(b) {
        let c = x.cmp(*y);
        if c != Ordering::Equal {
            return c;
        }
    }
    Ordering::Equal
}
fn reconstructed(f: Factors) -> [X; 4] {
    let [r, s, t, u] = f.z;
    if f.complex {
        [
            r.scale(1),
            s.scale(1).add(r.mul(r)).add(t.mul(t)),
            r.mul(s).add(t.mul(u)).scale(1),
            s.mul(s).add(u.mul(u)),
        ]
    } else {
        [
            r.add(t),
            s.add(u).add(r.mul(t)),
            r.mul(u).add(t.mul(s)),
            s.mul(u),
        ]
    }
}
fn errors(f: Factors, target: [X; 4]) -> (X, X, [X; 4]) {
    let actual = reconstructed(f);
    let mut rel = X::ZERO;
    let mut abs = X::ZERO;
    let mut residual = [X::ZERO; 4];
    for i in 0..4 {
        residual[i] = actual[i].sub(target[i]);
        rel = rel.add(score(actual[i], target[i]));
        abs = abs.add(residual[i].abs());
    }
    (rel, abs, residual)
}
fn repair(mut f: Factors, target: [X; 4], linear: bool) -> Factors {
    let keep = if f.z[1].abs().cmp(f.z[3].abs()) != Ordering::Less {
        1
    } else {
        3
    };
    let other = 4 - keep;
    if f.z[keep].m != 0.0 {
        f.z[other] = target[3].div(f.z[keep]);
        trace_decision!("roots.a.factor.rebalance");
    }
    if linear {
        let keep = if f.z[0].abs().cmp(f.z[2].abs()) != Ordering::Less {
            0
        } else {
            2
        };
        let other = 2 - keep;
        let r = f.z[keep];
        let sj = f.z[other + 1];
        let sk = f.z[keep + 1];
        let mut choices = [X::ZERO; 3];
        let mut len = 1;
        choices[0] = target[0].sub(r);
        if r.m != 0.0 {
            choices[len] = target[1].sub(sj).sub(sk).div(r);
            len += 1;
        }
        if sk.m != 0.0 {
            choices[len] = target[2].sub(sj.mul(r)).div(sk);
            len += 1;
        }
        let mut best = choices[0];
        let mut best_score = None;
        for x in &choices[..len] {
            let mut trial = f;
            trial.z[other] = *x;
            let actual = reconstructed(trial);
            let s = score(actual[0], target[0])
                .add(score(actual[1], target[1]))
                .add(score(actual[2], target[2]));
            if best_score.is_none_or(|q: X| {
                s.cmp(q) == Ordering::Less
                    || (s.cmp(q) == Ordering::Equal && x.cmp(best) == Ordering::Less)
            }) {
                best = *x;
                best_score = Some(s);
            }
        }
        f.z[other] = best;
    }
    f
}
fn singular(f: Factors) -> bool {
    let [r, s, t, u] = f.z;
    let mut dr = Expansion::single(t);
    dr.push(r.neg());
    let mut ds = Expansion::single(u);
    ds.push(s.neg());
    let mut result = ds.product_exp(&ds);
    result.sub_exp(&dr.product_exp(&ds).times(r));
    result.add_exp(&dr.product_exp(&dr).times(s));
    result.sign() == 0
}
fn update(f: Factors, residual: [X; 4]) -> Option<Factors> {
    let [r, s, t, u] = f.z;
    let o = X::ONE;
    let z = X::ZERO;
    let mut rows = [
        [o, z, o, z, residual[0]],
        [t, o, r, o, residual[1]],
        [u, t, s, r, residual[2]],
        [z, u, z, s, residual[3]],
    ];
    for column in 0..4 {
        let mut pivot = column;
        for row in column + 1..4 {
            if rows[row][column].abs().cmp(rows[pivot][column].abs()) == Ordering::Greater {
                pivot = row;
            }
        }
        if rows[pivot][column].m == 0.0 {
            return None;
        }
        rows.swap(column, pivot);
        let pivot_row = rows[column];
        for row in column + 1..4 {
            let factor = rows[row][column].div(rows[column][column]);
            for (value, pivot_value) in rows[row][column + 1..]
                .iter_mut()
                .zip(&pivot_row[column + 1..])
            {
                *value = value.sub(factor.mul(*pivot_value));
            }
            rows[row][column] = X::ZERO;
        }
    }
    let mut correction = [X::ZERO; 4];
    for i in (0..4).rev() {
        let mut v = rows[i][4];
        for (j, item) in correction.iter().enumerate().skip(i + 1) {
            v = v.sub(rows[i][j].mul(*item));
        }
        correction[i] = v.div(rows[i][i]);
    }
    let mut answer = f;
    for (i, item) in correction.iter().enumerate() {
        answer.z[i] = f.z[i].sub(*item);
    }
    Some(answer)
}
fn refine(mut f: Factors, target: [X; 4]) -> Option<Factors> {
    // This representation guard leaves ample exponent headroom for the four
    // elimination columns. Rejection transfers the call to certification.
    if f.z.iter().any(|x| x.e.abs() > (1 << 18)) {
        return None;
    }
    let mut best = f;
    let (mut relative, mut best_abs, mut residual) = errors(f, target);
    trace_decision!("roots.a.refine.best");
    for _ in 0..53 {
        let (_, absolute, _) = errors(f, target);
        if absolute.m == 0.0 {
            trace_decision!("roots.a.refine.zero");
            return Some(best);
        }
        if singular(f) {
            trace_decision!("roots.a.refine.singular");
            return Some(best);
        }
        f = update(f, residual)?;
        trace_decision!("roots.a.refine.iteration");
        if f.z.iter().any(|x| x.e.abs() > (1 << 16)) {
            return None;
        }
        let (next_rel, next_abs, next_res) = errors(f, target);
        if next_abs.cmp(best_abs) == Ordering::Less {
            best = f;
            best_abs = next_abs;
            trace_decision!("roots.a.refine.best");
        }
        if next_rel.cmp(relative) == Ordering::Greater {
            trace_decision!("roots.a.refine.relative_increase");
            return Some(best);
        }
        relative = next_rel;
        residual = next_res;
    }
    trace_decision!("roots.a.refine.budget");
    Some(best)
}
pub(crate) fn generate(p: Poly) -> Proposals {
    let failed = Proposals {
        values: [X::ZERO; 4],
        len: 0,
        usable: false,
        nonreal_pair: false,
        sources: [0; 4],
    };
    trace_decision!("roots.a.normalize");
    let mut sigma = 0;
    for i in 0..4 {
        if p.c[i].hi.m != 0.0 {
            let divisor = (4 - i) as i32;
            let e = p.c[i].hi.e - p.c[4].hi.e;
            sigma = sigma.max((e + divisor - 1).div_euclid(divisor));
        }
    }
    if sigma == 0 {
        trace_decision!("roots.a.scale.identity");
    } else {
        trace_decision!("roots.a.scale.coordinate");
    }
    let mut target = [X::ZERO; 4];
    for i in 0..4 {
        target[3 - i] = p.c[i].hi.div(p.c[4].hi).scale((i as i32 - 4) * sigma);
    }
    let [a, b, c, d] = target;
    let shift_poly = Poly::from_x([b, a.mul(X::from(3.0)), X::from(6.0), X::ZERO, X::ZERO], 2);
    let (shifts, shift_count) = quadratic_hints(shift_poly);
    let shift = if shift_count > 0 {
        trace_decision!("roots.a.shift.zero");
        let mut s = shifts[0];
        for x in &shifts[1..shift_count] {
            if x.abs().cmp(s.abs()) == Ordering::Less
                || (x.abs().cmp(s.abs()) == Ordering::Equal && x.sign() >= 0)
            {
                s = *x;
            }
        }
        s
    } else {
        trace_decision!("roots.a.shift.minimum");
        a.neg().scale(-2)
    };
    let aa = a.add(shift.scale(2));
    let bb = b
        .add(a.mul(shift).mul(X::from(3.0)))
        .add(shift.mul(shift).mul(X::from(6.0)));
    let cc = c
        .add(b.mul(shift).scale(1))
        .add(a.mul(shift).mul(shift).mul(X::from(3.0)))
        .add(shift.mul(shift).mul(shift).scale(2));
    let dd = d
        .add(c.mul(shift))
        .add(b.mul(shift).mul(shift))
        .add(a.mul(shift).mul(shift).mul(shift))
        .add(shift.mul(shift).mul(shift).mul(shift));
    let third = X::from(3.0);
    let twenty_seven = X::from(27.0);
    let g = aa.mul(cc).sub(dd.scale(2)).sub(bb.mul(bb).div(third));
    let hh = aa
        .mul(bb)
        .mul(cc)
        .div(third)
        .add(bb.mul(dd).scale(3).div(third))
        .sub(bb.mul(bb).mul(bb).scale(1).div(twenty_seven))
        .sub(cc.mul(cc))
        .sub(aa.mul(aa).mul(dd));
    let tau = (if g.m != 0.0 {
        (g.e + 1).div_euclid(2)
    } else {
        0
    })
    .max(if hh.m != 0.0 {
        (hh.e + 2).div_euclid(3)
    } else {
        0
    }) + 2;
    let auxiliary = Poly::from_x(
        [
            hh.scale(-3 * tau),
            g.scale(-2 * tau),
            X::ZERO,
            X::ONE,
            X::ZERO,
        ],
        3,
    );
    let bound = auxiliary.bound();
    trace_decision!("roots.a.resolvent");
    let mut solver = Solver::new(
        auxiliary,
        rank(bound.neg()),
        rank(bound),
        f64::NEG_INFINITY,
        f64::INFINITY,
        false,
    );
    let mut roots = solver.collect(3, false);
    if roots.len == 0 {
        return failed;
    }
    let selected = if hh.sign() > 0 { 0 } else { roots.len - 1 };
    let rr = roots.roots[selected].finish(&solver.polys);
    let rho = coordinate(rr).scale(tau);
    let h = a.scale(-1);
    let k = b.div(X::from(6.0)).add(rho.scale(-1));
    let delta = b.sub(h.mul(h)).sub(k.scale(1));
    let difference = c.sub(h.mul(k).scale(1));
    let eta = d.sub(k.mul(k));
    let mut possibilities = [(X::ZERO, X::ZERO); 3];
    let mut count = 0;
    if delta.m != 0.0 {
        possibilities[count] = (delta, difference.div(delta).scale(-1));
        count += 1;
    }
    if eta.m != 0.0 && difference.m != 0.0 {
        possibilities[count] = (
            difference.mul(difference).div(eta).scale(-2),
            eta.div(difference).scale(1),
        );
        count += 1;
    }
    if difference.m != 0.0 {
        possibilities[count] = (delta, eta.div(difference).scale(1));
        count += 1;
    }
    let mut selected_pair = None;
    let mut selected_score = None;
    for (de, nu) in &possibilities[..count] {
        if de.m == 0.0 {
            continue;
        }
        let s = score(de.add(h.mul(h)).add(k.scale(1)), b)
            .add(score(de.mul(*nu).scale(1).add(h.mul(k).scale(1)), c))
            .add(score(de.mul(*nu).mul(*nu).add(k.mul(k)), d));
        if selected_score.is_none_or(|prev: X| {
            s.cmp(prev) == Ordering::Less
                || (s.cmp(prev) == Ordering::Equal
                    && selected_pair
                        .is_some_and(|(x, y)| lex(&[*de, *nu], &[x, y]) == Ordering::Less))
        }) {
            selected_pair = Some((*de, *nu));
            selected_score = Some(s);
        }
    }
    let regular = selected_pair.map(|(de, nu)| {
        let v = de.abs().sqrt();
        if de.sign() < 0 {
            trace_decision!("roots.a.factor.real");
            repair(
                Factors {
                    z: [h.add(v), k.add(v.mul(nu)), h.sub(v), k.sub(v.mul(nu))],
                    complex: false,
                },
                target,
                true,
            )
        } else {
            trace_decision!("roots.a.factor.complex");
            Factors {
                z: [h, k, v, v.mul(nu)],
                complex: true,
            }
        }
    });
    let limiting = if eta.sign() <= 0 {
        trace_decision!("roots.a.factor.limiting");
        let v = eta.neg().sqrt();
        Some(repair(
            Factors {
                z: [h, k.add(v), h, k.sub(v)],
                complex: false,
            },
            target,
            false,
        ))
    } else {
        trace_decision!("roots.a.factor.limiting_unavailable");
        None
    };
    let chosen = match (regular, limiting) {
        (Some(r), Some(l)) => {
            let er = errors(r, target).0;
            let el = errors(l, target).0;
            if el.cmp(er) == Ordering::Less
                || (el.cmp(er) == Ordering::Equal
                    && (r.complex || lex(&l.z, &r.z) == Ordering::Less))
            {
                l
            } else {
                r
            }
        }
        (Some(r), None) => r,
        (None, Some(l)) => l,
        (None, None) => return failed,
    };
    trace_decision!("roots.a.factor.select");
    if chosen.complex {
        trace_decision!("roots.a.candidate.complex");
        return failed;
    }
    let Some(chosen) = refine(chosen, target) else {
        return failed;
    };
    let mut result = Proposals {
        values: [X::ZERO; 4],
        len: 0,
        usable: true,
        nonreal_pair: false,
        sources: [0; 4],
    };
    for i in [0, 2] {
        let factor = Poly::from_x([chosen.z[i + 1], chosen.z[i], X::ONE, X::ZERO, X::ZERO], 2);
        let (values, len) = quadratic_hints(factor);
        if len == 0 {
            trace_decision!("roots.a.candidate.complex");
            result.nonreal_pair = true;
        }
        for value in &values[..len] {
            trace_decision!("roots.a.candidate.real");
            result.values[result.len] = value.scale(sigma);
            result.sources[result.len] = (i / 2) as u8;
            result.len += 1;
        }
    }
    for i in 1..result.len {
        let mut j = i;
        while j > 0 && result.values[j].cmp(result.values[j - 1]) == Ordering::Less {
            result.values.swap(j, j - 1);
            result.sources.swap(j, j - 1);
            j -= 1;
        }
    }
    result
}
