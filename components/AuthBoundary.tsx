'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import DashboardLayout from './DashboardLayout';

export default function AuthBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/register')
    || pathname.startsWith('/privacy') || pathname.startsWith('/terms');

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace('/login');
    }

    if (!loading && user && (pathname.startsWith('/login') || pathname.startsWith('/register'))) {
      router.replace('/');
    }
  }, [loading, user, pathname, isPublic, router]);

  if (pathname.startsWith('/login') || pathname.startsWith('/register')) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">{children}</div>;
  }

  if (pathname.startsWith('/privacy') || pathname.startsWith('/terms')) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10 gap-3">
        <div className="text-sm text-slate-500">Loading your dashboard...</div>
        <a href="/login" className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors">
          Return to login
        </a>
      </div>
    );
  }

  if (!user) return null;

  return <DashboardLayout>{children}</DashboardLayout>;
}
