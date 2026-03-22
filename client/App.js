import React, { useEffect } from 'react';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { maybeCompleteAuthSession } from './src/services/googleAuth';

export default function App() {
  useEffect(() => {
    // Handle OAuth callback from Google
    maybeCompleteAuthSession();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
