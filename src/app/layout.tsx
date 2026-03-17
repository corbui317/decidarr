import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { AppProvider } from '@/context/AppContext';
import { ThemeProvider } from '@/context/ThemeContext';
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
    <html lang="en" data-theme="dark">
      <body className={`${inter.className} bg-decidarr-dark`}>
        <ErrorBoundary>
          <AppProvider>
            <AuthProvider>
              <ThemeProvider>
                {children}
              </ThemeProvider>
            </AuthProvider>
          </AppProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
