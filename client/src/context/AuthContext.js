import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);

const TOKEN_KEY = 'nexportal_token';

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage token
  const restoreSession = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }
    try {
      const data = await authAPI.me();
      setUser(data.user);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { restoreSession(); }, [restoreSession]);

  const signIn = async (email, password) => {
    const data = await authAPI.login(email, password);
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data;
  };

  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  };

  const refreshUser = async () => {
    const data = await authAPI.me();
    setUser(data.user);
  };

  const isAdmin      = user?.role === 'super_admin' || user?.role === 'sub_admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const isPM         = user?.role === 'project_manager';
  const isCoord      = user?.role === 'coordinator';

  // Effective manager ID — coords see their PM's data
  const effectiveManagerId =
    user?.role === 'coordinator'      ? user.manager_id :
    user?.role === 'project_manager'  ? user.id :
    null; // null = admin sees everything

  return (
    <AuthContext.Provider value={{
      user, loading,
      signIn, signOut, refreshUser,
      isAdmin, isSuperAdmin, isPM, isCoord,
      effectiveManagerId,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
