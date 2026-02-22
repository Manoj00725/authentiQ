'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function CreateMeetingPage() {
    const router = useRouter();
    const [recruiterName, setRecruiterName] = useState('');
    const [loading, setLoading] = useState(false);
    const [meetingData, setMeetingData] = useState<{ meeting: any; join_link: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!recruiterName.trim()) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/meetings/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recruiter_name: recruiterName.trim() }),
            });
            if (!res.ok) throw new Error('Failed to create meeting');
            const data = await res.json();
            setMeetingData(data);
        } catch (err) {
            setError('Failed to create meeting. Is the server running?');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!meetingData) return;
        await navigator.clipboard.writeText(meetingData.join_link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleGoToDashboard = () => {
        if (meetingData) router.push(`/recruiter/${meetingData.meeting.id}`);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: 'var(--bg-primary)' }}>
            {/* Ambient */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full blur-3xl opacity-15"
                    style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
                <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-10"
                    style={{ background: 'radial-gradient(circle, #06b6d4, transparent)' }} />
            </div>

            <div className="relative z-10 w-full max-w-lg">
                {/* Back */}
                <Link href="/" className="inline-flex items-center gap-2 mb-8 text-sm transition-colors hover:opacity-80"
                    style={{ color: 'var(--text-secondary)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                    Back to Home
                </Link>

                {!meetingData ? (
                    <div className="glass-card p-8">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Create Interview Session</h1>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Generate a unique link for your candidate</p>
                            </div>
                        </div>

                        <form onSubmit={handleCreate} className="space-y-5">
                            <div>
                                <label className="label">Your Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. Sarah Chen"
                                    value={recruiterName}
                                    onChange={e => setRecruiterName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            {error && (
                                <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                                    {error}
                                </div>
                            )}
                            <button type="submit" className="btn-primary w-full py-3.5" disabled={loading || !recruiterName.trim()}>
                                {loading ? (
                                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}Creating...</>
                                ) : (
                                    <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg> Create Meeting</>
                                )}
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="glass-card p-8 animate-float-up">
                        <div className="flex items-center gap-2 mb-6">
                            <span className="glow-dot green" />
                            <span className="text-sm font-medium" style={{ color: '#10b981' }}>Meeting Created Successfully</span>
                        </div>

                        <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                            Ready, {meetingData.meeting.recruiter_name}!
                        </h2>
                        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
                            Share the link below with your candidate.
                        </p>

                        {/* Meeting ID */}
                        <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                            <p className="label mb-1">Meeting ID</p>
                            <p className="font-mono text-sm font-semibold tracking-wider" style={{ color: 'var(--accent-cyan)' }}>
                                {meetingData.meeting.id}
                            </p>
                        </div>

                        {/* Join Link */}
                        <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                            <p className="label mb-1">Candidate Join Link</p>
                            <div className="flex items-center gap-3">
                                <p className="text-sm truncate flex-1 font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {meetingData.join_link}
                                </p>
                                <button onClick={handleCopy} className="btn-secondary px-3 py-1.5 text-xs shrink-0">
                                    {copied ? '✓ Copied!' : 'Copy'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button onClick={handleGoToDashboard} className="btn-primary w-full py-3.5">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                                    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                                </svg>
                                Open Recruiter Dashboard
                            </button>
                            <button onClick={() => setMeetingData(null)} className="btn-secondary w-full py-3">
                                Create Another Meeting
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
