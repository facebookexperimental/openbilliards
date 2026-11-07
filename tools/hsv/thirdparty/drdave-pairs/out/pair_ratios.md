# Matched-pair reverse/running observable ratios

Per-clip 1-sigma errors from linear-fit residuals (track jitter).
mu_eff = (vt_in - vt_out)/(vn_in + vn_out): translational impulse
ratio, lower bound on slipping-contact mu.

## P-fast-angled -- bank ~28deg from normal, fast

| clip | spin | theta_in | theta_out | vn_in m/s (nominal) | speed ratio | e_n | tangential ratio | mu_eff |
|---|---|---|---|---|---|---|---|---|
| HSV6-6 | reverse | 28.5 +/- 0.3 | 21.3 +/- 0.1 | 5.08 | 0.632 +/- 0.006 | 0.670 +/- 0.006 | 0.481 +/- 0.004 | 0.169 +/- 0.003 |
| HSV6-7 | running | 27.2 +/- 0.5 | 39.1 +/- 0.2 | 4.34 | 0.754 +/- 0.011 | 0.658 +/- 0.009 | 1.042 +/- 0.019 | 0.013 +/- 0.006 |

- **rev_over_run_speed_ratio** = 0.837 +/- 0.015
- **rev_over_run_e_n** = 1.018 +/- 0.017
- **rebound_angle_shift_deg** = -17.750 +/- 0.270

## P-slow-angled -- bank ~24deg from normal, slow

| clip | spin | theta_in | theta_out | vn_in m/s (nominal) | speed ratio | e_n | tangential ratio | mu_eff |
|---|---|---|---|---|---|---|---|---|
| HSV6-8 | reverse | 23.9 +/- 0.2 | 12.3 +/- 0.2 | 2.26 | 0.803 +/- 0.006 | 0.858 +/- 0.005 | 0.422 +/- 0.007 | 0.138 +/- 0.003 |
| HSV6-9 | running | 23.9 +/- 1.1 | 47.1 +/- 1.2 | 5.67 | 0.847 +/- 0.043 | 0.631 +/- 0.034 | 1.533 +/- 0.067 | 0.145 +/- 0.015 |

- **rev_over_run_speed_ratio** = 0.948 +/- 0.048
- **rev_over_run_e_n** = 1.361 +/- 0.073
- **rebound_angle_shift_deg** = -34.770 +/- 1.250

## P-med-angled -- kick ~28deg from normal, medium

| clip | spin | theta_in | theta_out | vn_in m/s (nominal) | speed ratio | e_n | tangential ratio | mu_eff |
|---|---|---|---|---|---|---|---|---|
| HSV6-11 | reverse | 28.1 +/- 0.1 | 14.2 +/- 0.2 | 5.3 | 0.624 +/- 0.004 | 0.685 +/- 0.004 | 0.326 +/- 0.005 | 0.213 +/- 0.002 |
| HSV6-12 | running | 27.7 +/- 6.5 | 33.0 +/- 0.9 | 6.9 | 0.762 +/- 0.152 | 0.722 +/- 0.145 | 0.892 +/- 0.172 | 0.033 +/- 0.059 |

- **rev_over_run_speed_ratio** = 0.819 +/- 0.163
- **rev_over_run_e_n** = 0.950 +/- 0.191
- **rebound_angle_shift_deg** = -18.810 +/- 0.950

## P-small-angle -- small-angle kick, medium (theta_in mismatch 19.5 vs 11.9 deg)

| clip | spin | theta_in | theta_out | vn_in m/s (nominal) | speed ratio | e_n | tangential ratio | mu_eff |
|---|---|---|---|---|---|---|---|---|
| HSVA-27 | reverse | 19.5 +/- 2.0 | 10.1 +/- 2.0 | 4.69 | 0.715 +/- 0.010 | 0.746 +/- 0.009 | -0.377 +/- 0.011 | 0.279 +/- 0.005 |
| HSVA-28 | running | 11.8 +/- 2.2 | 29.9 +/- 2.0 | 4.79 | 0.934 +/- 0.031 | 0.828 +/- 0.025 | 2.265 +/- 0.158 | 0.145 +/- 0.009 |

- **rev_over_run_speed_ratio** = 0.765 +/- 0.028
- **rev_over_run_e_n** = 0.901 +/- 0.029
- **rebound_angle_shift_deg** = -19.740 +/- 2.840

## P-largeangle-slow -- large-angle kick, slow -- ALONG-RAIL VIEW, tangential channel only

| clip | spin | theta_in | theta_out | vn_in m/s (nominal) | speed ratio | e_n | tangential ratio | mu_eff |
|---|---|---|---|---|---|---|---|---|
| HSVA-70 | reverse | 71.7 +/- 2.1 | 85.2 +/- 2.0 | 0.19 | 0.975 +/- 0.021 | 0.260 +/- 0.013 | 1.023 +/- 0.020 | 0.055 +/- 0.048 |
| HSVA-68 | running | 88.1 +/- 2.0 | 85.8 +/- 2.0 | 0.03 | 1.038 +/- 0.020 | 2.255 +/- 0.488 | 1.036 +/- 0.018 | 0.325 +/- 0.162 |

- **rev_over_run_tangential_ratio** = 0.988 +/- 0.026
- **rev_over_run_tangential_ratio_radius_corrected** = 1.063 +/- 0.028
- HSVA-70 radius in->out: 23.9 +/- 0.0 -> 22.7 +/- 0.1 px (blob radius drift in->out 5.5% (transverse-scale systematic))
- HSVA-68 radius in->out: 23.5 +/- 0.1 -> 24.0 +/- 0.1 px (blob radius drift in->out -2.0% (transverse-scale systematic))
- ALONG-RAIL CAVEAT: angles/e_n non-physical; tangential ratio only, depth-drift systematic of the same order as the contrast.

## P-largeangle-fast -- large-angle kick, fast -- ALONG-RAIL VIEW, FAILED VALIDATION (mutually inconsistent depth drift; excluded from verdict)

| clip | spin | theta_in | theta_out | vn_in m/s (nominal) | speed ratio | e_n | tangential ratio | mu_eff |
|---|---|---|---|---|---|---|---|---|
| HSVA-71 | reverse | 79.1 +/- 2.0 | 85.0 +/- 2.0 | 0.79 | 1.124 +/- 0.025 | 0.520 +/- 0.034 | 1.140 +/- 0.023 | 0.479 +/- 0.078 |
| HSVA-69 | running | 85.1 +/- 2.2 | 83.8 +/- 2.0 | 0.29 | 0.810 +/- 0.022 | 1.025 +/- 0.212 | 0.809 +/- 0.017 | 1.106 +/- 0.163 |

- **rev_over_run_tangential_ratio** = 1.409 +/- 0.041
- **rev_over_run_tangential_ratio_radius_corrected** = 1.482 +/- 0.045
- HSVA-71 radius in->out: 23.7 +/- 0.1 -> 24.5 +/- 0.1 px (blob radius drift in->out -3.4% (transverse-scale systematic))
- HSVA-69 radius in->out: 24.1 +/- 0.1 -> 26.3 +/- 0.1 px (blob radius drift in->out -8.1% (transverse-scale systematic))
- ALONG-RAIL CAVEAT: angles/e_n non-physical; tangential ratio only, depth-drift systematic of the same order as the contrast.

## Straight-in (near-normal incidence) sidespin probes

| clip | theta_in | theta_out | speed ratio | e_n | mu_eff | v_in m/s (nominal; A-series exact, 6.x if-1000fps) |
|---|---|---|---|---|---|---|
| HSV6-10 | 4.2 +/- 0.7 | 20.6 +/- 0.7 | 0.666 +/- 0.019 | 0.626 +/- 0.014 | 0.190 +/- 0.009 | 3.7 |
| HSVA-26 | 4.1 +/- 2.1 | 23.9 +/- 2.0 | 0.758 +/- 0.014 | 0.695 +/- 0.008 | 0.225 +/- 0.008 | 3.49 |

