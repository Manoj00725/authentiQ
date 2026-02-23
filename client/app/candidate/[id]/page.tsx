'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useMonitoring } from '@/hooks/useMonitoring';
import { useVideoCall } from '@/hooks/useVideoCall';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import type { BehaviorEvent, Severity, CodingChallenge, CodingLanguage } from '@/types';

const DEFAULT_CHALLENGES: CodingChallenge[] = [
    {
        id: 'q1', title: 'Two Sum', language: 'javascript',
        description: 'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nReturn the answer in any order.',
        starter_code: `/**\n * @param {number[]} nums\n * @param {number} target\n * @return {number[]}\n */\nfunction twoSum(nums, target) {\n    \n}`,
        examples: [{ input: 'nums = [2,7,11,15], target = 9', output: '[0,1]', explanation: 'nums[0] + nums[1] = 2 + 7 = 9' }, { input: 'nums = [3,2,4], target = 6', output: '[1,2]' }],
        constraints: ['2 ≤ nums.length ≤ 10⁴', '-10⁹ ≤ nums[i] ≤ 10⁹', 'Only one valid answer exists'],
    },
    {
        id: 'q2', title: 'Reverse a Linked List', language: 'javascript',
        description: 'Given the `head` of a singly linked list, reverse the list and return the reversed list.',
        starter_code: `/**\n * @param {ListNode} head\n * @return {ListNode}\n */\nfunction reverseList(head) {\n    \n}`,
        examples: [{ input: 'head = [1,2,3,4,5]', output: '[5,4,3,2,1]' }, { input: 'head = [1,2]', output: '[2,1]' }],
        constraints: ['The number of nodes in the list is in the range [0, 5000]', '-5000 ≤ Node.val ≤ 5000'],
    },
    {
        id: 'q3', title: 'System Design: URL Shortener', language: 'javascript',
        description: 'Design a URL shortening service (like bit.ly).\n\n**Requirements:**\n- URLs must be shortened to a 7-character alphanumeric code\n- Original URLs should be retrievable from the short code\n- Handle 100M+ URLs\n\nExplain your data structures, API design, and any trade-offs.',
        starter_code: `// Data structures and pseudo-code design\n// API endpoints:\n// POST /shorten { url } -> { shortCode }\n// GET /{shortCode} -> 302 redirect\n\n// Your approach:\n`,
        examples: [],
        constraints: ['Think about hash collisions', 'Consider caching layer', 'Discuss DB sharding strategy'],
    },
];

const LANGUAGES: CodingLanguage[] = ['javascript', 'python', 'java', 'cpp', 'typescript'];
const STARTER_CODE: Record<CodingLanguage, string> = {
    javascript: `function solution() {\n    \n}`,
    python: `def solution():\n    pass`,
    java: `class Solution {\n    public void solve() {\n        \n    }\n}`,
    cpp: `#include <vector>\nusing namespace std;\n\nclass Solution {\npublic:\n    void solve() {\n        \n    }\n};`,
    typescript: `function solution(): void {\n    \n}`,
};

const FACE_STATUS_CONFIG = {
    loading: { color: '#94a3b8', icon: '⏳', label: 'Loading AI...' },
    ready: { color: '#94a3b8', icon: '🔄', label: 'Starting detection' },
    face_detected: { color: '#10b981', icon: '✅', label: 'Face Detected' },
    no_face: { color: '#ef4444', icon: '❌', label: 'Face Not Visible' },
    multiple_faces: { color: '#ef4444', icon: '👥', label: 'Multiple Faces!' },
    gaze_away: { color: '#f59e0b', icon: '👀', label: 'Looking Away' },
    no_camera: { color: '#94a3b8', icon: '📷', label: 'No Camera' },
};

export default function CandidatePage() {
    const params = useParams();
    const sessionId = params?.id as string;
    const router = useRouter();
    const { connected, emit, on } = useWebSocket();

    const [meetingId, setMeetingId] = useState('');
    const [candidateName, setCandidateName] = useState('');
    const [challenges, setChallenges] = useState<CodingChallenge[]>(DEFAULT_CHALLENGES);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [code, setCode] = useState(DEFAULT_CHALLENGES[0].starter_code);
    const [language, setLanguage] = useState<CodingLanguage>('javascript');
    const [warnings, setWarnings] = useState<string[]>([]);
    const [sessionEnded, setSessionEnded] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [videoMinimized, setVideoMinimized] = useState(false);

    const codeRef = useRef<HTMLTextAreaElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const streamDebounceRef = useRef<NodeJS.Timeout | null>(null);

    // ── WebSocket lifecycle ────────────────────────────────────────────────────
    useEffect(() => {
        const stored = sessionStorage.getItem('candidate_name') || 'Candidate';
        const mid = sessionStorage.getItem('meeting_id') || '';
        setCandidateName(stored);
        setMeetingId(mid);
    }, []);

    useEffect(() => {
        if (!connected || !meetingId) return;
        emit('candidate_joined', { meeting_id: meetingId, session_id: sessionId, candidate_name: candidateName });
    }, [connected, meetingId, sessionId, candidateName, emit]);

    // Listen for recruiter's pushed questions and session-end
    useEffect(() => {
        const unsub1 = on('question_pushed', (challenge: CodingChallenge) => {
            setChallenges(prev => [...prev, challenge]);
            setCurrentIndex(challenges.length);
            setCode(challenge.starter_code);
            setLanguage(challenge.language);
            setWarnings(prev => [...prev.slice(-2), '📨 Recruiter sent a new question!']);
        });
        const unsub2 = on('session_ended', () => setSessionEnded(true));
        return () => { unsub1(); unsub2(); };
    }, [on, challenges.length]);

    // ── Behavior monitoring ───────────────────────────────────────────────────
    const handleBehaviorEvent = useCallback((event: BehaviorEvent) => {
        emit('behavior_event', { session_id: sessionId, event });
        const labels: Record<string, string> = {
            tab_switch: '⚠️ Tab switch detected', window_blur: '⚠️ Window focus lost',
            fullscreen_exit: '⚠️ Fullscreen exit detected', code_paste: '🚨 Code paste blocked',
            devtools_open: '🚨 DevTools detected', keyboard_shortcut_cheat: '🚨 Cheat shortcut blocked',
            ai_pattern_detected: '🚨 AI-pattern detected', rapid_solution: '⚠️ Rapid solution flagged',
            face_not_detected: '📷 Face not visible — stay in camera view', multiple_faces_detected: '👥 Multiple faces detected!',
            gaze_away: '👀 Please focus on the screen',
        };
        const label = labels[event.event_type];
        if (label) setWarnings(prev => [...prev.slice(-3), label]);
    }, [emit, sessionId]);

    const { attachToCodeEditor } = useMonitoring({ sessionId, onEvent: handleBehaviorEvent });

    // Attach anti-cheat to code textarea
    useEffect(() => {
        const cleanup = attachToCodeEditor(codeRef.current);
        return cleanup;
    }, [attachToCodeEditor]);

    // Fullscreen
    useEffect(() => {
        document.documentElement.requestFullscreen?.().catch(() => { });
        const onFsChange = () => {
            if (!document.fullscreenElement) {
                handleBehaviorEvent({ event_type: 'fullscreen_exit', timestamp: new Date().toISOString(), severity: 'high' });
            }
        };
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, [handleBehaviorEvent]);

    // Timer
    useEffect(() => {
        const iv = setInterval(() => setElapsed(s => s + 1), 1000);
        return () => clearInterval(iv);
    }, []);

    // ── Video call ─────────────────────────────────────────────────────────────
    const { callState, localStream, remoteStream, isMuted, isCameraOff, startCall, endCall, toggleMute, toggleCamera } = useVideoCall({
        role: 'candidate', meetingId, sessionId, emit, on,
    });

    // Attach streams to video elements
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Auto-start video call when connected
    useEffect(() => {
        if (connected && meetingId && callState === 'idle') {
            const timer = setTimeout(() => startCall(), 1500);
            return () => clearTimeout(timer);
        }
    }, [connected, meetingId, callState, startCall]);

    // ── Face detection (runs on candidate's local video) ─────────────────────
    const handleFaceEvent = useCallback((eventType: 'face_not_detected' | 'multiple_faces_detected' | 'gaze_away') => {
        const severityMap: Record<string, Severity> = {
            face_not_detected: 'high', multiple_faces_detected: 'critical', gaze_away: 'medium',
        };
        handleBehaviorEvent({ event_type: eventType, timestamp: new Date().toISOString(), severity: severityMap[eventType] });
    }, [handleBehaviorEvent]);

    const { faceStatus } = useFaceDetection({
        videoRef: localVideoRef,
        enabled: !!localStream,
        onFaceEvent: handleFaceEvent,
    });

    const faceCfg = FACE_STATUS_CONFIG[faceStatus];

    // ── Code streaming ─────────────────────────────────────────────────────────
    const handleCodeChange = useCallback((val: string) => {
        setCode(val);
        if (streamDebounceRef.current) clearTimeout(streamDebounceRef.current);
        streamDebounceRef.current = setTimeout(() => {
            emit('code_update', { session_id: sessionId, code: val, language });
        }, 500);
    }, [emit, sessionId, language]);

    // Language change resets starter
    const handleLanguageChange = useCallback((lang: CodingLanguage) => {
        setLanguage(lang);
        const challenge = challenges[currentIndex];
        setCode(challenge.language === lang ? challenge.starter_code : STARTER_CODE[lang]);
    }, [challenges, currentIndex]);

    // Next question
    const handleSubmit = useCallback(() => {
        emit('answer_submitted', { session_id: sessionId, answer: code, question_index: currentIndex });
        if (currentIndex + 1 < challenges.length) {
            const next = challenges[currentIndex + 1];
            setCurrentIndex(currentIndex + 1);
            setCode(next.starter_code);
            setLanguage(next.language);
        }
    }, [emit, sessionId, code, currentIndex, challenges]);

    const handleEndInterview = useCallback(() => {
        emit('session_end', { session_id: sessionId });
        endCall();
        setSessionEnded(true);
    }, [emit, sessionId, endCall]);

    const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
    const currentChallenge = challenges[currentIndex];
    const lines = code.split('\n');

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)', height: '100vh', overflow: 'hidden' }}>
            {/* Top bar */}
            <header className="flex items-center justify-between px-5 py-2 border-b shrink-0"
                style={{ background: 'rgba(5,8,20,0.95)', borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3">
                    <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Candidate</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Coding Interview · Challenge {currentIndex + 1}/{challenges.length}</span>
                    {/* Face detection badge */}
                    {localStream && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: `${faceCfg.color}18`, border: `1px solid ${faceCfg.color}40`, color: faceCfg.color }}>
                            {faceCfg.icon} {faceCfg.label}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#10b981' }}>
                        <span style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%', display: 'inline-block' }} />
                        Anti-cheat Active
                    </div>
                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--accent-cyan)' }}>{formatTime(elapsed)}</span>
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span className={`glow-dot ${connected ? 'green' : 'red'}`} style={{ width: 6, height: 6 }} />
                        {connected ? 'Connected' : 'Disconnected'}
                    </div>
                </div>
            </header>

            {/* Warning banners */}
            {warnings.length > 0 && (
                <div className="shrink-0">
                    {warnings.slice(-2).map((w, i) => (
                        <div key={i} className="px-4 py-2 text-sm font-semibold text-center"
                            style={{ background: 'rgba(239,68,68,0.15)', borderBottom: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                            {w}
                        </div>
                    ))}
                </div>
            )}

            {/* ── VIDEO CALL BAR ─────────────────────────────────────────────────────── */}
            <div className="shrink-0 border-b" style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.4)' }}>
                <div className="flex items-center justify-between px-4 py-1.5">
                    {/* Call state indicator */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                            {callState === 'connected' ? '📹 Video Call Active' : callState === 'waiting' ? '⏳ Waiting for recruiter...' : callState === 'connecting' ? '🔄 Connecting...' : callState === 'error' ? '❌ Connection failed' : '📹 Video Call'}
                        </span>
                        {callState === 'connected' && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold animate-pulse"
                                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981' }}>
                                LIVE
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Mic / Camera toggles */}
                        <button onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all"
                            style={{ background: isMuted ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                            {isMuted ? '🔇' : '🎤'}
                        </button>
                        <button onClick={toggleCamera} title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all"
                            style={{ background: isCameraOff ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                            {isCameraOff ? '📷' : '📹'}
                        </button>
                        <button onClick={() => setVideoMinimized(v => !v)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' }}>
                            {videoMinimized ? '▼' : '▲'}
                        </button>
                    </div>
                </div>

                {!videoMinimized && (
                    <div className="flex items-center gap-3 px-4 pb-3">
                        {/* Recruiter's video (large) */}
                        <div className="relative rounded-xl overflow-hidden flex-1" style={{ maxHeight: '160px', background: '#000', border: '1px solid rgba(255,255,255,0.08)', minHeight: '120px' }}>
                            <video ref={remoteVideoRef} autoPlay playsInline
                                className="w-full h-full object-cover"
                                style={{ maxHeight: '160px', display: remoteStream ? 'block' : 'none' }} />
                            {!remoteStream && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                                    <span className="text-2xl">👤</span>
                                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Recruiter camera</span>
                                </div>
                            )}
                            <div className="absolute bottom-2 left-2 text-xs font-semibold px-2 py-0.5 rounded"
                                style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.8)' }}>
                                Recruiter
                            </div>
                        </div>

                        {/* Candidate's own camera (small PiP) */}
                        <div className="relative rounded-xl overflow-hidden shrink-0" style={{ width: '140px', height: '105px', background: '#000', border: `2px solid ${faceCfg.color}60` }}>
                            <video ref={localVideoRef} autoPlay playsInline muted
                                className="w-full h-full object-cover mirror-video"
                                style={{ display: localStream ? 'block' : 'none', transform: 'scaleX(-1)' }} />
                            {!localStream && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                                    <span className="text-2xl">📷</span>
                                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Your camera</span>
                                </div>
                            )}
                            <div className="absolute bottom-1 left-1 text-xs font-semibold px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.8)' }}>
                                You
                            </div>
                            <div className="absolute top-1 right-1 text-xs font-bold px-1.5 py-0.5 rounded"
                                style={{ background: `${faceCfg.color}22`, color: faceCfg.color, border: `1px solid ${faceCfg.color}40` }}>
                                {faceCfg.icon}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── MAIN CONTENT: Question + Code Editor ─────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">
                {/* LEFT: Question Panel */}
                <div className="w-5/12 flex flex-col border-r overflow-y-auto p-5"
                    style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.015)' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'rgba(99,102,241,0.25)', color: '#a5b4fc' }}>
                            Q{currentIndex + 1}
                        </span>
                        <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{currentChallenge.title}</h2>
                    </div>

                    <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
                        {currentChallenge.description}
                    </p>

                    {currentChallenge.examples && currentChallenge.examples.length > 0 && (
                        <div className="mb-5">
                            <p className="label mb-2">Examples</p>
                            {currentChallenge.examples.map((ex, i) => (
                                <div key={i} className="rounded-lg p-3 mb-2 text-xs font-mono"
                                    style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                                    <div><span style={{ color: '#a5b4fc' }}>Input:</span> <span style={{ color: '#e2e8f0' }}>{ex.input}</span></div>
                                    <div><span style={{ color: '#a5b4fc' }}>Output:</span> <span style={{ color: '#e2e8f0' }}>{ex.output}</span></div>
                                    {ex.explanation && <div className="mt-1" style={{ color: '#475569' }}>// {ex.explanation}</div>}
                                </div>
                            ))}
                        </div>
                    )}

                    {currentChallenge.constraints && currentChallenge.constraints.length > 0 && (
                        <div className="mb-5">
                            <p className="label mb-2">Constraints</p>
                            <ul className="space-y-1">
                                {currentChallenge.constraints.map((c, i) => (
                                    <li key={i} className="text-xs flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
                                        <span style={{ color: '#6366f1', marginTop: 1 }}>•</span>{c}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="mt-auto pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-xs text-center mb-3" style={{ color: 'var(--text-muted)' }}>
                            🛡️ AuthentiQ monitors behavioral signals for fairness. No screen recording.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={handleEndInterview}
                                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                                End Interview
                            </button>
                            <button onClick={handleSubmit}
                                className="flex-1 btn-primary py-2 text-sm">
                                Submit & Next →
                            </button>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Code Editor */}
                <div className="w-7/12 flex flex-col overflow-hidden">
                    {/* Language selector + metrics */}
                    <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                        style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.3)' }}>
                        <div className="flex gap-1">
                            {LANGUAGES.map(lang => (
                                <button key={lang} onClick={() => handleLanguageChange(lang)}
                                    className="px-3 py-1 rounded text-xs font-semibold transition-all"
                                    style={{
                                        background: language === lang ? 'rgba(99,102,241,0.3)' : 'transparent',
                                        border: language === lang ? '1px solid rgba(99,102,241,0.5)' : '1px solid transparent',
                                        color: language === lang ? '#a5b4fc' : 'var(--text-muted)',
                                    }}>
                                    {lang === 'javascript' ? 'JavaScript' : lang === 'python' ? 'Python' : lang === 'java' ? 'Java' : lang === 'cpp' ? 'C++' : 'TypeScript'}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span>{lines.length} lines · {code.length} chars</span>
                            <span className="flex items-center gap-1 font-semibold" style={{ color: '#6366f1' }}>
                                <span style={{ width: 5, height: 5, background: '#6366f1', borderRadius: '50%', display: 'inline-block' }} className="animate-pulse" />
                                Streamed Live
                            </span>
                        </div>
                    </div>

                    {/* Code editor area */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Line numbers */}
                        <div className="select-none text-right px-3 pt-3 text-xs font-mono leading-6 shrink-0 overflow-hidden"
                            style={{ color: 'rgba(99,102,241,0.35)', background: 'rgba(0,0,0,0.2)', minWidth: '2.5rem', lineHeight: '1.5rem' }}>
                            {lines.map((_, i) => <div key={i} style={{ height: '1.5rem' }}>{i + 1}</div>)}
                        </div>
                        {/* Textarea */}
                        <textarea ref={codeRef} value={code} onChange={e => handleCodeChange(e.target.value)}
                            spellCheck={false}
                            className="flex-1 p-3 text-xs font-mono resize-none outline-none leading-6"
                            style={{
                                background: 'transparent', color: '#e2e8f0', lineHeight: '1.5rem',
                                border: 'none', caretColor: '#6366f1',
                            }} />
                    </div>

                    {/* Bottom notice */}
                    <div className="px-4 py-2 text-xs text-center border-t shrink-0"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
                        Right-click &amp; paste blocked · Code streamed to recruiter in real-time
                    </div>
                </div>
            </div>

            {/* Session ended overlay */}
            {sessionEnded && (
                <div className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}>
                    <div className="glass-card p-10 text-center max-w-sm">
                        <div className="text-5xl mb-4">🏁</div>
                        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Interview Complete</h2>
                        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                            Your session has ended. The recruiter will review your results shortly.
                        </p>
                        <button onClick={() => router.push('/')} className="btn-primary w-full py-3">Return Home</button>
                    </div>
                </div>
            )}
        </div>
    );
}
