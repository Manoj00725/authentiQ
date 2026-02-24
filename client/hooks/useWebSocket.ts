'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/types';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function useWebSocket() {
    const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
        socketRef.current = socket;
        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));
        return () => { socket.disconnect(); };
    }, []);

    const emit = useCallback((event: string, data: any) => {
        (socketRef.current as any)?.emit(event, data);
    }, []);

    const on = useCallback((event: string, handler: (...args: any[]) => void) => {
        (socketRef.current as any)?.on(event, handler);
        return () => { (socketRef.current as any)?.off(event, handler); };
    }, []);

    return { connected, emit, on, socket: socketRef };
}
