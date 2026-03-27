'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
    const pathname = usePathname();
    const isSessionPage = pathname?.startsWith('/candidate') || pathname?.startsWith('/recruiter');

    if (isSessionPage) return null;

    return (
        <nav className="relative z-50 flex items-center justify-between px-8 py-5 border-b border-border bg-background/50 backdrop-blur-xl">
            <Link href="/" className="flex items-center gap-3 group">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary transition-all duration-300 group-hover:rotate-6 group-hover:scale-110 shadow-lg shadow-primary/20">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                </div>
                <span className="font-bold text-2xl tracking-tighter text-foreground">AuthentiQ</span>
            </Link>

            <div className="flex items-center gap-4">
                <ThemeToggle />
                <div className="h-6 w-px bg-border mx-2" />
                <div className="hidden sm:flex items-center gap-3">
                    <Link href="/join" className="btn-secondary text-sm px-5 py-2.5">Join as Candidate</Link>
                    <Link href="/create" className="btn-primary text-sm px-5 py-2.5 shadow-lg shadow-primary/20">Create Interview</Link>
                </div>
            </div>
        </nav>
    );
}
