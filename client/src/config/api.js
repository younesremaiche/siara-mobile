import { Platform } from 'react-native';

// Android emulator uses 10.0.2.2 to reach host machine's localhost.
// iOS simulator and web use localhost directly.
// For a physical device on the same Wi-Fi, replace with your computer's local IP.
const LOCALHOST = Platform.OS === 'android' ? '192.168.1.9' : 'localhost';

export const API_BASE_URL = `http://${LOCALHOST}:5000`;
