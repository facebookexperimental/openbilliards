# Climbing a billiards agent in simulation: what we tried, what worked, what did not

A research report on four months (July to October 2026) of hill-climbing the strength of a
straight-pool (14.1) agent inside the openbilliards physics kernel: the target, the testbed, the
measurement, the method, the agent, every adopted step and every major kill, the actuation-envelope
finding that reset the climb, and the lessons we would pass on. It is written for researchers who want
to climb a target of their own with the framework this report accompanies.

**Status.** The project's hard target (E[L] about 200 balls with P(L ≥ 45) ≥ 0.80
at noise 0.1x) is not met inside the actuation envelope (internal decision log, line 624). The presented
result is 193.00 balls [v3] for the in-envelope agent R1 with a give-up fix, against 138.50 [v3] for R1
on the same games, labelled nominal-leave and not adopted (internal research log, row 598); under the
v2 caps, on other games, the figure stays 178.36 [v2] against 148.59 [v2] (row 585). Results
from before the envelope was enforced, among them a certified 263.8† at 0.10x (row 543), are reported
beside it with the marker †.

**Start with [section 0](00-abstract.md)**: the abstract, the key results and a reading guide.

## Contents

| File | Section |
|---|---|
| [00-abstract.md](00-abstract.md) | 0. Abstract, key results and reading guide |
| [01-goal.md](01-goal.md) | 1. Goal and status: general play, why 14.1 run length, the hard target, why it is open |
| [02-testbed.md](02-testbed.md) | 2. Testbed: the kernel build, the 14.1 rules, execution noise, the hand ladder, the actuation envelope |
| [03-measurement.md](03-measurement.md) | 3. Measurement: estimators, the CMC form, paired comparisons, certificates, read-once rules |
| [04-how-we-worked.md](04-how-we-worked.md) | 4. How we worked: registration, screens, matched compute, kill rules, audits |
| [05-the-agent.md](05-the-agent.md) | 5. The agent: candidates, the leave surface (the height map), the layers, the two learned files, cost |
| [06-the-climb.md](06-the-climb.md) | 6. The climb, step by step, with the climb table (Table 6.1) and the noise ladder (Table 6.2) |
| [07-envelope-and-restart.md](07-envelope-and-restart.md) | 7. The envelope finding and the in-envelope restart, with Table 7.1 |
| [08-worked-and-not.md](08-worked-and-not.md) | 8. What worked and what did not: levers, negatives, every learning attempt |
| [09-lessons.md](09-lessons.md) | 9. Lessons that transfer |
| [10-limitations.md](10-limitations.md) | 10. Limitations and provenance |
| [11-your-target.md](11-your-target.md) | 11. Using the framework on your own target, with a one-page pre-registration |
| [C-certificates.md](C-certificates.md) | Appendix C. The certificate and CMC method, with a worked example |
| [D-noise-ladder.md](D-noise-ladder.md) | Appendix D. The noise and hand ladders: the hand ladder at its public tiers, plain-form readings, non-certifying reads |
| [E-glossary.md](E-glossary.md) | Appendix E. Glossary of research labels |
| [F-not-shipped.md](F-not-shipped.md) | Appendix F. What does not ship, and why |
| [climb-table.csv](climb-table.csv) | The climb and chain rows of Tables 6.1, 6.2 and 7.1 as data |

## How keys work

Every number carries a key to the private record it comes from.

- **(internal research log, row N)** is a row of the project's append-only research log, one row per
  registered read, decision or finding. After its first use in a section it is written "(row N)", and
  in tables "row N".
- **(internal decision log, line N)** is a dated line of the decision log, where decisions,
  registrations and adoptions are recorded; shortened to "(decision log, line N)".
- **(internal screening log, line N)** is a line of the log of fast exploratory screens.
- Other private records are named by kind, for example "internal method note on the CMC design" or
  "internal registration of envelope v1".
- One count, the height-map census of section 5.2, was made for this report from stored decision logs,
  with no new games; it is keyed to the games it counted.

The records stay private, because they carry internal identifiers, process detail and data we cannot
redistribute (appendix F). The map from each key to its record is kept for audit, and every number is
checked against the records by an independent recount before release.

## Status labels

- **[v1], [v2], [v3]**: an in-envelope number and the actuation-envelope version it was measured under
  (v1 caps the commanded cue speed v0 at 12 m/s; v2 raises the cap to 13.4 m/s at a break shot; v3
  keeps v2 and caps the cue ball's launch speed at a break shot at 13.4112 m/s, 30 mph, by the kernel's
  strike law; sections 2.5 and 7.4). Results under different versions are compared only side by side.
- **†**: a number not verified inside the envelope: every 14.1 number before the in-envelope restart
  (research log row 563) other than the hand-ladder read (row 562), and every 9-ball number. It is
  reported beside the in-envelope numbers and never used to argue for adoption.
- **Decision words** in capitals (CERTIFIED, FALSIFIED, ADOPT, IN-ENVELOPE-GAIN, OPEN and so on) were
  registered before each experiment ran, exploratory readings excepted and marked as such, and are
  printed as filed. A word holds for one composition at one noise level; compositions are never pooled,
  and step gains are never summed.
- **Nominal-leave**: the label on a read whose leave term scores the position a perfectly executed
  stroke would leave (section 7.3).
- **UNVERIFIED**: a fact the records do not settle.

## Cut-off and build

The report covers the records to 31 October 2026: research log row 586 and decision log line 877, plus four later records it cites (the height-map census, decision log line 882, the cue-speed disclosure of 1 November 2026, line 902, the cap replay of the same day with the decision on it, lines 927, 934-935, and the re-measure under envelope v3 of 3 November 2026, research log row 598 with decision log lines 1032, 1034). Work
still running then is not reported; its results, once read, belong in a revision under the same review.
Every number from 23 July 2026 on comes from one kernel build, 0.1.0+64e9e7a3 (July 2026), and the 14.1
work ran under CPython 3.12 (sections 10.2, 10.3); the earlier 9-ball numbers came from older builds, and the late reads
that print no version (rows 543, 563, 571, 585, 598) are UNVERIFIED as a per-run stamp (section 10.2). The
public kernel has changed since, so the recorded games and numbers are not expected
to reproduce bit for bit (section 10).

## The climb table as data

`climb-table.csv` holds the rows of Tables 6.1, 6.2 and 7.1 in a fixed set of fields: key, date, point
estimate, interval ends, n, estimator class, envelope status, the noise level as a multiple of the
icga-v1 convention, and registration: empty unless the report marks the row's reading, word or key
with ‡, and otherwise the reason appendix E gives for the mark (exploratory, or unregistered fast-track
screen). A row with no estimate (a law, a decision or a withheld value) leaves the number fields empty.
