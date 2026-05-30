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
};

export default config;
