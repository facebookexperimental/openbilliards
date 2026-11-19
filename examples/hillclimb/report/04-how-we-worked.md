# 4. How we worked

Much of what we learned is about method, so this section describes how the work was run. From July to
October 2026 the research was a sequence of registered experiments, each recorded once in an
append-only research log (internal research log, rows 1-586). † marks numbers not verified inside the
actuation envelope (section 0).

## 4.1 Register first, read once

Every experiment, exploratory readings excepted and marked as such, began as a page committed before
its first game: the question, the two arms, the
estimand and estimator, the noise level and envelope version, the number of games and any interim
looks, the decision words with their thresholds, the void conditions checked before any word, the
compute line and a cost cap. A power line came first; from late September a confirmatory block
registered only if its probability of PASS or HELD at the planned size was at least one half
(internal decision log, line 32). The
results field stayed empty until the one read, which ran once in its own process and wrote its file
once; a second read refused (rows 563, 585). A changed design was a new registration, never an edit,
and log entries were superseded in the open, never rewritten (internal research log, maintenance law
of 2026-07-23).

Interim looks happened only where registered: the block behind coverage stack v4 (the agent of record
before the envelope finding; section 5) took two registered looks that did not stop it, then read once
at 300 game pairs (row 450). The later reads were filed only when an independent verifier, writing
fresh code from the registered text and importing nothing from the experiment, had recounted them equal
(rows 450, 563, 585); some September reads were filed with the verifier pending.
Negative results were kept with the same care as positive ones (section 8).

## 4.2 Screen, then confirm

Most ideas were first screened cheaply: a short pre-registration, 40 to 80 game pairs sharing their
random numbers with the base arm, one change at matched compute, and words fixed in advance. Eight
such screens ran in about 14 hours (row 175). A screen was information, never a claim (section 6.4
discloses S6-PRIME, adopted from a screen); one that read well earned a registered confirmation on
fresh games. The combination of the C2 ordering and the
fold-selected break (section 5) shows the pattern: a screen read +8.91† [+2.04, +15.78] balls (row
243); a registered two-look test reached its adoption word at +12.52† [+7.55, +17.49] over 160 pairs
(row 252); a confirmation block on fresh seeds then read +7.25† [+2.13, +12.37] but failed its
pre-declared level clause, so nothing was adopted (row 255).

## 4.3 Matched compute and reversal controls

Search buys strength with simulations, so a lever that adds simulations can look good for the wrong
reason. Every comparison reported its compute, on one unified counter after the external review (row
86). When compute could not be matched, the adoption stated the compute ratio and an extrapolated
bonus for the extra compute, required the lower bound to clear that bonus, and owed a reversal control
at matched compute, declared in advance with a hard deadline (row 186). The controls (unregistered
fast-track screens) did real work: one confirmed its substrate (row 187), one shrank a gain sharply
(rows 205, 208), and one reversed an adoption outright (row 215); section 9, lesson 6, gives the
numbers.

## 4.4 Kill rules and the do-not-repeat list

Each phase wrote its stopping rule before it began and executed it mechanically: Phase 2 closed when
its kill row tripped (registration order not on record; row 21), Phase 3 when its two-generation rule
tripped (row 30); a specialist
ranker got exactly one generation (row 50), and a frontier batch closed with no acceptance and no
recommendation (row 68). Every dead path entered a do-not-repeat list with the experiment that killed
it and the evidence needed to reopen it, consulted before any new registration (internal research
log, do-not-repeat list).

## 4.5 Audits and external review

From 27 August an audit ran every 12 hours. It read the whole state without changing it, through three
lenses (return on compute, philosophy of science, current practice in reinforcement learning), and
issued ranked adjustments with deadlines; about 120 had run by the cut-off (rows 130, 585). The first
found drift: for about a week the work had refined its instruments and produced no new counted reading
(row 129). A census answering a question from the project lead found the largest problem of all, the
unenforced actuation envelope (row 546; section 7). Separately, one independent external review of the
rebuild's first headlines narrowed or replaced four of them and produced the unified compute counter
(row 86).

## 4.6 The minimal-scope turn

The method's failure mode was excess, not laxity. In late July one pre-registration went through six
review rounds with nothing measured; the defect counts ran 7, 6, 10, 9, 9 and 9, and four times in a
row the fix for one defect created the next of the same class. The rule that ended it: when checks
breed checks, cut what is published instead of adding a checking layer (internal research log, Phase 4
narrative of 2026-07-29). In August nine successive adoption exams of the simulation-refined executor
produced no usable verdict, almost always because of defects in their own record-keeping machinery,
while the effects they read stayed positive, +0.16† to +0.28† on their paired scale (rows 96-123).
Standing rules that the project lead set on 27 August, together with the audits, capped the process:
about two review rounds for confirmatory work; fix an instrument finding only if it could corrupt an
honest run, and otherwise disclose it; spend compute on search and new mechanisms (row 129). By late
October each record took one writer and one independent verifier and no further round (row 581).

## 4.7 Who decides

The target, its unit of record and the envelope are set by the project lead; the research team
recommends and records. Decisions were recorded with their date and exact scope. When new evidence
undercut a decision, both the decision and its reopening stayed on the record: the hard target,
declared achieved on 24 October on a certificate later found to be out of envelope (row 545), was
reopened as not met in-envelope on 26 October (decision log, line 624).
