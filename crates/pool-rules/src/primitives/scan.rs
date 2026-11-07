// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! P1 — the single-pass `ShotFacts` extractor (the feature data-model §1): ONE
//! forward pass over `record.events` producing every stream-derived fact
//! the five rulesets consume (FR-008: no second pass). Ordering is by
//! EVENT-STREAM POSITION, never timestamps (frozen `nineball.ts:93–99`
//! convention: the kernel resolves several events at identical `t`;
//! their causal order is the emission order).
//!
//! Facts carried (per-ruleset usage matrix, the feature data-model §2):
//! - P2 first contact: the striker's first `BallBall` (stream index +
//!   other id) and the carom cannon (first contact with a SECOND
//!   distinct object). The striker derives from the record's `Strike`
//!   event when [`ScanConfig::striker_from_strike`] is set (carom);
//!   the pocket games pin the cue at id 0.
//! - P4 rail-after-contact: any pocket/cushion event at a stream index
//!   AFTER the first contact (the fold-vs-split of the no-contact case
//!   is per-ruleset judgment logic, not scan state).
//! - P6 distinct-object-rail count (8-ball dry break, WPA 4.3(d)).
//! - P7 cushion count before second contact (UMB Art 83; same-cushion
//!   repeats count; the count freezes at the cannon).
//! - P8 off-table set (stream order; carom dedupes via
//!   [`ScanConfig::dedup_off_table`]).
//! - P9 cue scratch (striker pocketed OR off table).
//! - P21 head-string facts ([`ScanConfig::head_string_y`], GH-371):
//!   striker path vs the `y = -length/4` plane and contact-time ball
//!   ordinates — the WPA 3.11 "bad play from above the head string"
//!   inputs for the pool rulesets (chord-endpoint sampling of recorded
//!   `post[]` poses, the P10 discipline).
//! - P10 jump-over geometry ([`ScanConfig::jump_over_geometry`], snooker
//!   T032): object balls an airborne cue flight passed over BEFORE its
//!   first ball contact (WPBSA Sec2 R20, strictest mechanical reading),
//!   ported operation-for-operation from the frozen `snooker.ts`
//!   `scanEvents` chord test under the R11 exact-ops discipline — only
//!   `+ - * / sqrt` and comparisons; the TS `Math.hypot(dx, dy)`
//!   comparison is carried as `sqrt(dx*dx + dy*dy)` because `f64::hypot`
//!   has no cross-target correct-rounding guarantee (clippy.toml pin).

use crate::wire::{WireEvent, WireEventKind, WireRecord};

/// First-contact fact: stream index + the other ball id (P2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Contact {
    pub idx: usize,
    pub ball: i64,
}

/// One pocketing: ball id + kernel pocket index, in stream order (the
/// striker/cue is EXCLUDED — it rides `cue_scratch`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pocketing {
    pub ball: i64,
    pub pocket: i64,
}

/// Scan configuration: the per-ruleset variants of the single pass.
#[derive(Debug, Clone, Copy, Default)]
pub struct ScanConfig {
    /// Derive the striker from the record's `Strike` event (carom: each
    /// player owns a cue ball). The pocket games leave this false — the
    /// cue is id 0 (their frozen TS scans hardcode it).
    pub striker_from_strike: bool,
    /// Deduplicate the off-table list (carom Art 41.1 convention).
    pub dedup_off_table: bool,
    /// The striker itself joins the off-table list instead of scoring a
    /// cue scratch (carom: no scratch concept — a jumped cue ball
    /// respots like any ball concerned, Art 28.1(b)).
    pub off_table_includes_striker: bool,
    /// Run the P10 jump-over chord test (snooker Sec2 R20): track the
    /// cue's recorded `post[]` poses until its first ball contact and
    /// collect the object balls any airborne chord passed over. The cue
    /// is pinned at id 0 (the frozen TS scan hardcodes it).
    pub jump_over_geometry: bool,
    /// P21 (GH-371, WPA 3.11): `Some(y)` = the head-string plane in the
    /// kernel frame (`-length/4`; the kitchen is STRICTLY `y < value` —
    /// a ball resting ON the string is playable per WPA 1.6, so on-line
    /// counts as past the line). Enables the head-string facts below for
    /// the pool rulesets; `None` (default) disables — non-pool scans and
    /// dimension-less records (the lenient-wire fallback, the 7.8 zone
    /// precedent). Pose sampling is the recorded-`post[]` chord
    /// discipline (the frozen P10 convention): endpoints of straight
    /// chords between the striker's recorded poses — the strictest
    /// mechanical reading derivable from the record.
    pub head_string_y: Option<f64>,
}

/// Everything the judges read from the event stream (P1–P9 facts).
#[derive(Debug, Clone, Default)]
pub struct ShotFacts {
    /// The striker ball id (0 unless [`ScanConfig::striker_from_strike`]).
    pub struck: i64,
    /// Striker's first ball-ball contact (P2).
    pub first_contact: Option<Contact>,
    /// The striker contacted a SECOND distinct object ball (carom cannon).
    pub cannon: bool,
    /// Striker cushion contacts BEFORE the second-object contact (P7;
    /// all of them when no cannon happened; repeats count).
    pub cushions_before_second: i64,
    /// Object balls pocketed, in pocketing order, striker excluded (P5
    /// input).
    pub pocketed: Vec<Pocketing>,
    /// The striker was pocketed or driven off the table (P9).
    pub cue_scratch: bool,
    /// Any ball reached a pocket or cushion AFTER first contact (P4).
    pub driven_after_contact: bool,
    /// Distinct non-striker balls that contacted a cushion (P6).
    pub object_rail_count: i64,
    /// The distinct non-striker ball ids behind [`object_rail_count`], in
    /// first-contact stream order (feature 14.1 additive fact — the WPA
    /// 7.3(b) opening-break requirement unions this set with the pocketed
    /// and off-table sets, because a pocketed/jumped ball also counts as
    /// driven to a rail under WPA 2.7). Internal only: `ShotFacts` never
    /// crosses the wire, so the field has zero corpus impact.
    pub object_rail_ids: Vec<i64>,
    /// The striker contacted a cushion AFTER its first ball contact
    /// (feature 14.1 additive fact: the WPA 7.3(b) "cue-ball … driven to
    /// a rail after the cue-ball contacts the rack" half; P7's
    /// `cushions_before_second` freezes at the cannon and counts
    /// PRE-contact cushions, so it cannot serve). Stream-position
    /// ordering, like every other before/after fact.
    pub striker_rail_after_contact: bool,
    /// Non-striker balls driven off the table, stream order (P8).
    pub off_table: Vec<i64>,
    /// Object balls an airborne cue flight passed over before first
    /// contact (P10 — [`ScanConfig::jump_over_geometry`], snooker).
    pub jumped_over: Vec<i64>,
    /// P21 (WPA 3.11 ¶1): the striker's centre reached the head-string
    /// plane (`y >= head_string_y`) on some recorded pose up to and
    /// including its first ball contact — "the cue ball crosses the head
    /// string before the contact". Only meaningful under
    /// [`ScanConfig::head_string_y`]; internal only (`ShotFacts` never
    /// crosses the wire — zero corpus impact, the feature-025 additive
    /// precedent).
    pub cue_crossed_head_string_before_contact: bool,
    /// P21 (WPA 3.11 ¶2): the striker's centre reached the head-string
    /// plane at ANY recorded pose of the stroke.
    pub cue_crossed_head_string: bool,
    /// P21 (WPA 3.11 ¶2): the striker contacted a ball whose centre was
    /// on/past the head string (`y >= head_string_y`) at contact time —
    /// "contact a ball in front of or on the head string". Contact-time
    /// positions fold the initial snapshot through each event's `post[]`
    /// poses (the 7.8 `final_positions` discipline).
    pub cue_contacted_ball_past_head_string: bool,
    /// P21 (WPA 3.11 ¶1): the striker's FIRST ball contact was with a
    /// ball strictly behind the head string (in the kitchen) at contact
    /// time. `false` when there was no contact or tracking is off.
    pub first_contact_in_kitchen: bool,
}

/// P10 state — the cue-flight chord tracker (snooker `scanEvents`,
/// ported verbatim). The pre-contact object positions ARE the initial
/// snapshot: nothing but the cue moves before the cue's first ball
/// contact (kernel causality).
struct JumpTracker {
    /// Initial object footprints `(id, x, y, r)` (cue id 0 excluded).
    objects: Vec<(i64, f64, f64, f64)>,
    r_cue: f64,
    cue_prev: Option<(f64, f64)>,
    airborne: bool,
}

impl JumpTracker {
    fn new(record: &WireRecord) -> JumpTracker {
        let objects = record
            .initial
            .balls
            .iter()
            .filter(|b| b.id != 0)
            .map(|b| (b.id, b.state.pos.x, b.state.pos.y, b.params.r))
            .collect();
        let cue = record.initial.balls.iter().find(|b| b.id == 0);
        JumpTracker {
            objects,
            // the TS `cueBall?.params.r ?? 0.02625` fallback, verbatim
            r_cue: cue.map_or(0.02625, |b| b.params.r),
            cue_prev: cue.map(|b| (b.state.pos.x, b.state.pos.y)),
            airborne: false,
        }
    }

    /// Feed one event's `post[]` cue pose (called while tracking is
    /// live: no first contact yet, or exactly the first-contact event —
    /// the TS loop runs its pose block AFTER the kind dispatch, so the
    /// contact event's own pose still lands).
    ///
    /// `exclude` (issue #211) is the cue's first-contact ball on the
    /// CONTACT chord; [`Self::flight_covers`] drops it only when it sits at
    /// or beyond the chord end (a near-side strike whose 2-D projection
    /// dips under the contact distance), never when the flight passed over
    /// it. Prior chords are unaffected, so a genuine earlier flight over
    /// the same ball (cue clears it, then cushions back into it) is still
    /// detected.
    fn feed(
        &mut self,
        ev: &WireEvent,
        jumped_over: &mut Vec<i64>,
        exclude: Option<i64>,
    ) {
        let Some((_, s)) = ev.post.iter().find(|(id, _)| *id == 0) else {
            return;
        };
        let cur = (s.pos.x, s.pos.y);
        // the chord counts when the cue was airborne at its START
        // (motion state left by the PREVIOUS event), the TS order
        if self.airborne {
            if let Some(prev) = self.cue_prev {
                self.flight_covers(prev, cur, jumped_over, exclude);
            }
        }
        self.airborne = s.motion == "Airborne";
        self.cue_prev = Some(cur);
    }

    /// Chord (a→b) passes within `r_cue + r_obj` of an object centre
    /// (exact ops only — research R11). `exclude` is the cue's first-contact
    /// ball on the CONTACT chord: it is dropped only when it sits at or
    /// beyond the chord end (a near-side strike — issue #211), never when
    /// the flight genuinely passed over it.
    fn flight_covers(
        &self,
        (ax, ay): (f64, f64),
        (bx, by): (f64, f64),
        jumped_over: &mut Vec<i64>,
        exclude: Option<i64>,
    ) {
        let abx = bx - ax;
        let aby = by - ay;
        let len2 = abx * abx + aby * aby;
        for (id, ox, oy, r) in &self.objects {
            // Unclamped projection of the object centre onto the chord: the
            // fraction of a→b at which the cue passes closest to it.
            let u = if len2 > 0.0 {
                ((ox - ax) * abx + (oy - ay) * aby) / len2
            } else {
                1.0
            };
            // Issue #211: on the chord ENDING at the cue's first contact
            // (`exclude` = that ball), a ball at or BEYOND the chord end
            // (u >= 1) is a near-side STRIKE — the cue stopped at its
            // surface and the 2-D projection of the 3-D contact distance
            // only DIPS under r_cue+r_obj because of a sub-mm micro-hop.
            // That is not a jump-OVER. A ball whose foot lies WITHIN the
            // chord (u < 1) was genuinely passed over in flight (2-D overlap
            // with no kernel contact ⇒ the cue cleared it in z), even when
            // the cue then descends onto its far side to first-contact it —
            // still a jump foul, so it is kept.
            if exclude == Some(*id) && u >= 1.0 {
                continue;
            }
            let t = u.clamp(0.0, 1.0);
            let dx = ox - (ax + t * abx);
            let dy = oy - (ay + t * aby);
            if (dx * dx + dy * dy).sqrt() < self.r_cue + r
                && !jumped_over.contains(id)
            {
                jumped_over.push(*id);
            }
        }
    }
}

/// P21 state — the head-string tracker (WPA 3.11, GH-371): last-known
/// ball ordinates (the initial snapshot folded through each event's
/// `post[]` poses, the 7.8 `final_positions` discipline) plus the
/// running maximum of the striker's recorded `y`. Pose updates run
/// BEFORE the event's kind dispatch so a `BallBall` reads contact-time
/// positions and the striker's own contact pose joins the before-contact
/// window (the frozen P10 "first-contact event's own pose included"
/// convention).
struct HeadStringTracker {
    /// The head-string plane (kernel frame, `-length/4`).
    hs: f64,
    /// Last-known `(id, y)` per ball.
    ys: Vec<(i64, f64)>,
    /// Running max of the striker's recorded pose `y`.
    max_striker_y: f64,
}

impl HeadStringTracker {
    fn new(record: &WireRecord, hs: f64, struck: i64) -> HeadStringTracker {
        let ys: Vec<(i64, f64)> = record
            .initial
            .balls
            .iter()
            .map(|b| (b.id, b.state.pos.y))
            .collect();
        let max_striker_y = ys
            .iter()
            .find(|(id, _)| *id == struck)
            .map_or(f64::NEG_INFINITY, |(_, y)| *y);
        HeadStringTracker { hs, ys, max_striker_y }
    }

    /// Fold one event's `post[]` poses (called before the kind dispatch).
    fn fold(&mut self, ev: &WireEvent, struck: i64) {
        for (id, s) in &ev.post {
            if let Some(p) = self.ys.iter_mut().find(|(pid, _)| *pid == *id) {
                p.1 = s.pos.y;
            } else {
                self.ys.push((*id, s.pos.y));
            }
            if *id == struck && s.pos.y > self.max_striker_y {
                self.max_striker_y = s.pos.y;
            }
        }
    }

    /// Last-known ordinate of `id` (contact-time under the fold order).
    fn y(&self, id: i64) -> Option<f64> {
        self.ys.iter().find(|(pid, _)| *pid == id).map(|(_, y)| *y)
    }
}

/// The single O(events) forward pass (FR-008).
pub fn scan(record: &WireRecord, cfg: &ScanConfig) -> ShotFacts {
    let mut facts = ShotFacts::default();
    let mut rail_balls: Vec<i64> = Vec::new();
    let mut jump = if cfg.jump_over_geometry {
        Some(JumpTracker::new(record))
    } else {
        None
    };
    // P21: the head-string games pin the striker at id 0 (the
    // `striker_from_strike` carom variant never sets `head_string_y`).
    let mut head = cfg
        .head_string_y
        .map(|hs| HeadStringTracker::new(record, hs, facts.struck));

    for (idx, ev) in record.events.iter().enumerate() {
        // P21 pose fold runs BEFORE the kind dispatch (contact-time
        // positions; the striker's contact pose joins the window).
        if let Some(tracker) = head.as_mut() {
            tracker.fold(ev, facts.struck);
        }
        match &ev.kind {
            WireEventKind::Rest
            | WireEventKind::BallTable { .. }
            | WireEventKind::Transition { .. } => {}
            WireEventKind::Strike { ball } => {
                if cfg.striker_from_strike && facts.first_contact.is_none() {
                    facts.struck = *ball;
                }
            }
            WireEventKind::BallBall { b1, b2 } => {
                let s = facts.struck;
                if *b1 == s || *b2 == s {
                    let other = if *b1 == s { *b2 } else { *b1 };
                    // P21 contact tests read the folded contact-time
                    // ordinate of the OTHER ball (on-line counts as past
                    // the line — WPA 1.6 "resting on the Head String is
                    // playable").
                    if let Some(tracker) = head.as_ref() {
                        if let Some(oy) = tracker.y(other) {
                            if oy >= tracker.hs {
                                facts.cue_contacted_ball_past_head_string =
                                    true;
                            }
                            if facts.first_contact.is_none() {
                                facts.first_contact_in_kitchen =
                                    oy < tracker.hs;
                                facts
                                    .cue_crossed_head_string_before_contact =
                                    tracker.max_striker_y >= tracker.hs;
                            }
                        }
                    }
                    match facts.first_contact {
                        None => facts.first_contact =
                            Some(Contact { idx, ball: other }),
                        Some(fc) if !facts.cannon && other != fc.ball => {
                            // the SECOND distinct object: the P7 cushion
                            // count freezes here (Art 83, stream position)
                            facts.cannon = true;
                        }
                        _ => {}
                    }
                }
            }
            WireEventKind::BallPocket { ball, pocket } => {
                if *ball == facts.struck {
                    facts.cue_scratch = true;
                } else {
                    facts.pocketed.push(
                        Pocketing { ball: *ball, pocket: *pocket });
                }
                if let Some(fc) = facts.first_contact {
                    if idx > fc.idx {
                        facts.driven_after_contact = true;
                    }
                }
            }
            WireEventKind::BallLinearCushion { ball }
            | WireEventKind::BallCircularCushion { ball } => {
                if *ball != facts.struck && !rail_balls.contains(ball) {
                    rail_balls.push(*ball);
                }
                if *ball == facts.struck && !facts.cannon {
                    facts.cushions_before_second += 1;
                }
                if let Some(fc) = facts.first_contact {
                    if idx > fc.idx {
                        facts.driven_after_contact = true;
                        if *ball == facts.struck {
                            facts.striker_rail_after_contact = true;
                        }
                    }
                }
            }
            WireEventKind::BallOffTable { ball } => {
                if *ball == facts.struck && !cfg.off_table_includes_striker {
                    facts.cue_scratch = true;
                } else if !cfg.dedup_off_table
                    || !facts.off_table.contains(ball)
                {
                    facts.off_table.push(*ball);
                }
            }
        }
        // P10: track the cue's recorded poses until its first ball
        // contact — the first-contact event's own pose included (the
        // frozen TS `firstContact.idx === idx` window).
        //
        // WPBSA Sec2 R20 exempts the ball the cue actually STRIKES first: a
        // ball at first contact was hit, not "passed over BEFORE first
        // contact". The chord that ENDS at that contact necessarily grazes
        // the struck ball's footprint, and when the cue is even slightly
        // airborne at contact — a normal low-elevation micro-hop leaves the
        // kernel motion state "Airborne" for a sub-millimetre rise — the
        // chord's 2-D (x,y) projection of the exact 3-D contact distance
        // (r_cue + r_obj) dips just under the r_cue + r_obj threshold, so
        // `flight_covers` would otherwise report a jump-OVER of the very
        // ball being struck (issue #211: three consecutive snooker shots
        // that legally struck-and-potted the ball on — a black then two
        // reds — were each mis-fouled `jump-over` on their own first-contact
        // ball). The exclusion is handed to the CONTACT chord only, and
        // there [`JumpTracker::flight_covers`] drops it solely for a
        // near-side strike (the ball at/beyond the chord end); a genuine
        // pass-over of that same ball is kept.
        if let Some(tracker) = jump.as_mut() {
            let (live, exclude) = match facts.first_contact {
                None => (true, None),
                Some(fc) if fc.idx == idx => (true, Some(fc.ball)),
                Some(_) => (false, None),
            };
            if live {
                tracker.feed(ev, &mut facts.jumped_over, exclude);
            }
        }
    }
    facts.object_rail_count = rail_balls.len() as i64;
    facts.object_rail_ids = rail_balls;
    // P21: whole-stroke crossing (WPA 3.11 ¶2 "cross the head string").
    if let Some(tracker) = head.as_ref() {
        facts.cue_crossed_head_string = tracker.max_striker_y >= tracker.hs;
    }
    facts
}

impl ShotFacts {
    /// Object-ball ids pocketed, pocketing order (the P5 any-pocket
    /// classifier's identity projection).
    pub fn pocketed_ids(&self) -> Vec<i64> {
        self.pocketed.iter().map(|p| p.ball).collect()
    }
}
