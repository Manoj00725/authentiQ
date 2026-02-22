'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { EventLog, ScoreUpdate, CandidateSession } from '../../../../shared/types';
import {
    AreaChart, Area, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

const SEVERITY_COLORS: Record<string, string> = {
    low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444',
};

const EVENT_ICONS: Record<string, string> = {
    tab_switch: '🔄', window_blur: '👁️', window_focus: '✅', paste_attempt: '📋',
    fullscreen_exit: '⤢', word_burst: '💥', long_delay: '⏳', typing_fast: '⚡',
    answer_submitted: '📝', session_start: '🚀', session_end: '🏁', fullscreen_enter: '⛶',
};

function ScoreGauge({ score }: { score: number }) {
    const color = score >= 75 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444';
    const radius = 70, strokeWidth = 10;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - score / 100);
    const label = score >= 75 ? 'High Integrity' : score >= 45 ? 'Moderate' : 'High Risk';

    return (
        <div className="flex flex-col items-center gap-2">
            <svg width="180" height="180" viewBox="0 0 180 180">
                <circle cx="90" cy="90" r={radius} fill="none" strokeWidth={strokeWidth}
                    stroke="rgba(255,255,255,0.05)" />
                <circle cx="90" cy="90" r={radius} fill="none" strokeWidth={strokeWidth}
                    stroke={color} strokeDasharray={circumference} strokeDashoffset={dashOffset}
                    strokeLinecap="round" transform="rotate(-90 90 90)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.5s ease', filter: `drop-shadow(0 0 8px ${color})` }} />
                <text x="90" y="84" textAnchor="middle" fill={color} fontSize="32" fontWeight="800"
                    style={{ fontFamily: 'Inter' }}>{Math.round(score)}</text>
                <text x="90" y="104" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11"
                    style={{ fontFamily: 'Inter' }}>{label}</text>
            </svg>
        </div>
    );
}

function IntegrityBadge({ score }: { score: number }) {
    const tier = score >= 75 ? 'high' : score >= 45 ? 'moderate' : 'low';
    const config = {
        high: { label: 'High Integrity', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', text: '#10b981', icon: '🟢' },
        moderate: { label: 'Moderate Risk', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#f59e0b', icon: '🟡' },
        low: { label: 'High Risk', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#ef4444', icon: '🔴' },
    }[tier];
    return (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
            style={{ background: config.bg, border: `1px solid ${config.border}`, color: config.text }}>
            <span>{config.icon}</span>{config.label}
        </div>
    );
}

export default function RecruiterDashboard() {
    const params = useParams();
    const meetingId = params?.id as string;
    const router = useRouter();
    const { connected, emit, on } = useWebSocket();

    const [meetingData, setMeetingData] = useState<any>(null);
    const [score, setScore] = useState(100);
    const [events, setEvents] = useState<EventLog[]>([]);
    const [candidateStatus, setCandidateStatus] = useState({ joined: false, candidate_name: '', monitoring_active: false });
    const [scoreHistory, setScoreHistory] = useState<{ t: string; score: number }[]>([{ t: '0s', score: 100 }]);
    const [typingData, setTypingData] = useState<{ t: string; wpm: number }[]>([]);
    const [sessionEnded, setSessionEnded] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const eventFeedRef = useRef<HTMLDivElement>(null);

    // Fetch initial data
    useEffect(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/meetings/${meetingId}`)
            .then(r => r.json()).then(setMeetingData).catch(console.error);
    }, [meetingId]);

    // Subscribe to recruiter room
    useEffect(() => {
        if (!connected) return;
        emit('recruiter_subscribe', { meeting_id: meetingId });
    }, [connected, meetingId, emit]);

    // WebSocket listeners
    useEffect(() => {
        const unsub1 = on('live_event_update', (event) => {
            setEvents(prev => [event, ...prev].slice(0, 100));
            if (event.event_type === 'typing_fast' && event.metadata?.wpm) {
                const label = `${(elapsedSeconds)}s`;
                setTypingData(prev => [...prev.slice(-19), { t: label, wpm: event.metadata!.wpm as number }]);
            }
            if (eventFeedRef.current) eventFeedRef.current.scrollTop = 0;
        });
        const unsub2 = on('score_update', (update: ScoreUpdate) => {
            setScore(update.authenticity_score);
            const label = `${elapsedSeconds}s`;
            setScoreHistory(prev => [...prev.slice(-29), { t: label, score: update.authenticity_score }]);
        });
        const unsub3 = on('candidate_status', (status) => setCandidateStatus(status));
        const unsub4 = on('session_ended', () => setSessionEnded(true));
        return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
    }, [on, elapsedSeconds]);

    // Timer
    useEffect(() => {
        if (!candidateStatus.joined || sessionEnded) return;
        const iv = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
        return () => clearInterval(iv);
    }, [candidateStatus.joined, sessionEnded]);

    // Apply theme
    useEffect(() => {
        document.documentElement.classList.toggle('light', theme === 'light');
    }, [theme]);

    const handleEndInterview = async () => {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/meetings/${meetingId}/end`, { method: 'POST' });
        router.push(`/report/${meetingId}`);
    };

    const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    // Heatmap data for suspicion spikes
    const suspicionHeatmap = events.slice().reverse().map((ev, i) => ({
        t: i, name: ev.event_type,
        value: ev.severity === 'critical' ? 4 : ev.severity === 'high' ? 3 : ev.severity === 'medium' ? 2 : 1,
        color: SEVERITY_COLORS[ev.severity],
    }));

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
            {/* Top bar */}
            <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 border-b"
                style={{ background: 'rgba(5,8,20,0.9)', borderColor: 'var(--border)', backdropFilter: 'blur(12px)' }}>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                        </div>
                        <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>AuthentiQ</span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded font-mono"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                        Recruiter Dashboard
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    {/* Connection */}
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span className={`glow-dot ${connected ? 'green' : 'red'}`} style={{ width: '6px', height: '6px' }} />
                        {connected ? 'Live' : 'Connecting...'}
                    </div>
                    {/* Timer */}
                    {candidateStatus.joined && (
                        <span className="font-mono text-sm font-bold" style={{ color: 'var(--accent-cyan)' }}>
                            {formatTime(elapsedSeconds)}
                        </span>
                    )}
                    {/* Theme toggle */}
                    <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center btn-secondary px-2 py-1 text-lg">
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                    {/* End interview */}
                    <button onClick={handleEndInterview}
                        className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                        End Interview
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-12 gap-4 p-4 h-[calc(100vh-56px)]">
                {/* LEFT PANEL */}
                <aside className="col-span-3 flex flex-col gap-4 overflow-y-auto">
                    {/* Meeting info */}
                    <div className="glass-card p-4">
                        <p className="label">Meeting</p>
                        <p className="text-xs font-mono truncate" style={{ color: 'var(--accent-cyan)' }}>{meetingId}</p>
                        <div className="mt-3 flex items-center gap-2">
                            <span className={`glow-dot ${candidateStatus.joined ? 'green' : 'yellow'}`} style={{ width: '6px', height: '6px' }} />
                            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {candidateStatus.joined ? `${candidateStatus.candidate_name} joined` : 'Waiting for candidate...'}
                            </span>
                        </div>
                        {candidateStatus.monitoring_active && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: '#10b981' }}>
                                <span className="glow-dot green" style={{ width: '5px', height: '5px' }} />
                                Monitoring active
                            </div>
                        )}
                        {meetingData?.meeting && (
                            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                                Recruiter: {meetingData.meeting.recruiter_name}
                            </p>
                        )}
                    </div>

                    {/* Score gauge */}
                    <div className="glass-card p-4 flex flex-col items-center gap-3">
                        <p className="label self-start">Authenticity Score</p>
                        <ScoreGauge score={score} />
                        <IntegrityBadge score={score} />
                        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                            {events.length} behavioral events detected
                        </p>
                    </div>

                    {/* Quick stats */}
                    <div className="glass-card p-4">
                        <p className="label mb-3">Event Summary</p>
                        {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
                            const count = events.filter(e => e.severity === sev).length;
                            return (
                                <div key={sev} className="flex items-center justify-between mb-2">
                                    <span className="text-xs capitalize" style={{ color: SEVERITY_COLORS[sev] }}>{sev}</span>
                                    <span className="text-xs font-bold px-2 py-0.5 rounded"
                                        style={{ background: `${SEVERITY_COLORS[sev]}22`, color: SEVERITY_COLORS[sev] }}>
                                        {count}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </aside>

                {/* CENTER */}
                <main className="col-span-6 flex flex-col gap-4 overflow-y-auto">
                    {/* Score timeline */}
                    <div className="glass-card p-4">
                        <p className="label mb-3">Authenticity Score Timeline</p>
                        <ResponsiveContainer width="100%" height={140}>
                            <AreaChart data={scoreHistory}>
                                <defs>
                                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#475569' }} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#475569' }} />
                                <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', fontSize: 11 }} />
                                <Area type="monotone" dataKey="score" stroke="#6366f1" fill="url(#scoreGrad)" strokeWidth={2} dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Suspicion heatmap */}
                    <div className="glass-card p-4">
                        <p className="label mb-3">Suspicion Heatmap</p>
                        {suspicionHeatmap.length === 0 ? (
                            <div className="h-24 flex items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>
                                No suspicious events yet
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={100}>
                                <BarChart data={suspicionHeatmap}>
                                    <XAxis hide />
                                    <YAxis hide domain={[0, 4]} />
                                    <Tooltip
                                        contentStyle={{ background: '#0a0f1e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', fontSize: 11 }}
                                        formatter={(val: any, name: any, props: any) => [props.payload.name, 'Event']}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}
                                        fill="#ef4444"
                                        label={false}>
                                        {suspicionHeatmap.map((entry, i) => (
                                            <rect key={i} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Typing speed */}
                    <div className="glass-card p-4">
                        <p className="label mb-3">Typing Speed (WPM)</p>
                        {typingData.length === 0 ? (
                            <div className="h-24 flex items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>
                                Waiting for typing input...
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={100}>
                                <LineChart data={typingData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#475569' }} />
                                    <YAxis tick={{ fontSize: 9, fill: '#475569' }} />
                                    <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', fontSize: 11 }} />
                                    <Line type="monotone" dataKey="wpm" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3, fill: '#06b6d4' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </main>

                {/* RIGHT PANEL – Live event feed */}
                <aside className="col-span-3 flex flex-col gap-4 overflow-hidden">
                    <div className="glass-card p-4 flex flex-col flex-1" style={{ maxHeight: 'calc(100vh - 90px)', overflow: 'hidden' }}>
                        <div className="flex items-center justify-between mb-3">
                            <p className="label mb-0">Live Events</p>
                            {events.length > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                                    style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
                                    {events.length}
                                </span>
                            )}
                        </div>
                        <div ref={eventFeedRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
                            {events.length === 0 ? (
                                <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>
                                    Waiting for candidate events...
                                </div>
                            ) : events.map((ev, i) => (
                                <div key={ev.id || i} className="rounded-lg p-3 animate-float-up"
                                    style={{ background: `${SEVERITY_COLORS[ev.severity]}12`, border: `1px solid ${SEVERITY_COLORS[ev.severity]}30` }}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm">{EVENT_ICONS[ev.event_type] || '•'}</span>
                                            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                {ev.event_type.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <span className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                                            style={{ background: `${SEVERITY_COLORS[ev.severity]}20`, color: SEVERITY_COLORS[ev.severity] }}>
                                            {ev.severity}
                                        </span>
                                    </div>
                                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                        {new Date(ev.timestamp).toLocaleTimeString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            </div>

            {/* Session ended overlay */}
            {sessionEnded && (
                <div className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
                    <div className="glass-card p-8 max-w-sm w-full text-center">
                        <div className="text-5xl mb-4">🏁</div>
                        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Session Ended</h2>
                        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                            Final authenticity score: <strong style={{ color: score >= 75 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444' }}>{Math.round(score)}/100</strong>
                        </p>
                        <button onClick={() => router.push(`/report/${meetingId}`)} className="btn-primary w-full py-3">
                            View Full Report
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
