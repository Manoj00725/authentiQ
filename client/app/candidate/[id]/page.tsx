'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useMonitoring } from '@/hooks/useMonitoring';
import type { BehaviorEvent } from '@/types';

const INTERVIEW_QUESTIONS = [
    'Tell me about yourself and your background in software engineering.',
    'Describe a challenging technical problem you solved. Walk me through your approach.',
    'How do you handle disagreements with teammates about technical decisions?',
    'What is your experience with system design and scalability?',
    'Where do you see yourself in 5 years, and how does this role fit that vision?',
];

const WARNING_EVENTS = new Set(['tab_switch', 'paste_attempt', 'fullscreen_exit', 'word_burst']);

export default function CandidatePage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const sessionId = params?.id as string;
    const meetingId = searchParams?.get('meeting_id') || '';

    const { connected, emit } = useWebSocket();
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [answer, setAnswer] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const [warning, setWarning] = useState('');
    const [sessionEnded, setSessionEnded] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [candidateName, setCandidateName] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Emit behavior events to backend
    const handleBehaviorEvent = useCallback((event: BehaviorEvent) => {
        if (!connected) return;
        emit('behavior_event', { session_id: sessionId, event });
        if (WARNING_EVENTS.has(event.event_type)) {
            const msgs: Record<string, string> = {
                tab_switch: '⚠️ Tab switch detected – please stay on this window',
                paste_attempt: '⚠️ Paste detected – please type your answer manually',
                fullscreen_exit: '⚠️ Please return to fullscreen mode',
                word_burst: '⚠️ Unusual text insertion detected',
            };
            setWarning(msgs[event.event_type] || '⚠️ Suspicious activity detected');
            setTimeout(() => setWarning(''), 4000);
        }
    }, [connected, emit, sessionId]);

    const { attachToTextarea, getTypingSpeeds } = useMonitoring({ sessionId, onEvent: handleBehaviorEvent });

    // Attach monitoring to textarea
    useEffect(() => {
        if (!textareaRef.current) return;
        const cleanup = attachToTextarea(textareaRef.current);
        return cleanup;
    }, [attachToTextarea, currentQuestion]);

    // Notify server candidate joined
    useEffect(() => {
        if (!connected || !sessionId || !meetingId) return;
        const name = localStorage.getItem(`candidate_name_${sessionId}`) || 'Candidate';
        setCandidateName(name);
        emit('candidate_joined', { meeting_id: meetingId, session_id: sessionId, candidate_name: name });
    }, [connected, sessionId, meetingId, emit]);

    // Timer
    useEffect(() => {
        const iv = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(iv);
    }, []);

    const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    const handleSubmitAnswer = () => {
        if (!answer.trim()) return;
        emit('answer_submitted', { session_id: sessionId, answer: answer.trim(), question_index: currentQuestion });
        setSubmitted(true);
        setTimeout(() => {
            if (currentQuestion < INTERVIEW_QUESTIONS.length - 1) {
                setCurrentQuestion(q => q + 1);
                setAnswer('');
                setSubmitted(false);
            } else {
                handleEndSession();
            }
        }, 1200);
    };

    const handleEndSession = () => {
        emit('session_end', { session_id: sessionId });
        setSessionEnded(true);
        if (document.fullscreenElement) document.exitFullscreen?.();
        router.push(`/report/${meetingId}`);
    };

    if (sessionEnded) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
                <div className="glass-card p-10 text-center max-w-sm">
                    <div className="text-5xl mb-4">🏁</div>
                    <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Interview Complete!</h2>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Your session has been recorded. Thank you!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
            {/* Warning banner */}
            {warning && (
                <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center py-3 text-sm font-semibold animate-float-up"
                    style={{ background: 'rgba(239,68,68,0.9)', color: 'white' }}>
                    {warning}
                </div>
            )}

            {/* Top bar */}
            <header className="flex items-center justify-between px-6 py-3 border-b sticky top-0 z-40"
                style={{ background: 'rgba(5,8,20,0.95)', borderColor: 'var(--border)', backdropFilter: 'blur(12px)' }}>
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                    </div>
                    <div>
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{candidateName || 'Candidate'}</span>
                        <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>Interview in progress</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {/* Monitoring indicator */}
                    <div className="flex items-center gap-1.5 text-xs font-medium"
                        style={{ color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', padding: '4px 10px', borderRadius: '20px' }}>
                        <span className="glow-dot green" style={{ width: '6px', height: '6px' }} />
                        Monitoring Active
                    </div>
                    {/* Timer */}
                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--accent-cyan)' }}>
                        {formatTime(elapsed)}
                    </span>
                    {/* Connection */}
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <span className={`glow-dot ${connected ? 'green' : 'red'}`} style={{ width: '5px', height: '5px' }} />
                        {connected ? 'Connected' : 'Reconnecting...'}
                    </div>
                </div>
            </header>

            {/* Main */}
            <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-3xl mx-auto w-full">
                {/* Progress */}
                <div className="w-full mb-6">
                    <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                        <span>Question {currentQuestion + 1} of {INTERVIEW_QUESTIONS.length}</span>
                        <span>{Math.round(((currentQuestion) / INTERVIEW_QUESTIONS.length) * 100)}% complete</span>
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ background: 'var(--border)', height: '4px' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${((currentQuestion) / INTERVIEW_QUESTIONS.length) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #06b6d4)' }} />
                    </div>
                </div>

                {/* Question card */}
                <div className="glass-card w-full p-6 mb-5">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-bold px-2 py-1 rounded"
                            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                            Q{currentQuestion + 1}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Technical Interview</span>
                    </div>
                    <p className="text-lg font-semibold leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                        {INTERVIEW_QUESTIONS[currentQuestion]}
                    </p>
                </div>

                {/* Answer box */}
                <div className="w-full mb-5">
                    <label className="label">Your Answer</label>
                    <textarea
                        ref={textareaRef}
                        value={answer}
                        onChange={e => setAnswer(e.target.value)}
                        className="input-field resize-none w-full"
                        rows={8}
                        placeholder="Type your answer here..."
                        disabled={submitted}
                    />
                    <div className="flex justify-between mt-1.5">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {answer.trim().split(/\s+/).filter(Boolean).length} words
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Typing naturally improves your authenticity score
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between w-full">
                    <button onClick={handleEndSession} className="btn-secondary px-5 py-2.5 text-sm"
                        style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}>
                        End Interview
                    </button>
                    <button onClick={handleSubmitAnswer} className="btn-primary px-8 py-2.5" disabled={!answer.trim() || submitted}>
                        {submitted ? '✓ Submitted' : currentQuestion < INTERVIEW_QUESTIONS.length - 1 ? 'Next Question →' : 'Finish Interview'}
                    </button>
                </div>

                {/* Transparency footer */}
                <div className="mt-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    🛡️ AuthentiQ monitors behavioral signals (tab focus, typing speed, paste events) for fairness. No screen recording, no OS access.
                </div>
            </main>
        </div>
    );
}
