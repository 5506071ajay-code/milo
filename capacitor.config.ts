import type { CapacitorConfig } from '@capacitor/cli';

// The app bundles the MILO web UI and asks for the server address on first run (Settings → server),
// so one APK works with any MILO deployment. Google sign-in opens the system browser and returns
// through the com.milo.app:// deep link (Google does not allow OAuth inside WebViews).
const config: CapacitorConfig = {
  appId: 'com.milo.app', appName: 'MILO', webDir: 'dist',
  android: { allowMixedContent: false, backgroundColor: '#F3F5F2' },
  server: { androidScheme: 'https', cleartext: true },
  plugins: { CapacitorHttp: { enabled: false } },
};
export default config;
