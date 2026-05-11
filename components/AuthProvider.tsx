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
  refreshUser: () => Promise<void>;
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

// Fetch via admin-backed API route so RLS timing never blocks the read.
// accessToken is passed in directly from the auth event — avoids a second
// getSession() call which can return a stale/expired token on first load.
async function fetchUserRecord(
  userId: string,
  email: string,
  accessToken: string,
): Promise<{ user: UserAccount; data: FieldProData }> {
  const res = await fetch('/api/user/sync', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    console.error('[Auth] /api/user/sync failed:', res.status, text);
    throw new Error(`Sync failed: ${res.status}`);
  }
  const json = await res.json() as { name: string; crmData: FieldProData | null; smsPhone: string | null };

  return {
    user: {
      id: userId,
      name: json.name,
      email,
      smsPhone: json.smsPhone ?? undefined,
    },
    data: migrateSampleData(json.crmData ?? getDefaultData()),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [data, setData] = useState<FieldProData | null>(null);
  const [loading, setLoading] = useState(true);
  const justRegistered = useRef(false);
  // True only after a successful fetchUserRecord completes.
  // updateData is blocked until this is set so that a cold-start fallback
  // (which sets data=null) can never trigger a DB write that overwrites real records.
  const dataFromDB = useRef(false);

  useEffect(() => {
    let resolved = false;
    let loadingTimerId: ReturnType<typeof setTimeout>;

    const resolve = (sess: { id: string; email: string; token: string } | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(loadingTimerId);
      if (sess) {
        // Safety fallback: if the API never responds (e.g. Vercel cold start > 30s)
        // unblock loading but leave data=null so updateData stays blocked.
        const fetchFallback = setTimeout(() => {
          setUser({ id: sess.id, name: sess.email.split('@')[0], email: sess.email });
          setLoading(false);
          // data stays null — updateData will not write to DB
        }, 30_000);

        fetchUserRecord(sess.id, sess.email, sess.token)
          .then(record => {
            clearTimeout(fetchFallback);
            dataFromDB.current = true;
            setUser(record.user);
            setData(record.data);
            setLoading(false);
          })
          .catch(err => {
            clearTimeout(fetchFallback);
            console.error('[Auth] fetchUserRecord failed:', err);
            setUser({ id: sess.id, name: sess.email.split('@')[0], email: sess.email });
            // Keep data=null — do NOT fall back to getDefaultData() here because
            // any updateData call that runs before a successful fetch would write
            // sample data to the DB and overwrite the user's real records.
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    };

    loadingTimerId = setTimeout(() => resolve(null), 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        if (!justRegistered.current) {
          setUser(null);
          setData(null);
          dataFromDB.current = false;
        }
        resolve(null);
        return;
      }

      if (event === 'INITIAL_SESSION') {
        if (session) {
          resolve({ id: session.user.id, email: session.user.email!, token: session.access_token });
        }
        return;
      }

      if (!session) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        resolve({ id: session.user.id, email: session.user.email!, token: session.access_token });
        try {
          const record = await fetchUserRecord(session.user.id, session.user.email!, session.access_token);
          dataFromDB.current = true;
          setUser(record.user);
          setData(record.data);
        } catch { /* keep existing state */ }
      }
    });

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session) {
          resolve({ id: session.user.id, email: session.user.email!, token: session.access_token });
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
    if (authData.user && authData.session) {
      setUser({ id: authData.user.id, name: authData.user.email!.split('@')[0], email: authData.user.email! });
      fetchUserRecord(authData.user.id, authData.user.email!, authData.session.access_token)
        .then(record => { dataFromDB.current = true; setUser(record.user); setData(record.data); })
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

    justRegistered.current = true;
    setTimeout(() => { justRegistered.current = false; }, 30_000);

    dataFromDB.current = true;
    setUser({ id: userId, name, email });
    setData(defaultData);

    fetch('/api/twilio/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
      .then(r => r.json())
      .then(({ phoneNumber }) => {
        if (phoneNumber) setUser(prev => prev ? { ...prev, smsPhone: phoneNumber } : prev);
      })
      .catch(() => {});

    return { success: true };
  };

  const logout = () => {
    setUser(null);
    setData(null);
    dataFromDB.current = false;
    supabase.auth.signOut();
  };

  const refreshUser = useCallback(async () => {
    if (!user) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const record = await fetchUserRecord(user.id, user.email, session.access_token);
      dataFromDB.current = true;
      setUser(record.user);
      setData(record.data);
    } catch { /* ignore */ }
  }, [user]);

  const updateData = useCallback(
    (nextData: FieldProData) => {
      // Block writes until we have confirmed data from DB.
      // This prevents a cold-start fallback from overwriting real records with sample data.
      if (!user || !dataFromDB.current) {
        console.warn('[Auth] updateData blocked — DB data not yet loaded');
        return;
      }
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
    () => ({ user, data, loading, login, register, logout, updateData, refreshUser }),
    [user, data, loading, updateData, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
