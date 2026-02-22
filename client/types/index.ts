// Shared types between client and server

export type MeetingStatus = 'waiting' | 'active' | 'ended';

export type EventType =
    | 'tab_switch'
    | 'window_blur'
    | 'window_focus'
    | 'paste_attempt'
    | 'fullscreen_exit'
    | 'fullscreen_enter'
    | 'word_burst'
    | 'long_delay'
    | 'typing_fast'
    | 'session_start'
    | 'session_end'
    | 'answer_submitted';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface Meeting {
    id: string;
    recruiter_name: string;
    created_at: string;
    status: MeetingStatus;
}

export interface CandidateSession {
    id: string;
    meeting_id: string;
    candidate_name: string;
    authenticity_score: number;
    started_at: string;
    ended_at?: string;
}

export interface EventLog {
    id: string;
    session_id: string;
    event_type: EventType;
    timestamp: string;
    severity: Severity;
    metadata?: Record<string, unknown>;
}

export interface BehaviorEvent {
    event_type: EventType;
    timestamp: string;
    severity: Severity;
    metadata?: Record<string, unknown>;
}

export interface ScoreUpdate {
    authenticity_score: number;
    suspicion_delta: number;
    total_events: number;
}

export interface CreateMeetingRequest {
    recruiter_name: string;
}

export interface CreateMeetingResponse {
    meeting: Meeting;
    join_link: string;
}

export interface JoinMeetingRequest {
    candidate_name: string;
}

export interface JoinMeetingResponse {
    session: CandidateSession;
    meeting: Meeting;
}

export interface MeetingDashboardData {
    meeting: Meeting;
    session: CandidateSession | null;
    events: EventLog[];
}

// Socket event payloads
export interface ServerToClientEvents {
    live_event_update: (event: EventLog) => void;
    score_update: (score: ScoreUpdate) => void;
    candidate_status: (status: { joined: boolean; candidate_name?: string; monitoring_active: boolean }) => void;
    session_ended: (data: { final_score: number }) => void;
    error: (message: string) => void;
}

export interface ClientToServerEvents {
    candidate_joined: (data: { meeting_id: string; session_id: string; candidate_name: string }) => void;
    behavior_event: (data: { session_id: string; event: BehaviorEvent }) => void;
    answer_submitted: (data: { session_id: string; answer: string; question_index: number }) => void;
    session_end: (data: { session_id: string }) => void;
    recruiter_subscribe: (data: { meeting_id: string }) => void;
}
