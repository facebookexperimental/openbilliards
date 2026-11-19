#![cfg(not(feature = "decision-trace"))]

// Copyright (c) Meta Platforms, Inc. and affiliates.

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
struct Counting;
thread_local! {static COUNT:Cell<Option<usize>>=const {Cell::new(None)};}
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let _ = COUNT.try_with(|c| {
            if let Some(n) = c.get() {
                c.set(Some(n + 1));
            }
        });
        System.alloc(layout)
    }
    unsafe fn dealloc(&self, p: *mut u8, layout: Layout) {
        System.dealloc(p, layout);
    }
}
#[global_allocator]
static ALLOCATOR: Counting = Counting;
#[test]
fn production_solves_do_not_allocate() {
    let cases = [
        [f64::NAN, 0., 0., 0., 0.],
        [1., -134217728., 1., 0., 0.],
        [24., -50., 35., -10., 1.],
        [4., 0., -4., 0., 1.],
        [1., 12., 54., 108., 81.],
        [1. - f64::from_bits(971_u64 << 52), 0., -2., 0., 1.],
        [-f64::from_bits(1), 3., 0., 0., 0.],
    ];
    COUNT.with(|c| c.set(Some(0)));
    for coefficients in cases {
        std::hint::black_box(kroots::real_roots_in(&coefficients, -8., f64::INFINITY));
        std::hint::black_box(kroots::earliest_root_in(&coefficients, -8., f64::INFINITY));
    }
    let allocations = COUNT.with(|c| c.replace(None).unwrap());
    assert_eq!(allocations, 0);
}
