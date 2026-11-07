// Copyright (c) Meta Platforms, Inc. and affiliates.

// MimeMap — FROZEN public API (the shell-app contract 2).
// T005 (lane S) body: hardcoded extension table for the origin server.
//
// Behavioral laws (unit-gated, FR-011):
// - TOTAL function over the data-model 2 extension table (html, js/mjs,
//   css, wasm, json, png, jpg, webp, svg, ktx2, hdr, bin, ico, txt, md,
//   map, woff2).
// - mime(forExtension: "wasm") == "application/wasm" — LOAD-BEARING for
//   WebAssembly.instantiateStreaming (research R4; UTType lookup returns
//   nil for wasm on some OS versions, hence the explicit table).
// - Unknown extension -> "application/octet-stream" (still served when
//   the path is present in the index).
import Foundation

/// Hardcoded extension -> MIME type table for the origin server.
public enum MimeMap {
    /// The data-model 2 table ("entries at minimum"); htm/jpeg ride
    /// their canonical siblings. Keys are lowercase; lookup lowercases.
    private static let table: [String: String] = [
        "html": "text/html",
        "htm": "text/html",
        "js": "text/javascript",
        "mjs": "text/javascript",
        "css": "text/css",
        "wasm": "application/wasm", // load-bearing (research R4)
        "json": "application/json",
        "map": "application/json",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
        "svg": "image/svg+xml",
        "ktx2": "image/ktx2",
        "hdr": "image/vnd.radiance",
        "bin": "application/octet-stream",
        "ico": "image/x-icon",
        "txt": "text/plain",
        "md": "text/markdown",
        "woff2": "font/woff2",
    ]

    public static func mime(forExtension ext: String) -> String {
        table[ext.lowercased()] ?? "application/octet-stream"
    }
}
