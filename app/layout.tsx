import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../components/AuthProvider';
import AuthBoundary from '../components/AuthBoundary';
import { LanguageProvider } from '../lib/i18n';

export const metadata: Metadata = {
  title: 'JobStack - Home Service CRM',
  description: 'AI-powered home service management platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900">
        <LanguageProvider>
          <AuthProvider>
            <AuthBoundary>{children}</AuthBoundary>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
