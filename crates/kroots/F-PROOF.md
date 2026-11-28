# Profile F proof and resource bounds

This document supplements PROOF.md, retaining its exact-arithmetic and canonical
shadow arguments. The Profile F entry layer records exactly one input degree
and window form. Rejected inputs record roots.input.invalid. Internal degree
records have been removed; all remaining informational records describe work.

## Empty decisions

On one strict half-axis, equal-sign monomials give |p|=S. The zero endpoint is
kept when it belongs to the window. Otherwise this proves absence of both roots
and shadows without any floating arithmetic other than exact sign changes.

For the second certificate, orient the axis and leading sign. Replace each
nonzero coefficient v by down(RN(v-128u|v|)). Zero coefficients remain zero.
The resulting polynomial q satisfies q(t) <= sign(p_n)p(axis*t)-64u S_p(t)
for t>=0: the 128u subtraction exceeds 64u after both rounding errors. We only
claim positivity when the leading coefficient of q is positive.

For a quadratic q=A t²+B t+C, C>0 and 4AC-B²>0 prove positivity on all real
arguments. A 16u times absolute-term-sum margin covers all roundoff in this test.

For a quartic q=a t⁴+b t³+c t²+d t+e choose any binary64 z and form its exact
Gram matrix in the basis (t²,1,t):

    [ a    z       b/2 ]
    [ z    e       d/2 ]
    [ b/2  d/2     c-2z ]

Its quadratic form is exactly q. The tested leading principal minors are a,
ae-z², and

    ace - 2aez - eb²/4 - ad²/4 + bdz/2 - cz² + 2z³.

Strict positivity of these three quantities proves positive definiteness by
square elimination, hence q(t)>0. The z proposal (c-sqrt(c²-3bd+12ae))/6 is
the local maximum of this determinant as a function of z. Its accuracy has no
role in the proof; the minors are tested for the actual binary64 z. The first
minor uses a 16u margin and the determinant a 64u margin against their computed
absolute term sums. Each term has at most four rounded operations and the sum
has six, so these margins exceed gamma_10 including summation of magnitudes.
This proves |p|>64u S throughout the half-axis, including any rounded stationary
representative, and therefore excludes every admissible shadow.

E56 and E59 are permitted to defer when their positivity margin is too narrow.
E69 must defer: the certificate cannot remove its numerical shadow.

Before the Gram test a sufficient half-axis certificate discards positive odd
terms. Put dn=min(d,0), bn=min(b,0). If 4aec-a dn²-e bn²>0, split c into
dn²/(4e) and bn²/(4a) plus a positive remainder. Completing the constant and
leading squares proves positivity on t>=0. The implemented 32u absolute-sum
margin covers the at-most-seven-operation polynomial evaluation; no division
is needed for this certificate.

The Gram path requires every nonzero original coefficient exponent in [-80,40].
Even allowing an unnecessarily fine lattice for the subtraction, q coefficients
have lattice no finer than 2^-186 and magnitude less than 2^42. The radicand has
lattice no finer than 2^-374 and magnitude below 2^89. Its rounded square root
has lattice no finer than 2^-239; subtracting c and dividing by 6 puts z above
2^-242 when nonzero, with lattice above 2^-295 and magnitude below 2^46.
Three-factor expressions, cancellation and 64u margins therefore stay above
2^-940 and below 2^150. All operations remain normal. Zero coefficients
are handled algebraically and zero radicands cause deferral. No underflow or
overflow can affect a successful certificate.

The quadratic empty filter permits input exponents [-200,200]. Its products,
differences and error margins have exponent support inside [-620,410]. For its
direct negative-discriminant return, write T=B²+4|AC|. The rounded discriminant
differs from its exact value by less than 4uT. The test Dhat < -1024u That thus
implies -D > 1010uT. At the vertex, |p|/S=(-D)/(3B²+4|AC|)>330u. Rounding the
vertex changes the numerator only quadratically; this change is less than 8u²T
in the same units and cannot reach the 64u shadow band. Thus this EMPTY also
excludes a numerical shadow, for any window.

## Quadratic isolated values

Write s=sqrt(D), T=B²+4|AC| and t=|B|/s. The positive-discriminant branch requires
Dhat > 2^-20 That. Accounting for the error above gives T/D < 2^20+1 and t<1025.
The exact well-conditioned numerator is Q=-(B+sign(B)s)/2. The floating numerator
uses a correctly rounded square root, an addition of like signs, and exact
halving. The two roots are Q/A and C/Q; the zero-constant case defers.

The discriminant error is at most uD+(1+u)uT. Perturbing the square root and
including its final rounding bounds the relative Q error by

    u [1 + (1.50000001 s + 0.50000001 T/s)/(|B|+s)].

When AC>=0, T=2B²-s², t>=1, and both roots have condition number kappa=2t.
Including either division and its second-order error gives relative root error
less than 2u kappa. When AC<0, T=s², 0<=t<1, and both roots have kappa=1+t.
The corresponding bound is less than (4+2^-20)u kappa. Both are strictly within
5a_r. The small discriminant-relative error (<2^-32) justifies the displayed
outward constants and bounds all higher-order terms in division and square root.

Root separation is s/|A|. For AC>=0, a_r/separation <=2uT/D; for AC<0 it is <=2u.
Thus the branch's separation is much greater than 10a_r for both roots. The
vertex residual is at least (2^-20/4)S before the negligible rounding-location
change, so there is no admissible shadow. Every exact root is represented once.
The endpoint guard 32768u|v| exceeds root-location error plus nearest-rounding
uncertainty since t<1025. Outside values are excluded only beyond that guard;
an undecided endpoint goes to exact isolation. Both outputs are required normal.
For coefficient exponents [-200,200], products lie within [-402,405], numerator
and square-root exponents within [-260,205], and quotients within [-465,465].
Margins remain normal. No F, Omega, subnormal rounding or zero case reaches this
return path. The output's own window comparisons and positive-zero padding hold.
The like-sign numerator supplies the root of larger magnitude. Its sign therefore
decides root order without computing both quotients. An exact negative-root sign
with lo>=0, or positive-root sign with hi<=0, can skip that quotient. Earliest
computes further quotients only when the preceding root is outside the window.

## Cubic and quartic partition

The plain path requires each nonzero coefficient exponent in [-80,40], and each
evaluated nonzero coordinate in [2^-40,2^40] in magnitude. It also requires a
dyadic root bound within that range. If ei is the input exponent and en the
leading exponent, set H=max(0,ceil((ei-en+1)/(n-i))) over nonzero lower terms,
and R=2^(H+1). At |z|>=R the ratios of lower terms to the leading term sum to
less than sum(j=1..n)2^-j<1. This bounds every complex root. Exact differentiation
decreases each coefficient ratio, so the same R bounds all derivative roots.

Each derivative coefficient is the exact original coefficient multiplied by a
falling factorial <=24, stored as an error-free high/low product. Ordinary Horner
uses a 32u positive-sum error bound, including every low coefficient. Compensation
propagates the product and sum residuals and low coefficients, then adds one
correction. Its error is bounded by 2u|H|+256u²S_up: at degree four there are at
most eight first-pass roundings, and the correction introduces fewer than sixteen
roundings of first-order residuals. The 256 constant bounds their accumulated
second-order error. Every positive Horner sum is inflated by 128u; lower bounds
deflate sufficiently to cover both that inflation and its original rounding.

Derivative quadratics use a discriminant sign with a 64u absolute-sum margin.
Each proposed real zero receives opposite certified signs at its enclosure ends.
Enclosures must be disjoint; an exact zero factor gives a singleton at zero.
Induction partitions each higher derivative into monotone pieces with every
derivative zero accounted for. A claimed parent sign over a stationary enclosure
uses the center evaluation error plus a derivative-magnitude Lipschitz radius.
At the original polynomial it additionally exceeds 64u S_up over that enclosure,
which includes every possible rounded stationary representative. Therefore every
stationary region is root-free and shadow-free before a plain result is returned.
Unresolved stationary regions, shared roots and unresolved discriminants defer.

Signed gaps are intersected with the actual window and their new endpoint signs
are certified. Exact or ambiguous endpoint equality defers. Opposite signs own
one simple root on the monotone gap. Newton proposals remain inside that gap;
each successful enclosure is also contained in it. A failed or exhausted search
defers, never discards an owned crossing. Equal signs on a monotone gap certify
its emptiness. The zero-constant plain branch is enabled only with lo>=2^-40,
so its exact zero is outside the window; all other zero-factor cases use exact
completion. Every effective window component is covered.

## Final correction, isolation and F1

An owned root bracket [a,b] contains r. At the corrected x in that bracket, let
w=max(|x-a|,|b-x|), E be the compensated residual error, D0 the approximate
derivative, Ed its ordinary error, and M2 an upper bound on |p''| throughout the
bracket. Then

    Dlow=|D0|-Ed-M2*w, Dhigh=|D0|+Ed+M2*w,
    |x-r| <= (|H|+E)/Dlow,
    a_low=u*S_low/Dhigh <= a_r <= u*S_high/Dlow=a_high.

All expressions carry the code's outward 128u factors; Dlow must be positive.
For the signed subtraction in Dlow, the 32u ordinary-error allowance has additional
slack: high Horner plus low coefficients needs less than 12u*S_up. Subtraction
roundoff is less than 3u*S_up whenever the computed lower bound is positive
(then the subtracted variation is no larger than |D0|, up to rounding). That
slack absorbs cancellation error before the final deflation. Positive sums and
products use the explicit inflation factors. Thus positivity of the computed
Dlow is a sufficient lower derivative certificate even near cancellation.
The return test requires the distance bound <=5*a_low, with an extra deflation
on the right. This proves F1 without assuming a residual alone locates a root.
Two compensated Newton corrections are permitted, stopping on stagnation.

For complex isolation choose rho=32*(w+a_high), inflated outward. On |z-x|=rho,
the Taylor remainder beyond p'(x)(z-x) is at most M2_complex*rho²/2; the code uses
the larger M2_complex*rho². The strict comparison

    (|D0|-Ed)*rho > |H|+E+M2_complex*rho²

proves that precisely one complex root is in the disk by linear-term dominance.
Because rho>w+10*a_high, no other real or complex root is within 10a_r of r.
Cluster roots consequently defer. Both window endpoints must be farther than
rho from x before a value is admitted, excluding exact membership ambiguities
and the RN(r)=lo omission. All returned x are ordinary normal finite coordinates,
so the F/Omega and subnormal representation rules defer automatically.

Processing is in increasing order. The first accepted value has a certified
empty prefix. Earliest stops there. Full-list processing preserves that certified
first value even if a later piece requires exact completion; the exact completion
supplies the complete list, and its first representative is replaced by the
already certified value of the same isolated first root. This preserves bitwise
earliest/full equivalence without refining later output roots in an earliest call.
There is no output for a complex pair, exterior root, rejected shadow or second
representative of an already accounted root.

## Plain exponent and work bounds

Original coefficients have dyadic support above 2^-132. Factorial products are
exact high/low pairs. Four Horner products at coordinates bounded as above put
exact support above 2^-500 and magnitudes below 2^210; residual correction and
error terms remain above 2^-800. Splitter products are below 2^238. Every Newton
denominator is checked above 2^-400 before division, so even a subsequently
rejected proposal has magnitude below 2^620. Subsequent evaluation first checks
the coordinate bounds. The successful root enclosure has representable distinct
endpoints; its width is at least 2^-93. Consequently disk radii and their squares
cannot underflow. Positive derivative bounds, divided error bounds and cancellation
in Dlow have dyadic support within [-900,700]; a nonpositive Dlow defers. These
sufficient ranges cover decisions as well as returned values. Extreme input bits
that fail any entry condition go directly to exponent-preserving exact work.

At most seven searched brackets (three derivative and four original) each have
48 iterations. Each iteration uses a fixed number of degree-at-most-four Horner
passes and fixed residual operations. There are two quadratic proposals and at
most two extra correction steps for each of four output roots. A conservative
2^22 binary64-operation allowance bounds stages 1--3, including all failed trials.
This work precedes at most the N=2 exact entries below; retaining a certified first
value does not start another solve. Plain arrays, derivative recursion (at most
two levels), brackets and scalar scratch fit within 16 KiB and unwind before
exact isolation. The total mathematical workspace bound remains 1 MiB+16 KiB.

The exact arithmetic's square root now uses the allowed IEEE f64::sqrt on a
significand in [1,4), followed by an exact exponent tag. This is precisely the
same exponent-preserving nearest square root as the inherited rational routine;
it changes none of the canonical H/E/T operations or exact sign certificates.

## Exact completion at zero

If p=t^m q with m>0, every nonzero root of q is an exact root of p with identical
multiplicity and rounding. The original solver still decides every numerical
shadow of p. A second derivative solve of q, with public touching disabled,
adds only exact roots of q within the original clipped window. This repairs
terminal neighborhoods in which zero and a distinct subnormal root otherwise
hide each other's crossings. Exact window endpoints, finite rounding and lower
representative omission are applied to the added values. Deduplication and
sorting give the union; earliest keeps its minimum. This is an algebraic class
repair, with no coefficient-vector dispatch or stored outputs.

## Bounds retained by the exact path

At most N=2 entries into exact isolation occur. The first retains at most 2048
rank-refinement steps and 53 coefficient updates; the second has degree at most
three and at most 768 rank-refinement steps. Thus the exact portion is bounded
by 2816 rank steps and 53 coefficient updates, plus the fixed degree checks,
terminal comparisons and finite algebraic determinants described in PROOF.md.
The completion does not run a second candidate generator. Its stack is sequential
with the first solve's recursive work; at most two Solver records are live.
The original 1 MiB mathematical workspace allowance plus 16 KiB bounds all fixed
records. There is no production allocation, recursion beyond polynomial degree,
or replenishment of a bracket's step budget. Cross-target ABI layout is a G12
review item; the mathematical storage bound is independent of input bits.
