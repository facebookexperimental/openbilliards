// Copyright (c) Meta Platforms, Inc. and affiliates.

// JSONNumbers — internal strict-number extraction helpers shared by the
// manifest parser (BundleIndex) and the bridge decoder (HapticMessage).
// NOT part of the frozen public API (the shell-app contract 2).
//
// Why this exists: on Darwin, NSNumber bridging is value-lenient —
// NSNumber(1) `is Bool` returns true and NSNumber(true) casts to Double
// 1.0 — so "wrong-typed field" laws (FR-011) need the CFBoolean TYPE
// check, not a bridged cast.
import Foundation

/// True when the boxed JSON value is a boolean (CFBoolean), regardless of
/// its numeric bridgeability.
func jsonValueIsBool(_ any: Any) -> Bool {
    guard let n = any as? NSNumber else { return false }
    return CFGetTypeID(n) == CFBooleanGetTypeID()
}

/// Strict integer: a JSON number that is not a boolean and holds an exact
/// integral value. nil for strings, booleans, objects, fractions.
func jsonStrictInt(_ any: Any?) -> Int? {
    guard let any, let n = any as? NSNumber, !jsonValueIsBool(any) else { return nil }
    let d = n.doubleValue
    guard d.isFinite, d == d.rounded(.towardZero),
          d >= Double(Int.min), d <= Double(Int.max) else { return nil }
    return n.intValue
}

/// Strict double: a JSON number that is not a boolean. NaN/Infinity pass
/// through (the caller applies its own finiteness law). nil for strings,
/// booleans, objects.
func jsonStrictDouble(_ any: Any?) -> Double? {
    guard let any, let n = any as? NSNumber, !jsonValueIsBool(any) else { return nil }
    return n.doubleValue
}

/// Strict boolean: a REAL JSON boolean (CFBoolean). nil for numbers,
/// strings, objects — a page bug posting 1 must not read as true
/// (GH-362 KeepAwakeMessage).
func jsonStrictBool(_ any: Any?) -> Bool? {
    guard let any, jsonValueIsBool(any), let n = any as? NSNumber else { return nil }
    return n.boolValue
}
