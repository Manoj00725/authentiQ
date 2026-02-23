'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useVideoCall } from '@/hooks/useVideoCall';
import type { EventLog, ScoreUpdate, CheatAlert, CodeUpdate, CodingChallenge, CodingLanguage } from '@/types';
import {
    AreaChart, Area, LineChart, Line, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

const SEVERITY_COLORS: Record<string, string> = {
    low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444',
};
const EVENT_ICONS: Record<string, string> = {
    tab_switch: '🔄', window_blur: '👁️', window_focus: '✅', paste_attempt: '📋',
    fullscreen_exit: '⤢', word_burst: '💥', long_delay: '⏳', typing_fast: '⚡',
    answer_submitted: '📝', session_start: '🚀', session_end: '🏁', fullscreen_enter: '⛶',
    code_paste: '📋', devtools_open: '🔧', right_click_attempt: '🖱️',
    keyboard_shortcut_cheat: '⌨️', ai_pattern_detected: '🤖', rapid_solution: '⚡',
    face_not_detected: '📷', multiple_faces_detected: '👥', gaze_away: '👀',
};
const CHEAT_LABELS: Record<string, string> = {
    code_paste: 'CODE PASTE', devtools_open: 'DEVTOOLS', right_click_attempt: 'RIGHT CLICK',
    keyboard_shortcut_cheat: 'CHEAT SHORTCUT', ai_pattern_detected: 'AI PATTERN',
    rapid_solution: 'RAPID SOLUTION', tab_switch: 'TAB SWITCH', paste_attempt: 'TEXT PASTE',
    fullscreen_exit: 'FULLSCREEN EXIT', word_burst: 'WORD BURST', window_blur: 'WINDOW UNFOCUS',
    face_not_detected: 'FACE MISSING', multiple_faces_detected: 'MULTIPLE FACES', gaze_away: 'LOOKING AWAY',
};
const LANGUAGE_LABELS: Record<string, string> = { javascript: 'JS', python: 'PY', java: 'JV', cpp: 'C++', typescript: 'TS' };

const PUSH_CHALLENGES: CodingChallenge[] = [
    { id: 'r1', title: 'FizzBuzz', language: 'javascript', description: 'Write a function that returns "Fizz" for multiples of 3, "Buzz" for multiples of 5, and "FizzBuzz" for multiples of both.', starter_code: 'function fizzBuzz(n) {\n    // Your solution here\n    \n}', examples: [{ input: '15', output: '"FizzBuzz"' }] },
    { id: 'r2', title: 'Palindrome Check', language: 'python', description: 'Given a string s, return true if it is a palindrome, or false otherwise.', starter_code: 'def is_palindrome(s: str) -> bool:\n    pass', examples: [{ input: '"racecar"', output: 'True' }] },
    { id: 'r3', title: 'Custom Question', language: 'javascript', description: '(Fill in your custom question via the form)', starter_code: '// Write your solution here\n', examples: [] },
];

function ScoreGauge({ score }: { score: number }) {
    const color = score >= 75 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444';
    const radius = 60, sw = 9, circ = 2 * Math.PI * radius;
    const dashOff = circ * (1 - score / 100);
    return (
        <div className="flex flex-col items-center">
            <svg width="150" height="150" viewBox="0 0 150 150">
                <circle cx="75" cy="75" r={radius} fill="none" strokeWidth={sw} stroke="rgba(255,255,255,0.05)" />
                <circle cx="75" cy="75" r={radius} fill="none" strokeWidth={sw} stroke={color}
                    strokeDasharray={circ} strokeDashoffset={dashOff} strokeLinecap="round"
                    transform="rotate(-90 75 75)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.5s', filter: `drop-shadow(0 0 8px ${color})` }} />
                <text x="75" y="70" textAnchor="middle" fill={color} fontSize="26" fontWeight="800">{Math.round(score)}</text>
                <text x="75" y="87" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10">
                    {score >= 75 ? 'High Integrity' : score >= 45 ? 'Moderate' : 'High Risk'}
                </text>
            </svg>
        </div>
    );
}

function PushModal({ onClose, onSend }: { onClose: () => void; onSend: (c: CodingChallenge) => void }) {
    const [sel, setSel] = useState(PUSH_CHALLENGES[0]);
    const [title, setTitle] = useState(''); const [desc, setDesc] = useState('');
    const [sCode, setSCode] = useState('// Write your solution here\n'); const [lang, setLang] = useState<CodingLanguage>('javascript');
    const isCustom = sel.id === 'r3';
    const send = () => {
        onSend(isCustom ? { id: `c_${Date.now()}`, title: title || 'Custom', language: lang, description: desc || 'No description.', starter_code: sCode, examples: [] } : sel);
        onClose();
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <div className="glass-card p-6 w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>📨 Push Question to Candidate</h3>
                    <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>✕</button>
                </div>
                <div className="space-y-2 mb-4">
                    {PUSH_CHALLENGES.map(c => (
                        <button key={c.id} onClick={() => setSel(c)} className="w-full text-left p-3 rounded-lg text-sm transition-all"
                            style={{ background: sel.id === c.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', border: sel.id === c.id ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}>
                            <span className="font-semibold">{c.title}</span> · <span style={{ color: 'var(--text-muted)' }}>{LANGUAGE_LABELS[c.language]}</span>
                        </button>
                    ))}
                </div>
                {isCustom && (
                    <div className="space-y-2 mb-4 text-sm">
                        <input value={title} onChange={e => setTitle(e.target.value)} className="input-field w-full" placeholder="Question title" />
                        <textarea value={desc} onChange={e => setDesc(e.target.value)} className="input-field w-full resize-none" rows={3} placeholder="Description..." />
                        <textarea value={sCode} onChange={e => setSCode(e.target.value)} className="input-field w-full resize-none font-mono" rows={3} />
                        <select value={lang} onChange={e => setLang(e.target.value as CodingLanguage)} className="input-field w-full" style={{ background: 'var(--bg-secondary)' }}>
                            {(['javascript', 'python', 'java', 'cpp', 'typescript'] as CodingLanguage[]).map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                )}
                <div className="flex gap-2">
                    <button onClick={onClose} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
                    <button onClick={send} className="btn-primary flex-1 py-2 text-sm">Send →</button>
                </div>
            </div>
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
    const [cheatAlerts, setCheatAlerts] = useState<CheatAlert[]>([]);
    const [liveCode, setLiveCode] = useState<CodeUpdate | null>(null);
    const [candidateStatus, setCandidateStatus] = useState({ joined: false, candidate_name: '', monitoring_active: false });
    const [scoreHistory, setScoreHistory] = useState<{ t: string; score: number }[]>([{ t: '0s', score: 100 }]);
    const [typingData, setTypingData] = useState<{ t: string; wpm: number }[]>([]);
    const [sessionEnded, setSessionEnded] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [activeTab, setActiveTab] = useState<'video' | 'code' | 'charts'>('video');
    const [showPushModal, setShowPushModal] = useState(false);
    const [candidateSessionId, setCandidateSessionId] = useState('');
    const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
    const alertRef = useRef<HTMLDivElement>(null);

    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    // ── WebRTC video call ──────────────────────────────────────────────────────
    const { callState, localStream, remoteStream, isMuted, isCameraOff, startCall, endCall, toggleMute, toggleCamera } = useVideoCall({
        role: 'recruiter', meetingId, sessionId: candidateSessionId || meetingId, emit, on,
    });

    useEffect(() => {
        if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    }, [remoteStream]);

    // Fetch meeting data
    useEffect(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/meetings/${meetingId}`)
            .then(r => r.json()).then(d => {
                setMeetingData(d);
                if (d?.session?.id) setCandidateSessionId(d.session.id);
            }).catch(console.error);
    }, [meetingId]);

    // Subscribe to recruiter room
    useEffect(() => {
        if (!connected) return;
        emit('recruiter_subscribe', { meeting_id: meetingId });
        startCall(); // Start camera readiness immediately
    }, [connected, meetingId, emit, startCall]);

    // WebSocket event listeners
    useEffect(() => {
        const u1 = on('live_event_update', (e: EventLog) => setEvents(prev => [e, ...prev].slice(0, 100)));
        const u2 = on('score_update', (u: ScoreUpdate) => {
            setScore(u.authenticity_score);
            setScoreHistory(prev => [...prev.slice(-29), { t: `${elapsed}s`, score: u.authenticity_score }]);
        });
        const u3 = on('candidate_status', (s: any) => {
            setCandidateStatus(s);
            if (s.joined) setActiveTab('video');
        });
        const u4 = on('session_ended', () => setSessionEnded(true));
        const u5 = on('cheat_alert', (alert: CheatAlert) => {
            setCheatAlerts(prev => [alert, ...prev].slice(0, 50));
            if (alertRef.current) alertRef.current.scrollTop = 0;
        });
        const u6 = on('code_update', (upd: CodeUpdate) => setLiveCode(upd));
        return () => { u1(); u2(); u3(); u4(); u5(); u6(); };
    }, [on, elapsed]);

    // Timer
    useEffect(() => {
        if (!candidateStatus.joined || sessionEnded) return;
        const iv = setInterval(() => setElapsed(s => s + 1), 1000);
        return () => clearInterval(iv);
    }, [candidateStatus.joined, sessionEnded]);

    const handleEndInterview = async () => {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/meetings/${meetingId}/end`, { method: 'POST' });
        endCall();
        router.push(`/report/${meetingId}`);
    };
    const handlePushQuestion = (c: CodingChallenge) => {
        if (!candidateSessionId) return;
        emit('recruiter_push_question', { meeting_id: meetingId, session_id: candidateSessionId, challenge: c });
    };
    const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
    const critCount = cheatAlerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;

    const tabs = [
        { id: 'video' as const, label: '📹 Video Call', badge: callState === 'connected' ? 'LIVE' : undefined },
        { id: 'code' as const, label: '💻 Live Code', badge: liveCode ? '●' : undefined },
        { id: 'charts' as const, label: '📊 Analytics' },
    ];

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
            {/* Top bar */}
            <header className="sticky top-0 z-50 flex items-center justify-between px-5 py-3 border-b"
                style={{ background: 'rgba(5,8,20,0.92)', borderColor: 'var(--border)', backdropFilter: 'blur(12px)' }}>
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    </div>
                    <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>AuthentiQ</span>
                    <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>Recruiter</span>
                </div>
                <div className="flex items-center gap-3">
                    {critCount > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold animate-pulse"
                            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171' }}>
                            🚨 {critCount} Alert{critCount > 1 ? 's' : ''}
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span className={`glow-dot ${connected ? 'green' : 'red'}`} style={{ width: 6, height: 6 }} />
                        {connected ? 'Live' : 'Connecting...'}
                    </div>
                    {candidateStatus.joined && <span className="font-mono text-sm font-bold" style={{ color: 'var(--accent-cyan)' }}>{formatTime(elapsed)}</span>}
                    {candidateStatus.joined && (
                        <button onClick={() => setShowPushModal(true)}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }}>
                            📨 Push Question
                        </button>
                    )}
                    <button onClick={handleEndInterview}
                        className="px-4 py-1.5 rounded-lg text-sm font-semibold"
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                        End Interview
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-12 gap-4 p-4" style={{ height: 'calc(100vh - 56px)' }}>
                {/* LEFT */}
                <aside className="col-span-3 flex flex-col gap-3 overflow-y-auto">
                    {/* Meeting info */}
                    <div className="glass-card p-4">
                        <p className="label">Meeting</p>
                        <p className="text-xs font-mono truncate" style={{ color: 'var(--accent-cyan)' }}>{meetingId}</p>
                        <div className="mt-2 flex items-center gap-2">
                            <span className={`glow-dot ${candidateStatus.joined ? 'green' : 'yellow'}`} style={{ width: 6, height: 6 }} />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {candidateStatus.joined ? `${candidateStatus.candidate_name} joined` : 'Waiting for candidate...'}
                            </span>
                        </div>
                        {candidateStatus.monitoring_active && (
                            <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: '#10b981' }}>
                                <span style={{ width: 5, height: 5, background: '#10b981', borderRadius: '50%', display: 'inline-block' }} />
                                Anti-cheat + Face detection active
                            </p>
                        )}
                    </div>

                    {/* Score gauge */}
                    <div className="glass-card p-4 flex flex-col items-center gap-2">
                        <p className="label self-start">Authenticity Score</p>
                        <ScoreGauge score={score} />
                        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                            {events.length} events · {cheatAlerts.length} alerts
                        </p>
                    </div>

                    {/* Event breakdown */}
                    <div className="glass-card p-4">
                        <p className="label mb-3">Event Breakdown</p>
                        {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
                            const count = events.filter(e => e.severity === sev).length;
                            return (
                                <div key={sev} className="flex items-center justify-between mb-2">
                                    <span className="text-xs capitalize" style={{ color: SEVERITY_COLORS[sev] }}>{sev}</span>
                                    <span className="text-xs font-bold px-2 py-0.5 rounded"
                                        style={{ background: `${SEVERITY_COLORS[sev]}22`, color: SEVERITY_COLORS[sev] }}>{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </aside>

                {/* CENTER */}
                <main className="col-span-6 flex flex-col gap-3 overflow-y-auto">
                    {/* Tab bar */}
                    <div className="flex gap-2 shrink-0">
                        {tabs.map(t => (
                            <button key={t.id} onClick={() => setActiveTab(t.id)}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                                style={{
                                    background: activeTab === t.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                    border: activeTab === t.id ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                    color: activeTab === t.id ? '#a5b4fc' : 'var(--text-muted)',
                                }}>
                                {t.label}
                                {t.badge && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full font-bold animate-pulse"
                                        style={{ background: t.badge === 'LIVE' ? 'rgba(16,185,129,0.2)' : 'rgba(99,102,241,0.3)', color: t.badge === 'LIVE' ? '#10b981' : '#a5b4fc', fontSize: '9px' }}>
                                        {t.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ── VIDEO CALL TAB ──────────────────────────────────────────── */}
                    {activeTab === 'video' && (
                        <>
                            <div className="glass-card p-4 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <p className="label mb-0">📹 Live Video Interview</p>
                                    <div className="flex items-center gap-2">
                                        <button onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}
                                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                                            style={{ background: isMuted ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                            {isMuted ? '🔇' : '🎤'}
                                        </button>
                                        <button onClick={toggleCamera} title={isCameraOff ? 'Turn on cam' : 'Turn off cam'}
                                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                                            style={{ background: isCameraOff ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                            {isCameraOff ? '📷' : '📹'}
                                        </button>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${callState === 'connected' ? 'animate-pulse' : ''}`}
                                            style={{
                                                background: callState === 'connected' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                                                border: callState === 'connected' ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                                color: callState === 'connected' ? '#10b981' : '#64748b',
                                            }}>
                                            {callState === 'connected' ? 'LIVE' : callState === 'waiting' ? 'Waiting...' : callState === 'connecting' ? 'Connecting...' : 'No call'}
                                        </span>
                                    </div>
                                </div>

                                {/* Video layout: candidate (large) + recruiter own PiP */}
                                <div className="relative rounded-xl overflow-hidden"
                                    style={{
                                        background: '#000', minHeight: '300px',
                                        border: cheatAlerts[0]?.severity === 'critical' && (Date.now() - new Date(cheatAlerts[0]?.timestamp).getTime() < 5000)
                                            ? '2px solid rgba(239,68,68,0.6)' : '1px solid rgba(255,255,255,0.08)',
                                        boxShadow: cheatAlerts[0]?.severity === 'critical' && (Date.now() - new Date(cheatAlerts[0]?.timestamp).getTime() < 5000)
                                            ? '0 0 20px rgba(239,68,68,0.2)' : 'none',
                                    }}>
                                    <video ref={remoteVideoRef} autoPlay playsInline
                                        className="w-full object-cover" style={{ minHeight: '300px', display: remoteStream ? 'block' : 'none' }} />
                                    {!remoteStream && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                            <span className="text-4xl">👤</span>
                                            <span className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                                {candidateStatus.joined ? 'Connecting video...' : 'Waiting for candidate to join...'}
                                            </span>
                                        </div>
                                    )}
                                    {/* Candidate label */}
                                    <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                        <div className="text-xs font-semibold px-2 py-1 rounded-lg"
                                            style={{ background: 'rgba(0,0,0,0.7)', color: 'rgba(255,255,255,0.9)' }}>
                                            {candidateStatus.candidate_name || 'Candidate'}
                                        </div>
                                        {/* Latest video cheat alert overlay */}
                                        {cheatAlerts[0] && ['face_not_detected', 'multiple_faces_detected', 'gaze_away'].includes(cheatAlerts[0].event_type) && (
                                            <div className="text-xs font-bold px-2 py-1 rounded-lg animate-pulse"
                                                style={{ background: `${SEVERITY_COLORS[cheatAlerts[0].severity]}25`, border: `1px solid ${SEVERITY_COLORS[cheatAlerts[0].severity]}60`, color: SEVERITY_COLORS[cheatAlerts[0].severity] }}>
                                                {cheatAlerts[0].event_type === 'face_not_detected' ? '📷 Face missing' : cheatAlerts[0].event_type === 'multiple_faces_detected' ? '👥 Multiple faces!' : '👀 Not focused'}
                                            </div>
                                        )}
                                    </div>

                                    {/* Recruiter PiP */}
                                    <div className="absolute top-3 right-3 rounded-xl overflow-hidden"
                                        style={{ width: '120px', height: '90px', background: '#111', border: '2px solid rgba(99,102,241,0.5)' }}>
                                        <video ref={localVideoRef} autoPlay playsInline muted
                                            className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)', display: localStream ? 'block' : 'none' }} />
                                        {!localStream && (
                                            <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                                <span className="text-xl">👤</span>
                                            </div>
                                        )}
                                        <div className="absolute bottom-1 left-1 text-xs px-1 rounded"
                                            style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.7)', fontSize: '9px' }}>
                                            You
                                        </div>
                                    </div>
                                </div>

                                {/* Score timeline under video */}
                                <div>
                                    <p className="label mb-2">Score Timeline</p>
                                    <ResponsiveContainer width="100%" height={100}>
                                        <AreaChart data={scoreHistory}>
                                            <defs>
                                                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#475569' }} />
                                            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#475569' }} />
                                            <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', fontSize: 10 }} />
                                            <Area type="monotone" dataKey="score" stroke="#6366f1" fill="url(#sg)" strokeWidth={2} dot={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── LIVE CODE TAB ───────────────────────────────────────────── */}
                    {activeTab === 'code' && (
                        <>
                            <div className="glass-card flex flex-col" style={{ minHeight: '300px' }}>
                                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
                                    <div className="flex items-center gap-3">
                                        <p className="label mb-0">Live Code Stream</p>
                                        {liveCode && <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>{liveCode.language}</span>}
                                    </div>
                                    {liveCode && <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{liveCode.char_count} chars · {liveCode.code.split('\n').length} lines</span>}
                                </div>
                                <div className="flex-1 overflow-auto" style={{ maxHeight: '320px' }}>
                                    {liveCode ? (
                                        <div className="flex" style={{ minHeight: '100%' }}>
                                            <div className="select-none px-3 pt-3 text-right text-xs font-mono leading-6 shrink-0" style={{ color: 'rgba(99,102,241,0.35)', background: 'rgba(0,0,0,0.2)', minWidth: '2.5rem' }}>
                                                {liveCode.code.split('\n').map((_, i) => <div key={i}>{i + 1}</div>)}
                                            </div>
                                            <pre className="flex-1 p-3 text-xs font-mono leading-6 whitespace-pre" style={{ color: '#e2e8f0', background: 'transparent', margin: 0 }}>
                                                {liveCode.code}
                                            </pre>
                                        </div>
                                    ) : (
                                        <div className="h-48 flex flex-col items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                                            <span className="text-3xl">⌨️</span>
                                            <span>{candidateStatus.joined ? 'Waiting for candidate to start typing...' : 'Waiting for candidate...'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="glass-card p-4">
                                <p className="label mb-3">Score Timeline</p>
                                <ResponsiveContainer width="100%" height={110}>
                                    <AreaChart data={scoreHistory}>
                                        <defs>
                                            <linearGradient id="sg2" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#475569' }} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#475569' }} />
                                        <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', fontSize: 10 }} />
                                        <Area type="monotone" dataKey="score" stroke="#6366f1" fill="url(#sg2)" strokeWidth={2} dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}

                    {/* ── ANALYTICS TAB ──────────────────────────────────────────── */}
                    {activeTab === 'charts' && (
                        <>
                            <div className="glass-card p-4">
                                <p className="label mb-3">Score over Time</p>
                                <ResponsiveContainer width="100%" height={140}>
                                    <AreaChart data={scoreHistory}>
                                        <defs>
                                            <linearGradient id="sg3" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#475569' }} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#475569' }} />
                                        <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', fontSize: 10 }} />
                                        <Area type="monotone" dataKey="score" stroke="#6366f1" fill="url(#sg3)" strokeWidth={2} dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="glass-card p-4">
                                <p className="label mb-3">Typing Speed (WPM)</p>
                                {typingData.length === 0 ? (
                                    <div className="h-20 flex items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>Waiting for typing data...</div>
                                ) : (
                                    <ResponsiveContainer width="100%" height={100}>
                                        <LineChart data={typingData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                            <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#475569' }} />
                                            <YAxis tick={{ fontSize: 9, fill: '#475569' }} />
                                            <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', fontSize: 10 }} />
                                            <Line type="monotone" dataKey="wpm" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3, fill: '#06b6d4' }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </>
                    )}
                </main>

                {/* RIGHT — Cheat Alerts + Events */}
                <aside className="col-span-3 flex flex-col gap-3 overflow-hidden">
                    {/* Cheat Alert Feed */}
                    <div className="glass-card flex flex-col" style={{ maxHeight: '60vh' }}>
                        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
                            <p className="label mb-0">🚨 Cheat Alerts</p>
                            {cheatAlerts.length > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-bold animate-pulse"
                                    style={{ background: 'rgba(239,68,68,0.25)', color: '#f87171' }}>{cheatAlerts.length}</span>
                            )}
                        </div>
                        <div ref={alertRef} className="flex-1 overflow-y-auto space-y-2 p-3">
                            {cheatAlerts.length === 0 ? (
                                <div className="text-center py-6 text-xs" style={{ color: 'var(--text-muted)' }}>
                                    <div className="text-2xl mb-2">✅</div>No cheat alerts
                                </div>
                            ) : cheatAlerts.map(alert => {
                                const expanded = expandedAlertId === alert.id;
                                return (
                                    <div key={alert.id} className="rounded-xl overflow-hidden cursor-pointer transition-all"
                                        style={{ background: `${SEVERITY_COLORS[alert.severity]}12`, border: `1px solid ${SEVERITY_COLORS[alert.severity]}${alert.severity === 'critical' ? '60' : '35'}`, boxShadow: alert.severity === 'critical' ? `0 0 12px ${SEVERITY_COLORS[alert.severity]}30` : 'none' }}
                                        onClick={() => setExpandedAlertId(expanded ? null : alert.id)}>
                                        <div className="px-3 py-2.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-black px-2 py-0.5 rounded"
                                                    style={{ background: `${SEVERITY_COLORS[alert.severity]}25`, color: SEVERITY_COLORS[alert.severity] }}>
                                                    {CHEAT_LABELS[alert.event_type] ?? alert.event_type}
                                                </span>
                                                <span className="text-xs" style={{ color: SEVERITY_COLORS[alert.severity] }}>{alert.severity.toUpperCase()}</span>
                                            </div>
                                            <p className="text-xs mt-1.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>{alert.message}</p>
                                            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{new Date(alert.timestamp).toLocaleTimeString()}</p>
                                        </div>
                                        {alert.code_snapshot && expanded && (
                                            <div className="border-t px-3 py-2" style={{ borderColor: `${SEVERITY_COLORS[alert.severity]}25` }}>
                                                <pre className="text-xs font-mono rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap" style={{ background: 'rgba(0,0,0,0.3)', color: '#e2e8f0' }}>{alert.code_snapshot}</pre>
                                            </div>
                                        )}
                                        {alert.code_snapshot && <div className="px-3 pb-2 text-xs" style={{ color: 'var(--text-muted)' }}>{expanded ? '▲ Hide' : '▼ Snapshot'}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Live Events */}
                    <div className="glass-card p-4 flex flex-col flex-1" style={{ maxHeight: '38vh', overflow: 'hidden' }}>
                        <div className="flex items-center justify-between mb-3 shrink-0">
                            <p className="label mb-0">Live Events</p>
                            {events.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>{events.length}</span>}
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1.5">
                            {events.length === 0 ? (
                                <div className="text-center py-6 text-xs" style={{ color: 'var(--text-muted)' }}>Waiting for events...</div>
                            ) : events.map((ev, i) => (
                                <div key={ev.id || i} className="rounded-lg px-3 py-2" style={{ background: `${SEVERITY_COLORS[ev.severity]}10`, border: `1px solid ${SEVERITY_COLORS[ev.severity]}25` }}>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs">{EVENT_ICONS[ev.event_type] || '•'}</span>
                                            <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)', maxWidth: '110px' }}>{ev.event_type.replace(/_/g, ' ')}</span>
                                        </div>
                                        <span className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${SEVERITY_COLORS[ev.severity]}20`, color: SEVERITY_COLORS[ev.severity] }}>{ev.severity}</span>
                                    </div>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{new Date(ev.timestamp).toLocaleTimeString()}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            </div>

            {/* Session ended overlay */}
            {sessionEnded && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
                    <div className="glass-card p-8 max-w-sm w-full text-center">
                        <div className="text-5xl mb-4">🏁</div>
                        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Session Ended</h2>
                        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                            Final score: <strong style={{ color: score >= 75 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444' }}>{Math.round(score)}/100</strong>
                            &nbsp;· Cheat alerts: <strong style={{ color: cheatAlerts.length > 0 ? '#ef4444' : '#10b981' }}>{cheatAlerts.length}</strong>
                        </p>
                        <button onClick={() => router.push(`/report/${meetingId}`)} className="btn-primary w-full py-3">View Full Report</button>
                    </div>
                </div>
            )}

            {showPushModal && <PushModal onClose={() => setShowPushModal(false)} onSend={handlePushQuestion} />}
        </div>
    );
}
