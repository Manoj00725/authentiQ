'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../../../shared/types';

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

    const emit = useCallback(<E extends keyof ClientToServerEvents>(
        event: E,
        data: Parameters<ClientToServerEvents[E]>[0]
    ) => {
        socketRef.current?.emit(event as string, data);
    }, []);

    const on = useCallback(<E extends keyof ServerToClientEvents>(
        event: E,
        handler: ServerToClientEvents[E]
    ) => {
        socketRef.current?.on(event as string, handler as any);
        return () => { socketRef.current?.off(event as string, handler as any); };
    }, []);

    return { connected, emit, on, socket: socketRef };
}
