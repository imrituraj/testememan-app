/**
 * TestMeMan Secure Exam: preload bridge. The only API the renderer has.
 */

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => {
  const handler = (_e, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('tmm', {
  api: {
    verify: (code) => ipcRenderer.invoke('api:verify', code),
    start: (code) => ipcRenderer.invoke('api:start', code),
    identity: (payload) => ipcRenderer.invoke('api:identity', payload),
    saveAnswers: (answers) => ipcRenderer.invoke('api:answers', answers),
    events: (events, warnings) => ipcRenderer.invoke('api:events', events, warnings),
    snapshot: (payload) => ipcRenderer.invoke('api:snapshot', payload),
    submit: (answers, reason) => ipcRenderer.invoke('api:submit', answers, reason),
  },
  sys: {
    info: () => ipcRenderer.invoke('sys:info'),
    preflight: () => ipcRenderer.invoke('sys:preflight'),
    closeApps: () => ipcRenderer.invoke('sys:close-apps'),
    openPrivacySettings: () => ipcRenderer.invoke('sys:open-privacy-settings'),
  },
  exam: {
    lock: () => ipcRenderer.invoke('exam:lock'),
    unlock: () => ipcRenderer.invoke('exam:unlock'),
  },
  app: {
    quit: () => ipcRenderer.invoke('app:quit'),
    openHelp: () => ipcRenderer.invoke('app:open-help'),
  },
  onProctorEvent: on('proctor:event'),
  onCloseRequested: on('app:close-requested'),
});
