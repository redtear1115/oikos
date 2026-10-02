import UIKit

// Explicit entry point (#1478): start native crash reporting before UIApplicationMain.
// This is the earliest point the app controls, so crashes anywhere inside UIApplicationMain are
// covered. (AppDelegate.init also runs ~16 ms before the #1473 trap and would catch that class too;
// main.swift was kept as the earlier, simpler single start point.) Release builds only.
SentryBootstrap.start()

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
