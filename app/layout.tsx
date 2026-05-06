import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../components/AuthProvider';
import AuthBoundary from '../components/AuthBoundary';

export const metadata: Metadata = {
  title: 'FieldPro Jobs - HomeService CRM',
  description: 'Complete home service management platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900">
        <AuthProvider>
          <AuthBoundary>{children}</AuthBoundary>
        </AuthProvider>
      </body>
    </html>
  );
}