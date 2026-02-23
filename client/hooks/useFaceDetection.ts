'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type FaceStatus = 'loading' | 'ready' | 'face_detected' | 'no_face' | 'multiple_faces' | 'gaze_away' | 'no_camera';

interface UseFaceDetectionOptions {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    enabled: boolean;
    onFaceEvent: (eventType: 'face_not_detected' | 'multiple_faces_detected' | 'gaze_away') => void;
    intervalMs?: number;
}

// Load face-api.js models from CDN — runs only in browser
const FACE_API_CDN = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';
let faceApiLoaded = false;
let faceapi: any = null;

async function loadFaceApi() {
    if (faceApiLoaded) return faceapi;
    const mod = await import('face-api.js');
    faceapi = mod;
    await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_CDN),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_API_CDN),
    ]);
    faceApiLoaded = true;
    return faceapi;
}

export function useFaceDetection({ videoRef, enabled, onFaceEvent, intervalMs = 2500 }: UseFaceDetectionOptions) {
    const [faceStatus, setFaceStatus] = useState<FaceStatus>('loading');
    const [faceCount, setFaceCount] = useState(0);
    const [detectionReady, setDetectionReady] = useState(false);

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const noFaceCountRef = useRef(0);         // consecutive no-face frames
    const gazeAwayCountRef = useRef(0);       // consecutive gaze-away frames
    const eventCooldownRef = useRef<Record<string, number>>({});  // rate-limit events

    const canEmit = useCallback((eventType: string, cooldownMs = 8000) => {
        const now = Date.now();
        const last = eventCooldownRef.current[eventType] ?? 0;
        if (now - last > cooldownMs) {
            eventCooldownRef.current[eventType] = now;
            return true;
        }
        return false;
    }, []);

    // Estimate whether the face is looking away using nose-to-eye ratio
    const isGazeAway = useCallback((landmarks: any): boolean => {
        try {
            const nose = landmarks.getNose();
            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();
            if (!nose?.length || !leftEye?.length || !rightEye?.length) return false;

            const noseTip = nose[3];
            const leftEyeCenter = { x: leftEye.reduce((s: number, p: any) => s + p.x, 0) / leftEye.length, y: leftEye.reduce((s: number, p: any) => s + p.y, 0) / leftEye.length };
            const rightEyeCenter = { x: rightEye.reduce((s: number, p: any) => s + p.x, 0) / rightEye.length, y: rightEye.reduce((s: number, p: any) => s + p.y, 0) / rightEye.length };

            const eyeMidX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
            const faceWidth = Math.abs(rightEyeCenter.x - leftEyeCenter.x);
            if (faceWidth < 1) return false;

            const noseOffset = Math.abs(noseTip.x - eyeMidX) / faceWidth;
            // If nose is more than 40% off-center from face width, likely looking away
            return noseOffset > 0.40;
        } catch {
            return false;
        }
    }, []);

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

    useEffect(() => {
        if (!enabled || !detectionReady) return;

        const detect = async () => {
            const video = videoRef.current;
            if (!video || video.readyState < 2 || video.paused) return;

            try {
                const detections = await faceapi
                    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.4 }))
                    .withFaceLandmarks(true);

                const count = detections.length;
                setFaceCount(count);

                if (count === 0) {
                    noFaceCountRef.current++;
                    setFaceStatus('no_face');
                    // Fire after 2 consecutive no-face detections to avoid false positives
                    if (noFaceCountRef.current >= 2 && canEmit('face_not_detected', 10000)) {
                        onFaceEvent('face_not_detected');
                    }
                } else if (count >= 2) {
                    noFaceCountRef.current = 0;
                    setFaceStatus('multiple_faces');
                    if (canEmit('multiple_faces_detected', 12000)) {
                        onFaceEvent('multiple_faces_detected');
                    }
                } else {
                    noFaceCountRef.current = 0;
                    // Check gaze
                    const landmarks = detections[0].landmarks;
                    const lookingAway = isGazeAway(landmarks);
                    if (lookingAway) {
                        gazeAwayCountRef.current++;
                        setFaceStatus('gaze_away');
                        if (gazeAwayCountRef.current >= 3 && canEmit('gaze_away', 15000)) {
                            onFaceEvent('gaze_away');
                        }
                    } else {
                        gazeAwayCountRef.current = 0;
                        setFaceStatus('face_detected');
                    }
                }
            } catch (e) {
                // Ignore individual frame errors
            }
        };

        intervalRef.current = setInterval(detect, intervalMs);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [enabled, detectionReady, intervalMs, isGazeAway, onFaceEvent, canEmit, videoRef]);

    return { faceStatus, faceCount, detectionReady };
}
