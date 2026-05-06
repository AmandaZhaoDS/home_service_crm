'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useLanguage, LANGUAGES } from '../lib/i18n';
import VoiceAssistant from './VoiceAssistant';

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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { name: t('nav.dashboard'), href: '/' },
    { name: t('nav.jobs'), href: '/jobs' },
    { name: t('nav.customers'), href: '/customers' },
    { name: t('nav.schedule'), href: '/schedule' },
    { name: t('nav.invoices'), href: '/invoices' },
  ];

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                <BriefcaseIcon />
              </div>
              <span className="text-base font-semibold tracking-tight">
                <span className="text-gray-800">FieldPro</span>{' '}
                <span className="text-blue-600 font-bold">Jobs</span>
              </span>
            </div>

            {/* Nav */}
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

            {/* Right: Language + User */}
            <div className="flex items-center gap-3">
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

              {/* User */}
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-gray-900 leading-tight">{t('nav.hi')}, {firstName}</p>
                <button
                  onClick={logout}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {t('nav.role')} ▾
                </button>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold select-none cursor-pointer">
                {initials}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Floating Voice Assistant - rendered in all pages */}
      <VoiceAssistant />
    </div>
  );
}
