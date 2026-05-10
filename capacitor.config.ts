import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.noteify.app',
  appName: 'Noteify',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_noteify',
      iconColor: '#6366f1'
    }
  }
};

export default config;
