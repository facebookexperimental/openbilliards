// Copyright (c) Meta Platforms, Inc. and affiliates.

use kroots::{earliest_root_in, real_roots_in};
use proptest::prelude::*;
mod support;

fn power(e: i32) -> f64 {
    f64::from_bits(((e + 1023) as u64) << 52)
}
proptest! {
    #![proptest_config(ProptestConfig {cases:192,failure_persistence:None,..ProptestConfig::default()})]
    #[test]
    fn exact_scaling_preserves_roots(a in -20_i32..20,b in -20_i32..20,c in -20_i32..20,d in -20_i32..20,e in -400_i32..400,negative in any::<bool>()) {
        let roots=[a as f64,b as f64,c as f64,d as f64];
        let mut coefficients=[1.,0.,0.,0.,0.];
        for (degree,root) in roots.iter().enumerate() {
            for i in (1..=degree+1).rev() {coefficients[i]=coefficients[i-1]-root*coefficients[i];}
            coefficients[0]*= -root;
        }
        let scale=power(e)*if negative {-1.} else {1.};
        let base=real_roots_in(&coefficients,-32.,32.);
        let scaled=real_roots_in(&coefficients.map(|v|v*scale),-32.,32.);
        prop_assert_eq!(base.len,scaled.len);
        let mut expected=roots.to_vec();expected.sort_by(f64::total_cmp);expected.dedup();
        let expected:Vec<u64>=expected.iter().map(|x|if *x==0. {0} else {x.to_bits()}).collect();
        let actual:Vec<u64>=base.as_slice().iter().map(|x|x.to_bits()).collect();
        let other:Vec<u64>=scaled.as_slice().iter().map(|x|x.to_bits()).collect();
        prop_assert!(support::acceptable(coefficients,-32.,32.,&expected,&actual));
        prop_assert!(support::acceptable(coefficients.map(|v|v*scale),-32.,32.,&expected,&other));
    }
    #[test]
    fn linear_windows_and_rounding(numerator in -100000_i32..100000,denominator in 1_i32..100000,lo in -32_i32..32,width in 1_i32..64) {
        let c=[-(numerator as f64),denominator as f64,0.,0.,0.];
        let a=lo as f64;let b=(lo+width) as f64;
        let q=numerator as f64/denominator as f64;
        let expected=if numerator as i64>(lo as i64)*(denominator as i64) && numerator as i64<=((lo+width) as i64)*(denominator as i64) && q>a {Some(if q==0. {0.} else {q})} else {None};
        prop_assert_eq!(earliest_root_in(&c,a,b).map(f64::to_bits),expected.map(f64::to_bits));
    }
    #[test]
    fn deterministic_independent_calls(c in prop::array::uniform5(-1000_i32..1000)) {
        let c=c.map(|x|x as f64);
        let before=real_roots_in(&c,-8.,8.);
        let _=real_roots_in(&[1.,0.,1.,0.,0.],0.,8.);
        let after=real_roots_in(&c,-8.,8.);
        prop_assert_eq!(before,after);
        prop_assert_eq!(earliest_root_in(&c,-8.,8.).map(f64::to_bits),before.first().map(f64::to_bits));
    }
    #[test]
    fn all_nan_payload_shapes(payload in 1_u64..(1_u64<<52),negative in any::<bool>(),position in 0_usize..5) {
        let nan=f64::from_bits(0x7ff0_0000_0000_0000|payload|if negative {1_u64<<63} else {0});
        let mut c=[-1.,1.,0.,0.,0.];c[position]=nan;
        prop_assert_eq!(real_roots_in(&c,0.,2.).len,0);
        prop_assert_eq!(earliest_root_in(&c,0.,2.),None);
        prop_assert_eq!(real_roots_in(&[-1.,1.,0.,0.,0.],nan,2.).len,0);
        prop_assert_eq!(real_roots_in(&[-1.,1.,0.,0.,0.],0.,nan).len,0);
    }
}

#[test]
fn power_of_two_shadow_invariance() {
    let c = [power(-100), 1., -2., 1., 0.];
    for e in [-900, -400, 0, 400, 900] {
        assert_eq!(
            real_roots_in(&c.map(|x| x * power(e)), 0.5, 1.5).as_slice(),
            &[1.]
        );
    }
}
