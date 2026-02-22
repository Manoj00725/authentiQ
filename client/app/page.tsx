'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LandingPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    return (
        <div className="min-h-screen bg-grid relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
            {/* Ambient orbs */}
            <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-15 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #06b6d4, transparent)' }} />

            {/* Nav */}
            <nav className="relative z-10 flex items-center justify-between px-8 py-6 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    </div>
                    <span className="font-bold text-xl" style={{ color: 'var(--text-primary)' }}>AuthentiQ</span>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/join" className="btn-secondary text-sm px-4 py-2">Join as Candidate</Link>
                    <Link href="/create" className="btn-primary text-sm px-4 py-2">Create Interview</Link>
                </div>
            </nav>

            {/* Hero */}
            <main className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-24 pb-20">
                <div className={`transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-8"
                        style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                        <span className="glow-dot cyan" style={{ width: '6px', height: '6px' }} />
                        Behavioral Authenticity Engine · Real-time Monitoring
                    </div>

                    <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black mb-6 leading-none tracking-tight"
                        style={{ color: 'var(--text-primary)' }}>
                        Interviews You Can
                        <br />
                        <span className="gradient-text">Actually Trust</span>
                    </h1>

                    <p className="text-base sm:text-lg max-w-2xl mx-auto mb-12 leading-relaxed"
                        style={{ color: 'var(--text-secondary)' }}>
                        AuthentiQ uses real-time behavioral signals to measure interview authenticity.
                        Transparent for candidates, insightful for recruiters.
                        <span className="font-semibold" style={{ color: 'var(--accent-primary)' }}> No invasive tracking.</span>
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href="/create" className="btn-primary px-8 py-4 text-base">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            Create Interview Session
                        </Link>
                        <Link href="/join" className="btn-secondary px-8 py-4 text-base">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
                            </svg>
                            Join as Candidate
                        </Link>
                    </div>
                </div>

                {/* Features */}
                <div className={`grid grid-cols-1 sm:grid-cols-3 gap-6 mt-24 w-full max-w-4xl transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    {[
                        { icon: '🧠', title: 'Behavioral Analysis', desc: 'Tracks tab switches, paste events, typing speed, focus patterns in real-time' },
                        { icon: '📊', title: 'Live Authenticity Score', desc: 'Algorithmic scoring from 0–100 with live dashboard updates every second' },
                        { icon: '🛡️', title: 'Ethical & Transparent', desc: 'Candidates see monitoring status. No OS-level access. Browser-only signals.' },
                    ].map(({ icon, title, desc }) => (
                        <div key={title} className="glass-card p-6 text-left">
                            <div className="text-3xl mb-4">{icon}</div>
                            <h3 className="font-bold text-base mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                        </div>
                    ))}
                </div>

                {/* Stats strip */}
                <div className={`flex flex-wrap items-center justify-center gap-12 mt-16 transition-all duration-700 delay-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                    {[['7+', 'Behavioral Signals'], ['Real-time', 'Score Updates'], ['100%', 'Browser-only']].map(([val, label]) => (
                        <div key={label} className="text-center">
                            <div className="text-3xl font-black gradient-text">{val}</div>
                            <div className="text-xs mt-1 font-medium" style={{ color: 'var(--text-muted)' }}>{label}</div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
