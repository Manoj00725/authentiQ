'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ── Types ───────────────────────────────────────────────────────────────────
export type LivenessAction = 'blink' | 'look_left' | 'smile';

export interface LivenessState {
    /** Current action sequence (3 random actions) */
    actions: LivenessAction[];
    /** Index of current action being verified (0-2) */
    currentIndex: number;
    /** Whether each action has been verified */
    verified: boolean[];
    /** Overall liveness result */
    result: 'pending' | 'verified' | 'failed';
    /** Status message for UI */
    message: string;
    /** Whether the check is actively running */
    isRunning: boolean;
    /** If a deepfake or static image is suspected */
    isSuspicious: boolean;
    /** Start the liveness check */
    start: () => void;
    /** Reset and regenerate actions */
    reset: () => void;
}

interface UseLivenessCheckOptions {
    /** Ref to the video element showing the camera feed */
    videoRef: React.RefObject<HTMLVideoElement | null>;
    /** Whether the camera is ready */
    cameraReady: boolean;
    /** Time limit per action in ms (default: 8000) */
    timePerAction?: number;
}

// ── Landmark geometry helpers ───────────────────────────────────────────────

/**
 * Eye Aspect Ratio (EAR)
 * Uses the 6 landmark points per eye from the 68-point model.
 * EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 * Low EAR (< 0.22) indicates a closed eye (blink).
 */
function computeEAR(eyePoints: { x: number; y: number }[]): number {
    if (eyePoints.length < 6) return 0.3; // fallback: eyes open

    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    const v1 = dist(eyePoints[1], eyePoints[5]); // |p2-p6|
    const v2 = dist(eyePoints[2], eyePoints[4]); // |p3-p5|
    const h = dist(eyePoints[0], eyePoints[3]);   // |p1-p4|

    return h > 0 ? (v1 + v2) / (2 * h) : 0.3;
}

/**
 * Mouth Aspect Ratio (MAR)
 * Using outer mouth landmarks.
 * MAR = (|p14-p18| + |p15-p17|) / (2 * |p12-p16|)
 * High MAR (> 0.6) with wide horizontal = smile.
 */
function computeMAR(mouthPoints: { x: number; y: number }[]): number {
    if (mouthPoints.length < 20) return 0.3;

    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    // Outer mouth: indices 0-11, inner: 12-19
    const v1 = dist(mouthPoints[2], mouthPoints[10]); // top-to-bottom vertical
    const v2 = dist(mouthPoints[3], mouthPoints[9]);
    const h = dist(mouthPoints[0], mouthPoints[6]);    // left corner to right corner

    return h > 0 ? (v1 + v2) / (2 * h) : 0.3;
}

/**
 * Head turn detection using nose-to-face center offset.
 * If the nose tip is significantly left of the face center bounding box,
 * the person is looking left.
 */
function computeHeadTurn(
    noseTip: { x: number; y: number },
    jawline: { x: number; y: number }[]
): { turnRatio: number; direction: 'center' | 'left' | 'right' } {
    if (jawline.length < 17) return { turnRatio: 0, direction: 'center' };

    const leftJaw = jawline[0];
    const rightJaw = jawline[16];
    const faceWidth = rightJaw.x - leftJaw.x;
    const faceCenter = (leftJaw.x + rightJaw.x) / 2;

    if (faceWidth <= 0) return { turnRatio: 0, direction: 'center' };

    const offset = (noseTip.x - faceCenter) / faceWidth;

    if (offset < -0.08) return { turnRatio: Math.abs(offset), direction: 'left' };
    if (offset > 0.08) return { turnRatio: Math.abs(offset), direction: 'right' };
    return { turnRatio: Math.abs(offset), direction: 'center' };
}

// ── Action labels for UI ────────────────────────────────────────────────────
export const ACTION_LABELS: Record<LivenessAction, { emoji: string; label: string; instruction: string }> = {
    blink: { emoji: '👁️', label: 'Blink', instruction: 'Blink your eyes 3 times' },
    look_left: { emoji: '👈', label: 'Look Left', instruction: 'Turn your head to the left' },
    smile: { emoji: '😊', label: 'Smile', instruction: 'Give a natural smile' },
};

// ── Generate random 3-action sequence ───────────────────────────────────────
function generateActionSequence(): LivenessAction[] {
    const allActions: LivenessAction[] = ['blink', 'look_left', 'smile'];
    // Fisher-Yates shuffle
    const shuffled = [...allActions];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════
export function useLivenessCheck({
    videoRef,
    cameraReady,
    timePerAction = 8000,
}: UseLivenessCheckOptions): LivenessState {
    const [actions, setActions] = useState<LivenessAction[]>(generateActionSequence);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [verified, setVerified] = useState<boolean[]>([false, false, false]);
    const [result, setResult] = useState<'pending' | 'verified' | 'failed'>('pending');
    const [message, setMessage] = useState('Ready to start liveness check');
    const [isRunning, setIsRunning] = useState(false);
    const [isSuspicious, setIsSuspicious] = useState(false);

    // Internal refs for detection tracking
    const faceapiRef = useRef<any>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Blink tracking
    const blinkCountRef = useRef(0);
    const wasEyeClosedRef = useRef(false);
    const blinkStartTimeRef = useRef(0);

    // Landmark motion tracking (deepfake detection)
    const prevLandmarksRef = useRef<{ x: number; y: number }[] | null>(null);
    const staticFrameCountRef = useRef(0);

    // ── Start the check ─────────────────────────────────────────────────────
    const start = useCallback(() => {
        setIsRunning(true);
        setCurrentIndex(0);
        setVerified([false, false, false]);
        setResult('pending');
        setIsSuspicious(false);
        blinkCountRef.current = 0;
        wasEyeClosedRef.current = false;
        prevLandmarksRef.current = null;
        staticFrameCountRef.current = 0;
        setMessage(`Action 1/3: ${ACTION_LABELS[actions[0]].instruction}`);
    }, [actions]);

    // ── Reset and regenerate ────────────────────────────────────────────────
    const reset = useCallback(() => {
        setIsRunning(false);
        const newActions = generateActionSequence();
        setActions(newActions);
        setCurrentIndex(0);
        setVerified([false, false, false]);
        setResult('pending');
        setIsSuspicious(false);
        setMessage('Ready to start liveness check');
        blinkCountRef.current = 0;
        wasEyeClosedRef.current = false;
        prevLandmarksRef.current = null;
        staticFrameCountRef.current = 0;
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }, []);

    // ── Load face-api.js ────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const fa = await import('face-api.js');
                const MODEL_PATH = '/models';
                await Promise.all([
                    fa.nets.tinyFaceDetector.loadFromUri(MODEL_PATH),
                    fa.nets.faceLandmark68TinyNet.loadFromUri(MODEL_PATH),
                ]);
                faceapiRef.current = fa;
            } catch (e) {
                console.error('[Liveness] Failed to load face-api.js:', e);
            }
        })();
    }, []);

    // ── Main detection loop ─────────────────────────────────────────────────
    useEffect(() => {
        if (!isRunning || !cameraReady || !faceapiRef.current || !videoRef.current) return;
        if (result !== 'pending') return;

        const fa = faceapiRef.current;
        const video = videoRef.current;
        const currentAction = actions[currentIndex];

        // Set per-action timeout
        timeoutRef.current = setTimeout(() => {
            // Time expired for this action — fail
            if (currentAction === 'look_left' && staticFrameCountRef.current > 15) {
                setIsSuspicious(true);
                setMessage('⚠️ Static image or deepfake detected — no head movement');
                setResult('failed');
            } else {
                setMessage(`⏰ Time expired for: ${ACTION_LABELS[currentAction].label}`);
                setResult('failed');
            }
            setIsRunning(false);
            if (intervalRef.current) clearInterval(intervalRef.current);
        }, timePerAction);

        // Reset action-specific counters
        blinkCountRef.current = 0;
        wasEyeClosedRef.current = false;
        blinkStartTimeRef.current = Date.now();
        prevLandmarksRef.current = null;

        // Detection loop: runs every 200ms
        intervalRef.current = setInterval(async () => {
            try {
                const detection = await fa
                    .detectSingleFace(video, new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
                    .withFaceLandmarks(true); // useTinyModel

                if (!detection) return;

                const landmarks = detection.landmarks;
                const positions = landmarks.positions as { x: number; y: number }[];

                // ── Deepfake / static image detection ──
                if (prevLandmarksRef.current) {
                    let totalMotion = 0;
                    const samplePoints = [30, 36, 45, 48, 54]; // nose tip, eye corners, mouth corners
                    for (const idx of samplePoints) {
                        if (positions[idx] && prevLandmarksRef.current[idx]) {
                            const dx = positions[idx].x - prevLandmarksRef.current[idx].x;
                            const dy = positions[idx].y - prevLandmarksRef.current[idx].y;
                            totalMotion += Math.sqrt(dx * dx + dy * dy);
                        }
                    }
                    if (totalMotion < 1.0) {
                        staticFrameCountRef.current++;
                    } else {
                        staticFrameCountRef.current = Math.max(0, staticFrameCountRef.current - 1);
                    }
                }
                prevLandmarksRef.current = positions.map(p => ({ x: p.x, y: p.y }));

                // ── Action-specific verification ──
                if (currentAction === 'blink') {
                    // 68-point landmarks: left eye = 36-41, right eye = 42-47
                    const leftEye = positions.slice(36, 42);
                    const rightEye = positions.slice(42, 48);
                    const avgEAR = (computeEAR(leftEye) + computeEAR(rightEye)) / 2;

                    if (avgEAR < 0.22) {
                        if (!wasEyeClosedRef.current) {
                            wasEyeClosedRef.current = true;
                        }
                    } else {
                        if (wasEyeClosedRef.current) {
                            // Eye reopened = 1 blink completed
                            blinkCountRef.current++;
                            wasEyeClosedRef.current = false;
                            setMessage(`👁️ Blink detected (${blinkCountRef.current}/3) — keep blinking!`);

                            if (blinkCountRef.current >= 3) {
                                const elapsed = Date.now() - blinkStartTimeRef.current;
                                if (elapsed <= 8000) {
                                    markVerified();
                                }
                            }
                        }
                    }
                } else if (currentAction === 'look_left') {
                    const noseTip = positions[30];
                    const jawline = positions.slice(0, 17);
                    const headTurn = computeHeadTurn(noseTip, jawline);

                    if (headTurn.direction === 'left' && headTurn.turnRatio > 0.12) {
                        setMessage('👈 Head turn detected — verifying...');
                        // Check that landmarks actually moved (not a static offset)
                        if (staticFrameCountRef.current < 10) {
                            markVerified();
                        } else {
                            setIsSuspicious(true);
                            setMessage('⚠️ Suspicious: coordinates suggest static image');
                            setResult('failed');
                            setIsRunning(false);
                            if (intervalRef.current) clearInterval(intervalRef.current);
                            if (timeoutRef.current) clearTimeout(timeoutRef.current);
                        }
                    }
                } else if (currentAction === 'smile') {
                    // 68-point: mouth outer = 48-59, inner = 60-67
                    const mouthOuter = positions.slice(48, 68);
                    const mar = computeMAR(mouthOuter);
                    // Also check mouth width relative to face
                    const mouthWidth = Math.abs(positions[54].x - positions[48].x);
                    const faceWidth = Math.abs(positions[16].x - positions[0].x);
                    const widthRatio = faceWidth > 0 ? mouthWidth / faceWidth : 0;

                    if (mar > 0.45 && widthRatio > 0.42) {
                        markVerified();
                    }
                }
            } catch (e) {
                // Transient detection error — skip frame
            }
        }, 200);

        function markVerified() {
            setVerified(prev => {
                const next = [...prev];
                next[currentIndex] = true;
                return next;
            });

            if (intervalRef.current) clearInterval(intervalRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);

            const nextIdx = currentIndex + 1;
            if (nextIdx >= 3) {
                // All 3 actions verified!
                setMessage('✅ Liveness Verified — you are a real person!');
                setResult('verified');
                setIsRunning(false);
                // Store result in session
                sessionStorage.setItem('liveness_verified', 'true');
                sessionStorage.setItem('liveness_timestamp', new Date().toISOString());
            } else {
                setCurrentIndex(nextIdx);
                setMessage(`✓ ${ACTION_LABELS[currentAction].label} verified! Next: ${ACTION_LABELS[actions[nextIdx]].instruction}`);
            }
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [isRunning, cameraReady, currentIndex, actions, result, timePerAction, videoRef]);

    return {
        actions,
        currentIndex,
        verified,
        result,
        message,
        isRunning,
        isSuspicious,
        start,
        reset,
    };
}
