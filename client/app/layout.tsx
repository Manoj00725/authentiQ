import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'AuthentiQ – Behavioral Authenticity Engine',
    description: 'Real-time behavioral monitoring for remote interviews. Ensuring authentic, transparent, and fair assessments.',
    keywords: ['interviews', 'authenticity', 'behavioral monitoring', 'remote hiring'],
};

import Navbar from './Navbar';

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${inter.className} min-h-screen bg-background text-foreground transition-colors duration-400`} suppressHydrationWarning>
                <Navbar />
                <main>{children}</main>
            </body>
        </html>
    );
}
