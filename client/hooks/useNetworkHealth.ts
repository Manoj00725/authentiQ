'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { NetworkQuality } from '@/types';

const PING_INTERVAL_MS = 5000;         // Ping every 5 seconds
const DISCONNECT_TIMEOUT_MS = 15000;   // No pong for 15s = disconnected
const HISTORY_SIZE = 60;               // Keep last 60 measurements (5 minutes)

interface NetworkHealth {
    latency: number;
    avgLatency: number;
    jitter: number;
    quality: NetworkQuality;
    isUnstable: boolean;
    latencyHistory: { t: string; ms: number }[];
}

function getQuality(latency: number): NetworkQuality {
    if (latency < 50) return 'excellent';
    if (latency < 150) return 'good';
    if (latency < 300) return 'fair';
    return 'poor';
}

function getQualityColor(quality: NetworkQuality): string {
    switch (quality) {
        case 'excellent': return '#10b981';
        case 'good': return '#22d3ee';
        case 'fair': return '#f59e0b';
        case 'poor': return '#ef4444';
        case 'disconnected': return '#6b7280';
    }
}

interface UseNetworkHealthOptions {
    sessionId: string;
    emit: (event: string, data: any) => void;
    on: (event: string, handler: (...args: any[]) => void) => () => void;
    enabled?: boolean;
}

/**
 * useNetworkHealth — Real-time ping/pong heartbeat to measure connection quality.
 *
 * Sends a 'ping_check' every 5 seconds, measures round-trip time from
 * the 'pong_check' response, and maintains a rolling history for charts.
 */
export function useNetworkHealth({ sessionId, emit, on, enabled = true }: UseNetworkHealthOptions): NetworkHealth {
    const [health, setHealth] = useState<NetworkHealth>({
        latency: 0,
        avgLatency: 0,
        jitter: 0,
        quality: 'good',
        isUnstable: false,
        latencyHistory: [],
    });

    const historyRef = useRef<{ t: string; ms: number }[]>([]);
    const lastPongRef = useRef<number>(Date.now());
    const pingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Handle pong response
    const handlePong = useCallback((data: { t: number }) => {
        const now = Date.now();
        const rtt = now - data.t;
        lastPongRef.current = now;

        // Update history (rolling window)
        const entry = {
            t: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            ms: rtt,
        };
        historyRef.current = [...historyRef.current.slice(-(HISTORY_SIZE - 1)), entry];

        // Calculate rolling stats
        const history = historyRef.current;
        const latencies = history.map(h => h.ms);
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const jitter = latencies.length > 1
            ? Math.sqrt(latencies.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / latencies.length)
            : 0;

        const quality = getQuality(rtt);
        const isUnstable = quality === 'poor' || quality === 'disconnected' || jitter > 100;

        setHealth({
            latency: rtt,
            avgLatency: Math.round(avg),
            jitter: Math.round(jitter),
            quality,
            isUnstable,
            latencyHistory: [...historyRef.current],
        });

        // Emit health status to server (for recruiter relay)
        emit('network_health', {
            session_id: sessionId,
            latency: rtt,
            quality,
        });
    }, [emit, sessionId]);

    useEffect(() => {
        if (!enabled || !sessionId) return;

        // Listen for pong
        const unsubPong = on('pong_check', handlePong);

        // Start ping interval
        pingTimerRef.current = setInterval(() => {
            emit('ping_check', {
                session_id: sessionId,
                t: Date.now(),
            });
        }, PING_INTERVAL_MS);

        // Disconnect detection: if no pong for 15s, flag as disconnected
        disconnectTimerRef.current = setInterval(() => {
            if (Date.now() - lastPongRef.current > DISCONNECT_TIMEOUT_MS) {
                setHealth(prev => ({
                    ...prev,
                    quality: 'disconnected',
                    isUnstable: true,
                }));
            }
        }, PING_INTERVAL_MS);

        // Initial ping
        emit('ping_check', {
            session_id: sessionId,
            t: Date.now(),
        });

        return () => {
            unsubPong();
            if (pingTimerRef.current) clearInterval(pingTimerRef.current);
            if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
        };
    }, [enabled, sessionId, emit, on, handlePong]);

    return health;
}

export { getQualityColor };
