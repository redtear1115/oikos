import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.southernlight.futari',
  appName: 'Futari',
  webDir: 'out', // required by Capacitor CLI but unused — we override with server.url
  server: {
    url: 'https://futari.southern-light.dev',
    cleartext: false,
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
