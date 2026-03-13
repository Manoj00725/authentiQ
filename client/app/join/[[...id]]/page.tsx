'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

// ── Step states ─────────────────────────────────────────────────────────────
type JoinStep = 'details' | 'face_capture' | 'joining';

// Preload AI models as soon as this module is imported (while user fills Step 1)
if (typeof window !== 'undefined') {
    import('@/hooks/useFaceDetection').then(m => m.preloadCaptureModels()).catch(() => { });
}

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

    // Step management
    const [step, setStep] = useState<JoinStep>('details');

    // Face capture state
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [capturing, setCapturing] = useState(false);
    const [faceCaptured, setFaceCaptured] = useState(false);
    const [captureError, setCaptureError] = useState('');
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [attemptCount, setAttemptCount] = useState(0);

    // Start camera for face capture
    const startCamera = useCallback(async () => {
        try {
            setCaptureError('');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadeddata = () => setCameraReady(true);
            }
        } catch (err: any) {
            setCaptureError('Camera access denied. Please allow camera permissions and try again.');
        }
    }, []);

    // Stop camera
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setCameraReady(false);
    }, []);

    // Capture reference face descriptor
    const captureReferencePhoto = useCallback(async () => {
        if (!videoRef.current || !cameraReady) return;

        setCapturing(true);
        setCaptureError('');

        try {
            const { captureReferenceDescriptor } = await import('@/hooks/useFaceDetection');
            const descriptor = await captureReferenceDescriptor(videoRef.current);

            if (!descriptor) {
                const attempt = attemptCount + 1;
                setAttemptCount(attempt);
                const hints = [
                    'No face detected. Make sure your face is clearly visible and well-lit, then try again.',
                    'Still no face found. Try moving closer to the camera and ensure no shadows cover your face.',
                    'Detection is struggling. Try facing a light source (like a window) so your face is evenly lit.',
                ];
                setCaptureError(hints[Math.min(attempt - 1, hints.length - 1)]);
                setCapturing(false);
                return;
            }

            // Store descriptor in sessionStorage as a JSON array
            const descriptorArray = Array.from(descriptor);
            sessionStorage.setItem('face_reference_descriptor', JSON.stringify(descriptorArray));

            // Also capture a preview image
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 240;
            const ctx = canvas.getContext('2d');
            if (ctx && videoRef.current) {
                ctx.drawImage(videoRef.current, 0, 0, 320, 240);
                const imageData = canvas.toDataURL('image/jpeg', 0.7);
                setPreviewImage(imageData);
                sessionStorage.setItem('face_reference_photo', imageData);
            }

            setFaceCaptured(true);
            setAttemptCount(0);
        } catch (err: any) {
            console.error('Face capture error:', err);
            setCaptureError('Face detection models are loading. Please wait a moment and try again.');
        } finally {
            setCapturing(false);
        }
    }, [cameraReady, attemptCount]);

    // Cleanup camera on unmount
    useEffect(() => {
        return () => { stopCamera(); };
    }, [stopCamera]);

    // Start camera and preload models when entering face capture step
    useEffect(() => {
        if (step === 'face_capture') {
            startCamera();
            // Trigger model load (will be near-instant if preload already ran)
            if (!modelsLoaded && !modelsLoading) {
                setModelsLoading(true);
                import('@/hooks/useFaceDetection').then(async (mod) => {
                    mod.preloadCaptureModels();
                    // Wait for a tiny capture attempt so we know models are ready
                    try {
                        await mod.captureReferenceDescriptor(document.createElement('video')).catch(() => { });
                    } catch { }
                    setModelsLoaded(true);
                    setModelsLoading(false);
                }).catch(() => {
                    setModelsLoading(false);
                });
            }
        } else {
            stopCamera();
        }
    }, [step, startCamera, stopCamera, modelsLoaded, modelsLoading]);

    // Retake photo
    const retakePhoto = useCallback(() => {
        setFaceCaptured(false);
        setPreviewImage(null);
        setCaptureError('');
        sessionStorage.removeItem('face_reference_descriptor');
        sessionStorage.removeItem('face_reference_photo');
    }, []);

    // Proceed from details to face capture
    const handleProceedToCapture = (e: React.FormEvent) => {
        e.preventDefault();
        if (!meetingId.trim() || !candidateName.trim() || !consentAccepted) return;
        setStep('face_capture');
    };

    // Join the meeting (after face capture or skip)
    const handleJoin = async () => {
        setLoading(true);
        setError('');
        setStep('joining');
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
            sessionStorage.setItem('meeting_id', meetingId.trim());
            sessionStorage.setItem('candidate_name', candidateName.trim());
            stopCamera();
            router.push(`/candidate/${data.session.id}?meeting_id=${meetingId.trim()}`);
        } catch (err: any) {
            setError(err.message || 'Failed to join meeting. Check the meeting ID.');
            setStep('face_capture');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: 'var(--bg-primary)' }}>
            {/* Ambient gradients */}
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

                {/* Step indicators */}
                <div className="flex items-center gap-3 mb-6">
                    {[
                        { key: 'details', label: '1. Details', icon: '📝' },
                        { key: 'face_capture', label: '2. Face Scan', icon: '📸' },
                        { key: 'joining', label: '3. Enter', icon: '🚀' },
                    ].map((s, i) => (
                        <div key={s.key} className="flex items-center gap-2">
                            {i > 0 && <div className="w-8 h-px" style={{ background: step === s.key || (s.key === 'joining' && step === 'joining') ? 'var(--accent-primary)' : 'var(--border)' }} />}
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                                style={{
                                    background: step === s.key ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                    border: step === s.key ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                    color: step === s.key ? '#a5b4fc' : 'var(--text-muted)',
                                }}>
                                {s.icon} {s.label}
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── STEP 1: Details Form ────────────────────────────────────── */}
                {step === 'details' && (
                    <div className="glass-card p-8 animate-float-up">
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

                        <form onSubmit={handleProceedToCapture} className="space-y-5">
                            <div>
                                <label className="label">Meeting ID or Link</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. a1b2c3d4-e5f6-..."
                                    value={meetingId}
                                    onChange={e => {
                                        let val = e.target.value.trim();
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
                                        <strong style={{ color: 'var(--text-primary)' }}>Monitoring Consent:</strong> I understand that this interview runs in <strong style={{ color: 'var(--text-primary)' }}>enforced fullscreen</strong> and that my <strong style={{ color: 'var(--text-primary)' }}>screen, camera, face identity, emotions, and behavioral signals</strong> (tab switches, paste events, typing patterns, fullscreen status) will be monitored in real-time by AI and the recruiter for authenticity assessment. A reference photo of my face will be captured for identity verification throughout the session. No personal data is stored after the session.
                                    </label>
                                </div>
                            </div>

                            {error && (
                                <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                                    {error}
                                </div>
                            )}

                            <button type="submit" className="btn-primary w-full py-3.5"
                                disabled={!meetingId.trim() || !candidateName.trim() || !consentAccepted}>
                                Continue to Face Scan →
                            </button>
                        </form>
                    </div>
                )}

                {/* ── STEP 2: Face Capture ────────────────────────────────────── */}
                {step === 'face_capture' && (
                    <div className="glass-card p-8 animate-float-up">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}>
                                <span className="text-xl">📸</span>
                            </div>
                            <div>
                                <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Face Identity Scan</h2>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    We&apos;ll capture a reference photo to verify your identity throughout the interview
                                </p>
                            </div>
                        </div>

                        {/* Model loading status */}
                        {modelsLoading && (
                            <div className="rounded-xl p-3 mb-4 flex items-center gap-3 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fcd34d' }}>
                                <span className="w-4 h-4 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin shrink-0" />
                                <span>Loading AI face detection models (~6 MB)… Please wait before capturing.</span>
                            </div>
                        )}
                        {modelsLoaded && !faceCaptured && (
                            <div className="rounded-xl p-3 mb-4 flex items-center gap-2 text-xs" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#6ee7b7' }}>
                                ✅ AI models loaded — you can capture your face now!
                            </div>
                        )}

                        {/* Face capture tips */}
                        <div className="rounded-xl p-3 mb-5 text-xs" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--text-secondary)' }}>
                            <p className="font-semibold mb-1" style={{ color: '#06b6d4' }}>📋 Tips for best results:</p>
                            <ul className="space-y-0.5 ml-4 list-disc">
                                <li>Face the camera directly — fill the oval guide with your face</li>
                                <li>Ensure <strong>good, even lighting</strong> on your face (face a window or lamp)</li>
                                <li>Remove sunglasses, hats, or face coverings</li>
                                <li>Keep a neutral expression and stay still</li>
                                <li>Use a <strong>well-lit background</strong> — avoid pitch dark rooms</li>
                            </ul>
                        </div>

                        {/* Camera feed */}
                        <div className="relative rounded-xl overflow-hidden mb-5" style={{ background: '#000', aspectRatio: '4/3' }}>
                            {!faceCaptured ? (
                                <>
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                                    />
                                    {/* Face guide overlay */}
                                    {cameraReady && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <div className="w-48 h-56 rounded-full border-2 border-dashed opacity-50"
                                                style={{ borderColor: '#06b6d4' }} />
                                        </div>
                                    )}
                                    {!cameraReady && !captureError && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                <span className="w-4 h-4 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                                                Starting camera...
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* Preview captured photo */
                                previewImage && (
                                    <div className="relative w-full h-full">
                                        <img src={previewImage} alt="Captured reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5"
                                            style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.5)', color: '#10b981' }}>
                                            ✓ Face Captured
                                        </div>
                                    </div>
                                )
                            )}
                        </div>

                        {/* Capture errors */}
                        {captureError && (
                            <div className="px-4 py-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                                {captureError}
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-3">
                            <button onClick={() => { stopCamera(); setStep('details'); setAttemptCount(0); setCaptureError(''); }}
                                className="btn-secondary flex-1 py-3">
                                ← Back
                            </button>

                            {!faceCaptured ? (
                                <div className="flex gap-2 flex-1">
                                    <button onClick={captureReferencePhoto}
                                        className="btn-primary flex-1 py-3"
                                        disabled={!cameraReady || capturing || modelsLoading}>
                                        {capturing ? (
                                            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Scanning...</>
                                        ) : modelsLoading ? (
                                            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Loading...</>
                                        ) : (
                                            '📸 Capture Face'
                                        )}
                                    </button>
                                    {/* Skip option after 3 failed attempts */}
                                    {attemptCount >= 3 && (
                                        <button onClick={handleJoin}
                                            className="btn-secondary py-3 text-sm px-4"
                                            disabled={loading}
                                            title="Skip face scan and join without identity verification">
                                            {loading ? 'Joining...' : 'Skip →'}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex gap-2 flex-1">
                                    <button onClick={retakePhoto}
                                        className="btn-secondary flex-1 py-3 text-sm">
                                        🔄 Retake
                                    </button>
                                    <button onClick={handleJoin}
                                        className="btn-primary flex-1 py-3"
                                        disabled={loading}>
                                        {loading ? (
                                            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Joining...</>
                                        ) : (
                                            'Enter Interview →'
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Skip info (shown after failed attempts) */}
                        {attemptCount >= 3 && !faceCaptured && (
                            <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fcd34d' }}>
                                ⚠️ You can <strong>skip</strong> the face scan and join without identity verification. The recruiter will be notified that no reference photo was captured.
                            </div>
                        )}

                        {/* Identity verification explainer */}
                        <div className="mt-5 rounded-xl p-3 text-xs" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                            <p style={{ color: 'var(--text-muted)' }}>
                                🔒 <strong style={{ color: 'var(--text-secondary)' }}>Privacy:</strong> Your face descriptor (a 128-number mathematical representation) is stored only in your browser&apos;s session memory. It is used solely to verify your identity during this interview and is automatically deleted when the session ends. No biometric data is sent to any external server.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── STEP 3: Joining ─────────────────────────────────────────── */}
                {step === 'joining' && (
                    <div className="glass-card p-8 flex flex-col items-center gap-4 animate-float-up">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                            <span className="text-3xl animate-pulse">🚀</span>
                        </div>
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Entering Interview...</h2>
                        <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                            Setting up your secure interview environment with AI monitoring
                        </p>
                        <div className="flex gap-2 flex-wrap justify-center mt-2">
                            {['Identity Verified', 'Camera Ready', 'Anti-Cheat Active'].map(badge => (
                                <span key={badge} className="px-3 py-1 rounded-full text-xs font-semibold"
                                    style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                                    ✓ {badge}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
