import type { CapacitorConfig } from '@capacitor/cli';

/** The shell always points at prod unless a dev explicitly overrides it. */
const PROD_SERVER_URL = 'https://futari.southern-light.dev';

/**
 * #990 — dev override for the URL the native shell loads.
 *
 * The shell is a thin wrapper around the deployed web app, so anything on the
 * native contract surface (deep links, Apple Sign In, push, keyboard resize)
 * used to be testable only after a prod deploy. Export `CAP_SERVER_URL` before
 * `cap sync` to point the shell somewhere else instead:
 *
 *   CAP_SERVER_URL=http://localhost:3000 npx cap sync ios       # local dev server
 *   CAP_SERVER_URL=https://<branch>.vercel.app npx cap sync ios # Vercel preview
 *
 * Unset (the default, and what CI/release builds always see) reproduces the
 * previous config byte for byte. `capacitor.config.json` is gitignored on both
 * platforms, so an override never leaks into a commit — but it does persist in
 * the native project until the next plain `cap sync`, so re-sync without the
 * variable before building anything you intend to ship.
 */
const serverUrl = process.env.CAP_SERVER_URL?.trim() || PROD_SERVER_URL;

if (!/^https?:\/\//.test(serverUrl)) {
  throw new Error(
    `CAP_SERVER_URL must start with http:// or https:// (got "${serverUrl}")`,
  );
}

/**
 * Cleartext is relaxed *only* for an http:// override — a https:// override
 * (Vercel preview) keeps the prod posture. Per-platform reality:
 *
 * - iOS needs nothing else: ATS exempts loopback, so the simulator loads
 *   http://localhost with no Info.plist exception. A physical device pointed at
 *   a LAN IP is a different story (ATS does apply there) and is out of scope.
 * - Android ignores this flag for the app WebView — cleartext is decided by
 *   `android/app/src/main/res/xml/network_security_config.xml`, which permits
 *   http to localhost / 10.0.2.2 (emulator alias for the host) and nothing
 *   else. The flag still matters for the Cordova plugin manifest, so keep it
 *   in sync with the scheme.
 * - `server.allowNavigation` is deliberately NOT set: Capacitor's Bridge
 *   already allows navigation within `server.url`'s own origin.
 */
const cleartext = serverUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'dev.southernlight.futari',
  appName: 'Futari',
  // Was "required by the CLI but unused". Since #1225 it carries exactly one
  // file: the bundled offline page below. `scripts/build-native-offline-page.ts`
  // regenerates it on the `capacitor:copy:before` hook (package.json), so `out/`
  // stays out of version control and a clean checkout no longer needs
  // `mkdir -p out` before `cap sync`.
  webDir: 'out',
  server: {
    url: serverUrl,
    cleartext,
    /**
     * #1225 — cold start with no network.
     *
     * The shell loads `server.url`, so with no network the WebView never gets
     * a byte and *no web code of ours runs at all*: not the offline banner, not
     * the Service Worker, not Sentry. The user gets the system WebView error
     * page or a blank screen, and nothing is reported anywhere. `errorPath` is
     * the only hook for that case: on a main-frame load failure both platforms
     * load this path from the **bundled** copy of `webDir` instead
     * (iOS `capacitor://localhost/offline.html` via the asset scheme handler,
     * Android `https://localhost/offline.html` via WebViewLocalServer).
     *
     * The page has to be self-contained — no network means no CDN, no fonts,
     * no JS bundle — and it cannot read the in-app language choice, because it
     * is served from a different origin than the site. See the generator script
     * for how the four locales and the retry target get baked in.
     *
     * Verifying it needs a real device in airplane mode; `npm run dev`, Vercel
     * previews and the simulator-with-wifi all look fine either way.
     */
    errorPath: 'offline.html',
  },
  android: {
    backgroundColor: '#FBEDE0',
  },
  plugins: {
    // #945 — the WebView runs edge-to-edge (Capacitor 8 default), so the soft
    // keyboard floated over the page without shrinking it: tall `dvh` sheets
    // kept full height, leaving a big blank gap with the save button hidden
    // behind the keyboard. `resize: 'native'` resizes the WebView itself when
    // the keyboard opens, so the web layer's `interactiveWidget:
    // 'resizes-content' (app/layout.tsx) can shrink `dvh` and keep inputs +
    // save visible. `resizeOnFullScreen` covers the edge-to-edge case.
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
