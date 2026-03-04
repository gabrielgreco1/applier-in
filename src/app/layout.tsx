import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoApply',
  description: 'AI-powered LinkedIn job application agent',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0f1a] text-gray-100 min-h-screen">
        <main className="max-w-[1400px] mx-auto px-6 py-5">{children}</main>
      </body>
    </html>
  );
}
