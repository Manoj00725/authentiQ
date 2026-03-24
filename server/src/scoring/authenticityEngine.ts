import type { EventLog, EventType } from '../../../shared/types';

/**
 * AuthenticityEngine – Rule-based behavioral scoring engine
 * Starts at 100 and subtracts suspicion weights for each flagged event.
 * Easily replaceable with ML model later.
 */

interface EventWeight {
    weight: number;
    description: string;
    confidence: 100 | 60 | 40; // How reliable is this detection
}

const EVENT_WEIGHTS: Record<string, EventWeight> = {
    // Behavioral events — 100% confidence (hard facts from browser APIs)
    tab_switch: { weight: 10, description: 'Candidate switched browser tab', confidence: 100 },
    paste_attempt: { weight: 20, description: 'Large paste detected in answer', confidence: 100 },
    fullscreen_exit: { weight: 15, description: 'Candidate exited fullscreen mode', confidence: 100 },
    word_burst: { weight: 25, description: '150+ words inserted in under 2 seconds', confidence: 40 },
    window_blur: { weight: 8, description: 'Browser window lost focus', confidence: 40 },
    long_delay: { weight: 10, description: 'Unusually long response delay detected', confidence: 40 },
    typing_fast: { weight: 5, description: 'Abnormally fast typing speed detected', confidence: 40 },
    // Coding anti-cheat events — 100% confidence
    code_paste: { weight: 30, description: 'Large code block pasted into editor', confidence: 100 },
    devtools_open: { weight: 35, description: 'Browser DevTools opened during session', confidence: 100 },
    right_click_attempt: { weight: 8, description: 'Right-click attempted in code editor', confidence: 100 },
    keyboard_shortcut_cheat: { weight: 20, description: 'Cheat keyboard shortcut (F12/Ctrl+U) detected', confidence: 100 },
    ai_pattern_detected: { weight: 40, description: 'AI-generated code pattern detected (rapid, large, structured insertion)', confidence: 60 },
    rapid_solution: { weight: 25, description: 'Full solution appeared in under 30 seconds', confidence: 40 },
    // Video call anti-cheat — 60% confidence (AI inferences)
    face_not_detected: { weight: 20, description: 'Candidate face not visible in camera', confidence: 60 },
    multiple_faces_detected: { weight: 45, description: 'Multiple faces detected — possible external assistance', confidence: 60 },
    gaze_away: { weight: 12, description: 'Candidate repeatedly looking away from screen', confidence: 60 },
    // Enhanced AI face detection — 60% confidence
    suspicious_emotion: { weight: 15, description: 'Abnormal emotional pattern detected (flat affect, stress spike, or erratic shifts)', confidence: 60 },
    face_mismatch: { weight: 50, description: 'Different person detected — face does not match reference photo', confidence: 60 },
    // Environment detection — 100% confidence
    vm_detected: { weight: 40, description: 'Virtual machine environment detected — interview running in sandbox', confidence: 100 },
    // Network events — 40% confidence (could be technical issue)
    network_unstable: { weight: 5, description: 'Network instability detected — possible connectivity issues', confidence: 40 },
};

// Bonus penalty for repeated blur events (pattern detection)
const BLUR_REPEAT_PENALTY = 15;
const BLUR_REPEAT_THRESHOLD = 3;

// Escalating penalty for repeated critical cheats
const REPEAT_CHEAT_THRESHOLD = 2;
const REPEAT_CHEAT_MULTIPLIER = 1.5;
const CRITICAL_CHEAT_EVENTS = new Set([
    'code_paste', 'devtools_open', 'ai_pattern_detected',
    'multiple_faces_detected', 'face_not_detected', 'face_mismatch',
    'vm_detected',
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
            event_type === 'keyboard_shortcut_cheat' ||
            event_type === 'vm_detected';
    }

    /**
     * Calculate confidence score — how reliable is the evidence.
     * 100 = all events are hard-facts from browser APIs.
     * Lower = more AI-inferred or heuristic events.
     */
    calculateConfidence(events: EventLog[]): {
        score: number;
        breakdown: { hard_facts: number; ai_inferences: number; heuristics: number };
    } {
        const cheatingEvents = events.filter(e =>
            EVENT_WEIGHTS[e.event_type] && !['session_start', 'session_end', 'window_focus',
                'answer_submitted', 'code_submitted', 'fullscreen_enter'].includes(e.event_type)
        );

        if (cheatingEvents.length === 0) {
            return { score: 100, breakdown: { hard_facts: 0, ai_inferences: 0, heuristics: 0 } };
        }

        let hard_facts = 0;
        let ai_inferences = 0;
        let heuristics = 0;
        let totalWeighted = 0;
        let totalWeight = 0;

        for (const event of cheatingEvents) {
            const ew = EVENT_WEIGHTS[event.event_type];
            if (!ew) continue;
            const w = ew.weight;
            totalWeighted += w * ew.confidence;
            totalWeight += w;

            if (ew.confidence === 100) hard_facts++;
            else if (ew.confidence === 60) ai_inferences++;
            else heuristics++;
        }

        const score = totalWeight > 0 ? Math.round(totalWeighted / totalWeight) : 100;
        return {
            score: Math.max(0, Math.min(100, score)),
            breakdown: { hard_facts, ai_inferences, heuristics },
        };
    }
}

export const authenticityEngine = new AuthenticityEngine();
