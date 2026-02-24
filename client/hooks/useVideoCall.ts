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

    const peerRef = useRef<any>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

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
                    // Recruiter → Candidate
                    emit('webrtc_ice_candidate', {
                        target: 'candidate',
                        session_id: sessionId,
                        meeting_id: meetingId,
                        candidate: signal,
                    });
                } else {
                    // Candidate → Recruiter
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

    // Candidate: start camera → signal readiness
    const startAsCandidate = useCallback(async () => {
        await loadSimplePeer();
        const stream = await getLocalStream();
        if (!stream) return;

        setCallState('waiting');
        // Tell recruiter we're ready
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
        setRemoteStream(null);
        setCallState('ended');
    }, []);

    // Toggle mute
    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => {
                t.enabled = isMuted; // flip current muted state
            });
            setIsMuted(prev => !prev);
        }
    }, [isMuted]);

    // Toggle camera
    const toggleCamera = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(t => {
                t.enabled = isCameraOff; // flip
            });
            setIsCameraOff(prev => !prev);
        }
    }, [isCameraOff]);

    // Set up socket listeners
    useEffect(() => {
        const unsubs: (() => void)[] = [];

        if (role === 'recruiter') {
            // Recruiter: candidate signals readiness → create offer
            unsubs.push(on('peer_call_ready', async ({ session_id }: { session_id: string }) => {
                await loadSimplePeer();
                const stream = localStreamRef.current;
                if (!stream) return;
                setCallState('connecting');
                const peer = createPeer(true, stream);
                if (peer) peerRef.current = peer;
            }));

            // Recruiter: receive SDP answer from candidate
            unsubs.push(on('webrtc_answer', ({ signal }: { signal: WebRTCSignal }) => {
                if (peerRef.current) {
                    peerRef.current.signal(signal);
                }
            }));

            // Recruiter: receive ICE candidate from candidate
            unsubs.push(on('webrtc_ice_candidate', ({ candidate }: any) => {
                if (peerRef.current) {
                    peerRef.current.signal({ candidate });
                }
            }));
        }

        if (role === 'candidate') {
            // Candidate: receive SDP offer from recruiter
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

            // Candidate: receive ICE from recruiter
            unsubs.push(on('webrtc_ice_candidate', ({ candidate }: any) => {
                if (peerRef.current) {
                    peerRef.current.signal({ candidate });
                }
            }));
        }

        return () => unsubs.forEach(fn => fn());
    }, [role, on, createPeer, loadSimplePeer]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (peerRef.current) peerRef.current.destroy();
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
            }
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
    };
}
