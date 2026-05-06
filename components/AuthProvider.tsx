'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  FieldProData,
  UserAccount,
  getSession,
  getUsers,
  getUserData,
  loginUser,
  logoutUser,
  registerUser,
  saveUserData,
} from '../lib/fieldproStorage';

interface AuthContextValue {
  user: UserAccount | null;
  data: FieldProData | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  updateData: (nextData: FieldProData) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [data, setData] = useState<FieldProData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (session) {
      const users = getUsers();
      const current = users.find((item) => item.id === session.userId) || null;
      if (current) {
        setUser(current);
        setData(getUserData(current.id));
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const result = loginUser(email, password);
    if (!result.success) {
      return { success: false, message: result.message };
    }
    setUser(result.user);
    setData(result.data);
    return { success: true };
  };

  const register = async (name: string, email: string, password: string) => {
    const result = registerUser(name, email, password);
    if (!result.success) {
      return { success: false, message: result.message };
    }
    setUser(result.user);
    setData(getUserData(result.user.id));
    return { success: true };
  };

  const logout = () => {
    logoutUser();
    setUser(null);
    setData(null);
  };

  const updateData = (nextData: FieldProData) => {
    if (!user) return;
    setData(nextData);
    saveUserData(user.id, nextData);
  };

  const value = useMemo(
    () => ({ user, data, loading, login, register, logout, updateData }),
    [user, data, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
