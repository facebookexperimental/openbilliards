// Copyright (c) Meta Platforms, Inc. and affiliates.

// SPDX-License-Identifier: MIT
//! Ruleset implementations (feature 013 ports, research R10 order:
//! nineball → carom3c → onepocket → eightball → snooker) + the registry
//! dispatching the five frozen ids. Each ruleset is a field-for-field
//! port of the shipped TS module, composed from [`crate::primitives`] —
//! the harvested byte oracle (scripts/fixtures/rules-corpus.json) pins
//! every output byte.

pub mod carom3c;
pub mod carom3c_v2;
pub mod eightball;
pub mod eightball_v2;
pub mod fourteenone;
pub mod heyball;
pub mod nineball;
pub mod onepocket;
pub mod registry;
pub mod snooker;
pub mod snooker_v2;
pub mod tenball;
