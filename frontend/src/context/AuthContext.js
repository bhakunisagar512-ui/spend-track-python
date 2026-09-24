import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api';
import { GUEST_USER, isGuestSession, startGuestSession, clearGuestSession } from '../api/guestStore';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    if (isGuestSession()) return GUEST_USER;
    try { return JSON.parse(localStorage.getItem('spendai_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isGuestSession()) { setLoading(false); return; }
    const token = localStorage.getItem('spendai_token');
    if (!token) { setLoading(false); return; }
    authAPI.getMe()
      .then(res => { setUser(res.data.user); localStorage.setItem('spendai_user', JSON.stringify(res.data.user)); })
      .catch(() => { localStorage.removeItem('spendai_token'); localStorage.removeItem('spendai_user'); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  const saveAuth = useCallback((token, userData) => {
    clearGuestSession();
    localStorage.setItem('spendai_token', token);
    localStorage.setItem('spendai_user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const register = useCallback(async (name, email, password) => {
    const res = await authAPI.register({ name, email, password });
    saveAuth(res.data.token, res.data.user);
    return res.data;
  }, [saveAuth]);

  const login = useCallback(async (email, password) => {
    const res = await authAPI.login({ email, password });
    saveAuth(res.data.token, res.data.user);
    return res.data;
  }, [saveAuth]);

  const googleLogin = useCallback(async (credential) => {
    const res = await authAPI.googleAuth(credential);
    saveAuth(res.data.token, res.data.user);
    return res.data;
  }, [saveAuth]);

  const googleTokenLogin = useCallback(async (accessToken) => {
    const res = await authAPI.googleAuthToken(accessToken);
    saveAuth(res.data.token, res.data.user);
    return res.data;
  }, [saveAuth]);

  const startGuest = useCallback(() => {
    localStorage.removeItem('spendai_token');
    localStorage.removeItem('spendai_user');
    startGuestSession();
    setUser(GUEST_USER);
  }, []);

  const logout = useCallback(() => {
    clearGuestSession();
    localStorage.removeItem('spendai_token');
    localStorage.removeItem('spendai_user');
    setUser(null);
  }, []);

  const updateApiKey = useCallback(async (key) => {
    if (user?.is_guest) return;
    await authAPI.updateApiKey(key);
    const updated = { ...user, gemini_api_key: key };
    setUser(updated);
    localStorage.setItem('spendai_user', JSON.stringify(updated));
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, isGuest: !!user?.is_guest, register, login, googleLogin, googleTokenLogin, startGuest, logout, updateApiKey }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
