// Copyright (c) Meta Platforms, Inc. and affiliates.

// DownloadRouter — FROZEN public API (the macos-shell contract §3;
// the downloads contract §2 flow is normative). Bodies filled by T016
// (lane D); unit-gated in DownloadRouterTests (FR-015).
//
// Behavioral laws (the macos-shell contract §3):
// - policy: shouldPerformDownload == true → .download;
//   app:// | blob: | about: → .allow; any other main-frame scheme →
//   .cancel (offline defense in depth — the entitlement posture is the
//   primary mechanism, this is the belt).
// - destinationDirectives: no destination → [.cancel]; destination + no
//   existing file → [.setDestination]; destination + existing file →
//   [.removeExisting, .setDestination] (WKDownload refuses overwrite;
//   consent came from the panel's standard replace flow —
//   .removeExisting NEVER fires without it).
import Foundation

public enum DownloadPolicy: Equatable { case download, allow, cancel }

public enum DownloadDirective: Equatable {
    case cancel                    // user cancelled the save panel
    case removeExisting            // panel replace consent + file exists
    case setDestination            // proceed to the chosen URL
}

public enum DownloadRouter {
    /// The app-internal schemes a navigation may load (the downloads
    /// contract §2.1): the game origin, blob object URLs, and
    /// about: (initial blank frames). Compared case-insensitively —
    /// URL schemes are case-insensitive per RFC 3986 §3.1.
    private static let allowedSchemes: Set<String> = ["app", "blob", "about"]

    public static func policy(shouldPerformDownload: Bool,
                              isMainFrame: Bool,
                              scheme: String?) -> DownloadPolicy {
        // Law 1: download-attribute navigations route to WKDownload,
        // unconditionally — the anchor's intent wins.
        if shouldPerformDownload { return .download }
        // Law 2: app-internal schemes load normally.
        if let scheme, allowedSchemes.contains(scheme.lowercased()) {
            return .allow
        }
        // Law 3: any other main-frame scheme is cancelled (the offline
        // belt). Non-main-frame non-app schemes are cancelled too —
        // stricter than the gated main-frame law, never weaker: no
        // request may leave the app from ANY frame. `isMainFrame` stays
        // in the frozen signature as the law's named discriminator.
        _ = isMainFrame
        return .cancel
    }

    public static func destinationDirectives(choseDestination: Bool,
                                             fileExists: Bool) -> [DownloadDirective] {
        // No destination = the user cancelled the panel: the route dies
        // silently, and nothing else may fire (never-remove-without-
        // consent — fileExists is irrelevant without a chosen URL).
        guard choseDestination else { return [.cancel] }
        // Destination chosen through the panel's standard replace flow:
        // pre-delete ONLY when a file exists at the chosen URL (the
        // panel's replace confirmation IS the consent), then hand
        // WKDownload the destination (it refuses to overwrite).
        return fileExists ? [.removeExisting, .setDestination]
                          : [.setDestination]
    }
}
