/**
 * TestMeMan Secure Exam: main process (Windows + macOS).
 *
 * Owns everything the renderer must not: the network (api.js), the lockdown (kiosk, shortcuts, prohibited
 * apps, displays, clipboard, screen capture) and OS checks. The renderer runs the UI and the on-device
 * face AI (renderer/js/proctor.js) and talks to this file only through preload.js.
 */

const { app, BrowserWindow, ipcMain, session, systemPreferences, shell, clipboard, powerSaveBlocker, screen, protocol, net } = require('electron');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const { ExamApi } = require('./api');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const platformModule = (name) => require(`./platform/${name}.${IS_MAC ? 'mac' : 'win'}.js`);
const { ProcessManager } = platformModule('processManager');
const { DisplayManager } = platformModule('displayManager');
const { ShortcutBlocker } = platformModule('shortcutBlocker');

/** Dev runs (`npm run dev`, unpackaged) never quit other apps: it would close the developer's own tools */
const IS_DEV = !app.isPackaged || process.argv.includes('--dev');

/*
 * The UI and the face-AI models are served from app://exam/… rather than file://: model files are fetched
 * (file:// fetch is blocked in renderers) and the camera needs a secure context.
 *   app://exam/<path>                 → src/renderer/<path>
 *   app://exam/vendor/human/models/…  → face-AI models (bundled as extraResources when packaged)
 *   app://exam/vendor/human/…         → @vladmandic/human dist
 */
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);
const RENDERER_DIR = path.join(__dirname, '../renderer');
const HUMAN_DIR = path.join(__dirname, '../../node_modules/@vladmandic/human');
const MODELS_DIR = app.isPackaged ? path.join(process.resourcesPath, 'models') : path.join(HUMAN_DIR, 'models');

function resolveAppUrl(url) {
  const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
  let base = RENDERER_DIR;
  let sub = rel;
  if (rel.startsWith('vendor/human/models/')) {
    base = MODELS_DIR;
    sub = rel.slice('vendor/human/models/'.length);
  } else if (rel.startsWith('vendor/human/')) {
    base = path.join(HUMAN_DIR, 'dist');
    sub = rel.slice('vendor/human/'.length);
  }
  const full = path.normalize(path.join(base, sub));
  return full.startsWith(base) ? full : null;
}

let win = null;
let processManager = null;
let displayManager = null;
let shortcutBlocker = null;
let locked = false;
let clipboardTimer = null;
let sleepBlockId = null;
const api = new ExamApi({ appVersion: app.getVersion() });

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function proctorEvent(type, detail) {
  send('proctor:event', { type, detail, at: new Date().toISOString() });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: 'TestMeMan Secure Exam',
    backgroundColor: '#f6f7f9',
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true }),
    icon: path.join(RENDERER_DIR, 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: IS_DEV,
      spellcheck: false,
    },
  });

  // Screen recorders, screenshots and screen sharing see a black window (macOS + Windows 10 2004+)
  win.setContentProtection(!process.env.TESTMEMAN_SMOKE);

  processManager = new ProcessManager();
  displayManager = new DisplayManager();
  shortcutBlocker = new ShortcutBlocker(win);

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://exam/')) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Only TestMeMan pages may open, and never during the exam
    if (!locked && /^https:\/\/([a-z]+\.)?testmeman\.in\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (!IS_DEV) win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());

  win.on('blur', () => {
    if (!locked) return;
    proctorEvent('FOCUS_LOST', 'The exam window lost focus');
    // Pull focus back: kiosk + always-on-top make this rare, but some OS dialogs can still steal it
    setTimeout(() => win && !win.isDestroyed() && locked && win.focus(), 150);
  });
  win.on('leave-full-screen', () => {
    if (!locked) return;
    proctorEvent('FULLSCREEN_EXIT', 'Left full screen');
    win.setKiosk(true);
  });

  displayManager.watchDisplayChanges(() => {
    if (locked) proctorEvent('DISPLAY_CHANGE', `${screen.getAllDisplays().length} displays connected`);
  });

  win.on('close', (e) => {
    if (locked) {
      e.preventDefault();
      send('app:close-requested');
    }
  });

  // A crashed or frozen renderer must never leave the candidate stuck in kiosk mode (force quit is disabled there):
  // release the lockdown and reload. Answers are backed up in localStorage and the server resumes the session.
  const recover = (why) => {
    const wasLocked = locked;
    unlock();
    if (win && !win.isDestroyed()) win.loadURL(`app://exam/index.html${wasLocked ? `?recovered=${encodeURIComponent(why)}` : ''}`);
  };
  let hangTimer = null;
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') recover(details.reason);
  });
  win.on('unresponsive', () => {
    clearTimeout(hangTimer);
    hangTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      // Fires render-process-gone, which recovers
      win.webContents.forcefullyCrashRenderer();
    }, 10000);
  });
  win.on('responsive', () => clearTimeout(hangTimer));

  win.loadURL('app://exam/index.html');
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  win.on('closed', () => {
    unlock();
    displayManager?.stopWatching();
    win = null;
  });
}

app.whenReady().then(async () => {
  protocol.handle('app', (req) => {
    const file = resolveAppUrl(req.url);
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  if (IS_MAC && systemPreferences.askForMediaAccess) {
    await systemPreferences.askForMediaAccess('camera').catch(() => {});
    await systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', (e) => {
  if (locked) e.preventDefault();
});

/* ───────────── Lockdown ───────────── */

function lock() {
  if (!win || locked) return;
  locked = true;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setKiosk(true);
  win.focus();
  if (IS_MAC) app.dock?.hide();
  shortcutBlocker.enableLockdown((sc) => proctorEvent('SHORTCUT_BLOCKED', String(sc)));
  startAppWatchdog();
  clipboard.clear();
  clipboardTimer = setInterval(() => clipboard.clear(), 2000);
  sleepBlockId = powerSaveBlocker.start('prevent-display-sleep');
}

function unlock() {
  if (!locked) return;
  locked = false;
  shortcutBlocker?.disableLockdown();
  processManager?.stopWatchdog();
  clearInterval(clipboardTimer);
  clipboardTimer = null;
  if (sleepBlockId !== null && powerSaveBlocker.isStarted(sleepBlockId)) powerSaveBlocker.stop(sleepBlockId);
  sleepBlockId = null;
  if (win && !win.isDestroyed()) {
    win.setKiosk(false);
    win.setAlwaysOnTop(false);
    win.setVisibleOnAllWorkspaces(false);
  }
  if (IS_MAC) app.dock?.show();
}

/** Prohibited-app watchdog. In dev it only reports, so it never quits the developer's own tools. */
function startAppWatchdog() {
  if (IS_DEV) {
    processManager.watchdogInterval = setInterval(async () => {
      const running = await processManager.scanForbiddenProcesses().catch(() => []);
      if (running.length) proctorEvent('PROHIBITED_APP', `${running.map((r) => r.name).join(', ')} (dev: not closed)`);
    }, 15000);
    return;
  }
  processManager.startWatchdog((v) => proctorEvent('PROHIBITED_APP', (v.appsDetected || []).join(', ')));
}

/* ───────────── Environment checks ───────────── */

function run(cmd, args, timeout = 4000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout || '')));
  });
}

async function detectVirtualMachine() {
  try {
    if (IS_MAC) {
      const [vmm, model] = await Promise.all([run('sysctl', ['-n', 'kern.hv_vmm_present']), run('sysctl', ['-n', 'hw.model'])]);
      if (vmm.trim() === '1') return 'macOS is running inside a virtual machine';
      if (/vmware|virtualbox|parallels/i.test(model)) return model.trim();
      return null;
    }
    if (IS_WIN) {
      if (/^RDP-/i.test(process.env.SESSIONNAME || '')) return 'Remote Desktop session';
      const out = await run('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model | ConvertTo-Json -Compress)']);
      if (/vmware|virtualbox|virtual machine|qemu|kvm|xen|parallels/i.test(out)) return out.replace(/[{}"]/g, ' ').trim();
      return null;
    }
  } catch {}
  return null;
}

function deviceInfo() {
  return {
    platform: process.platform,
    osVersion: `${os.type()} ${os.release()}`,
    appVersion: app.getVersion(),
    displays: screen.getAllDisplays().length,
  };
}

/* ───────────── IPC ───────────── */

/** Every API call resolves to { ok, data } or { ok: false, error, status, code }: the renderer never sees a throw */
const apiCall = (fn) => async (_e, ...args) => {
  try {
    return { ok: true, data: await fn(...args) };
  } catch (err) {
    return { ok: false, error: err.message, status: err.status || 0, code: err.body?.code || null, body: err.body || {} };
  }
};

ipcMain.handle('api:verify', apiCall((code) => api.verify(code)));
ipcMain.handle('api:start', apiCall((code) => api.start(code, deviceInfo())));
ipcMain.handle('api:identity', apiCall((p) => api.identity(p)));
ipcMain.handle('api:answers', apiCall((answers) => api.saveAnswers(answers)));
ipcMain.handle('api:events', apiCall((events, warnings) => api.events(events, warnings)));
ipcMain.handle('api:snapshot', apiCall((p) => api.snapshot(p)));
ipcMain.handle('api:submit', apiCall((answers, reason) => api.submit(answers, reason)));

ipcMain.handle('sys:info', () => ({ ...deviceInfo(), isDev: IS_DEV, apiBase: api.baseUrl, arch: os.arch() }));

ipcMain.handle('sys:preflight', async () => {
  const [network, vm, apps] = await Promise.all([
    api.ping().then((p) => ({ ok: true, latencyMs: p.latencyMs })).catch((e) => ({ ok: false, error: e.message })),
    detectVirtualMachine(),
    processManager ? processManager.scanForbiddenProcesses().catch(() => []) : [],
  ]);
  let camera = 'granted';
  let microphone = 'granted';
  if (IS_MAC && systemPreferences.getMediaAccessStatus) {
    camera = systemPreferences.getMediaAccessStatus('camera');
    microphone = systemPreferences.getMediaAccessStatus('microphone');
  }
  return {
    network,
    displays: { count: screen.getAllDisplays().length },
    vm: { detected: !!vm, detail: vm },
    apps: apps.map((a) => ({ name: a.name, category: a.category })),
    permissions: { camera, microphone },
    isDev: IS_DEV,
  };
});

ipcMain.handle('sys:close-apps', async () => {
  if (IS_DEV) return { closed: [], dev: true };
  const res = await processManager.terminateAllForbiddenApps().catch(() => ({ closedApps: [] }));
  return { closed: res.closedApps || [] };
});

ipcMain.handle('sys:open-privacy-settings', () => {
  if (IS_MAC) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera');
  else if (IS_WIN) shell.openExternal('ms-settings:privacy-webcam');
});

ipcMain.handle('exam:lock', () => {
  lock();
  return { locked };
});
ipcMain.handle('exam:unlock', () => {
  unlock();
  return { locked };
});

ipcMain.handle('app:quit', () => {
  if (locked) return false;
  app.quit();
  return true;
});

ipcMain.handle('app:open-help', () => shell.openExternal('https://campus.testmeman.in/oa'));

/* Dev-only smoke test: TESTMEMAN_SMOKE=<png path> npm start → screenshot, AI engine check, quit */
if (!app.isPackaged && process.env.TESTMEMAN_SMOKE) {
  app.whenReady().then(() => {
    setTimeout(async () => {
      const fs = require('fs');
      try {
        win.show();
        win.focus();
        await new Promise((r) => setTimeout(r, 1500));
        const img = await win.webContents.capturePage();
        console.log('[smoke] capture', img.isEmpty() ? 'empty' : JSON.stringify(img.getSize()));
        fs.writeFileSync(process.env.TESTMEMAN_SMOKE, img.toPNG());
        console.log('[smoke] dom', await win.webContents.executeJavaScript(`document.querySelector('.screen[data-active]').id + ' | ' + document.querySelector('#net-status').textContent + ' | ' + document.querySelector('#app-version').textContent`));
        const ai = await win.webContents.executeJavaScript(
          `Proctor.init().then(async () => { const r = await Proctor.embeddingFromPhoto('app://exam/assets/brand/mascot.png'); return 'ai-ok ' + JSON.stringify(r.error || ('embedding ' + r.embedding.length)); }).catch(e => 'ai-fail ' + e.message)`
        );
        console.log('[smoke]', ai);
      } catch (err) {
        console.log('[smoke] fail', err.message);
      }
      app.exit(0);
    }, 3500);
  });
}
