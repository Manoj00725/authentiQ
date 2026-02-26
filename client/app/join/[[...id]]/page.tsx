'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

export default function JoinPage() {
    const router = useRouter();
    const params = useParams();
    const idParam = params?.id;
    const [meetingId, setMeetingId] = useState(
        Array.isArray(idParam) ? idParam[0] || '' : (idParam as string) || ''
    );
    const [candidateName, setCandidateName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [consentAccepted, setConsentAccepted] = useState(false);

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!meetingId.trim() || !candidateName.trim() || !consentAccepted) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/meetings/${meetingId.trim()}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candidate_name: candidateName.trim() }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to join meeting');
            }
            const data = await res.json();
            router.push(`/candidate/${data.session.id}?meeting_id=${meetingId.trim()}`);
        } catch (err: any) {
            setError(err.message || 'Failed to join meeting. Check the meeting ID.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: 'var(--bg-primary)' }}>
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/3 left-1/3 w-80 h-80 rounded-full blur-3xl opacity-15"
                    style={{ background: 'radial-gradient(circle, #06b6d4, transparent)' }} />
                <div className="absolute bottom-1/3 right-1/3 w-80 h-80 rounded-full blur-3xl opacity-10"
                    style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
            </div>

            <div className="relative z-10 w-full max-w-lg">
                <Link href="/" className="inline-flex items-center gap-2 mb-8 text-sm hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--text-secondary)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                    Back
                </Link>

                <div className="glass-card p-8">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #06b6d4, #6366f1)' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Join Interview</h1>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Enter your details to start</p>
                        </div>
                    </div>

                    <form onSubmit={handleJoin} className="space-y-5">
                        <div>
                            <label className="label">Meeting ID or Link</label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="e.g. a1b2c3d4-e5f6-..."
                                value={meetingId}
                                onChange={e => {
                                    let val = e.target.value.trim();
                                    // Auto-extract ID from full link
                                    const match = val.match(/\/join\/([a-f0-9-]{36})/);
                                    if (match) val = match[1];
                                    setMeetingId(val);
                                }}
                            />
                        </div>

                        <div>
                            <label className="label">Your Full Name</label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="e.g. Alex Johnson"
                                value={candidateName}
                                onChange={e => setCandidateName(e.target.value)}
                            />
                        </div>

                        {/* Consent box */}
                        <div className="rounded-xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                            <div className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    id="consent"
                                    checked={consentAccepted}
                                    onChange={e => setConsentAccepted(e.target.checked)}
                                    className="mt-1 accent-indigo-500"
                                />
                                <label htmlFor="consent" className="text-xs leading-relaxed cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                    <strong style={{ color: 'var(--text-primary)' }}>Monitoring Consent:</strong> I understand that this interview runs in <strong style={{ color: 'var(--text-primary)' }}>enforced fullscreen</strong> and that my <strong style={{ color: 'var(--text-primary)' }}>screen, camera, and behavioral signals</strong> (tab switches, paste events, typing patterns, fullscreen status) will be monitored in real-time by the recruiter for authenticity assessment. No personal data is stored after the session.
                                </label>
                            </div>
                        </div>

                        {error && (
                            <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                                {error}
                            </div>
                        )}

                        <button type="submit" className="btn-primary w-full py-3.5"
                            disabled={loading || !meetingId.trim() || !candidateName.trim() || !consentAccepted}>
                            {loading ? (
                                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{' '}Joining...</>
                            ) : 'Start Interview →'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
