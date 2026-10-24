import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'iCare · Admin workspace', template: '%s · iCare' },
  description: 'iCare administration: centers, people and access in one clear workspace.',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};
export const dynamic = 'force-dynamic';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
