'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const SEVERITY_COLORS: Record<string, string> = {
    low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444',
};

const EVENT_ICONS: Record<string, string> = {
    tab_switch: '🔄', window_blur: '👁️', window_focus: '✅', paste_attempt: '📋',
    fullscreen_exit: '⤢', word_burst: '💥', long_delay: '⏳', typing_fast: '⚡',
    answer_submitted: '📝', session_end: '🏁',
};

function ScoreGauge({ score }: { score: number }) {
    const color = score >= 75 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444';
    const radius = 90;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - score / 100);
    return (
        <svg width="220" height="220" viewBox="0 0 220 220">
            <circle cx="110" cy="110" r={radius} fill="none" strokeWidth={12} stroke="rgba(255,255,255,0.06)" />
            <circle cx="110" cy="110" r={radius} fill="none" strokeWidth={12} stroke={color}
                strokeDasharray={circumference} strokeDashoffset={dashOffset}
                strokeLinecap="round" transform="rotate(-90 110 110)"
                style={{ transition: 'stroke-dashoffset 1.2s ease', filter: `drop-shadow(0 0 12px ${color})` }} />
            <text x="110" y="100" textAnchor="middle" fill={color} fontSize="46" fontWeight="900"
                style={{ fontFamily: 'Inter' }}>{Math.round(score)}</text>
            <text x="110" y="122" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="13"
                style={{ fontFamily: 'Inter' }}>Authenticity Score</text>
            <text x="110" y="142" textAnchor="middle" fill={color} fontSize="14" fontWeight="600"
                style={{ fontFamily: 'Inter' }}>
                {score >= 75 ? '🟢 High Integrity' : score >= 45 ? '🟡 Moderate Risk' : '🔴 High Risk'}
            </text>
        </svg>
    );
}

export default function ReportPage() {
    const params = useParams();
    const meetingId = params?.id as string;
    const router = useRouter();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/meetings/${meetingId}`)
            .then(r => r.json()).then(setData).finally(() => setLoading(false));
    }, [meetingId]);

    const handleDownloadPDF = async () => {
        const { default: jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        const score = data?.session?.authenticity_score ?? 0;
        const candidate = data?.session?.candidate_name ?? 'Unknown';
        const recruiter = data?.meeting?.recruiter_name ?? 'Unknown';
        const date = new Date(data?.meeting?.created_at ?? '').toLocaleDateString();
        const tier = score >= 75 ? 'High Integrity' : score >= 45 ? 'Moderate Risk' : 'High Risk';

        doc.setFontSize(24); doc.text('AuthentiQ Interview Report', 20, 30);
        doc.setFontSize(12); doc.setTextColor(120, 120, 120);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 45);
        doc.setTextColor(0, 0, 0);

        doc.setFontSize(14);
        doc.text(`Candidate: ${candidate}`, 20, 65);
        doc.text(`Recruiter: ${recruiter}`, 20, 80);
        doc.text(`Interview Date: ${date}`, 20, 95);
        doc.text(`Meeting ID: ${meetingId}`, 20, 110);

        doc.setFontSize(20); doc.setTextColor(score >= 75 ? 0 : 150, score >= 75 ? 150 : score >= 45 ? 100 : 0, 0);
        doc.text(`Authenticity Score: ${Math.round(score)}/100 (${tier})`, 20, 135);
        doc.setTextColor(0, 0, 0);

        doc.setFontSize(14); doc.text('Event Log:', 20, 160);
        let y = 175;
        (data?.events ?? []).forEach((ev: any, i: number) => {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.setFontSize(10);
            doc.text(`${i + 1}. [${ev.severity.toUpperCase()}] ${ev.event_type.replace(/_/g, ' ')} – ${new Date(ev.timestamp).toLocaleTimeString()}`, 20, y);
            y += 12;
        });

        doc.save(`AuthentiQ_Report_${candidate.replace(/\s+/g, '_')}.pdf`);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading report...</p>
                </div>
            </div>
        );
    }

    if (!data?.meeting) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
                <div className="glass-card p-8 text-center">
                    <p className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Report not found</p>
                    <button onClick={() => router.push('/')} className="btn-primary mt-4">Go Home</button>
                </div>
            </div>
        );
    }

    const score = data?.session?.authenticity_score ?? 100;
    const events = data?.events ?? [];

    // Event type distribution
    const eventTypeCounts: Record<string, number> = {};
    events.forEach((e: any) => { eventTypeCounts[e.event_type] = (eventTypeCounts[e.event_type] || 0) + 1; });
    const pieData = Object.entries(eventTypeCounts).map(([name, value]) => ({ name, value }));
    const PIE_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#f97316'];

    // Severity bar chart
    const sevData = ['critical', 'high', 'medium', 'low'].map(sev => ({
        severity: sev, count: events.filter((e: any) => e.severity === sev).length,
    }));

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
            {/* Header */}
            <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-3 border-b"
                style={{ background: 'rgba(5,8,20,0.95)', borderColor: 'var(--border)', backdropFilter: 'blur(12px)' }}>
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    </div>
                    <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>AuthentiQ</span>
                    <span className="text-xs px-2 py-0.5 rounded"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>Interview Report</span>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={handleDownloadPDF} className="btn-primary px-4 py-2 text-sm">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        Download PDF
                    </button>
                    <button onClick={() => router.push('/')} className="btn-secondary px-4 py-2 text-sm">Home</button>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Hero score section */}
                <div className="grid grid-cols-12 gap-6 mb-8">
                    <div className="col-span-12 md:col-span-4 glass-card p-6 flex flex-col items-center gap-4">
                        <h2 className="text-sm font-bold self-start" style={{ color: 'var(--text-muted)' }}>AUTHENTICITY SCORE</h2>
                        <ScoreGauge score={score} />
                    </div>

                    <div className="col-span-12 md:col-span-8 glass-card p-6">
                        <h2 className="label mb-4">Session Summary</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                ['Candidate', data.session?.candidate_name ?? '–'],
                                ['Recruiter', data.meeting.recruiter_name],
                                ['Date', new Date(data.meeting.created_at).toLocaleDateString()],
                                ['Duration', data.session?.ended_at
                                    ? `${Math.round((new Date(data.session.ended_at).getTime() - new Date(data.session.started_at).getTime()) / 60000)} min`
                                    : '–'],
                                ['Total Events', String(events.length)],
                                ['Status', data.meeting.status],
                            ].map(([label, val]) => (
                                <div key={label} className="rounded-lg p-3"
                                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
                                    <p className="text-sm font-bold capitalize" style={{ color: 'var(--text-primary)' }}>{val}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-12 gap-6 mb-8">
                    <div className="col-span-12 md:col-span-6 glass-card p-5">
                        <p className="label mb-3">Events by Severity</p>
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={sevData}>
                                <XAxis dataKey="severity" tick={{ fontSize: 10, fill: '#475569' }} />
                                <YAxis tick={{ fontSize: 10, fill: '#475569' }} />
                                <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', fontSize: 11 }} />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {sevData.map((entry) => (
                                        <rect key={entry.severity} fill={SEVERITY_COLORS[entry.severity] ?? '#6366f1'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="col-span-12 md:col-span-6 glass-card p-5">
                        <p className="label mb-3">Event Type Distribution</p>
                        {pieData.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>
                                No events recorded
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={160}>
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={65} dataKey="value" label={({ name }) => name.replace(/_/g, ' ')}>
                                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: '#0a0f1e', borderRadius: '8px', fontSize: 11 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Event log */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <p className="label mb-0">Complete Event Timeline</p>
                        <span className="text-xs px-2 py-1 rounded-full"
                            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                            {events.length} events
                        </span>
                    </div>
                    {events.length === 0 ? (
                        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                            No behavioral events were recorded for this session.
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {events.map((ev: any, i: number) => (
                                <div key={ev.id || i} className="flex items-center justify-between py-2.5 px-3 rounded-lg"
                                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg">{EVENT_ICONS[ev.event_type] || '•'}</span>
                                        <div>
                                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                                {ev.event_type.replace(/_/g, ' ')}
                                            </span>
                                            {ev.metadata && (
                                                <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                                                    {Object.entries(ev.metadata).map(([k, v]) => `${k}: ${v}`).join(', ')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-xs font-bold px-2 py-0.5 rounded"
                                            style={{ background: `${SEVERITY_COLORS[ev.severity]}20`, color: SEVERITY_COLORS[ev.severity] }}>
                                            {ev.severity}
                                        </span>
                                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                            {new Date(ev.timestamp).toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
