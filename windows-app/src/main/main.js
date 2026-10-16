/**
 * TestMeMan Windows Assessment App - Main Process
 * Orchestrates Window Kiosk, Assessment Service, Process Compliance, Display Integrity,
 * Shortcut Interception, and Fact-Based Integrity Logging.
 */

const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');
const os = require('os');
const { ProcessManager } = require('./processManager');
const { DisplayManager } = require('./displayManager');
const { ShortcutBlocker } = require('./shortcutBlocker');
const { IntegrityLogger } = require('./integrityLogger');
const { AssessmentService } = require('./assessmentService');

let mainWindow = null;
let processManager = null;
let displayManager = null;
let shortcutBlocker = null;
let integrityLogger = null;
let assessmentService = null;

let isExamInProgress = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    frame: true,
    backgroundColor: '#07090e',
    icon: path.join(__dirname, '../renderer/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: process.argv.includes('--dev'),
    },
  });

  processManager = new ProcessManager();
  displayManager = new DisplayManager();
  shortcutBlocker = new ShortcutBlocker(mainWindow);
  integrityLogger = new IntegrityLogger();
  assessmentService = new AssessmentService();

  // Approve media access for local renderer file
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'videoCapture' || permission === 'audioCapture') {
      return callback(true);
    }
    callback(false);
  });

  // Electron Security: Restrict navigation to local files only
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('file://')) {
      event.preventDefault();
      console.warn('[Security] Blocked external navigation in main window:', navigationUrl);
    }
  });

  // Electron Security: Open unexpected external links via system default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Window Focus/Blur tracking during active test
  mainWindow.on('blur', () => {
    if (isExamInProgress && integrityLogger) {
      const evt = integrityLogger.logEvent('WINDOW_BLUR', 'WARNING', {
        detail: 'Candidate window lost active focus',
      });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('integrity:event-recorded', evt);
      }
    }
  });

  mainWindow.on('focus', () => {
    if (isExamInProgress && integrityLogger) {
      const evt = integrityLogger.logEvent('WINDOW_FOCUS', 'INFO', {
        detail: 'Candidate window returned to focus',
      });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('integrity:event-recorded', evt);
      }
    }
  });

  // Watch for secondary screens connected during exam
  displayManager.watchDisplayChanges((violation) => {
    if (isExamInProgress && integrityLogger) {
      integrityLogger.logEvent('DISPLAY_CHANGE', 'WARNING', violation);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('integrity:display-violation', violation);
    }
  });

  // Prevent accidental close during exam
  mainWindow.on('close', (e) => {
    if (isExamInProgress) {
      e.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:prompt-confirm-exit');
      }
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    if (shortcutBlocker) shortcutBlocker.disableLockdown();
    if (processManager) processManager.stopWatchdog();
    if (displayManager) displayManager.stopWatching();
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==========================================
// IPC Handlers: Pre-flight & System
// ==========================================

ipcMain.handle('lockdown:preflight-checks', async () => {
  const isWindows = process.platform === 'win32';
  const osRelease = os.release();

  const displayCheck = displayManager ? displayManager.checkDisplayIntegrity() : { status: 'PASSED', displayCount: 1 };
  const processCheck = processManager ? await processManager.checkProcessCompliance() : { status: 'PASSED', activeCount: 0 };
  const networkPing = assessmentService ? await assessmentService.pingBackend() : { reachable: true, isMock: true };

  return {
    os: {
      status: 'PASSED',
      platform: process.platform,
      release: osRelease,
      arch: os.arch(),
      remediation: isWindows ? 'Windows environment verified.' : `${os.type()} environment active (Development Mode).`,
    },
    media: {
      status: 'PASSED',
      remediation: 'Webcam and microphone interfaces ready.',
    },
    displays: displayCheck,
    processes: processCheck,
    network: {
      status: networkPing.reachable ? 'PASSED' : (networkPing.isMock ? 'WARNING' : 'FAILED'),
      reachable: networkPing.reachable,
      isMock: networkPing.isMock,
      latencyMs: networkPing.latencyMs,
      timeDeltaMs: networkPing.timeDeltaMs,
      remediation: networkPing.reachable
        ? (networkPing.isMock ? 'Connected to Development Mock Adapter (Offline/Dev mode).' : 'Connected to live TestMeMan assessment service.')
        : (networkPing.suggestion || 'Please check your internet connection or firewall.'),
    },
  };
});

ipcMain.handle('lockdown:scan-processes', async () => {
  if (!processManager) return [];
  return await processManager.scanForbiddenProcesses();
});

ipcMain.handle('lockdown:terminate-processes', async () => {
  if (!processManager) return { success: true, closedCount: 0, closedApps: [] };
  return await processManager.terminateAllForbiddenApps();
});

ipcMain.handle('lockdown:check-displays', async () => {
  if (!displayManager) return { isSingleDisplay: true, displayCount: 1 };
  return displayManager.checkDisplayIntegrity();
});

// ==========================================
// IPC Handlers: Controlled Environment
// ==========================================

ipcMain.handle('lockdown:enter-kiosk', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false };

  try {
    isExamInProgress = true;

    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setKiosk(true);

    if (shortcutBlocker) {
      shortcutBlocker.enableLockdown((sc) => {
        if (integrityLogger) {
          integrityLogger.logEvent('SHORTCUT_ATTEMPTED', 'INFO', { shortcut: sc });
        }
      });
    }

    if (processManager) {
      processManager.startWatchdog((violation) => {
        if (integrityLogger) {
          integrityLogger.logEvent('PROCESS_DETECTED', 'VIOLATION', violation);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('integrity:process-violation', violation);
        }
      });
    }

    return { success: true };
  } catch (err) {
    console.error('[Kiosk Mode Error]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('lockdown:exit-kiosk', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false };

  try {
    isExamInProgress = false;

    if (shortcutBlocker) shortcutBlocker.disableLockdown();
    if (processManager) processManager.stopWatchdog();

    mainWindow.setAlwaysOnTop(false);
    mainWindow.setKiosk(false);

    return { success: true };
  } catch (err) {
    console.error('[Exit Kiosk Error]:', err);
    return { success: false, error: err.message };
  }
});

// ==========================================
// IPC Handlers: Assessment Service Integration
// ==========================================

ipcMain.handle('assessment:verify', async (event, payload) => {
  if (!assessmentService) assessmentService = new AssessmentService();
  return await assessmentService.validateAssessment(payload || {});
});

ipcMain.handle('assessment:start-attempt', async (event, payload) => {
  if (!assessmentService) assessmentService = new AssessmentService();
  const attempt = await assessmentService.startAttempt(payload || {});
  if (integrityLogger) {
    integrityLogger.setAttemptId(attempt.attemptId);
    integrityLogger.logEvent('ATTEMPT_INITIALIZED', 'INFO', {
      attemptId: attempt.attemptId,
      code: attempt.code,
      candidate: attempt.candidate,
    });
  }
  return attempt;
});

ipcMain.handle('assessment:save-answers', async (event, payload) => {
  if (!assessmentService) return { success: true };
  return await assessmentService.saveAnswers(payload || {});
});

ipcMain.handle('assessment:submit-attempt', async (event, payload) => {
  if (!assessmentService) return { success: false, error: 'Service unavailable' };

  isExamInProgress = false;
  if (shortcutBlocker) shortcutBlocker.disableLockdown();
  if (processManager) processManager.stopWatchdog();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setKiosk(false);
  }

  const integritySummary = integrityLogger ? integrityLogger.getSummary() : { totalEvents: 0, violations: 0, warnings: 0 };

  const submitPayload = {
    ...payload,
    integritySummary,
  };

  if (integrityLogger) {
    integrityLogger.logEvent('ATTEMPT_SUBMITTED', 'INFO', {
      submitReason: payload.submitReason || 'NORMAL_SUBMISSION',
      answersCount: Object.keys(payload.answers || {}).length,
    });
  }

  const result = await assessmentService.submitAttempt(submitPayload);
  return {
    ...result,
    integritySummary,
  };
});

ipcMain.handle('assessment:get-integrity-summary', async () => {
  if (!integrityLogger) return { totalEvents: 0, violations: 0, warnings: 0 };
  return integrityLogger.getSummary();
});

ipcMain.handle('assessment:log-custom-event', async (event, { type, severity, metadata }) => {
  if (!integrityLogger) return null;
  return integrityLogger.logEvent(type, severity, metadata);
});

ipcMain.handle('app:get-system-info', async () => {
  return {
    platform: process.platform,
    release: os.release(),
    arch: os.arch(),
    hostname: os.hostname(),
    totalMemoryGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
    cpus: os.cpus().length,
  };
});

ipcMain.handle('app:quit', () => {
  isExamInProgress = false;
  if (shortcutBlocker) shortcutBlocker.disableLockdown();
  if (processManager) processManager.stopWatchdog();
  if (displayManager) displayManager.stopWatching();
  app.quit();
});
