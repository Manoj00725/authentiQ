'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { FaceEmotion, FaceEmotionData, FaceStatusUpdate } from '@/types';

type FaceStatus = 'loading' | 'ready' | 'face_detected' | 'no_face' | 'multiple_faces' | 'gaze_away' | 'no_camera';

type FaceEventType = 'face_not_detected' | 'multiple_faces_detected' | 'gaze_away' | 'suspicious_emotion' | 'face_mismatch';

interface UseFaceDetectionOptions {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    enabled: boolean;
    onFaceEvent: (eventType: FaceEventType, metadata?: Record<string, unknown>) => void;
    intervalMs?: number;
    /** 128D Float32Array reference descriptor captured at join time */
    referenceDescriptor?: Float32Array | null;
}

// ── face-api.js loading (browser-only) ──────────────────────────────────────
// Models served from public/models/ (downloaded from face-api.js GitHub repo)
const FACE_API_MODEL_PATH = '/models';
let faceapi: any = null;
let captureModelsLoaded = false;   // detector + landmarks + recognition (for capture)
let allModelsLoaded = false;       // + expression (for full monitoring)

// Tier 1: Load only the 3 models needed for face capture (~500KB total)
async function loadFaceApiForCapture() {
    if (captureModelsLoaded) return faceapi;
    if (!faceapi) faceapi = await import('face-api.js');
    await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_PATH),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_API_MODEL_PATH),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_PATH),
    ]);
    captureModelsLoaded = true;
    return faceapi;
}

// Tier 2: Load all 4 models (adds expression net for emotion analysis)
async function loadFaceApi() {
    await loadFaceApiForCapture();
    if (allModelsLoaded) return faceapi;
    await faceapi.nets.faceExpressionNet.loadFromUri(FACE_API_MODEL_PATH);
    allModelsLoaded = true;
    return faceapi;
}

// Exported preloader — call from join page as early as possible
export function preloadCaptureModels(): void {
    if (typeof window === 'undefined') return;
    loadFaceApiForCapture().catch(() => { });
}

// ── Snapshot helper ─────────────────────────────────────────────────────────
function captureSnapshot(video: HTMLVideoElement): string | undefined {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;
        ctx.drawImage(video, 0, 0, 320, 240);
        return canvas.toDataURL('image/jpeg', 0.4);
    } catch {
        return undefined;
    }
}

// ── Euclidean distance for 128D face descriptors ─────────────────────────────
function euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

// ── Emotion labels ──────────────────────────────────────────────────────────
const EMOTION_KEYS: FaceEmotion[] = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════
export function useFaceDetection({
    videoRef,
    enabled,
    onFaceEvent,
    intervalMs = 2500,
    referenceDescriptor = null,
}: UseFaceDetectionOptions) {
    const [faceStatus, setFaceStatus] = useState<FaceStatus>('loading');
    const [faceCount, setFaceCount] = useState(0);
    const [detectionReady, setDetectionReady] = useState(false);

    // 🆕 Emotion state
    const [currentEmotion, setCurrentEmotion] = useState<FaceEmotionData | null>(null);
    // 🆕 Identity match state
    const [identityMatch, setIdentityMatch] = useState<'verified' | 'warning' | 'mismatch' | null>(null);
    const [identityDistance, setIdentityDistance] = useState<number>(0);
    // 🆕 Face status history for timeline
    const [faceHistory, setFaceHistory] = useState<FaceStatusUpdate[]>([]);

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const noFaceCountRef = useRef(0);
    const gazeAwayCountRef = useRef(0);
    const eventCooldownRef = useRef<Record<string, number>>({});

    // Emotion pattern tracking
    const emotionHistoryRef = useRef<FaceEmotion[]>([]);
    const neutralStreakRef = useRef(0);
    const lastEmotionRef = useRef<FaceEmotion | null>(null);
    const emotionShiftsRef = useRef<number[]>([]); // timestamps of emotion shifts

    const canEmit = useCallback((eventType: string, cooldownMs = 8000) => {
        const now = Date.now();
        const last = eventCooldownRef.current[eventType] ?? 0;
        if (now - last > cooldownMs) {
            eventCooldownRef.current[eventType] = now;
            return true;
        }
        return false;
    }, []);

    // ── Gaze estimation via nose-to-eye ratio ──────────────────────────────
    const isGazeAway = useCallback((landmarks: any): boolean => {
        try {
            const nose = landmarks.getNose();
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();
            if (!nose?.length || !leftEye?.length || !rightEye?.length) return false;

            const noseTip = nose[3];
            const leftEyeCenter = {
                x: leftEye.reduce((s: number, p: any) => s + p.x, 0) / leftEye.length,
                y: leftEye.reduce((s: number, p: any) => s + p.y, 0) / leftEye.length,
            };
            const rightEyeCenter = {
                x: rightEye.reduce((s: number, p: any) => s + p.x, 0) / rightEye.length,
                y: rightEye.reduce((s: number, p: any) => s + p.y, 0) / rightEye.length,
            };

            const eyeMidX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
            const faceWidth = Math.abs(rightEyeCenter.x - leftEyeCenter.x);
            if (faceWidth < 1) return false;

            const noseOffset = Math.abs(noseTip.x - eyeMidX) / faceWidth;
            return noseOffset > 0.40;
        } catch {
            return false;
        }
    }, []);

    // ── Emotion analysis logic ─────────────────────────────────────────────
    const analyzeEmotion = useCallback((expressions: any, video: HTMLVideoElement): FaceEmotionData | null => {
        if (!expressions) return null;

        const all: Record<FaceEmotion, number> = {} as any;
        let maxConf = 0;
        let dominant: FaceEmotion = 'neutral';

        for (const key of EMOTION_KEYS) {
            const val = expressions[key] ?? 0;
            all[key] = Math.round(val * 100) / 100;
            if (val > maxConf) {
                maxConf = val;
                dominant = key;
            }
        }

        const emotionData: FaceEmotionData = { dominant, confidence: Math.round(maxConf * 100), all };

        // Track emotion history (keep last 20 frames = ~50s of data at 2.5s interval)
        emotionHistoryRef.current.push(dominant);
        if (emotionHistoryRef.current.length > 20) emotionHistoryRef.current.shift();

        // Pattern detection: >90% neutral for 5+ consecutive frames
        if (dominant === 'neutral') {
            neutralStreakRef.current++;
        } else {
            neutralStreakRef.current = 0;
        }

        // Track emotion shifts (more than 3 distinct shifts in 30s = erratic)
        if (lastEmotionRef.current && lastEmotionRef.current !== dominant) {
            emotionShiftsRef.current.push(Date.now());
            // Remove shifts older than 30s
            const cutoff = Date.now() - 30000;
            emotionShiftsRef.current = emotionShiftsRef.current.filter(t => t > cutoff);
        }
        lastEmotionRef.current = dominant;

        // Fire suspicious emotion events
        if (neutralStreakRef.current >= 5 && canEmit('suspicious_emotion_neutral', 60000)) {
            const snapshot = captureSnapshot(video);
            onFaceEvent('suspicious_emotion', {
                reason: 'Unusually flat affect — neutral expression for extended period',
                emotion: emotionData,
                snapshot,
            });
        }

        // Sudden fear/surprise spike with high confidence
        if ((dominant === 'fearful' || dominant === 'surprised') && maxConf > 0.7 && canEmit('suspicious_emotion_spike', 20000)) {
            const snapshot = captureSnapshot(video);
            onFaceEvent('suspicious_emotion', {
                reason: `Stress spike — ${dominant} detected at ${emotionData.confidence}%`,
                emotion: emotionData,
                snapshot,
            });
        }

        // Erratic emotional pattern (>3 shifts in 30s)
        if (emotionShiftsRef.current.length > 3 && canEmit('suspicious_emotion_erratic', 30000)) {
            const snapshot = captureSnapshot(video);
            onFaceEvent('suspicious_emotion', {
                reason: `Erratic emotional pattern — ${emotionShiftsRef.current.length} shifts in 30s`,
                emotion: emotionData,
                snapshot,
            });
        }

        return emotionData;
    }, [canEmit, onFaceEvent]);

    // ── Identity verification logic ────────────────────────────────────────
    const verifyIdentity = useCallback((descriptor: Float32Array, video: HTMLVideoElement): { match: 'verified' | 'warning' | 'mismatch'; distance: number } => {
        if (!referenceDescriptor) return { match: 'verified', distance: 0 };

        const distance = euclideanDistance(descriptor, referenceDescriptor);
        let match: 'verified' | 'warning' | 'mismatch' = 'verified';

        if (distance > 0.6) {
            match = 'mismatch';
            if (canEmit('face_mismatch', 15000)) {
                const snapshot = captureSnapshot(video);
                onFaceEvent('face_mismatch', {
                    distance: Math.round(distance * 1000) / 1000,
                    reason: `Identity mismatch — face descriptor distance ${distance.toFixed(3)} exceeds threshold (0.6)`,
                    snapshot,
                });
            }
        } else if (distance > 0.4) {
            match = 'warning';
        }

        return { match, distance };
    }, [referenceDescriptor, canEmit, onFaceEvent]);

    // ── Initialize face-api.js ─────────────────────────────────────────────
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        const init = async () => {
            try {
                await loadFaceApi();
                if (cancelled) return;
                setFaceStatus('ready');
                setDetectionReady(true);
            } catch (e) {
                console.warn('face-api.js failed to load:', e);
                setFaceStatus('no_camera');
            }
        };

        init();
        return () => { cancelled = true; };
    }, [enabled]);

    // ── Main detection loop ────────────────────────────────────────────────
    useEffect(() => {
        if (!enabled || !detectionReady) return;

        const detect = async () => {
            const video = videoRef.current;
            if (!video || video.readyState < 2 || video.paused) return;

            try {
                // Full detection chain: face → landmarks → expressions → descriptors
                const detections = await faceapi
                    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
                    .withFaceLandmarks(true)
                    .withFaceExpressions()
                    .withFaceDescriptors();

                const count = detections.length;
                setFaceCount(count);

                let status: FaceStatusUpdate['status'] = 'face_detected';
                let emotionData: FaceEmotionData | null = null;
                let idMatch: 'verified' | 'warning' | 'mismatch' | null = null;
                let idDist = 0;

                if (count === 0) {
                    // ── No face ─────────────────────────────────────────────
                    noFaceCountRef.current++;
                    status = 'no_face';
                    setFaceStatus('no_face');

                    if (noFaceCountRef.current >= 2 && canEmit('face_not_detected', 10000)) {
                        const snapshot = captureSnapshot(video);
                        onFaceEvent('face_not_detected', { snapshot });
                    }
                } else if (count >= 2) {
                    // ── Multiple faces ──────────────────────────────────────
                    noFaceCountRef.current = 0;
                    status = 'multiple_faces';
                    setFaceStatus('multiple_faces');

                    if (canEmit('multiple_faces_detected', 12000)) {
                        const snapshot = captureSnapshot(video);
                        onFaceEvent('multiple_faces_detected', {
                            face_count: count,
                            snapshot,
                        });
                    }

                    // Still process emotions/identity for the first face
                    if (detections[0]) {
                        emotionData = analyzeEmotion(detections[0].expressions, video);
                        if (detections[0].descriptor) {
                            const result = verifyIdentity(detections[0].descriptor, video);
                            idMatch = result.match;
                            idDist = result.distance;
                        }
                    }
                } else {
                    // ── Single face detected ────────────────────────────────
                    noFaceCountRef.current = 0;
                    const detection = detections[0];

                    // Gaze check
                    const landmarks = detection.landmarks;
                    const lookingAway = isGazeAway(landmarks);

                    if (lookingAway) {
                        gazeAwayCountRef.current++;
                        status = 'gaze_away';
                        setFaceStatus('gaze_away');

                        if (gazeAwayCountRef.current >= 3 && canEmit('gaze_away', 15000)) {
                            const snapshot = captureSnapshot(video);
                            onFaceEvent('gaze_away', { snapshot });
                        }
                    } else {
                        gazeAwayCountRef.current = 0;
                        status = 'face_detected';
                        setFaceStatus('face_detected');
                    }

                    // Emotion analysis
                    emotionData = analyzeEmotion(detection.expressions, video);

                    // Identity verification
                    if (detection.descriptor) {
                        const result = verifyIdentity(detection.descriptor, video);
                        idMatch = result.match;
                        idDist = result.distance;
                    }
                }

                // Update emotion / identity state
                if (emotionData) setCurrentEmotion(emotionData);
                if (idMatch) {
                    setIdentityMatch(idMatch);
                    setIdentityDistance(idDist);
                }

                // Append to face history (capped at 200 entries ~= 8 minutes at 2.5s interval)
                const historyEntry: FaceStatusUpdate = {
                    timestamp: new Date().toISOString(),
                    status,
                    faceCount: count,
                    emotion: emotionData ?? undefined,
                    identityDistance: idDist || undefined,
                    identityMatch: idMatch ?? undefined,
                };

                setFaceHistory(prev => {
                    const next = [...prev, historyEntry];
                    return next.length > 200 ? next.slice(-200) : next;
                });

            } catch (e) {
                // Ignore individual frame errors
            }
        };

        intervalRef.current = setInterval(detect, intervalMs);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [enabled, detectionReady, intervalMs, isGazeAway, onFaceEvent, canEmit, videoRef, analyzeEmotion, verifyIdentity]);

    return {
        faceStatus,
        faceCount,
        detectionReady,
        // 🆕 Enhanced outputs
        currentEmotion,
        identityMatch,
        identityDistance,
        faceHistory,
    };
}

// ── Static helper: capture 128D reference descriptor ────────────────────────
// Used by the join page to capture the candidate's reference face.
// Retries up to 3 times with progressively lower thresholds to maximise
// success across different lighting / background conditions.
export async function captureReferenceDescriptor(video: HTMLVideoElement): Promise<Float32Array | null> {
    const api = await loadFaceApiForCapture(); // Only needs detector + landmarks + recognition

    // Each attempt uses a larger input and/or lower confidence threshold
    const attempts: { inputSize: number; scoreThreshold: number }[] = [
        { inputSize: 416, scoreThreshold: 0.3 },
        { inputSize: 320, scoreThreshold: 0.2 },
        { inputSize: 512, scoreThreshold: 0.15 },
    ];

    for (const { inputSize, scoreThreshold } of attempts) {
        try {
            const detection = await api
                .detectSingleFace(video, new api.TinyFaceDetectorOptions({ inputSize, scoreThreshold }))
                .withFaceLandmarks(true)
                .withFaceDescriptor();

            if (detection) return detection.descriptor;

            // Small delay before next attempt so the model can re-assess
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            console.warn(`captureReferenceDescriptor attempt failed (input=${inputSize}, thresh=${scoreThreshold}):`, e);
        }
    }

    return null;
}
