// Copyright (c) Meta Platforms, Inc. and affiliates.

//! Core math value types: [`Vec3`], [`Quat`], [`BallId`].
//!
//! Frozen by the kernel API contract (trunk-owned).
//! Conventions: SI units, f64, z-up, table plane z = 0, origin at table center,
//! +y toward the foot (rack) end. All transcendentals via `libm`.

use serde::{Deserialize, Serialize};
use std::ops::{Add, Mul, Neg, Sub};

/// 3-component f64 vector (SI units, world frame, z-up).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    /// The zero vector.
    pub const ZERO: Vec3 = Vec3 {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    /// Construct from components.
    pub const fn new(x: f64, y: f64, z: f64) -> Vec3 {
        Vec3 { x, y, z }
    }

    /// Dot product.
    pub fn dot(self, rhs: Vec3) -> f64 {
        self.x * rhs.x + self.y * rhs.y + self.z * rhs.z
    }

    /// Cross product (right-handed).
    pub fn cross(self, rhs: Vec3) -> Vec3 {
        Vec3 {
            x: self.y * rhs.z - self.z * rhs.y,
            y: self.z * rhs.x - self.x * rhs.z,
            z: self.x * rhs.y - self.y * rhs.x,
        }
    }

    /// Squared Euclidean norm.
    pub fn norm_sq(self) -> f64 {
        self.dot(self)
    }

    /// Euclidean norm (via `libm::sqrt`).
    pub fn norm(self) -> f64 {
        libm::sqrt(self.norm_sq())
    }

    /// Unit vector in the same direction. Returns [`Vec3::ZERO`] for the zero
    /// vector (documented convention; callers must guard where it matters).
    pub fn normalized(self) -> Vec3 {
        let n = self.norm();
        if n == 0.0 {
            Vec3::ZERO
        } else {
            self * (1.0 / n)
        }
    }

    /// The (x, y) components as a tuple.
    pub fn xy(self) -> (f64, f64) {
        (self.x, self.y)
    }

    /// True iff all components are finite (no NaN / infinity).
    pub fn is_finite(self) -> bool {
        self.x.is_finite() && self.y.is_finite() && self.z.is_finite()
    }
}

impl Add for Vec3 {
    type Output = Vec3;
    fn add(self, rhs: Vec3) -> Vec3 {
        Vec3 {
            x: self.x + rhs.x,
            y: self.y + rhs.y,
            z: self.z + rhs.z,
        }
    }
}

impl Sub for Vec3 {
    type Output = Vec3;
    fn sub(self, rhs: Vec3) -> Vec3 {
        Vec3 {
            x: self.x - rhs.x,
            y: self.y - rhs.y,
            z: self.z - rhs.z,
        }
    }
}

impl Mul<f64> for Vec3 {
    type Output = Vec3;
    fn mul(self, rhs: f64) -> Vec3 {
        Vec3 {
            x: self.x * rhs,
            y: self.y * rhs,
            z: self.z * rhs,
        }
    }
}

impl Neg for Vec3 {
    type Output = Vec3;
    fn neg(self) -> Vec3 {
        Vec3 {
            x: -self.x,
            y: -self.y,
            z: -self.z,
        }
    }
}

/// Unit quaternion for ball orientation (render-only in v1; see contract §M8).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Quat {
    pub w: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Quat {
    /// The identity rotation.
    pub const IDENTITY: Quat = Quat {
        w: 1.0,
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    /// Rotation of `angle` radians about `axis` (axis is normalized internally;
    /// a zero axis yields the identity).
    pub fn from_axis_angle(axis: Vec3, angle: f64) -> Quat {
        let a = axis.normalized();
        if a == Vec3::ZERO {
            return Quat::IDENTITY;
        }
        let half = 0.5 * angle;
        let s = libm::sin(half);
        Quat {
            w: libm::cos(half),
            x: a.x * s,
            y: a.y * s,
            z: a.z * s,
        }
    }

    /// Unit quaternion in the same direction. Returns [`Quat::IDENTITY`] for a
    /// zero quaternion.
    pub fn normalized(self) -> Quat {
        let n = libm::sqrt(self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z);
        if n == 0.0 {
            return Quat::IDENTITY;
        }
        let inv = 1.0 / n;
        Quat {
            w: self.w * inv,
            x: self.x * inv,
            y: self.y * inv,
            z: self.z * inv,
        }
    }
}

impl Mul for Quat {
    type Output = Quat;
    /// Hamilton product (`self` applied after `rhs`).
    fn mul(self, rhs: Quat) -> Quat {
        Quat {
            w: self.w * rhs.w - self.x * rhs.x - self.y * rhs.y - self.z * rhs.z,
            x: self.w * rhs.x + self.x * rhs.w + self.y * rhs.z - self.z * rhs.y,
            y: self.w * rhs.y - self.x * rhs.z + self.y * rhs.w + self.z * rhs.x,
            z: self.w * rhs.z + self.x * rhs.y - self.y * rhs.x + self.z * rhs.w,
        }
    }
}

/// Ball identity (u8 index; 0 = cue ball by convention).
///
/// Serializes as a bare u8 (serde newtype).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct BallId(pub u8);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vec3_ops() {
        let a = Vec3::new(1.0, 2.0, 3.0);
        let b = Vec3::new(-1.0, 0.5, 2.0);
        assert_eq!(a + b, Vec3::new(0.0, 2.5, 5.0));
        assert_eq!(a - b, Vec3::new(2.0, 1.5, 1.0));
        assert_eq!(a * 2.0, Vec3::new(2.0, 4.0, 6.0));
        assert_eq!(-a, Vec3::new(-1.0, -2.0, -3.0));
        assert_eq!(a.dot(b), 6.0);
        assert_eq!(
            Vec3::new(1.0, 0.0, 0.0).cross(Vec3::new(0.0, 1.0, 0.0)).z,
            1.0
        );
        assert_eq!(a.xy(), (1.0, 2.0));
        assert!((Vec3::new(3.0, 4.0, 0.0).norm() - 5.0).abs() < 1e-15);
        assert_eq!(Vec3::ZERO.normalized(), Vec3::ZERO);
        assert!((a.normalized().norm() - 1.0).abs() < 1e-15);
        assert!(!Vec3::new(f64::NAN, 0.0, 0.0).is_finite());
    }

    #[test]
    fn quat_axis_angle_and_mul() {
        let q = Quat::from_axis_angle(Vec3::new(0.0, 0.0, 1.0), std::f64::consts::PI);
        assert!(q.w.abs() < 1e-15);
        assert!((q.z - 1.0).abs() < 1e-15);
        let i = Quat::IDENTITY * q;
        assert!((i.z - q.z).abs() < 1e-15);
        assert_eq!(Quat::from_axis_angle(Vec3::ZERO, 1.0), Quat::IDENTITY);
        let n = (q * q).normalized();
        let mag = n.w * n.w + n.x * n.x + n.y * n.y + n.z * n.z;
        assert!((mag - 1.0).abs() < 1e-12);
    }

    #[test]
    fn ball_id_serde_is_bare_u8() {
        let id = BallId(7);
        assert_eq!(serde_json::to_string(&id).unwrap(), "7");
        let back: BallId = serde_json::from_str("7").unwrap();
        assert_eq!(back, id);
    }
}
