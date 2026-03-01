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

    // Keep refs to the latest values so socket callbacks never close over stale values
    const sessionIdRef = useRef(sessionId);
    useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

    const meetingIdRef = useRef(meetingId);
    useEffect(() => { meetingIdRef.current = meetingId; }, [meetingId]);

    // Keep stable refs to emit, on so socket listener effects don't depend on them
    const emitRef = useRef(emit);
    useEffect(() => { emitRef.current = emit; }, [emit]);

    const onRef = useRef(on);
    useEffect(() => { onRef.current = on; }, [on]);

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

    /**
     * Create a webcam peer connection.
     * @param initiator  true = recruiter (makes offer), false = candidate (answers)
     * @param stream     local media stream
     * @param overrideSessionId  when recruiter makes an offer, pass the candidate's real session_id
     */
    const createPeer = useCallback((initiator: boolean, stream: MediaStream, overrideSessionId?: string) => {
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
            const sid = overrideSessionId ?? sessionIdRef.current;
            const mid = meetingIdRef.current;

            if ((signal as any).type === 'offer' || (signal as any).type === 'answer' || (signal as any).sdp) {
                if (initiator) {
                    // Recruiter → Candidate: send offer addressed to the real session_id
                    emitRef.current('webrtc_offer', { session_id: sid, signal });
                } else {
                    // Candidate → Recruiter: send answer addressed to the meeting_id
                    emitRef.current('webrtc_answer', { meeting_id: mid, signal });
                }
            } else {
                // ICE candidate trickle
                if (initiator) {
                    emitRef.current('webrtc_ice_candidate', {
                        target: 'candidate',
                        session_id: sid,
                        meeting_id: mid,
                        candidate: signal,
                    });
                } else {
                    emitRef.current('webrtc_ice_candidate', {
                        target: 'recruiter',
                        session_id: sid,
                        meeting_id: mid,
                        candidate: signal,
                    });
                }
            }
        });

        peer.on('stream', (remoteStr: MediaStream) => {
            setRemoteStream(remoteStr);
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
    }, []); // no deps — uses refs for emit/sessionId/meetingId

    // ── Screen share peer ──────────────────────────────────────────────────
    /**
     * Create a screen-share peer.
     * @param initiator  true = candidate (sends screen), false = recruiter (receives)
     * @param stream     only pass a real stream when initiator=true (candidate's display stream)
     * @param overrideSessionId  candidate's real session_id (used for routing)
     */
    const createScreenPeer = useCallback((initiator: boolean, stream: MediaStream | null, overrideSessionId?: string) => {
        if (!SimplePeer) return null;

        const peerOptions: any = {
            initiator,
            trickle: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ],
            },
        };

        // Only attach a stream when we are the sender (candidate)
        if (initiator && stream) {
            peerOptions.stream = stream;
        }

        const peer = new SimplePeer(peerOptions);

        peer.on('signal', (signal: any) => {
            // Use the explicitly provided override; never fall through to our own session id
            // when we are the recruiter (non-initiator) answering back to the candidate.
            const sid = overrideSessionId ?? sessionIdRef.current;
            const mid = meetingIdRef.current;

            if (signal.type === 'offer' || signal.type === 'answer' || signal.sdp) {
                if (initiator) {
                    // Candidate → Recruiter: screen share offer
                    emitRef.current('screen_share_offer', { meeting_id: mid, session_id: sid, signal });
                } else {
                    // Recruiter → Candidate: screen share answer — route to candidate's session
                    emitRef.current('screen_share_answer', { session_id: sid, signal });
                }
            } else {
                // ICE
                if (initiator) {
                    emitRef.current('screen_share_ice', { target: 'recruiter', meeting_id: mid, session_id: sid, candidate: signal });
                } else {
                    emitRef.current('screen_share_ice', { target: 'candidate', meeting_id: mid, session_id: sid, candidate: signal });
                }
            }
        });

        peer.on('stream', (rcvdStream: MediaStream) => {
            setRemoteScreenStream(rcvdStream);
        });

        peer.on('error', (err: Error) => {
            console.error('Screen share peer error:', err);
        });

        peer.on('close', () => {
            setRemoteScreenStream(null);
        });

        return peer;
    }, []); // no deps — uses refs for emit/sessionId/meetingId

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

            // initiator=true, pass the real display stream
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
        emitRef.current('screen_share_stopped', { meeting_id: meetingIdRef.current });
    }, []);

    // Candidate: start camera → signal readiness
    const startAsCandidate = useCallback(async () => {
        await loadSimplePeer();
        const stream = await getLocalStream();
        if (!stream) return;

        setCallState('waiting');
        emitRef.current('call_ready', { meeting_id: meetingIdRef.current, session_id: sessionIdRef.current });
    }, [loadSimplePeer, getLocalStream]);

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

    // ── Socket listeners ─────────────────────────────────────────────────
    // IMPORTANT: This effect uses stable refs for createPeer/createScreenPeer/loadSimplePeer
    // so it only runs once on mount (no re-registration races that drop signals).
    useEffect(() => {
        const unsubs: (() => void)[] = [];

        if (role === 'recruiter') {
            // Candidate signals readiness → create webcam offer
            unsubs.push(onRef.current('peer_call_ready', async ({ session_id: candidateSessionId }: { session_id: string }) => {
                await loadSimplePeer();
                const stream = localStreamRef.current;
                if (!stream) return;
                setCallState('connecting');
                // Pass candidateSessionId directly so the offer is routed to the right room
                const peer = createPeer(true, stream, candidateSessionId);
                if (peer) peerRef.current = peer;
            }));

            // Receive SDP answer from candidate
            unsubs.push(onRef.current('webrtc_answer', ({ signal }: { signal: WebRTCSignal }) => {
                if (peerRef.current) peerRef.current.signal(signal);
            }));

            // Receive ICE from candidate
            unsubs.push(onRef.current('webrtc_ice_candidate', ({ candidate }: any) => {
                if (peerRef.current) peerRef.current.signal({ candidate });
            }));

            // ── Screen share: recruiter receives offer from candidate ────────
            unsubs.push(onRef.current('screen_share_offer', async ({ signal, session_id: candidateSessionId }: any) => {
                await loadSimplePeer();
                // Destroy any existing screen peer before creating a new one
                if (screenPeerRef.current) {
                    screenPeerRef.current.destroy();
                    screenPeerRef.current = null;
                }
                // Recruiter is NOT the initiator — pass candidateSessionId so the
                // answer is routed back to candidate:{candidateSessionId}
                const peer = createScreenPeer(false, null, candidateSessionId);
                if (peer) {
                    screenPeerRef.current = peer;
                    // Signal AFTER storing ref so answer routing has the sessionId
                    peer.signal(signal);
                }
            }));

            unsubs.push(onRef.current('screen_share_ice', ({ candidate }: any) => {
                if (screenPeerRef.current) screenPeerRef.current.signal({ candidate });
            }));

            unsubs.push(onRef.current('screen_share_stopped', () => {
                setRemoteScreenStream(null);
            }));
        }

        if (role === 'candidate') {
            // Receive SDP offer from recruiter (webcam)
            unsubs.push(onRef.current('webrtc_offer', async ({ signal }: { signal: WebRTCSignal }) => {
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
            unsubs.push(onRef.current('webrtc_ice_candidate', ({ candidate }: any) => {
                if (peerRef.current) peerRef.current.signal({ candidate });
            }));

            // Screen share ICE from recruiter
            unsubs.push(onRef.current('screen_share_answer', ({ signal }: any) => {
                if (screenPeerRef.current) screenPeerRef.current.signal(signal);
            }));

            unsubs.push(onRef.current('screen_share_ice', ({ candidate }: any) => {
                if (screenPeerRef.current) screenPeerRef.current.signal({ candidate });
            }));
        }

        return () => unsubs.forEach(fn => fn());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role]); // Only re-run if role changes; all other deps are accessed via stable refs

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
