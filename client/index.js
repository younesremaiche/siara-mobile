import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import App from './App';
import { ensureSiaraRiskNotificationWired } from './src/services/siaraRiskNotificationService';

// Notifee requires registerForegroundService and onBackgroundEvent to be wired
// before the app renders, so the runtime can deliver action presses (e.g. Stop)
// even when the JS app is otherwise inactive.
ensureSiaraRiskNotificationWired();

registerRootComponent(App);
