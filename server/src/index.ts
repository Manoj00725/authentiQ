import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import meetingRoutes from './routes/meetings';
import { setupSocketHandlers } from './websocket/socketHandler';
import type { ServerToClientEvents, ClientToServerEvents } from '../../shared/types';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
        origin: CLIENT_URL,
        methods: ['GET', 'POST'],
    },
});

// Middleware
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/meetings', meetingRoutes);

// WebSocket setup
setupSocketHandlers(io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`🚀 AuthentiQ server running on port ${PORT}`);
    console.log(`📡 WebSocket ready`);
    console.log(`🔗 CORS allowed: ${CLIENT_URL}`);
});

export { io };
