// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Event resolvers: strike (M4), ball–ball (M5), cushion (M6 Han 2005 +
//! feature-002 Stronge compliant + Amendment-005 Mathavan 2010 dual-contact),
//! cluster (M7), pocket + transition (trunk-owned, trivial).

pub mod ball_ball;
pub mod ball_table;
pub mod cluster;
pub mod cluster_compliant;
pub mod cushion;
pub mod cushion_airborne;
pub mod cushion_mathavan;
pub mod cushion_stronge;
pub mod pocket;
pub mod strike;
pub mod transition;
