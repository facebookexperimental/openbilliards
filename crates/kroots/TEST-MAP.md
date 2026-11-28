# Behavior witness map

Profile F amendment: isolated simple-root values are checked with independently
implemented outward enclosures and a complex-disk isolation certificate in
`tests/support/mod.rs`. Cluster, touching, endpoint, zero, and format-limited
values remain bit-exact. Every call also checks earliest against its own full
result. `zero_factor_subnormal_completion` adds all seven disclosed defect
windows. Informational scheduling assertions have been removed as required;
input degree/window outcome groups remain exact. F-PROOF.md supplements the
inherited arithmetic and work arguments.

Every E-number below is exercised by `tests/contracts.rs::edge_table`, including both public entry points and padding. Supplemental accessor, copy/equality, caller-selection, signed scaling, independence, property, and trace checks are in the named integration-test files.

| Clause | Witness | Failing mutation from the specification |
|---|---|---|
| quartic-r00 | Exact degree cascade: E26/E15/E03/E02/E50. | Wrong count or lost distant root. |
| quartic-r01 | Both-profile finite-input guard: E13/E14. | Debug panic or non-finite output. |
| quartic-r02 | Non-monic invariance: E32 and −2 times its tuple. | Changed roots. |
| quartic-r03 | Finite large-scale service: E45/E51. | Overflow or EMPTY. |
| quartic-r06 | Large lower-degree service: E54. | Lost finite cubic root. |
| quartic-r07 | Cubic accuracy and arithmetic parity: E27/E54 on G7. | Wrong rounded bits. |
| quartic-r08 | Caller units preserved: E51 and 2⁻²⁰ times its tuple. | Times rescaled with coefficients. |
| quartic-r09 | Certified refinement: E55. | Coarse root despite correct count. |
| quartic-r10 | Genuine cubic service: E26/E27. | Cubic treated as quadratic. |
| quartic-r14 | Distinct close pairs preserved: E55/E68. | Spurious pair collapse. |
| quartic-r16 | Stable real quadratics and zero: E24/E22. | Erased small root or duplicate zero. |
| quartic-r19 | Finite sorted output with count: E32/E35. | Placeholders or unordered roots. |
| quartic-r20 | Strict lower cutoff and earliest: E06/E07/E20. | Admitted lo or false result. |
| quartic-r21 | Repeated, degenerate, scaled, close, and contact families: E26/E36–E40/E45/E50/E55/E57–E59. | Missing class or wrong earliest. |
| math_small-r00 | Bounded prefix, empty constant, zero padding: E02/E15. | Invalid length or stale unused slot. |
| math_small-r01 | Tiny leading terms retained: E50. | Approximate degree reduction. |
| math_small-r02 | All degrees supported: E02/E03/E15/E26/E32. | Wrong degree/count. |
| math_small-r03 | Linear ratio and constant emptiness: E03/E04/E02. | Lost negative root or phantom zero. |
| math_small-r04 | Real/repeated/nonreal quadratic discrimination: E15/E17/E20. | Wrong real count. |
| math_small-r05 | Cancellation-safe small root: E24. | Small root becomes zero. |
| math_small-r06 | Both quadratic roots correctly rounded: E24. | Accurate large root but inaccurate mate. |
| math_small-r07 | Exact-zero handling preserves small roots: E25/E22. | Two zeros or division failure. |
| math_small-r10 | Complete real cubic service: E26/E27/E28. | Forced count or lost stationary crossing. |
| math_small-r11 | Exact cubic degree reduction: E15 padded to five coefficients. | Division by zero. |
| math_small-r12 | Non-monic cubic invariance: E26 and −4 times its tuple. | Shifted/scaled roots. |
| math_small-r14 | Huge finite cubics: E54. | Missing or non-finite root. |
| math_small-r15 | Refined cubic accuracy: E52. | Incorrectly rounded estimates. |
| math_small-r16 | All real cubic roots including zero: E30/E52. | Actual zero lost or phantom zero added. |
| math_small-r18 | Strict cutoff and earliest: E15/E16. | Wrong first root. |
| math_small-r19 | Bounded access and canonical zero: E13/E41 plus manual length witness. | NaN output, panic, or negative zero. |
| math_small-r20 | Deterministic allocation-free production behavior: E13/E24/E55 on G7. | Profile panic or byte mismatch. |
| math-r00 | Fixed capacity, explicit occupancy, and positive-zero unused storage: E02/E15/E32 have lengths zero/two/four with all unused bits positive zero. | Occupied padding or stale unused values. |
| math-r01 | Exact-zero reduction and retention when a nonzero leading term is followed by zero: E22/E50/E51, including signed leading zeros on E15. | Erased leading term loses a distant root, or zero signs change degree. |
| math-r02 | Degree reduction preserves the whole reduced polynomial result, without adding roots: padded E02/E03/E15/E26 produce the same results as their effective degrees. | Forced count or an extra root at zero/infinity. |
| math-r03 | Linear equation service and empty constants: E03/E04/E05/E01/E02; positive-zero padding and canonical zero are required. | A lost negative root, nonempty constant result, or noncanonical produced zero. |
| math-r08 | A negative discriminant supplies no exact real root; with a vertex outside the numerical band, E20 and its negative coefficient scaling are empty. | A conjugate coordinate or its real projection is returned as a root. |
| math-r10 | Cubic real-root service covers distinct, repeated, non-monic, and huge roots: E26/E27/E28/E29/E54 and −4 times E26. | Forced three-entry output, missing root, or scale failure. |
| math-r11 | An exactly zero cubic leading term, of either sign, gives the complete reduced result: E15 and its further E03/E02 reductions. | Division by leading zero or an added third entry. |
| math-r12 | Coefficient normalization cannot change caller units or root values: E26 and −4 times E26, plus E54, give their exact table outputs. | A translated or rescaled output root. |
| math-r16 | All actual real companions and zero roots remain available: E26/E29/E30/E52 have the table lists. | A missing companion or phantom zero in E52. |
| math-r18 | Earliest is the minimum eligible value, with no extra positivity restriction: E04/E05/E15/E16/E20 return −2, +0, 1, 2, and absence respectively. | A later root, excluded lo, or lost negative/zero root. |
| math-r19 | Only the occupied bounded prefix influences accessors and access does not mutate storage: a manually supplied length one over [2,−5,7,9] has first 2; length zero is absent; maximum u8 length exposes four slots safely. | Minimum over unused slots, altered storage, or out-of-bounds access. Source: derived: maximum u8 is 2⁸−1. |
| math-r20 | Deterministic binary64 outputs and allocation-free production calls: repeated/interleaved E13/E24/E55/E67 in both profiles and G7 surfaces agree bitwise, with no allocation or panic. | Profile-dependent guard, byte mismatch, or allocation. |
| math-f00 | Copying preserves len and all four t bit patterns; equality compares len and every slot numerically, including unused slots. Changing an unused value breaks equality, changing only a zero sign does not, and a NaN in any slot makes equality false even with a copy; equal infinities compare equal. Witness: manually construct and copy each such value. | Equality ignores unused slots or uses bitwise zero equality; copying loses a bit pattern. |
