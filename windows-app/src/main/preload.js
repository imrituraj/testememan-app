/**
 * TestMeMan Windows Assessment App - Secure Preload Bridge
 * Exposes strictly validated, context-isolated APIs to the renderer process.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lockdownAPI', {
  runPreflightChecks: () => ipcRenderer.invoke('lockdown:preflight-checks'),
  scanProcesses: () => ipcRenderer.invoke('lockdown:scan-processes'),
  terminateProcesses: () => ipcRenderer.invoke('lockdown:terminate-processes'),
  checkDisplays: () => ipcRenderer.invoke('lockdown:check-displays'),

  enterKiosk: () => ipcRenderer.invoke('lockdown:enter-kiosk'),
  exitKiosk: () => ipcRenderer.invoke('lockdown:exit-kiosk'),

  verifyAssessment: (payload) => ipcRenderer.invoke('assessment:verify', payload),
  startAttempt: (payload) => ipcRenderer.invoke('assessment:start-attempt', payload),
  saveAnswers: (payload) => ipcRenderer.invoke('assessment:save-answers', payload),
  submitAttempt: (payload) => ipcRenderer.invoke('assessment:submit-attempt', payload),
  getIntegritySummary: () => ipcRenderer.invoke('assessment:get-integrity-summary'),
  logCustomEvent: (type, severity, metadata) =>
    ipcRenderer.invoke('assessment:log-custom-event', { type, severity, metadata }),

  getSystemInfo: () => ipcRenderer.invoke('app:get-system-info'),
  quitApp: () => ipcRenderer.invoke('app:quit'),

  onProcessViolation: (callback) => {
    const handler = (event, val) => callback(val);
    ipcRenderer.on('integrity:process-violation', handler);
    return () => ipcRenderer.removeListener('integrity:process-violation', handler);
  },

  onDisplayViolation: (callback) => {
    const handler = (event, val) => callback(val);
    ipcRenderer.on('integrity:display-violation', handler);
    return () => ipcRenderer.removeListener('integrity:display-violation', handler);
  },

  onShortcutBlocked: (callback) => {
    const handler = (event, val) => callback(val);
    ipcRenderer.on('integrity:shortcut-blocked', handler);
    return () => ipcRenderer.removeListener('integrity:shortcut-blocked', handler);
  },

  onEventRecorded: (callback) => {
    const handler = (event, val) => callback(val);
    ipcRenderer.on('integrity:event-recorded', handler);
    return () => ipcRenderer.removeListener('integrity:event-recorded', handler);
  },

  onPromptConfirmExit: (callback) => {
    const handler = (event, val) => callback(val);
    ipcRenderer.on('app:prompt-confirm-exit', handler);
    return () => ipcRenderer.removeListener('app:prompt-confirm-exit', handler);
  },
});
