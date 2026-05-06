'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FieldProData, UserAccount, getDefaultData } from '../lib/fieldproStorage';

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

async function fetchUserRecord(userId: string, email: string): Promise<{ user: UserAccount; data: FieldProData }> {
  const [{ data: profile }, { data: crmRow }] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', userId).single(),
    supabase.from('user_crm_data').select('data').eq('user_id', userId).single(),
  ]);

  return {
    user: {
      id: userId,
      name: profile?.name ?? email.split('@')[0],
      email,
    },
    data: (crmRow?.data as FieldProData) ?? getDefaultData(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [data, setData] = useState<FieldProData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session on mount
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session) {
          const record = await fetchUserRecord(session.user.id, session.user.email!);
          setUser(record.user);
          setData(record.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Keep session in sync (tab focus, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setData(null);
        return;
      }
      // Ignore events with no session (e.g. INITIAL_SESSION on unauthenticated mount)
      // to avoid wiping state set by register()
      if (!session) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        try {
          const record = await fetchUserRecord(session.user.id, session.user.email!);
          setUser(record.user);
          setData(record.data);
        } catch {
          // fetchUserRecord failed; keep existing state
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: error.message };
    return { success: true };
  };

  const register = async (name: string, email: string, password: string) => {
    const { data: authData, error } = await supabase.auth.signUp({ email, password });
    if (error) return { success: false, message: error.message };

    const userId = authData.user!.id;
    const defaultData = getDefaultData();

    await Promise.all([
      supabase.from('profiles').insert({ id: userId, name }),
      supabase.from('user_crm_data').insert({ user_id: userId, data: defaultData }),
    ]);

    setUser({ id: userId, name, email });
    setData(defaultData);
    return { success: true };
  };

  const logout = () => {
    supabase.auth.signOut();
  };

  const updateData = useCallback(
    (nextData: FieldProData) => {
      if (!user) return;
      setData(nextData);
      supabase
        .from('user_crm_data')
        .upsert({ user_id: user.id, data: nextData, updated_at: new Date().toISOString() });
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, data, loading, login, register, logout, updateData }),
    [user, data, loading, updateData],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
