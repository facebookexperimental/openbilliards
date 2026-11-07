# Copyright (c) Meta Platforms, Inc. and affiliates.

"""A counter-based SplitMix64 stream of stroke-noise normals, keyed by (episode seed, decision index).

noise_seed(s, i) = mix(s XOR (GOLDEN_GAMMA_2 * (i + 1))) mod 2**64, with mix the SplitMix64
finalizer and GOLDEN_GAMMA_2 = mix(GOLDEN_GAMMA) | 1. A decision draws six u64 values from the
SplitMix64 generator started at its key (state += GOLDEN_GAMMA, emit mix(state)), maps each into
(0, 1] by ((u >> 11) + 1) * 2**-53 (exact; the + 1 keeps log() finite) and turns the three pairs
into six standard normals by Box-Muller. The first five are returned in stroke order
(v0, phi, theta, a, b) and the sixth is discarded, so the block shape never depends on control
flow. No state is kept: the two keys redraw the same noise, in any order.

shot_seed(s, j) = mix(s XOR (GOLDEN_GAMMA * (j + 1))) is a companion stream for a simulated
shot's own seed. It never meets a noise key: mix is a bijection, so a collision needs
GOLDEN_GAMMA_2 * (i + 1) == GOLDEN_GAMMA * (j + 1) mod 2**64 whatever s is, and since both
gammas are odd each i admits one j + 1 = COLLISION_FACTOR * (i + 1); none falls below 2**20.

The integer layers are exact everywhere; the normals pass through libm (log, sqrt, cos, sin).

References: G. L. Steele Jr., D. Lea and C. H. Flood, "Fast splittable pseudorandom number
generators", OOPSLA 2014, ACM SIGPLAN Notices 49(10), 453-472. G. E. P. Box and M. E. Muller,
"A note on the generation of random normal deviates", Ann. Math. Statist. 29(2), 610-611, 1958.
"""

import math

MASK64 = (1 << 64) - 1

#: The SplitMix64 increment (the 64-bit golden-ratio gamma).
GOLDEN_GAMMA = 0x9E3779B97F4A7C15


def splitmix64(z):
    """The SplitMix64 finalizer on a u64 (pure integer arithmetic)."""
    z &= MASK64
    z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & MASK64
    z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & MASK64
    return (z ^ (z >> 31)) & MASK64


#: mix(GOLDEN_GAMMA) | 1 = 0xE220A8397B1DCDAF: the noise stream's key multiplier.
GOLDEN_GAMMA_2 = splitmix64(GOLDEN_GAMMA) | 1

#: GOLDEN_GAMMA**-1 * GOLDEN_GAMMA_2 mod 2**64 = 0x9E7C7F2481189FB3: maps i + 1
#: to the only j + 1 at which noise_seed(s, i) could equal shot_seed(s, j).
COLLISION_FACTOR = (pow(GOLDEN_GAMMA, -1, 1 << 64) * GOLDEN_GAMMA_2) & MASK64


def _keyed(episode_seed, index, gamma):
    if index < 0:
        raise ValueError(f"the index must be >= 0, got {index}")
    return splitmix64((episode_seed & MASK64) ^ ((gamma * (index + 1)) & MASK64))


def noise_seed(episode_seed, decision_index):
    """The u64 key of a decision (0-based index >= 0); the episode seed is reduced mod 2**64."""
    return _keyed(episode_seed, decision_index, GOLDEN_GAMMA_2)


def shot_seed(episode_seed, shot_index):
    """The companion per-shot seed (keyed by GOLDEN_GAMMA); never equal to a noise_seed at indices below 2**20."""
    return _keyed(episode_seed, shot_index, GOLDEN_GAMMA)


def uniform_block(episode_seed, decision_index):
    """The six u64 draws of a decision: the SplitMix64 generator started at its key."""
    state = noise_seed(episode_seed, decision_index)
    draws = []
    for _ in range(6):
        state = (state + GOLDEN_GAMMA) & MASK64
        draws.append(splitmix64(state))
    return tuple(draws)


def u64_to_unit(u):
    """A u64 to a double in (0, 1]: ((u >> 11) + 1) * 2**-53, exact in binary floating point."""
    return ((u >> 11) + 1) * 2.0**-53


def standard_normals(episode_seed, decision_index):
    """The five standard normals of a decision in stroke order (v0, phi, theta, a, b): Box-Muller,
    z[2k] = sqrt(-2 ln u[2k]) cos(2 pi u[2k+1]) and z[2k+1] with sin, k = 0, 1, 2."""
    u = [u64_to_unit(d) for d in uniform_block(episode_seed, decision_index)]
    z = []
    for k in range(3):
        radius = math.sqrt(-2.0 * math.log(u[2 * k]))
        angle = 2.0 * math.pi * u[2 * k + 1]
        z.append(radius * math.cos(angle))
        z.append(radius * math.sin(angle))
    return tuple(z[:5])  # the sixth normal is computed and discarded: a fixed block shape


def collision_pairs(bound=1 << 20):
    """Every (i, j) with i, j < bound at which noise_seed(s, i) == shot_seed(s, j) for all s: each i
    has one candidate j + 1 = COLLISION_FACTOR * (i + 1) mod 2**64, kept if it lands below the bound."""
    pairs = []
    for i in range(bound):
        j_plus_1 = (COLLISION_FACTOR * (i + 1)) & MASK64
        if 1 <= j_plus_1 <= bound:
            pairs.append((i, j_plus_1 - 1))
    return pairs
