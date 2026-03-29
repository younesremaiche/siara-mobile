import React, { useEffect } from 'react';
import { AuthProvider } from './src/contexts/AuthContext';
import { NotificationsProvider } from './src/contexts/NotificationsContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { maybeCompleteAuthSession } from './src/services/googleAuth';
import { logResolvedApiBaseUrl } from './src/config/api';
import { initializeNotificationPresentationAsync } from './src/services/mobilePushService';

export default function App() {
  useEffect(() => {
    // Handle OAuth callback for Google sign-in
    maybeCompleteAuthSession();
    logResolvedApiBaseUrl();
    initializeNotificationPresentationAsync().catch((error) => {
      if (__DEV__) {
        console.warn('[push] notification_presentation_init_failed', {
          message: error?.message || 'Unknown notification init error',
        });
      }
    });
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationsProvider>
          <AppNavigator />
        </NotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
