'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import DashboardLayout from './DashboardLayout';

export default function AuthBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user && !pathname.startsWith('/login') && !pathname.startsWith('/register')) {
      router.replace('/login');
    }

    if (!loading && user && (pathname.startsWith('/login') || pathname.startsWith('/register'))) {
      router.replace('/');
    }
  }, [loading, user, pathname, router]);

  if (pathname.startsWith('/login') || pathname.startsWith('/register')) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">{children}</div>;
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="text-sm text-slate-500">Loading your dashboard...</div>
      </div>
    );
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
