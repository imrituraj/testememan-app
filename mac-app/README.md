# TestMeMan Secure Assessment Client — macOS MVP

A reliable, production-minded desktop assessment client for macOS designed for company Online Assessments (OA) including **TCS NQT, Infosys SP/DSE, Cognizant GenC, Accenture ASE, and Wipro Elite NLTH**, integrated with the TestMeMan platform.

---

## ⚡ Architecture & Workflow

The client implements an end-to-end 7-stage candidate assessment lifecycle:

1. **Launch & Authentication**:
   - The candidate enters their Assessment Access Code (e.g., `TCS-NQT-2026`) and candidate identifiers.
   - Validates eligibility and exam availability server-side against the TestMeMan backend (`GET /api/oa/verify/:code`).
   - Supports an explicitly labeled, visually distinct **Development Mock Adapter** for offline testing.

2. **Pre-Flight Readiness Checklist**:
   - Explicit verification cards with actionable remediation:
     - **macOS Compatibility**: Verifies macOS version and architecture.
     - **Display Integrity**: Enforces single-display policy (detects HDMI, Sidecar, AirPlay).
     - **Process Compliance**: Identifies active unauthorized apps with candidate-approved graceful termination.
     - **FaceTime HD Camera & Mic**: Verifies media hardware permissions.
     - **Network Reachability & Clock Sync**: Measures latency and clock synchronization with the server.

3. **Exam Instructions & Start Declaration**:
   - Displays duration, sections count, question count, and marking scheme.
   - Requires candidate confirmation before locking into fullscreen.

4. **Controlled Assessment Environment (CBT Engine)**:
   - Fullscreen assessment window (`kiosk: true`, `alwaysOnTop: 'screen-saver'`).
   - Best-effort shortcut guard (intercepts `Cmd+Q`, `Cmd+W`, `Cmd+R`, `Cmd+M`, `Cmd+H`, DevTools).
   - Real-time window focus/blur tracking logged to structured audit logs.
   - Single-choice and multiple-choice questions with sectional navigation.
   - Live synchronization status pill with periodic answer heartbeat.
   - Picture-in-Picture proctor camera feed with ambient audio volume meter.

5. **Submission Confirmation & Summary**:
   - Modal summarizing answered, unattempted, and marked questions.
   - Idempotent submission handshake with server progress feedback.

6. **Validated Result & Integrity Receipt**:
   - Generates official receipt card (`OA-RCPT-...`) with server-verified attempt metadata.
   - Fact-based integrity summary (window blurs, process events) without defamatory accusations.
   - Clean hardware release (camera, audio context, kiosk lock).

7. **Session Recovery**:
   - In-progress attempts are persisted to encrypted/structured storage.
   - Recoverable from accidental window reloads or transient crashes without destroying candidate work.

---

## 🚀 How to Run

### Prerequisites
- macOS 11 (Big Sur) or newer (macOS 12+ recommended, Intel or Apple Silicon).
- Node.js v18+ (tested on Node v24).

### 1-Click Launch
Double-click [`Launch-Assessment.command`](file:///Users/rituraj/Developer/testmeman/testmeman-application/mac-app/Launch-Assessment.command) directly in Finder. It will launch the prebuilt application bundle if present, or automatically fall back to the development runtime.

### Launch via Terminal (Development Mode)
```bash
cd testmeman-application/mac-app
npm start
# Or with developer tools enabled:
npm run dev
```

### Running Automated Tests
The application includes a comprehensive test suite covering the CBT engine, state machine, answer recovery, backend service, process compliance, and integrity logging:
```bash
cd testmeman-application/mac-app
npm test
```

---

## ⚙️ Environment Variables & Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TESTMEMAN_API_URL` | `http://localhost:8787` (dev) / `https://api.test.helpmeman.com` (prod) | Base URL for the TestMeMan assessment API. |
| `TESTMEMAN_ENV` | `development` | Set to `production` for strict mode (disables mock adapters). |
| `MOCK_MODE` | `false` | Set to `true` to force the offline Development Mock Adapter. |

---

## 🔌 Backend API Integration Contracts

The client communicates with the TestMeMan backend through the following endpoints:

1. `GET /api/oa/verify/:code`
   - Validates code, candidate eligibility, and loads assessment metadata.
   - Returns: `{ ok: true, valid: true, assessment: { code, title, company, durationMinutes, sections } }`.

2. `POST /api/oa/log-integrity`
   - Records structured integrity events (`WINDOW_BLUR`, `DISPLAY_CHANGE`, `PROCESS_DETECTED`, `ANSWER_HEARTBEAT`).
   - Returns: `{ ok: true, recordedAt: string }`.

3. `POST /api/oa/submit`
   - Submits candidate answers, time taken, and integrity summaries.
   - Returns authoritative receipt ID: `{ ok: true, receiptId: "OA-RCPT-XXXX", receivedAt: string }`.

---

## 🔒 Electron Security Hardening

- `contextIsolation: true` and `nodeIntegration: false` enforced.
- Restrictive preload script exposing only validated IPC methods via `contextBridge`.
- `will-navigate` blocks unexpected external origin navigation within the exam window.
- `setWindowOpenHandler` denies arbitrary popup windows; external links open via system default browser.
- No arbitrary filesystem or child process execution exposed to renderer JavaScript.

---

## ⚠️ Known Boundaries & macOS System Limitations

- **System Shortcuts**: macOS reserves certain privileged system shortcuts (such as `Cmd+Opt+Esc` Force Quit and `Cmd+Space` Spotlight in certain configurations) at the operating system level. The client uses best-effort event interception and logs any attempts factually.
- **Process Compliance**: The client avoids unprompted aggressive process termination, providing candidates with a clear pre-flight audit and remediation choices before entering the locked test environment.
- **Server-Side Grading**: For corporate hiring tests, server-side grading remains authoritative. The client computes local progress indicators while deferring official certification to the TestMeMan cloud engine.
