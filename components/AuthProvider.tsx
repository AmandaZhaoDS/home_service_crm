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
    // INITIAL_SESSION fires on the next tick (much faster than a getSession() roundtrip).
    // We use it as the primary signal to resolve the loading state.
    // getSession() is kept as a fallback in case INITIAL_SESSION never fires.
    let initialSessionFired = false;

    // Safety net: if Supabase hangs on a token refresh (e.g. expired token + slow network),
    // neither INITIAL_SESSION nor getSession() will resolve. Force-clear loading after 8 s
    // so the user is never permanently stuck on the loading screen.
    const loadingTimeout = setTimeout(() => {
      if (!initialSessionFired) {
        initialSessionFired = true;
        setLoading(false);
      }
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        // Don't clear a manually-set user immediately after registration
        // (some Supabase setups fire SIGNED_OUT for unconfirmed-email accounts).
        if (!justRegistered.current) {
          setUser(null);
          setData(null);
        }
        if (!initialSessionFired) { initialSessionFired = true; setLoading(false); }
        return;
      }

      if (event === 'INITIAL_SESSION') {
        initialSessionFired = true;
        if (session) {
          // Set a placeholder user immediately so the app doesn't redirect to /login
          // while user data is still loading from Supabase.
          setUser(prev => prev ?? {
            id: session.user.id,
            name: session.user.email!.split('@')[0],
            email: session.user.email!,
          });
          // Resolve loading right away — don't await the DB fetch.
          setLoading(false);
          // Load full profile + CRM data in the background.
          fetchUserRecord(session.user.id, session.user.email!)
            .then(record => { setUser(record.user); setData(record.data); })
            .catch(() => {});
        } else {
          setLoading(false);
        }
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
          // Resolve loading immediately with placeholder (same as INITIAL_SESSION path)
          // so navigation from voice assistant doesn't show loading screen
          setUser(prev => prev ?? {
            id: session.user.id,
            name: session.user.email!.split('@')[0],
            email: session.user.email!,
          });
          setLoading(false);
          try {
            const record = await fetchUserRecord(session.user.id, session.user.email!);
            setUser(record.user);
            setData(record.data);
          } catch { /* keep null */ }
        } else {
          setLoading(false);
        }
      })
      .catch(() => { if (!initialSessionFired) setLoading(false); });

    return () => { subscription.unsubscribe(); clearTimeout(loadingTimeout); };
  }, []);

  const login = async (email: string, password: string) => {
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: error.message };
    // Set placeholder unconditionally so the login page can safely call
    // router.replace('/') right after this returns — AuthBoundary will see
    // user != null and render the dashboard instead of bouncing to /login.
    if (authData.user) {
      setUser({
        id: authData.user.id,
        name: authData.user.email!.split('@')[0],
        email: authData.user.email!,
      });
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
