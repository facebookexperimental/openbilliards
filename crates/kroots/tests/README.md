The integration tests use the frozen public API. `contracts.rs` checks all 99
spec examples (123 expanded windows/inputs), all development vectors, accessors,
and behavior witnesses. `properties.rs` checks exact scaling, independent calls,
linear rounding/windows, NaN payloads, and shadow scaling. `resources.rs` checks
production allocations; `traces.rs` checks feature-gated recording and limits.

The two original vector packs are in `data/`. Their authoritative hexadecimal
coefficients and rounded roots are decoded bitwise. The normative spec supersedes
the schemas' older ambiguity and relative-error language: these tests require
exact output bits even for ambiguous cases. Both complete and earliest calls are
checked. `TEST-MAP.md` maps all 44 behavior clauses to their witnesses.
