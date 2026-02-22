import { Request, Response } from 'express';
import * as meetingService from '../services/meetingService';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

export async function createMeeting(req: Request, res: Response) {
    try {
        const { recruiter_name } = req.body;
        if (!recruiter_name?.trim()) {
            return res.status(400).json({ error: 'recruiter_name is required' });
        }
        const meeting = await meetingService.createMeeting(recruiter_name.trim());
        const join_link = `${CLIENT_URL}/join/${meeting.id}`;
        return res.status(201).json({ meeting, join_link });
    } catch (error) {
        console.error('createMeeting error:', error);
        return res.status(500).json({ error: 'Failed to create meeting' });
    }
}

export async function getMeeting(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const data = await meetingService.getMeetingDashboard(id);
        if (!data) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        return res.json(data);
    } catch (error) {
        console.error('getMeeting error:', error);
        return res.status(500).json({ error: 'Failed to fetch meeting' });
    }
}

export async function joinMeeting(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { candidate_name } = req.body;
        if (!candidate_name?.trim()) {
            return res.status(400).json({ error: 'candidate_name is required' });
        }
        const meeting = await meetingService.getMeetingById(id);
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        if (meeting.status === 'ended') {
            return res.status(400).json({ error: 'This interview session has ended' });
        }
        const session = await meetingService.createSession(id, candidate_name.trim());
        await meetingService.updateMeetingStatus(id, 'active');
        return res.status(201).json({ session, meeting: { ...meeting, status: 'active' } });
    } catch (error) {
        console.error('joinMeeting error:', error);
        return res.status(500).json({ error: 'Failed to join meeting' });
    }
}

export async function endMeeting(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const meeting = await meetingService.getMeetingById(id);
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        const session = await meetingService.getSessionByMeeting(id);
        if (session) {
            const events = await meetingService.getEventsBySession(session.id);
            const { authenticityEngine } = await import('../scoring/authenticityEngine');
            const finalScore = authenticityEngine.calculateScore(events);
            await meetingService.endSession(session.id, finalScore);
        }
        await meetingService.updateMeetingStatus(id, 'ended');
        const data = await meetingService.getMeetingDashboard(id);
        return res.json(data);
    } catch (error) {
        console.error('endMeeting error:', error);
        return res.status(500).json({ error: 'Failed to end meeting' });
    }
}
