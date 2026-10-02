import Foundation
import Sentry

/// Native crash reporting for the iOS shell (#1478).
///
/// Why this exists: crashes that happen before the WebView runs any JS (launch crashes such as
/// #1473 "UIScene life cycle is required") never reach the web Sentry SDK. This reports them
/// from the native side into the same Sentry project, tagged `layer=native`.
///
/// Start point: `main.swift`, before `UIApplicationMain`. #1473 trapped inside UIApplicationMain
/// before the app delegate was even created, so `AppDelegate.init` is too late for that class.
///
/// What it does NOT cover (see docs/app-store-submission-runbook.md §K):
/// - a crash before `main` (dyld / static initializers) — the SDK is not running yet;
/// - a crash loop caused by the SDK itself — it cannot be stopped server-side.
///
/// Kill switch: disable the "ios-native" client key in Sentry. That stops delivery only;
/// the SDK keeps running on device until a build without it ships.
enum SentryBootstrap {
    /// DSN of the dedicated "ios-native" client key in Sentry project prj-futari.
    /// A DSN is public by design (it can only submit events). Empty = SDK not started.
    static let dsn = "https://088451d7d1ccb6e0a24c39e21dfc11d8@o4511427984752640.ingest.us.sentry.io/4511427989798912"

    /// Call once, from `main.swift` before `UIApplicationMain`. Release builds only.
    /// Must not touch `UIApplication`: it does not exist yet at this point.
    static func start() {
        #if DEBUG
        NSLog("[SentryBootstrap] Debug build: native crash reporting not started")
        #else
        guard !dsn.isEmpty else {
            NSLog("[SentryBootstrap] no DSN configured: native crash reporting not started")
            return
        }
        let info = Bundle.main.infoDictionary
        let shortVersion = info?["CFBundleShortVersionString"] as? String ?? "0"
        let buildNumber = info?["CFBundleVersion"] as? String ?? "0"

        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = "production"
            options.releaseName = "futari-ios@\(shortVersion)+\(buildNumber)"

            // Privacy: nothing that identifies a person or an install leaves the phone.
            options.sendDefaultPii = false              // explicit; do not rely on the default
            options.enableAutoSessionTracking = false   // no sessions → no per-install `did`
            options.enableMemoryIntrospection = false   // no heap / C strings in crash reports
            options.attachScreenshot = false
            options.attachViewHierarchy = false

            // Crashes only.
            options.enableCrashHandler = true
            options.enableWatchdogTerminationTracking = true
            options.enableAppHangTracking = false
            options.enableMetricKit = false

            // No hooks into the app beyond the crash handler: no swizzling, no performance,
            // no profiling (tracesSampleRate is deliberately left unset → tracing disabled).
            options.enableSwizzling = false
            options.enableAutoPerformanceTracing = false

            // No network capture, no breadcrumbs.
            options.enableCaptureFailedRequests = false
            options.enableNetworkBreadcrumbs = false
            options.enableAutoBreadcrumbTracking = false

            options.beforeSend = { event in
                SentryBootstrap.scrub(event)
            }
        }
        NSLog("[SentryBootstrap] native crash reporting started")
        #endif
    }

    /// Runs on the startup path (a crash from the previous launch is sent synchronously during
    /// `start`), so it must never trap: optional chaining only, no force unwrap / force cast.
    static func scrub(_ event: Event) -> Event? {
        event.user = nil
        event.request = nil
        event.breadcrumbs = nil

        if var context = event.context {
            context["app"]?.removeValue(forKey: "device_app_hash")
            context["device"]?.removeValue(forKey: "boot_time")
            event.context = context
        }

        if let exceptions = event.exceptions {
            for exception in exceptions {
                if let value = exception.value {
                    exception.value = mask(value)
                }
                scrubFrames(exception.stacktrace?.frames)
            }
        }
        if let threads = event.threads {
            for thread in threads {
                scrubFrames(thread.stacktrace?.frames)
            }
        }
        scrubFrames(event.stacktrace?.frames)
        if let images = event.debugMeta {
            for image in images {
                if let codeFile = image.codeFile {
                    image.codeFile = maskContainer(codeFile)
                }
            }
        }

        if let message = event.message {
            let masked = SentryMessage(formatted: mask(message.formatted))
            masked.message = message.message.map(mask)
            masked.params = message.params?.map(mask)
            event.message = masked
        }

        var tags = event.tags ?? [:]
        tags["platform"] = "ios_native"
        tags["layer"] = "native"
        event.tags = tags
        return event
    }

    private static func scrubFrames(_ frames: [Frame]?) {
        guard let frames else { return }
        for frame in frames {
            if let package = frame.package {
                frame.package = maskContainer(package)
            }
        }
    }

    // `/invite/<token>` → `/invite/[filtered]`; a `?query` / `#fragment` glued to a token → `?[filtered]`.
    private static let invitePattern = try? NSRegularExpression(pattern: "/invite/[^/?#\\s\"'<>]+")
    private static let queryPattern = try? NSRegularExpression(pattern: "(?<=\\S)([?#])[^\\s\"'<>]+")
    // The per-install bundle container UUID in image paths (`…/Bundle/Application/<UUID>/App.app/…`).
    // Replaced with an all-zero UUID so the path keeps its shape (in-app heuristics); symbolication
    // matches images by debug ID + address, not by path.
    private static let containerPattern = try? NSRegularExpression(
        pattern: "/Application/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/")

    static func mask(_ text: String) -> String {
        var result = text
        if let invitePattern {
            let range = NSRange(result.startIndex..., in: result)
            result = invitePattern.stringByReplacingMatches(in: result, range: range, withTemplate: "/invite/[filtered]")
        }
        if let queryPattern {
            let range = NSRange(result.startIndex..., in: result)
            result = queryPattern.stringByReplacingMatches(in: result, range: range, withTemplate: "$1[filtered]")
        }
        return result
    }

    static func maskContainer(_ path: String) -> String {
        guard let containerPattern else { return path }
        let range = NSRange(path.startIndex..., in: path)
        return containerPattern.stringByReplacingMatches(
            in: path, range: range, withTemplate: "/Application/00000000-0000-0000-0000-000000000000/")
    }
}
