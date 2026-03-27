'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import ThemeToggle from './ThemeToggle';

export default function LandingPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    return (
        <div className="min-h-screen bg-grid relative overflow-hidden bg-background text-foreground transition-colors duration-400">
            {/* Ambient orbs */}
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-20 pointer-events-none transition-all duration-700"
                style={{ background: 'radial-gradient(circle, var(--accent-primary), transparent 70%)' }} />
            <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full blur-[120px] opacity-15 pointer-events-none transition-all duration-700"
                style={{ background: 'radial-gradient(circle, var(--accent-secondary), transparent 70%)' }} />

            {/* Hero */}
            <main className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-12 pb-20">
                <div className={`transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold mb-10 transition-all duration-300"
                        style={{ background: 'rgba(var(--accent-primary-rgb, 6, 182, 212), 0.12)', border: '1px solid var(--border)', color: 'var(--accent-primary)' }}>
                        <span className="glow-dot cyan" style={{ width: '6px', height: '6px' }} />
                        Behavioral Authenticity Engine · Real-time Monitoring
                    </div>

                    <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black mb-8 leading-none tracking-tight text-foreground">
                        Interviews You Can
                        <br />
                        <span className="gradient-text">Actually Trust</span>
                    </h1>

                    <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-14 leading-relaxed text-secondary transition-colors duration-300">
                        AuthentiQ uses real-time behavioral signals to measure interview authenticity.
                        Transparent for candidates, insightful for recruiters.
                        <span className="font-bold text-primary"> No invasive tracking.</span>
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
                        <Link href="/create" className="btn-primary px-10 py-4.5 text-base shadow-lg shadow-primary/20">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            Create Interview Session
                        </Link>
                        <Link href="/join" className="btn-secondary px-10 py-4.5 text-base">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
                            </svg>
                            Join as Candidate
                        </Link>
                    </div>
                </div>

                {/* Features */}
                <div className={`grid grid-cols-1 sm:grid-cols-3 gap-8 mt-32 w-full max-w-5xl transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                    {[
                        { icon: '🧠', title: 'Behavioral Analysis', desc: 'Tracks tab switches, paste events, typing speed, focus patterns in real-time' },
                        { icon: '📊', title: 'Live Authenticity Score', desc: 'Algorithmic scoring from 0–100 with live dashboard updates every second' },
                        { icon: '🛡️', title: 'Ethical & Transparent', desc: 'Candidates see monitoring status. No OS-level access. Browser-only signals.' },
                    ].map(({ icon, title, desc }) => (
                        <div key={title} className="glass-card p-8 text-left hover:scale-[1.02] active:scale-[0.98]">
                            <div className="text-4xl mb-6">{icon}</div>
                            <h3 className="font-extrabold text-xl mb-3 text-foreground">{title}</h3>
                            <p className="text-base leading-relaxed text-secondary">{desc}</p>
                        </div>
                    ))}
                </div>

                {/* Stats strip */}
                <div className={`flex flex-wrap items-center justify-center gap-16 mt-20 transition-all duration-1000 delay-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                    {[['7+', 'Behavioral Signals'], ['Real-time', 'Score Updates'], ['100%', 'Browser-only']].map(([val, label]) => (
                        <div key={label} className="text-center group">
                            <div className="text-4xl font-black gradient-text group-hover:scale-110 transition-transform duration-300">{val}</div>
                            <div className="text-xs mt-2 font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}

