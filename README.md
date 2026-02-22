# AuthentiQ – Behavioral Authenticity Engine

> Real-time behavioral monitoring system for remote interviews. Built for hackathons, architected for SaaS.

![AuthentiQ Banner](https://img.shields.io/badge/AuthentiQ-Behavioral%20Authenticity%20Engine-6366f1?style=for-the-badge)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%7C%20Node.js%20%7C%20Socket.io%20%7C%20SQLite-8b5cf6?style=for-the-badge)

---

## 🚀 What is AuthentiQ?

AuthentiQ is a real-time behavioral transparency tool for remote interviews. It monitors 7+ browser-level signals to produce an **Authenticity Score (0–100)** for candidates during live interview sessions.

**Recruiters** get a live dashboard. **Candidates** get transparent monitoring with visible consent.

---

## 📁 Project Structure

```
authentiq/
├── client/          → Next.js 15 frontend (TypeScript + Tailwind)
├── server/          → Node.js + Express backend (TypeScript + Socket.io + Prisma)
└── shared/          → Shared TypeScript types (client + server)
```

---

## 🔧 Setup & Installation

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Clone & Setup Server

```bash
cd server
npm install
npm run db:generate    # Generate Prisma client
npm run db:push        # Create SQLite database (dev.db)
npm run dev            # Start on http://localhost:4000
```

### 2. Setup Client

```bash
cd client
npm install
npm run dev            # Start on http://localhost:3000
```

### 3. Environment Variables

**Server** (`server/.env`):
```env
DATABASE_URL="file:./dev.db"
PORT=4000
CLIENT_URL="http://localhost:3000"
```

**Client** (`client/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 🗺️ Pages & Routes

| Route | Description |
|---|---|
| `/` | Landing page |
| `/create` | Recruiter creates a meeting |
| `/join/[meetingId]` | Candidate joins (or just `/join`) |
| `/recruiter/[meetingId]` | Live recruiter dashboard |
| `/candidate/[sessionId]` | Candidate interview screen |
| `/report/[meetingId]` | Post-interview summary + PDF |

---

## ⚡ Behavioral Signals Monitored

| Signal | Suspicion Weight |
|---|---|
| Tab switch | +10 |
| Paste attempt | +20 |
| Fullscreen exit | +15 |
| Word burst (150+ words < 2s) | +25 |
| Repeated window blur | +15 |
| Long unnatural delay | +10 |
| Fast typing (>150 WPM) | +5 |

**Score Formula**: `100 – Σ(event weights)`, clamped [0–100]

---

## 🏗️ Architecture

```
Browser (Candidate) ──── WebSocket ────► Server (Scoring Engine) ──► DB (SQLite)
                                                 │
Browser (Recruiter) ◄─── WebSocket ─────────────┘
                    ◄─── REST API    ─────────────┘
```

### REST API Endpoints

| Method | Route | Description |
|---|---|---|
| POST | `/api/meetings/create` | Create a new meeting |
| GET | `/api/meetings/:id` | Get meeting + session + events |
| POST | `/api/meetings/:id/join` | Candidate joins meeting |
| POST | `/api/meetings/:id/end` | End meeting, finalize score |

### WebSocket Events

**Client → Server:**
- `candidate_joined` – Notify recruiter of join
- `behavior_event` – Send behavioral signal
- `answer_submitted` – Log a submitted answer
- `session_end` – Finalize the session
- `recruiter_subscribe` – Subscribe recruiter to meeting room

**Server → Client:**
- `live_event_update` – New event for recruiter feed
- `score_update` – Updated authenticity score
- `candidate_status` – Candidate joined/monitoring status
- `session_ended` – Session finalized

---

## 🎨 UI Features

- **Dark/Light mode** toggle
- **Live Score Gauge** (animated SVG, 0–100)
- **Integrity Badge** (Green / Yellow / Red)
- **Suspicion Heatmap** (Recharts bar chart)
- **Score Timeline** (Recharts area chart)
- **Typing Speed Chart** (Recharts line chart)
- **Real-time Event Feed** (auto-scrolling)
- **PDF Report Download** (jsPDF)
- Glassmorphism design + futuristic dark theme

---

## 🚢 Deployment

### Frontend → Vercel
```bash
cd client && vercel --prod
# Set env: NEXT_PUBLIC_API_URL=https://your-backend.render.com
```

### Backend → Render
- Build command: `npm install && npx prisma generate && npm run build`
- Start command: `npm run start`
- Add env vars from `server/.env.example`
- Use **PostgreSQL** add-on on Render (update `schema.prisma` provider to `postgresql`)

---

## 🛡️ Ethics & Privacy

- **Browser-only**: No OS-level, screen, or camera recording (beyond consent-based webcam view)
- **Session-scoped**: No permanent tracking. Data is per-session only
- **Transparent**: Candidates see monitoring status at all times
- **Consent required**: Checkbox gate before interview starts

---

## 🏆 Hackathon Notes

Built for rapid prototyping. Uses **SQLite** for zero-setup local dev. Swap to **PostgreSQL** for production by changing `schema.prisma` provider.

The scoring engine (`server/src/scoring/authenticityEngine.ts`) is modular and designed as a drop-in replacement for an ML model in a future SaaS version.
