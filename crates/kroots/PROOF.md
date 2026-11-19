# Arithmetic, ownership, and finite work

This document describes the implementation derived from SPEC-ROOTS-v3.2. The
certificate polynomial always contains the supplied exact coefficients. The
factorization only supplies proposals.

## Representations and exact arithmetic

`X` represents `m * 2^e`, where the nonzero binary64 significand has magnitude
in [1,2). Input subnormals are first multiplied by an exact power of two and
decoded. Normalizing changes only the exponent encoding. Significand arithmetic
therefore never reaches a hardware underflow or overflow boundary. An addition
with an exponent gap greater than 110 has the larger input as its rounded high
part and the entire smaller input as its exact residual. Smaller gaps are
aligned exactly in normal binary64 and evaluated by the two-sum identity.
Products split normalized significands using 2^27+1; expanding the four partial
products gives a rounded product and its exact residual. No fused operation is
used. Directed rounding advances the rounded high part only when the exact
residual has the required sign. Directed division compares the exact dividend
against the product of the rounded quotient and divisor.

Expansion insertion replaces two terms by their exact high part and residual,
so induction preserves the sum. The backward compression pass combines small
terms into each carried larger term; the forward pass emits the remaining
rounding residuals before the high term. Each emitted residual lies below the
rounding cell of the retained term. Zero limbs disappear. The result is ordered
and nonoverlapping, and its largest nonzero limb dominates the sum of the lower
limbs. Its sign is consequently the exact sign of the represented expression.

The point evaluator has exactly the raw bounds in §3.2: 31 terms for an original
quartic at a one-limb point, 341 at a two-limb midpoint, and 30/170 for its exact
derivatives. Original differentiation uses exact integer multiplication and
retains the residual. Repeated differentiation requires at most 58 significant
bits (the original 53 plus the small factorial multiplier), so two limbs suffice.

The implementation also certifies common zeros algebraically. For a quartic
`a t^4+b t^3+c t^2+d t+e`, elimination with its derivative gives

```
U(t) = (8ac-3b²)t² + (12ad-2bc)t + (16ae-bd).
```

At a derivative zero, `U=16a p`. A second elimination gives a linear remainder;
if it is nonzero, exact endpoint signs locate its sole possible common zero.
If it vanishes identically, the common quadratic supplies the location test.
A sparse 7-by-7 coefficient determinant first certifies existence of a common
factor. Its permutation traversal has seven levels and at most 7! leaves; no
precision escalation or search is involved. Cubics use the corresponding
linear remainder and their exact discriminant. These tests distinguish exact
identities from numerical shadows even when the common zero is not dyadic.

Each determinant product has seven coefficient factors, with exact integer
derivative multipliers. Its binary exponent support is inside (-7520,7200).
The remaining elimination expressions have at most five original coefficient
factors, and point substitution adds at most two coordinate factors. After
compression these algebraic expressions fit the same 341-limb capacity; the
support width is below 14720 bits, with fewer than 290 occupied 53-bit groups.
Point-evaluation capacities continue to follow their tighter raw-term bounds.

## Plain filter and compensation

The sufficient plain-evaluation certificate uses a common coefficient scale
`2^-beta`, with beta the maximum coefficient exponent. Every nonzero coefficient
must then have exponent at least -200, coefficients must have no residual limb,
and a nonzero point must have exponent in [-80,80]. Zero is handled exactly.
Across four products, the exact dyadic lattice cannot extend below roughly
`-200-52-4(80+52)=-780`; the high values stay below exponent 330. This leaves
room for the splitter and all cancellation residuals within normal binary64.
The ordinary filter uses `(4n+4)u` times the computed positive Horner sum. This
exceeds the ordinary Horner error, including the relative error in that sum,
for n at most four. It is a sign filter only.

Compensated evaluation uses the same common scale when this certificate holds;
otherwise it uses exponent-preserving operations. Both paths combine each
product residual with its addition residual **before** evaluating the correction
polynomial. A single final addition produces H. The positive Horner sum, gamma,
gamma squared, and every term of E are rounded upward in the stated order.
Consequently common exact binary scaling commutes with H, E, and the touching
comparison. Internal tests check the two H implementations against each other.
An undecided compensated sign proceeds to lossless expansion evaluation.

The arithmetic path decision records this exponent-safety selection. Candidate
normalization and outward bounds always retain explicit exponents, including on
a call whose ordinary/compensated point evaluator takes the plain path. Thus a
plain point certificate is never used to justify discarding a candidate or bound
term outside the stored-double exponent range.

As authorized by ANSWERS-ROOTS-1 and ANSWERS-ROOTS-2, square root normalizes its
argument into [1,4), uses the IEEE binary64 `f64::sqrt`, and retains the remaining
exact binary exponent. This is the same correctly rounded extended-significand
value. No transcendental function or additional dependency is used.

## Range, root ownership, and rounding

Ranks increase from the virtual value -2^1024 through all finite mathematical
binary64 values (one zero) to +2^1024. Their total width is less than 2^64.
The two virtual endpoints are never returned. Exact midpoint signs select the
correct side of each rounding cell. Ties use the even significand. In particular
the outer midpoint is Omega, so a root beyond F can still return F, but a root
at or beyond Omega is omitted.

The coefficient bound is a conservative enlargement of the dyadic bound in
§2.4. Its exterior leading-term domination excludes both roots and the 64u
shadow band. Before factor generation, same-sign monomials on a half-axis give
`|p|=S`; interval separation gives `inf |p| > 64u sup S`; or a strict derivative
sign together with equal nonzero endpoint signs proves emptiness. The last
certificate has no stationary point at which a shadow could occur.

Derivative roots partition the effective window. A signed crossing bracket is
owned by one monotone piece. Its endpoints are only replaced by certified signs.
Stationary enclosures remain coarse when an interval sign and shadow-exclusion
bound suffice; otherwise they are refined to their terminal grid cell. Terminal
endpoint and exact midpoint samples take precedence over touching. Two distinct
rounded representatives are preserved. Internally, equal representatives alone
do not discard separate derivative enclosures. The special terminal quadratic
component retains the existence of its sign-changing derivative zeros.

An exact common-zero certificate reuses the derivative root's enclosure and
rounding comparison. Otherwise the stationary representative uses the canonical
H, E, d, upward M2, and T. The second inequality compares against an **exact**
expansion of S, not an upper estimate. A certified incident crossing suppresses
an extra shadow. Admitted values are filtered for exact lower-end exclusion,
finite representation, and omission when RN equals lo, then identical public
representatives are collapsed.

Full-list processing proceeds from left to right. Earliest processing uses the
same certificates and stops at its first admissible representative. Derivative
preparation is shared; later output roots are not polished or admitted. The
lower-representative exception continues the scan rather than stopping it.

## Profile A and transfer

The candidate layer implements exact binary coordinate scaling, monic working
estimates, the zero/minimum shift, one isolated dominant auxiliary-cubic root,
three regular pivot estimates, constant-product and linear-coefficient repair,
and the unconditional regular/limiting comparison. Conjugate coefficients retain
their complex classification and transfer to the common derivative procedure.
Real factors undergo the coefficient Newton iteration. Relative-error increase
stops it; minimum absolute error selects the retained iterate, including a final
iterate that triggers the stop. Zero residual and exact singularity have their
own exits. Stagnation reaches the separate 53-update limit.

Factor association is retained with each sorted proposal. Until an original
bracket is owned, its location has no certified uncertainty bound. Certification
stores the original grid cell with an accepted proposal. All original roots and
stationary components are still covered by the derivative partition. An unmatched
root or proposal transfers that existing search to C; the verified state and
consumed work remain in place. The fault-injection unit test removes a proposal
and checks that all four original roots survive the transfer.

## Work and storage inventory

Each owned bracket alternates a safeguarded Newton opportunity with mandatory
rank bisection. A valid Newton probe is interior and nonstagnant; otherwise that
step is also a bisection. At most 64 halvings, and hence 128 steps, reach adjacency.
There are at most 4+3+2+1 original-cascade roots and 3+2+1 auxiliary-cascade roots.
Derivative enclosures and reused shared-zero brackets do not reset their step
counters. The total limits are 1280 and 768, respectively. The implementation
uses no preliminary expanding local search. Coefficient refinement has at most
53 evaluated updates and cannot restart. These bounds are proved invariants;
the scheduling amendment makes their informational trace counts non-normative.

All production arrays have fixed sizes: five coefficient records per polynomial,
five cascade records, four root records per list, three stationary records per
level, four proposals and certificate cells, the 4-by-5 coefficient-Newton
workspace, and the 7-by-7 common-factor matrix. Degree recursion has at most four
nonconstant levels; determinant recursion has seven. A point evaluation uses at
most four live 341-limb arithmetic buffers. Algebraic common-zero checking has
additional fixed expansion temporaries: a conservative whole-call live-storage
inventory is 128 expansions plus 16 KiB of coefficient, bracket, interval, factor,
and scalar records, below 720 KiB. A 1 MiB mathematical-workspace allowance covers
this inventory; compiler-specific spills and ABI frame layout remain a G12
surface check. Production allocation tests exercise ordinary, clustered, common,
invalid, and subnormal calls with both public entry points and observe zero heap
allocations. The sole dynamic recording buffer is feature-gated instrumentation.

Certificate exponent support is bounded by the input grid, degree, and fixed
algebraic products, well inside signed 32-bit exponents. Initial candidate
expressions use fixed-degree products of coefficient ratios and their dyadic
scales. Before the first coefficient update, factor exponents exceeding 2^18
trigger transfer; after every coefficient update, exponents exceeding 2^16
trigger transfer. Both thresholds lie inside the previous 2^18 limit.
Four elimination columns starting inside that limit leave
headroom below 2^31 even for their intermediate exponent combinations. Thus the
candidate arithmetic cannot exhaust the integer exponent representation before
the transfer check.

These arguments and the development tests do not claim the external performance,
cross-target, sanitizer, or hidden-corpus gates. No clean-side benchmark is run.
