import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '../../../shared/types';
import * as meetingService from '../services/meetingService';
import { authenticityEngine } from '../scoring/authenticityEngine';

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

                // Warn candidate on high suspicion events
                if (event.severity === 'high' || event.severity === 'critical') {
                    socket.emit('error', `Warning: Suspicious behavior detected (${event.event_type})`);
                }
            } catch (error) {
                console.error('behavior_event error:', error);
            }
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

        socket.on('disconnect', () => {
            console.log(`🔌 Socket disconnected: ${socket.id}`);
        });
    });
}
