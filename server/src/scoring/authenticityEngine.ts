import type { EventLog, EventType } from '../../../shared/types';

/**
 * AuthenticityEngine – Rule-based behavioral scoring engine
 * Starts at 100 and subtracts suspicion weights for each flagged event.
 * Easily replaceable with ML model later.
 */

interface EventWeight {
    weight: number;
    description: string;
}

const EVENT_WEIGHTS: Record<string, EventWeight> = {
    // Behavioral events
    tab_switch: { weight: 10, description: 'Candidate switched browser tab' },
    paste_attempt: { weight: 20, description: 'Large paste detected in answer' },
    fullscreen_exit: { weight: 15, description: 'Candidate exited fullscreen mode' },
    word_burst: { weight: 25, description: '150+ words inserted in under 2 seconds' },
    window_blur: { weight: 8, description: 'Browser window lost focus' },
    long_delay: { weight: 10, description: 'Unusually long response delay detected' },
    typing_fast: { weight: 5, description: 'Abnormally fast typing speed detected' },
    // Coding anti-cheat events
    code_paste: { weight: 30, description: 'Large code block pasted into editor' },
    devtools_open: { weight: 35, description: 'Browser DevTools opened during session' },
    right_click_attempt: { weight: 8, description: 'Right-click attempted in code editor' },
    keyboard_shortcut_cheat: { weight: 20, description: 'Cheat keyboard shortcut (F12/Ctrl+U) detected' },
    ai_pattern_detected: { weight: 40, description: 'AI-generated code pattern detected (rapid, large, structured insertion)' },
    rapid_solution: { weight: 25, description: 'Full solution appeared in under 30 seconds' },
    // Video call anti-cheat
    face_not_detected: { weight: 20, description: 'Candidate face not visible in camera' },
    multiple_faces_detected: { weight: 45, description: 'Multiple faces detected — possible external assistance' },
    gaze_away: { weight: 12, description: 'Candidate repeatedly looking away from screen' },
};

// Bonus penalty for repeated blur events (pattern detection)
const BLUR_REPEAT_PENALTY = 15;
const BLUR_REPEAT_THRESHOLD = 3;

// Escalating penalty for repeated critical cheats
const REPEAT_CHEAT_THRESHOLD = 2;
const REPEAT_CHEAT_MULTIPLIER = 1.5;
const CRITICAL_CHEAT_EVENTS = new Set([
    'code_paste', 'devtools_open', 'ai_pattern_detected',
    'multiple_faces_detected', 'face_not_detected',
]);

export class AuthenticityEngine {
    private baseScore = 100;

    /**
     * Evaluate a single event and return its suspicion weight (delta).
     */
    evaluateEvent(event_type: string): number {
        return EVENT_WEIGHTS[event_type]?.weight ?? 0;
    }

    /**
     * Calculate aggregate authenticity score from all session events.
     * Returns clamped score between 0 and 100.
     */
    calculateScore(events: EventLog[]): number {
        let totalPenalty = 0;

        // Count blur events for repeat penalty
        const blurEvents = events.filter(e => e.event_type === 'window_blur');
        if (blurEvents.length >= BLUR_REPEAT_THRESHOLD) {
            totalPenalty += BLUR_REPEAT_PENALTY;
        }

        // Count critical cheat events – escalating penalty for repeats
        const cheatCounts: Record<string, number> = {};
        for (const event of events) {
            if (CRITICAL_CHEAT_EVENTS.has(event.event_type)) {
                cheatCounts[event.event_type] = (cheatCounts[event.event_type] || 0) + 1;
            }
        }

        // Sum up individual event penalties
        for (const event of events) {
            let penalty = this.evaluateEvent(event.event_type);
            // Apply escalating multiplier for repeated critical cheats
            if (CRITICAL_CHEAT_EVENTS.has(event.event_type) &&
                (cheatCounts[event.event_type] ?? 0) > REPEAT_CHEAT_THRESHOLD) {
                penalty = Math.round(penalty * REPEAT_CHEAT_MULTIPLIER);
            }
            totalPenalty += penalty;
        }

        const score = this.baseScore - totalPenalty;
        return Math.max(0, Math.min(100, score));
    }

    /**
     * Get human-readable description of an event type.
     */
    getEventDescription(event_type: string): string {
        return EVENT_WEIGHTS[event_type]?.description ?? 'Unknown event';
    }

    /**
     * Classify score into integrity tier.
     */
    static classifyScore(score: number): 'high' | 'moderate' | 'low' {
        if (score >= 75) return 'high';
        if (score >= 45) return 'moderate';
        return 'low';
    }

    /**
     * Check if an event should trigger an immediate cheat alert.
     */
    static isCriticalCheat(event_type: string): boolean {
        return CRITICAL_CHEAT_EVENTS.has(event_type) ||
            event_type === 'rapid_solution' ||
            event_type === 'keyboard_shortcut_cheat';
    }
}

export const authenticityEngine = new AuthenticityEngine();
