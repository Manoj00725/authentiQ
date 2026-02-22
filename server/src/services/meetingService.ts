import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import type {
    Meeting,
    CandidateSession,
    EventLog,
    BehaviorEvent,
    MeetingStatus,
} from '../../../shared/types';

const prisma = new PrismaClient();

function mapMeeting(m: any): Meeting {
    return {
        id: m.id,
        recruiter_name: m.recruiter_name,
        created_at: m.created_at.toISOString(),
        status: m.status as MeetingStatus,
    };
}

function mapSession(s: any): CandidateSession {
    return {
        id: s.id,
        meeting_id: s.meeting_id,
        candidate_name: s.candidate_name,
        authenticity_score: s.authenticity_score,
        started_at: s.started_at.toISOString(),
        ended_at: s.ended_at?.toISOString(),
    };
}

function mapEvent(e: any): EventLog {
    return {
        id: e.id,
        session_id: e.session_id,
        event_type: e.event_type,
        timestamp: e.timestamp.toISOString(),
        severity: e.severity,
        metadata: e.metadata ? JSON.parse(e.metadata) : undefined,
    };
}

export async function createMeeting(recruiter_name: string): Promise<Meeting> {
    const meeting = await prisma.meeting.create({
        data: {
            recruiter_name,
            status: 'waiting',
        },
    });
    return mapMeeting(meeting);
}

export async function getMeetingById(id: string): Promise<Meeting | null> {
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    return meeting ? mapMeeting(meeting) : null;
}

export async function updateMeetingStatus(id: string, status: MeetingStatus): Promise<Meeting> {
    const meeting = await prisma.meeting.update({
        where: { id },
        data: { status },
    });
    return mapMeeting(meeting);
}

export async function createSession(meeting_id: string, candidate_name: string): Promise<CandidateSession> {
    const session = await prisma.candidateSession.create({
        data: {
            meeting_id,
            candidate_name,
            authenticity_score: 100,
        },
    });
    return mapSession(session);
}

export async function getSessionByMeeting(meeting_id: string): Promise<CandidateSession | null> {
    const session = await prisma.candidateSession.findFirst({
        where: { meeting_id },
        orderBy: { started_at: 'desc' },
    });
    return session ? mapSession(session) : null;
}

export async function getSessionById(session_id: string): Promise<CandidateSession | null> {
    const session = await prisma.candidateSession.findUnique({ where: { id: session_id } });
    return session ? mapSession(session) : null;
}

export async function updateSessionScore(session_id: string, score: number): Promise<CandidateSession> {
    const session = await prisma.candidateSession.update({
        where: { id: session_id },
        data: { authenticity_score: score },
    });
    return mapSession(session);
}

export async function endSession(session_id: string, final_score: number): Promise<CandidateSession> {
    const session = await prisma.candidateSession.update({
        where: { id: session_id },
        data: { ended_at: new Date(), authenticity_score: final_score },
    });
    return mapSession(session);
}

export async function createEventLog(
    session_id: string,
    event: BehaviorEvent
): Promise<EventLog> {
    const log = await prisma.eventLog.create({
        data: {
            session_id,
            event_type: event.event_type,
            timestamp: new Date(event.timestamp),
            severity: event.severity,
            metadata: event.metadata ? JSON.stringify(event.metadata) : undefined,
        },
    });
    return mapEvent(log);
}

export async function getEventsBySession(session_id: string): Promise<EventLog[]> {
    const events = await prisma.eventLog.findMany({
        where: { session_id },
        orderBy: { timestamp: 'asc' },
    });
    return events.map(mapEvent);
}

export async function getMeetingDashboard(meeting_id: string) {
    const meeting = await getMeetingById(meeting_id);
    if (!meeting) return null;
    const session = await getSessionByMeeting(meeting_id);
    const events = session ? await getEventsBySession(session.id) : [];
    return { meeting, session, events };
}
