import { Router } from 'express';
import { createMeeting, getMeeting, joinMeeting, endMeeting } from '../controllers/meetingController';

const router = Router();

// POST /api/meetings/create
router.post('/create', createMeeting);

// GET /api/meetings/:id
router.get('/:id', getMeeting);

// POST /api/meetings/:id/join
router.post('/:id/join', joinMeeting);

// POST /api/meetings/:id/end
router.post('/:id/end', endMeeting);

export default router;
