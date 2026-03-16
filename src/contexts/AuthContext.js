import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as mockLogin } from '../services/authService';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('siara_user');
        if (raw) setUser(JSON.parse(raw));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (user) {
      AsyncStorage.setItem('siara_user', JSON.stringify(user));
    } else {
      AsyncStorage.removeItem('siara_user');
    }
  }, [user]);

  async function login(identifier, password, remember) {
    const res = await mockLogin(identifier, password);
    if (res && res.user) {
      const storedUser = { ...res.user, token: res.token };
      setUser(storedUser);
      return storedUser;
    }
    throw new Error('Authentication failed');
  }

  function logout() {
    setUser(null);
    AsyncStorage.removeItem('siara_user');
  }

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
