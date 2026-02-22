'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { BehaviorEvent, EventType, Severity } from '../../../shared/types';

interface MonitoringOptions {
    sessionId: string;
    onEvent: (event: BehaviorEvent) => void;
}

export function useMonitoring({ sessionId, onEvent }: MonitoringOptions) {
    const lastAnswerRef = useRef('');
    const lastTypeTimeRef = useRef<number>(0);
    const typingSpeedsRef = useRef<number[]>([]);

    const emitEvent = useCallback((event_type: EventType, severity: Severity, metadata?: Record<string, unknown>) => {
        onEvent({ event_type, timestamp: new Date().toISOString(), severity, metadata });
    }, [onEvent]);

    useEffect(() => {
        if (!sessionId) return;
        const handlers: [string, EventListener][] = [];

        // Tab visibility (Page Visibility API)
        const onVis = () => {
            if (document.hidden) emitEvent('tab_switch', 'high');
        };
        document.addEventListener('visibilitychange', onVis);
        handlers.push(['visibilitychange', onVis as EventListener]);

        // Window blur / focus
        const onBlur = () => emitEvent('window_blur', 'medium');
        const onFocus = () => emitEvent('window_focus', 'low');
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);

        // Fullscreen exit
        const onFsChange = () => {
            if (!document.fullscreenElement) {
                emitEvent('fullscreen_exit', 'high');
            } else {
                emitEvent('fullscreen_enter', 'low');
            }
        };
        document.addEventListener('fullscreenchange', onFsChange);

        // Enter fullscreen
        document.documentElement.requestFullscreen?.().catch(() => { });

        return () => {
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('fullscreenchange', onFsChange);
        };
    }, [sessionId, emitEvent]);

    // Attach to a specific textarea – call from component
    const attachToTextarea = useCallback((el: HTMLTextAreaElement | null) => {
        if (!el) return () => { };

        const onPaste = (e: ClipboardEvent) => {
            const pasted = e.clipboardData?.getData('text') || '';
            const words = pasted.trim().split(/\s+/).length;
            const severity: Severity = words > 30 ? 'critical' : words > 10 ? 'high' : 'medium';
            emitEvent('paste_attempt', severity, { word_count: words });
        };

        const onKeyup = () => {
            const now = Date.now();
            const value = el.value;
            const words = value.trim().split(/\s+/).filter(Boolean).length;
            const prevWords = lastAnswerRef.current.trim().split(/\s+/).filter(Boolean).length;
            const delta = words - prevWords;
            const timeDelta = now - lastTypeTimeRef.current;

            if (lastTypeTimeRef.current > 0 && timeDelta > 0) {
                const wpm = (delta / timeDelta) * 60000;
                typingSpeedsRef.current = [...typingSpeedsRef.current.slice(-9), Math.max(0, wpm)];

                // Word burst: 150+ words inserted in <2 sec
                if (delta > 40 && timeDelta < 2000) {
                    emitEvent('word_burst', 'critical', { words_inserted: delta, time_ms: timeDelta });
                }
                // Very fast typing
                if (wpm > 150) {
                    emitEvent('typing_fast', 'medium', { wpm: Math.round(wpm) });
                }
                // Long response delay
                if (timeDelta > 30000 && delta > 5) {
                    emitEvent('long_delay', 'medium', { delay_ms: timeDelta });
                }
            }

            lastAnswerRef.current = value;
            lastTypeTimeRef.current = now;
        };

        el.addEventListener('paste', onPaste as EventListener);
        el.addEventListener('keyup', onKeyup);
        return () => {
            el.removeEventListener('paste', onPaste as EventListener);
            el.removeEventListener('keyup', onKeyup);
        };
    }, [emitEvent]);

    const getTypingSpeeds = () => typingSpeedsRef.current;

    return { attachToTextarea, getTypingSpeeds };
}
