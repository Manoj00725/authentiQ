'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseTabLockOptions {
    enabled: boolean;
    onTabSwitch: () => void;
}

export interface TabLockState {
    isLocked: boolean;
    lockCount: number;
    lastSwitchAt: Date | null;
}

/**
 * Prevents candidate from switching tabs. When the page becomes hidden,
 * it immediately flags the violation and shows a blocking overlay on return.
 */
export function useTabLock({ enabled, onTabSwitch }: UseTabLockOptions) {
    const [lockCount, setLockCount] = useState(0);
    const [showOverlay, setShowOverlay] = useState(false);
    const [lastSwitchAt, setLastSwitchAt] = useState<Date | null>(null);
    const [countdown, setCountdown] = useState(5);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const overlayRef = useRef(false);

    const startCountdown = useCallback(() => {
        setCountdown(5);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current!);
                    countdownRef.current = null;
                    setShowOverlay(false);
                    overlayRef.current = false;
                    return 5;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const dismissOverlay = useCallback(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        setShowOverlay(false);
        overlayRef.current = false;
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Tab switched away
                onTabSwitch();
                setLockCount(prev => prev + 1);
                setLastSwitchAt(new Date());
            } else {
                // Returned — show punishment overlay
                if (!overlayRef.current) {
                    overlayRef.current = true;
                    setShowOverlay(true);
                    startCountdown();
                }
            }
        };

        const handleBlur = () => {
            // Window lost focus (e.g. alt-tab to another app)
            onTabSwitch();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleBlur);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [enabled, onTabSwitch, startCountdown]);

    return { showOverlay, lockCount, lastSwitchAt, countdown, dismissOverlay };
}
