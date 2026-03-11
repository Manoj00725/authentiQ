import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import type { ServerToClientEvents, ClientToServerEvents, CheatAlert } from '../../../shared/types';
import * as meetingService from '../services/meetingService';
import { authenticityEngine, AuthenticityEngine } from '../scoring/authenticityEngine';

const CHEAT_EVENT_MESSAGES: Record<string, string> = {
    code_paste: '📋 Code paste detected — candidate pasted a large block of code',
    devtools_open: '🔧 DevTools opened — candidate may be running external code',
    right_click_attempt: '🖱️ Right-click attempted in code editor',
    keyboard_shortcut_cheat: '⌨️ Cheat shortcut detected (F12, Ctrl+U, or Ctrl+Shift+I)',
    ai_pattern_detected: '🤖 AI-generated pattern — large structured code appeared rapidly',
    rapid_solution: '⚡ Rapid solution — full answer appeared in under 30 seconds',
    tab_switch: '🔄 Tab switch — candidate navigated away from interview',
    paste_attempt: '📋 Paste detected in text answer',
    fullscreen_exit: '⤢ Candidate exited fullscreen mode',
    word_burst: '💥 Unusual bulk text insertion detected',
    window_blur: '👁️ Browser window lost focus',
    // Video anti-cheat
    face_not_detected: '📷 Face not visible — candidate may have stepped away from camera',
    multiple_faces_detected: '👥 Multiple faces detected — someone may be assisting the candidate',
    gaze_away: '👀 Candidate looking away from screen repeatedly',
    // Enhanced AI face detection
    suspicious_emotion: '🎭 Suspicious emotional pattern — abnormal expression detected by AI',
    face_mismatch: '🚨 IDENTITY ALERT — Face does not match reference photo! Possible candidate swap',
};

export function setupSocketHandlers(
    io: Server<ClientToServerEvents, ServerToClientEvents>
) {
    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: ${socket.id}`);

        // Recruiter subscribes to their meeting room
        socket.on('recruiter_subscribe', ({ meeting_id }) => {
            const room = `recruiter:${meeting_id}`;
            socket.join(room);
            console.log(`📊 Recruiter subscribed to room: ${room}`);
        });

        // Candidate joins meeting
        socket.on('candidate_joined', async ({ meeting_id, session_id, candidate_name }) => {
            socket.join(`candidate:${session_id}`);
            console.log(`👤 Candidate joined: ${candidate_name} (session: ${session_id})`);

            // Notify recruiter dashboard
            io.to(`recruiter:${meeting_id}`).emit('candidate_status', {
                joined: true,
                candidate_name,
                monitoring_active: true,
            });
        });

        // Behavior event from candidate
        socket.on('behavior_event', async ({ session_id, event }) => {
            try {
                // Store event in DB
                const storedEvent = await meetingService.createEventLog(session_id, event);

                // Recalculate score
                const allEvents = await meetingService.getEventsBySession(session_id);
                const newScore = authenticityEngine.calculateScore(allEvents);
                const suspicion_delta = authenticityEngine.evaluateEvent(event.event_type);

                // Update score in DB
                await meetingService.updateSessionScore(session_id, newScore);

                // Get meeting_id for routing to recruiter
                const session = await meetingService.getSessionById(session_id);
                if (!session) return;

                const meeting_id = session.meeting_id;

                // Emit live update to recruiter
                io.to(`recruiter:${meeting_id}`).emit('live_event_update', storedEvent);
                io.to(`recruiter:${meeting_id}`).emit('score_update', {
                    authenticity_score: newScore,
                    suspicion_delta,
                    total_events: allEvents.length,
                });

                // Emit structured cheat alert for notable events
                if (AuthenticityEngine.isCriticalCheat(event.event_type) ||
                    event.severity === 'high' || event.severity === 'critical') {

                    const alert: CheatAlert = {
                        id: uuidv4(),
                        session_id,
                        event_type: event.event_type,
                        severity: event.severity,
                        message: CHEAT_EVENT_MESSAGES[event.event_type] ?? `Suspicious event: ${event.event_type}`,
                        timestamp: event.timestamp,
                        code_snapshot: event.metadata?.code_snapshot as string | undefined,
                    };
                    io.to(`recruiter:${meeting_id}`).emit('cheat_alert', alert);
                    console.log(`🚨 Cheat alert emitted: ${alert.event_type} (${alert.severity})`);
                }

                // Warn candidate on high suspicion events
                if (event.severity === 'high' || event.severity === 'critical') {
                    socket.emit('error', `Warning: Suspicious behavior detected (${event.event_type})`);
                }
            } catch (error) {
                console.error('behavior_event error:', error);
            }
        });

        // Live code streaming from candidate → recruiter
        socket.on('code_update', async ({ session_id, code, language }) => {
            try {
                const session = await meetingService.getSessionById(session_id);
                if (!session) return;

                io.to(`recruiter:${session.meeting_id}`).emit('code_update', {
                    session_id,
                    code,
                    language,
                    char_count: code.length,
                    timestamp: new Date().toISOString(),
                });
            } catch (error) {
                console.error('code_update error:', error);
            }
        });

        // Recruiter pushes a custom question to candidate mid-session
        socket.on('recruiter_push_question', ({ meeting_id, session_id, challenge }) => {
            console.log(`📨 Recruiter pushed question to session: ${session_id}`);
            io.to(`candidate:${session_id}`).emit('question_pushed', challenge);
        });

        // Answer submitted
        socket.on('answer_submitted', async ({ session_id, answer, question_index }) => {
            console.log(`📝 Answer submitted for session: ${session_id}, Q${question_index + 1}`);
            const session = await meetingService.getSessionById(session_id);
            if (session) {
                io.to(`recruiter:${session.meeting_id}`).emit('live_event_update', {
                    id: `ans_${Date.now()}`,
                    session_id,
                    event_type: 'answer_submitted',
                    timestamp: new Date().toISOString(),
                    severity: 'low',
                    metadata: { question_index, word_count: answer.trim().split(/\s+/).length },
                });
            }
        });

        // Session ended by candidate or recruiter
        socket.on('session_end', async ({ session_id }) => {
            try {
                const allEvents = await meetingService.getEventsBySession(session_id);
                const finalScore = authenticityEngine.calculateScore(allEvents);
                const session = await meetingService.endSession(session_id, finalScore);
                await meetingService.updateMeetingStatus(session.meeting_id, 'ended');

                io.to(`recruiter:${session.meeting_id}`).emit('session_ended', { final_score: finalScore });
                io.to(`candidate:${session_id}`).emit('session_ended', { final_score: finalScore });

                console.log(`✅ Session ended: ${session_id}, final score: ${finalScore}`);
            } catch (error) {
                console.error('session_end error:', error);
            }
        });

        // ─── WebRTC Signaling Relay ────────────────────────────────────────────
        // Candidate is ready — notify recruiter to initiate the call
        socket.on('call_ready', ({ meeting_id, session_id }) => {
            console.log(`📹 Candidate call ready: session=${session_id} meeting=${meeting_id}`);
            io.to(`recruiter:${meeting_id}`).emit('peer_call_ready', { session_id });
        });

        // Recruiter → Candidate: SDP offer
        socket.on('webrtc_offer', ({ session_id, signal }) => {
            console.log(`📡 WebRTC offer → candidate:${session_id}`);
            io.to(`candidate:${session_id}`).emit('webrtc_offer', { signal, from_session_id: session_id });
        });

        // Candidate → Recruiter: SDP answer
        socket.on('webrtc_answer', ({ meeting_id, signal }) => {
            console.log(`📡 WebRTC answer → recruiter:${meeting_id}`);
            io.to(`recruiter:${meeting_id}`).emit('webrtc_answer', { signal, from_session_id: meeting_id });
        });

        // ICE candidate relay (bidirectional)
        socket.on('webrtc_ice_candidate', ({ target, meeting_id, session_id, candidate }) => {
            if (target === 'recruiter' && meeting_id) {
                io.to(`recruiter:${meeting_id}`).emit('webrtc_ice_candidate', { candidate, from_session_id: session_id ?? '' });
            } else if (target === 'candidate' && session_id) {
                io.to(`candidate:${session_id}`).emit('webrtc_ice_candidate', { candidate, from_session_id: meeting_id ?? '' });
            }
        });
        // ──────────────────────────────────────────────────────────────────────

        // ─── Screen Share Signaling Relay ──────────────────────────────────────
        // Candidate → Recruiter: screen share SDP offer
        socket.on('screen_share_offer', ({ meeting_id, session_id, signal }) => {
            console.log(`🖥️  Screen-share offer → recruiter:${meeting_id}`);
            io.to(`recruiter:${meeting_id}`).emit('screen_share_offer', { signal, session_id });
        });

        // Recruiter → Candidate: screen share SDP answer
        socket.on('screen_share_answer', ({ session_id, signal }) => {
            console.log(`🖥️  Screen-share answer → candidate:${session_id}`);
            io.to(`candidate:${session_id}`).emit('screen_share_answer', { signal });
        });

        // ICE candidates for screen share (bidirectional)
        socket.on('screen_share_ice', ({ target, meeting_id, session_id, candidate }) => {
            if (target === 'recruiter' && meeting_id) {
                io.to(`recruiter:${meeting_id}`).emit('screen_share_ice', { candidate });
            } else if (target === 'candidate' && session_id) {
                io.to(`candidate:${session_id}`).emit('screen_share_ice', { candidate });
            }
        });

        // Candidate stopped screen sharing
        socket.on('screen_share_stopped', ({ meeting_id }) => {
            console.log(`🖥️  Screen share stopped for meeting: ${meeting_id}`);
            io.to(`recruiter:${meeting_id}`).emit('screen_share_stopped', {});
        });
        // ──────────────────────────────────────────────────────────────────────

        // ─── Enhanced Face Detection: relay face status to recruiter ───────────
        socket.on('face_status_update', async ({ session_id, update }) => {
            try {
                const session = await meetingService.getSessionById(session_id);
                if (!session) return;
                io.to(`recruiter:${session.meeting_id}`).emit('face_status_update', update);
            } catch (error) {
                console.error('face_status_update error:', error);
            }
        });
        // ──────────────────────────────────────────────────────────────────────

        socket.on('disconnect', () => {
            console.log(`🔌 Socket disconnected: ${socket.id}`);
        });
    });
}
