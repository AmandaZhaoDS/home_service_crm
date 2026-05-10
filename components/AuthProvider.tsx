'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

const DEMO_NAMES = ['Jane Smith', 'Mike Johnson', 'Emily Davis'];

function migrateSampleData(data: FieldProData): FieldProData {
  const needsMigration = data.customers.some(c => DEMO_NAMES.includes(c.name));
  if (!needsMigration) return data;
  const rename = (s: string) => DEMO_NAMES.includes(s) ? `[Sample] ${s}` : s;
  return {
    ...data,
    customers: data.customers.map(c => DEMO_NAMES.includes(c.name) ? { ...c, name: `[Sample] ${c.name}` } : c),
    jobs: data.jobs.map(j => ({ ...j,
      customer: rename(j.customer),
      title: DEMO_NAMES.some(n => j.customer === n) && !j.title.startsWith('[Sample]') ? `[Sample] ${j.title}` : j.title,
    })),
    invoices: data.invoices.map(inv => ({ ...inv,
      customer: rename(inv.customer),
      jobTitle: DEMO_NAMES.some(n => inv.customer === n) && !inv.jobTitle.startsWith('[Sample]') ? `[Sample] ${inv.jobTitle}` : inv.jobTitle,
    })),
    appointments: data.appointments.map(a => ({ ...a, customer: rename(a.customer) })),
  };
}

async function fetchUserRecord(userId: string, email: string): Promise<{ user: UserAccount; data: FieldProData }> {
  const [{ data: profile }, { data: crmRow }] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', userId).single(),
    supabase.from('user_crm_data').select('data').eq('user_id', userId).single(),
  ]);

  const raw = (crmRow?.data as FieldProData) ?? getDefaultData();
  return {
    user: {
      id: userId,
      name: profile?.name ?? email.split('@')[0],
      email,
    },
    data: migrateSampleData(raw),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [data, setData] = useState<FieldProData | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks when the user just registered so a SIGNED_OUT event (e.g. from an
  // unconfirmed email flow) doesn't immediately evict the manually-set user.
  const justRegistered = useRef(false);

  useEffect(() => {
    // resolved tracks whether we've committed to a loaded state (user or no user).
    // Only the first call to resolve() takes effect; subsequent calls are no-ops.
    let resolved = false;
    let loadingTimerId: ReturnType<typeof setTimeout>;

    const resolve = (sess: { id: string; email: string } | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(loadingTimerId);
      if (sess) {
        setUser(prev => prev ?? { id: sess.id, name: sess.email.split('@')[0], email: sess.email });
        setLoading(false);
        fetchUserRecord(sess.id, sess.email)
          .then(record => { setUser(record.user); setData(record.data); })
          .catch(() => {});
      } else {
        setLoading(false);
      }
    };

    // Safety net: if both onAuthStateChange and getSession() hang (e.g. slow network),
    // force-clear loading after 8 s so the user is never permanently stuck.
    loadingTimerId = setTimeout(() => resolve(null), 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        // Don't clear a manually-set user immediately after registration
        // (some Supabase setups fire SIGNED_OUT for unconfirmed-email accounts).
        if (!justRegistered.current) {
          setUser(null);
          setData(null);
        }
        resolve(null);
        return;
      }

      if (event === 'INITIAL_SESSION') {
        if (session) {
          // Non-expired session — fast path: resolve immediately.
          resolve({ id: session.user.id, email: session.user.email! });
        }
        // session is null: access token is expired and Supabase is refreshing it.
        // Don't resolve yet — TOKEN_REFRESHED or getSession() below will handle it.
        return;
      }

      if (!session) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Covers the token-refresh path: resolve with the refreshed session.
        resolve({ id: session.user.id, email: session.user.email! });
        try {
          const record = await fetchUserRecord(session.user.id, session.user.email!);
          setUser(record.user);
          setData(record.data);
        } catch { /* keep existing state */ }
      }
    });

    // getSession() performs token refresh when the access token is expired.
    // It runs concurrently with onAuthStateChange and wins if INITIAL_SESSION
    // fired with null (expired token case). resolve() is idempotent so there
    // is no double-init if TOKEN_REFRESHED also fires.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session) {
          resolve({ id: session.user.id, email: session.user.email! });
        } else {
          resolve(null);
        }
      })
      .catch(() => resolve(null));

    return () => { subscription.unsubscribe(); clearTimeout(loadingTimerId); };
  }, []);

  const login = async (email: string, password: string) => {
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: error.message };
    if (authData.user) {
      setUser({
        id: authData.user.id,
        name: authData.user.email!.split('@')[0],
        email: authData.user.email!,
      });
      // Start loading full profile + CRM data immediately so it's ready by
      // the time the user reaches the dashboard. The SIGNED_IN event handler
      // also does this; the second fetch is a no-op if data arrives first.
      fetchUserRecord(authData.user.id, authData.user.email!)
        .then(record => { setUser(record.user); setData(record.data); })
        .catch(() => {});
    }
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

    // Protect the manually-set user from a spurious SIGNED_OUT that some Supabase
    // configurations fire when email confirmation is pending.
    justRegistered.current = true;
    setTimeout(() => { justRegistered.current = false; }, 30_000);

    setUser({ id: userId, name, email });
    setData(defaultData);
    return { success: true };
  };

  const logout = () => {
    // Clear state immediately for instant navigation; signOut cleans up the session.
    setUser(null);
    setData(null);
    supabase.auth.signOut();
  };

  const updateData = useCallback(
    (nextData: FieldProData) => {
      if (!user) return;
      setData(nextData);
      supabase
        .from('user_crm_data')
        .update({ data: nextData })
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) console.error('[FieldPro] save failed:', error.message);
        });
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
