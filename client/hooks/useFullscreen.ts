'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface UseFullscreenOptions {
    /** Called when the user exits fullscreen unexpectedly */
    onExit?: () => void;
    /** If false, the hook does nothing (use to disable for recruiter etc.) */
    enabled?: boolean;
}

/**
 * Manages enforced fullscreen for the candidate interview page.
 * - Call `enterFullscreen()` to go fullscreen.
 * - If the user exits fullscreen while `enabled` is true, `onExit` fires
 *   and the hook immediately re-requests fullscreen after a short delay.
 */
export function useFullscreen({ onExit, enabled = true }: UseFullscreenOptions = {}) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    // Track whether the exit was intentional (i.e. session ended)
    const intentionalRef = useRef(false);

    const enterFullscreen = useCallback(async () => {
        try {
            const el = document.documentElement;
            if (el.requestFullscreen) {
                await el.requestFullscreen();
            } else if ((el as any).webkitRequestFullscreen) {
                await (el as any).webkitRequestFullscreen();
            } else if ((el as any).mozRequestFullScreen) {
                await (el as any).mozRequestFullScreen();
            }
        } catch (err) {
            // Browser may deny (e.g. no user gesture). We'll retry on next user interaction.
            console.warn('Fullscreen request failed:', err);
        }
    }, []);

    /** Call this before ending the interview so the exit is not treated as cheating */
    const exitFullscreen = useCallback(async () => {
        intentionalRef.current = true;
        try {
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                await (document as any).webkitExitFullscreen();
            }
        } catch (err) {
            console.warn('exitFullscreen failed:', err);
        }
    }, []);

    useEffect(() => {
        const handleChange = () => {
            const fullscreenEl =
                document.fullscreenElement ||
                (document as any).webkitFullscreenElement ||
                (document as any).mozFullScreenElement;

            const nowFullscreen = !!fullscreenEl;
            setIsFullscreen(nowFullscreen);

            if (!nowFullscreen && enabled && !intentionalRef.current) {
                // Candidate exited fullscreen without our blessing → fire callback
                onExit?.();
                // Re-enter after a short delay (browser needs to settle)
                setTimeout(() => enterFullscreen(), 300);
            }
            // Reset intentional flag if we just exited intentionally
            if (!nowFullscreen && intentionalRef.current) {
                intentionalRef.current = false;
            }
        };

        document.addEventListener('fullscreenchange', handleChange);
        document.addEventListener('webkitfullscreenchange', handleChange);
        document.addEventListener('mozfullscreenchange', handleChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleChange);
            document.removeEventListener('webkitfullscreenchange', handleChange);
            document.removeEventListener('mozfullscreenchange', handleChange);
        };
    }, [enabled, onExit, enterFullscreen]);

    return { isFullscreen, enterFullscreen, exitFullscreen };
}
