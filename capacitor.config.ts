import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.fiatwallet.twa',
  appName: 'FiatWallet',
  webDir: 'dist',
  server: {
    // For production: load bundled web assets from dist/
    // For development: uncomment the line below to use live Vite server
    // url: 'http://10.0.2.2:5173',
    // cleartext: true,
  },
  android: {
    // Allow the WebView to load https:// URLs
    allowMixedContent: false,
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
