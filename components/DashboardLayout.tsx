'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from './AuthProvider';
import { useLanguage, LANGUAGES } from '../lib/i18n';
import VoiceAssistant from './VoiceAssistant';
import FeedbackWidget from './FeedbackWidget';

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" strokeLinecap="round"/>
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
    </svg>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, data, logout, refreshUser } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [localPhone, setLocalPhone] = useState<string | null>(null);

  const handleProvision = async () => {
    if (!user || provisioning) return;
    setProvisioning(true);
    setProvisionError(null);
    try {
      const res = await fetch('/api/twilio/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const json = await res.json();
      if (res.ok && json.phoneNumber) {
        setLocalPhone(json.phoneNumber); // show immediately before refreshUser
        await refreshUser();             // sync to global auth state
      } else {
        setProvisionError(json.error ?? 'Failed — check Vercel env vars');
      }
    } catch {
      setProvisionError('Network error — try again');
    }
    setProvisioning(false);
  };

  const displayPhone = user?.smsPhone ?? localPhone;
  const [createOpen, setCreateOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);

  const upcomingReminders = useMemo(() => {
    if (!data?.reminders) return 0;
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86_400_000);
    return data.reminders.filter(r => {
      if (r.done) return false;
      const d = new Date(r.dueDate);
      return d >= now && d <= in7;
    }).length;
  }, [data?.reminders]);

  const navItems = [
    { name: t('nav.dashboard'), href: '/' },
    { name: t('nav.jobs'), href: '/jobs' },
    { name: t('nav.customers'), href: '/customers' },
    { name: t('nav.schedule'), href: '/schedule' },
    { name: t('nav.invoices'), href: '/invoices' },
  ];

  const handleCreate = (type: 'job' | 'estimate' | 'customer' | 'invoice') => {
    setCreateOpen(false);
    sessionStorage.setItem('global-create', JSON.stringify({ type }));
    const dest = type === 'job' || type === 'estimate' ? '/jobs' : type === 'customer' ? '/customers' : '/invoices';
    if (pathname === dest) {
      window.dispatchEvent(new CustomEvent('global-create', { detail: { type } }));
    } else {
      router.push(dest);
    }
  };

  const firstName = user?.name?.split(' ')[0] ?? 'Alex';
  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  const currentLang = LANGUAGES.find(l => l.code === lang);

  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [langOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!createOpen) return;
    const handler = (e: MouseEvent) => {
      if (createRef.current && !createRef.current.contains(e.target as Node)) setCreateOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [createOpen]);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Left: hamburger (mobile) + logo */}
            <div className="flex items-center gap-3">
              {/* Hamburger — mobile only */}
              <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden p-2 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Open menu"
              >
                <HamburgerIcon />
              </button>

              {/* Logo */}
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                  <BriefcaseIcon />
                </div>
                <span className="text-base font-semibold tracking-tight">
                  <span className="text-gray-800">Job</span><span className="text-blue-600 font-bold">Stack</span>
                </span>
              </div>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-0.5">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            {/* Right: Bell + Create+ + Language + User */}
            <div className="flex items-center gap-3">
              {/* Bell notification */}
              <button
                onClick={() => router.push('/jobs')}
                className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label="Reminders"
              >
                <BellIcon />
                {upcomingReminders > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                    {upcomingReminders > 9 ? '9+' : upcomingReminders}
                  </span>
                )}
              </button>
              {/* Create+ */}
              <div className="relative" ref={createRef}>
                <button
                  onClick={() => setCreateOpen(o => !o)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
                  </svg>
                  <span className="hidden sm:inline">{t('nav.createNew')}</span>
                </button>
                {createOpen && (
                  <div className="absolute right-0 top-11 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-[60] min-w-[180px]">
                    {[
                      { type: 'job' as const, label: t('nav.newJob'), icon: '🔧' },
                      { type: 'estimate' as const, label: t('nav.newEstimate'), icon: '📋' },
                      { type: 'customer' as const, label: t('nav.newCustomer'), icon: '👤' },
                      { type: 'invoice' as const, label: t('nav.newInvoice'), icon: '🧾' },
                    ].map(item => (
                      <button key={item.type} onClick={() => handleCreate(item.type)}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                        <span>{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Language Picker */}
              <div className="relative" ref={langRef}>
                <button
                  onClick={() => setLangOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm text-gray-600 font-medium"
                >
                  <GlobeIcon />
                  <span className="hidden sm:inline">{currentLang?.label ?? 'EN'}</span>
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-11 bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-[60] min-w-[160px] max-h-80 overflow-y-auto">
                    {LANGUAGES.map(l => (
                      <button
                        key={l.code}
                        onClick={() => { setLang(l.code); setLangOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between
                          ${lang === l.code ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        {l.label}
                        {lang === l.code && (
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* User menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(o => !o)}
                  className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold select-none hover:bg-blue-700 transition-colors"
                  aria-label="User menu"
                >
                  {initials}
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-12 bg-white border border-gray-200 rounded-xl shadow-xl py-1 z-[60] min-w-[200px]">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{user?.name ?? firstName}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{user?.email}</p>
                      {displayPhone ? (
                        <p className="text-xs text-blue-600 font-mono mt-1">📱 {displayPhone}</p>
                      ) : (
                        <>
                          <button onClick={handleProvision} disabled={provisioning}
                            className="mt-1.5 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors">
                            {provisioning ? '⏳ Getting number…' : '+ Get SMS number'}
                          </button>
                          {provisionError && <p className="text-xs text-red-500 mt-0.5">{provisionError}</p>}
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => { logout(); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                      </svg>
                      {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile slide-in drawer */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-[80] w-72 bg-white shadow-2xl flex flex-col md:hidden">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                  <BriefcaseIcon />
                </div>
                <span className="text-sm font-semibold">
                  <span className="text-gray-800">Job</span><span className="text-blue-600 font-bold">Stack</span>
                </span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <XIcon />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {item.name}
                    {active && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600"/>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Dev tools */}
            <div className="px-3 pb-2">
              <Link href="/changerequested"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors">
                🐛 Change Requests
              </Link>
            </div>

            {/* Language picker in drawer */}
            <div className="px-4 py-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">{t('nav.language')}</p>
              <div className="grid grid-cols-2 gap-1">
                {LANGUAGES.map(l => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={`text-xs py-2 px-3 rounded-lg font-medium text-left transition-colors ${
                      lang === l.code
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* User + logout */}
            <div className="px-4 py-4 border-t border-gray-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{user?.name ?? firstName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  {displayPhone ? (
                    <p className="text-xs text-blue-600 font-mono mt-0.5">📱 {displayPhone}</p>
                  ) : (
                    <>
                      <button onClick={handleProvision} disabled={provisioning}
                        className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 mt-0.5 transition-colors">
                        {provisioning ? '⏳ Getting number…' : '+ Get SMS number'}
                      </button>
                      {provisionError && <p className="text-xs text-red-500">{provisionError}</p>}
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => { logout(); setMobileOpen(false); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
                {t('nav.logout')}
              </button>
            </div>
          </div>
        </>
      )}

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Floating Voice Assistant */}
      <VoiceAssistant />
      {/* Floating Feedback Widget */}
      <FeedbackWidget />
    </div>
  );
}
