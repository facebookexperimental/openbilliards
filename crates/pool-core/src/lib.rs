// Copyright (c) Meta Platforms, Inc. and affiliates.

//! # pool-core — event-driven analytic billiards physics kernel
//!
//! Closed-form ball motion between events; event times from ≤ quartic
//! polynomial roots; deterministic event loop with collision caching; batch
//! sampling for renderers; versioned shot records.
//!
//! Contract: `the kernel-api contract (feature 001, internal)` (FROZEN
//! during parallel implementation — module ownership map M1–M11).
//! Constitution: the project's design principles (no general-purpose
//! physics engines; determinism via `libm`-only transcendentals and seeded
//! PCG32; oracle-tested realism against pooltool and published anchors).
//!
//! Conventions: SI units (m, s, kg, rad), f64 everywhere, z-up, table plane
//! z = 0, origin at table center, +y toward the foot (rack) end. Angular
//! velocity in the world frame. The std f64 transcendental methods (sin,
//! cos, sqrt, powf, ...) are FORBIDDEN in this crate (CI grep gate) — call
//! the equivalent `libm` functions instead.

pub mod catalog;
pub mod consts;
pub mod cue_clearance;
pub mod events;
pub mod evolve;
pub mod math;
pub mod params;
pub mod rack;
pub mod record;
pub mod resolve;
pub mod sample;
pub mod shot;
pub mod sim;
pub mod state;
pub mod table;
pub mod types;

pub use catalog::{
    Calibration, EquipmentCatalog, EquipmentSpec, MeasuredParam, ResolvedEquipment,
    CATALOG_VERSION,
};
pub use consts::{Eps, G, KERNEL_VERSION};
pub use cue_clearance::{
    min_elevation_deg, shot_min_elevation_deg, shot_min_elevation_deg_for,
    validate_shot_geometry, validate_shot_geometry_for, CueGeometry,
};
pub use events::{Event, EventKind};
pub use evolve::PosPoly;
pub use params::{
    BallBallFriction, BallParams, ClothPreset, CueParams, CushionFriction, CushionResponse,
};
pub use record::{BallSample, ShotRecord, FORMAT_VERSION};
pub use sample::{orientation_at, Sampler};
pub use shot::{ShotParams, SimError, SimOptions};
pub use sim::event_loop::simulate;
pub use state::{Ball, BallState, MotionState, SystemState};
pub use table::{ArcSpan, CircularCushionSegment, LinearCushionSegment, Pocket, Table};
pub use types::{BallId, Quat, Vec3};
