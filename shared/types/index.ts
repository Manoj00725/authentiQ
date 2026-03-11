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
    | 'answer_submitted'
    // Coding anti-cheat events
    | 'code_paste'
    | 'devtools_open'
    | 'right_click_attempt'
    | 'keyboard_shortcut_cheat'
    | 'ai_pattern_detected'
    | 'rapid_solution'
    | 'code_submitted'
    // Video call anti-cheat
    | 'face_not_detected'
    | 'multiple_faces_detected'
    | 'gaze_away'
    // Enhanced AI face detection
    | 'suspicious_emotion'
    | 'face_mismatch';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type CodingLanguage = 'javascript' | 'python' | 'java' | 'cpp' | 'typescript';

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

export interface CodingChallenge {
    id: string;
    title: string;
    description: string;
    language: CodingLanguage;
    starter_code: string;
    examples?: { input: string; output: string; explanation?: string }[];
    constraints?: string[];
}

// Enhanced AI face detection types
export type FaceEmotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted' | 'surprised';

export interface FaceEmotionData {
    dominant: FaceEmotion;
    confidence: number;
    all: Record<FaceEmotion, number>;
}

export interface FaceStatusUpdate {
    timestamp: string;
    status: 'face_detected' | 'no_face' | 'multiple_faces' | 'gaze_away';
    faceCount: number;
    emotion?: FaceEmotionData;
    identityDistance?: number;
    identityMatch?: 'verified' | 'warning' | 'mismatch';
}

export interface CheatAlert {
    id: string;
    session_id: string;
    event_type: EventType;
    severity: Severity;
    message: string;
    timestamp: string;
    code_snapshot?: string;
}

export interface CodeUpdate {
    session_id: string;
    code: string;
    language: CodingLanguage;
    char_count: number;
    timestamp: string;
}

export interface CreateMeetingRequest {
    recruiter_name: string;
    coding_challenge?: CodingChallenge;
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
// WebRTC signaling
export interface WebRTCSignal {
    sdp?: { type: string; sdp?: string };
    candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
}

// Enhanced face detection socket payload
export interface FaceStatusPayload {
    session_id: string;
    update: FaceStatusUpdate;
}

export interface ServerToClientEvents {
    live_event_update: (event: EventLog) => void;
    score_update: (score: ScoreUpdate) => void;
    candidate_status: (status: { joined: boolean; candidate_name?: string; monitoring_active: boolean }) => void;
    session_ended: (data: { final_score: number }) => void;
    error: (message: string) => void;
    // New: real-time code streaming and alerts
    cheat_alert: (alert: CheatAlert) => void;
    code_update: (update: CodeUpdate) => void;
    question_pushed: (challenge: CodingChallenge) => void;
    // WebRTC signaling
    webrtc_offer: (data: { signal: WebRTCSignal; from_session_id: string }) => void;
    webrtc_answer: (data: { signal: WebRTCSignal; from_session_id: string }) => void;
    webrtc_ice_candidate: (data: { candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }; from_session_id: string }) => void;
    peer_call_ready: (data: { session_id: string }) => void;
    // Screen share signaling
    screen_share_offer: (data: { signal: any; session_id: string }) => void;
    screen_share_answer: (data: { signal: any }) => void;
    screen_share_ice: (data: { candidate: any }) => void;
    screen_share_stopped: (data: {}) => void;
    // Enhanced face detection
    face_status_update: (data: FaceStatusUpdate) => void;
}

export interface ClientToServerEvents {
    candidate_joined: (data: { meeting_id: string; session_id: string; candidate_name: string }) => void;
    behavior_event: (data: { session_id: string; event: BehaviorEvent }) => void;
    answer_submitted: (data: { session_id: string; answer: string; question_index: number }) => void;
    session_end: (data: { session_id: string }) => void;
    recruiter_subscribe: (data: { meeting_id: string }) => void;
    // New: live code stream and push question
    code_update: (data: { session_id: string; code: string; language: CodingLanguage }) => void;
    recruiter_push_question: (data: { meeting_id: string; session_id: string; challenge: CodingChallenge }) => void;
    // WebRTC signaling
    call_ready: (data: { meeting_id: string; session_id: string }) => void;
    webrtc_offer: (data: { session_id: string; signal: WebRTCSignal }) => void;
    webrtc_answer: (data: { meeting_id: string; signal: WebRTCSignal }) => void;
    webrtc_ice_candidate: (data: { target: 'recruiter' | 'candidate'; meeting_id?: string; session_id?: string; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } }) => void;
    // Screen share signaling
    screen_share_offer: (data: { meeting_id: string; session_id: string; signal: any }) => void;
    screen_share_answer: (data: { session_id: string; signal: any }) => void;
    screen_share_ice: (data: { target: 'recruiter' | 'candidate'; meeting_id?: string; session_id?: string; candidate: any }) => void;
    screen_share_stopped: (data: { meeting_id: string }) => void;
    // Enhanced face detection
    face_status_update: (data: { session_id: string; update: FaceStatusUpdate }) => void;
}
