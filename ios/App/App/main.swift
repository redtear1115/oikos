import UIKit

// Explicit entry point (#1478): start native crash reporting before UIApplicationMain.
// #1473 ("UIScene life cycle is required") trapped inside UIApplicationMain before the app
// delegate was created, so no delegate callback is early enough. Release builds only.
SentryBootstrap.start()

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
