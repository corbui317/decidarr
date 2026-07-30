import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { AppProvider } from '@/context/AppContext';
import { ThemeProvider } from '@/context/ThemeContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import ErrorLogger from '@/components/ErrorLogger';
import PwaRegistration from '@/components/PwaRegistration';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Decidarr - Plex Movie Roulette',
  description: "Can't decide what to watch? Let fate decide!",
  applicationName: 'Decidarr',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Decidarr',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: '/icons/icon-192.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon-192.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#E5A00D',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body className={`${inter.className} bg-decidarr-dark safe-area-padding`}>
        <ErrorBoundary>
          <AppProvider>
            <AuthProvider>
              <ThemeProvider>
                <ErrorLogger />
                <PwaRegistration />
                {children}
              </ThemeProvider>
            </AuthProvider>
          </AppProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
