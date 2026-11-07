// Copyright (c) Meta Platforms, Inc. and affiliates.

//! PCG32 random number generator (M7-owned; trunk provides a REAL minimal
//! implementation because rack construction depends on it).
//!
//! PCG-XSH-RR 64/32 per M.E. O'Neill, "PCG: A Family of Simple Fast
//! Space-Efficient Statistically Good Algorithms for Random Number
//! Generation" (2014), reference implementation `pcg32_srandom_r` /
//! `pcg32_random_r` (pcg-random.org, Apache-2.0). No `rand` crate:
//! determinism requires a self-owned generator (constitution P-III).

const MULTIPLIER: u64 = 6364136223846793005;

/// PCG-XSH-RR 64/32: 64-bit state, 32-bit output, selectable stream.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pcg32 {
    state: u64,
    inc: u64,
}

impl Pcg32 {
    /// Seed with an initial state and stream selector (any values are valid;
    /// distinct `stream`s yield independent sequences).
    pub fn new(seed: u64, stream: u64) -> Pcg32 {
        let mut rng = Pcg32 {
            state: 0,
            inc: (stream << 1) | 1,
        };
        rng.next_u32();
        rng.state = rng.state.wrapping_add(seed);
        rng.next_u32();
        rng
    }

    /// Next uniform u32.
    pub fn next_u32(&mut self) -> u32 {
        let old = self.state;
        self.state = old.wrapping_mul(MULTIPLIER).wrapping_add(self.inc);
        let xorshifted = (((old >> 18) ^ old) >> 27) as u32;
        let rot = (old >> 59) as u32;
        xorshifted.rotate_right(rot)
    }

    /// Next uniform f64 in [0, 1) with 53 bits of precision (two u32 draws).
    pub fn next_f64(&mut self) -> f64 {
        let hi = (self.next_u32() >> 5) as u64; // 27 bits
        let lo = (self.next_u32() >> 6) as u64; // 26 bits
        ((hi << 26) | lo) as f64 * (1.0 / 9007199254740992.0) // 2^-53
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reference values from the canonical PCG32 demo: seed 42, stream 54
    /// (`pcg32-demo.c` first outputs).
    #[test]
    fn matches_pcg32_reference_vector() {
        let mut rng = Pcg32::new(42, 54);
        let expected: [u32; 6] = [
            0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e,
        ];
        for e in expected {
            assert_eq!(rng.next_u32(), e);
        }
    }

    #[test]
    fn f64_in_unit_interval_and_deterministic() {
        let mut a = Pcg32::new(7, 0);
        let mut b = Pcg32::new(7, 0);
        for _ in 0..1000 {
            let x = a.next_f64();
            assert!((0.0..1.0).contains(&x));
            assert_eq!(x, b.next_f64());
        }
        // different stream → different sequence
        let mut c = Pcg32::new(7, 1);
        let mut d = Pcg32::new(7, 0);
        assert_ne!(
            (0..8).map(|_| c.next_u32()).collect::<Vec<_>>(),
            (0..8).map(|_| d.next_u32()).collect::<Vec<_>>()
        );
    }
}
