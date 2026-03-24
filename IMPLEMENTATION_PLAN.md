# 🛡️ AuthentiQ — Advanced Features Implementation Plan

> **5 new features** to elevate the proctoring platform from detection → prevention → fairness → transparency.

---

## 📋 Feature Overview

| # | Feature | Layer | Priority | Effort | Files Touched |
|---|---------|-------|----------|--------|---------------|
| 1 | VM Detection | Frontend | 🔴 High | ~4 hrs | 6 files |
| 2 | Network Stability | Full-stack | 🟡 Medium | ~3 hrs | 5 files |
| 3 | Pre-Interview Calibration | Frontend | 🟡 Medium | ~6 hrs | 4 files |
| 4 | Human-in-the-Loop Appeals | Full-stack | 🟢 Low | ~5 hrs | 7 files |
| 5 | Recruiter Confidence Score | Frontend + Server | 🟡 Medium | ~3 hrs | 4 files |

---

## ──────────────────────────────────────────────────────────
## Feature 1: VM Detection (Frontend Security)
## ──────────────────────────────────────────────────────────

### 🎯 Goal
Detect if the candidate is running the interview inside a virtual machine (VirtualBox, VMware, QEMU, Hyper-V, etc.) and flag it to the recruiter.

### 📐 Architecture

```
┌────────────────────────────────────────────┐
│  Candidate Browser (WebGL + Navigator API) │
│                                            │
│  1. Query WebGL renderer string            │
│  2. Query navigator.hardwareConcurrency    │
│  3. Query navigator.deviceMemory           │
│  4. Screen resolution anomaly check        │
│                                            │
│  → Emit behavior_event: "vm_detected"      │
└──────────────────┬─────────────────────────┘
                   │ Socket.IO
                   ▼
┌──────────────────────────────────────┐
│  Server: authenticityEngine          │
│  → -40 pts (critical severity)      │
│  → cheat_alert → recruiter dashboard │
└──────────────────────────────────────┘
```

### 📝 Implementation Steps

#### Step 1.1 — Create `useVMDetection.ts` hook
**File:** `client/hooks/useVMDetection.ts` (NEW)

```typescript
// Detects virtual machine indicators via WebGL, Navigator, and Screen APIs
export function useVMDetection(): { isVM: boolean; vmIndicators: string[] }

// Detection checks:
// 1. WebGL renderer string — match against known VM GPUs
const VM_GPU_SIGNATURES = [
    'VirtualBox', 'VMware', 'SVGA', 'llvmpipe', 'Mesa',
    'Microsoft Basic Render', 'Parallels', 'QEMU', 'Hyper-V',
    'Software Rasterizer', 'Google SwiftShader',
];

// 2. Hardware anomaly — VMs typically have low cores + low memory
navigator.hardwareConcurrency  // < 2 is suspicious
navigator.deviceMemory         // < 2 GB is suspicious

// 3. Screen anomaly — non-standard resolutions (e.g., 1024x768)
window.screen.width / window.screen.height  // unusual ratios

// Returns { isVM: true/false, vmIndicators: ['VMware GPU', 'Low cores'] }
```

#### Step 1.2 — Add `vm_detected` event type
**File:** `shared/types/index.ts`
```typescript
// Add to EventType union:
| 'vm_detected'
```

#### Step 1.3 — Add scoring weight
**File:** `server/src/scoring/authenticityEngine.ts`
```typescript
// Add to EVENT_WEIGHTS:
vm_detected: { weight: 40, description: 'Virtual machine environment detected' },

// Add to CRITICAL_CHEAT_EVENTS set:
'vm_detected'
```

#### Step 1.4 — Add cheat alert message
**File:** `server/src/websocket/socketHandler.ts`
```typescript
// Add to CHEAT_EVENT_MESSAGES:
vm_detected: '🖥️ VIRTUAL MACHINE — Interview running in a virtualized environment',
```

#### Step 1.5 — Integrate in candidate page
**File:** `client/app/candidate/[id]/page.tsx`
```typescript
// Import and use the hook
const { isVM, vmIndicators } = useVMDetection();

// On detection, emit a behavior_event immediately
useEffect(() => {
    if (isVM && sessionId) {
        emit('behavior_event', {
            session_id: sessionId,
            event: {
                event_type: 'vm_detected',
                timestamp: new Date().toISOString(),
                severity: 'critical',
                metadata: { indicators: vmIndicators },
            },
        });
    }
}, [isVM, sessionId]);
```

#### Step 1.6 — Add UI in recruiter dashboard
**File:** `client/app/recruiter/[id]/page.tsx`
```typescript
// Add to EVENT_ICONS and CHEAT_LABELS:
vm_detected: '🖥️'
vm_detected: 'VM DETECTED'
```

#### Step 1.7 — Mirror types in client
**File:** `client/types/index.ts`
```typescript
// Add 'vm_detected' to the client EventType union
```

---

## ──────────────────────────────────────────────────────────
## Feature 2: Network Stability (Real-time Health)
## ──────────────────────────────────────────────────────────

### 🎯 Goal
Implement a heartbeat/ping system so technical network issues (high latency, disconnections) aren't wrongly flagged as cheating. Display real-time connection quality on both candidate and recruiter dashboards.

### 📐 Architecture

```
┌──────────────────────────────────────────────┐
│  Client: useNetworkHealth.ts                 │
│                                              │
│  Every 5s:                                   │
│    1. Record timestamp T1                    │
│    2. Emit 'ping_check' with T1             │
│    3. Listen for 'pong_check' with T1       │
│    4. Latency = Date.now() - T1              │
│    5. Store in rolling latencyLog[]          │
│    6. Compute: avg, jitter, packetLoss      │
│                                              │
│  Returns: { latency, quality, isUnstable }   │
└──────────────────┬───────────────────────────┘
                   │ Socket.IO
                   ▼
┌──────────────────────────────────────────────┐
│  Server: socketHandler.ts                    │
│                                              │
│  on('ping_check') → emit('pong_check')      │
│  Store latency log in session metadata       │
│  Relay network_health to recruiter           │
└──────────────────────────────────────────────┘
```

### 📝 Implementation Steps

#### Step 2.1 — Create `useNetworkHealth.ts` hook
**File:** `client/hooks/useNetworkHealth.ts` (NEW)

```typescript
interface NetworkHealth {
    latency: number;            // Current ping in ms
    avgLatency: number;         // Rolling average
    jitter: number;             // Variance
    quality: 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected';
    isUnstable: boolean;        // true if quality is 'poor' or worse
    latencyHistory: { t: string; ms: number }[];  // For charting
}

// Quality thresholds:
// excellent: < 50ms
// good: 50-150ms
// fair: 150-300ms
// poor: > 300ms
// disconnected: no pong for 15s
```

#### Step 2.2 — Add socket events
**File:** `shared/types/index.ts`
```typescript
// ClientToServerEvents:
ping_check: (data: { session_id: string; t: number }) => void;
network_health: (data: { session_id: string; latency: number; quality: string }) => void;

// ServerToClientEvents:
pong_check: (data: { t: number }) => void;
network_health: (data: { latency: number; quality: string }) => void;
```

#### Step 2.3 — Add server handler
**File:** `server/src/websocket/socketHandler.ts`
```typescript
// Simple echo for latency measurement
socket.on('ping_check', (data) => {
    socket.emit('pong_check', { t: data.t });
});

// Relay network health to recruiter
socket.on('network_health', (data) => {
    io.to(`recruiter_${meetingId}`).emit('network_health', {
        latency: data.latency,
        quality: data.quality,
    });
});
```

#### Step 2.4 — Add UI indicators
**File:** `client/app/candidate/[id]/page.tsx` — Small connection badge in header
**File:** `client/app/recruiter/[id]/page.tsx` — Network quality indicator + latency chart in Analytics tab

```
┌───────────────────────────────────────┐
│  📡 Connection: ●● Good (45ms)       │  ← Candidate header
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│  📡 Candidate Connection              │  ← Recruiter sidebar
│  Latency: 45ms  Quality: Good        │
│  ▁▂▁▂▃▂▁▂▁▃▂▁  (sparkline)          │
└───────────────────────────────────────┘
```

---

## ──────────────────────────────────────────────────────────
## Feature 3: Pre-Interview Calibration (AI Fairness)
## ──────────────────────────────────────────────────────────

### 🎯 Goal
A 3-step "warm-up" before the interview starts, calibrating the AI detection thresholds to the specific candidate's natural behaviors. This prevents false positives from unique facial structures, typing rhythms, or gaze habits.

### 📐 Architecture

```
┌─────────────────────────────────────────────────────┐
│  Join Page: Step 2.5 — Pre-Interview Calibration    │
│  (Between face capture and entering interview)      │
│                                                     │
│  ┌─ Step A: Gaze Calibration ─────────────────────┐ │
│  │  "Look at the 4 corners of your screen"         │ │
│  │  → Records gaze deviation baselines             │ │
│  │  → Stores: gazeCalibration in sessionStorage    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ Step B: Expression Calibration ───────────────┐ │
│  │  "Read this sentence aloud naturally"           │ │
│  │  → Records neutral→speaking emotion baseline    │ │
│  │  → Stores: emotionBaseline in sessionStorage    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ Step C: Typing Calibration ───────────────────┐ │
│  │  "Type: The quick brown fox jumps over..."      │ │
│  │  → Records WPM, key intervals, error rate       │ │
│  │  → Stores: typingBaseline in sessionStorage     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  All baselines used by monitoring hooks to adjust   │
│  thresholds per-candidate.                          │
└─────────────────────────────────────────────────────┘
```

### 📝 Implementation Steps

#### Step 3.1 — Update JoinStep type
**File:** `client/app/join/[[...id]]/page.tsx`
```typescript
type JoinStep = 'details' | 'face_capture' | 'calibration' | 'joining';
// Insert 'calibration' between face_capture and joining
```

#### Step 3.2 — Build Calibration UI Component
**File:** `client/app/join/[[...id]]/page.tsx` (add within the same page)

```
Calibration Step A — Gaze:
┌─────────────────────────────────────────┐
│  🎯 Gaze Calibration                   │
│                                         │
│  Look at each dot for 2 seconds:        │
│                                         │
│  ●                               ●      │  ← animated dots at corners
│                                         │
│                                         │
│  ●                               ●      │
│                                         │
│  Progress: ████████░░░░ 3/4              │
└─────────────────────────────────────────┘

Calibration Step B — Expression:
┌─────────────────────────────────────────┐
│  🗣️ Expression Calibration             │
│                                         │
│  Read aloud:                            │
│  "Technology brings people closer"      │
│                                         │
│  📸 Analyzing your natural expressions  │
│  Detected: neutral → happy → neutral    │
│                                         │
│  Progress: ████████████░░ 2/3            │
└─────────────────────────────────────────┘

Calibration Step C — Typing:
┌─────────────────────────────────────────┐
│  ⌨️ Typing Calibration                  │
│                                         │
│  Type this sentence:                    │
│  "The quick brown fox jumps over the    │
│   lazy dog near the river bank"         │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ The quick brown f|               │    │
│  └─────────────────────────────────┘    │
│                                         │
│  WPM: 62  |  Accuracy: 98%             │
│  Progress: ████████████████ Complete     │
└─────────────────────────────────────────┘
```

#### Step 3.3 — Create calibration data interfaces
**File:** `shared/types/index.ts` (or keep client-only)
```typescript
interface GazeCalibration {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
    gazeDeviationThreshold: number;  // Computed from calibration
}

interface EmotionBaseline {
    restingEmotion: FaceEmotion;      // Most common neutral state
    emotionVariance: number;           // How much emotion naturally shifts
    expressionRange: FaceEmotion[];    // Natural expression range
}

interface TypingBaseline {
    avgWPM: number;
    avgKeyInterval: number;           // ms between keystrokes
    errorRate: number;                // % of backspaces
    burstThreshold: number;           // Computed: anything > 2x WPM is suspicious
}

interface CalibrationData {
    gaze: GazeCalibration;
    emotion: EmotionBaseline;
    typing: TypingBaseline;
    completedAt: string;
}
```

#### Step 3.4 — Store calibration in sessionStorage
```typescript
sessionStorage.setItem('calibration_data', JSON.stringify(calibrationData));
```

#### Step 3.5 — Use calibration in monitoring hooks
**File:** `client/hooks/useFaceDetection.ts`
```typescript
// Load calibration data and adjust gaze threshold:
const calibration = JSON.parse(sessionStorage.getItem('calibration_data') || '{}');
const gazeThreshold = calibration?.gaze?.gazeDeviationThreshold ?? DEFAULT_GAZE_THRESHOLD;
```

**File:** `client/hooks/useMonitoring.ts`
```typescript
// Adjust typing burst detection using calibration:
const typingBaseline = calibration?.typing;
const burstThreshold = typingBaseline?.burstThreshold ?? DEFAULT_BURST_THRESHOLD;
```

---

## ──────────────────────────────────────────────────────────
## Feature 4: Human-in-the-Loop Appeals (User Ethics)
## ──────────────────────────────────────────────────────────

### 🎯 Goal
When a high/critical alert is triggered, give candidates a small text box to provide context ("I sneezed," "My cat jumped on my desk"). The recruiter sees the AI's view and the candidate's explanation side-by-side.

### 📐 Architecture

```
┌───────────────────────────────────────────────────────┐
│  Candidate Page (on high/critical alert)              │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  ⚠️ We noticed a change in your environment.    │  │
│  │  Any context? (optional)                        │  │
│  │                                                 │  │
│  │  ┌─────────────────────────────────────┐        │  │
│  │  │ My roommate walked behind me       │        │  │
│  │  └─────────────────────────────────────┘        │  │
│  │                                                 │  │
│  │  [Dismiss]  [Submit Context]                    │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  → Emit 'candidate_appeal' via Socket.IO              │
└──────────────────────┬────────────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────────────┐
│  Server                                               │
│  → Store appeal in Appeals MongoDB collection         │
│  → Relay to recruiter via 'candidate_appeal' event    │
└──────────────────────┬────────────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────────────┐
│  Recruiter Dashboard — Cheat Alert Card               │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  🚨 MULTIPLE FACES         CRITICAL             │  │
│  │  Multiple faces detected in frame               │  │
│  │  3:42:15 PM                                     │  │
│  │                                                 │  │
│  │  💬 Candidate says:                              │  │
│  │  "My roommate walked behind me"                 │  │
│  │  ──────────────────────────────────────────────  │  │
│  │  [Accept Explanation] [Dismiss] [Escalate]      │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

### 📝 Implementation Steps

#### Step 4.1 — Define Appeal interfaces
**File:** `shared/types/index.ts`
```typescript
export interface CandidateAppeal {
    id: string;
    session_id: string;
    alert_id: string;              // Links to CheatAlert.id
    event_type: EventType;
    candidate_message: string;
    timestamp: string;
    recruiter_action?: 'accepted' | 'dismissed' | 'escalated';
}

// Add socket events:
// ClientToServerEvents:
candidate_appeal: (data: {
    session_id: string;
    alert_id: string;
    event_type: EventType;
    message: string;
}) => void;

// ServerToClientEvents:
candidate_appeal: (data: CandidateAppeal) => void;
appeal_response: (data: { alert_id: string; action: string }) => void;
```

#### Step 4.2 — Create MongoDB model (optional, can use in-memory)
**File:** `server/src/models/Appeal.ts` (NEW)
```typescript
// If using MongoDB:
const AppealSchema = new Schema({
    session_id: String,
    alert_id: String,
    event_type: String,
    candidate_message: String,
    timestamp: Date,
    recruiter_action: { type: String, enum: ['accepted', 'dismissed', 'escalated'] },
});
```

#### Step 4.3 — Add socket handlers
**File:** `server/src/websocket/socketHandler.ts`
```typescript
// Handle candidate appeal
socket.on('candidate_appeal', (data) => {
    const appeal: CandidateAppeal = {
        id: uuidv4(),
        session_id: data.session_id,
        alert_id: data.alert_id,
        event_type: data.event_type,
        candidate_message: data.message,
        timestamp: new Date().toISOString(),
    };
    // Store appeal (in-memory or MongoDB)
    // Relay to recruiter
    io.to(`recruiter_${meetingId}`).emit('candidate_appeal', appeal);
});

// Handle recruiter response to appeal
socket.on('appeal_response', (data) => {
    // Update appeal record
    // Optionally adjust score if accepted (partial restore)
    io.to(`session_${data.session_id}`).emit('appeal_response', data);
});
```

#### Step 4.4 — Add Appeal UI to candidate page
**File:** `client/app/candidate/[id]/page.tsx`
- Show a non-intrusive toast/banner when a high/critical alert triggers
- Contains a small textarea (max 200 chars) + "Submit Context" button
- Auto-dismiss after 30 seconds
- Only show for certain event types: `multiple_faces_detected`, `face_not_detected`, `vm_detected`, `face_mismatch`, `suspicious_emotion`

#### Step 4.5 — Add Appeal display in recruiter alert cards
**File:** `client/app/recruiter/[id]/page.tsx`
- Inside each cheat alert card, add a "💬 Candidate says:" section
- Show action buttons: Accept / Dismiss / Escalate
- If "Accept," partially restore score (+50% of penalty)

#### Step 4.6 — Add to report page
**File:** `client/app/report/[id]/page.tsx`
- Show appeals in the final report alongside their corresponding alerts

---

## ──────────────────────────────────────────────────────────
## Feature 5: Recruiter Confidence Score (Data Visualization)
## ──────────────────────────────────────────────────────────

### 🎯 Goal
Add a "Confidence Score" alongside the existing "Authenticity Score." While authenticity measures whether cheating occurred, **confidence** measures how reliable the detection data itself is.

### 📐 Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Confidence Scoring Logic                                      │
│                                                                │
│  100% Confidence Events (Hard Facts):                          │
│  ├─ tab_switch           (browser API — definitive)            │
│  ├─ fullscreen_exit      (browser API — definitive)            │
│  ├─ vm_detected          (WebGL API — definitive)              │
│  ├─ devtools_open        (browser API — definitive)            │
│  ├─ code_paste           (clipboard API — definitive)          │
│  └─ keyboard_shortcut    (keyboard API — definitive)           │
│                                                                │
│  60% Confidence Events (AI Inferences):                        │
│  ├─ suspicious_emotion   (face-api.js — probabilistic)         │
│  ├─ multiple_faces       (face-api.js — could be photo)        │
│  ├─ gaze_away            (face-api.js — natural movement)      │
│  ├─ face_not_detected    (lighting issues possible)            │
│  ├─ ai_pattern_detected  (heuristic — could be false positive) │
│  └─ face_mismatch        (descriptor distance — threshold)     │
│                                                                │
│  40% Confidence Events (Behavioral Heuristics):                │
│  ├─ word_burst           (could be fast typer)                 │
│  ├─ rapid_solution       (could be experienced dev)            │
│  ├─ window_blur          (could be accidental)                 │
│  └─ typing_fast          (could be natural skill)              │
│                                                                │
│  Confidence = weighted_avg(event_confidence * event_count)     │
└────────────────────────────────────────────────────────────────┘
```

### 📝 Implementation Steps

#### Step 5.1 — Add confidence engine
**File:** `server/src/scoring/authenticityEngine.ts`
```typescript
// Add confidence tiers to EVENT_WEIGHTS:
interface EventWeight {
    weight: number;
    description: string;
    confidence: 100 | 60 | 40;  // NEW: how reliable is this detection
}

// Add class method:
calculateConfidence(events: EventLog[]): number {
    // Returns 0-100 confidence score
    // Higher when events are mostly hard-facts
    // Lower when events are mostly AI-inferred
}
```

#### Step 5.2 — Emit confidence with score updates
**File:** `shared/types/index.ts`
```typescript
export interface ScoreUpdate {
    authenticity_score: number;
    suspicion_delta: number;
    total_events: number;
    confidence_score: number;     // NEW
    confidence_breakdown: {       // NEW
        hard_facts: number;
        ai_inferences: number;
        heuristics: number;
    };
}
```

#### Step 5.3 — Add Gauge Chart to recruiter dashboard
**File:** `client/app/recruiter/[id]/page.tsx`

Install: `react-gauge-chart` or use a custom SVG gauge (like our existing ring score).

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   ┌──────────┐          ┌──────────┐               │
│   │    87    │          │    73    │               │
│   │ Integrity │          │   Trust  │               │
│   │  Score   │          │  Index   │               │
│   └──────────┘          └──────────┘               │
│                                                     │
│   Legend:                                           │
│   ● 3 Hard Facts (100% conf)                       │
│   ● 2 AI Inferences (60% conf)                     │
│   ● 1 Heuristic (40% conf)                         │
└─────────────────────────────────────────────────────┘
```

#### Step 5.4 — Add to report page
**File:** `client/app/report/[id]/page.tsx`
- Display both scores in the final report
- Show confidence breakdown pie chart

---

## 🔧 Implementation Order (Recommended)

```
Phase 1 — Quick Security Wins (Day 1-2)
├── Feature 1: VM Detection          ← ~4 hrs, standalone
└── Feature 2: Network Stability     ← ~3 hrs, standalone

Phase 2 — AI Fairness (Day 3-4)
├── Feature 3: Pre-Interview Calibration  ← ~6 hrs, modifies join flow
└── Feature 5: Confidence Score           ← ~3 hrs, modifies scoring engine

Phase 3 — Ethics & Trust (Day 5)
└── Feature 4: Human-in-the-Loop Appeals  ← ~5 hrs, touches many files
```

---

## 📂 Full File Change Matrix

| File | F1 | F2 | F3 | F4 | F5 |
|------|:--:|:--:|:--:|:--:|:--:|
| **shared/types/index.ts** | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ |
| **client/types/index.ts** | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ |
| **client/hooks/useVMDetection.ts** | 🆕 | — | — | — | — |
| **client/hooks/useNetworkHealth.ts** | — | 🆕 | — | — | — |
| **client/hooks/useFaceDetection.ts** | — | — | ✏️ | — | — |
| **client/hooks/useMonitoring.ts** | — | — | ✏️ | — | — |
| **client/app/join/[[...id]]/page.tsx** | — | — | ✏️ | — | — |
| **client/app/candidate/[id]/page.tsx** | ✏️ | ✏️ | — | ✏️ | — |
| **client/app/recruiter/[id]/page.tsx** | ✏️ | ✏️ | — | ✏️ | ✏️ |
| **client/app/report/[id]/page.tsx** | — | — | — | ✏️ | ✏️ |
| **server/src/scoring/authenticityEngine.ts** | ✏️ | — | — | ✏️ | ✏️ |
| **server/src/websocket/socketHandler.ts** | ✏️ | ✏️ | — | ✏️ | ✏️ |
| **server/src/models/Appeal.ts** | — | — | — | 🆕 | — |

**Legend:** 🆕 = New file, ✏️ = Modified, — = Untouched

---

## ⚠️ Dependencies & Prerequisites

1. **No new npm packages required** for Features 1, 2, 3, 4
2. **Feature 5** may optionally use `react-gauge-chart` or can reuse existing SVG ring component
3. **Feature 4** optionally uses MongoDB — can start with in-memory storage
4. **All features** are backward-compatible — no breaking changes to existing flow

---

## 🧪 Testing Checklist

- [ ] **F1:** Test in VirtualBox, VMware, and native — verify detection accuracy
- [ ] **F2:** Simulate high latency with Chrome DevTools throttling
- [ ] **F3:** Complete calibration flow end-to-end, verify baselines stored
- [ ] **F4:** Trigger alert → submit appeal → verify recruiter sees it
- [ ] **F5:** Compare confidence score with different event mixes
- [ ] **All:** Verify no TypeScript compilation errors
- [ ] **All:** Verify no regressions in existing features
