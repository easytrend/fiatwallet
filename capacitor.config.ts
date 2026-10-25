import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.fiatwallet.twa',
  appName: 'FiatWallet',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'fiatwallet.app',
  },
  android: {
    // Allow the WebView to load mixed content / local sockets
    allowMixedContent: true,
    // Enable hardware acceleration
    hardwareAccelerated: true,
    // Minimum target SDK
    minWebViewVersion: 60,
  },
  plugins: {
    // SplashScreen configuration
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#0a1628',
      showSpinner: false,
      androidSplashResourceName: 'splash',
    },
  },
};

export default config;
