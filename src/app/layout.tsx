import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { AppProvider } from '@/context/AppContext';
import ErrorBoundary from '@/components/ErrorBoundary';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Decidarr - Plex Movie Roulette',
  description: "Can't decide what to watch? Let fate decide!",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-decidarr-dark`}>
        <ErrorBoundary>
          <AppProvider>
            <AuthProvider>{children}</AuthProvider>
          </AppProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
