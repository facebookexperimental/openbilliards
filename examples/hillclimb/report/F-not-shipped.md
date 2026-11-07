# Appendix F. What does not ship, and why

The release ships the generic framework, the 14.1 configuration, the two learned files with their model
cards, the training code with its data generators, small fresh fixtures, and this report (section 11).
Everything else stays private. The table gives each excluded class and the reason, in general terms.

| What stays private | Why |
|---|---|
| Data we cannot redistribute, and everything fitted on it: for example the upper tiers of the hand ladder, the plausibility audit's reference, the human-level estimates | Fitted on data we cannot redistribute. Results that depend on such data are described in words only; hand-ladder results are printed at the public tiers 0.25x and 0.40x only (appendix D.1) |
| Third-party datasets and tables transcribed from third-party sources | Their redistribution terms are not ours to grant. Sources may be cited; the data do not ship |
| The research hand's speed term, a private research fit | It stays private as a research result; public runs use the hand-noise-law example's published prior instead (section 2.4) |
| Held-out, sealed and reserved seed sets: seed windows, held-out state lists, sealed fields of read files | They keep future reads honest. Publishing a window that is still in use or reserved would end the blind reads that depend on it. Public fixtures use fresh constants |
| The stores of self-play and teacher games, and their samples | They are the private research's working data. Training fixtures are regenerated with the shipped data generators instead |
| The research records: the internal research log, the screening log, the decision log, pre-registration and read pages, audits, internal model cards, plans and design records | They carry internal identifiers and process detail. The report is written fresh from them and cites them by key; the map from each key to its record stays private, for audit |
| Learned files that no current agent uses: retired networks, and two heads that load at start-up but never decide | They are report material, not play inputs. The 9-ball ranker p2rank-v6 is not shipped: its training data stay private with the other self-play and teacher stores, nothing in the released code runs it, and it was built on an older kernel |
| The research code as written: frozen experiment packages and their wiring, operations tooling, run guards | It is bound to the private research environment and pinned to its builds. The release rewrites the methods as plain code instead of copying them |
| The local kernel build and interpreter that produced the records | Unpublished builds. Public users build the public kernel; numbers are not expected to replay bit for bit (section 10) |
| Labels authored by language models in an early data experiment | Not needed by anything that ships |
| Internal identifiers: paths, machine and account names, issue references | They mean nothing outside and are removed |

Two consequences follow for readers. First, some results in sections 6 to 8 are stated in words without
numbers, because their numbers depend on data in the first two rows. Second, the numbers that do appear
are checked against the private records by an independent recount before release; readers can rerun the
methods with the shipped code, but they cannot replay the recorded games (section 10).
