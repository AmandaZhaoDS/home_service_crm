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
    // INITIAL_SESSION fires on the next tick (much faster than a getSession() roundtrip).
    // We use it as the primary signal to resolve the loading state.
    // getSession() is kept as a fallback in case INITIAL_SESSION never fires.
    let initialSessionFired = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setData(null);
        // Ensure loading is cleared even if it fires before INITIAL_SESSION
        if (!initialSessionFired) { initialSessionFired = true; setLoading(false); }
        return;
      }

      if (event === 'INITIAL_SESSION') {
        initialSessionFired = true;
        if (session) {
          try {
            const record = await fetchUserRecord(session.user.id, session.user.email!);
            setUser(record.user);
            setData(record.data);
          } catch { /* keep null; loading will still clear */ }
        }
        setLoading(false);
        return;
      }

      // Don't clear state on events with no session (avoids wiping register() manual setUser)
      if (!session) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        try {
          const record = await fetchUserRecord(session.user.id, session.user.email!);
          setUser(record.user);
          setData(record.data);
        } catch { /* keep existing state */ }
      }
    });

    // Fallback: if onAuthStateChange never fires INITIAL_SESSION, getSession() resolves loading
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (initialSessionFired) return;
        if (session) {
          try {
            const record = await fetchUserRecord(session.user.id, session.user.email!);
            setUser(record.user);
            setData(record.data);
          } catch { /* keep null */ }
        }
        setLoading(false);
      })
      .catch(() => { if (!initialSessionFired) setLoading(false); });

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
