# TestFlight Runbook — OpenBilliards iOS Shell

Feature `016-ios-app`, task T030 (contracts/distribution.md §5, FR-017/
SC-008). This runbook takes the owner from a fresh clone to a TestFlight
build with ZERO code edits — the only file the owner ever creates is the
gitignored `ios/Signing.xcconfig` (section 2). Sections 1–4 are executable
by anyone with an Xcode machine; the **owner-gated boundary** (Apple
Developer account required) is marked explicitly in section 5.

## 1. Prerequisites

| Requirement | Check | Expected |
|---|---|---|
| Xcode ≥ 16 (iOS SDK + Simulator) | `xcodebuild -version` | `Xcode 16.x` or newer |
| XcodeGen | `brew install xcodegen` then `xcodegen --version` | any recent version |
| Node ≥ 20 | `node --version` | `v20.x` or newer |
| At least one iPhone 16-class simulator | `xcrun simctl list devices` | device listed |

All commands below run from the repository root.

## 2. Generate the project + plug in signing

```bash
xcodegen generate --spec ios/project.yml
cp ios/Signing.example.xcconfig ios/Signing.xcconfig
# edit ios/Signing.xcconfig: set DEVELOPMENT_TEAM to your team id
```

- `ios/OpenBilliards.xcodeproj` is a GENERATED artifact (never committed;
  regenerate after any `ios/project.yml` change — research R16).
- `ios/Signing.xcconfig` is gitignored; filling `DEVELOPMENT_TEAM` is the
  ONLY owner-specific input in the whole flow (SC-008). Leave
  `PRODUCT_BUNDLE_IDENTIFIER = org.openbilliards.app` and
  `CODE_SIGN_STYLE = Automatic` unless your account requires otherwise.

## 3. Local gates (all must be green before archiving)

First the runs-today table (contracts/test-pyramid.md §0 — no Simulator
needed):

```bash
cd ios/ShellCore && swift test && cd ../..        # L1 logic core
node ios/tools/bundle-manifest.mjs generate       # sync web/ -> app bundle
node ios/tools/bundle-manifest.mjs verify         # SHA-256 identity, exit 0
node web/tools/e2e-haptics.mjs --inert            # haptics leaf inert off-shell
node web/tools/e2e-haptics.mjs --seam             # SC-005 derivation 1:1
```

Then the four pyramid layers on the Simulator (contracts/test-pyramid.md
§1–§4):

```bash
xcodebuild test -project ios/OpenBilliards.xcodeproj -scheme OpenBilliards \
  -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing AppTests
xcodebuild test -project ios/OpenBilliards.xcodeproj -scheme OpenBilliards \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing AppUITests/ComponentTree
node ios/tools/e2e-ios.mjs --scenario fullrack     # + gestures, determinism,
node ios/tools/e2e-ios.mjs --scenario lifecycle    #   haptics per need
node ios/tools/e2e-ios.mjs --scenario capabilities # issue #51 QA matrix:
                                                   #   WKWebView media truth
                                                   #   table + record/obShare
                                                   #   handoff + re-rack row
node ios/tools/acceptance.mjs                      # L4 screenshot acceptance
```

When your simulator's name does not contain "iPhone" (e.g. a custom device
like `ob-local-16-class`), pass it explicitly: `--udid <udid>` or
`OB_IOS_UDID=<udid>` — the picker's name filter only auto-selects
iPhone-named devices.

CI equivalence: the `shellcore` job of `.github/workflows/ios.yml` runs the
runs-today table per-commit on shell paths; the `simulator` job runs the
four layers when the repository variable `IOS_SIMULATOR_CI` is `enabled`
(contracts/test-pyramid.md §6).

## 4. Archive + validation checklist

```bash
xcodebuild archive -project ios/OpenBilliards.xcodeproj \
  -scheme OpenBilliards -destination 'generic/platform=iOS' \
  -archivePath build/OpenBilliards.xcarchive
```

Validate BEFORE any upload (SC-008's local validation — every row must
pass):

- [ ] Entitlements empty-but-signed: `codesign -d --entitlements - \
      build/OpenBilliards.xcarchive/Products/Applications/OpenBilliards.app`
      shows no capabilities beyond the default application-identifier set.
- [ ] Privacy manifest present in the product:
      `PrivacyInfo.xcprivacy` (no collection, no tracking, UserDefaults →
      CA92.1).
- [ ] Icon set complete: `Assets.xcassets/AppIcon.appiconset` carries all
      iPhone/iPad sizes + the 1024 marketing icon (regenerate/check with
      `node ios/tools/gen-icons.mjs --verify`).
- [ ] Bundle manifest verify green against the archived tree:
      `node ios/tools/bundle-manifest.mjs verify` exits 0 (it also requires
      the third-party notice files of THIRD_PARTY_NOTICES.md in the bundle).
- [ ] Third-party notices inside the exported `.ipa`:
      `scripts/release-preflight.sh notices <path>.ipa` prints one
      `notices: … byte-identical` line (exit 71–73 otherwise): the app must
      carry the licence texts and notices of the third-party code it ships
      (the kernel contains code derived from pooltool, Apache-2.0).
- [ ] Third-party notices readable in the app: in a Simulator or device run
      of the archived checkout, Settings → About → Licences expands a
      read-only region showing `NOTICE-pooltool.txt` followed by
      `LICENSES.md`, read from the app bundle (`web/vendor/`). A disabled
      Licences row means the bundle scheme handler did not serve them:
      re-run `node ios/tools/bundle-manifest.mjs verify` in the checkout the
      build was archived from.
- [ ] Export compliance declared: `ITSAppUsesNonExemptEncryption = false`
      present in the built app's Info.plist.
- [ ] Xcode Organizer "Validate App" passes against App Store Connect.

## 5. Version bump + upload

```
========================================================================
  OWNER-GATED BOUNDARY (FR-017 / distribution.md §5 step 5)
  Everything BELOW this line requires the owner's Apple Developer
  account and is OUTSIDE feature 016's gates. Record completion or
  pending status in the delivery record only.
========================================================================
```

1. Bump `CURRENT_PROJECT_VERSION` in `ios/project.yml` (monotonic integer,
   one bump per archive; `MARKETING_VERSION` stays `0.1.0` for Phase 1),
   re-run `xcodegen generate --spec ios/project.yml`, re-archive (section 4).
2. Upload via Xcode Organizer (Distribute App → App Store Connect →
   TestFlight).
3. **Delivery-record capture rule** (distribution.md §3) — for EVERY
   archive record, capture in the feature delivery record:
   - `MARKETING_VERSION` + `CURRENT_PROJECT_VERSION` of the archive;
   - the bundle manifest's `sourceCommit`
     (`ios/App/Resources/web/bundle-manifest.json`);
   - the canonical wasm SHA-256 as printed by
     `node ios/tools/bundle-manifest.mjs verify`
     (`dist/pool-wasm/pool_wasm_bg.wasm` — the determinism token surfaced
     at distribution level).

## 6. TestFlight on-device follow-ups

Schedule these measurement passes on real hardware once the build is live
(research §5; SC-009's on-device arm — Simulator cannot answer them):

- Real haptics feel: `CHHapticEngine` transient intensity/sharpness per cue
  class (cue 0.9 / click 0.7 / cushion 0.35 / pocket 0.2) — VALUES are
  feel-tunable as recorded deviations (haptics-bridge.md §5), shapes frozen.
- Frame pacing: rAF cadence vs CADisplayLink at the 60 Hz cap during break
  shots and full-table multi-ball motion.
- Thermals: sustained-play thermal state + any throttling-induced frame
  drops (Instruments → Thermal State, on-device only).
- **Media capability matrix, DEVICE column (issue #51)**: the simulator
  column comes from `--scenario capabilities`; device WebKit differs for
  media (hardware VideoToolbox encoders, MediaRecorder codec sets), so
  re-measure on hardware. Recipe: install a DEBUG build with
  `-OBBootQuery "obtool&seed=1" -OBStatusSeam YES`, open Safari →
  Develop → <device> → the app's web view (the shell is `isInspectable`
  in DEBUG), and run the probe expressions from
  `ios/tools/scenarios/capabilities.json` in the console. Specifically
  verify on-device: (a) `MediaRecorder.isTypeSupported` for the webm vs
  mp4 variants (device Safari historically records mp4 only — record.js
  negotiates in that order); (b) a short `__record.start(false)` /
  `stop(false)` produces > 100 KB for ~4 s (`__record.lastSize()`);
  (c) stopping with `stop(true)` presents the SHARE SHEET via the obShare
  bridge; (d) an offline `__export.start('standard', …)` makes frame
  progress — the SIMULATOR's VideoToolbox silently stalls avc1.640028
  (High profile: isConfigSupported says yes, zero outputs; measured
  2026-07-20, probe evidence on issue #51) and that stall class must be
  ruled out on hardware before trusting the mp4 export tiers.
