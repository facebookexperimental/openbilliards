// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Seeded RNG (M7), the adapter from the detection call sites to the
//! real-root service (`kroots`), and the certified geometric refinement of
//! cushion contact times (`refine`, K-fix F2/F3).

pub(crate) mod refine;
pub(crate) mod roots_adapter;
pub mod rng;

pub use rng::Pcg32;
