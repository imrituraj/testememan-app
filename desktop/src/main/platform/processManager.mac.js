/**
 * TestMeMan macOS Assessment App - Native Process Compliance Manager
 * Enforces workstation integrity by detecting and managing unauthorized applications.
 * Respects user consent, avoids aggressive unprompted termination, and protects system services.
 */

const { exec } = require('child_process');
const util = require('util');
const path = require('path');

const execAsync = util.promisify(exec);

// Categorized forbidden applications on macOS
const FORBIDDEN_MAC_APPS = [
  // Web Browsers
  { name: 'Google Chrome', proc: 'Google Chrome', category: 'Browsers', bundleId: 'com.google.Chrome' },
  { name: 'Safari', proc: 'Safari', category: 'Browsers', bundleId: 'com.apple.Safari' },
  { name: 'Brave Browser', proc: 'Brave Browser', category: 'Browsers', bundleId: 'com.brave.Browser' },
  { name: 'Arc', proc: 'Arc', category: 'Browsers', bundleId: 'company.thebrowser.Browser' },
  { name: 'Microsoft Edge', proc: 'Microsoft Edge', category: 'Browsers', bundleId: 'com.microsoft.edgemac' },
  { name: 'Firefox', proc: 'firefox', category: 'Browsers', bundleId: 'org.mozilla.firefox' },
  { name: 'Opera', proc: 'Opera', category: 'Browsers', bundleId: 'com.operasoftware.Opera' },
  { name: 'Vivaldi', proc: 'Vivaldi', category: 'Browsers', bundleId: 'com.vivaldi.Vivaldi' },
  { name: 'Tor Browser', proc: 'Tor Browser', category: 'Browsers', bundleId: 'org.torproject.torbrowser' },

  // Communication & Screen Sharing
  { name: 'Discord', proc: 'Discord', category: 'Communication', bundleId: 'com.hnc.Discord' },
  { name: 'Slack', proc: 'Slack', category: 'Communication', bundleId: 'com.tinyspeck.slackmacgap' },
  { name: 'Telegram', proc: 'Telegram', category: 'Communication', bundleId: 'ru.keepcoder.Telegram' },
  { name: 'WhatsApp', proc: 'WhatsApp', category: 'Communication', bundleId: 'net.whatsapp.WhatsApp' },
  { name: 'Zoom', proc: 'zoom.us', category: 'Communication', bundleId: 'us.zoom.xos' },
  { name: 'Microsoft Teams', proc: 'Microsoft Teams', category: 'Communication', bundleId: 'com.microsoft.teams2' },
  { name: 'Skype', proc: 'Skype', category: 'Communication', bundleId: 'com.skype.skype' },
  { name: 'Cisco Webex Meetings', proc: 'Cisco Webex Meetings', category: 'Communication', bundleId: 'com.cisco.webexmeetingsapp' },
  { name: 'Messages', proc: 'Messages', category: 'Communication', bundleId: 'com.apple.MobileSMS' },
  { name: 'FaceTime', proc: 'FaceTime', category: 'Communication', bundleId: 'com.apple.FaceTime' },
  { name: 'Screen Sharing', proc: 'Screen Sharing', category: 'Remote & Sharing', bundleId: 'com.apple.ScreenSharing' },

  // Remote Desktop & Mirroring
  { name: 'AnyDesk', proc: 'AnyDesk', category: 'Remote & Sharing', bundleId: 'com.philandro.anydesk' },
  { name: 'TeamViewer', proc: 'TeamViewer', category: 'Remote & Sharing', bundleId: 'com.teamviewer.TeamViewer' },
  { name: 'Parsec', proc: 'Parsec', category: 'Remote & Sharing', bundleId: 'tv.parsec.www' },
  { name: 'RustDesk', proc: 'rustdesk', category: 'Remote & Sharing', bundleId: 'com.carriez.rustdesk' },
  { name: 'Microsoft Remote Desktop', proc: 'Microsoft Remote Desktop', category: 'Remote & Sharing', bundleId: 'com.microsoft.rdc.macos' },
  { name: 'VNC Viewer', proc: 'vncviewer', category: 'Remote & Sharing', bundleId: 'com.realvnc.vncviewer' },

  // AI & Cheating Tools, Notes, Code Editors
  { name: 'ChatGPT', proc: 'ChatGPT', category: 'AI Tools', bundleId: 'com.openai.chat' },
  { name: 'Claude', proc: 'Claude', category: 'AI Tools', bundleId: 'com.anthropic.claudefordesktop' },
  // AI interview copilots: always-on-top overlays hidden from screen sharing, usually without a Dock icon
  // (stealth: also matched against every running process, not only apps in the Dock)
  { name: 'Cluely', proc: 'Cluely', category: 'AI Tools', stealth: true },
  { name: 'Interview Coder', proc: 'Interview Coder', category: 'AI Tools', stealth: true },
  { name: 'LockedIn AI', proc: 'LockedIn AI', category: 'AI Tools', stealth: true },
  { name: 'Final Round AI', proc: 'Final Round AI', category: 'AI Tools', stealth: true },
  { name: 'Parakeet AI', proc: 'Parakeet AI', category: 'AI Tools', stealth: true },
  { name: 'Perplexity', proc: 'Perplexity', category: 'AI Tools', bundleId: 'ai.perplexity.mac' },
  { name: 'LM Studio', proc: 'LM Studio', category: 'AI Tools', stealth: true },
  { name: 'Ollama', proc: 'Ollama', category: 'AI Tools', stealth: true },
  { name: 'Windsurf', proc: 'Windsurf', category: 'Notes & Editors' },
  { name: 'Notes', proc: 'Notes', category: 'Notes & Editors', bundleId: 'com.apple.Notes' },
  { name: 'Stickies', proc: 'Stickies', category: 'Notes & Editors', bundleId: 'com.apple.Stickies' },
  { name: 'TextEdit', proc: 'TextEdit', category: 'Notes & Editors', bundleId: 'com.apple.TextEdit' },
  { name: 'Visual Studio Code', proc: 'Code', category: 'Notes & Editors', bundleId: 'com.microsoft.VSCode' },
  { name: 'Sublime Text', proc: 'Sublime Text', category: 'Notes & Editors', bundleId: 'com.sublimetext.4' },
  { name: 'Cursor', proc: 'Cursor', category: 'Notes & Editors', bundleId: 'com.todesktop.230313mzl4w4u92' },
  { name: 'PyCharm', proc: 'pycharm', category: 'Notes & Editors', bundleId: 'com.jetbrains.pycharm' },
  { name: 'IntelliJ IDEA', proc: 'idea', category: 'Notes & Editors', bundleId: 'com.jetbrains.intellij' },
  { name: 'Xcode', proc: 'Xcode', category: 'Notes & Editors', bundleId: 'com.apple.dt.Xcode' },

  // Screen Recorders & Streaming
  { name: 'QuickTime Player', proc: 'QuickTime Player', category: 'Screen Recorders', bundleId: 'com.apple.QuickTimePlayerX' },
  { name: 'OBS Studio', proc: 'OBS', category: 'Screen Recorders', bundleId: 'com.obsproject.obs-studio' },
  { name: 'ScreenFlow', proc: 'ScreenFlow', category: 'Screen Recorders', bundleId: 'net.telestream.screenflow10' },
  { name: 'CleanShot X', proc: 'CleanShot X', category: 'Screen Recorders', bundleId: 'pl.maketheweb.cleanshotx' },
  { name: 'Kap', proc: 'Kap', category: 'Screen Recorders', bundleId: 'com.wulkano.kap' },
];

function isProtected(pid, procName = '', fullPath = '') {
  if (!pid) return false;
  const myPid = process.pid;
  const parentPid = process.ppid;

  if (pid === myPid || pid === parentPid) return true;

  const name = (procName || '').toLowerCase();
  const pathStr = (fullPath || '').toLowerCase();

  const protectedKeywords = [
    'testmeman',
    'electron',
    'antigravity',
    'terminal',
    'iterm',
    'warp',
    'alacritty',
    'zsh',
    'bash',
    'node',
    'launchd',
    'windowserver',
    'loginwindow',
    'system events',
    'codesigninghelper',
  ];

  if (protectedKeywords.some((k) => name.includes(k) || pathStr.includes(k))) {
    return true;
  }

  if (pathStr.startsWith('/system/library') || pathStr.startsWith('/usr/libexec')) {
    return true;
  }

  return false;
}

function isDevMode() {
  return (
    process.argv.includes('--dev') ||
    Boolean(process.defaultApp) ||
    /[\\/]electron[\\/]/.test(process.execPath) ||
    process.env.NODE_ENV === 'development'
  );
}

class ProcessManager {
  constructor() {
    this.watchdogInterval = null;
    this.violationCount = 0;
    this.terminatedHistory = [];
  }

  /**
   * Scans system for currently active forbidden applications using AppleScript & ps.
   * Returns factual list of applications currently running.
   */
  async scanForbiddenProcesses() {
    const isDev = isDevMode();
    const runningList = [];

    // Method 1: Query active user GUI applications via AppleScript
    try {
      const script = `osascript -e 'tell application "System Events" to get name of every application process whose background only is false'`;
      const { stdout } = await execAsync(script);
      const activeAppNames = stdout
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      for (const item of FORBIDDEN_MAC_APPS) {
        if (isDev && ['Visual Studio Code', 'Cursor', 'Sublime Text', 'PyCharm', 'IntelliJ IDEA', 'Xcode'].includes(item.name)) {
          continue;
        }

        const targetName = item.name.toLowerCase();
        const targetProc = item.proc.toLowerCase();

        const isMatched = activeAppNames.some((active) => {
          if (active.includes('testmeman') || active.includes('electron')) return false;
          return active === targetName || active === targetProc;
        });

        if (isMatched && !runningList.some((x) => x.name === item.name)) {
          runningList.push(item);
        }
      }

      // Agent apps (no Dock icon) are missing from that list: look for the stealth tools among all processes
      try {
        const { stdout: ps } = await execAsync('ps -axo comm');
        const names = new Set(ps.split('\n').map((l) => path.basename(l.trim()).toLowerCase()).filter(Boolean));
        for (const item of FORBIDDEN_MAC_APPS) {
          if (item.stealth && names.has(item.proc.toLowerCase()) && !runningList.some((x) => x.name === item.name)) runningList.push(item);
        }
      } catch (_) {}

      return runningList;
    } catch (err) {
      // Fallback to ps inspection
    }

    // Method 2 (Fallback): Query running processes via ps
    try {
      const { stdout } = await execAsync('ps -axo pid,comm');
      const lines = stdout.split('\n').slice(1);

      const activeExecutables = new Set();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/\s+/);
        const pid = parseInt(parts[0], 10);
        const comm = parts.slice(1).join(' ');
        const base = path.basename(comm).toLowerCase();

        if (isProtected(pid, base, comm)) continue;
        activeExecutables.add(base);
      }

      for (const item of FORBIDDEN_MAC_APPS) {
        if (isDev && ['Visual Studio Code', 'Cursor', 'Sublime Text', 'PyCharm', 'IntelliJ IDEA', 'Xcode'].includes(item.name)) {
          continue;
        }

        const targetProc = item.proc.toLowerCase();
        if (activeExecutables.has(targetProc) && !runningList.some((x) => x.name === item.name)) {
          runningList.push(item);
        }
      }
    } catch (e) {
      // Graceful fallback
    }

    return runningList;
  }

  /**
   * Evaluates readiness compliance status for the pre-flight checklist.
   */
  async checkProcessCompliance() {
    const active = await this.scanForbiddenProcesses();
    return {
      status: active.length === 0 ? 'PASSED' : 'WARNING',
      activeCount: active.length,
      apps: active.map((a) => ({ name: a.name, category: a.category })),
      remediation:
        active.length === 0
          ? 'No unauthorized applications detected.'
          : `${active.length} applications (${active.map((a) => a.name).slice(0, 3).join(', ')}${active.length > 3 ? '...' : ''}) should be closed before starting.`,
    };
  }

  /**
   * Safely closes active forbidden applications with candidate consent.
   * Tries graceful AppleScript quit first.
   */
  async terminateAllForbiddenApps() {
    const active = await this.scanForbiddenProcesses();
    const closedApps = [];
    const errors = [];

    if (active.length === 0) {
      return { success: true, closedCount: 0, closedApps: [], errors: [] };
    }

    for (const item of active) {
      try {
        if (item.name.toLowerCase().includes('testmeman') || item.proc.toLowerCase() === 'electron') {
          continue;
        }

        // Graceful quit via AppleScript
        try {
          await execAsync(`osascript -e 'tell application "${item.name}" to quit'`);
        } catch (_) {}

        // Targeted check: if still running, targeted SIGTERM
        try {
          const { stdout } = await execAsync(`pgrep -x "${item.proc}" 2>/dev/null || true`);
          const pids = stdout
            .split('\n')
            .map((p) => parseInt(p.trim(), 10))
            .filter((p) => p && !isNaN(p));

          for (const pid of pids) {
            if (!isProtected(pid, item.proc)) {
              process.kill(pid, 'SIGTERM');
            }
          }
        } catch (_) {}

        closedApps.push(item.name);
        this.terminatedHistory.push({ name: item.name, time: new Date().toISOString() });
      } catch (err) {
        errors.push(`${item.name}: ${err.message}`);
      }
    }

    return {
      success: true,
      closedCount: closedApps.length,
      closedApps,
      errors,
    };
  }

  /**
   * Real-time watchdog during active assessment.
   * Runs every 3.5 seconds to detect process violations.
   */
  startWatchdog(onViolation) {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
    }

    this.watchdogInterval = setInterval(async () => {
      try {
        const running = await this.scanForbiddenProcesses();
        if (running.length > 0) {
          this.violationCount++;
          const detectedNames = running.map((r) => r.name);

          // Gracefully quit
          for (const r of running) {
            exec(`osascript -e 'tell application "${r.name}" to quit'`, () => {});
          }

          if (typeof onViolation === 'function') {
            onViolation({
              event: 'PROCESS_VIOLATION',
              appsDetected: detectedNames,
              totalViolations: this.violationCount,
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        // Safe fail-open for watchdog tick
      }
    }, 3500);
  }

  stopWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
  }
}

module.exports = { ProcessManager, FORBIDDEN_MAC_APPS };
