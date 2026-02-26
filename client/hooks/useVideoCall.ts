'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WebRTCSignal } from '@/types';

// Dynamically import simple-peer only in browser
let SimplePeer: any = null;

type CallState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'ended' | 'error';

interface UseVideoCallOptions {
    role: 'candidate' | 'recruiter';
    meetingId: string;
    sessionId: string;
    emit: (event: string, data: any) => void;
    on: (event: string, handler: (...args: any[]) => void) => () => void;
}

export function useVideoCall({ role, meetingId, sessionId, emit, on }: UseVideoCallOptions) {
    const [callState, setCallState] = useState<CallState>('idle');
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [hasCamera, setHasCamera] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);

    // ── Screen share state ─────────────────────────────────────────────────
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    const peerRef = useRef<any>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    // Separate peer for screen share
    const screenPeerRef = useRef<any>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);

    // Get local media stream
    const getLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                audio: true,
            });
            localStreamRef.current = stream;
            setLocalStream(stream);
            return stream;
        } catch (err) {
            console.warn('Camera/mic not available:', err);
            setHasCamera(false);
            return null;
        }
    }, []);

    // Load simple-peer (browser only)
    const loadSimplePeer = useCallback(async () => {
        if (!SimplePeer) {
            const mod = await import('simple-peer');
            SimplePeer = mod.default;
        }
    }, []);

    // Create a peer connection
    const createPeer = useCallback((initiator: boolean, stream: MediaStream) => {
        if (!SimplePeer) return null;
        const peer = new SimplePeer({
            initiator,
            stream,
            trickle: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ],
            },
        });

        peer.on('signal', (signal: WebRTCSignal) => {
            if ((signal as any).type === 'offer' || (signal as any).type === 'answer' || (signal as any).sdp) {
                if (initiator) {
                    emit('webrtc_offer', { session_id: sessionId, signal });
                } else {
                    emit('webrtc_answer', { meeting_id: meetingId, signal });
                }
            } else {
                // ICE candidate trickle
                if (initiator) {
                    emit('webrtc_ice_candidate', {
                        target: 'candidate',
                        session_id: sessionId,
                        meeting_id: meetingId,
                        candidate: signal,
                    });
                } else {
                    emit('webrtc_ice_candidate', {
                        target: 'recruiter',
                        session_id: sessionId,
                        meeting_id: meetingId,
                        candidate: signal,
                    });
                }
            }
        });

        peer.on('stream', (remoteStream: MediaStream) => {
            setRemoteStream(remoteStream);
            setCallState('connected');
        });

        peer.on('connect', () => {
            setCallState('connected');
        });

        peer.on('error', (err: Error) => {
            console.error('WebRTC peer error:', err);
            setCallState('error');
        });

        peer.on('close', () => {
            setCallState('ended');
        });

        return peer;
    }, [sessionId, meetingId, emit]);

    // ── Screen share peer ──────────────────────────────────────────────────
    const createScreenPeer = useCallback((initiator: boolean, stream: MediaStream) => {
        if (!SimplePeer) return null;
        const peer = new SimplePeer({
            initiator,
            stream,
            trickle: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ],
            },
        });

        peer.on('signal', (signal: any) => {
            if (signal.type === 'offer' || signal.type === 'answer' || signal.sdp) {
                if (initiator) {
                    // Candidate → Recruiter
                    emit('screen_share_offer', { meeting_id: meetingId, session_id: sessionId, signal });
                } else {
                    // Recruiter → Candidate
                    emit('screen_share_answer', { session_id: sessionId, signal });
                }
            } else {
                // ICE
                if (initiator) {
                    emit('screen_share_ice', { target: 'recruiter', meeting_id: meetingId, session_id: sessionId, candidate: signal });
                } else {
                    emit('screen_share_ice', { target: 'candidate', meeting_id: meetingId, session_id: sessionId, candidate: signal });
                }
            }
        });

        peer.on('stream', (stream: MediaStream) => {
            setRemoteScreenStream(stream);
        });

        peer.on('error', (err: Error) => {
            console.error('Screen share peer error:', err);
        });

        peer.on('close', () => {
            setRemoteScreenStream(null);
        });

        return peer;
    }, [meetingId, sessionId, emit]);

    /** Candidate: request screen capture and start sharing */
    const startScreenShare = useCallback(async () => {
        await loadSimplePeer();
        try {
            const stream = await (navigator.mediaDevices as any).getDisplayMedia({
                video: { cursor: 'always' },
                audio: false,
            });
            screenStreamRef.current = stream;
            setScreenStream(stream);
            setIsScreenSharing(true);

            const peer = createScreenPeer(true, stream);
            if (peer) screenPeerRef.current = peer;

            // When user stops via browser's built-in stop button
            stream.getVideoTracks()[0].addEventListener('ended', () => {
                stopScreenShare();
            });
        } catch (err) {
            console.warn('Screen share cancelled or failed:', err);
        }
    }, [loadSimplePeer, createScreenPeer]);

    const stopScreenShare = useCallback(() => {
        if (screenPeerRef.current) {
            screenPeerRef.current.destroy();
            screenPeerRef.current = null;
        }
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
            setScreenStream(null);
        }
        setIsScreenSharing(false);
        emit('screen_share_stopped', { meeting_id: meetingId });
    }, [emit, meetingId]);

    // Candidate: start camera → signal readiness
    const startAsCandidate = useCallback(async () => {
        await loadSimplePeer();
        const stream = await getLocalStream();
        if (!stream) return;

        setCallState('waiting');
        emit('call_ready', { meeting_id: meetingId, session_id: sessionId });
    }, [loadSimplePeer, getLocalStream, emit, meetingId, sessionId]);

    // Recruiter: start camera → wait for peer_call_ready, then make offer
    const startAsRecruiter = useCallback(async () => {
        await loadSimplePeer();
        await getLocalStream();
        setCallState('waiting');
    }, [loadSimplePeer, getLocalStream]);

    // Start the call based on role
    const startCall = useCallback(async () => {
        if (role === 'candidate') {
            await startAsCandidate();
        } else {
            await startAsRecruiter();
        }
    }, [role, startAsCandidate, startAsRecruiter]);

    // End the call
    const endCall = useCallback(() => {
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
            setLocalStream(null);
        }
        if (screenPeerRef.current) {
            screenPeerRef.current.destroy();
            screenPeerRef.current = null;
        }
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
            setScreenStream(null);
        }
        setRemoteStream(null);
        setRemoteScreenStream(null);
        setIsScreenSharing(false);
        setCallState('ended');
    }, []);

    // Toggle mute
    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => {
                t.enabled = isMuted;
            });
            setIsMuted(prev => !prev);
        }
    }, [isMuted]);

    // Toggle camera
    const toggleCamera = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(t => {
                t.enabled = isCameraOff;
            });
            setIsCameraOff(prev => !prev);
        }
    }, [isCameraOff]);

    // Set up socket listeners
    useEffect(() => {
        const unsubs: (() => void)[] = [];

        if (role === 'recruiter') {
            // Candidate signals readiness → create webcam offer
            unsubs.push(on('peer_call_ready', async ({ session_id }: { session_id: string }) => {
                await loadSimplePeer();
                const stream = localStreamRef.current;
                if (!stream) return;
                setCallState('connecting');
                const peer = createPeer(true, stream);
                if (peer) peerRef.current = peer;
            }));

            // Receive SDP answer from candidate
            unsubs.push(on('webrtc_answer', ({ signal }: { signal: WebRTCSignal }) => {
                if (peerRef.current) peerRef.current.signal(signal);
            }));

            // Receive ICE from candidate
            unsubs.push(on('webrtc_ice_candidate', ({ candidate }: any) => {
                if (peerRef.current) peerRef.current.signal({ candidate });
            }));

            // ── Screen share: recruiter receives offer from candidate ────────
            unsubs.push(on('screen_share_offer', async ({ signal }: any) => {
                await loadSimplePeer();
                // We need a dummy stream (audio-only) to answer — or just pass an empty stream
                // Actually simple-peer can answer without a stream if we give it initiator: false
                const peer = createScreenPeer(false, new MediaStream());
                if (peer) {
                    screenPeerRef.current = peer;
                    peer.signal(signal);
                }
            }));

            unsubs.push(on('screen_share_ice', ({ candidate }: any) => {
                if (screenPeerRef.current) screenPeerRef.current.signal({ candidate });
            }));

            unsubs.push(on('screen_share_stopped', () => {
                setRemoteScreenStream(null);
            }));
        }

        if (role === 'candidate') {
            // Receive SDP offer from recruiter (webcam)
            unsubs.push(on('webrtc_offer', async ({ signal }: { signal: WebRTCSignal }) => {
                await loadSimplePeer();
                const stream = localStreamRef.current;
                if (!stream) return;
                setCallState('connecting');
                const peer = createPeer(false, stream);
                if (peer) {
                    peerRef.current = peer;
                    peer.signal(signal);
                }
            }));

            // ICE from recruiter (webcam)
            unsubs.push(on('webrtc_ice_candidate', ({ candidate }: any) => {
                if (peerRef.current) peerRef.current.signal({ candidate });
            }));

            // Screen share ICE from recruiter
            unsubs.push(on('screen_share_answer', ({ signal }: any) => {
                if (screenPeerRef.current) screenPeerRef.current.signal(signal);
            }));

            unsubs.push(on('screen_share_ice', ({ candidate }: any) => {
                if (screenPeerRef.current) screenPeerRef.current.signal({ candidate });
            }));
        }

        return () => unsubs.forEach(fn => fn());
    }, [role, on, createPeer, createScreenPeer, loadSimplePeer]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (peerRef.current) peerRef.current.destroy();
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
            if (screenPeerRef.current) screenPeerRef.current.destroy();
            if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    return {
        callState,
        localStream,
        remoteStream,
        hasCamera,
        isMuted,
        isCameraOff,
        startCall,
        endCall,
        toggleMute,
        toggleCamera,
        // Screen share
        screenStream,
        remoteScreenStream,
        isScreenSharing,
        startScreenShare,
        stopScreenShare,
    };
}
