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
    tab_switch: { weight: 10, description: 'Candidate switched browser tab' },
    paste_attempt: { weight: 20, description: 'Large paste detected in answer' },
    fullscreen_exit: { weight: 15, description: 'Candidate exited fullscreen mode' },
    word_burst: { weight: 25, description: '150+ words inserted in under 2 seconds' },
    window_blur: { weight: 8, description: 'Browser window lost focus' },
    long_delay: { weight: 10, description: 'Unusually long response delay detected' },
    typing_fast: { weight: 5, description: 'Abnormally fast typing speed detected' },
};

// Bonus penalty for repeated blur events (pattern detection)
const BLUR_REPEAT_PENALTY = 15;
const BLUR_REPEAT_THRESHOLD = 3;

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

        // Sum up individual event penalties
        for (const event of events) {
            totalPenalty += this.evaluateEvent(event.event_type);
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
}

export const authenticityEngine = new AuthenticityEngine();
