# TestMeMan Secure Assessment Client — Windows MVP

A reliable, production-minded desktop assessment client for Windows laptops and workstations, designed for company Online Assessments (OA) including **TCS NQT, Infosys SP/DSE, Cognizant GenC, Accenture ASE, and Wipro Elite NLTH**, integrated with the TestMeMan platform.

---

## ⚡ Architecture & Workflow

The client implements an end-to-end 7-stage candidate assessment lifecycle:

1. **Launch & Authentication**:
   - The candidate enters their Assessment Access Code (e.g., `TCS-NQT-2026`) and candidate identifiers.
   - Validates eligibility and exam availability server-side against the TestMeMan backend (`GET /api/oa/verify/:code`).
   - Supports an explicitly labeled, visually distinct **Development Mock Adapter** for offline testing.

2. **Pre-Flight Readiness Checklist**:
   - Explicit verification cards with actionable remediation:
     - **Windows Environment**: Verifies OS version and system architecture.
     - **Display Integrity**: Enforces single-display policy (detects external monitors and wireless displays).
     - **Process Compliance**: Identifies active unauthorized apps (`chrome.exe`, `discord.exe`, etc.) with candidate-approved graceful termination.
     - **Webcam & Microphone Feed**: Validates media hardware permissions.
     - **Network Reachability & Clock Sync**: Measures server latency and clock synchronization.

3. **Exam Instructions & Start Declaration**:
   - Displays duration, sections count, question count, and marking scheme.
   - Requires candidate confirmation before locking into fullscreen kiosk mode.

4. **Controlled Assessment Environment (CBT Engine)**:
   - Fullscreen assessment window (`kiosk: true`, `alwaysOnTop: 'screen-saver'`).
   - Best-effort shortcut guard (intercepts `Alt+F4`, `Ctrl+W`, `Ctrl+R`, `F11/F12`, DevTools).
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
   - In-progress attempts are persisted to structured local storage.
   - Recoverable from accidental window reloads or transient crashes without destroying candidate work.

---

## 🚀 How to Run on Windows

### 1-Click Launch
Double-click [`Launch-Assessment.bat`](file:///Users/rituraj/Developer/testmeman/testmeman-application/windows-app/Launch-Assessment.bat) in the root directory.

### Or Open Unpacked Executable
Run:
```cmd
dist\win-unpacked\TestMeMan Secure Assessment.exe
```

### Development Mode
```bash
cd testmeman-application/windows-app
npm start
# Or with developer tools enabled:
npm run dev
```

### Running Automated Tests
```bash
cd testmeman-application/windows-app
npm test
```

---

## 📦 Distribution Packages

- **Standalone Portable Distribution ZIP (Windows x64)**:  
  [`dist/TestMeMan-Assessment-Windows-x64.zip`](file:///Users/rituraj/Developer/testmeman/testmeman-application/windows-app/dist/TestMeMan-Assessment-Windows-x64.zip) *(111 MB)*
- **Unpacked Application Folder**:  
  [`dist/win-unpacked/`](file:///Users/rituraj/Developer/testmeman/testmeman-application/windows-app/dist/win-unpacked/)

---

## ⚙️ Environment Variables & Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TESTMEMAN_API_URL` | `http://localhost:8787` (dev) / `https://api.test.helpmeman.com` (prod) | Base URL for the TestMeMan assessment API. |
| `TESTMEMAN_ENV` | `development` | Set to `production` for strict mode (disables mock adapters). |
| `MOCK_MODE` | `false` | Set to `true` to force the offline Development Mock Adapter. |
