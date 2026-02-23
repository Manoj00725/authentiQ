'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { BehaviorEvent, EventType, Severity } from '../../../shared/types';

interface MonitoringOptions {
    sessionId: string;
    onEvent: (event: BehaviorEvent) => void;
}

// DevTools detection thresholds
const DEVTOOLS_WIDTH_THRESHOLD = 200;
const DEVTOOLS_HEIGHT_THRESHOLD = 200;

export function useMonitoring({ sessionId, onEvent }: MonitoringOptions) {
    const lastAnswerRef = useRef('');
    const lastTypeTimeRef = useRef<number>(0);
    const typingSpeedsRef = useRef<number[]>([]);
    const devtoolsOpenRef = useRef(false);
    const devtoolsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const emitEvent = useCallback((event_type: EventType, severity: Severity, metadata?: Record<string, unknown>) => {
        onEvent({ event_type, timestamp: new Date().toISOString(), severity, metadata });
    }, [onEvent]);

    useEffect(() => {
        if (!sessionId) return;

        // Tab visibility (Page Visibility API)
        const onVis = () => {
            if (document.hidden) emitEvent('tab_switch', 'high');
        };
        document.addEventListener('visibilitychange', onVis);

        // Window blur / focus
        const onBlur = () => emitEvent('window_blur', 'medium');
        const onFocus = () => emitEvent('window_focus', 'low');
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);

        // Fullscreen monitoring
        const onFsChange = () => {
            if (!document.fullscreenElement) {
                emitEvent('fullscreen_exit', 'high');
            } else {
                emitEvent('fullscreen_enter', 'low');
            }
        };
        document.addEventListener('fullscreenchange', onFsChange);

        // Enter fullscreen automatically
        document.documentElement.requestFullscreen?.().catch(() => { });

        return () => {
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('fullscreenchange', onFsChange);
        };
    }, [sessionId, emitEvent]);

    // ───────────────────────────────────────────────────
    // Attach to a text answer textarea
    // ───────────────────────────────────────────────────
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

                if (delta > 40 && timeDelta < 2000) {
                    emitEvent('word_burst', 'critical', { words_inserted: delta, time_ms: timeDelta });
                }
                if (wpm > 150) {
                    emitEvent('typing_fast', 'medium', { wpm: Math.round(wpm) });
                }
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

    // ───────────────────────────────────────────────────
    // Attach to a code editor element
    // ───────────────────────────────────────────────────
    const attachToCodeEditor = useCallback((el: HTMLTextAreaElement | null) => {
        if (!el) return () => { };

        const firstKeystrokeRef = { value: 0 };
        const lastCodeRef = { value: '' };

        // Block right-click
        const onContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            emitEvent('right_click_attempt', 'low');
        };

        // Detect large code pastes
        const onPaste = (e: ClipboardEvent) => {
            const pasted = e.clipboardData?.getData('text') || '';
            if (pasted.length > 80) {
                const severity: Severity = pasted.length > 500 ? 'critical' : 'high';
                emitEvent('code_paste', severity, {
                    chars_pasted: pasted.length,
                    code_snapshot: pasted.slice(0, 300),
                });
            }
        };

        // Intercept cheat keyboard shortcuts
        const onKeydown = (e: KeyboardEvent) => {
            const isCheatShortcut =
                e.key === 'F12' ||
                (e.ctrlKey && e.key === 'u') ||
                (e.ctrlKey && e.shiftKey && e.key === 'I') ||
                (e.ctrlKey && e.shiftKey && e.key === 'J') ||
                (e.ctrlKey && e.shiftKey && e.key === 'C');
            if (isCheatShortcut) {
                e.preventDefault();
                emitEvent('keyboard_shortcut_cheat', 'high', { key: e.key, combo: `ctrl:${e.ctrlKey} shift:${e.shiftKey}` });
            }
        };

        // Detect rapid solution (full solution in < 30s)
        const onInput = () => {
            const now = Date.now();
            const code = el.value;
            if (!firstKeystrokeRef.value && code.length > 0) {
                firstKeystrokeRef.value = now;
            }
            const elapsed = now - firstKeystrokeRef.value;
            const added = code.length - lastCodeRef.value.length;

            // AI pattern: 200+ new chars in under 3 seconds (detect burst)
            if (added > 200 && elapsed > 0) {
                emitEvent('ai_pattern_detected', 'critical', {
                    chars_added: added,
                    code_snapshot: code.slice(0, 300),
                });
            }

            // Rapid solution: 150+ chars in < 30 seconds from first keystroke
            if (firstKeystrokeRef.value && elapsed < 30000 && code.length > 150 && lastCodeRef.value.length < 20) {
                emitEvent('rapid_solution', 'high', {
                    elapsed_ms: elapsed,
                    char_count: code.length,
                    code_snapshot: code.slice(0, 300),
                });
            }
            lastCodeRef.value = code;
        };

        el.addEventListener('contextmenu', onContextMenu);
        el.addEventListener('paste', onPaste as EventListener);
        el.addEventListener('keydown', onKeydown);
        el.addEventListener('input', onInput);

        // DevTools detection via window size difference
        devtoolsIntervalRef.current = setInterval(() => {
            const widthDiff = window.outerWidth - window.innerWidth;
            const heightDiff = window.outerHeight - window.innerHeight;
            const isOpen = widthDiff > DEVTOOLS_WIDTH_THRESHOLD || heightDiff > DEVTOOLS_HEIGHT_THRESHOLD;
            if (isOpen && !devtoolsOpenRef.current) {
                devtoolsOpenRef.current = true;
                emitEvent('devtools_open', 'critical', { width_diff: widthDiff, height_diff: heightDiff });
            } else if (!isOpen) {
                devtoolsOpenRef.current = false;
            }
        }, 1500);

        return () => {
            el.removeEventListener('contextmenu', onContextMenu);
            el.removeEventListener('paste', onPaste as EventListener);
            el.removeEventListener('keydown', onKeydown);
            el.removeEventListener('input', onInput);
            if (devtoolsIntervalRef.current) clearInterval(devtoolsIntervalRef.current);
        };
    }, [emitEvent]);

    const getTypingSpeeds = () => typingSpeedsRef.current;

    return { attachToTextarea, attachToCodeEditor, getTypingSpeeds };
}
