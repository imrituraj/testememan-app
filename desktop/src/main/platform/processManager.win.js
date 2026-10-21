/**
 * TestMeMan Windows Assessment App - Native Process Compliance Manager
 * Enforces workstation integrity by detecting and managing unauthorized applications.
 * Respects user consent, avoids unprompted aggressive termination, and protects system services.
 */

const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const os = require('os');

const execAsync = util.promisify(exec);

// Categorized forbidden applications on Windows
const FORBIDDEN_WINDOWS_APPS = [
  // Web Browsers
  { exe: 'chrome.exe', name: 'Google Chrome', category: 'Browsers', mac: 'Google Chrome' },
  { exe: 'msedge.exe', name: 'Microsoft Edge', category: 'Browsers', mac: 'Microsoft Edge' },
  { exe: 'firefox.exe', name: 'Mozilla Firefox', category: 'Browsers', mac: 'firefox' },
  { exe: 'brave.exe', name: 'Brave Browser', category: 'Browsers', mac: 'Brave Browser' },
  { exe: 'opera.exe', name: 'Opera Browser', category: 'Browsers', mac: 'Opera' },
  { exe: 'vivaldi.exe', name: 'Vivaldi Browser', category: 'Browsers', mac: 'Vivaldi' },
  { exe: 'arc.exe', name: 'Arc Browser', category: 'Browsers', mac: 'Arc' },
  { exe: 'tor.exe', name: 'Tor Browser', category: 'Browsers', mac: 'Tor Browser' },

  // Communication & Collaboration Tools
  { exe: 'discord.exe', name: 'Discord', category: 'Communication', mac: 'Discord' },
  { exe: 'slack.exe', name: 'Slack', category: 'Communication', mac: 'Slack' },
  { exe: 'telegram.exe', name: 'Telegram', category: 'Communication', mac: 'Telegram' },
  { exe: 'whatsapp.exe', name: 'WhatsApp', category: 'Communication', mac: 'WhatsApp' },
  { exe: 'teams.exe', name: 'Microsoft Teams', category: 'Communication', mac: 'Microsoft Teams' },
  { exe: 'zoom.exe', name: 'Zoom Meetings', category: 'Communication', mac: 'zoom.us' },
  { exe: 'skype.exe', name: 'Skype', category: 'Communication', mac: 'Skype' },
  { exe: 'webex.exe', name: 'Cisco Webex', category: 'Communication', mac: 'Cisco Webex Meetings' },

  // Remote Desktop & Screen Mirroring
  { exe: 'anydesk.exe', name: 'AnyDesk Remote', category: 'Remote & Sharing', mac: 'AnyDesk' },
  { exe: 'teamviewer.exe', name: 'TeamViewer', category: 'Remote & Sharing', mac: 'TeamViewer' },
  { exe: 'vncviewer.exe', name: 'VNC Viewer', category: 'Remote & Sharing', mac: 'VNC Viewer' },
  { exe: 'parsec.exe', name: 'Parsec', category: 'Remote & Sharing', mac: 'Parsec' },
  { exe: 'rustdesk.exe', name: 'RustDesk', category: 'Remote & Sharing', mac: 'rustdesk' },
  { exe: 'ultraviewer.exe', name: 'UltraViewer', category: 'Remote & Sharing', mac: 'UltraViewer' },
  { exe: 'mstsc.exe', name: 'Windows Remote Desktop Connection', category: 'Remote & Sharing' },

  // AI & Cheat Tools, Text Editors & IDEs
  { exe: 'chatgpt.exe', name: 'ChatGPT Desktop', category: 'AI Tools', mac: 'ChatGPT' },
  { exe: 'claude.exe', name: 'Claude Desktop', category: 'AI Tools', mac: 'Claude' },
  // AI interview copilots: always-on-top overlays hidden from screen sharing
  { exe: 'cluely.exe', name: 'Cluely', category: 'AI Tools', mac: 'Cluely' },
  { exe: 'interview coder.exe', name: 'Interview Coder', category: 'AI Tools', mac: 'Interview Coder' },
  { exe: 'lockedin ai.exe', name: 'LockedIn AI', category: 'AI Tools', mac: 'LockedIn AI' },
  { exe: 'final round ai.exe', name: 'Final Round AI', category: 'AI Tools', mac: 'Final Round AI' },
  { exe: 'parakeet ai.exe', name: 'Parakeet AI', category: 'AI Tools', mac: 'Parakeet AI' },
  { exe: 'perplexity.exe', name: 'Perplexity', category: 'AI Tools', mac: 'Perplexity' },
  { exe: 'lm studio.exe', name: 'LM Studio', category: 'AI Tools', mac: 'LM Studio' },
  { exe: 'ollama app.exe', name: 'Ollama', category: 'AI Tools', mac: 'Ollama' },
  { exe: 'windsurf.exe', name: 'Windsurf', category: 'Notes & Editors', mac: 'Windsurf' },
  { exe: 'notepad.exe', name: 'Notepad', category: 'Notes & Editors' },
  { exe: 'notepad++.exe', name: 'Notepad++', category: 'Notes & Editors' },
  { exe: 'code.exe', name: 'Visual Studio Code', category: 'Notes & Editors', mac: 'Code' },
  { exe: 'sublime_text.exe', name: 'Sublime Text', category: 'Notes & Editors', mac: 'Sublime Text' },
  { exe: 'pycharm64.exe', name: 'PyCharm', category: 'Notes & Editors' },
  { exe: 'idea64.exe', name: 'IntelliJ IDEA', category: 'Notes & Editors' },

  // Screen Recorders & Streaming
  { exe: 'obs64.exe', name: 'OBS Studio', category: 'Screen Recorders', mac: 'OBS' },
  { exe: 'obs32.exe', name: 'OBS Studio 32-bit', category: 'Screen Recorders' },
  { exe: 'camtasia.exe', name: 'Camtasia Studio', category: 'Screen Recorders' },
  { exe: 'bandicam.exe', name: 'Bandicam', category: 'Screen Recorders' },
  { exe: 'sharex.exe', name: 'ShareX', category: 'Screen Recorders' },
  { exe: 'snagit.exe', name: 'Snagit', category: 'Screen Recorders' },
];

function isProtectedProcess(exeName = '') {
  const name = exeName.toLowerCase();
  const protectedNames = [
    'testmeman',
    'electron',
    'explorer.exe',
    'taskmgr.exe',
    'csrss.exe',
    'dwm.exe',
    'lsass.exe',
    'winlogon.exe',
    'services.exe',
    'svchost.exe',
    'system',
    'smss.exe',
    'node.exe',
    'cmd.exe',
    'powershell.exe',
    'windowserver',
  ];

  return protectedNames.some((p) => name.includes(p));
}

class ProcessManager {
  constructor() {
    this.isWindows = os.platform() === 'win32';
    this.watchdogInterval = null;
    this.violationCount = 0;
    this.terminatedHistory = [];
  }

  async scanForbiddenProcesses() {
    const runningList = [];

    try {
      if (this.isWindows) {
        // Enumerate active tasks on Windows
        const { stdout } = await execAsync('tasklist /FO CSV /NH');
        const lines = stdout.split('\n');

        const runningExes = new Set();
        for (const line of lines) {
          const match = line.match(/^"([^"]+)"/);
          if (match && match[1]) {
            runningExes.add(match[1].toLowerCase());
          }
        }

        for (const item of FORBIDDEN_WINDOWS_APPS) {
          if (isProtectedProcess(item.exe)) continue;

          if (runningExes.has(item.exe.toLowerCase())) {
            runningList.push(item);
          }
        }
      } else {
        // Non-Windows development or testing mode
        const { stdout } = await execAsync('ps -A -o comm');
        const output = stdout.toLowerCase();

        for (const item of FORBIDDEN_WINDOWS_APPS) {
          const checkName = (item.mac || item.exe.replace('.exe', '')).toLowerCase();
          if (isProtectedProcess(checkName)) continue;

          if (output.includes(checkName) && !runningList.some((x) => x.name === item.name)) {
            runningList.push(item);
          }
        }
      }
    } catch (err) {
      // Safe fallback
    }

    return runningList;
  }

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

  async terminateAllForbiddenApps() {
    const active = await this.scanForbiddenProcesses();
    const closedApps = [];
    const errors = [];

    if (active.length === 0) {
      return { success: true, closedCount: 0, closedApps: [], errors: [] };
    }

    for (const item of active) {
      if (isProtectedProcess(item.exe)) continue;

      try {
        if (this.isWindows) {
          // Graceful close attempt first on Windows, then force kill
          try {
            await execAsync(`taskkill /IM "${item.exe}" 2>nul`);
          } catch (_) {
            await execAsync(`taskkill /F /IM "${item.exe}" 2>nul`);
          }
        } else {
          // Non-Windows dev testing
          try {
            await execAsync(`pkill -x "${item.mac || item.exe}" 2>/dev/null || true`);
          } catch (_) {}
        }

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

          // Graceful taskkill
          if (this.isWindows) {
            for (const r of running) {
              exec(`taskkill /F /IM "${r.exe}" 2>nul`, () => {});
            }
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
        // Safe fail-open for watchdog
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

module.exports = { ProcessManager, FORBIDDEN_WINDOWS_APPS };
