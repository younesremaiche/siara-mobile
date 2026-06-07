import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { NotificationsProvider } from './src/contexts/NotificationsContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { maybeCompleteAuthSession } from './src/services/googleAuth';
import { logResolvedApiBaseUrl } from './src/config/api';
import { initializeNotificationPresentationAsync } from './src/services/mobilePushService';
import { tryResumeSiaraLiveRiskNotification } from './src/services/siaraRiskNotificationService';
import { ServerStateProvider } from './src/services/query/queryClient';

export default function App() {
  useEffect(() => {
    maybeCompleteAuthSession();
    logResolvedApiBaseUrl();
    initializeNotificationPresentationAsync().catch((error) => {
      if (__DEV__) {
        console.warn('[push] notification_presentation_init_failed', {
          message: error?.message || 'Unknown notification init error',
        });
      }
    });
    tryResumeSiaraLiveRiskNotification().catch((error) => {
      if (__DEV__) {
        console.warn('[siaraLiveRisk] resume_failed', error?.message);
      }
    });
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ServerStateProvider>
          <AuthProvider>
            <NotificationsProvider>
              <StatusBar backgroundColor="#F6F7FB" barStyle="dark-content" translucent={false} />
              <AppNavigator />
            </NotificationsProvider>
          </AuthProvider>
        </ServerStateProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
