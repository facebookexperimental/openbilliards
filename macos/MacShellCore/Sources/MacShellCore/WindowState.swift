// Copyright (c) Meta Platforms, Inc. and affiliates.

// WindowState — FROZEN public API (the macos-shell contract §3 window
// laws; data-model §3 persistence shape). Bodies filled by T010
// (lane S) — the 001 placeholder-stub regime; the public surface is
// contract-verbatim. The contract constants are part of the frozen
// surface, pinned to their normative values (research R7).
//
// Behavioral laws (unit-gated by WindowStateTests, FR-015):
// - decode(encode(r)) == r for every finite record; malformed / v != 1
//   data decodes to nil, never throws.
// - restoredFrame output always intersects one of visibleFrames, is never
//   smaller than the minimum content size, and equals the centered
//   1280×800 default when record is nil or visibleFrames cannot contain it.
import Foundation

/// Persisted window geometry, v1 (UserDefaults key `shell.window.state`,
/// JSON-encoded — data-model §3). Content rect in screen points;
/// backing scale is never persisted.
public struct WindowStateRecord: Codable, Equatable {
    public let v: Int                       // 1
    public let x: Double, y: Double         // content origin, screen points
    public let width: Double, height: Double
    public init(v: Int, x: Double, y: Double, width: Double, height: Double) {
        self.v = v
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

public enum WindowStateStore {
    /// Minimum content size floor (research R7 pin; lowering is forbidden,
    /// raising is a recorded integration decision).
    public static let minContentWidth: Double = 1024
    public static let minContentHeight: Double = 640
    /// First-launch default content size (spec FR-007 — the web battery's
    /// default viewport), centered.
    public static let defaultContentWidth: Double = 1280
    public static let defaultContentHeight: Double = 800

    /// Foundation-only rect (no CoreGraphics dependency).
    public struct Frame: Equatable {
        public let x: Double, y: Double, width: Double, height: Double
        public init(x: Double, y: Double, width: Double, height: Double) {
            self.x = x
            self.y = y
            self.width = width
            self.height = height
        }
    }

    public static func encode(_ record: WindowStateRecord) -> Data {
        // JSON per data-model §3. JSONEncoder throws only on
        // non-finite doubles for this shape; such a record has no valid
        // persisted form, so it encodes to empty Data — which decode maps
        // to nil → first-launch defaults (the laws quantify over FINITE
        // records only).
        (try? JSONEncoder().encode(record)) ?? Data()
    }

    /// nil = use defaults (malformed / v != 1 never throws).
    public static func decode(_ data: Data) -> WindowStateRecord? {
        guard let record = try? JSONDecoder().decode(WindowStateRecord.self,
                                                     from: data),
              record.v == 1,
              record.x.isFinite, record.y.isFinite,
              record.width.isFinite, record.height.isFinite else {
            return nil
        }
        return record
    }

    /// Pure restore: clamp onto a visible screen, enforce the minimum,
    /// fall back to the centered default when record is nil.
    ///
    /// Laws (the macos-shell contract §3):
    /// - output always intersects one of `visibleFrames`;
    /// - output is never smaller than the minimum content size;
    /// - output equals the centered 1280×800 default when `record` is nil
    ///   or `visibleFrames` cannot contain it (no visible frame can hold
    ///   the min-clamped record size).
    ///
    /// The adapter passes the main screen's visible frame FIRST; the
    /// centered default centers on that frame. A record that fits but
    /// lies off every visible screen (disconnected display) is clamped
    /// onto the visible frame it overlaps most — or, with zero overlap,
    /// onto the first frame that can contain it.
    public static func restoredFrame(_ record: WindowStateRecord?,
                                     visibleFrames: [Frame]) -> Frame {
        // Degenerate adapter input (no screens): the centered default at
        // the origin — the intersection law is vacuous with no frames.
        guard let primary = visibleFrames.first else {
            return Frame(x: 0, y: 0,
                         width: defaultContentWidth,
                         height: defaultContentHeight)
        }
        guard let record,
              record.x.isFinite, record.y.isFinite,
              record.width.isFinite, record.height.isFinite else {
            return centeredDefault(on: primary)
        }

        // Enforce the minimum content size floor before placement.
        let width = Swift.max(record.width, minContentWidth)
        let height = Swift.max(record.height, minContentHeight)

        // Screens that can contain the min-clamped size.
        let containers = visibleFrames.filter {
            $0.width >= width && $0.height >= height
        }
        guard !containers.isEmpty else {
            // "visibleFrames cannot contain it" → the centered default.
            return centeredDefault(on: primary)
        }

        // Prefer the container the record overlaps most (multi-display
        // restore lands on the screen the window lived on); zero overlap
        // (disconnected display) falls back to the first container.
        let recordFrame = Frame(x: record.x, y: record.y,
                                width: width, height: height)
        let target = containers.max { a, b in
            intersectionArea(recordFrame, a) < intersectionArea(recordFrame, b)
        }
        let screen = (intersectionArea(recordFrame, target!) > 0)
            ? target! : containers[0]

        // Clamp the origin so the frame sits fully inside the screen.
        let x = Swift.min(Swift.max(record.x, screen.x),
                          screen.x + screen.width - width)
        let y = Swift.min(Swift.max(record.y, screen.y),
                          screen.y + screen.height - height)
        return Frame(x: x, y: y, width: width, height: height)
    }

    /// The first-launch / fallback frame: the 1280×800 default centered
    /// on the primary visible frame (spec FR-007).
    private static func centeredDefault(on screen: Frame) -> Frame {
        Frame(x: screen.x + (screen.width - defaultContentWidth) / 2,
              y: screen.y + (screen.height - defaultContentHeight) / 2,
              width: defaultContentWidth,
              height: defaultContentHeight)
    }

    private static func intersectionArea(_ a: Frame, _ b: Frame) -> Double {
        let w = Swift.min(a.x + a.width, b.x + b.width) - Swift.max(a.x, b.x)
        let h = Swift.min(a.y + a.height, b.y + b.height) - Swift.max(a.y, b.y)
        return (w > 0 && h > 0) ? w * h : 0
    }
}
