'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';

export default function RegisterPage() {
  const router = useRouter();
  const { user, register } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (user && step === 1) {
      setStep(2);
    }
  }, [user, step]);

  useEffect(() => {
    if (user && step === 2) {
      // Check if coming back from Google OAuth
      const params = new URLSearchParams(window.location.search);
      if (params.get('google_connected') === 'true' || params.get('skip_google')) {
        router.replace('/');
      }
    }
  }, [user, step, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await register(name, email, password);
    if (!result.success) {
      setError(result.message || 'Registration failed.');
      return;
    }
  };

  const handleConnectGoogle = async () => {
    if (!user?.id) return;
    setIsConnecting(true);
    // Redirect to Google OAuth
    window.location.href = `/api/google/auth?userId=${user.id}`;
  };

  const handleSkipGoogle = () => {
    router.push('/');
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl bg-white px-6 py-10 shadow-xl sm:px-10">
      {step === 1 ? (
        <>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-600 text-white text-lg font-bold">JP</div>
            <h1 className="text-2xl font-semibold text-slate-900">Create your account</h1>
            <p className="text-sm text-slate-500">Register a new JobPilot account to save your work.</p>
          </div>

          {error && <div className="mb-4 rounded-2xl bg-red-100 px-4 py-3 text-sm text-red-700">{error}</div>}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700">Name</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-3xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Create Account
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-green-500 text-white text-2xl font-bold">✓</div>
            <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user?.name}!</h1>
            <p className="text-sm text-slate-500 mt-2">Connect your Google account to import contacts and sync your calendar.</p>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-blue-50 p-4 border border-blue-100">
              <h3 className="font-semibold text-blue-900 mb-2 text-sm">Why connect Google?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>✓ Import your Google Contacts as potential customers</li>
                <li>✓ Sync appointments with your Google Calendar</li>
                <li>✓ Keep all your schedules in sync automatically</li>
              </ul>
            </div>

            <button
              onClick={handleConnectGoogle}
              disabled={isConnecting}
              className="w-full rounded-3xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Connect with Google
            </button>

            <button
              onClick={handleSkipGoogle}
              className="w-full rounded-3xl border-2 border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Skip for now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
