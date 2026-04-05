import type { Metadata } from 'next';
import './globals.css';
import { JetBrains_Mono } from 'next/font/google';
import DemoBanner from '@/components/DemoBanner';
import { ToastProvider } from '@/components/Toast';
import { ChatProvider } from '@/components/chat/ChatProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Autensa',
  description: 'AI Agent Orchestration Dashboard',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body className={`${jetbrainsMono.className} bg-autensa-bg text-autensa-text min-h-screen`}>
        <ErrorBoundary>
          <ToastProvider>
            <DemoBanner />
            <ChatProvider>
              {children}
            </ChatProvider>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
